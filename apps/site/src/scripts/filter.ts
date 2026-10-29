import type { Range } from '@aq/schema'
import { slugify } from '@aq/schema/slug'

export type SpeciesIndexItem = {
  slug: string; name: string; scientificName: string; group: string
  difficulty?: number; tempC?: Range; ph?: Range; tankCm?: number; gh?: Range; sizeCm?: number
  temperament?: 'peaceful' | 'semi-aggressive' | 'aggressive' | 'predator'; finNipper?: boolean; schoolMin?: number
}
export type SpeciesQuery = { difficultyMax?: number; tempC?: number; ph?: number; tankCm?: number; group?: string; text?: string }

const inRange = (r: Range | undefined, v: number | undefined) => v === undefined || r === undefined || (v >= r.min && v <= r.max)

export function filterSpecies(items: SpeciesIndexItem[], q: SpeciesQuery): SpeciesIndexItem[] {
  const text = q.text ? slugify(q.text) : ''
  return items.filter(i =>
    inRange(i.tempC, q.tempC) &&
    inRange(i.ph, q.ph) &&
    (q.tankCm === undefined || i.tankCm === undefined || i.tankCm <= q.tankCm) &&
    (q.difficultyMax === undefined || i.difficulty === undefined || i.difficulty <= q.difficultyMax) &&
    (!q.group || i.group === q.group) &&
    (!text || slugify(`${i.name} ${i.scientificName}`).includes(text)))
}

export function queryFromParams(p: URLSearchParams): SpeciesQuery {
  const n = (k: string) => { const v = p.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v) }
  return { difficultyMax: n('difficultyMax'), tempC: n('tempC'), ph: n('ph'), tankCm: n('tankCm'), group: p.get('group') || undefined, text: p.get('q') || undefined }
}
