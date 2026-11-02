import { sessionOf } from '../accounts/session'
import { ENTITY_RE, checkRules, parseComment } from './rules'

export type CommentsEnv = {
  DB?: D1Database
  AB: KVNamespace
  TURNSTILE_SECRET?: string
  TURNSTILE_SITEKEY?: string
  COMMENT_HMAC_KEY?: string
  /** Decree 147 hook: 'phone' requires a verified commenter (no provider wired yet). */
  COMMENT_VERIFICATION?: string
}
export type PublicComment = { id: string; name: string; body: string; helpful: boolean; createdAt: string; author: string }
type Siteverify = (secret: string, token: string, ip: string | null, host: string) => Promise<boolean>

const DAY_MS = 86_400_000
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store', ...extra } })
const off = () => json({ error: 'comments_off' }, 503)

export const siteverify: Siteverify = async (secret, token, ip, host) => {
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const out = (await r.json().catch(() => ({}))) as { success?: boolean; hostname?: string }
  return r.ok && out.success === true && out.hostname === host
}

/** Pluggable Decree 147 check; 'ok' unless a verification mode is switched on. A signed-in account counts as verified. */
export async function verifyCommenter(_req: Request, env: CommentsEnv, signedIn = false): Promise<'ok' | 'verification_required'> {
  return env.COMMENT_VERIFICATION === 'phone' && !signedIn ? 'verification_required' : 'ok'
}

/**
 * Who posts (protocols/talk.openapi.json): a request with an Authorization header is the app, and posts as the account
 * of its live app session, checked as GET /api/v1/session checks it; 'session' when there is none (a bad, expired or
 * signed-out bearer), with no fallback to the page's way. undefined: the page's way (Origin and Turnstile).
 */
export async function appAccount(req: Request, db: D1Database, now: Date): Promise<string | 'session' | undefined> {
  if (!req.headers.has('authorization')) return undefined
  const s = await sessionOf(req, db, now)
  // An empty header makes sessionOf read the cookie: a browser's session never posts the app's way.
  return s?.via === 'bearer' ? s.userId : 'session'
}

/** IPv6 users control a whole /64, so that is the unit we limit (written out first: 2001:db8::1 is 2001:db8:0:0:…). */
export function ipUnit(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.toLowerCase().split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const full = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return full.concat(['0', '0', '0', '0']).slice(0, 4).map(x => x.replace(/^0+(?=.)/, '')).join(':')
}

/** Per-day rate-limit key: HMAC(what is counted + day) — the raw IP or account id is never written anywhere. */
async function dayKey(secret: string, unit: string, now: Date): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${unit}|${now.toISOString().slice(0, 10)}`))
  return `rl:${[...new Uint8Array(sig).slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')}`
}
export const ipDayKey = (secret: string, ip: string, now: Date) => dayKey(secret, ipUnit(ip), now)
/** An account's day: marked, so it never counts as an address. */
export const accountDayKey = (secret: string, account: string, now: Date) => dayKey(secret, `account:${account}`, now)
/** The day's keys a post counts against: its address's, and an app post's account's too (the limits stack). */
export const dayKeys = async (secret: string, ip: string | null, account: string | undefined, now: Date) =>
  [await ipDayKey(secret, ip ?? 'unknown', now), ...(account ? [await accountDayKey(secret, account, now)] : [])]

/** HMAC(secret, message) in hex, `bytes` long; one key import for many messages. */
export async function signer(secret: string, bytes: number): Promise<(message: string) => Promise<string>> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return async message => [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))).slice(0, bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A public post's `author` (protocols/talk.openapi.json), 16 hex characters: the same for everything one account posts,
 * and for a post without an account its own, so blocking it hides only that post. Never a name, email or address.
 */
export async function authors(secret: string): Promise<(post: { id: string; account_id: string | null }) => Promise<string>> {
  const sign = await signer(secret, 8)
  return p => sign(p.account_id ? `account:${p.account_id}` : `post:${p.id}`)
}

const live = (env: CommentsEnv): env is CommentsEnv & { DB: D1Database; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string } =>
  Boolean(env.DB && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY)

export { live as commentsLive }

/** GET /_c?e=species:x → approved comments only, plus what the form needs. */
export async function listComments(url: URL, env: CommentsEnv): Promise<Response> {
  if (!live(env)) return off()
  const e = url.searchParams.get('e') ?? ''
  if (!ENTITY_RE.test(e)) return json({ error: 'bad entity' }, 400)
  const { results } = await env.DB.prepare(
    `SELECT id, name, body, helpful, created_at, account_id FROM comments WHERE entity_ref = ? AND status = 'approved' ORDER BY created_at LIMIT 200`,
  ).bind(e).all<{ id: string; name: string; body: string; helpful: number; created_at: string; account_id: string | null }>()
  const author = await authors(env.COMMENT_HMAC_KEY)
  const comments: PublicComment[] = await Promise.all(results.map(async r => ({ id: r.id, name: r.name, body: r.body, helpful: r.helpful === 1, createdAt: r.created_at, author: await author(r) })))
  return json({ comments, sitekey: env.TURNSTILE_SITEKEY, verification: env.COMMENT_VERIFICATION === 'phone' ? 'phone' : 'none' }, 200, { 'cache-control': 'public, max-age=60' })
}

/** Body as text, or null past `max` bytes — without trusting content-length (chunked bodies have none). */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.byteLength }
  return new TextDecoder().decode(all)
}

/**
 * POST /_c: shape → static rules → Turnstile → rate limit → duplicate → insert. Cheapest checks first. The app (a
 * bearer) skips Origin and Turnstile, and its comment counts against its account's day too.
 */
