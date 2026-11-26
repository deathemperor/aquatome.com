import { expect, test } from 'vitest'
import { GallerySchema, isAllowedLicence } from '@aq/schema'
import { openverseLicence, openversePage } from '../src/openverse'

test('Openverse licences: CC0, CC BY, CC BY-SA and the public domain mark, with their version; nothing else', () => {
  expect(openverseLicence('by', '2.0')).toBe('CC BY 2.0')
  expect(openverseLicence('by-sa', '4.0')).toBe('CC BY-SA 4.0')
  expect(openverseLicence('cc0', '1.0')).toBe('CC0 1.0')
  expect(openverseLicence('pdm', '1.0')).toBe('Public Domain Mark 1.0')
  for (const l of ['by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd', 'sampling+', 'nc-sampling+']) expect(openverseLicence(l, '2.0')).toBeUndefined()
  for (const l of ['CC BY 2.0', 'CC BY-SA 4.0', 'CC0 1.0', 'Public Domain Mark 1.0']) expect(isAllowedLicence(l)).toBe(true)
})

const hit = (id: string, o: object = {}) => ({ id, url: `https://live.staticflickr.com/8518/86007094${id.length}_7a79b898cf_b.jpg`, creator: ' hydril ', license: 'by', license_version: '2.0', foreign_landing_url: `https://www.flickr.com/photos/27126711@N00/86007094${id.length}`, width: 1024, height: 683, source: 'flickr', ...o })

test('a page: Flickr only, by the exact name, open licences, ≥ 800 px, not mature; credited to the photographer; the next page', async () => {
  const urls: string[] = []
  const api = async (u: string) => {
    urls.push(u)
    return { json: { page_count: 3, results: [hit('a', { title: ' A sample fish in a planted tank ' }), hit('bb', { license: 'by-nc' }), hit('ccc', { width: 500, height: 333 }), hit('dddd', { mature: true }), hit('eeeee', { url: 'https://example.org/x.jpg' }), hit('ffffff', { source: 'wikimedia' })] }, remaining: 150 }
  }
  const p = await openversePage('Paracheirodon innesi', 1, api)
  const q = new URL(urls[0]!).searchParams
  expect(Object.fromEntries(q)).toEqual({ q: '"Paracheirodon innesi"', license: 'by,by-sa,cc0,pdm', mature: 'false', page_size: '20', page: '1' })
  expect(p.cands).toEqual([{
    key: 'flickr:860070941', url: 'https://live.staticflickr.com/8518/860070941_7a79b898cf_b.jpg', thumb: 'https://live.staticflickr.com/8518/860070941_7a79b898cf_z.jpg',
    width: 1024, height: 683, licence: 'CC BY 2.0', author: 'hydril', sourceUrl: 'https://www.flickr.com/photos/27126711@N00/860070941', openverse: 'a',
  }])
  // The title comes beside the candidates, for a person choosing by it (the glossary search), and never on a candidate,
  // which the album step keeps as it is.
  expect(p.titles).toEqual({ 'flickr:860070941': 'A sample fish in a planted tank' })
  expect(p).toMatchObject({ next: 2, remaining: 150 })
  expect((await openversePage('x', 3, api)).next).toBeNull()
})

test("Openverse's record id stays in the engine: an album file written from such a candidate drops it", () => {
  const photo = { url: 'https://media.aquatome.com/flickr/1.webp', width: 1200, height: 800, licence: 'CC BY 2.0', author: 'x', sourceUrl: 'https://www.flickr.com/photos/x/1', openverse: 'a' }
  expect(GallerySchema.parse({ id: 'g', photos: [photo], seen: 1, updatedAt: '2026-11-16' }).photos[0]).not.toHaveProperty('openverse')
})
