import type { Content } from '@aq/schema'
import { citeMark } from './cite'
import { LANG, translator, type Lang } from './i18n'
import { clock } from './video'

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
export const vnd = (lang: Lang, n: number) => `${n.toLocaleString(LANG[lang].locale)} ₫`
export const dmy = (iso: string) => iso.split('-').reverse().join('/')

type Cite = { url: string; t?: number }
/** A video's address at a moment; the address that cites nothing else, as it is. */
export const citeHref = (c: Cite) => (c.t === undefined ? c.url : `${c.url}&t=${c.t}`)
/**
 * A claim's mark: its source's number in the page's list, linking to the source, a review at the moment it says so. A claim
 * whose source isn't listed gets none (research can list the sources again; the engine keeps them, a test holds it).
 */
export function productMark(lang: Lang, p: Pick<Product, 'sources'>, c: Cite): string {
  const t = translator(lang)
  const i = p.sources.findIndex(s => s.url === c.url)
  const s = p.sources[i]
  if (!s) return ''
  const card = s.kind === 'video' ? { tip: `YouTube · ${c.t === undefined ? '' : clock(c.t)}`, more: t('Xem đoạn này ↗') } : { tip: t('Ghi chép AquaTome tự thử'), more: t('Xem ghi chép ↗') }
  return citeMark(lang, i + 1, s.title, citeHref(c), card)
}
