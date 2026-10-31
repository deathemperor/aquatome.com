import type { BrowserContext, Page } from '@playwright/test'
import { accounts, type AccountDeps, type AccountsEnv } from '../worker/accounts/api'
import type { Mail } from '../worker/accounts/email'
import { testD1 } from '../worker/test/d1'
import { expect, test } from './fixtures'

// Sign-in and sync on "Bể của tôi", against the real accounts API (worker/accounts) run in this process with a test
// database. Google's, Apple's and Turnstile's scripts are stand-ins: an ID token is `<sub>|<nonce>|`, an Apple code
// `good-<sub>`.
const PAGE = '/vi/cong-cu/be-cua-toi/'
const SIGN_IN_SCRIPTS = /accounts\.google\.com|appleid\.cdn-apple\.com|challenges\.cloudflare\.com/

function backend() {
  const mails: Mail[] = []
  const revoked: string[] = []
  const env: AccountsEnv = { DB: testD1(), ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'k'.repeat(32), GOOGLE_CLIENT_IDS: 'g-web', APPLE_CLIENT_IDS: 'com.aquatome.web,com.aquatome.app', TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'sk' }
  const deps: AccountDeps = {
    verifyIdToken: async (_p, token, audiences) => {
      const [sub, nonce] = token.split('|')
      return audiences.length && sub ? { sub, emailVerified: false, ...(nonce ? { nonce } : {}) } : undefined
    },
    siteverify: async (_s, t) => t === 'tok',
    sendMail: async m => { mails.push(m); return true },
    revokeApple: async (_c, code, _r, ours) => {
      const sub = code.replace(/^good-/, '')
      if (!code.startsWith('good-')) return 'refused'
      if (!ours(sub)) return 'other_account'
      revoked.push(sub)
      return 'revoked'
    },
  }
  return { env, deps, mails, revoked, count: async (table: string) => (await env.DB!.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n }
}
type Backend = ReturnType<typeof backend>

const GOOGLE = `window.google = { accounts: { id: {
  initialize(o) { window.__g = o },
  renderButton(el) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Google (test)'; b.onclick = () => window.__g.callback({ credential: (window.__sub || 'g-1') + '|' + window.__g.nonce + '|' }); el.append(b) },
} } }`
const APPLE = `window.AppleID = { auth: {
  init(o) { window.__a = o },
  signIn: async () => ({ authorization: { id_token: (window.__sub || 'apple-1') + '|' + window.__a.nonce + '|', code: 'good-' + (window.__sub || 'apple-1') } }),
} }`
const TURNSTILE = `window.turnstile = { render(el, o) { setTimeout(() => o.callback('tok'), 10); return 'w1' }, reset() {} }`

async function connect(target: Page | BrowserContext, b: Backend) {
  await target.route('**/api/**', async route => {
    const r = route.request()
    const body = r.postData()
    const req = new Request(r.url(), { method: r.method(), headers: await r.allHeaders(), ...(body ? { body } : {}) })
    const res = await accounts(req, new URL(req.url), b.env, new Date(), b.deps)
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) })
  })
  await target.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: GOOGLE }))
  await target.route(/appleid\.auth\.js$/, route => route.fulfill({ contentType: 'text/javascript', body: APPLE }))
  await target.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: TURNSTILE }))
}

async function addTank(page: Page, name: string) {
  await page.locator('#mt-add').click()
  await page.locator('#mt-form input[name=name]').fill(name)
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank h2', { hasText: name })).toBeVisible()
}

