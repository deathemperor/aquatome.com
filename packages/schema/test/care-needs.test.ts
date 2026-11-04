import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { careNeeds, NEED_ORDER, resolveDataCard, type DataCardField, type NeedInput, type Range, type SpeciesEntity } from '../src/index'

// The site's fixture species, read as the app index reads them (apps/site/src/lib/species-index.ts toIndexItem): the
// card's resolved values, ranges for temperature, pH and GH, the longest size and tank, and the traits file if any.
const FIXTURE = new URL('../../../apps/site/test/fixture-content/', import.meta.url)
function fixture(id: string): NeedInput {
  const s = JSON.parse(readFileSync(new URL(`species/${id}/entity.json`, FIXTURE), 'utf8')) as SpeciesEntity
  const r = (f: DataCardField) => resolveDataCard(s.dataCard[f] ?? [])?.value
  const range = (v: Range | number | undefined) => (v === undefined ? undefined : typeof v === 'number' ? { min: v, max: v } : v)
  const num = (v: Range | number | undefined) => (v === undefined ? undefined : typeof v === 'number' ? v : v.max)
  const file = new URL(`traits/${id}.json`, FIXTURE)
  const traits = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return { tempC: range(r('tempC')), ph: range(r('ph')), gh: range(r('gh')), sizeCm: num(r('sizeCm')), tankCm: num(r('tankCm')), temperament: traits.temperament, finNipper: traits.finNipper, schoolMin: traits.schoolMin }
}
const levels = (f: NeedInput) => Object.fromEntries(careNeeds(f).map(n => [n.key, n.level]))

test('cherry shrimp: every need it has figures for is easy; no traits file, so no temperament or social need', () => {
  expect(careNeeds(fixture('neocaridina-davidi'))).toEqual([
    { key: 'space', level: 'easy', tankCm: 30, sizeCm: 3 },
    { key: 'water', level: 'easy', ph: { min: 6.5, max: 8 }, why: [] },
    { key: 'temperature', level: 'easy', tempC: { min: 18, max: 28 }, why: [] },
  ])
})

test('discus: a 120 cm tank, acid water and warm water only are each hard', () => {
  expect(careNeeds(fixture('symphysodon-aequifasciatus'))).toEqual([
    { key: 'space', level: 'hard', tankCm: 120, sizeCm: 15 },
    { key: 'water', level: 'hard', ph: { min: 4.5, max: 6.5 }, why: ['acid'] },
    { key: 'temperature', level: 'hard', tempC: { min: 28, max: 31 }, why: ['warm'] },
  ])
})

test('cardinal tetra: soft acid water is hard, the sources\' shared temperature range is narrow, a school of 8 is medium', () => {
  expect(careNeeds(fixture('paracheirodon-axelrodi'))).toEqual([
    { key: 'space', level: 'easy', tankCm: 60, sizeCm: 5 },
    { key: 'water', level: 'hard', ph: { min: 4, max: 6 }, gh: { min: 1, max: 6 }, why: ['acid', 'soft'] },
    { key: 'temperature', level: 'mid', tempC: { min: 24, max: 27 }, why: ['narrow'] },
    { key: 'temperament', level: 'easy', temperament: 'peaceful', finNipper: false },
    { key: 'social', level: 'mid', schoolMin: 8 },
  ])
})

test('a cichlid that is semi-aggressive is medium; no smallest group, so no social need', () => {
  expect(levels(fixture('apistogramma-cacatuoides'))).toEqual({ space: 'easy', water: 'easy', temperature: 'easy', temperament: 'mid' })
})

test('missing figures leave their need out rather than count it easy', () => {
  // Angelfish in the fixture: only a size, no tank, water, temperature or traits.
  expect(careNeeds(fixture('pterophyllum-scalare'))).toEqual([{ key: 'space', level: 'mid', sizeCm: 15 }])
  expect(careNeeds({})).toEqual([])
  expect(careNeeds({ temperament: null, finNipper: false, schoolMin: null })).toEqual([])
})

test('needs come in a fixed order', () => {
  const all = careNeeds({ tankCm: 60, ph: { min: 6, max: 8 }, tempC: { min: 22, max: 28 }, temperament: 'peaceful', schoolMin: 6 })
  expect(all.map(n => n.key)).toEqual(NEED_ORDER)
})

test('the thresholds, at their edges', () => {
  // Space: the worse of the tank and the fish.
  expect(levels({ tankCm: 60 }).space).toBe('easy')
  expect(levels({ tankCm: 61 }).space).toBe('mid')
  expect(levels({ tankCm: 100 }).space).toBe('mid')
  expect(levels({ tankCm: 120 }).space).toBe('hard')
  expect(levels({ tankCm: 60, sizeCm: 12 }).space).toBe('mid')
  expect(levels({ sizeCm: 25 }).space).toBe('hard')
  // Water: acid is harder than alkaline; a narrow range is medium.
  expect(careNeeds({ ph: { min: 6.8, max: 8.5 } })[0]).toMatchObject({ level: 'easy', why: [] })
  expect(careNeeds({ ph: { min: 7.5, max: 8.5 } })[0]).toMatchObject({ level: 'mid', why: ['alkaline'] })
  expect(careNeeds({ ph: { min: 5.5, max: 6.8 } })[0]).toMatchObject({ level: 'mid', why: ['acid'] })
  expect(careNeeds({ ph: { min: 6.8, max: 7.4 } })[0]).toMatchObject({ level: 'mid', why: ['narrowPh'] })
  expect(careNeeds({ gh: { min: 2, max: 6 } })[0]).toMatchObject({ level: 'hard', why: ['soft'] })
  expect(careNeeds({ gh: { min: 15, max: 25 } })[0]).toMatchObject({ level: 'mid', why: ['veryHard'] })
  expect(careNeeds({ gh: { min: 8, max: 10 } })[0]).toMatchObject({ level: 'mid', why: ['narrowGh'] })
  expect(careNeeds({ ph: { min: 6, max: 8 }, gh: { min: 3, max: 6 } })[0]).toMatchObject({ level: 'hard', why: ['soft'] })
  // Temperature: warm or cool water only is hard; leaning warm or cool, or a narrow range, is medium.
  expect(careNeeds({ tempC: { min: 16, max: 22 } })[0]).toMatchObject({ level: 'hard', why: ['cool'] })
  expect(careNeeds({ tempC: { min: 20, max: 25 } })[0]).toMatchObject({ level: 'mid', why: ['cool'] })
  expect(careNeeds({ tempC: { min: 26, max: 30 } })[0]).toMatchObject({ level: 'mid', why: ['warm'] })
  expect(careNeeds({ tempC: { min: 24, max: 27 } })[0]).toMatchObject({ level: 'mid', why: ['narrow'] })
  expect(careNeeds({ tempC: { min: 22, max: 28 } })[0]).toMatchObject({ level: 'easy', why: [] })
  // Temperament: a fin nipper is at least medium; a predator or an aggressive fish is hard.
  expect(levels({ temperament: 'peaceful', finNipper: true }).temperament).toBe('mid')
  expect(careNeeds({ finNipper: true })[0]).toEqual({ key: 'temperament', level: 'mid', finNipper: true })
  expect(levels({ temperament: 'predator' }).temperament).toBe('hard')
  expect(levels({ temperament: 'aggressive' }).temperament).toBe('hard')
  // Social: the smallest group.
  expect(levels({ schoolMin: 5 }).social).toBe('easy')
  expect(levels({ schoolMin: 6 }).social).toBe('mid')
  expect(levels({ schoolMin: 10 }).social).toBe('hard')
})
