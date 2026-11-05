import type { Page } from '@playwright/test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { dashboardHostRoute } from '../worker/dashboard-host'
import type { AdminEnv } from '../worker/dashboard'
import { DASHBOARD_HOST, SITE_HOST } from '../worker/paths'
import { expect, test } from './fixtures'
import { LIVE } from './pages'

// The owner's dashboard on its own host, in a browser. Locally the host is the Worker's route in this process, and a
// stand-in for Cloudflare Access adds its token to each request as Access does, so these see what only a browser shows: the
// headers a form really sends, which cookies stick, what the links reach. Live, Access or the Worker turns away a stranger.
const DASH = `https://${DASHBOARD_HOST}`
const TEAM = 'e2e.cloudflareaccess.test'
const AUD = 'e2e-aud'
const IS_DASHBOARD = 'nav[aria-label="Các mục quản trị"]'

const pair = generateKeyPair('RS256', { extractable: true })
const token = async () => new SignJWT({ email: 'owner@aquatome.test' }).setProtectedHeader({ alg: 'RS256', kid: 'k' }).setAudience([AUD]).setIssuer(`https://${TEAM}`).setExpirationTime('1h').sign((await pair).privateKey)

// The team's certs are the Worker's one fetch of its own; every other fetch here is to the local build.
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => (String(input) === `https://${TEAM}/cdn-cgi/access/certs`
  ? Response.json({ keys: [{ ...(await exportJWK((await pair).publicKey)), kid: 'k', alg: 'RS256', use: 'sig' }] })
  : realFetch(input, init))

/** The host as a browser reaches it. `access`: false is the host with no Access app in front, the Worker alone. */
async function host(page: Page, baseURL: string, access = true) {
  const kv = new Map<string, string>()
  const env: AdminEnv = {
    ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD,
    AB: { get: async (k: string, o?: unknown) => { const v = kv.get(k); return v === undefined ? null : o ? JSON.parse(v) : v }, put: async (k: string, v: string) => { kv.set(k, v) }, list: async () => ({ keys: [], list_complete: true }) } as unknown as AdminEnv['AB'],
    ASSETS: { fetch: (r: Request) => fetch(new URL(new URL(r.url).pathname, baseURL)) } as unknown as AdminEnv['ASSETS'],
  }
  const seen: { path: string; site: string | undefined; origin: string | undefined; cookie: string | undefined }[] = []
  await page.route(url => url.hostname === DASHBOARD_HOST, async route => {
    const r = route.request()
    const url = new URL(r.url())
    if (url.pathname.startsWith('/cdn-cgi/access/')) return route.fulfill({ contentType: 'text/plain', body: 'Access: signed out' })
    const headers = await r.allHeaders()
    // Playwright sees a request before Chromium adds its Sec-Fetch-* headers. A page's own form is "same-origin" there,
    // so that is the one header this stand-in adds, for a post from a page on this host; any other post goes without it.
    if (r.method() === 'POST' && new URL(r.frame().url()).origin === DASH) headers['sec-fetch-site'] = 'same-origin'
    seen.push({ path: url.pathname, site: headers['sec-fetch-site'], origin: headers.origin, cookie: headers.cookie })
    const body = r.postData()
    const req = new Request(url, { method: r.method(), headers: { ...headers, ...(access ? { 'cf-access-jwt-assertion': await token() } : {}) }, ...(body ? { body } : {}) })
    const res = await dashboardHostRoute(req, url, env)
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) })
  })
  return { seen, kv }
}

