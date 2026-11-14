import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { ownerCropCanonical, type OwnerCropApproval, type Photo } from '@aq/schema'
import { cardCrop, HEAD_IN_CROP, leadChoice, screenLeads, TRIES, type LeadDeps } from '../src/lead-photo'
import { approvedCrop, hiddenFromReaders, mergePhotos, mergeRead, waitsForScreen } from '../src/run'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#468' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const photo = (n: string, width = 1000, height = 667): Photo => ({ url: url(n), width, height, licence: 'x', author: 'a', sourceUrl: 'x' })
const big = (n: string) => photo(n, 1600, 1400)
const yes = () => true

test('a head big enough for the card stays; a page with no photo takes the best that passes, whatever its size, then the largest', () => {
  expect(leadChoice([big('head')], [big('other')], yes, {})).toBeUndefined()
  expect(leadChoice([], [big('plain'), { ...big('chosen'), best: true }], yes, {})).toEqual({ lead: { ...big('chosen'), best: true } })
  expect(leadChoice([], [photo('small')], yes, {})).toEqual({ lead: photo('small') })
  expect(leadChoice([], [photo('small', 500, 400), photo('larger', 900, 700)], yes, {})).toEqual({ lead: photo('larger', 900, 700) })
  expect(leadChoice([], [photo('small')], () => false, {})).toBeUndefined()
})

test("a photo with its source's own mark leads only where nothing else passes, and an unmarked one replaces it", () => {
  const isMarked = (p: Photo) => name(p.url).startsWith('marked')
  const passes = (p: Photo) => !isMarked(p)
  expect(leadChoice([], [big('marked-1')], passes, {}, isMarked)).toEqual({ lead: big('marked-1') })
  expect(leadChoice([], [big('marked-1'), photo('plain', 500, 400)], passes, {}, isMarked)).toEqual({ lead: photo('plain', 500, 400) })
  expect(leadChoice([big('marked-1')], [photo('plain', 500, 400)], passes, {}, isMarked)).toEqual({ lead: photo('plain', 500, 400) })
  expect(leadChoice([big('marked-1')], [], passes, {}, isMarked)).toBeUndefined()
  // It never replaces an unmarked head.
  expect(leadChoice([photo('head', 500, 400)], [big('marked-1')], passes, {}, isMarked)).toBeUndefined()
})

test('a large copy counts for the head and for what could replace it', () => {
  const withLarge = { ...photo('head', 960, 640), large: { url: url('head-large'), width: 1800, height: 1200 } }
  expect(leadChoice([withLarge], [big('other')], yes, {})).toBeUndefined()
})

test("a small head waits for the model's answer, gives way to a yes, and tries the next photo after a no; a photo that doesn't pass is never asked about", () => {
  const head = photo('head'), own = big('own'), gal = big('gal')
  const passes = (p: Photo) => p.url !== url('fails')
  expect(leadChoice([head, big('fails'), own], [gal], passes, {})).toEqual({ ask: { head, photo: own } })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: true } })).toEqual({ lead: own })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: false } })).toEqual({ ask: { head, photo: gal } })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: false }, [gal.url]: { [head.url]: false } })).toBeUndefined()
})

test("a re-read of a source doesn't push down a head that fills the card, gallery photo or not; a smaller head goes back to source order, and one the read replaced goes", () => {
  // A review, 2026-11-10: five of the seven new heads lost first place in a simulated re-read, and the owner's complaint came back.
  const head = { ...big('promoted') }
  const old = { ...photo('old'), source: 'seriouslyfish' as const, sourceUrl: 'https://x/fish' }
  const fresh = { ...photo('fresh'), source: 'seriouslyfish' as const, sourceUrl: 'https://x/fish' }
  expect(mergePhotos([head, old], 'seriouslyfish', 'https://x/fish', [fresh]).map(p => name(p.url))).toEqual(['promoted', 'fresh'])
  expect(mergePhotos([photo('small'), old], 'seriouslyfish', 'https://x/fish', [fresh]).map(p => name(p.url))).toEqual(['fresh', 'small'])
  const ownBig = { ...big('own-big'), source: 'seriouslyfish' as const, sourceUrl: 'https://x/fish' }
  expect(mergePhotos([ownBig, old], 'seriouslyfish', 'https://x/fish', [fresh]).map(p => name(p.url))).toEqual(['fresh'])
})

