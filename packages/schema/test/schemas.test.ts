import { expect, test } from 'vitest'
import { SECTION_LABELS, SECTION_ORDER, SpeciesSchema, TranslationSchema } from '../src/index'

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
