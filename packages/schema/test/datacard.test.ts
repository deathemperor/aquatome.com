import { expect, test } from 'vitest'
import { resolveDataCard, type SourcedValue } from '../src/index'

const sf: SourcedValue = { source: 'seriouslyfish', value: { min: 24, max: 30 } }
const pc: SourcedValue = { source: 'planetcatfish', value: { min: 22, max: 28 } }

test('prefers Seriously Fish and flags conflict', () => {
  expect(resolveDataCard([pc, sf])).toEqual({ value: { min: 24, max: 30 }, sources: ['seriouslyfish', 'planetcatfish'], conflict: true })
})
test('unions ranges when Seriously Fish absent', () => {
  expect(resolveDataCard([pc, { source: 'glaser', value: { min: 20, max: 26 } }])).toEqual({ value: { min: 20, max: 28 }, sources: ['planetcatfish', 'glaser'], conflict: true })
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