test("a crop the owner approved one by one is never dropped by a re-read of its source, whatever that page now shows, nor pushed out by the photo cap; one that fails its approval is the source's like any other", () => {
  // 14 Nov 2026: a pages rewrite took Betta rutilans' only photo, the owner's crop of the shop's photo.
  const page = 'https://x/fish', at = 'species/fish-x', sci = 'Fish x'
  const crop: Photo = { ...photo('owner-crop'), source: 'bwaquatics', sourceUrl: page, ownerCrop: { id: 'owner-crop-x', pixelHash: 'a'.repeat(64) }, altered: [{ method: 'mark-crop', date: '2026-11-11T00:00:00.000Z', originalHash: 'b'.repeat(64) } as never], original: { url: url('original'), width: 1200, height: 960 } }
  const approval = { id: 'owner-crop-x', approved: true, page: at, scientificName: sci, originalHash: 'b'.repeat(64), pixelHash: 'a'.repeat(64), recordHash: createHash('sha256').update(ownerCropCanonical(crop, at, sci)).digest('hex') } as OwnerCropApproval
  const owned = approvedCrop(at, sci, [approval])
  expect(owned(crop)).toBe(true)
  // Approved for another page, or changed since its approval: not the owner's crop here.
  expect(approvedCrop('species/other', sci, [approval])(crop)).toBe(false)
  // A plant's crop never passes, even with an approval for its page: the build checks a plant's crop with no page or name.
  const plant = 'plants/plant-x', plantApproval = { ...approval, page: plant, recordHash: createHash('sha256').update(ownerCropCanonical(crop, plant, sci)).digest('hex') }
  expect(approvedCrop(plant, sci, [plantApproval])(crop)).toBe(false)
  expect(owned({ ...crop, ownerCrop: { id: 'owner-crop-x', pixelHash: 'c'.repeat(64) } })).toBe(false)
  const old = { ...photo('old'), source: 'bwaquatics' as const, sourceUrl: page }
  const fresh = (n: string) => ({ ...photo(n), source: 'bwaquatics' as const, sourceUrl: page })
  expect(mergePhotos([crop, old], 'bwaquatics', page, [fresh('fresh')], { owned }).map(p => name(p.url)).sort()).toEqual(['fresh', 'owner-crop'])
  expect(mergePhotos([crop], 'bwaquatics', page, [], { owned }).map(p => name(p.url))).toEqual(['owner-crop'])
  // The cap: eight fresh photos and four kept from elsewhere still leave the crop its place.
  const elsewhere = [1, 2, 3, 4].map(i => ({ ...big(`sf-${i}`), source: 'seriouslyfish' as const, sourceUrl: 'https://y/fish' }))
  const many = [1, 2, 3, 4, 5, 6, 7, 8].map(i => fresh(`fresh-${i}`))
  const capped = mergePhotos([...elsewhere, crop], 'bwaquatics', page, many, { owned })
  expect(capped).toHaveLength(8)
  expect(capped.map(p => name(p.url))).toContain('owner-crop')
  // A crop that fails its approval is the source page's photo like any other: the read replaces it.
  expect(mergePhotos([crop, old], 'bwaquatics', page, [fresh('fresh')], { owned: approvedCrop(at, sci, []) }).map(p => name(p.url))).toEqual(['fresh'])
})

