import { boxFractions, cleanPhoto, FIRST_GUIDES, FIRST_PLANTS, frameOf, photoFitsCard, POPULAR, resolveDataCard, slugify, STAPLE_SPECIES, unmarked, type BreedEntity, type Chip, type Content, type Curation, type Loop, type Photo, type PlantEntity, type Range, type SpeciesEntity, type Traits } from '@aq/schema'
import type { Box, KindShards, PageDoc } from '@aq/schema/app-page'
import type { SpeciesIndexItem } from '../scripts/filter'
import { breedFigures, speciesOf, type BreedFigures } from './breeds'
import { curationFor, loopOf, type AppCuration } from './curation'
import { categoriesIn } from './equipment'
import { categoryLabel, GROUP_LABELS, GUIDE_KIND_LABELS, PLANT_LABELS } from './format'
import { easyPlants, featuredSpecies, groupTiles, leadGuides, listOrder } from './home'
import { resizeOf, sameShape, smallSrc } from './img'
import { appPath, served, translator, type Lang } from './i18n'
import { termListing } from './glossary-page'
import { guideImage, mentionIndex } from './mentions'
import { toIndexItem } from './species-index'
import { appRange, capitalized, countryNames, originPages, regionNames, type AppCountry, type AppRange } from './range'
import { ORIGINS, PLACE_INTRO, PLACE_INTROS, PLACE_TITLES, RANKS, TAXON_INTRO } from './taxa-places'
import { seriesGuides } from './video'

/**
 * The handbook's index for the native app (/app/<lang>.json): the pages of one language that the app can search and
 * list. Fish, plants, guides, glossary terms, video series and equipment are every one the site's own lists show (a page out of
 * search engines too). Vietnamese materials are searchable during their noindex pilot. An item holds what a search
 * result shows and what the app browses it by. Fish come in the site's list order (the well-known ones first).
 */
export type AppItem = {
  /** `video`: a series of video guides (/vi/video/<slug>/). `equipment`: a kind of kit (/vi/thiet-bi/<category>/). `material`: a Vietnamese material page, opened on the web. */
  kind: 'fish' | 'plant' | 'guide' | 'glossary' | 'tool' | 'video' | 'equipment' | 'material'
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
  /** A small photo (about 480 px wide): the same photo its page leads with (pagePhoto). */
  img?: string
  /**
   * Where the fish is in `img`, wherever the photo has a box (a fish's, a breed's, a plant's taller than wide, and a guide's
   * or a series' card when its photo is one of a fish), once the site's switch for it is on: protocols/photo-crop-vectors.json.
   */
  imgBox?: Box
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
  /** A glossary term's meaning, plain text: its definition, as its card and page give it, whole (the app cuts it to two lines). */
  def?: string
  /** A glossary term: how many pages use it, the number its page gives under "Dùng trong". None when none does. */
  uses?: number
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
  groups: { id: string; img?: string; imgBox?: Box }[]; fish: string[]; plants: string[]; guides: string[]
  /**
   * Khám phá's longer shelves. Fish start with `fish` in its order, so what shows first stays first, and go on with
   * those hobbyists keep most. Plants and guides are Curation's lists in their order (FIRST_PLANTS, FIRST_GUIDES), then
   * the home's own ranking. Each holds at most seven columns, as the App Store's shelves do (BROWSE). An app that
   * predates it shows `fish`, `plants` and `guides`.
   */
  browse?: { fish: string[]; plants: string[]; guides: string[] }
  /** Khám phá's chips row, in its order (chipsFor). None where the curation file names none. */
  chips?: AppChip[]
} & AppCuration
/**
 * One chip of Khám phá's row in this language, whole, so the app sorts and works out nothing (the Design Lead, 13 Nov):
 * its place in the row (`order`, from 1), its fish (`members`, this index's item ids, breeds included), how many, and
 * one photo of a member whose fish a 3:2 crop keeps (`img`, `imgBox`). `guides` and `videos`: the paths of the guides
 * about the group, written and on video, in the index's order (chipGuides); none where it has none.
 */
export type AppChip = { id: string; name: string; order: number; count: number; members: string[]; img?: string; imgBox?: Box; guides?: string[]; videos?: string[] }
/**
 * The guides about a chip's group, by their titles (the chief of staff, 14 Nov): a guide whose title holds the chip's
 * word or one of a member's names, as this index has them, whole words (Thai, written without spaces, anywhere in it).
 * A guide that names the fish only in its text stays off: the guides' lists of the fish they mention are too loose (the
 * arowana guide lists the flowerhorn). A name another fish has too doesn't count ("cá hổ" is a clown loach's and an
 * American cichlid's), and another fish's name that holds the group's word is no mention of it ("cá ốc", the shell
 * dwellers, isn't a snail). `hand`: the paths the curation file adds and takes off by hand (Chip.guides). Written guides
 * go in `guides`, video guides in `videos`, in the index's order.
 */
