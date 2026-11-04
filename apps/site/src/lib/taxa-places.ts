/**
 * The words of the taxon pages (/vi/phan-loai/…) and the origin pages (/vi/nguon-goc/…), in Vietnamese (t() translates
 * them). The pages and the app index's `labels` (lib/app-index.ts) both read them here, so the app's shelves say what
 * the pages say.
 */

/** The taxonomy section's title, then the rank of each level under it (order, family, genus): a page's depth picks its word. */
export const RANKS = ['Phân loại', 'Bộ', 'Họ', 'Chi'] as const

type Ranked = { order: string; family: string; genus: string }
/**
 * A species' ranks that have a name, top down, each with its level in RANKS (1 order, 2 family, 3 genus). A rank its
 * taxonomy has none of is skipped, not an empty step: a pond snail's family sits under groups ranked above "order", so
 * Lymnaeidae's page is /phan-loai/lymnaeidae/, listed on the root page with its rank's word.
 */
export const taxonRanks = (s: Ranked) =>
  ([[1, s.order], [2, s.family], [3, s.genus]] as const).filter(([, n]) => n.trim()).map(([level, name]) => ({ level, name, slug: name.toLowerCase() }))
/** The page of a species' family (2) or genus (3), through the ranks above it it has; undefined when it has no name at that rank. */
export function taxonHref(s: Ranked, level: 2 | 3): string | undefined {
  const r = taxonRanks(s)
  if (!r.some(x => x.level === level)) return undefined
  return `/vi/phan-loai/${r.filter(x => x.level <= level).map(x => x.slug).join('/')}/`
}
/** The keys of a species' taxon lists (list-data.ts), one per rank it has: phan-loai/<order>, …/<family>, …/<genus>. */
export const taxonKeys = (s: Ranked) => taxonRanks(s).map((_, i, all) => `phan-loai/${all.slice(0, i + 1).map(x => x.slug).join('/')}`)
/** A taxon page's line under its heading: its rank's word, its name and how many species it lists. */
export const TAXON_INTRO = '{level} {name}: {n} loài.'
/** The origin section's title. */
export const ORIGINS = 'Nguồn gốc'
/** A place page's line under its heading, unless the place has its own (PLACE_INTROS). */
export const PLACE_INTRO = '{n} loài có nguồn gốc từ {place}.'
/** A place's own heading, in place of its name, by place id. */
export const PLACE_TITLES: Record<string, string> = { vietnam: 'Cá Việt Nam' }
/** A place's own line under its heading, in place of PLACE_INTRO, by place id. */
export const PLACE_INTROS: Record<string, string> = {
  vietnam: 'Những loài cá có nguồn gốc từ sông suối Việt Nam, từ đồng bằng Mekong đến suối núi phía Bắc.',
}
