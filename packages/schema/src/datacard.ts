import type { Range } from './types'

const isRange = (v: Range | number): v is Range => typeof v === 'object'

/**
 * One value for a field from what each source gives. Sources that give different ranges: the part they all accept, the
 * safe target for a beginner (`agreed`). Otherwise Seriously Fish's value when it has one, else the widest range (or the
 * largest number). Every page shows this one value, so a species' numbers agree wherever they appear.
 */
export function resolveDataCard<S extends string>(values: { source: S; value: Range | number }[]): { value: Range | number; sources: S[]; conflict: boolean; agreed: boolean } | null {
  if (values.length === 0) return null
  const sf = values.find(v => v.source === 'seriouslyfish')
  const sources = [...(sf ? [sf.source] : []), ...values.filter(v => v !== sf).map(v => v.source)]
  const key = (v: Range | number) => JSON.stringify(isRange(v) ? [v.min, v.max] : v)
  const conflict = new Set(values.map(v => key(v.value))).size > 1
  const ranges = values.map(v => v.value).filter(isRange)
  if (conflict && ranges.length === values.length) {
    const min = Math.max(...ranges.map(r => r.min))
    const max = Math.min(...ranges.map(r => r.max))
    if (min <= max) return { value: { min, max }, sources, conflict, agreed: true }
  }
  if (sf) return { value: sf.value, sources, conflict, agreed: false }
  const value: Range | number = ranges.length
    ? { min: Math.min(...ranges.map(r => r.min)), max: Math.max(...ranges.map(r => r.max)) }
    : Math.max(...values.map(v => v.value as number))
  return { value, sources, conflict, agreed: false }
}
