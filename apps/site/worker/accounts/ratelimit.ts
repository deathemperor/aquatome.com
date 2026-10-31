import { ipUnit } from '../comments/api'
import { hmac } from './session'

/** Counts a request against a limit per window; false once over it. The key is an HMAC: no IP or address is stored. */
export async function allow(db: D1Database, key: string, what: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
  const at = now.toISOString()
  const row = await db.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING count`).bind(await hmac(key, what), new Date(now.getTime() + windowMs).toISOString(), at, at).first<{ count: number }>()
  return (row?.count ?? 1) <= limit
}

/** The client's network for limits: an IPv6 /64 counts as one, as for comments. */
export const ipOf = (req: Request) => ipUnit(req.headers.get('cf-connecting-ip') ?? 'unknown')

/** Expired sessions, one-time values and counters (the daily cron). */
export async function purgeExpired(db: D1Database, now: Date): Promise<void> {
  const at = now.toISOString()
  await db.batch(['sessions', 'auth_challenges'].map(t => db.prepare(`DELETE FROM ${t} WHERE expires_at < ?`).bind(at))
    .concat(db.prepare(`DELETE FROM rate_limits WHERE reset_at < ?`).bind(at)))
}
