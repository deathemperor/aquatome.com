import { POPULAR, resolveDataCard, slugify, STAPLE_SPECIES, type Content, type GuideEntity, type Localized, type Photo, type PictureSet, type PlantEntity, type SpeciesEntity } from '@aq/schema'
import { GROUP_LABELS } from './format'
import { guideImage, mentionIndex } from './mentions'
import type { Lang } from './i18n'


/** Plants every beginner can grow: shown first. */
const PLANT_STAPLES = ['taxiphyllum-barbieri', 'microsorum-pteropus', 'vallisneria', 'bucephalandra-sp', 'aegagropila-linnaei', 'bolbitis-heudelotii']

/** Beginner guides on what most readers need first (cycling, water changes, easy fish and plants, ich): lead when they have a picture. */
const LEAD_GUIDES = ['aquariumcoop-blogs-aquarium-fish-tank-cycling', 'aquariumcoop-blogs-aquarium-how-to-change-aquarium-water-correctly', 'aquariumcoop-blogs-aquarium-neon-tetras-and-cardinal-tetras', 'aquariumcoop-blogs-aquarium-how-to-get-started-with-aquarium-plants', 'aquariumcoop-blogs-aquarium-betta-tank-setup', 'aquariumcoop-blogs-aquarium-how-to-treat-ich-on-freshwater-fish', 'aquariumcoop-blogs-aquarium-top-5-easy-aquarium-plants', 'aquariumcoop-blogs-aquarium-cory-catfish-care-guide']

/** A photo without a source's watermark banner (Glaser stamps its name across the top), else the first. */
export const cleanPhoto = (photos: Photo[]) => photos.find(p => p.source !== 'glaser') ?? photos[0]

/** Photos first, then the fullest profiles. */
export const richest = (lang: Lang) => (a: Localized<SpeciesEntity>, b: Localized<SpeciesEntity>) =>
  Math.min(b.photos.length, 3) - Math.min(a.photos.length, 3) || b.sections.length - a.sections.length || a.t.name.localeCompare(b.t.name, lang)

const clean = (s: Localized<SpeciesEntity>) => s.photos.some(p => p.source !== 'glaser')
const ok = (s: Localized<SpeciesEntity>) => clean(s) && s.t.quality.indexable

/** Well-known species with an unwatermarked photo, then the richest other profiles. */
function knownFirst(lang: Lang, c: Content): Localized<SpeciesEntity>[] {
  const byId = new Map(c.species.map(s => [s.id, s]))
  // Staples need only a clean photo: readers look for them first, even while a translation is below the indexing bar.
  const staples = STAPLE_SPECIES.flatMap(id => { const s = byId.get(id); return s && clean(s) ? [s] : [] })
  const rest = c.species.filter(s => ok(s) && !staples.includes(s)).sort(richest(lang))
  return [...staples, ...rest]
}

/** The data card's core figures: temperature, pH, adult size and the smallest tank. */
const CORE = ['tempC', 'ph', 'sizeCm', 'tankCm'] as const
const complete = (s: Localized<SpeciesEntity>) => CORE.every(f => resolveDataCard(s.dataCard[f] ?? []) !== null)

/** Species with all core figures first, in their order; one missing a figure only fills a spot nothing complete can. */
export const completeFirst = (list: Localized<SpeciesEntity>[]) => [...list.filter(complete), ...list.filter(s => !complete(s))]

/** The home page's species: well-known ones and the richest profiles, but never a half-empty card while a full one is left. */
export function featuredSpecies(lang: Lang, c: Content, n = 8): Localized<SpeciesEntity>[] {
  return completeFirst(knownFirst(lang, c)).slice(0, n)
}

/** The reader's own country for each language: its native fish get a place on the home page. */
const HOME_PLACE: Record<Lang, string> = { vi: 'vietnam', id: 'indonesia', th: 'thailand' }

/** The language's country, its native fish with a clean photo and an indexable page, and how many its origin page lists. Well-known fish lead: the staples, then the popular list's, in its order. */
export function nativeSpecies(lang: Lang, c: Content) {
  const place = c.places.find(p => p.id === HOME_PLACE[lang])
  const all = place ? c.species.filter(s => s.places.includes(place.id)) : []
  const known = [...STAPLE_SPECIES, ...POPULAR.map(slugify)]
  const rank = (s: Localized<SpeciesEntity>) => (known.includes(s.id) ? known.indexOf(s.id) : known.length)
  return { place, species: all.filter(ok).sort((a, b) => rank(a) - rank(b) || richest(lang)(a, b)), count: all.length }
}

