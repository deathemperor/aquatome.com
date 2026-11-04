import type { BrowserContext, Page } from '@playwright/test'
import { accounts, type AccountDeps, type AccountsEnv } from '../worker/accounts/api'
import type { Mail } from '../worker/accounts/email'
import { testD1 } from '../worker/test/d1'

// The accounts API (worker/accounts) run in this process with a test database, for the pages that sign in ("Bể của
// tôi", the sign-in page). Google's, Apple's and Turnstile's scripts are stand-ins: an ID token is `<sub>|<nonce>|`, an
// Apple code `good-<sub>`.
export function backend() {
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
export type Backend = ReturnType<typeof backend>

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

export async function connect(target: Page | BrowserContext, b: Backend) {
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

// Passkeys need a host name (an IP can't be a relying party): locally the page opens on localhost. Chrome's virtual
// authenticator stands in for Face ID, a fingerprint or the device PIN.
export async function onPasskeyHost(page: Page, baseURL: string, path: string) {
  const local = baseURL.replace('//127.0.0.1:', '//localhost:')
  if (local !== baseURL) await page.route(url => url.hostname === 'localhost' && url.pathname !== '/_e', r => r.continue())
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  return { url: new URL(path, local).href, verified: (on: boolean) => cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: on }) }
}
