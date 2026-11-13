import { nameKey, PlantSchema, SpeciesSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import { ensurePlaces, mergePlant, mergeSpecies, writeGuide } from '../src/merge'
import type { ProcessedPage } from '../src/process'

const taxon = { canonicalName: 'Paracheirodon axelrodi', order: 'Characiformes', family: 'Characidae', genus: 'Paracheirodon', matchType: 'EXACT' }
const page = (over: Partial<ProcessedPage> = {}): ProcessedPage => ({
  kind: 'species', scientificName: 'Paracheirodon axelrodi', synonyms: [], enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: ['Neon đỏ'], variety: '',
  group: 'tetras', places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }],
  dataCard: { tempC: { min: 23, max: 29 }, sizeCm: 3.5 },
  sections: [{ key: 'habitat', en: '<p>Streams.</p>', vi: '<p>Suối.</p>' }, { key: 'diet', en: '<p>Small.</p>', vi: '<p>Nhỏ.</p>' }],
  productSlots: [{ category: 'thuc-an', keywords: ['thức ăn tetra'] }], ...over,
})
const ctx = (source: 'seriouslyfish' | 'glaser' | 'bwaquatics', url = `https://${source}/p`) => ({ source, url, taxon, now: '2026-10-28', takenSlugs: new Set<string>() })

test('two sources merge; re-processing one source replaces only its parts', () => {
  const a = mergeSpecies({}, page(), ctx('seriouslyfish'))
  expect(a.entity.id).toBe('paracheirodon-axelrodi')
  expect(a.entity.places).toEqual(['south-america', 'brazil', 'rio-negro'])
  expect(a.vi.slug).toBe('ca-neon-vua')
  const b = mergeSpecies(a, page({ viName: 'Neon vua Glaser', dataCard: { tempC: { min: 22, max: 27 } }, sections: [{ key: 'habitat', en: '<p>G.</p>', vi: '<p>G vi.</p>' }] }), ctx('glaser'))
  expect(b.entity.sections.map(s => `${s.key}:${s.source}`)).toEqual(['habitat:seriouslyfish', 'habitat:glaser', 'diet:seriouslyfish'])
  expect(b.entity.dataCard.tempC).toEqual([{ source: 'seriouslyfish', value: { min: 23, max: 29 } }, { source: 'glaser', value: { min: 22, max: 27 } }])
  expect(b.vi.name).toBe('Cá neon vua') // only seriouslyfish may rename
  expect(b.vi.sections['habitat:glaser']).toBe('<p>G vi.</p>')
  const c = mergeSpecies(b, page({ dataCard: { sizeCm: 4 }, sections: [{ key: 'diet', en: '<p>New.</p>', vi: '<p>Mới.</p>' }] }), ctx('seriouslyfish'))
  expect(c.entity.sections.map(s => `${s.key}:${s.source}`)).toEqual(['habitat:glaser', 'diet:seriouslyfish'])
  expect(c.entity.dataCard.tempC).toEqual([{ source: 'glaser', value: { min: 22, max: 27 } }])
  expect(c.entity.dataCard.sizeCm).toEqual([{ source: 'seriouslyfish', value: 4 }])
  expect(Object.keys(c.vi.sections).sort()).toEqual(['diet:seriouslyfish', 'habitat:glaser'])
  expect(c.vi.slug).toBe('ca-neon-vua')
  expect(c.vi.altNames).toEqual(expect.arrayContaining(['Neon đỏ', 'Cardinal Tetra']))
})

