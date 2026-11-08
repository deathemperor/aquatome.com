import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { countryName, recordsInside, recordsOutside, SpeciesSchema, type SpeciesRange } from '@aq/schema'
import type { AppIndex } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'
import { LANGS } from '../src/lib/i18n'
import { appRange, regionNames, type AppCountry, type AppRange } from '../src/lib/range'
import { DIST } from './dist'

// Shared with the iOS app, which reads a fish's range from its app index entry and names its countries from the index's
// `countries`. Only the notes, the made-up ranges and the `species` ids are written by hand: UPDATE_VECTORS=1 pnpm
// --filter site test rewrites the rest (a species' range from the fixture content, each entry, the names).
const FILE = new URL('../../../protocols/range-vectors.json', import.meta.url)
const FIXTURE = new URL('fixture-content/species/', import.meta.url)
const NAME_LANGS = [...LANGS, 'en'] as const

type Case = { note: string; species?: string; range: SpeciesRange; entry?: AppRange }
type Vectors = { $comment: string; cases: Case[]; countries: Record<string, AppCountry>; names: Record<string, Record<(typeof NAME_LANGS)[number], string>> }

const index: AppIndex = JSON.parse(readFileSync(`${DIST}/app/vi.json`, 'utf8'))
const fixture = (id: string) => SpeciesSchema.parse(JSON.parse(readFileSync(new URL(`${id}/entity.json`, FIXTURE), 'utf8')))
const regionName = regionNames((await getContent('vi')).placeNames)
const codesOf = (e?: AppRange) => [...(e?.native ?? []), ...(e?.records?.outside ?? []).map(([c]) => c)]

/** The file as the site would write it now, from the hand-written notes, ranges and species ids of `kept`. */
function regenerate(kept: Vectors): Vectors {
  const cases = kept.cases.map((c): Case => {
    const range = c.species ? (fixture(c.species).range ?? {}) : c.range
    const entry = c.species ? index.items.find(i => i.kind === 'fish' && i.id === c.species)?.range : appRange(range, regionName)
    return { note: c.note, ...(c.species ? { species: c.species } : {}), range, ...(entry ? { entry } : {}) }
  })
  const codes = [...new Set(cases.flatMap(c => [...(c.range.native?.countries ?? []), ...(c.range.records?.countries ?? []).map(([code]) => code)]))].sort()
  const real = new Set(cases.filter(c => c.species).flatMap(c => codesOf(c.entry)))
  return {
    $comment: kept.$comment, cases,
    countries: Object.fromEntries([...real].sort().map(code => [code, index.countries![code]!])),
    names: Object.fromEntries(codes.map(code => [code, Object.fromEntries(NAME_LANGS.map(l => [l, countryName(code, l)]))])) as Vectors['names'],
  }
}

/** JSON with two spaces, anything that fits in 120 columns on one line. */
const flat = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(flat).join(', ')}]` : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${flat(x)}`).join(', ')}}` : JSON.stringify(v)
function json(v: unknown, indent = '', lead = 0): string {
  const one = flat(v)
  if (!v || typeof v !== 'object' || indent.length + lead + one.length <= 120) return one
  const inner = `${indent}  `
  const body = Array.isArray(v) ? v.map(x => inner + json(x, inner)) : Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${json(x, inner, k.length + 4)}`)
  return Array.isArray(v) ? `[\n${body.join(',\n')}\n${indent}]` : `{\n${body.join(',\n')}\n${indent}}`
}

const kept: Vectors = JSON.parse(readFileSync(FILE, 'utf8'))

test('protocols/range-vectors.json is the site\'s entries for these ranges and the fixture fish, and their countries\' names', () => {
  const next = `${json(regenerate(kept))}\n`
  if (process.env.UPDATE_VECTORS === '1') writeFileSync(FILE, next)
  expect(readFileSync(FILE, 'utf8'), 'run UPDATE_VECTORS=1 pnpm --filter site test').toBe(next)
})

