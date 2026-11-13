import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { backfillPhotos } from '../src/photo-backfill'
import { photosAfterRead } from '../src/run'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'
import { asShown, tropicaImages, tropicaPhotos, tropicaSrc, type TropicaDeps } from '../src/tropica-photos'

const PAGE = 'https://tropica.com/en/plants/plantdetails/Bacopacaroliniana(043BDT)/4465'
const gen = (q: string) => `https://tropica.com/imagegen.ashx?${q}&amp;crop=resize&amp;class=product`
/** A plant page as Tropica serves it (2026-11-10), cut to its pictures: the main photo, the row of thumbnails, the layouts the plant is in, and the drawing beside its facts. */
const html = `<div class="content"><div class="plant-details">
<a href="${gen('height=720&amp;image=/Plants/043 BDT/2.png')}" class="fancybox" data-fancybox-group="gallery"><img style="height:380px;" src="${gen('height=380&amp;image=/Plants/043 BDT/2.png')}" /></a>
<a href="${gen('height=720&amp;image=/Plants/043 BDT/2.png')}" class="showLargeImage fancybox" data-fancybox-group="gallery"><img src="${gen('height=87&amp;image=/Plants/043 BDT/2.png')}" /></a>
<a href="${gen('height=720&amp;image=/Plants/043 BDT/3.png')}" class="showLargeImage fancybox" data-fancybox-group="gallery"><img src="${gen('height=85&amp;image=/Plants/043 BDT/3.png')}" /></a>
<a href="${gen('height=720&amp;image=/Plants/043 BDT/5.png')}" class="showLargeImage fancybox" data-fancybox-group="gallery"><img src="${gen('width=170&amp;height=87&amp;image=/Plants/043 BDT/5.png')}" /></a>
<h3>Layouts containing this plant</h3><a href="/en/inspiration/layout/Layout111/21252"><div class="image" style="background-image:url('${gen('width=170&amp;height=87&amp;image=/Layouts/L111/main.jpg')}')"></div></a>
<div class="text-center"><a href="${gen('height=720&amp;image=/Plants/043 BDT/1.png')}" class="fancybox" data-fancybox-group="gallery"><img src="${gen('width=300&amp;image=/Plants/043 BDT/1.png')}" style="height:300px;" /></a></div>
</div></div>`

const picture = (width: number, height: number, background: { r: number; g: number; b: number; alpha: number }) =>
  sharp({ create: { width, height, channels: 4, background } }).png().toBuffer().then(b => new Uint8Array(b))
const clear = { r: 0, g: 0, b: 0, alpha: 0 }
const green = { r: 30, g: 120, b: 40, alpha: 1 }
/** A plant cut out on a see-through background: green in the middle, nothing around it. */
const cutOut = async (side: number) => new Uint8Array(await sharp({ create: { width: side, height: side, channels: 4, background: clear } })
  .composite([{ input: await sharp({ create: { width: side / 2, height: side / 2, channels: 4, background: green } }).png().toBuffer(), gravity: 'centre' }]).png().toBuffer())

test("a plant page's photos are the ones its thumbnails open: never the drawing, never a layout", () => {
  expect(tropicaImages(html, PAGE)).toEqual(['/Plants/043 BDT/2.png', '/Plants/043 BDT/3.png', '/Plants/043 BDT/5.png'])
  expect(tropicaImages('<div class="content"><p>No pictures.</p></div>', PAGE)).toEqual([])
})

test('a photo is asked for at the size Tropica keeps it: a height in the address would have the endpoint enlarge it', () => {
  const src = tropicaSrc('/Plants/043 BDT/2.png')
  expect(src).toBe('https://tropica.com/imagegen.ashx?image=/Plants/043%20BDT/2.png&class=product')
  expect(new URL(src).searchParams.has('height')).toBe(false)
  expect(new URL(src).searchParams.has('width')).toBe(false)
})

