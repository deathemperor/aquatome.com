import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CurationSchema, PictureSet, type Photo } from '@aq/schema'
import { appIndex, pagePhoto } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'
import { takeEach, tilePhotos } from '../src/lib/pictures'

// #1772's reader, 21 Nov 2026: the home page's rows checked only a fish's head against the calendar's avoid list, and a
// card whose head another card already shows takes its next photo, which could be one kept off cards.
test("a home row's card never falls back to a photo kept off cards when another card shows its head", () => {
  const photo = (id: string) => ({ url: `https://x/${id}.jpg`, width: 800, height: 600 }) as Photo
  const head = photo('shared-head'), next = photo('kept-off')
  const pick = (avoid: Record<string, string>) => {
    const pics = new PictureSet({})
    pics.add(head.url) // a card above shows the head
    return takeEach(pics, [{ photos: [head, next] }], s => tilePhotos(s.photos, avoid))
  }
  expect(pick({})).toEqual([next])
  expect(pick({ [next.url]: 'a figure plate' })).toEqual([null])
})

test("the home page's featured and native fish read their photos with the list", () => {
  const src = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')
  expect(src.match(/takeEach\(pics, (featured|nativeShown), s => tilePhotos\([^)]*\)\)/g)).toEqual([
    'takeEach(pics, featured, s => tilePhotos(s.photos, avoid))',
    'takeEach(pics, nativeShown, s => tilePhotos(s.photos, avoid))',
  ])
})

// The same reader: a staple the featured row leaves out for its photo came back on Khám phá's longer shelf with it.
test("Khám phá's fish shelf leaves out a fish whose photo the calendar keeps off cards", async () => {
  const vi = await getContent('vi')
  const file = CurationSchema.parse(JSON.parse(readFileSync(new URL('../../../content/curation.json', import.meta.url), 'utf8')))
  const calendar = CurationSchema.parse({ version: 1, weeks: [], days: [], chips: file.chips })
  const before = appIndex('vi', vi, new Map(), vi.species, { calendar, today: '2026-11-14' })
  // A shelf fish the featured row doesn't hold, so the shelf's own list is what must leave it out.
  const path = before.home.browse!.fish.find(p => !before.home.fish.includes(p))!
  const id = before.items.find(i => i.path === path)!.id
  const fish = [...vi.species, ...vi.breeds].find(x => x.id === id)!
  const avoid = { [pagePhoto(fish.photos)!.url]: 'a water surface' }
  const after = appIndex('vi', vi, new Map(), vi.species, { calendar: { ...calendar, avoid }, today: '2026-11-14' })
  expect(after.home.browse!.fish).not.toContain(path)
  // The rest stay, in their order.
  expect(after.home.browse!.fish.filter(p => before.home.browse!.fish.includes(p))).toEqual(before.home.browse!.fish.filter(p => p !== path))
})
