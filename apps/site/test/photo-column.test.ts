import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { GALLERY_COLUMN, GALLERY_STRIP } from '../src/lib/gallery'
import { pagePictures } from '../src/lib/pictures'
import { speciesParts } from '../src/lib/species-page'

// On a tall computer screen a fish page's photo column fills with its gallery's photos after the strip (lib/pictures.ts
// morePhotos, GalleryStrip.astro `more`). Cá neon vua's gallery has 45 photos, the fish's own photo among them (#a19);
// here two more of them also go between its sections, as the engine's pages often have it.
test('the photo column\'s further thumbnails: the gallery in order, none the page shows elsewhere; the app\'s copy as before', async () => {
  const c0 = await getContent('vi')
  const s0 = c0.species.find(x => x.id === 'paracheirodon-axelrodi')!
  const { gallery } = await speciesParts('vi', c0, s0)
  const s = { ...s0, photos: [...s0.photos, gallery[10]!, gallery[12]!] }
  const c = { ...c0, species: c0.species.map(x => (x.id === s.id ? s : x)) } as Content
  const p = await speciesParts('vi', c, s)

  // The photos between the sections are the fish's own, as without the column: it takes only what is left.
  expect(p.figures).toEqual(s.photos.slice(1))
  // Each keeps its place in the gallery (its #aN on the gallery page), after the strip's 8.
  expect(p.strip).toHaveLength(GALLERY_STRIP)
  p.more.forEach((x, i) => x && expect(x, `#a${GALLERY_STRIP + i + 1}`).toBe(p.gallery[GALLERY_STRIP + i]))
  // None the page shows elsewhere, none twice: the fish's photo (#a19) and the two between the sections (#a11, #a13) are left out.
  const seen = pagePictures(c)
  for (const x of [s.photos[0], ...p.figures, ...p.breedPhotos, ...p.strip]) seen.add(x?.url)
  for (const x of p.more) if (x) { expect(seen.has(x.url), x.url).toBe(false); seen.add(x.url) }
  expect(p.more.flatMap((x, i) => (x ? [] : [GALLERY_STRIP + i + 1]))).toEqual([11, 13, 19])
  // As many as the column holds at most, with the strip's.
  expect(p.strip.filter(Boolean).length + p.more.filter(Boolean).length).toBe(GALLERY_COLUMN)

  // The app's copy shows the strip alone, and the photos between the sections (protocols/page-vectors.json holds the rest).
  const d = await fishDoc('vi', c, s, listedPaths('vi', c))
  const g = d.blocks.find(b => b.t === 'gallery')
  expect(g?.t === 'gallery' && g.strip).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(d.blocks.flatMap(b => (b.t === 'figure' ? [b.img.src] : []))).toEqual(s.photos.slice(1).map(x => x.url))

  // A fish with too few photos for a strip has no column to fill.
  expect((await speciesParts('vi', c0, c0.species.find(x => x.id === 'paracheirodon-innesi')!)).more).toEqual([])
})