test("a re-read never leaves a page with none of the photos a reader could see; a never-again photo, one whose source no longer lets us show photos, or a crop that fails its approval counts for nothing either way", () => {
  const page = 'https://x/fish'
  const mine = { ...photo('mine'), source: 'bwaquatics' as const, sourceUrl: page }
  const banned = { ...photo('banned'), source: 'bwaquatics' as const, sourceUrl: page }
  expect(mergeRead([mine], 'bwaquatics', page, [])).toEqual({ photos: [mine], held: [mine] })
  // Only photos that may never stay: nothing is kept, so the caller looks for Commons photos.
  expect(mergeRead([banned], 'bwaquatics', page, [], { gone: p => p.url === banned.url })).toEqual({ photos: [], held: [] })
  expect(mergeRead([mine, banned], 'bwaquatics', page, [], { gone: p => p.url === banned.url })).toEqual({ photos: [mine], held: [mine] })
  // A banned photo from another source left on the page is nothing a reader sees: the page keeps its last one it may show.
  const bannedElsewhere = { ...photo('banned-elsewhere'), source: 'seriouslyfish' as const, sourceUrl: 'https://y/fish' }
  expect(mergeRead([bannedElsewhere, mine], 'bwaquatics', page, [], { gone: p => p.url === bannedElsewhere.url })).toEqual({ photos: [mine], held: [mine] })
  // A crop that fails its approval is hidden by the build: alone on a page, it keeps nothing, so the caller looks to Commons.
  const unapproved: Photo = { ...photo('unapproved-crop'), source: 'bwaquatics', sourceUrl: page, ownerCrop: { id: 'none', pixelHash: 'e'.repeat(64) } }
  expect(mergeRead([unapproved], 'bwaquatics', page, [], { owned: () => false })).toEqual({ photos: [], held: [] })
  expect(mergeRead([unapproved, mine], 'bwaquatics', page, [], { owned: () => false })).toEqual({ photos: [mine], held: [mine] })
  // Only hidden photos from other sources left, and nothing of this page's to keep: none at all, so the caller looks to Commons.
  expect(mergeRead([bannedElsewhere, mine], 'bwaquatics', page, [], { gone: p => p.url === bannedElsewhere.url || p.url === mine.url })).toEqual({ photos: [], held: [] })
  const unapprovedElsewhere: Photo = { ...photo('unapproved-elsewhere'), source: 'seriouslyfish', sourceUrl: 'https://y/fish', ownerCrop: { id: 'none', pixelHash: 'f'.repeat(64) } }
  expect(mergeRead([unapprovedElsewhere], 'bwaquatics', page, [], { owned: () => false })).toEqual({ photos: [], held: [] })
  expect(mergeRead([bannedElsewhere], 'bwaquatics', page, [], { gone: p => p.url === bannedElsewhere.url })).toEqual({ photos: [], held: [] })
  // A generated photo is nothing a reader sees as the fish: the page keeps its last real one, held, and the generated one
  // stays behind it; one the read replaced is never held.
  const gen = { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', date: '2026-11-10', prompt: 'fish', referenceHash: 'a'.repeat(64) }
  const generatedElsewhere: Photo = { ...photo('generated-elsewhere'), source: 'seriouslyfish', sourceUrl: 'https://y/fish', generated: gen }
  expect(mergeRead([generatedElsewhere, mine], 'bwaquatics', page, [])).toEqual({ photos: [mine, generatedElsewhere], held: [mine] })
  const generatedHere: Photo = { ...photo('generated-here'), source: 'bwaquatics', sourceUrl: page, generated: gen }
  expect(mergeRead([generatedHere, mine], 'bwaquatics', page, [])).toEqual({ photos: [mine], held: [mine] })
})

test("an owner's crop whose source has since refused mark removal stays on its page but counts for nothing: the build hides it, so the page's last real photo stays, held", () => {
  const page = 'https://x/fish'
  const mine = { ...photo('mine'), source: 'bwaquatics' as const, sourceUrl: page }
  const crop: Photo = { ...photo('crop'), source: 'bwaquatics', sourceUrl: 'https://x/other', ownerCrop: { id: 'c1', pixelHash: 'a'.repeat(64) } }
  const refused = { bwaquatics: { publish: true, permission: { markRemoval: { allowed: false } } } }
  const allowed = { bwaquatics: { publish: true, permission: { markRemoval: { allowed: true } } } }
  expect(hiddenFromReaders({}, refused)(crop)).toBe(true)
  expect(hiddenFromReaders({}, allowed)(crop)).toBe(false)
  expect(hiddenFromReaders({}, refused)(mine)).toBe(false)
  const owned = (p: Photo) => p.url === crop.url
  expect(mergeRead([mine, crop], 'bwaquatics', page, [], { owned, gone: hiddenFromReaders({}, refused) })).toEqual({ photos: [crop, mine], held: [mine] })
  expect(mergeRead([mine, crop], 'bwaquatics', page, [], { owned, gone: hiddenFromReaders({}, allowed) })).toEqual({ photos: [crop], held: [] })
})

test("a photo still on a host that sets cookies, or one with no source and no open licence, counts for nothing: the build hides both", () => {
  const sources = { bwaquatics: { publish: true } }
  const shown = { ...photo('shown'), licence: 'CC BY-SA 4.0' }
  expect(hiddenFromReaders({}, sources)(shown)).toBe(false)
  expect(hiddenFromReaders({}, sources)({ ...shown, url: 'https://upload.wikimedia.org/x/fish.jpg' })).toBe(true)
  expect(hiddenFromReaders({}, sources)({ ...shown, licence: 'All rights reserved' })).toBe(true)
  expect(hiddenFromReaders({}, sources)({ ...shown, licence: 'All rights reserved', source: 'bwaquatics' })).toBe(false)
})

test("a photo waiting for the watermark screen isn't one a reader sees yet: a re-read whose fresh photo waits keeps the page's last shown one in front of it, held, and a page whose photos all wait keeps them", () => {
  // Grok's sixth read (14 Nov 2026): Aborichthys elongatus' one shown photo, re-read with a fresh one the screen hadn't
  // looked at, left the page with only the fresh one, which the build hides until the screen judges it.
  const page = 'https://x/fish'
  const old = { ...photo('old'), source: 'bwaquatics' as const, sourceUrl: page }
  const fresh = { ...photo('fresh'), source: 'bwaquatics' as const, sourceUrl: page }
  expect(mergeRead([old], 'bwaquatics', page, [fresh], { waits: p => p.url === fresh.url })).toEqual({ photos: [old, fresh], held: [old] })
  // Once the screen has judged it clean, the fresh one replaces the old as before.
  expect(mergeRead([old], 'bwaquatics', page, [fresh], { waits: () => false })).toEqual({ photos: [fresh], held: [] })
  // A page whose photos all wait: they stay, since each shows by itself once judged; the ones the read replaced are held.
  const w = [1, 2].map(i => ({ ...photo(`waits-${i}`), source: 'bwaquatics' as const, sourceUrl: page }))
  expect(mergeRead(w, 'bwaquatics', page, [], { waits: () => true })).toEqual({ photos: w, held: w })
  // The screen's own rule (schema's awaitsScreen): no entry waits, a judged one doesn't; no record at all, nothing waits.
  expect(waitsForScreen({})(fresh)).toBe(true)
  expect(waitsForScreen({ [fresh.url]: { ocr: [], watermark: false } })(fresh)).toBe(false)
  expect(waitsForScreen(undefined)(fresh)).toBe(false)
})

test("under the photo cap a photo a reader sees takes a seat before one no reader sees, and a page's last photos kept come to eight at most", () => {
  const page = 'https://x/fish'
  // Eight hidden photos ranked ahead of a fresh one a reader sees: the fresh one has its seat, and Commons isn't asked.
  const hidden = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ ...big(`hidden-${i}`), source: 'seriouslyfish' as const, sourceUrl: 'https://y/fish' }))
  const fresh = { ...photo('fresh'), source: 'bwaquatics' as const, sourceUrl: page }
  const gone = (p: Photo) => p.url.includes('hidden-')
  const read = mergeRead(hidden, 'bwaquatics', page, [fresh], { gone })
  expect(read.photos).toHaveLength(8)
  expect(read.photos.map(p => name(p.url))).toContain('fresh')
  expect(read.held).toEqual([])
  // Seven seen photos the read replaced, two crops the build hides and a generated photo: the page keeps eight, the crops
  // first, and only the seen ones it keeps are held.
  const mine = [1, 2, 3, 4, 5, 6, 7].map(i => ({ ...photo(`mine-${i}`), source: 'bwaquatics' as const, sourceUrl: page }))
  const crops: Photo[] = [1, 2].map(i => ({ ...photo(`crop-${i}`), source: 'bwaquatics', sourceUrl: 'https://x/other', ownerCrop: { id: `c${i}`, pixelHash: 'a'.repeat(64) } }))
  const gen: Photo = { ...photo('generated'), source: 'seriouslyfish', sourceUrl: 'https://y/fish', generated: { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', date: '2026-11-10', prompt: 'fish', referenceHash: 'a'.repeat(64) } }
  const refused = { bwaquatics: { publish: true, permission: { markRemoval: { allowed: false } } }, seriouslyfish: { publish: true } }
  const last = mergeRead([...mine, ...crops, gen], 'bwaquatics', page, [], { owned: p => !!p.ownerCrop, gone: hiddenFromReaders({}, refused) })
  expect(last.photos.map(p => name(p.url))).toEqual(['crop-1', 'crop-2', 'mine-1', 'mine-2', 'mine-3', 'mine-4', 'mine-5', 'mine-6'])
  expect(last.held.map(p => name(p.url))).toEqual(['mine-1', 'mine-2', 'mine-3', 'mine-4', 'mine-5', 'mine-6'])
})

