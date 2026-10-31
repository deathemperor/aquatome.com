import { expect, test } from 'vitest'
import { placeTip } from '../src/scripts/glossary-tip'

test('the card sits under the term, over it near the bottom of the screen, and inside the sides', () => {
  expect(placeTip({ left: 100, top: 200, bottom: 220 }, 300, 120, 400, 800)).toEqual({ left: 92, top: 226 }) // pushed in from the right edge
  expect(placeTip({ left: 20, top: 700, bottom: 720 }, 300, 120, 1200, 800)).toEqual({ left: 20, top: 574 }) // no room below
  expect(placeTip({ left: 2, top: 50, bottom: 70 }, 300, 120, 1200, 150)).toEqual({ left: 8, top: 76 }) // no room either way: below
})
