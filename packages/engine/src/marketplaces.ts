/**
 * Marketplaces and their short links: buy-link targets only, never fetched (JS walls, bot checks), and reached only
 * through their affiliate APIs (AGENTS.md: Shopee, Lazada, Tiki, Tokopedia).
 */
export const MARKETPLACE_DOMAINS = [
  'shopee.vn', 'shope.ee', 'shp.ee', 'vn.shp.ee', 'lazada.vn', 'lzd.co', 'tiki.vn', 'ti.ki', 'tokopedia.com', 'tokopedia.link',
  // The other countries the site serves: Shopee's and Lazada's own, which isMarketplace already tells by name.
  'shopee.co.id', 'shopee.co.th', 'shopee.com.my', 'lazada.co.id', 'lazada.co.th', 'lazada.com.my',
]

export function isMarketplace(url: string): boolean {
  let h: string
  try { h = new URL(url).hostname.toLowerCase() } catch { return true }
  return /(^|\.)(shopee|lazada)\.[a-z.]+$/.test(h) || MARKETPLACE_DOMAINS.some(d => h === d || h.endsWith(`.${d}`))
}
