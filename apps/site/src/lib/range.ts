import { createHash } from 'node:crypto'
import { CELL_DEG, countryName, PLACE_ALIASES, placeCountry, recordsInside, recordsOutside, slugify, type Content, type SourceId, type SpeciesRange } from '@aq/schema'
import { fmt } from './format'
import { served, translator, type Lang } from './i18n'
import { mapSvg, rangeMap, type RangeMap, type SquareKind } from './range-map'

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

/** A place's name where it starts a chip, a heading or a list item: stored as written in a sentence ("sông Hồng"). */
export const capitalized = (name: string) => name.charAt(0).toLocaleUpperCase('vi') + name.slice(1)

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
    return { name: capitalized(p?.t.name ?? countryName(code, lang)), ...(p && paged.has(p.id) ? { place: p.id } : {}) }
  }
}

/** The origin pages (pages/nguon-goc/[...path].astro): the continents, and the countries under one; none in a language without them. */
export const originPages = (lang: Lang, c: Content) =>
  served(lang, '/vi/nguon-goc/x/') ? c.places.filter(p => p.kind === 'continent' || (p.kind === 'country' && !!p.parent)) : []

/** About how far a square's side is on the ground, in km, at the equator (1° ≈ 111 km), to the nearest 10. */
const squareKm = (step: number) => Math.round((CELL_DEG * step * 111) / 10) * 10

/**
 * A species' records map as the app's picture: its PNG's address on the site (by the SVG's hash, so the app, which keeps
 * a picture by its address, never shows an old map) and the SVG it is drawn from. None without records.
 */
export function rangePicture(id: string, range: SpeciesRange | undefined): { map: RangeMap; file: string; svg: string } | undefined {
  if (!range) return undefined
  // Drawn once a build for each species' range (its page, its copy and its PNG all ask).
  const done = pictures.get(range)
  if (done?.id === id) return done.pic
  const map = rangeMap(range)
  const svg = map && mapSvg(map, 'png')
  const pic = map && svg ? { map, svg, file: `/app/range/${id}-${createHash('sha256').update(svg).digest('hex').slice(0, 10)}.png` } : undefined
  pictures.set(range, { id, pic })
  return pic
}
const pictures = new WeakMap<SpeciesRange, { id: string; pic?: { map: RangeMap; file: string; svg: string } }>()

