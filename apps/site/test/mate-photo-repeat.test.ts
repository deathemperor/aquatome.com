import { expect, test } from 'vitest'
import type { Content, GuideEntity, Photo } from '@aq/schema'
import { matePhoto } from '../src/lib/companions'
import { getContent } from '../src/lib/content'
import { speciesParts } from '../src/lib/species-page'

// The live checks (2026-11-19): the Sterba's corydoras page showed the angelfish's photo twice, as its picture under
// "Tránh" and as the picture of an angelfish video guide's card, which has no photo of its own and took the fish's. A
// tank mate's picture is one the page shows, so a video card takes its guide's next one.
test("a fish page's video card never shows a tank mate's picture again: it takes its guide's next one", async () => {
  const c0 = await getContent('vi')
  let found: { s: Content['species'][number]; mate: Photo } | undefined
  for (const s of c0.species) {
    const { mates, showMates } = await speciesParts('vi', c0, s)
    const m = showMates ? [...mates.avoid, ...mates.good].map(x => matePhoto(x.s)).find(Boolean) : undefined
    if (m) { found = { s, mate: m }; break }
  }
  expect(found, 'a fixture fish with a tank mate that has a photo').toBeDefined()
  const { s, mate } = found!
  const g1 = c0.guides.find(g => g.video)!
  const next = { url: 'https://media.example/video/g/next.webp', thumb: 'https://media.example/video/g/next.webp', width: 960, height: 540, licence: 'x', author: 'x', sourceUrl: 'x' } as Photo
  const guides = c0.guides.map(g => (g.id === g1.id ? { ...g, mentions: [`species:${s.id}`, s.id], photos: [mate, next] } : g)) as GuideEntity[]
  const { videoGuides, videoPhotos } = await speciesParts('vi', { ...c0, guides } as Content, s)
  const at = videoGuides.findIndex(g => g.id === g1.id)
  expect(at).toBeGreaterThanOrEqual(0)
  expect(videoPhotos[at]?.url).toBe(next.url)
})
