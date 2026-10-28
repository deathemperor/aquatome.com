import { expect, test } from 'vitest'
import { filterSpecies, type SpeciesIndexItem } from '../src/scripts/filter'

const items: SpeciesIndexItem[] = [
  { slug: 'ca-neon-xanh', name: 'Cá neon xanh', scientificName: 'Paracheirodon innesi', group: 'tetras', difficulty: 2, tempC: { min: 20, max: 26 }, ph: { min: 5, max: 7 }, tankCm: 60 },
  { slug: 'ca-dia', name: 'Cá đĩa', scientificName: 'Symphysodon aequifasciatus', group: 'cichlids', difficulty: 7, tempC: { min: 28, max: 31 }, ph: { min: 4.5, max: 6.5 }, tankCm: 120 },
  { slug: 'ca-galaxy', name: 'Cá galaxy', scientificName: 'Danio margaritatus', group: 'danios', difficulty: 3, tempC: { min: 20, max: 25 }, ph: { min: 6.5, max: 7.5 }, tankCm: 45 },
]
const slugs = (q: Parameters<typeof filterSpecies>[1]) => filterSpecies(items, q).map(i => i.slug)

test('temperature must fall inside the species range', () => {
  expect(slugs({ tempC: 29 })).toEqual(['ca-dia'])
})
test('text match ignores diacritics', () => {
  expect(slugs({ text: 'ca dia' })).toEqual(['ca-dia'])
  expect(slugs({ text: 'symphysodon' })).toEqual(['ca-dia'])
})
test('tank length excludes species needing a bigger tank', () => {
  expect(slugs({ tankCm: 60 })).toEqual(['ca-neon-xanh', 'ca-galaxy'])
})
test('difficulty cap, group and pH combine', () => {
  expect(slugs({ difficultyMax: 3, ph: 7 })).toEqual(['ca-neon-xanh', 'ca-galaxy'])
  expect(slugs({ group: 'danios' })).toEqual(['ca-galaxy'])
})
test('species missing a field are kept rather than hidden', () => {
  expect(filterSpecies([{ slug: 'x', name: 'X', scientificName: 'X x', group: 'tetras' }], { tempC: 25 }).length).toBe(1)
})
test('empty query returns everything', () => {
  expect(slugs({})).toHaveLength(3)
})