test('a cut-out is stored on white and is no scene; a photo that fills its frame is a scene', async () => {
  const cut = await asShown(await cutOut(800))
  expect(cut).toMatchObject({ width: 800, height: 800, scene: false })
  const meta = await sharp(cut.bytes).metadata()
  expect(meta.hasAlpha).toBe(false)
  const corner = await sharp(cut.bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
  expect([...corner]).toEqual([255, 255, 255])
  expect(await asShown(await picture(900, 600, green))).toMatchObject({ width: 900, height: 600, scene: true })
})

const KEYS = ['description', 'careLevel', 'lighting', 'co2', 'placement', 'propagation', 'origin', 'notes']
/** Plant pages written from Tropica, each with `sections` sections (eight unless said): a page shows its lead and one photo between each pair. */
async function repo(plants: Record<string, { photos?: object[]; tropica?: boolean; sections?: number }>) {
  const root = await mkdtemp(join(tmpdir(), 'aq-tropica-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  for (const [id, p] of Object.entries(plants)) {
    await mkdir(join(root, 'content/plants', id), { recursive: true })
    await writeFile(join(root, 'content/plants', id, 'entity.json'), JSON.stringify({ scientificName: id, photos: p.photos ?? [], sections: p.tropica === false ? [{ key: 'description', source: 'aquariumcoop', sourceUrl: 'https://www.aquariumcoop.com/blogs/aquarium/x' }] : KEYS.slice(0, p.sections ?? 8).map(key => ({ key, source: 'tropica', sourceUrl: `${PAGE}?${id}` })) }))
  }
  return root
}
const entity = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'content/plants', id, 'entity.json'), 'utf8')) as { photos: Record<string, unknown>[] }
const gallery = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'content/gallery', `${id}.json`), 'utf8').catch(() => 'null')) as { photos: Record<string, unknown>[] } | null

