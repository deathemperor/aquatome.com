import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CurationSchema, LANGS, type Content, type Photo } from '@aq/schema'
import { appBreeds, appIndex, appSpecies, cardSrc, chipsFor, photoBox } from '../src/lib/app-index'
import { cropOnly } from '../src/lib/curation'
import { getContent } from '../src/lib/content'
import type { Lang } from '../src/lib/i18n'

// Khám phá's chips row as the app's index carries it, each chip whole, so the app sorts and works out nothing (the Design
// Lead, 13 Nov): its place, its fish, how many, and one photo with its box. The groups and words are the Writing Lead's,
// the order the chief of staff's (14 Nov), kept in the curation file as a plain list the owner may change.
const chips = (xs: unknown[]) => CurationSchema.parse({ version: 1, weeks: [], days: [], chips: xs }).chips
const AMERICAS = ['south-america', 'central-america', 'north-america']
async function row(lang: Lang, xs: unknown[], edit: (c: Content) => Content = c => c, judged?: { avoid: Record<string, string>; cardPhoto?: Record<string, string> }) {
  const vi = await getContent('vi'), c = edit({ ...(await getContent(lang)) })
  return chipsFor(lang, c, vi.species, chips(xs), { species: appSpecies(lang, c), breeds: appBreeds(lang, c) }, judged)
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

// The Writing Lead, 14 Nov: Tép is the shrimp group less crayfish, marine shrimp and Macrobrachium, by id.
test("a chip leaves out what it names in `except`: a breed by its id, a species with the breeds that are forms or crosses of it", async () => {
  const dia = (except: string[]) => ({ id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'], except } })
  const [noHorn] = await row('vi', [dia(['flowerhorn-cichlid'])])
  expect(noHorn!.members.sort()).toEqual(['pigeon-blood-discus', 'symphysodon-aequifasciatus'])
  expect(noHorn!.count).toBe(2)
  // The discus out, its form and its cross go with it, and a chip left with no fish is left out.
  expect(await row('vi', [dia(['symphysodon-aequifasciatus'])])).toEqual([])
  // `except` alone holds no fish.
  expect(() => chips([{ id: 'x', names: { vi: 'X' }, match: { except: ['symphysodon-aequifasciatus'] } }])).toThrow(/a chip holds some fish/)
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

// A chip stands for many fish, so its picture is a member's face, never a photo no check has judged (Photo Sourcing,
// Curation and the Site lead, 17 Nov): a member's head, wider first; a head that doesn't qualify passes to the next
// member, not to that member's other photos (Astra's read of 14 Nov took those; their photos from a page's text are
// unjudged). Each names the member whose face it is (the Lab, 16 Nov: the app credits the fish).
const fitting = (name: string, w: number) => photo(name, w, w * 2 / 3, { subject: { x0: w * 0.3, y0: w * 0.2, x1: w * 0.7, y1: w * 0.45 } })
const onlyThese = (photos: Record<string, Photo[]>) => (c: Content): Content => ({ ...c, species: c.species.map(s => ({ ...s, photos: photos[s.id] ?? [] })), breeds: c.breeds.map(b => ({ ...b, photos: [] })) })
const CHIPS = [
  { id: 'dia', names: { vi: 'Dĩa' }, match: { genus: ['Symphysodon'] } },
  { id: 'ong-tien', names: { vi: 'Ông tiên' }, match: { genus: ['Pterophyllum'] } },
  { id: 'cichlid-chau-my', names: { vi: 'Cichlid châu Mỹ' }, match: { group: ['cichlids'], places: AMERICAS } },
]

test("a chip's picture is a member's head where one qualifies, wider first, else the next member's; never a member's other photo", async () => {
  const madeUp = photo('made-up', 960, 640, { subject: { x0: 0, y0: 0, x1: 960, y1: 640 } }), second = fitting('second', 960)
  const narrowHead = fitting('narrow-head', 480), wideOther = fitting('wide-other', 960), wideHead = fitting('wide-head', 960)
  const [dia, tien, am] = await row('vi', CHIPS, onlyThese({
    'symphysodon-aequifasciatus': [madeUp, second],
    'pterophyllum-scalare': [narrowHead, wideOther],
    'apistogramma-cacatuoides': [wideHead],
  }))
  // Dĩa's one fish with photos has a head with only the loader's made-up box, and its second photo isn't a face.
  expect(dia!.img).toBeUndefined()
  // A narrow head, not a wider photo that isn't one.
  expect([tien!.img, tien!.imgOf]).toEqual([cardSrc(narrowHead), 'pterophyllum-scalare'])
  // The wider chip, the angelfish's head taken: the cockatoo cichlid's.
  expect([am!.img, am!.imgOf]).toEqual([cardSrc(wideHead), 'apistogramma-cacatuoides'])
})

// The chief of staff (16 Nov): pictures that stand for more than one fish never show a held, failed or marked head.
test("a head on avoid passes to its page's cardPhoto, else to the next member; a reason only about a card's crop doesn't count", async () => {
  const head = fitting('head', 960), card = fitting('card', 960), other = fitting('other', 960), next = fitting('next', 800)
  const edit = onlyThese({ 'apistogramma-cacatuoides': [head, other, card], 'mikrogeophagus-ramirezi': [next] })
  const am = async (judged?: { avoid: Record<string, string>; cardPhoto?: Record<string, string> }) => (await row('vi', [CHIPS[2]], edit, judged))[0]!
  // Nothing judged against it: the head.
  expect((await am()).img).toBe(cardSrc(head))
  // On avoid, and no map (before Photo Sourcing's is on main): the next member's head, never the page's other photos.
  const avoid = { [head.url]: 'engine: held for a second look' }
  expect(await am({ avoid })).toMatchObject({ img: cardSrc(next), imgOf: 'mikrogeophagus-ramirezi' })
  // With the map: the page's cardPhoto, the photo a check passed.
  expect(await am({ avoid, cardPhoto: { 'apistogramma-cacatuoides': card.url } })).toMatchObject({ img: cardSrc(card), imgOf: 'apistogramma-cacatuoides' })
  // A cardPhoto the page no longer has is none.
  expect((await am({ avoid, cardPhoto: { 'apistogramma-cacatuoides': 'https://media.aquatome.com/commons/gone.webp' } })).img).toBe(cardSrc(next))
  // The card's crop alone (the chief of staff, 16 Nov 12:14, the panda cory's head): the chip checks its own crop.
  expect((await am({ avoid: { [head.url]: "head outside the card's crop until the card can follow the head (the chief of staff, 2026-11-10)" } })).img).toBe(cardSrc(head))
})

// The avoid list's reasons as content/curation.json words them on 17 Nov: the two about a card's crop, and the rest.
test("only a reason about a card's crop is the crop's alone", () => {
  for (const why of ["head outside the card's crop until the card can follow the head (the chief of staff, 2026-11-10)", "snout cut by the card's left edge (the chief of staff, 2026-11-10)"]) expect(cropOnly(why), why).toBe(true)
  for (const why of ['engine: the check can\'t tell', 'engine: held for a second look', 'engine: not typical', 'engine: a dead fish', "a wholesaler's logo banner with lettering across the photo: kept off cards wherever it sits on its page, so a reorder can't make it a card; it stays in the album (chief of staff, 2026-11-15)", 'a person', 'fish out of water', 'two photos joined side by side, with a slanted seam across the card', 'dark: cards only, it stays on its page until a clearer photo turns up (chief of staff, 2026-11-10)']) expect(cropOnly(why), why).toBe(false)
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
    const photosOf = new Map([...c.species, ...c.breeds].map(x => [x.id, x.photos]))
    expect(row.map(ch => ch.order)).toEqual(row.map((_, i) => i + 1))
    // The app draws the row keyed by id (the v2 Lab, 16 Nov): no id twice in a language's row.
    expect(new Set(row.map(ch => ch.id)).size, lang).toBe(row.length)
    // In the file's order.
    const at = new Map(file.chips.map((ch, i) => [ch.id, i]))
    expect(row.map(ch => at.get(ch.id)!)).toEqual([...row.map(ch => at.get(ch.id)!)].sort((a, b) => a - b))
    for (const ch of row) {
      expect(ch.count, `${lang} ${ch.id}`).toBe(ch.members.length)
      expect(ch.count, `${lang} ${ch.id}`).toBeGreaterThan(0)
      for (const m of ch.members) expect(ids.has(m), `${lang} ${ch.id}: ${m}`).toBe(true)
      expect(ch.name, `${lang} ${ch.id}`).toBe(file.chips.find(x => x.id === ch.id)!.names[lang])
      if (ch.img) expect(ch.imgBox, `${lang} ${ch.id}`).toBeDefined()
      // Its photo is its `imgOf` member's own, so the chip credits the right fish.
      if (ch.img) expect(photosOf.get(ch.imgOf!)?.some(p => cardSrc(p) === ch.img), `${lang} ${ch.id}: ${ch.imgOf}`).toBe(true)
      if (ch.img) expect(ch.members, `${lang} ${ch.id}`).toContain(ch.imgOf)
    }
    const imgs = row.flatMap(ch => ch.img ?? [])
    expect(new Set(imgs).size).toBe(imgs.length)
    shown += row.length
  }
  expect(shown).toBeGreaterThan(0)
}, 600_000)
