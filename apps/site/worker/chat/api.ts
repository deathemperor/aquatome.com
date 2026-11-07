import type Anthropic from '@anthropic-ai/sdk'
import { isTombstone } from '@aq/schema/tanks'
import { sameSiteOk, sessionOf, tokenOf } from '../accounts/session'
import { loadStore } from '../accounts/tanks'
import { accountDayKey } from '../comments/api'
import { kvHealth } from '../fishid/api'
import { clientFor, costOf, DEFAULT_MODEL, priceOf } from '../fishid/claude'
import { failed, healthyKeys, isApiError, loadKeys, rotate, type Attempt, type KeyEntry } from '../fishid/keys'
import { ledgerClient, usdCap } from '../fishid/ledger'
import { relayFetch } from '../fishid/relay'
import { turnsOf } from '../fishid/transcript'
import { answerQuestion, CHAT_LIMITS, MAX_TOKENS, type ChatRun, type Earlier, type Start } from './agent'
import type { ChatBlock } from './answer'
import { handbookOf, type Handbook, type Lang, type Source } from './handbook'
import { chatAccount, conversationKey, retryKey } from './store'
import type { Step, Tank } from './tools'
import { transcriptKey, type ChatRunRecord } from './transcript'

/**
 * The chat (protocols/chat.openapi.json): GET /api/chat says whether it's on; POST asks one question in a conversation,
 * for signed-in readers only. Off unless CHAT is "1" and everything it needs is bound.
 *
 * - Who: the app's bearer, or the site's session cookie from the site's own pages (same-origin), as accounts checks
 *   them. No session is 401; a bearer that isn't a live app session never falls back to the cookie.
 * - Counts: per account a day and chat's own day, under the dollar cap fish ID's ledger keeps (ledger.ts, `kind`).
 * - The conversation: kept in R2 (UPLOADS, `chat-conv/<account>/<id>.json`, the account as its HMAC; store.ts) with no
 *   time limit, and deleted with the account (a run still answering when it's deleted deletes what it wrote). R2 reads its own writes, where KV can show a stale one for a minute at
 *   another location. Questions go in it for 24 hours from its first. An id another account used is another
 *   conversation. The question being answered is marked in it, written only over the version read (an etag match), or
 *   only where none is yet, so two questions at once can't both run: the second is 409 answering, or with the first's
 *   key waits for its answer.
 * - Retries (`Idempotency-Key`): the turn, or its error, read for 24 hours (a conversation's life; a failure on our side,
 *   503, for 15 minutes) under the account and key (`chat-turn/<account>/<key>.json`), and swept by the daily cron after. A retry while the first run still answers waits for it and gets its answer,
 *   counted once.
 *
 * - The transcript: what each question said and did (transcript.ts), under the account and conversation
 *   (`chat-run/<account>/<conversation>/<n>-<run>.json`), kept as the conversation is and deleted with the account.
 */
export type ChatEnv = {
  /** "1": chat is on. */
  CHAT?: string
  CHAT_MODEL?: string
  /** Questions per account a day, for the whole site a day, and in one conversation (defaults below). */
  CHAT_PER_ACCOUNT?: string
  CHAT_PER_DAY?: string
  CHAT_MAX_TURNS?: string
  /** The site's spend a day, shared with fish ID (fishid/api.ts). */
  FISH_ID_USD_PER_DAY?: string
  ANTHROPIC_KEYS?: string
  COMMENT_HMAC_KEY?: string
  /** Names an account in the chat's storage (chat/store.ts), as accounts' own data: never rotated. */
  ACCOUNT_HMAC_KEY?: string
  AB: KVNamespace
  ASSETS: Fetcher
  DB?: D1Database
  UPLOADS?: R2Bucket
  FISHID_LEDGER?: DurableObjectNamespace
  FISHID_RELAY?: DurableObjectNamespace
}
export type ChatDeps = { fetch?: typeof fetch; random?: () => number; clock?: () => number; source?: Source; waitMs?: number; pollMs?: number }

