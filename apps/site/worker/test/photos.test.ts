import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { sniff, waitingPhotos } from '../photos'
import { photosPage } from '../admin/pages'
import { testD1 } from './d1'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0)), [1, 2, 3]))
const fakeR2 = () => {
  const m = new Map<string, Uint8Array>()
  const types = new Map<string, string | undefined>()
  return {
    m,
    bucket: {
      put: async (k: string, v: Uint8Array, o?: R2PutOptions) => { m.set(k, new Uint8Array(v)); types.set(k, (o?.httpMetadata as R2HTTPMetadata | undefined)?.contentType) },
      get: async (k: string) => (m.has(k) ? { body: m.get(k), httpMetadata: { contentType: types.get(k) } } : null),
      head: async (k: string) => (m.has(k) ? {} : null),
      delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
    } as unknown as R2Bucket,
  }
}
function env() {
  const kv = new Map<string, string>()
  const ttl = new Map<string, number | undefined>()
  const uploads = fakeR2()
  const media = fakeR2()
  const db = testD1()
  const e = {
    ASSETS: { fetch: async () => new Response('x') },
    AB: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string, o?: KVNamespacePutOptions) => { kv.set(k, v); ttl.set(k, o?.expirationTtl) },
      delete: async (k: string) => { kv.delete(k) },
    },
    DB: db, UPLOADS: uploads.bucket, MEDIA: media.bucket,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok', OWNER_ACCOUNTS: 'owner-1',
  } as unknown as Env
  return { e, db, kv, ttl, uploads: uploads.m, media: media.m }
}
/** The owner's account and a reader's, each signed in on the web (the dashboard's cookie), and the owner's app session. */
async function signedIn(db: D1Database) {
  const { createSession } = await import('../accounts/session')
  for (const id of ['owner-1', 'reader-1']) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, '2026-11-01T00:00:00Z').run()
  const now = new Date()
  const cookie = async (id: string) => `__Host-aq_session=${await createSession(db, id, 'web', now)}`
  return { owner: await cookie('owner-1'), reader: await cookie('reader-1'), app: await createSession(db, 'owner-1', 'app', now) }
}
// Turnstile is checked against Cloudflare; tests stub fetch for siteverify only.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
  String(input).includes('turnstile') ? Response.json({ success: true, hostname: 'x.test' }) : realFetch(input, init)) as typeof fetch

const upload = (fields: Record<string, string | Blob>, headers: Record<string, string> = {}) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  const r = new Request('https://x.test/_p', { method: 'POST', body: f, headers: { origin: 'https://x.test', ...headers } })
  return new Request(r, { headers: { ...Object.fromEntries(r.headers), 'content-length': '2000' } })
}
const ok = { e: 'species:paracheirodon-innesi', name: 'Lộc', consent: '1', token: 't', file: new File([JPEG], 'a.jpg') }

test('sniff accepts JPEG, PNG and WebP by their bytes only', () => {
  expect(sniff(JPEG)).toBe('image/jpeg')
  expect(sniff(WEBP)).toBe('image/webp')
  expect(sniff(new TextEncoder().encode('<svg>'))).toBeNull()
})

