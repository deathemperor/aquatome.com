import { expect, test } from 'vitest'
import { CELL_DEG, countryName, type Cell, type SourceId, type SpeciesRange } from '@aq/schema'
import { isVietnamese } from '@aq/schema/text'
import { getContent } from '../src/lib/content'
import { frameOf, mapSvg, MAP_W, rangeMap } from '../src/lib/range-map'
import { gbifSearch, rangeParts, rangePicture } from '../src/lib/range'

// A species page's "Phân bố tự nhiên" (lib/range.ts rangeParts, lib/range-map.ts): what it says and draws from a range.

const c = await getContent('vi')
const native = (over: Partial<NonNullable<SpeciesRange['native']>> = {}) => ({ countries: ['PE', 'BR'], regions: ['Amazon'], sources: ['seriouslyfish'] as SourceId[], ...over })
const records = (cells: Cell[], countries: [string, number][]) => ({ taxonKey: 2353909, total: cells.reduce((n, x) => n + x[2], 0), fetched: '2026-11-04', countries, cells })
// Cells near Iquitos (Peru), Manaus (Brazil) and Caracas (Venezuela): all inside, a border cell, all outside.
const PE: Cell = [-74.53125, -4.21875, 6, 6], BORDER: Cell = [-70.3125, -4.21875, 4, 1], VE: Cell = [-67.5, 9.84375, 3, 0]
const range: SpeciesRange = { native: native(), records: records([PE, BORDER, VE], [['PE', 7], ['VE', 6]]) }
const marks = (cited: string[]) => (s: SourceId) => (cited.includes(s) ? `<a class="cite" href="https://example.org/${s}">${cited.indexOf(s) + 1}</a>` : '')
const parts = (r: SpeciesRange | undefined, cited = ['seriouslyfish', 'sprucepets']) => rangeParts('vi', c, { id: 'x', name: 'Cá neon xanh', range: r }, marks(cited))
const plain = (html = '') => html.replace(/<[^>]+>/g, '')

test('no range, or a range of no native part and no records, is no block', () => {
  expect(parts(undefined)).toBeUndefined()
  expect(parts({})).toBeUndefined()
  expect(parts({ records: records([], []) })).toBeUndefined()
})

test('a native range without records is words only: its countries (linked to their origin pages) and regions, each line marked', () => {
  const p = parts({ native: native() })!
  expect(p.title).toBe('Phân bố tự nhiên')
  expect(plain(p.words)).toBe('Sống tự nhiên ở: Peru, Brazil1Sông, hồ, vùng: Amazon1')
  expect(p.words).toContain('<a href="/vi/nguon-goc/south-america/peru/">Peru</a>')
  expect(p.records ?? p.map ?? p.credit).toBeUndefined()
  // A range read before quotes has no sentences to show.
  expect(p.said).toBeUndefined()
})

test('each sentence with what it names and its source\'s mark; only from a source the page cites', () => {
  const quotes = [
    { source: 'seriouslyfish' as const, quote: 'Native to the upper Amazon basin in Peru.', countries: ['PE'], regions: ['Amazon'] },
    { source: 'sprucepets' as const, quote: 'Found in western Brazil.', countries: ['BR'], regions: [] },
  ]
  const r = { native: native({ sources: ['seriouslyfish', 'sprucepets'], quotes }) }
  const p = parts(r)!
  expect(p.said?.title).toBe('Nguồn ghi gì')
  expect(plain(p.said?.html)).toBe('Peru, Amazon · Seriously Fish1: “Native to the upper Amazon basin in Peru.”Brazil · The Spruce Pets2: “Found in western Brazil.”')
  expect(p.said?.html).toContain('<span lang="en">')
  // The countries' line ends with both sources' marks, the regions' with the one its sentence is from.
  expect(plain(p.words)).toBe('Sống tự nhiên ở: Peru, Brazil12Sông, hồ, vùng: Amazon1')
  // A source the page has no text of: its sentence and its mark are left out, not its country.
  const only = parts(r, ['seriouslyfish'])!
  expect(plain(only.said?.html)).toBe('Peru, Amazon · Seriously Fish1: “Native to the upper Amazon basin in Peru.”')
  expect(plain(only.words)).toBe('Sống tự nhiên ở: Peru, Brazil1Sông, hồ, vùng: Amazon1')
  expect(parts(r, [])!.said).toBeUndefined()
})

