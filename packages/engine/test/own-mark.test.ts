import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { cardWorthy, ownMarkOnly, type Verdicts } from '../src/curation'
import { galleries, orderAlbums, rankGallery, type GalleryPhoto } from '../src/gallery'
import { leadChoice } from '../src/lead-photo'
import { OWN_MARK_SHOPS, retainedOwnMark } from '../src/own-mark'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { compactScreen } from '../src/photo-observations'
import { SOURCES } from '../src/sources'
import { screenWatermarks } from '../src/watermarks'

// A cleared shop's own mark on its own photo, kept by a record (the chief of staff, 15 Nov): through the watermark
// screen, the photo check and the album clean-up. Without the record, or with a third party's, it goes back on the
// never-again list.

/** One of each cleared shop's own pages. */
const PAGE: Record<keyof typeof OWN_MARK_SHOPS, string> = {
  glaser: 'https://www.aquariumglaser.de/en/fish/betta_x_en/',
  bwaquatics: 'https://bwaquatics.com/products/betta-x',
}
const SHOPS = Object.keys(PAGE) as (keyof typeof OWN_MARK_SHOPS)[]
const ID = 'betta-x'
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const photo = (url: string, source?: string, sourceUrl = 'https://example.org/x') => ({ url, thumb: url.replace('.webp', '-480.webp'), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl, ...(source ? { source } : {}) })
const OWN = 'https://media.example/own.webp', CLEAN = 'https://media.example/clean.webp'
type Record_ = { source: string; sourceUrl: string; owner: string }

/** A page with one photo of its own, and an album: the marked photo first, then a clean one. */
async function site(marked: { url: string; source: string; sourceUrl: string }, record?: Record_) {
  const r = await mkdtemp(join(tmpdir(), 'aq-own-mark-'))
  await mkdir(join(r, 'content/species', ID), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await writeFile(join(r, 'content/species', ID, 'entity.json'), JSON.stringify({ id: ID, scientificName: 'Betta x', photos: [photo(OWN)] }))
  await writeFile(join(r, 'content/species', ID, 'vi.json'), JSON.stringify({ name: 'Cá x' }))
  await writeFile(join(r, 'content/gallery', `${ID}.json`), JSON.stringify({ id: ID, photos: [photo(marked.url, marked.source, marked.sourceUrl), photo(CLEAN)], seen: 0, updatedAt: '' }))
  const plain = { ocr: [], watermark: false, kind: 'none' }
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [OWN]: plain, [CLEAN]: plain, [marked.url]: { ocr: [], watermark: true, kind: 'logo', ...(record ? { retainedOwnMark: record } : {}) } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), '{}')
  return r
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const album = async (r: string) => ((await json(r, `content/gallery/${ID}.json`)).photos as { url: string }[]).map(p => p.url)
const refuse = (what: string) => async () => { throw new Error(`no ${what} in this test`) }

/** The photo check's model: the marked photo is the fish, typical, with a logo; every other photo the fish, typical. */
function model(marked: string): PhotoCheckDeps {
  let fetched: string[] = []
  return {
    get: async u => { fetched.push(u); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched.map((u, i) => ({ n: i + 1, ok: 'yes', typical: true, note: 'x', ...(u === marked ? { logo: true } : {}) }) as { n: number } & PhotoVerdict)
      fetched = []
      return { photos }
    },
  }
}

/** The three steps in turn, as a cycle runs them; after each, whether the marked photo is in the album and listed. */
async function steps(r: string, marked: string) {
  const at = async () => ({ album: (await album(r)).includes(marked), listed: marked in (await json(r, 'engine-state/_photo-rejected.json')) })
  const out: Record<string, { album: boolean; listed: boolean }> = {}
  await screenWatermarks(r, join(r, 'engine-state/_photo-watermarks.json'), join(r, 'engine-state/_photo-rejected.json'), { get: refuse('fetch'), read: refuse('text reader'), look: refuse('model') }, { limit: 0 })
  out.screen = await at()
  await checkPagePhotos(r, model(marked), { limit: 10, only: ID, emptyCap: 99 })
  out.check = await at()
  await galleries(r, { http: refuse('request'), get: refuse('fetch'), faces: async fs => fs.map(() => 0), look: refuse('model'), sleep: async () => {}, now: () => new Date('2026-11-15T00:00:00Z') }, { sheets: 0, only: ID, budget: { inat: 0, gbif: 0, openverse: 0 } })
  out.album = await at()
  return out
}
const kept = { album: true, listed: false }, refused = { album: false, listed: true }

