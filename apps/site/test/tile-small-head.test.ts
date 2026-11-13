import { expect, test } from 'vitest'
import { photoFitsCard, photoFitsHead, photoFitsWholeHead, type Photo } from '@aq/schema'
import { tileFrame, tilePhoto } from '../src/lib/img'
import { speciesItems } from '../src/lib/list-data'
import { gridPhotos } from '../src/lib/pictures'
import { getContent } from '../src/lib/content'

// A tile never says "no photo yet" while its page shows a photo (the chief of staff, 13 Nov). On 13 Nov 41 fish tiles on
// /ca/ did: each page's only photos had a dealer's mark cropped off too near the fish for the large cards (photoFitsCard),
// so the tile took none while the page led with one (the loader shows it whole: headFit 'contain'). A tile shows it whole.
// A dealer's shot, its mark cropped off: 1000 by 691 kept of 1200 by 800, the fish near the left and right edges, so a 4:3
// cover crop would cut it.
const crop = { originalWidth: 1200, originalHeight: 800, window: { x0: 100, y0: 50, x1: 1100, y1: 741 }, subject: { x0: 110, y0: 300, x1: 1090, y1: 500 }, margin: 6 }
const cropped = (o: Partial<Photo> = {}): Photo => ({
  url: 'https://media.aquatome.com/processed/tile-small-head.webp', thumb: 'https://media.aquatome.com/processed/tile-small-head-480.webp',
  width: 1000, height: 691, author: 'a dealer', licence: 'cc-by-4.0', sourceUrl: 'https://example.org/fish', source: 'commons',
  altered: [{ method: 'mark-crop', crop }], ...o,
}) as Photo

test('the shot leads its page whole, and the large cards refuse it', () => {
  expect([photoFitsCard(cropped()), photoFitsHead(cropped()), photoFitsWholeHead(cropped())]).toEqual([false, false, true])
})

test('a fish whose only photo the large cards refuse shows that photo on its tile, whole, in the grid and the list\'s data file', async () => {
  const vi = await getContent('vi')
  const fish = { ...vi.species[0]!, photos: [cropped({ headFit: 'contain' })] }
  const [chosen] = gridPhotos(vi, [fish])
  expect(chosen?.url, 'the grid gives the tile its page\'s head').toBe(cropped().url)
  expect(tilePhoto(chosen)?.url, 'SpeciesCard keeps it').toBe(cropped().url)
  // Its strips are 3.9% of the tile's height, under the blur's 8%: on the mat.
  expect(tileFrame(chosen!)).toEqual({ whole: true, mat: true })
  expect(speciesItems([fish], [chosen!])[0]?.photo).toMatchObject({ src: cropped().thumb, whole: true, mat: true })
})

test('a generated picture still never reaches a tile, and a fish with no photo keeps "no photo yet"', async () => {
  const vi = await getContent('vi')
  expect(tilePhoto(cropped({ generated: { model: 'm', driverModel: 'd', referenceHash: 'h', date: '2026-11-13', prompt: 'p' } } as Partial<Photo>))).toBeUndefined()
  const bare = { ...vi.species[0]!, photos: [] }
  expect(gridPhotos(vi, [bare])).toEqual([null])
  expect(speciesItems([bare], [null])[0]?.photo).toBeUndefined()
})
