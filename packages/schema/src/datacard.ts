import type { DataCardField, Range } from './types'

const isRange = (v: Range | number): v is Range => typeof v === 'object'

/**
 * One value for a field from what each source gives; every page shows this one value, so a species' numbers agree
 * wherever they appear. Sources that disagree: Seriously Fish's figure when it gives one, the most detailed and cited
 * of them (the owner, 2026-11-06), else the full span of their ranges, or the largest number. Difficulty: the easiest
 * rating a source gives (the owner, 2026-11-06), so one source's strict rating doesn't make an easy fish read hard.
 */
export function resolveDataCard<S extends string>(values: { source: S; value: Range | number }[], field: DataCardField): { value: Range | number; sources: S[]; conflict: boolean } | null {
  if (values.length === 0) return null
  const sf = values.find(v => v.source === 'seriouslyfish')
  const sources = [...(sf ? [sf.source] : []), ...values.filter(v => v !== sf).map(v => v.source)]
  const key = (v: Range | number) => JSON.stringify(isRange(v) ? [v.min, v.max] : v)
  const conflict = new Set(values.map(v => key(v.value))).size > 1
  const ranges = values.map(v => v.value).filter(isRange)
  const numbers = values.map(v => v.value).filter((v): v is number => !isRange(v))
  if (field === 'difficulty' && numbers.length) return { value: Math.min(...numbers), sources, conflict }
  if (sf) return { value: sf.value, sources, conflict }
  const value: Range | number = ranges.length ? { min: Math.min(...ranges.map(r => r.min)), max: Math.max(...ranges.map(r => r.max)) } : Math.max(...numbers)
  return { value, sources, conflict }
}