test('the cleared shops are the sources read as shops, each with the owner\'s grant for its photos', async () => {
  const granted = JSON.parse(await readFile(new URL('../../../content/sources.json', import.meta.url), 'utf8')) as Record<string, { permission?: { scope?: string[] } }>
  expect(Object.keys(OWN_MARK_SHOPS).sort()).toEqual(SOURCES.filter(s => s.shop).map(s => s.id).sort())
  expect(Object.keys(PAGE).sort()).toEqual(Object.keys(OWN_MARK_SHOPS).sort())
  for (const shop of SHOPS) expect(granted[shop]?.permission?.scope).toContain('photos')
})

test.each(SHOPS)('%s: its marked photo with a record stays through the watermark screen, the photo check and the album clean-up', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] }, { source: shop, sourceUrl: PAGE[shop], owner: 'source' })
  expect(await steps(r, marked)).toEqual({ screen: kept, check: kept, album: kept })
  // The check's verdict stands, logo and all: it is kept, not cleared.
  expect((await json(r, 'engine-state/_photo-subjects.json'))[marked][ID]).toMatchObject({ ok: 'yes', logo: true })
  // After the unmarked photos in its album.
  await orderAlbums(r, await json(r, 'engine-state/_photo-subjects.json'))
  expect(await album(r)).toEqual([CLEAN, marked])
})

test.each(SHOPS)('%s: the same photo without a record goes back on the never-again list and out of the album', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] })
  expect(await steps(r, marked)).toEqual({ screen: refused, check: refused, album: refused })
  expect((await json(r, 'engine-state/_photo-rejected.json'))[marked]).toMatch(/^watermark: /)
})

test.each(SHOPS)('%s: with no screen record at all, the photo check lists it on its logo', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] })
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), '{}')
  await checkPagePhotos(r, model(marked), { limit: 10, only: ID, emptyCap: 99 })
  expect((await json(r, 'engine-state/_photo-rejected.json'))[marked]).toMatch(/^watermark: /)
  expect(await album(r)).toEqual([CLEAN])
})

