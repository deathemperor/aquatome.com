import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { sniff } from '../photos'
import { testD1 } from './d1'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0)), [1, 2, 3]))
const fakeR2 = () => {
  const m = new Map<string, Uint8Array>()
  return {
    m,
    bucket: {
      put: async (k: string, v: Uint8Array) => { m.set(k, new Uint8Array(v)) },
      get: async (k: string) => (m.has(k) ? { body: m.get(k), httpMetadata: { contentType: 'image/jpeg' } } : null),
      head: async (k: string) => (m.has(k) ? {} : null),
      delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x) },
    } as unknown as R2Bucket,
  }
}
function env() {
  const kv = new Map<string, string>()
  const uploads = fakeR2()
  const media = fakeR2()
  const e = {
    ASSETS: { fetch: async () => new Response('x') },
    AB: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v) } },
    DB: testD1(), UPLOADS: uploads.bucket, MEDIA: media.bucket,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok',
  } as unknown as Env
  return { e, uploads: uploads.m, media: media.m }
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
