import { FIRST_GUIDES, FIRST_PLANTS, photoFitsCard, POPULAR, resolveDataCard, slugify, STAPLE_SPECIES, type BreedEntity, type Content, type Curation, type Loop, type Photo, type PlantEntity, type Range, type Traits } from '@aq/schema'
import type { KindShards, PageDoc } from '@aq/schema/app-page'
import type { SpeciesIndexItem } from '../scripts/filter'
import { breedFigures, speciesOf, type BreedFigures } from './breeds'
import { curationFor, loopOf, type AppCuration } from './curation'
import { categoriesIn } from './equipment'
import { categoryLabel, GROUP_LABELS, GUIDE_KIND_LABELS, PLANT_LABELS } from './format'
import { easyPlants, featuredSpecies, groupTiles, leadGuides, listOrder } from './home'
import { smallSrc } from './img'
import { appPath, served, translator, type Lang } from './i18n'
import { guideImage, mentionIndex } from './mentions'
import { toIndexItem } from './species-index'
import { appRange, capitalized, countryNames, originPages, regionNames, type AppCountry, type AppRange } from './range'
import { ORIGINS, PLACE_INTRO, PLACE_INTROS, PLACE_TITLES, RANKS, TAXON_INTRO } from './taxa-places'
import { seriesGuides } from './video'

/**
 * The handbook's index for the native app (/app/<lang>.json): the pages of one language that the app can search and
 * list. Fish, plants, guides, glossary terms, video series and equipment are every one the site's own lists show (a page out of
 * search engines too). The app opens the page itself in a web view, so an item is only what a search result shows and
 * what the app browses it by. Fish come in the site's list order (the well-known ones first).
 */
export type AppItem = {
  /** `video`: a series of video guides (/vi/video/<slug>/). `equipment`: a kind of kit (/vi/thiet-bi/<category>/). */
  kind: 'fish' | 'plant' | 'guide' | 'glossary' | 'tool' | 'video' | 'equipment'
  /** The page's content id, the same in every language (fish, plants): what a saved tank lists them by. */
  id?: string
  name: string
  /** Scientific name (fish, plants); a video series' channel. */
  sub?: string
  /** Other names, for search. */
  aka?: string[]
  /** A tool page's own title, the line under its heading and its description, for search. */
  words?: string[]
  /** A tool's short name, as its card on the tools page (/vi/cong-cu/) has it: what the app's tiles say. */
  short?: string
  /** The page in this language: "/id/ikan/<slug>/". */
  path: string
  /** A small photo (about 480 px wide). */
  img?: string
  /** A fish's short silent loop, real footage of it (content/curation.json `loops`): for cards and its page. */
  loop?: Loop
  /** A guide's subject, as the guide list groups them (GuideEntity['kind']: setup, care, plantCare, …). */
  section?: string
  /** The fish and plants a guide names, by content id, as its page links them ("Bài viết nhắc đến loài này"). */
  about?: string[]
  /** A video guide: the video's length in seconds. */
  video?: number
  /** A video series: how many guides it has, as its page lists them. */
  parts?: number
  /** A fish's group, as the site groups species (tetras, cichlids, …, `other`); a breed has its parent species'. */
  group?: string
  /** A plant's care, as its page gives it: difficulty 1 (easy) to 3, and the keys of `labels`. */
  plant?: Pick<PlantEntity, 'difficulty' | 'light' | 'co2' | 'growth' | 'placement'>
  /**
   * A species' order, family and genus, as the site writes them. Its taxon pages are these lowercased and joined with
   * "/" (/vi/phan-loai/<order>/<family>/<genus>/, and each level above it), and list it; `labels.taxon` has each rank's
   * word. Breeds have none: taxon pages list species only.
   */
  tax?: [string, string, string]
  /**
   * The places a species names that have a page of their own (`AppIndex.places`: continents, countries), by id, in the
   * order it names them: the origin pages that list it. None when it names none of them; breeds have none.
   */
  from?: string[]
  /**
   * A species' lifespan in years, as its data card resolves it (the site's "Tuổi thọ"): one figure is min = max. None
   * when no source states it; breeds have none.
   */
  lifeYears?: Range
  /** Where a species lives in the wild and its wild records (lib/range.ts, protocols/range-vectors.json); breeds have none. */
  range?: AppRange
  /**
   * A breed that is a form of a species (`basedOn`, through a parent breed, up to the species): that species' id, when
   * this index lists it. A tank's check counts the breed as that species (tank-check.ts groups a tank's fish by
   * `of ?? id`), so the breed has none of the `Facts` of its own. Hybrids, and breeds linked to no species here, have none.
   */
  of?: string
  /**
   * A breed's own figures, as its page's data card shows them (breedFigures): what the app's facts card shows for it.
   * An app that predates it shows none, as for a breed before.
   */
  card?: BreedFigures
} & Partial<Facts>
/**
 * A species' figures and behaviour (fish), named as the tank-mates tool names them (SpeciesIndexItem), so the app checks
 * a tank with the tool's own code. Each one the content has no value for is left out. A breed has its figures only when
 * it has no `of`: a hybrid, or a breed linked to no species, is a fish of its own, checked with no behaviour ("unsure").
 */
