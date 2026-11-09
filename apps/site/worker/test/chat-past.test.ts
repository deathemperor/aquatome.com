import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { createSession } from '../accounts/session'
import { deleteUser } from '../accounts/users'
import type { ChatEnv } from '../chat/api'
import type { Source } from '../chat/handbook'
import { chatPast } from '../chat/past'
import { chatAccount, conversationKey, importedKey, reportKey } from '../chat/store'
import { contract } from './contract'
import { testD1 } from './d1'
import { memoryLedger } from './ledger'

const { answer } = contract('chat.openapi.json')
/** The recording the app's tests are built on. */
const recorded = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../protocols/${f}`, import.meta.url).href), 'utf8')) as { status: number; body: Record<string, any> }

function r2() {
  const m = new Map<string, string>()
  let n = 0
  const bucket = {
    get: async (k: string) => (m.has(k) ? { etag: 'e', json: async () => JSON.parse(m.get(k)!) } : null),
    put: async (k: string, v: string, o?: { onlyIf?: { etagDoesNotMatch?: string } }) => { if (o?.onlyIf?.etagDoesNotMatch === '*' && m.has(k)) return null; m.set(k, v); return { etag: `e${++n}` } },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key })), truncated: false }),
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
  }
  return { m, bucket: bucket as unknown as R2Bucket }
}
// The moment the recording's rows are open or ended as it says: the last to end is 24 hours from 7 Nov 08:15.
const NOW = new Date('2026-11-08T00:00:00Z')
function env(extra: Partial<ChatEnv> = {}) {
  const db = testD1()
  const store = r2()
  const e: ChatEnv = { CHAT: '1', ANTHROPIC_KEYS: 'sk-ant-api03-aaaaaaaaaaaa\n', COMMENT_HMAC_KEY: 'h', ACCOUNT_HMAC_KEY: 'k', AB: {} as KVNamespace, ASSETS: {} as Fetcher, DB: db, UPLOADS: store.bucket, FISHID_LEDGER: memoryLedger().ns, ...extra }
  return { e, db, store }
}
async function signIn(db: D1Database) {
  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, NOW.toISOString()).run()
  return { id, token: await createSession(db, id, 'app', NOW), account: await chatAccount('k', id) }
}
const fish = (id: string, name: string, sci: string, path: string, img?: string) => ({ kind: 'fish', id, name, sub: sci, path, ...(img ? { img } : {}) })
const source: Source = {
  index: async () => ({ items: [
    fish('paracheirodon-innesi', 'Cá neon xanh', 'Paracheirodon innesi', '/vi/ca/ca-neon-xanh/', 'https://media.aquatome.com/seriouslyfish/4286e57cdc3e8b79-480.webp'),
    fish('betta-splendens', 'Cá betta', 'Betta splendens', '/vi/ca/ca-betta/'),
    fish('poecilia-reticulata', 'Cá bảy màu', 'Poecilia reticulata', '/vi/ca/ca-bay-mau/'),
  ] }) as never,
  shard: async () => null,
  topics: async () => ({ v: 1, pages: {} }) as never,
}
const PATHS = { list: '/api/chat/conversations', one: '/api/chat/conversations/{id}', hide: '/api/chat/conversations/{id}/hide', report: '/api/chat/conversations/{id}/report' }
async function call(e: ChatEnv, token: string, method: 'get' | 'post', path: string, template: string, body?: unknown) {
  const req = new Request(`https://x.test${path}`, { method: method.toUpperCase(), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const res = await chatPast(req, new URL(req.url), e, NOW, { source })
  return { status: res.status, body: await answer(template, method, res) as Record<string, any> }
}
const list = (e: ChatEnv, token: string, q = '') => call(e, token, 'get', `/api/chat/conversations${q}`, PATHS.list)
const one = (e: ChatEnv, token: string, id: string) => call(e, token, 'get', `/api/chat/conversations/${id}`, PATHS.one)
const hide = (e: ChatEnv, token: string, id: string) => call(e, token, 'post', `/api/chat/conversations/${id}/hide`, PATHS.hide)
const report = (e: ChatEnv, token: string, id: string, body: unknown) => call(e, token, 'post', `/api/chat/conversations/${id}/report`, PATHS.report, body)

