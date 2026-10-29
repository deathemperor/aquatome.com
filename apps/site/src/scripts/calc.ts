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
