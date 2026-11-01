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
  const usedTokens = new Set<string>()
  const env: AccountsEnv = { DB: testD1(), ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'k'.repeat(32), GOOGLE_CLIENT_IDS: 'g-web', APPLE_CLIENT_IDS: 'com.aquatome.web,com.aquatome.app', TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'sk' }
  const deps: AccountDeps = {
    verifyIdToken: async (_p, token, audiences) => {
      const [sub, nonce] = token.split('|')
      return audiences.length && sub ? { sub, emailVerified: false, ...(nonce ? { nonce } : {}) } : undefined
    },
    // Like Cloudflare's: each Turnstile token passes once.
    siteverify: async (_s, t) => t.startsWith('tok-') && !usedTokens.has(t) && !!usedTokens.add(t),
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
// Like Cloudflare's: solved a moment after render, and again after each reset, with a new token each time.
const TURNSTILE = `let n = 0
window.turnstile = { render(el, o) { window.__ts = o; setTimeout(() => o.callback('tok-' + ++n), 10); return 'w1' }, reset() { setTimeout(() => window.__ts.callback('tok-' + ++n), 10) } }`

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
  await expect(page.locator('#acc-ways')).toBeHidden()
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await expect(page.locator('[data-where="account"]')).toBeVisible()
  // The sync writes after the page shows the account (line 105 waits the same way): read it once it has.
  await expect.poll(() => b.count('tank_records'), { timeout: 5000 }).toBe(1)

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
  // Turnstile solves again after its reset: that must not send a second mail by itself.
  await page.waitForTimeout(300)
  expect(b.mails).toHaveLength(1)
  await expect(page.locator('#acc-msg')).toContainText('Đã gửi mã tới Reader@Example.com')
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

test('Apple added to an account signed in with Google: Apple then opens the same account and its tanks', async ({ page, browser, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await addTank(page, 'Bể phòng khách')
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-add').click()
  await expect(page.locator('#acc-ways-add')).toBeVisible()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã thêm Apple')
  await expect(page.locator('#acc-status')).toContainText('Google, Apple')
  await expect(page.locator('#acc-ways')).toBeHidden()
  await expect(page.locator('#acc-add')).toBeVisible()
  expect([await b.count('users'), await b.count('credentials'), await b.count('sessions')]).toEqual([1, 2, 1])

  // Adding it again, with "Xóa tài khoản" opened in between (it readies Apple with a nonce of its own): it says so.
  await page.locator('#acc-add').click()
  await expect(page.locator('#acc-apple')).toBeEnabled()
  const armed = await page.evaluate(() => (window as unknown as { __a: { nonce: string } }).__a.nonce)
  await page.locator('#acc-leave summary').click()
  await page.waitForFunction(n => (window as unknown as { __a: { nonce: string } }).__a.nonce !== n, armed)
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toHaveText('Tài khoản này đã có cách đăng nhập đó.')

  // Another browser, or the iPhone app: Apple opens the account, with its tank.
  const other = await browser.newContext()
  await connect(other, b)
  await other.route(url => !url.href.startsWith(new URL(page.url()).origin) && !/google|appleid|cloudflare/.test(url.host), r => r.abort())
  const p2 = await other.newPage()
  await p2.goto(new URL(PAGE, page.url()).href)
  await p2.locator('#acc-open').click()
  await p2.locator('#acc-apple').click()
  await expect(p2.locator('#acc-status')).toContainText('Google, Apple')
  await expect(p2.locator('.tank h2')).toHaveText(['Bể phòng khách'])
  expect(await b.count('users')).toBe(1)
  await other.close()
  expect(errors).toEqual([])
})

test('adding a way long after signing in: a way the account has signs in again first, then the new one is added', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  // Signed in eleven minutes ago, as the page learns when it opens.
  const old = new Date(Date.now() - 11 * 60_000).toISOString()
  await b.env.DB!.prepare('UPDATE sessions SET created_at = ?').bind(old).run()
  await page.reload()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-add').click()
  await expect(page.locator('#acc-ways-reauth')).toHaveText('Vì an toàn, đăng nhập lại trước khi thêm: chọn một cách tài khoản này đang dùng (Google).')
  await expect(page.locator('#acc-ways-add')).toBeHidden()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-msg')).toHaveText('Đã đăng nhập lại. Giờ chọn cách muốn thêm.')
  await expect(page.locator('#acc-ways-add')).toBeVisible()
  await expect(page.locator('#acc-ways-reauth')).toBeHidden()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã thêm Apple')
  await expect(page.locator('#acc-status')).toContainText('Google, Apple')
  expect([await b.count('users'), await b.count('credentials'), await b.count('sessions')]).toEqual([1, 2, 1])

  // The page thinks its sign-in is recent, the server doesn't (another clock): the server says so, and the same way back.
  await b.env.DB!.prepare('UPDATE sessions SET created_at = ?').bind(old).run()
  await page.evaluate(() => { (window as unknown as { __sub: string }).__sub = 'g-2' })
  await page.locator('#acc-add').click()
  await expect(page.locator('#acc-ways-add')).toBeVisible()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-ways-reauth')).toContainText('Vì an toàn, đăng nhập lại trước khi thêm')
  await page.evaluate(() => { (window as unknown as { __sub: string }).__sub = 'apple-1' })
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toHaveText('Đã đăng nhập lại. Giờ chọn cách muốn thêm.')
  await page.evaluate(() => { (window as unknown as { __sub: string }).__sub = 'g-2' })
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã thêm Google')
  expect([await b.count('users'), await b.count('credentials'), await b.count('sessions')]).toEqual([1, 3, 1])
  expect(errors).toEqual([])
})

test('adding a way that has an account of its own: refused, with how to merge, and nothing joined', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-status')).toContainText('Apple')
  await page.locator('#acc-signout').click()
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-add').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toContainText('Cách đăng nhập này đã có tài khoản riêng. Để gộp')
  await expect(page.locator('#acc-status')).not.toContainText('Apple')
  expect([await b.count('users'), await b.count('credentials'), await b.count('sessions')]).toEqual([2, 2, 1])
  expect(errors).toEqual([])
})

