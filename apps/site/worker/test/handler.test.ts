import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { prefersMarkdown } from '../markdown'
import { gonePage } from '../hidden'
import { testD1 } from './d1'

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
  expect((await handle(post({ cookie: 'skin=b; aq_owner=1' }), e, stringRewrite)).status).toBe(204) // the owner's own visit: not recorded
  expect(points).toHaveLength(1)
})

test('dashboard: sign-in form without token, 303 strips token from URL', async () => {
  const { e } = env()
  const login = await handle(get('/_ab/'), e, stringRewrite)
  expect(login.status).toBe(200)
  expect(await login.text()).toContain('action="/_ab/login"')
  const form = (token: string) => new Request('https://x.test/_ab/login', { method: 'POST', body: new URLSearchParams({ token }) })
  expect((await handle(form('wrong'), e, stringRewrite)).status).toBe(403)
  const ok = await handle(form('tok'), e, stringRewrite)
  expect(ok.status).toBe(303)
  expect(ok.headers.getSetCookie()).toEqual([expect.stringMatching(/^ab_token=tok; Path=\/_ab;.*HttpOnly/), expect.stringMatching(/^aq_owner=1;/)])
  const r = await handle(get('/_ab/?token=tok'), e, stringRewrite)
  expect(r.status).toBe(303)
  expect(r.headers.get('location')).toBe('/_ab/')
  expect((await handle(get('/_ab/doc-gia/'), e, stringRewrite)).status).toBe(303) // the readers page needs the token cookie too
})

test('events are accepted (and dropped) when Analytics Engine is not bound yet', async () => {
  const { e } = env({ EVENTS: undefined })
  const r = await handle(new Request('https://x.test/_e', { method: 'POST', body: JSON.stringify({ s: 'mix', p: '/vi/', t: 'view', v: 1, sid: 'abc123def456' }), headers: { ...browser, origin: 'https://x.test' } }), e, stringRewrite)
  expect(r.status).toBe(204)
})

test('/go/ redirects to search without D1, with D1 counts the click, 404s on junk', async () => {
  const { e } = env()
  const r = await handle(get('/go/shopee/?k=c%C3%A1%20neon&c=thuc-an&e=species:x'), e, stringRewrite)
  expect(r.status).toBe(302)
  expect(r.headers.get('location')).toBe('https://shopee.vn/search?keyword=c%C3%A1%20neon')
  expect((await handle(get('/go/shopee/?u=https://evil.test'), e, stringRewrite)).status).toBe(404)
  const db = testD1()
  const waits: Promise<unknown>[] = []
  await handle(get('/go/lazada/?k=loc&c=loc&e=guide:x'), { ...e, DB: db }, stringRewrite, p => { waits.push(p) })
  await Promise.all(waits)
  expect(await db.prepare('SELECT network, n FROM clicks_daily').first()).toEqual({ network: 'lazada', n: 1 })
})

test('/go/ wraps the search link without D1, falls back when D1 breaks, never counts bots or HEAD', async () => {
  const tpl = { AFF_TEMPLATE_SHOPEE: 'https://go.isclix.com/deep_link/1?url={url}' }
  const { e } = env(tpl as Partial<Env>)
  const loc = async (env: Env, req = get('/go/shopee/?k=neon')) => (await handle(req, env, stringRewrite)).headers.get('location')
  const wrapped = `https://go.isclix.com/deep_link/1?url=${encodeURIComponent('https://shopee.vn/search?keyword=neon')}`
  expect(await loc(e)).toBe(wrapped)
  const broken = { prepare: () => { throw new Error('D1 down') } } as unknown as D1Database
  expect(await loc({ ...e, DB: broken })).toBe(wrapped)
  const db = testD1()
  const waits: Promise<unknown>[] = []
  const hit = (req: Request) => handle(req, { ...e, DB: db }, stringRewrite, p => { waits.push(p) })
  await hit(get('/go/shopee/?k=neon', { 'user-agent': 'Googlebot/2.1' }))
  await hit(new Request('https://x.test/go/shopee/?k=neon', { method: 'HEAD', headers: browser }))
  await Promise.all(waits)
  expect(await db.prepare('SELECT COUNT(*) AS n FROM clicks_daily').first()).toEqual({ n: 0 })
})