/** Placeholders until the eval of real questions sets them (protocols/chat.openapi.json). */
const PER_ACCOUNT = 30
const PER_DAY = 1000
const MAX_TURNS = 20
const MAX_CHARS = 500
const CONVERSATION_MS = 24 * 3600_000
/** A kept turn answers retries for a conversation's life: a reader back hours later (a call, a locked phone) gets the
 * answer that landed, not a second run. Past it, the conversation has ended too: a retry is 410, never counted again. */
const RETRY_MS = CONVERSATION_MS
/** A failure on our side (503) gave its count back: kept only for the retries waiting on its run, then asked again. */
const UNAVAILABLE_MS = 15 * 60_000
/** A question marked as answering longer than this was cut off: the conversation takes another. */
const RUNNING_MS = 2 * 60_000
const PING_MS = 10_000
/** A retry waits this long for the first run's answer, checking every `pollMs`. */
const WAIT_MS = 75_000
const POLL_MS = 1000
const MAX_BODY = 16 * 1024
/** A fish ID guess's scientific name and page id, at most. */
const MAX_NAME = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LANGS = ['vi', 'id', 'th'] as const
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const streamHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }
const limit = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d)
const live = (env: ChatEnv): env is ChatEnv & Required<Pick<ChatEnv, 'ANTHROPIC_KEYS' | 'COMMENT_HMAC_KEY' | 'ACCOUNT_HMAC_KEY' | 'DB' | 'UPLOADS' | 'FISHID_LEDGER'>> =>
  env.CHAT === '1' && Boolean(env.ANTHROPIC_KEYS && env.COMMENT_HMAC_KEY && env.ACCOUNT_HMAC_KEY && env.DB && env.UPLOADS && env.FISHID_LEDGER)

/** The chat's most a question can cost, reserved at admission: every call's input past the trigger by half, all written to cache, and every output in full. */
export function chatWorstCost(model: string): number {
  const p = priceOf(model)
  return (CHAT_LIMITS.inputTokens * 1.5 * Math.max(p.input, p.cacheWrite) + CHAT_LIMITS.calls * MAX_TOKENS * p.output) / 1e6
}

/** The contract's `Turn`. */
export type Turn = { conversation: string; n: number; text: string; blocks: ChatBlock[]; suggestions: string[]; covered: boolean; model: string; steps?: Step[] }
/** A conversation as kept (under its account's prefix): when it began, its turns, and the question being answered. */
export type Conversation = { created: number; turns: (Earlier & { n: number; at: number })[]; running?: { key: string; at: number } }
/** A question's outcome, kept for its retries: its turn, or the error it ended on. */
type Kept = { at: number } & ({ turn: Turn } | { status: number; error: string })

type Question = { conversation: string; question: string; lang: Lang; start: Start }
function questionOf(v: unknown, maxChars: number): Question | 'too long' | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const known = ['conversation', 'question', 'lang', 'from', 'about', 'identified']
  if (Object.keys(o).some(k => !known.includes(k))) return undefined
  if (typeof o.conversation !== 'string' || !UUID.test(o.conversation) || typeof o.question !== 'string' || !o.question.trim()) return undefined
  if (o.lang !== undefined && !LANGS.includes(o.lang as Lang)) return undefined
  if (o.from !== undefined && !['fish-id', 'species', 'search'].includes(o.from as string)) return undefined
  if (o.about !== undefined && typeof o.about !== 'string') return undefined
  let identified: Start['identified']
  if (o.identified !== undefined) {
    const i = o.identified as { verdict?: unknown; results?: unknown }
    const results = Array.isArray(i?.results) ? i.results as Record<string, unknown>[] : undefined
    // Closed, as the contract closes it; a name or id longer than MAX_NAME is no fish ID guess.
    if (!i || typeof i !== 'object' || Object.keys(i).some(k => !['verdict', 'results'].includes(k))) return undefined
    if (!['fish', 'plant', 'other', 'unclear'].includes(i?.verdict as string) || !results || results.length > 3
      || results.some(r => !r || typeof r.scientificName !== 'string' || r.scientificName.length > MAX_NAME || typeof r.confidence !== 'number' || r.confidence < 0
        || (r.id !== undefined && (typeof r.id !== 'string' || r.id.length > MAX_NAME))
        || Object.keys(r).some(k => !['scientificName', 'id', 'confidence'].includes(k)))) return undefined
    identified = { verdict: i.verdict as string, results: results.map(r => ({ scientificName: r.scientificName as string, confidence: r.confidence as number, ...(r.id ? { id: r.id as string } : {}) })) }
  }
  if ([...o.question].length > maxChars) return 'too long'
  return {
    conversation: o.conversation.toLowerCase(), question: o.question.trim(), lang: (o.lang as Lang) ?? 'vi',
    start: { ...(o.from ? { from: o.from as Start['from'] } : {}), ...(o.about ? { about: o.about as string } : {}), ...(identified ? { identified } : {}) },
  }
}

