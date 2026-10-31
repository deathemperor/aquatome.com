import type { Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { nativeSpecies } from '../src/lib/home'

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