type Seed = { id: string; question: string; title?: string; from?: string; about?: unknown; identified?: unknown; started: string; last: string; n: number; continues?: string }
async function row(db: D1Database, account: string, c: Seed, hidden = 0) {
  const start = { ...(c.from ? { from: c.from } : {}), ...(c.from === 'species' ? { about: (c.about as { id: string }).id } : {}), ...(c.identified ? { identified: c.identified } : {}), ...(c.title ? { title: c.title } : {}), lang: 'vi' }
  await db.prepare('INSERT INTO chat_conversations (account, id, title, start, first_at, last_at, questions, continues, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(account, c.id, c.question, JSON.stringify(start), c.started, c.last, c.n, c.continues ?? null, hidden).run()
}
const seedRecorded = async (db: D1Database, account: string) => {
  const rec = recorded('chat-conversations.json')
  for (const r of rec.body.rows) for (const c of r.conversations) await row(db, account, c)
  return rec
}
const OLDER = { id: '11111111-1111-4111-8111-111111111111', question: 'Bể cũ', started: '2026-10-01T01:00:00Z', last: '2026-10-01T01:00:00Z', n: 1 }

test('the list answers as the app\'s recording does: rows by their last question, a chain as one row, a page\'s next taking up where it ended', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const rec = await seedRecorded(db, me.account)
  await row(db, me.account, OLDER)
  const first = await list(e, me.token, '?limit=3')
  expect(first.status).toBe(200)
  expect(first.body.rows).toEqual(rec.body.rows)
  expect(typeof first.body.next).toBe('string')
  const second = await list(e, me.token, `?limit=3&before=${encodeURIComponent(first.body.next)}`)
  expect(second.body.rows.map((r: any) => r.conversations[0].id)).toEqual([OLDER.id])
  expect(second.body.next).toBeUndefined()
  for (const bad of ['?limit=0', '?limit=51', '?limit=x', '?before=%%%']) expect((await list(e, me.token, bad)).status).toBe(400)
})

test('from a species page, the list has only the rows that started on it; a fish ID row never comes', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  await seedRecorded(db, me.account)
  const r = await list(e, me.token, '?about=betta-splendens')
  expect(r.body.rows.map((x: any) => x.conversations[0].about.id)).toEqual(['betta-splendens'])
  expect((await list(e, me.token, '?about=paracheirodon-innesi')).body.rows).toEqual([])
})

test('one conversation answers as the app\'s recording does; a turn from before this kept fewer fields is drawn all the same', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const rec = recorded('chat-conversation.json').body
  await row(db, me.account, { id: rec.id, question: rec.turns[0].question, title: rec.title, from: rec.from, about: rec.about, identified: rec.identified, started: rec.started, last: rec.last, n: rec.turns.length })
  const turns = rec.turns.map((t: any) => ({ question: t.question, at: Date.parse(t.asked), ...t.turn }))
  store.m.set(conversationKey(me.account, rec.id), JSON.stringify({ created: Date.parse(rec.started), turns }))
  const r = await one(e, me.token, rec.id)
  expect(r.status).toBe(200)
  expect(r.body).toEqual(rec)
  // Saved before the past conversations: five fields.
  const old = crypto.randomUUID()
  await row(db, me.account, { id: old, question: 'Cũ', started: '2026-11-07T10:00:00Z', last: '2026-11-07T10:00:00Z', n: 1 })
  store.m.set(conversationKey(me.account, old), JSON.stringify({ created: Date.parse('2026-11-07T10:00:00Z'), turns: [{ n: 1, question: 'Cũ', text: 'Đáp', blocks: [], at: Date.parse('2026-11-07T10:00:00Z') }] }))
  expect((await one(e, me.token, old)).body.turns[0].turn).toMatchObject({ n: 1, text: 'Đáp', suggestions: [], covered: true, conversation: old })
})

