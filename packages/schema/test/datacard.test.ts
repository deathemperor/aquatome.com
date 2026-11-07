import { expect, test } from 'vitest'
import { resolveDataCard, type SourcedValue } from '../src/index'

const sf: SourcedValue = { source: 'seriouslyfish', value: { min: 24, max: 30 } }
const pc: SourcedValue = { source: 'planetcatfish', value: { min: 22, max: 28 } }

test('ranges that disagree: Seriously Fish\'s (the owner, 2026-11-06), listed first; without it, the full span', () => {
  expect(resolveDataCard([pc, sf], 'tempC')).toEqual({ value: { min: 24, max: 30 }, sources: ['seriouslyfish', 'planetcatfish'], conflict: true })
  // Paradise fish: 10–22 and 21–28 °C was 21–22 °C, the part both accept.
  expect(resolveDataCard([{ source: 'seriouslyfish', value: { min: 10, max: 22 } }, { source: 'bwaquatics', value: { min: 21, max: 28 } }], 'tempC')?.value).toEqual({ min: 10, max: 22 })
  const cold: SourcedValue = { source: 'glaser', value: { min: 16, max: 22 } }
  expect(resolveDataCard([cold, pc], 'ph')?.value).toEqual({ min: 16, max: 28 })
})
test('identical values are not a conflict', () => {
  expect(resolveDataCard([pc, { ...pc, source: 'glaser' }], 'tempC')?.conflict).toBe(false)
})
test('plain numbers: SF else max', () => {
  expect(resolveDataCard([{ source: 'glaser', value: 3 }, { source: 'planetcatfish', value: 5 }], 'sizeCm')?.value).toBe(5)
  expect(resolveDataCard([{ source: 'glaser', value: 3 }, { source: 'seriouslyfish', value: 2 }], 'tankCm')?.value).toBe(2)
})
test('difficulty: the easiest rating any source gives (the owner, 2026-11-06), so a betta is not "hard" for one source', () => {
  expect(resolveDataCard([{ source: 'sprucepets', value: 3 }, { source: 'seriouslyfish', value: 6 }], 'difficulty')?.value).toBe(3)
})
test('a lifespan: Seriously Fish when it gives one, else the widest', () => {
  const a: SourcedValue = { source: 'sprucepets', value: { min: 3, max: 5 } }
  const b: SourcedValue = { source: 'aquariumbreeder', value: { min: 5, max: 8 } }
  expect(resolveDataCard([a, b], 'lifeYears')).toEqual({ value: { min: 3, max: 8 }, sources: ['sprucepets', 'aquariumbreeder'], conflict: true })
  expect(resolveDataCard([a, { source: 'seriouslyfish', value: { min: 4, max: 6 } }], 'lifeYears')?.value).toEqual({ min: 4, max: 6 })
})
test('empty input returns null', () => {
  expect(resolveDataCard([], 'tempC')).toBeNull()
})
