/**
 * Where a species lives in the wild (content `range`, written by the engine's range.ts): `native`, the countries and
 * regions its cited sources name as its natural range, and `records`, its wild occurrence records on GBIF on a grid.
 */

/** A records cell's side in degrees: GBIF's map squares (EPSG:4326 at zoom 1: a tile is 90° and 4096 units, a square 64). */
export const CELL_DEG = 1.40625

/** A cell's west and south edges (degrees), its records, and, when the range has native countries, how many of them are in one. */
export type Cell = [west: number, south: number, n: number] | [west: number, south: number, n: number, inside: number]

type Range = { native?: { countries: string[] }; records?: { countries: [string, number][] } }

/** The records in a native country (GBIF's country field); none without native countries or records. */
export function recordsInside(range: Range): number | undefined {
  const native = new Set(range.native?.countries ?? [])
  if (!native.size || !range.records) return undefined
  return range.records.countries.reduce((sum, [c, n]) => sum + (native.has(c) ? n : 0), 0)
}

/** The countries outside the native range with the most records, most first and then by code, at most `top`; none without native countries or records. */
export function recordsOutside(range: Range, top = 5): [string, number][] | undefined {
  const native = new Set(range.native?.countries ?? [])
  if (!native.size || !range.records) return undefined
  return range.records.countries.filter(([c]) => !native.has(c)).sort(byCount).slice(0, top)
}

/** Most records first, then by code. */
export const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
