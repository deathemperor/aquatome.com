import { expect, test } from 'vitest'
import type { SpeciesIndexItem } from '../src/scripts/filter'
import { judge, pickCompanions } from '../src/lib/companions'

// A soft-water community fish, and others around it. Every verdict is the tank-mates tool's (checkTankmates).
const f = (slug: string, o: Partial<SpeciesIndexItem> = {}): SpeciesIndexItem => ({
  slug, name: slug, scientificName: slug, group: 'tetras', tempC: { min: 23, max: 27 }, ph: { min: 5, max: 7 }, sizeCm: 4, temperament: 'peaceful', ...o,
})
const neon = f('neon')

test('good: every column of the tool would read "Ổn", with data on both sides', () => {
  expect(judge(neon, f('rasbora', { group: 'rasboras' }))).toEqual({ kind: 'good' })
  expect(judge(neon, f('hard', { gh: { min: 1, max: 4 } }))).toEqual({ kind: 'good' }) // hardness known on one side only
})

test('missing data is never compatible', () => {
  expect(judge(neon, f('x', { tempC: undefined }))).toBeNull() // no water figures: neither good nor avoid
  expect(judge(neon, f('x', { temperament: undefined }))).toBeNull()
  expect(judge(neon, f('x', { sizeCm: undefined }))).toBeNull()
  expect(judge({ ...neon, temperament: undefined }, f('x'))).toBeNull()
})

test('water: a pair that shares no range is neither; a 1 °C or 0,2 pH overlap is too narrow to suggest', () => {
  expect(judge(neon, f('cold', { tempC: { min: 10, max: 20 }, temperament: 'predator' }))).toBeNull()
  expect(judge(neon, f('edge', { tempC: { min: 26, max: 30 } }))).toBeNull()
  expect(judge(neon, f('edge', { ph: { min: 6.8, max: 8 } }))).toBeNull()
  expect(judge({ ...neon, gh: { min: 1, max: 4 } }, f('gh', { gh: { min: 10, max: 20 } }))).toBeNull() // both know hardness, no overlap
})

test('avoid: the clash that matters most to this species', () => {
  expect(judge(neon, f('angel', { sizeCm: 15, temperament: 'semi-aggressive' }))).toEqual({ kind: 'avoid', reason: 'eatsIt' }) // 15 ≥ 3 × 4
  expect(judge(f('big', { sizeCm: 12 }), f('tiny', { sizeCm: 3 }))).toEqual({ kind: 'avoid', reason: 'eatenByIt' })
  expect(judge(neon, f('pike', { temperament: 'predator' }))).toEqual({ kind: 'avoid', reason: 'predator' })
  expect(judge(neon, f('cichlid', { temperament: 'aggressive' }))).toEqual({ kind: 'avoid', reason: 'aggressive' })
  expect(judge(neon, f('barb', { temperament: 'semi-aggressive' }))).toEqual({ kind: 'avoid', reason: 'semiAggressive' })
  expect(judge(neon, f('nipper', { finNipper: true }))).toEqual({ kind: 'avoid', reason: 'finNipper' })
  // Two semi-aggressive fish: the tool has no warning, so neither list.
  expect(judge(f('a', { temperament: 'semi-aggressive' }), f('b', { temperament: 'semi-aggressive' }))).toEqual({ kind: 'good' })
})

test('picks: up to 5 to keep with it, varied groups first; up to 3 to avoid, worst first; never itself', () => {
  const ranked = [
    neon, f('t1'), f('t2'), f('t3'), f('r1', { group: 'rasboras' }), f('c1', { group: 'catfish' }), f('s1', { group: 'shrimp' }),
    f('nipper', { finNipper: true }), f('barb', { temperament: 'semi-aggressive', group: 'barbs' }), f('oscar', { sizeCm: 30, group: 'cichlids' }), f('pike', { temperament: 'predator', group: 'other' }),
  ].map(item => ({ item }))
  const { good, avoid } = pickCompanions(neon, ranked)
  expect(good.map(x => x.item.slug)).toEqual(['t1', 'r1', 'c1', 's1', 't2'])
  expect(avoid.map(x => [x.item.slug, x.reason])).toEqual([['oscar', 'eatsIt'], ['pike', 'predator'], ['barb', 'semiAggressive']])
})
