import { beforeEach, expect, test } from 'vitest'
import { createSession } from '../accounts/session'
import { handle, type Env } from '../index'
import { photosPage, photosSection } from '../admin/pages'
import { contract } from './contract'
import { testD1 } from './d1'

/**
 * A comment with one photo (worker/comments/photo.ts, docs/contracts/comment-photo.md): both stored or neither, the
 * photo under reader photos' checks and day, shown under its comment only once both are public, never in the readers'
 * photos of a page, removed with its comment, and deleted however a reader's photo is.
 */
const { misfits } = contract('talk.openapi.json')

let siteverifyCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).includes('turnstile')) return realFetch(input, init)
  siteverifyCalls++
  return Response.json({ success: true, hostname: 'x.test' })
}) as typeof fetch
beforeEach(() => { siteverifyCalls = 0 })

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0)), [1, 2, 3]))
const ORIGIN = 'https://x.test'
const PAGE = 'species:paracheirodon-innesi'

const fakeR2 = () => {
  const m = new Map<string, Uint8Array>()
  const bucket = {
    put: async (k: string, v: Uint8Array) => { m.set(k, new Uint8Array(v)) },
    get: async (k: string) => (m.has(k) ? { body: m.get(k), httpMetadata: { contentType: 'image/jpeg' }, arrayBuffer: async () => m.get(k)!.slice().buffer } : null),
    head: async (k: string) => (m.has(k) ? {} : null),
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, uploaded: new Date() })), truncated: false }),
  } as unknown as R2Bucket
  return { m, bucket }
}

type Fields = Record<string, string | Blob>
function setup() {
  const kv = new Map<string, string>()
  const uploads = fakeR2()
  const media = fakeR2()
  const db = testD1()
  const env = {
    ASSETS: { fetch: async () => new Response('x') },
    AB: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v) }, delete: async (k: string) => { kv.delete(k) } },
    DB: db, UPLOADS: uploads.bucket, MEDIA: media.bucket,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok',
    ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'a'.repeat(32),
  } as unknown as Env
  const multipart = (path: string, fields: Fields, headers: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    const r = new Request(`${ORIGIN}${path}`, { method: 'POST', body: f, headers })
    return handle(new Request(r, { headers: { ...Object.fromEntries(r.headers), 'content-length': '2000' } }), env)
  }
  /** The page's way by default (Origin and a Turnstile token); `bearer`: the app's. */
  const who = (bearer?: string): Record<string, string> => ({ 'cf-connecting-ip': '203.0.113.9', ...(bearer ? { authorization: `Bearer ${bearer}` } : { origin: ORIGIN }) })
  const send = (over: Fields = {}, bearer?: string) =>
    multipart('/_c', { e: PAGE, name: 'Lộc', body: 'Vây cá bị rách, có sao không?', consent: '1', ...(bearer ? {} : { token: 't' }), file: new File([JPEG], 'a.jpg'), ...over }, who(bearer))
  const readerPhoto = () => multipart('/_p', { e: PAGE, name: 'Lộc', consent: '1', token: 't', file: new File([JPEG], 'a.jpg') }, who())
  const list = async (e = PAGE) => (await (await handle(new Request(`${ORIGIN}/_c?e=${e}`), env)).json()) as { comments: { id: string; body: string; photo?: unknown }[] }
  const readerPhotos = async (e = PAGE) => ((await (await handle(new Request(`${ORIGIN}/_p?e=${e}`), env)).json()) as { photos: { id: string }[] }).photos
  const admin = (path: string, init: RequestInit) => handle(new Request(`${ORIGIN}${path}`, { ...init, headers: { authorization: 'Bearer tok' } }), env)
  /** The nightly pass publishing a photo: its files first, then the decision. */
  const publish = async (id: string, extra: object = {}) => {
    for (const kind of ['full', 'thumb']) expect((await admin(`/_p/admin/file/${id}?kind=${kind}`, { method: 'PUT', body: WEBP })).status).toBe(200)
    return ((await (await admin('/_p/admin/decisions', { method: 'POST', body: JSON.stringify([{ id, action: 'approve', reason: 'ok', width: 1200, height: 800, ...extra }]) })).json()) as { applied: number }).applied
  }
  const rows = async (table: 'comments' | 'photos') =>
    (await db.prepare(`SELECT * FROM ${table} ORDER BY created_at, rowid`).all<Record<string, string | null>>()).results
  const signIn = async () => {
    const id = crypto.randomUUID()
    await db.prepare(`INSERT INTO users (id, created_at) VALUES (?, ?)`).bind(id, new Date().toISOString()).run()
    return { id, token: await createSession(db, id, 'app', new Date()) }
  }
  return { env, db, kv, uploads: uploads.m, media: media.m, send, readerPhoto, list, readerPhotos, admin, publish, rows, signIn }
}
type Posted = { status: string; comment?: { id: string }; photo: { status: string; id: string; deleteUrl: string } }

