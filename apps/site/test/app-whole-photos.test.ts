import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { boxFractions, LANGS, type Photo } from '@aq/schema'
import { PageDoc } from '@aq/schema/app-page'
import { appIndex } from '../src/lib/app-index'
import { appPages, fishDoc, guideDoc } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { guideParts } from '../src/lib/guide-page'
import { BLUR_STRIP, smallSrc, wholeGround } from '../src/lib/img'
import { guideImage } from '../src/lib/mentions'

// The app shows a page's photo whole where no frame may fill with it, never nothing (the Design Lead's frames.md, accepted
// by the chief of staff, 13 Nov). On 13 Nov 41 fish pages led with a dealer's shot cropped too near the fish, which the
// app's data left out of the page's `lead` and the index's `img`, so the app showed no photo for them. The fields an app
// reads today stay exactly as they were; the photo goes beside them as `leadWhole` and `imgWhole`, which an older build
// ignores. `leadWhole` never comes with `lead`; `imgWhole` comes with `img` where `img` is a later photo than the head
// (the Design Lead, 13 Nov: a card and its page show one photo).
const crop = { originalWidth: 1200, originalHeight: 800, window: { x0: 100, y0: 50, x1: 1100, y1: 741 }, subject: { x0: 110, y0: 300, x1: 1090, y1: 500 }, margin: 6 }
const cropped = (o: Partial<Photo> = {}): Photo => ({
  url: 'https://media.aquatome.com/processed/app-whole.webp', thumb: 'https://media.aquatome.com/processed/app-whole-480.webp',
  width: 1000, height: 691, author: 'a dealer', licence: 'cc-by-4.0', sourceUrl: 'https://example.org/fish', source: 'commons',
  altered: [{ method: 'mark-crop', crop }], ...o,
}) as Photo

// The app's index is built once a case (it reads every page): its paths are what listedPaths gives.
async function withPhotos(photos: Photo[]) {
  const vi = await getContent('vi')
  const was = vi.species.find(s => s.id === 'paracheirodon-innesi')!
  const s = { ...was, photos }
  const c = { ...vi, species: vi.species.map(x => (x.id === s.id ? s : x)), galleries: { ...vi.galleries, [s.id]: [] } }
  const index = appIndex('vi', c)
  return { index, doc: await fishDoc('vi', c, s, new Set(index.items.map(i => i.path))), item: index.items.find(i => i.id === s.id)! }
}

// The site leads the first whole (headFit 'contain'); the second fits a 4:3 and a 16:9 cover but not the app's other cards.
for (const [what, p] of [['led whole on the site', cropped({ headFit: 'contain' })], ['refused by the cards\' frames', cropped()]] as const) {
  test(`a fish whose only photo is ${what}: today's fields as before, the photo whole beside them`, async () => {
    const { doc, item } = await withPhotos([p])
    // What a build on phones today reads: no lead, no img, no box, as on main.
    expect([doc.lead, item.img, item.imgBox]).toEqual([undefined, undefined, undefined])
    expect(doc.leadWhole).toMatchObject({ src: p.url, w: 1000, h: 691, alt: expect.any(String), credit: { text: expect.any(String) } })
    expect(doc.leadWhole).not.toHaveProperty('box')
    expect(item.imgWhole).toEqual({ src: smallSrc(p), w: 1000, h: 691 })
    expect(PageDoc.safeParse(doc).success).toBe(true)
  }, 120_000)
}

test('a fish whose photo fills its frames carries no whole photo, and no item carries one photo twice', async () => {
  const neon = (await getContent('vi')).species.find(s => s.id === 'paracheirodon-innesi')!
  const { doc, item, index } = await withPhotos(neon.photos)
  expect(doc.lead).toBeDefined()
  expect(item.img).toBeDefined()
  expect([doc.leadWhole, item.imgWhole]).toEqual([undefined, undefined])
  for (const i of index.items) if (i.img && i.imgWhole) expect(i.imgWhole.src, i.path).not.toBe(i.img)
}, 120_000)

test("a fish whose head the cards refuse, with a later photo that fits: `img` is the later one, as today, and `imgWhole` the head", async () => {
  const neon = (await getContent('vi')).species.find(s => s.id === 'paracheirodon-innesi')!
  const head = cropped(), next = neon.photos[0]!
  const { doc, item } = await withPhotos([head, next])
  expect(item.img).toBe(smallSrc(next))
  expect(item.imgWhole).toEqual({ src: smallSrc(head), w: 1000, h: 691 })
  // The page's head is the same photo, whole.
  expect([doc.lead, doc.leadWhole?.src]).toEqual([undefined, head.url])
}, 120_000)

// The loader frames a fish's or breed's photo with no box by its whole area (the Design Lead, 13 Nov): the app is sent a
// box with every fish and breed card and head, so it decides fill or whole by the frames rule alone. 7 of the fixture's 11
// fish and breed photos have no box in its record (test/engine-state/_photo-boxes.json).
test('every fish and breed card with a photo, and every fish and breed head, carries its box, in every language', async () => {
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const index = appIndex(lang, c)
    for (const i of index.items.filter(i => i.kind === 'fish' && i.img)) expect(i.imgBox, `${lang} ${i.path}`).toBeDefined()
    const docs = await appPages(lang, c)
    for (const d of docs.fish) if (d.lead) expect(d.lead.box, `${lang} ${d.path}`).toBeDefined()
  }
}, 300_000)

