import { allowedTarget, isNetwork, NETWORKS, type AffEnv } from './networks'

type Input = { id: string; network: string; title: string; url: string; category: string; entity_ref?: string; keyword?: string; price_vnd?: number; image?: string; external_id?: string }

/** Validate one product for the catalog; listing URLs must be on the network's own hosts. */
export function validateProduct(p: unknown): Input | string {
  const x = p as Partial<Input>
  if (!x || typeof x !== 'object') return 'not an object'
  if (typeof x.id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(x.id)) return 'bad id'
  if (!isNetwork(x.network)) return 'unknown network'
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > 200) return 'bad title'
  if (typeof x.url !== 'string' || !allowedTarget(x.network, x.url, {}) || !NETWORKS[x.network].hosts.includes(new URL(x.url).host)) return 'url not on network host'
  if (typeof x.category !== 'string' || !/^[a-z0-9-]{2,40}$/.test(x.category)) return 'bad category'
  if (x.entity_ref !== undefined && !/^[a-z]+:[a-z0-9-]+$/.test(x.entity_ref)) return 'bad entity_ref'
  if (x.price_vnd !== undefined && (!Number.isInteger(x.price_vnd) || x.price_vnd < 0)) return 'bad price'
  return x as Input
}

export async function upsertProducts(db: D1Database, items: unknown[], now: Date, _env: AffEnv = {}): Promise<{ saved: number; errors: { index: number; error: string }[] }> {
  const errors: { index: number; error: string }[] = []
  let saved = 0
  for (const [index, raw] of items.entries()) {
    const p = validateProduct(raw)
    if (typeof p === 'string') { errors.push({ index, error: p }); continue }
    await db.prepare(
      `INSERT INTO products (id, network, external_id, title, url, price_vnd, image, category, entity_ref, keyword, status, fail_count, checked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)
       ON CONFLICT (id) DO UPDATE SET network = excluded.network, external_id = excluded.external_id, title = excluded.title, url = excluded.url,
         price_vnd = excluded.price_vnd, image = excluded.image, category = excluded.category, entity_ref = excluded.entity_ref, keyword = excluded.keyword`,
    ).bind(p.id, p.network, p.external_id ?? null, p.title, p.url, p.price_vnd ?? null, p.image ?? null, p.category, p.entity_ref ?? null, p.keyword ?? null, now.toISOString(), now.toISOString()).run()
    saved++
  }
  return { saved, errors }
}