// A third party's mark: a photographer's or an archive's, a source that isn't a cleared shop, another source's photo, or
// a record that names a page off the shop's own site.
const THIRD: [string, { url: string; source: string; sourceUrl: string }, Record_ | undefined][] = [
  ['a photographer\'s mark on a shop\'s photo', { url: 'https://media.aquatome.com/bwaquatics/marked.webp', source: 'bwaquatics', sourceUrl: PAGE.bwaquatics }, { source: 'bwaquatics', sourceUrl: PAGE.bwaquatics, owner: 'photographer' }],
  ['a source that is not a shop, its own mark recorded', { url: 'https://media.aquatome.com/seriouslyfish/marked.webp', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/betta-x/' }, { source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/betta-x/', owner: 'source' }],
  ['a source that is not a shop, no record', { url: 'https://media.aquatome.com/seriouslyfish/marked.webp', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/betta-x/' }, undefined],
  ['another source\'s photo under a shop\'s record', { url: 'https://media.aquatome.com/seriouslyfish/marked.webp', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/betta-x/' }, { source: 'glaser', sourceUrl: PAGE.glaser, owner: 'source' }],
  ['a shop\'s record naming a page off its site', { url: 'https://media.aquatome.com/glaser/marked.webp', source: 'glaser', sourceUrl: PAGE.glaser }, { source: 'glaser', sourceUrl: 'https://archive.example/glaser/betta-x', owner: 'source' }],
  ['one shop\'s photo under another shop\'s record', { url: 'https://media.aquatome.com/bwaquatics/marked.webp', source: 'bwaquatics', sourceUrl: PAGE.bwaquatics }, { source: 'glaser', sourceUrl: PAGE.glaser, owner: 'source' }],
]
test.each(THIRD)('a third party\'s mark is refused: %s', async (_, marked, record) => {
  const r = await site(marked, record)
  expect(await steps(r, marked.url)).toEqual({ screen: refused, check: refused, album: refused })
})

test('a screen record keeps a cleared shop\'s kept mark and drops any other', () => {
  const rec = (source: string, owner = 'source') => compactScreen({ ocr: [], watermark: true, kind: 'logo', retainedOwnMark: { source, sourceUrl: 'https://bwaquatics.com/products/x', owner } })
  expect(rec('bwaquatics').retainedOwnMark).toEqual({ source: 'bwaquatics', sourceUrl: 'https://bwaquatics.com/products/x', owner: 'source' })
  expect(rec('glaser').retainedOwnMark).toBeDefined()
  expect(rec('seriouslyfish').retainedOwnMark).toBeUndefined()
  expect(rec('bwaquatics', 'photographer').retainedOwnMark).toBeUndefined()
  // Read back, the record still has to match the photo's folder and the shop's site.
  expect(retainedOwnMark('https://media.aquatome.com/bwaquatics/a.webp', rec('bwaquatics'))).toBe(true)
  expect(retainedOwnMark('https://media.aquatome.com/glaser/a.webp', rec('glaser'))).toBe(false)
})

test('an album puts kept-mark photos after every unmarked one, ordered the same way, and AI pictures last', () => {
  const p = (n: string, o: Partial<GalleryPhoto> = {}) => ({ ...photo(`https://media.example/${n}.webp`), ...o }) as GalleryPhoto
  const shopBest = p('shop-best', { best: true }), shopB = p('shop-b'), a = p('a'), b = p('b'), ai = p('ai', { generated: { by: 'x', on: '2026-11-15' } } as unknown as Partial<GalleryPhoto>)
  const marked = new Set([shopBest.url, shopB.url])
  const ranked = rankGallery([shopBest, ai, a, shopB, b], undefined, undefined, undefined, undefined, u => marked.has(u))
  expect(ranked.map(x => x.url.split('/').pop())).toEqual(['a.webp', 'b.webp', 'shop-best.webp', 'shop-b.webp', 'ai.webp'])
  // Twice changes nothing.
  expect(rankGallery(ranked, undefined, undefined, undefined, undefined, u => marked.has(u))).toEqual(ranked)
})

test('a kept-mark photo is never a card and never leads, whatever its verdict says of a logo; only Glaser\'s leads where nothing else passes', () => {
  const bw = { ...photo('https://media.aquatome.com/bwaquatics/marked.webp', 'bwaquatics', PAGE.bwaquatics) } as GalleryPhoto
  const gl = { ...photo('https://media.aquatome.com/glaser/marked.webp', 'glaser', PAGE.glaser) } as GalleryPhoto
  // The check missed a small credit: yes, typical, no logo.
  const missed: Verdicts = { subjects: { [bw.url]: { [ID]: { ok: 'yes', typical: true, note: 'x' } } }, legacy: {}, rejected: {}, faces: {} }
  expect(cardWorthy(bw, ID, missed, {})).toBe(true)
  const v = { ...missed, kept: (u: string) => u === bw.url }
  expect(cardWorthy(bw, ID, v, {})).toBe(false)
  // A page with no head of its own and only the kept photo in its album: no lead.
  const passes = (p: { url: string }) => cardWorthy(p, ID, v, {})
  expect(leadChoice([], [bw], passes, {}, p => ownMarkOnly(p, ID, v, {}))).toBeUndefined()
  // Seen with its logo, a BW photo still doesn't lead where nothing else passes; Glaser's does (2026-11-10).
  const logo = (u: string): Verdicts => ({ subjects: { [u]: { [ID]: { ok: 'yes', typical: true, logo: true, note: 'x' } } }, legacy: {}, rejected: {}, faces: {} })
  expect(ownMarkOnly(bw, ID, logo(bw.url), {})).toBe(false)
  expect(ownMarkOnly(gl, ID, logo(gl.url), {})).toBe(true)
})

test.each(SHOPS)('%s: a kept-mark photo among a page\'s own photos goes after the unmarked ones and gives up the head, whatever its verdict says of a logo', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] }, { source: shop, sourceUrl: PAGE[shop], owner: 'source' })
  // A re-read of the shop's page put it first among the page's own photos; the check misses the credit.
  await writeFile(join(r, 'content/species', ID, 'entity.json'), JSON.stringify({ id: ID, scientificName: 'Betta x', photos: [photo(marked, shop, PAGE[shop]), photo(OWN)] }))
  let fetched: string[] = []
  await checkPagePhotos(r, { get: async u => { fetched.push(u); return new Uint8Array(await jpeg) }, look: async () => {
    const photos = fetched.map((_, i) => ({ n: i + 1, ok: 'yes', typical: true, note: 'x' }) as { n: number } & PhotoVerdict)
    fetched = []
    return { photos }
  } }, { limit: 10, only: ID, emptyCap: 99 })
  expect(((await json(r, `content/species/${ID}/entity.json`)).photos as { url: string }[]).map(p => p.url)).toEqual([OWN, marked])
  // The lead step, given that page in the old order: the kept-mark head gives way to the photo that passes.
  const v = { subjects: { [marked]: { [ID]: { ok: 'yes', typical: true, note: 'x' } }, [OWN]: { [ID]: { ok: 'yes', typical: true, note: 'x' } } }, legacy: {}, rejected: {}, faces: {}, kept: (u: string) => u === marked } as Verdicts
  const head = photo(marked, shop, PAGE[shop]) as GalleryPhoto, other = photo(OWN) as GalleryPhoto
  expect(leadChoice([head, other], [], p => cardWorthy(p, ID, v, {}), {}, p => ownMarkOnly(p, ID, v, {}), () => 0, p => !!v.kept?.(p.url))).toEqual({ lead: other })
})

