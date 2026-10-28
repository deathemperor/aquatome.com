import { resolveDataCard, type Localized, type Range, type SpeciesEntity } from '@aq/schema'
import type { SpeciesIndexItem } from '../scripts/filter'

const asRange = (v: Range | number | undefined): Range | undefined => (v === undefined ? undefined : typeof v === 'number' ? { min: v, max: v } : v)
const asNum = (v: Range | number | undefined): number | undefined => (v === undefined ? undefined : typeof v === 'number' ? v : v.max)

export function toIndexItem(s: Localized<SpeciesEntity>): SpeciesIndexItem {
  const r = (f: keyof SpeciesEntity['dataCard']) => resolveDataCard(s.dataCard[f] ?? [])?.value
  return {
    slug: s.t.slug, name: s.t.name, scientificName: s.scientificName, group: s.group,
    difficulty: asNum(r('difficulty')), tempC: asRange(r('tempC')), ph: asRange(r('ph')), tankCm: asNum(r('tankCm')),
  }
}
