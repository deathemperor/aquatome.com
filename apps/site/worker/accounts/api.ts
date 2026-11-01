import { readCapped, siteverify as realSiteverify } from '../comments/api'
import { appleRevoker, type RevokeApple } from './apple'
import { checkEmail, consume, emailHash, normalEmail, startEmail, TANKS_PAGE, type Lang, type SendMail } from './email'
import { verifyIdToken as realVerifyIdToken, type Provider, type VerifyIdToken } from './idtoken'
import { cloudflareMailer, type EmailBinding } from './mailer'
import { addPasskey, checkPasskey, loginOptions, registrationOptions, type Rp } from './passkey'
import { allow, ipOf } from './ratelimit'
import { CLEAR_COOKIE, cookieFor, createSession, randomToken, sameSiteOk, sessionOf, sha256, tokenOf, type Client, type Session } from './session'
import { loadStore, syncStore } from './tanks'
import { deleteUser, InUse, methodsOf, removeMethod, signInWith } from './users'

/**
 * /api/v1/*: optional accounts for "Bể của tôi" (sign in, sync saved tanks, export, delete). Contract:
 * protocols/accounts.openapi.json. Off unless ACCOUNTS is "on" (everyone) or "preview" (browsers with the owner flag
 * cookie: hides the feature from readers while the owner tries it; anyone can set that cookie, so it protects nothing).
 */
export type AccountsEnv = {
  DB?: D1Database
  ACCOUNTS?: string
  /** Keys email hashes and rate-limit counters. Never rotate it: email sign-ins would stop finding their accounts. */
  ACCOUNT_HMAC_KEY?: string
  /** Comma-separated OAuth client ids whose tokens are accepted: the web client first (the page's button uses it). */
  GOOGLE_CLIENT_IDS?: string
  /** Comma-separated: the Services ID (web) first, then the app's bundle id. */
  APPLE_CLIENT_IDS?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_SITEKEY?: string
  /** Cloudflare Email Sending (sign-in codes). Without it, email sign-in is off. */
  EMAIL?: EmailBinding
  /** Sign in with Apple key (secret, a .p8's contents), its Key ID and the team: to revoke Apple tokens on deletion. */
  APPLE_SIGNIN_KEY?: string
  APPLE_SIGNIN_KEY_ID?: string
  APPLE_TEAM_ID?: string
  /** Passkeys (worker/accounts/passkey.ts): "on" to offer them. */
  PASSKEYS?: string
  /** This site's host: a passkey's relying party, answered only on it. */
  CANONICAL_HOST?: string
}
type Siteverify = (secret: string, token: string, ip: string | null, host: string) => Promise<boolean>
export type AccountDeps = { verifyIdToken: VerifyIdToken; siteverify: Siteverify; sendMail?: SendMail; revokeApple?: RevokeApple }
/** The real outside world for this environment: what it has bindings and secrets for. */
export function depsFor(env: AccountsEnv): AccountDeps {
  const keys = env.APPLE_TEAM_ID && env.APPLE_SIGNIN_KEY_ID && env.APPLE_SIGNIN_KEY ? { teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_SIGNIN_KEY_ID, key: env.APPLE_SIGNIN_KEY } : undefined
  return {
    verifyIdToken: realVerifyIdToken,
    siteverify: realSiteverify,
    ...(env.EMAIL ? { sendMail: cloudflareMailer(env.EMAIL) } : {}),
    ...(keys ? { revokeApple: appleRevoker(keys) } : {}),
  }
}

const HOUR_MS = 3_600_000
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } })
const fail = (error: string, status: number, headers: Record<string, string> = {}) => json({ error }, status, headers)
const none = (headers: Record<string, string> = {}) => new Response(null, { status: 204, headers: { 'cache-control': 'no-store', ...headers } })
const ids = (s?: string) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)
const LANGS: Lang[] = ['vi', 'id', 'th']

type Live = AccountsEnv & { DB: D1Database; ACCOUNT_HMAC_KEY: string }
const ready = (env: AccountsEnv): env is Live => Boolean(env.DB && env.ACCOUNT_HMAC_KEY)
const switchedOn = (env: AccountsEnv, req: Request) =>
  env.ACCOUNTS === 'on' || (env.ACCOUNTS === 'preview' && /(?:^|;\s*)aq_owner=1(?:;|$)/.test(req.headers.get('cookie') ?? ''))

