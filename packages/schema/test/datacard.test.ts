import { expect, test } from 'vitest'
import { resolveDataCard, type SourcedValue } from '../src/index'

const sf: SourcedValue = { source: 'seriouslyfish', value: { min: 24, max: 30 } }
const pc: SourcedValue = { source: 'planetcatfish', value: { min: 22, max: 28 } }

test('sources that disagree: the range they all accept, Seriously Fish listed first', () => {
  expect(resolveDataCard([pc, sf])).toEqual({ value: { min: 24, max: 28 }, sources: ['seriouslyfish', 'planetcatfish'], conflict: true, agreed: true })
  expect(resolveDataCard([pc, { source: 'glaser', value: { min: 20, max: 26 } }])).toEqual({ value: { min: 22, max: 26 }, sources: ['planetcatfish', 'glaser'], conflict: true, agreed: true })
})
test('ranges with nothing in common: Seriously Fish, else the union', () => {
  const cold: SourcedValue = { source: 'glaser', value: { min: 16, max: 22 } }
  expect(resolveDataCard([cold, sf])).toEqual({ value: { min: 24, max: 30 }, sources: ['seriouslyfish', 'glaser'], conflict: true, agreed: false })
  expect(resolveDataCard([cold, { source: 'planetcatfish', value: { min: 24, max: 28 } }])?.value).toEqual({ min: 16, max: 28 })
})
test('identical values are not a conflict', () => {
  expect(resolveDataCard([pc, { ...pc, source: 'glaser' }])?.conflict).toBe(false)
})
test('plain numbers: SF else max', () => {
  expect(resolveDataCard([{ source: 'glaser', value: 3 }, { source: 'planetcatfish', value: 5 }])?.value).toBe(5)
  expect(resolveDataCard([{ source: 'glaser', value: 3 }, { source: 'seriouslyfish', value: 2 }])?.value).toBe(2)
})
test('a lifespan is no care target: sources that disagree give the widest, not what they share', () => {
  const a: SourcedValue = { source: 'sprucepets', value: { min: 3, max: 5 } }
  const b: SourcedValue = { source: 'aquariumbreeder', value: { min: 5, max: 8 } }
  expect(resolveDataCard([a, b], 'lifeYears')).toEqual({ value: { min: 3, max: 8 }, sources: ['sprucepets', 'aquariumbreeder'], conflict: true, agreed: false })
  // The same ranges as a temperature: what they share.
  expect(resolveDataCard([a, b])?.value).toEqual({ min: 5, max: 5 })
  expect(resolveDataCard([a, { source: 'seriouslyfish', value: { min: 4, max: 6 } }], 'lifeYears')?.value).toEqual({ min: 4, max: 6 })
})
test('empty input returns null', () => {
  expect(resolveDataCard([])).toBeNull()
})