test('an email address added to the account: the mail\'s link, opened in a new tab of this browser, adds it', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-add').click()
  await page.locator('#acc-email input[name=email]').fill('reader@example.com')
  await page.locator('#acc-email button[type=submit]').click()
  await expect(page.locator('#acc-code')).toBeVisible()
  expect(b.mails).toHaveLength(1)
  // The page opens again meanwhile (a phone's browser reloads a tab left behind): the address stays on its way.
  await page.reload()
  await expect(page.locator('#acc-status')).toContainText('Google')
  const link = /https?:\/\/\S+#ma=\d{6}/.exec(b.mails[0]!.text)![0]
  const tab = await page.context().newPage()
  await connect(tab, b)
  await tab.goto(new URL(new URL(link).pathname + new URL(link).hash, page.url()).href)
  await expect(tab.locator('#acc-msg')).toContainText('Đã thêm email')
  await expect(tab.locator('#acc-status')).toContainText('Google, email')
  expect(new URL(tab.url()).hash).toBe('')
  expect([await b.count('users'), await b.count('credentials'), await b.count('sessions')]).toEqual([1, 2, 1])
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

test('signing out and back in: one sign-in request per click, and a double-clicked code is sent once', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  const posts: string[] = []
  page.on('request', r => {
    const path = new URL(r.url()).pathname
    if (r.method() === 'POST' && /^\/api\/v1\/auth\/(apple|google|email\/start|email\/verify)$/.test(path)) posts.push(path.slice('/api/v1/auth/'.length))
  })
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-status')).toContainText('Apple')
  await page.locator('#acc-signout').click()
  await expect(page.locator('#acc-open')).toBeVisible()
  await expect(page.locator('#acc-ways')).toBeHidden()
  await page.locator('#acc-open').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-in')).toBeVisible()
  await expect(page.locator('#acc-status')).toContainText('Apple')
  await page.locator('#acc-signout').click()
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-in')).toBeVisible()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await page.locator('#acc-signout').click()
  await page.locator('#acc-open').click()
  await expect(page.locator('#acc-code')).toBeHidden()
  await page.locator('#acc-email input[name=email]').fill('reader@example.com')
  await page.locator('#acc-email button[type=submit]').click()
  await expect(page.locator('#acc-code')).toBeVisible()
  await page.locator('#acc-code input').fill(/\b(\d{6})\b/.exec(b.mails[0]!.text)![1]!)
  await page.locator('#acc-code button').dblclick()
  await expect(page.locator('#acc-status')).toContainText('email')
  await page.waitForTimeout(300)
  expect(posts).toEqual(['apple', 'apple', 'google', 'email/start', 'email/verify'])
  await expect(page.locator('#acc-msg')).toBeHidden()
  expect(errors).toEqual([])
})

