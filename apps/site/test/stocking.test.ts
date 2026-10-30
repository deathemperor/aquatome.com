import { expect, test } from 'vitest'
import { bioload, stocking } from '../src/scripts/stocking'

test('bioload grows with length^2.25: a 3.5 cm tetra is 1 unit, one tank holds 1 unit per 1.5 litres of water', () => {
  expect(bioload(3.5)).toBeCloseTo(1)
  // The minimums it reproduces: a 60 cm tank (55 L water) full at ~36 small tetras, one goldfish 75 L, one oscar 270 L.
  expect(stocking([{ name: 'Neon', sizeCm: 3.5, count: 36 }], 55).percent).toBeCloseTo(98, 0)
  for (const [cm, litres] of [[20, 75], [35, 270]] as const) {
    const p = stocking([{ name: 'x', sizeCm: cm, count: 1 }], litres).percent
    expect(p).toBeGreaterThan(90)
    expect(p).toBeLessThan(110)
  }
  // A normal 60 cm community: 10 neons + 8 harlequins is comfortably "ok", not full.
  expect(stocking([{ name: 'Neon', sizeCm: 4, count: 10 }, { name: 'Tam giác', sizeCm: 4.5, count: 8 }], 55).level).toBe('ok')
})

test('levels, shares, missing sizes, schools too small, tank too short, filter turnover', () => {
  const r = stocking([
    { name: 'Neon', sizeCm: 3.5, count: 4, schoolMin: 6 },
    { name: 'Cá chuột', sizeCm: 6, count: 6, schoolMin: 6 },
    { name: 'Ốc', count: 2 },
    { name: 'Cá thần tiên', sizeCm: 15, count: 2, tankCm: 80 },
  ], 55, { tankCm: 60, filterLph: 200, grossLitres: 65 })
  expect(r.level).toBe('over')
  expect(r.perFish.map(f => f.name)).toEqual(['Cá thần tiên', 'Cá chuột', 'Neon']) // biggest share first
  expect(r.perFish.reduce((a, f) => a + f.share, 0)).toBeCloseTo(1)
  expect(r.unknown).toEqual(['Ốc'])
  expect(r.school).toEqual([{ name: 'Neon', count: 4, min: 6 }])
  expect(r.tooShort).toEqual([{ name: 'Cá thần tiên', tankCm: 80 }])
  expect(r.turnover).toBeCloseTo(200 / 65)
  expect(stocking([{ name: 'Neon', sizeCm: 3.5, count: 15 }], 55).level).toBe('light')
  expect(stocking([{ name: 'Neon', sizeCm: 3.5, count: 25 }], 55).level).toBe('ok')
  expect(stocking([{ name: 'Neon', sizeCm: 3.5, count: 34 }], 55).level).toBe('full')
})
