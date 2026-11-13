import { expect, test } from 'vitest'
import { cardRows, gapMatters } from '../src/lib/card-rows'

const v = (...values: (number | [number, number])[]) => values.map(x => ({ value: Array.isArray(x) ? { min: x[0], max: x[1] } : x }))

// A red dot on 5 of a fish's 7 cells (design critique, 2026-11-06), most for a degree or a centimetre: the card marks a
// field only when its sources' figures are far enough apart to change what a reader does.
test('the card marks sources that disagree only when the gap matters', () => {
  // Ranges that overlap: the card shows what they share, nothing to mark.
  expect(gapMatters('tempC', v([24, 30], [23, 27]))).toBe(false)
  expect(gapMatters('ph', v([5, 7], [6, 7.5]))).toBe(false)
  // A degree, a tenth of pH, a centimetre apart: rounding.
  expect(gapMatters('tempC', v([22, 26], [27, 28]))).toBe(false)
  expect(gapMatters('ph', v([6, 7], [7.2, 8]))).toBe(false)
  expect(gapMatters('sizeCm', v(3, 4))).toBe(false)
  expect(gapMatters('tankCm', v(60, 54))).toBe(false)
  expect(gapMatters('difficulty', v(3, 4))).toBe(false)
  // Apart: ranges that don't meet, a tank or size more than a fifth apart, two levels of difficulty.
  expect(gapMatters('tempC', v([22, 25], [27, 30]))).toBe(true)
  expect(gapMatters('ph', v([6, 6.5], [7, 8]))).toBe(true)
  expect(gapMatters('tankCm', v(45, 60))).toBe(true)
  expect(gapMatters('sizeCm', v(3, 5))).toBe(true)
  expect(gapMatters('lifeYears', v(5, 10))).toBe(true)
  expect(gapMatters('difficulty', v(3, 5))).toBe(true)
  // One source, or the same figure twice: nothing.
  expect(gapMatters('tankCm', v(60))).toBe(false)
  expect(gapMatters('tankCm', v(60, 60))).toBe(false)
})

test('a card row says whether the sources disagree, and whether by enough to mark', () => {
  const [temp, tank] = cardRows({ tempC: [{ source: 'a', value: { min: 24, max: 30 } }, { source: 'b', value: { min: 23, max: 27 } }], tankCm: [{ source: 'a', value: 45 }, { source: 'b', value: 60 }] })
  expect([temp!.field, temp!.conflict, temp!.marked]).toEqual(['tempC', true, false])
  expect([tank!.field, tank!.conflict, tank!.marked]).toEqual(['tankCm', true, true])
})