test('a session ended elsewhere: the next sync says so and offers sign-in again', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Đồng bộ lúc')
  await b.env.DB!.prepare('DELETE FROM sessions').run()
  await page.locator('#acc-sync').click()
  await expect(page.locator('#acc-msg')).toContainText('Phiên đăng nhập đã hết')
  await expect(page.locator('#acc-open')).toBeVisible()
  await expect(page.locator('#acc-open')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#acc-ways')).toBeHidden()
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-in')).toBeVisible()
  await expect(page.locator('#acc-status')).toContainText('Google')
  expect(errors).toEqual([])
})

test('a session ended elsewhere, then adding a way: it says so and offers sign-in again', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Đồng bộ lúc')
  await b.env.DB!.prepare('DELETE FROM sessions').run()
  await page.locator('#acc-add').click()
  await page.locator('#acc-apple').click()
  await expect(page.locator('#acc-msg')).toContainText('Phiên đăng nhập đã hết')
  await expect(page.locator('#acc-open')).toBeVisible()
  await expect(page.locator('#acc-ways')).toBeHidden()
  expect(await b.count('users')).toBe(1)
  expect(errors).toEqual([])
})

test('a session ended elsewhere, then "delete": it says so and offers sign-in, instead of failing again and again', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Đồng bộ lúc')
  await b.env.DB!.prepare('DELETE FROM sessions').run()
  await page.locator('#tai-khoan details summary').click()
  page.on('dialog', d => d.accept())
  await page.locator('#acc-delete').click()
  await expect(page.locator('#acc-msg')).toContainText('Phiên đăng nhập đã hết')
  await expect(page.locator('#acc-open')).toBeVisible()
  expect(await b.count('users')).toBe(1)
  expect(errors).toEqual([])
})

test('a sync still on its way when the account is deleted does not overwrite "Đã xóa tài khoản"', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Đồng bộ lúc')
  let release!: () => void
  const held = new Promise<void>(r => (release = r))
  await page.route('**/api/v1/tanks/sync', async route => { await held; await route.fallback() })
  await page.locator('#acc-sync').click()
  await page.locator('#tai-khoan details summary').click()
  page.on('dialog', d => d.accept())
  await page.locator('#acc-delete').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã xóa tài khoản')
  release()
  await page.waitForResponse('**/api/v1/tanks/sync')
  await page.waitForTimeout(200)
  await expect(page.locator('#acc-msg')).toContainText('Đã xóa tài khoản')
  await expect(page.locator('#acc-open')).toBeVisible()
  expect(errors).toEqual([])
})

test('Apple added on another device after this page opened: deleting asks for Apple, then works', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.locator('#acc-open').click()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await b.env.DB!.prepare(`INSERT INTO credentials (id, user_id, kind, subject, created_at) VALUES ('c-apple', (SELECT id FROM users), 'apple', 'apple-9', '2026-10-31T00:00:00.000Z')`).run()
  await page.evaluate(() => { (window as unknown as { __sub: string }).__sub = 'apple-9' })
  await page.locator('#tai-khoan details summary').click()
  page.on('dialog', d => d.accept())
  await page.locator('#acc-delete').click()
  await expect(page.locator('#acc-msg')).toContainText('cần đăng nhập lại bằng Apple')
  expect(await b.count('users')).toBe(1)
  await page.locator('#acc-delete').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã xóa tài khoản')
  expect(b.revoked).toEqual(['apple-9'])
  expect(await b.count('users')).toBe(0)
  expect(errors).toEqual([])
})