export type Facts = Pick<SpeciesIndexItem, (typeof FACTS)[number]>
export const FACTS = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'temperament', 'finNipper', 'schoolMin', 'difficulty'] as const
export type AppIndex = {
  version: 1; lang: Lang; items: AppItem[]; home: AppHome; labels: AppLabels
  /**
   * The places with an origin page, in the order the pages list them: the continents (/vi/nguon-goc/<id>/) and each
   * continent's countries, those whose `parent` it is (/vi/nguon-goc/<parent>/<id>/). A species' `from` names them.
   */
  places: AppPlace[]
  /**
   * The shard counts of the first app's kind, guides (lib/app-page.ts). That app draws every kind listed here itself,
   * so no kind is ever added to it (packages/schema/src/app-page.ts, PageShard).
   */
  pages?: Partial<Record<PageDoc['kind'], number>>
  /** Every kind's shard count (`n`, as `pages` gives it) and the level an app must know to draw that kind itself. */
  shards?: Partial<Record<PageDoc['kind'], KindShards>>
  /** The countries the items' `range` names (native, and outside), by code, A to Z, named in this language. None when none does. */
  countries?: Record<string, AppCountry>
  /** What's new for the app (lib/app-latest.ts), where this language's site has /vi/moi-cap-nhat/. */
  latest?: string
}
/**
 * The guides the index lists in this language, and the app has pages of (lib/app-page.ts): every one the site lists (the
 * guide list, the discovery notes and each video series: lib/list-data.ts), a page out of search engines too.
 */
export function appGuides(lang: Lang, c: Content): Content['guides'] {
  return served(lang, '/vi/huong-dan/x/') ? c.guides : []
}
/**
 * The species the index lists in this language, and the app has pages of (lib/app-page.ts): every one the fish list shows
 * (lib/list-data.ts fishList), in its order. A page out of search engines (thin, or a translation that scored low) is
 * still on the site's lists, its taxon and origin pages too.
 */
export function appSpecies(lang: Lang, c: Content): Content['species'] {
  return served(lang, '/vi/ca/x/') ? listOrder(lang, c) : []
}
/** The breeds the index lists in this language, and the app has pages of: every one the fish list shows. */
export function appBreeds(lang: Lang, c: Content): Content['breeds'] {
  return served(lang, '/vi/ca/x/') ? c.breeds : []
}
/** The plants the index lists in this language, and the app has pages of: every one the plant list shows, as for species. */
export function appPlants(lang: Lang, c: Content): Content['plants'] {
  return served(lang, '/vi/cay/x/') ? c.plants : []
}
/**
 * The glossary terms the index lists in this language, and the app has pages of: every one the glossary list shows
 * (pages/thuat-ngu/index.astro), a page out of search engines too.
 */
export function appGlossary(lang: Lang, c: Content): Content['glossary'] {
  return served(lang, '/vi/thuat-ngu/x/') ? c.glossary : []
}
/**
 * The video series the index lists in this language, with their guides in the page's order, and the app has pages of:
 * every series /vi/video/ lists (one with a guide, its page out of search engines too), the biggest first, as it lists
 * them.
 */
