import type { Translation } from '@aq/schema'
import { slugify } from '@aq/schema/slug'

/**
 * The other names a species, breed or plant page is found by: its scientific name, its other names, the names of its
 * old addresses, and every name without accents ("ca neon do" for "Cá neon đỏ"; Pagefind folds accents but not đ).
 * Set on the page's h1 as Pagefind `aka` metadata, which is searched (weighted like the title, see the search page)
 * but never shown in a result's excerpt.
 */
export const searchAliases = (t: Pick<Translation, 'name' | 'altNames' | 'redirectFrom'>, scientificName?: string) =>
  [...(scientificName ? [scientificName] : []), ...t.altNames, ...(t.redirectFrom ?? []).map(r => r.name), slugify(`${t.name} ${t.altNames.join(' ')}`).replaceAll('-', ' ')].join(', ')
