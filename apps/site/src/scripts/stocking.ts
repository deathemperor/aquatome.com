/**
 * How full a tank is with fish, in the spirit of AqAdvisor. A fish's waste follows its metabolism, which grows with
 * mass^0.75, and mass with length³: so bioload ∝ adult length^2.25. One unit is a 3.5 cm tetra; a filtered tank
 * carries one unit per 1.5 litres of water at 100%. That matches the usual minimums: a 60 cm tank (55 litres of
 * water) full at about 35 small tetras, 75 litres for one goldfish, 270 for one oscar.
 */
export const UNIT_CM = 3.5
export const LITRES_PER_UNIT = 1.5
export const bioload = (sizeCm: number) => (sizeCm / UNIT_CM) ** 2.25

export type StockFish = { name: string; count: number; sizeCm?: number; schoolMin?: number; tankCm?: number }
export type Level = 'light' | 'ok' | 'full' | 'over'
const levelOf = (p: number): Level => (p < 50 ? 'light' : p < 85 ? 'ok' : p <= 100 ? 'full' : 'over')

/** `waterLitres`: real water (after substrate and decor). Options: the tank's length and the filter's flow against its gross volume. */
export function stocking(fish: StockFish[], waterLitres: number, o: { tankCm?: number; filterLph?: number; grossLitres?: number } = {}) {
  const sized = fish.filter(f => f.sizeCm && f.count > 0)
  const units = sized.map(f => ({ name: f.name, units: f.count * bioload(f.sizeCm!) }))
  const total = units.reduce((a, f) => a + f.units, 0)
  const percent = waterLitres > 0 ? (total * LITRES_PER_UNIT * 100) / waterLitres : Infinity
  return {
    percent, level: levelOf(percent),
    perFish: units.map(f => ({ ...f, share: total ? f.units / total : 0 })).sort((a, b) => b.units - a.units),
    unknown: fish.filter(f => !f.sizeCm).map(f => f.name),
    school: fish.filter(f => f.schoolMin && f.count > 0 && f.count < f.schoolMin).map(f => ({ name: f.name, count: f.count, min: f.schoolMin! })),
    tooShort: o.tankCm ? fish.filter(f => f.tankCm && f.tankCm > o.tankCm!).map(f => ({ name: f.name, tankCm: f.tankCm! })) : [],
    ...(o.filterLph && o.grossLitres ? { turnover: o.filterLph / o.grossLitres } : {}),
  }
}