export function appSeries(lang: Lang, c: Content): { s: Content['series'][number]; guides: ReturnType<typeof seriesGuides> }[] {
  if (!served(lang, '/vi/video/x/')) return []
  return c.series.map(s => ({ s, guides: seriesGuides(c, s) })).filter(x => x.guides.length).sort((a, b) => b.guides.length - a.guides.length)
}
/**
 * What the site's home page leads with, so the app leads with the same (lib/home.ts), in its order: the fish groups
 * (with a photo of one of them), then fish, plants and guides by their path in this index.
 */
export type AppHome = {
  groups: { id: string; img?: string }[]; fish: string[]; plants: string[]; guides: string[]
  /**
   * Khám phá's longer shelves. Fish start with `fish` in its order, so what shows first stays first, and go on with
   * those hobbyists keep most. Plants and guides are Curation's lists in their order (FIRST_PLANTS, FIRST_GUIDES), then
   * the home's own ranking, as long as Curation's list. An app that predates it shows `fish`, `plants` and `guides`.
   */
  browse?: { fish: string[]; plants: string[]; guides: string[] }
} & AppCuration
/**
 * The site's words, in this language, each entry a map of strings: for each key the items carry (fish groups, guide
 * subjects, plant care), and those of the taxon and origin pages (lib/taxa-places.ts), which the app draws as shelves.
 * `difficulty` is a plant's (1–3, as a string key), not a fish's 1–8. The pages' lines keep their placeholders, as
 * t() has them, for the app to fill:
 * - `taxon`: `title`, the taxonomy section's title ("Phân loại"); `order`, `family`, `genus`, the ranks of an item's
 *   `tax[0]`, `tax[1]` and `tax[2]` ("Bộ", "Họ", "Chi"); `intro`, a taxon page's line, "{level} {name}: {n} loài."
 *   ({level}: its rank's word; {name}: its name; {n}: how many species it lists).
 * - `origin`: `title`, the origin section's title ("Nguồn gốc"); `intro`, a place page's line, "{n} loài có nguồn gốc từ
 *   {place}." ({place}: the place's name).
 * - `placeTitle` and `placeIntro`, by place id: a place's own heading, in place of its name, and its own line, in place
 *   of `origin.intro` (Vietnam's: "Cá Việt Nam").
 */
export type AppLabels = Record<'group' | 'section' | 'difficulty' | 'light' | 'co2' | 'growth' | 'placement' | 'taxon' | 'origin' | 'placeTitle' | 'placeIntro', Record<string, string>>

/** A place with an origin page (AppIndex.places), named in this language. */
export type AppPlace = {
  id: string
  name: string
  kind: 'continent' | 'country'
  /** A country's continent. */
  parent?: string
  /** A country's regions and rivers, by name, as its page lists them (they have no page of their own). */
  kids?: string[]
}

/** The equipment categories the app gets, as this language's site has their pages. */
export const appEquipment = (lang: Lang, c: Content) => (served(lang, '/vi/thiet-bi/x/') ? categoriesIn(lang, c) : [])

/**
 * `traits`: behaviour by species id (lib/traits.ts), as the tank-mates tool reads it. `everySpecies`: the species of
 * every language (the Vietnamese content's), so a breed gets its species' group even where that species has no page.
 */