test('at most a few photos a fish are asked about', () => {
  const head = photo('head')
  const many = Array.from({ length: TRIES + 2 }, (_, i) => big(`g${i}`))
  const allNo = Object.fromEntries(many.slice(0, TRIES).map(p => [p.url, { [head.url]: false }]))
  expect(leadChoice([head], many, yes, allNo)).toBeUndefined()
})

async function store(fish: Record<string, { photos: Photo[]; gallery?: object[] }>, days: object[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'lead-photos-'))
  await mkdir(join(root, 'engine-state'))
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  const subjects: Record<string, Record<string, object>> = {}
  for (const [id, f] of Object.entries(fish)) {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), `${JSON.stringify({ id, photos: f.photos }, null, 2)}\n`)
    if (f.gallery) await writeFile(join(root, 'content/gallery', `${id}.json`), JSON.stringify({ id, photos: f.gallery }))
    for (const p of [...f.photos, ...(f.gallery ?? [])] as Photo[]) (subjects[p.url] ??= {})[id] = { ok: 'yes', typical: true, note: '', person: false, logo: false }
  }
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(subjects))
  await writeFile(join(root, 'content/curation.json'), JSON.stringify({ version: 1, weeks: [], days, loops: {}, avoid: {}, off: {} }))
  return root
}
const entity = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { photos: (Photo & { best?: boolean })[] }