// A video guide's head before it plays is its card's photo (the Design Lead, 13 Nov), in `video.poster`.
test("a video guide's poster is its card's photo, at full size, with its box where the photo has one", async () => {
  const vi = await getContent('vi')
  const listed = new Set(appIndex('vi', vi).items.map(i => i.path))
  const videos = vi.guides.filter(g => g.video)
  expect(videos.length).toBeGreaterThan(0)
  for (const g of videos) {
    const card = guideImage(vi, g), doc = guideDoc('vi', vi, g, listed)
    expect(doc.lead, g.id).toBeUndefined()
    if (!card) { expect(doc.video?.poster, g.id).toBeUndefined(); continue }
    expect(doc.video?.poster, g.id).toMatchObject({ src: card.url, w: Math.round(card.width), h: Math.round(card.height), credit: { text: expect.any(String) } })
    expect(doc.video?.poster?.box, g.id).toEqual(boxFractions(card))
    expect(PageDoc.safeParse(doc).success).toBe(true)
  }
}, 120_000)

// An article whose card picture is a section's leads with it, and that section doesn't show it again (the Design Lead,
// 13 Nov: card and head one picture, each photo once a page). 11 articles on 13 Nov; the fixture's first photos name no
// section, so this one is put first.
test("an article whose card picture is a section's picture leads with it, on the site and in the app, and shows it once", async () => {
  const vi = await getContent('vi')
  const was = vi.guides.find(g => g.id === 'sprucepets-low-maintenance-freshwater-fish-4770223')!
  const section = was.photos.find(p => p.section)!
  const g = { ...was, photos: [section, ...was.photos.filter(p => p !== section)] }
  const c = { ...vi, guides: vi.guides.map(x => (x.id === g.id ? g : x)) }
  expect(guideImage(c, g)?.url).toBe(section.url)
  const parts = guideParts('vi', c, g)
  expect(parts.lead?.url).toBe(section.url)
  expect(parts.prose).not.toContain(section.url)
  const doc = guideDoc('vi', c, g, new Set(appIndex('vi', c).items.map(i => i.path)))
  expect(doc.lead?.src).toBe(section.url)
}, 120_000)

test('a fish with no photo still has neither', async () => {
  const { doc, item } = await withPhotos([])
  expect([doc.lead, doc.leadWhole, item.img, item.imgWhole]).toEqual([undefined, undefined, undefined, undefined])
}, 120_000)

// protocols/whole-frame-vectors.json: the one rule for what fills the rest of a frame that shows a photo whole, the site's
// 4:3 tile and the app's frames alike. Generated from wholeGround: edit a case's inputs there, then run UPDATE_VECTORS=1 on
// this file; the test fails while the file differs from what the rule gives.
const FILE = new URL('../../../protocols/whole-frame-vectors.json', import.meta.url)
const COMMENT = 'What fills the rest of a frame of `ratio` (width over height) that shows a `w` by `h` photo whole, centred: each strip left over is (1 - min(r, ratio) / max(r, ratio)) / 2 of the frame\'s side it runs along the edge of (its height for strips top and bottom, its width for strips left and right), r being w / h. Under `strip`, the frame\'s mat (the ground colour); `strip` or wider, the same photo blurred (18 pt in the app, the site\'s 18 px) behind it. One rule for every whole frame: the site\'s tiles (apps/site/src/lib/img.ts wholeGround, tileFrame) and the app\'s head, tiles, list pictures and cards for `leadWhole` and `imgWhole` (the Design Lead\'s frames.md, the chief of staff, 13 Nov). Generated by apps/site/test/app-whole-photos.test.ts: edit a case\'s inputs (note, w, h, ratio), then run UPDATE_VECTORS=1 on that test file.'
type Case = { note: string; w: number; h: number; ratio: number; ground?: 'mat' | 'blur' }
test('protocols/whole-frame-vectors.json is what the site\'s rule gives for its cases', () => {
  const kept: { cases: Case[] } = JSON.parse(readFileSync(FILE, 'utf8'))
  const cases = kept.cases.map(({ note, w, h, ratio }) => ({ note, w, h, ratio, ground: wholeGround(w, h, ratio) }))
  const line = (c: Case) => `    {"note": ${JSON.stringify(c.note)}, "w": ${c.w}, "h": ${c.h}, "ratio": ${c.ratio}, "ground": ${JSON.stringify(c.ground)}}`
  const next = `{\n  "$comment": ${JSON.stringify(COMMENT)},\n  "strip": ${BLUR_STRIP},\n  "cases": [\n${cases.map(line).join(',\n')}\n  ]\n}\n`
  if (process.env.UPDATE_VECTORS === '1') writeFileSync(FILE, next)
  expect(readFileSync(FILE, 'utf8')).toBe(next)
  // Both grounds are covered, at the site's tile and at the app's frames.
  expect(new Set(cases.map(c => c.ground))).toEqual(new Set(['mat', 'blur']))
})