async function deps() {
  const asked: string[] = []
  const stored = new Map<string, Uint8Array>()
  const pictures: Record<string, Uint8Array> = { '2.png': await cutOut(1000), '3.png': await cutOut(1000), '5.png': await picture(1564, 977, green) }
  let sleeps = 0
  const d: TropicaDeps = {
    get: async u => (asked.push(u), html),
    bytes: async (u, referer) => { asked.push(`${u} <- ${referer}`); return pictures[new URL(u).searchParams.get('image')!.split('/').pop()!]! },
    media: {
      urlFor: k => `https://media.aquatome.com/${k}`,
      put: async (k, bytes) => { stored.set(k, bytes); const m = await sharp(bytes).metadata(); const w = Math.min(1200, m.width!); return { url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace('.webp', '-480.webp')}`, width: w, height: Math.round((m.height! * w) / m.width!) } },
      putLarge: async (k, bytes, width) => { stored.set(k, bytes); const m = await sharp(bytes).metadata(); return { url: `https://media.aquatome.com/${k}`, width, height: Math.round((m.height! * width) / m.width!) } },
    },
    sleep: async () => { sleeps++ },
    now: () => new Date('2026-11-10T12:00:00Z'),
  }
  return { d, asked, stored, sleeps: () => sleeps }
}

test("on a page with photos Tropica's go behind them, the scene first, and what leads stays", async () => {
  const lead = { url: 'https://media.aquatome.com/commons/lead.webp', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lead.jpg' }
  const root = await repo({ 'bacopa-caroliniana': { photos: [lead] }, 'anubias-nana': { tropica: false } })
  const { d, asked, stored, sleeps } = await deps()
  expect(await tropicaPhotos(root, d)).toEqual({ added: ['bacopa-caroliniana: 3 behind its photos'], skipped: [], failed: [] })
  // The page, then each photo at its own size with the page as referer, a pause before every request.
  const page = `${PAGE}?bacopa-caroliniana`
  expect(asked).toEqual([page, ...[2, 3, 5].map(n => `https://tropica.com/imagegen.ashx?image=/Plants/043%20BDT/${n}.png&class=product <- ${page}`)])
  expect(sleeps()).toBe(4)
  const { photos } = await entity(root, 'bacopa-caroliniana')
  expect(photos[0]).toEqual(lead)
  expect(photos).toHaveLength(4)
  // The scene (1,564 by 977) is stored 1,200 across with its large copy; the cut-outs (1,000 square) as they came.
  expect(photos[1]).toMatchObject({ width: 1200, height: 750, large: { width: 1564, height: 977 }, licence: SOURCE_PHOTO_LICENCE, author: 'Tropica', sourceUrl: page, source: 'tropica' })
  expect((photos[1]!.large as { url: string }).url).toBe(`${photos[1]!.url}`.replace(/\.webp$/, '-large.webp'))
  expect(photos.slice(2).map(p => [p.width, p.height, p.large])).toEqual([[1000, 1000, undefined], [1000, 1000, undefined]])
  expect(photos.every(p => !('scene' in p) && !('best' in p))).toBe(true)
  // Every stored cut-out is on white.
  for (const p of photos.slice(2)) expect((await sharp(stored.get(`${p.url}`.replace('https://media.aquatome.com/', ''))!).metadata()).hasAlpha).toBe(false)
  expect(await gallery(root, 'bacopa-caroliniana')).toBeNull()
  // A second run asks for nothing.
  expect(await tropicaPhotos(root, d)).toEqual({ added: [], skipped: [], failed: [] })
  expect(asked).toHaveLength(4)
})

test("on a page with no photo they go to its gallery, the scene marked best, and the page's own photos stay empty", async () => {
  const root = await repo({ 'bacopa-caroliniana': {} })
  const kept = { url: 'https://media.aquatome.com/commons/kept.webp', width: 1200, height: 800, licence: 'CC BY 4.0', author: 'B', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kept.jpg', caption: 'Dưới nước', kind: 'submersed' }
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  await writeFile(join(root, 'content/gallery/bacopa-caroliniana.json'), JSON.stringify({ id: 'bacopa-caroliniana', photos: [kept], seen: 7, updatedAt: '2026-11-01', builtAt: '2026-11-01' }))
  const { d } = await deps()
  expect(await tropicaPhotos(root, d)).toEqual({ added: ['bacopa-caroliniana: 3 in its gallery'], skipped: [], failed: [] })
  expect((await entity(root, 'bacopa-caroliniana')).photos).toEqual([])
  const g = (await gallery(root, 'bacopa-caroliniana'))!
  expect(g).toMatchObject({ id: 'bacopa-caroliniana', seen: 7, updatedAt: '2026-11-10', builtAt: '2026-11-01' })
  expect(g.photos).toHaveLength(4)
  const tropica = g.photos.filter(p => p.source === 'tropica')
  expect(tropica.map(p => [p.width, p.best, p.kind])).toEqual([[1200, true, 'submersed'], [1000, undefined, 'other'], [1000, undefined, 'other']])
  // The one marked best is the gallery's first, and the photo that was there is still there.
  expect(g.photos[0]).toMatchObject({ source: 'tropica', best: true })
  expect(g.photos).toContainEqual(kept)
  expect(tropica.every(p => !('scene' in p))).toBe(true)
  // In a gallery they wait for the photo check, as every photo a step adds to one does; the one already there doesn't.
  expect(g.photos.map(p => !!p.unchecked).sort()).toEqual([false, true, true, true])
})

test('a photo taken off the site is not taken again, a page that gives none waits a month, and --limit is pages a run', async () => {
  const root = await repo({ 'a-plant': {}, 'b-plant': {}, 'c-plant': {} })
  const { d, asked } = await deps()
  const key = (n: number) => `https://media.aquatome.com/tropica/${createHash('sha256').update(tropicaSrc(`/Plants/043 BDT/${n}.png`)).digest('hex').slice(0, 16)}.webp`
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify(Object.fromEntries([2, 3, 5].map(n => [key(n), 'watermark']))))
  expect(await tropicaPhotos(root, d, { limit: 2 })).toEqual({ added: [], skipped: ['a-plant: no photo to take', 'b-plant: no photo to take'], failed: [] })
  expect(asked).toEqual([`${PAGE}?a-plant`, `${PAGE}?b-plant`])
  expect(await tropicaPhotos(root, d, { limit: 2 })).toEqual({ added: [], skipped: ['c-plant: no photo to take'], failed: [] })
  const tried = JSON.parse(await readFile(join(root, 'engine-state/_photo-tropica.json'), 'utf8'))
  expect(Object.keys(tried)).toEqual([`${PAGE}?a-plant`, `${PAGE}?b-plant`, `${PAGE}?c-plant`])
  // A month on, the pages are read again.
  const later = { ...d, now: () => new Date('2026-12-11T12:00:00Z') }
  expect((await tropicaPhotos(root, later, { limit: 1 })).skipped).toEqual(['a-plant: no photo to take'])
})

test('a page that fails is read again next run, and the others still get theirs', async () => {
  const root = await repo({ 'a-plant': {}, 'b-plant': {} })
  const { d } = await deps()
  let failed = false
  const flaky: TropicaDeps = { ...d, get: async u => { if (u.endsWith('a-plant') && !failed) { failed = true; throw new Error('HTTP 503') } return d.get(u) } }
  expect(await tropicaPhotos(root, flaky)).toEqual({ added: ['b-plant: 3 in its gallery'], skipped: [], failed: ['a-plant: HTTP 503'] })
  expect(await tropicaPhotos(root, flaky)).toEqual({ added: ['a-plant: 3 in its gallery'], skipped: [], failed: [] })
})

test("reading a Tropica page again neither takes nor drops a photo: its photos are its step's", async () => {
  const mine = { url: 'https://media.aquatome.com/tropica/a.webp', width: 1000, height: 1000, licence: SOURCE_PHOTO_LICENCE, author: 'Tropica', sourceUrl: PAGE, source: 'tropica' as const }
  const lead = { url: 'https://media.aquatome.com/commons/lead.webp', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lead.jpg' }
  let asked = 0
  const none = async () => { asked++; return [] }
  expect(await photosAfterRead([lead, mine], 'tropica', PAGE, none)).toEqual([lead, mine])
  expect(asked).toBe(0)
  // Any other source's page still brings its photos, and loses the ones it no longer shows.
  const sf = { ...mine, url: 'https://media.aquatome.com/seriouslyfish/a.webp', author: 'Seriously Fish', sourceUrl: 'https://www.seriouslyfish.com/species/x', source: 'seriouslyfish' as const }
  expect(await photosAfterRead([lead, sf], 'seriouslyfish', sf.sourceUrl, none)).toEqual([lead])
  expect(asked).toBe(1)
})

test("another source's page read leaves Tropica's photos behind what the page had", async () => {
  const mine = { url: 'https://media.aquatome.com/tropica/a.webp', width: 1000, height: 1000, licence: SOURCE_PHOTO_LICENCE, author: 'Tropica', sourceUrl: PAGE, source: 'tropica' as const }
  const lead = { url: 'https://media.aquatome.com/commons/lead.webp', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lead.jpg' }
  const coop = { ...mine, url: 'https://media.aquatome.com/aquariumcoop/a.webp', author: 'Aquarium Co-op', sourceUrl: 'https://www.aquariumcoop.com/blogs/aquarium/x', source: 'aquariumcoop' as const }
  // A read that brings nothing changes nothing: a source's photos sort ahead of open ones, and Tropica's must not ride that.
  expect(await photosAfterRead([lead, mine], 'aquariumcoop', coop.sourceUrl, async () => [])).toEqual([lead, mine])
  // One that brings a photo puts it first, as for any page, and Tropica's is still behind the photo that led.
  expect(await photosAfterRead([lead, mine], 'aquariumcoop', coop.sourceUrl, async () => [coop])).toEqual([coop, lead, mine])
})

test('a page keeps eight photos of its own: what is over goes to its gallery, unmarked', async () => {
  const had = [...Array(6)].map((_, i) => ({ url: `https://media.aquatome.com/commons/${i}.webp`, width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: `https://commons.wikimedia.org/wiki/File:${i}.jpg` }))
  const root = await repo({ 'bacopa-caroliniana': { photos: had } })
  const { d } = await deps()
  expect(await tropicaPhotos(root, d)).toEqual({ added: ['bacopa-caroliniana: 2 behind its photos, 1 in its gallery'], skipped: [], failed: [] })
  const { photos } = await entity(root, 'bacopa-caroliniana')
  expect(photos.slice(0, 6)).toEqual(had)
  expect(photos.slice(6).map(p => [p.source, p.width])).toEqual([['tropica', 1200], ['tropica', 1000]])
  const g = (await gallery(root, 'bacopa-caroliniana'))!
  expect(g.photos.map(p => [p.source, p.width, p.best, p.kind])).toEqual([['tropica', 1000, undefined, 'other']])
  // A full page takes none of its own, and a second run still asks for nothing.
  const full = await repo({ 'full-plant': { photos: [...had, ...had.map(p => ({ ...p, url: `${p.url}?b` }))].slice(0, 8) } })
  expect(await tropicaPhotos(full, d)).toEqual({ added: ['full-plant: 3 in its gallery'], skipped: [], failed: [] })
  expect((await entity(full, 'full-plant')).photos).toHaveLength(8)
  expect(await tropicaPhotos(full, d)).toEqual({ added: [], skipped: [], failed: [] })
})

test('a page takes only as many as it shows, its lead and one between each pair of sections: the rest go to its gallery', async () => {
  const lead = { url: 'https://media.aquatome.com/commons/lead.webp', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lead.jpg' }
  const root = await repo({ 'one-section': { photos: [lead], sections: 1 }, 'two-sections': { photos: [lead], sections: 2 }, 'three-sections': { photos: [lead, { ...lead, url: `${lead.url}?2` }], sections: 3 } })
  const { d } = await deps()
  expect((await tropicaPhotos(root, d)).added).toEqual(['one-section: 3 in its gallery', 'three-sections: 1 behind its photos, 2 in its gallery', 'two-sections: 1 behind its photos, 2 in its gallery'])
  // The one that shows is the scene, and what leads stays.
  const two = (await entity(root, 'two-sections')).photos
  expect(two[0]).toEqual(lead)
  expect(two.slice(1).map(p => [p.source, p.width])).toEqual([['tropica', 1200]])
  // A page with a lead gets none marked best: nothing there is waiting to lead.
  const inGallery = (await gallery(root, 'one-section'))!.photos
  expect(inGallery.map(p => `${p.width} ${p.kind}`).sort()).toEqual(['1000 other', '1000 other', '1200 submersed'])
  expect(inGallery.some(p => p.best)).toBe(false)
  expect((await entity(root, 'one-section')).photos).toEqual([lead])
})

test('an address that answers with no picture is left out, and the page keeps the rest', async () => {
  const lead = { url: 'https://media.aquatome.com/commons/lead.webp', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lead.jpg' }
  const root = await repo({ 'bacopa-caroliniana': { photos: [lead] } })
  const { d } = await deps()
  const broken: TropicaDeps = { ...d, bytes: async (u, referer) => (u.includes('/3.png') ? new TextEncoder().encode('<html>File not found</html>') : d.bytes(u, referer)) }
  expect(await tropicaPhotos(root, broken)).toEqual({ added: ['bacopa-caroliniana: 2 behind its photos'], skipped: [], failed: ['bacopa-caroliniana: /Plants/043 BDT/3.png is no picture'] })
  expect((await entity(root, 'bacopa-caroliniana')).photos.map(p => p.width)).toEqual([900, 1200, 1000])
  expect(await tropicaPhotos(root, broken)).toEqual({ added: [], skipped: [], failed: [] })
})

test("the photo backfill leaves Tropica's pages to their step", async () => {
  const root = await repo({ 'bacopa-caroliniana': {} })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ tropica: { name: 'Tropica' } }))
  const gets: string[] = []
  const r = await backfillPhotos(root, {
    get: async (u: string) => { gets.push(u); return { status: 200, html } },
    bytes: async (u: string) => new TextEncoder().encode(u),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 600, height: 600 }) },
    now: () => new Date('2026-11-10T12:00:00Z'),
    sleep: async () => {},
  }, { kinds: ['plants'] })
  expect(gets).toEqual([])
  expect(r).toMatchObject({ pages: 0, added: 0 })
})
