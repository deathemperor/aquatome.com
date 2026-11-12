import { expect, test } from 'vitest'
import { boxFractions, CurationSchema, type Content, type Photo } from '@aq/schema'
import { appIndex } from '../src/lib/app-index'
import { appPages, fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { groupTiles } from '../src/lib/home'
import { smallSrc } from '../src/lib/img'

// Where the fish is in a photo (`box`, `imgBox`: protocols/photo-crop-vectors.json) reaches the app only from photos the
// loader gave a box, which only its switch does (image-geometry.ts SUBJECT_FRAMES): a photo without one, as every photo
// with the switch off (and the fixture's, which has no record), leaves the app's index and pages as they were. With a box: a fish's page top, its list tile, its group's tile, Hôm nay's day and Khám phá's
// top card carry it, and only on copies that are the same picture.
const BOX_KEYS = new Set(['box', 'imgBox'])
const boxKeys = (o: unknown) => JSON.stringify(o).match(/"(?:imgBox|box)":/g) ?? []
/** The output without its boxes: what it was before. */
const strip = (o: unknown): unknown => Array.isArray(o) ? o.map(strip)
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !BOX_KEYS.has(k)).map(([k, v]) => [k, strip(v)])) : o
const today = '2026-11-12'
// The calendar names pictures on our media host.
const media = (name: string) => `https://media.aquatome.com/commons/${name}.webp`
const calendarOf = (days: { fish: string; img: string }[], hero: { page: string; img: string }[]) => CurationSchema.parse({
  version: 1, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'Tuần' }, hero }], days: days.map((d, i) => ({ date: `2026-11-${12 + i}`, ...d })),
})
const subject = (p: Photo) => ({ x0: Math.round(p.width * 0.25), y0: Math.round(p.height * 0.2), x1: Math.round(p.width * 0.75), y1: Math.round(p.height * 0.8) })
/** Listed fish with a picture: `fish`, none of them a group's picture; `tile`, a group's tile whose picture is `a`'s. */
async function listedFish() {
  const vi = await getContent('vi')
  const listed = appIndex('vi', vi).items.filter(i => i.kind === 'fish' && i.img && i.sub).flatMap(i => vi.species.filter(s => s.id === i.id))
  const tiles = groupTiles('vi', vi).filter(g => g.photo)
  const tile = tiles.find(g => listed.some(s => s.photos.some(p => p.url === g.photo!.url)))!
  const a = listed.find(s => s.photos.some(p => p.url === tile.photo!.url))!
  return { vi, tile, a, fish: listed.filter(s => !s.photos.some(p => tiles.some(g => g.photo!.url === p.url))) }
}

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

