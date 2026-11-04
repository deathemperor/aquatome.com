import { byCount, CELL_DEG, isCountryCode, type Cell, type SpeciesRange } from '@aq/schema'

/**
 * A species' wild occurrence records on GBIF, binned to CELL_DEG cells (content `range.records`, range.ts). Each species
 * takes about a dozen small requests: its name matched, one count with the records in each country (and each dataset,
 * for a derived-dataset citation), then GBIF's map squares for the world, and for the tiles with any, again for the
 * native countries alone, so a cell on a border holds both counts.
 */

const API = 'https://api.gbif.org'

/** Every basis of record but living specimens (aquaria, zoos, gardens) and fossils. */
export const BASES = ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE', 'MATERIAL_CITATION', 'OCCURRENCE'] as const
/** The licences a commercial site may show records under: CC0 and CC BY 4.0. Never a non-commercial one. */
export const LICENCES = ['CC0_1_0', 'CC_BY_4_0'] as const

/** The filters every request shares: present, coordinates without geospatial issues, BASES, LICENCES; `countries` narrows them. */
export function recordFilters(taxonKey: number, countries: string[] = []): string {
  const p = new URLSearchParams({ taxonKey: String(taxonKey), occurrenceStatus: 'PRESENT', hasCoordinate: 'true', hasGeospatialIssue: 'false' })
  for (const b of BASES) p.append('basisOfRecord', b)
  for (const l of LICENCES) p.append('license', l)
  for (const c of countries) p.append('country', c)
  return p.toString()
}

export const matchUrl = (name: string) => `${API}/v1/species/match?name=${encodeURIComponent(name)}`
/** The records' count, by country and by dataset. */
export const searchUrl = (taxonKey: number) => `${API}/v1/occurrence/search?${recordFilters(taxonKey)}&limit=0&facet=country&facet=datasetKey&facetLimit=1000`

/**
 * GBIF's map squares at zoom 1 in EPSG:4326: 4 × 2 tiles of 90°, each 4096 units, a 64-unit square CELL_DEG. At zoom 0
 * GBIF gathers points coarser than the squares it draws (12 squares for the 41 cells Betta splendens's records fill);
 * from zoom 1 each square holds the records inside it (checked against the records themselves).
 */
const ZOOM = 1
const COLS = 4
const ROWS = 2
const TILE_DEG = 90
const SQUARE = 64
export const tileUrl = (taxonKey: number, x: number, y: number, countries: string[] = []) =>
  `${API}/v2/map/occurrence/adhoc/${ZOOM}/${x}/${y}.mvt?srs=EPSG:4326&bin=square&squareSize=${SQUARE}&${recordFilters(taxonKey, countries)}`

/** A GBIF request: answered, retried with backoff on a network failure, 429 or 5xx, and paced. */
export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>
export type Gbif = { get: (url: string) => Promise<Uint8Array | null>; json: <T>(url: string) => Promise<T>; requests: () => number }

/**
 * GBIF over `fetch`, as the site's user agent: `gapMs` before every request, up to `tries` attempts a request, waiting
 * Retry-After or 1, 2, 4 … s between them. `get` gives null for an empty map tile (GBIF answers 204, or 400 "missing the
 * expected layer").
 */
export function gbifClient(o: { fetch: Fetch; sleep: (ms: number) => Promise<void>; ua: string; gapMs?: number; tries?: number }): Gbif {
  let requests = 0
  const tries = o.tries ?? 4
  async function get(url: string): Promise<Uint8Array | null> {
    for (let attempt = 1; ; attempt++) {
      if (o.gapMs) await o.sleep(o.gapMs)
      requests++
      let res: Response | undefined
      let error = ''
      try {
        res = await o.fetch(url, { headers: { 'user-agent': o.ua }, signal: AbortSignal.timeout(60_000) })
      } catch (e) {
        error = (e as Error).message
      }
      if (res?.status === 204) return null
      if (res?.ok) return new Uint8Array(await res.arrayBuffer())
      const body = res ? await res.text().catch(() => '') : ''
      if (res?.status === 400 && /missing the expected layer/i.test(body)) return null
      const again = !res || res.status === 429 || res.status >= 500
      if (!again || attempt >= tries) throw new Error(`GBIF ${res ? `HTTP ${res.status}` : error} for ${url.replace(API, '')}`.slice(0, 300))
      const after = Number(res?.headers.get('retry-after'))
      await o.sleep(after > 0 ? Math.min(after, 120) * 1000 : 1000 * 2 ** (attempt - 1))
    }
  }
  return {
    get,
    json: async <T>(url: string) => {
      const bytes = await get(url)
      if (!bytes) throw new Error(`GBIF: nothing for ${url.replace(API, '')}`)
      return JSON.parse(new TextDecoder().decode(bytes)) as T
    },
    requests: () => requests,
  }
}

