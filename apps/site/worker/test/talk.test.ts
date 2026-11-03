import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createSession, randomToken, COOKIE } from '../accounts/session'
import { purgeRemoved } from '../comments/api'
import { handle, type Env } from '../index'
import { testD1 } from './d1'

/**
 * The app's way of posting readers' comments and photos, a bearer instead of Turnstile, against its contract
 * (protocols/talk.openapi.json): every answer's status is one the contract lists, and its body has the contract's shape.
 */
type Schema = { $ref?: string; type?: string; required?: string[]; properties?: Record<string, Schema>; additionalProperties?: boolean; items?: Schema; enum?: unknown[]; const?: unknown; minimum?: number; minLength?: number; maxLength?: number; pattern?: string }
type Op = { responses: Record<string, { description: string; content: { 'application/json': { schema: Schema } } }> }
const api = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../protocols/talk.openapi.json', import.meta.url).href), 'utf8'))
const resolve = (s: Schema): Schema => (s.$ref ? resolve(s.$ref.slice(2).split('/').reduce((o, k) => o[k], api)) : s)

/** What in `v` the schema refuses: [] when it conforms. */
function misfits(v: unknown, schema: Schema, at = '$'): string[] {
  const s = resolve(schema)
  const out: string[] = []
  if (s.const !== undefined && v !== s.const) out.push(`${at}: ${JSON.stringify(v)} is not ${JSON.stringify(s.const)}`)
  if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`)
  if (s.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [...out, `${at}: not an object`]
    const o = v as Record<string, unknown>
    for (const k of s.required ?? []) if (!(k in o)) out.push(`${at}.${k}: missing`)
    for (const [k, p] of Object.entries(s.properties ?? {})) if (k in o) out.push(...misfits(o[k], p, `${at}.${k}`))
    if (s.additionalProperties === false) for (const k of Object.keys(o)) if (!(k in (s.properties ?? {}))) out.push(`${at}.${k}: not allowed`)
  } else if (s.type === 'array') {
    if (!Array.isArray(v)) return [...out, `${at}: not an array`]
    v.forEach((x, i) => out.push(...misfits(x, s.items ?? {}, `${at}[${i}]`)))
  } else if (s.type === 'string') {
    if (typeof v !== 'string') return [...out, `${at}: not a string`]
    if (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity)) out.push(`${at}: length ${v.length}`)
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${JSON.stringify(v)} doesn't match ${s.pattern}`)
  } else if (s.type === 'integer') {
    if (!Number.isInteger(v) || (v as number) < (s.minimum ?? -Infinity)) out.push(`${at}: not an integer ≥ ${s.minimum}`)
  } else if (s.type === 'boolean' && typeof v !== 'boolean') out.push(`${at}: not a boolean`)
  return out
}

/** The answer's body, after checking it against the contract's answer for its status; an error's code is one it names. */
async function answer(path: '/_c' | '/_p' | '/api/v1/report', res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json()) as Record<string, unknown>
  const r = (api.paths[path].post as Op).responses[String(res.status)]
  expect(r, `POST ${path} → ${res.status} ${JSON.stringify(body)} is not in the contract`).toBeDefined()
  expect(misfits(body, r!.content['application/json'].schema), `POST ${path} → ${res.status}`).toEqual([])
  if (res.status >= 400) {
    const codes = r!.description.replace(/^Error: /, '').split(' | ').map(c => c.replace(/ \(.*\)$/, ''))
    expect(codes, `POST ${path} → ${res.status}`).toContain(body.error)
  }
  return body
}

// Turnstile is Cloudflare's: siteverify is stubbed, and its calls counted.
let siteverifyCalls = 0
let turnstilePasses = true
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).includes('turnstile')) return realFetch(input, init)
  siteverifyCalls++
  return Response.json({ success: turnstilePasses, hostname: 'x.test' })
}) as typeof fetch
beforeEach(() => { siteverifyCalls = 0; turnstilePasses = true })

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0)), [1, 2, 3]))
const fakeR2 = () => {
  const m = new Map<string, Uint8Array>()
  const bucket = {
    put: async (k: string, v: Uint8Array) => { m.set(k, new Uint8Array(v)) },
    get: async (k: string) => (m.has(k) ? { body: m.get(k), httpMetadata: { contentType: 'image/jpeg' }, arrayBuffer: async () => m.get(k)!.slice().buffer } : null),
    head: async (k: string) => (m.has(k) ? {} : null),
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
  } as unknown as R2Bucket
  return { m, bucket }
}

const ORIGIN = 'https://x.test'
const PAGE = 'species:paracheirodon-innesi'
type Who = { bearer?: string; auth?: string; origin?: string; ip?: string; cookie?: string }

