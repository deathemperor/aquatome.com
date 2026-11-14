import type { BreedEntity, Content, Localized, Photo, Range } from '@aq/schema'
import { cardRows } from './card-rows'
import type { Lang } from './i18n'
import { asNum, asRange } from './species-index'

export type Breed = Localized<BreedEntity>
export const BREED_KIND: Record<BreedEntity['kind'], string> = { hybrid: 'Cá lai', variety: 'Dòng cá cảnh', transgenic: 'Cá biến đổi gen' }

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