export function appIndex(lang: Lang, c: Content, traits: Map<string, Traits> = new Map(), everySpecies: Content['species'] = c.species, cur?: { calendar: Curation; today: string }): AppIndex {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  const img = (photos: Photo[]) => { const p = photos.find(p => !p.generated && p.headFit !== 'contain' && photoFitsCard(p)); return p ? smallSrc(p) : undefined }
  const aka = (names: string[]) => (names.length ? names : undefined)
  const items: AppItem[] = []
  const home: AppHome = { groups: [], fish: [], plants: [], guides: [] }
  /** Each guide's path in this index, by its id. */
  const guideAt = new Map<string, string>()
  const words = (labels: Record<string | number, string>) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, t(v)]))
  const labels: AppLabels = {
    group: words(GROUP_LABELS), section: words(GUIDE_KIND_LABELS), ...(Object.fromEntries(Object.entries(PLANT_LABELS).map(([k, v]) => [k, words(v)])) as Pick<AppLabels, keyof typeof PLANT_LABELS>),
    taxon: words({ title: RANKS[0], order: RANKS[1], family: RANKS[2], genus: RANKS[3], intro: TAXON_INTRO }),
    origin: words({ title: ORIGINS, intro: PLACE_INTRO }),
    placeTitle: words(PLACE_TITLES), placeIntro: words(PLACE_INTROS),
  }
  // The places with a page, as the origin pages list them (pages/nguon-goc/[...path].astro): the continents, and the
  // countries under one. A species is on those it names itself (lib/list-data.ts speciesLists).
  const origins = originPages(lang, c)
  const paged = new Set(origins.map(p => p.id))
  const places: AppPlace[] = origins.map(p => {
    const kids = p.kind === 'country' ? c.places.filter(x => x.parent === p.id).map(x => capitalized(x.t.name)) : []
    return { id: p.id, name: capitalized(p.t.name), kind: p.kind as AppPlace['kind'], ...(p.parent ? { parent: p.parent } : {}), ...(kids.length ? { kids } : {}) }
  })
  const regionName = regionNames(c.placeNames)
  const taxa = served(lang, '/vi/phan-loai/x/')
  if (served(lang, '/vi/ca/x/')) {
    // A group the site has no word for (a handful of fish) is "Loài khác", as the app shows it.
    const groupOf = new Map(everySpecies.map(s => [s.id, s.group in GROUP_LABELS ? s.group : 'other']))
    // The same species the app gets pages of.
    for (const s of appSpecies(lang, c)) {
      const f = toIndexItem(s, traits.get(s.id))
      const facts = Object.fromEntries(FACTS.map(k => [k, f[k]]))
      const from = [...new Set(s.places)].filter(id => paged.has(id))
      const life = resolveDataCard(s.dataCard.lifeYears ?? [], 'lifeYears')?.value
      const lifeYears = life === undefined ? undefined : typeof life === 'number' ? { min: life, max: life } : life
      items.push(clean({
        kind: 'fish', id: s.id, name: s.t.name, sub: s.scientificName, aka: aka(s.t.altNames), path: at(`/vi/ca/${s.t.slug}/`), img: img(s.photos), loop: loopOf(cur?.calendar ?? null, s.id), group: groupOf.get(s.id),
        tax: taxa ? [s.order, s.family, s.genus] : undefined, from: from.length ? from : undefined, lifeYears, range: appRange(s.range, regionName), ...facts,
      }))
    }
    // Every breed, as the fish list shows them: a form of a listed species counted as it, any other with its own figures.
    const listed = new Set(appSpecies(lang, c).map(s => s.id))
    for (const b of appBreeds(lang, c)) {
      const species = speciesOf(c, b)
      const of = species && listed.has(species) ? species : undefined
      const card = breedFigures(b)
      const { tempC, ph, gh, sizeCm, tankCm, difficulty } = card
      items.push(clean({
        kind: 'fish', id: b.id, name: b.t.name, aka: aka(b.t.altNames), path: at(`/vi/ca/${b.t.slug}/`), img: img(b.photos), loop: loopOf(cur?.calendar ?? null, b.id), group: breedGroup(b, groupOf, c.breeds),
        of, card: Object.keys(card).length ? card : undefined, ...(of ? {} : { tempC, ph, gh, sizeCm, tankCm, difficulty }),
      }))
    }
    home.groups = groupTiles(lang, c).map(g => (g.photo ? { id: g.group, img: smallSrc(g.photo) } : { id: g.group }))
    home.fish = featuredSpecies(lang, c, 30).map(s => at(`/vi/ca/${s.t.slug}/`))
  }
  if (served(lang, '/vi/cay/x/')) {
    for (const p of appPlants(lang, c)) {
      const plant = { difficulty: p.difficulty, light: p.light, co2: p.co2, growth: p.growth, placement: p.placement }
      items.push(clean({ kind: 'plant', id: p.id, name: p.t.name, sub: p.scientificName, aka: aka([...(p.synonyms ?? []), ...p.t.altNames]), path: at(`/vi/cay/${p.t.slug}/`), img: img(p.photos), plant }))
    }
    home.plants = easyPlants(c, c.plants.length).map(p => at(`/vi/cay/${p.t.slug}/`))
  }
  if (served(lang, '/vi/huong-dan/x/')) {
    const mentions = mentionIndex(c).guides
    // The same guides the app gets pages of.
    for (const g of appGuides(lang, c)) {
      const m = mentions.get(g.id)
      const about = m ? [...m.species.map(s => s.id), ...m.plants.map(p => p.id)] : []
      // Its card's picture on the site: its own photo, else one from its video's sections, else a fish or plant it names.
      const ph = guideImage(c, g)
      const path = at(`/vi/huong-dan/${g.t.slug}/`)
      guideAt.set(g.id, path)
      items.push(clean({ kind: 'guide', name: g.t.name, aka: aka(g.t.altNames), path, img: ph && smallSrc(ph), section: g.kind, about: about.length ? about : undefined, video: g.video?.durationSec }))
    }
    home.guides = leadGuides(c).map(g => at(`/vi/huong-dan/${g.t.slug}/`))
  }
  if (served(lang, '/vi/thuat-ngu/x/')) {
    // A term's English name is among its other names: the chat's search and the app's read them from here.
    for (const g of appGlossary(lang, c)) items.push(clean({ kind: 'glossary', name: g.t.name, aka: aka([g.t.name, ...g.t.altNames].includes(g.en) ? g.t.altNames : [...g.t.altNames, g.en]), path: at(`/vi/thuat-ngu/${g.t.slug}/`) }))
  }
  // A series as its page lists it; the same series the app gets pages of.
  for (const { s, guides } of appSeries(lang, c)) {
    const ph = guideImage(c, guides[0]!)
    items.push(clean({ kind: 'video', name: s.vi.name, sub: s.channel, path: at(`/vi/video/${s.vi.slug}/`), img: ph && smallSrc(ph), parts: guides.length }))
  }
  // An equipment category as its page names it; the same categories the app gets pages of.
  for (const u of appEquipment(lang, c)) {
    const g = c.equipment.find(e => e.category === u.category)
    items.push(clean({ kind: 'equipment', name: g?.name ?? t(categoryLabel(u.category)), path: at(`/vi/thiet-bi/${u.category}/`), img: g && smallSrc(g.hero) }))
  }
  for (const [vi, name, own, short] of TOOLS) {
    if (served(lang, vi)) items.push(clean({ kind: 'tool', name: t(name), path: at(vi), words: own.map(w => t(w)), short: short && t(short) }))
  }
  // Only what the index lists: a row's worth of each, for Tìm and Hôm nay.
  const paths = new Set(items.map(i => i.path))
  const listed = (k: 'fish' | 'plants' | 'guides') => home[k].filter(p => paths.has(p))
  const row = { fish: listed('fish').slice(0, 8), plants: listed('plants').slice(0, 6), guides: listed('guides').slice(0, 8) }
  // Khám phá's longer shelves. Fish start with that row in its order and go on with those hobbyists keep most, most kept
  // first, each with a photo: past its staples the site's own ranking is the richest profile, not the best known. Plants
  // and guides are Curation's lists in their order, each page only as this index lists it (one that stops passing reader
  // fit drops out), then the home's own ranking, as long as Curation's list: a language with fewer of Curation's pages
  // (most are Vietnamese) still fills its shelf, never shorter than the home's row.
  const pictured = new Map(items.filter(i => i.kind === 'fish' && i.img).map(i => [i.id, i.path]))
  const popular = [...STAPLE_SPECIES, ...POPULAR.map(slugify)].flatMap(id => pictured.get(id) ?? [])
  const plantAt = new Map(items.filter(i => i.kind === 'plant').map(i => [i.id, i.path]))
  home.browse = {
    fish: [...new Set([...row.fish, ...popular])].slice(0, BROWSE_FISH),
    plants: [...new Set([...FIRST_PLANTS.flatMap(id => plantAt.get(id) ?? []), ...listed('plants')])].slice(0, FIRST_PLANTS.length),
    guides: [...new Set([...FIRST_GUIDES.flatMap(id => guideAt.get(id) ?? []), ...listed('guides')])].slice(0, FIRST_GUIDES.length),
  }
  Object.assign(home, row)
  const groups = new Set(items.map(i => i.group))
  home.groups = home.groups.filter(g => groups.has(g.id))
  // The editorial calendar's days and this week's picks, only those this index lists.
  if (cur) {
    // Each page the calendar can name, by kind and content id, at its address in this index.
    const refs = new Map<string, string>()
    for (const s of appSpecies(lang, c)) refs.set(`species/${s.id}`, at(`/vi/ca/${s.t.slug}/`))
    for (const b of appBreeds(lang, c)) refs.set(`breeds/${b.id}`, at(`/vi/ca/${b.t.slug}/`))
    for (const g of appGuides(lang, c)) refs.set(`guides/${g.id}`, at(`/vi/huong-dan/${g.t.slug}/`))
    for (const p of appPlants(lang, c)) refs.set(`plants/${p.id}`, at(`/vi/cay/${p.t.slug}/`))
    Object.assign(home, curationFor(cur.calendar, lang, cur.today, ref => { const p = refs.get(ref); return p && paths.has(p) ? p : undefined }, c.cards, c.photoWaits))
  }
  const codes = [...new Set(items.flatMap(i => [...(i.range?.native ?? []), ...(i.range?.records?.outside ?? []).map(([code]) => code)]))].sort()
  const nameOf = countryNames(lang, c.places, paged)
  return {
    version: 1, lang, items, home, labels, places,
    ...(codes.length ? { countries: Object.fromEntries(codes.map(code => [code, nameOf(code)])) } : {}),
    ...(served(lang, '/vi/moi-cap-nhat/') ? { latest: `/app/latest/${lang}.json` } : {}),
  }
}

