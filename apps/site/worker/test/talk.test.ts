import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, expect, test } from 'vitest'
import { createSession, randomToken, COOKIE } from '../accounts/session'
import { handle, type Env } from '../index'
import { testD1 } from './d1'

/**
 * The app's way of posting readers' comments and photos, a bearer instead of Turnstile, against its contract
 * (protocols/talk.openapi.json): every answer's status is one the contract lists, and its body has the contract's shape.
 */
type Schema = { $ref?: string; type?: string; required?: string[]; properties?: Record<string, Schema>; items?: Schema; enum?: unknown[]; const?: unknown; minimum?: number; minLength?: number; maxLength?: number }
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
  } else if (s.type === 'array') {
    if (!Array.isArray(v)) return [...out, `${at}: not an array`]
    v.forEach((x, i) => out.push(...misfits(x, s.items ?? {}, `${at}[${i}]`)))
  } else if (s.type === 'string') {
    if (typeof v !== 'string') return [...out, `${at}: not a string`]
    if (v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity)) out.push(`${at}: length ${v.length}`)
  } else if (s.type === 'integer') {
    if (!Number.isInteger(v) || (v as number) < (s.minimum ?? -Infinity)) out.push(`${at}: not an integer ≥ ${s.minimum}`)
  } else if (s.type === 'boolean' && typeof v !== 'boolean') out.push(`${at}: not a boolean`)
  return out
}

/** The answer's body, after checking it against the contract's answer for its status; an error's code is one it names. */
async function answer(path: '/_c' | '/_p', res: Response): Promise<Record<string, unknown>> {
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
    get: async (k: string) => (m.has(k) ? { body: m.get(k), httpMetadata: { contentType: 'image/jpeg' } } : null),
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
  return { env, db, kv, uploads: uploads.m, media: media.m, comment, photo, signIn, rows }
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
