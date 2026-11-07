import { resolveDataCard, type DataCardField, type Range } from '@aq/schema'
import { FIELD_ORDER, isRange } from './format'

/**
 * How far apart two sources' figures must be before the card marks the field (DataCard, KeyFacts): beyond this, between
 * figures that don't overlap. Under it the sources round differently (a degree, a centimetre, a tenth of pH), and a dot
 * would only send the reader to the sources for nothing. Size, tank and lifespan: a fifth of the smaller figure.
 */
const TOLERANCE: Record<DataCardField, (smaller: number) => number> = {
  tempC: () => 1, ph: () => 0.3, gh: () => 2, difficulty: () => 1,
  sizeCm: s => Math.max(1, 0.2 * s), tankCm: s => Math.max(1, 0.2 * s), lifeYears: s => Math.max(1, 0.2 * s),
}

/** Whether the sources' figures for a field are far enough apart to mark (TOLERANCE). */
export function gapMatters(field: DataCardField, vals: { value: Range | number }[]): boolean {
  const spans = vals.map(v => (isRange(v.value) ? v.value : { min: v.value, max: v.value }))
  return spans.some(a => spans.some(b => b.min - a.max > TOLERANCE[field](a.max)))
}

/**
 * A data card's rows in the card's order, each with its one value and every source's own (DataCard.astro, and the app's
 * copy of its "Nguồn và độ tin cậy"). Sources that disagree: Seriously Fish's figure, else the full span; difficulty, the
 * easiest (resolveDataCard). `marked`: they disagree by enough to mark on the card (gapMatters).
 */
export function cardRows<S extends string>(card: Partial<Record<DataCardField, { source: S; value: Range | number }[]>>) {
  return FIELD_ORDER.flatMap(field => {
    const vals = card[field] ?? []
    const r = resolveDataCard(vals, field)
    return r ? [{ field, ...r, vals, marked: r.conflict && gapMatters(field, vals) }] : []
  })
}