function setup(over: Record<string, string> = {}) {
  const kv = new Map<string, string>()
  const uploads = fakeR2()
  const media = fakeR2()
  const db = testD1()
  const env = {
    ASSETS: { fetch: async () => new Response('x') },
    AB: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v) } },
    DB: db, UPLOADS: uploads.bucket, MEDIA: media.bucket,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok',
    ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'a'.repeat(32), ...over,
  } as unknown as Env
  const headers = (o: Who, extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '203.0.113.9', ...extra }
    if (o.origin) h.origin = o.origin
    if (o.bearer) h.authorization = `Bearer ${o.bearer}`
    if (o.auth !== undefined) h.authorization = o.auth
    if (o.cookie) h.cookie = o.cookie
    return h
  }
  /** The app sends no Origin and no token; the page sends both. */
  const comment = async (body: string, o: Who = {}, extra: object = {}) => {
    const sent = { e: PAGE, name: 'Lộc', body, ...extra }
    if (o.bearer) expect(misfits(sent, { $ref: '#/components/schemas/NewComment' })).toEqual([])
    return handle(new Request(`${ORIGIN}/_c`, { method: 'POST', headers: headers(o, { 'content-type': 'application/json' }), body: JSON.stringify(sent) }), env)
  }
  const photo = async (o: Who = {}, extra: Record<string, string> = {}) => {
    const f = new FormData()
    for (const [k, v] of Object.entries({ e: PAGE, name: 'Lộc', consent: '1', ...extra })) f.set(k, v)
    f.set('file', new File([JPEG], 'a.jpg'))
    const r = new Request(`${ORIGIN}/_p`, { method: 'POST', body: f, headers: headers(o) })
    return handle(new Request(r, { headers: { ...Object.fromEntries(r.headers), 'content-length': '2000' } }), env)
  }
  /** An account signed in on the app (or a browser): its id and session token. */
  const signIn = async (client: 'app' | 'web' = 'app', at = new Date()) => {
    const id = crypto.randomUUID()
    await db.prepare(`INSERT INTO users (id, created_at) VALUES (?, ?)`).bind(id, at.toISOString()).run()
    return { id, token: await createSession(db, id, client, at) }
  }
  const rows = async (table: 'comments' | 'photos') =>
    (await db.prepare(`SELECT id, status, account_id FROM ${table} ORDER BY created_at, rowid`).all<{ id: string; status: string; account_id: string | null }>()).results
  return { env, db, kv, uploads: uploads.m, media: media.m, comment, photo, signIn, rows, headers }
}

test('the app posts a comment as its account: shown at once, or held, as the page\'s are', async () => {
  const t = setup()
  const a = await t.signIn()
  const shown = await answer('/_c', await t.comment('Bể 60 lít nuôi được mấy con?', { bearer: a.token }))
  expect(shown).toMatchObject({ status: 'approved', comment: { name: 'Lộc', body: 'Bể 60 lít nuôi được mấy con?', helpful: false } })
  expect(await answer('/_c', await t.comment('mua tại https://a.vn https://b.vn', { bearer: a.token }))).toEqual({ status: 'held' })
  expect((await t.rows('comments')).map(r => [r.status, r.account_id])).toEqual([['approved', a.id], ['held', a.id]])
  const listed = (await (await handle(new Request(`${ORIGIN}/_c?e=${PAGE}`), t.env)).json()) as { comments: { body: string }[] }
  expect(listed.comments.map(c => c.body)).toEqual(['Bể 60 lít nuôi được mấy con?'])
  expect(siteverifyCalls).toBe(0)
})

test('the app sends a photo as its account: it waits for moderation, with a link to take it back', async () => {
  const t = setup()
  const a = await t.signIn()
  const sent = await answer('/_p', await t.photo({ bearer: a.token }))
  expect(sent).toMatchObject({ status: 'pending', deleteUrl: expect.stringMatching(/^\/_p\/xoa\/\?id=/) })
  expect(await t.rows('photos')).toEqual([{ id: sent.id, status: 'pending', account_id: a.id }])
  expect(t.uploads.has(`pending/${sent.id}`)).toBe(true)
  expect(siteverifyCalls).toBe(0)
})

test('a bad, expired or signed-out bearer is 401 session, even with a Turnstile token and this site\'s Origin; nothing is kept or counted', async () => {
  const t = setup()
  const expired = await t.signIn('app', new Date(Date.now() - 366 * 86_400_000))
  const out = await t.signIn()
  const logout = await handle(new Request(`${ORIGIN}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${out.token}`, 'content-type': 'application/json' }, body: '{}' }), t.env)
  expect(logout.status).toBe(204)
  const web = await t.signIn('web')
  const bad: [string, Who][] = [
    ['no such session', { bearer: randomToken() }],
    ['expired', { bearer: expired.token }],
    ['signed out', { bearer: out.token }],
    ['a browser\'s session', { bearer: web.token }],
    ['not a bearer', { auth: `Basic ${btoa('a:b')}` }],
    ['a token too short', { auth: 'Bearer abc' }],
    // An empty header with the browser's cookie: never the browser's account, never the page's way.
    ['empty, with a cookie', { auth: '', cookie: `${COOKIE}=${web.token}` }],
  ]
  for (const [why, who] of bad) {
    const o = { ...who, origin: ORIGIN }
    expect(await answer('/_c', await t.comment('xin chào', o, { token: 't' })), why).toEqual({ error: 'session' })
    expect(await answer('/_p', await t.photo(o, { token: 't' })), why).toEqual({ error: 'session' })
  }
  expect([...(await t.rows('comments')), ...(await t.rows('photos'))]).toEqual([])
  expect(t.kv.size).toBe(0)
  expect(t.uploads.size).toBe(0)
  expect(siteverifyCalls).toBe(0)
})