/** What the page and the app may offer: providers with their public client ids, email when it can send and check Turnstile. */
function providers(env: Live, deps: AccountDeps) {
  const g = ids(env.GOOGLE_CLIENT_IDS)[0]
  const a = ids(env.APPLE_CLIENT_IDS)[0]
  return {
    google: g ? { clientId: g } : null,
    apple: a ? { clientId: a } : null,
    email: Boolean(deps.sendMail && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY),
    passkey: env.PASSKEYS === 'on',
  }
}

/**
 * The Turnstile widget alone, for the app's web view (WKWebView, a script message handler named `turnstile`): it posts
 * `{ token }` when solved, `{ expired: true }` when that token runs out, `{ error }` when the check fails, and `again()`
 * gives a new token. No other page may frame it; nothing to index.
 */
function turnstilePage(sitekey: string, lang: string | null): Response {
  const nonce = randomToken(16)
  const hl = LANGS.includes(lang as Lang) ? (lang as Lang) : 'vi'
  const settings = JSON.stringify({ sitekey, language: hl, size: 'flexible' }).replace(/</g, '\\u003c')
  const html = `<!doctype html><html lang="${hl}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AquaTome</title>
<style>html,body{margin:0;background:transparent}</style>
<script nonce="${nonce}">
const post = m => window.webkit?.messageHandlers?.turnstile?.postMessage(m)
let widget
window.onTurnstile = () => {
  widget = turnstile.render('#check', { ...${settings}, callback: token => post({ token }), 'expired-callback': () => post({ expired: true }), 'error-callback': error => { post({ error: String(error) }); return true } })
}
window.again = () => turnstile.reset(widget)
</script>
<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=onTurnstile" async></script>
</head><body><div id="check"></div></body></html>`
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'`,
    },
  })
}

/** Passkeys' relying party: this site's own host and origin, when they are on and the request came to it. */
const rpOf = (env: Live, url: URL): Rp | undefined =>
  env.PASSKEYS === 'on' && (!env.CANONICAL_HOST || url.hostname === env.CANONICAL_HOST) ? { id: url.hostname, origin: url.origin } : undefined

async function userView(db: D1Database, userId: string) {
  const u = await db.prepare(`SELECT created_at FROM users WHERE id = ?`).bind(userId).first<{ created_at: string }>()
  return { id: userId, createdAt: u?.created_at ?? null, methods: await methodsOf(db, userId) }
}

