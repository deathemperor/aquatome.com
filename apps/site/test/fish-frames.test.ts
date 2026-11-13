import { expect, test } from 'vitest'
import { SUBJECT_FRAMES, type Photo } from '@aq/schema'
import { fishFrame, tileFrame } from '../src/lib/img'
import { fishList, speciesItems } from '../src/lib/list-data'
import { getContent } from '../src/lib/content'

// A fish's frame decides from the fish's box (image-geometry.ts subjectFrame): the centred crop if it keeps the fish,
// else the crop moved onto it, else the photo whole. The switch (SUBJECT_FRAMES) is one constant: off, the loader gives no
// photo a box, and every frame draws today's centred crop.
const photo = (subject?: Photo['subject'], o: Partial<Photo> = {}): Photo =>
  ({ url: 'https://media.aquatome.com/commons/a.webp', thumb: 'https://media.aquatome.com/commons/a-480.webp', width: 1500, height: 1000, ...(subject ? { subject } : {}), ...o }) as Photo

test('the switch is on, as one constant', () => {
  expect(SUBJECT_FRAMES).toBe(true)
})

test('a 4:3 frame of a 3:2 photo: centred, moved onto the fish, or whole', () => {
  expect(fishFrame(photo(), 4 / 3), 'no box').toEqual({})
  expect(fishFrame(photo({ x0: 600, y0: 300, x1: 900, y1: 700 }), 4 / 3), 'in the middle').toEqual({})
  expect(fishFrame(photo({ x0: 0, y0: 300, x1: 600, y1: 700 }), 4 / 3), 'on the left edge').toEqual({ pos: '0% 50%' })
  expect(fishFrame(photo({ x0: 30, y0: 300, x1: 1470, y1: 700 }), 4 / 3), 'longer than the crop').toEqual({ whole: true })
  // The same fish at 16:9, a frame wider than the photo, is cut top and bottom only: it keeps it.
  expect(fishFrame(photo({ x0: 30, y0: 300, x1: 1470, y1: 700 }), 16 / 9)).toEqual({})
})

test('a tile is framed only on a copy that is the same picture', () => {
  const long = { x0: 30, y0: 300, x1: 1470, y1: 700 }
  expect(tileFrame(photo(long))).toEqual({ whole: true, mat: true })
  expect(tileFrame(photo(long, { thumb: 'https://media.aquatome.com/commons/b.webp' })), 'another picture').toEqual({})
})

test('a whole tile\'s strips under 8% of its side each take the mat, 8% or wider the photo blurred (the Design Lead, 12 Nov)', () => {
  // The fish edge to edge across a wide photo, or top to bottom down a tall one: whole on the tile either way.
  const wide = (width: number, height: number) => tileFrame(photo({ x0: 10, y0: 0.3 * height, x1: width - 10, y1: 0.7 * height }, { width, height }))
  const tall = (width: number, height: number) => tileFrame(photo({ x0: 0.3 * width, y0: 10, x1: 0.7 * width, y1: height - 10 }, { width, height }))
  expect(wide(1500, 1000), '3:2, strips 5.6% top and bottom').toEqual({ whole: true, mat: true })
  expect(wide(1000, 640), 'strips 7.3%').toEqual({ whole: true, mat: true })
  expect(wide(1000, 620), 'strips 8.7%').toEqual({ whole: true })
  expect(wide(2000, 1000), '2:1, strips 16.7%').toEqual({ whole: true })
  expect(tall(960, 802), 'the discus\'s shape, strips 5.1% a side').toEqual({ whole: true, mat: true })
  expect(tall(1000, 1000), 'square, strips 12.5% a side').toEqual({ whole: true })
})

test('the fish list\'s data file says how each card frames its photo, as SpeciesCard does', async () => {
  const vi = await getContent('vi')
  const [a, b, c] = vi.species.filter(s => s.photos.length)
  const p = (s: typeof a, subject: Photo['subject']) => ({ ...s!.photos[0]!, width: 1500, height: 1000, subject })
  const items = speciesItems([a!, b!, c!], [p(a, { x0: 30, y0: 300, x1: 1470, y1: 700 }), p(b, { x0: 0, y0: 300, x1: 600, y1: 700 }), p(c, { x0: 600, y0: 300, x1: 900, y1: 700 })])
  expect(items.map(i => [i.photo?.whole, i.photo?.pos])).toEqual([[true, undefined], [undefined, '0% 50%'], [undefined, undefined]])
})

test('the fixture\'s boxed heads frame as the rule says, in the fish list\'s data file (test/engine-state/_photo-boxes.json)', async () => {
  const vi = await getContent('vi')
  const { species, photos } = fishList('vi', vi)
  const items = new Map(speciesItems(species, photos).map(i => [i.slug, i.photo]))
  // A cherry shrimp longer than the 4:3 tile: whole, on the mat (a 3:2 photo's strips are thin). A ram on the photo's left edge: the crop moves there. A discus at the
  // top of a squarer photo: the crop moves up. An angelfish the tile keeps, and a rasbora where no animal was found: as today.
  expect(items.get('tep-red-cherry')).toMatchObject({ whole: true, mat: true })
  expect(items.get('ca-phuong-hoang')).toMatchObject({ pos: '0% 50%' })
  expect(items.get('ca-dia')).toMatchObject({ pos: '50% 0%' })
  for (const slug of ['ca-ong-tien', 'ca-boraras-do']) expect([items.get(slug)?.pos, items.get(slug)?.whole], slug).toEqual([undefined, undefined])
})