/** GBIF's own page of the records the map draws: the same filters as the engine's (range-records.ts), as gbif.org writes them. */
export function gbifSearch(taxonKey: number): string {
  const p = new URLSearchParams({ taxon_key: String(taxonKey), occurrence_status: 'present', has_coordinate: 'true', has_geospatial_issue: 'false' })
  for (const b of ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE', 'MATERIAL_CITATION', 'OCCURRENCE']) p.append('basis_of_record', b)
  for (const l of ['CC0_1_0', 'CC_BY_4_0']) p.append('license', l)
  return `https://www.gbif.org/occurrence/search?${p}`
}

/** The legend's words for each kind of square, and its sign in the app's caption (which has no pictures of them). */
const SQUARES: Record<SquareKind, [label: string, sign: string]> = {
  in: ['Ghi nhận trong các nước bản địa', '■'], both: ['Ô có cả hai', '◩'], out: ['Ghi nhận ở nơi khác', '□'], rec: ['Nơi có ghi nhận', '■'],
}

export type RangeParts = {
  title: string
  /** Where its sources say it lives (paragraphs): the countries, linked to their origin pages, then the regions, each line ending with its sources' marks. */
  words: string
  /** The sentence each country and region rests on, by sentence (a list), from the sources the page cites: on request on the page. */
  said?: { title: string; html: string }
  /** Its wild records on GBIF, in words (a paragraph): how many, and with native countries how many are in them and where the rest are most. */
  records?: string
  /** The records' map: inline on the page (`svg`), the app's picture (`file`, w × h), its words for a screen reader, its legend and the app's caption. */
  map?: { svg: string; file: string; w: number; h: number; alt: string; legend: { kind: SquareKind | 'native'; label: string }[]; scale: string; caption: string }
  /** The records' credit: GBIF, the count and the day (`text`, "GBIF.org" linked to `url` on the page), the licences; and the outline's. */
  credit?: { text: string; licence: string; url: string; base: string }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The species page's "Phân bố tự nhiên" (components/RangeBlock.astro, and the app's copy, lib/app-page.ts), from its
 * range: none when it has none, words only without records, the records' words and map only without a native range.
 * `mark`: a source's numbered mark as the page's text has it (lib/section-parts.ts), '' for a source the page doesn't
 * cite; a sentence is shown only from a source the page cites (so only from sources the build may show).
 */
export function rangeParts(lang: Lang, c: Content, s: { id: string; name: string; range?: SpeciesRange }, mark: (source: SourceId) => string): RangeParts | undefined {
  const { native, records } = s.range ?? {}
  const shown = records?.total ? records : undefined
  if (!native && !shown) return undefined
  const t = translator(lang)
  const { num } = fmt(lang)
  const origins = originPages(lang, c)
  const nameOf = countryNames(lang, c.places, new Set(origins.map(p => p.id)))
  const regionName = regionNames(c.places)
  const country = (code: string) => {
    const { name, place } = nameOf(code)
    const p = place ? origins.find(x => x.id === place) : undefined
    return p ? `<a href="/vi/nguon-goc/${p.parent}/${p.id}/">${esc(name)}</a>` : esc(name)
  }
  const quotes = native?.quotes?.filter(q => mark(q.source))
  // A line's marks: the sources of its sentences, else (a range read before quotes) every source the range names.
  const marks = (has: (q: NonNullable<typeof quotes>[number]) => boolean) =>
    [...new Set(quotes && native?.quotes ? quotes.filter(has).map(q => q.source) : native?.sources ?? [])].map(mark).join('')
  const words = [
    native?.countries.length ? `<p><strong>${esc(t('Sống tự nhiên ở:'))}</strong> ${native.countries.map(country).join(', ')}${marks(q => q.countries.length > 0)}</p>` : '',
    native?.regions.length ? `<p><strong>${esc(t('Sông, hồ, vùng:'))}</strong> ${native.regions.map(r => esc(regionName(r))).join(', ')}${marks(q => q.regions.length > 0)}</p>` : '',
  ].join('')
  const said = quotes?.length ? {
    title: t('Nguồn ghi gì'),
    html: `<ul>${quotes.map(q => `<li><strong>${capitalized([...q.countries.map(code => esc(nameOf(code).name)), ...q.regions.map(r => esc(regionName(r)))].join(', '))}</strong> · ${esc(c.sources[q.source]?.name ?? q.source)}${mark(q.source)}: <span lang="en">“${esc(q.quote)}”</span></li>`).join('')}</ul>`,
  } : undefined

  const inside = shown && native?.countries.length ? recordsInside(s.range!) : undefined
  const outside = inside !== undefined ? shown!.total - inside : 0
  const most = inside !== undefined ? recordsOutside(s.range!) ?? [] : []
  const recordWords = !shown ? '' : inside === undefined
    ? `${t('GBIF có {n} ghi nhận ngoài tự nhiên.', { n: num(shown.total) })} ${t('Nguồn không ghi loài này sống tự nhiên ở nước nào, nên không tách được ghi nhận trong hay ngoài vùng bản địa.')}`
    : !outside
      ? t('GBIF có {n} ghi nhận ngoài tự nhiên, tất cả trong các nước trên.', { n: num(shown.total) })
      : `${t('GBIF có {n} ghi nhận ngoài tự nhiên: {inside} trong các nước trên, {outside} ở nơi khác', { n: num(shown.total), inside: num(inside), outside: num(outside) })}${most.length ? ` (${t('nhiều nhất: {places}', { places: most.map(([code, n]) => `${esc(nameOf(code).name)} ${num(n)}`).join(', ') })})` : ''}. ${t('Ghi nhận ở nơi khác có thể là cá do người thả ra, hoặc nhận nhầm loài.')}`

  const pic = shown ? rangePicture(s.id, s.range) : undefined
  let map: RangeParts['map']
  if (pic) {
    const alt = inside === undefined
      ? t('Bản đồ {n} ghi nhận ngoài tự nhiên của {name} trên GBIF.', { n: num(shown!.total), name: s.name })
      : t('Bản đồ {n} ghi nhận ngoài tự nhiên của {name} trên GBIF: {inside} trong các nước bản địa, {outside} ở nơi khác.', { n: num(shown!.total), name: s.name, inside: num(inside), outside: num(outside) })
    const legend = [
      ...pic.map.kinds.map(kind => ({ kind, label: t(SQUARES[kind][0]) })),
      ...(pic.map.paths.native ? [{ kind: 'native' as const, label: t('Nước bản địa') }] : []),
    ]
    const scale = t('Mỗi ô khoảng {km} km.', { km: num(squareKm(pic.map.step)) })
    const signs = legend.map(l => `${l.kind === 'native' ? '▒' : SQUARES[l.kind][1]} ${l.label}`).join(' · ')
    map = { svg: mapSvg(pic.map, 'web', alt), file: pic.file, w: pic.map.w * 2, h: pic.map.h * 2, alt, legend, scale, caption: `${signs}. ${scale}` }
  }
  return {
    title: t('Phân bố tự nhiên'),
    words,
    ...(said ? { said } : {}),
    ...(recordWords ? { records: `<p>${recordWords}</p>` } : {}),
    ...(map ? { map } : {}),
    ...(shown ? { credit: { text: t('Dữ liệu: GBIF.org, {n} ghi nhận, lấy ngày {date}', { n: num(shown.total), date: shown.fetched }), licence: 'CC0, CC BY 4.0', url: gbifSearch(shown.taxonKey), base: t('Bản đồ nền: Natural Earth') } } : {}),
  }
}