function model(answer: (photo: string) => boolean, inCrop: (photo: string) => boolean = yes) {
  const seen: string[][] = []
  let got: string[] = []
  const d: LeadDeps = {
    get: async u => { got.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const sheet = got; got = []
      seen.push(sheet)
      return { pairs: Array.from({ length: sheet.length / 2 }, (_, i) => ({ n: i + 1, asWell: answer(sheet[2 * i + 1]!), headInCrop: inCrop(sheet[2 * i + 1]!) })) }
    },
  }
  return { d, seen }
}

test('the Altum: a head too small for the card gives way to a gallery photo the model says is as good, and it stays there on the next run', async () => {
  // The owner (2026-11-10): the card and the page showed different photos, and the head was 608 px across.
  const root = await store({ altum: { photos: [photo('head', 960, 638)], gallery: [{ ...big('gal'), best: true, kind: 'portrait', caption: 'c' }] } })
  const { d, seen } = model(() => true)
  const r = await screenLeads(root, d, { limit: 5 })
  expect(seen).toEqual([['head', 'gal']])
  expect(r.changed).toEqual([`species/altum: ${url('head')} -> ${url('gal')}`])
  const after = await entity(root, 'altum')
  expect(after.photos.map(p => name(p.url))).toEqual(['gal', 'head'])
  expect(after.photos[0]).not.toHaveProperty('best')
  expect(after.photos[0]).not.toHaveProperty('kind')
  expect((await screenLeads(root, d, { limit: 5 })).changed).toEqual([])
  expect(seen).toHaveLength(1)
})

