import type { Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { featuredSpecies, listOrder, nativeSpecies } from '../src/lib/home'

const fish = (id: string, o: { places?: string[]; indexable?: boolean; photo?: boolean } = {}) => ({
  id, places: o.places ?? ['thailand'], sections: [], photos: o.photo === false ? [] : [{ url: `https://x/${id}.jpg` }],
  t: { name: id, quality: { indexable: o.indexable ?? true } },
})

test("the home page's native fish: the language's country, popular fish first, only indexable pages with a photo", () => {
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }, { id: 'indonesia', parent: 'asia', t: { name: 'Indonesia' } }],
    species: [
      fish('akysis-hendricksoni'), fish('trichopodus-trichopterus'), fish('scleropages-formosus'), fish('betta-splendens'),
      fish('rasbora-x', { indexable: false }), fish('rasbora-y', { photo: false }), fish('betta-z', { places: ['indonesia'] }),
    ],
  } as unknown as Content
  const n = nativeSpecies('th', c)
  expect(n.place?.id).toBe('thailand')
  // Staples, then the popular list in its order, then the rest.
  expect(n.species.map(s => s.id)).toEqual(['betta-splendens', 'scleropages-formosus', 'trichopodus-trichopterus', 'akysis-hendricksoni'])
  expect(n.count).toBe(6)
  expect(nativeSpecies('id', c).species.map(s => s.id)).toEqual(['betta-z'])
})

const card = { tempC: [{ source: 'seriouslyfish', value: { min: 24, max: 28 } }], ph: [{ source: 'seriouslyfish', value: { min: 6, max: 7.5 } }], sizeCm: [{ source: 'seriouslyfish', value: 5 }], tankCm: [{ source: 'seriouslyfish', value: 60 }] }
const sp = (id: string, dataCard: object = card) => ({ ...fish(id), dataCard })

test('home features only species with a full data card while there are enough, staples first', () => {
  // Angelfish is a staple with only its size known: it waits until no complete species is left.
  const c = { species: [sp('pterophyllum-scalare', { sizeCm: card.sizeCm }), sp('betta-splendens'), sp('rasbora-x'), sp('rasbora-y', { tempC: card.tempC, ph: card.ph, sizeCm: card.sizeCm })] } as unknown as Content
  expect(featuredSpecies('th', c, 2).map(s => s.id)).toEqual(['betta-splendens', 'rasbora-x'])
  expect(featuredSpecies('th', c, 4).map(s => s.id)).toEqual(['betta-splendens', 'rasbora-x', 'pterophyllum-scalare', 'rasbora-y'])
  // The full species list keeps its order: well-known first, whatever their card.
  expect(listOrder('th', c).map(s => s.id).slice(0, 2)).toEqual(['betta-splendens', 'pterophyllum-scalare'])
})
