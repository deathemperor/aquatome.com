import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { COOKIE, createSession, type Client } from '../accounts/session'
import { syncStore } from '../accounts/tanks'
import { assetSource, callClaude, chat, chatWorstCost, type ChatDeps, type ChatEnv, type Conversation } from '../chat/api'
import { OFF_TOPIC } from '../chat/answer'
import { chatAccount, conversationKey } from '../chat/store'
import type { ChatRunRecord } from '../chat/transcript'
import { clientFor, priceOf } from '../fishid/claude'
import { classify, isApiError, type KeyEntry } from '../fishid/keys'
import type { Source } from '../chat/handbook'
import { handle } from '../index'
import { contract } from './contract'
import { testD1 } from './d1'
import { memoryLedger } from './ledger'
import { memoryR2 } from './r2'

// The fixture build's app index and page copies (pnpm test builds the site first), served as the Worker's assets.
const DIST = fileURLToPath(new URL('../../dist', import.meta.url).href)
const ASSETS = { fetch: async (r: Request) => { const f = DIST + new URL(r.url).pathname; return existsSync(f) ? new Response(readFileSync(f)) : new Response('nope', { status: 404 }) } }
const A = 'sk-ant-api03-aaaaaaaaaaaa'
const B = 'sk-ant-api03-bbbbbbbbbbbb'

/**
 * R2 in memory: what the chat uses of it (get, put with an etag match or only where nothing is, json), every put
 * counted; and what deleting an account uses (list by prefix, `page` keys at a time, and delete).
 */
function r2(page = 1000) {
  const m = new Map<string, { body: string; etag: string }>()
  let n = 0
  const bucket = {
    get: async (k: string) => { const o = m.get(k); return o ? { etag: o.etag, json: async () => JSON.parse(o.body), text: async () => o.body } : null },
    put: async (k: string, v: string, o?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }) => {
      const at = m.get(k)?.etag
      if (o?.onlyIf?.etagMatches !== undefined && at !== o.onlyIf.etagMatches) return null
      // '*' is any object, as R2 reads it: the put only creates.
      if (o?.onlyIf?.etagDoesNotMatch !== undefined && at !== undefined && (o.onlyIf.etagDoesNotMatch === '*' || at === o.onlyIf.etagDoesNotMatch)) return null
      m.set(k, { body: v, etag: `e${++n}` })
      return { etag: `e${n}` }
    },
    list: async ({ prefix = '', cursor }: { prefix?: string; cursor?: string } = {}) => {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort()
      const from = cursor ? Number(cursor) : 0
      const truncated = from + page < keys.length
      return { objects: keys.slice(from, from + page).map(key => ({ key })), truncated, ...(truncated ? { cursor: String(from + page) } : {}) }
    },
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
  }
  return { m, bucket: bucket as unknown as R2Bucket, read: <T>(k: string) => (m.has(k) ? JSON.parse(m.get(k)!.body) as T : undefined) }
}
/** The bucket with a test's hooks: `get` after each read, `put` before each write (it can hold the write, or throw). */
const hooked = (bucket: R2Bucket, h: { get?: (k: string) => unknown; put?: (k: string, v: string) => unknown }) => ({
  get: async (k: string) => { const o = await bucket.get(k); await h.get?.(k); return o },
  put: async (k: string, v: string, o?: R2PutOptions) => { await h.put?.(k, v); return bucket.put(k, v, o) },
}) as unknown as R2Bucket
const tick = () => new Promise(r => setTimeout(r, 1))
function kv() {
  const m = new Map<string, string>()
  return { get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null), put: async (k: string, v: string) => { m.set(k, v) } } as unknown as KVNamespace
}
function env(extra: Partial<ChatEnv> = {}, page?: number) {
  const db = testD1()
  const store = r2(page)
  const ledger = memoryLedger()
  const e: ChatEnv = { CHAT: '1', ANTHROPIC_KEYS: `${A}\n${B}\n`, COMMENT_HMAC_KEY: 'h', ACCOUNT_HMAC_KEY: 'k', AB: kv(), ASSETS: ASSETS as unknown as Fetcher, DB: db, UPLOADS: store.bucket, FISHID_LEDGER: ledger.ns, ...extra }
  return { e, db, store, ledger }
}
async function signIn(db: D1Database, client: Client = 'app') {
  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, new Date().toISOString()).run()
  return { id, token: await createSession(db, id, client, new Date()) }
}