test('another account\'s conversation, or an unknown one, is 404; the list and every call stay behind the chat\'s gate', async () => {
  const { e, db } = env()
  const me = await signIn(db)
  const other = await signIn(db)
  const rec = await seedRecorded(db, me.account)
  const id = rec.body.rows[1].conversations[0].id
  expect((await one(e, other.token, id)).status).toBe(404)
  expect((await list(e, other.token)).body).toEqual({ rows: [] })
  expect((await hide(e, other.token, id)).body).toEqual({ hidden: [] })
  expect((await report(e, other.token, id, { turn: 1 })).status).toBe(404)
  expect((await one(e, me.token, 'not-a-uuid')).status).toBe(404)
  // The owner's alone while it is "owner": anyone else finds it off, the owner's session is answered.
  const gated = { ...e, CHAT: 'owner', OWNER_ACCOUNTS: me.id }
  expect((await list(gated, other.token)).body).toEqual({ error: 'unavailable' })
  expect((await list(gated, me.token)).status).toBe(200)
  const noAuth = new Request('https://x.test/api/chat/conversations')
  expect((await chatPast(noAuth, new URL(noAuth.url), e, NOW, { source })).status).toBe(401)
})

test('hiding takes the whole row off the list on every device, deletes nothing, and the conversation then answers as gone', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const rec = await seedRecorded(db, me.account)
  const [a, b] = rec.body.rows[0].conversations.map((c: any) => c.id)
  store.m.set(conversationKey(me.account, b), JSON.stringify({ created: 1, turns: [{ n: 1, question: 'q', text: 't', blocks: [], at: 1 }] }))
  const r = await hide(e, me.token, b)
  expect(r.body).toEqual(recorded('chat-hidden.json').body)
  expect((await list(e, me.token)).body.rows.map((x: any) => x.conversations[0].id)).not.toContain(a)
  expect((await one(e, me.token, a)).status).toBe(404)
  expect((await report(e, me.token, b, { turn: 1 })).status).toBe(404)
  // Nothing deleted, and hiding again is the same answer.
  expect(store.m.has(conversationKey(me.account, b))).toBe(true)
  expect((await db.prepare('SELECT COUNT(*) AS n FROM chat_conversations WHERE account = ?').bind(me.account).first<{ n: number }>())?.n).toBe(4)
  expect((await hide(e, me.token, a)).body.hidden).toEqual([a, b])
  expect((await hide(e, me.token, crypto.randomUUID())).body).toEqual({ hidden: [] })
})

test('a report is kept once a turn, the first reason standing; a reason is one line of 140 characters as the reader sees them', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const id = crypto.randomUUID()
  await row(db, me.account, { id, question: 'Hỏi', started: '2026-11-07T10:00:00Z', last: '2026-11-07T10:00:00Z', n: 1 })
  store.m.set(conversationKey(me.account, id), JSON.stringify({ created: 1, turns: [{ n: 1, question: 'Hỏi', text: 'Đáp sai', blocks: [], at: 1 }] }))
  expect((await report(e, me.token, id, { turn: 1, reason: 'Sai nhiệt độ' })).body).toEqual(recorded('chat-report-saved.json').body)
  expect((await report(e, me.token, id, { turn: 1, reason: 'Lý do khác' })).body).toEqual(recorded('chat-report-already.json').body)
  expect(JSON.parse(store.m.get(reportKey(me.account, id, 1))!)).toMatchObject({ conversation: id, turn: 1, question: 'Hỏi', text: 'Đáp sai', reason: 'Sai nhiệt độ' })
  expect((await report(e, me.token, id, { turn: 2 })).status).toBe(404)
  expect((await report(e, me.token, id, {})).body).toEqual({ error: 'bad request' })
  expect((await report(e, me.token, id, { turn: 1, reason: 'a\nb' })).body).toEqual({ error: 'bad request' })
  const long = new Request(`https://x.test/api/chat/conversations/${id}/report`, { method: 'POST', headers: { authorization: `Bearer ${me.token}` }, body: JSON.stringify({ turn: 1, reason: 'a'.repeat(141) }) })
  const refused = await chatPast(long, new URL(long.url), e, NOW, { source })
  expect([refused.status, await refused.json()]).toEqual([400, { error: 'too long' }])
  // 140 Thai letters with their marks are 140 characters, though more code points.
  expect((await report(e, me.token, id, { turn: 1, reason: 'น้ำ'.repeat(46) + 'ก'.repeat(2) })).body.result).toBe('already')
})