export function chipGuides(lang: Lang, chip: AppChip, items: AppItem[], hand: { add: string[]; off: string[] } = { add: [], off: [] }): Pick<AppChip, 'guides' | 'videos'> {
  const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase()
  const namesOf = (i: AppItem) => [i.name, ...(i.aka ?? [])].map(fold).filter(Boolean)
  const inside = new Set(chip.members), fish = items.filter(i => i.kind === 'fish' && i.id)
  const others = new Set(fish.filter(i => !inside.has(i.id!)).flatMap(namesOf))
  const own = [...new Set([fold(chip.name), ...fish.filter(i => inside.has(i.id!)).flatMap(namesOf).filter(n => !others.has(n))])]
  const words = (ns: string[]) => {
    const any = [...ns].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    return new RegExp(lang === 'th' ? `(?:${any})` : `(?<![\\p{L}\\p{M}\\p{N}])(?:${any})(?![\\p{L}\\p{M}\\p{N}])`, 'gu')
  }
  const mention = words(own), shadows = [...others].filter(n => n.search(mention) >= 0), shadow = shadows.length ? words(shadows) : undefined
  const about = items.filter(i => i.kind === 'guide' && !hand.off.includes(i.path) && (hand.add.includes(i.path) || (shadow ? fold(i.name).replace(shadow, ' ') : fold(i.name)).search(mention) >= 0))
  const guides = about.filter(i => !i.video).map(i => i.path), videos = about.filter(i => i.video).map(i => i.path)
  return { ...(guides.length ? { guides } : {}), ...(videos.length ? { videos } : {}) }
}
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
 * A photo the cards' frames refuse: a dealer's shot cropped too near the fish (photoFitsCard), or one the site leads
 * whole (headFit 'contain'). No frame may fill with it.
 */
export const refusedByCards = (p: Photo): boolean => p.headFit === 'contain' || !photoFitsCard(p)
/**
 * The switch for a fish's, a breed's or a plant's page photo the cards refuse. On, its card and its head are that photo
 * with its whole area as the box (photoBox), which the v2 Lab's build draws whole. Off, they have no photo, as before 14
 * Nov: a build before 375 ignores the box and would crop it (Esomus caudiocellatus losing about half its length on a card).
 * On since build 375, the Lab's frames build, on TestFlight 14 Nov 20:01: 53 fish and breed pages in Vietnamese, 41 in
 * Indonesian, 42 in Thai and 6 in Malay get their photo back (the chief of staff, 13 Nov; the Lab, 14 Nov). An object,
 * so a test holds both ways.
 */
export const APP_WHOLE_PHOTOS = { on: true }
const realPhoto = (photos: Photo[]) => photos.find(p => !p.generated)
/**
 * The one photo a page's card and its head both show, for a fish, a breed or a plant: the page's first photo that isn't
 * generated (the Design Lead's line, accepted by the chief of staff, 13 Nov: a card and the page it opens show one photo).
 * Where the fish is in it (photoBox) decides fill or whole by the frames rule (protocols/photo-crop-vectors.json). One the
 * cards refuse only while APP_WHOLE_PHOTOS is on.
 */
export const pagePhoto = (photos: Photo[]): Photo | undefined => {
  const p = realPhoto(photos)
  return p && (APP_WHOLE_PHOTOS.on || !refusedByCards(p)) ? p : undefined
}
/**
 * A page's head: its card's photo (pagePhoto), or, where the page has no real photo, its first generated picture, which
 * the page labels and no card shows (pictures.ts cleanPhoto: generation ships on the page and in its album only).
 */
export const headPhoto = (photos: Photo[]): Photo | undefined => (realPhoto(photos) ? pagePhoto(photos) : photos[0])
/** The photo's whole area: in any frame of another shape the frames rule then shows it whole. */
const WHOLE: Box = { x: 0, y: 0, w: 1, h: 1 }
/**
 * Where the fish is in a photo, as the app's frames read it: the loader's box, or the whole area where the cards' frames
 * refuse the photo (refusedByCards), so no frame cuts it. None where the loader gives none (a plant's square or wide
 * photo): it fills.
 */
