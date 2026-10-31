import { expect, test } from 'vitest'
import { filterSpecies, keepBreed, unsureSpecies, type SpeciesIndexItem } from '../src/scripts/filter'

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
test('empty query returns everything', () => {
  expect(slugs({})).toHaveLength(3)
})

// The home form's tank (60 cm, 26 °C, pH 7) against species with some figures missing.
const angel: SpeciesIndexItem = { slug: 'ca-ong-tien', name: 'Cá ông tiên', scientificName: 'Pterophyllum scalare', group: 'cichlids', sizeCm: 15 }
const noTank: SpeciesIndexItem = { slug: 'ca-x', name: 'Cá x', scientificName: 'X x', group: 'tetras', difficulty: 2, tempC: { min: 22, max: 28 }, ph: { min: 6, max: 8 } }
const hot: SpeciesIndexItem = { slug: 'ca-nong', name: 'Cá nóng', scientificName: 'Y y', group: 'tetras', tempC: { min: 28, max: 32 } }
const tank = { tankCm: 60, tempC: 26, ph: 7 }
const mixed = [...items, angel, noTank, hot]

test('a species missing a figure the reader asked about is not counted as a match', () => {
  expect(filterSpecies([angel], { tempC: 25 })).toEqual([])
  expect(filterSpecies(mixed, tank).map(i => i.slug)).toEqual(['ca-neon-xanh'])
})
test('it goes to the unsure group instead, unless a figure it does have already rules it out', () => {
  expect(unsureSpecies(mixed, tank).map(i => i.slug)).toEqual(['ca-ong-tien', 'ca-x']) // ca-nong: 28–32 °C, too warm for 26 °C
  expect(unsureSpecies(mixed, { difficultyMax: 3 }).map(i => i.slug)).toEqual(['ca-ong-tien', 'ca-nong'])
})
test('a name or group search is never unsure: every species has a name and a group', () => {
  expect(unsureSpecies(mixed, { text: 'ca' })).toEqual([])
  expect(unsureSpecies(mixed, { group: 'cichlids' })).toEqual([])
  expect(unsureSpecies(mixed, { group: 'tetras', tankCm: 60 }).map(i => i.slug)).toEqual(['ca-x', 'ca-nong'])
  expect(unsureSpecies(mixed, {})).toEqual([])
})
test('sure and unsure never overlap', () => {
  const sure = new Set(filterSpecies(mixed, tank))
  expect(unsureSpecies(mixed, tank).filter(i => sure.has(i))).toEqual([])
})

test('breeds: all with no query, a name search keeps the matches, any water filter hides them', () => {
  expect(keepBreed('Betta Koi (Koi betta)', {})).toBe(true)
  expect(keepBreed('Betta Koi (Koi betta)', { text: 'chach' })).toBe(false)
  expect(keepBreed('Cá La Hán (Flowerhorn)', { text: 'la han' })).toBe(true)
  expect(keepBreed('Cá La Hán (Flowerhorn)', { text: 'la han', tempC: 26 })).toBe(false)
  expect(keepBreed('Cá La Hán (Flowerhorn)', { group: 'cichlid' })).toBe(false)
})