test.describe('locally', () => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')

  test('the owner moves around the dashboard on its host, and a page\'s form acts from the page', async ({ page, baseURL, errors }) => {
    const { seen, kv } = await host(page, baseURL!)
    const opened = await page.goto(`${DASH}/an-trang/`)
    expect([opened?.status(), opened?.headers()['x-robots-tag'], opened?.headers()['cache-control']]).toEqual([200, 'noindex, nofollow', 'no-store'])
    await expect(page.locator(`${IS_DASHBOARD} a[aria-current="page"]`)).toHaveAttribute('href', '/an-trang/')

    // The real browser's form. Its Origin is "null" under these pages' no-referrer, so only Sec-Fetch-Site can say it
    // came from the page.
    await page.locator('input[name=url]').fill('https://aquatome.com/ca/thu-an/')
    const answered = page.waitForResponse(r => new URL(r.url()).pathname === '/_ab/hidden')
    const navigated = page.waitForEvent('framenavigated', f => f === page.mainFrame())
    await page.locator('form.inline button').click()
    const res = await answered
    expect([res.status(), res.headers().location]).toEqual([303, '/an-trang/'])
    // Chromium follows a redirect a route fulfilled past the route, to the real host, which this checkout can't reach:
    // open where it leads. (The redirects themselves are in worker/test/dashboard-host.test.ts.)
    await navigated
    if (new URL(page.url()).pathname !== '/an-trang/') await page.goto(`${DASH}${res.headers().location}`)
    await expect(page.locator('main table')).toContainText('/ca/thu-an/')
    const post = seen.find(s => s.path === '/_ab/hidden')
    expect(post?.origin).toBe('null')
    expect(Object.keys(JSON.parse(kv.get('hidden')!))).toEqual(['/ca/thu-an/'])
    // A link to that public page leads to the site, this host having none.
    await expect(page.locator('main table a').first()).toHaveAttribute('href', `https://${SITE_HOST}/ca/thu-an/`)

    // On to a page by the dashboard's own links: its address here, no /_ab/ left in it.
    await page.locator(`${IS_DASHBOARD} a[href="/"]`).click()
    await expect(page).toHaveURL(`${DASH}/`)
    await expect(page.locator('a[href^="/_ab/"]')).toHaveCount(0)
    await page.locator('a[href="/doc-gia/"]:visible').first().click()
    await expect(page).toHaveURL(`${DASH}/doc-gia/`)

    // The two faces load from this host.
    await page.evaluate(() => document.fonts.ready)
    expect(seen.some(s => s.path.startsWith('/_ab/fonts/'))).toBe(true)
    expect(errors).toEqual([])
  })

  test('the owner flag reaches the site\'s pages, so their owner bar stays; no session of the site\'s is made here', async ({ page, context, baseURL }) => {
    await host(page, baseURL!)
    await page.goto(`${DASH}/`)
    expect((await context.cookies(`https://${SITE_HOST}/ca/x/`)).map(c => [c.name, c.domain])).toContainEqual(['aq_owner', `.${SITE_HOST}`])
    expect((await context.cookies(DASH)).map(c => c.name)).not.toContain('__Host-aq_session')
  })

  test('sign-out is at Access\'s address, in reach of a thumb, with no sideways scroll', async ({ page, baseURL }) => {
    await host(page, baseURL!)
    await page.goto(`${DASH}/`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const out = page.locator('.masthead a.out')
    await expect(out).toHaveText('Đăng xuất')
    expect((await out.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await out.click()
    await expect(page).toHaveURL(`${DASH}/cdn-cgi/access/logout`)
    await expect(page.locator('body')).toContainText('Access: signed out')
  })

  test('with no Access in front of it, the Worker alone turns the browser away: no page, no form, no fonts', async ({ page, baseURL }) => {
    await host(page, baseURL!, false)
    for (const path of ['/', '/doc-gia/', '/_ab/doc-gia/', '/_ab/fonts/x.woff2', '/robots.txt', '/ca/x/']) {
      const r = await page.goto(`${DASH}${path}`)
      expect([path, r?.status()]).toEqual([path, 403])
      await expect(page.locator(IS_DASHBOARD)).toHaveCount(0)
    }
  })

  test.describe('in another time zone', () => {
    test.use({ timezoneId: 'Europe/Berlin' })

    test('the page\'s clock follows the device: its cookie reaches pages at the root', async ({ page, baseURL }) => {
      const { seen } = await host(page, baseURL!)
      await page.goto(`${DASH}/doc-gia/`)
      // The script keeps the zone and reloads once; the Worker then draws the page in it. Path=/_ab never reached this address.
      await expect(page.locator('html')).toHaveAttribute('data-tz', 'Europe/Berlin')
      expect(seen.filter(s => s.path === '/doc-gia/').at(-1)?.cookie).toContain('aq_tz=Europe%2FBerlin')
    })
  })
})

test('live: a stranger gets no dashboard from the host, and what the Worker doesn\'t see there stays out of search', async ({ request }) => {
  test.skip(!LIVE, 'the real host, Access and the build\'s _headers')
  // Before the first deploy with it, or while its certificate is issued, the host doesn't answer: that serves nothing either.
  const home = await request.get(`${DASH}/`, { maxRedirects: 0 }).catch(() => null)
  if (!home) return
  expect(home.status()).not.toBe(200) // Access's way to its login, or the Worker's 403
  expect(await home.text()).not.toContain('Các mục quản trị')
  const file = await request.get(`${DASH}/favicon.png`, { maxRedirects: 0 })
  if (file.status() === 200) expect(file.headers()['x-robots-tag']).toContain('noindex')
})

test('live: the site\'s /_ab/ is either the dashboard\'s sign-in or, with Access on, a redirect to the host', async ({ request }) => {
  test.skip(!LIVE, 'the real Worker\'s vars')
  const r = await request.get('/_ab/doc-gia/', { maxRedirects: 0 })
  expect([200, 301]).toContain(r.status())
  if (r.status() === 301) expect(r.headers().location).toBe(`${DASH}/doc-gia/`)
})
