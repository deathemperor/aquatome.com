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

export type Latest = { kind: 'species'; x: Localized<SpeciesEntity> } | { kind: 'plant'; x: Localized<PlantEntity> } | { kind: 'guide'; x: Localized<GuideEntity> }

/** Newest additions (changelog "new"), most recent first; only pages that are on the site. */
export function latest(c: Content, n = 6): Latest[] {
  const out: Latest[] = []
  const seen = new Set<string>()
  for (const e of [...c.changelog].reverse().sort((a, b) => b.date.localeCompare(a.date))) {
    if (e.action !== 'new' || seen.has(`${e.kind}:${e.id}`)) continue
    seen.add(`${e.kind}:${e.id}`)
    const item: Latest | undefined =
      e.kind === 'species' ? (s => s && { kind: 'species' as const, x: s })(c.species.find(s => s.id === e.id && s.photos.length))
      : e.kind === 'plant' ? (p => p && { kind: 'plant' as const, x: p })(c.plants.find(p => p.id === e.id && p.photos.length))
      : (g => g && guideImage(c, g) && { kind: 'guide' as const, x: g })(c.guides.find(g => g.id === e.id && g.kind !== 'discovery'))
    if (item) out.push(item)
    if (out.length >= n) break
  }
  return out
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

/** Continents with how many species come from each. */
export const continents = (c: Content) =>
  c.places.filter(p => p.kind === 'continent').map(p => ({ p, count: c.species.filter(s => s.places.includes(p.id)).length })).filter(x => x.count > 0).sort((a, b) => b.count - a.count)