test('an email sign-in left unfinished is forgotten once it expires', async ({ page }) => {
  const b = backend()
  await connect(page, b)
  await page.goto(PAGE)
  await page.evaluate(() => localStorage.setItem('aq.signin', JSON.stringify({ flow: 'f', until: '2000-01-01T00:00:00.000Z' })))
  await page.reload()
  await expect(page.locator('#tai-khoan')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aq.signin'))).toBeNull()
})

// Passkeys need a host name (an IP can't be a relying party): locally the page opens on localhost. Chrome's virtual
// authenticator stands in for Face ID, a fingerprint or the device PIN.
async function onPasskeyHost(page: Page, baseURL: string) {
  const local = baseURL.replace('//127.0.0.1:', '//localhost:')
  if (local !== baseURL) await page.route(url => url.hostname === 'localhost' && url.pathname !== '/_e', r => r.continue())
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  return { url: new URL(PAGE, local).href, verified: (on: boolean) => cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: on }) }
}

test('a passkey added to an account signs in to it on its own; a passkey the server no longer knows is refused', async ({ page, baseURL, errors }) => {
  const b = backend()
  b.env.PASSKEYS = 'on'
  const device = await onPasskeyHost(page, baseURL!)
  await connect(page, b)
  let passkeyPosts = 0
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/passkey') passkeyPosts++ })
  await page.goto(device.url)
  await addTank(page, 'Bể phòng khách')
  await page.locator('#acc-open').click()
  await expect(page.locator('#acc-passkey')).toBeVisible()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')

  await page.locator('#acc-passkey-add').click()
  await expect(page.locator('#acc-msg')).toContainText('Đã thêm passkey')
  await expect(page.locator('#acc-status')).toContainText('Google, passkey')
  // The same device again: the browser refuses (the account's passkeys are excluded), and says so.
  await page.locator('#acc-passkey-add').click()
  await expect(page.locator('#acc-msg')).toContainText('Máy này đã có passkey của tài khoản này')
  expect(await b.count("credentials WHERE kind = 'passkey'")).toBe(1)
  // Adding another way: a passkey has its own button, so the options don't offer the passkey sign-in.
  await page.locator('#acc-add').click()
  await expect(page.locator('#acc-ways-add')).toBeVisible()
  await expect(page.locator('#acc-passkey')).toBeHidden()

  // Signed out, the passkey alone signs back in to the same account, with its tanks.
  await page.locator('#acc-signout').click()
  await page.locator('#acc-open').click()
  // The reader closes the prompt: nothing to say, and the button works again.
  await device.verified(false)
  await page.locator('#acc-passkey').click()
  await expect(page.locator('#acc-passkey')).toBeEnabled()
  await expect(page.locator('#acc-msg')).toBeHidden()
  expect(passkeyPosts).toBe(0)
  await device.verified(true)
  await page.locator('#acc-passkey').click()
  await expect(page.locator('#acc-in')).toBeVisible()
  await expect(page.locator('#acc-status')).toContainText('Google, passkey')
  expect(await b.count('users')).toBe(1)
  expect(await b.count("credentials WHERE kind = 'passkey' AND last_used_at IS NOT NULL")).toBe(1)
  expect(passkeyPosts).toBe(1)

  // The account's passkey gone from the server (the account deleted on another device): refused, with a way out.
  await b.env.DB!.prepare(`DELETE FROM credentials WHERE kind = 'passkey'`).run()
  await page.locator('#acc-signout').click()
  await page.locator('#acc-open').click()
  await page.locator('#acc-passkey').click()
  await expect(page.locator('#acc-msg')).toContainText('Passkey này không mở được tài khoản nào')
  await expect(page.locator('#acc-in')).toBeHidden()
  expect(errors).toEqual([])
})

