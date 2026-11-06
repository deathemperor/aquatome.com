import type { DataCardField, Range } from './types'

const isRange = (v: Range | number): v is Range => typeof v === 'object'

/**
 * One value for a field from what each source gives; every page shows this one value, so a species' numbers agree
 * wherever they appear. Sources that give different ranges: the full span they give between them (the owner,
 * 2026-11-06: the part they all accept could be a 1 °C window, and the tank form turned away fish the cards call easy).
 * A lifespan is no care target: Seriously Fish's when it gives one, else the widest. Difficulty: the easiest rating a
 * source gives (the owner, 2026-11-06). Other numbers: Seriously Fish's, else the largest.
 */
export function resolveDataCard<S extends string>(values: { source: S; value: Range | number }[], field: DataCardField): { value: Range | number; sources: S[]; conflict: boolean } | null {
  if (values.length === 0) return null
  const sf = values.find(v => v.source === 'seriouslyfish')
  const sources = [...(sf ? [sf.source] : []), ...values.filter(v => v !== sf).map(v => v.source)]
  const key = (v: Range | number) => JSON.stringify(isRange(v) ? [v.min, v.max] : v)
  const conflict = new Set(values.map(v => key(v.value))).size > 1
  const ranges = values.map(v => v.value).filter(isRange)
  const numbers = values.map(v => v.value).filter((v): v is number => !isRange(v))
  const span = (): Range => ({ min: Math.min(...ranges.map(r => r.min)), max: Math.max(...ranges.map(r => r.max)) })
  if (field === 'difficulty' && numbers.length) return { value: Math.min(...numbers), sources, conflict }
  if (field !== 'lifeYears' && ranges.length === values.length) return { value: span(), sources, conflict }
  if (sf) return { value: sf.value, sources, conflict }
  return { value: ranges.length ? span() : Math.max(...numbers), sources, conflict }
}
