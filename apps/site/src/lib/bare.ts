import type { Content, Localized, SpeciesEntity } from '@aq/schema'
import { LANGS, localizePath, type Lang } from './i18n'
import { albumOf, hasPhotoPage } from './photo-page'
import { taxonHref, taxonKeys } from './taxa-places'

/**
 * Each bare fish page's address (@aq/schema bareSpecies: nothing on keeping the fish, so the site builds no page for it),
 * in each language it had a page in and under each old address it had → its genus page where the genus keeps one, else
 * that language's fish list. Its photo page goes to the same place. A taxon page that listed only bare fish goes to the
 * nearest rank above it that keeps a page, or to the taxonomy's first page. (A group's numbered page past its list's new
 * end goes to the group's first page by itself: worker/paths.ts listParent.)
 */
export async function bareForwards(contentOf: (lang: Lang) => Promise<Pick<Content, 'species' | 'galleries' | 'pictureHashes'>>, bareOf: (lang: Lang) => Promise<Localized<SpeciesEntity>[]>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const lang of LANGS) {
    const bare = await bareOf(lang)
    if (!bare.length) continue
    const c = await contentOf(lang)
    // The taxon pages this language builds: phan-loai/<order>, …/<family>, …/<genus> of the fish it keeps.
    const live = new Set(c.species.flatMap(taxonKeys))
    const page = (key: string) => localizePath(lang, `/vi/${key}/`)
    const up = (key: string): string => { const k = key.slice(0, key.lastIndexOf('/')); return k === 'phan-loai' || live.has(k) ? k : up(k) }
    for (const s of bare) {
      const genus = taxonHref(s, 3)?.slice('/vi/'.length, -1)
      const to = genus && live.has(genus) ? page(genus) : localizePath(lang, '/vi/ca/')
      const photos = hasPhotoPage(albumOf(c, 'species', s))
      for (const slug of [s.t.slug, ...(s.t.redirectFrom ?? []).map(r => r.slug)]) {
        out[localizePath(lang, `/vi/ca/${slug}/`)] = to
        if (photos) out[localizePath(lang, `/vi/ca/${slug}/anh/`)] = to
      }
      for (const key of taxonKeys(s)) if (!live.has(key)) out[page(key)] = page(up(key))
    }
  }
  return out
}
