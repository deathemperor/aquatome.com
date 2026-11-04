import { countryName, PLACE_ALIASES, placeCountry, recordsInside, recordsOutside, slugify, type Content, type SpeciesRange } from '@aq/schema'
import type { Lang } from './i18n'

/**
 * A species' range as the app index gives it (AppItem.range; content `range`, protocols/range-vectors.json): what a page
 * says in words, not the map's cells, which only a map draws.
 */
export type AppRange = {
  /** The countries its sources give as its natural range, ISO 3166-1 alpha-2, in their order: named in AppIndex.countries. */
  native?: string[]
  /** The river basins, lakes and regions they name, in this language where the site has a place of that name, else as written. */
  regions?: string[]
  /**
   * Its wild records on GBIF: how many, those in a native country and the 5 countries outside with the most (most first,
   * then by code: each named in AppIndex.countries), both only when there are native countries; its GBIF taxon and the
   * day they were counted, for the credit ("GBIF.org, <total> records, CC BY 4.0").
   */
  records?: { total: number; inside?: number; outside?: [string, number][]; taxonKey: number; fetched: string }
}

/** A country as the index names it: its name in this language, and the place id of its origin page when it has one. */
export type AppCountry = { name: string; place?: string }

/** The app index's form of a content range; none when it has neither part. */
export function appRange(range: SpeciesRange | undefined, regionName: (name: string) => string = n => n): AppRange | undefined {
  if (!range?.native && !range?.records) return undefined
  const { native, records } = range
  const inside = recordsInside(range)
  const outside = recordsOutside(range)
  return {
    ...(native?.countries.length ? { native: native.countries } : {}),
    ...(native?.regions.length ? { regions: native.regions.map(regionName) } : {}),
    ...(records ? { records: { total: records.total, ...(inside !== undefined ? { inside, outside } : {}), taxonKey: records.taxonKey, fetched: records.fetched } } : {}),
  }
}

/** A region's name in this language: the site's place of that name (a river or region page's own name), else as written. */
export function regionNames(places: Content['places']): (name: string) => string {
  const byId = new Map(places.map(p => [p.id, p.t.name]))
  return name => byId.get(PLACE_ALIASES[slugify(name)] ?? slugify(name)) ?? name
}

/**
 * Countries by code in this language: the site's own country place's name (an origin page's first, `paged`), else
 * `Intl.DisplayNames`' name; `place` only for a country with an origin page.
 */
export function countryNames(lang: Lang, places: Content['places'], paged: Set<string>): (code: string) => AppCountry {
  const own = new Map<string, Content['places'][number]>()
  for (const p of [...places].sort((a, b) => Number(paged.has(b.id)) - Number(paged.has(a.id)))) {
    const code = p.kind === 'country' ? placeCountry(p.id) : undefined
    if (code && !own.has(code)) own.set(code, p)
  }
  return code => {
    const p = own.get(code)
    return { name: p?.t.name ?? countryName(code, lang), ...(p && paged.has(p.id) ? { place: p.id } : {}) }
  }
}
