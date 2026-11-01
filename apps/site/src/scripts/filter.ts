import type { Range } from '@aq/schema'

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
/** Lower case, accents off (đ as d), each run of anything but letters and digits one space: "Cá đĩa" → "ca dia". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
/**
 * The typed words, in the name, starting where a word does: "dia" finds Cá đĩa and diabolica, "ca dia" never Barbucca
 * diabolica. Thai writes no spaces between words, so a match may start anywhere except inside a Latin word.
 */
export function nameHas(name: string, text: string): boolean {
  const h = fold(name), n = fold(text)
  for (let at = h.indexOf(n); at !== -1; at = h.indexOf(n, at + 1)) if (at === 0 || !/[a-z0-9]/.test(h[at - 1]!)) return true
  return false
}
const named = (i: SpeciesIndexItem, q: SpeciesQuery) =>
  (!q.group || i.group === q.group) && (!q.text || nameHas(`${i.name} ${i.scientificName}`, q.text))

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
  return !text || nameHas(name, text)
}

export function queryFromParams(p: URLSearchParams): SpeciesQuery {
  const n = (k: string) => { const v = p.get(k); return v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v) }
  return { difficultyMax: n('difficultyMax'), tempC: n('tempC'), ph: n('ph'), tankCm: n('tankCm'), group: p.get('group') || undefined, text: p.get('q') || undefined }
}

const LIGHT = ['low', 'medium', 'high'] as const
const PLACEMENT = ['foreground', 'midground', 'background', 'epiphyte', 'floating'] as const
/** A plant list card's figures; one the content has no value for is left out (a plant with no position: no `placement`). */
export type PlantIndexItem = {
  slug: string; light?: (typeof LIGHT)[number]; co2?: 'none' | 'optional' | 'required'; difficulty?: number; placement?: string[]
}
/**
 * The reader's tank, as the plant list's filters set it: its light (plants needing as much or less fit), no CO₂ (plants
 * that grow without it) or the plants that need CO₂, a position in the tank, and the hardest plant they will take on.
 */
export type PlantQuery = { light?: (typeof LIGHT)[number]; co2?: 'none' | 'required'; placement?: string; difficultyMax?: number }

/** As for species: true when the plant fits, false when it doesn't, undefined when it has no figure for it. */
function plantChecks(i: PlantIndexItem, q: PlantQuery): (boolean | undefined)[] {
  const has = <T>(v: T | undefined, ok: (v: T) => boolean) => (v === undefined ? undefined : ok(v))
  return [
    q.light === undefined ? true : has(i.light, l => LIGHT.indexOf(l) <= LIGHT.indexOf(q.light!)),
    q.co2 === undefined ? true : has(i.co2, c => (q.co2 === 'none' ? c !== 'required' : c === 'required')),
    q.placement === undefined ? true : has(i.placement, p => p.includes(q.placement!)),
    q.difficultyMax === undefined ? true : has(i.difficulty, d => d <= q.difficultyMax!),
  ]
}

/** Plants whose figures are all known and all fit the query. */
export function filterPlants(items: PlantIndexItem[], q: PlantQuery): PlantIndexItem[] {
  return items.filter(i => plantChecks(i, q).every(c => c === true))
}

/** Plants nothing known rules out, but missing a figure the query asks about. */
export function unsurePlants(items: PlantIndexItem[], q: PlantQuery): PlantIndexItem[] {
  return items.filter(i => { const c = plantChecks(i, q); return !c.includes(false) && c.includes(undefined) })
}

export function plantQueryFromParams(p: URLSearchParams): PlantQuery {
  const one = <T extends string>(k: string, allowed: readonly T[]) => allowed.find(a => a === p.get(k))
  const d = Number(p.get('difficultyMax'))
  return {
    light: one('light', LIGHT), co2: one('co2', ['none', 'required'] as const), placement: one('placement', PLACEMENT),
    difficultyMax: d >= 1 && d <= 3 ? d : undefined,
  }
}