/** The JSON object a POST carries; requires application/json, which a form on another site can't send without asking. */
async function bodyOf(req: Request, max = 8192): Promise<Record<string, unknown> | 'too_large' | undefined> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return undefined
  const text = await readCapped(req, max)
  if (text === null) return 'too_large'
  try {
    const v = JSON.parse(text || '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/**
 * Signed in. Adding a sign-in method to the account signed in here (`adding`): that session goes on. Otherwise a new
 * session (cookie for the web, token for the app), and a session this client had before ends: signing in as someone
 * else switches accounts, it never joins the two.
 */
async function done(env: Live, userId: string, client: Client, adding: Session | undefined, before: Session | undefined, now: Date): Promise<Response> {
  const user = await userView(env.DB, userId)
  if (adding) return json({ user })
  if (before) await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(before.id).run()
  const token = await createSession(env.DB, userId, client, now)
  return client === 'web' ? json({ user }, 200, { 'set-cookie': cookieFor(token, 'web') }) : json({ user, token })
}

/**
 * Apple's rule for an account (or a sign-in method) going away: its Sign in with Apple tokens are revoked first, from a
 * fresh Apple sign-in whose code the request carries (worker/accounts/apple.ts). Nothing to do: undefined. Otherwise the
 * answer to give instead, when the revoke couldn't happen.
 */
async function revokeAppleFirst(env: Live, deps: AccountDeps, req: Request, url: URL, userId: string, subjects: string[], now: Date): Promise<Response | undefined> {
  if (!subjects.length || !deps.revokeApple) return undefined
  const body = await bodyOf(req)
  if (body === 'too_large') return fail('too_large', 413)
  const a = body?.apple as { code?: unknown; clientId?: unknown; redirectUri?: unknown } | undefined
  if (typeof a?.code !== 'string' || typeof a.clientId !== 'string') return fail('apple_reauth', 409)
  if (!ids(env.APPLE_CLIENT_IDS).includes(a.clientId)) return fail('bad_request', 400)
  // The web's code is tied to the page it was asked from: one of the tanks pages, exactly, or Apple refuses it.
  const pages = Object.values(TANKS_PAGE).map(p => `${url.origin}${p}`)
  if (a.redirectUri !== undefined && !(typeof a.redirectUri === 'string' && pages.includes(a.redirectUri))) return fail('bad_redirect', 400)
  // Every try costs a signed request to Apple.
  if (!(await allow(env.DB, env.ACCOUNT_HMAC_KEY, `apple-revoke|${userId}`, 10, HOUR_MS, now))) return fail('rate_limited', 429)
  try {
    const r = await deps.revokeApple(a.clientId, a.code, a.redirectUri as string | undefined, sub => subjects.includes(sub))
    if (r === 'other_account') return fail('apple_other_account', 409)
    return r === 'revoked' ? undefined : fail('apple_revoke_failed', 502)
  } catch (e) {
    console.error('apple revoke:', (e as Error).name)
    return fail('apple_revoke_failed', 502)
  }
}

export async function accounts(req: Request, url: URL, env: AccountsEnv, now: Date, deps: AccountDeps = depsFor(env)): Promise<Response> {
  const path = url.pathname.replace(/\/$/, '')
  const on = ready(env) && switchedOn(env, req)
  if (path === '/api/v1/session' && req.method === 'GET' && !on) return json({ accounts: false })
  if (!on) return fail('accounts_off', 404)
  const db = env.DB
  const session = await sessionOf(req, db, now)
  const route = `${req.method} ${path}`

  if (route === 'GET /api/v1/session') {
    const out = { accounts: true, providers: providers(env, deps), turnstileSitekey: env.TURNSTILE_SITEKEY ?? null, user: session ? await userView(db, session.userId) : null }
    // A browser that comes back gets its cookie's lifetime renewed, as its session's was.
    return session?.via === 'cookie' ? json(out, 200, { 'set-cookie': cookieFor(tokenOf(req)!.token, 'web') }) : json(out)
  }

  // The app's email sign-in: Turnstile runs only in a web page, on this site's host (siteverify checks the hostname), so the
  // app shows this one in a web view and takes the token from it.
  if (route === 'GET /api/v1/auth/email/turnstile') {
    if (!providers(env, deps).email) return fail('provider_off', 503)
    return turnstilePage(env.TURNSTILE_SITEKEY!, url.searchParams.get('lang'))
  }

  // Everything below changes something: from this site's pages, or from the app with no cookie.
  if (req.method !== 'GET' && !sameSiteOk(req, tokenOf(req)?.via === 'cookie')) return fail('cross_site', 403)

  if (req.method === 'POST' && path.startsWith('/api/v1/auth/')) {
    const body = await bodyOf(req)
    if (body === 'too_large') return fail('too_large', 413)
    if (!body) return fail('bad_request', 400)
    const client: Client = body.client === 'app' ? 'app' : 'web'
    // A browser sign-in sets a cookie: it must come from this site's pages.
    const signsIn = path === '/api/v1/auth/google' || path === '/api/v1/auth/apple' || path === '/api/v1/auth/email/verify' || path === '/api/v1/auth/passkey'
    if (signsIn && client === 'web' && !sameSiteOk(req, true)) return fail('cross_site', 403)
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `auth|${ipOf(req)}`, 60, HOUR_MS / 6, now))) return fail('rate_limited', 429)

    if (path === '/api/v1/auth/logout') {
      if (session) await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(session.id).run()
      return none({ 'set-cookie': CLEAR_COOKIE })
    }

    if (path === '/api/v1/auth/nonce') {
      const nonce = randomToken(16)
      await db.prepare(`INSERT INTO auth_challenges (id, kind, value, expires_at) VALUES (?, 'nonce', '', ?)`).bind(await sha256(nonce), new Date(now.getTime() + HOUR_MS / 6).toISOString()).run()
      return json({ nonce })
    }

    // A passkey signs in on its own once it was added to an account (POST /api/v1/account/passkey).
    if (path === '/api/v1/auth/passkey/options' || path === '/api/v1/auth/passkey') {
      const rp = rpOf(env, url)
      if (!rp) return fail('provider_off', 503)
      if (path === '/api/v1/auth/passkey/options') return json(await loginOptions(db, rp, now))
      const userId = await checkPasskey(db, rp, body.response, now)
      return userId ? done(env, userId, client, undefined, session, now) : fail('bad_passkey', 401)
    }

    // `link: true`: add this sign-in method to the account signed in here, only when asked for (a shared computer).
    const adding = body.link === true ? session : undefined
    if (body.link === true && !session) return fail('signed_out', 401)

    if (path === '/api/v1/auth/google' || path === '/api/v1/auth/apple') {
      const provider = path.slice('/api/v1/auth/'.length) as Provider
      const audiences = ids(provider === 'google' ? env.GOOGLE_CLIENT_IDS : env.APPLE_CLIENT_IDS)
      if (!audiences.length) return fail('provider_off', 503)
      if (typeof body.idToken !== 'string' || typeof body.nonce !== 'string') return fail('bad_request', 400)
      // The nonce we issued, used once, and inside the token as it is (web) or as its SHA-256 (Sign in with Apple on iOS).
      if (!(await consume(db, 'nonce', body.nonce, now))) return fail('bad_nonce', 401)
      const claims = await deps.verifyIdToken(provider, body.idToken, audiences)
      if (!claims) return fail('bad_token', 401)
      if (claims.nonce !== body.nonce && claims.nonce !== (await sha256(body.nonce))) return fail('bad_nonce', 401)
      const email = claims.emailVerified ? normalEmail(claims.email) : undefined
      // One Apple ID per account: deleting the account revokes it from one fresh Apple sign-in.
      if (provider === 'apple' && adding && (await db.prepare(`SELECT 1 FROM credentials WHERE user_id = ? AND kind = 'apple' AND subject != ?`).bind(adding.userId, claims.sub).first())) return fail('apple_already_linked', 409)
      try {
        const userId = await signInWith(db, { kind: provider, subject: claims.sub, ...(email ? { emailHash: await emailHash(env.ACCOUNT_HMAC_KEY, email) } : {}), ...(adding ? { signedIn: adding.userId } : {}) }, now)
        return done(env, userId, client, adding, session, now)
      } catch (e) {
        if (e instanceof InUse) return fail('credential_in_use', 409)
        throw e
      }
    }

    if (path === '/api/v1/auth/email/start') {
      if (!providers(env, deps).email) return fail('provider_off', 503)
      const email = normalEmail(body.email)
      if (!email) return fail('bad_email', 400)
      const lang = LANGS.includes(body.lang as Lang) ? (body.lang as Lang) : 'vi'
      if (typeof body.turnstile !== 'string' || !(await deps.siteverify(env.TURNSTILE_SECRET!, body.turnstile, req.headers.get('cf-connecting-ip'), url.hostname))) return fail('turnstile', 403)
      const k = env.ACCOUNT_HMAC_KEY
      const hash = await emailHash(k, email)
      const ok = (await allow(db, k, `mail-ip|${ipOf(req)}`, 10, HOUR_MS, now)) && (await allow(db, k, `mail-to|${hash}`, 3, HOUR_MS, now)) && (await allow(db, k, `mail-day|${now.toISOString().slice(0, 10)}`, 2000, 24 * HOUR_MS, now))
      if (!ok) return fail('rate_limited', 429)
      const { flow, mail } = await startEmail(db, k, email, lang, url.origin, adding?.userId, now, client === 'app')
      return (await deps.sendMail!(mail)) ? json({ flow }) : fail('mail_failed', 502)
    }

    if (path === '/api/v1/auth/email/verify') {
      if (typeof body.flow !== 'string' || typeof body.code !== 'string') return fail('bad_request', 400)
      const started = await checkEmail(db, body.flow, body.code, now)
      if (!started) return fail('bad_code', 401)
      // Started to add the address to an account: only for that account, signed in here. Otherwise: a sign-in.
      if (started.userId && started.userId !== session?.userId) return fail('bad_code', 401)
      const toAccount = started.userId ? session : undefined
      try {
        const userId = await signInWith(db, { kind: 'email', subject: started.value, emailHash: started.value, ...(toAccount ? { signedIn: toAccount.userId } : {}) }, now)
        return done(env, userId, client, toAccount, session, now)
      } catch (e) {
        if (e instanceof InUse) return fail('credential_in_use', 409)
        throw e
      }
    }
    return fail('not_found', 404)
  }

  if (!path.startsWith('/api/v1/tanks') && !path.startsWith('/api/v1/account')) return fail('not_found', 404)
  if (!session) return fail('signed_out', 401)

  if (route === 'GET /api/v1/tanks') return json({ store: await loadStore(db, session.userId), serverTime: now.toISOString() })

  // Adding a passkey to the account signed in: its options (a challenge for this account), then the new passkey.
  if (route === 'POST /api/v1/account/passkey/options' || route === 'POST /api/v1/account/passkey') {
    const rp = rpOf(env, url)
    if (!rp) return fail('provider_off', 503)
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `passkey-add|${session.userId}`, 20, HOUR_MS, now))) return fail('rate_limited', 429)
    if (route === 'POST /api/v1/account/passkey/options') return json(await registrationOptions(db, rp, session.userId, now))
    const body = await bodyOf(req, 16_384)
    if (body === 'too_large') return fail('too_large', 413)
    if (!body) return fail('bad_request', 400)
    const added = await addPasskey(db, rp, session.userId, body.response, now)
    if (added !== 'ok') return added === 'in_use' ? fail('credential_in_use', 409) : fail('bad_passkey', 400)
    return json({ user: await userView(db, session.userId) })
  }
  if (route === 'POST /api/v1/tanks/sync') {
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `sync|${session.userId}`, 600, HOUR_MS, now))) return fail('rate_limited', 429)
    const body = await bodyOf(req, 4_000_000)
    if (body === 'too_large') return fail('too_large', 413)
    if (!body) return fail('bad_request', 400)
    const out = await syncStore(db, session.userId, body.store, now)
    if ('error' in out) return fail(out.error, out.error === 'bad_store' ? 400 : out.error === 'busy' ? 409 : 422)
    return json({ ...out, serverTime: now.toISOString() })
  }

  if (route === 'GET /api/v1/account/export') {
    const data = { exportedAt: now.toISOString(), user: await userView(db, session.userId), tanks: await loadStore(db, session.userId) }
    return json(data, 200, { 'content-disposition': `attachment; filename="aquatome-${now.toISOString().slice(0, 10)}.json"` })
  }
  if (route === 'DELETE /api/v1/account') {
    const apple = (await db.prepare(`SELECT subject FROM credentials WHERE user_id = ? AND kind = 'apple'`).bind(session.userId).all<{ subject: string }>()).results
    const refused = await revokeAppleFirst(env, deps, req, url, session.userId, apple.map(x => x.subject), now)
    if (refused) return refused
    await deleteUser(db, session.userId)
    return none(session.via === 'cookie' ? { 'set-cookie': CLEAR_COOKIE } : {})
  }
  const m = /^\/api\/v1\/account\/methods\/([0-9a-f-]{36})$/.exec(path)
  if (m && req.method === 'DELETE') {
    const method = await db.prepare(`SELECT kind, subject, (SELECT COUNT(*) FROM credentials WHERE user_id = ?1) AS n FROM credentials WHERE id = ?2 AND user_id = ?1`)
      .bind(session.userId, m[1]!).first<{ kind: string; subject: string; n: number }>()
    if (!method) return fail('not_found', 404)
    if (method.n <= 1) return fail('last_method', 409)
    if (method.kind === 'apple') {
      const refused = await revokeAppleFirst(env, deps, req, url, session.userId, [method.subject], now)
      if (refused) return refused
    }
    const r = await removeMethod(db, session.userId, m[1]!)
    return r === 'removed' ? none() : r === 'last' ? fail('last_method', 409) : fail('not_found', 404)
  }
  return fail('not_found', 404)
}
