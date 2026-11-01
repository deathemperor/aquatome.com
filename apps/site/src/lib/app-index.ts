import { QUALITY_THRESHOLD, type BreedEntity, type Content, type Photo, type PlantEntity, type Traits } from '@aq/schema'
import type { SpeciesIndexItem } from '../scripts/filter'
import { GROUP_LABELS, GUIDE_KIND_LABELS, PLANT_LABELS } from './format'
import { easyPlants, featuredSpecies, groupTiles, leadGuides, listOrder } from './home'
import { smallSrc } from './img'
import { localizePath, served, translator, type Lang } from './i18n'
import { mentionIndex } from './mentions'
import { toIndexItem } from './species-index'

/**
 * The handbook's index for the native app (/app/<lang>.json): every indexable page of one language that the app can
 * search and list. The app opens the page itself in a web view, so an item is only what a search result shows and
 * what the app browses it by. Fish come in the site's list order (the well-known ones first).
 */
export type AppItem = {
  kind: 'fish' | 'plant' | 'guide' | 'glossary' | 'tool'
  /** The page's content id, the same in every language (fish, plants): what a saved tank lists them by. */
  id?: string
  name: string
  /** Scientific name (fish, plants). */
  sub?: string
  /** Other names, for search. */
  aka?: string[]
  /** The page in this language: "/id/ikan/<slug>/". */
  path: string
  /** A small photo (about 480 px wide). */
  img?: string
  /** A guide's subject, as the guide list groups them (GuideEntity['kind']: setup, care, plantCare, …). */
  section?: string
  /** The fish and plants a guide names, by content id, as its page links them ("Bài viết nhắc đến loài này"). */
  about?: string[]
  /** A fish's group, as the site groups species (tetras, cichlids, …, `other`); a breed has its parent species'. */
  group?: string
  /** A plant's care, as its page gives it: difficulty 1 (easy) to 3, and the keys of `labels`. */
  plant?: Pick<PlantEntity, 'difficulty' | 'light' | 'co2' | 'growth' | 'placement'>
} & Partial<Facts>
/**
 * A species' figures and behaviour (fish), named as the tank-mates tool names them (SpeciesIndexItem), so the app checks
 * a tank with the tool's own code. Each one the content has no value for is left out; breeds have none.
 */
export type Facts = Pick<SpeciesIndexItem, (typeof FACTS)[number]>
const FACTS = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'temperament', 'finNipper', 'schoolMin', 'difficulty'] as const
export type AppIndex = { version: 1; lang: Lang; items: AppItem[]; home: AppHome; labels: AppLabels }
/**
 * What the site's home page leads with, so the app leads with the same (lib/home.ts), in its order: the fish groups
 * (with a photo of one of them), then fish, plants and guides by their path in this index.
 */
export type AppHome = { groups: { id: string; img?: string }[]; fish: string[]; plants: string[]; guides: string[] }
/**
 * The site's words for each key the items carry (fish groups, guide subjects, plant care), in this language.
 * `difficulty` is a plant's (1–3, as a string key), not a fish's 1–8.
 */
export type AppLabels = Record<'group' | 'section' | 'difficulty' | 'light' | 'co2' | 'growth' | 'placement', Record<string, string>>

/**
 * `traits`: behaviour by species id (lib/traits.ts), as the tank-mates tool reads it. `everySpecies`: the species of
 * every language (the Vietnamese content's), so a breed gets its species' group even where that species has no page.
 */
