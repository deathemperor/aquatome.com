import type { BreedEntity, Content, Localized, Photo, Range, SpeciesEntity } from '@aq/schema'
import { cardRows } from './card-rows'
import type { Lang } from './i18n'
import { asNum, asRange } from './species-index'
import { isFish, NOT_FISH_GAPS } from './taxa-places'

export type Breed = Localized<BreedEntity>
export const BREED_KIND: Record<BreedEntity['kind'], string> = { hybrid: 'Cá lai', variety: 'Dòng cá cảnh', transgenic: 'Cá biến đổi gen' }
/** A line of a shrimp, a crab or a snail isn't a fish: its kind in words that don't call it one. */
const NOT_FISH_KIND: Record<BreedEntity['kind'], string> = { hybrid: 'Con lai', variety: 'Dòng nuôi cảnh', transgenic: 'Biến đổi gen' }
export const breedKind = (kind: BreedEntity['kind'], fish: boolean) => (fish ? BREED_KIND : NOT_FISH_KIND)[kind]

/** Whether a breed is a fish's: its species' (through the breed it's a form of), else its parents' first. */
/** Whether a species' or a line's page is a fish's: a species by its group and order, a line by its species. */
export const pageIsFish = (c: Pick<Content, 'species' | 'breeds'>, s: Pick<SpeciesEntity, 'id' | 'group' | 'order'> | Pick<BreedEntity, 'id' | 'basedOn' | 'parents'>) =>
  'order' in s ? isFish(s) : breedIsFish(c, s)
export function breedIsFish(c: Pick<Content, 'species' | 'breeds'>, b: Pick<BreedEntity, 'id' | 'basedOn' | 'parents'>, seen = new Set<string>()): boolean {
  if (NOT_FISH_GAPS.has(b.id)) return false
  const s = c.species.find(x => x.id === b.basedOn) ?? c.species.find(x => x.id === b.parents.find(p => p.species)?.species)
  if (s) return isFish(s)
  const up = c.breeds.find(x => x.id === b.basedOn)
  return !up || seen.has(up.id) ? true : breedIsFish(c, up, seen.add(up.id))
}

/** What a breed is a form of: its species or parent breed page, when we have one. */
export function basedOn(c: Content, b: Breed): { name: string; href: string } | undefined {
  const s = c.species.find(x => x.id === b.basedOn) ?? c.breeds.find(x => x.id === b.basedOn)
  return s && { name: s.t.name, href: `/vi/ca/${s.t.slug}/` }
}

/** Every photo but the main one: the few kept on the page, then its gallery. */
export const breedGallery = (c: Pick<Content, 'galleries'>, b: Breed): Photo[] => [...b.photos.slice(1), ...(c.galleries[b.id] ?? [])]

/** Lines, colour forms and hybrids made from a species (or from another breed), for its page. */
export const breedsOf = (lang: Lang, c: Content, id: string): Breed[] =>
  c.breeds.filter(b => b.basedOn === id || b.parents.some(p => p.species === id)).sort((a, b) => a.t.name.localeCompare(b.t.name, lang))

/** The care card in the species card's shape: each value cites its source by position, named by the source's title. */
export function careCard(b: Breed) {
  const card = Object.fromEntries(Object.entries(b.care).map(([f, vs]) => [f, (vs ?? []).map(v => ({ source: String(v.source), value: v.value }))]))
  const sources = Object.fromEntries(b.sources.map((s, i) => [String(i), { name: s.title }]))
  return { card, sources }
}


/**
 * A breed's figures, one for each row its page's data card shows, resolved as the card resolves them (cardRows, as
 * DataCard.astro): a range for temperature, pH, hardness and lifespan; one figure for size, tank and difficulty, as the
 * app index gives a species' (toIndexItem).
 */
export type BreedFigures = { tempC?: Range; ph?: Range; gh?: Range; sizeCm?: number; tankCm?: number; difficulty?: number; lifeYears?: Range }
export function breedFigures(b: Breed): BreedFigures {
  const out: BreedFigures = {}
  for (const r of cardRows(careCard(b).card)) {
    if (r.field === 'tempC' || r.field === 'ph' || r.field === 'gh' || r.field === 'lifeYears') out[r.field] = asRange(r.value)
    else out[r.field] = asNum(r.value)
  }
  return out
}

/**
 * The species a breed is a form of: its `basedOn`, through a parent breed's own, up to a species of this language's
 * content. None for a hybrid, or a breed linked to no species (or through a breed this language lacks).
 */
export function speciesOf(c: Content, b: Breed): string | undefined {
  if (b.kind === 'hybrid') return undefined
  const seen = new Set<string>()
  for (let id = b.basedOn; id && !seen.has(id); id = c.breeds.find(x => x.id === id)?.basedOn) {
    seen.add(id)
    if (c.species.some(s => s.id === id)) return id
  }
  return undefined
}
