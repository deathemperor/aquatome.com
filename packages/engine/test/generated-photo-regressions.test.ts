import { describe, expect, it } from 'vitest'
import { cleanPhoto, type Photo } from '@aq/schema'
import { rankGallery } from '../src/gallery'
import { headOf, photosFor } from '../src/curation'
import { leadChoice } from '../src/lead-photo'
import { buildCatalog } from '../../../apps/site/worker/fishid/catalog'
import { buildFacts } from '../../../apps/site/worker/fishid/facts'

const real: Photo = { url: 'https://media.aquatome.com/real.webp', width: 800, height: 600, licence: 'CC0', author: 'Source', sourceUrl: 'https://example.org/fish' }
const generated = { ...real, url: 'https://media.aquatome.com/generated.webp', width: 2400, height: 1600, generated: { model: 'gpt-image-2', date: '2026-11-10', prompt: 'fish' } } as Photo

describe('generated pictures never displace real photographs', () => {
  it('chooses a real card thumbnail ahead of a larger generated picture', () => {
    expect(cleanPhoto([generated, real])).toBe(real)
  })
  it('ranks a real album picture ahead of a generated best pick', () => {
    expect(rankGallery([{ ...generated, best: true, kind: 'male' }, real])[0]?.url).toBe(real.url)
  })
  it('gives a generated head back to a real photo as soon as it passes', () => {
    expect(leadChoice([generated], [real], p => p === real, {})).toEqual({ lead: real })
  })
  it('never replaces a real head with a generated picture even if a caller passes it', () => {
    expect(leadChoice([real], [{ ...generated, best: true }], () => true, { [generated.url]: { [real.url]: true } })).toBeUndefined()
  })
})

describe('generated pictures are excluded from recognition and daily cards', () => {
  it('does not offer any generated size for the daily calendar', () => {
    expect(photosFor([generated], () => true)).toEqual({ photo: {}, checked: {} })
    expect(headOf([generated], () => true)).toBeUndefined()
  })
  it('excludes generated pictures from both recognition entry points', () => {
    const page = { id: 'test-fish', scientificName: 'Test fish', photos: [generated, real], sections: [], t: { name: 'Fish', altNames: [], slug: 'fish' } }
    const pages = { species: [page], plants: [], breeds: [] }
    const catalog = buildCatalog([{ lang: 'vi', pages, at: x => x }], p => p.url)
    expect(catalog.entries[0]?.img).toBe(real.url)
    const facts = buildFacts(catalog, pages, p => p.url, { gallery: () => [generated] })
    expect(facts[0]?.photos).toEqual([real.url])
  })
})