test('a boxed fish photo carries its box on its page top, tile, group tile, day and top card, and on no copy of another framing; nothing else changes', async () => {
  const { vi, tile, a, fish } = await listedFish()
  const [b, c, d] = fish
  // Large copies: a's twice the size; b's exactly 1% wider (the same picture still); c's 1.5% wider (another framing). d's
  // small copy is another picture, not a resize of it.
  const large: Record<string, (p: Photo, i: number) => Photo['large']> = {
    [a.id]: (p, i) => ({ url: media(`a-${i}`), width: p.width * 2, height: p.height * 2 }),
    [b!.id]: (p, i) => ({ url: media(`b-${i}`), width: p.width * 2 * 1.01, height: p.height * 2 }),
    [c!.id]: (p, i) => ({ url: media(`c-${i}`), width: p.width * 2 * 1.015, height: p.height * 2 }),
  }
  const build = (boxed: boolean): Content => ({
    ...vi, species: vi.species.map(s => !large[s.id] && s.id !== d!.id ? s : {
      ...s, photos: s.photos.map((p, i) => ({ ...p, ...(large[s.id] ? { large: large[s.id]!(p, i) } : { thumb: media('d-reframed') }), ...(boxed ? { subject: subject(p) } : {}) })),
    }),
  })
  const plain = build(false), boxed = build(true)
  const of = (c: Content, id: string) => c.species.find(s => s.id === id)!
  const [A, B, C] = [a, b!, c!].map(s => of(boxed, s.id))
  const head = (s: typeof A) => boxFractions(s!.photos[0]!)!
  const calendar = calendarOf([A, B, C].map(s => ({ fish: `species/${s!.id}`, img: s!.photos[0]!.large!.url })), [{ page: `species/${A!.id}`, img: A!.photos[0]!.large!.url }])
  const ix = appIndex('vi', boxed, new Map(), boxed.species, { calendar, today })
  // Adding boxes adds only boxes.
  expect(strip(ix)).toEqual(appIndex('vi', plain, new Map(), plain.species, { calendar, today }))
  // The tiles of a, b and c carry their lead photo's box; d's small copy is another picture: none; no other fish has one.
  expect(ix.items.filter(i => i.imgBox).map(i => i.id).sort()).toEqual([A!.id, B!.id, C!.id].sort())
  for (const s of [A, B, C]) {
    const i = ix.items.find(x => x.id === s!.id)!
    expect(i.imgBox, s!.id).toEqual(boxFractions(s!.photos.find(p => smallSrc(p) === i.img)!))
  }
  // Hôm nay's days: a's large copy and b's (1% off) carry the box; c's (1.5% off) none. Khám phá's top card: a's.
  expect(ix.home.days!.map(x => x.imgBox)).toEqual([head(A), head(B), undefined])
  expect(ix.home.hero![0]!.imgBox).toEqual(head(A))
  // a's group tile carries its photo's box, and no other group's does.
  expect(ix.home.groups.filter(g => g.imgBox)).toEqual([{ id: tile.group, img: smallSrc(tile.photo!), imgBox: boxFractions(A!.photos.find(p => p.url === tile.photo!.url)!) }])
  // The page's top photo; nothing else on the page changes.
  const page = await fishDoc('vi', boxed, A!, listedPaths('vi', boxed))
  expect(page.lead?.box).toEqual(head(A))
  expect(strip(page)).toEqual(await fishDoc('vi', plain, of(plain, A!.id), listedPaths('vi', plain)))
})

test('an address is a photo\'s own first; one two photos\' copies claim with different boxes carries none', async () => {
  const { vi, fish } = await listedFish()
  const [e, f, g, h] = fish
  const at = (x0: number) => ({ x0, y0: 0, x1: x0 + 10, y1: 10 })
  const edit: Record<string, (p: Photo) => Photo> = {
    // e's head is at media('e'); f's large copy, the same shape as f's, claims that address with another box.
    [e!.id]: p => ({ ...p, url: media('e'), thumb: media('e'), width: 100, height: 100, subject: at(0) }),
    [f!.id]: p => ({ ...p, width: 100, height: 100, subject: at(50), large: { url: media('e'), width: 200, height: 200 } }),
    // g's and h's large copies claim one address with different boxes.
    [g!.id]: p => ({ ...p, width: 100, height: 100, subject: at(0), large: { url: media('gh'), width: 200, height: 200 } }),
    [h!.id]: p => ({ ...p, width: 100, height: 100, subject: at(50), large: { url: media('gh'), width: 200, height: 200 } }),
  }
  const c: Content = { ...vi, species: vi.species.map(s => (edit[s.id] ? { ...s, photos: [edit[s.id]!(s.photos[0]!), ...s.photos.slice(1)] } : s)) }
  const calendar = calendarOf([{ fish: `species/${e!.id}`, img: media('e') }, { fish: `species/${g!.id}`, img: media('gh') }], [])
  const ix = appIndex('vi', c, new Map(), c.species, { calendar, today })
  expect(ix.home.days!.map(x => x.imgBox)).toEqual([boxFractions({ width: 100, height: 100, subject: at(0) }), undefined])
})
