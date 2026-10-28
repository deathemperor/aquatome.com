import type { Range, SourceId, SourcedValue } from './types'

const isRange = (v: Range | number): v is Range => typeof v === 'object'

export function resolveDataCard(values: SourcedValue[]): { value: Range | number; sources: SourceId[]; conflict: boolean } | null {
  if (values.length === 0) return null
  const sf = values.find(v => v.source === 'seriouslyfish')
  const sources = [...(sf ? [sf.source] : []), ...values.filter(v => v !== sf).map(v => v.source)]
  const key = (v: Range | number) => JSON.stringify(isRange(v) ? [v.min, v.max] : v)
  const conflict = new Set(values.map(v => key(v.value))).size > 1
  if (sf) return { value: sf.value, sources, conflict }
  const ranges = values.map(v => v.value).filter(isRange)
  const value: Range | number = ranges.length
    ? { min: Math.min(...ranges.map(r => r.min)), max: Math.max(...ranges.map(r => r.max)) }
    : Math.max(...values.map(v => v.value as number))
  return { value, sources, conflict }
}