test('signing in with Google merges this browser\'s tanks into the account; another browser gets them, and gives its own', async ({ page, browser, errors }) => {
  const b = backend()
  await connect(page, b)
  const signInScripts: string[] = []
  page.on('request', r => { if (SIGN_IN_SCRIPTS.test(r.url())) signInScripts.push(r.url()) })
  await page.goto(PAGE)
  await addTank(page, 'Bể phòng khách')
  const acc = page.locator('#tai-khoan')
  await expect(acc).toBeVisible()
  // Nothing from Google, Apple or Cloudflare's Turnstile loads until the reader asks to sign in (privacy policy, #tai-khoan).
  expect(signInScripts).toEqual([])
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await expect(page.locator('[data-where="account"]')).toBeVisible()
  expect(await b.count('tank_records')).toBe(1)

  // A second browser with its own tank: after signing in it has both, and so does the account.
  const other = await browser.newContext()
  await connect(other, b)
  await other.route(url => !url.href.startsWith(new URL(page.url()).origin) && !/google|appleid|cloudflare/.test(url.host), r => r.abort())
  const p2 = await other.newPage()
  await p2.goto(new URL(PAGE, page.url()).href)
  await addTank(p2, 'Bể tép')
  await p2.locator('#acc-open').click()
  await p2.locator('#acc-google button').click()
  await expect(p2.locator('.tank h2')).toHaveText(['Bể phòng khách', 'Bể tép'])
  await expect(p2.locator('#acc-msg')).toContainText('Đã thêm 1 bể từ tài khoản')

  // The first browser picks the second's tank up on its next sync.
  await page.locator('#acc-sync').click()
  await expect(page.locator('.tank h2')).toHaveText(['Bể phòng khách', 'Bể tép'])
  // An edit here goes up by itself a moment later.
  await addTank(page, 'Bể thứ ba')
  await expect.poll(() => b.count('tank_records'), { timeout: 5000 }).toBe(3)
  await other.close()
  expect(errors).toEqual([])
})

test('email sign-in: the code is mailed, and the mail\'s link signs in this browser', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-email input[name=email]').fill('Reader@Example.com')
  await page.locator('#acc-email button[type=submit]').click()
  await expect(page.locator('#acc-code')).toBeVisible()
  expect(b.mails).toHaveLength(1)
  expect(b.mails[0]!.to).toBe('reader@example.com')
  const link = /https?:\/\/\S+#ma=\d{6}/.exec(b.mails[0]!.text)![0]
  // The link opens a new tab of the same browser.
  const tab = await page.context().newPage()
  await connect(tab, b)
  await tab.goto(new URL(new URL(link).pathname + new URL(link).hash, page.url()).href)
  await expect(tab.locator('#acc-status')).toContainText('email')
  expect(new URL(tab.url()).hash).toBe('')
  // The address is never stored, only its keyed hash.
  expect(JSON.stringify((await b.env.DB!.prepare('SELECT * FROM credentials').all()).results)).not.toContain('example.com')
  expect(errors).toEqual([])
})

test('deleting an account that signs in with Apple: a fresh Apple sign-in, revoked, the account gone, this browser\'s tanks kept', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await addTank(page, 'Bể của tôi')
  await page.locator('#acc-open').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-status')).toContainText('Apple')
  expect(await b.count('users')).toBe(1)

  await page.locator('#tai-khoan details summary').click()
  page.once('dialog', d => d.accept())
  await page.locator('#acc-delete').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã xóa tài khoản')
  expect(b.revoked).toEqual(['apple-1'])
  expect([await b.count('users'), await b.count('credentials'), await b.count('tank_records'), await b.count('sessions')]).toEqual([0, 0, 0, 0])
  await expect(page.locator('#acc-open')).toBeVisible()
  await expect(page.locator('.tank h2')).toHaveText(['Bể của tôi'])
  await page.reload()
  await expect(page.locator('.tank h2')).toHaveText(['Bể của tôi'])
  await expect(page.locator('#acc-status')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('with accounts off the section stays hidden and no sign-in script loads', async ({ page, errors }) => {
  const b = backend()
  b.env.ACCOUNTS = undefined
  await connect(page, b)
  const third: string[] = []
  page.on('request', r => { if (SIGN_IN_SCRIPTS.test(r.url())) third.push(r.url()) })
  await page.goto(PAGE)
  await addTank(page, 'Bể')
  await expect(page.locator('#tai-khoan')).toBeHidden()
  expect(third).toEqual([])
  expect(errors).toEqual([])
})
