import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { mvt } from './mvt'
import { BASES, gbifClient, gbifRecords, LICENCES, recordFilters, sameCount, searchUrl, squareCell, tileSquares, tileUrl, type Fetch } from '../src/range-records'

const fx = (n: string) => readFileSync(new URL(`./fixtures/gbif/range/${n}`, import.meta.url))
const MATCH = { usageKey: 2393998, canonicalName: 'Betta splendens', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT' }

test('every request asks for present wild records with clean coordinates, CC0 or CC BY 4.0 only: no NC licence, no captive or fossil record', () => {
  const p = new URLSearchParams(recordFilters(42))
  expect(p.getAll('license').sort()).toEqual(['CC0_1_0', 'CC_BY_4_0'])
  expect(p.getAll('license').some(l => /NC/i.test(l))).toBe(false)
  expect(p.getAll('basisOfRecord')).not.toContain('LIVING_SPECIMEN')
  expect(p.getAll('basisOfRecord')).not.toContain('FOSSIL_SPECIMEN')
  // GBIF's nine bases of record, but those two.
  expect([...BASES, 'LIVING_SPECIMEN', 'FOSSIL_SPECIMEN'].sort()).toEqual(['FOSSIL_SPECIMEN', 'HUMAN_OBSERVATION', 'LIVING_SPECIMEN', 'MACHINE_OBSERVATION', 'MATERIAL_CITATION', 'MATERIAL_SAMPLE', 'OBSERVATION', 'OCCURRENCE', 'PRESERVED_SPECIMEN'])
  expect(p.get('occurrenceStatus')).toBe('PRESENT')
  expect(p.get('hasCoordinate')).toBe('true')
  expect(p.get('hasGeospatialIssue')).toBe('false')
  expect(p.get('taxonKey')).toBe('42')
  expect(LICENCES).toEqual(['CC0_1_0', 'CC_BY_4_0'])
  // The count and the map squares read the same records; the native squares only narrow them by country.
  for (const url of [searchUrl(42), tileUrl(42, 3, 0), tileUrl(42, 3, 0, ['TH', 'MY'])]) expect(url).toContain(recordFilters(42))
  expect(new URL(tileUrl(42, 3, 0, ['TH', 'MY'])).searchParams.getAll('country')).toEqual(['TH', 'MY'])
})

test('a captured GBIF tile decodes to its squares, at their place on the map', () => {
  const squares = tileSquares(fx('betta-1-3-0.mvt'))
  expect(squares).toHaveLength(37)
  expect(squares.every(s => s.size === 64 && s.extent === 4096)).toBe(true)
  // GBIF writes `total` as a zigzag integer (sint64): read raw, every count looks twice what it is.
  expect(squares.reduce((n, s) => n + s.total, 0)).toBe(394)
  // Bangkok's cell (13.75 N, 100.5 E), in the Chao Phraya basin of Betta splendens's type locality: 144 records, the same
  // as binning the 427 records themselves gives.
  const bangkok = squares.find(s => squareCell(s, 3, 0).join() === '99.84375,12.65625')
  expect(bangkok?.total).toBe(144)
})

/** A fake GBIF answering from the captured Betta splendens files (its records in Thailand alone for the native squares). */
function bettaFetch(over: { search?: object; match?: object; log?: string[] } = {}): Fetch {
  return async url => {
    over.log?.push(url)
    const u = new URL(url)
    if (u.pathname === '/v1/species/match') return Response.json(over.match ?? MATCH)
    if (u.pathname === '/v1/occurrence/search') return Response.json(over.search ?? JSON.parse(fx('betta-search.json').toString()))
    const [, z, x, y] = /\/(\d)\/(\d)\/(\d)\.mvt$/.exec(u.pathname)!
    const country = u.searchParams.getAll('country')
    const name = `betta-${z}-${x}-${y}${country.length ? `-${country.join('-')}` : ''}.mvt`
    try { return new Response(fx(name)) } catch { return new Response(null, { status: 204 }) }
  }
}
const client = (fetch: Fetch) => gbifClient({ fetch, sleep: async () => {}, ua: 'test' })

test('Betta splendens\'s records: the count, each country, and cells that add up to it, each with its records in Thailand', async () => {
  const log: string[] = []
  const r = await gbifRecords('Betta splendens', ['TH'], client(bettaFetch({ log })), '2026-11-04')
  expect(r).not.toBeNull()
  const { records, audit } = r!
  expect(records.taxonKey).toBe(2393998)
  expect(records.total).toBe(427)
  expect(records.fetched).toBe('2026-11-04')
  expect(records.countries.slice(0, 3)).toEqual([['TH', 353], ['AU', 23], ['VN', 13]])
  expect(records.cells.reduce((n, c) => n + c[2], 0)).toBe(427)
  expect(records.cells.reduce((n, c) => n + (c[3] ?? 0), 0)).toBe(353)
  expect(records.cells).toContainEqual([99.84375, 12.65625, 144, 144])
  // Cells beside Thailand's borders, by GBIF's country field: Cambodia's west, by Thailand's east coast, none inside.
  expect(records.cells).toContainEqual([102.65625, 12.65625, 3, 0])
  // Australia's feral fish: outside.
  expect(records.cells).toContainEqual([130.78125, -12.65625, 14, 0])
  expect(records.cells.every(c => c.length === 4 && c[3]! <= c[2])).toBe(true)
  // One match, one count, 8 tiles, and Thailand's squares only for the 6 tiles with any record.
  expect(audit.requests).toBe(16)
  expect(log.filter(u => u.includes('country=TH'))).toHaveLength(6)
  expect(audit.datasets.length).toBeGreaterThan(5)
  expect(audit).toMatchObject({ matched: 'Betta splendens', taxonKey: 2393998, native: ['TH'] })
})

test('with no native countries, cells count records without inside, and the native squares are never asked for', async () => {
  const log: string[] = []
  const { records } = (await gbifRecords('Betta splendens', [], client(bettaFetch({ log })), '2026-11-04'))!
  expect(records.cells.every(c => c.length === 3)).toBe(true)
  expect(records.cells.reduce((n, c) => n + c[2], 0)).toBe(427)
  expect(log.some(u => u.includes('country='))).toBe(false)
})

test('a cell on a border: its records in the native country inside, the rest outside', async () => {
  // The cell over the Thai–Malay border (99.8–101.3 E, 5.6–7.0 N): 10 records, 6 of them in Thailand.
  const all = mvt([{ x: 448, y: 3776, size: 64, total: 10 }])
  const th = mvt([{ x: 448, y: 3776, size: 64, total: 6 }])
  expect(tileSquares(all)).toEqual([{ x: 448, y: 3776, size: 64, total: 10, extent: 4096 }])
  const fetch: Fetch = async url => {
    const u = new URL(url)
    if (u.pathname === '/v1/species/match') return Response.json(MATCH)
    if (u.pathname === '/v1/occurrence/search') return Response.json({ count: 10, facets: [{ field: 'COUNTRY', counts: [{ name: 'TH', count: 6 }, { name: 'MY', count: 4 }] }] })
    if (!u.pathname.endsWith('/1/3/0.mvt')) return new Response(null, { status: 204 })
    return new Response(u.searchParams.has('country') ? th : all)
  }
  const { records } = (await gbifRecords('Betta splendens', ['TH'], client(fetch), '2026-11-04'))!
  expect(squareCell({ x: 448, y: 3776, size: 64, total: 0, extent: 4096 }, 3, 0)).toEqual([99.84375, 5.625])
  expect(records.cells).toEqual([[99.84375, 5.625, 10, 6]])
  expect(records.countries).toEqual([['TH', 6], ['MY', 4]])
  // The same cell with Malaysia native too: all inside.
  const both = await gbifRecords('Betta splendens', ['TH', 'MY'], client(async url => (new URL(url).searchParams.has('country') ? new Response(all) : fetch(url, { headers: {} }))), '2026-11-04')
  expect(both!.records.cells).toEqual([[99.84375, 5.625, 10, 10]])
})

test('map squares that don\'t add up to the search\'s count fail the species', async () => {
  expect(() => sameCount('', 427, 427)).not.toThrow()
  expect(() => sameCount('', 426, 427)).toThrow(/426/)
  const search = JSON.parse(fx('betta-search.json').toString())
  await expect(gbifRecords('Betta splendens', ['TH'], client(bettaFetch({ search: { ...search, count: 428 } })), '2026-11-04')).rejects.toThrow(/add up/)
  // Thailand's squares disagreeing with Thailand's count.
  const fewer = { ...search, facets: search.facets.map((f: { field: string; counts: { name: string; count: number }[] }) => ({ ...f, counts: f.counts.map(c => (c.name === 'TH' ? { ...c, count: 300 } : c)) })) }
  await expect(gbifRecords('Betta splendens', ['TH'], client(bettaFetch({ search: fewer })), '2026-11-04')).rejects.toThrow(/TH add up/)
})

test('a name GBIF can\'t match exactly at species rank has no records; a synonym gives its accepted taxon\'s', async () => {
  for (const match of [{ matchType: 'NONE' }, { ...MATCH, matchType: 'FUZZY' }, { ...MATCH, matchType: 'HIGHERRANK', rank: 'GENUS' }, { ...MATCH, rank: 'GENUS' }]) {
    expect(await gbifRecords('Betta splendens', [], client(bettaFetch({ match })), '2026-11-04'), JSON.stringify(match)).toBeNull()
  }
  const syn = await gbifRecords('Betta rubra', [], client(bettaFetch({ match: { ...MATCH, usageKey: 1, acceptedUsageKey: 2393998, status: 'SYNONYM', species: 'Betta splendens' } })), '2026-11-04')
  expect(syn!.records.taxonKey).toBe(2393998)
  expect(syn!.audit).toMatchObject({ matched: 'Betta splendens', status: 'SYNONYM' })
})

test('GBIF is asked politely: the site\'s user agent, a gap before each request, retries with backoff on 429, 5xx and the network, never on 4xx', async () => {
  const waits: number[] = []
  const seen: string[] = []
  const answers: (() => Response)[] = [
    () => { throw new Error('socket hang up') },
    () => new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }),
    () => new Response('busy', { status: 503 }),
    () => Response.json({ ok: 1 }),
  ]
  const g = gbifClient({ fetch: async (_, init) => { seen.push(init.headers['user-agent']!); return answers.shift()!() }, sleep: async ms => { waits.push(ms) }, ua: 'aquatome-engine/0.1 (https://aquatome.com)', gapMs: 250 })
  expect(await g.json('https://api.gbif.org/v1/x')).toEqual({ ok: 1 })
  expect(waits).toEqual([250, 1000, 250, 7000, 250, 4000, 250])
  expect(new Set(seen)).toEqual(new Set(['aquatome-engine/0.1 (https://aquatome.com)']))
  expect(g.requests()).toBe(4)

  const once = (r: () => Response) => gbifClient({ fetch: async () => r(), sleep: async () => {}, ua: 'test' })
  let calls = 0
  await expect(gbifClient({ fetch: async () => { calls++; return new Response('no', { status: 404 }) }, sleep: async () => {}, ua: 'test' }).get('https://api.gbif.org/v1/x')).rejects.toThrow(/404/)
  expect(calls).toBe(1)
  await expect(gbifClient({ fetch: async () => new Response('busy', { status: 503 }), sleep: async () => {}, ua: 'test', tries: 3 }).get('https://api.gbif.org/v1/x')).rejects.toThrow(/503/)
  // An empty map tile: 204, or 400 "missing the expected layer".
  expect(await once(() => new Response(null, { status: 204 })).get('https://api.gbif.org/v2/x.mvt')).toBeNull()
  expect(await once(() => new Response('Tile is missing the expected layer: occurrence', { status: 400 })).get('https://api.gbif.org/v2/x.mvt')).toBeNull()
  await expect(once(() => new Response('Bad parameter', { status: 400 })).get('https://api.gbif.org/v2/x.mvt')).rejects.toThrow(/400/)
})
