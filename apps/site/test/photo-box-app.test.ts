import { expect, test } from 'vitest'
import { boxFractions, CurationSchema, type Content, type Photo } from '@aq/schema'
import { appIndex } from '../src/lib/app-index'
import { appPages, fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { smallSrc } from '../src/lib/img'

// Where the fish is in a photo (`box`, `imgBox`: protocols/photo-crop-vectors.json) reaches the app only from photos the
// loader gave a box, which only its switch does (image-geometry.ts SUBJECT_FRAMES, off): until then the app's index and
// pages are as they were. With a box: a fish's page top, its list tile, its group's tile, Hôm nay's day and Khám phá's
// top card carry it.
const boxKeys = (o: unknown) => JSON.stringify(o).match(/"(?:imgBox|box)":/g) ?? []
const today = '2026-11-12'
// The calendar names pictures on our media host.
const media = (name: string) => `https://media.aquatome.com/commons/${name}.webp`
const calendarOf = (days: { fish: string; img: string }[], hero: { page: string; img: string }[]) => CurationSchema.parse({
  version: 1, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'Tuần' }, hero }], days: days.map(d => ({ date: today, ...d })),
})

test('with no photo boxed, as with the switch off, the app\'s index and pages carry no box', async () => {
  const vi = await getContent('vi')
  const s = vi.species.find(x => x.photos.length)!
  for (const lang of ['vi', 'id'] as const) {
    const c = await getContent(lang)
    const calendar = calendarOf([{ fish: `species/${s.id}`, img: media('a') }], [{ page: `species/${s.id}`, img: media('a') }])
    expect(c.species.flatMap(x => x.photos).some(p => p.subject), 'the fixture has no box').toBe(false)
    expect(boxKeys(appIndex(lang, c, new Map(), vi.species, { calendar, today })), lang).toEqual([])
  }
  expect(boxKeys(await appPages('vi', vi))).toEqual([])
}, 120_000)

test('a boxed fish photo carries its box on its page top, its tile, its group\'s tile, its day and its top card; a large copy of another shape does not', async () => {
  const vi = await getContent('vi')
  const listed = appIndex('vi', vi).items.filter(i => i.kind === 'fish' && i.img && i.sub)
  const [a, b] = listed.map(i => vi.species.find(s => s.id === i.id)!).filter(Boolean)
  const boxed = (s: typeof a, large: (p: Photo, i: number) => Photo['large']): typeof a => ({
    ...s!, photos: s!.photos.map((p, i) => ({ ...p, subject: { x0: Math.round(p.width * 0.25), y0: Math.round(p.height * 0.2), x1: Math.round(p.width * 0.75), y1: Math.round(p.height * 0.8) }, large: large(p, i) })),
  })
  // a's large copy is the same picture, twice the size; b's is another framing (a square crop).
  const A = boxed(a, (p, i) => ({ url: media(`a-${i}-large`), width: p.width * 2, height: p.height * 2 }))
  const B = boxed(b, (p, i) => ({ url: media(`b-${i}-large`), width: p.width * 2, height: p.width * 2 }))
  const c: Content = { ...vi, species: vi.species.map(s => (s.id === A.id ? A : s.id === B.id ? B : s)) }
  const box = boxFractions(A.photos[0]!)!
  expect(box).toEqual({ x: expect.closeTo(0.25, 2), y: expect.closeTo(0.2, 2), w: expect.closeTo(0.5, 2), h: expect.closeTo(0.6, 2) })
  const calendar = calendarOf(
    [{ fish: `species/${A.id}`, img: A.photos[0]!.large!.url }, { fish: `species/${B.id}`, img: B.photos[0]!.large!.url }],
    [{ page: `species/${A.id}`, img: A.photos[0]!.large!.url }],
  )
  const ix = appIndex('vi', c, new Map(), c.species, { calendar, today })
  expect(ix.items.find(i => i.id === A.id)!.imgBox).toEqual(box)
  expect(ix.home.days!.map(d => d.imgBox)).toEqual([box, undefined])
  expect(ix.home.hero![0]!.imgBox).toEqual(box)
  // A plant, a guide or an unboxed fish carries none.
  expect(ix.items.filter(i => i.imgBox).map(i => i.id).sort()).toEqual([A.id, B.id].sort())
  const doc = await fishDoc('vi', c, A, listedPaths('vi', c))
  expect(doc.lead?.box).toEqual(box)
  // Its group's tile, where the group's photo is one of these.
  for (const g of ix.home.groups.filter(g => g.imgBox)) expect([A, B].some(s => s.photos.some(p => smallSrc(p) === g.img)), g.id).toBe(true)
})
