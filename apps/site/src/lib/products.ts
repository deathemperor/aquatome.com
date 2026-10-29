import type { Content } from '@aq/schema'

export type Product = Content['products'][number]
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The product a video's kit names: same brand, and one model contains the other ("HBL-802" ~ "HBL802 hang-on filter"). */
export function productFor(c: Content, brand?: string, model?: string): Product | undefined {
  if (!brand || !model) return undefined
  const m = norm(model)
  return c.products.find(p => norm(p.brand) === norm(brand) && m.length >= 3 && (m.includes(norm(p.model)) || norm(p.model).includes(m)))
}

export const productHref = (p: Product) => `/vi/san-pham/${p.t.slug}/`

/** Video guides whose kit includes this product. */
export const videosUsing = (c: Content, p: Product) => c.guides.filter(g => g.video?.gear?.some(x => productFor(c, x.brand, x.model) === p))

/** Lowest and highest shop price in the market, when there are any. */
export function priceRange(p: Product): { min: number; max: number; n: number; at: string } | undefined {
  const xs = p.market?.prices.map(x => x.price) ?? []
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs), n: xs.length, at: p.market!.checkedAt } : undefined
}
export const vnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`
export const dmy = (iso: string) => iso.split('-').reverse().join('/')
