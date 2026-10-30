import type { BreedEntity, Content, Localized, Photo } from '@aq/schema'
import type { Lang } from './i18n'

export type Breed = Localized<BreedEntity>
export const BREED_KIND: Record<BreedEntity['kind'], string> = { hybrid: 'Cá lai', variety: 'Dòng cá cảnh', transgenic: 'Cá biến đổi gen' }

/** What a breed is a form of: its species or parent breed page, when we have one. */
export function basedOn(c: Content, b: Breed): { name: string; href: string } | undefined {
  const s = c.species.find(x => x.id === b.basedOn) ?? c.breeds.find(x => x.id === b.basedOn)
  return s && { name: s.t.name, href: `/vi/ca/${s.t.slug}/` }
}

/** Every photo but the main one: the few kept on the page, then its gallery. */
export const breedGallery = (c: Content, b: Breed): Photo[] => [...b.photos.slice(1), ...(c.galleries[b.id] ?? [])]

/** Lines, colour forms and hybrids made from a species (or from another breed), for its page. */
export const breedsOf = (lang: Lang, c: Content, id: string): Breed[] =>
  c.breeds.filter(b => b.basedOn === id || b.parents.some(p => p.species === id)).sort((a, b) => a.t.name.localeCompare(b.t.name, lang))

/** The care card in the species card's shape: each value cites its source by position, named by the source's title. */
export function careCard(b: Breed) {
  const card = Object.fromEntries(Object.entries(b.care).map(([f, vs]) => [f, (vs ?? []).map(v => ({ source: String(v.source), value: v.value }))]))
  const sources = Object.fromEntries(b.sources.map((s, i) => [String(i), { name: s.title }]))
  return { card, sources }
}

