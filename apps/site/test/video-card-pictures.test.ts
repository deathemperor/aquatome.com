import { expect, test } from 'vitest'
import type { Content, GuideEntity, Photo } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { plantParts } from '../src/lib/plant-page'

// The live checks (2026-11-08): two video guides of one channel each kept a copy of the same photo of a canister filter,
// and a fern's page showed it on both cards. The page now chooses its video cards' pictures with the rest, none twice.
test("a page's video guide cards never show one picture twice: a card takes its guide's next one", async () => {
  const c0 = await getContent('vi')
  const p = c0.plants[0]!
  const [g1, g2] = c0.guides.filter(g => g.video)
  const photo = (url: string) => ({ url, thumb: url, width: 960, height: 540, licence: 'x', author: 'x', sourceUrl: 'x' }) as Photo
  const a = photo('https://media.example/video/a/filter.webp')
  const b = photo('https://media.example/video/b/filter.webp')
  const next = photo('https://media.example/video/b/next.webp')
  // Both name the plant; the newer first.
  const guides = c0.guides.map(g => (g.id === g1!.id ? { ...g, mentions: [p.id], updatedAt: '2026-11-02', photos: [a] }
    : g.id === g2!.id ? { ...g, mentions: [p.id], updatedAt: '2026-11-01', photos: [b, next] } : g)) as GuideEntity[]
  // Two files, one picture.
  const c = { ...c0, guides, pictureHashes: { ...c0.pictureHashes, [a.url]: '0f1e2d3c4b5a6978', [b.url]: '0f1e2d3c4b5a6978' } } as Content
  const { videoGuides, videoPhotos } = plantParts('vi', c, p)
  expect(videoGuides.map(g => g.id)).toEqual([g1!.id, g2!.id])
  expect(videoPhotos).toEqual([a, next])
})
