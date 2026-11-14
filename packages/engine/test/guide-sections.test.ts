import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import sharp from 'sharp'
import { fixFirst, guideHeading, guideHeadings, withSections } from '../src/guide-sections'
import { htmlToOutline } from '../src/outline'
import { backfillPhotos } from '../src/photo-backfill'

// 2026-11-01, Spruce Pets' "11 easiest fish": one photo under each fish's heading; the engine kept 3 (a cap of 6, and
// photos the picker ranked first), with no record of where each sat, and the page put the goldfish under the molly.
const VI = ['1. Cá vàng thường (Carassius auratus)', '2. Cá lia thia (Betta splendens)', '4. Cá molly và cá platy (nhóm đẻ con)', '7. Cá chuột / cory (Corydoras)', '8. Cá cherry barb (Puntius titteya)', '10. Cá white cloud mountain minnow (Tanichthys albonubes)', 'Lời kết']

test('a source heading finds the guide heading it became: scientific name, list number, or its English words', () => {
  expect(guideHeading('Standard Goldfish (Carassius auratus)', VI)).toBe(VI[0])
  expect(guideHeading('Betta Fish (Betta splendens)', VI)).toBe(VI[1])
  expect(guideHeading('Mollies and Platies', VI)).toBe(VI[2])
  expect(guideHeading('Cory Catfish (Corydoras spp.)', VI)).toBe(VI[3])
  expect(guideHeading('Cherry Barb', VI)).toBe(VI[4])
  expect(guideHeading('White Cloud Mountain Minnows', VI)).toBe(VI[5])
  expect(guideHeading('1. Dwarf Pea Puffer', ['1. Cá nóc đậu lùn (Carinotetraodon travancoricus)', '2. Cá chạch hồng (Rosy loach)'])).toBe('1. Cá nóc đậu lùn (Carinotetraodon travancoricus)')
  expect(guideHeading('The 11 Easiest Fish to Take Care Of', VI)).toBeUndefined() // the article's title: no section
  expect(guideHeading('Tetra', ['Cá neon tetra', 'Cá tetra chanh'])).toBeUndefined() // two match equally: none
})

test('each page image keeps the heading it sits under; a guide photo gets the section, in every language that has it', () => {
  const o = htmlToOutline('<main><h1>11 Easiest Fish</h1><img src="/lead.jpg" alt="tank"><h2>Standard Goldfish (Carassius auratus)</h2><figure><img src="/gold.jpg" alt="Goldfish in tank"></figure><p>Text</p><h2>Cherry Barb</h2><p>Text</p><img src="/cherry.jpg" alt="cherry barbs"></main>')
  expect(o.images.map(i => i.heading)).toEqual(['11 Easiest Fish', 'Standard Goldfish (Carassius auratus)', 'Cherry Barb'])
  const p = (url: string, heading?: string) => ({ url, width: 1200, height: 800, licence: 'x', author: 'y', sourceUrl: 'z', ...(heading ? { heading } : {}) })
  const body = (hs: string[]) => hs.map(h => `<h3>${h}</h3><p>…</p>`).join('')
  const out = withSections([p('lead', '11 Easiest Fish'), p('gold', 'Standard Goldfish (Carassius auratus)'), p('cherry', 'Cherry Barb')], { vi: body(VI), id: body(VI.map(h => `${h} (id)`)) })
  expect(out.map(x => 'section' in x ? x.section : undefined)).toEqual([undefined, { vi: VI[0], id: `${VI[0]} (id)` }, { vi: VI[4], id: `${VI[4]} (id)` }])
  expect(out.every(x => !('heading' in x))).toBe(true) // the source heading is the engine's, not the page's
})