test('upload → pending in the private bucket, not listed; publish via admin; private link deletes everything', async () => {
  const { e, uploads, media } = env()
  const r = await handle(upload(ok), e)
  expect(r.status).toBe(201)
  const out = (await r.json()) as { status: string; id: string; deleteUrl: string }
  expect(out.status).toBe('pending')
  expect(uploads.has(`pending/${out.id}`)).toBe(true)
  const list = async () => ((await (await handle(new Request('https://x.test/_p?e=species:paracheirodon-innesi'), e)).json()) as { photos: unknown[] }).photos
  expect(await list()).toEqual([])

  const admin = (path: string, init: RequestInit = {}, token = 'tok') => handle(new Request(`https://x.test/_p/admin/${path}`, { ...init, headers: { authorization: `Bearer ${token}` } }), e)
  expect((await admin('queue', {}, 'wrong')).status).toBe(404)
  expect(((await (await admin('queue')).json()) as { id: string }[]).map(q => q.id)).toEqual([out.id])
  expect(new Uint8Array(await (await admin(`raw/${out.id}`)).arrayBuffer())).toEqual(JPEG)
  // Approval before the files exist is ignored; files first, then publish.
  expect(await (await admin('decisions', { method: 'POST', body: JSON.stringify([{ id: out.id, action: 'approve', reason: 'ok', width: 1200, height: 800 }]) })).json()).toEqual({ applied: 0, ignored: 1 })
  expect((await admin(`file/${out.id}?kind=full`, { method: 'PUT', body: JPEG })).status).toBe(400) // WebP only
  for (const kind of ['full', 'thumb']) expect((await admin(`file/${out.id}?kind=${kind}`, { method: 'PUT', body: WEBP })).status).toBe(200)
  expect(await (await admin('decisions', { method: 'POST', body: JSON.stringify([{ id: out.id, action: 'approve', reason: 'ok', width: 1200, height: 800 }]) })).json()).toEqual({ applied: 1, ignored: 0 })
  expect(uploads.has(`pending/${out.id}`)).toBe(false) // the raw upload (EXIF) is gone once published
  expect(await list()).toMatchObject([{ id: out.id, name: 'Lộc', url: `https://media.aquatome.com/readers/${out.id}.webp`, width: 1200 }])

  const del = new URL(out.deleteUrl, 'https://x.test')
  expect((await handle(new Request(del), e)).status).toBe(200) // GET only shows the button
  expect(await list()).toHaveLength(1)
  const post = (t: string) => handle(new Request('https://x.test/_p/xoa/', { method: 'POST', body: new URLSearchParams({ id: out.id, t }) }), e)
  expect((await post('wrong')).status).toBe(403)
  expect((await post(del.searchParams.get('t')!)).status).toBe(200)
  expect(await list()).toEqual([])
  expect(media.size).toBe(0)
})

test('refused: cross-origin, wrong entity, no consent, not an image, too big, bad name; 6th upload of the day', async () => {
  const { e } = env()
  const status = async (fields: Record<string, string | Blob>, headers: Record<string, string> = {}) => (await handle(upload(fields, headers), e)).status
  expect(await status(ok, { origin: 'https://evil.test' })).toBe(403)
  expect(await status({ ...ok, e: 'guide:x' })).toBe(400)
  expect(await status({ ...ok, consent: '' })).toBe(400)
  expect(await status({ ...ok, name: 'xem casino.com' })).toBe(400)
  expect(await status({ ...ok, file: new File([new TextEncoder().encode('<html>')], 'a.jpg') })).toBe(415)
  const big = new Request(upload(ok), { headers: { origin: 'https://x.test', 'content-length': String(9 * 1024 * 1024) } })
  expect((await handle(big, e)).status).toBe(413)
  for (let i = 0; i < 5; i++) expect(await status(ok)).toBe(201)
  expect(await status(ok)).toBe(429)
})

test('without the buckets or secrets the API answers 503 and the section stays hidden', async () => {
  const { e } = env()
  const r = await handle(new Request('https://x.test/_p?e=species:x'), { ...e, UPLOADS: undefined } as Env)
  expect(r.status).toBe(503)
})

