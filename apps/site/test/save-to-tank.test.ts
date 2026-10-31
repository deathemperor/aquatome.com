import { expect, test } from 'vitest'
import { withSpecies } from '../src/scripts/save-to-tank'

test("adding fish to a tank: new ones go after the tank's, a fish already there gets the new number, its other keys stay", () => {
  const kept = [{ id: 'a', count: 3, note: 'from the app' }, { id: 'b' }]
  expect(withSpecies(kept, [{ id: 'b', count: 6 }, { id: 'c', count: 10 }])).toEqual([{ id: 'a', count: 3, note: 'from the app' }, { id: 'b', count: 6 }, { id: 'c', count: 10 }])
  expect(kept).toEqual([{ id: 'a', count: 3, note: 'from the app' }, { id: 'b' }])
  expect(withSpecies(undefined, [{ id: 'a', count: 1 }])).toEqual([{ id: 'a', count: 1 }])
})
