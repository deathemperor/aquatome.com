import { EQUAL, SKINS, type Skin, type Weights } from './skins'

export type SkinStats = { visits: number; pages: number; converted: number; clicks: number; timeSum: number; scrolled: number }
export const FLOOR = 0.1
const GUARD_MIN_VISITS = 500

function normal(rand: () => number) {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}
/** Marsaglia–Tsang gamma(k, 1). */
function gamma(k: number, rand: () => number): number {
  if (k < 1) return gamma(k + 1, rand) * Math.pow(Math.max(rand(), 1e-12), 1 / k)
  const d = k - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do { x = normal(rand); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
const beta = (a: number, b: number, rand: () => number) => { const x = gamma(a, rand); return x / (x + gamma(b, rand)) }

/**
 * Thompson sampling on the per-visit conversion rate, then a floor so every skin keeps ≥10% of traffic.
 * Guardrail: a skin whose pages/visit is under 80% of Mix (both with enough visits) gets only the floor.
 */
export function allocate(stats: Record<Skin, SkinStats>, rand: () => number, draws = 2000): Weights {
  if (SKINS.every(s => !stats[s]?.visits)) return { ...EQUAL }
  const mix = stats.mix
  const mixPpv = mix && mix.visits ? mix.pages / mix.visits : 0
  const guarded = (s: Skin) => {
    const st = stats[s]
    return s !== 'mix' && !!st && !!mix && st.visits >= GUARD_MIN_VISITS && mix.visits >= GUARD_MIN_VISITS && st.pages / st.visits < 0.8 * mixPpv
  }
  const contenders = SKINS.filter(s => !guarded(s)) // always includes mix, so wins add up to draws
  const wins: Record<Skin, number> = { mix: 0, a: 0, b: 0, c: 0 }
  for (let i = 0; i < draws; i++) {
    let best: Skin = 'mix'
    let bestV = -1
    for (const s of contenders) {
      const st = stats[s] ?? { visits: 0, converted: 0 }
      const v = beta(st.converted + 1, Math.max(0, st.visits - st.converted) + 1, rand)
      if (v > bestV) { bestV = v; best = s }
    }
    wins[best]++
  }
  const total = draws
  const free = 1 - FLOOR * SKINS.length
  return Object.fromEntries(SKINS.map(s => [s, FLOOR + (free * wins[s]) / total])) as Weights
}
