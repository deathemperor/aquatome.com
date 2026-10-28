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
export type PublicComment = { id: string; name: string; body: string; helpful: boolean; createdAt: string }
type Siteverify = (secret: string, token: string, ip: string | null) => Promise<boolean>

const DAY_MS = 86_400_000
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store', ...extra } })
const off = () => json({ error: 'comments_off' }, 503)

export const siteverify: Siteverify = async (secret, token, ip) => {
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  return r.ok && ((await r.json()) as { success?: boolean }).success === true
}

/** Pluggable Decree 147 check; 'ok' unless a verification mode is switched on. */
export async function verifyCommenter(_req: Request, env: CommentsEnv): Promise<'ok' | 'verification_required'> {
  return env.COMMENT_VERIFICATION === 'phone' ? 'verification_required' : 'ok'
}

/** Per-day rate-limit key: HMAC(ip + day) — the raw IP is never written anywhere. */
export async function ipDayKey(secret: string, ip: string, now: Date): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ip}|${now.toISOString().slice(0, 10)}`))
  return `rl:${[...new Uint8Array(sig).slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('')}`
}

const live = (env: CommentsEnv): env is CommentsEnv & { DB: D1Database; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string } =>
  Boolean(env.DB && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY)

/** GET /_c?e=species:x → approved comments only, plus what the form needs. */
export async function listComments(url: URL, env: CommentsEnv): Promise<Response> {
  if (!live(env)) return off()
  const e = url.searchParams.get('e') ?? ''
  if (!ENTITY_RE.test(e)) return json({ error: 'bad entity' }, 400)
  const { results } = await env.DB.prepare(
    `SELECT id, name, body, helpful, created_at FROM comments WHERE entity_ref = ? AND status = 'approved' ORDER BY created_at LIMIT 200`,
  ).bind(e).all<{ id: string; name: string; body: string; helpful: number; created_at: string }>()
  const comments: PublicComment[] = results.map(r => ({ id: r.id, name: r.name, body: r.body, helpful: r.helpful === 1, createdAt: r.created_at }))
  return json({ comments, sitekey: env.TURNSTILE_SITEKEY, verification: env.COMMENT_VERIFICATION === 'phone' ? 'phone' : 'none' }, 200, { 'cache-control': 'public, max-age=60' })
}

/** POST /_c: shape → static rules → Turnstile → rate limit → duplicate → insert. Cheapest checks first. */
export async function postComment(req: Request, env: CommentsEnv, now: Date, verify: Siteverify = siteverify): Promise<Response> {
  if (!live(env)) return off()
  const origin = req.headers.get('origin')
  if (origin !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)
  if (Number(req.headers.get('content-length') ?? 0) > 8192) return json({ error: 'too large' }, 413)
  if ((await verifyCommenter(req, env)) === 'verification_required') return json({ error: 'verification_required' }, 403)
  const raw = await req.json().catch(() => null) as Record<string, unknown> | null
  const c = parseComment(raw)
  if (typeof c === 'string') return json({ error: c }, 400)
  const ip = req.headers.get('cf-connecting-ip')
  const token = typeof raw?.token === 'string' ? raw.token : ''
  if (!token || !(await verify(env.TURNSTILE_SECRET, token, ip))) return json({ error: 'turnstile' }, 403)

  const rl = await ipDayKey(env.COMMENT_HMAC_KEY, ip ?? 'unknown', now)
  const postsToday = Number((await env.AB.get(rl)) ?? 0) + 1
  await env.AB.put(rl, String(postsToday), { expirationTtl: 86_400 })
  const duplicate = Boolean(await env.DB.prepare(`SELECT 1 FROM comments WHERE body = ? AND created_at > ? LIMIT 1`)
    .bind(c.body, new Date(now.getTime() - DAY_MS).toISOString()).first())

  const v = checkRules(c, { duplicate, postsToday })
  if ('reject' in v) return json({ error: v.reject }, 400)
  const status = 'ok' in v ? 'approved' : 'held'
  const id = crypto.randomUUID()
  const createdAt = now.toISOString()
  await env.DB.prepare(`INSERT INTO comments (id, entity_ref, name, body, status, helpful, reason, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
    .bind(id, c.entityRef, c.name, c.body, status, 'held' in v ? v.held : null, createdAt).run()
  const comment: PublicComment | undefined = status === 'approved' ? { id, name: c.name, body: c.body, helpful: false, createdAt } : undefined
  return json({ status, comment }, 201)
}

export type QueueItem = { id: string; entity_ref: string; name: string; body: string; status: 'approved' | 'held'; reason: string | null; created_at: string }
export type Decision = { id: string; action: 'approve' | 'remove' | 'keep_held'; helpful: boolean; reason: string }
const ACTIONS = ['approve', 'remove', 'keep_held']

/** Held comments, plus approved ones the moderator hasn't seen yet (last 48 h). */
export async function moderationQueue(db: D1Database, now: Date): Promise<QueueItem[]> {
  const { results } = await db.prepare(
    `SELECT id, entity_ref, name, body, status, reason, created_at FROM comments
     WHERE status = 'held' OR (status = 'approved' AND decided_at IS NULL AND created_at > ?) ORDER BY created_at LIMIT 500`,
  ).bind(new Date(now.getTime() - 2 * DAY_MS).toISOString()).all<QueueItem>()
  return results
}

/** Apply moderator decisions; malformed entries and unknown ids are ignored. */
export async function applyDecisions(db: D1Database, items: unknown[], now: Date): Promise<{ applied: number; ignored: number }> {
  let applied = 0
  const at = now.toISOString()
  for (const raw of items) {
    const d = raw as Partial<Decision>
    if (typeof d?.id !== 'string' || !ACTIONS.includes(d.action as string) || typeof d.helpful !== 'boolean' || typeof d.reason !== 'string') continue
    const status = d.action === 'approve' ? 'approved' : d.action === 'remove' ? 'removed' : 'held'
    const r = await db.prepare(`UPDATE comments SET status = ?, helpful = ?, reason = ?, decided_at = ? WHERE id = ? AND status != 'removed'`)
      .bind(status, d.helpful && status === 'approved' ? 1 : 0, d.reason.slice(0, 300), at, d.id).run()
    applied += r.meta.changes ?? 0
  }
  return { applied, ignored: items.length - applied }
}

/** Removed comments are kept 30 days for appeal, then deleted. */
export async function purgeRemoved(db: D1Database, now: Date): Promise<number> {
  const r = await db.prepare(`DELETE FROM comments WHERE status = 'removed' AND decided_at < ?`).bind(new Date(now.getTime() - 30 * DAY_MS).toISOString()).run()
  return r.meta.changes ?? 0
}
