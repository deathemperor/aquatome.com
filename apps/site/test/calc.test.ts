import { expect, test } from 'vitest'
import { substrate } from '../src/scripts/calc'

test('substrate: sloped bed in litres and kg, bought as big bags then small ones, never short', () => {
  // 60 × 30 cm, 4 cm at the front to 8 cm at the back: 60 × 30 × 6 = 10.8 L of aqua soil → one 9 L bag + one 3 L bag.
  expect(substrate(60, 30, 4, 8, 'soil')).toEqual({ litres: 10.8, kg: 10.8, bags: [{ size: 9, unit: 'lít', n: 1 }, { size: 3, unit: 'lít', n: 1 }] })
  // Sand by weight: 10.8 L × 1.6 = 17.28 kg → 10 kg + two 5 kg would be 20 kg anyway: two 10 kg bags.
  expect(substrate(60, 30, 4, 8, 'sand').bags).toEqual([{ size: 10, unit: 'kg', n: 2 }])
  // 12 kg of gravel (8 L × 1.5): one 10 kg + one 5 kg.
  expect(substrate(40, 25, 8, 8, 'gravel').bags).toEqual([{ size: 10, unit: 'kg', n: 1 }, { size: 5, unit: 'kg', n: 1 }])
  // Small bags that would add up to a big one become a big one: 16 L of soil → two 9 L bags, not one 9 L + three 3 L.
  expect(substrate(80, 40, 5, 5, 'soil').bags).toEqual([{ size: 9, unit: 'lít', n: 2 }])
  // Exactly a bag: no extra small bag.
  expect(substrate(60, 30, 5, 5, 'soil').bags).toEqual([{ size: 9, unit: 'lít', n: 1 }])
})
