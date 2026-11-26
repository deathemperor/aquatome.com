import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test, vi } from 'vitest'
import { loadAll, type Content } from '@aq/schema'
import { LANGS } from '@aq/schema/langs'
import { localizePath } from '../src/lib/i18n'
import { albumOf, hasAlbum } from '../src/lib/photo-page'
import { plantParts } from '../src/lib/plant-page'
import { renamedPages } from '../src/lib/renamed'
import { sitemapEntries } from '../src/lib/sitemap'
import { galleryParent } from '../worker/paths'

// Live checks 43567146477, 43569272679 and 43570533645, 14 Nov 2026: the sitemap listed a plant's photo page in Malay
// (/ms/tumbuhan/cryptocoryne-spiralis-red/foto/) that the build never made. Its gallery holds 6 files, two of them one
// picture (perceptual hashes 5 bits apart), and an album counts 6 distinct pictures. Since 18 Nov an album opens over its
// fish's or plant's page and has no page of its own (the owner, 17 Nov: "opening a new page for it is unnecessary"):
// every address it had forwards to that page.
let content: Content
vi.mock('../src/lib/content', () => ({ getContent: async () => content }))

let base: Content
beforeAll(async () => {
  base = await loadAll({ root: fileURLToPath(new URL('./fixture-content', import.meta.url)), lang: 'vi', publicBuild: false })
})

// Distinct pictures and two files of the same picture (one bit apart).
const FAR = ['0000000000000000', 'ffffffffffffffff', '00000000ffffffff', 'ffffffff00000000', '0000ffff0000ffff', 'ffff0000ffff0000']
const SAME = [FAR[0]!, '0000000000000001']
const PLANT = 'cryptocoryne-wendtii'

/** The fixture with the plant's gallery as photos whose pictures have these hashes. */
function withGallery(hashes: string[]): Content {
  const photos = base.galleries[PLANT]!.slice(0, hashes.length)
  expect(photos).toHaveLength(hashes.length)
  return { ...base, galleries: { ...base.galleries, [PLANT]: photos }, pictureHashes: { ...base.pictureHashes, ...Object.fromEntries(photos.map((p, i) => [p.url, hashes[i]!])) } }
}

test('one distinct picture is enough for an album', () => {
  const plant = { id: PLANT }
  const album = albumOf(withGallery(SAME), 'plants', plant)
  expect(album).toHaveLength(1)
  expect(hasAlbum(album)).toBe(true)
  expect(hasAlbum([])).toBe(false)
})

test('a plant shows a strip only when the album adds a picture to its lead', () => {
  const plant = base.plants.find(p => p.id === PLANT)!
  const lead = plant.photos[0]!
  const extra = base.galleries[PLANT]!.find(p => p.url !== lead.url)!
  const withPhotos = (...photos: typeof plant.photos) =>
    plantParts('vi', { ...base, galleries: { ...base.galleries, [PLANT]: photos }, pictureHashes: {} }, plant)

  expect(withPhotos(lead, extra).strip).toEqual([null, extra])
  expect(withPhotos(lead).strip.filter(Boolean)).toEqual([])
})

// The strip's reader, 21 Nov: an album's order is its photos' addresses (an old /anh/ address's #aN opens the Nth) and the
// app's album order, so it stays the gallery's, a marked Glaser photo first included.
test('an album keeps its gallery\'s order, a marked Glaser photo first included', () => {
  const clean = base.galleries[PLANT]![0]!
  const marked = { ...base.galleries[PLANT]![1]!, source: 'glaser' as const }
  const content = { ...base, galleries: { [PLANT]: [marked, clean] }, pictureHashes: {} }
  expect(albumOf(content, 'plants', { id: PLANT })).toEqual([marked, clean])
})

test('the browser fixtures have a two-photo album with its lead and a lead-only album', async () => {
  for (const [id, count] of [['paracheirodon-innesi', 2], ['boraras-brigittae', 1]] as const) {
    const fish = base.species.find(s => s.id === id)!
    const album = albumOf(base, 'species', fish)
    expect(album).toHaveLength(count)
    expect(album[0]?.url).toBe(fish.photos[0]?.url)
  }
})

test('the sitemap lists no photo page, in any language, a plant with an album or not', async () => {
  const slug = base.plants.find(p => p.id === PLANT)!.t.slug
  for (const c of [withGallery(FAR), withGallery([])]) {
    content = c
    const entries = await sitemapEntries()
    expect(entries.filter(e => e.path.includes(`/${slug}/`)).length, 'the plant\'s own pages are listed').toBeGreaterThanOrEqual(LANGS.length)
    expect(entries.filter(e => galleryParent(e.path)).map(e => e.path)).toEqual([])
  }
})

test("a renamed plant's old photo address leads to its page in one step, at any album length", () => {
  const renamed = (c: Content): Content => ({ ...c, plants: c.plants.map(p => (p.id === PLANT ? { ...p, t: { ...p.t, redirectFrom: [{ slug: 'ten-cu', name: 'Tên cũ' }] } } : p)) })
  const slug = base.plants.find(p => p.id === PLANT)!.t.slug
  expect(renamedPages(renamed(withGallery(FAR)))['/cay/ten-cu/anh/']).toBe(`/cay/${slug}/`)
  const short = renamedPages(renamed(withGallery([])))
  expect(short['/cay/ten-cu/']).toBe(`/cay/${slug}/?tu=ten-cu`)
  expect(short['/cay/ten-cu/anh/']).toBe(`/cay/${slug}/`)
})

// Each language's photo page addresses, written out: the Worker forwards each to its fish's or plant's page, and is asked
// for it (run_worker_first). The Malay one once answered 404 where the Vietnamese one forwarded: its pattern and its line
// had left Malay out. A language that joins fails here until its two forms are listed.
const FORMS: Record<string, [string, string][]> = {
  vi: [['/ca/x/anh/', '/ca/x/'], ['/cay/x/anh/', '/cay/x/']],
  id: [['/id/ikan/x/foto/', '/id/ikan/x/'], ['/id/tanaman/x/foto/', '/id/tanaman/x/']],
  th: [['/th/fish/x/photos/', '/th/fish/x/'], ['/th/plants/x/photos/', '/th/plants/x/']],
  ms: [['/ms/ikan/x/foto/', '/ms/ikan/x/'], ['/ms/tumbuhan/x/foto/', '/ms/tumbuhan/x/']],
}
test('every photo page address forwards to its page in every language, and the Worker is asked for it', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  const first: string[] = config.assets.run_worker_first
  const glob = (p: string) => new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  expect(Object.keys(FORMS).sort()).toEqual([...LANGS].sort())
  for (const lang of LANGS) {
    expect(FORMS[lang]!.map(([from]) => from)).toEqual(['ca', 'cay'].map(kind => localizePath(lang, `/vi/${kind}/x/anh/`)))
    for (const [from, to] of FORMS[lang]!) {
      expect(galleryParent(from), from).toBe(to)
      expect(galleryParent(from.slice(0, -1)), from).toBe(to)
      expect(first.some(r => !r.startsWith('!') && glob(r).test(from)), `${from}: its line in run_worker_first`).toBe(true)
    }
  }
})
