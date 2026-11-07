import type { Content } from '@aq/schema'
import { localizePath } from './i18n'

/**
 * Renamed Vietnamese pages: each earlier address (a page's `redirectFrom`) → the page now, with ?tu=<old slug>. An old
 * slug another page has taken since is that page's, and never redirects: the Worker reads this table before the page for /vi/….
 */
export function renamedPages(c: Pick<Content, 'species' | 'breeds' | 'plants' | 'guides'>): Record<string, string> {
  const out: Record<string, string> = {}
  const kinds = [['ca', c.species], ['ca', c.breeds], ['cay', c.plants], ['huong-dan', c.guides]] as const
  const live = new Set(kinds.flatMap(([prefix, xs]) => xs.map(x => `${prefix}/${x.t.slug}`)))
  for (const [prefix, xs] of kinds)
    for (const x of xs) for (const r of x.t.redirectFrom ?? []) if (!live.has(`${prefix}/${r.slug}`)) out[localizePath('vi', `/vi/${prefix}/${r.slug}/`)] = localizePath('vi', `/vi/${prefix}/${x.t.slug}/?tu=${r.slug}`)
  return out
}
