/**
 * The words of the taxon pages (/vi/phan-loai/…) and the origin pages (/vi/nguon-goc/…), in Vietnamese (t() translates
 * them). The pages and the app index's `labels` (lib/app-index.ts) both read them here, so the app's shelves say what
 * the pages say.
 */

/** The taxonomy section's title, then the rank of each level under it (order, family, genus): a page's depth picks its word. */
export const RANKS = ['Phân loại', 'Bộ', 'Họ', 'Chi'] as const
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
