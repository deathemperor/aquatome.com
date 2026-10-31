import { nameKey } from '@aq/schema'
import { expect, test } from 'vitest'
import { ensurePlaces, mergePlant, mergeSpecies, writeGuide } from '../src/merge'
import type { ProcessedPage } from '../src/process'

const taxon = { canonicalName: 'Paracheirodon axelrodi', order: 'Characiformes', family: 'Characidae', genus: 'Paracheirodon', matchType: 'EXACT' }
const page = (over: Partial<ProcessedPage> = {}): ProcessedPage => ({
  kind: 'species', scientificName: 'Paracheirodon axelrodi', synonyms: [], enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: ['Neon đỏ'],
  group: 'tetras', places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }],
  dataCard: { tempC: { min: 23, max: 29 }, sizeCm: 3.5 },
  sections: [{ key: 'habitat', en: '<p>Streams.</p>', vi: '<p>Suối.</p>' }, { key: 'diet', en: '<p>Small.</p>', vi: '<p>Nhỏ.</p>' }],
  productSlots: [{ category: 'thuc-an', keywords: ['thức ăn tetra'] }], ...over,
})
const ctx = (source: 'seriouslyfish' | 'glaser', url = `https://${source}/p`) => ({ source, url, taxon, now: '2026-10-28', takenSlugs: new Set<string>() })

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

test('an owner-fixed name and its redirects survive every source; a name Seriously Fish replaces stays an alternative name', () => {
  const a = mergeSpecies({}, page({ viName: 'Cá neon vua Super Red' }), ctx('glaser'))
  const sf = mergeSpecies(a, page(), ctx('seriouslyfish'))
  expect(sf.vi.name).toBe('Cá neon vua')
  expect(sf.vi.altNames).toContain('Cá neon vua Super Red')
  const fixed = { ...a, vi: { ...a.vi!, name: 'Cá neon đỏ', slug: 'ca-neon-do', nameFixed: true, redirectFrom: [{ slug: a.vi!.slug, name: 'Cá neon vua Super Red' }] } }
  const b = mergeSpecies(fixed, page(), ctx('seriouslyfish'))
  expect(b.vi).toMatchObject({ name: 'Cá neon đỏ', slug: 'ca-neon-do', nameFixed: true, redirectFrom: [{ slug: 'ca-neon-vua-super-red', name: 'Cá neon vua Super Red' }] })
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