test('a comment with a photo: the comment as any comment, its photo waiting; shown under the comment once published, never in the page\'s readers\' photos', async () => {
  const t = setup()
  const r = await t.send()
  expect(r.status).toBe(201)
  const out = (await r.json()) as Posted
  expect(out).toMatchObject({ status: 'approved', comment: { name: 'Lộc', body: 'Vây cá bị rách, có sao không?' }, photo: { status: 'pending', id: expect.any(String), deleteUrl: expect.stringMatching(/^\/_p\/xoa\/\?id=[0-9a-f-]{36}&t=/) } })
  expect(out.comment).not.toHaveProperty('photo')
  expect(misfits(out, { $ref: '#/components/schemas/Posted' })).toEqual([])
  expect(siteverifyCalls).toBe(1)
  const [c] = await t.rows('comments')
  expect(await t.rows('photos')).toMatchObject([{ id: out.photo.id, entity_ref: `comment:${c!.id}`, name: 'Lộc', status: 'pending', account_id: null }])
  expect([...t.uploads.keys()]).toEqual([`pending/${out.photo.id}`])

  // Waiting: the comment shows, its photo doesn't.
  expect((await t.list()).comments).toEqual([expect.not.objectContaining({ photo: expect.anything() })])
  expect(await t.publish(out.photo.id)).toBe(1)
  const listed = await t.list()
  expect(listed.comments).toMatchObject([{ id: c!.id, photo: { id: out.photo.id, url: `https://media.aquatome.com/readers/${out.photo.id}.webp`, thumb: `https://media.aquatome.com/readers/${out.photo.id}-480.webp`, width: 1200, height: 800 } }])
  expect(misfits(listed, { $ref: '#/components/schemas/Comments' })).toEqual([])
  // Its comment's alone: not the page's readers' photos, nor any other page's comments.
  expect(await t.readerPhotos()).toEqual([])
  expect((await t.list('id:species:paracheirodon-innesi')).comments).toEqual([])
  // A comment held (a reader's report, say) takes its photo off the page with it.
  await t.db.prepare(`UPDATE comments SET status = 'held'`).run()
  expect((await t.list()).comments).toEqual([])
})