test('deleting the account takes its rows and reports with it, the hidden flag too', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const id = crypto.randomUUID()
  await row(db, me.account, { id, question: 'Hỏi', started: '2026-11-07T10:00:00Z', last: '2026-11-07T10:00:00Z', n: 1 }, 1)
  store.m.set(reportKey(me.account, id, 1), '{}')
  store.m.set(conversationKey(me.account, id), '{}')
  await list(e, me.token)
  expect(store.m.has(importedKey(me.account))).toBe(true)
  await deleteUser(db, me.id, { UPLOADS: store.bucket, ACCOUNT_HMAC_KEY: 'k' })
  expect((await db.prepare('SELECT COUNT(*) AS n FROM chat_conversations').first<{ n: number }>())?.n).toBe(0)
  expect([...store.m.keys()]).toEqual([])
})

test('conversations from before the list are copied in on the account\'s first look, once, with no picture', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const id = crypto.randomUUID()
  const at = Date.parse('2026-11-07T09:00:00Z')
  store.m.set(conversationKey(me.account, id), JSON.stringify({ created: at, turns: [{ n: 1, question: 'Cũ lắm', text: 't', blocks: [], at }, { n: 2, question: 'Nữa', text: 't', blocks: [], at: at + 60_000 }] }))
  store.m.set(conversationKey(me.account, crypto.randomUUID()), JSON.stringify({ created: at, turns: [] }))
  const r = await list(e, me.token)
  expect(r.body.rows).toEqual([{ conversations: [{ id, question: 'Cũ lắm', started: '2026-11-07T09:00:00Z', last: '2026-11-07T09:01:00Z', n: 2, open: true }] }])
  expect((await list(e, me.token)).body.rows).toHaveLength(1)
})

test('older conversations come in though a question came first; one that can\'t be read leaves the rest in and is tried again', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const at = Date.parse('2026-11-07T09:00:00Z')
  const kept = JSON.stringify({ created: at, turns: [{ n: 1, question: 'Cũ', text: 't', blocks: [], at }] })
  // Asked with today's app: the account has a row before it ever looks.
  const asked = crypto.randomUUID()
  await row(db, me.account, { id: asked, question: 'Mới', started: '2026-11-07T20:00:00Z', last: '2026-11-07T20:00:00Z', n: 1 })
  const [old, bad] = [crypto.randomUUID(), crypto.randomUUID()]
  store.m.set(conversationKey(me.account, old), kept)
  store.m.set(conversationKey(me.account, bad), 'not json')
  const ids = async () => (await list(e, me.token)).body.rows.map((r: any) => r.conversations[0].id).sort()
  expect(await ids()).toEqual([asked, old].sort())
  expect(store.m.has(importedKey(me.account))).toBe(false)
  store.m.set(conversationKey(me.account, bad), kept)
  expect(await ids()).toEqual([asked, old, bad].sort())
  expect(store.m.has(importedKey(me.account))).toBe(true)
})

test('more older conversations than one look may read: the next look carries on', async () => {
  const { e, db, store } = env()
  const me = await signIn(db)
  const at = Date.parse('2026-11-07T09:00:00Z')
  for (let i = 0; i < 201; i++) store.m.set(conversationKey(me.account, crypto.randomUUID()), JSON.stringify({ created: at, turns: [{ n: 1, question: 'Cũ', text: 't', blocks: [], at }] }))
  const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM chat_conversations').first<{ n: number }>())?.n
  await list(e, me.token)
  expect([await count(), store.m.has(importedKey(me.account))]).toEqual([200, false])
  await list(e, me.token)
  expect([await count(), store.m.has(importedKey(me.account))]).toEqual([201, true])
})
