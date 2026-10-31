/**
 * RangeBar's range on its fixed scale, as the style of its inner mark. Shared with the fish list's script, which draws
 * the same bar on the cards it builds (scripts/species-card.ts).
 */
export function barStyle(kind: 'ph' | 'temp', min: number, max: number): string {
  const [lo, hi] = kind === 'ph' ? [4, 9] : [10, 35]
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100))
  const left = pct(min)
  const width = Math.max(pct(max) - left, 2)
  // Show the track's gradient inside the range: scale it to the track's width and shift it to the range's start.
  const size = (100 / width) * 100
  const pos = width >= 100 ? 0 : (left / (100 - width)) * 100
  return `left:${left}%;width:${width}%;background-size:${size}% 100%;background-position:${pos}% 0`
}
