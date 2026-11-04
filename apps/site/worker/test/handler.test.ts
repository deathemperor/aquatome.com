import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { prefersMarkdown } from '../markdown'
import { gonePage } from '../hidden'
import { testD1 } from './d1'

const PAGE = '<!doctype html><html lang="vi"><head><title>t</title></head><body><p>x</p></body></html>'
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const browser = { 'user-agent': CHROME, 'accept-language': 'vi' }

function env(over: Partial<Env> = {}) {
  const points: unknown[] = []
  const seen: Request[] = []
  const e = {
    ASSETS: { fetch: async (r: Request) => { seen.push(r); return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"' } }) } },
    AB: { get: async () => null, put: async () => {} },
    EVENTS: { writeDataPoint: (p: unknown) => { points.push(p) } },
    STAGING: '1', AB_DASH_TOKEN: 'tok', ...over,
  } as unknown as Env
  return { e, points, seen }
}
const get = (path: string, headers: Record<string, string> = browser) => new Request(`https://x.test${path}`, { headers })
/** The built sign-in page (src/pages/dang-nhap/), served by ASSETS like the deploy's; any other path is PAGE. */
const SIGN_IN = readFileSync(new URL('../../dist/dang-nhap/index.html', import.meta.url).pathname, 'utf8')
const assets = { fetch: async (r: Request) => new Response(new URL(r.url).pathname === '/dang-nhap/' ? SIGN_IN : PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } as unknown as Fetcher
/** The sign-in page as the dashboard answers for `path`: sent back there once signed in, and whether it says the account isn't the owner's. */
const signInFor = (html: string) => ({ next: /<section id="tai-khoan" data-next="([^"]*)"/.exec(html)?.[1], notOwner: html.includes('<p id="acc-not-owner" class=') })

/** A test D1 with the owner's account and a reader's, each signed in on the web, and the owner's app session too. */
async function signedIn(db = testD1()) {
  const { createSession } = await import('../accounts/session')
  for (const id of ['owner-1', 'reader-1']) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, '2026-11-01T00:00:00Z').run()
  const now = new Date()
  const cookie = async (id: string) => `__Host-aq_session=${await createSession(db, id, 'web', now)}`
  return { db, owner: await cookie('owner-1'), reader: await cookie('reader-1'), app: await createSession(db, 'owner-1', 'app', now) }
}

test('bots get the untouched page, no cookie; staging header everywhere', async () => {
  const { e } = env()
  const r = await handle(get('/', { 'user-agent': 'Googlebot/2.1', 'accept-language': 'en' }), e)
  expect(await r.text()).toBe(PAGE)
  expect(r.headers.get('set-cookie')).toBeNull()
  expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
})

test('visitors get the page as built: no skin, no cookie, private, no validators; an old A/B cookie is cleared', async () => {
  const { e, seen } = env()
  const r = await handle(get('/ca/', { ...browser, 'if-none-match': '"abc"' }), e)
  expect(await r.text()).toBe(PAGE)
  expect(r.headers.get('set-cookie')).toBeNull()
  expect((await handle(get('/ca/', { ...browser, cookie: 'x=1; skin=c' }), e)).headers.get('set-cookie')).toBe('skin=; Path=/; Max-Age=0; SameSite=Lax; Secure')
  expect(r.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
  expect(r.headers.get('vary')).toBe('Accept')
  expect(r.headers.get('etag')).toBeNull()
  expect(seen[0]?.headers.get('if-none-match')).toBeNull() // never revalidate against the shared ETag
})

test('events: same-origin, not a bot, not the owner, small body', async () => {
  const body = JSON.stringify({ p: '/vi/', t: 'view', v: 1, sid: 'abc123def456' })
  const post = (headers: Record<string, string>, b = body) => new Request('https://x.test/_e', { method: 'POST', body: b, headers: { ...browser, origin: 'https://x.test', ...headers } })
  const { e, points } = env()
  expect((await handle(post({}), e)).status).toBe(204)
  expect((await handle(post({ origin: 'https://evil.test' }), e)).status).toBe(403)
  expect((await handle(post({}, '{"p":"x"}'), e)).status).toBe(400)
  expect((await handle(post({ 'user-agent': 'Googlebot' }), e)).status).toBe(204) // accepted silently, not recorded
  expect((await handle(post({ 'content-length': '9000' }), e)).status).toBe(413)
  expect((await handle(post({ cookie: 'aq_owner=1' }), e)).status).toBe(204) // the owner's own visit: not recorded
  expect(points).toHaveLength(1)
})

test('dashboard: signed out, a page is the site\'s sign-in in its place, which comes back to it; the old token opens nothing', async () => {
  const { db } = await signedIn()
  const { e } = env({ DB: db, OWNER_ACCOUNTS: 'owner-1', ASSETS: assets } as Partial<Env>)
  for (const r of [await handle(get('/_ab/'), e), await handle(get('/_ab/?token=tok'), e), await handle(get('/_ab/', { ...browser, cookie: 'ab_token=tok' }), e)]) {
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(signInFor(html)).toEqual({ next: '/_ab/', notOwner: false })
    expect(html).toContain('<meta name="robots" content="noindex')
    expect(html).not.toContain('Các mục quản trị')
    // Never stored; noindex; the referrer the origin alone, which Google's button and Turnstile need (not no-referrer).
    expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag'), r.headers.get('referrer-policy')]).toEqual(['no-store', 'noindex, nofollow', 'strict-origin'])
    expect(r.headers.get('set-cookie')).toBeNull()
  }
  // The old token form: back to the overview, nothing set.
  const form = await handle(new Request('https://x.test/_ab/login', { method: 'POST', body: new URLSearchParams({ token: 'tok' }) }), e)
  expect([form.status, form.headers.get('location'), form.headers.get('set-cookie')]).toEqual([303, '/_ab/', null])
  // A page under the overview: the sign-in on its own address, back to it (with its slash, as the dashboard links it).
  for (const p of ['/_ab/doc-gia/', '/_ab/doc-gia']) {
    const r = await handle(get(p), e)
    expect([r.status, r.headers.get('location'), r.headers.get('cache-control')]).toEqual([200, null, 'no-store'])
    expect(signInFor(await r.text())).toEqual({ next: '/_ab/doc-gia/', notOwner: false })
  }
})

test('dashboard: a build that can\'t serve the sign-in page falls back to the page that points to "Bể của tôi"', async () => {
  const { db, reader } = await signedIn()
  const missing = { fetch: async () => new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher
  const broken = { fetch: async () => { throw new Error('assets down') } } as unknown as Fetcher
  for (const ASSETS of [missing, broken, undefined]) {
    const { e } = env({ DB: db, OWNER_ACCOUNTS: 'owner-1', ASSETS } as Partial<Env>)
    for (const p of ['/_ab/', '/_ab/tai-khoan/']) {
      const r = await handle(get(p), e)
      expect([r.status, r.headers.get('cache-control'), r.headers.get('x-robots-tag')]).toEqual([200, 'no-store', 'noindex, nofollow'])
      expect(await r.text()).toContain('href="/cong-cu/be-cua-toi/#tai-khoan"')
    }
    const other = await handle(get('/_ab/', { ...browser, cookie: reader }), e)
    expect(other.status).toBe(403)
    expect(await other.text()).toContain('không phải tài khoản chủ trang')
  }
})

test('every /_ab route opens only to the owner\'s account signed in on the web: pages send to the sign-in, the actions and the JSON are not found', async () => {
  const { ADMIN_PAGES } = await import('../dashboard')
  const { db, owner, reader, app } = await signedIn()
  const { e } = env({ DB: db, OWNER_ACCOUNTS: 'owner-1', AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc', ASSETS: assets } as Partial<Env>)
  expect(ADMIN_PAGES).toHaveLength(9)
  // Nobody, the old token cookie, another reader's account, the owner's app session (a bearer), and the owner's cookie
  // under the dashboard token as a bearer (a bearer is read first, and opens no page).
  const visits: Record<string, string>[] = [browser, { ...browser, cookie: 'ab_token=tok' }, { ...browser, cookie: reader }, { ...browser, authorization: `Bearer ${app}` }, { ...browser, authorization: 'Bearer tok', cookie: owner }]
  for (const h of visits) {
    for (const path of ADMIN_PAGES) {
      for (const p of [path, path.replace(/\/$/, '')]) {
        const r = await handle(get(p, h), e)
        const body = await r.text()
        // Every page: the sign-in in its place, back to it once signed in; another account is told it isn't the owner's.
        expect([r.status, r.headers.get('cache-control')], p).toEqual([h.cookie === reader ? 403 : 200, 'no-store'])
        expect(signInFor(body), p).toEqual({ next: path, notOwner: h.cookie === reader })
        expect(body, p).not.toContain('Các mục quản trị')
        expect(r.headers.get('set-cookie'), p).toBeNull()
      }
    }
    if (h.authorization !== 'Bearer tok') expect((await handle(get('/_ab/hidden.json', h), e)).status).toBe(404)
    for (const p of ['/_ab/photos', '/_ab/hidden']) expect((await handle(new Request(`https://x.test${p}`, { method: 'POST', body: new URLSearchParams({ id: 'x', url: '/ca/x/', action: 'hide' }), headers: h }), e)).status, p).toBe(404)
    expect((await handle(get('/_ab/something-else/', h), e)).status).toBe(404)
    // The build's content stats (scripts/content-stats.ts) are a file in /_ab/: the Worker answers first, and never with it.
    expect((await handle(get('/_ab/content.json', h), e)).status).toBe(404)
  }
  // The owner signed in on the web: a page, noindex, never stored; the owner flag set and the old token cookie cleared.
  const ok = await handle(get('/_ab/an-trang/', { ...browser, cookie: owner }), e)
  expect(ok.status).toBe(200)
  expect([ok.headers.get('cache-control'), ok.headers.get('x-robots-tag')]).toEqual(['no-store', 'noindex, nofollow'])
  expect(await ok.text()).toContain('aria-current="page">Ẩn trang<')
  expect(ok.headers.getSetCookie()).toEqual([expect.stringMatching(/^aq_owner=1;/), expect.stringMatching(/^ab_token=; Path=\/_ab; Max-Age=0/)])
  // Not to the owner either: the dashboard reads the file itself, through ASSETS (admin/content.ts).
  expect((await handle(get('/_ab/content.json', { ...browser, cookie: owner }), e)).status).toBe(404)
  // The hidden list: the owner's session, or the dashboard token as a bearer (the build and the scripts).
  for (const h of [{ cookie: owner }, { authorization: 'Bearer tok' }] as Record<string, string>[]) expect((await handle(get('/_ab/hidden.json', h), e)).status).toBe(200)
  // No owner named: nobody is.
  const { e: none } = env({ DB: db, ASSETS: assets } as Partial<Env>)
  expect(signInFor(await (await handle(get('/_ab/', { ...browser, cookie: owner }), none)).text()).notOwner).toBe(true)
})

test('dashboard: a part that can\'t load says why in its place; the rest of the page renders', async () => {
  const { vi } = await import('vitest')
  const db = testD1()
  await db.prepare("INSERT INTO clicks_daily VALUES (?, 'shopee', 'thuc-an', 'species:x', 'search', 4)").bind(new Date().toISOString().slice(0, 10)).run()
  const { owner } = await signedIn(db)
  const { e } = env({ DB: db, OWNER_ACCOUNTS: 'owner-1', AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' } as Partial<Env>)
  // Analytics Engine refuses every query; KV can't list.
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('Unknown function', { status: 422 }))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const r = await handle(get('/_ab/', { ...browser, cookie: owner }), e)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain('analytics engine sql 422: Unknown function')
    expect(html).toContain('Không tải được người đọc')
    expect(html).toContain('lượt bấm sang sàn · 7 ngày') // from D1, still counted
    expect(html).toContain('4 lượt bấm sang sàn') // today's, in the log
    expect(fetch.mock.calls.every(([u]) => String(u).startsWith('https://api.cloudflare.com/client/v4/accounts/acc/analytics_engine/sql'))).toBe(true)
    const fish = await (await handle(get('/_ab/nhan-dien-ca/', { ...browser, cookie: owner }), e)).text()
    expect(fish).toContain('Không tải được nhật ký nhận diện cá')
    expect(fish).toContain('Key Anthropic')
  } finally {
    fetch.mockRestore()
    err.mockRestore()
  }
})

test('events are accepted (and dropped) when Analytics Engine is not bound yet', async () => {
  const { e } = env({ EVENTS: undefined })
  const r = await handle(new Request('https://x.test/_e', { method: 'POST', body: JSON.stringify({ s: 'mix', p: '/vi/', t: 'view', v: 1, sid: 'abc123def456' }), headers: { ...browser, origin: 'https://x.test' } }), e)
  expect(r.status).toBe(204)
})

test('/go/ redirects to search without D1, with D1 counts the click, 404s on junk', async () => {
  const { e } = env()
  const r = await handle(get('/go/shopee/?k=c%C3%A1%20neon&c=thuc-an&e=species:x'), e)
  expect(r.status).toBe(302)
  expect(r.headers.get('location')).toBe('https://shopee.vn/search?keyword=c%C3%A1%20neon')
  expect((await handle(get('/go/shopee/?u=https://evil.test'), e)).status).toBe(404)
  const db = testD1()
  const waits: Promise<unknown>[] = []
  await handle(get('/go/lazada/?k=loc&c=loc&e=guide:x'), { ...e, DB: db }, p => { waits.push(p) })
  await Promise.all(waits)
  expect(await db.prepare('SELECT network, n FROM clicks_daily').first()).toEqual({ network: 'lazada', n: 1 })
})

test('/go/ wraps the search link without D1, falls back when D1 breaks, never counts bots or HEAD', async () => {
  const tpl = { AFF_TEMPLATE_SHOPEE: 'https://go.isclix.com/deep_link/1?url={url}' }
  const { e } = env(tpl as Partial<Env>)
  const loc = async (env: Env, req = get('/go/shopee/?k=neon')) => (await handle(req, env)).headers.get('location')
  const wrapped = `https://go.isclix.com/deep_link/1?url=${encodeURIComponent('https://shopee.vn/search?keyword=neon')}`
  expect(await loc(e)).toBe(wrapped)
  const broken = { prepare: () => { throw new Error('D1 down') } } as unknown as D1Database
  expect(await loc({ ...e, DB: broken })).toBe(wrapped)
  const db = testD1()
  const waits: Promise<unknown>[] = []
  const hit = (req: Request) => handle(req, { ...e, DB: db }, p => { waits.push(p) })
  await hit(get('/go/shopee/?k=neon', { 'user-agent': 'Googlebot/2.1' }))
  await hit(new Request('https://x.test/go/shopee/?k=neon', { method: 'HEAD', headers: browser }))
  await Promise.all(waits)
  expect(await db.prepare('SELECT COUNT(*) AS n FROM clicks_daily').first()).toEqual({ n: 0 })
})

test('/_aff/products needs the bearer token', async () => {
  const { e } = env()
  const post = (auth?: string) => new Request('https://x.test/_aff/products', { method: 'POST', body: '[]', headers: auth ? { authorization: auth } : {} })
  expect((await handle(post(), { ...e, DB: testD1() })).status).toBe(404)
  expect((await handle(post('Bearer wrong'), { ...e, DB: testD1() })).status).toBe(404)
  expect(await (await handle(post('Bearer tok'), { ...e, DB: testD1() })).json()).toEqual({ saved: 0, errors: [] })
})

test('non-canonical hosts 301 to the production host, path and query kept', async () => {
  const { e } = env({ CANONICAL_HOST: 'aquatome.com' } as Partial<Env>)
  const r = await handle(new Request('https://www.aquatome.com/ca/?skin=a', { headers: browser }), e)
  expect(r.status).toBe(301)
  expect(r.headers.get('location')).toBe('https://aquatome.com/ca/?skin=a')
  expect((await handle(new Request('https://old.example/', { headers: browser }), e)).headers.get('location')).toBe('https://aquatome.com/')
  expect((await handle(new Request('https://aquatome.com/', { headers: browser }), e)).status).toBe(200)
  // An old /vi/ address on another host: one hop to the page.
  expect((await handle(new Request('https://www.aquatome.com/vi/ca/x/', { headers: browser }), e)).headers.get('location')).toBe('https://aquatome.com/vi/ca/x/')
})

test('the root is the Vietnamese home page: the page itself, no redirect', async () => {
  const { e, seen } = env()
  const r = await handle(new Request('https://aquatome.com/?utm_source=x', { headers: browser }), e)
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(PAGE)
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/')
  expect(r.headers.get('vary')).toBe('Accept, Accept-Language, Cookie') // the same address sends Indonesian and Thai browsers on
  expect(r.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
})

/** Follows one redirect: the Worker's answer for its Location. */
const follow = (r: Response, e: Env) => handle(new Request(new URL(r.headers.get('location')!, 'https://aquatome.com'), { headers: browser }), e)

test('an old /vi/… address answers 301 to the same path without /vi, query kept, in one hop', async () => {
  const { e } = env()
  for (const [from, to] of [
    ['/vi/ca/ca-neon-vua/?q=neon&x=1', '/ca/ca-neon-vua/?q=neon&x=1'],
    ['/vi/', '/'], ['/vi', '/'], ['/vi?utm_source=x', '/?utm_source=x'],
    ['/vi/ca/ca-neon-vua', '/ca/ca-neon-vua/'], // with the slash the page has: no second hop
    ['/vi/cong-cu/nuoi-chung/?ca=ca-neon-vua:10', '/cong-cu/nuoi-chung/?ca=ca-neon-vua:10'],
    ['/vi/ca/ca-dia/index.md', '/ca/ca-dia/index.md'],
  ]) {
    const r = await handle(get(from!), e)
    expect([r.status, r.headers.get('location')], from).toEqual([301, to])
    expect((await follow(r, e)).status, `${from} → ${to}`).toBe(200)
  }
  // Never to another site: a path that would start "//" or "/\\" once /vi is gone keeps one slash.
  for (const p of ['/vi//evil.test/x', '/vi/\\evil.test/x', '/vi/%2F%2Fevil.test/', '/vi///evil.test']) {
    const to = (await handle(get(p), e)).headers.get('location')!
    expect(new URL(to, 'https://aquatome.com').origin, `${p} → ${to}`).toBe('https://aquatome.com')
  }
  // Agents asking for markdown, and bots, get the same 301.
  expect((await handle(get('/vi/ca/', { accept: 'text/markdown' }), e)).headers.get('location')).toBe('/ca/')
  expect((await handle(get('/vi/ca/', { 'user-agent': 'Googlebot/2.1' }), e)).status).toBe(301)
  // Not /vi: a section that starts with the letters, and the other languages, are pages as they are.
  for (const p of ['/video/', '/ca/ca-neon-vua/', '/id/', '/id/ikan/x/', '/th/', '/th/fish/x/']) expect((await handle(get(p), e)).status, p).toBe(200)
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

test('markdown: same URL, Accept: text/markdown → index.md, no cookie; the root answers with the home page\'s; HTML varies on Accept', async () => {
  const MD = '---\ntitle: "t"\n---\n\n# Cá\n'
  const { e, seen } = env({ ASSETS: { fetch: async (r: Request) => { seen.push(r); return new URL(r.url).pathname.endsWith('.md') ? new Response(MD, { headers: { 'content-type': 'text/markdown' } }) : new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } } as unknown as Fetcher })
  const r = await handle(get('/ca/', { ...browser, accept: 'text/markdown' }), e)
  expect(await r.text()).toBe(MD)
  expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  expect(r.headers.get('vary')).toBe('Accept')
  expect(r.headers.get('x-markdown-tokens')).toBe(String(Math.ceil(MD.length / 4)))
  expect(r.headers.get('set-cookie')).toBeNull()
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/ca/index.md')
  await handle(get('/', { accept: 'text/markdown' }), e)
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/index.md')
  await handle(get('/id/ikan/', { accept: 'text/markdown' }), e)
  expect(new URL(seen.at(-1)!.url).pathname).toBe('/id/ikan/index.md')
  const html = await handle(get('/ca/', browser), e)
  expect(html.headers.get('content-type')).toContain('text/html')
  expect(html.headers.get('vary')).toBe('Accept')
})

test('markdown: a page without index.md falls back to HTML', async () => {
  const { e } = env({ ASSETS: { fetch: async (r: Request) => new URL(r.url).pathname.endsWith('.md') ? new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) : new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } as unknown as Fetcher })
  const r = await handle(get('/ca/x/', { accept: 'text/markdown' }), e)
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(PAGE)
})

test('agent discovery: API catalog as linkset+json; the home page and its language redirects carry the Link header', async () => {
  const { e } = env()
  const cat = await handle(get('/.well-known/api-catalog'), e)
  expect(cat.headers.get('content-type')).toBe('application/linkset+json')
  const body = await cat.json() as { linkset: { anchor: string; 'service-desc': { href: string }[] }[] }
  expect(body.linkset[0]).toMatchObject({ anchor: 'https://x.test/', 'service-desc': [{ href: 'https://x.test/openapi.json' }] })
  const root = await handle(get('/'), e)
  expect(root.status).toBe(200)
  // Indonesian and Thai browsers land on their language.
  const id = await handle(get('/', { ...browser, 'accept-language': 'en-US,en;q=0.9,id;q=0.8' }), e)
  expect([id.status, id.headers.get('location'), id.headers.get('vary')]).toEqual([302, '/id/', 'Accept-Language, Cookie'])
  expect((await handle(get('/?x=1', { ...browser, 'accept-language': 'th-TH' }), e)).headers.get('location')).toBe('/th/?x=1')
  // Everyone else, crawlers included, gets the Vietnamese page, never cached where an Indonesian or Thai browser would get it.
  const vi = await handle(get('/', { ...browser, 'accept-language': 'en-US' }), e)
  expect([vi.status, vi.headers.get('location'), vi.headers.get('vary')]).toEqual([200, null, 'Accept, Accept-Language, Cookie'])
  expect(vi.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
  // The language picked in the menu wins over the browser's, and is never cached.
  const picked = await handle(get('/', { ...browser, 'accept-language': 'id', cookie: 'ts=1; aq_lang=th' }), e)
  expect([picked.status, picked.headers.get('location')]).toEqual([302, '/th/'])
  const pickedVi = await handle(get('/', { ...browser, 'accept-language': 'th', cookie: 'aq_lang=vi' }), e)
  expect([pickedVi.status, pickedVi.headers.get('location')]).toEqual([200, null])
  expect((await handle(get('/', { ...browser, 'accept-language': 'th', cookie: 'aq_lang=fr; xaq_lang=vi' }), e)).headers.get('location')).toBe('/th/')
  expect(root.headers.get('link')).toContain('</.well-known/api-catalog>; rel="api-catalog"')
  expect(id.headers.get('link')).toContain('rel="api-catalog"')
  expect((await handle(get('/ca/'), e)).headers.get('link')).toBeNull()
})

test('hide a page from the dashboard: 410 for HTML, markdown and index.*; unhide brings it back', async () => {
  const store = new Map<string, string>()
  const AB = { get: async (k: string, o?: { type?: string } | string) => { const v = store.get(k); return v === undefined ? (k === 'hidden' ? null : { mix: 0, a: 0, b: 1, c: 0 }) : (o === 'json' || (typeof o === 'object' && o?.type === 'json')) ? JSON.parse(v) : v }, put: async (k: string, v: string) => { store.set(k, v) } }
  const { db, owner } = await signedIn()
  const { e } = env({ AB: AB as unknown as KVNamespace, DB: db, OWNER_ACCOUNTS: 'owner-1' } as Partial<Env>)
  const form = (fields: Record<string, string>, cookie = owner) =>
    new Request('https://x.test/_ab/hidden', { method: 'POST', body: new URLSearchParams(fields), headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } })

  expect((await handle(form({ url: '/ca/x/', action: 'hide' }, ''), e)).status).toBe(404) // no cookie
  expect((await handle(form({ url: 'https://x.test/go/shopee/', action: 'hide' }), e)).status).toBe(400)
  for (const home of ['https://x.test/', 'https://x.test/vi/', '/id/']) expect((await handle(form({ url: home, action: 'hide' }), e)).status, home).toBe(400)
  const ok = await handle(form({ url: 'https://aquatome.com/ca/x/', note: 'sai ảnh', action: 'hide' }), e)
  expect(ok.status).toBe(303)
  expect(JSON.parse(store.get('hidden')!)['/ca/x/']).toMatchObject({ note: 'sai ảnh' })

  for (const [path, headers] of [['/ca/x/', browser], ['/ca/x/', { accept: 'text/markdown' }], ['/ca/x/index.md', browser], ['/ca/x', browser]] as const) {
    const r = await handle(get(path, headers), e)
    expect(r.status, path).toBe(410)
    expect(r.headers.get('x-robots-tag')).toContain('noindex')
  }
  expect((await handle(get('/ca/y/'), e)).status).toBe(200)
  // Its old address goes there first.
  expect(await follow(await handle(get('/vi/ca/x/'), e), e).then(r => r.status)).toBe(410)

  const list = await handle(new Request('https://x.test/_ab/hidden.json', { headers: { authorization: 'Bearer tok' } }), e)
  expect(Object.keys(await list.json() as object)).toEqual(['/ca/x/'])
  expect((await handle(new Request('https://x.test/_ab/hidden.json'), e)).status).toBe(404)

  await handle(form({ url: '/ca/x/', action: 'unhide' }), e)
  expect((await handle(get('/ca/x/'), e)).status).toBe(200)
})

test('a page hidden by its old /vi/ address stays hidden at its root one, in the list and the deploy-time list; unhiding stores the list so', async () => {
  const store = new Map<string, string>([['hidden', JSON.stringify({ '/vi/ca/x/': { at: '2026-10-30T00:00:00Z', note: 'cũ' }, '/id/ikan/y/': { at: '2026-10-30T00:00:00Z' } })]])
  const AB = { get: async (k: string, o?: { type?: string } | string) => { const v = store.get(k); return v === undefined ? null : (o === 'json' || (typeof o === 'object' && o?.type === 'json')) ? JSON.parse(v) : v }, put: async (k: string, v: string) => { store.set(k, v) } }
  const { db, owner } = await signedIn()
  const { e } = env({ AB: AB as unknown as KVNamespace, DB: db, OWNER_ACCOUNTS: 'owner-1' } as Partial<Env>)
  const refreshes: Promise<unknown>[] = []
  await handle(get('/ca/z/'), e, p => { refreshes.push(p) })
  await Promise.all(refreshes)
  expect((await handle(get('/ca/x/'), e)).status).toBe(410)
  expect((await handle(get('/id/ikan/y/'), e)).status).toBe(410)
  const list = await handle(new Request('https://x.test/_ab/hidden.json', { headers: { authorization: 'Bearer tok' } }), e)
  expect(await list.json()).toEqual({ '/ca/x/': { at: '2026-10-30T00:00:00Z', note: 'cũ' }, '/id/ikan/y/': { at: '2026-10-30T00:00:00Z' } })
  // Unhidden by either address: gone from the list, which is stored with root addresses from then on.
  await handle(new Request('https://x.test/_ab/hidden', { method: 'POST', body: new URLSearchParams({ url: 'https://aquatome.com/vi/ca/x/', action: 'unhide' }), headers: { cookie: owner, 'content-type': 'application/x-www-form-urlencoded' } }), e)
  expect(JSON.parse(store.get('hidden')!)).toEqual({ '/id/ikan/y/': { at: '2026-10-30T00:00:00Z' } })
  expect((await handle(get('/ca/x/'), e)).status).toBe(200)
  // The list deploy.sh bakes in, read before KV answers, the same way.
  const fresh = env({ AB: { get: () => new Promise(() => {}), put: async () => {} } as unknown as KVNamespace, HIDDEN_PAGES: '/vi/ca/old/ /ca/new/' } as Partial<Env>).e
  for (const p of ['/ca/old/', '/ca/new/']) expect((await handle(get(p), fresh)).status, p).toBe(410)
})

test('owner: opening /_ab/ signed in sets the owner flag cookie; the taken-down page offers "bring back"', async () => {
  const { db, owner } = await signedIn()
  const { e } = env({ AB: { get: async () => null, put: async () => {} } as unknown as KVNamespace, DB: db, OWNER_ACCOUNTS: ' owner-1 , other-id' } as Partial<Env>)
  const dash = await handle(new Request('https://x.test/_ab/', { headers: { cookie: owner } }), e)
  expect(dash.headers.getSetCookie()[0]).toMatch(/^aq_owner=1; Path=\/;.*SameSite=Strict/)
  const gone = await gonePage().text()
  expect(gone).toContain('data-gone="1"')
  expect(gone).toContain('Hiện lại trang này')
})

test('a renamed page\'s old address 301s to the new one with ?tu=<old slug>, its old /vi/ address too in one hop; unknown paths stay 404', async () => {
  const table = { '/ca/ca-betta-green-alien/': '/ca/ca-betta/?tu=ca-betta-green-alien', '/id/asal/north-america/usa/': '/id/asal/north-america/united-states/' }
  const live = ['/ca/ca-betta/', '/id/asal/north-america/united-states/']
  const { e } = env({ ASSETS: { fetch: async (r: Request) => { const p = new URL(r.url).pathname; return p === '/redirects.json' ? Response.json(table) : live.includes(p) ? new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) } } as unknown as Fetcher })
  const r = await handle(new Request('https://aquatome.com/ca/ca-betta-green-alien/'), e)
  expect(r.status).toBe(301)
  expect(r.headers.get('location')).toBe('/ca/ca-betta/?tu=ca-betta-green-alien')
  expect((await handle(new Request('https://aquatome.com/ca/khong-co/'), e)).status).toBe(404)
  // From before the Vietnamese pages moved to the root: straight to the page, its query kept after ?tu=.
  for (const [from, to] of [['/vi/ca/ca-betta-green-alien/', '/ca/ca-betta/?tu=ca-betta-green-alien'], ['/vi/ca/ca-betta-green-alien?utm_source=x', '/ca/ca-betta/?tu=ca-betta-green-alien&utm_source=x']]) {
    const old = await handle(new Request(`https://aquatome.com${from}`), e)
    expect([old.status, old.headers.get('location')], from).toEqual([301, to])
    expect((await follow(old, e)).status, from).toBe(200)
  }
  const gone = await handle(new Request('https://aquatome.com/vi/ca/khong-co/'), e)
  expect([gone.status, gone.headers.get('location')]).toEqual([301, '/ca/khong-co/'])
  expect((await follow(gone, e)).status).toBe(404)
  // Other languages' old addresses too.
  const id = await handle(new Request('https://aquatome.com/id/asal/north-america/usa/'), e)
  expect([id.status, id.headers.get('location')]).toEqual([301, '/id/asal/north-america/united-states/'])
})

test('a page view never waits on KV: the list baked in at deploy answers until the live one is in, then the live one wins', async () => {
  let release!: (v: string | null) => void
  const kv = new Promise<string | null>(r => { release = r })
  const AB = { get: async (_k: string, o?: unknown) => { const v = await kv; return v && (o === 'json' || (typeof o === 'object' && (o as { type?: string })?.type === 'json')) ? JSON.parse(v) : v }, put: async () => {} }
  const { e } = env({ AB: AB as unknown as KVNamespace, HIDDEN_PAGES: '/ca/x/ /ca/old/' } as Partial<Env>)
  const refreshes: Promise<unknown>[] = []
  const go = (path: string) => handle(get(path), e, p => { refreshes.push(p) })
  expect((await go('/ca/x/')).status).toBe(410) // KV still out: the deploy-time list
  const page = await go('/ca/y/')
  expect(page.status).toBe(200)
  expect(page.headers.get('server-timing')).toMatch(/^asset;dur=\d+$/)
  expect(refreshes).toHaveLength(1) // one background read, however many views
  release(JSON.stringify({ '/ca/new/': { at: '2026-10-30T00:00:00Z' } }))
  await Promise.all(refreshes)
  expect((await go('/ca/new/')).status).toBe(410) // hidden since the deploy
  expect((await go('/ca/x/')).status).toBe(200) // shown again since the deploy
})

test("the iOS app's association: its passkeys are this site's (webcredentials), as JSON with no redirect", async () => {
  const { e } = env()
  const r = await handle(get('/.well-known/apple-app-site-association'), e)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toBe('application/json')
  expect(await r.json()).toEqual({ webcredentials: { apps: ['Q783W6B4FA.com.aquatome.app'] } })
})
