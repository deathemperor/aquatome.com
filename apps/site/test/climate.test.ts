import { expect, test } from 'vitest'
import { vnClimate } from '../src/lib/climate'

const ok = (t: Parameters<typeof vnClimate>[0]) => vnClimate(t).map(n => n.ok)

test('tropical fish: heater in the north, fine in the south, fine in summer', () => {
  expect(ok({ min: 24, max: 31 })).toEqual([false, true, true])
})
test('discus-like: heater for southern cool nights too', () => {
  expect(ok({ min: 28, max: 31 })).toEqual([false, false, true])
})
test('cool-water fish: no heater anywhere, but summer heat is a problem (in the south too)', () => {
  const n = vnClimate({ min: 15, max: 21 })
  expect(n.map(x => x.ok)).toEqual([true, false, false])
  expect(n[2]!.temps).toEqual([31, 21])
})
test('the south is never "fine all year" while its summer is over the maximum (cardinal tetra, 24–27°C)', () => {
  const n = vnClimate({ min: 24, max: 27 })
  expect(n.map(x => x.ok)).toEqual([false, false, false])
  expect(n[1]!.text).toContain('làm mát')
})
test('single value counts as min = max', () => {
  expect(ok(26)).toEqual([false, false, false])
})
test('every {t} placeholder has a temperature', () => {
  for (const t of [{ min: 10, max: 35 }, { min: 30, max: 30 }]) for (const n of vnClimate(t)) expect(n.text.split('{t}').length - 1).toBe(n.temps.length)
})
