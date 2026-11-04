import { resolveDataCard, type DataCardField, type Range } from '@aq/schema'
import { FIELD_ORDER } from './format'

/**
 * A data card's rows in the card's order, each with its one value and every source's own (DataCard.astro, and the app's
 * copy of its "Nguồn và độ tin cậy"). Sources that disagree: the range they all accept (resolveDataCard); a lifespan,
 * the widest.
 */
export function cardRows<S extends string>(card: Partial<Record<DataCardField, { source: S; value: Range | number }[]>>) {
  return FIELD_ORDER.flatMap(field => {
    const vals = card[field] ?? []
    const r = resolveDataCard(vals, field)
    return r ? [{ field, ...r, vals }] : []
  })
}