test('with passkeys off neither passkey button shows', async ({ page, baseURL, errors }) => {
  const b = backend()
  const device = await onPasskeyHost(page, baseURL!)
  await connect(page, b)
  await page.goto(device.url)
  await page.locator('#acc-open').click()
  await expect(page.locator('#acc-google button')).toBeVisible()
  await expect(page.locator('#acc-passkey')).toBeHidden()
  await page.locator('#acc-google button').click()
  await expect(page.locator('#acc-status')).toContainText('Google')
  await expect(page.locator('#acc-passkey-add')).toBeHidden()
  expect(errors).toEqual([])
})

test('the app\'s Turnstile page hands each token to the app, under its own content security policy', async ({ page, errors }) => {
  const b = backend()
  await connect(page, b)
  // Like Cloudflare's script: it calls the page back when loaded, solves a moment after render, and again after a reset.
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: `let n = 0, o
window.turnstile = { render(el, opts) { o = opts; window.__opts = opts; setTimeout(() => o.callback('tok-' + ++n), 10); return 'w1' }, reset() { setTimeout(() => o.callback('tok-' + ++n), 10) } }
window.onTurnstile()` }))
  // WKWebView's script message handler, as the app adds it.
  await page.addInitScript(() => { const got: unknown[] = []; Object.assign(window, { __got: got, webkit: { messageHandlers: { turnstile: { postMessage: (m: unknown) => got.push(m) } } } }) })
  const blocked: string[] = []
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) blocked.push(m.text()) })
  await page.goto('/api/v1/auth/email/turnstile?lang=id')
  const got = () => page.evaluate(() => (window as unknown as { __got: unknown[] }).__got)
  await expect.poll(got).toEqual([{ token: 'tok-1' }])
  expect(await page.evaluate(() => (window as unknown as { __opts: { sitekey: string; language: string } }).__opts)).toMatchObject({ sitekey: 'sk', language: 'id' })
  // A token is used once: the app asks for another.
  await page.evaluate(() => (window as unknown as { again: () => void }).again())
  await expect.poll(got).toEqual([{ token: 'tok-1' }, { token: 'tok-2' }])
  expect(blocked).toEqual([])
  expect(errors).toEqual([])
})

test('the app\'s Turnstile page: Cloudflare\'s script blocked, the app is told, and asking again says so too', async ({ page }) => {
  const b = backend()
  await connect(page, b)
  await page.route(/challenges\.cloudflare\.com/, route => route.abort('blockedbyclient'))
  await page.addInitScript(() => { const got: unknown[] = []; Object.assign(window, { __got: got, webkit: { messageHandlers: { turnstile: { postMessage: (m: unknown) => got.push(m) } } } }) })
  await page.goto('/api/v1/auth/email/turnstile?lang=vi')
  const got = () => page.evaluate(() => (window as unknown as { __got: unknown[] }).__got)
  await expect.poll(got).toEqual([{ error: 'load' }])
  await page.evaluate(() => (window as unknown as { again: () => void }).again())
  await expect.poll(got).toEqual([{ error: 'load' }, { error: 'none' }])
})

test.describe('inside the AquaTome app', () => {
  // The app's web view (apps/ios PageView): its user agent ends in AquaTomeApp/<version>.
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AquaTomeApp/1.0' })

  test('the app signs in and syncs: the page offers no sign-in and asks no session', async ({ page, errors }) => {
    const b = backend()
    await connect(page, b)
    const asked: string[] = []
    page.on('request', r => { if (r.url().includes('/api/') || SIGN_IN_SCRIPTS.test(r.url())) asked.push(new URL(r.url()).pathname) })
    await page.goto(PAGE)
    await addTank(page, 'Bể trong ứng dụng')
    await expect(page.locator('#tai-khoan')).toBeHidden()
    await page.waitForTimeout(300)
    expect(asked).toEqual([])
    expect(errors).toEqual([])
  })
})
