/**
 * Tanks as shops here sell them ready-made, length × width × height in cm (the tank-volume tool's table), and what a
 * species' minimum tank, which is a length, says about volumes and shop searches. A source that gives its tank as a
 * volume is read as the shortest of these tanks that holds it: 8 litres is a 30 cm tank, 38 litres a 50 cm one, 54 litres
 * a 60 cm one.
 */
export const READY_TANKS: readonly (readonly [number, number, number])[] = [[30, 20, 20], [40, 25, 25], [50, 30, 30], [60, 30, 36], [70, 35, 40], [80, 40, 45], [90, 45, 45], [100, 50, 50], [120, 50, 55], [150, 60, 60]]

/** A nano or mini tank: the shops' smallest, 30 × 20 × 20 cm (12 litres). A fish whose minimum is longer is no nano fish. */
export const NANO_CM = READY_TANKS[0]![0]

/** The length of the shortest ready-made tank that holds `litres`; undefined past the largest. */
export const tankLengthFor = (litres: number): number | undefined => READY_TANKS.find(([l, w, h]) => (l * w * h) / 1000 >= litres)?.[0]

/** The shop search for a minimum tank: the shortest ready-made tank at least that long ("bể cá 50cm" for 45 cm). */
export const tankSearch = (minCm: number) => `bể cá ${READY_TANKS.find(([l]) => l >= minCm)?.[0] ?? Math.ceil(minCm / 10) * 10}cm`

const num = (s: string) => Number(s.replace(',', '.'))
/**
 * Whether a tank search suits a fish whose minimum tank is `minCm`: no length ("bể cá 20cm", "bể 60x30") or volume
 * ("bể cá 40 lít") that makes a shorter tank, and no "mini" or "nano" for a fish that needs more than a nano tank.
 */
export function tankKeywordFits(keyword: string, minCm: number): boolean {
  const k = keyword.toLowerCase()
  if (/(?<!\p{L})(mini|nano)(?!\p{L})/u.test(k) && minCm > NANO_CM) return false
  const cm = /(\d+(?:[.,]\d+)?)\s*(?:cm(?!\p{L})|x\s*\d)/u.exec(k)
  if (cm && num(cm[1]!) < minCm) return false
  const l = /(\d+(?:[.,]\d+)?)\s*(?:lít|lit|l)(?!\p{L})/u.exec(k)
  const len = l ? tankLengthFor(num(l[1]!)) : undefined
  return !(len !== undefined && len < minCm)
}
