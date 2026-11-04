import type { Range } from './types'

/**
 * What a fish asks of its keeper, need by need, read from figures the site already holds: the data card's values as
 * every page shows them (resolveDataCard) and the traits read from its text (content/traits). The species page's "Vì sao
 * độ khó này" panel shows them, and the explainer page (/vi/gioi-thieu/bang-du-lieu/) quotes these thresholds.
 *
 * The card's difficulty (1–8) is the sources' rating, not a sum of these: a source can weigh what the card doesn't hold
 * (diet, how a fish takes a move). A need whose figures the page lacks is left out, never counted as easy. Diet is not
 * a need here: the engine holds it only as text.
 *
 * The input is a species' entry in the app index (`SpeciesIndexItem`): ranges for temperature, pH and hardness, the
 * longest size and tank, and the traits, so the app can read the same needs from the index it already has.
 */
export type NeedLevel = 'easy' | 'mid' | 'hard'
export type NeedKey = 'space' | 'water' | 'temperature' | 'temperament' | 'social'
export type Temperament = 'peaceful' | 'semi-aggressive' | 'aggressive' | 'predator'
export type NeedInput = {
  tempC?: Range; ph?: Range; gh?: Range; sizeCm?: number; tankCm?: number
  temperament?: Temperament | null; finNipper?: boolean; schoolMin?: number | null
}
/** Why water or temperature isn't easy: the part of its range that asks something of the keeper. */
export type WaterWhy = 'acid' | 'alkaline' | 'narrowPh' | 'soft' | 'veryHard' | 'narrowGh'
export type TempWhy = 'warm' | 'cool' | 'narrow'
export type Need =
  | { key: 'space'; level: NeedLevel; tankCm?: number; sizeCm?: number }
  | { key: 'water'; level: NeedLevel; ph?: Range; gh?: Range; why: WaterWhy[] }
  | { key: 'temperature'; level: NeedLevel; tempC: Range; why: TempWhy[] }
  | { key: 'temperament'; level: NeedLevel; temperament?: Temperament; finNipper: boolean }
  | { key: 'social'; level: NeedLevel; schoolMin: number }

/**
 * The thresholds, each the last value of its level ("≤"), or the first ("≥"). Hard water and a high pH are easier to make
 * and hold than soft, acid water (it has little to buffer it, so its pH drops), so the acid side asks more.
 */
export const NEED_RULES = {
  /** Minimum tank length (cm): up to 60 easy, up to 100 medium, longer hard. */
  tankCm: { easy: 60, mid: 100 },
  /** Adult length (cm): up to 10 easy, up to 20 medium, longer hard. */
  sizeCm: { easy: 10, mid: 20 },
  /** pH: hard when it tops out at 6.5 or below; medium when it stays under 7, starts at 7.5 or above, or spans under 1 unit. */
  ph: { acidHard: 6.5, neutral: 7, alkaline: 7.5, narrow: 1 },
  /** GH (dGH): hard when it tops out at 6 or below; medium when it starts at 15 or above, or spans under 4. */
  gh: { soft: 6, veryHard: 15, narrow: 4 },
  /**
   * Temperature (°C): hard when it starts at 28 or above, or tops out at 22 or below; medium when it starts at 26 or
   * above, tops out at 25 or below, or spans under 4 degrees.
   */
  tempC: { warmHard: 28, coolHard: 22, warm: 26, cool: 25, narrow: 4 },
  /** Smallest group: up to 5 easy, up to 9 medium, 10 or more hard. */
  schoolMin: { easy: 5, mid: 9 },
} as const

export const NEED_ORDER: NeedKey[] = ['space', 'water', 'temperature', 'temperament', 'social']
const RANK: Record<NeedLevel, number> = { easy: 0, mid: 1, hard: 2 }
const worst = (...ls: NeedLevel[]): NeedLevel => ls.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'easy')
const steps = (v: number, r: { easy: number; mid: number }): NeedLevel => (v <= r.easy ? 'easy' : v <= r.mid ? 'mid' : 'hard')

function phLevel(p: Range): [NeedLevel, WaterWhy[]] {
  const R = NEED_RULES.ph
  if (p.max <= R.acidHard) return ['hard', ['acid']]
  const why: WaterWhy[] = []
  if (p.max < R.neutral) why.push('acid')
  if (p.min >= R.alkaline) why.push('alkaline')
  if (p.max - p.min < R.narrow) why.push('narrowPh')
  return [why.length ? 'mid' : 'easy', why]
}

function ghLevel(g: Range): [NeedLevel, WaterWhy[]] {
  const R = NEED_RULES.gh
  if (g.max <= R.soft) return ['hard', ['soft']]
  const why: WaterWhy[] = []
  if (g.min >= R.veryHard) why.push('veryHard')
  if (g.max - g.min < R.narrow) why.push('narrowGh')
  return [why.length ? 'mid' : 'easy', why]
}

function tempLevel(t: Range): [NeedLevel, TempWhy[]] {
  const R = NEED_RULES.tempC
  if (t.min >= R.warmHard) return ['hard', ['warm']]
  if (t.max <= R.coolHard) return ['hard', ['cool']]
  const why: TempWhy[] = []
  if (t.min >= R.warm) why.push('warm')
  if (t.max <= R.cool) why.push('cool')
  if (t.max - t.min < R.narrow) why.push('narrow')
  return [why.length ? 'mid' : 'easy', why]
}

const TEMPERAMENT_LEVEL: Record<Temperament, NeedLevel> = { peaceful: 'easy', 'semi-aggressive': 'mid', aggressive: 'hard', predator: 'hard' }

/** A fish's needs in NEED_ORDER, each only when the figures it is read from are known. */
export function careNeeds(f: NeedInput): Need[] {
  const out: Need[] = []
  if (f.tankCm !== undefined || f.sizeCm !== undefined) {
    const level = worst(...(f.tankCm !== undefined ? [steps(f.tankCm, NEED_RULES.tankCm)] : []), ...(f.sizeCm !== undefined ? [steps(f.sizeCm, NEED_RULES.sizeCm)] : []))
    out.push({ key: 'space', level, ...(f.tankCm !== undefined ? { tankCm: f.tankCm } : {}), ...(f.sizeCm !== undefined ? { sizeCm: f.sizeCm } : {}) })
  }
  if (f.ph || f.gh) {
    const [pl, pw] = f.ph ? phLevel(f.ph) : ['easy' as const, []]
    const [gl, gw] = f.gh ? ghLevel(f.gh) : ['easy' as const, []]
    out.push({ key: 'water', level: worst(pl, gl), ...(f.ph ? { ph: f.ph } : {}), ...(f.gh ? { gh: f.gh } : {}), why: [...pw, ...gw] })
  }
  if (f.tempC) {
    const [level, why] = tempLevel(f.tempC)
    out.push({ key: 'temperature', level, tempC: f.tempC, why })
  }
  if (f.temperament || f.finNipper) {
    const level = worst(f.temperament ? TEMPERAMENT_LEVEL[f.temperament] : 'easy', f.finNipper ? 'mid' : 'easy')
    out.push({ key: 'temperament', level, ...(f.temperament ? { temperament: f.temperament } : {}), finNipper: !!f.finNipper })
  }
  if (f.schoolMin) out.push({ key: 'social', level: steps(f.schoolMin, NEED_RULES.schoolMin), schoolMin: f.schoolMin })
  return out
}