test.each(SHOPS)('%s: after the photo check, a kept-mark photo named to the species goes after an unmarked one its source names only to the genus', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] }, { source: shop, sourceUrl: PAGE[shop], owner: 'source' })
  const genus = { ...photo('https://media.example/genus.webp', undefined, 'https://commons.wikimedia.org/wiki/File:Betta_sp.jpg'), caption: 'Betta sp.' }
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ ...(await json(r, 'engine-state/_photo-watermarks.json')), [genus.url]: { ocr: [], watermark: false, kind: 'none' } }))
  await writeFile(join(r, 'content/species', ID, 'entity.json'), JSON.stringify({ id: ID, scientificName: 'Betta x', photos: [photo(OWN), genus, { ...photo(marked, shop, PAGE[shop]), caption: 'Betta x' }] }))
  await checkPagePhotos(r, model(marked), { limit: 10, only: ID, emptyCap: 99 })
  expect(((await json(r, `content/species/${ID}/entity.json`)).photos as { url: string }[]).map(p => p.url)).toEqual([OWN, genus.url, marked])
})

test.each(SHOPS)('%s: on a breed\'s page, the photo check puts a kept-mark head after an unmarked photo', async shop => {
  const marked = `https://media.aquatome.com/${shop}/marked.webp`
  const r = await site({ url: marked, source: shop, sourceUrl: PAGE[shop] }, { source: shop, sourceUrl: PAGE[shop], owner: 'source' })
  await mkdir(join(r, 'content/breeds/betta-x-blue'), { recursive: true })
  await writeFile(join(r, 'content/breeds/betta-x-blue/entity.json'), JSON.stringify({ id: 'betta-x-blue', kind: 'variety', photos: [photo(marked, shop, PAGE[shop]), photo(OWN)], sources: [] }))
  await writeFile(join(r, 'content/breeds/betta-x-blue/vi.json'), JSON.stringify({ name: 'Cá x xanh' }))
  await checkPagePhotos(r, model(marked), { limit: 10, only: 'betta-x-blue', emptyCap: 99 })
  expect(((await json(r, 'content/breeds/betta-x-blue/entity.json')).photos as { url: string }[]).map(p => p.url)).toEqual([OWN, marked])
})
