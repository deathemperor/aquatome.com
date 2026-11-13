import { expect, test } from 'vitest'
import { LANGS, type Content, type Photo } from '@aq/schema'
import { PageDoc } from '@aq/schema/app-page'
import { appIndex, photoBox } from '../src/lib/app-index'
import { appPages, fishDoc, guideDoc } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { guideParts } from '../src/lib/guide-page'
import { smallSrc } from '../src/lib/img'
import { guideImage } from '../src/lib/mentions'

// A card and the page it opens show one photo, and the app shows a page's photo whole where no frame may fill with it,
// never nothing (the Design Lead's line, accepted by the chief of staff, 13 Nov). On 13 Nov 41 fish pages led with a
// dealer's shot cropped too near the fish, which the app's data left out of the page's `lead` and the index's `img`, so
// the app showed no photo for them, or a later one on the card. Now `img` and `lead` are the page's first photo that
// isn't generated, with where the fish is (`box`): its whole area where the cards' frames refuse the photo.
const WHOLE = { x: 0, y: 0, w: 1, h: 1 }
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
  test(`a fish whose only photo is ${what}: its card and its head are that photo, with its whole area as the box`, async () => {
    const { doc, item } = await withPhotos([p])
    expect([item.img, item.imgBox]).toEqual([smallSrc(p), WHOLE])
    expect(doc.lead).toMatchObject({ src: p.url, w: 1000, h: 691, alt: expect.any(String), credit: { text: expect.any(String) }, box: WHOLE })
    expect(PageDoc.safeParse(doc).success).toBe(true)
  }, 120_000)
}

test("a fish whose head the cards refuse, with a later photo that fits: its card is the head, not the later photo", async () => {
  const neon = (await getContent('vi')).species.find(s => s.id === 'paracheirodon-innesi')!
  const head = cropped(), next = neon.photos[0]!
  const { doc, item } = await withPhotos([head, next])
  expect([item.img, item.imgBox]).toEqual([smallSrc(head), WHOLE])
  expect([doc.lead?.src, doc.lead?.box]).toEqual([head.url, WHOLE])
}, 120_000)

test("a generated picture is never a card's photo, and leads its page, labelled, only where the page has no real photo", async () => {
  const neon = (await getContent('vi')).species.find(s => s.id === 'paracheirodon-innesi')!
  const made = { ...cropped(), url: 'https://media.aquatome.com/generated/made.webp', thumb: undefined, altered: undefined, generated: { model: 'x' } } as unknown as Photo
  const both = await withPhotos([made, neon.photos[0]!])
  expect([both.item.img, both.doc.lead?.src]).toEqual([smallSrc(neon.photos[0]!), neon.photos[0]!.url])
  const alone = await withPhotos([made])
  expect([alone.item.img, alone.doc.lead?.src]).toEqual([undefined, made.url])
}, 120_000)

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
    expect(doc.video?.poster?.box, g.id).toEqual(photoBox(card))
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

test('a fish with no photo has neither a card photo nor a head', async () => {
  const { doc, item } = await withPhotos([])
  expect([doc.lead, item.img, item.imgBox]).toEqual([undefined, undefined, undefined])
}, 120_000)

/** Every photo the content holds, by its address: the photo a card's small copy and a head's full one are both of. */
function photosByUrl(c: Content): Map<string, Photo> {
  const out = new Map<string, Photo>(), seen = new Set<object>()
  const walk = (x: unknown) => {
    if (!x || typeof x !== 'object' || seen.has(x)) return
    seen.add(x)
    const p = x as Photo
    if (typeof p.url === 'string' && typeof p.width === 'number' && typeof p.height === 'number' && !out.has(p.url)) out.set(p.url, p)
    for (const v of Object.values(x)) walk(v)
  }
  walk(c)
  return out
}

// Every item of every kind the app has a page for: its card's photo is its page's head (a video guide's poster), the
// same photo with the same box, or neither has one (the chief of staff, 13 Nov: card photo = the page's photo, every kind).
// The loader frames a fish's or breed's photo with no box by its whole area (the Design Lead, 13 Nov): the app is sent a
// box with every fish and breed card and head, so it decides fill or whole by the frames rule alone. 7 of the fixture's 11
// fish and breed photos have no box in its record (test/engine-state/_photo-boxes.json).
test("every card in the app index shows its page's head, the same photo with the same box, and every fish's carries one, in every language", async () => {
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const byUrl = photosByUrl(c), docs = await appPages(lang, c)
    const byPath = new Map(Object.values(docs).flat().map(d => [d.path, d]))
    const pictured = new Map<string, number>()
    for (const i of appIndex(lang, c).items) {
      if (i.kind === 'fish' && i.img) expect(i.imgBox, `${lang} ${i.path}`).toBeDefined()
      const d = byPath.get(i.path)
      if (!d) continue
      const head = d.lead ?? d.video?.poster, p = head && byUrl.get(head.src)
      if (head) expect(p, `${lang} ${i.path}: ${head.src}`).toBeDefined()
      // A page with no real photo may lead with its generated picture, labelled; no card shows one.
      expect(!!head && !p?.generated, `${lang} ${i.kind} ${i.path}: card ${i.img ?? 'none'}, head ${head?.src ?? 'none'}`).toBe(!!i.img)
      if (!head || !i.img) continue
      expect(smallSrc(p!), `${lang} ${i.kind} ${i.path}`).toBe(i.img)
      if (i.imgBox) expect(head.box, `${lang} ${i.path}`).toEqual(i.imgBox)
      pictured.set(i.kind, (pictured.get(i.kind) ?? 0) + 1)
    }
    for (const d of docs.fish) if (d.lead) expect(d.lead.box, `${lang} ${d.path}`).toBeDefined()
    // Not vacuous: in Vietnamese, each kind with pictures has some checked.
    if (lang === 'vi') for (const k of ['fish', 'plant', 'guide', 'video', 'equipment']) expect(pictured.get(k) ?? 0, k).toBeGreaterThan(0)
  }
}, 1_200_000)