/** The full species list in reading order: the well-known species first, then the best-documented. */
export function listOrder(lang: Lang, c: Content): Localized<SpeciesEntity>[] {
  const first = knownFirst(lang, c)
  return [...first, ...c.species.filter(s => !first.includes(s)).sort(richest(lang))]
}

/**
 * Each species group with a page: its size and a picture of its best-documented member. `pics`: the pictures its page
 * already shows (the home page's fish cards just above): a group whose best member is shown takes its next member's.
 */
export function groupTiles(lang: Lang, c: Content, pics?: PictureSet): { group: string; label: string; count: number; photo?: Photo }[] {
  return Object.entries(GROUP_LABELS)
    .map(([group, label]) => {
      const members = c.species.filter(s => s.group === group)
      const ranked = [...members].sort(richest(lang))
      const photos = [...ranked.filter(clean), ...ranked.filter(s => !clean(s))].flatMap(s => cleanPhoto(s.photos) ?? [])
      return { group, label, count: members.length, photos }
    })
    .filter(g => g.count > 0 && g.group !== 'other')
    .sort((a, b) => b.count - a.count)
    .map(({ photos, ...g }) => ({ ...g, photo: pics ? pics.take(photos) : photos[0] }))
}

/** Plants that need neither strong light nor CO2, easiest first. */
export function easyPlants(c: Content, n = 4): Localized<PlantEntity>[] {
  const easy = c.plants.filter(p => p.photos.length && p.light !== 'high' && p.co2 !== 'required')
  const staples = PLANT_STAPLES.flatMap(id => easy.filter(p => p.id === id))
  const rest = easy.filter(p => !staples.includes(p)).sort((a, b) => a.difficulty - b.difficulty || b.photos.length - a.photos.length || b.sections.length - a.sections.length)
  return [...staples, ...rest].slice(0, n)
}

/** Guides worth leading with: the beginner staples, then practical guides naming the most of our species and plants. */
export function leadGuides(c: Content): Localized<GuideEntity>[] {
  const mentions = (g: Localized<GuideEntity>) => mentionIndex(c).guides.get(g.id)?.keys.length ?? 0
  const practical = ['setup', 'care', 'aquascaping', 'plantCare', 'breeding', 'disease']
  // Video guides have their own section and reading order (their series).
  const ok = c.guides.filter(g => !g.video && practical.includes(g.kind) && guideImage(c, g))
  const staples = LEAD_GUIDES.flatMap(id => ok.filter(g => g.id === id))
  const rest = ok.filter(g => !staples.includes(g)).sort((a, b) => mentions(b) - mentions(a) || practical.indexOf(a.kind) - practical.indexOf(b.kind) || a.id.localeCompare(b.id))
  return [...staples, ...rest]
}

/** Guides for the homepage's three first steps: cycle the tank, choose fish, change water. Missing ones are skipped. */
export const STEP_GUIDES = { cycle: 'aquariumcoop-blogs-aquarium-fish-tank-cycling', water: 'aquariumcoop-blogs-aquarium-how-to-change-aquarium-water-correctly' }

/** What to read after a guide: the next beginner staple if it is one, then guides sharing the most species and plants, same kind first. */
export function nextGuides(c: Content, g: Localized<GuideEntity>, n = 3): Localized<GuideEntity>[] {
  const lead = leadGuides(c)
  const keys = (x: Localized<GuideEntity>) => (mentionIndex(c).guides.get(x.id)?.keys ?? []).filter(k => k.startsWith('species:') || k.startsWith('plant:'))
  const mine = new Set(keys(g))
  const i = lead.indexOf(g)
  const after = i >= 0 && i + 1 < lead.length ? [lead[i + 1]!] : []
  const rest = lead
    .filter(x => x !== g && !after.includes(x))
    .map((x, j) => ({ x, score: keys(x).filter(k => mine.has(k)).length * 10 + (x.kind === g.kind ? 5 : 0) - j * 0.001 }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.x)
  return [...after, ...rest].slice(0, n)
}