test('a no leaves the head, and the next photo is asked in the same run; no answer changes nothing', async () => {
  const root = await store({ a: { photos: [photo('head')], gallery: [big('tiny-fish'), big('fine')] }, b: { photos: [photo('b-head')], gallery: [big('b-no')] } })
  const { d, seen } = model(p => p === 'fine')
  const r = await screenLeads(root, d, { limit: 5 })
  expect(seen.flat()).toEqual(['head', 'tiny-fish', 'b-head', 'b-no', 'head', 'fine'])
  expect((await entity(root, 'a')).photos.map(p => name(p.url))).toEqual(['fine', 'head'])
  expect((await entity(root, 'b')).photos.map(p => name(p.url))).toEqual(['b-head'])
  expect(r.changed).toHaveLength(1)

  const root2 = await store({ a: { photos: [photo('head')], gallery: [big('gal')] } })
  const none = await screenLeads(root2, model(yes).d, { limit: 0 })
  expect(none).toMatchObject({ sheets: 0, waiting: 1, changed: [] })
  expect((await entity(root2, 'a')).photos.map(p => name(p.url))).toEqual(['head'])
})

test("a photo on the calendar's avoid list doesn't lead; --calendar touches only the coming days' fish, which are asked about first", async () => {
  const days = [{ date: '2099-01-01', fish: 'species/zzz' }]
  const fish = { aaa: { photos: [photo('a-head')], gallery: [big('a-gal')] }, zzz: { photos: [photo('z-head')], gallery: [big('z-avoided'), big('z-gal')] } }
  const root = await store(fish, days)
  const cal = JSON.parse(await readFile(join(root, 'content/curation.json'), 'utf8'))
  await writeFile(join(root, 'content/curation.json'), JSON.stringify({ ...cal, avoid: { [url('z-avoided')]: 'a ruler in the picture' } }))
  const { d, seen } = model(yes)
  await screenLeads(root, d, { limit: 1, calendar: true })
  expect(seen).toEqual([['z-head', 'z-gal']])
  expect((await entity(root, 'zzz')).photos.map(p => name(p.url))).toEqual(['z-gal', 'z-head'])
  expect((await entity(root, 'aaa')).photos.map(p => name(p.url))).toEqual(['a-head'])
})