test('a comment without a photo is the JSON post as before, listed with no photo', async () => {
  const t = setup()
  const r = await handle(new Request(`${ORIGIN}/_c`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' }, body: JSON.stringify({ e: PAGE, name: 'Lộc', body: 'Không kèm ảnh', token: 't' }) }), t.env)
  expect(r.status).toBe(201)
  expect(await r.json()).not.toHaveProperty('photo')
  expect(await t.rows('photos')).toEqual([])
  expect((await t.list()).comments).toEqual([expect.not.objectContaining({ photo: expect.anything() })])
})

test('a photo refused (not an image, too large, no consent, no file) or a comment refused: nothing stored, nothing counted', async () => {
  const t = setup()
  const cases: [Fields, number, string][] = [
    [{ file: new File([new TextEncoder().encode('<svg></svg>')], 'a.jpg') }, 415, 'not an image'],
    [{ file: new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'a.jpg') }, 413, 'too large'],
    [{ consent: '' }, 400, 'consent'],
    [{ file: new File([], 'a.jpg') }, 400, 'no file'],
    [{ body: 'x' }, 400, 'comment must be 2–2000 characters'],
    [{ e: 'user:x' }, 400, 'bad entity'],
  ]
  for (const [over, status, error] of cases) {
    const r = await t.send(over)
    expect([r.status, await r.json()], error).toEqual([status, { error }])
  }
  expect(await t.rows('comments')).toEqual([])
  expect(await t.rows('photos')).toEqual([])
  expect(t.uploads.size).toBe(0)
  expect(t.kv.size).toBe(0)
  expect(siteverifyCalls).toBe(0)
})

test('the photo counts against reader photos\' day: past it, refused (429) with the comment not posted or counted', async () => {
  const t = setup()
  for (let i = 0; i < 3; i++) expect((await t.readerPhoto()).status).toBe(201)
  for (let i = 0; i < 2; i++) expect((await t.send({ body: `ảnh số ${i}` })).status).toBe(201)
  const counts = new Map(t.kv)
  const r = await t.send({ body: 'ảnh thứ sáu' })
  expect([r.status, await r.json()]).toEqual([429, { error: 'rate' }])
  expect((await t.rows('comments')).map(c => c.body)).toEqual(['ảnh số 0', 'ảnh số 1'])
  expect((await t.rows('photos')).length).toBe(5)
  expect(t.kv).toEqual(counts)
})

test('a failed upload or a failed write leaves no comment, and no file behind', async () => {
  const t = setup()
  const put = t.env.UPLOADS!.put
  t.env.UPLOADS!.put = async () => { throw new Error('R2 down') }
  await expect(t.send()).rejects.toThrow('R2 down') // the runtime's 500
  t.env.UPLOADS!.put = put
  const batch = t.env.DB!.batch
  t.env.DB!.batch = async () => { throw new Error('D1 down') }
  await expect(t.send()).rejects.toThrow('D1 down')
  t.env.DB!.batch = batch
  expect(await t.rows('comments')).toEqual([])
  expect(await t.rows('photos')).toEqual([])
  expect(t.uploads.size).toBe(0)
})

test('a comment removed by moderation takes its photo and files with it; a photo removed leaves the comment\'s text', async () => {
  const t = setup()
  const a = (await (await t.send({ body: 'bình luận sẽ bị gỡ' })).json()) as Posted
  const b = (await (await t.send({ body: 'ảnh sẽ bị gỡ' })).json()) as Posted
  await t.publish(a.photo.id)
  const decide = (path: string, items: object[]) => t.admin(path, { method: 'POST', body: JSON.stringify(items) })
  expect(await (await decide('/_c/admin/decisions', [{ id: a.comment!.id, action: 'remove', helpful: false, reason: 'spam' }])).json()).toEqual({ applied: 1, ignored: 0 })
  expect((await t.rows('photos')).map(p => [p.id, p.status, p.url])).toEqual([[a.photo.id, 'removed', null], [b.photo.id, 'pending', null]])
  expect([...t.media.keys()]).toEqual([])
  expect([...t.uploads.keys()]).toEqual([`pending/${b.photo.id}`])

  expect(await (await decide('/_p/admin/decisions', [{ id: b.photo.id, action: 'remove', reason: 'a face', why: 'face' }])).json()).toEqual({ applied: 1, ignored: 0 })
  expect((await t.list()).comments).toEqual([expect.objectContaining({ body: 'ảnh sẽ bị gỡ' })])
  expect((await t.list()).comments[0]).not.toHaveProperty('photo')
  expect(t.uploads.size).toBe(0)
})

test('moderation never moves a comment\'s photo to a fish\'s page', async () => {
  const t = setup()
  const a = (await (await t.send()).json()) as Posted
  expect(await t.publish(a.photo.id, { entity: 'species:carassius-auratus' })).toBe(0)
  expect((await t.rows('photos')).map(p => [p.entity_ref, p.status])).toEqual([[`comment:${a.comment!.id}`, 'pending']])
  expect(await t.readerPhotos('species:carassius-auratus')).toEqual([])
})

test('deleted as a reader\'s photo is: its private link, the app\'s own list, and the account', async () => {
  const t = setup()
  // The page's way: the private link takes the photo back; the comment stays.
  const web = (await (await t.send({ body: 'từ trang web' })).json()) as Posted
  await t.publish(web.photo.id)
  const link = new URL(web.photo.deleteUrl, ORIGIN)
  const del = new FormData()
  del.set('id', link.searchParams.get('id')!)
  del.set('t', link.searchParams.get('t')!)
  expect((await handle(new Request(`${ORIGIN}/_p/xoa/`, { method: 'POST', body: del }), t.env)).status).toBe(200)
  expect((await t.list()).comments).toEqual([expect.not.objectContaining({ photo: expect.anything() })])
  expect(t.media.size).toBe(0)

  // The app's: listed among the reader's own photos by its comment's key, taken back there, deleted with the account.
  const a = await t.signIn()
  const app = (await (await t.send({ body: 'từ ứng dụng' }, a.token)).json()) as Posted
  const kept = (await (await t.send({ body: 'từ ứng dụng, còn ảnh' }, a.token)).json()) as Posted
  expect(siteverifyCalls).toBe(1)
  const mine = async () => (await (await handle(new Request(`${ORIGIN}/api/v1/talk/photos/mine`, { headers: { authorization: `Bearer ${a.token}` } }), t.env)).json()) as { photos: { id: string; e: string }[] }
  const listed = await mine()
  expect(listed.photos.map(p => [p.id, p.e]).sort()).toEqual([[app.photo.id, `comment:${app.comment!.id}`], [kept.photo.id, `comment:${kept.comment!.id}`]].sort())
  expect(misfits(listed, { $ref: '#/components/schemas/MyPhotos' })).toEqual([])
  expect((await handle(new Request(`${ORIGIN}/api/v1/talk/photos/mine/${app.photo.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } }), t.env)).status).toBe(204)
  expect(t.uploads.has(`pending/${app.photo.id}`)).toBe(false)
  await t.publish(kept.photo.id)
  expect((await handle(new Request(`${ORIGIN}/api/v1/account`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } }), t.env)).status).toBe(204)
  expect((await t.rows('comments')).map(c => c.body)).toEqual(['từ trang web'])
  expect((await t.rows('photos')).map(p => p.id)).toEqual([web.photo.id])
  expect(t.media.size).toBe(0)
  expect(t.uploads.size).toBe(0)
})

test('the dashboard lists a comment\'s photo with reader photos, marked so, linking its comment\'s page', async () => {
  const t = setup()
  const a = (await (await t.send()).json()) as Posted
  const w = (await (await t.send({ body: 'ảnh đang chờ' })).json()) as Posted
  await t.publish(a.photo.id)
  const stats = { v: 1, pages: { fish: [['/ca/ca-neon-xanh/', 'Cá neon xanh', 'paracheirodon-innesi']] } }
  t.env.ASSETS = { fetch: async (r: Request) => (new URL(r.url).pathname === '/_ab/content.json' ? Response.json(stats) : new Response('x')) } as unknown as Fetcher
  const owner = await t.signIn()
  ;(t.env as unknown as { OWNER_ACCOUNTS: string }).OWNER_ACCOUNTS = owner.id
  const page = await (await handle(new Request(`${ORIGIN}/_ab/anh-ban-doc/`, { headers: { cookie: `__Host-aq_session=${await createSession(t.db, owner.id, 'web', new Date())}` } }), t.env)).text()
  expect(page.match(/From a comment<\/span> <a href="\/ca\/ca-neon-xanh\/">\/ca\/ca-neon-xanh\/<\/a>/g)).toHaveLength(2)
  expect(page).not.toContain('comment:')
  expect(page).toContain(`/_ab/anh/${w.photo.id}`)
})

test('the dashboard\'s rows: a comment\'s photo by its page, or its key without a build that has it; the app\'s section says the same', () => {
  const at = '2026-11-05T03:00:00Z'
  const shown = [
    { id: 'p', entity_ref: 'comment:c1', name: 'Lộc', thumb: 'https://media.aquatome.com/readers/p-480.webp', created_at: at, comment: { page: 'species:x', path: '/ca/x/' } },
    { id: 'q', entity_ref: 'comment:c2', name: 'Lan', thumb: 'https://media.aquatome.com/readers/q-480.webp', created_at: at, comment: { page: 'id:guide:y' } },
    { id: 'r', entity_ref: 'species:x', name: 'Tú', thumb: 'https://media.aquatome.com/readers/r-480.webp', created_at: at },
  ]
  const html = photosPage(shown, [], new Date(at))
  expect(html).toContain('From a comment</span> <a href="/ca/x/">/ca/x/</a>')
  expect(html).toContain('From a comment</span> id:guide:y')
  expect(html).toContain('<strong>Tú</strong><br>species:x')
  const blocks = photosSection(shown, [], new Date(at)).blocks
  const items = (blocks.find(b => b.kind === 'photos') as { items: { id: string; meta: string[] }[] }).items
  expect(items.map(i => i.meta.slice(0, -1))).toEqual([['From a comment', '/ca/x/'], ['From a comment', 'id:guide:y'], ['species:x']])
})
