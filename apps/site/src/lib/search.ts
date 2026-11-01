import type { Translation } from '@aq/schema'
import { slugify } from '@aq/schema/slug'

/**
 * The other names a species, breed or plant page is found by: its scientific name and a plant's former ones
 * (`synonyms`), its other names, the names of its old addresses, and, for names with đ, the name without accents ("ca neon den" for "Cá neon đen": Pagefind matches
 * other letters without their accents on its own, but not đ). Set on the page's h1 as Pagefind `aka` metadata, which
 * is searched (ranked like the title, see the search page) but never shown in a result's excerpt.
 */
export const searchAliases = (t: Pick<Translation, 'name' | 'altNames' | 'redirectFrom'>, scientificName?: string, synonyms: string[] = []) => {
  const names = [t.name, ...t.altNames, ...(t.redirectFrom ?? []).map(r => r.name)]
  const former = synonyms.filter(s => !names.some(n => n.toLowerCase() === s.toLowerCase()))
  return [...(scientificName ? [scientificName] : []), ...former, ...names.slice(1), ...names.filter(n => /đ/i.test(n)).map(n => slugify(n).replaceAll('-', ' '))].join(', ')
}