test('/_aff/products needs the bearer token', async () => {
  const { e } = env()
  const post = (auth?: string) => new Request('https://x.test/_aff/products', { method: 'POST', body: '[]', headers: auth ? { authorization: auth } : {} })
  expect((await handle(post(), { ...e, DB: testD1() }, stringRewrite)).status).toBe(404)
  expect((await handle(post('Bearer wrong'), { ...e, DB: testD1() }, stringRewrite)).status).toBe(404)
  expect(await (await handle(post('Bearer tok'), { ...e, DB: testD1() }, stringRewrite)).json()).toEqual({ saved: 0, errors: [] })
})

test('non-canonical hosts 301 to the production host, path and query kept', async () => {
  const { e } = env({ CANONICAL_HOST: 'aquatome.com' } as Partial<Env>)
  const r = await handle(new Request('https://www.aquatome.com/vi/ca/?skin=a', { headers: browser }), e, stringRewrite)
  expect(r.status).toBe(301)
  expect(r.headers.get('location')).toBe('https://aquatome.com/vi/ca/?skin=a')
  expect((await handle(new Request('https://thuysinh.infinitus.run/', { headers: browser }), e, stringRewrite)).headers.get('location')).toBe('https://aquatome.com/')
  expect((await handle(new Request('https://aquatome.com/vi/', { headers: browser }), e, stringRewrite)).status).toBe(200)
})

test('the root 301s to /vi/', async () => {
  const r = await handle(new Request('https://aquatome.com/?utm_source=x', { headers: browser }), env().e, stringRewrite)
  expect(r.status).toBe(301)
  expect(r.headers.get('location')).toBe('/vi/?utm_source=x')
})

test('Accept negotiation: text/markdown only when asked for and not outranked by HTML', () => {
  expect(prefersMarkdown('text/markdown')).toBe(true)
  expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true)
  expect(prefersMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe(false)
  expect(prefersMarkdown('*/*')).toBe(false)
  expect(prefersMarkdown(null)).toBe(false)
  expect(prefersMarkdown('text/markdown;q=0.5, text/html')).toBe(false)
  expect(prefersMarkdown('text/markdown;q=0')).toBe(false)
})

test('markdown: same URL, Accept: text/markdown → index.md, no skin cookie; root answers with /vi/; HTML varies on Accept', async () => {
  const MD = '---\ntitle: "t"\n---\n\n# Cá\n'
  const { e, seen } = env({ ASSETS: { fetch: async (r: Request) => { seen.push(r); return new URL(r.url).pathname.endsWith('.md') ? new Response(MD, { headers: { 'content-type': 'text/markdown' } }) : new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } } as unknown as Fetcher })
  const r = await handle(get('/vi/ca/', { ...browser, accept: 'text/markdown' }), e, stringRewrite)
  expect(await r.text()).toBe(MD)
  expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  expect(r.headers.get('vary')).toBe('Accept')
  expect(r.headers.get('x-markdown-tokens')).toBe(String(Math.ceil(MD.length / 4)))
  expect(r.headers.get('set-cookie')).toBeNull()
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/vi/ca/index.md')
  await handle(get('/', { accept: 'text/markdown' }), e, stringRewrite)
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/vi/index.md')
  const html = await handle(get('/vi/ca/', browser), e, stringRewrite)
  expect(html.headers.get('content-type')).toContain('text/html')
  expect(html.headers.get('vary')).toBe('Cookie, Accept')
})

test('markdown: a page without index.md falls back to HTML', async () => {
  const { e } = env({ ASSETS: { fetch: async (r: Request) => new URL(r.url).pathname.endsWith('.md') ? new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) : new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } as unknown as Fetcher })
  const r = await handle(get('/vi/x/', { accept: 'text/markdown' }), e, stringRewrite)
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(PAGE)
})

test('agent discovery: API catalog as linkset+json; homepage redirect and /vi/ carry the Link header', async () => {
  const { e } = env()
  const cat = await handle(get('/.well-known/api-catalog'), e, stringRewrite)
  expect(cat.headers.get('content-type')).toBe('application/linkset+json')
  const body = await cat.json() as { linkset: { anchor: string; 'service-desc': { href: string }[] }[] }
  expect(body.linkset[0]).toMatchObject({ anchor: 'https://x.test/', 'service-desc': [{ href: 'https://x.test/openapi.json' }] })
  const root = await handle(get('/'), e, stringRewrite)
  expect(root.status).toBe(301)
  expect(root.headers.get('link')).toContain('</.well-known/api-catalog>; rel="api-catalog"')
  expect((await handle(get('/vi/'), e, stringRewrite)).headers.get('link')).toContain('rel="api-catalog"')
  expect((await handle(get('/vi/ca/'), e, stringRewrite)).headers.get('link')).toBeNull()
})

