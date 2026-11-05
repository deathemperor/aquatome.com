import type { Page } from '@playwright/test'
import { adminRoute, ADMIN_PAGES, type AdminEnv } from '../worker/dashboard'
import { backend, connect, onPasskeyHost, type Backend } from './accounts-stand-in'
import { expect, test } from './fixtures'
import { LIVE } from './pages'

// The owner signs in on the dashboard (/_ab/) itself and lands back on the page asked for. The accounts API runs in this
// process (accounts-stand-in.ts). Locally the dashboard does too (worker/dashboard.ts, reading the build as its
// ASSETS), so the owner gets the dashboard. On the live site the dashboard is the real one, which opens only to the
// owner's real account: there the checks end on the address the sign-in comes back to. Once Cloudflare Access guards the
// dashboard (worker/access.ts) a browser's /_ab/ page 301s to its own host, and there's no sign-in here to check.
const TANKS = '/cong-cu/be-cua-toi/'
/** A dashboard page under the overview, as the dashboard lists them. */
const PAGE = ADMIN_PAGES.find(p => p !== '/_ab/')!
const OWNER = 'owner-g'

/** Locally, /_ab/ answered by the Worker's dashboard, with the owner's account the one Google sign-in `OWNER` makes. */
async function dashboard(page: Page, b: Backend, baseURL: string) {
  if (LIVE) return
  const env: AdminEnv = {
    DB: b.env.DB,
    AB: { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) } as unknown as AdminEnv['AB'],
    ASSETS: { fetch: (r: Request) => fetch(new URL(new URL(r.url).pathname, baseURL)) } as unknown as AdminEnv['ASSETS'],
  }
  await page.route(url => url.pathname === '/_ab' || url.pathname.startsWith('/_ab/'), async route => {
    const r = route.request()
    const req = new Request(r.url(), { method: r.method(), headers: await r.allHeaders() })
    const owner = await b.env.DB!.prepare(`SELECT user_id FROM credentials WHERE kind = 'google' AND subject = ?`).bind(OWNER).first<{ user_id: string }>()
    const res = await adminRoute(req, new URL(req.url), { ...env, OWNER_ACCOUNTS: owner?.user_id ?? '' })
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) })
  })
}

/** Signs in with Google as `sub` and waits for the page the sign-in goes to. */
async function google(page: Page, sub: string) {
  await page.evaluate(s => { (window as unknown as { __sub: string }).__sub = s }, sub)
  const landed = page.waitForEvent('framenavigated', f => f === page.mainFrame())
  await page.locator('#acc-google button').click()
  await landed
}

/** The dashboard's list of its pages (hidden on a phone's overview, where its areas list them instead). */
const rail = (page: Page) => page.locator('nav[aria-label="Các mục quản trị"]')

test.beforeEach(async ({ request }) => {
  test.skip(LIVE && (await request.get(PAGE, { maxRedirects: 0 })).status() === 301, 'the dashboard is behind Access, on its own host')
})

test('signed out, a dashboard page is the sign-in; signing in there comes back to that page, and leaves the tanks alone', async ({ page, baseURL, errors }) => {
  const b = backend()
  await connect(page, b)
  await dashboard(page, b, baseURL!)
  // A tank kept in this browser: the dashboard's sign-in doesn't sync it.
  await page.goto(TANKS)
  await page.locator('#mt-add').click()
  await page.locator('#mt-form input[name=name]').fill('Bể phòng khách')
  await page.locator('#mt-form button[type=submit]').click()
  const synced: string[] = []
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/v1/sync') synced.push(r.url()) })

  await page.goto(PAGE)
  await expect(page.locator('#tai-khoan')).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('#acc-not-owner')).toBeHidden()
  await page.locator('#acc-open').click()
  await google(page, OWNER)
  expect(new URL(page.url()).pathname).toBe(PAGE)
  if (!LIVE) {
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveAttribute('href', PAGE)
    await expect(page.locator('#tai-khoan')).toHaveCount(0)
  }
  expect(synced).toEqual([])
  expect(await b.count('tank_records')).toBe(0)
  expect(errors).toEqual([])
})

test('another account signed in: the dashboard says it isn\'t the owner\'s, and switching to the owner\'s opens it', async ({ page, baseURL, errors }) => {
  // The live dashboard knows only real sessions, so it never sees this one as another account.
  test.skip(LIVE, 'needs the dashboard to know the stand-in\'s session')
  const b = backend()
  await connect(page, b)
  await dashboard(page, b, baseURL!)
  await page.goto('/_ab/')
  await page.locator('#acc-open').click()
  await google(page, 'reader-g')
  expect(new URL(page.url()).pathname).toBe('/_ab/')
  await expect(page.locator('#acc-not-owner')).toBeVisible()
  await expect(page.locator('#acc-not-owner')).toContainText('không phải tài khoản chủ trang')
  await expect(page.locator('#acc-status')).toContainText('Google')
  // Signing out or switching: nothing about tanks, and no deleting the account from here.
  await expect(page.locator('#acc-switch')).toBeVisible()
  await expect(page.locator('#acc-signout')).toBeVisible()
  for (const id of ['acc-sync', 'acc-add', 'acc-passkey-add', 'acc-export', 'acc-leave']) await expect(page.locator(`#${id}`), id).toBeHidden()
  await expect(rail(page)).toHaveCount(0)

  await page.locator('#acc-switch').click()
  await expect(page.locator('#acc-in')).toBeHidden()
  await expect(page.locator('#acc-ways')).toBeVisible()
  await google(page, OWNER)
  expect(new URL(page.url()).pathname).toBe('/_ab/')
  await expect(rail(page).locator('a[aria-current="page"]')).toHaveAttribute('href', '/_ab/')
  expect([await b.count('users'), await b.count('sessions')]).toEqual([2, 1])
  expect(errors).toEqual([])
})

test('a passkey made on "Bể của tôi" signs in on the dashboard too: the same site, the same relying party', async ({ page, baseURL, errors }) => {
  const b = backend()
  b.env.PASSKEYS = 'on'
  const device = await onPasskeyHost(page, baseURL!, TANKS)
  await connect(page, b)
  await dashboard(page, b, baseURL!)
  await page.goto(device.url)
  await page.locator('#acc-open').click()
  await page.evaluate(s => { (window as unknown as { __sub: string }).__sub = s }, OWNER)
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-passkey-add').click()
  await expect(page.locator('#acc-status')).toContainText('Google, passkey')
  await page.locator('#acc-signout').click()
  await expect(page.locator('#acc-open')).toBeVisible()

  await page.goto(new URL(PAGE, device.url).href)
  await page.locator('#acc-open').click()
  const landed = page.waitForEvent('framenavigated', f => f === page.mainFrame())
  await page.locator('#acc-passkey').click()
  await landed
  expect(new URL(page.url()).pathname).toBe(PAGE)
  if (!LIVE) await expect(rail(page).locator('a[aria-current="page"]')).toHaveAttribute('href', PAGE)
  expect(await b.count("credentials WHERE kind = 'passkey' AND last_used_at IS NOT NULL")).toBe(1)
  expect(errors).toEqual([])
})
