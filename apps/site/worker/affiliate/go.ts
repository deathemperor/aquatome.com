import { allowedTarget, isNetwork, NETWORKS, wrap, type AffEnv, type NetworkId } from './networks'

export type GoParams = { network: NetworkId; keyword: string; category: string; entityRef: string }
const FRESH_MS = 48 * 3_600_000

/** Parse /go/:network/?k=&c=&e= — only a keyword and labels are accepted, never a URL. */
export function parseGo(url: URL): GoParams | null {
  const network = url.pathname.split('/').filter(Boolean)[1]
  const keyword = (url.searchParams.get('k') ?? '').trim()
  const category = (url.searchParams.get('c') ?? '').slice(0, 40)
  const entityRef = (url.searchParams.get('e') ?? '').slice(0, 120)
  if (!isNetwork(network) || !keyword || keyword.length > 100) return null
  if (!/^[a-z0-9-]*$/.test(category) || !/^([a-z]+:[a-z0-9-]+)?$/.test(entityRef)) return null
  return { network, keyword, category, entityRef }
}

/** Best active, recently checked product for this placement, else for the keyword; else the (wrapped) marketplace search. */
export async function resolveGo(p: GoParams, db: D1Database, env: AffEnv, now: Date): Promise<{ location: string; productId: string }> {
  const fresh = new Date(now.getTime() - FRESH_MS).toISOString()
  const product = await db.prepare(
    `SELECT id, url FROM products WHERE network = ? AND status = 'active' AND checked_at > ?
       AND ((entity_ref = ? AND category = ?) OR keyword = ?)
     ORDER BY (entity_ref = ? AND category = ?) DESC, price_vnd IS NULL, price_vnd ASC LIMIT 1`,
  ).bind(p.network, fresh, p.entityRef, p.category, p.keyword, p.entityRef, p.category).first<{ id: string; url: string }>()
  const candidates = [...(product ? [{ url: product.url, id: product.id }] : []), { url: NETWORKS[p.network].searchUrl(p.keyword), id: 'search' }]
  for (const c of candidates) {
    const location = wrap(p.network, c.url, env)
    if (allowedTarget(p.network, location, env)) return { location, productId: c.id }
  }
  return { location: NETWORKS[p.network].searchUrl(p.keyword), productId: 'search' }
}

export async function recordClick(db: D1Database, p: GoParams, productId: string, now: Date): Promise<void> {
  await db.prepare(
    `INSERT INTO clicks_daily (date, network, category, entity_ref, product_id, n) VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT (date, network, category, entity_ref, product_id) DO UPDATE SET n = n + 1`,
  ).bind(now.toISOString().slice(0, 10), p.network, p.category, p.entityRef, productId).run()
}
