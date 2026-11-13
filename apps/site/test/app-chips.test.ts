import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CurationSchema, LANGS, type Content, type Photo } from '@aq/schema'
import { appBreeds, appIndex, appSpecies, cardSrc, chipsFor, photoBox } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'
import type { Lang } from '../src/lib/i18n'

// Khám phá's chips row as the app's index carries it, each chip whole, so the app sorts and works out nothing (the Design
// Lead, 13 Nov): its place, its fish, how many, and one photo with its box. The groups and words are the Writing Lead's,
// the order the chief of staff's (14 Nov), kept in the curation file as a plain list the owner may change.
const chips = (xs: unknown[]) => CurationSchema.parse({ version: 1, weeks: [], days: [], chips: xs }).chips
const AMERICAS = ['south-america', 'central-america', 'north-america']
async function row(lang: Lang, xs: unknown[], edit: (c: Content) => Content = c => c) {
  const vi = await getContent('vi'), c = edit({ ...(await getContent(lang)) })
  return chipsFor(lang, c, vi.species, chips(xs), { species: appSpecies(lang, c), breeds: appBreeds(lang, c) })
}

test("a chip holds the species its rule names, the breeds that are forms or crosses of them, and the breeds it names", async () => {
  const [am, dia, han] = await row('vi', [
    { id: 'cichlid-chau-my', names: { vi: 'Cichlid châu Mỹ' }, match: { group: ['cichlids'], places: AMERICAS } },
    { id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'] } },
    { id: 'la-han', names: { vi: 'La hán' }, match: { breeds: ['flowerhorn-cichlid'] } },
  ])
  // The fixture's four South American cichlids, a form of the discus, and a cross with the discus among its parents.
  expect(am!.members).toEqual(expect.arrayContaining(['apistogramma-cacatuoides', 'mikrogeophagus-ramirezi', 'pterophyllum-scalare', 'symphysodon-aequifasciatus', 'pigeon-blood-discus', 'flowerhorn-cichlid']))
  expect(am!.members).not.toContain('paracheirodon-innesi')
  expect(dia!.members.sort()).toEqual(['flowerhorn-cichlid', 'pigeon-blood-discus', 'symphysodon-aequifasciatus'])
  expect(han!.members).toEqual(['flowerhorn-cichlid'])
  for (const ch of [am!, dia!, han!]) expect(ch.count).toBe(ch.members.length)
})

test("the row keeps the file's order, not one by counts; a chip with no word or no fish in a language is left out, and the rest close up", async () => {
  const xs = [
    { id: 'tep', names: { vi: 'Tép' }, match: { group: ['shrimp'] } },
    { id: 'ca-vang', names: { vi: 'Cá vàng' }, match: { species: ['carassius-auratus'] } },
    { id: 'thai-only', names: { th: 'เตตร้า' }, match: { group: ['tetras'] } },
    { id: 'tetra', names: { vi: 'Tetra' }, match: { group: ['tetras'] } },
    { id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'] } },
  ]
  const vi = await row('vi', xs)
  expect(vi.map(c => [c.id, c.order])).toEqual([['tep', 1], ['tetra', 2], ['dia', 3]])
  // By counts the row would read Dĩa, Tetra, Tép.
  expect(vi.map(c => c.count)).toEqual([1, 2, 3])
  expect(await row('id', xs)).toEqual([])
})

// A chip's picture is 3:2 (spec-chips.md): a member's photo whose fish a 3:2 crop keeps by a box the engine found.
const photo = (name: string, w: number, h: number, o: Partial<Photo> = {}) => ({ url: `https://media.aquatome.com/commons/${name}.webp`, thumb: `https://media.aquatome.com/commons/${name}-480.webp`, width: w, height: h, author: 'a', licence: 'cc-by-4.0', sourceUrl: 'https://example.org', source: 'commons', ...o }) as unknown as Photo

test("a chip's picture keeps its fish in a 3:2 crop, by a box the engine found; no banner, and the smaller chip has first pick", async () => {
  const fits = photo('fits', 960, 640, { subject: { x0: 300, y0: 200, x1: 660, y1: 440 } })
  const madeUp = photo('made-up', 960, 640, { subject: { x0: 0, y0: 0, x1: 960, y1: 640 } })
  const banner = photo('banner', 960, 640, { source: 'glaser', subject: { x0: 300, y0: 200, x1: 660, y1: 440 } } as Partial<Photo>)
  const strip = photo('strip', 960, 320, { subject: { x0: 10, y0: 40, x1: 950, y1: 280 } })
  const photos: Record<string, Photo[]> = { 'symphysodon-aequifasciatus': [fits], 'pterophyllum-scalare': [madeUp], 'apistogramma-cacatuoides': [banner], 'mikrogeophagus-ramirezi': [strip] }
  const edit = (c: Content): Content => ({ ...c, species: c.species.map(s => ({ ...s, photos: photos[s.id] ?? s.photos })), breeds: c.breeds.map(b => ({ ...b, photos: [] })) })
  const [am, dia] = await row('vi', [
    { id: 'cichlid-chau-my', names: { vi: 'Cichlid châu Mỹ' }, match: { group: ['cichlids'], places: AMERICAS } },
    { id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'] } },
  ], edit)
  // Dĩa, the smaller, takes the discus; the wider chip may not show it again, and its others' photos don't qualify.
  expect([dia!.img, dia!.imgBox]).toEqual([cardSrc(fits), photoBox(fits)])
  expect([am!.img, am!.imgBox]).toEqual([undefined, undefined])
})

// Astra's read of 14 Nov: the pick took each member's head alone, so a head that didn't qualify hid the photo after it.
// Heads still come first, wider ones before narrower: a page's head is the photo the engine ranked best.
test("a chip's picture is a member's head where one qualifies, wider first, else another of a member's photos", async () => {
  const fits = (name: string, w: number) => photo(name, w, w * 2 / 3, { subject: { x0: w * 0.3, y0: w * 0.2, x1: w * 0.7, y1: w * 0.45 } })
  const madeUp = photo('made-up', 960, 640, { subject: { x0: 0, y0: 0, x1: 960, y1: 640 } }), second = fits('second', 960)
  const narrowHead = fits('narrow-head', 480), wideOther = fits('wide-other', 960), wideHead = fits('wide-head', 960)
  const photos: Record<string, Photo[]> = {
    'symphysodon-aequifasciatus': [madeUp, second],
    'pterophyllum-scalare': [narrowHead, wideOther],
    'apistogramma-cacatuoides': [wideHead],
  }
  const edit = (c: Content): Content => ({ ...c, species: c.species.map(s => ({ ...s, photos: photos[s.id] ?? [] })), breeds: c.breeds.map(b => ({ ...b, photos: [] })) })
  const [dia, tien, am] = await row('vi', [
    { id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'] } },
    { id: 'ong-tien', names: { vi: 'Ông tiên' }, match: { genus: ['Pterophyllum'] } },
    { id: 'cichlid-chau-my', names: { vi: 'Cichlid châu Mỹ' }, match: { group: ['cichlids'], places: AMERICAS } },
  ], edit)
  // Dĩa's head has only the loader's made-up box: its second photo serves.
  expect(dia!.img).toBe(cardSrc(second))
  // A narrow head still beats a wide photo that isn't one.
  expect(tien!.img).toBe(cardSrc(narrowHead))
  // The wider chip, with the others' photos taken: a head first (the cockatoo cichlid's), before the angelfish's other photo.
  expect(am!.img).toBe(cardSrc(wideHead))
})

// The chips as the curation file holds them, in every language's index on the fixture: whole and consistent.
test("every language's index carries the file's chips whole: its fish are its items, its count theirs, its order 1 to n", async () => {
  const file = CurationSchema.parse(JSON.parse(readFileSync(new URL('../../../content/curation.json', import.meta.url), 'utf8')))
  expect(file.chips.length).toBeGreaterThan(0)
  for (const ch of file.chips) expect(ch.names.vi, ch.id).toBeTruthy()
  const calendar = CurationSchema.parse({ version: 1, weeks: [], days: [], chips: file.chips })
  const vi = await getContent('vi')
  let shown = 0
  for (const lang of LANGS) {
    const c = await getContent(lang), ix = appIndex(lang, c, new Map(), vi.species, { calendar, today: '2026-11-14' })
    const ids = new Set(ix.items.map(i => i.id)), row = ix.home.chips ?? []
    expect(row.map(ch => ch.order)).toEqual(row.map((_, i) => i + 1))
    // In the file's order.
    const at = new Map(file.chips.map((ch, i) => [ch.id, i]))
    expect(row.map(ch => at.get(ch.id)!)).toEqual([...row.map(ch => at.get(ch.id)!)].sort((a, b) => a - b))
    for (const ch of row) {
      expect(ch.count, `${lang} ${ch.id}`).toBe(ch.members.length)
      expect(ch.count, `${lang} ${ch.id}`).toBeGreaterThan(0)
      for (const m of ch.members) expect(ids.has(m), `${lang} ${ch.id}: ${m}`).toBe(true)
      expect(ch.name, `${lang} ${ch.id}`).toBe(file.chips.find(x => x.id === ch.id)!.names[lang])
      if (ch.img) expect(ch.imgBox, `${lang} ${ch.id}`).toBeDefined()
    }
    const imgs = row.flatMap(ch => ch.img ?? [])
    expect(new Set(imgs).size).toBe(imgs.length)
    shown += row.length
  }
  expect(shown).toBeGreaterThan(0)
}, 600_000)