test('a bearer skips Turnstile and the Origin check; the page\'s way still needs both', async () => {
  const t = setup()
  const a = await t.signIn()
  turnstilePasses = false
  for (const origin of [undefined, 'https://evil.test']) {
    expect((await answer('/_c', await t.comment(`từ ứng dụng ${origin}`, { bearer: a.token, origin }))).status).toBe('approved')
    expect((await answer('/_p', await t.photo({ bearer: a.token, origin }))).status).toBe('pending')
  }
  expect(siteverifyCalls).toBe(0)
  expect(await answer('/_c', await t.comment('từ trang', { origin: ORIGIN }, { token: 't' }))).toEqual({ error: 'turnstile' })
  expect(await answer('/_p', await t.photo({ origin: ORIGIN }, { token: 't' }))).toEqual({ error: 'turnstile' })
  expect(await answer('/_c', await t.comment('từ trang khác', { origin: 'https://evil.test' }, { token: 't' }))).toEqual({ error: 'cross-origin' })
  expect(await answer('/_p', await t.photo({}, { token: 't' }))).toEqual({ error: 'cross-origin' })
})

test('comments: an account\'s 5 a day hold across addresses, and an address\'s 5 a day hold for the app too', async () => {
  const t = setup()
  const a = await t.signIn()
  const b = await t.signIn()
  for (let i = 0; i < 5; i++) expect((await answer('/_c', await t.comment(`câu hỏi số ${i}`, { bearer: a.token, ip: '198.51.100.1' }))).status).toBe('approved')
  expect(await answer('/_c', await t.comment('câu hỏi thứ sáu', { bearer: a.token, ip: '198.51.100.2' }))).toEqual({ status: 'held' })

  for (let i = 0; i < 5; i++) expect((await answer('/_c', await t.comment(`từ trang ${i}`, { origin: ORIGIN, ip: '198.51.100.3' }, { token: 't' }))).status).toBe('approved')
  expect(await answer('/_c', await t.comment('từ ứng dụng', { bearer: b.token, ip: '198.51.100.3' }))).toEqual({ status: 'held' })
  // b's own day isn't full: from another address, shown at once.
  expect((await answer('/_c', await t.comment('từ nơi khác', { bearer: b.token, ip: '198.51.100.4' }))).status).toBe('approved')
  // The counters are keyed HMACs, as the address's always were: no account id or address in them.
  for (const k of t.kv.keys()) expect(k).toMatch(/^rl:[0-9a-f]{32}$/)
})

test('photos: past an account\'s or an address\'s 5 a day, refused (429), and a refused photo counts against neither', async () => {
  const t = setup()
  const a = await t.signIn()
  const b = await t.signIn()
  for (let i = 0; i < 5; i++) expect((await t.photo({ bearer: a.token, ip: '198.51.100.1' })).status).toBe(201)
  expect(await answer('/_p', await t.photo({ bearer: a.token, ip: '198.51.100.2' }))).toEqual({ error: 'rate' })
  // 198.51.100.2 wasn't counted for a's refused photo: its 5 are still there.
  for (let i = 0; i < 5; i++) expect((await t.photo({ origin: ORIGIN, ip: '198.51.100.2' }, { token: 't' })).status).toBe(201)
  expect(await answer('/_p', await t.photo({ bearer: b.token, ip: '198.51.100.2' }))).toEqual({ error: 'rate' })
  expect((await answer('/_p', await t.photo({ bearer: b.token, ip: '198.51.100.4' }))).status).toBe('pending')
  for (const k of t.kv.keys()) expect(k).toMatch(/^prl:[0-9a-f]{32}$/)
})

test('phone verification on: a signed-in account counts as verified; the page\'s way is refused', async () => {
  const t = setup({ COMMENT_VERIFICATION: 'phone' })
  const a = await t.signIn()
  expect((await answer('/_c', await t.comment('xin chào', { bearer: a.token }))).status).toBe('approved')
  expect((await answer('/_p', await t.photo({ bearer: a.token }))).status).toBe('pending')
  expect(await answer('/_c', await t.comment('từ trang', { origin: ORIGIN }, { token: 't' }))).toEqual({ error: 'verification_required' })
  expect(await answer('/_p', await t.photo({ origin: ORIGIN }, { token: 't' }))).toEqual({ error: 'verification_required' })
})

