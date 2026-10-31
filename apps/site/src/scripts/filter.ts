import type { Range } from '@aq/schema'
import { slugify } from '@aq/schema/slug'

export type SpeciesIndexItem = {
  slug: string; name: string; scientificName: string; group: string
  difficulty?: number; tempC?: Range; ph?: Range; tankCm?: number; gh?: Range; sizeCm?: number
  temperament?: 'peaceful' | 'semi-aggressive' | 'aggressive' | 'predator'; finNipper?: boolean; schoolMin?: number
}
export type SpeciesQuery = { difficultyMax?: number; tempC?: number; ph?: number; tankCm?: number; group?: string; text?: string }

/**
 * Each figure the reader set (temperature, pH, tank length, difficulty), against the species' own: true when it fits,
 * false when it doesn't, undefined when the species has no figure for it. A name or group is never unknown.
 */
function checks(i: SpeciesIndexItem, q: SpeciesQuery): (boolean | undefined)[] {
  const within = (r: Range | undefined, v: number) => (r ? v >= r.min && v <= r.max : undefined)
  const atMost = (x: number | undefined, v: number) => (x === undefined ? undefined : x <= v)
  return [
    q.tempC === undefined ? true : within(i.tempC, q.tempC),
    q.ph === undefined ? true : within(i.ph, q.ph),
    q.tankCm === undefined ? true : atMost(i.tankCm, q.tankCm),
    q.difficultyMax === undefined ? true : atMost(i.difficulty, q.difficultyMax),
  ]
}
const named = (i: SpeciesIndexItem, q: SpeciesQuery) =>
  (!q.group || i.group === q.group) && (!q.text || slugify(`${i.name} ${i.scientificName}`).includes(slugify(q.text)))

/** Species whose figures are all known and all fit the query. */
export function filterSpecies(items: SpeciesIndexItem[], q: SpeciesQuery): SpeciesIndexItem[] {
  return items.filter(i => named(i, q) && checks(i, q).every(c => c === true))
}

/** Species nothing known rules out, but missing a figure the query asks about: they may fit, the data can't say. */
export function unsureSpecies(items: SpeciesIndexItem[], q: SpeciesQuery): SpeciesIndexItem[] {
  return items.filter(i => { const c = checks(i, q); return named(i, q) && !c.includes(false) && c.includes(undefined) })
}

/** Breeds carry no water data: with a filter set, one stays only when the filter is a name search that matches it. */
export function keepBreed(name: string, q: SpeciesQuery): boolean {
  const { text, ...rest } = q
  if (Object.values(rest).some(v => v !== undefined)) return false
  return !text || slugify(name).includes(slugify(text))
}

export function queryFromParams(p: URLSearchParams): SpeciesQuery {
  const n = (k: string) => { const v = p.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v) }
  return { difficultyMax: n('difficultyMax'), tempC: n('tempC'), ph: n('ph'), tankCm: n('tankCm'), group: p.get('group') || undefined, text: p.get('q') || undefined }
}
