import { expect, test } from 'vitest'
import { allocate, FLOOR, type SkinStats } from '../allocate'
import { SKINS, type Skin } from '../skins'
import { summarise } from '../stats'

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const st = (visits: number, converted: number, pages = visits * 2): SkinStats => ({ visits, pages, converted, clicks: converted, timeSum: 0, scrolled: 0 })
const all = (f: (s: Skin) => SkinStats) => Object.fromEntries(SKINS.map(s => [s, f(s)])) as Record<Skin, SkinStats>
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0)

test('no data → equal split', () => {
  expect(allocate(all(() => st(0, 0)), rng(1))).toEqual({ mix: 0.25, a: 0.25, b: 0.25, c: 0.25 })
})
test('equal performance → roughly equal split, sums to 1', () => {
  const w = allocate(all(() => st(1000, 100)), rng(2))
  for (const s of SKINS) expect(Math.abs(w[s] - 0.25)).toBeLessThan(0.05)
  expect(sum(w)).toBeCloseTo(1, 9)
})
test('a clearly better skin gets most traffic, others keep the floor', () => {
  const w = allocate(all(s => (s === 'b' ? st(2000, 400) : st(2000, 200))), rng(3))
  expect(w.b).toBeGreaterThan(0.6)
  for (const s of SKINS) expect(w[s]).toBeGreaterThanOrEqual(FLOOR - 1e-9)
  expect(sum(w)).toBeCloseTo(1, 9)
})
test('guardrail: a converting skin with too few pages/visit only keeps the floor', () => {
  const w = allocate(all(s => (s === 'c' ? st(2000, 600, 2000) : st(2000, 200, 5000))), rng(4))
  expect(w.c).toBeCloseTo(FLOOR, 9)
  expect(sum(w)).toBeCloseTo(1, 9)
})
test('weights always sum to 1 with every skin ≥ floor, for arbitrary stats', () => {
  const r = rng(9)
  for (let i = 0; i < 200; i++) {
    const w = allocate(all(() => { const v = Math.floor(r() * 3000); return st(v, Math.floor(r() * v), Math.floor(r() * v * 4)) }), rng(i), 300)
    expect(sum(w)).toBeCloseTo(1, 9)
    for (const s of SKINS) expect(w[s]).toBeGreaterThanOrEqual(FLOOR - 1e-9)
  }
})
test('summarise turns session rows into per-skin stats', () => {
  const s = summarise([
    { skin: 'a', pages: '4', t: '90', scroll: '90', clicks: '0' },
    { skin: 'a', pages: 1, t: 10, scroll: 50, clicks: 1 },
    { skin: 'b', pages: 1, t: 5, scroll: 0, clicks: 0 },
    { skin: 'zz', pages: 9, t: 9, scroll: 9, clicks: 9 },
  ])
  expect(s.a).toEqual({ visits: 2, pages: 5, converted: 2, clicks: 1, timeSum: 100, scrolled: 1 })
  expect(s.b.converted).toBe(0)
  expect(s.mix.visits).toBe(0)
})
