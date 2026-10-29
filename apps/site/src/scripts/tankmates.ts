import type { Range } from '@aq/schema'
import type { SpeciesIndexItem } from './filter'

/** A fish can swallow tankmates far smaller than itself; 3× body length is the usual warning line. */
export const EAT_RATIO = 3

export type ParamCheck = { field: 'tempC' | 'ph' | 'gh'; shared?: Range; missing: string[] }
export type TankmateReport = {
  params: ParamCheck[]
  eats: { big: string; bigCm: number; small: string; smallCm: number }[]
  minTankCm?: number
}

/** Water overlap, size ratio and the largest tank need for a set of species. Temperament isn't structured yet. */
export function checkTankmates(fish: SpeciesIndexItem[]): TankmateReport {
  const params = (['tempC', 'ph', 'gh'] as const).map(field => {
    const known = fish.filter(f => f[field])
    const missing = fish.filter(f => !f[field]).map(f => f.name)
    if (known.length === 0) return { field, missing }
    const min = Math.max(...known.map(f => f[field]!.min))
    const max = Math.min(...known.map(f => f[field]!.max))
    return { field, missing, ...(min <= max ? { shared: { min, max } } : {}) }
  })
  const sized = fish.filter(f => f.sizeCm).sort((a, b) => b.sizeCm! - a.sizeCm!)
  const eats = sized.flatMap((big, i) => sized.slice(i + 1).filter(s => big.sizeCm! >= EAT_RATIO * s.sizeCm!)
    .map(s => ({ big: big.name, bigCm: big.sizeCm!, small: s.name, smallCm: s.sizeCm! })))
  const tanks = fish.flatMap(f => (f.tankCm ? [f.tankCm] : []))
  return { params, eats, ...(tanks.length ? { minTankCm: Math.max(...tanks) } : {}) }
}
