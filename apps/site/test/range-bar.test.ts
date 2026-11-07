import { expect, test } from 'vitest'
import { barStyle } from '../src/lib/range-bar'

// While the pH scale started at 4, neon vua (3.5 to 7.5) and neon xanh (4 to 7.5) drew the same bar (the council's
// review of the home page, 2026-11-07). The scale runs from 3.
test('a pH bar starts at 3, so a fish that takes water below pH 4 draws its own bar', () => {
  expect(barStyle('ph', 3.5, 7.5)).not.toBe(barStyle('ph', 4, 7.5))
  expect(barStyle('ph', 3, 9)).toMatch(/^left:0%;width:100%;/)
  expect(barStyle('ph', 6, 9)).toMatch(/^left:50%;width:50%;/)
})