/** The site's own assets: the app index and the app's page copies, kept per isolate for 10 minutes (a failed read isn't). */
const assets = new Map<string, { at: number; value: Promise<unknown> }>()
export function assetSource(env: Pick<ChatEnv, 'ASSETS'>, origin: string): Source {
  const read = (path: string) => {
    const hit = assets.get(path)
    if (hit && Date.now() - hit.at < 600_000) return hit.value
    const value = env.ASSETS.fetch(new Request(`${origin}${path}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    assets.set(path, { at: Date.now(), value })
    void value.then(v => { if (v === null) assets.delete(path) })
    return value
  }
  return { index: lang => read(`/app/${lang}.json`) as never, shard: (lang, kind, n) => read(`/app/pages/${lang}/${kind}-${n}.json`) as never, topics: lang => read(`/app/chat/${lang}.json`) as never }
}

/** The account's saved tanks as the chat reads them (tools.ts `Tank`): what read_tanks tells Claude and a check is of. */
export async function tanksOf(db: D1Database, account: string): Promise<Tank[]> {
  const store = await loadStore(db, account)
  return store.tanks.filter(t => !isTombstone(t)).map(t => {
    const r = t as { id: string; name: string; dims?: { l: number; w: number; h: number }; litres?: number; species?: { id: string; count?: number }[]; unlisted?: { name: string; kind: string; sci?: string; count?: number }[] }
    return {
      id: r.id,
      name: r.name,
      ...(r.dims ? { dims: { l: r.dims.l, w: r.dims.w, h: r.dims.h } } : {}),
      ...(r.litres ? { litres: r.litres } : {}),
      species: (r.species ?? []).map(s => ({ id: s.id, ...(s.count ? { count: s.count } : {}) })),
      unlisted: (r.unlisted ?? []).map(u => ({ name: u.name, kind: u.kind, ...(u.sci ? { sci: u.sci } : {}), ...(u.count ? { count: u.count } : {}) })),
    }
  })
}

let keysCache: { text: string; keys: ReturnType<typeof loadKeys> } | undefined
const keysOf = (text: string) => (keysCache?.text === text ? keysCache.keys : (keysCache = { text, keys: loadKeys(text) }).keys)

export async function chat(req: Request, url: URL, env: ChatEnv, now: Date, deps: ChatDeps = {}, wait: (p: Promise<unknown>) => void = p => void p): Promise<Response> {
  const maxChars = MAX_CHARS
  const perAccount = limit(env.CHAT_PER_ACCOUNT, PER_ACCOUNT)
  const maxTurns = limit(env.CHAT_MAX_TURNS, MAX_TURNS)
  if (req.method === 'GET') {
    if (!live(env)) return json({ on: false })
    const resting = !(await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, kvHealth(env.AB), now.getTime())).length
    return json({ on: true, resting, perAccount, maxTurns, maxChars })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (!live(env)) return json({ error: 'chat_off' }, 503)
  const clock = deps.clock ?? Date.now

  // Who asks: a bearer is the app's session or nothing; a cookie only from the site's own pages.
  const bearer = req.headers.has('authorization')
  if (!bearer && tokenOf(req)?.via === 'cookie' && !sameSiteOk(req, true)) return json({ error: 'cross-origin' }, 403)
  const session = await sessionOf(req, env.DB, now)
  if (!session || (bearer && session.via !== 'bearer')) return json({ error: 'session' }, 401)
  const idem = req.headers.get('idempotency-key')?.trim().toLowerCase() ?? ''
  if (idem && !UUID.test(idem)) return json({ error: 'bad idempotency-key' }, 400)
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return json({ error: 'too long' }, 413)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return json({ error: 'bad request' }, 400) }
  const q = questionOf(body, maxChars)
  if (q === 'too long') return json({ error: 'too long' }, 413)
  if (!q) return json({ error: 'bad request' }, 400)
  const stream = /(^|[\s,])text\/event-stream\b/i.test(req.headers.get('accept') ?? '')

  // The account as the stores name it: an HMAC, never its id.
  const account = await chatAccount(env.ACCOUNT_HMAC_KEY, session.userId)
  const convKey = conversationKey(account, q.conversation)
  const keptKey = idem ? retryKey(account, idem) : ''
  const readKept = async (): Promise<Kept | undefined> => {
    if (!keptKey) return undefined
    const k = await (await env.UPLOADS.get(keptKey))?.json<Kept>()
    return k && clock() - k.at < ('turn' in k || k.status !== 503 ? RETRY_MS : UNAVAILABLE_MS) ? k : undefined
  }
  const answerOf = (k: Kept) => ('turn' in k ? k.turn : undefined)
  const keptResponse = (k: Kept): Response => {
    const t = answerOf(k)
    if (stream) return new Response(t ? sse('done', t) : sse('error', { error: (k as { error: string }).error }), { headers: streamHeaders })
    return t ? json(t) : json({ error: (k as { error: string }).error }, (k as { status: number }).status)
  }

  const kept = await readKept()
  if (kept) return keptResponse(kept)
  const obj = await env.UPLOADS.get(convKey)
  const conv = obj ? await obj.json<Conversation>() : undefined
  // A retry of the question still answering waits for it, even once the conversation has passed its end: a 410 would
  // have it asked again elsewhere, before its kept answer is written.
  const running = conv?.running && clock() - conv.running.at < RUNNING_MS ? conv.running : undefined
  if (running && idem && running.key === idem) return waitFor(readKept, keptResponse, stream, clock, deps)
  if (conv && (clock() - conv.created > CONVERSATION_MS || conv.turns.length >= maxTurns)) return json({ error: 'ended' }, 410)
  if (running) return json({ error: 'answering' }, 409)

  // Admission, in one step in the ledger: the account's day, chat's day and the site's spend, and a healthy key.
  const model = env.CHAT_MODEL || DEFAULT_MODEL
  const store = kvHealth(env.AB)
  const healthy = await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, store, now.getTime())
  const ledger = ledgerClient(env.FISHID_LEDGER)
  const day = now.toISOString().slice(0, 10)
  const reader = `chat:acct:${(await accountDayKey(env.COMMENT_HMAC_KEY, session.userId, now)).slice(3)}`
  const admitted = await ledger.admit({ day, reader, perReader: perAccount, perDay: limit(env.CHAT_PER_DAY, PER_DAY), usdCap: usdCap(env.FISH_ID_USD_PER_DAY), reserve: chatWorstCost(model), healthy: healthy.length > 0, kind: 'chat' })
    .catch(e => { console.error('chat ledger:', e); return null })
  if (!admitted) return json({ error: 'unavailable' }, 503)
  if (!admitted.ok) return admitted.error === 'rate' ? json({ error: 'rate', limit: admitted.limit }, 429) : json({ error: admitted.error }, admitted.error === 'busy' ? 429 : 503)
  const run = admitted.run

  // The question is marked as answering: over the version read (an etag match), or, for a new conversation, only where
  // none is yet. When another request wrote first, R2 refuses the write (null) and its question is the one answering.
  // `etagDoesNotMatch: '*'` is If-None-Match: * (workerd's r2-bucket.c++, buildSingleEtagArray), which R2 applies as a
  // create-once write only one of several at once wins (developers.cloudflare.com/r2/api/s3/extensions/, "Conditional
  // operations in PutObject"); a failed condition is null, not an error (developers.cloudflare.com/r2/api/workers/workers-api-reference/).
  const mark: Conversation = { created: conv?.created ?? clock(), turns: conv?.turns ?? [], running: { key: idem || crypto.randomUUID(), at: clock() } }
  const marked = await env.UPLOADS.put(convKey, JSON.stringify(mark), { onlyIf: obj ? { etagMatches: obj.etag } : { etagDoesNotMatch: '*' } })
    .then(o => (o ? 'ok' : 'taken'), e => { console.error('chat mark:', e); return 'failed' })
  if (marked !== 'ok') {
    await ledger.settle({ day, run, refund: true, keys: {} }).catch(e => console.error('chat settle:', e))
    if (marked === 'failed') return json({ error: 'unavailable' }, 503)
    // Taken by a request with this one's key: this one waits for that run's answer, as a retry does. The conversation is
    // read before the kept answer, since a run keeps its answer before it drops the mark. By another question: answering.
    const latest = await (await env.UPLOADS.get(convKey))?.json<Conversation>()
    if (idem && (latest?.running?.key === idem || await readKept())) return waitFor(readKept, keptResponse, stream, clock, deps)
    return json({ error: 'answering' }, 409)
  }

  const fetchImpl = deps.fetch ?? (env.FISHID_RELAY ? relayFetch(env.FISHID_RELAY) : undefined)
  const spends: Promise<unknown>[] = []
  const tally: Record<string, number> = {}
  const attempts: Attempt[] = []
  const began = clock()
  /** The run as the agent ran it, for its transcript: none when it never started (the handbook unread). */
  let trail: ChatRun | undefined

  /** The run, after admission: its turn, or the error it ends on (as the JSON answer's status). */
  const work = async (onStep?: (s: Step) => void): Promise<{ status: number; body: Record<string, unknown> }> => {
    // Read inside the run, which outlives a dropped connection: read before it, a drop would leave the mark and the ledger open.
    const hb = await handbookOf(deps.source ?? assetSource(env, url.origin), q.lang).catch(e => { console.error('chat handbook:', e); return null })
    if (!hb) return { status: 503, body: { error: 'unavailable' } }
    let key: KeyEntry | undefined
    let client: Anthropic | undefined
    const onUsage = (u: Anthropic.Usage) => {
      const usd = costOf(model, { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 })
      spends.push(ledger.spend(day, run, usd).catch(e => console.error('chat spend:', e)))
    }
    class FirstCall extends Error { constructor(readonly reason: 'resting' | 'unavailable' | 'request') { super(reason) } }
    try {
      const out = await answerQuestion({
        // The first call rotates over the healthy keys; the run keeps the key that answered (its thinking is that key's).
        send: async (b, { timeoutMs, call }) => {
          if (call === 1) {
            const r = await rotate(healthy, store, async (k, left) => (await clientFor(k, fetchImpl)).messages.create(b, { timeout: Math.min(left, timeoutMs) }), { random: deps.random, clock, budgetMs: timeoutMs })
            attempts.push(...r.attempts)
            if (!r.ok) throw new FirstCall(r.reason)
            key = healthy.find(k => k.hash === r.hash)!
            client = await clientFor(key, fetchImpl)
            tally[key.hash] = (tally[key.hash] ?? 0) + 1
            onUsage(r.value.usage)
            return r.value
          }
          const t = clock()
          try {
            const m = await client!.messages.create(b, { timeout: timeoutMs })
            tally[key!.hash] = (tally[key!.hash] ?? 0) + 1
            onUsage(m.usage)
            return m
          } catch (e) {
            attempts.push((await failed(key!, e, store, clock() - t, clock)).attempt)
            throw e
          }
        },
        model, lang: q.lang, question: q.question, earlier: conv?.turns ?? [], start: (conv?.turns.length ? {} : q.start), handbook: hb,
        tanks: () => tanksOf(env.DB, session.userId).catch(e => { console.error('chat tanks:', e); return null }),
        onStep, clock,
      })
      trail = out
      if (out.dropped.length) console.log(JSON.stringify({ chat: 'dropped', dropped: out.dropped }))
      // No key answered the first call: resting or unavailable (ours), or our request refused (failed). A later call
      // that failed or ran out of time: unavailable, unless the API refused our request (400). An answer we can't read
      // (a refusal, one cut short): failed.
      if (out.error instanceof FirstCall) return out.error.reason === 'request' ? { status: 502, body: { error: 'failed' } } : { status: 503, body: { error: out.error.reason } }
      if (out.error && !out.message) {
        if (isApiError(out.error) && out.error.status === 400) return { status: 502, body: { error: 'failed' } }
        if (isApiError(out.error) || (out.error as Error)?.message === 'out of time') return { status: 503, body: { error: 'unavailable' } }
        throw out.error
      }
      if (!out.answer) return { status: 502, body: { error: 'failed' } }
      const turn: Turn = {
        conversation: q.conversation, n: (conv?.turns.length ?? 0) + 1, text: out.answer.text, blocks: out.blocks,
        suggestions: out.answer.suggestions.filter(s => s.trim()).slice(0, 3), covered: out.answer.covered, model,
        ...(out.steps.length ? { steps: out.steps } : {}),
      }
      return { status: 200, body: turn as unknown as Record<string, unknown> }
    } catch (e) {
      console.error('chat run:', e)
      return { status: 502, body: { error: 'failed' } }
    }
  }

  /**
   * After the run: the outcome is kept for retries, then the conversation gets the turn (or just loses its mark), then
   * the ledger settles. In that order: a retry that finds no mark finds the kept answer, and never runs the question again.
   */
  const finish = async (done: { status: number; body: Record<string, unknown> }) => {
    const turn = done.status === 200 ? done.body as unknown as Turn : undefined
    const next: Conversation = { created: mark.created, turns: turn ? [...mark.turns, { n: turn.n, question: q.question, text: turn.text, blocks: turn.blocks, at: clock() }] : mark.turns }
    const k: Kept = turn ? { at: clock(), turn } : { at: clock(), status: done.status, error: String(done.body.error) }
    if (keptKey) await env.UPLOADS.put(keptKey, JSON.stringify(k)).catch(e => console.error('chat kept:', e))
    // The transcript beside the conversation: never in the reader's way, so one that can't be made or saved is only logged.
    const record = (() => { try { return trail && JSON.stringify(transcript(done, trail)) } catch (e) { console.error('chat transcript:', e) } })()
    const runKey = record ? transcriptKey(account, q.conversation, (conv?.turns.length ?? 0) + 1, run) : ''
    await Promise.all([
      env.UPLOADS.put(convKey, JSON.stringify(next)).catch(e => console.error('chat conversation:', e)),
      record && env.UPLOADS.put(runKey, record).catch(e => console.error('chat transcript:', e)),
    ])
    // The account deleted while this ran (deleteUser): what it just wrote goes too. Its account still there, deleteUser's
    // second pass, after the account's rows, comes after these writes and deletes them.
    const still = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(session.userId).first().catch(() => true)
    if (!still) await env.UPLOADS.delete([convKey, ...(keptKey ? [keptKey] : []), ...(runKey ? [runKey] : [])]).catch(e => console.error('chat deleted account:', e))
    await Promise.all(spends)
    // Our side failed (503: no key, Claude unreachable): the reader's count goes back. A failed answer (502) still counts.
    const ok = turn && Object.keys(tally).length ? Object.keys(tally).at(-1) : undefined
    await ledger.settle({ day, run, refund: done.status === 503, keys: tally, ...(ok ? { ok } : {}) }).catch(e => console.error('chat settle:', e))
  }

  /** What the question said and did (transcript.ts): what the reader asked and got, never who they are. */
  const transcript = (done: { status: number; body: Record<string, unknown> }, t: ChatRun): ChatRunRecord => {
    const s = t.spent
    return {
      v: 1, conversation: q.conversation, n: (conv?.turns.length ?? 0) + 1, at: now.toISOString(), lang: q.lang, model,
      question: q.question, outcome: done.status === 200 ? 'ok' : String(done.body.error), ms: clock() - began,
      cost: costOf(model, s), tokens: { input: s.input + s.cacheRead + s.cacheWrite, output: s.output },
      agent: { calls: t.calls, tools: t.tools, stopped: t.stopped },
      ...(t.answer ? { answer: { text: t.answer.text, covered: t.answer.covered, blocks: t.blocks.length, dropped: t.dropped } } : {}),
      turns: turnsOf(t.history, t.message),
    }
  }

  if (!stream) {
    // The run goes on if the reader's connection drops (waitUntil), so its retry gets its answer and the mark clears.
    const p = work().then(async done => { await finish(done); return done })
    wait(p.catch(() => undefined))
    const done = await p
    return json(done.body, done.status)
  }
  // The stream: steps as they happen, then the text, the blocks, and done (the whole turn); or error. Pings while it works.
  // Done comes once the turn is saved: a question asked right after it finds the conversation free.
  const enc = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const w = writable.getWriter()
  let open = true
  const send = (s: string) => { if (open) w.write(enc.encode(s)).catch(() => { open = false }) }
  const ping = setInterval(() => send(': ping\n\n'), PING_MS)
  wait((async () => {
    const done = await work(step => send(sse('step', step)))
    await finish(done)
    clearInterval(ping)
    if (done.status === 200) {
      const t = done.body as unknown as Turn
      send(sse('text', { text: t.text }))
      for (const b of t.blocks) send(sse('block', b))
      send(sse('done', t))
    } else send(sse('error', { error: done.status === 502 ? 'failed' : done.body.error === 'resting' ? 'resting' : 'unavailable' }))
    await w.close().catch(() => {})
  })())
  return new Response(readable, { headers: streamHeaders })
}

/** A retry while its first run answers: wait for that run's outcome, then answer as a retry does; pings meanwhile on a stream. */
async function waitFor(readKept: () => Promise<Kept | undefined>, respond: (k: Kept) => Response, stream: boolean, clock: () => number, deps: ChatDeps): Promise<Response> {
  const until = clock() + (deps.waitMs ?? WAIT_MS)
  const poll = deps.pollMs ?? POLL_MS
  const next = async (): Promise<Kept | undefined> => {
    for (;;) {
      const k = await readKept()
      if (k || clock() >= until) return k
      await new Promise(r => setTimeout(r, poll))
    }
  }
  if (!stream) {
    const k = await next()
    return k ? respond(k) : json({ error: 'unavailable' }, 503)
  }
  const enc = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const w = writable.getWriter()
  const ping = setInterval(() => void w.write(enc.encode(': ping\n\n')).catch(() => {}), PING_MS)
  void (async () => {
    const k = await next()
    clearInterval(ping)
    const res = k ? respond(k) : new Response(sse('error', { error: 'unavailable' }))
    await w.write(new Uint8Array(await res.arrayBuffer())).catch(() => {})
    await w.close().catch(() => {})
  })()
  return new Response(readable, { headers: streamHeaders })
}