test('each case\'s range is a valid content range, and its entry is appRange\'s: no cells, records inside and outside only with native countries', () => {
  for (const c of kept.cases) {
    const r = SpeciesSchema.shape.range.safeParse(c.range)
    expect(r.success, `${c.note}: ${r.error?.message}`).toBe(true)
    expect(appRange(c.range, regionName), c.note).toEqual(c.entry)
    if (!c.entry) continue
    expect(c.entry.native, c.note).toEqual(c.range.native?.countries.length ? c.range.native.countries : undefined)
    expect(c.entry.regions?.length, c.note).toBe(c.range.native?.regions.length || undefined)
    const rec = c.entry.records
    expect(rec === undefined, c.note).toBe(c.range.records === undefined)
    if (!rec) continue
    expect(rec, c.note).toMatchObject({ total: c.range.records!.total, taxonKey: c.range.records!.taxonKey, fetched: c.range.records!.fetched })
    expect(rec.inside, c.note).toBe(recordsInside(c.range))
    expect(rec.outside, c.note).toEqual(recordsOutside(c.range))
    expect('cells' in rec, c.note).toBe(false)
    if (rec.inside !== undefined) expect(rec.inside + rec.outside!.reduce((n, [, x]) => n + x, 0), c.note).toBeLessThanOrEqual(rec.total)
    for (const [code] of rec.outside ?? []) expect(c.range.native!.countries, c.note).not.toContain(code)
  }
})

test('the cases cover each shape the app must draw', () => {
  const ranges = kept.cases.map(c => c.range)
  const entries = kept.cases.map(c => c.entry)
  const outside = (r: SpeciesRange) => (r.records?.countries ?? []).filter(([c]) => !r.native?.countries.includes(c)).length
  expect(entries.some(e => !e), 'no range').toBe(true)
  expect(ranges.some(r => r.native && !r.records), 'native, no records').toBe(true)
  expect(ranges.some(r => r.native && !r.native.countries.length), 'regions only').toBe(true)
  expect(ranges.some(r => !r.native && r.records), 'records, no native').toBe(true)
  expect(ranges.some(r => r.records?.cells.some(c => c[3]! > 0 && c[3]! < c[2])), 'a cell on a border').toBe(true)
  expect(ranges.some(r => r.native?.countries.length && outside(r) > 5), 'more than five countries outside').toBe(true)
  expect(ranges.some(r => r.records?.total === 0), 'no records').toBe(true)
  expect(entries.some(e => e?.records?.inside === 0 && e.records.total > 0), 'none inside').toBe(true)
  expect(ranges.some(r => r.records && r.records.countries.reduce((n, [, x]) => n + x, 0) < r.records.total), 'a record in no country').toBe(true)
  expect(kept.cases.filter(c => c.species).length).toBeGreaterThanOrEqual(2)
})

test('the fixture content validates, and each fixture fish\'s index entry is its range\'s, its countries named in the index', () => {
  const fish = readdirSync(FIXTURE)
  let ranges = 0
  for (const id of fish) {
    const parsed = SpeciesSchema.safeParse(JSON.parse(readFileSync(new URL(`${id}/entity.json`, FIXTURE), 'utf8')))
    expect(parsed.success, `${id}: ${parsed.error?.message}`).toBe(true)
    if (parsed.data?.range) ranges++
    const item = index.items.find(i => i.kind === 'fish' && i.id === id)
    expect(item?.range, id).toEqual(appRange(parsed.data!.range, regionName))
    for (const code of codesOf(item?.range)) {
      const named = index.countries?.[code]
      expect(named?.name, `${id}: ${code}`).toBeTruthy()
      // An origin page's place is one the index lists; any other name is Intl's.
      if (named?.place) expect(index.places.some(p => p.id === named.place && p.kind === 'country'), `${id}: ${code}`).toBe(true)
      else expect(named?.name, `${id}: ${code}`).toBe(countryName(code, 'vi'))
    }
  }
  expect(ranges).toBeGreaterThanOrEqual(2)
  expect(Object.keys(index.countries ?? {})).toEqual([...new Set(index.items.flatMap(i => codesOf(i.range)))].sort())
})
