import { expect, test } from 'vitest'
import { SALTS, gramsFor, ppm } from '../src/scripts/ferts'

test('mass fractions agree with the molar masses', () => {
  expect(SALTS.kno3.gives.NO3 + SALTS.kno3.gives.K).toBeCloseTo(1, 3) // K + NO3 is the whole salt
  expect(SALTS.k2so4.gives.K + SALTS.k2so4.gives.SO4).toBeCloseTo(1, 3)
})

test('ppm straight in, and from a solution', () => {
  // 1 g KNO3 in 100 L → 6.13 ppm NO3, 3.87 ppm K.
  const r = ppm('kno3', 1, 100)
  expect(r.NO3).toBeCloseTo(6.13, 2)
  expect(r.K).toBeCloseTo(3.87, 2)
  // 50 g in 500 ml, 10 ml dose into 100 L = 1 g → same.
  expect(ppm('kno3', 50, 100, { solutionMl: 500, doseMl: 10 }).NO3).toBeCloseTo(6.13, 2)
})

test('grams for a target, and none when the salt has no such ion', () => {
  // EI-sized dose: 7.5 ppm NO3 in 75 L → 0.92 g KNO3 (about ½ teaspoon, as EI recipes give for 20 gallons).
  expect(gramsFor('kno3', 'NO3', 7.5, 75)).toBeCloseTo(0.917, 2)
  expect(gramsFor('kh2po4', 'PO4', 1.3, 75)).toBeCloseTo(0.14, 2)
  expect(gramsFor('kno3', 'Fe', 1, 75)).toBeUndefined()
})
