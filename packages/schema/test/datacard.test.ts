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
test('empty input returns null', () => {
  expect(resolveDataCard([])).toBeNull()
})
