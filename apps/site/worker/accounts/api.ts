import { readCapped, siteverify as realSiteverify } from '../comments/api'
import { consume, emailHash, emailLink, normalEmail, type Lang, type SendMail } from './email'
import { verifyIdToken as realVerifyIdToken, type Provider, type VerifyIdToken } from './idtoken'
import { allow, ipOf } from './ratelimit'
import { CLEAR_COOKIE, cookieFor, createSession, randomToken, sameSiteOk, sessionOf, sha256, tokenOf, type Client, type Session } from './session'
import { loadStore, syncStore } from './tanks'
import { deleteUser, InUse, methodsOf, signInWith } from './users'

/**
 * /api/v1/*: optional accounts for "Bể của tôi" (sign in, sync saved tanks, export, delete). Contract:
 * protocols/accounts.openapi.json. Off unless ACCOUNTS is "on" (everyone) or "preview" (browsers with the owner flag).
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
}
type Siteverify = (secret: string, token: string, ip: string | null, host: string) => Promise<boolean>
export type AccountDeps = { verifyIdToken: VerifyIdToken; siteverify: Siteverify; sendMail?: SendMail }
export const realDeps: AccountDeps = { verifyIdToken: realVerifyIdToken, siteverify: realSiteverify }

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
    passkey: false,
  }
}

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

/** Signed in: a new session (cookie for the web, token for the app), or the same one when a sign-in method was added. */
async function done(env: Live, userId: string, client: Client, current: Session | undefined, now: Date): Promise<Response> {
  const user = await userView(env.DB, userId)
  if (current) return json({ user })
  const token = await createSession(env.DB, userId, client, now)
  return client === 'web' ? json({ user }, 200, { 'set-cookie': cookieFor(token, 'web') }) : json({ user, token })
}

export async function accounts(req: Request, url: URL, env: AccountsEnv, now: Date, deps: AccountDeps = realDeps): Promise<Response> {
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

  // Everything below changes something: from this site's pages, or from the app with no cookie.
  if (req.method !== 'GET' && !sameSiteOk(req, tokenOf(req)?.via === 'cookie')) return fail('cross_site', 403)

  if (req.method === 'POST' && path.startsWith('/api/v1/auth/')) {
    const body = await bodyOf(req)
    if (body === 'too_large') return fail('too_large', 413)
    if (!body) return fail('bad_request', 400)
    const client: Client = body.client === 'app' ? 'app' : 'web'
    // A browser sign-in sets a cookie: it must come from this site's pages.
    const signsIn = path === '/api/v1/auth/google' || path === '/api/v1/auth/apple' || path === '/api/v1/auth/email/verify'
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
      try {
        const userId = await signInWith(db, { kind: provider, subject: claims.sub, ...(email ? { emailHash: await emailHash(env.ACCOUNT_HMAC_KEY, email) } : {}), ...(session ? { signedIn: session.userId } : {}) }, now)
        return done(env, userId, client, session, now)
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
      const mail = await emailLink(db, k, email, lang, url.origin, now)
      return (await deps.sendMail!(mail)) ? none() : fail('mail_failed', 502)
    }

    if (path === '/api/v1/auth/email/verify') {
      if (typeof body.token !== 'string') return fail('bad_request', 400)
      const link = await consume(db, 'email', body.token, now)
      if (!link) return fail('bad_link', 401)
      try {
        const userId = await signInWith(db, { kind: 'email', subject: link.value, emailHash: link.value, ...(session ? { signedIn: session.userId } : {}) }, now)
        return done(env, userId, client, session, now)
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
  if (route === 'POST /api/v1/tanks/sync') {
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `sync|${session.userId}`, 600, HOUR_MS, now))) return fail('rate_limited', 429)
    const body = await bodyOf(req, 4_000_000)
    if (body === 'too_large') return fail('too_large', 413)
    if (!body) return fail('bad_request', 400)
    const out = await syncStore(db, session.userId, body.store, now)
    if ('error' in out) return fail(out.error, out.error === 'bad_store' ? 400 : 422)
    return json({ ...out, serverTime: now.toISOString() })
  }

  if (route === 'GET /api/v1/account/export') {
    const data = { exportedAt: now.toISOString(), user: await userView(db, session.userId), tanks: await loadStore(db, session.userId) }
    return json(data, 200, { 'content-disposition': `attachment; filename="aquatome-${now.toISOString().slice(0, 10)}.json"` })
  }
  if (route === 'DELETE /api/v1/account') {
    await deleteUser(db, session.userId)
    return none(session.via === 'cookie' ? { 'set-cookie': CLEAR_COOKIE } : {})
  }
  const m = /^\/api\/v1\/account\/methods\/([0-9a-f-]{36})$/.exec(path)
  if (m && req.method === 'DELETE') {
    const methods = await methodsOf(db, session.userId)
    if (!methods.some(x => x.id === m[1])) return fail('not_found', 404)
    if (methods.length === 1) return fail('last_method', 409)
    await db.prepare(`DELETE FROM credentials WHERE id = ? AND user_id = ?`).bind(m[1], session.userId).run()
    return none()
  }
  return fail('not_found', 404)
}
