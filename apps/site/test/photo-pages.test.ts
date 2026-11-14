import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test, vi } from 'vitest'
import { loadAll, type Content } from '@aq/schema'
import { LANGS } from '@aq/schema/langs'
import { localizePath } from '../src/lib/i18n'
import { albumOf, hasPhotoPage } from '../src/lib/photo-page'
import { renamedPages } from '../src/lib/renamed'
import { sitemapEntries } from '../src/lib/sitemap'
import { galleryParent } from '../worker/paths'

// Live checks 43567146477, 43569272679 and 43570533645, 14 Nov 2026: the sitemap listed a plant's photo page in Malay
// (/ms/tumbuhan/cryptocoryne-spiralis-red/foto/) that the build never made. Its gallery holds 6 files, two of them one
// picture (perceptual hashes 5 bits apart), and the page is built from 6 distinct pictures (pages/cay/[slug]/anh.astro).
let content: Content
vi.mock('../src/lib/content', () => ({ getContent: async () => content }))

let base: Content
beforeAll(async () => {
  base = await loadAll({ root: fileURLToPath(new URL('./fixture-content', import.meta.url)), lang: 'vi', publicBuild: false })
})

// Six pictures far apart, and the same six with the last a second file of the first (one bit off: the same picture).
const FAR = ['0000000000000000', 'ffffffffffffffff', '00000000ffffffff', 'ffffffff00000000', '0000ffff0000ffff', 'ffff0000ffff0000']
const ONE_SHORT = [...FAR.slice(0, 5), '0000000000000001']
const PLANT = 'cryptocoryne-wendtii'

/** The fixture with the plant's gallery as six photos whose pictures have these hashes. */
function withGallery(hashes: string[]): Content {
  const photos = base.galleries[PLANT]!.slice(0, 6)
  expect(photos).toHaveLength(6)
  return { ...base, galleries: { ...base.galleries, [PLANT]: photos }, pictureHashes: { ...base.pictureHashes, ...Object.fromEntries(photos.map((p, i) => [p.url, hashes[i]!])) } }
}

test('a gallery of six files is a photo page only when they are six pictures', () => {
  const plant = { id: PLANT }
  expect(albumOf(withGallery(ONE_SHORT), 'plants', plant)).toHaveLength(5)
  expect(hasPhotoPage(albumOf(withGallery(ONE_SHORT), 'plants', plant))).toBe(false)
  expect(hasPhotoPage(albumOf(withGallery(FAR), 'plants', plant))).toBe(true)
})

test("the sitemap lists a plant's photo page only when the build makes it", async () => {
  const slug = base.plants.find(p => p.id === PLANT)!.t.slug
  const listed = async () => (await sitemapEntries()).filter(e => e.kind === 'plant-photos' && e.path.includes(`/${slug}/`)).map(e => e.path)
  content = withGallery(FAR)
  expect((await listed()).sort()).toEqual(LANGS.map(l => localizePath(l, `/vi/cay/${slug}/anh/`)).sort())
  content = withGallery(ONE_SHORT)
  expect(await listed()).toEqual([])
})

test("a renamed plant's old photo address leads to its photo page only when it has one", () => {
  const renamed = (c: Content): Content => ({ ...c, plants: c.plants.map(p => (p.id === PLANT ? { ...p, t: { ...p.t, redirectFrom: [{ slug: 'ten-cu', name: 'Tên cũ' }] } } : p)) })
  const slug = base.plants.find(p => p.id === PLANT)!.t.slug
  expect(renamedPages(renamed(withGallery(FAR)))['/cay/ten-cu/anh/']).toBe(`/cay/${slug}/anh/`)
  const short = renamedPages(renamed(withGallery(ONE_SHORT)))
  expect(short['/cay/ten-cu/']).toBe(`/cay/${slug}/?tu=ten-cu`)
  expect(short['/cay/ten-cu/anh/']).toBeUndefined()
})

// The Malay one answered 404 where the Vietnamese one forwarded to the plant's page: the Worker's forward for a photo page
// the build didn't make (an address Google keeps, or one a sitemap gave before) left Malay out, in both its pattern and
// the paths the Worker is asked for. Each served language's fish and plant photo pages, now and when one joins.
test("a photo page the build didn't make forwards to its page in every language, and the Worker is asked for it", () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  const first: string[] = config.assets.run_worker_first
  const glob = (p: string) => new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  expect(LANGS.length).toBeGreaterThanOrEqual(4)
  for (const lang of LANGS) for (const kind of ['ca', 'cay']) {
    const photos = localizePath(lang, `/vi/${kind}/cryptocoryne-spiralis-red/anh/`)
    expect(galleryParent(photos), photos).toBe(localizePath(lang, `/vi/${kind}/cryptocoryne-spiralis-red/`))
    expect(first.some(r => !r.startsWith('!') && glob(r).test(photos)), `${photos}: its line in run_worker_first`).toBe(true)
  }
})