/**
 * A breed's group: that of what it's a form of (`basedOn`: a species, or a breed in turn, as the breed pages link it),
 * else of a parent species (a hybrid's).
 */
export function breedGroup(b: Pick<BreedEntity, 'basedOn' | 'parents'>, groupOf: Map<string, string>, breeds: Pick<BreedEntity, 'id' | 'basedOn' | 'parents'>[], seen = new Set<string>()): string | undefined {
  const base = b.basedOn
  if (base && !seen.has(base)) {
    seen.add(base)
    const parent = breeds.find(x => x.id === base)
    const g = groupOf.get(base) ?? (parent && breedGroup(parent, groupOf, breeds, seen))
    if (g) return g
  }
  return b.parents.map(p => p.species && groupOf.get(p.species)).find(g => g)
}

/**
 * The tools: the page of calculators, and the ones with pages of their own. Each with its heading, then its page's own
 * title, the line under the heading and the description (the page's strings, so the same translations; a test holds
 * them to the built pages), so a search for "thể tích bể" finds "Bể bao nhiêu lít?". Then, for a tool with a card on
 * the tools page, the short name the card has (the same string, so the same translations), which the app's tiles show.
 */
const TOOLS: readonly (readonly [string, string, readonly string[], string?])[] = [
  ['/vi/cong-cu/', 'Công cụ', ['Kiểm tra cá nuôi chung, thả bao nhiêu con là vừa, tính thể tích bể, lượng nền cần mua, công suất sưởi và liều phân nước.']],
  ['/vi/cong-cu/nuoi-chung/', 'Nuôi chung được không? Thả bao nhiêu con?', [
    'Kiểm tra cá nuôi chung: hợp nước, hợp tính, thả bao nhiêu con',
    'Chọn 1–6 loài và số con. Công cụ so nhiệt độ, pH, độ cứng, kích thước và tính cách, rồi ước mật độ cá theo kích thước bể ở mục dưới. Tính cách lấy từ nội dung hồ sơ; đọc thêm mục “Nuôi chung với con gì?” trong từng hồ sơ trước khi thả chung.',
    'Các loài cá có nuôi chung được không: so nhiệt độ, pH, độ cứng, kích thước và tính cách, rồi ước thả bao nhiêu con là vừa bể.',
  ], 'Nuôi chung'],
  ['/vi/cong-cu/the-tich-be/', 'Bể bao nhiêu lít?', [
    'Tính thể tích bể cá: lít, gallon, độ dày kính',
    'Chọn kiểu bể, nhập kích thước lòng bể. Có 12 kiểu: chữ nhật, lục giác, bát giác, trụ, góc, chữ L…',
    'Tính thể tích bể cá 12 kiểu (chữ nhật, lục giác, trụ tròn, bể góc, chữ L) ra lít và gallon, kèm lượng nước thực tế, cân nặng và độ dày kính nên dùng.',
  ], 'Thể tích bể'],
  ['/vi/cong-cu/du-toan-be/', 'Set một bể hết bao nhiêu tiền?', [
    'Dự toán chi phí set bể thủy sinh: tiền mua đồ và tiền nuôi mỗi tháng',
    'Chọn cỡ bể và mức đầu tư. Công cụ cộng giá từng món, rồi tính tiền điện, CO₂, phân và thức ăn mỗi tháng, tất cả là khoảng giá.',
    'Dự toán chi phí set bể cá, bể thủy sinh 30–120 cm: giá bể, chân, lọc, sưởi, đèn, phân nền, CO₂, bộ test và ổ cắm thông minh theo ba mức đầu tư, cộng tiền điện và tiền nuôi mỗi tháng.',
  ], 'Dự toán chi phí'],
  ['/vi/cong-cu/den-chihiros/', 'Đèn Chihiros', [
    'Điều khiển đèn Chihiros trên trình duyệt: hẹn giờ, độ sáng',
    'Hẹn giờ bật tắt có sáng dần, tối dần, pha màu và chỉnh giờ cho đèn Chihiros qua Bluetooth, ngay trên trình duyệt, không cần cài ứng dụng. Trang nhớ đèn và lịch của bạn trên máy này.',
    'Điều khiển đèn thủy sinh Chihiros (WRGB II, Slim, Pro, A II, C II, Universal) qua Bluetooth trên Chrome: đặt lịch bật tắt có sáng dần, tối dần, chỉnh độ sáng từng màu, lịch mẫu cho bể mới và bể bị rêu.',
  ], 'Đèn Chihiros'],
  ['/vi/cong-cu/nhan-dien-ca/', 'Đây là cá gì?', [
    'Nhận diện cá qua ảnh',
    'Chụp hoặc chọn ảnh một con cá, tép, ốc hay cây thủy sinh. Công cụ đoán tên loài và mở hồ sơ của nó trong cẩm nang.',
    'Nhận diện cá cảnh, tép, ốc và cây thủy sinh từ một tấm ảnh: tên loài, dòng (betta halfmoon, guppy koi…) và hồ sơ cách nuôi trong cẩm nang AquaTome.',
  ], 'Nhận diện cá'],
  ['/vi/cong-cu/be-cua-toi/', 'Bể của tôi', [
    'Bể của tôi: sổ ghi bể cá, cây và lịch đèn',
    'Ghi lại từng bể: kích thước, nền, cá, cây và đèn với lịch đã đặt. Lưu ngay trên máy này, không cần đăng ký.',
    'Sổ bể cá miễn phí: lưu kích thước, thể tích, loại nền, cá, cây, ghi chú và lịch đèn Chihiros của từng bể ngay trên trình duyệt, không cần tài khoản.',
  ], 'Bể của tôi'],
]

/**
 * How many fish Khám phá's list holds (the Design Lead's spec, 2026-11-11): its shelf shows 24 after the pages shown above
 * it, and this leaves it 6 to spare.
 */
const BROWSE_FISH = 30
/** Leaves out empty fields, so the file stays small. */
const clean = (i: AppItem): AppItem => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as AppItem
