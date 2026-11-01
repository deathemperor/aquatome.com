import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { filterPlants, filterSpecies, unsurePlants, unsureSpecies, type PlantIndexItem, type PlantQuery, type SpeciesIndexItem, type SpeciesQuery } from '../src/scripts/filter'

// Shared with the iOS app's tests, which run the app's own filters on the same cases.
type Case<Q> = { note: string; query: Q; fit: string[]; unsure: string[] }
type Vectors = {
  species: (Partial<SpeciesIndexItem> & { name: string })[]; speciesCases: Case<SpeciesQuery>[]
  plants: (Omit<PlantIndexItem, 'slug'> & { name: string })[]; plantCases: Case<PlantQuery>[]
}
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/filter-vectors.json', import.meta.url), 'utf8'))

test('the fish list\'s filters answer each shared case: what fits, then what may', () => {
  const items = v.species.map(s => ({ slug: s.name, scientificName: '', group: 'tetras', ...s }) as SpeciesIndexItem)
  expect(v.speciesCases.length).toBeGreaterThan(3)
  for (const c of v.speciesCases) {
    expect(filterSpecies(items, c.query).map(i => i.name), c.note).toEqual(c.fit)
    expect(unsureSpecies(items, c.query).map(i => i.name), c.note).toEqual(c.unsure)
  }
})

test('the plant list\'s filters answer each shared case', () => {
  const items = v.plants.map(p => ({ slug: p.name, ...p }))
  expect(v.plantCases.length).toBeGreaterThan(2)
  for (const c of v.plantCases) {
    expect(filterPlants(items, c.query).map(i => (i as typeof items[number]).name), c.note).toEqual(c.fit)
    expect(unsurePlants(items, c.query).map(i => (i as typeof items[number]).name), c.note).toEqual(c.unsure)
  }
})
