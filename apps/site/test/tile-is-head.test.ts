import { expect, test } from 'vitest'
import type { Photo } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { tileFrame, tilePhoto } from '../src/lib/img'
import { gridPhotos, tilePhotos } from '../src/lib/pictures'

// A fish's tile shows its page's head (the owner's reports from their phone, 13 Nov; the Design Lead's ruling, 17:03).
// Before, a tile took the first photo the large cards like best, so 59 fish whose head is wider than 2.2:1 showed a
// squarer later photo on their tile while their page led with the strip.
const photo = (name: string, width: number, height: number) => ({ url: `https://media.aquatome.com/commons/${name}.webp`, thumb: `https://media.aquatome.com/commons/${name}-480.webp`, width, height, author: 'a', licence: 'cc-by-4.0', sourceUrl: 'https://example.org', source: 'commons' }) as Photo

test("the swordtail's case: a head that is a strip is the tile's photo, shown whole, not the squarer photo after it", () => {
  // The swordtail's head and its box, as the engine records them (13 Nov): the fish runs almost the strip's length.
  const strip = { ...photo('strip', 960, 349), subject: { x0: 47, y0: 95, x1: 931, y1: 316 } } as Photo, squarer = photo('squarer', 960, 493)
  const card = tilePhoto(tilePhotos([strip, squarer])[0])
  expect(card?.url).toBe(strip.url)
  expect(tileFrame(card!)).toEqual({ whole: true })
  // Where another tile on the list already shows the head, the tile takes the next.
  expect(tilePhotos([strip, squarer]).map(p => p.url)).toEqual([strip.url, squarer.url])
})

// The Design Lead, 13 Nov: a photo carrying a source's banner stays on its page, after the head, but is never a tile.
test("a photo with a source's banner is never a tile's next photo, where another tile already shows the head", () => {
  const head = photo('head', 960, 640), banner = { ...photo('banner', 960, 640), source: 'glaser' } as Photo
  const cropped = { ...banner, url: 'https://media.aquatome.com/glaser/cropped.webp', altered: [{ method: 'mark-crop' }] } as unknown as Photo
  expect(tilePhotos([head, banner]).map(p => p.url)).toEqual([head.url])
  expect(tilePhotos([head, banner, cropped]).map(p => p.url)).toEqual([head.url, cropped.url])
})

test('a generated picture is never a tile\'s photo, and a fish with none has no tile photo', () => {
  const generated = { ...photo('made', 1200, 900), generated: { model: 'x' } } as unknown as Photo
  expect(tilePhotos([generated]).length).toBe(0)
  expect(tilePhotos([]).length).toBe(0)
})

test("every fish's and breed's tile in a grid shows its page's head, where no other tile in the grid shows that picture", async () => {
  const vi = await getContent('vi')
  for (const x of [...vi.species, ...vi.breeds]) {
    const [chosen] = gridPhotos(vi, [x])
    expect(chosen?.url ?? null, x.id).toBe(x.photos.find(p => !p.generated)?.url ?? null)
  }
}, 120_000)