test("--calendar fills an empty page with no model call; a plant is given a first photo and otherwise left alone", async () => {
  const root = await store({
    aaa: { photos: [photo('a-head')], gallery: [big('a-gal')] }, empty: { photos: [], gallery: [photo('e-gal', 500, 400)] },
    // A fish its source's caption calls unwell, or names a damaged fin of, is no page's first photo: not by the card's
    // checks, and not as the one photo with its source's own mark.
    sickly: { photos: [], gallery: [{ ...photo('s-gal', 500, 400), caption: 'Recently-deceased specimen.' }] },
    marked: { photos: [], gallery: [{ ...photo('m-gal', 500, 400), sourceUrl: 'https://www.aquariumglaser.de/en/x/', caption: 'Adult with a slightly damaged caudal fin.' }] },
  })
  const subjects = JSON.parse(await readFile(join(root, 'engine-state/_photo-subjects.json'), 'utf8'))
  subjects[url('m-gal')].marked.logo = true
  const ok = { ok: 'yes', typical: true, note: '', person: false, logo: false }
  await mkdir(join(root, 'content/plants/bare'), { recursive: true })
  await mkdir(join(root, 'content/plants/full'), { recursive: true })
  await writeFile(join(root, 'content/plants/bare/entity.json'), JSON.stringify({ id: 'bare', photos: [] }))
  await writeFile(join(root, 'content/plants/full/entity.json'), JSON.stringify({ id: 'full', photos: [photo('p-head')] }))
  // A plant's caption is not asked: a damaged leaf is no unwell fish.
  await writeFile(join(root, 'content/gallery/bare.json'), JSON.stringify({ id: 'bare', photos: [{ ...photo('p-gal'), caption: 'A slightly damaged leaf.' }] }))
  await writeFile(join(root, 'content/gallery/full.json'), JSON.stringify({ id: 'full', photos: [big('p-big')] }))
  for (const [u, id] of [[url('p-gal'), 'bare'], [url('p-head'), 'full'], [url('p-big'), 'full']] as const) (subjects[u] ??= {})[id] = ok
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(subjects))
  const { d, seen } = model(yes)
  const r = await screenLeads(root, d, { limit: 3, calendar: true })
  expect(seen).toEqual([])
  expect(r.gained).toHaveLength(2)
  expect((await entity(root, 'empty')).photos.map(p => name(p.url))).toEqual(['e-gal'])
  expect((await entity(root, 'aaa')).photos.map(p => name(p.url))).toEqual(['a-head'])
  expect((await entity(root, 'sickly')).photos).toEqual([])
  expect((await entity(root, 'marked')).photos).toEqual([])
  const plant = async (id: string) => (JSON.parse(await readFile(join(root, 'content/plants', id, 'entity.json'), 'utf8')) as { photos: Photo[] }).photos.map(p => name(p.url))
  expect(await plant('bare')).toEqual(['p-gal'])
  expect(await plant('full')).toEqual(['p-head'])
})

test('a gallery photo that waits for the photo check leads no page, whatever an old verdict says of it', async () => {
  const root = await store({ waits: { photos: [], gallery: [{ ...photo('w-gal', 500, 400), unchecked: true }] }, shown: { photos: [], gallery: [photo('s-gal', 500, 400)] } })
  await screenLeads(root, model(yes).d, { limit: 3 })
  expect((await entity(root, 'waits')).photos).toEqual([])
  expect((await entity(root, 'shown')).photos.map(p => name(p.url))).toEqual(['s-gal'])
})

test("a download that fails leaves that pair out of the sheet, and the others are still numbered right", async () => {
  const root = await store({ a: { photos: [photo('a-head')], gallery: [big('gone')] }, b: { photos: [photo('b-head')], gallery: [big('b-gal')] } })
  const d: LeadDeps = {
    get: async u => { if (u.includes('gone')) throw new Error('HTTP 404'); return new Uint8Array(await jpeg) },
    look: async () => ({ pairs: [{ n: 1, asWell: true, headInCrop: true }] }),
  }
  const r = await screenLeads(root, d, { limit: 1 })
  expect(r.failed).toHaveLength(1)
  expect((await entity(root, 'b')).photos.map(p => name(p.url))).toEqual(['b-gal', 'b-head'])
  expect((await entity(root, 'a')).photos.map(p => name(p.url))).toEqual(['a-head'])
})

test("a photo as good as the head that loses the fish's head to the card's crop doesn't lead, and the old head stays (the clown loach, 2026-11-10)", async () => {
  const root = await store({ a: { photos: [photo('head')], gallery: [big('tail-half')] } })
  const r = await screenLeads(root, model(() => true, () => false).d, { limit: 5 })
  expect(r.changed).toEqual([])
  expect((await entity(root, 'a')).photos.map(p => name(p.url))).toEqual(['head'])
  const asked = JSON.parse(await readFile(join(root, 'engine-state/_photo-leads.json'), 'utf8'))
  expect(asked[url('tail-half')][url('head')]).toBe(false)
})

