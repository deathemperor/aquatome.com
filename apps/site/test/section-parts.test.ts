import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { farFromCard } from '../src/lib/section-parts'

test('a note only for a figure as far from the card as its dot asks', () => {
  const temp = { min: 24, max: 28 }
  expect(farFromCard([{ field: 'tempC', own: { min: 24, max: 30 }, card: { min: 22, max: 30 } }])).toEqual([]) // the betta's: it overlaps
  expect(farFromCard([{ field: 'tempC', own: { min: 18, max: 22 }, card: temp }])).toEqual([{ field: 'tempC', card: temp }])
  expect(farFromCard([{ field: 'sizeCm', own: 4, card: 3.5 }])).toEqual([]) // rounding
  expect(farFromCard([{ field: 'sizeCm', own: 20, card: 8 }])).toEqual([{ field: 'sizeCm', card: 8 }])
})

test('a tank in litres is read as the ready-made tank that holds it, and the card\'s tank is given once', () => {
  expect(farFromCard([{ field: 'tankL', own: 8, card: 45 }])).toEqual([{ field: 'tankCm', card: 45 }]) // a 30 cm tank
  expect(farFromCard([{ field: 'tankL', own: 19, card: 45 }])).toEqual([]) // a 40 cm tank: near enough
  expect(farFromCard([{ field: 'tankL', own: 8, card: 45 }, { field: 'tankL', own: { min: 5, max: 10 }, card: 45 }])).toEqual([{ field: 'tankCm', card: 45 }])
})

test('the plant page and the app\'s copy both give the sections the plant\'s CO₂, so the row that reads against the card goes from both', () => {
  const page = readFileSync(new URL('../src/pages/cay/[slug].astro', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/lib/app-page.ts', import.meta.url), 'utf8')
  expect(page).toContain('co2={p.co2}')
  expect(app).toContain('co2: p.co2')
})