export async function postComment(req: Request, env: CommentsEnv, now: Date, verify: Siteverify = siteverify): Promise<Response> {
  if (!live(env)) return off()
  const account = await appAccount(req, env.DB, now)
  if (account === 'session') return json({ error: 'session' }, 401)
  const origin = req.headers.get('origin')
  if (!account && origin !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)
  if ((await verifyCommenter(req, env, Boolean(account))) === 'verification_required') return json({ error: 'verification_required' }, 403)
  const text = await readCapped(req, 8192)
  if (text === null) return json({ error: 'too large' }, 413)
  const raw = (() => { try { return JSON.parse(text) as Record<string, unknown> } catch { return null } })()
  const c = parseComment(raw)
  if (typeof c === 'string') return json({ error: c }, 400)
  const ip = req.headers.get('cf-connecting-ip')
  const token = typeof raw?.token === 'string' ? raw.token : ''
  if (!account && (!token || !(await verify(env.TURNSTILE_SECRET, token, ip, new URL(req.url).hostname)))) return json({ error: 'turnstile' }, 403)

  // Past either day's limit, the comment is held.
  let postsToday = 0
  for (const rl of await dayKeys(env.COMMENT_HMAC_KEY, ip, account, now)) {
    const n = Number((await env.AB.get(rl)) ?? 0) + 1
    await env.AB.put(rl, String(n), { expirationTtl: 86_400 })
    postsToday = Math.max(postsToday, n)
  }
  const duplicate = Boolean(await env.DB.prepare(`SELECT 1 FROM comments WHERE entity_ref = ? AND body = ? AND created_at > ? LIMIT 1`)
    .bind(c.entityRef, c.body, new Date(now.getTime() - DAY_MS).toISOString()).first())

  const v = checkRules(c, { duplicate, postsToday })
  if ('reject' in v) return json({ error: v.reject }, 400)
  const status = 'ok' in v ? 'approved' : 'held'
  const id = crypto.randomUUID()
  const createdAt = now.toISOString()
  await env.DB.prepare(`INSERT INTO comments (id, entity_ref, name, body, status, helpful, reason, created_at, account_id) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .bind(id, c.entityRef, c.name, c.body, status, 'held' in v ? v.held : null, createdAt, account ?? null).run()
  const comment: PublicComment | undefined = status === 'approved' ? { id, name: c.name, body: c.body, helpful: false, createdAt, author: await (await authors(env.COMMENT_HMAC_KEY))({ id, account_id: account ?? null }) } : undefined
  return json({ status, comment }, 201)
}

/** `reports`: each reader's reason for reporting it ('' when they gave none). */
export type QueueItem = { id: string; entity_ref: string; name: string; body: string; status: 'approved' | 'held'; reason: string | null; created_at: string; reports: string[] }
export type Decision = { id: string; action: 'approve' | 'remove' | 'keep_held'; helpful: boolean; reason: string }
const ACTIONS = ['approve', 'remove', 'keep_held']

/** Everything the moderator hasn't seen, comments reported since it last looked, and held comments it deferred over a week ago; unseen first. */
export async function moderationQueue(db: D1Database, now: Date): Promise<QueueItem[]> {
  const { results } = await db.prepare(
    `SELECT id, entity_ref, name, body, status, reason, created_at,
       (SELECT json_group_array(COALESCE(reason, '')) FROM reports WHERE kind = 'comment' AND item_id = comments.id) AS reports
     FROM comments
     WHERE (status != 'removed' AND (decided_at IS NULL OR EXISTS (SELECT 1 FROM reports WHERE kind = 'comment' AND item_id = comments.id AND created_at > comments.decided_at)))
       OR (status = 'held' AND decided_at < ?)
     ORDER BY decided_at IS NOT NULL, created_at LIMIT 500`,
  ).bind(new Date(now.getTime() - 7 * DAY_MS).toISOString()).all<Omit<QueueItem, 'reports'> & { reports: string }>()
  return results.map(r => ({ ...r, reports: JSON.parse(r.reports) as string[] }))
}

/** Apply moderator decisions; malformed entries and unknown ids are ignored. */
export async function applyDecisions(db: D1Database, items: unknown[], now: Date): Promise<{ applied: number; ignored: number }> {
  let applied = 0
  const at = now.toISOString()
  for (const raw of items) {
    const d = raw as Partial<Decision>
    if (typeof d?.id !== 'string' || !ACTIONS.includes(d.action as string) || typeof d.helpful !== 'boolean' || typeof d.reason !== 'string') continue
    // keep_held = "no change": a held comment stays held, an approved one stays public.
    const status = d.action === 'approve' ? 'approved' : d.action === 'remove' ? 'removed' : null
    const r = await db.prepare(
      `UPDATE comments SET status = COALESCE(?, status), helpful = CASE WHEN COALESCE(?, status) = 'approved' THEN ? ELSE 0 END, reason = ?, decided_at = ?
       WHERE id = ? AND status != 'removed'`,
    ).bind(status, status, d.helpful ? 1 : 0, d.reason.slice(0, 300), at, d.id).run()
    applied += r.meta.changes ?? 0
  }
  return { applied, ignored: items.length - applied }
}

/** Removed comments are kept 30 days for appeal, then deleted; so are the reports of comments and photos no longer kept. */
export async function purgeRemoved(db: D1Database, now: Date): Promise<number> {
  const r = await db.prepare(`DELETE FROM comments WHERE status = 'removed' AND decided_at < ?`).bind(new Date(now.getTime() - 30 * DAY_MS).toISOString()).run()
  await db.prepare(`DELETE FROM reports WHERE item_id NOT IN (SELECT id FROM comments UNION ALL SELECT id FROM photos WHERE status != 'removed')`).run()
  return r.meta.changes ?? 0
}
