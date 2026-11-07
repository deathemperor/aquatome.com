import { resolveDataCard, type Localized, type Range, type SpeciesEntity, type Traits } from '@aq/schema'
import type { SpeciesIndexItem } from '../scripts/filter'

/** A card value as the index holds it: temperature, pH and hardness as ranges, size and tank as their longest. */
export const asRange = (v: Range | number | undefined): Range | undefined => (v === undefined ? undefined : typeof v === 'number' ? { min: v, max: v } : v)
export const asNum = (v: Range | number | undefined): number | undefined => (v === undefined ? undefined : typeof v === 'number' ? v : v.max)

export function toIndexItem(s: Localized<SpeciesEntity>, t?: Traits): SpeciesIndexItem {
  const r = (f: keyof SpeciesEntity['dataCard']) => resolveDataCard(s.dataCard[f] ?? [], f)?.value
  return {
    slug: s.t.slug, name: s.t.name, scientificName: s.scientificName, group: s.group,
    difficulty: asNum(r('difficulty')), tempC: asRange(r('tempC')), ph: asRange(r('ph')), tankCm: asNum(r('tankCm')),
    gh: asRange(r('gh')), sizeCm: asNum(r('sizeCm')),
    ...(t?.temperament ? { temperament: t.temperament } : {}), ...(t?.finNipper ? { finNipper: true } : {}), ...(t?.schoolMin ? { schoolMin: t.schoolMin } : {}),
  }
}