test('a published guide is read once more for every photo of its source, each in its section, with no cap of 6', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gs-'))
  const URL_ = 'https://www.aquariumcoop.com/blogs/aquarium/low-maintenance-freshwater-fish'
  const dir = join(root, 'content', 'guides', 'aquariumcoop-low-maintenance-freshwater-fish')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ aquariumcoop: { name: 'Aquarium Co-op' } }))
  const old = (n: number) => ({ url: `https://m/old${n}.webp`, width: 1200, height: 800, licence: 'x', author: 'y', sourceUrl: URL_, source: 'aquariumcoop' })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ source: 'aquariumcoop', sourceUrl: URL_, photos: [old(1), old(2), old(3)] }))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ body: VI.map(h => `<h3>${h}</h3><p>…</p>`).join('') }))
  await writeFile(join(dir, 'ms.json'), JSON.stringify({ body: VI.map(h => `<h3>${h} (ms)</h3><p>…</p>`).join('') })) // a language the site doesn't serve yet
  // Read before the cap went: tried, but not since.
  await writeFile(join(root, 'engine-state', '_photo-backfill.json'), JSON.stringify({ [URL_]: '2026-10-30T00:00:00.000Z' }))
  const fish = ['Standard Goldfish (Carassius auratus)', 'Betta Fish (Betta splendens)', 'Mollies and Platies', 'Cory Catfish (Corydoras spp.)', 'Cherry Barb', 'White Cloud Mountain Minnows', 'Zebra Danio (Danio rerio)']
  const html = `<main><h1>11 Easiest Fish</h1>${fish.map((h, i) => `<h2>${h}</h2><img src="/f${i}.jpg" alt="fish ${i}" width="1200" height="800"><p>${'text '.repeat(30)}</p>`).join('')}</main>`
  const deps = {
    get: async () => ({ status: 200, html }),
    bytes: async () => sharp({ create: { width: 1200, height: 800, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 1200, height: 800 }) },
    now: () => new Date('2026-11-02T00:00:00Z'),
    sleep: async () => {},
  }
  const r = await backfillPhotos(root, deps, { kinds: ['guides'] })
  expect(r).toMatchObject({ pages: 1, errors: [] })
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as { photos: { section?: { vi: string; ms?: string } }[] }
  expect(e.photos).toHaveLength(7) // every photo of its source page, in place of the 3 it kept from there
  expect(e.photos.slice(0, 7).map(p => p.section?.vi)).toEqual([VI[0], VI[1], VI[2], VI[3], VI[4], VI[5], undefined]) // the danio's heading isn't in this text
  expect(e.photos[0]!.section?.ms).toBe(`${VI[0]} (ms)`)
  expect((await backfillPhotos(root, deps, { kinds: ['guides'] })).pages).toBe(0) // once
})

test("a guide photo gets its section in a language the site doesn't serve yet", () => {
  const p = { url: 'gold', width: 1200, height: 800, licence: 'x', author: 'y', sourceUrl: 'z', heading: 'Standard Goldfish (Carassius auratus)' }
  const body = (hs: string[]) => hs.map(h => `<h3>${h}</h3><p>…</p>`).join('')
  const [out] = withSections([p], { vi: body(VI), ms: body(VI.map(h => `${h} (ms)`)) })
  expect(out && 'section' in out ? out.section : undefined).toEqual({ vi: VI[0], ms: `${VI[0]} (ms)` })
})

test('a guide that fixes a problem leads with the fix, then the causes; the text is the same', () => {
  // The black beard algae guide (design critique 2026-11-06): "Cách xử lý" last of six.
  const bba = '<p>Tảo râu đen rất khó trị.</p><h3>Vì sao BBA bám mép lá?</h3><p>a</p><h3>Nguyên nhân gây tảo râu đen</h3><p>b</p><h3>Cách xử lý tảo râu đen</h3><p>c</p><ul><li>d</li></ul>'
  expect(fixFirst('Cách loại bỏ tảo râu đen (BBA)', 'disease', bba)).toBe('<p>Tảo râu đen rất khó trị.</p><h3>Cách xử lý tảo râu đen</h3><p>c</p><ul><li>d</li></ul><h3>Vì sao BBA bám mép lá?</h3><p>a</p><h3>Nguyên nhân gây tảo râu đen</h3><p>b</p>')
  // The fix's own steps go with it, and a closing section stays last.
  const steps = '<h3>Tảo lam là gì?</h3><p>a</p><h3>Cách diệt tảo lam</h3><p>b</p><h3>1. Gỡ bằng tay</h3><p>c</p><h3>2. Che tối bể</h3><p>d</p><h3>Kết luận</h3><p>e</p>'
  expect(guideHeadings(fixFirst('Tảo lam: đặc điểm và cách loại bỏ', 'disease', steps))).toEqual(['Cách diệt tảo lam', '1. Gỡ bằng tay', '2. Che tối bể', 'Tảo lam là gì?', 'Kết luận'])
  // Not a fix guide, a setup guide, the fix first already, or the fix one of a numbered run: as it was.
  for (const [title, kind, body] of [
    ['Nuôi cá neon', 'care', bba], ['Cách xử lý lũa trước khi cho vào bể', 'setup', bba], ['Cách loại bỏ tảo', 'disease', '<h3>Cách xử lý</h3><p>a</p><h3>Nguyên nhân</h3><p>b</p>'],
    ['Cách loại bỏ tảo nâu', 'disease', '<h3>1. Tảo nâu là gì?</h3><p>a</p><h3>2. Cách diệt tảo nâu</h3><p>b</p>'],
  ] as const) expect(fixFirst(title, kind, body)).toBe(body)
})
