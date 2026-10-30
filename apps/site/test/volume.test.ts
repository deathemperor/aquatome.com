import { expect, test } from 'vitest'
import { SHAPES, glassKg, glassThickness, shapeVolume, type ShapeId } from '../src/scripts/volume'

const litres = (id: ShapeId, d: Record<string, number>) => {
  const r = shapeVolume(id, d)
  if ('error' in r) throw new Error(r.error)
  return r
}

test('every shape: area × height, in litres', () => {
  expect(litres('chu-nhat', { l: 60, w: 30, h: 36 }).litres).toBeCloseTo(64.8)
  expect(litres('lap-phuong', { l: 30 }).litres).toBeCloseTo(27)
  // Elongated hexagon: the front and back panes plus a triangle at each end → W × (L + F) / 2.
  expect(litres('luc-giac', { l: 60, w: 30, f: 30, h: 40 }).litres).toBeCloseTo(30 * 45 * 40 / 1000)
  // Octagon: L × W less four corner triangles with legs (L − F)/2 and (W − E)/2.
  expect(litres('bat-giac', { l: 60, w: 40, f: 40, e: 20, h: 50 }).litres).toBeCloseTo((60 * 40 - 2 * 10 * 10) * 50 / 1000)
  // Flat-back hexagon: L × W less the two front corners, legs (L − F)/2 and W − E.
  expect(litres('luc-giac-lung', { l: 80, w: 40, f: 40, e: 20, h: 50 }).litres).toBeCloseTo((80 * 40 - 20 * 20) * 50 / 1000)
  expect(litres('tru', { d: 40, h: 50 }).litres).toBeCloseTo(Math.PI * 20 * 20 * 50 / 1000)
  expect(litres('nua-tru', { d: 60, h: 40 }).litres).toBeCloseTo(Math.PI * 30 * 30 * 40 / 2000)
  expect(litres('goc-tron', { r: 50, h: 50 }).litres).toBeCloseTo(Math.PI * 50 * 50 * 50 / 4000)
  expect(litres('elip', { l: 60, w: 40, h: 40 }).litres).toBeCloseTo(Math.PI * 30 * 20 * 40 / 1000)
  // Corner pentagon: A × A less the front triangle with legs A − B.
  expect(litres('goc-ngu-giac', { a: 60, b: 30, h: 50 }).litres).toBeCloseTo((60 * 60 - 30 * 30 / 2) * 50 / 1000)
  // L-shape, overall arm lengths: the shared corner counted once.
  expect(litres('chu-l', { l1: 100, w1: 40, l2: 80, w2: 30, h: 50 }).litres).toBeCloseTo((100 * 40 + 80 * 30 - 40 * 30) * 50 / 1000)
  expect(litres('goc-tam-giac', { a: 60, b: 40, h: 50 }).litres).toBeCloseTo(60 * 40 / 2 * 50 / 1000)
})

test('every shape lists its fields and computes from them alone', () => {
  for (const [id, s] of Object.entries(SHAPES) as [ShapeId, (typeof SHAPES)[ShapeId]][]) {
    const d = Object.fromEntries(s.fields.map(f => [f.key, f.key === 'f' || f.key === 'e' || f.key === 'b' || f.key === 'w2' ? 20 : 40]))
    const r = shapeVolume(id, d)
    expect('error' in r ? r.error : r.litres, id).toBeGreaterThan(0)
  }
})

test('a water line below the rim fills only that far; gallons are US', () => {
  const r = litres('chu-nhat', { l: 60, w: 30, h: 36, fill: 30 })
  expect(r.litres).toBeCloseTo(64.8)
  expect(r.filled).toBeCloseTo(54)
  expect(r.gallons).toBeCloseTo(64.8 / 3.785411784)
  expect(litres('chu-nhat', { l: 60, w: 30, h: 36 }).filled).toBeUndefined()
})

test('impossible tanks get a reason, not a number', () => {
  expect(shapeVolume('luc-giac', { l: 40, w: 30, f: 50, h: 40 })).toEqual({ error: expect.stringContaining('Kính trước') })
  expect(shapeVolume('chu-nhat', { l: 60, w: 30, h: 36, fill: 40 })).toEqual({ error: expect.stringContaining('Mực nước') })
  expect(shapeVolume('chu-nhat', { l: 60, w: 0, h: 36 })).toEqual({ error: expect.stringContaining('Rộng') })
  expect(shapeVolume('chu-l', { l1: 100, w1: 40, l2: 30, w2: 30, h: 50 })).toEqual({ error: expect.any(String) })
})

test('glass weight of an open-top box: bottom + four sides × thickness × 2.5 kg/L', () => {
  expect(glassKg(60, 30, 36, 5)).toBeCloseTo((60 * 30 + 2 * 60 * 36 + 2 * 30 * 36) * 0.5 * 2.5 / 1000)
})

test('glass thickness: the β-table formula, rounded up to glass you can order', () => {
  // 60 × 36 cm front (the common 60 cm tank) → 5 mm, as these tanks are sold.
  expect(glassThickness(60, 36)).toEqual({ min: 5, order: 5 })
  // 120 cm long, 60 cm of water → about 11.6 mm → 12 mm.
  const big = glassThickness(120, 60)
  expect(big.min).toBeCloseTo(11.6, 1)
  expect(big.order).toBe(12)
  // Taller than long: β from the low end of the table.
  expect(glassThickness(30, 60)).toEqual({ min: 6, order: 6 })
  // A wall of water: no stock float glass is enough.
  expect(glassThickness(300, 120).order).toBeNull()
})
