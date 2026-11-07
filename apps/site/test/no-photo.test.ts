import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { speciesParts } from '../src/lib/species-page'

// The engine's photo check can take a fish's last photo off its page, and its gallery's (a dead fish at a market, a logo:
// packages/engine/src/photo-check.ts). The page then shows the header without a photo ("bare", pages/ca/[slug].astro),
// no strip and no photo between the sections; the app's copy has no lead picture. 417 live pages had no photo on 2026-11-05.
test('a fish page left with no photo and no gallery is still put together, for the site and the app', async () => {
  const c0 = await getContent('vi')
  const s0 = c0.species.find(x => x.id === 'paracheirodon-axelrodi')!
  expect(s0.photos.length).toBeGreaterThan(0)
  expect(c0.galleries[s0.id]?.length).toBeGreaterThan(0)
  const s = { ...s0, photos: [] }
  const galleries = { ...c0.galleries }
  delete galleries[s0.id]
  const c = { ...c0, species: c0.species.map(x => (x.id === s.id ? s : x)), galleries } as Content

  const p = await speciesParts('vi', c, s)
  expect({ gallery: p.gallery, strip: p.strip, more: p.more, figures: p.figures }).toEqual({ gallery: [], strip: [], more: [], figures: [] })
  expect(p.jumps.filter(j => j.end)).toEqual([]) // no chip for the photos: nothing to open or go to

  const d = await fishDoc('vi', c, s, listedPaths('vi', c))
  expect(d).not.toHaveProperty('lead')
  expect(d.blocks.filter(b => b.t === 'gallery' || b.t === 'figure')).toEqual([])
  expect(d.blocks.length).toBeGreaterThan(0)
})