test('a part a person fixed keeps its text, English and Vietnamese, when its source is read again', () => {
  const a = mergeSpecies({}, page(), ctx('seriouslyfish'))
  const entity = { ...a.entity, sections: a.entity.sections.map(s => (s.key === 'diet' ? { ...s, html: '<p>Fixed.</p>', fixed: true as const } : s)) }
  const vi = { ...a.vi, sections: { ...a.vi.sections, 'diet:seriouslyfish': '<p>Đã sửa.</p>' } }
  const b = mergeSpecies({ entity, vi }, page({ sections: [{ key: 'habitat', en: '<p>New streams.</p>', vi: '<p>Suối mới.</p>' }, { key: 'diet', en: '<p>Starve them.</p>', vi: '<p>Bỏ đói.</p>' }] }), ctx('seriouslyfish'))
  expect(b.entity.sections.filter(s => s.key === 'diet')).toEqual([{ key: 'diet', source: 'seriouslyfish', sourceUrl: 'https://seriouslyfish/p', html: '<p>Fixed.</p>', fixed: true }])
  expect(b.vi.sections['diet:seriouslyfish']).toBe('<p>Đã sửa.</p>')
  expect(b.vi.sections['habitat:seriouslyfish']).toBe('<p>Suối mới.</p>')
  const c = mergeSpecies(b, page({ sections: [{ key: 'habitat', en: '<p>Streams.</p>', vi: '<p>Suối.</p>' }] }), ctx('seriouslyfish'))
  expect(c.entity.sections.map(s => `${s.key}:${s.fixed ?? ''}`)).toEqual(['habitat:', 'diet:true'])
})

test('a shop\'s own talk stays off the page; another source\'s "we" is its own', () => {
  const sections = [
    { key: 'beforeYouBuy' as const, en: '<p>We always try to pick the healthiest fish for our customers.</p><p>Wild-caught in Kalimantan.</p>', vi: '<p>Chúng tôi luôn cố gắng chọn những con khỏe nhất cho khách hàng.</p><p>Bắt tự nhiên ở Kalimantan.</p>' },
    { key: 'diet' as const, en: '<p>The seller currently feeds blackworms.</p>', vi: '<p>Người bán hiện cho ăn trùn chỉ.</p>' },
  ]
  const shop = mergeSpecies({}, page({ sections }), { ...ctx('glaser'), source: 'bwaquatics' as const })
  expect(shop.entity.sections.map(s => [s.key, s.html])).toEqual([['beforeYouBuy', '<p>Wild-caught in Kalimantan.</p>']])
  expect(shop.vi.sections).toEqual({ 'beforeYouBuy:bwaquatics': '<p>Bắt tự nhiên ở Kalimantan.</p>' })
  expect(mergeSpecies({}, page({ sections }), ctx('seriouslyfish')).entity.sections).toHaveLength(2)
})

test('a translated guide that fixes a problem is written with the fix first', () => {
  const g = writeGuide(page({ kind: 'guide', guide: { kind: 'disease', viTitle: 'Cách loại bỏ tảo râu đen (BBA)', viBody: '<h3>Nguyên nhân</h3><p>a</p><h3>Cách xử lý tảo râu đen</h3><p>b</p>' } }), { source: 'aquariumcoop', url: 'https://x/bba', now: '2026-11-06', takenSlugs: new Set() })
  expect(g?.vi.body).toBe('<h3>Cách xử lý tảo râu đen</h3><p>b</p><h3>Nguyên nhân</h3><p>a</p>')
})

test('long names give slugs of at most 60 chars cut at a word boundary', () => {
  const r = mergeSpecies({}, page({ viName: 'HMF là gì? Hướng dẫn cơ bản về lọc vách xốp Hamburger (Hamburger Matten Filter)' }), ctx('seriouslyfish'))
  expect(r.vi.slug).toBe('hmf-la-gi-huong-dan-co-ban-ve-loc-vach-xop-hamburger')
})

test('slug collision gets the genus suffix', () => {
  const taken = new Set(['ca-neon-vua'])
  const r = mergeSpecies({}, page(), { ...ctx('seriouslyfish'), takenSlugs: taken })
  expect(r.vi.slug).toBe('ca-neon-vua-paracheirodon')
})

