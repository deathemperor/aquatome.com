import type { Content } from '@aq/schema'
import { GALLERY_MIN } from './gallery'
import { localizePath } from './i18n'

/**
 * Renamed Vietnamese pages: each earlier address (a page's `redirectFrom`) → the page now, with ?tu=<old slug>. An old
 * slug another page has taken since is that page's, and never redirects: the Worker reads this table before the page for /vi/….
 * An old address with no name (a page that was another animal's, page-folds.ts) forwards bare: no note, and its slug
 * never shows in the address the reader lands on.
 */
export function renamedPages(c: Pick<Content, 'species' | 'breeds' | 'plants' | 'guides' | 'galleries'>): Record<string, string> {
  const out: Record<string, string> = {}
  const kinds = [['ca', c.species], ['ca', c.breeds], ['cay', c.plants], ['huong-dan', c.guides]] as const
  const live = new Set(kinds.flatMap(([prefix, xs]) => xs.map(x => `${prefix}/${x.t.slug}`)))
  for (const [prefix, xs] of kinds)
    for (const x of xs) for (const r of x.t.redirectFrom ?? []) if (!live.has(`${prefix}/${r.slug}`)) {
      out[localizePath('vi', `/vi/${prefix}/${r.slug}/`)] = localizePath('vi', `/vi/${prefix}/${x.t.slug}/${r.name ? `?tu=${r.slug}` : ''}`)
      // Its photo page went with it (the address Google keeps), when it still has one.
      if (prefix !== 'huong-dan' && (c.galleries[x.id]?.length ?? 0) >= GALLERY_MIN) out[localizePath('vi', `/vi/${prefix}/${r.slug}/anh/`)] = localizePath('vi', `/vi/${prefix}/${x.t.slug}/anh/`)
    }
  return out
}