test('deleting an account deletes its comments and photos, the photos\' files with them; the page\'s posts stay', async () => {
  const t = setup()
  const a = await t.signIn()
  await t.comment('của ứng dụng, hiện ngay', { bearer: a.token })
  await t.comment('của ứng dụng https://a.vn https://b.vn', { bearer: a.token })
  const published = (await (await t.photo({ bearer: a.token })).json()) as { id: string }
  const waiting = (await (await t.photo({ bearer: a.token })).json()) as { id: string }
  await t.comment('của trang', { origin: ORIGIN }, { token: 't' })
  const page = (await (await t.photo({ origin: ORIGIN }, { token: 't' })).json()) as { id: string }
  // One of the app's photos published, as the nightly pass does: files first, then the decision.
  const admin = (path: string, init: RequestInit) => handle(new Request(`${ORIGIN}/_p/admin/${path}`, { ...init, headers: { authorization: 'Bearer tok' } }), t.env)
  for (const kind of ['full', 'thumb']) expect((await admin(`file/${published.id}?kind=${kind}`, { method: 'PUT', body: WEBP })).status).toBe(200)
  expect(await (await admin('decisions', { method: 'POST', body: JSON.stringify([{ id: published.id, action: 'approve', reason: 'ok', width: 1200, height: 800 }]) })).json()).toEqual({ applied: 1, ignored: 0 })
  expect([...t.media.keys()].sort()).toEqual([`readers/${published.id}-480.webp`, `readers/${published.id}.webp`])
  expect([...t.uploads.keys()].sort()).toEqual([`pending/${page.id}`, `pending/${waiting.id}`].sort())

  const del = await handle(new Request(`${ORIGIN}/api/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } }), t.env)
  expect(del.status).toBe(204)
  expect(await t.rows('comments')).toEqual([{ id: expect.any(String), status: 'approved', account_id: null }])
  expect(await t.rows('photos')).toEqual([{ id: page.id, status: 'pending', account_id: null }])
  expect([...t.uploads.keys()]).toEqual([`pending/${page.id}`])
  expect(t.media.size).toBe(0)
  expect(await t.db.prepare(`SELECT COUNT(*) AS n FROM users`).first()).toEqual({ n: 0 })
  expect(await answer('/_c', await t.comment('sau khi xóa', { bearer: a.token }))).toEqual({ error: 'session' })
})

test('without a bearer, posting is as before: no account, a browser\'s session cookie or not', async () => {
  const t = setup()
  const web = await t.signIn('web')
  expect((await answer('/_c', await t.comment('từ trang', { origin: ORIGIN, cookie: `${COOKIE}=${web.token}` }, { token: 't' }))).status).toBe('approved')
  expect((await answer('/_p', await t.photo({ origin: ORIGIN, cookie: `${COOKIE}=${web.token}` }, { token: 't' }))).status).toBe('pending')
  expect(siteverifyCalls).toBe(2)
  expect((await t.rows('comments')).map(r => r.account_id)).toEqual([null])
  expect((await t.rows('photos')).map(r => r.account_id)).toEqual([null])
  expect(await answer('/_c', await t.comment('không có mã', { origin: ORIGIN }))).toEqual({ error: 'turnstile' })
})

type T = ReturnType<typeof setup>
type Listed = { comments?: { id: string; author: string }[]; photos?: { id: string; author: string }[] }
const asOwner = (t: T, path: string, init: RequestInit = {}) => handle(new Request(`${ORIGIN}${path}`, { ...init, headers: { authorization: 'Bearer tok' } }), t.env)
const report = (t: T, body: object | string, o: Who = {}) =>
  handle(new Request(`${ORIGIN}/api/v1/report`, { method: 'POST', headers: t.headers(o, { 'content-type': 'application/json' }), body: typeof body === 'string' ? body : JSON.stringify(body) }), t.env)
/** A page's public comments or photos, checked against the contract's 200. */
async function listed(t: T, path: '/_c' | '/_p'): Promise<Listed> {
  const res = await handle(new Request(`${ORIGIN}${path}?e=${PAGE}`), t.env)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(misfits(body, (api.paths[path].get as Op).responses['200']!.content['application/json'].schema), `GET ${path}`).toEqual([])
  return body as Listed
}
const ids = (l: Listed) => (l.comments ?? l.photos ?? []).map(x => x.id)
const shown = async (t: T, body: string, o: Who) => ((await (await t.comment(body, o, o.bearer ? {} : { token: 't' })).json()) as { comment: { id: string; author: string } }).comment
/** As the nightly pass publishes a photo: files first, then the decision. */
async function publish(t: T, id: string) {
  for (const kind of ['full', 'thumb']) expect((await asOwner(t, `/_p/admin/file/${id}?kind=${kind}`, { method: 'PUT', body: WEBP })).status).toBe(200)
  return (await asOwner(t, '/_p/admin/decisions', { method: 'POST', body: JSON.stringify([{ id, action: 'approve', reason: 'ok', width: 1200, height: 800 }]) })).json()
}
const commentQueue = async (t: T) => (await (await asOwner(t, '/_c/admin/queue')).json()) as { id: string; status: string; reason: string | null; reports: string[] }[]
const photoQueue = async (t: T) => (await (await asOwner(t, '/_p/admin/queue')).json()) as { id: string; reports: string[] }[]
const decide = (t: T, id: string, action: 'approve' | 'remove') =>
  asOwner(t, '/_c/admin/decisions', { method: 'POST', body: JSON.stringify([{ id, action, helpful: false, reason: 'checked' }]) })
// Reports turn on which came first, a report or a decision: these tests set the clock.
const T0 = Date.parse('2026-11-03T08:00:00Z')
const at = (minutes: number) => vi.setSystemTime(new Date(T0 + minutes * 60_000))
afterEach(() => { vi.useRealTimers() })

test('every public comment and photo carries `author`: one per account, one per post sent without one', async () => {
  const t = setup()
  const a = await t.signIn()
  const c1 = await answer('/_c', await t.comment('Bể 60 lít nuôi được mấy con?', { bearer: a.token }))
  const c2 = await shown(t, 'Nhiệt độ bao nhiêu là vừa?', { bearer: a.token })
  const w1 = await shown(t, 'Cá này ăn gì?', { origin: ORIGIN })
  const w2 = await shown(t, 'Cá này ăn gì nữa?', { origin: ORIGIN })
  const p = (await (await t.photo({ bearer: a.token })).json()) as { id: string }
  await publish(t, p.id)

  const comments = (await listed(t, '/_c')).comments!
  const by = (id: string) => comments.find(c => c.id === id)!.author
  const mine = by((c1.comment as { id: string }).id)
  expect((c1.comment as { author: string }).author).toBe(mine) // the post's answer says it too
  expect(by(c2.id)).toBe(mine)
  expect(by(w1.id)).not.toBe(by(w2.id))
  expect([by(w1.id), by(w2.id)]).not.toContain(mine)
  expect((await listed(t, '/_p')).photos!.map(x => x.author)).toEqual([mine])
  for (const c of comments) expect(c.author).not.toContain(a.id.slice(0, 8))
})

test('report: every answer is one the contract lists', async () => {
  const t = setup()
  const a = await t.signIn()
  const c = await shown(t, 'Bể 60 lít nuôi được mấy con?', { bearer: a.token })
  expect(await answer('/_c', await t.comment('mua tại https://a.vn https://b.vn', { bearer: a.token }))).toEqual({ status: 'held' })
  const held = (await t.rows('comments')).find(r => r.status === 'held')!.id
  const waiting = (await (await t.photo({ bearer: a.token })).json()) as { id: string }

  for (const bad of ['{', '[]', { kind: 'post', id: c.id }, { kind: 'comment' }, { kind: 'comment', id: '' }, { kind: 'comment', id: 7 },
    { kind: 'comment', id: c.id, reason: 'x'.repeat(501) }, { kind: 'comment', id: c.id, reason: 5 }]) {
    expect(await answer('/api/v1/report', await report(t, bad)), JSON.stringify(bad)).toEqual({ error: 'bad report' })
  }
  const good = { kind: 'comment', id: c.id, reason: 'quảng cáo' }
  expect(misfits(good, { $ref: '#/components/schemas/NewReport' })).toEqual([])
  expect(await answer('/api/v1/report', await report(t, good, { bearer: randomToken() }))).toEqual({ error: 'session' })
  expect(await answer('/api/v1/report', await report(t, good, { origin: 'https://evil.test' }))).toEqual({ error: 'cross-origin' })
  for (const missing of [{ kind: 'comment', id: crypto.randomUUID() }, { kind: 'comment', id: held }, { kind: 'photo', id: waiting.id }, { kind: 'photo', id: c.id }]) {
    expect(await answer('/api/v1/report', await report(t, missing)), JSON.stringify(missing)).toEqual({ error: 'not found' })
  }
  // Signed out with no Origin (the app), with the site's (a page), and signed in: received.
  expect(await answer('/api/v1/report', await report(t, good, { ip: '198.51.100.1' }))).toEqual({ status: 'received' })
  expect(await answer('/api/v1/report', await report(t, good, { ip: '198.51.100.2', origin: ORIGIN }))).toEqual({ status: 'received' })
  expect(await answer('/api/v1/report', await report(t, good, { bearer: (await t.signIn()).token }))).toEqual({ status: 'received' })

  const off = setup({ TURNSTILE_SECRET: '' })
  expect(await answer('/api/v1/report', await report(off, good))).toEqual({ error: 'comments_off' })
  expect(await answer('/api/v1/report', await report(setup({ UPLOADS: '' }), { kind: 'photo', id: waiting.id }))).toEqual({ error: 'photos_off' })
})

test('a signed-in reader\'s report takes a comment down at once; a signed-out one only puts it before the moderation', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(0)
  const t = setup()
  const poster = await t.signIn()
  const c1 = await shown(t, 'Bể 60 lít nuôi được mấy con?', { bearer: poster.token })
  const c2 = await shown(t, 'Nhiệt độ bao nhiêu là vừa?', { bearer: poster.token })
  expect((await (await decide(t, c1.id, 'approve')).json())).toEqual({ applied: 1, ignored: 0 })
  expect((await (await decide(t, c2.id, 'approve')).json())).toEqual({ applied: 1, ignored: 0 })
  expect(await commentQueue(t)).toEqual([])

  at(1)
  const reader = await t.signIn()
  expect((await report(t, { kind: 'comment', id: c1.id, reason: 'quảng cáo' }, { bearer: reader.token })).status).toBe(202)
  expect(ids(await listed(t, '/_c'))).toEqual([c2.id])
  expect(await commentQueue(t)).toEqual([expect.objectContaining({ id: c1.id, status: 'held', reason: 'reported by a reader', reports: ['quảng cáo'] })])
  // The same reader again changes nothing; another reader can still report the comment that's down.
  expect((await report(t, { kind: 'comment', id: c1.id, reason: 'lần nữa' }, { bearer: reader.token })).status).toBe(202)
  expect((await report(t, { kind: 'comment', id: c1.id }, { ip: '198.51.100.7' })).status).toBe(202)
  expect((await commentQueue(t))[0]!.reports.sort()).toEqual(['', 'quảng cáo'])

  // Signed out: c2 stays up, and is in the queue with its reason.
  expect((await report(t, { kind: 'comment', id: c2.id, reason: 'sai' }, { ip: '198.51.100.8' })).status).toBe(202)
  expect(ids(await listed(t, '/_c'))).toEqual([c2.id])
  expect((await commentQueue(t)).map(q => [q.id, q.status, q.reports])).toEqual([[c1.id, 'held', expect.any(Array)], [c2.id, 'approved', ['sai']]])

  // Who reported is kept only as keyed hashes: no account id or address in the table or the counters.
  const kept = (await t.db.prepare(`SELECT reporter FROM reports`).all<{ reporter: string }>()).results
  expect(kept).toHaveLength(3)
  for (const r of kept) expect(r.reporter).toMatch(/^[0-9a-f]{32}$/)
  for (const k of [...t.kv.keys()].filter(k => k.startsWith('r') && !k.startsWith('rl:'))) expect(k).toMatch(/^rrl:[0-9a-f]{32}$/)
})

test('kept by the moderation after a report, a comment stays up through later reports, back in the queue each time', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(0)
  const t = setup()
  const c = await shown(t, 'Bể 60 lít nuôi được mấy con?', { bearer: (await t.signIn()).token })
  at(1)
  expect((await report(t, { kind: 'comment', id: c.id }, { bearer: (await t.signIn()).token })).status).toBe(202)
  expect(ids(await listed(t, '/_c'))).toEqual([])
  at(2)
  await decide(t, c.id, 'approve')
  expect(ids(await listed(t, '/_c'))).toEqual([c.id])
  expect(await commentQueue(t)).toEqual([])
  at(3)
  expect((await report(t, { kind: 'comment', id: c.id, reason: 'lại nữa' }, { bearer: (await t.signIn()).token })).status).toBe(202)
  expect(ids(await listed(t, '/_c'))).toEqual([c.id])
  expect((await commentQueue(t)).map(q => [q.id, q.status, q.reports.length])).toEqual([[c.id, 'approved', 2]])
  at(4)
  await decide(t, c.id, 'approve')
  expect(await commentQueue(t)).toEqual([])
})

test('photos: a signed-in report unpublishes at once; the nightly pass sees it again; kept, later reports only queue it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(0)
  const t = setup()
  const p = (await (await t.photo({ bearer: (await t.signIn()).token })).json()) as { id: string }
  await publish(t, p.id)
  expect(ids(await listed(t, '/_p'))).toEqual([p.id])
  expect(t.uploads.size).toBe(0)

  at(1)
  expect((await report(t, { kind: 'photo', id: p.id, reason: 'không phải cá này' }, { bearer: (await t.signIn()).token })).status).toBe(202)
  expect(ids(await listed(t, '/_p'))).toEqual([])
  expect(t.media.size).toBe(0) // its public address answers nothing
  expect(t.uploads.get(`pending/${p.id}`)).toEqual(WEBP) // the published copy, for the pass to look at again
  expect(await photoQueue(t)).toEqual([expect.objectContaining({ id: p.id, reports: ['không phải cá này'] })])
  expect((await asOwner(t, `/_p/admin/raw/${p.id}`)).status).toBe(200)

  at(2)
  expect(await publish(t, p.id)).toEqual({ applied: 1, ignored: 0 })
  expect(ids(await listed(t, '/_p'))).toEqual([p.id])
  expect(await photoQueue(t)).toEqual([])

  at(3)
  expect((await report(t, { kind: 'photo', id: p.id }, { bearer: (await t.signIn()).token })).status).toBe(202)
  expect(ids(await listed(t, '/_p'))).toEqual([p.id])
  expect((await photoQueue(t)).map(q => [q.id, q.reports.length])).toEqual([[p.id, 2]])
  // No upload is left after publishing: the pass reads the published copy.
  expect(t.uploads.size).toBe(0)
  expect(new Uint8Array(await (await asOwner(t, `/_p/admin/raw/${p.id}`)).arrayBuffer())).toEqual(WEBP)
  at(4)
  expect(await publish(t, p.id)).toEqual({ applied: 1, ignored: 0 })
  expect(await photoQueue(t)).toEqual([])
})

test('reports: 20 a day per address and 20 per account on top; a refused report counts against neither', async () => {
  const t = setup()
  const c = await shown(t, 'Bể 60 lít nuôi được mấy con?', { bearer: (await t.signIn()).token })
  const r = { kind: 'comment', id: c.id }
  for (let i = 0; i < 20; i++) expect((await report(t, r, { ip: '198.51.100.1' })).status).toBe(202)
  expect(await answer('/api/v1/report', await report(t, r, { ip: '198.51.100.1' }))).toEqual({ error: 'rate' })
  const b = await t.signIn()
  for (let i = 0; i < 20; i++) expect((await report(t, r, { bearer: b.token, ip: '198.51.100.2' })).status).toBe(202)
  expect(await answer('/api/v1/report', await report(t, r, { bearer: b.token, ip: '198.51.100.3' }))).toEqual({ error: 'rate' })
  // 198.51.100.3 wasn't counted for b's refused report.
  for (let i = 0; i < 20; i++) expect((await report(t, r, { ip: '198.51.100.3' })).status).toBe(202)
})

test('reports go when what they report goes: a purged comment\'s, a removed photo\'s', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(0)
  const t = setup()
  const a = await t.signIn()
  const gone = await shown(t, 'Bể 60 lít nuôi được mấy con?', { bearer: a.token })
  const stays = await shown(t, 'Nhiệt độ bao nhiêu là vừa?', { bearer: a.token })
  const p = (await (await t.photo({ bearer: a.token })).json()) as { id: string }
  await publish(t, p.id)
  at(1)
  for (const [kind, id] of [['comment', gone.id], ['comment', stays.id], ['photo', p.id]]) expect((await report(t, { kind, id }, { ip: '198.51.100.1' })).status).toBe(202)
  at(2)
  await decide(t, gone.id, 'remove')
  await asOwner(t, '/_p/admin/decisions', { method: 'POST', body: JSON.stringify([{ id: p.id, action: 'remove', reason: 'not this fish' }]) })
  expect(await purgeRemoved(t.db, new Date(T0 + 31 * 86_400_000))).toBe(1)
  expect((await t.db.prepare(`SELECT kind, item_id FROM reports`).all()).results).toEqual([{ kind: 'comment', item_id: stays.id }])
})

/** A reader's own photos (/api/v1/talk/photos/mine): the answer checked against the contract's for its status, its body. */
async function own(method: 'get' | 'delete', path: '/api/v1/talk/photos/mine' | '/api/v1/talk/photos/mine/{id}', res: Response): Promise<Record<string, unknown> | undefined> {
  const r = (api.paths[path][method] as Op).responses[String(res.status)]
  expect(r, `${method.toUpperCase()} ${path} → ${res.status} is not in the contract`).toBeDefined()
  if (res.status === 204) { expect(await res.text()).toBe(''); return undefined }
  const body = (await res.json()) as Record<string, unknown>
  expect(misfits(body, r!.content['application/json'].schema), `${method.toUpperCase()} ${path} → ${res.status}`).toEqual([])
  if (res.status >= 400) expect(r!.description.replace(/^Error: /, '').split(' | ').map(c => c.replace(/ \(.*\)$/, ''))).toContain(body.error)
  return body
}
type Mine = { photos: { id: string; e: string; status: string; why?: string; movedFrom?: string; url?: string; decidedAt?: string }[] }
const mine = async (t: T, o: Who) => (await own('get', '/api/v1/talk/photos/mine', await handle(new Request(`${ORIGIN}/api/v1/talk/photos/mine`, { headers: t.headers(o) }), t.env))) as Mine
const takeBack = async (t: T, id: string, o: Who) =>
  own('delete', '/api/v1/talk/photos/mine/{id}', await handle(new Request(`${ORIGIN}/api/v1/talk/photos/mine/${id}`, { method: 'DELETE', headers: t.headers(o) }), t.env))
const sent = async (t: T, o: Who) => ((await (await t.photo(o, o.bearer ? {} : { token: 't' })).json()) as { id: string; deleteUrl: string })

test('a reader lists the photos they sent from the app: waiting, shown, turned down with its code, moved to the right fish', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const t = setup()
  const a = await t.signIn()
  const b = await t.signIn()
  at(0); const waiting = await sent(t, { bearer: a.token })
  at(1); const shownHere = await sent(t, { bearer: a.token })
  at(2); const wrongFish = await sent(t, { bearer: a.token })
  at(3); const moved = await sent(t, { bearer: a.token })
  at(4); const unknownCode = await sent(t, { bearer: a.token })
  // From other addresses: an address has 5 a day.
  at(5); const theirs = await sent(t, { bearer: b.token, ip: '198.51.100.7' })
  await sent(t, { origin: ORIGIN, ip: '198.51.100.8' }) // the page's: no account
  at(10)
  await publish(t, shownHere.id)
  for (const kind of ['full', 'thumb']) await asOwner(t, `/_p/admin/file/${moved.id}?kind=${kind}`, { method: 'PUT', body: WEBP })
  expect(await (await asOwner(t, '/_p/admin/decisions', { method: 'POST', body: JSON.stringify([
    { id: wrongFish.id, action: 'remove', reason: 'a goldfish, not a neon', why: 'species' },
    { id: moved.id, action: 'approve', reason: 'a betta', width: 1200, height: 900, entity: 'species:betta-splendens' },
    { id: unknownCode.id, action: 'remove', reason: 'odd', why: 'blurry-ish' },
  ]) })).json()).toEqual({ applied: 3, ignored: 0 })

  const list = await mine(t, { bearer: a.token })
  expect(list.photos.map(p => p.id)).toEqual([unknownCode.id, moved.id, wrongFish.id, shownHere.id, waiting.id])
  const [odd, movedRow, wrong, shownRow, waitingRow] = list.photos
  expect(waitingRow).toEqual({ id: waiting.id, e: PAGE, name: 'Lộc', status: 'pending', createdAt: new Date(T0).toISOString() })
  expect(shownRow).toMatchObject({ status: 'approved', e: PAGE, url: `https://media.aquatome.com/readers/${shownHere.id}.webp`, thumb: `https://media.aquatome.com/readers/${shownHere.id}-480.webp`, width: 1200, height: 800, decidedAt: new Date(T0 + 600_000).toISOString() })
  expect(shownRow).not.toHaveProperty('why')
  expect(wrong).toMatchObject({ status: 'removed', why: 'species', e: PAGE })
  expect(wrong).not.toHaveProperty('url')
  expect(movedRow).toMatchObject({ status: 'approved', e: 'species:betta-splendens', movedFrom: PAGE, width: 1200, height: 900 })
  expect(odd).toMatchObject({ status: 'removed', why: 'other' })
  // The moved photo shows on the right fish's page, not on the one it was sent for.
  const onPage = async (e: string) => ((await (await handle(new Request(`${ORIGIN}/_p?e=${e}`), t.env)).json()) as Listed).photos!.map(p => p.id)
  expect(await onPage(PAGE)).toEqual([shownHere.id])
  expect(await onPage('species:betta-splendens')).toEqual([moved.id])
  // Another account sees only its own; the page's photo is no one's.
  expect((await mine(t, { bearer: b.token })).photos.map(p => p.id)).toEqual([theirs.id])
})

test('a move goes to a species\' page only, and an approval that names none stays on its page', async () => {
  const t = setup()
  const a = await t.signIn()
  const p = await sent(t, { bearer: a.token })
  for (const kind of ['full', 'thumb']) await asOwner(t, `/_p/admin/file/${p.id}?kind=${kind}`, { method: 'PUT', body: WEBP })
  const approve = (entity?: unknown) => asOwner(t, '/_p/admin/decisions', { method: 'POST', body: JSON.stringify([{ id: p.id, action: 'approve', reason: 'ok', width: 10, height: 10, ...(entity === undefined ? {} : { entity }) }]) })
  for (const bad of ['breed:betta-halfmoon', 'species:', 'SPECIES:x', 7, '']) expect(await (await approve(bad)).json(), JSON.stringify(bad)).toEqual({ applied: 0, ignored: 1 })
  expect(await (await approve()).json()).toEqual({ applied: 1, ignored: 0 })
  const [row] = (await mine(t, { bearer: a.token })).photos
  expect(row).toMatchObject({ e: PAGE, status: 'approved' })
  expect(row).not.toHaveProperty('movedFrom')
})

test('a reader takes back their own photo from the app, waiting, shown or turned down; never another\'s', async () => {
  const t = setup()
  const a = await t.signIn()
  const b = await t.signIn()
  const waiting = await sent(t, { bearer: a.token })
  const shownHere = await sent(t, { bearer: a.token })
  const turnedDown = await sent(t, { bearer: a.token })
  const viaLink = await sent(t, { bearer: a.token })
  const theirs = await sent(t, { bearer: b.token })
  await publish(t, shownHere.id)
  await asOwner(t, '/_p/admin/decisions', { method: 'POST', body: JSON.stringify([{ id: turnedDown.id, action: 'remove', reason: 'a person at the edge', why: 'face' }]) })

  expect(await takeBack(t, waiting.id, { bearer: a.token })).toBeUndefined()
  expect(t.uploads.has(`pending/${waiting.id}`)).toBe(false)
  expect(await takeBack(t, shownHere.id, { bearer: a.token })).toBeUndefined()
  expect(t.media.size).toBe(0)
  expect(((await listed(t, '/_p')).photos ?? []).map(p => p.id)).toEqual([])
  expect(await takeBack(t, turnedDown.id, { bearer: a.token })).toBeUndefined()
  // The moderator's words stay for the dashboard; the reader's list no longer has it.
  expect(await t.db.prepare(`SELECT status, reason, why FROM photos WHERE id = ?`).bind(turnedDown.id).first()).toEqual({ status: 'removed', reason: 'a person at the edge', why: 'withdrawn' })
  // Its delete link does the same.
  const link = new URL(viaLink.deleteUrl, ORIGIN)
  const form = new FormData()
  form.set('id', link.searchParams.get('id')!); form.set('t', link.searchParams.get('t')!)
  expect((await handle(new Request(`${ORIGIN}/_p/xoa/`, { method: 'POST', body: form }), t.env)).status).toBe(200)
  expect((await mine(t, { bearer: a.token })).photos).toEqual([])

  // Already taken back, another account's, not an id: not found, and the other reader's photo stays.
  for (const id of [waiting.id, theirs.id, 'x', crypto.randomUUID()]) expect(await takeBack(t, id, { bearer: a.token }), id).toEqual({ error: 'not_found' })
  expect((await mine(t, { bearer: b.token })).photos.map(p => [p.id, p.status])).toEqual([[theirs.id, 'pending']])
  expect(t.uploads.has(`pending/${theirs.id}`)).toBe(true)
})

test('the reader\'s own photos need the app\'s bearer: none, a bad one or a browser\'s session cookie is 401 session; photos off is 503', async () => {
  const t = setup()
  const a = await t.signIn()
  const p = await sent(t, { bearer: a.token })
  const web = await t.signIn('web')
  for (const o of [{}, { bearer: randomToken() }, { auth: 'Bearer ' }, { cookie: `${COOKIE}=${web.token}` }, { bearer: web.token }] as Who[]) {
    expect(await mine(t, o), JSON.stringify(o)).toEqual({ error: 'session' })
    expect(await takeBack(t, p.id, o), JSON.stringify(o)).toEqual({ error: 'session' })
  }
  expect((await mine(t, { bearer: a.token })).photos.map(x => x.status)).toEqual(['pending'])
  const off = { ...t, env: { ...t.env, MEDIA: undefined } as unknown as Env }
  expect(await mine(off, { bearer: a.token })).toEqual({ error: 'photos_off' })
  expect(await takeBack(off, p.id, { bearer: a.token })).toEqual({ error: 'photos_off' })
})