export const photoBox = (p: Photo): Box | undefined => (refusedByCards(p) ? WHOLE : boxFractions(p))
/**
 * A card's copy of a photo: its small copy where that is the photo only resized (resizeOf), else the photo itself, so the
 * card and the page's head show one framing and the photo's box holds for both.
 */
export const cardSrc = (p: Photo): string => { const small = smallSrc(p); return resizeOf(p, small) ? small : p.url }

/** A chip's picture is 3:2 (the Design Lead's spec-chips.md). */
const CHIP_RATIO = 3 / 2
/** A box the engine found, not the whole area the loader gives a photo it found none in. */
const foundBox = (p: Photo) => !!p.subject && !(p.subject.x0 <= 0 && p.subject.y0 <= 0 && p.subject.x1 >= Math.floor(p.width) && p.subject.y1 >= Math.floor(p.height))
/**
 * Khám phá's chips in this language (the curation file's `chips`, ChipSchema): each with a word in this language and a fish
 * this index lists, in the file's order (the owner's to set). A species is in by the chip's rule, judged on every
 * language's species (`everySpecies`); a breed by what it is a form of, or for a cross its parents. Each picture is a
 * member's photo whose fish a 3:2 crop keeps (a box the engine found, and frameOf covers), no banner, none another chip
 * shows, 640 px wide or more first.
 */
export function chipsFor(lang: Lang, c: Content, everySpecies: Content['species'], chips: Chip[], listed: { species: Content['species']; breeds: Content['breeds'] }): AppChip[] {
  const byId = new Map(everySpecies.map(s => [s.id, s])), breedById = new Map(c.breeds.map(b => [b.id, b]))
  const baseOf = (b: BreedEntity) => {
    if (b.kind === 'hybrid') return undefined
    const seen = new Set<string>()
    for (let id = b.basedOn; id && !seen.has(id); id = breedById.get(id)?.basedOn) { seen.add(id); if (byId.has(id)) return id }
    return undefined
  }
  const bases = (b: BreedEntity) => { const base = baseOf(b); return base ? [base] : (b.parents ?? []).flatMap(p => (p.species ? [p.species] : [])) }
  const held = chips.flatMap(chip => {
    const name = chip.names[lang]
    if (!name) return []
    const m = chip.match, rule = [m.group, m.places, m.family, m.genus].some(v => v?.length)
    const fits = (want: string[] | undefined, has: string | string[] | undefined) => !want?.length || (Array.isArray(has) ? has.some(x => want.includes(x)) : !!has && want.includes(has))
    const out = (id: string) => !!m.except?.includes(id)
    const inChip = (s: SpeciesEntity | undefined) => !!s && !out(s.id) && (!!m.species?.includes(s.id) || (rule && fits(m.group, s.group) && fits(m.places, s.places) && fits(m.family, s.family) && fits(m.genus, s.genus)))
    const members = [...listed.species.filter(inChip), ...listed.breeds.filter(b => !out(b.id) && (m.breeds?.includes(b.id) || bases(b).some(id => inChip(byId.get(id)))))]
    return members.length ? [{ chip, name, members }] : []
  })
  // Pictures go to the chips with fewest fish first, so a group of one fish keeps its best photo when a wider group holds
  // it too (Dĩa inside Cichlid châu Mỹ).
  const used = new Set<string>(), pic = new Map<string, Photo>()
  for (const x of [...held].sort((a, b) => a.members.length - b.members.length)) {
    const cover = x.chip.cover ?? [], at = (id: string) => (cover.includes(id) ? cover.indexOf(id) : cover.length)
    const ranked = [...x.members].sort((a, b) => at(a.id) - at(b.id) || Math.min(b.photos.length, 3) - Math.min(a.photos.length, 3) || a.t.name.localeCompare(b.t.name, lang))
    // The members' heads first, the photo each card leads with and the engine ranked best; then their other photos, so a
    // head that doesn't qualify leaves the member's next photo in the running. 640 px wide or more first, within each.
    const fits = (p: Photo) => !p.generated && unmarked(p) && !refusedByCards(p) && foundBox(p) && frameOf(p.width / p.height, boxFractions(p), CHIP_RATIO).fit === 'cover'
    const heads = ranked.flatMap(m => { const h = cleanPhoto(m.photos); return h && fits(h) ? [h] : [] }), head = new Set(heads)
    const others = ranked.flatMap(m => m.photos.filter(p => !head.has(p) && fits(p)))
    const wide = (ps: Photo[]) => [...ps.filter(p => p.width >= 640), ...ps]
    const p = [...wide(heads), ...wide(others)].find(p => !used.has(p.url))
    if (p) { used.add(p.url); pic.set(x.chip.id, p) }
  }
  return held.map((x, i) => {
    const p = pic.get(x.chip.id)
    return { id: x.chip.id, name: x.name, order: i + 1, count: x.members.length, members: x.members.map(m => m.id), ...(p ? { img: cardSrc(p), imgBox: photoBox(p) } : {}) }
  })
}

