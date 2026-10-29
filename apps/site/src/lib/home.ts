import type { Content, GuideEntity, Localized, Photo, PlantEntity, SpeciesEntity } from '@aq/schema'
import { GROUP_LABELS } from './format'
import { guideImage, mentionIndex } from './mentions'

/** Species Vietnamese hobbyists know by name: shown first when we have a page with a photo. */
const STAPLES = ['betta-splendens', 'poecilia-reticulata', 'paracheirodon-innesi', 'paracheirodon-axelrodi', 'trigonostigma-heteromorpha', 'symphysodon-aequifasciatus', 'pterophyllum-scalare', 'neocaridina-davidi', 'astronotus-ocellatus', 'puntius-titteya', 'danio-rerio', 'mikrogeophagus-ramirezi']

/** Plants every beginner can grow: shown first. */
const PLANT_STAPLES = ['taxiphyllum-barbieri', 'microsorum-pteropus', 'vallisneria', 'bucephalandra-sp', 'aegagropila-linnaei', 'bolbitis-heudelotii']

/** Beginner guides on what most readers need first (cycling, water changes, easy fish and plants, ich): lead when they have a picture. */
const LEAD_GUIDES = ['aquariumcoop-blogs-aquarium-fish-tank-cycling', 'aquariumcoop-blogs-aquarium-how-to-change-aquarium-water-correctly', 'aquariumcoop-blogs-aquarium-neon-tetras-and-cardinal-tetras', 'aquariumcoop-blogs-aquarium-how-to-get-started-with-aquarium-plants', 'aquariumcoop-blogs-aquarium-betta-tank-setup', 'aquariumcoop-blogs-aquarium-how-to-treat-ich-on-freshwater-fish', 'aquariumcoop-blogs-aquarium-top-5-easy-aquarium-plants', 'aquariumcoop-blogs-aquarium-cory-catfish-care-guide']

/** A photo without a source's watermark banner (Glaser stamps its name across the top), else the first. */
export const cleanPhoto = (photos: Photo[]) => photos.find(p => p.source !== 'glaser') ?? photos[0]

/** Photos first, then the fullest profiles. */
export const richest = (a: Localized<SpeciesEntity>, b: Localized<SpeciesEntity>) =>
  Math.min(b.photos.length, 3) - Math.min(a.photos.length, 3) || b.sections.length - a.sections.length || a.t.name.localeCompare(b.t.name, 'vi')

/** Well-known species with an unwatermarked photo, topped up with the richest other profiles. */
export function featuredSpecies(c: Content, n = 8): Localized<SpeciesEntity>[] {
  const clean = (s: Localized<SpeciesEntity>) => s.photos.some(p => p.source !== 'glaser')
  const ok = (s: Localized<SpeciesEntity>) => clean(s) && s.t.quality.indexable
  const byId = new Map(c.species.map(s => [s.id, s]))
  // Staples need only a clean photo: readers look for them first, even while a translation is below the indexing bar.
  const staples = STAPLES.flatMap(id => { const s = byId.get(id); return s && clean(s) ? [s] : [] })
  const rest = c.species.filter(s => ok(s) && !staples.includes(s)).sort(richest)
  return [...staples, ...rest].slice(0, n)
}

/** The full species list in reading order: the featured species first, then the best-documented. */
export function listOrder(c: Content): Localized<SpeciesEntity>[] {
  const first = featuredSpecies(c, Infinity)
  return [...first, ...c.species.filter(s => !first.includes(s)).sort(richest)]
}

/** Each species group with a page: its size and a picture of its best-documented member. */
export function groupTiles(c: Content): { group: string; label: string; count: number; photo?: Photo }[] {
  return Object.entries(GROUP_LABELS)
    .map(([group, label]) => {
      const members = c.species.filter(s => s.group === group)
      const ranked = [...members].sort(richest)
      const best = ranked.find(s => s.photos.some(p => p.source !== 'glaser')) ?? ranked.find(s => s.photos.length)
      return { group, label, count: members.length, photo: best && cleanPhoto(best.photos) }
    })
    .filter(g => g.count > 0 && g.group !== 'other')
    .sort((a, b) => b.count - a.count)
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
  const ok = c.guides.filter(g => practical.includes(g.kind) && guideImage(c, g))
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
