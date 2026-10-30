/** Litres from inside dimensions in cm; water ≈ 85% once substrate, decor and the gap under the rim are taken out. */
export const WATER_SHARE = 0.85
export function tankVolume(lengthCm: number, widthCm: number, heightCm: number) {
  const litres = (lengthCm * widthCm * heightCm) / 1000
  return { litres, water: litres * WATER_SHARE }
}

/** Heat loss of a lidded glass tank, W per m² per °C (rule of thumb). */
export const GLASS_LOSS = 7
export const HEATER_SIZES = [25, 50, 75, 100, 150, 200, 300, 500] as const

/** Heater wattage to hold `targetC` with the room at `roomC`: loss through all six faces, rounded up to a stock size. */
export function heaterWatts(lengthCm: number, widthCm: number, heightCm: number, targetC: number, roomC: number) {
  const [l, w, h] = [lengthCm, widthCm, heightCm].map(x => x / 100) as [number, number, number]
  const area = 2 * (l * h + w * h + l * w)
  const watts = Math.max(0, GLASS_LOSS * area * (targetC - roomC))
  const pick = HEATER_SIZES.find(s => s >= watts)
  return { watts, heater: watts === 0 ? 0 : pick ?? null }
}

/** Substrates sold here: bulk density (kg per litre) and the bag sizes shops stock. */
export const SUBSTRATES = {
  soil: { name: 'Phân nền (aqua soil)', kgPerL: 1.0, bags: [{ size: 9, unit: 'lít' }, { size: 3, unit: 'lít' }] },
  sand: { name: 'Cát', kgPerL: 1.6, bags: [{ size: 10, unit: 'kg' }, { size: 5, unit: 'kg' }] },
  gravel: { name: 'Sỏi', kgPerL: 1.5, bags: [{ size: 10, unit: 'kg' }, { size: 5, unit: 'kg' }] },
  lava: { name: 'Đá nham thạch lót nền', kgPerL: 0.9, bags: [{ size: 5, unit: 'kg' }, { size: 1, unit: 'kg' }] },
} as const
export type SubstrateKind = keyof typeof SUBSTRATES

/**
 * Substrate for a bed sloping from `frontCm` deep at the glass to `backCm` at the back: litres, kg, and bags (fewest
 * big bags, then small ones for the rest, never short).
 */
export function substrate(lengthCm: number, widthCm: number, frontCm: number, backCm: number, kind: SubstrateKind) {
  const s = SUBSTRATES[kind]
  const litres = (lengthCm * widthCm * (frontCm + backCm)) / 2 / 1000
  const kg = litres * s.kgPerL
  const need = s.bags[0].unit === 'lít' ? litres : kg
  const [big, small] = s.bags
  let nBig = Math.floor(need / big.size)
  let nSmall = Math.ceil((need - nBig * big.size) / small.size - 1e-9)
  if (nSmall * small.size >= big.size) { nBig++; nSmall = 0 }
  return { litres, kg, bags: [{ ...big, n: nBig }, { ...small, n: nSmall }].filter(b => b.n > 0) }
}