let seq = 0
const usage = { input_tokens: 2000, output_tokens: 300 }
const msg = (content: unknown[], stop = 'end_turn') => Response.json({ id: `msg_${++seq}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null, content, usage })
const reads = (path: string, heading: string | null = null) => msg([{ type: 'thinking', thinking: '', signature: `s${seq}` }, { type: 'tool_use', id: `t${seq}`, name: 'read_page', input: { path, heading } }], 'tool_use')
const answers = (a: Record<string, unknown>) => msg([{ type: 'text', text: JSON.stringify({ text: 'Cá neon xanh sống theo đàn.', covered: true, blocks: [], suggestions: ['Nuôi chung với cá gì?'], ...a }) }])
const pick = (p: Record<string, unknown>) => ({ t: 'species', ids: [], path: null, heading: null, tool: null, fish: [], tank: null, ...p })
/**
 * A message as the API streams it, for a call that asks (`stream: true`): its events in order, each text block's text in
 * `pieces` deltas. An error comes as it is, before any stream, and so does a reply that is already a stream.
 */
async function streamOf(res: Response, pieces = 3): Promise<Response> {
  if (!res.ok || res.headers.get('content-type') === 'text/event-stream') return res
  const m = await res.json() as { content: Record<string, unknown>[]; usage: { output_tokens: number }; stop_reason: string }
  const ev = (type: string, data: Record<string, unknown> = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  const out = [ev('message_start', { message: { ...m, content: [], stop_reason: null, usage: { ...m.usage, output_tokens: 0 } } })]
  m.content.forEach((b, index) => {
    if (b.type === 'text') {
      out.push(ev('content_block_start', { index, content_block: { type: 'text', text: '' } }))
      const t = b.text as string
      const n = Math.ceil(t.length / pieces)
      for (let i = 0; i < t.length; i += n) out.push(ev('content_block_delta', { index, delta: { type: 'text_delta', text: t.slice(i, i + n) } }))
    } else if (b.type === 'tool_use') {
      out.push(ev('content_block_start', { index, content_block: { ...b, input: {} } }))
      out.push(ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }))
    } else {
      out.push(ev('content_block_start', { index, content_block: { ...b, signature: '' } }))
      out.push(ev('content_block_delta', { index, delta: { type: 'signature_delta', signature: b.signature } }))
    }
    out.push(ev('content_block_stop', { index }))
  })
  out.push(ev('message_delta', { delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: m.usage.output_tokens } }), ev('message_stop'))
  return new Response(out.join(''), { headers: { 'content-type': 'text/event-stream' } })
}
/** A fake Claude answering each call in turn (the last again past the end), streamed when the call asks; the bodies it was sent. */
function claude(replies: (() => Response | Promise<Response>)[]) {
  const bodies: Record<string, unknown>[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(await new Request(input, init).json() as Record<string, unknown>)
    const r = await replies[Math.min(bodies.length, replies.length) - 1]!()
    return bodies.at(-1)!.stream ? streamOf(r) : r
  }) as typeof globalThis.fetch
  return { fetch, bodies }
}
const NEON = [() => reads('/vi/ca/ca-neon-xanh/'), () => answers({ blocks: [pick({ ids: ['paracheirodon-innesi'] }), pick({ t: 'tool', tool: 'tank-mates', fish: [{ id: 'paracheirodon-innesi', count: 8 }] })] })]

const CONV = '6f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913'
/** Where the Worker keeps CONV for a reader: under the account's HMAC (the test's ACCOUNT_HMAC_KEY is 'k'). */
const convKey = async (u: { id: string }) => conversationKey(await chatAccount('k', u.id), CONV)
const ask = (auth: Record<string, string>, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) => new Request('https://x.test/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json', ...auth, ...headers },
  body: JSON.stringify({ conversation: CONV, question: 'Nuôi cá này thế nào?', lang: 'vi', from: 'fish-id', about: 'paracheirodon-innesi', ...body }),
})
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const { answer, streamMisfits, api } = contract('chat.openapi.json')
const sseMedia = api.paths['/api/chat'].post.responses['200'].content['text/event-stream']
const deps = (fetch: typeof globalThis.fetch, extra: ChatDeps = {}): ChatDeps => ({ fetch, random: () => 0, ...extra })
/** The chat's answer, held to the contract; `waits`: the work it left running (a stream's run, its saving). */
async function run(req: Request, e: ChatEnv, d: ChatDeps, now = new Date()) {
  const waits: Promise<unknown>[] = []
  const res = await chat(req, new URL(req.url), e, now, d, p => { waits.push(p) })
  const body = await answer('/api/chat', req.method.toLowerCase() as 'post', res.clone())
  await Promise.all(waits)
  return { res, body }
}

test('GET: off without the flag or what it needs; on, its limits; through the Worker too', async () => {
  for (const extra of [{ CHAT: undefined }, { CHAT: '0' }, { UPLOADS: undefined }, { FISHID_LEDGER: undefined }, { ANTHROPIC_KEYS: '' }, { ACCOUNT_HMAC_KEY: undefined }]) {
    const { e } = env(extra as Partial<ChatEnv>)
    expect((await run(new Request('https://x.test/api/chat'), e, {})).body).toEqual({ on: false })
  }
  const { e } = env()
  expect((await run(new Request('https://x.test/api/chat'), e, {})).body).toEqual({ on: true, resting: false, perAccount: 30, maxTurns: 20, maxChars: 1500 })
  const viaWorker = await handle(new Request('https://x.test/api/chat'), e as never)
  expect(await viaWorker.json()).toMatchObject({ on: true })
  const off = await run(ask({}), env({ CHAT: undefined }).e, {})
  expect([off.res.status, off.body]).toEqual([503, { error: 'chat_off' }])
})

test('on for the owner only (CHAT "owner"): the owner\'s session finds it on and is answered; anyone else, signed in or not, finds it off and nothing counts', async () => {
  const { e, db, ledger } = env({ CHAT: 'owner' })
  const owner = await signIn(db, 'app')
  const ownerWeb = await signIn(db, 'web')
  const other = await signIn(db, 'app')
  e.OWNER_ACCOUNTS = ` ${owner.id}, ${ownerWeb.id}`
  const status = new Request('https://x.test/api/chat')
  const get = async (headers: Record<string, string>) => (await run(new Request(status, { headers }), e, {})).body
  expect(await get({})).toEqual({ on: false })
  expect(await get(bearer(other.token))).toEqual({ on: false })
  expect(await get(bearer(owner.token))).toEqual({ on: true, resting: false, perAccount: 30, maxTurns: 20, maxChars: 1500 })
  expect(await get({ cookie: `${COOKIE}=${ownerWeb.token}` })).toMatchObject({ on: true })
  // Off for everyone else before anything is read or counted; no OWNER_ACCOUNTS, off for all.
  const c = claude(NEON)
  for (const auth of [{}, bearer(other.token)]) expect([(await run(ask(auth), e, deps(c.fetch))).res.status, c.bodies.length]).toEqual([503, 0])
  expect((await run(ask(bearer(other.token)), e, deps(c.fetch))).body).toEqual({ error: 'chat_off' })
  expect(ledger.day()).toBeUndefined()
  expect((await run(ask(bearer(owner.token)), { ...e, OWNER_ACCOUNTS: undefined }, deps(c.fetch))).body).toEqual({ error: 'chat_off' })
  expect((await run(ask(bearer(owner.token)), e, deps(c.fetch))).body).toMatchObject({ n: 1, text: 'Cá neon xanh sống theo đàn.' })
})

test('who may ask: an app session as a bearer, or a site session from the site\'s own pages; nothing else, and nothing malformed', async () => {
  const { e, db } = env()
  const app = await signIn(db, 'app')
  const web = await signIn(db, 'web')
  const c = claude(NEON)
  const status = async (req: Request) => { const r = await run(req, e, deps(c.fetch)); return [r.res.status, r.body.error] }
  expect(await status(ask({}))).toEqual([401, 'session'])
  expect(await status(ask(bearer('x'.repeat(40))))).toEqual([401, 'session'])
  // A browser's session sent as a bearer is no app session, and never falls back to the cookie.
  expect(await status(ask({ ...bearer(web.token), cookie: `${COOKIE}=${web.token}` }))).toEqual([401, 'session'])
  expect(await status(ask({ cookie: `${COOKIE}=${web.token}`, origin: 'https://evil.test' }))).toEqual([403, 'cross-origin'])
  expect(await status(ask({ cookie: `${COOKIE}=${app.token}`, origin: 'https://x.test' }))).toEqual([401, 'session'])
  expect(await status(ask(bearer(app.token), {}, { 'idempotency-key': 'not-a-uuid' }))).toEqual([400, 'bad idempotency-key'])
  expect(await status(ask(bearer(app.token), { conversation: 'c1' }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { question: '  ' }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { lang: 'en' }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { photo: 'x' }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { identified: { verdict: 'fish', results: [{ scientificName: 'x', confidence: -1 }] } }))).toEqual([400, 'bad request'])
  // The contract closes `identified` as it closes each guess; a name or id past 100 characters is no fish ID's.
  expect(await status(ask(bearer(app.token), { identified: { verdict: 'fish', results: [], photo: 'x' } }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { identified: { verdict: 'fish', results: [{ scientificName: 'x'.repeat(101), confidence: 0.9 }] } }))).toEqual([400, 'bad request'])
  expect(await status(ask(bearer(app.token), { identified: { verdict: 'fish', results: [{ scientificName: 'Paracheirodon innesi', id: 'x'.repeat(101), confidence: 0.9 }] } }))).toEqual([400, 'bad request'])
  // One character past the limit (a whole forum post fits: maxChars) is refused, saying the limit, so the client keeps the text and says it.
  expect(await status(ask(bearer(app.token), { question: 'á'.repeat(1501) }))).toEqual([413, 'too long'])
  expect((await run(ask(bearer(app.token), { question: 'á'.repeat(1501) }), e, deps(c.fetch))).body).toEqual({ error: 'too long', limit: 1500 })
  expect(c.bodies).toHaveLength(0)
  expect(await status(ask({ cookie: `${COOKIE}=${web.token}`, origin: 'https://x.test' }))).toEqual([200, undefined])
})

test('a question is counted in characters as the reader sees them, as the app counts: Thai marks and tone marks typed apart are part of their letter', async () => {
  const { e, db } = env()
  const app = await signIn(db, 'app')
  const c = claude(NEON)
  const status = async (question: string, conversation: string) => {
    const r = await run(ask(bearer(app.token), { question, conversation }), e, deps(c.fetch))
    return [r.res.status, r.body.error]
  }
  // "ที่" is three code points and one character; "ệ" as older forums keep it (e, a dot below, a hat) is three as well.
  const thai = 'ที่', vi = 'ệ'.normalize('NFD')
  expect([[...thai].length, [...vi].length]).toEqual([3, 3])
  expect(await status(thai.repeat(1500), '7c0e8d1a-5b6f-4c2d-9e3a-1f4b5c6d7e01')).toEqual([200, undefined])
  expect(await status(vi.repeat(1500), '7c0e8d1a-5b6f-4c2d-9e3a-1f4b5c6d7e02')).toEqual([200, undefined])
  expect(await status(thai.repeat(1501), '7c0e8d1a-5b6f-4c2d-9e3a-1f4b5c6d7e03')).toEqual([413, 'too long'])
  // Spaces and line breaks around a pasted post aren't counted: they aren't asked.
  expect(await status(`\n\n${vi.repeat(1500)}\n\n`, '7c0e8d1a-5b6f-4c2d-9e3a-1f4b5c6d7e04')).toEqual([200, undefined])
})

test('a question: Claude reads the handbook and answers; the blocks are filled from it, the conversation keeps the turn, chat\'s own day counts it', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  const c = claude(NEON)
  const { res, body } = await run(ask(bearer(me.token)), e, deps(c.fetch))
  expect(res.status).toBe(200)
  expect(body).toMatchObject({ conversation: CONV, n: 1, text: 'Cá neon xanh sống theo đàn.', covered: true, suggestions: ['Nuôi chung với cá gì?'], model: 'claude-opus-5-5',
    steps: [{ kind: 'read', page: { kind: 'fish', title: 'Cá neon xanh', url: '/vi/ca/ca-neon-xanh/' } }] })
  expect(body.blocks).toMatchObject([{ t: 'species', page: { id: 'paracheirodon-innesi' }, facts: { schoolMin: 6 } }, { t: 'tool', tool: 'tank-mates', url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:8' }])
  // The first question says where it started.
  expect(JSON.stringify(c.bodies[0]!.messages)).toContain('The chat is about Cá neon xanh')
  // Under the account's HMAC, never its id, in a key or what it holds.
  const conv = store.read<Conversation>(await convKey(me))!
  expect([...store.m.keys(), ...[...store.m.values()].map(v => v.body)].join(' ')).not.toContain(me.id)
  expect(conv.turns).toMatchObject([{ n: 1, question: 'Nuôi cá này thế nào?', text: 'Cá neon xanh sống theo đàn.' }])
  expect(conv.running).toBeUndefined()
  const day = ledger.day()!
  expect([day.chat, day.calls, Object.keys(day.runs).length]).toEqual([1, 0, 0])
  expect(day.usd).toBeGreaterThan(0)
  expect(day.usd).toBeLessThan(chatWorstCost('claude-opus-5-5'))
})

test('the next question reads the turns before it, the start only once; an id another account used is its own conversation; one past a day or its turns has ended', async () => {
  const { e, db, store } = env({ CHAT_MAX_TURNS: '2' })
  const me = await signIn(db)
  await run(ask(bearer(me.token)), e, deps(claude(NEON).fetch))
  const c = claude([() => answers({})])
  const second = await run(ask(bearer(me.token), { question: 'Bể 60 lít thả bao nhiêu con?' }), e, deps(c.fetch))
  expect(second.body).toMatchObject({ n: 2 })
  const first = JSON.stringify(c.bodies[0]!.messages)
  expect(first).toContain('Earlier in this conversation')
  expect(first).toContain('Shown: card: Cá neon xanh (paracheirodon-innesi); tool: /vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:8')
  expect(first).not.toContain('The chat is about')
  // Another account asking in the same id starts its own conversation, and reads none of the first's turns.
  const other = await signIn(db)
  const theirs = claude([() => answers({})])
  expect((await run(ask(bearer(other.token)), e, deps(theirs.fetch))).body).toMatchObject({ n: 1 })
  expect(JSON.stringify(theirs.bodies[0]!.messages)).not.toContain('Earlier in this conversation')
  expect(store.read<Conversation>(await convKey(other))!.turns).toHaveLength(1)
  expect(store.read<Conversation>(await convKey(me))!.turns).toHaveLength(2)
  expect((await run(ask(bearer(me.token)), e, deps(c.fetch))).body).toEqual({ error: 'ended' })
  // A day after it began.
  const fresh = env()
  const her = await signIn(fresh.db)
  await run(ask(bearer(her.token)), fresh.e, deps(claude(NEON).fetch))
  expect((await run(ask(bearer(her.token)), fresh.e, deps(c.fetch, { clock: () => Date.now() + 24 * 3600_000 + 1 }))).body).toEqual({ error: 'ended' })
  expect(store.m.size).toBeGreaterThan(0)
})

test('the chat\'s model in wrangler.jsonc is Haiku 5.5, with its own price; unset, the default is Opus (the first question\'s model above)', () => {
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url).pathname, 'utf8')
  const model = /"CHAT_MODEL": "([^"]+)"/.exec(wrangler)?.[1]
  expect(model).toBe('claude-haiku-5-5')
  expect(priceOf(model!)).not.toBe(priceOf('claude-unknown'))
  expect(chatWorstCost(model!)).toBeLessThan(chatWorstCost('claude-opus-5-5'))
})

test('deleting an account deletes its conversations, their transcripts and retries\' answers, every page of them, and no one else\'s', async () => {
  // Listed a key at a time: deletion follows the list's cursor to its end.
  const { e, db, store } = env({}, 1)
  const me = await signIn(db)
  const other = await signIn(db)
  for (const [who, conversation, key] of [[me, CONV, '1d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13'], [me, '7f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913', '2d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13'], [other, CONV, '3d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13']] as const)
    expect((await run(ask(bearer(who.token), { conversation }, { 'idempotency-key': key }), e, deps(claude(NEON).fetch))).res.status).toBe(200)
  const mine = `/${await chatAccount('k', me.id)}/`
  expect([...store.m.keys()].filter(k => k.includes(mine)).map(k => k.split('/')[0]).sort()).toEqual(['chat-conv', 'chat-conv', 'chat-run', 'chat-run', 'chat-turn', 'chat-turn'])
  // Through the Worker, as the app deletes an account.
  const res = await handle(new Request('https://x.test/api/v1/account', { method: 'DELETE', headers: { authorization: `Bearer ${me.token}` } }), { ...e, ACCOUNTS: 'on' } as never)
  expect(res.status).toBe(204)
  expect([...store.m.keys()].filter(k => k.includes(mine))).toEqual([])
  const theirs = await chatAccount('k', other.id)
  expect([...store.m.keys()].sort()).toEqual([await convKey(other), expect.stringMatching(new RegExp(`^chat-run/${theirs}/${CONV}/001-[0-9a-f-]{36}\\.json$`)), `chat-turn/${theirs}/3d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13.json`])
})

test('each question\'s transcript is kept under its account and conversation: what was asked, read and answered, a failed one too, never who asked', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const account = await chatAccount('k', me.id)
  const runs = () => [...store.m.keys()].filter(k => k.startsWith(`chat-run/${account}/${CONV}/`)).sort()
  const record = (k: string) => store.read<ChatRunRecord>(k)!
  expect((await run(ask(bearer(me.token)), e, deps(claude(NEON).fetch))).body).toMatchObject({ n: 1 })
  expect(runs()).toHaveLength(1)
  const first = record(runs()[0]!)
  expect(first).toMatchObject({
    v: 1, conversation: CONV, n: 1, lang: 'vi', model: 'claude-opus-5-5', question: 'Nuôi cá này thế nào?', outcome: 'ok',
    tokens: { input: 4000, output: 600 }, agent: { calls: 2, tools: 1, stopped: 'answer' },
    answer: { text: 'Cá neon xanh sống theo đàn.', covered: true, blocks: 2, dropped: [] },
  })
  expect(first.cost).toBeGreaterThan(0)
  // Its timing from the question's arrival: the run's start; the JSON answer has no first words to time.
  expect(first.timing!.before).toBeGreaterThanOrEqual(0)
  expect(first.timing!.words).toBeUndefined()
  // What Claude asked of the tools and what they answered, then its answer; not the first message (the handbook's map).
  expect(first.turns).toHaveLength(2)
  expect(first.turns[0]!.tools).toMatchObject([{ name: 'read_page', input: { path: '/vi/ca/ca-neon-xanh/', heading: null } }])
  expect(first.turns[0]!.tools![0]!.result).toContain('neon')
  expect(first.turns[1]!.text).toContain('Cá neon xanh sống theo đàn.')
  // Never who asked: not the account, its id, its session or a key.
  const raw = JSON.stringify(first)
  for (const secret of [me.id, me.token, account, A, B]) expect(raw).not.toContain(secret)
  // A failed question has one too, with the number the next question takes.
  const bad = claude([() => msg([{ type: 'text', text: 'not json' }])])
  expect((await run(ask(bearer(me.token)), e, deps(bad.fetch))).body).toEqual({ error: 'failed' })
  expect((await run(ask(bearer(me.token)), e, deps(claude(NEON).fetch))).body).toMatchObject({ n: 2 })
  const [, ...seconds] = runs()
  expect(seconds.map(k => record(k)).map(r => [r.n, r.outcome, r.answer?.text ?? null]).sort()).toEqual([[2, 'failed', null], [2, 'ok', 'Cá neon xanh sống theo đàn.']])
  expect(seconds.every(k => k.includes('/002-'))).toBe(true)
})

test('a transcript R2 won\'t take is only logged: the reader gets the answer, the conversation the turn, the run settles', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  e.UPLOADS = hooked(store.bucket, { put: k => { if (k.startsWith('chat-run/')) throw new Error('R2 down') } })
  const r = await run(ask(bearer(me.token)), e, deps(claude(NEON).fetch))
  expect([r.res.status, r.body]).toMatchObject([200, { n: 1, text: 'Cá neon xanh sống theo đàn.' }])
  expect(store.read<Conversation>(await convKey(me))!.turns).toHaveLength(1)
  expect([...store.m.keys()].filter(k => k.startsWith('chat-run/'))).toEqual([])
  expect(ledger.day()!.runs).toEqual({})
})

/** The account deleted through the Worker, as the app deletes it. */
const deleteAccount = async (e: ChatEnv, token: string) =>
  (await handle(new Request('https://x.test/api/v1/account', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }), { ...e, ACCOUNTS: 'on' } as never)).status

test('an account deleted while its question is answered: the run deletes what it wrote after', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const c = claude([async () => { await held; return NEON[0]!() }, NEON[1]!])
  const waits: Promise<unknown>[] = []
  const req = ask(bearer(me.token), {}, { 'idempotency-key': '6d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' })
  void chat(req, new URL(req.url), e, new Date(), deps(c.fetch), p => { waits.push(p) })
  while (!c.bodies.length) await tick()
  // The reader left mid-answer and deleted the account; the run goes on.
  expect(await deleteAccount(e, me.token)).toBe(204)
  release()
  await Promise.all(waits)
  const mine = `/${await chatAccount('k', me.id)}/`
  expect([...store.m.keys()].filter(k => k.includes(mine))).toEqual([])
})

test('deleting an account deletes its chat again after its rows: what a run wrote meanwhile goes too', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const mine = `chat-conv/${await chatAccount('k', me.id)}/`
  // A run past its check that the account is there writes its conversation as the first pass lists the account's.
  let wrote = false
  e.UPLOADS = new Proxy(store.bucket, {
    get: (b, k) => k === 'list'
      ? async (o: { prefix?: string }) => {
        const listed = await b.list(o)
        if (!wrote && o.prefix === mine) { wrote = true; await b.put(`${mine}${CONV}.json`, '{"created":0,"turns":[]}') }
        return listed
      }
      : (b as unknown as Record<string | symbol, unknown>)[k],
  })
  expect(await deleteAccount(e, me.token)).toBe(204)
  expect(wrote).toBe(true)
  expect([...store.m.keys()].filter(k => k.startsWith(mine))).toEqual([])
})

test('the stream: steps as they happen, the text, each block, then done holding the same turn; the contract\'s order', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const { res } = await run(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), e, deps(claude(NEON).fetch))
  expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
  const text = await res.text()
  expect(streamMisfits(text, sseMedia)).toEqual([])
  const events = text.split('\n\n').filter(Boolean).map(b => b.split('\n')[0])
  expect(events).toEqual(['event: step', 'event: text', 'event: block', 'event: block', 'event: done'])
  const done = JSON.parse(text.split('event: done\ndata: ')[1]!)
  expect(done).toMatchObject({ n: 1, text: 'Cá neon xanh sống theo đàn.', blocks: [{ t: 'species' }, { t: 'tool' }] })
  // A refusal before admission is the JSON error, as without the header.
  expect((await run(ask({}, {}, { accept: 'text/event-stream' }), e, {})).res.headers.get('content-type')).toBe('application/json')
})

test('the stream: the text in pieces as Claude writes it, after every step and before the first block; joined, the turn\'s text', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const said = 'Cá neon xanh sống theo đàn, từ 8 con trở lên.\n1. Thả thêm cho đủ đàn.'
  const c = claude([() => reads('/vi/ca/ca-neon-xanh/'), () => msg([{ type: 'text', text: JSON.stringify({ offTopic: false, text: said, covered: true, blocks: [pick({ ids: ['paracheirodon-innesi'] })], suggestions: [] }) }])])
  const { res } = await run(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), e, deps(c.fetch))
  const text = await res.text()
  expect(streamMisfits(text, sseMedia)).toEqual([])
  const events = text.split('\n\n').filter(Boolean).map(b => ({ event: b.split('\n')[0]!.slice('event: '.length), data: JSON.parse(b.split('\ndata: ')[1]!) }))
  const names = events.map(x => x.event)
  expect(names[0]).toBe('step')
  expect(names.filter(n => n === 'text').length).toBeGreaterThan(1)
  expect(names.slice(names.indexOf('text'), names.lastIndexOf('text') + 1).every(n => n === 'text')).toBe(true)
  expect(names.slice(names.lastIndexOf('text') + 1)).toEqual(['block', 'done'])
  expect(events.filter(x => x.event === 'text').map(x => x.data.text).join('')).toBe(said)
  expect(events.at(-1)!.data).toMatchObject({ n: 1, text: said })
  // The transcript times the first words, from the question's arrival.
  const record = store.read<ChatRunRecord>([...store.m.keys()].find(k => k.startsWith('chat-run/'))!)!
  expect(record.timing!.words).toBeGreaterThanOrEqual(record.timing!.before)
  // Every call asked for a stream; the JSON answer's never do.
  expect(c.bodies.map(b => b.stream)).toEqual([true, true])
  const plain = claude(NEON)
  await run(ask(bearer(me.token), { conversation: '9f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913' }), e, deps(plain.fetch))
  expect(plain.bodies.map(b => b.stream)).toEqual([undefined, undefined])
})

/** `p`, or a failure naming `what` once `ms` have passed. */
const within = <T>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error(`no ${what} within ${ms} ms`)), ms))])

test('on the stream, a card goes out as soon as Claude has picked it, while its call still writes; done once the turn is saved and settled, before the transcript', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  const said = 'Cá neon xanh sống theo đàn, từ 8 con trở lên.'
  const first = pick({ ids: ['paracheirodon-innesi'] })
  const raw = JSON.stringify({ offTopic: false, text: said, covered: true, blocks: [first, pick({ t: 'tool', tool: 'tank-volume', tank: { l: 60, w: 30, h: 36 } })], suggestions: ['Nuôi chung với cá gì?'] })
  const cut = raw.indexOf(JSON.stringify(first)) + JSON.stringify(first).length
  // The answer's call writes its text and first pick, then holds the rest until the test has had that card.
  let more!: () => void
  const held = new Promise<void>(r => { more = r })
  const delta = (t: string) => sseEv('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } })
  const answer = () => new Response(new ReadableStream({
    async start(ctl) {
      const enc = new TextEncoder()
      ctl.enqueue(enc.encode(started + sseEv('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) + delta(raw.slice(0, cut))))
      await held
      ctl.enqueue(enc.encode(delta(raw.slice(cut)) + sseEv('content_block_stop', { index: 0 }) + sseEv('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } }) + sseEv('message_stop', {})))
      ctl.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
  // The transcript's write is held until the test has had done.
  let write!: () => void
  const writing = new Promise<void>(r => { write = r })
  e.UPLOADS = hooked(store.bucket, { put: async k => { if (k.startsWith('chat-run/')) await writing } })
  const waits: Promise<unknown>[] = []
  const res = await chat(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), new URL('https://x.test/api/chat'), e, new Date(), deps(claude([() => reads('/vi/ca/ca-neon-xanh/'), answer]).fetch), p => { waits.push(p) })
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let got = ''
  const until = async (s: string) => { while (!got.includes(s)) { const r = await reader.read(); if (r.done) throw new Error(`the stream ended before ${s}`); got += dec.decode(r.value, { stream: true }) } }
  await within(until('event: block'), 2000, 'card while the call still writes')
  expect(got).not.toContain('event: done')
  more()
  await within(until('event: done'), 2000, 'done before the transcript is written')
  // The conversation is free for the next question and the run settled; the transcript isn't written yet.
  expect(store.read<Conversation>(await convKey(me))).toMatchObject({ turns: [{ n: 1 }] })
  expect(store.read<Conversation>(await convKey(me))!.running).toBeUndefined()
  expect(ledger.day()!.runs).toEqual({})
  expect([...store.m.keys()].some(k => k.startsWith('chat-run/'))).toBe(false)
  write()
  for (let r = await reader.read(); !r.done; r = await reader.read()) got += dec.decode(r.value, { stream: true })
  await Promise.all(waits)
  expect(streamMisfits(got, sseMedia)).toEqual([])
  const events = got.split('\n\n').filter(Boolean).map(b => ({ event: b.split('\n')[0]!.slice('event: '.length), data: JSON.parse(b.split('\ndata: ')[1]!) }))
  const done = events.at(-1)!
  expect(done.event).toBe('done')
  expect(events.filter(x => x.event === 'block').map(x => x.data)).toEqual(done.data.blocks)
  expect(done.data.blocks.map((b: { t: string }) => b.t)).toEqual(['species', 'tool'])
  // The transcript times the text's first piece and its last, the run's end and done, in that order.
  const t = store.read<ChatRunRecord>([...store.m.keys()].find(k => k.startsWith('chat-run/'))!)!.timing!
  expect(t.before <= t.words! && t.words! <= t.last! && t.last! <= t.answered! && t.answered! <= t.done!).toBe(true)
})

test('a first call whose text has begun isn\'t asked again of the next key when it fails: the reader gets the error, never a second answer after the first words', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  // Overloaded mid-stream: an error with no status, which would otherwise send the call to the next key.
  const cut = [
    ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage } }),
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"offTopic":false,"text":"Cá neon' } }),
    ev('error', { error: { type: 'overloaded_error', message: 'Overloaded' } }),
  ].join('')
  let asked = 0
  const fetch = (async () => { asked++; return new Response(cut, { headers: { 'content-type': 'text/event-stream' } }) }) as typeof globalThis.fetch
  const { res } = await run(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), e, deps(fetch))
  const text = await res.text()
  expect(streamMisfits(text, sseMedia)).toEqual([])
  expect(asked).toBe(1)
  const events = text.split('\n\n').filter(Boolean).map(b => ({ event: b.split('\n')[0]!.slice('event: '.length), data: JSON.parse(b.split('\ndata: ')[1]!) }))
  expect(events.filter(x => x.event === 'text').map(x => x.data.text).join('')).toBe('Cá neon')
  expect(events.at(-1)).toEqual({ event: 'error', data: { error: 'unavailable' } })
})

/** A stream that sends `events`, then loses its connection (`error`) or ends there (`end`), before the message is whole. */
const cutStream = (events: string, how: 'error' | 'end') => {
  let sent = false
  // The events are read first; the break comes on the next read (an error drops what is still queued).
  return new Response(new ReadableStream({
    pull: ctl => {
      if (!sent) { sent = true; ctl.enqueue(new TextEncoder().encode(events)) } else if (how === 'error') ctl.error(new TypeError('network connection lost'))
      else ctl.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
}
const sseEv = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const started = sseEv('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage } })

test('a stream cut once it has begun is the network\'s, as a call that doesn\'t stream: the next key is asked, and with none left the question is unavailable, its count given back', async () => {
  for (const how of ['error', 'end'] as const) {
    const { e, db } = env()
    const me = await signIn(db)
    // The first key's stream breaks after it began; the next key answers.
    const c = claude([() => cutStream(started, how), ...NEON])
    const { res } = await run(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), e, deps(c.fetch))
    expect(await res.text()).toContain('event: done')
    expect(c.bodies).toHaveLength(3)
    // Every call breaks: unavailable (503), not failed (502), on the first call and on a later one.
    for (const replies of [[() => cutStream(started, how)], [() => reads('/vi/ca/ca-neon-xanh/'), () => cutStream(started, how)]]) {
      const all = claude(replies)
      const r = await run(ask(bearer(me.token), { conversation: crypto.randomUUID() }, { accept: 'text/event-stream' }), e, deps(all.fetch))
      expect(await r.res.text()).toContain('event: error\ndata: {"error":"unavailable"}')
    }
  }
})

test('a first call cut after its text began but before the reader saw any is asked again of the next key, whose text then comes whole', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const said = 'Cá neon xanh sống theo đàn, từ 8 con trở lên.'
  const opening = sseEv('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) + sseEv('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"offTopic":false,"text":"' } })
  const bodies: Record<string, unknown>[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(await new Request(input, init).json() as Record<string, unknown>)
    return bodies.length === 1 ? cutStream(started + opening, 'error') : msg([{ type: 'text', text: JSON.stringify({ offTopic: false, text: said, covered: true, blocks: [], suggestions: [] }) }])
  }) as typeof globalThis.fetch
  const { res } = await run(ask(bearer(me.token), {}, { accept: 'text/event-stream' }), e, deps(fetch))
  const text = await res.text()
  expect(streamMisfits(text, sseMedia)).toEqual([])
  // The second key's call doesn't stream, so its text isn't read on from the first's opening.
  expect(bodies.map(b => b.stream)).toEqual([true, undefined])
  const events = text.split('\n\n').filter(Boolean).map(b => ({ event: b.split('\n')[0]!.slice('event: '.length), data: JSON.parse(b.split('\ndata: ')[1]!) }))
  expect(events.filter(x => x.event === 'text').map(x => x.data.text)).toEqual([said])
  expect(events.at(-1)).toMatchObject({ event: 'done', data: { text: said } })
})

test('a streamed call is bounded end to end: one that stalls after its first bytes ends as a timeout does, the network\'s fault, not the key\'s', async () => {
  // The stream begins, then nothing more comes.
  const start = `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage } })}\n\n`
  const fetch = (async () => new Response(new ReadableStream({ start: ctl => ctl.enqueue(new TextEncoder().encode(start)) }), { headers: { 'content-type': 'text/event-stream' } })) as typeof globalThis.fetch
  const c = await clientFor({ key: 'sk-ant-test', hash: 'h' } as KeyEntry, fetch)
  const t = Date.now()
  const e = await callClaude(c, { model: 'claude-opus-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, 200, () => {}).catch(x => x)
  expect(Date.now() - t).toBeLessThan(2000)
  expect(isApiError(e) && e.status === undefined).toBe(true)
  expect(classify(e)).toEqual({ next: true })
})

test('retries by Idempotency-Key: after the answer, the kept turn with no new count; while it runs, it waits for that answer; another question meanwhile is 409', async () => {
  const { e, db, ledger } = env()
  const me = await signIn(db)
  const key = { 'idempotency-key': '1d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const c = claude([async () => { await held; return reads('/vi/ca/ca-neon-xanh/') }, NEON[1]!])
  const d = deps(c.fetch, { pollMs: 5, waitMs: 5000 })
  const first = run(ask(bearer(me.token), {}, key), e, d)
  // Let the first get as far as Claude, then retry it and ask another question in the same conversation.
  while (!c.bodies.length) await new Promise(r => setTimeout(r, 1))
  const retry = run(ask(bearer(me.token), {}, key), e, d)
  const other = await run(ask(bearer(me.token), { question: 'Câu khác' }, { 'idempotency-key': '2d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }), e, d)
  expect([other.res.status, other.body]).toEqual([409, { error: 'answering' }])
  release()
  const [a, b] = await Promise.all([first, retry])
  expect(b.body).toEqual(a.body)
  expect(a.body).toMatchObject({ n: 1 })
  const again = await run(ask(bearer(me.token), {}, { ...key, accept: 'text/event-stream' }), e, d)
  expect(await again.res.text()).toBe(`event: done\ndata: ${JSON.stringify(a.body)}\n\n`)
  expect(c.bodies).toHaveLength(2)
  // The other question was refused before admission: one question counted.
  expect(ledger.day()!.chat).toBe(1)
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
})

test('a retry while its run still answers waits for it even past the conversation\'s 24 hours: not 410, not a second run', async () => {
  const { e, db, ledger } = env()
  const me = await signIn(db)
  const t0 = Date.now()
  let at = t0
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const c = claude([...NEON, async () => { await held; return reads('/vi/ca/ca-neon-xanh/') }, NEON[1]!])
  const d = deps(c.fetch, { clock: () => at, pollMs: 5, waitMs: 5000 })
  await run(ask(bearer(me.token)), e, d)
  // The conversation's last question, asked in its last seconds, still answering as its 24 hours pass.
  at = t0 + 24 * 3600_000 - 5_000
  const key = { 'idempotency-key': 'ad3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }
  const last = run(ask(bearer(me.token), { question: 'Câu cuối' }, key), e, d)
  while (c.bodies.length < 3) await tick()
  at = t0 + 24 * 3600_000 + 5_000
  const retry = run(ask(bearer(me.token), { question: 'Câu cuối' }, key), e, d)
  // The retry in before the answer lands.
  for (let i = 0; i < 20; i++) await tick()
  release()
  const [a, b] = await Promise.all([last, retry])
  expect(a.body).toMatchObject({ n: 2 })
  expect(b.body).toEqual(a.body)
  expect(c.bodies).toHaveLength(4)
  expect(Object.values(ledger.day()!.readers)).toEqual([2])
})

test('a reader who leaves mid-answer: the run goes on (handed to wait), its turn is kept for the conversation\'s life, the mark clears, the ledger settles', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  const key = { 'idempotency-key': '3d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const c = claude([async () => { await held; return reads('/vi/ca/ca-neon-xanh/') }, NEON[1]!])
  const waits: Promise<unknown>[] = []
  const req = ask(bearer(me.token), {}, key)
  // The request itself is never awaited, as when the connection drops: only what was handed to wait outlives it.
  void chat(req, new URL(req.url), e, new Date(), deps(c.fetch), p => { waits.push(p) })
  while (!c.bodies.length) await tick()
  expect(waits).toHaveLength(1)
  release()
  await Promise.all(waits)
  const conv = store.read<Conversation>(await convKey(me))!
  expect(conv.running).toBeUndefined()
  expect(conv.turns).toMatchObject([{ n: 1 }])
  expect(ledger.day()!.runs).toEqual({})
  // Back in the app, its retry gets the kept turn, counted once; hours later too (a call, a locked phone), for as long
  // as the conversation lasts.
  const retry = await run(ask(bearer(me.token), {}, key), e, deps(c.fetch))
  expect(retry.body).toMatchObject({ n: 1, text: 'Cá neon xanh sống theo đàn.' })
  const later = await run(ask(bearer(me.token), {}, key), e, deps(c.fetch, { clock: () => Date.now() + 24 * 3600_000 - 60_000 }))
  expect(later.body).toMatchObject({ n: 1, text: 'Cá neon xanh sống theo đàn.' })
  expect(c.bodies).toHaveLength(2)
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
  // Past that, the conversation has ended: the retry is refused, not asked and counted again.
  const gone = await run(ask(bearer(me.token), {}, key), e, deps(c.fetch, { clock: () => Date.now() + 24 * 3600_000 + 60_000 }))
  expect(gone.body).toEqual({ error: 'ended' })
  expect(c.bodies).toHaveLength(2)
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
})

test("the Worker reads the guides' headings and FAQ questions from its own assets, where the build writes them", async () => {
  const { e } = env()
  const topics = (await assetSource(e, 'https://x.test').topics!('vi')) as { v: number; pages: Record<string, unknown[]> } | null
  expect(topics).toEqual(JSON.parse(readFileSync(`${DIST}/app/chat/vi.json`, 'utf8')))
  expect(Object.keys(topics!.pages).length).toBeGreaterThan(0)
})

test('a reader who leaves while the handbook is still being read: that read is part of the run handed to wait, so the run still ends', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const assets = assetSource(e, 'https://x.test')
  const slow: Source = { index: async lang => { await held; return assets.index(lang) }, shard: assets.shard }
  const waits: Promise<unknown>[] = []
  const req = ask(bearer(me.token))
  void chat(req, new URL(req.url), e, new Date(), deps(claude(NEON).fetch, { source: slow }), p => { waits.push(p) })
  while (!store.read<Conversation>(await convKey(me))?.running) await tick()
  for (let i = 0; i < 5; i++) await tick()
  expect(waits).toHaveLength(1)
  release()
  await Promise.all(waits)
  expect(store.read<Conversation>(await convKey(me))).toMatchObject({ turns: [{ n: 1 }] })
  expect(store.read<Conversation>(await convKey(me))!.running).toBeUndefined()
  expect(ledger.day()!.runs).toEqual({})
})

test('two first questions at once in a new conversation: one runs; the other is 409, or with the same key waits for its answer; counted once', async () => {
  for (const same of [false, true]) {
    const { e, db, store, ledger } = env()
    const me = await signIn(db)
    // Both read the new conversation (none yet) before either marks it.
    let reads = 0
    let bothRead!: () => void
    const read = new Promise<void>(r => { bothRead = r })
    e.UPLOADS = hooked(store.bucket, {
      get: k => { if (k.startsWith('chat-conv/') && ++reads === 2) bothRead() },
      put: k => (k.startsWith('chat-conv/') ? read : undefined),
    })
    const c = claude(NEON)
    const d = deps(c.fetch, { pollMs: 5 })
    const key = '4d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13'
    const asking = (k: string) => run(ask(bearer(me.token), {}, { 'idempotency-key': k }), e, d)
    const [a, b] = await Promise.all([asking(key), asking(same ? key : '5d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13')])
    if (same) {
      expect([a.res.status, b.res.status]).toEqual([200, 200])
      expect(b.body).toEqual(a.body)
    } else {
      expect([a.res.status, b.res.status].sort()).toEqual([200, 409])
      expect([a.body, b.body]).toContainEqual({ error: 'answering' })
    }
    expect(c.bodies).toHaveLength(2)
    expect(Object.values(ledger.day()!.readers)).toEqual([1])
    expect(store.read<Conversation>(await convKey(me))!.turns).toHaveLength(1)
  }
})

test('the kept answer is written before the conversation loses its mark: a retry in between waits for it, not a second run', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  const key = { 'idempotency-key': '6d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }
  let keptReads = 0
  let keeping = false
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  e.UPLOADS = hooked(store.bucket, {
    get: k => { if (k.startsWith('chat-turn/')) keptReads++ },
    put: k => { if (k.startsWith('chat-turn/')) { keeping = true; return held } },
  })
  const c = claude(NEON)
  const d = deps(c.fetch, { pollMs: 5 })
  const first = run(ask(bearer(me.token), {}, key), e, d)
  while (!keeping) await tick()
  const before = keptReads
  const retry = run(ask(bearer(me.token), {}, key), e, d)
  // Let the kept answer land once the retry is polling for it (it saw the mark), or has called Claude again (it didn't).
  while (keptReads < before + 2 && c.bodies.length < 3) await tick()
  release()
  const [a, b] = await Promise.all([first, retry])
  expect(b.body).toEqual(a.body)
  expect(c.bodies).toHaveLength(2)
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
})

test('the stream sends done once the turn is saved: a question right after done is answered, not 409', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  // The conversation's last write (the turn, no mark) is slow.
  e.UPLOADS = hooked(store.bucket, { put: (k, v) => (k.startsWith('chat-conv/') && !JSON.parse(v).running ? new Promise(r => setTimeout(r, 50)) : undefined) })
  const waits: Promise<unknown>[] = []
  const req = ask(bearer(me.token), {}, { accept: 'text/event-stream' })
  const res = await chat(req, new URL(req.url), e, new Date(), deps(claude(NEON).fetch), p => { waits.push(p) })
  expect(await res.text()).toContain('event: done')
  const next = await run(ask(bearer(me.token), { question: 'Bể 60 lít thả bao nhiêu con?' }), e, deps(claude([() => answers({})]).fetch))
  expect([next.res.status, next.body]).toMatchObject([200, { n: 2 }])
  await Promise.all(waits)
})

test('an R2 error marking the question is unavailable (503), not answering, and gives the count back', async () => {
  const { e, db, store, ledger } = env()
  const me = await signIn(db)
  e.UPLOADS = hooked(store.bucket, { put: k => { if (k.startsWith('chat-conv/')) throw new Error('R2 down') } })
  const c = claude(NEON)
  const r = await run(ask(bearer(me.token)), e, deps(c.fetch))
  expect([r.res.status, r.body]).toEqual([503, { error: 'unavailable' }])
  expect(c.bodies).toHaveLength(0)
  expect(Object.values(ledger.day()!.readers)).toEqual([0])
})

test('a key that runs out of credit during a question is ours: unavailable, and the count goes back; a request the API refuses is failed, and counts', async () => {
  const { e, db, ledger } = env()
  const me = await signIn(db)
  const refused = (message: string) => () => Response.json({ type: 'error', error: { type: 'invalid_request_error', message } }, { status: 400 })
  const out = await run(ask(bearer(me.token)), e, deps(claude([() => reads('/vi/ca/ca-neon-xanh/'), refused('Your credit balance is too low to access the Anthropic API.')]).fetch))
  expect([out.res.status, out.body]).toEqual([503, { error: 'unavailable' }])
  expect(Object.values(ledger.day()!.readers)).toEqual([0])
  const bad = await run(ask(bearer(me.token), { conversation: '7f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913' }), e, deps(claude([() => reads('/vi/ca/ca-neon-xanh/'), refused('messages: bad request')]).fetch))
  expect([bad.res.status, bad.body]).toEqual([502, { error: 'failed' }])
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
})

test('an off-topic question is answered with the fixed line and gives the reader\'s count back; the site\'s day still counts it', async () => {
  const { e, db, ledger } = env({ CHAT_PER_ACCOUNT: '1' })
  const me = await signIn(db)
  const c = claude([() => msg([{ type: 'text', text: JSON.stringify({ offTopic: true, text: 'Real Madrid thắng.', covered: true, blocks: [], suggestions: [] }) }])])
  const r = await run(ask(bearer(me.token), { question: 'Tối qua Real Madrid đá thế nào?' }), e, deps(c.fetch))
  expect([r.res.status, r.body]).toMatchObject([200, { n: 1, text: OFF_TOPIC.vi, blocks: [], suggestions: [] }])
  expect(Object.values(ledger.day()!.readers)).toEqual([0])
  expect(ledger.day()!.chat).toBe(1)
  // Counted apart from our side's failures, which the owner's dashboard shows as refunds.
  expect(ledger.day()!.counts).toMatchObject({ offTopic: 1, refunds: 0 })
  // The reader's one question a day is still theirs.
  const ok = await run(ask(bearer(me.token), { question: 'Bể 60 lít thả bao nhiêu con?' }), e, deps(claude([() => answers({})]).fetch))
  expect([ok.res.status, ok.body]).toMatchObject([200, { n: 2 }])
})

test('off-topic questions give the count back only up to a day\'s worth: past that they count, so one account can\'t use up chat\'s day for everyone', async () => {
  const { e, db, ledger } = env({ CHAT_PER_ACCOUNT: '2' })
  const me = await signIn(db)
  const off = () => msg([{ type: 'text', text: JSON.stringify({ offTopic: true, text: 'x', covered: true, blocks: [], suggestions: [] }) }])
  const ask1 = () => run(ask(bearer(me.token), { question: 'Tối qua MU đá thế nào?', conversation: crypto.randomUUID() }), e, deps(claude([off]).fetch))
  for (const used of [0, 0, 1, 2]) {
    expect((await ask1()).res.status).toBe(200)
    expect(Object.values(ledger.day()!.readers)).toEqual([used])
  }
  expect([(await ask1()).body]).toEqual([{ error: 'rate', limit: 2 }])
  expect(ledger.day()!.counts).toMatchObject({ offTopic: 4, refunds: 0 })
})

test('limits: the account\'s day (rate, with its limit), the site\'s spend (busy); neither calls Claude', async () => {
  const one = env({ CHAT_PER_ACCOUNT: '1' })
  const me = await signIn(one.db)
  const c = claude(NEON)
  await run(ask(bearer(me.token)), one.e, deps(c.fetch))
  const r = await run(ask(bearer(me.token), { conversation: '7f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913' }), one.e, deps(c.fetch))
  expect([r.res.status, r.body]).toEqual([429, { error: 'rate', limit: 1 }])
  const poor = env({ FISH_ID_USD_PER_DAY: '0.01' })
  const her = await signIn(poor.db)
  const p = await run(ask(bearer(her.token)), poor.e, deps(c.fetch))
  expect([p.res.status, p.body]).toEqual([429, { error: 'busy' }])
  expect(c.bodies).toHaveLength(2)
})

test('failures: Claude unreachable on every key is unavailable and gives the count back; an answer that can\'t be read is failed and counts; the conversation takes the next question', async () => {
  const { e, db, ledger, store } = env()
  const me = await signIn(db)
  const down = claude([() => Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, { status: 529 })])
  const r = await run(ask(bearer(me.token)), e, deps(down.fetch))
  expect([r.res.status, r.body]).toEqual([503, { error: 'unavailable' }])
  expect(Object.values(ledger.day()!.readers)).toEqual([0])
  const bad = claude([() => msg([{ type: 'text', text: 'not json' }])])
  const f = await run(ask(bearer(me.token)), e, deps(bad.fetch))
  expect([f.res.status, f.body]).toEqual([502, { error: 'failed' }])
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
  expect(store.read<Conversation>(await convKey(me))).toMatchObject({ turns: [] })
  expect(store.read<Conversation>(await convKey(me))!.running).toBeUndefined()
  const ok = await run(ask(bearer(me.token)), e, deps(claude(NEON).fetch))
  expect(ok.body).toMatchObject({ n: 1 })
  // Unavailable gave its count back: a resend with its key gets the same answer for a while, then is asked again (not
  // the 503 for the conversation's whole day).
  const key = { 'idempotency-key': '9d3a9c0e-5b7f-4e21-8a6d-0c9b2f4e7a13' }
  const other = { conversation: '7f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913' }
  expect((await run(ask(bearer(me.token), other, key), e, deps(down.fetch))).body).toEqual({ error: 'unavailable' })
  expect((await run(ask(bearer(me.token), other, key), e, deps(claude(NEON).fetch, { clock: () => Date.now() + 60_000 }))).body).toEqual({ error: 'unavailable' })
  expect((await run(ask(bearer(me.token), other, key), e, deps(claude(NEON).fetch, { clock: () => Date.now() + 16 * 60_000 }))).body).toMatchObject({ n: 1 })
  // On a stream, the same error as an event after the stream began.
  const s = await run(ask(bearer(me.token), { conversation: '8f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913' }, { accept: 'text/event-stream' }), e, deps(bad.fetch))
  expect((await s.res.text()).endsWith('event: error\ndata: {"error":"failed"}\n\n')).toBe(true)
})

test('only a whole answer counts: an answer cut off after its text began on the stream is failed and gives the count back; the same answer unseen still counts', async () => {
  const { e, db, ledger } = env()
  const me = await signIn(db)
  const cut = () => claude([() => msg([{ type: 'text', text: '{"offTopic":false,"text":"Cá neon xanh sống theo đàn, từ 8 con' }], 'max_tokens')])
  // Without a stream the reader saw nothing of it: failed, and it counts.
  const f = await run(ask(bearer(me.token)), e, deps(cut().fetch))
  expect([f.res.status, f.body]).toEqual([502, { error: 'failed' }])
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
  // On a stream the reader had its first words, then the error: failed, and its count goes back.
  const s = await run(ask(bearer(me.token), { conversation: crypto.randomUUID() }, { accept: 'text/event-stream' }), e, deps(cut().fetch))
  const text = await s.res.text()
  expect(text).toContain('event: text')
  expect(text.endsWith('event: error\ndata: {"error":"failed"}\n\n')).toBe(true)
  expect(Object.values(ledger.day()!.readers)).toEqual([1])
})

test('read_tanks reads the account\'s synced tanks with their ids, its fish named as the handbook names them', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const now = new Date()
  await syncStore(db, me.id, { v: 1, tanks: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Bể phòng khách', dims: { l: 60, w: 30, h: 36 }, species: [{ id: 'paracheirodon-innesi', count: 12 }], plants: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }], devices: [] }, now)
  const c = claude([() => msg([{ type: 'tool_use', id: 't1', name: 'read_tanks', input: {} }], 'tool_use'), () => answers({})])
  const r = await run(ask(bearer(me.token), { question: 'Bể của tôi thả thêm gì được?' }), e, deps(c.fetch))
  expect(r.body.steps).toEqual([{ kind: 'tanks' }])
  const result = JSON.stringify(c.bodies[1]!.messages)
  expect(result).toContain('Bể phòng khách')
  expect(result).toContain('\\"id\\":\\"a1b2c3d4-0000-4000-8000-000000000001\\"')
  expect(result).toContain('\\"name\\":\\"Cá neon xanh\\",\\"id\\":\\"paracheirodon-innesi\\",\\"count\\":12')
})

test('read_tanks reads the whole saved tank: plants, substrate, notes, days since saved, each light\'s active schedule, what its plugs power', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const now = new Date()
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const tankId = 'a1b2c3d4-0000-4000-8000-000000000002'
  const at = now.toISOString()
  await syncStore(db, me.id, {
    v: 1,
    tanks: [{ id: tankId, name: 'Bể rêu', dims: { l: 60, w: 30, h: 36 }, substrate: 'soil', notes: 'Thay 30% nước mỗi tuần.', species: [], plants: [{ id: 'taxiphyllum-barbieri' }], createdAt: ago(10), updatedAt: at }],
    devices: [
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000001', tankId, kind: 'light', brand: 'chihiros', model: 'WRGB II', activeScheduleId: 'c1b2c3d4-0000-4000-8000-000000000002', createdAt: at, updatedAt: at,
        schedules: [
          { id: 'c1b2c3d4-0000-4000-8000-000000000001', on: '08:00', off: '20:00', ramp: 30, levels: [100, 100, 100, 100], savedAt: at },
          { id: 'c1b2c3d4-0000-4000-8000-000000000002', on: '13:00', off: '21:00', ramp: 30, levels: [80, 70, 60, 50], savedAt: at },
        ],
      },
      { id: 'b1b2c3d4-0000-4000-8000-000000000002', tankId, kind: 'plug', brand: 'tuya', remoteId: 'x1', outlets: [{ code: 'switch_1', role: 'co2' }, { code: 'switch_2', role: 'heater' }, { code: 'switch_3', label: 'Quạt' }], createdAt: at, updatedAt: at },
      // Another tank's light isn't this tank's.
      { id: 'b1b2c3d4-0000-4000-8000-000000000003', tankId: 'a1b2c3d4-0000-4000-8000-000000000009', kind: 'light', schedules: [], createdAt: at, updatedAt: at },
      // A schedule saved but never written to the light is no schedule it runs; its levels set by hand are.
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000004', tankId, kind: 'light', nickname: 'Đèn phụ', manual: { levels: [50], at }, createdAt: at, updatedAt: at,
        schedules: [{ id: 'c1b2c3d4-0000-4000-8000-000000000003', on: '08:00', off: '14:00', ramp: 0, levels: [100], savedAt: ago(1) }],
      },
    ],
  }, now)
  const c = claude([() => msg([{ type: 'tool_use', id: 't1', name: 'read_tanks', input: {} }], 'tool_use'), () => answers({})])
  await run(ask(bearer(me.token), { question: 'Bể của tôi bị rêu, sao vậy?' }), e, deps(c.fetch))
  const told = (JSON.parse(String(((c.bodies[1]!.messages as { content: unknown }[]).at(-1)!.content as { content: string }[])[0]!.content)) as Record<string, unknown>[])[0]!
  expect(told).toMatchObject({
    substrate: 'soil', savedDaysAgo: 10, readerNotes: 'Thay 30% nước mỗi tuần.',
    lights: ['chihiros WRGB II: 13:00–21:00, 8 h lit, ramp 30 min, levels 80/70/60/50%', 'Đèn phụ: no schedule running, last set by hand to 50%'],
    plugsPower: ['co2', 'heater', 'Quạt'],
  })
  expect((told.plants as string[]).length).toBe(1)
})

test('the daily cron sweeps retries\' answers a day old, and nothing else of the chat\'s, every page of them', async () => {
  const r2 = memoryR2(1)
  const now = Date.now()
  const put = async (key: string, ago: number) => { r2.setNow(() => new Date(now - ago)); await r2.bucket.put(key, new Uint8Array([123, 125])) }
  await put('chat-turn/a/old.json', 86_400_000 + 1)
  await put('chat-turn/b/older.json', 3 * 86_400_000)
  await put('chat-turn/a/new.json', 3_600_000)
  await put('chat-conv/a/c.json', 30 * 86_400_000)
  const worker = (await import('../index')).default
  await worker.scheduled({} as ScheduledController, { AB: kv(), ASSETS, UPLOADS: r2.bucket } as never)
  expect([...r2.m.keys()].sort()).toEqual(['chat-conv/a/c.json', 'chat-turn/a/new.json'])
})
