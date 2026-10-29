/** Marketplaces and their short links: buy-link targets only, never fetched (JS walls, bot checks). */
export const MARKETPLACE_DOMAINS = ['shopee.vn', 'shope.ee', 'shp.ee', 'vn.shp.ee', 'lazada.vn', 'lzd.co', 'tiki.vn', 'ti.ki']

export function isMarketplace(url: string): boolean {
  let h: string
  try { h = new URL(url).hostname.toLowerCase() } catch { return true }
  return /(^|\.)(shopee|lazada)\.[a-z.]+$/.test(h) || MARKETPLACE_DOMAINS.some(d => h === d || h.endsWith(`.${d}`))
}