/**
 * `traits`: behaviour by species id (lib/traits.ts), as the tank-mates tool reads it. `everySpecies`: the species of
 * every language (the Vietnamese content's), so a breed gets its species' group even where that species has no page.
 */
export function appIndex(lang: Lang, c: Content, traits: Map<string, Traits> = new Map(), everySpecies: Content['species'] = c.species, cur?: { calendar: Curation; today: string }): AppIndex {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  /** A card photo's box: `img` is the photo or a copy only resized (cardSrc), which the box's fractions hold for. */
  const boxOf = (p: Photo | undefined) => (p ? photoBox(p) : undefined)
  const img = (photos: Photo[]) => { const p = pagePhoto(photos); return p ? cardSrc(p) : undefined }
  const imgBox = (photos: Photo[]) => boxOf(pagePhoto(photos))
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
        kind: 'fish', id: s.id, name: s.t.name, sub: s.scientificName, aka: aka(s.t.altNames), path: at(`/vi/ca/${s.t.slug}/`), img: img(s.photos), imgBox: imgBox(s.photos), loop: loopOf(cur?.calendar ?? null, s.id), group: groupOf.get(s.id),
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
        kind: 'fish', id: b.id, name: b.t.name, aka: aka(b.t.altNames), path: at(`/vi/ca/${b.t.slug}/`), img: img(b.photos), imgBox: imgBox(b.photos), loop: loopOf(cur?.calendar ?? null, b.id), group: breedGroup(b, groupOf, c.breeds),
        of, card: Object.keys(card).length ? card : undefined, ...(of ? {} : { tempC, ph, gh, sizeCm, tankCm, difficulty }),
      }))
    }
    home.groups = groupTiles(lang, c).map(g => {
      const box = g.photo && resizeOf(g.photo, smallSrc(g.photo)) ? photoBox(g.photo) : undefined
      return g.photo ? { id: g.group, img: smallSrc(g.photo), ...(box ? { imgBox: box } : {}) } : { id: g.group }
    })
    home.fish = featuredSpecies(lang, c, 30).map(s => at(`/vi/ca/${s.t.slug}/`))
  }
  if (served(lang, '/vi/cay/x/')) {
    for (const p of appPlants(lang, c)) {
      const plant = { difficulty: p.difficulty, light: p.light, co2: p.co2, growth: p.growth, placement: p.placement }
      items.push(clean({ kind: 'plant', id: p.id, name: p.t.name, sub: p.scientificName, aka: aka([...(p.synonyms ?? []), ...p.t.altNames]), path: at(`/vi/cay/${p.t.slug}/`), img: img(p.photos), imgBox: imgBox(p.photos), plant }))
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
      items.push(clean({ kind: 'guide', name: g.t.name, aka: aka(g.t.altNames), path, img: ph && cardSrc(ph), imgBox: boxOf(ph), section: g.kind, about: about.length ? about : undefined, video: g.video?.durationSec }))
    }
    home.guides = leadGuides(c).map(g => at(`/vi/huong-dan/${g.t.slug}/`))
  }
  if (served(lang, '/vi/thuat-ngu/x/')) {
    // A term's English name is among its other names: the chat's search and the app's read them from here.
    for (const g of appGlossary(lang, c)) items.push(clean({ kind: 'glossary', name: g.t.name, aka: aka([g.t.name, ...g.t.altNames].includes(g.en) ? g.t.altNames : [...g.t.altNames, g.en]), path: at(`/vi/thuat-ngu/${g.t.slug}/`), ...termListing(lang, c, g) }))
  }
  // Vietnamese pilot pages stay out of Google. No native page shards yet: an app opens them on the web once it knows the
  // kind, and today's skips them, as it does any kind it doesn't know (AquaTomeKit's Handbook.swift).
  if (lang === 'vi') for (const m of c.materials) {
    items.push(clean({ kind: 'material', id: m.id, name: m.t.name, aka: aka([...m.t.altNames, ...m.names]), path: at(`/vi/vat-lieu/${m.t.slug}/`), img: m.photos[0] && smallSrc(m.photos[0]) }))
  }
  // A series as its page lists it; the same series the app gets pages of.
  for (const { s, guides } of appSeries(lang, c)) {
    const ph = guideImage(c, guides[0]!)
    items.push(clean({ kind: 'video', name: s.vi.name, sub: s.channel, path: at(`/vi/video/${s.vi.slug}/`), img: ph && cardSrc(ph), imgBox: boxOf(ph), parts: guides.length }))
  }
  // An equipment category as its page names it; the same categories the app gets pages of.
  for (const u of appEquipment(lang, c)) {
    const g = c.equipment.find(e => e.category === u.category)
    items.push(clean({ kind: 'equipment', name: g?.name ?? t(categoryLabel(u.category)), path: at(`/vi/thiet-bi/${u.category}/`), img: g && cardSrc(g.hero), imgBox: boxOf(g?.hero) }))
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
  // fit drops out), then the home's own ranking: a language with fewer of Curation's pages (most are Vietnamese) still
  // fills its shelf.
  const pictured = new Map(items.filter(i => i.kind === 'fish' && i.img).map(i => [i.id, i.path]))
  const popular = [...STAPLE_SPECIES, ...POPULAR.map(slugify)].flatMap(id => pictured.get(id) ?? [])
  const plantAt = new Map(items.filter(i => i.kind === 'plant').map(i => [i.id, i.path]))
  home.browse = {
    fish: [...new Set([...row.fish, ...popular])].slice(0, BROWSE.fish),
    plants: [...new Set([...FIRST_PLANTS.flatMap(id => plantAt.get(id) ?? []), ...listed('plants')])].slice(0, BROWSE.plants),
    guides: [...new Set([...FIRST_GUIDES.flatMap(id => guideAt.get(id) ?? []), ...listed('guides')])].slice(0, BROWSE.guides),
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
    // Where the fish is in each photo the calendar can name by address (a fish's, a breed's, a plant's, a guide's): the photo's own address first, then
    // its copies only resized (its small copy, a large copy of the same shape). An address two photos' copies claim with
    // different boxes gets none.
    const own = new Map<string, Box>(), copies = new Map<string, Box | null>()
    const copy = (u: string, box: Box) => copies.set(u, copies.has(u) && JSON.stringify(copies.get(u)) !== JSON.stringify(box) ? null : box)
    for (const p of [...c.species.flatMap(s => s.photos), ...c.breeds.flatMap(b => b.photos), ...c.plants.flatMap(p => p.photos), ...Object.values(c.galleries).flat(), ...c.guides.flatMap(g => [...g.photos, ...(g.video?.figures ?? []).flatMap(f => f.photo ?? [])])]) {
      const box = photoBox(p)
      if (!box) continue
      own.set(p.url, box)
      for (const u of new Set([p.thumb, smallSrc(p)])) if (u && u !== p.url && resizeOf(p, u)) copy(u, box)
      if (p.large && sameShape(p, p.large)) copy(p.large.url, box)
    }
    const boxAt = (u: string) => (own.has(u) ? own.get(u) : copies.get(u) ?? undefined)
    Object.assign(home, curationFor(cur.calendar, lang, cur.today, ref => { const p = refs.get(ref); return p && paths.has(p) ? p : undefined }, c.cards, c.photoWaits, boxAt))
    const chips = chipsFor(lang, c, everySpecies, cur.calendar.chips, { species: appSpecies(lang, c), breeds: appBreeds(lang, c) })
    const guidePath = new Map(appGuides(lang, c).map(g => [g.id, at(`/vi/huong-dan/${g.t.slug}/`)]))
    const hand = (ids: string[] = []) => ids.flatMap(id => guidePath.get(id) ?? [])
    const byId = new Map(cur.calendar.chips.map(ch => [ch.id, ch.guides]))
    if (chips.length) home.chips = chips.map(ch => ({ ...ch, ...chipGuides(lang, ch, items, { add: hand(byId.get(ch.id)?.add), off: hand(byId.get(ch.id)?.off) }) }))
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
 * How long Khám phá's lists are: at most seven columns, as the App Store's shelves show (the owner's note, 11 Nov). Fish
 * and plants go three to a column, guides one. The top always takes the home's first 3 fish, so the fish shelf shows 21.
 */
const BROWSE = { fish: 24, plants: 21, guides: 7 }
/** Leaves out empty fields, so the file stays small. */
const clean = (i: AppItem): AppItem => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as AppItem