test('ensurePlaces creates missing places with parents', () => {
  const made = ensurePlaces([{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }, { continent: 'Asia', country: 'Thailand' }], new Set(['brazil']))
  expect(made.map(p => [p.entity.id, p.entity.kind, p.entity.parent])).toEqual([
    ['south-america', 'continent', undefined], ['rio-negro', 'river', 'brazil'], ['asia', 'continent', undefined], ['thailand', 'country', 'asia'],
  ])
  expect(made[0]?.vi).toMatchObject({ name: 'South America', slug: 'south-america' })
  // A country spelled another way is the one already kept: no second place, and a region under it hangs off it.
  const usa = ensurePlaces([{ continent: 'North America', country: 'USA', region: 'Florida' }], new Set(['north-america', 'united-states']))
  expect(usa.map(p => [p.entity.id, p.entity.parent])).toEqual([['florida', 'united-states']])
})

test('plants and guides', () => {
  const p = mergePlant({}, page({ kind: 'plant', scientificName: 'Anubias barteri', viName: 'Ráy Anubias', plant: { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte'] } }), { source: 'tropica', url: 'https://t/p', now: '2026-10-28', takenSlugs: new Set() })
  expect(p?.entity).toMatchObject({ id: 'anubias-barteri', difficulty: 1, placement: ['epiphyte'] })
  expect(mergePlant({}, page({ kind: 'plant', plant: undefined }), { source: 'tropica', url: 'u', now: 'n', takenSlugs: new Set() })).toBeNull()
  const g = writeGuide(page({ kind: 'guide', sections: [], guide: { kind: 'setup', viTitle: 'Dựng bể đầu tiên', viBody: '<p>Bước 1.</p>' } }), { source: 'aquariumcoop', url: 'https://www.aquariumcoop.com/blogs/aquarium/first-tank?x=1', now: '2026-10-28', takenSlugs: new Set() })
  expect(g?.entity).toMatchObject({ id: 'aquariumcoop-blogs-aquarium-first-tank', kind: 'setup', source: 'aquariumcoop' })
  expect(g?.vi).toMatchObject({ name: 'Dựng bể đầu tiên', body: '<p>Bước 1.</p>', slug: 'dung-be-dau-tien' })
  const piped = writeGuide(page({ kind: 'guide', sections: [], guide: { kind: 'setup', viTitle: 'Cách nuôi Daphnia | Nuôi Daphnia cơ bản', viBody: '<p>x</p>' } }), { source: 'aquariumcoop', url: 'https://www.aquariumcoop.com/blogs/aquarium/daphnia', now: '2026-10-28', takenSlugs: new Set() })
  expect(piped?.vi).toMatchObject({ name: 'Cách nuôi Daphnia', slug: 'cach-nuoi-daphnia' })
})

test('a renamed guide keeps its name, address and old addresses when its source is read again', () => {
  const vi = { slug: 'nuoi-ca-chi', name: 'Nuôi cá chì', altNames: [], sections: {}, body: '<p>x</p>', quality: { score: 1, indexable: true }, nameFixed: true, redirectFrom: [{ slug: 'nuoi-ca-but-chi', name: 'Nuôi cá bút chì' }] }
  const g = writeGuide(page({ kind: 'guide', sections: [], guide: { kind: 'setup', viTitle: 'Nuôi cá bút chì', viBody: '<p>y</p>' } }), { source: 'aquariumcoop', url: 'https://www.aquariumcoop.com/blogs/aquarium/pencilfish', now: '2026-11-07', takenSlugs: new Set(), existing: { vi } })
  expect(g?.vi).toMatchObject({ name: 'Nuôi cá chì', slug: 'nuoi-ca-chi', nameFixed: true, redirectFrom: vi.redirectFrom, body: '<p>y</p>' })
})

test('a source read again keeps a local note and a body fixed by hand; without the mark the body is the new one', () => {
  const localNote = { html: '<h3>Ở Việt Nam</h3><p>x</p>', refs: [{ url: 'https://a.test/', title: 'A' }] }
  const refs = [{ url: 'https://b.test/', title: 'B' }]
  const vi = { slug: 'tao-lam', name: 'Tảo lam', altNames: [], sections: {}, body: '<p>người sửa</p>', quality: { score: 1, indexable: true }, localNote, refs }
  const again = (bodyFixed: boolean) => writeGuide(page({ kind: 'guide', sections: [], guide: { kind: 'setup', viTitle: 'Tảo lam', viBody: '<p>dịch lại</p>' } }), { source: 'aquariumcoop', url: 'https://www.aquariumcoop.com/blogs/aquarium/bga', now: '2026-11-07', takenSlugs: new Set(), existing: { vi: { ...vi, ...(bodyFixed ? { bodyFixed } : {}) } } })
  expect(again(true)?.vi).toMatchObject({ body: '<p>người sửa</p>', bodyFixed: true, localNote, refs })
  expect(again(false)?.vi).toMatchObject({ body: '<p>dịch lại</p>', localNote })
  expect(again(false)?.vi.refs).toBeUndefined()
})

test('vague or phrase-like regions are dropped', () => {
  const r = mergeSpecies({}, page({ places: [
    { continent: 'Europe', country: 'Germany', region: 'mainly western' },
    { continent: 'North America', country: 'United States', region: 'Kentucky (introduced)' },
    { continent: 'Asia', country: 'Thailand', region: 'Samut Sakhon and Samut Songkhram provinces around Mahachai' },
    { continent: 'Asia', country: 'China', region: 'Yangtze' },
  ] }), ctx('seriouslyfish'))
  expect(r.entity.places).toEqual(['europe', 'germany', 'north-america', 'united-states', 'asia', 'thailand', 'china', 'yangtze'])
  expect(ensurePlaces([{ continent: 'Europe', country: 'Italy', region: 'north' }], new Set()).map(p => p.entity.id)).toEqual(['europe', 'italy'])
})

test('an owner-fixed name and its redirects survive every source; a name Seriously Fish replaces stays an alternative name, unless a variety\'s', () => {
  const a = mergeSpecies({}, page({ viName: 'Cá neon vua Super Red' }), ctx('glaser'))
  const sf = mergeSpecies(a, page(), ctx('seriouslyfish'))
  expect(sf.vi.name).toBe('Cá neon vua')
  expect(sf.vi.altNames).not.toContain('Cá neon vua Super Red') // a shop's variety named the page first
  expect(mergeSpecies(mergeSpecies({}, page({ viName: 'Cá neon đỏ' }), ctx('glaser')), page(), ctx('seriouslyfish')).vi.altNames).toContain('Cá neon đỏ')
  const fixed = { ...a, vi: { ...a.vi!, name: 'Cá neon đỏ', slug: 'ca-neon-do', nameFixed: true, redirectFrom: [{ slug: a.vi!.slug, name: 'Cá neon vua Super Red' }] } }
  const b = mergeSpecies(fixed, page(), ctx('seriouslyfish'))
  expect(b.vi).toMatchObject({ name: 'Cá neon đỏ', slug: 'ca-neon-do', nameFixed: true, redirectFrom: [{ slug: 'ca-neon-vua-super-red', name: 'Cá neon vua Super Red' }] })
})

test("a shop listing of one variety adds none of its names to the species', and one name written twice is kept once", () => {
  const sf = mergeSpecies({}, page({ viAltNames: ['Neon đỏ'], enCommonNames: ['Cardinal tetra'] }), ctx('seriouslyfish'))
  const shop = mergeSpecies(sf, page({ viName: 'Cá neon vua Albino', viAltNames: ['Cá neon vua bạch tạng', 'Cá neon đỏ'], enCommonNames: ['Albino Cardinal Tetra', 'Cardinal Tetra'] }), ctx('glaser'))
  expect(shop.vi.altNames).toEqual(['Cá neon đỏ', 'Cardinal tetra'])
})

test("Seriously Fish's name doesn't replace one when another fish already has it (#228)", () => {
  const a = mergeSpecies({}, page({ viName: 'Cá neon vua Super Red' }), ctx('glaser'))
  const sf = mergeSpecies(a, page(), { ...ctx('seriouslyfish'), takenNames: new Set([nameKey('cá neon vua')]) })
  expect(sf.vi.name).toBe('Cá neon vua Super Red')
  expect(sf.vi.altNames).not.toContain('Cá neon vua Super Red')
})

test("a new species doesn't start under another fish's name, even written another way: its scientific name, the source's name kept as another name", () => {
  const r = mergeSpecies({}, page({ viName: 'Cá Neon-Vua' }), { ...ctx('glaser'), takenNames: new Set([nameKey('Cá neon vua')]) })
  expect(r.vi.name).toBe('Cá Paracheirodon axelrodi')
  expect(r.vi.slug).toBe('ca-paracheirodon-axelrodi')
  expect(r.vi.altNames).toContain('Cá Neon-Vua')
  // A free name is taken as it is.
  expect(mergeSpecies({}, page(), { ...ctx('glaser'), takenNames: new Set([nameKey('Cá neon xanh')]) }).vi).toMatchObject({ name: 'Cá neon vua', slug: 'ca-neon-vua' })
})

test("a plant written again keeps its former scientific names (plant-synonyms.ts), in the schema's place", () => {
  const plant = { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte'] } as const
  const first = mergePlant({}, page({ kind: 'plant', scientificName: 'Taxiphyllum barbieri', viName: 'Rêu java', plant: { ...plant, placement: ['epiphyte'] } }), { source: 'tropica', url: 'https://t/p', now: '2026-10-28', takenSlugs: new Set() })!
  expect(first.entity).not.toHaveProperty('synonyms')
  const again = mergePlant({ entity: { ...first.entity, synonyms: ['Vesicularia dubyana'] }, vi: first.vi }, page({ kind: 'plant', scientificName: 'Taxiphyllum barbieri', viName: 'Rêu java', plant: { ...plant, placement: ['epiphyte'] } }), { source: 'aquariumcoop', url: 'https://a/p', now: '2026-11-02', takenSlugs: new Set() })!
  expect(again.entity.synonyms).toEqual(['Vesicularia dubyana'])
  expect(Object.keys(again.entity).slice(0, 3)).toEqual(['id', 'scientificName', 'synonyms'])
})

test("a new plant doesn't start under another plant's name", () => {
  const plant = { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte'] } as const
  const p = mergePlant({}, page({ kind: 'plant', scientificName: 'Anubias barteri var. nana', viName: 'Anubias nana', plant: { ...plant, placement: ['epiphyte'] } }), { source: 'tropica', url: 'https://t/p', now: '2026-10-28', takenSlugs: new Set(), takenNames: new Set([nameKey('Anubias nana')]) })
  expect(p?.vi.name).toBe('Anubias barteri var. nana')
  expect(p?.vi.altNames).toContain('Anubias nana')
})

test('a source page giving one part twice (two quick-facts blocks): one section with both texts, in English and in Vietnamese', () => {
  const r = mergeSpecies({}, page({ sections: [
    { key: 'quickFacts', en: '<p>Wild caught.</p>', vi: '<p>Cá bắt tự nhiên.</p>' },
    { key: 'diet', en: '<p>Worms.</p>', vi: '<p>Giun.</p>' },
    { key: 'quickFacts', en: '<p>Max 3 cm.</p>', vi: '<p>Tối đa 3 cm.</p>' },
  ] }), ctx('glaser'))
  expect(r.entity.sections.filter(s => s.key === 'quickFacts').map(s => s.html)).toEqual(['<p>Wild caught.</p>\n<p>Max 3 cm.</p>'])
  expect(r.vi.sections['quickFacts:glaser']).toBe('<p>Cá bắt tự nhiên.</p>\n<p>Tối đa 3 cm.</p>')
  expect(r.vi.sections['diet:glaser']).toBe('<p>Giun.</p>')
})

// A species page shows each figure once, in its data card (design critique 2026-10-31: Cá chạch bùn listed "Họ: Cobitidae"
// twice, and its quick facts repeated sizes the card showed otherwise). Quick facts keep what the card doesn't carry.
test('quick facts: the figures this page gives the card, and the family, are dropped in English and Vietnamese; a list of nothing else goes', () => {
  const r = mergeSpecies({}, page({ sections: [
    { key: 'quickFacts', en: '<ul><li>Family: Cobitidae</li><li>Temperature: 23–29°C</li><li>Adult size: 3.5 cm</li><li>Life expectancy: 4 years</li></ul>', vi: '<ul><li>Họ: Cobitidae</li><li>Nhiệt độ: 23–29°C</li><li>Kích thước: 3,5 cm</li><li>Tuổi thọ: 4 năm</li></ul>' },
  ] }), ctx('glaser'))
  expect(r.entity.sections.find(s => s.key === 'quickFacts')?.html).toBe('<ul><li>Life expectancy: 4 years</li></ul>')
  expect(r.vi.sections['quickFacts:glaser']).toBe('<ul><li>Tuổi thọ: 4 năm</li></ul>')
  // A figure the page has no card value for (pH here) is its only copy: it stays.
  const only = mergeSpecies({}, page({ sections: [
    { key: 'quickFacts', en: '<ul><li>Family: Cobitidae</li><li>Temperature: 23–29°C</li></ul>', vi: '<ul><li>Họ: Cobitidae</li><li>Nhiệt độ: 23–29°C</li></ul>' },
    { key: 'diet', en: '<ul><li>pH: 6–7</li></ul>', vi: '<ul><li>pH: 6–7</li></ul>' },
  ] }), ctx('glaser'))
  expect(only.entity.sections.map(s => s.key)).toEqual(['diet'])
  expect(Object.keys(only.vi.sections)).toEqual(['diet:glaser'])
  const ph = mergeSpecies({}, page({ sections: [{ key: 'quickFacts', en: '<ul><li>pH: 6–7</li></ul>', vi: '<ul><li>pH: 6–7</li></ul>' }] }), ctx('glaser'))
  expect(ph.vi.sections['quickFacts:glaser']).toBe('<ul><li>pH: 6–7</li></ul>')
})

test('a page read again from a source keeps its water: only the water step changes it', () => {
  const water = { kind: 'brackish' as const, source: 'seriouslyfish' as const, quote: 'it is recommended that a brackish setup is always used' }
  const a = mergeSpecies({}, page(), ctx('seriouslyfish'))
  const b = mergeSpecies({ ...a, entity: { ...a.entity, water } }, page(), ctx('glaser'))
  expect(b.entity.water).toEqual(water)
  expect(Object.keys(b.entity).indexOf('water')).toBe(Object.keys(b.entity).indexOf('places') + 1)
})

test('a page read again from a source keeps its range: only the range step changes it', () => {
  const range = { native: { countries: ['BR'], regions: ['Rio Negro'], sources: ['seriouslyfish' as const] } }
  const a = mergeSpecies({}, page(), ctx('seriouslyfish'))
  const b = mergeSpecies({ ...a, entity: { ...a.entity, range } }, page(), ctx('glaser'))
  expect(b.entity.range).toEqual(range)
  expect(Object.keys(b.entity).indexOf('range')).toBe(Object.keys(b.entity).indexOf('places') + 1)
  expect('range' in mergeSpecies({}, page(), ctx('glaser')).entity).toBe(false)
})

test('a plant is written under its name as hobbyists write it, in its address too; a name a person fixed stays', () => {
  const plant = { difficulty: 1, light: 'low', co2: 'none', growth: 'fast' } as const
  const v = mergePlant({}, page({ kind: 'plant', scientificName: 'Vallisneria', viName: 'Cây thủy sinh Vallisneria (cỏ lươn)', viAltNames: ['Cỏ lươn'], enCommonNames: ['Vallisneria'], plant: { ...plant, placement: ['background'] } }), { source: 'tropica', url: 'https://t/v', now: '2026-10-28', takenSlugs: new Set() })!
  expect([v.vi.name, v.vi.slug, v.vi.altNames]).toEqual(['Vallisneria (cỏ lươn)', 'vallisneria-co-luon', ['Cỏ lươn', 'Vallisneria']])
  const moss = mergePlant({}, page({ kind: 'plant', scientificName: 'Taxiphyllum barbieri', viName: 'Rêu java', viAltNames: ['Rêu java Bogor'], enCommonNames: ['Java moss'], plant: { ...plant, placement: ['background'] } }), { source: 'tropica', url: 'https://t/m', now: '2026-10-28', takenSlugs: new Set() })!
  expect([moss.vi.name, moss.vi.slug, moss.vi.altNames]).toEqual(['Rêu Java', 'reu-java', ['Rêu Java Bogor', 'Java moss']])
  // Written again: an earlier name is tidied with the rest, and its address stays.
  const again = mergePlant({ entity: moss.entity, vi: { ...moss.vi, name: 'Rêu java' } }, page({ kind: 'plant', scientificName: 'Taxiphyllum barbieri', viName: 'Rêu java', plant: { ...plant, placement: ['background'] } }), { source: 'aquariumcoop', url: 'https://a/m', now: '2026-11-07', takenSlugs: new Set() })!
  expect([again.vi.name, again.vi.slug, again.vi.altNames.includes('Rêu java')]).toEqual(['Rêu Java', 'reu-java', false])
  const fixed = mergePlant({ entity: moss.entity, vi: { ...moss.vi, name: 'Rêu java', nameFixed: true } }, page({ kind: 'plant', scientificName: 'Taxiphyllum barbieri', viName: 'Rêu java', plant: { ...plant, placement: ['background'] } }), { source: 'aquariumcoop', url: 'https://a/m', now: '2026-11-07', takenSlugs: new Set() })!
  expect(fixed.vi.name).toBe('Rêu java')
})

test('a figure overruled by two other sources stays overruled on a re-read of the same figure; a new figure is judged again', () => {
  const a = mergeSpecies({}, page({ dataCard: { sizeCm: 12 } }), ctx('seriouslyfish'))
  const overruled = 'Glaser 45 cm and FishBase 42 cm SL agree against it'
  const entity = { ...a.entity, dataCard: { sizeCm: [{ source: 'seriouslyfish' as const, value: 12, overruled }, { source: 'glaser' as const, value: 45 }] } }
  const same = mergeSpecies({ entity, vi: a.vi }, page({ dataCard: { sizeCm: 12 } }), ctx('seriouslyfish'))
  expect(same.entity.dataCard.sizeCm).toEqual([{ source: 'glaser', value: 45 }, { source: 'seriouslyfish', value: 12, overruled }])
  const other = mergeSpecies({ entity, vi: a.vi }, page({ dataCard: { tempC: { min: 24, max: 28 } } }), ctx('glaser'))
  expect(other.entity.dataCard.sizeCm).toEqual([{ source: 'seriouslyfish', value: 12, overruled }])
  const changed = mergeSpecies({ entity, vi: a.vi }, page({ dataCard: { sizeCm: 40 } }), ctx('seriouslyfish'))
  expect(changed.entity.dataCard.sizeCm).toEqual([{ source: 'glaser', value: 45 }, { source: 'seriouslyfish', value: 40 }])
})

test('an L record is kept as keepers write it: from a source, and the one on file (the owner, 2026-11-11)', () => {
  expect(mergeSpecies({}, page({ lNumber: 'L 046' }), ctx('seriouslyfish')).entity.lNumber).toBe('L46')
  const a = mergeSpecies({}, page({ lNumber: 'L027, LDA077' }), ctx('seriouslyfish'))
  expect(a.entity.lNumber).toBe('L27, LDA77')
  expect(mergeSpecies({ ...a, entity: { ...a.entity, lNumber: 'L113' } }, page({ lNumber: 'L234' }), ctx('glaser')).entity.lNumber).toBe('L113')
  expect(mergeSpecies({}, page({ lNumber: 'C020' }), ctx('seriouslyfish')).entity.lNumber).toBe('C020')
})

// The independent read of the lucky bamboo note (2026-11-12): a page with text or figures of ours that cite its `refs` lost
// them when another source was read again, and the schema then refused the page, so the source's update never landed.
// And the source's part, read again, moved below a note of ours set after it.
test('a source read again keeps the page\'s refs, so its own parts still cite them, and its place beside a part of ours', () => {
  const plantCtx = { source: 'aquariumbreeder' as const, url: 'https://aquariumbreeder.com/lucky-bamboo', now: '2026-11-12', takenSlugs: new Set<string>() }
  const plant = page({ kind: 'plant', scientificName: 'Dracaena sanderiana', viName: 'Trúc phát tài', plant: { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['background'] }, sections: [{ key: 'waterConditions', en: '<p>Use RO.</p>', vi: '<p>Dùng RO.</p>' }] })
  const first = mergePlant({}, plant, plantCtx)!
  const ours = { key: 'waterConditions' as const, source: 'aquatome' as const, sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', html: '<p>Our note.</p>', refs: [0], fixed: true as const }
  const refs = [{ url: 'https://aquariumbreeder.com/shrimp-minerals', title: 'Aquarium Breeder: shrimp and minerals' }]
  const vi = { ...first.vi, sections: { ...first.vi.sections, 'waterConditions:aquatome': '<p>Ghi chú.</p>' } }
  const reread = { ...plant, sections: [{ key: 'waterConditions' as const, en: '<p>Use RO, or tap water dechlorinated.</p>', vi: '<p>Dùng RO.</p>' }] }
  const again = mergePlant({ entity: { ...first.entity, sections: [...first.entity.sections, ours], refs }, vi }, reread, plantCtx)!
  expect(() => PlantSchema.parse(again.entity)).not.toThrow()
  expect(again.entity.refs).toEqual(refs)
  expect(again.entity.sections.map(x => `${x.key}:${x.source}`)).toEqual(['waterConditions:aquariumbreeder', 'waterConditions:aquatome'])
  expect(again.entity.sections[0]!.html).toBe('<p>Use RO, or tap water dechlorinated.</p>')
  expect(again.vi.sections['waterConditions:aquatome']).toBe('<p>Ghi chú.</p>')
  // A part of ours set first (a planting how-to) stays first.
  const first2 = mergePlant({ entity: { ...first.entity, sections: [ours, ...first.entity.sections], refs }, vi }, reread, plantCtx)!
  expect(first2.entity.sections.map(x => `${x.key}:${x.source}`)).toEqual(['waterConditions:aquatome', 'waterConditions:aquariumbreeder'])
  // A fish page: a figure of ours on the card cites refs too.
  const fish = mergeSpecies({}, page(), ctx('seriouslyfish'))
  const fishRefs = [{ url: 'https://example.org/paper', title: 'A paper' }]
  const withOurs = { ...fish, entity: { ...fish.entity, dataCard: { ...fish.entity.dataCard, ph: [{ source: 'aquatome' as const, value: { min: 4, max: 6 }, ref: 0 }] }, refs: fishRefs } }
  const fishAgain = mergeSpecies(withOurs, page(), ctx('glaser'))
  expect(() => SpeciesSchema.parse(fishAgain.entity)).not.toThrow()
  expect(fishAgain.entity.refs).toEqual(fishRefs)
})