/** A protobuf reader over a slice, for the few messages a vector tile has. */
class Pbf {
  constructor(private b: Uint8Array, private p = 0, private end = b.length) {}
  more = () => this.p < this.end
  varint(): number {
    let r = 0
    let s = 1
    let x: number
    do {
      x = this.b[this.p++]!
      r += (x & 0x7f) * s
      s *= 128
    } while (x & 0x80)
    return r
  }
  tag = (): [field: number, wire: number] => { const t = this.varint(); return [Math.floor(t / 8), t & 7] }
  sub(): Pbf { const n = this.varint(); const s = this.p; this.p += n; return new Pbf(this.b, s, this.p) }
  string = () => { const s = this.sub(); return new TextDecoder().decode(this.b.subarray(s.p, s.end)) }
  varints(): number[] { const out: number[] = []; while (this.more()) out.push(this.varint()); return out }
  fixed(n: 4 | 8): number {
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.p, n)
    this.p += n
    return n === 4 ? v.getFloat32(0, true) : v.getFloat64(0, true)
  }
  skip(wire: number) {
    if (wire === 0) this.varint()
    else if (wire === 1) this.p += 8
    else if (wire === 2) this.sub()
    else if (wire === 5) this.p += 4
    else throw new Error(`vector tile: wire type ${wire}`)
  }
}

const zigzag = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2)

/** A tile value: a string, a number or a boolean. */
function value(v: Pbf): string | number | boolean | undefined {
  let out: string | number | boolean | undefined
  while (v.more()) {
    const [f, w] = v.tag()
    if (f === 1 && w === 2) out = v.string()
    else if (f === 2 && w === 5) out = v.fixed(4)
    else if (f === 3 && w === 1) out = v.fixed(8)
    else if ((f === 4 || f === 5) && w === 0) out = v.varint()
    else if (f === 6 && w === 0) out = zigzag(v.varint())
    else if (f === 7 && w === 0) out = v.varint() !== 0
    else v.skip(w)
  }
  return out
}

export type Square = { x: number; y: number; size: number; total: number; extent: number }

/**
 * The squares of a GBIF map tile (a Mapbox Vector Tile: one layer, each feature a square polygon with its `total`), in
 * tile units from the top left: each square's left and top edge and side. A square in the tile's buffer, past its edges,
 * is the next tile's and left out.
 */
export function tileSquares(bytes: Uint8Array): Square[] {
  const out: Square[] = []
  const tile = new Pbf(bytes)
  while (tile.more()) {
    const [field, wire] = tile.tag()
    if (field !== 3 || wire !== 2) { tile.skip(wire); continue }
    const layer = tile.sub()
    const keys: string[] = []
    const values: (string | number | boolean | undefined)[] = []
    const features: Pbf[] = []
    let extent = 4096
    while (layer.more()) {
      const [f, w] = layer.tag()
      if (f === 2 && w === 2) features.push(layer.sub())
      else if (f === 3 && w === 2) keys.push(layer.string())
      else if (f === 4 && w === 2) values.push(value(layer.sub()))
      else if (f === 5 && w === 0) extent = layer.varint()
      else layer.skip(w)
    }
    for (const feature of features) {
      let tags: number[] = []
      let geometry: number[] = []
      while (feature.more()) {
        const [f, w] = feature.tag()
        if (f === 2 && w === 2) tags = feature.sub().varints()
        else if (f === 4 && w === 2) geometry = feature.sub().varints()
        else feature.skip(w)
      }
      let total: number | undefined
      for (let i = 0; i + 1 < tags.length; i += 2) if (keys[tags[i]!] === 'total') total = Number(values[tags[i + 1]!])
      // The ring's corners: MoveTo (1) and LineTo (2) take pairs of zigzag deltas; ClosePath (7) none.
      const xs: number[] = []
      const ys: number[] = []
      let x = 0
      let y = 0
      for (let i = 0; i < geometry.length;) {
        const c = geometry[i++]!
        const n = c >> 3
        if ((c & 7) === 7) continue
        for (let k = 0; k < n; k++) { x += zigzag(geometry[i++]!); y += zigzag(geometry[i++]!); xs.push(x); ys.push(y) }
      }
      if (!xs.length || !total) continue
      const sq = { x: Math.min(...xs), y: Math.min(...ys), size: Math.max(...xs) - Math.min(...xs), total, extent }
      if (sq.x >= 0 && sq.y >= 0 && sq.x < extent && sq.y < extent) out.push(sq)
    }
  }
  return out
}

