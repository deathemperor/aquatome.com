import { NETWORKS, type AffEnv, type Product } from './networks'

const STALE_MS = 20 * 3_600_000
export const STRIKES = 2

/** Daily: check active (and recently failed) products; two dead results in a row → inactive; a later pass revives. */
export async function runChecks(db: D1Database, env: AffEnv, now: Date, limit = 500): Promise<{ checked: number; deactivated: number }> {
  const stale = new Date(now.getTime() - STALE_MS).toISOString()
  const { results } = await db.prepare(`SELECT * FROM products WHERE (checked_at IS NULL OR checked_at < ?) ORDER BY checked_at LIMIT ?`).bind(stale, limit).all<Product>()
  let deactivated = 0
  const at = now.toISOString()
  for (const p of results) {
    const r = await NETWORKS[p.network].check(p, env).catch((e: Error): { result: 'unknown'; detail: string } => ({ result: 'unknown', detail: e.message }))
    if (r.result === 'ok') {
      await db.prepare(`UPDATE products SET status = 'active', fail_count = 0, checked_at = ?, price_vnd = COALESCE(?, price_vnd) WHERE id = ?`).bind(at, r.price_vnd ?? null, p.id).run()
    } else if (r.result === 'dead') {
      const fails = p.fail_count + 1
      if (fails >= STRIKES && p.status === 'active') deactivated++
      await db.prepare(`UPDATE products SET fail_count = ?, status = ?, checked_at = ? WHERE id = ?`).bind(fails, fails >= STRIKES ? 'inactive' : p.status, at, p.id).run()
    } else {
      await db.prepare(`UPDATE products SET checked_at = ? WHERE id = ?`).bind(at, p.id).run()
    }
    await db.prepare(`INSERT INTO checks (product_id, at, result, detail) VALUES (?, ?, ?, ?)`).bind(p.id, at, r.result, 'detail' in r ? (r.detail ?? null) : null).run()
  }
  return { checked: results.length, deactivated }
}
