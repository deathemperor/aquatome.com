import { expect, test } from 'vitest'
import { filterPlants, plantQueryFromParams, unsurePlants, type PlantIndexItem, type PlantQuery } from '../src/scripts/filter'

const items: PlantIndexItem[] = [
  { slug: 'anubias', light: 'low', co2: 'none', difficulty: 1, placement: ['foreground', 'epiphyte'] },
  { slug: 'monte-carlo', light: 'medium', co2: 'optional', difficulty: 2, placement: ['foreground'] },
  { slug: 'trân-châu-cuba', light: 'high', co2: 'required', difficulty: 3, placement: ['foreground'] },
  { slug: 'vallisneria', light: 'low', co2: 'optional', difficulty: 1, placement: ['background'] },
]
const slugs = (q: PlantQuery) => filterPlants(items, q).map(i => i.slug)

test("a tank's light grows every plant that needs as much or less", () => {
  expect(slugs({ light: 'low' })).toEqual(['anubias', 'vallisneria'])
  expect(slugs({ light: 'medium' })).toEqual(['anubias', 'monte-carlo', 'vallisneria'])
  expect(slugs({ light: 'high' })).toHaveLength(4)
})
test('no CO₂ keeps the plants that grow without it (none or optional); "required" finds the ones that need it', () => {
  expect(slugs({ co2: 'none' })).toEqual(['anubias', 'monte-carlo', 'vallisneria'])
  expect(slugs({ co2: 'required' })).toEqual(['trân-châu-cuba'])
})
test('a position matches any plant that can go there', () => {
  expect(slugs({ placement: 'foreground' })).toEqual(['anubias', 'monte-carlo', 'trân-châu-cuba'])
  expect(slugs({ placement: 'floating' })).toEqual([])
})
test('difficulty is a cap, and filters combine', () => {
  expect(slugs({ difficultyMax: 1 })).toEqual(['anubias', 'vallisneria'])
  expect(slugs({ difficultyMax: 2, placement: 'foreground', co2: 'none' })).toEqual(['anubias', 'monte-carlo'])
})
test('no filter keeps every plant, none of them unsure', () => {
  expect(slugs({})).toHaveLength(4)
  expect(unsurePlants(items, {})).toEqual([])
})

// A plant missing a figure the filter asks about may fit: it is unsure, never a match. One the figures it has rule out
// stays out of both.
const noPlacement: PlantIndexItem = { slug: 'no-placement', light: 'low', co2: 'none', difficulty: 1 }
const bare: PlantIndexItem = { slug: 'bare' }
test('a plant without the figure is unsure, not a match', () => {
  const all = [...items, noPlacement, bare]
  expect(filterPlants(all, { placement: 'foreground' }).map(i => i.slug)).not.toContain('no-placement')
  expect(unsurePlants(all, { placement: 'foreground' }).map(i => i.slug)).toEqual(['no-placement', 'bare'])
  expect(unsurePlants(all, { light: 'low', co2: 'none' }).map(i => i.slug)).toEqual(['bare'])
  // Its light needs no more than the tank has, but its position is unknown: still unsure.
  expect(unsurePlants(all, { light: 'medium', placement: 'background' }).map(i => i.slug)).toEqual(['no-placement', 'bare'])
  // A figure it has rules it out: out of both lists.
  expect(unsurePlants(all, { light: 'low', co2: 'required', placement: 'foreground' }).map(i => i.slug)).toEqual(['bare'])
})

test('the address gives the query; values the form does not offer are dropped', () => {
  expect(plantQueryFromParams(new URLSearchParams('light=medium&co2=none&placement=epiphyte&difficultyMax=2')))
    .toEqual({ light: 'medium', co2: 'none', placement: 'epiphyte', difficultyMax: 2 })
  expect(plantQueryFromParams(new URLSearchParams('light=blinding&co2=optional&placement=roof&difficultyMax=x')))
    .toEqual({ light: undefined, co2: undefined, placement: undefined, difficultyMax: undefined })
  expect(plantQueryFromParams(new URLSearchParams(''))).toEqual({ light: undefined, co2: undefined, placement: undefined, difficultyMax: undefined })
})