/** A square's cell: its west and south edges in degrees, snapped to the CELL_DEG grid. */
export function squareCell(sq: Square, tx: number, ty: number): [west: number, south: number] {
  const deg = TILE_DEG / sq.extent
  const snap = (v: number) => Math.round(v / CELL_DEG) * CELL_DEG
  return [snap(-180 + tx * TILE_DEG + sq.x * deg), snap(90 - ty * TILE_DEG - (sq.y + sq.size) * deg)]
}

/** The map squares must hold the very records the search counted: anything else (records indexed between the requests) fails the species. */
export function sameCount(what: string, squares: number, search: number) {
  if (squares !== search) throw new Error(`GBIF map squares${what} add up to ${squares}, the search to ${search}`)
}

type Match = { usageKey?: number; acceptedUsageKey?: number; canonicalName?: string; species?: string; rank?: string; status?: string; matchType: string }
type Search = { count: number; facets: { field: string; counts: { name: string; count: number }[] }[] }
type Records = NonNullable<SpeciesRange['records']>

/** What a fetch read beyond what the page shows, kept in engine-state for the credit and for a person to check. */
export type RecordsAudit = {
  /** The name GBIF matched, its status (a synonym's accepted name is what the records are of) and the key. */
  matched: string; status?: string; taxonKey: number
  /** The datasets the records come from, most first: what a GBIF derived dataset (a citable DOI) would list. */
  datasets: [string, number][]
  /** The native countries the cells' inside counts are for. */
  native: string[]
  requests: number
}

/**
 * The records of a species on GBIF by its scientific name (an exact match at species rank or below; a synonym's accepted
 * taxon), as `range.records` holds them, with what to audit. null when GBIF can't match the name. Throws when a request
 * fails or the counts don't agree: the species keeps what it has.
 */
export async function gbifRecords(name: string, native: string[], gbif: Gbif, today: string): Promise<{ records: Records; audit: RecordsAudit } | null> {
  const start = gbif.requests()
  const m = await gbif.json<Match>(matchUrl(name))
  const key = m.acceptedUsageKey ?? m.usageKey
  if (m.matchType !== 'EXACT' || !key || !m.rank || !['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(m.rank)) return null
  const s = await gbif.json<Search>(searchUrl(key))
  const facet = (field: string) => (s.facets.find(f => f.field === field)?.counts ?? []).map(c => [c.name, c.count] as [string, number]).sort(byCount)
  // GBIF's own codes for the high seas and the unknown aren't countries: their records count in the total only.
  const countries = facet('COUNTRY').filter(([c, n]) => isCountryCode(c) && n > 0)
  const cells = new Map<string, Cell>()
  if (s.count > 0) {
    const raw = new Map<string, { at: [number, number]; n: number; inside: number }>()
    const tiles: [number, number][] = []
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const bytes = await gbif.get(tileUrl(key, tx, ty))
      const squares = bytes ? tileSquares(bytes) : []
      if (squares.length) tiles.push([tx, ty])
      for (const sq of squares) {
        const at = squareCell(sq, tx, ty)
        const r = raw.get(`${at}`) ?? raw.set(`${at}`, { at, n: 0, inside: 0 }).get(`${at}`)!
        r.n += sq.total
      }
    }
    sameCount('', [...raw.values()].reduce((sum, r) => sum + r.n, 0), s.count)
    if (native.length) {
      for (const [tx, ty] of tiles) {
        const bytes = await gbif.get(tileUrl(key, tx, ty, native))
        for (const sq of bytes ? tileSquares(bytes) : []) {
          const r = raw.get(`${squareCell(sq, tx, ty)}`)
          if (!r) throw new Error(`GBIF: a native square at ${squareCell(sq, tx, ty)} with no square for all records`)
          r.inside += sq.total
        }
      }
      sameCount(` in ${native.join(', ')}`, [...raw.values()].reduce((sum, r) => sum + r.inside, 0), countries.reduce((sum, [c, n]) => sum + (native.includes(c) ? n : 0), 0))
    }
    const sorted = [...raw.values()].sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
    for (const r of sorted) cells.set(`${r.at}`, native.length ? [r.at[0], r.at[1], r.n, r.inside] : [r.at[0], r.at[1], r.n])
  }
  return {
    records: { taxonKey: key, total: s.count, fetched: today, countries, cells: [...cells.values()] },
    audit: { matched: m.status === 'SYNONYM' && m.species ? m.species : (m.canonicalName ?? name), status: m.status, taxonKey: key, datasets: facet('DATASET_KEY'), native, requests: gbif.requests() - start },
  }
}
