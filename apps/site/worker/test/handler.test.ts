import { expect, test } from 'vitest'
import { handle, type Env } from '../index'

const PAGE = '<!doctype html><html lang="vi"><head><title>t</title></head><body><p>x</p></body></html>'
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const browser = { 'user-agent': CHROME, 'accept-language': 'vi' }
const stringRewrite = (res: Response, skin: string) => res.text().then(t => new Response(t.replace('<html lang="vi">', `<html lang="vi" data-skin="${skin}">`), res))

function env(over: Partial<Env> = {}) {
  const points: unknown[] = []
  const seen: Request[] = []
  const e = {
    ASSETS: { fetch: async (r: Request) => { seen.push(r); return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"' } }) } },
    AB: { get: async () => ({ mix: 0, a: 0, b: 1, c: 0 }), put: async () => {} },
    EVENTS: { writeDataPoint: (p: unknown) => { points.push(p) } },
    STAGING: '1', AB_DASH_TOKEN: 'tok', ...over,
  } as unknown as Env
  return { e, points, seen }
}
const get = (path: string, headers: Record<string, string> = browser) => new Request(`https://x.test${path}`, { headers })

test('bots get the untouched page: no skin, no cookie; staging header everywhere', async () => {
  const { e } = env()
  const r = await handle(get('/vi/', { 'user-agent': 'Googlebot/2.1', 'accept-language': 'en' }), e, stringRewrite)
  expect(await r.text()).toBe(PAGE)
  expect(r.headers.get('set-cookie')).toBeNull()
  expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
})

test('a new visitor gets a skin: only data-skin differs, private + Vary: Cookie, no validators', async () => {
  const { e, seen } = env()
  const r = await handle(get('/vi/', { ...browser, 'if-none-match': '"abc"' }), e, stringRewrite)
  const html = await r.text()
  expect(html.replace(' data-skin="b"', '')).toBe(PAGE)
  expect(html).toContain('data-skin="b"')
  expect(r.headers.get('set-cookie')).toMatch(/^skin=b;/)
  expect(r.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
  expect(r.headers.get('vary')).toContain('Cookie')
  expect(r.headers.get('etag')).toBeNull()
  expect(seen[0]?.headers.get('if-none-match')).toBeNull() // never revalidate a skinned page against the shared ETag
})

test('events: same-origin, matching skin cookie, not a bot, small body', async () => {
  const body = JSON.stringify({ s: 'b', p: '/vi/', t: 'view', v: 1, sid: 'abc123def456' })
  const post = (headers: Record<string, string>, b = body) => new Request('https://x.test/_e', { method: 'POST', body: b, headers: { ...browser, origin: 'https://x.test', cookie: 'skin=b', ...headers } })
  const { e, points } = env()
  expect((await handle(post({}), e, stringRewrite)).status).toBe(204)
  expect((await handle(post({ origin: 'https://evil.test' }), e, stringRewrite)).status).toBe(403)
  expect((await handle(post({ cookie: 'skin=c' }), e, stringRewrite)).status).toBe(400)
  expect((await handle(post({ 'user-agent': 'Googlebot' }), e, stringRewrite)).status).toBe(204) // accepted silently, not recorded
  expect((await handle(post({ 'content-length': '9000' }), e, stringRewrite)).status).toBe(413)
  expect(points).toHaveLength(1)
})

test('dashboard: 404 without token, 303 strips token from URL', async () => {
  const { e } = env()
  expect((await handle(get('/_ab/'), e, stringRewrite)).status).toBe(404)
  const r = await handle(get('/_ab/?token=tok'), e, stringRewrite)
  expect(r.status).toBe(303)
  expect(r.headers.get('location')).toBe('/_ab/')
})
