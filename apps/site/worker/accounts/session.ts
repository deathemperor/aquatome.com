/**
 * Sessions: a random token the browser keeps in an HttpOnly cookie, or the app sends as a bearer token. Only its SHA-256
 * is stored (sessions.id), so a copy of the database can't sign anyone in.
 */
const DAY_MS = 86_400_000
export const COOKIE = '__Host-aq_session'
/** How long a session lasts without use; each day it is used, it starts again. */
export const SESSION_DAYS = { web: 180, app: 365 } as const
export type Client = keyof typeof SESSION_DAYS

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
export async function hmac(key: string, s: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(s)))
}

export const cookieFor = (token: string, client: Client) => `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS[client] * 86_400}; HttpOnly; Secure; SameSite=Lax`
export const CLEAR_COOKIE = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

export async function createSession(db: D1Database, userId: string, client: Client, now: Date): Promise<string> {
  const token = randomToken()
  const at = now.toISOString()
  await db.prepare(`INSERT INTO sessions (id, user_id, client, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(await sha256(token), userId, client, at, new Date(now.getTime() + SESSION_DAYS[client] * DAY_MS).toISOString(), at).run()
  return token
}

/** The token a request carries: a bearer token (the app) wins over the cookie, which is then not read at all. */
export function tokenOf(req: Request): { token: string; via: 'bearer' | 'cookie' } | undefined {
  const auth = req.headers.get('authorization')
  if (auth) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(auth)
    return m ? { token: m[1]!, via: 'bearer' } : undefined
  }
  const c = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,100})(?:;|$)`).exec(req.headers.get('cookie') ?? '')
  return c ? { token: c[1]!, via: 'cookie' } : undefined
}

export type Session = { id: string; userId: string; client: Client; via: 'bearer' | 'cookie' }

/** The request's live session, if any. A session used on a new day is extended (sliding expiry). */
export async function sessionOf(req: Request, db: D1Database, now: Date): Promise<Session | undefined> {
  const t = tokenOf(req)
  if (!t) return undefined
  const id = await sha256(t.token)
  const row = await db.prepare(`SELECT user_id, client, expires_at, last_seen_at FROM sessions WHERE id = ?`).bind(id)
    .first<{ user_id: string; client: Client; expires_at: string; last_seen_at: string }>()
  if (!row || row.expires_at <= now.toISOString()) return undefined
  // A cookie only signs in a browser session, a bearer token only an app session.
  if ((t.via === 'cookie') !== (row.client === 'web')) return undefined
  if (now.getTime() - Date.parse(row.last_seen_at) > DAY_MS) {
    await db.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .bind(now.toISOString(), new Date(now.getTime() + SESSION_DAYS[row.client] * DAY_MS).toISOString(), id).run()
  }
  return { id, userId: row.user_id, client: row.client, via: t.via }
}

/**
 * CSRF: a request that changes something must come from this site's own pages (Origin, Sec-Fetch-Site) unless it uses no
 * cookie at all. The app sends neither Origin nor a cookie: it signs in with `client: "app"` and then uses a bearer
 * token, which a page on another site can't make a browser send.
 */
export function sameSiteOk(req: Request, usesCookie: boolean): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const origin = req.headers.get('origin')
  if (origin) return origin === new URL(req.url).origin
  return !usesCookie
}