test('an answer that says nothing about the crop is a no', async () => {
  const root = await store({ a: { photos: [photo('head')], gallery: [big('gal')] } })
  const d: LeadDeps = { get: async () => new Uint8Array(await jpeg), look: async () => ({ pairs: [{ n: 1, asWell: true }] }) }
  await screenLeads(root, d, { limit: 1 })
  expect((await entity(root, 'a')).photos.map(p => name(p.url))).toEqual(['head'])
})

test("each pair goes to the model with, beside it, the second photo as the card crops it", async () => {
  const root = await store({ a: { photos: [photo('head')], gallery: [big('gal')] } })
  let width = 0
  const d: LeadDeps = {
    get: async () => new Uint8Array(await jpeg),
    look: async sheet => { width = (await sharp(sheet).metadata()).width!; return { pairs: [{ n: 1, asWell: false, headInCrop: true }] } },
  }
  await screenLeads(root, d, { limit: 1 })
  expect(width).toBe(3 * (640 + 6))
})

test("the card's crop is the middle of the picture, at the card's shape", async () => {
  const third = (colour: string) => sharp({ create: { width: 300, height: 300, channels: 3, background: colour } }).png().toBuffer()
  const wide = await sharp({ create: { width: 900, height: 300, channels: 3, background: '#000' } })
    .composite([{ input: await third('#f00'), left: 0, top: 0 }, { input: await third('#0f0'), left: 300, top: 0 }, { input: await third('#00f'), left: 600, top: 0 }]).png().toBuffer()
  const { data, info } = await sharp(await cardCrop(wide)).raw().toBuffer({ resolveWithObject: true })
  expect(info.width / info.height).toBeCloseTo(400 / 420, 2)
  const pixel = (x: number) => [data[info.height * 0.5 * info.width * info.channels + x * info.channels]!, data[info.height * 0.5 * info.width * info.channels + x * info.channels + 1]!, data[info.height * 0.5 * info.width * info.channels + x * info.channels + 2]!]
  for (const x of [4, info.width - 5]) { const [r, g, b] = pixel(x); expect(g).toBeGreaterThan(200); expect(r).toBeLessThan(40); expect(b).toBeLessThan(40) }
})

test('a change of head goes back, with no model call, when the old head now fills the card or a look has since said no', () => {
  const promoted = big('cut-out'), small = photo('old')
  const group = { ...photo('group', 960, 640), large: { url: url('group-large'), width: 1800, height: 1200 } }
  // The Altum: the old head has its large copy now, so the reason for the change is gone.
  expect(leadChoice([promoted, group], [], yes, { [promoted.url]: { [group.url]: true } })).toEqual({ lead: group })
  expect(leadChoice([promoted, group], [], p => p.url !== group.url, { [promoted.url]: { [group.url]: true } })).toBeUndefined()
  // Still small and nobody said no: the change stands.
  expect(leadChoice([promoted, small], [], yes, { [promoted.url]: { [small.url]: true } })).toBeUndefined()
  // The sebae: a look said no, so the old head comes back, small as it is, and the other doesn't lead again.
  expect(leadChoice([promoted, small], [], yes, { [promoted.url]: { [small.url]: false } })).toEqual({ lead: small })
  expect(leadChoice([small, promoted], [], yes, { [promoted.url]: { [small.url]: false } })).toBeUndefined()
})

test('the guard asks about the whole head, snout to gill cover, not an eye inside the picture (the Devario, 2026-11-10)', () => {
  expect(HEAD_IN_CROP).toMatch(/tip of its snout to its gill cover/)
  expect(HEAD_IN_CROP).toMatch(/an eye inside the picture is not enough/)
})