export function appIndex(lang: Lang, c: Content, traits: Map<string, Traits> = new Map(), everySpecies: Content['species'] = c.species): AppIndex {
  const t = translator(lang)
  const at = (viPath: string) => localizePath(lang, viPath)
  const img = (photos: Photo[]) => (photos[0] ? smallSrc(photos[0]) : undefined)
  const aka = (names: string[]) => (names.length ? names : undefined)
  const items: AppItem[] = []
  const home: AppHome = { groups: [], fish: [], plants: [], guides: [] }
  const words = (labels: Record<string | number, string>) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, t(v)]))
  const labels: AppLabels = { group: words(GROUP_LABELS), section: words(GUIDE_KIND_LABELS), ...(Object.fromEntries(Object.entries(PLANT_LABELS).map(([k, v]) => [k, words(v)])) as Omit<AppLabels, 'group' | 'section'>) }
  if (served(lang, '/vi/ca/x/')) {
    // A thin page (depth.ts) is out of search engines, not out of the app: its translation passed, it is only short.
    const listed = (q: Content['species'][number]['t']['quality']) => q.indexable || (q.reason === 'thin' && q.score >= QUALITY_THRESHOLD)
    // A group the site has no word for (a handful of fish) is "Loài khác", as the app shows it.
    const groupOf = new Map(everySpecies.map(s => [s.id, s.group in GROUP_LABELS ? s.group : 'other']))
    for (const s of listOrder(lang, c)) {
      if (!listed(s.t.quality)) continue
      const f = toIndexItem(s, traits.get(s.id))
      const facts = Object.fromEntries(FACTS.map(k => [k, f[k]]))
      items.push(clean({ kind: 'fish', id: s.id, name: s.t.name, sub: s.scientificName, aka: aka(s.t.altNames), path: at(`/vi/ca/${s.t.slug}/`), img: img(s.photos), group: groupOf.get(s.id), ...facts }))
    }
    for (const b of c.breeds) {
      if (listed(b.t.quality)) items.push(clean({ kind: 'fish', id: b.id, name: b.t.name, aka: aka(b.t.altNames), path: at(`/vi/ca/${b.t.slug}/`), img: img(b.photos), group: breedGroup(b, groupOf, c.breeds) }))
    }
    home.groups = groupTiles(lang, c).map(g => (g.photo ? { id: g.group, img: smallSrc(g.photo) } : { id: g.group }))
    home.fish = featuredSpecies(lang, c, 30).map(s => at(`/vi/ca/${s.t.slug}/`))
  }
  if (served(lang, '/vi/cay/x/')) {
    for (const p of c.plants) {
      const plant = { difficulty: p.difficulty, light: p.light, co2: p.co2, growth: p.growth, placement: p.placement }
      if (p.t.quality.indexable) items.push(clean({ kind: 'plant', id: p.id, name: p.t.name, sub: p.scientificName, aka: aka(p.t.altNames), path: at(`/vi/cay/${p.t.slug}/`), img: img(p.photos), plant }))
    }
    home.plants = easyPlants(c, 30).map(p => at(`/vi/cay/${p.t.slug}/`))
  }
  if (served(lang, '/vi/huong-dan/x/')) {
    const mentions = mentionIndex(c).guides
    for (const g of c.guides) {
      if (!g.t.quality.indexable) continue
      const m = mentions.get(g.id)
      const about = m ? [...m.species.map(s => s.id), ...m.plants.map(p => p.id)] : []
      items.push(clean({ kind: 'guide', name: g.t.name, aka: aka(g.t.altNames), path: at(`/vi/huong-dan/${g.t.slug}/`), img: img(g.photos), section: g.kind, about: about.length ? about : undefined }))
    }
    home.guides = leadGuides(c).map(g => at(`/vi/huong-dan/${g.t.slug}/`))
  }
  if (served(lang, '/vi/thuat-ngu/x/')) {
    for (const g of c.glossary) {
      if (g.t.quality.indexable) items.push(clean({ kind: 'glossary', name: g.t.name, aka: aka(g.t.altNames), path: at(`/vi/thuat-ngu/${g.t.slug}/`) }))
    }
  }
  // The tools: the page of calculators, and the ones with pages of their own.
  for (const [vi, name] of [['/vi/cong-cu/', t('Công cụ')], ['/vi/cong-cu/nuoi-chung/', t('Nuôi chung được không? Thả bao nhiêu con?')], ['/vi/cong-cu/the-tich-be/', t('Bể bao nhiêu lít?')], ['/vi/cong-cu/den-chihiros/', t('Đèn Chihiros')], ['/vi/cong-cu/be-cua-toi/', t('Bể của tôi')]] as const) {
    if (served(lang, vi)) items.push({ kind: 'tool', name, path: at(vi) })
  }
  // Only what the index lists (a well-known fish whose page is below the bar leads the site's home, not the app's): a
  // row's worth of each.
  const paths = new Set(items.map(i => i.path))
  for (const [k, n] of [['fish', 8], ['plants', 6], ['guides', 8]] as const) home[k] = home[k].filter(p => paths.has(p)).slice(0, n)
  const groups = new Set(items.map(i => i.group))
  home.groups = home.groups.filter(g => groups.has(g.id))
  return { version: 1, lang, items, home, labels }
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

/** Leaves out empty fields, so the file stays small. */
const clean = (i: AppItem): AppItem => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as AppItem