test('records in words: how many, how many in the native countries, where the rest are most', () => {
  expect(plain(parts(range)!.records)).toBe('GBIF có 13 ghi nhận ngoài tự nhiên: 7 trong các nước trên, 6 ở nơi khác (nhiều nhất: Venezuela 6). Ghi nhận ở nơi khác có thể là cá do người thả ra, hoặc nhận nhầm loài.')
  expect(plain(parts({ native: native(), records: records([PE], [['PE', 6]]) })!.records)).toBe('GBIF có 6 ghi nhận ngoài tự nhiên, tất cả trong các nước trên.')
  // No native countries (none, or a lake only): records can't be told inside or out.
  for (const r of [{ records: records([[-74.53125, -4.21875, 6]], [['PE', 6]]) }, { native: native({ countries: [], regions: ['Lake Malawi'] }), records: records([[-74.53125, -4.21875, 6]], [['PE', 6]]) }]) {
    const p = parts(r)!
    expect(plain(p.records)).toBe('GBIF có 6 ghi nhận ngoài tự nhiên. Nguồn không ghi loài này sống tự nhiên ở nước nào, nên không tách được ghi nhận trong hay ngoài vùng bản địa.')
    expect(p.map?.legend.map(l => l.kind)).toEqual(['rec'])
    expect(p.map?.alt).toBe('Bản đồ 6 ghi nhận ngoài tự nhiên của Cá neon xanh trên GBIF.')
  }
  // Numbers as the page writes them.
  const many = parts({ native: native(), records: { ...records([[-74.53125, -4.21875, 8249, 749]], [['VE', 7500], ['PE', 749]]) } })!
  expect(plain(many.records)).toContain('GBIF có 8.249 ghi nhận ngoài tự nhiên: 749 trong các nước trên, 7.500 ở nơi khác')
})

