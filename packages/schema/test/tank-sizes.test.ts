import { expect, test } from 'vitest'
import { tankKeywordFits, tankLengthFor, tankSearch } from '../src/index'

test('a volume is the shortest ready-made tank that holds it', () => {
  // The Spruce Pets' betta and neon minimums (8 and 38 litres) against Seriously Fish's own volumes for its 45 and 60 cm.
  expect(tankLengthFor(8)).toBe(30)
  expect(tankLengthFor(38)).toBe(50)
  expect(tankLengthFor(41)).toBe(50)
  expect(tankLengthFor(54)).toBe(60)
  expect(tankLengthFor(45)).toBe(50)
  expect(tankLengthFor(600)).toBeUndefined()
})

test('the shop search for a minimum tank is the shortest ready-made tank that long', () => {
  expect(tankSearch(60)).toBe('bể cá 60cm')
  expect(tankSearch(45)).toBe('bể cá 50cm')
  expect(tankSearch(25)).toBe('bể cá 30cm')
  expect(tankSearch(200)).toBe('bể cá 200cm')
})

test('a tank search below the minimum, or mini for a fish past a nano tank, does not fit', () => {
  // Betta (45 cm) and neon (60 cm) as aquatome.com had them (design critique 2026-11-06).
  expect(tankKeywordFits('bể cá mini 20cm', 45)).toBe(false)
  expect(tankKeywordFits('bể cá 40 lít', 60)).toBe(false)
  expect(tankKeywordFits('bể cá thủy sinh mini', 60)).toBe(false)
  expect(tankKeywordFits('bể nano', 45)).toBe(false)
  expect(tankKeywordFits('bể 40x25x25', 45)).toBe(false)
  expect(tankKeywordFits('bể cá betta', 45)).toBe(true)
  expect(tankKeywordFits('bể kính 60cm', 60)).toBe(true)
  expect(tankKeywordFits('bể cá 60 lít', 60)).toBe(true)
  expect(tankKeywordFits('bể cá 90 x 45', 60)).toBe(true)
  // A nano fish may have a mini tank.
  expect(tankKeywordFits('bể cá mini 30cm', 30)).toBe(true)
  expect(tankKeywordFits('bể nano', 25)).toBe(true)
  // A word with "mini" inside isn't the word.
  expect(tankKeywordFits('bể cá minimalist 60cm', 60)).toBe(true)
})