// A fish's gallery page and its own page list its readers' photos 60 at a time ("Xem thêm" asks for the older ones),
// and only its own: never a photo another page shows, nor one sent with a comment (`comment:<id>`).
test('a fish\'s photos list 60 at a time, newest first, then the older ones by `next`; never a comment\'s or another page\'s', async () => {
  const { e, db } = env()
  const FISH = 'species:paracheirodon-innesi'
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const at = (min: number) => new Date(Date.UTC(2026, 9, 1) + min * 60_000).toISOString()
  const add = (n: number, entity: string, time: string, status = 'approved') => db.prepare(
    `INSERT INTO photos (id, entity_ref, name, status, url, thumb, width, height, delete_hash, created_at) VALUES (?, ?, 'Lộc', ?, 'u', 't', 1200, 900, 'h', ?)`,
  ).bind(id(n), entity, status, time).run()
  // 64 of the fish's, one a minute; the 60th and 61st newest (photos 5 and 4) sent in the same millisecond, where the
  // first answer stops.
  for (let n = 1; n <= 64; n++) await add(n, FISH, at(n === 4 ? 5 : n))
  // Newer than all of them: a comment's photos, another fish's, a breed's, and the fish's own still waiting.
  await add(101, 'comment:c1', at(100))
  await add(102, 'comment:c2', at(101))
  await add(103, 'species:betta-splendens', at(102))
  await add(104, 'breed:betta-halfmoon', at(103))
  await add(105, FISH, at(104), 'pending')
  type Listed = { photos: { id: string }[]; next?: string }
  const list = async (q = '') => {
    const r = await handle(new Request(`https://x.test/_p?e=${FISH}${q}`), e)
    return { status: r.status, body: (await r.json()) as Listed }
  }
  const newest = Array.from({ length: 64 }, (_, i) => id(64 - i)) // ids order the two of one time: photo 5, then 4
  const first = await list()
  expect(first.body.photos.map(p => p.id)).toEqual(newest.slice(0, 60))
  expect(first.body.next).toBe(`${at(5)}~${id(5)}`)
  const rest = await list(`&before=${encodeURIComponent(first.body.next!)}`)
  expect(rest.body.photos.map(p => p.id)).toEqual(newest.slice(60))
  expect(rest.body).not.toHaveProperty('next')
  // Exactly 60 left: no `next`, so no "Xem thêm" that would find nothing.
  const sixty = await list(`&before=${encodeURIComponent(`${at(61)}~${id(61)}`)}`)
  expect(sixty.body.photos.map(p => p.id)).toEqual(newest.slice(4))
  expect(sixty.body).not.toHaveProperty('next')
  for (const bad of ['', 'x', at(5), `${at(5)}~`, `${at(5)}~${id(5)}' OR 1=1`]) expect((await list(`&before=${encodeURIComponent(bad)}`)).status, bad).toBe(400)
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const sent = async (e: Env, file = new File([JPEG], 'a.jpg')) => ((await (await handle(upload({ ...ok, file }), e)).json()) as { id: string }).id
const admin = (e: Env, path: string, init: RequestInit = {}) => handle(new Request(`https://x.test/_p/admin/${path}`, { ...init, headers: { authorization: 'Bearer tok' } }), e)
const queue = async (e: Env) => (await (await admin(e, 'queue')).json()) as { id: string; ownerOk: boolean }[]
const publish = async (e: Env, id: string) => {
  for (const kind of ['full', 'thumb']) await admin(e, `file/${id}?kind=${kind}`, { method: 'PUT', body: WEBP })
  return (await (await admin(e, 'decisions', { method: 'POST', body: JSON.stringify([{ id, action: 'approve', reason: 'ok', width: 1200, height: 800 }]) })).json()) as { applied: number }
}
const act = (e: Env, cookie: string, fields: Record<string, string>) =>
  handle(new Request('https://x.test/_ab/photos', { method: 'POST', body: new URLSearchParams(fields), headers: { cookie } }), e)

// The owner looks at a waiting photo before the moderation pass does: its upload, from the private bucket, to the owner
// signed in on the web and to nobody else (the dashboard token included), never stored, and only while it waits.
test('/_ab/anh/<id> serves a waiting photo\'s upload to the owner alone (the page\'s cookie or the app\'s session), and only while it waits', async () => {
  const { e, db } = env()
  const { owner, reader, app } = await signedIn(db)
  const id = await sent(e, new File([PNG], 'a.png'))
  const get = (headers: Record<string, string>, path = `/_ab/anh/${id}`, method = 'GET') => handle(new Request(`https://x.test${path}`, { method, headers }), e)

  const r = await get({ cookie: owner })
  expect(r.status).toBe(200)
  expect([r.headers.get('content-type'), r.headers.get('cache-control')]).toEqual(['image/png', 'private, no-store'])
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(PNG)
  // The owner's app shows it too (owner-api.ts): its session as a bearer.
  expect(new Uint8Array(await (await get({ authorization: `Bearer ${app}` })).arrayBuffer())).toEqual(PNG)
  // Nobody signed in, a reader, the dashboard token (alone and over the owner's cookie).
  for (const h of [{}, { cookie: reader }, { authorization: 'Bearer tok' }, { authorization: 'Bearer tok', cookie: owner }] as Record<string, string>[]) {
    expect((await get(h)).status, JSON.stringify(h)).toBe(404)
  }
  expect((await get({ cookie: owner }, `/_ab/anh/${id}`, 'POST')).status).toBe(404)
  expect((await get({ cookie: owner }, '/_ab/anh/x')).status).toBe(404)
  expect((await get({ cookie: owner }, `/_ab/anh/${crypto.randomUUID()}`)).status).toBe(404)

  // Published: no longer waiting, even with a stray upload left behind.
  expect(await publish(e, id)).toEqual({ applied: 1, ignored: 0 })
  await e.UPLOADS!.put(`pending/${id}`, PNG)
  expect((await get({ cookie: owner })).status).toBe(404)
  expect((await get({ authorization: `Bearer ${app}` })).status).toBe(404)
  // Removed: the same.
  const gone = await sent(e)
  expect((await act(e, owner, { id: gone })).status).toBe(303)
  expect((await get({ cookie: owner }, `/_ab/anh/${gone}`)).status).toBe(404)
})

test('Gỡ on a waiting photo deletes its upload at once and marks it removed', async () => {
  const { e, db, uploads } = env()
  const { owner, reader } = await signedIn(db)
  const id = await sent(e)
  expect(uploads.has(`pending/${id}`)).toBe(true)
  expect((await act(e, reader, { id })).status).toBe(404)
  expect(uploads.has(`pending/${id}`)).toBe(true)
  const r = await act(e, owner, { id, action: 'remove' })
  expect([r.status, r.headers.get('location')]).toEqual([303, '/_ab/anh-ban-doc/'])
  expect(uploads.has(`pending/${id}`)).toBe(false)
  expect(await db.prepare('SELECT status, reason FROM photos WHERE id = ?').bind(id).first()).toEqual({ status: 'removed', reason: 'removed by owner' })
  expect(await waitingPhotos(e as never)).toEqual([])
  expect(await queue(e)).toEqual([])
})

// The owner's approval is a flag the next moderation pass reads (the files are made on the Mac, as every published photo's
// are): the queue says so, the page shows it approved, and publishing it clears the flag, so a later report is judged.
test('Duyệt flags a waiting photo as the owner\'s (owner only, 30 days); the queue and the page show it; publishing clears it', async () => {
  const { e, db, kv, ttl } = env()
  const { owner, reader } = await signedIn(db)
  const [id, other] = [await sent(e), await sent(e)]
  expect((await act(e, reader, { id, action: 'approve' })).status).toBe(404)
  expect(kv.has(`photo-ok:${id}`)).toBe(false)

  const r = await act(e, owner, { id, action: 'approve' })
  expect([r.status, r.headers.get('location')]).toEqual([303, '/_ab/anh-ban-doc/'])
  expect(kv.has(`photo-ok:${id}`)).toBe(true)
  expect(ttl.get(`photo-ok:${id}`)).toBe(30 * 86_400)
  expect(await db.prepare('SELECT status FROM photos WHERE id = ?').bind(id).first()).toEqual({ status: 'pending' }) // still waits for its files
  expect(Object.fromEntries((await queue(e)).map(q => [q.id, q.ownerOk]))).toEqual({ [id]: true, [other]: false })
  expect(Object.fromEntries((await waitingPhotos(e as never))!.map(p => [p.id, p.ownerOk]))).toEqual({ [id]: true, [other]: false })

  // Published by the pass: the flag goes; a photo that no longer waits can't be flagged.
  await publish(e, id)
  expect(kv.has(`photo-ok:${id}`)).toBe(false)
  await act(e, owner, { id, action: 'approve' })
  expect(kv.has(`photo-ok:${id}`)).toBe(false)
  await act(e, owner, { id: other })
  await act(e, owner, { id: other, action: 'approve' })
  expect(kv.has(`photo-ok:${other}`)).toBe(false)
})

test('the page shows each waiting photo, tap to enlarge, with Duyệt and Gỡ; one the owner approved says so, without Duyệt', async () => {
  expect(photosPage([], [])).not.toContain('Chờ duyệt')
  const [a, b] = [crypto.randomUUID(), crypto.randomUUID()]
  const html = photosPage([], [
    { id: a, entity_ref: 'species:paracheirodon-innesi', name: '<b>x</b>', created_at: '2026-11-04T08:12:00Z', ownerOk: false },
    { id: b, entity_ref: 'species:betta-splendens', name: 'Lộc', created_at: '2026-11-04T07:00:00Z', ownerOk: true },
  ])
  expect(html).toContain('Chờ duyệt (2)')
  const row = (id: string) => html.split('<tr').find(r => r.includes(`value="${id}"`))!
  for (const id of [a, b]) {
    expect(row(id)).toContain(`<a href="/_ab/anh/${id}"`)
    expect(row(id)).toContain(`src="/_ab/anh/${id}"`)
    expect(row(id)).toMatch(/<button[^>]*name="action" value="remove"[^>]*>Gỡ<\/button>/)
  }
  expect(row(a)).toMatch(/<button[^>]*name="action" value="approve"[^>]*>Duyệt<\/button>/)
  expect(row(a)).toContain('species:paracheirodon-innesi')
  expect(row(a)).toContain('&lt;b&gt;x&lt;/b&gt;')
  expect(html).not.toContain('<b>x</b>')
  expect(row(a)).not.toContain('Đã duyệt')
  expect(row(b)).not.toContain('value="approve"')
  expect(row(b)).toMatch(/Đã duyệt<\/span> <span class="muted">đăng trong lượt duyệt tới/)
  // A published photo keeps its Gỡ, beside its public thumbnail, and nothing else.
  const c = crypto.randomUUID()
  const shown = photosPage([{ id: c, entity_ref: 'species:betta-splendens', name: '<i>y</i>', thumb: `https://media.aquatome.com/readers/${c}-480.webp`, created_at: '2026-11-04T02:40:00Z' }], [])
  const published = shown.split('<tr').find(r => r.includes(`value="${c}"`))!
  expect(published).toContain(`src="https://media.aquatome.com/readers/${c}-480.webp"`)
  expect(published).toMatch(/<button[^>]*name="action" value="remove"[^>]*>Gỡ<\/button>/)
  expect(published).not.toContain('value="approve"')
  expect(published).toContain('&lt;i&gt;y&lt;/i&gt;')
})

test('a photo moderation moved says, under the page it shows on, the page it was sent for; one that waits again too; the others say nothing', () => {
  const [a, b, c] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
  const html = photosPage([
    { id: a, entity_ref: 'species:carassius-auratus', moved_from: 'species:<x>', name: 'Lộc', thumb: `https://media.aquatome.com/readers/${a}-480.webp`, created_at: '2026-11-04T02:40:00Z' },
    { id: b, entity_ref: 'species:betta-splendens', moved_from: null, name: 'Lộc', thumb: `https://media.aquatome.com/readers/${b}-480.webp`, created_at: '2026-11-04T02:30:00Z' },
  ], [{ id: c, entity_ref: 'species:carassius-auratus', moved_from: 'species:paracheirodon-innesi', name: 'Lộc', created_at: '2026-11-04T03:00:00Z', ownerOk: false }])
  const row = (id: string) => html.split('<tr').find(r => r.includes(`value="${id}"`))!
  expect(row(a)).toContain('species:carassius-auratus<br><span class="muted">Kiểm duyệt chuyển từ species:&lt;x&gt;</span>')
  expect(html).not.toContain('species:<x>')
  expect(row(b)).not.toContain('chuyển từ')
  expect(row(c)).toContain('Kiểm duyệt chuyển từ species:paracheirodon-innesi')
})