test('the map: inside, outside and both told apart by shape, its legend, its words, the credit with GBIF\'s own search', () => {
  const p = parts(range)!
  expect(p.map?.legend.map(l => [l.kind, l.label])).toEqual([
    ['in', 'Ghi nhận trong các nước bản địa'], ['both', 'Ô có cả hai'], ['out', 'Ghi nhận ở nơi khác'], ['native', 'Nước bản địa'],
  ])
  expect(p.map?.alt).toBe('Bản đồ 13 ghi nhận ngoài tự nhiên của Cá neon xanh trên GBIF: 7 trong các nước bản địa, 6 ở nơi khác.')
  expect(p.map?.svg).toContain(`aria-label="${p.map?.alt}"`)
  expect(p.map?.caption).toBe('■ Ghi nhận trong các nước bản địa · ◩ Ô có cả hai · □ Ghi nhận ở nơi khác · ▒ Nước bản địa. Mỗi ô khoảng 160 km.')
  expect(p.credit).toEqual({ text: 'Dữ liệu: GBIF.org, 13 ghi nhận, lấy ngày 2026-11-04', licence: 'CC0, CC BY 4.0', url: gbifSearch(2353909), base: 'Bản đồ nền: Natural Earth' })
  const u = new URL(gbifSearch(2353909))
  expect([u.host, u.searchParams.get('taxon_key'), u.searchParams.getAll('license'), u.searchParams.getAll('basis_of_record')]).toEqual(['www.gbif.org', '2353909', ['CC0_1_0', 'CC_BY_4_0'], ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE', 'MATERIAL_CITATION', 'OCCURRENCE']])
  // Solid squares (and the both cell's lower half), hollow ones (and the both cell's outline), each kind one path.
  const m = rangeMap(range)!
  expect(m.paths.in.match(/M/g)).toHaveLength(2)
  expect(m.paths.out.match(/M/g)).toHaveLength(2)
  expect(m.paths.rec).toBe('')
  expect(m.paths.native).not.toBe('')
  expect(mapSvg(m, 'web', 'x').match(/<path /g)).toHaveLength(4)
})

test('the frame holds every cell, padded, at least a region wide, never a strip, inside the world', () => {
  const cases: Cell[][] = [[PE], [PE, BORDER, VE], [[-180, -90, 1], [178.59375, 88.59375, 1]], [[-180, 0, 1], [-163.125, 2.8125, 1]], [[120.9375, 23.90625, 2], [-67.5, 9.84375, 1]]]
  for (const cells of cases) {
    const f = frameOf(cells)
    for (const [w, s] of cells) expect(f.west <= w && f.east >= w + CELL_DEG && f.south <= s && f.north >= s + CELL_DEG, JSON.stringify(cells)).toBe(true)
    expect(f.west >= -180 && f.east <= 180 && f.south >= -90 && f.north <= 90).toBe(true)
    const aspect = (f.east - f.west) / (f.north - f.south)
    expect(aspect >= 1.25 - 1e-9 && aspect <= 2 + 1e-9, `${JSON.stringify(cells)}: ${aspect}`).toBe(true)
    expect(f.east - f.west).toBeGreaterThanOrEqual(45)
  }
  expect(frameOf([[-180, -90, 1], [178.59375, 88.59375, 1]])).toEqual({ west: -180, east: 180, south: -90, north: 90 })
})

test('a wide frame draws cells together on a coarser square of the same grid, their records and kinds added up', () => {
  // Taiwan and Venezuela: the frame spans most of the world, a cell would be about 3 units.
  const far: SpeciesRange = { native: native({ countries: ['VE'] }), records: records([[120.9375, 23.90625, 2, 0], [122.34375, 23.90625, 1, 0], [-67.5, 9.84375, 1, 1]], [['TW', 3], ['VE', 1]]) }
  const m = rangeMap(far)!
  expect(m.step).toBeGreaterThan(1)
  expect(CELL_DEG * m.step * (MAP_W / (m.frame.east - m.frame.west))).toBeGreaterThanOrEqual(10)
  // Taiwan's two cells are one square, outside; Venezuela's is inside.
  expect(m.paths.out.match(/M/g)).toHaveLength(1)
  expect(m.paths.in.match(/M/g)).toHaveLength(1)
  expect(parts(far)!.map?.scale).toBe(`Mỗi ô khoảng ${Math.round((CELL_DEG * m.step * 111) / 10) * 10} km.`)
})

test('the app\'s picture: twice the map, in literal colours, its address changing with the map', () => {
  const a = rangePicture('x', range)!
  expect(a.file).toMatch(/^\/app\/range\/x-[0-9a-f]{10}\.png$/)
  expect(a.svg).toContain(`width="${a.map.w * 2}" height="${a.map.h * 2}"`)
  expect(a.svg).not.toMatch(/var\(|class=/)
  expect(rangePicture('x', range)!.file).toBe(a.file)
  expect(rangePicture('x', { ...range, records: records([PE, VE], [['PE', 6], ['VE', 3]]) })!.file).not.toBe(a.file)
  expect(rangePicture('x', { native: native() })).toBeUndefined()
})

test('the fixture fish: the neon tetra\'s block as its page will show it', () => {
  const s = c.species.find(x => x.id === 'paracheirodon-innesi')!
  const p = rangeParts('vi', c, { id: s.id, name: s.t.name, range: s.range }, marks(['seriouslyfish']))!
  expect(plain(p.words)).toBe('Sống tự nhiên ở: Colombia, Peru, Brazil, Ecuador1Sông, hồ, vùng: Amazon, Orinoco, Purus, Putumayo, Solimões, Napo1')
  // The Spruce Pets has no text on the page: its sentence (the Orinoco) isn't shown.
  expect(p.said?.html.match(/<li>/g)).toHaveLength(4)
  expect(plain(p.records)).toBe('GBIF có 39 ghi nhận ngoài tự nhiên: 27 trong các nước trên, 12 ở nơi khác (nhiều nhất: Venezuela 12). Ghi nhận ở nơi khác có thể là cá do người thả ra, hoặc nhận nhầm loài.')
  expect(p.map?.legend.map(l => l.kind)).toEqual(['in', 'out', 'native'])
})

test('in Indonesian and Thai: every word translated, the countries named in that language', async () => {
  for (const [lang, title] of [['id', 'Sebaran alami'], ['th', 'การกระจายพันธุ์ตามธรรมชาติ']] as const) {
    const p = rangeParts(lang, await getContent(lang), { id: 'x', name: 'Neon', range }, marks(['seriouslyfish']))!
    expect(p.title).toBe(title)
    const words = [p.words, p.records, p.map?.alt, p.map?.caption, p.credit?.text, p.credit?.base, ...(p.map?.legend.map(l => l.label) ?? [])].map(plain).join(' ')
    expect(isVietnamese(words), `${lang}: ${words}`).toBe(false)
    expect(words, lang).toContain(countryName('VE', lang))
  }
})

test('off the Vietnamese pages, a place written in Vietnamese the site has no page of is marked so: its region and its sentence (Bagarius rutilus\' Sông Kỳ Cùng)', async () => {
  const quotes = [{ source: 'seriouslyfish' as const, quote: 'Known from the Thái Bình, Sông Kỳ Cùng and Lam rivers in Vietnam.', countries: [], regions: ['Sông Kỳ Cùng', 'Lam'] }]
  const r = { native: native({ countries: ['VN'], regions: ['Sông Kỳ Cùng', 'Lam'], quotes }) }
  for (const lang of ['id', 'th'] as const) {
    const p = rangeParts(lang, await getContent(lang), { id: 'x', name: 'Bagarius', range: r }, marks(['seriouslyfish']))!
    expect(p.words, lang).toContain('<span lang="vi">Sông Kỳ Cùng</span>, Lam')
    expect(p.said?.html, lang).toContain('<span lang="vi">Sông Kỳ Cùng</span>, Lam</strong>')
    expect(p.said?.html, lang).toContain('the Thái Bình, <span lang="vi">Sông Kỳ Cùng</span> and Lam')
    // Once the marked names are out, as the page check reads the page, no Vietnamese is left.
    for (const html of [p.words, p.said!.html]) expect(isVietnamese(plain(html.replace(/<span lang="vi">[^<]*<\/span>/g, ''))), `${lang}: ${html}`).toBe(false)
  }
  // A Vietnamese page is Vietnamese throughout: nothing to mark.
  expect(parts(r)!.words).not.toContain('lang="vi"')
})