test('hide a page from the dashboard: 410 for HTML, markdown and index.*; unhide brings it back', async () => {
  const store = new Map<string, string>()
  const AB = { get: async (k: string, o?: { type?: string } | string) => { const v = store.get(k); return v === undefined ? (k === 'hidden' ? null : { mix: 0, a: 0, b: 1, c: 0 }) : (o === 'json' || (typeof o === 'object' && o?.type === 'json')) ? JSON.parse(v) : v }, put: async (k: string, v: string) => { store.set(k, v) } }
  const { e } = env({ AB: AB as unknown as KVNamespace })
  const form = (fields: Record<string, string>, cookie = 'ab_token=tok') =>
    new Request('https://x.test/_ab/hidden', { method: 'POST', body: new URLSearchParams(fields), headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })

  expect((await handle(form({ url: '/vi/ca/x/', action: 'hide' }, ''), e)).status).toBe(404) // no cookie
  expect((await handle(form({ url: 'https://x.test/go/shopee/', action: 'hide' }), e)).status).toBe(400)
  expect((await handle(form({ url: 'https://x.test/vi/', action: 'hide' }), e)).status).toBe(400)
  const ok = await handle(form({ url: 'https://aquatome.com/vi/ca/x/', note: 'sai ảnh', action: 'hide' }), e)
  expect(ok.status).toBe(303)
  expect(JSON.parse(store.get('hidden')!)['/vi/ca/x/']).toMatchObject({ note: 'sai ảnh' })

  for (const [path, headers] of [['/vi/ca/x/', browser], ['/vi/ca/x/', { accept: 'text/markdown' }], ['/vi/ca/x/index.md', browser], ['/vi/ca/x', browser]] as const) {
    const r = await handle(get(path, headers), e, stringRewrite)
    expect(r.status, path).toBe(410)
    expect(r.headers.get('x-robots-tag')).toContain('noindex')
  }
  expect((await handle(get('/vi/ca/y/'), e, stringRewrite)).status).toBe(200)

  const list = await handle(new Request('https://x.test/_ab/hidden.json', { headers: { authorization: 'Bearer tok' } }), e)
  expect(Object.keys(await list.json() as object)).toEqual(['/vi/ca/x/'])
  expect((await handle(new Request('https://x.test/_ab/hidden.json'), e)).status).toBe(404)

  await handle(form({ url: '/vi/ca/x/', action: 'unhide' }), e)
  expect((await handle(get('/vi/ca/x/'), e, stringRewrite)).status).toBe(200)
})

test('owner: opening /_ab/ sets the owner flag cookie; the taken-down page offers "bring back"', async () => {
  const { e } = env({ AB: { get: async () => null, put: async () => {} } as unknown as KVNamespace })
  const login = await handle(new Request('https://x.test/_ab/?token=tok'), e)
  expect(login.headers.getSetCookie()).toEqual([expect.stringMatching(/^ab_token=tok; Path=\/_ab;/), expect.stringMatching(/^aq_owner=1; Path=\/;.*SameSite=Strict/)])
  const dash = await handle(new Request('https://x.test/_ab/', { headers: { cookie: 'ab_token=tok' } }), e)
  expect(dash.headers.get('set-cookie')).toMatch(/^aq_owner=1;/)
  const gone = await gonePage().text()
  expect(gone).toContain('data-gone="1"')
  expect(gone).toContain('Hiện lại trang này')
})

test('a renamed page\'s old address 301s to the new one with ?tu=<old slug>; unknown paths stay 404', async () => {
  const table = { '/vi/ca/ca-betta-green-alien/': '/vi/ca/ca-betta/?tu=ca-betta-green-alien' }
  const { e } = env({ ASSETS: { fetch: async (r: Request) => new URL(r.url).pathname === '/redirects.json' ? Response.json(table) : new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher })
  const r = await handle(new Request('https://aquatome.com/vi/ca/ca-betta-green-alien/'), e)
  expect(r.status).toBe(301)
  expect(r.headers.get('location')).toBe('/vi/ca/ca-betta/?tu=ca-betta-green-alien')
  expect((await handle(new Request('https://aquatome.com/vi/ca/khong-co/'), e)).status).toBe(404)
})
