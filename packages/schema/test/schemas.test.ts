import { expect, test } from 'vitest'
import { GuideSchema, SECTION_LABELS, SECTION_ORDER, SourcesSchema, SpeciesSchema, TranslationSchema } from '../src/index'

const minimal = {
  id: 'paracheirodon-axelrodi', scientificName: 'Paracheirodon axelrodi', order: 'Characiformes', family: 'Characidae',
  genus: 'Paracheirodon', group: 'tetras', places: [], dataCard: {}, sections: [], photos: [], videos: [], productSlots: [],
  updatedAt: '2026-10-28',
}
test('minimal species parses', () => { expect(SpeciesSchema.parse(minimal).id).toBe('paracheirodon-axelrodi') })
test('species without scientificName throws', () => {
  const { scientificName: _, ...bad } = minimal
  expect(() => SpeciesSchema.parse(bad)).toThrow()
})
test('section with unknown source throws', () => {
  expect(() => SpeciesSchema.parse({ ...minimal, sections: [{ key: 'habitat', source: 'wikipedia', sourceUrl: 'x', html: 'y' }] })).toThrow()
})
test('translation parses', () => {
  expect(TranslationSchema.parse({ slug: 'ca-neon-vua', name: 'Cá neon vua', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }).slug).toBe('ca-neon-vua')
})
test('section order follows Seriously Fish and every key has a vi label', () => {
  expect(SECTION_ORDER).toEqual(['quickFacts', 'beforeYouBuy', 'distribution', 'habitat', 'aquariumSize', 'maintenance', 'waterConditions', 'equipment', 'diet', 'behaviour', 'dimorphism', 'reproduction', 'notes', 'references'])
  for (const k of SECTION_ORDER) expect(SECTION_LABELS.vi[k]).toBeTruthy()
  expect(SECTION_LABELS.vi.dimorphism).toBe('Phân biệt đực cái')
})
test('a source cannot be published without a permission record', () => {
  expect(() => SourcesSchema.parse({ glaser: { name: 'G', homepage: 'h', publish: true } })).toThrow(/permission/)
  expect(SourcesSchema.parse({ glaser: { name: 'G', homepage: 'h', publish: false } }).glaser?.publish).toBe(false)
})
test('the real sources.json parses, Facebook source included with a permission record', async () => {
  const { readFile } = await import('node:fs/promises')
  const raw = JSON.parse(await readFile(new URL('../../../content/sources.json', import.meta.url), 'utf8'))
  const s = SourcesSchema.parse(raw)
  expect(s['facebook-jim']).toMatchObject({ name: 'Jim Cumming (Facebook)', publish: true })
  expect(s['facebook-jim']?.permission?.scope).toContain('photos')
})
test("a guide photo keeps its section's heading in a language the site doesn't serve yet", () => {
  const photo = { url: 'https://m/1.webp', width: 1200, height: 800, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x', section: { vi: 'Lọc', id: 'Filter', ms: 'Penapis' } }
  const g = GuideSchema.parse({ id: 'g', kind: 'care', source: 'aquariumcoop', sourceUrl: 'https://x', html: '', photos: [photo], mentions: [], updatedAt: '2026-11-06' })
  expect(g.photos[0]!.section).toEqual({ vi: 'Lọc', id: 'Filter', ms: 'Penapis' })
})

test("a card: an event names its event, a product card its product, and no window ends before it starts; the gate's held is kept", async () => {
  const { CardSchema, CardTextSchema } = await import('../src/index')
  const base = { id: 'x', type: 'trivia', sources: [{ url: 'https://example.org/a', title: 'A', publisher: 'P', date: '2026-11-01', accessed: '2026-11-08' }], show: { from: '2026-11-10', until: '2026-11-20' }, updatedAt: '2026-11-08' }
  expect(CardSchema.safeParse(base).success).toBe(true)
  for (const bad of [{ type: 'event' }, { type: 'product' }, { show: { from: '2026-11-10', until: '2026-11-01' } }, { sources: [] }, { type: 'quiz' }, { about: ['places/hanoi'] }, { event: { start: '2026-11-16', end: '2026-11-15', place: 'x', country: 'VN', organiser: 'y' } }]) expect(CardSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false)
  expect(CardSchema.safeParse({ ...base, type: 'product', product: 'products/a-heater' }).success).toBe(true)
  // A source is dated as precisely as it is: a paper often only by its year.
  for (const date of ['1998', '2024-06', '2025-07-23']) expect(CardSchema.safeParse({ ...base, sources: [{ ...base.sources[0], date }] }).success, date).toBe(true)
  for (const date of ['98', '2024-6', 'n.d.']) expect(CardSchema.safeParse({ ...base, sources: [{ ...base.sources[0], date }] }).success, date).toBe(false)
  const held = { checks: ['words'], at: '2026-11-08T00:00:00Z' }
  expect(CardTextSchema.parse({ eyebrow: 'e', title: 't', body: '<p>b</p>', held }).held).toEqual(held)
  // The eyebrow and title fit Hôm nay's card at the largest text size.
  expect(CardTextSchema.safeParse({ eyebrow: 'e'.repeat(24), title: 't'.repeat(70), body: '<p>b</p>' }).success).toBe(true)
  expect(CardTextSchema.safeParse({ eyebrow: 'e'.repeat(25), title: 't', body: '<p>b</p>' }).success).toBe(false)
  expect(CardTextSchema.safeParse({ eyebrow: 'e', title: 't'.repeat(71), body: '<p>b</p>' }).success).toBe(false)
})

test("the calendar names a card for a day in the story's place, never both", async () => {
  const { CurationSchema } = await import('../src/index')
  const cal = (day: object) => CurationSchema.safeParse({ version: 1, weeks: [], days: [{ date: '2026-11-10', ...day }] }).success
  expect(cal({ card: 'cards/trivia-betta' })).toBe(true)
  expect(cal({ card: 'guides/x' })).toBe(false)
  expect(cal({ card: 'cards/trivia-betta', story: { page: 'guides/x' } })).toBe(false)
})
