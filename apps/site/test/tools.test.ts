import { expect, test } from 'vitest'
import { checkTankmates } from '../src/scripts/tankmates'
import { heaterWatts, tankVolume } from '../src/scripts/calc'
import type { SpeciesIndexItem } from '../src/scripts/filter'

const f = (name: string, o: Partial<SpeciesIndexItem>): SpeciesIndexItem => ({ slug: name, name, scientificName: name, group: 'x', ...o })

test('tankmates: shared water range, missing data listed, biggest tank wins', () => {
  const r = checkTankmates([f('neon', { tempC: { min: 20, max: 26 }, ph: { min: 5, max: 7 }, tankCm: 60 }), f('galaxy', { tempC: { min: 22, max: 25 }, tankCm: 45 })])
  expect(r.params.find(p => p.field === 'tempC')).toEqual({ field: 'tempC', missing: [], shared: { min: 22, max: 25 } })
  expect(r.params.find(p => p.field === 'ph')).toEqual({ field: 'ph', missing: ['galaxy'], shared: { min: 5, max: 7 } })
  expect(r.params.find(p => p.field === 'gh')).toEqual({ field: 'gh', missing: ['neon', 'galaxy'] })
  expect(r.minTankCm).toBe(60)
})
test('tankmates: no overlap → no shared range', () => {
  const r = checkTankmates([f('a', { tempC: { min: 15, max: 21 } }), f('b', { tempC: { min: 26, max: 30 } })])
  expect(r.params[0]!.shared).toBeUndefined()
})
test('tankmates: big fish ≥ 3× a small one is flagged, in size order', () => {
  const r = checkTankmates([f('neon', { sizeCm: 3 }), f('oscar', { sizeCm: 30 }), f('rasbora', { sizeCm: 9 })])
  expect(r.eats.map(e => `${e.big}>${e.small}`)).toEqual(['oscar>rasbora', 'oscar>neon', 'rasbora>neon'])
})
test('volume: 60×30×36 cm', () => {
  const v = tankVolume(60, 30, 36)
  expect(v.litres).toBeCloseTo(64.8)
  expect(v.water).toBeCloseTo(55.08)
})
test('heater: 60×30×36 cm from 16 °C to 26 °C → 75 W; warm room → none', () => {
  expect(heaterWatts(60, 30, 36, 26, 16)).toEqual({ watts: expect.closeTo(70.56, 1), heater: 75 })
  expect(heaterWatts(60, 30, 36, 26, 28)).toEqual({ watts: 0, heater: 0 })
  expect(heaterWatts(300, 100, 100, 28, 10).heater).toBeNull()
})

test('tools page: nav link, sitemap, species index carries size and hardness; species pages link to the checker', async () => {
  const { page, DIST } = await import('./dist')
  const { readFileSync } = await import('node:fs')
  const { dom } = page('/vi/cong-cu/')
  expect(dom.querySelector('nav a[href="/vi/cong-cu/"]')).not.toBeNull()
  const idx = JSON.parse(dom.querySelector('#species-index')!.text) as { slug: string; sizeCm?: number }[]
  expect(idx.some(i => i.sizeCm !== undefined)).toBe(true)
  expect(readFileSync(`${DIST}/sitemap.xml`, 'utf8')).toContain('/vi/cong-cu/')
  expect(page('/vi/ca/ca-neon-vua/').dom.querySelector('a[href="/vi/cong-cu/?ca=ca-neon-vua#nuoi-chung"]')).not.toBeNull()
})
