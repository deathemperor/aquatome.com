import { expectControlledRejections } from './photo-privacy-assertions'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
import { checkPagePhotos } from '../src/photo-check'
import { kindPassages, nameFish, sweep, sweepTranslation } from '../src/sweep'
import { atCeiling } from './at-ceiling'

const photo = (url: string, caption: string) => ({ url, width: 1200, height: 800, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/x', caption })
const species = (id: string, sci: string, o: { dataCard?: object; photos?: object[] } = {}) => ({
  id, scientificName: sci, order: 'O', family: 'F', genus: sci.split(' ')[0], group: 'g', places: [], dataCard: o.dataCard ?? {},
  sections: [{ key: 'distribution', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html: '<p>Rivers.</p>' }, { key: 'habitat', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html: '<p>Rivers.</p>' }],
  photos: o.photos ?? [], videos: [], productSlots: [], updatedAt: '2026-10-01',
})
const vi = (name: string, sections: Record<string, string>, extra: object = {}) => ({ slug: name.toLowerCase().replace(/\s+/g, '-'), name, altNames: [], sections, quality: { score: 0.9, indexable: true }, ...extra })
const REPEAT = 'Loài này sống ở các con suối nhỏ chảy chậm trong rừng, nước trong và mát quanh năm.'

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown, indent = 2) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, indent)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  // Corydoras adolfoi: a photo of C. sterbai (its own page has it too), a map, a gallery photo of a tetra, a card whose
  // tank is shorter than twice the fish, the same paragraph under distribution and habitat.
  await put('species/corydoras-adolfoi/entity.json', species('corydoras-adolfoi', 'Corydoras adolfoi', {
    dataCard: { sizeCm: [{ source: 'seriouslyfish', value: 6 }], tankCm: [{ source: 'seriouslyfish', value: 60 }, { source: 'glaser', value: 10 }], ph: [{ source: 'glaser', value: { min: 7.5, max: 6 } }] },
    photos: [photo('https://media.aquatome.com/commons/own.webp', 'Corydoras adolfoi'), photo('https://media.aquatome.com/commons/sterbai.webp', 'Corydoras sterbai'), photo('https://media.aquatome.com/commons/map.webp', 'Corydoras adolfoi map'),
      photo('https://media.aquatome.com/commons/batch.webp', 'Imported as a contaminant in a batch of Corydoras sterbai'),
      photo('https://media.aquatome.com/seriouslyfish/ad.webp', 'video of: Three Cheese Hot Artichoke Dip')],
  }), 1)
  await put('summaries/corydoras-adolfoi.json', { id: 'corydoras-adolfoi', summary: 'Bể từ 10 cm.', mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' })
  await put('species/corydoras-adolfoi/vi.json', vi('Cá chuột Adolfo', { 'distribution:seriouslyfish': `<p>${REPEAT}</p>`, 'habitat:seriouslyfish': `<p>${REPEAT}</p><p>Nền cát.</p><h3>Ghi chú</h3>` }), 1)
  await put('gallery/corydoras-adolfoi.json', { id: 'corydoras-adolfoi', photos: [photo('https://media.aquatome.com/inat/tetra.webp', 'A Black Widow Tetra (Gymnocorymbus ternetzi).')], seen: 1, updatedAt: '2026-10-01' })
  await put('species/corydoras-sterbai/entity.json', species('corydoras-sterbai', 'Corydoras sterbai', { photos: [photo('https://media.aquatome.com/commons/sterbai.webp', 'Corydoras sterbai')] }))
  await put('species/corydoras-sterbai/vi.json', vi('Cá chuột sterbai', { 'distribution:seriouslyfish': '<p>Brazil.</p>' }))
  await put('species/gymnocorymbus-ternetzi/entity.json', species('gymnocorymbus-ternetzi', 'Gymnocorymbus ternetzi'))
  await put('species/gymnocorymbus-ternetzi/vi.json', vi('Cá tứ vân đen', { 'distribution:seriouslyfish': '<p>Paraguay.</p>' }))
  // A guide: a title promising 10 over 4 sections, mistakes numbered out of order, a heading over a heading (a group, kept),
  // comments and related posts.
  await put('guides/g/entity.json', { id: 'g', kind: 'care', source: 'aquariumbreeder', sourceUrl: 'https://x/g', html: '', photos: [], mentions: [], updatedAt: '2026-10-01' })
  await put('guides/g/vi.json', vi('10 cách xử lý rêu hại nhanh', {}, {
    body: '<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 3:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 2:</strong> thiếu CO2.</p>'
      + '<p>Bài viết liên quan:</p><ul><li>15+ thức ăn sống</li></ul><h3>Phân nền</h3><h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>'
      + '<h3>4 bình luận về “Rêu hại”</h3><ul><li><p><strong>Marcia:</strong> Cảm ơn.</p></li></ul><h3>Để lại bình luận</h3>',
  }))
  // A breed whose tank is shorter than twice the fish, and whose title (its name) has a count its text lacks.
  await put('breeds/huyet-long/entity.json', { id: 'huyet-long', kind: 'variety', parents: [], care: { sizeCm: [{ source: 0, value: 90 }], tankCm: [{ source: 0, value: 150 }] }, photos: [], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  await put('breeds/huyet-long/vi.json', vi('5 điều về Huyết Long', {}, { slug: 'huyet-long', body: '<p>Rồng đỏ.</p>' }))
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))

test('the sweep makes every page pass the rules it fixes, keeps each file\'s indentation and date, and does nothing the second time', async () => {
  const root = await store()
  const before = ratcheted(checkPages(await loadPages(join(root, 'content')), RULES.filter(r => r.id in RATCHETED)).findings).map(f => f.rule)
  expect(new Set(before)).toEqual(new Set(['furniture', 'headings', 'repeated', 'labels', 'caption', 'card', 'title-count']))
  const r = await sweep(root)
  expect(ratcheted(checkPages(await loadPages(join(root, 'content')), RULES.filter(r => r.id in RATCHETED)).findings).map(f => `${f.rule}: ${f.page.path}: ${f.detail}`)).toEqual([])

  // Text: comments and related posts cut, mistakes numbered in order, the group heading kept; the address kept.
  const g = await json(root, 'content/guides/g/vi.json')
  expect(g.body).toBe('<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 2:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 3:</strong> thiếu CO2.</p>'
    + '<h3>Phân nền</h3><h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>')
  expect([g.name, g.slug]).toEqual(['Cách xử lý rêu hại nhanh', '10-cách-xử-lý-rêu-hại-nhanh'])
  expect(r.titles).toEqual(['vi/guides/g: "10 cách xử lý rêu hại nhanh" → "Cách xử lý rêu hại nhanh" (number dropped)'])
  // A breed's title is its name (a person may have fixed it): listed, never rewritten, and not held at zero.
  expect((await json(root, 'content/breeds/huyet-long/vi.json')).name).toBe('5 điều về Huyết Long')
  expect(checkPages(await loadPages(join(root, 'content')), RULES.filter(r => r.id === 'title-count')).findings.map(f => f.page.kind)).toEqual(['breeds'])
  // The later copy of the paragraph goes, and the heading left at the end; a one-space file stays one-space.
  const raw = await readFile(join(root, 'content/species/corydoras-adolfoi/vi.json'), 'utf8')
  expect(JSON.parse(raw).sections).toEqual({ 'distribution:seriouslyfish': `<p>${REPEAT}</p>`, 'habitat:seriouslyfish': '<p>Nền cát.</p>' })
  expect(raw).toMatch(/^\{\n "slug"/)

  // Photos: the other Corydoras, the map and an ad video's poster off the page, the tetra off its gallery; "in a batch of"
  // kept. Only the map and the poster leave every page: C. sterbai stays on its own page, and the tetra may still join its own.
  const e = await json(root, 'content/species/corydoras-adolfoi/entity.json')
  expect(e.photos.map((p: { url: string }) => p.url.split('/').pop())).toEqual(['own.webp', 'batch.webp'])
  expect(e.updatedAt).toBe('2026-10-01')
  expect((await json(root, 'content/gallery/corydoras-adolfoi.json')).photos).toEqual([])
  expect((await json(root, 'content/species/corydoras-sterbai/entity.json')).photos).toHaveLength(1)
  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), {
    'https://media.aquatome.com/commons/map.webp': "rejected",
    'https://media.aquatome.com/seriouslyfish/ad.webp': "rejected",
  })

  // Card: the tank shorter than twice the fish and the upside-down pH hidden, kept with why; the breed's too.
  expect(e.dataCard).toEqual({
    sizeCm: [{ source: 'seriouslyfish', value: 6 }],
    tankCm: [{ source: 'seriouslyfish', value: 60 }, { source: 'glaser', value: 10, hidden: 'shorter than twice the fish (6 cm)' }],
    ph: [{ source: 'glaser', value: { min: 7.5, max: 6 }, hidden: 'upside down' }],
  })
  // Its summary, checked against the old card, waits to be written again.
  expect(await json(root, 'content/summaries/corydoras-adolfoi.json')).toMatchObject({ review: 'pending', summary: 'Bể từ 10 cm.' })
  expect(r.summaries).toEqual(['corydoras-adolfoi'])
  expect((await json(root, 'content/breeds/huyet-long/entity.json')).care.tankCm).toEqual([{ source: 0, value: 150, hidden: 'shorter than twice the fish (90 cm)' }])

  expect((await sweep(root)).files).toEqual([])
})

test("the unplaced photos at its source's read-next card width that end a guide's list leave it and can't come back; the lead, a photo under a heading, an unplaced one earlier in the list, a wider one, a narrower one and another source's stay", async () => {
  // The owner's report, 2026-11-10: arowanas and a corydoras on the platy guide.
  const root = await store()
  const pic = (name: string, width: number, section?: object) => ({ ...photo(`https://media.aquatome.com/sprucepets/${name}.webp`, name), width, ...(section ? { section } : {}) })
  const put = async (id: string, source: string, photos: object[]) => {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'entity.json'), `${JSON.stringify({ id, kind: 'discovery', source, sourceUrl: 'https://x/y', html: '', photos, mentions: [], updatedAt: '2026-10-01' }, null, 2)}\n`)
    await writeFile(join(root, 'content/guides', id, 'vi.json'), `${JSON.stringify(vi('Cá bình tích', {}, { body: '<h3>Biến thể</h3><p>Cá bình tích khỏe.</p>' }), null, 2)}\n`)
  }
  await put('sprucepets-platy', 'sprucepets', [pic('lead', 600), pic('hifin', 600, { vi: 'Vây cao' }), pic('own', 600), pic('wide', 800), pic('arowana', 600), pic('corydoras', 600)])
  await put('sprucepets-narrow', 'sprucepets', [pic('top', 1000), pic('barb', 500)])
  await put('other-guide', 'aquariumcoop', [pic('first', 1000), pic('small', 600)])
  const r = await sweep(root, {})
  const urls = async (id: string) => ((await json(root, `content/guides/${id}/entity.json`)).photos as { url: string }[]).map(p => p.url.split('/').pop())
  expect(await urls('sprucepets-platy')).toEqual(['lead.webp', 'hifin.webp', 'own.webp', 'wide.webp'])
  expect(await urls('sprucepets-narrow')).toEqual(['top.webp', 'barb.webp'])
  expect(await urls('other-guide')).toEqual(['first.webp', 'small.webp'])
  expect(r.photos.filter(x => x.includes('read-next'))).toHaveLength(2)
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  expect(rejected['https://media.aquatome.com/sprucepets/arowana.webp']).toMatch(/^rejected: withheld \[sha256:[a-f0-9]{64}\]$/)
  expect(rejected['https://media.aquatome.com/sprucepets/corydoras.webp']).toMatch(/^rejected: withheld \[sha256:[a-f0-9]{64}\]$/)
  expect((await sweep(root, {})).photos.filter(x => x.includes('read-next'))).toEqual([])
})

// The site puts a guide's photo under the heading its label names. A heading rewritten (a wording rule, a name, a writer)
// left 19 photos waiting at their guide's end (2026-11-12): the betta foods guide's "#1 Trùn chỉ đỏ…" among them.
test("a guide photo's label follows its heading: the sweep's wording, else the one heading with its number; one it can't place is listed and kept", async () => {
  const root = await store()
  const pic = (name: string, label?: string) => ({ ...photo(`https://media.aquatome.com/aquariumcoop/${name}.webp`, name), ...(label ? { section: { vi: label } } : {}) })
  await mkdir(join(root, 'content/guides/coop-foods'), { recursive: true })
  const photos = [pic('lead'), pic('worm', '#1 Trùn chỉ đỏ (bloodworm) đông lạnh'), pic('algae', '2. Dùng dụng cụ gỡ tảo'), pic('pellets', '3.  Thức ăn  viên'), pic('setup', 'Set bể cho apisto'), pic('twice', '4. Cá killifish'), pic('count', '5. Cạo tảo bằng tay')]
  await writeFile(join(root, 'content/guides/coop-foods/entity.json'), `${JSON.stringify({ id: 'coop-foods', kind: 'care', source: 'aquariumcoop', sourceUrl: 'https://x/y', html: '', photos, mentions: [], updatedAt: '2026-10-01' }, null, 2)}\n`)
  const body = '<h3>#1 Trùng huyết (bloodworm) đông lạnh</h3><p>Ngon.</p><h3>2. Gỡ tảo bằng tay</h3><p>Gỡ.</p><h3>3. Thức ăn viên</h3><p>Viên.</p><h3>Chuẩn bị bể cho apisto</h3><p>Bể.</p><h3>4. Cá killi</h3><p>A.</p><h3>4. Cá killi đuôi lửa</h3><p>B.</p><h3>5 nguyên nhân chính</h3><p>C.</p>'
  await writeFile(join(root, 'content/guides/coop-foods/vi.json'), `${JSON.stringify(vi('Thức ăn cho cá betta', {}, { body }), null, 2)}\n`)
  const r = await sweep(root, {})
  const labels = async () => ((await json(root, 'content/guides/coop-foods/entity.json')).photos as { section?: { vi: string } }[]).map(p => p.section?.vi)
  expect(await labels()).toEqual([undefined, '#1 Trùng huyết (bloodworm) đông lạnh', '2. Gỡ tảo bằng tay', '3.  Thức ăn  viên', 'Set bể cho apisto', '4. Cá killifish', '5. Cạo tảo bằng tay'])
  expect(r.text['photo-heading']).toEqual(['guides/coop-foods'])
  // A count title ("5 nguyên nhân chính") is no list item 5 (schema headings.ts ownNumber).
  expect(r.unplaced).toEqual(['guides/coop-foods: "Set bể cho apisto"', 'guides/coop-foods: "4. Cá killifish"', 'guides/coop-foods: "5. Cạo tảo bằng tay"'])
  const again = await sweep(root, {})
  expect(again.text['photo-heading']).toBeUndefined()
  expect(await labels()).toEqual([undefined, '#1 Trùng huyết (bloodworm) đông lạnh', '2. Gỡ tảo bằng tay', '3.  Thức ăn  viên', 'Set bể cho apisto', '4. Cá killifish', '5. Cạo tảo bằng tay'])
})

test("a paper's plate leaves its page and its gallery for good, the page's lead or not; one plain photo named as a figure stays (the owner's report, 2026-11-11)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const commons = (name: string, file: string, caption: string) => ({ ...photo(`https://media.aquatome.com/commons/${name}.webp`, caption), sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}` })
  const plate = commons('plate', 'Parasite180080-Figure4 Compound micrographs of Cychlidogyrus spp. (Monogenea, Dactylogyridae).png', 'Figure 4 of paper Compound micrographs of (a–c) Cichlidogyrus bixlerzavalai n. sp. from Tylochromis praecox')
  // Its words name the page's fish among others: a plate is no photo of any of them.
  const many = commons('many', 'Aquatic Biodiversity in the Amazon (1020205-f7).png', 'Examples of species collected only in the Alto Purús.(A) Hemichromis elongatus, 79 mm.(B) Clarias leiacanthus, 73 mm.(C) Pimelodus sp. 2, 112 mm.')
  const one = commons('one', 'Clarias leiacanthus (10.3897-BDJ.11.e100337) Figure 20.jpg', 'Figure 20 Clarias leiacanthus.')
  await put('species/hemichromis-elongatus/entity.json', species('hemichromis-elongatus', 'Hemichromis elongatus', { photos: [plate] }))
  await put('species/hemichromis-elongatus/vi.json', vi('Cá cichlid năm sao', { 'distribution:seriouslyfish': '<p>Tây Phi.</p>' }))
  await put('gallery/hemichromis-elongatus.json', { id: 'hemichromis-elongatus', photos: [many], seen: 1, updatedAt: '2026-10-01' })
  await put('species/clarias-leiacanthus/entity.json', species('clarias-leiacanthus', 'Clarias leiacanthus', { photos: [one, many] }))
  await put('species/clarias-leiacanthus/vi.json', vi('Cá trê Borneo', { 'distribution:seriouslyfish': '<p>Borneo.</p>' }))
  const r = await sweep(root)
  expect(r.photos).toHaveLength(3)
  expect((await json(root, 'content/species/hemichromis-elongatus/entity.json')).photos).toEqual([])
  expect((await json(root, 'content/gallery/hemichromis-elongatus.json')).photos).toEqual([])
  expect((await json(root, 'content/species/clarias-leiacanthus/entity.json')).photos).toEqual([one])
  // Off every page, and the search and the gallery step skip what is on this list.
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json')).sort()).toEqual([many.url, plate.url])
  expect((await json(root, 'engine-state/_photo-rejected.json'))[plate.url]).toMatch(/^rejected: withheld \[sha256:[a-f0-9]{64}\]$/)
  const pages = await loadPages(c)
  expect(ratcheted(checkPages(pages, RULES.filter(x => x.id in RATCHETED)).findings).filter(f => f.rule === 'caption')).toEqual([])
  expect((await sweep(root)).photos).toEqual([])
})

test("a fish its source's caption calls unwell leaves a page that has another photo, for good; a page's only photo stays, off the never-again list, and is listed; a split fin stays", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const sf = (name: string, caption: string) => ({ ...photo(`https://media.aquatome.com/seriouslyfish/${name}.webp`, caption), sourceUrl: 'https://www.seriouslyfish.com/species/x/' })
  const dead = sf('dead', 'Recently-deceased specimen.'), well = sf('well', 'Adult male.'), split = sf('split', 'Adult specimen with slight caudal-fin damage.')
  const torn = sf('torn', 'Male specimen with fin damage caused by another male.'), thin = sf('thin', 'Skinny juvenile of Callochromis macrops')
  await put('species/schistura-spilota/entity.json', species('schistura-spilota', 'Schistura spilota', { photos: [dead, well, split] }))
  await put('species/schistura-spilota/vi.json', vi('Cá chạch suối đốm', { 'distribution:seriouslyfish': '<p>Thái Lan.</p>' }))
  await put('gallery/schistura-spilota.json', { id: 'schistura-spilota', photos: [torn], seen: 1, updatedAt: '2026-10-01' })
  await put('species/callochromis-macrops/entity.json', species('callochromis-macrops', 'Callochromis macrops', { photos: [thin] }))
  await put('species/callochromis-macrops/vi.json', vi('Cá hoàng đế mắt to', { 'distribution:seriouslyfish': '<p>Hồ Tanganyika.</p>' }))
  const unwell = async () => ratcheted(checkPages(await loadPages(c), RULES.filter(x => x.id in RATCHETED)).findings).filter(f => f.rule === 'unwell').length
  expect(await unwell()).toBe(2)
  const r = await sweep(root)
  expect(r.photos).toEqual([
    `species/schistura-spilota: ${dead.url} (unwell: its source's caption says "deceased")`,
    `species/schistura-spilota: ${torn.url} (unwell: its source's caption says "damage")`,
  ])
  // The lead goes, the gallery's goes, the split fin stays.
  expect((await json(root, 'content/species/schistura-spilota/entity.json')).photos).toEqual([well, split])
  expect((await json(root, 'content/gallery/schistura-spilota.json')).photos).toEqual([])
  // A page's only photo stays and is listed. It is not on the never-again list, which would take it off every page.
  expect((await json(root, 'content/species/callochromis-macrops/entity.json')).photos).toEqual([thin])
  expect(r.unwell).toEqual([`species/callochromis-macrops: ${thin.url} (skinny; the page's only photo)`])
  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), {
    [dead.url]: "unwell",
    [torn.url]: "unwell",
  })
  expect(await unwell()).toBe(0)
  // The photo check, which strips what is on that list, leaves the kept photo where it is.
  const never = async (): Promise<never> => { throw new Error('no model call here') }
  await checkPagePhotos(root, { get: never, look: never }, { limit: 0 })
  expect((await json(root, 'content/species/callochromis-macrops/entity.json')).photos).toEqual([thin])
  const again = await sweep(root)
  expect(again.photos).toEqual([])
  expect(again.unwell).toEqual(r.unwell)
  // Once the page has another photo of its own, the unwell one goes.
  await put('species/callochromis-macrops/entity.json', species('callochromis-macrops', 'Callochromis macrops', { photos: [thin, sf('adult', 'Adult male.')] }))
  expect((await sweep(root)).photos).toEqual([`species/callochromis-macrops: ${thin.url} (unwell: its source's caption says "skinny")`])
  // A head a person picked from the gallery is one of the page's own photos in the same sweep, so the unwell photo
  // beside it goes at once. A sweep later would leave the rule at one, and the cycle tests after one sweep.
  const lone = sf('lone', 'Recently-deceased specimen.'), chosen = sf('chosen', 'Adult male.')
  await put('species/aaa-picked/entity.json', species('aaa-picked', 'Aaa picked', { photos: [lone] }))
  await put('species/aaa-picked/vi.json', vi('Cá chạch suối chọn', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('gallery/aaa-picked.json', { id: 'aaa-picked', photos: [chosen], seen: 1, updatedAt: '2026-10-01' })
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/aaa-picked': chosen.url }))
  const picked = await sweep(root)
  expect(picked.heads).toEqual([`species/aaa-picked: ${lone.url} -> ${chosen.url}`])
  expect(picked.photos).toEqual([`species/aaa-picked: ${lone.url} (unwell: its source's caption says "deceased")`])
  expect((await json(root, 'content/species/aaa-picked/entity.json')).photos).toEqual([chosen])
  expect(await unwell()).toBe(0)
  // A photo that is one page's only photo and is also on a page with another leaves that other page and stays off the
  // never-again list, which would take it off both.
  const shared = sf('shared', 'Newly-imported, hence a little skinny, specimen.')
  await put('species/bbb-only/entity.json', species('bbb-only', 'Bbb only', { photos: [shared] }))
  await put('species/bbb-only/vi.json', vi('Cá chạch suối lẻ', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('species/ccc-more/entity.json', species('ccc-more', 'Ccc more', { photos: [sf('fine', 'Adult male.'), shared] }))
  await put('species/ccc-more/vi.json', vi('Cá chạch suối đôi', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  expect((await sweep(root)).photos).toEqual([`species/ccc-more: ${shared.url} (unwell: its source's caption says "skinny")`])
  expect((await json(root, 'content/species/bbb-only/entity.json')).photos).toEqual([shared])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).not.toContain(shared.url)
  // A head a person picked is not taken off by a caption's words (the chief of staff, 2026-11-11): it stays first, off
  // the never-again list, and is listed with its caption each run until a person says it goes.
  const pick = sf('pick', 'Skinny juvenile.')
  await put('species/eee-chosen/entity.json', species('eee-chosen', 'Eee chosen', { photos: [sf('plain', 'Adult male.'), pick] }))
  await put('species/eee-chosen/vi.json', vi('Cá chạch suối quý', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  // Picked from the gallery, where its copy stays: one photo in two files, kept in both.
  await put('gallery/eee-chosen.json', { id: 'eee-chosen', photos: [pick], seen: 1, updatedAt: '2026-10-01' })
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/eee-chosen': pick.url }))
  const held = await sweep(root)
  expect(held.photos).toEqual([])
  expect(held.unwell).toContain(`species/eee-chosen: ${pick.url} (skinny; a head a person picked. Its caption: "Skinny juvenile.")`)
  expect((await json(root, 'content/species/eee-chosen/entity.json')).photos.map((x: { url: string }) => x.url)).toEqual([pick.url, 'https://media.aquatome.com/seriouslyfish/plain.webp'])
  expect((await json(root, 'content/gallery/eee-chosen.json')).photos).toEqual([pick])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).not.toContain(pick.url)
  expect(await unwell()).toBe(0)
  await checkPagePhotos(root, { get: never, look: never }, { limit: 0 })
  expect((await json(root, 'content/species/eee-chosen/entity.json')).photos[0].url).toBe(pick.url)
  // The same photo on a page where nobody picked it leaves that page, and still stays off the never-again list.
  await put('species/fff-other/entity.json', species('fff-other', 'Fff other', { photos: [sf('plain-2', 'Adult male.'), pick] }))
  await put('species/fff-other/vi.json', vi('Cá chạch suối khác', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  expect((await sweep(root)).photos).toEqual([`species/fff-other: ${pick.url} (unwell: its source's caption says "skinny")`])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).not.toContain(pick.url)
  expect((await json(root, 'content/species/eee-chosen/entity.json')).photos[0].url).toBe(pick.url)
  // One photo with two captions: healthy on the page that picked it, or on the page it is the only photo of, and unwell
  // on another page. It leaves the other page and stays off the never-again list, so the first page keeps it.
  const two = sf('two', 'Adult male.'), three = sf('three', 'Adult female.')
  await put('species/ggg-picker/entity.json', species('ggg-picker', 'Ggg picker', { photos: [two, sf('plain-3', 'Adult male.')] }))
  await put('species/ggg-picker/vi.json', vi('Cá chạch suối nhất', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  // Listed twice among the page's own photos, as two pages have one today: still its only photo.
  await put('species/hhh-single/entity.json', species('hhh-single', 'Hhh single', { photos: [three, three] }))
  await put('species/hhh-single/vi.json', vi('Cá chạch suối nhì', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('species/iii-says/entity.json', species('iii-says', 'Iii says', { photos: [sf('plain-4', 'Adult male.'), { ...two, caption: 'Skinny juvenile.' }, { ...three, caption: 'Emaciated female.' }] }))
  await put('species/iii-says/vi.json', vi('Cá chạch suối ba', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/eee-chosen': pick.url, 'species/ggg-picker': two.url }))
  expect((await sweep(root)).photos).toEqual([
    `species/iii-says: ${two.url} (unwell: its source's caption says "skinny")`,
    `species/iii-says: ${three.url} (unwell: its source's caption says "emaciated")`,
  ])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).not.toContain(two.url)
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).not.toContain(three.url)
  await checkPagePhotos(root, { get: never, look: never }, { limit: 0 })
  expect((await json(root, 'content/species/ggg-picker/entity.json')).photos[0].url).toBe(two.url)
  expect((await json(root, 'content/species/hhh-single/entity.json')).photos).toEqual([three, three])
  expect(await unwell()).toBe(0)
  // Another rule's word still takes a photo off every page: a paper's plate on one page, though it is another page's
  // only photo and called unwell there.
  const plate = { ...sf('plate', 'Skinny juvenile.'), sourceUrl: 'https://commons.wikimedia.org/wiki/File:Jjj_lone.jpg' }
  await put('species/jjj-lone/entity.json', species('jjj-lone', 'Jjj lone', { photos: [plate] }))
  await put('species/jjj-lone/vi.json', vi('Cá chạch suối tư', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('species/kkk-plate/entity.json', species('kkk-plate', 'Kkk plate', { photos: [sf('plain-5', 'Adult male.'), { ...plate, caption: 'Figure 1; (a) the whole fish, (b) its scales' }] }))
  await put('species/kkk-plate/vi.json', vi('Cá chạch suối năm', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  expect((await sweep(root)).photos).toEqual([`species/kkk-plate: ${plate.url} (not a photo: a paper's plate, (a), (b), not Kkk plate)`])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).toContain(plate.url)
  // A breed's gallery is read too.
  const bred = sf('bred', 'Two dead specimens of different ages.')
  await put('breeds/ddd-breed/entity.json', { id: 'ddd-breed', kind: 'variety', parents: [], care: {}, photos: [sf('breed-own', 'Adult male.')], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  await put('breeds/ddd-breed/vi.json', vi('Cá chạch lai', {}, { slug: 'ca-chach-lai', body: '<p>Một dòng lai.</p>' }))
  await put('gallery/ddd-breed.json', { id: 'ddd-breed', photos: [bred], seen: 1, updatedAt: '2026-10-01' })
  expect(await unwell()).toBe(1)
  expect((await sweep(root)).photos).toEqual([`breeds/ddd-breed: ${bred.url} (unwell: its source's caption says "dead specimens")`])
  expect((await json(root, 'content/gallery/ddd-breed.json')).photos).toEqual([])
})

test("the unwell rule keeps a page's last photo when the never-again list takes the other in the same sweep, and an album's last on a page with none of its own (the guard's read, 14 Nov)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const sf = (name: string, caption: string) => ({ ...photo(`https://media.aquatome.com/seriouslyfish/${name}.webp`, caption), sourceUrl: 'https://www.seriouslyfish.com/species/x/' })
  // A guide's check listed `person` while the page still had `hurt` beside it, so it held neither.
  const person = sf('person', 'Adult male.'), hurt = sf('hurt', 'Male specimen with fin damage caused by another male.')
  await put('species/lll-two/entity.json', species('lll-two', 'Lll two', { photos: [person, hurt] }))
  await put('species/lll-two/vi.json', vi('Cá chạch suối hai', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ [person.url]: 'people' }))
  // No photo of its own: the page shows its album.
  const lone = sf('lone', 'Recently-deceased specimen.')
  await put('species/mmm-album/entity.json', species('mmm-album', 'Mmm album', { photos: [] }))
  await put('species/mmm-album/vi.json', vi('Cá chạch suối album', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('gallery/mmm-album.json', { id: 'mmm-album', photos: [lone], seen: 1, updatedAt: '2026-10-01' })
  const r = await sweep(root)
  expect((await json(root, 'content/species/lll-two/entity.json')).photos).toEqual([hurt])
  expect((await json(root, 'content/gallery/mmm-album.json')).photos).toEqual([lone])
  expect(r.unwell).toEqual([
    `species/lll-two: ${hurt.url} (damage; the page's only photo)`,
    `species/mmm-album: ${lone.url} (deceased; the page's only photo)`,
  ])
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json'))).toEqual([person.url])
  expect(ratcheted(checkPages(await loadPages(c), RULES.filter(x => x.id in RATCHETED)).findings).filter(f => f.rule === 'unwell')).toEqual([])
  // A gallery's photo the never-again list takes in the same sweep, on a page with none of its own: the other stays.
  const plain = sf('plain-g', 'Adult male.'), dying = sf('dying', 'Recently-deceased specimen.')
  await put('species/nnn-gallery/entity.json', species('nnn-gallery', 'Nnn gallery', { photos: [] }))
  await put('species/nnn-gallery/vi.json', vi('Cá chạch suối sáu', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('gallery/nnn-gallery.json', { id: 'nnn-gallery', photos: [plain, dying], seen: 1, updatedAt: '2026-10-01' })
  // The same unwell photo as one page's only gallery photo and beside another photo on a second page: it leaves the
  // second page only.
  const shared = sf('shared-g', 'Recently-deceased specimen.')
  await put('species/ooo-alone/entity.json', species('ooo-alone', 'Ooo alone', { photos: [] }))
  await put('species/ooo-alone/vi.json', vi('Cá chạch suối bảy', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('gallery/ooo-alone.json', { id: 'ooo-alone', photos: [shared], seen: 1, updatedAt: '2026-10-01' })
  await put('species/ppp-two/entity.json', species('ppp-two', 'Ppp two', { photos: [sf('fine-p', 'Adult male.'), shared] }))
  await put('species/ppp-two/vi.json', vi('Cá chạch suối tám', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ [person.url]: 'people', [plain.url]: 'people' }))
  const g = await sweep(root)
  expect((await json(root, 'content/gallery/nnn-gallery.json')).photos).toEqual([dying])
  expect((await json(root, 'content/gallery/ooo-alone.json')).photos).toEqual([shared])
  expect((await json(root, 'content/species/ppp-two/entity.json')).photos.map((x: { url: string }) => x.url)).toEqual(['https://media.aquatome.com/seriouslyfish/fine-p.webp'])
  expect(g.unwell).toContain(`species/nnn-gallery: ${dying.url} (deceased; the page's only photo)`)
  expect(g.unwell).toContain(`species/ooo-alone: ${shared.url} (deceased; the page's only photo)`)
  expect(Object.keys(await json(root, 'engine-state/_photo-rejected.json')).sort()).toEqual([person.url, plain.url].sort())
})

test("over the cap, the unwell rule counts the photos the cap keeps: none is reported as a page's only photo while another stays beside it (the guard's read, 14 Nov)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const plate = (n: number) => ({ ...photo(`https://media.aquatome.com/commons/cap-plate-${n}.webp`, `Figure ${n}; (a) the whole fish, (b) its scales`), sourceUrl: `https://commons.wikimedia.org/wiki/File:Paper_Figure_${n}.jpg` })
  const dying = { ...photo('https://media.aquatome.com/seriouslyfish/cap-dying.webp', 'Recently-deceased specimen.'), sourceUrl: 'https://www.seriouslyfish.com/species/x/' }
  await put('species/qqq-plate/entity.json', species('qqq-plate', 'Qqq plate', { photos: [plate(1), dying] }))
  await put('species/qqq-plate/vi.json', vi('Cá chạch suối chín', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  await put('species/rrr-plate/entity.json', species('rrr-plate', 'Rrr plate', { photos: [photo('https://media.aquatome.com/commons/cap-fine.webp', 'Adult male.'), plate(2)] }))
  await put('species/rrr-plate/vi.json', vi('Cá chạch suối mười', { 'distribution:seriouslyfish': '<p>Lào.</p>' }))
  const r = await sweep(root, { photoCap: 1 })
  expect((await json(root, 'content/species/qqq-plate/entity.json')).photos.map((x: { url: string }) => x.url)).toEqual([plate(1).url, dying.url])
  expect(r.unwell.filter(l => l.includes(dying.url))).toEqual([])
  expect(r.held.some(l => l.startsWith(`${dying.url} (unwell`))).toBe(true)
  expect(r.held).toHaveLength(3)
})

test("a run that would take more photos off every page than its cap takes none off, lists them, and leaves the check failing for a person; with the cap raised they go", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  // Three plates on one page, with a photo of another fish, which only ever leaves this page and isn't counted.
  const plates = [1, 2, 3].map(n => ({ ...photo(`https://media.aquatome.com/commons/plate-${n}.webp`, `Figure ${n}; (a) the whole fish, (b) its scales`), sourceUrl: `https://commons.wikimedia.org/wiki/File:Paper_Figure_${n}.jpg` }))
  const other = photo('https://media.aquatome.com/commons/sterbai.webp', 'Corydoras sterbai')
  const own = photo('https://media.aquatome.com/commons/own.webp', 'Corydoras adolfoi')
  await put('species/corydoras-adolfoi/entity.json', species('corydoras-adolfoi', 'Corydoras adolfoi', { photos: [own, ...plates, other] }))
  await put('species/corydoras-adolfoi/vi.json', vi('Cá chuột Adolfo', { 'distribution:seriouslyfish': '<p>Brazil.</p>' }))
  await put('species/corydoras-sterbai/entity.json', species('corydoras-sterbai', 'Corydoras sterbai', { photos: [other] }))
  await put('species/corydoras-sterbai/vi.json', vi('Cá chuột sterbai', { 'distribution:seriouslyfish': '<p>Brazil.</p>' }))
  const left = async () => (await json(root, 'content/species/corydoras-adolfoi/entity.json')).photos.map((p: { url: string }) => p.url.split('/').pop())
  const found = async () => ratcheted(checkPages(await loadPages(c), RULES.filter(x => x.id in RATCHETED)).findings).filter(f => f.rule === 'caption').length

  // A cap that is no whole number stops the run before it writes anything: "1O" for 10 would switch the cap off.
  await expect(sweep(root, { photoCap: Number('1O') })).rejects.toThrow('the photo cap is a whole number')
  await expect(sweep(root, { photoCap: -1 })).rejects.toThrow('the photo cap is a whole number')
  expect(await left()).toEqual(['own.webp', 'plate-1.webp', 'plate-2.webp', 'plate-3.webp', 'sterbai.webp'])
  const held = await sweep(root, { photoCap: 2 })
  expect(held.held).toHaveLength(3)
  expect(held.held[0]).toBe("https://media.aquatome.com/commons/plate-1.webp (not a photo: a paper's plate, (a), (b), not Corydoras adolfoi (species/corydoras-adolfoi))")
  expect(held.rejected).toBe(0)
  expect(await left()).toEqual(['own.webp', 'plate-1.webp', 'plate-2.webp', 'plate-3.webp'])
  await expect(readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8')).rejects.toThrow()
  expect(await found()).toBe(3) // each still fails the check the cycle's suite runs
  // A person has looked: the cap raised to what the run listed.
  const r = await sweep(root, { photoCap: 3 })
  expect(r.held).toEqual([])
  expect(r.rejected).toBe(3)
  expect(await left()).toEqual(['own.webp'])
  expect(await found()).toBe(0)
})

test('a card figure whose reason went shows again', async () => {
  const root = await store()
  await sweep(root)
  const file = join(root, 'content/species/corydoras-adolfoi/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  e.dataCard.sizeCm = [{ source: 'seriouslyfish', value: 4 }]
  await writeFile(file, JSON.stringify(e, null, 1))
  await sweep(root)
  expect(JSON.parse(await readFile(file, 'utf8')).dataCard.tankCm).toEqual([{ source: 'seriouslyfish', value: 60 }, { source: 'glaser', value: 10 }])
})

test('a rejected video leaves every species page it is on, and stays off', async () => {
  // The owner (2026-11-07): the speckled peacock bass page's video whose thumbnail shows the fish dead beside a tape measure.
  const root = await store()
  const video = (youtubeId: string) => ({ youtubeId, title: youtubeId, durationSec: 300, lang: 'en' })
  for (const id of ['corydoras-adolfoi', 'corydoras-sterbai']) {
    const file = join(root, 'content/species', id, 'entity.json')
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), videos: [video('deadfish000'), video('alive000000')] }, null, 2))
  }
  await writeFile(join(root, 'engine-state/_video-rejected.json'), JSON.stringify({ deadfish000: 'dead: a fish on a tape measure' }))
  const r = await sweep(root)
  expect(r.videos).toEqual(['species/corydoras-adolfoi: deadfish000 (dead: a fish on a tape measure)', 'species/corydoras-sterbai: deadfish000 (dead: a fish on a tape measure)'])
  for (const id of ['corydoras-adolfoi', 'corydoras-sterbai']) expect((await json(root, `content/species/${id}/entity.json`)).videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['alive000000'])
  expect((await sweep(root)).videos).toEqual([])
})

test('a species\' tank search is the card\'s minimum tank as shops sell it, never a smaller or mini tank', async () => {
  // The betta's and the neon's shop rows offered a 20 cm mini tank and a 40-litre one under a 45 and a 60 cm minimum
  // (design critique 2026-11-06). Corydoras adolfoi's card: 60 cm (Glaser's 10 cm is hidden).
  const root = await store()
  const set = async (id: string, productSlots: object[]) => {
    const file = join(root, 'content/species', id, 'entity.json')
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), productSlots }, null, 1))
  }
  const food = { category: 'thuc-an', keywords: ['thức ăn cá chuột'] }
  await set('corydoras-adolfoi', [{ category: 'be-ca', keywords: ['bể cá mini 20cm', 'bể cá 40 lít'] }, food])
  // No minimum tank on the card: nothing to judge the row by.
  await set('corydoras-sterbai', [{ category: 'be-ca', keywords: ['bể cá mini'] }])
  const r = await sweep(root)
  expect((await json(root, 'content/species/corydoras-adolfoi/entity.json')).productSlots).toEqual([{ category: 'be-ca', keywords: ['bể cá 60cm'] }, food])
  expect((await json(root, 'content/species/corydoras-sterbai/entity.json')).productSlots).toEqual([{ category: 'be-ca', keywords: ['bể cá mini'] }])
  expect(r.tanks).toEqual(['corydoras-adolfoi: bể cá mini 20cm, bể cá 40 lít → bể cá 60cm'])
  expect((await sweep(root)).tanks).toEqual([])
})

test('a shop\'s own talk and a page about one variety leave a species page, in every language; never all a page has', async () => {
  // The betta's page (design critique 2026-11-06): BW Aquatics' Copper Alien product page gave it a quick fact about the
  // hybrid, the shop's note on picking fish for its customers, and card figures; Aquarium Glaser its stock-list line.
  const root = await store()
  const alien = 'https://bwaquatics.com/products/alien-betta-copper-hybrid-rare-bettas'
  await writeFile(join(root, 'engine-state/_variety-pages.json'), JSON.stringify({ [alien]: { species: 'corydoras-adolfoi', variety: 'Copper Alien', at: '2026-11-06' }, 'https://x/koi': { species: 'gymnocorymbus-ternetzi', variety: 'Koi', at: '2026-11-06' } }))
  const file = (id: string, f: string) => join(root, 'content/species', id, f)
  const e = JSON.parse(await readFile(file('corydoras-adolfoi', 'entity.json'), 'utf8'))
  e.sections.push(
    { key: 'quickFacts', source: 'bwaquatics', sourceUrl: alien, html: '<p>Copper Alien Hybrid from breeders in Vietnam.</p>' },
    { key: 'beforeYouBuy', source: 'bwaquatics', sourceUrl: alien, html: '<p>We always pick the best fish for our customers.</p>' },
    { key: 'notes', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>A peaceful catfish.</p><p>For our customers: code 364006 on our stocklist.</p>' },
  )
  e.dataCard.tempC = [{ source: 'bwaquatics', value: { min: 24, max: 29 } }, { source: 'seriouslyfish', value: { min: 22, max: 30 } }]
  e.photos.push(photo('https://media.aquatome.com/bwaquatics/alien.webp', 'Copper Alien'))
  e.photos.at(-1).sourceUrl = alien
  await writeFile(file('corydoras-adolfoi', 'entity.json'), JSON.stringify(e, null, 1))
  const vi = JSON.parse(await readFile(file('corydoras-adolfoi', 'vi.json'), 'utf8'))
  Object.assign(vi.sections, { 'quickFacts:bwaquatics': '<p>Betta Copper Alien lai từ các nhà lai tạo ở Việt Nam.</p>', 'beforeYouBuy:bwaquatics': '<p>Chúng tôi luôn chọn con đẹp nhất cho khách hàng.</p>', 'notes:glaser': '<p>Cá chuột hiền.</p><p>Dành cho khách hàng của chúng tôi: mã 364006.</p>' })
  await writeFile(file('corydoras-adolfoi', 'vi.json'), JSON.stringify(vi, null, 1))
  await writeFile(file('corydoras-adolfoi', 'th.json'), JSON.stringify({ ...vi, sections: { 'notes:glaser': '<p>ปลาสงบ</p><p>สำหรับลูกค้า</p>', 'beforeYouBuy:bwaquatics': '<p>เราเลือก</p>' } }, null, 2))
  // A page whose only text is a variety's keeps it.
  const koi = JSON.parse(await readFile(file('gymnocorymbus-ternetzi', 'entity.json'), 'utf8'))
  koi.sections = [{ key: 'notes', source: 'sprucepets', sourceUrl: 'https://x/koi', html: '<p>Koi.</p>' }]
  await writeFile(file('gymnocorymbus-ternetzi', 'entity.json'), JSON.stringify(koi, null, 2))

  const r = await sweep(root)
  const after = JSON.parse(await readFile(file('corydoras-adolfoi', 'entity.json'), 'utf8'))
  expect(after.sections.map((x: { key: string; source: string; html: string }) => `${x.key}:${x.source} ${x.html}`)).toEqual([
    'distribution:seriouslyfish <p>Rivers.</p>', 'habitat:seriouslyfish <p>Rivers.</p>', 'notes:glaser <p>A peaceful catfish.</p>'])
  expect(after.dataCard.tempC).toEqual([{ source: 'seriouslyfish', value: { min: 22, max: 30 } }])
  expect(after.photos.map((p: { url: string }) => p.url)).not.toContain('https://media.aquatome.com/bwaquatics/alien.webp')
  const sections = async (f: string) => JSON.parse(await readFile(file('corydoras-adolfoi', f), 'utf8')).sections
  expect(Object.entries(await sections('vi.json')).filter(([k]) => !k.endsWith('seriouslyfish'))).toEqual([['notes:glaser', '<p>Cá chuột hiền.</p>']])
  expect(await sections('th.json')).toEqual({ 'notes:glaser': '<p>ปลาสงบ</p>' })
  expect(r.varieties).toEqual([`corydoras-adolfoi: ${alien}`, 'gymnocorymbus-ternetzi: https://x/koi (kept: all the page has)'])
  expect(r.shop).toEqual(['species/corydoras-adolfoi: notes:glaser (blocks)'])
  expect(r.summaries).toContain('corydoras-adolfoi')
  expect(JSON.parse(await readFile(file('gymnocorymbus-ternetzi', 'entity.json'), 'utf8')).sections).toHaveLength(1)
  expect((await sweep(root)).files).toEqual([])
})

// The chief of staff, 13 Nov 2026: a shop's part that is wholly its notice of a current batch or stock comes off when its
// heading has another source's text, and is listed when it's that heading's only text (fit.ts dealerNotice).
test('a shop\'s part that is wholly its notice of a batch or stock comes off when its heading has another source; alone, it\'s listed and stays', async () => {
  const root = await store()
  const file = (f: string) => join(root, 'content/species/corydoras-adolfoi', f)
  const e = JSON.parse(await readFile(file('entity.json'), 'utf8'))
  e.sections.push(
    { key: 'distribution', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>Currently fully grown, wild collected fish from Venezuela are on offer.</p>' },
    { key: 'beforeYouBuy', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>Beautiful wild-caught fish from Brazil have recently been imported.</p>' },
    { key: 'notes', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>A peaceful catfish. Some were recently imported from Peru.</p>' },
    // Two shops' notices alone under one heading: neither is the text that stays (Astra's read).
    { key: 'diet', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>This batch has only 7 fish.</p>' },
    { key: 'diet', source: 'bwaquatics', sourceUrl: 'https://bw/x', html: '<p>This batch has only 8 fish.</p>' },
    // A notice with a fact after a comma, beside another source's text: it stays, its fact with it (Astra's read).
    { key: 'habitat', source: 'glaser', sourceUrl: 'https://glaser/x', html: '<p>This batch has only 7 fish, the species needs soft water.</p>' },
  )
  await writeFile(file('entity.json'), JSON.stringify(e, null, 1))
  const vi = JSON.parse(await readFile(file('vi.json'), 'utf8'))
  Object.assign(vi.sections, {
    'distribution:glaser': '<p>Hiện ngoài tiệm có bán cá bắt ngoài tự nhiên ở Venezuela.</p>',
    'beforeYouBuy:glaser': '<p>Gần đây có một đợt cá bắt tự nhiên từ Brazil rất đẹp vừa được nhập về.</p>',
    'notes:glaser': '<p>Cá chuột hiền. Gần đây có một đợt nhập từ Peru về.</p>',
    'diet:glaser': '<p>Lô này chỉ có 7 con.</p>',
    'diet:bwaquatics': '<p>Lô này chỉ có 8 con.</p>',
    'habitat:glaser': '<p>Lô này chỉ có 7 con, loài này cần nước mềm.</p>',
  })
  await writeFile(file('vi.json'), JSON.stringify(vi, null, 1))
  await writeFile(file('th.json'), JSON.stringify({ ...vi, sections: { 'distribution:glaser': '<p>มีขาย</p>', 'notes:glaser': '<p>ปลาสงบ</p>' } }, null, 2))

  const r = await sweep(root)
  expect(r.dealer).toEqual(['species/corydoras-adolfoi: distribution:glaser'])
  expect(r.dealerOnly).toEqual(['species/corydoras-adolfoi: beforeYouBuy:glaser', 'species/corydoras-adolfoi: diet:glaser', 'species/corydoras-adolfoi: diet:bwaquatics'])
  const keys = (x: { sections: { key: string; source: string }[] }) => x.sections.map(s => `${s.key}:${s.source}`)
  expect(keys(JSON.parse(await readFile(file('entity.json'), 'utf8')))).toEqual(['distribution:seriouslyfish', 'habitat:seriouslyfish', 'beforeYouBuy:glaser', 'notes:glaser', 'diet:glaser', 'diet:bwaquatics', 'habitat:glaser'])
  expect(Object.keys(JSON.parse(await readFile(file('vi.json'), 'utf8')).sections).filter(k => k.endsWith(':glaser')).sort()).toEqual(['beforeYouBuy:glaser', 'diet:glaser', 'habitat:glaser', 'notes:glaser'])
  expect(JSON.parse(await readFile(file('th.json'), 'utf8')).sections).toEqual({ 'notes:glaser': '<p>ปลาสงบ</p>' })
  // Again: nothing to change, and the one left is listed each run.
  const again = await sweep(root)
  expect(again.files).toEqual([])
  expect(again.dealerOnly).toEqual(['species/corydoras-adolfoi: beforeYouBuy:glaser', 'species/corydoras-adolfoi: diet:glaser', 'species/corydoras-adolfoi: diet:bwaquatics'])
})

const WEEKLY = "claude failed (1): You've hit your weekly limit · resets Nov 14 at 8am (Asia/Saigon)"
// The guide body the sweep already leaves in place, so a counted title is the only thing that would change the file.
const CLEAN = '<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 2:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 3:</strong> thiếu CO2.</p><h3>Phân nền</h3><h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>'

async function countedGuide(root: string, id: string) {
  const dir = join(root, 'content/guides', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id, kind: 'care', source: 'aquariumbreeder', sourceUrl: 'https://x/g', html: '', photos: [], mentions: [], updatedAt: '2026-10-01' }, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi('10 cách xử lý rêu hại nhanh', {}, { body: CLEAN }), null, 2)}\n`)
}

// Claude's own limit, and the step's ceiling for the day (ceiling.ts), which is to leave exactly the same: nothing
// written, no number dropped, no review logged.
test.each([WEEKLY, atCeiling('sweep')])('a usage limit leaves counted titles as they are and stops the run: %s', async limit => {
  const root = await store()
  await countedGuide(root, 'a')
  await countedGuide(root, 'b')
  const file = (id: string) => readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8')
  const before = { a: await file('a'), b: await file('b') }
  let calls = 0
  const r = await sweep(root, { llm: (async () => { calls++; throw new LlmError(limit) }) as Llm })
  expect(calls).toBe(1)
  expect(r.stopped).toContain(limit)
  expect(r.titles.filter(t => t.includes('/guides/a') || t.includes('/guides/b'))).toEqual([])
  expect(await file('a')).toBe(before.a)
  expect(await file('b')).toBe(before.b)
  await expect(readFile(join(root, 'engine-state/reviews/title.json'), 'utf8')).rejects.toThrow()
})

test('a failure that is not the usage limit still drops the number from a counted title', async () => {
  const once = async (llm: Llm) => {
    const root = await store()
    await countedGuide(root, 'a')
    const r = await sweep(root, { llm })
    return { r, name: (await json(root, 'content/guides/a/vi.json')).name as string }
  }
  const bad = await once(async () => { throw new Error('bad answer') })
  expect(bad.name).toBe('Cách xử lý rêu hại nhanh')
  expect(bad.r.titles.find(t => t.includes('/guides/a'))).toContain('rewrite failed: bad answer')
  const other = await once(async () => { throw new LlmError('claude failed (1): no JSON in the reply') })
  expect(other.name).toBe('Cách xử lý rêu hại nhanh')
  expect(other.r.stopped).toContain('no JSON')
  expect(other.r.titles.find(t => t.includes('/guides/a'))).toContain('number dropped')
})

test('a title rewritten by the model is kept when the reviewer passes it, and the number dropped when not', async () => {
  const llm = (title: string, score: number): Llm => async <T>({ schema }: { schema: object }) =>
    ((schema as { required: string[] }).required.includes('title') ? { title } : { score, notes: score < 0.75 ? ['subject changed'] : [] }) as T
  const kept = await store()
  expect((await sweep(kept, { llm: llm('3 cách xử lý rêu hại nhanh', 0.9) })).titles[0]).toBe('vi/guides/g: "10 cách xử lý rêu hại nhanh" → "3 cách xử lý rêu hại nhanh" (rewritten (0.90))')
  const refused = await store()
  expect((await sweep(refused, { llm: llm('Rêu hại', 0.4) })).titles[0]).toBe('vi/guides/g: "10 cách xử lý rêu hại nhanh" → "Cách xử lý rêu hại nhanh" (number dropped; rewrite "Rêu hại" not kept (0.40: subject changed))')
  // A rewrite still promising a count the text lacks is not even reviewed.
  const wrong = await store()
  expect((await sweep(wrong, { llm: llm('7 cách xử lý rêu hại', 0.9) })).titles[0]).toContain('number dropped; rewrite "7 cách xử lý rêu hại" not kept (0.00')
  // Reference lists are left as published.
  // One pass leaves nothing a second would change: the trailing form heading dropped brings the comments under half
  // the text, so they are cut; labels renumbered, the tidy folds the heading now inside the numbered run.
  for (const body of [
    '<p>Cá betta cần nước ấm 26 độ, thay nước mỗi tuần một lần và bể có nắp đậy kín.</p><h3>2 bình luận về “Cá betta”</h3><p>Minh: Bể của mình 10 lít có đủ cho một con không ạ?</p><h3>Để lại một bình luận</h3>',
    '<p>x</p><h3>Bước 1: a</h3><p>a</p><h3>Bước 9: b</h3><p>b</p><h3>Ghi chú</h3><p>n</p><h3>Bước 2: c</h3><p>c</p>',
  ]) {
    const once = sweepTranslation({ body }).t
    expect(sweepTranslation(once).fixed).toEqual([])
  }
  expect(sweepTranslation({ body: '<p>Cá betta cần nước ấm 26 độ, thay nước mỗi tuần một lần và bể có nắp đậy kín.</p><h3>2 bình luận về “Cá betta”</h3><p>Minh: Bể của mình 10 lít có đủ cho một con không ạ?</p><h3>Để lại một bình luận</h3>' }).t.body)
    .toBe('<p>Cá betta cần nước ấm 26 độ, thay nước mỗi tuần một lần và bể có nắp đậy kín.</p>')
  expect(sweepTranslation({ sections: { 'references:x': `<p>${REPEAT}</p>`, 'notes:x': `<p>${REPEAT}</p>` } }).t.sections).toEqual({ 'references:x': `<p>${REPEAT}</p>`, 'notes:x': `<p>${REPEAT}</p>` })
  // A guide's note that its source adapted it with permission: the sentence goes, once.
  const adapted = sweepTranslation({ body: '<p>Chúng chỉ đang ngủ thôi.</p><p>Bài gốc đăng trên Tropical World Magazine, số 9. Được Loaches Online chuyển thể với sự cho phép.</p>' })
  expect(adapted).toEqual({ t: { body: '<p>Chúng chỉ đang ngủ thôi.</p><p>Bài gốc đăng trên Tropical World Magazine, số 9.</p>' }, fixed: ['permission'] })
  expect(sweepTranslation(adapted.t).fixed).toEqual([])
})

test("a language the site doesn't serve yet is swept too: its text fixed, its names its own", async () => {
  const root = await store()
  const c = join(root, 'content')
  const long = 'Kerana batu ini lengai, air dalam akuarium anda tidak berubah walaupun selepas beberapa bulan.'
  await writeFile(join(c, 'guides/g/ms.json'), JSON.stringify(vi('Panduan', {}, { body: `<h3>Batu</h3><p>${long}</p><h3>4 komen mengenai “Batu”</h3><ul><li><p><strong>Marcia:</strong> Soalan.</p></li></ul><h3>Tinggalkan komen</h3>` })))
  await writeFile(join(c, 'species/corydoras-sterbai/ms.json'), JSON.stringify({ ...vi('Cory Sterbai', { 'distribution:seriouslyfish': '<p>Brazil.</p>' }), altNames: ['Corydoras sterbai', 'Cory sterbai', 'Ikan Sterbai'] }))
  const r = await sweep(root)
  expect((await json(root, 'content/guides/g/ms.json')).body).toBe(`<h3>Batu</h3><p>${long}</p>`)
  expect((await json(root, 'content/species/corydoras-sterbai/ms.json')).altNames).toEqual(['Ikan Sterbai'])
  expect(r.files).toEqual(expect.arrayContaining(['guides/g/ms.json', 'species/corydoras-sterbai/ms.json']))
})

test('"Phi châu" is written "châu Phi" on a page, in its name, other names and summary, and tilapia\'s "rô phi châu Phi" stays', async () => {
  const root = await store()
  const c = join(root, 'content')
  await mkdir(join(c, 'species/xenomystus-nigri'), { recursive: true })
  await writeFile(join(c, 'species/xenomystus-nigri/entity.json'), JSON.stringify(species('xenomystus-nigri', 'Xenomystus nigri'), null, 1))
  await writeFile(join(c, 'species/xenomystus-nigri/vi.json'), JSON.stringify({
    ...vi('Cá dao Phi châu', { 'distribution:seriouslyfish': '<p>Phi châu, lưu vực Congo. Không nuôi chung với cá rô phi châu Phi.</p>' }), altNames: ['Cá dao đen phi châu'],
  }, null, 1))
  await writeFile(join(c, 'summaries/xenomystus-nigri.json'), JSON.stringify({ id: 'xenomystus-nigri', summary: 'Cá dao Phi châu hợp bể lớn.', mistakes: ['Thả chung cá nhỏ thì cá dao phi châu ăn mất.'], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }, null, 2))
  const held = async () => ratcheted(checkPages(await loadPages(c), RULES.filter(r => r.id === 'wording')).findings).map(f => `${f.page.path}: ${f.detail}`)
  expect(await held()).toEqual(['/vi/ca/cá-dao-phi-châu/: "Phi châu" → "châu Phi"'])

  const r = await sweep(root)
  expect(await held()).toEqual([])
  const t = await json(root, 'content/species/xenomystus-nigri/vi.json')
  expect([t.name, t.altNames, t.sections]).toEqual(['Cá dao châu Phi', ['Cá dao đen châu Phi'], { 'distribution:seriouslyfish': '<p>Châu Phi, lưu vực Congo. Không nuôi chung với cá rô phi châu Phi.</p>' }])
  expect(t.slug).toBe('cá-dao-phi-châu') // the address stays
  expect(await json(root, 'content/summaries/xenomystus-nigri.json')).toMatchObject({ summary: 'Cá dao châu Phi hợp bể lớn.', mistakes: ['Thả chung cá nhỏ thì cá dao châu Phi ăn mất.'], review: 'approved' })
  expect(r.text.wording).toEqual(['summaries/xenomystus-nigri'])
  expect(r.text.tidy).toContain('species/xenomystus-nigri/vi')
  expect((await sweep(root)).files).toEqual([])
})

// The owner, 2026-11-11, on the zebra pleco's page: "Pleco must always include L number on name".
test("a pleco with an L number on record shows it in its name in every language, a name a person fixed too; the second run changes nothing", async () => {
  const root = await store()
  const c = join(root, 'content')
  await mkdir(join(c, 'species/hypancistrus-zebra'), { recursive: true })
  await writeFile(join(c, 'species/hypancistrus-zebra/entity.json'), JSON.stringify({ ...species('hypancistrus-zebra', 'Hypancistrus zebra'), family: 'Loricariidae', lNumber: 'L46' }, null, 1))
  await writeFile(join(c, 'species/hypancistrus-zebra/vi.json'), JSON.stringify({ ...vi('Cá zebra pleco', { 'distribution:seriouslyfish': '<p>Sông Xingu.</p>' }), nameFixed: true }, null, 1))
  await writeFile(join(c, 'species/hypancistrus-zebra/id.json'), JSON.stringify(vi('Zebra Pleco', { 'distribution:seriouslyfish': '<p>Sungai Xingu.</p>' }), null, 1))
  const held = async () => ratcheted(checkPages(await loadPages(c), RULES.filter(r => r.id === 'l-number')).findings).map(f => f.detail)
  expect(await held()).toEqual(['"Cá zebra pleco" → "Cá zebra pleco L46"', '"Zebra Pleco" → "Zebra Pleco L46"'])
  const r = await sweep(root)
  expect([(await json(root, 'content/species/hypancistrus-zebra/vi.json')).name, (await json(root, 'content/species/hypancistrus-zebra/id.json')).name]).toEqual(['Cá zebra pleco L46', 'Zebra Pleco L46'])
  expect(r.text.lnumber).toEqual(['species/hypancistrus-zebra/vi', 'species/hypancistrus-zebra/id'])
  expect(await held()).toEqual([])
  expect((await sweep(root)).files).toEqual([])
})

test('a fish\'s old name can\'t stop a publish: the sweep writes its name wherever the rule reads, in Vietnamese only, and what it can\'t say stays listed', async () => {
  const root = await store()
  const c = join(root, 'content')
  await mkdir(join(c, 'species/nannostomus-eques'), { recursive: true })
  await writeFile(join(c, 'species/nannostomus-eques/entity.json'), JSON.stringify(species('nannostomus-eques', 'Nannostomus eques'), null, 1))
  await writeFile(join(c, 'species/nannostomus-eques/vi.json'), JSON.stringify(vi('Cá bút chì Nannostomus eques', { 'distribution:seriouslyfish': '<p>Cá bút chì (Nannostomus eques) sống ở Nam Mỹ.</p>' }), null, 1))
  await writeFile(join(c, 'species/nannostomus-eques/id.json'), JSON.stringify(vi('Cá bút chì Nannostomus eques', { 'distribution:seriouslyfish': '<p>Ikan.</p>' }), null, 1))
  await writeFile(join(c, 'summaries/nannostomus-eques.json'), JSON.stringify({ id: 'nannostomus-eques', summary: 'Cá bút chì (Nannostomus eques) hiền.', mistakes: ['Cá bút chì (pencilfish) nhát.'], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }, null, 2))
  await mkdir(join(c, 'equipment'), { recursive: true })
  const guide = (await readFile(new URL('../../../content/equipment/co2.json', import.meta.url), 'utf8'))
  await writeFile(join(c, 'equipment/co2.json'), JSON.stringify({ ...JSON.parse(guide), lead: 'Cá bút chì (pencilfish) không cần CO2.', intro: '<p>Cá cờ (Mesonauta) cũng vậy.</p>' }, null, 2))
  const listed = async () => checkPages(await loadPages(c), RULES.filter(r => r.id === 'swapped-name')).findings.map(f => f.page.path)
  expect((await listed()).length).toBeGreaterThan(0)

  const r = await sweep(root)
  expect(await listed()).toEqual([])
  const t = await json(root, 'content/species/nannostomus-eques/vi.json')
  expect([t.name, t.sections['distribution:seriouslyfish']]).toEqual(['Cá chì Nannostomus eques', '<p>Cá chì (Nannostomus eques) sống ở Nam Mỹ.</p>'])
  expect((await json(root, 'content/species/nannostomus-eques/id.json')).name).toBe('Cá bút chì Nannostomus eques')
  expect(await json(root, 'content/summaries/nannostomus-eques.json')).toMatchObject({ summary: 'Cá chì (Nannostomus eques) hiền.', mistakes: ['Cá chì (pencilfish) nhát.'] })
  expect(await json(root, 'content/equipment/co2.json')).toMatchObject({ lead: 'Cá chì (pencilfish) không cần CO2.', intro: '<p>Cá Mesonauta (Mesonauta) cũng vậy.</p>' })
  expect(r.text.renamed).toEqual(expect.arrayContaining(['species/nannostomus-eques/vi', 'equipment/co2']))
  expect((await sweep(root)).files).toEqual([])

  // A sentence that doesn't say which fish: not guessed at, and the test goes on listing it.
  await writeFile(join(c, 'species/nannostomus-eques/vi.json'), JSON.stringify(vi('Cá chì', { 'distribution:seriouslyfish': '<p>Cá cờ lùn (dwarf flag cichlid) sống ở Nam Mỹ.</p>' }), null, 1))
  await sweep(root)
  expect(await listed()).toEqual(['/vi/ca/cá-chì/'])
})

// The chief of staff, 2026-11-13: the blue-eye is "cá mắt xanh", not the rainbowfish's "cầu vồng". Through the engine, guarded,
// the old name kept for search, the address as it was.
test('a fish the chief of staff named takes its name, guarded, the old one among its other names and its address as it was; its text, summary and other pages follow; the second run changes nothing', async () => {
  const root = await store()
  const c = join(root, 'content')
  const at = 'species/pseudomugil-luminatus'
  await mkdir(join(c, at), { recursive: true })
  await writeFile(join(c, at, 'entity.json'), JSON.stringify(species('pseudomugil-luminatus', 'Pseudomugil luminatus'), null, 1))
  await writeFile(join(c, at, 'vi.json'), JSON.stringify({
    ...vi('Cá cầu vồng neon đỏ mắt xanh', { 'distribution:seriouslyfish': '<p>Pseudomugil luminatus, tên thường gọi là cá cầu vồng mắt xanh đỏ neon, sống ở New Guinea.</p><p>Nuôi chung với các loài cá cầu vồng hiền khác.</p>' }),
    slug: 'ca-cau-vong-neon-do-mat-xanh', altNames: ['Cá cầu vồng neon đỏ', 'Red-Neon Blue-eye', 'Cá mắt xanh neon đỏ'],
  }, null, 1))
  await writeFile(join(c, at, 'id.json'), JSON.stringify(vi('Ikan Pelangi Neon Merah', { 'distribution:seriouslyfish': '<p>Ikan.</p>' }), null, 1))
  await writeFile(join(c, 'summaries/pseudomugil-luminatus.json'), JSON.stringify({ id: 'pseudomugil-luminatus', summary: 'Cá cầu vồng neon đỏ mắt xanh hợp bể nhỏ.', mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }, null, 2))
  const guide = await json(root, 'content/guides/g/vi.json')
  await writeFile(join(c, 'guides/g/vi.json'), JSON.stringify({ ...guide, body: `<p>Thử cá cầu vồng neon đỏ mắt xanh.</p>${guide.body}` }, null, 2))
  const listed = async () => checkPages(await loadPages(c), RULES.filter(r => r.id === 'swapped-name')).findings.map(f => f.page.path)
  expect(await listed()).toEqual(expect.arrayContaining(['/vi/ca/ca-cau-vong-neon-do-mat-xanh/', '/vi/huong-dan/10-cách-xử-lý-rêu-hại-nhanh/']))

  const r = await sweep(root)
  expect(await listed()).toEqual([])
  const t = await json(root, `content/${at}/vi.json`)
  expect([t.name, t.nameFixed, t.slug]).toEqual(['Cá mắt xanh neon đỏ', true, 'ca-cau-vong-neon-do-mat-xanh'])
  expect(t.altNames).toEqual(['Cá cầu vồng neon đỏ', 'Red-Neon Blue-eye', 'Cá cầu vồng neon đỏ mắt xanh'])
  // Its tankmates' "cá cầu vồng" names no blue-eye, so it stays.
  expect(t.sections['distribution:seriouslyfish']).toBe('<p>Pseudomugil luminatus, tên thường gọi là cá mắt xanh đỏ neon, sống ở New Guinea.</p><p>Nuôi chung với các loài cá cầu vồng hiền khác.</p>')
  expect((await json(root, `content/${at}/id.json`)).name).toBe('Ikan Pelangi Neon Merah')
  expect((await json(root, 'content/summaries/pseudomugil-luminatus.json')).summary).toBe('Cá mắt xanh neon đỏ hợp bể nhỏ.')
  expect((await json(root, 'content/guides/g/vi.json')).body).toContain('<p>Thử cá mắt xanh neon đỏ.</p>')
  expect(r.text['fish-name']).toEqual(['species/pseudomugil-luminatus/vi'])
  expect(r.files).toEqual(expect.arrayContaining([`${at}/vi.json`, 'summaries/pseudomugil-luminatus.json', 'guides/g/vi.json']))
  expect((await sweep(root)).files).toEqual([])

  // A name a person chose is theirs: the step leaves a guarded page as it is.
  await writeFile(join(c, at, 'vi.json'), JSON.stringify({ ...t, name: 'Cá mắt xanh Paskai', altNames: [] }, null, 1))
  expect(await nameFish(c)).toEqual([])
  expect(await nameFish(c, [{ id: 'pseudomugil-luminatus', sci: 'Pseudomugil luminatus', was: 'Cá mắt xanh Paskai', name: 'Cá khác' }])).toEqual([])
  expect((await json(root, `content/${at}/vi.json`)).name).toBe('Cá mắt xanh Paskai')
  // Its own name, the kept ones dropped by a later write (Astra, 2026-11-13: species research writes a page's other
  // names afresh): they come back, once.
  await writeFile(join(c, at, 'vi.json'), JSON.stringify({ ...t, altNames: ['Red-Neon Blue-eye'] }, null, 1))
  expect(await nameFish(c)).toEqual(['species/pseudomugil-luminatus'])
  expect((await json(root, `content/${at}/vi.json`)).altNames).toEqual(['Red-Neon Blue-eye', 'Cá cầu vồng neon đỏ mắt xanh'])
  expect(await nameFish(c)).toEqual([])
})

// Astra, 2026-11-13: a guide's heading and line a rule can't tie to the blue-eye ("Bể cá cầu vồng nano") are written as
// a person read them, on their own page; its sources' references and other pages stay.
test('a passage a person found is written as they said, on its page only, once', async () => {
  const root = await store()
  const c = join(root, 'content')
  const guide = await json(root, 'content/guides/g/vi.json')
  await writeFile(join(c, 'guides/g/vi.json'), JSON.stringify({ ...guide, body: `<h3>Bể cá cầu vồng nano</h3>${guide.body}`, sections: { 'references:x': '<p>Bể cá cầu vồng nano</p>' } }, null, 2))
  const rows = [{ page: 'guides/g', was: 'Bể cá cầu vồng nano', now: 'Bể cá mắt xanh' }, { page: 'guides/none', was: 'a', now: 'b' }]
  expect(await kindPassages(c, rows)).toEqual(['guides/g'])
  const t = await json(root, 'content/guides/g/vi.json')
  expect(t.body).toBe(`<h3>Bể cá mắt xanh</h3>${guide.body}`)
  expect(t.sections).toEqual({ 'references:x': '<p>Bể cá cầu vồng nano</p>' })
  expect(await kindPassages(c, rows)).toEqual([])
})

// Astra's second read: the 20-gallon guide's three blue-eyes, the first still "cầu vồng neon đỏ"; the others stay as they are.
test('the 20-gallon guide\'s red neon blue-eye is called by its name, in its sentence', async () => {
  const root = await store()
  const c = join(root, 'content')
  const page = 'guides/aquariumcoop-blogs-aquarium-5-best-fish-tank-ideas-for-a-20-gallon-aquarium'
  await mkdir(join(c, page), { recursive: true })
  const said = (first: string) => `<p>Một số loài được chuộng nhất là ${first} (P. luminatus), mắt xanh đuôi chẻ hay furcata (P. furcatus), mắt xanh đốm (P. gertrudae), cầu vồng Celebes (Marosatherina ladigesi) và cầu vồng vây sợi (Iriatherina werneri).</p>`
  await writeFile(join(c, page, 'vi.json'), JSON.stringify(vi('5 ý tưởng bể 75 lít', {}, { body: said('cầu vồng neon đỏ') }), null, 2))
  expect(await kindPassages(c)).toEqual([page])
  expect((await json(root, `content/${page}/vi.json`)).body).toBe(said('mắt xanh neon đỏ'))
  expect(await kindPassages(c)).toEqual([])
})

test('a card\'s Seriously Fish difficulty read before the engine read its word is corrected from the stored page, and its summary written again', async () => {
  const root = await store()
  await sweep(root)
  const file = join(root, 'content/species/corydoras-sterbai/entity.json')
  await writeFile(file, `${JSON.stringify({ ...await json(root, 'content/species/corydoras-sterbai/entity.json'), dataCard: { difficulty: [{ source: 'seriouslyfish', value: 6 }, { source: 'glaser', value: 5 }] } }, null, 2)}\n`)
  await writeFile(join(root, 'content/summaries/corydoras-sterbai.json'), JSON.stringify({ id: 'corydoras-sterbai', summary: 'Độ khó 5/8 (vừa).', mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }))
  const page = (word: string) => `---\nurl: https://www.seriouslyfish.com/x\n---\n\n## Difficulty6 of 8 measures\n${word}\nHow the rating is worked out\n`
  await mkdir(join(root, 'sources/seriouslyfish'), { recursive: true })
  await writeFile(join(root, 'sources/seriouslyfish/x.md'), page('Easy'))
  const r = await sweep(root)
  expect((await json(root, 'content/species/corydoras-sterbai/entity.json')).dataCard.difficulty).toEqual([{ source: 'seriouslyfish', value: 2 }, { source: 'glaser', value: 5 }])
  expect(r.card).toEqual(['species/corydoras-sterbai: difficulty 6 → 2 (Seriously Fish\'s word)'])
  expect(await json(root, 'content/summaries/corydoras-sterbai.json')).toMatchObject({ review: 'pending', summary: 'Độ khó 5/8 (vừa).' })
  expect(r.summaries).toEqual(['corydoras-sterbai'])
  expect((await sweep(root)).files).toEqual([])
  // A page that rates it no more takes Seriously Fish's figure off; the other source's stays.
  await writeFile(join(root, 'sources/seriouslyfish/x.md'), page('Not enough data to rate'))
  await sweep(root)
  expect((await json(root, 'content/species/corydoras-sterbai/entity.json')).dataCard.difficulty).toEqual([{ source: 'glaser', value: 5 }])
})

test('a Seriously Fish quick-facts line that gives its count of measures takes the card\'s difficulty, in English and every language, and leaves the approved summary alone', async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai'
  const quick = { key: 'quickFacts', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html: '<ul><li>Max size: 5 cm</li><li>Difficulty: 7 of 8 (difficult), because it needs a long tank.</li></ul>' }
  const e = await json(root, `${at}/entity.json`)
  await writeFile(join(root, `${at}/entity.json`), `${JSON.stringify({ ...e, dataCard: { difficulty: [{ source: 'seriouslyfish', value: 6 }] }, sections: [...e.sections, quick] }, null, 2)}\n`)
  const t = await json(root, `${at}/vi.json`)
  await writeFile(join(root, `${at}/vi.json`), `${JSON.stringify({ ...t, sections: { ...t.sections, 'quickFacts:seriouslyfish': '<ul><li>Kích thước: 5 cm</li><li>Độ khó: 7/8 (khó), vì cần bể dài.</li></ul>' } }, null, 2)}\n`)
  await writeFile(join(root, `${at}/id.json`), `${JSON.stringify(vi('Corydoras sterbai', { 'quickFacts:seriouslyfish': '<ul><li>Ukuran: 5 cm</li><li>Tingkat kesulitan: 7 dari 8 (sulit)</li></ul>' }), null, 2)}\n`)
  await writeFile(join(root, 'content/summaries/corydoras-sterbai.json'), JSON.stringify({ id: 'corydoras-sterbai', summary: 'Độ khó 6/8 (khó).', mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }))
  const r = await sweep(root)
  expect((await json(root, `${at}/entity.json`)).sections.at(-1).html).toContain('Difficulty: 6 of 8 (difficult), because it needs a long tank.')
  expect((await json(root, `${at}/vi.json`)).sections['quickFacts:seriouslyfish']).toContain('Độ khó: 6/8 (khó), vì cần bể dài.')
  expect((await json(root, `${at}/id.json`)).sections['quickFacts:seriouslyfish']).toContain('Tingkat kesulitan: 6 dari 8 (sulit)')
  expect(await json(root, 'content/summaries/corydoras-sterbai.json')).toMatchObject({ review: 'approved' })
  expect(r.text['sf-count']).toEqual(['species/corydoras-sterbai/en', 'species/corydoras-sterbai/vi', 'species/corydoras-sterbai/id'])
  expect((await sweep(root)).files).toEqual([])
})

// 2026-11-07, a design lab: Cá neon vua's summary said 23–27 °C beside a card of 23–29 °C. It was checked against the card
// when it was written, and the card's rule for sources that disagree changed after; its page didn't.
test('an approved summary stating a figure its card no longer shows waits to be written again; one that agrees stays', async () => {
  const root = await store()
  await sweep(root)
  const c = join(root, 'content')
  const card = { tempC: [{ source: 'seriouslyfish', value: { min: 23, max: 29 } }, { source: 'sprucepets', value: { min: 23, max: 27 } }], sizeCm: [{ source: 'seriouslyfish', value: 3.5 }] }
  for (const [id, sci, name, summary] of [['paracheirodon-axelrodi', 'Paracheirodon axelrodi', 'Cá neon vua', 'Nước 23–27 °C, cá dài 3,5 cm.'], ['paracheirodon-simulans', 'Paracheirodon simulans', 'Cá neon xanh lục', 'Nước 23–29 °C, cá dài 3,5 cm.']] as const) {
    await mkdir(join(c, 'species', id), { recursive: true })
    await writeFile(join(c, 'species', id, 'entity.json'), `${JSON.stringify(species(id, sci, { dataCard: card }), null, 2)}\n`)
    await writeFile(join(c, 'species', id, 'vi.json'), `${JSON.stringify(vi(name, { 'distribution:seriouslyfish': '<p>Rio Negro.</p>' }), null, 2)}\n`)
    await writeFile(join(c, 'summaries', `${id}.json`), `${JSON.stringify({ id, summary, mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' }, null, 2)}\n`)
  }
  const r = await sweep(root)
  expect(await json(root, 'content/summaries/paracheirodon-axelrodi.json')).toMatchObject({ review: 'pending', summary: 'Nước 23–27 °C, cá dài 3,5 cm.' })
  expect((await json(root, 'content/summaries/paracheirodon-axelrodi.json')).problems).toBeUndefined()
  expect(await json(root, 'content/summaries/paracheirodon-simulans.json')).toMatchObject({ review: 'approved' })
  expect(r.summaries).toEqual(['paracheirodon-axelrodi'])
  expect((await sweep(root)).files).toEqual([])
})

test('a name as hobbyists write it: "Rêu Java", "Vallisneria (cỏ lươn)"; a name a person fixed and the addresses stay (home page review, 2026-11-07)', async () => {
  const root = await store()
  const c = join(root, 'content')
  const plant = async (id: string, sci: string, t: object) => {
    await mkdir(join(c, 'plants', id), { recursive: true })
    await writeFile(join(c, 'plants', id, 'entity.json'), JSON.stringify({ id, scientificName: sci, difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte'], sections: [{ key: 'notes', source: 'tropica', sourceUrl: `https://tropica.com/${id}`, html: '<p>Easy.</p>' }], photos: [], productSlots: [], updatedAt: '2026-10-01' }, null, 2))
    await writeFile(join(c, 'plants', id, 'vi.json'), JSON.stringify({ sections: { 'notes:tropica': '<p>Dễ trồng.</p>' }, quality: { score: 0.9, indexable: true }, ...t }, null, 1))
  }
  await plant('taxiphyllum-barbieri', 'Taxiphyllum barbieri', { slug: 'reu-java', name: 'Rêu java', altNames: ['Rêu java Bogor', 'Java moss'] })
  await plant('vallisneria', 'Vallisneria', { slug: 'cay-thuy-sinh-vallisneria-co-luon', name: 'Cây thủy sinh Vallisneria (cỏ lươn)', altNames: ['Cỏ lươn', 'Vallisneria'] })
  await plant('microsorum-pteropus', 'Microsorum pteropus', { slug: 'duong-xi-java', name: 'Dương xỉ java', altNames: [], nameFixed: true })
  const held = async () => ratcheted(checkPages(await loadPages(c), RULES.filter(r => r.id === 'name')).findings).map(f => `${f.page.path}: ${f.detail}`)
  expect(await held()).toEqual(['/vi/cay/reu-java/: "Rêu java" → "Rêu Java"', '/vi/cay/cay-thuy-sinh-vallisneria-co-luon/: "Cây thủy sinh Vallisneria (cỏ lươn)" → "Vallisneria (cỏ lươn)"'])

  const r = await sweep(root)
  expect(await held()).toEqual([])
  const moss = await json(root, 'content/plants/taxiphyllum-barbieri/vi.json')
  expect([moss.name, moss.altNames, moss.slug]).toEqual(['Rêu Java', ['Rêu Java Bogor', 'Java moss'], 'reu-java'])
  const vallis = await json(root, 'content/plants/vallisneria/vi.json')
  expect([vallis.name, vallis.altNames, vallis.slug]).toEqual(['Vallisneria (cỏ lươn)', ['Cỏ lươn', 'Vallisneria'], 'cay-thuy-sinh-vallisneria-co-luon'])
  expect((await json(root, 'content/plants/microsorum-pteropus/vi.json')).name).toBe('Dương xỉ java')
  expect((await readFile(join(c, 'plants/vallisneria/vi.json'), 'utf8')).startsWith('{\n "sections"')).toBe(true) // its own indentation
  expect(r.text.name?.sort()).toEqual(['plants/taxiphyllum-barbieri/vi', 'plants/vallisneria/vi'])
  expect((await sweep(root)).files).toEqual([])
})

test('a picked gallery photo leads, keeping every page photo and its gallery copy', async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai/entity.json'
  const e = await json(root, at)
  const old = e.photos[0]
  const other = photo('https://media.aquatome.com/commons/other.webp', 'Corydoras sterbai')
  const picked = { ...photo('https://media.aquatome.com/commons/picked.webp', 'Corydoras sterbai'), best: true, kind: 'wild', unchecked: false }
  const gallery = { id: 'corydoras-sterbai', photos: [picked], seen: 1, updatedAt: '2026-11-10T00:00:00.000Z' }
  await writeFile(join(root, at), JSON.stringify({ ...e, photos: [old, other] }))
  await writeFile(join(root, 'content/gallery/corydoras-sterbai.json'), JSON.stringify(gallery))
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/corydoras-sterbai': picked.url }))
  const r = await sweep(root)
  const { best: _b, kind: _k, unchecked: _u, ...clean } = picked
  expect((await json(root, at)).photos).toEqual([clean, old, other])
  expect(await json(root, 'content/gallery/corydoras-sterbai.json')).toEqual(gallery)
  expect(r.heads).toEqual([`species/corydoras-sterbai: ${old.url} -> ${picked.url}`])
  expect((await sweep(root)).heads).toEqual([])
})

test('a picked photo further down the page moves first and the rest keep their order', async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai/entity.json'
  const e = await json(root, at)
  const other = photo('https://media.aquatome.com/commons/other.webp', 'Corydoras sterbai')
  const picked = photo('https://media.aquatome.com/commons/picked.webp', 'Corydoras sterbai')
  await writeFile(join(root, at), JSON.stringify({ ...e, photos: [e.photos[0], other, picked] }))
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/corydoras-sterbai': picked.url }))
  const r = await sweep(root)
  expect((await json(root, at)).photos).toEqual([picked, e.photos[0], other])
  expect(r.heads).toEqual([`species/corydoras-sterbai: ${e.photos[0].url} -> ${picked.url}`])
})

test("a picked photo on neither list changes nothing and is reported", async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai/entity.json'
  const before = await readFile(join(root, at), 'utf8')
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/corydoras-sterbai': 'https://media.aquatome.com/commons/missing.webp' }))
  const r = await sweep(root)
  expect(await readFile(join(root, at), 'utf8')).toBe(before)
  expect(r.heads).toEqual(["species/corydoras-sterbai: picked photo isn't on the page"])
  expect(r.files).toEqual([])
})

test("a pick that rests on a person's yes lapses with it: once the check says anything but \"can't tell\" there, the page keeps its order and the sweep says so", async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai/entity.json'
  const e = await json(root, at)
  const picked = photo('https://media.aquatome.com/commons/picked.webp', 'Corydoras sterbai')
  await writeFile(join(root, at), JSON.stringify({ ...e, photos: [e.photos[0], picked] }))
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/corydoras-sterbai': picked.url }))
  const yes = { proposer: 'Photo Sourcing', approvers: ['the chief of staff', 'Curation'], on: '2026-11-19', lookAlike: 'Corydoras haraldschultzi', mark: 'the orange spines of the pectoral fins' }
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), JSON.stringify({ [picked.url]: { 'corydoras-sterbai': yes } }))
  const verdict = (ok: string) => writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify({ [picked.url]: { 'corydoras-sterbai': { ok, typical: true, note: '' } } }))
  await verdict('yes')
  const r = await sweep(root)
  expect((await json(root, at)).photos.map((p: { url: string }) => p.url)).toEqual([e.photos[0].url, picked.url])
  expect(r.heads).toEqual(["species/corydoras-sterbai: pick lapsed with its person's yes"])
  await verdict('unsure')
  expect((await sweep(root)).heads).toEqual([`species/corydoras-sterbai: ${e.photos[0].url} -> ${picked.url}`])
})

test('every photo on the never-again list leaves the pages and albums it is still on, as the photo check takes it off: a merge with main brings one back (2026-11-11)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const p = (name: string) => photo(`https://media.aquatome.com/inat/${name}.webp`, 'Danio erythromicron')
  const own = p('own'), poor = p('poor'), other = p('other'), albumKept = p('album-kept'), guideOff = p('guide-off'), guideKept = p('guide-kept'), bred = p('bred'), leaf = p('leaf')
  // An Aquarium Glaser photo with the shop's own mark, kept (watermarks.ts retainedOwnMark): listed for that mark it
  // stays, as the photo check leaves it; listed for anything else it goes.
  const glaser = (name: string) => ({ ...photo(`https://media.aquatome.com/glaser/${name}.webp`, 'Danio erythromicron'), sourceUrl: 'https://www.aquariumglaser.de/x' })
  const marked = glaser('marked'), held = glaser('held')
  await put('species/danio-erythromicron/entity.json', species('danio-erythromicron', 'Danio erythromicron', { photos: [own, poor, marked, held] }))
  await put('species/danio-erythromicron/vi.json', vi('Cá sóc đầu lửa', { 'distribution:seriouslyfish': '<p>Myanmar.</p>' }))
  // What the photos push of 2026-11-11 brought back: lines its run wrote before the removal reached main.
  await put('gallery/danio-erythromicron.json', { id: 'danio-erythromicron', photos: [albumKept, other], seen: 2, updatedAt: '2026-10-01' })
  await put('guides/g/entity.json', { id: 'g', kind: 'care', source: 'aquariumbreeder', sourceUrl: 'https://x/g', html: '', photos: [guideOff, guideKept], mentions: [], updatedAt: '2026-10-01' })
  await put('breeds/b/entity.json', { id: 'b', kind: 'variety', parents: [], care: {}, photos: [bred], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  await put('plants/l/entity.json', { ...species('l', 'Anubias nana', { photos: [leaf] }) })
  const list = {
    [poor.url]: 'too poor to show (the chief of staff, 2026-11-11)',
    [other.url]: 'not Danio erythromicron: another fish',
    [guideOff.url]: 'people: a hand holds the fish',
    [bred.url]: 'dead: a fish on a plate',
    [leaf.url]: 'drawing: a printed drawing',
    [marked.url]: 'watermark: the shop\'s logo, bottom left',
    [held.url]: 'people: a hand',
    // Listed by its own address: a large copy, and a loop's poster.
    'https://media.aquatome.com/inat/lg-large.webp': 'people: a hand',
    'https://media.aquatome.com/loops/bad-fish.webp': 'dead: a fish on a plate',
  }
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), `${JSON.stringify(list, null, 2)}\n`)
  const own_ = { retainedOwnMark: { source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/x', owner: 'source' } }
  await writeFile(join(root, 'engine-state/_photo-watermarks.json'), `${JSON.stringify({ [marked.url]: { ocr: [], ...own_ }, [held.url]: { ocr: [], ...own_ } }, null, 2)}\n`)
  // The calendar names some of them, the app's large copies too: a day's, a language's own day's, a guide's, a story's
  // and a week's hero's. Those go and the app shows the page's own; a picture not on the list, or kept, stays. A loop
  // whose poster is listed goes whole.
  const large = (u: string) => u.replace(/\.webp$/, '-large.webp')
  const loop = (id: string) => ({ src: `https://media.aquatome.com/loops/${id}.mp4`, poster: `https://media.aquatome.com/loops/${id}.webp` })
  await put('curation.json', { version: 1, loops: { 'bad-fish': loop('bad-fish'), 'good-fish': loop('good-fish') }, days: [
    { date: '2026-11-20', fish: 'species/danio-erythromicron', img: large(poor.url), guide: 'guides/g', guideImg: guideOff.url, by: { id: { fish: 'species/danio-erythromicron', img: held.url } } },
    { date: '2026-11-21', fish: 'species/danio-erythromicron', img: large(own.url), story: { page: 'guides/g', img: other.url } },
    { date: '2026-11-22', fish: 'species/danio-erythromicron', img: 'https://media.aquatome.com/inat/lg-large.webp' },
  ], weeks: [{ from: '2026-11-16', to: '2026-11-22', hero: [{ page: 'breeds/b', img: large(bred.url) }, { page: 'species/danio-erythromicron', img: large(marked.url) }] }] })
  const r = await sweep(root)
  expect(await json(root, 'content/curation.json')).toEqual({ version: 1, loops: { 'good-fish': loop('good-fish') }, days: [
    { date: '2026-11-20', fish: 'species/danio-erythromicron', guide: 'guides/g', by: { id: { fish: 'species/danio-erythromicron' } } },
    { date: '2026-11-21', fish: 'species/danio-erythromicron', img: large(own.url), story: { page: 'guides/g' } },
    { date: '2026-11-22', fish: 'species/danio-erythromicron' },
  ], weeks: [{ from: '2026-11-16', to: '2026-11-22', hero: [{ page: 'breeds/b' }, { page: 'species/danio-erythromicron', img: large(marked.url) }] }] })
  expect((await json(root, 'content/species/danio-erythromicron/entity.json')).photos).toEqual([own, marked])
  expect((await json(root, 'content/gallery/danio-erythromicron.json')).photos).toEqual([albumKept])
  expect((await json(root, 'content/guides/g/entity.json')).photos).toEqual([guideKept])
  expect((await json(root, 'content/breeds/b/entity.json')).photos).toEqual([])
  expect((await json(root, 'content/plants/l/entity.json')).photos).toEqual([])
  expect(r.again.map(x=>x.slice(0,x.indexOf(' ('))).sort()).toEqual([
    `breeds/b/entity.json: ${bred.url}`,
    `curation.json 2026-11-20 guideImg: ${guideOff.url}`,
    `curation.json 2026-11-20 id img: ${held.url}`,
    `curation.json 2026-11-20 img: ${large(poor.url)}`,
    `curation.json 2026-11-21 story img: ${other.url}`,
    'curation.json 2026-11-22 img: https://media.aquatome.com/inat/lg-large.webp',
    'curation.json loop bad-fish poster: https://media.aquatome.com/loops/bad-fish.webp',
    `curation.json week 2026-11-16 hero breeds/b img: ${large(bred.url)}`,
    `gallery/danio-erythromicron.json: ${other.url}`,
    `guides/g/entity.json: ${guideOff.url}`,
    `plants/l/entity.json: ${leaf.url}`,
    `species/danio-erythromicron/entity.json: ${held.url}`,
    `species/danio-erythromicron/entity.json: ${poor.url}`,
  ])
  for(const line of r.again)expect(line).toMatch(/\((?:watermark|people|dead|logo|face|faces|subject|too poor to show|unwell|rejected): withheld \[sha256:[a-f0-9]{64}\]\)$/)
  // The list itself stays as it was, and a second sweep has nothing to take off.
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual(list)
  expect((await sweep(root)).again).toEqual([])
})

// The owner, 2026-11-13: "is often táo đỏ", and on Limnobium laevigatum "This is commonly called bèo nhật". Each page
// takes the name keepers use and a new address, the old one forwarding: with the old name in its note for the fish, with
// none for the plant, whose two names were English ones translated and come off altogether. The text and the photos'
// captions follow, the captions' translations kept.
test('a fish and a plant named by the names in use: new address, old one forwarding, old names off or kept, text and captions following', async () => {
  const root = await store()
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('species/glossolepis-incisus/entity.json', species('glossolepis-incisus', 'Glossolepis incisus'))
  await put('species/glossolepis-incisus/vi.json', { ...vi('Cá cầu vồng đỏ', { 'distribution:seriouslyfish': '<p>Cá cầu vồng đỏ chỉ sống ở hồ Sentani.</p>' }), slug: 'ca-cau-vong-do', altNames: ['Red rainbowfish', 'Cá táo đỏ'] })
  await put('gallery/glossolepis-incisus.json', { id: 'glossolepis-incisus', photos: [{ ...photo('https://media.aquatome.com/inat/1.webp', 'Cá cầu vồng đỏ đực trong bể trồng cây'), best: true }], seen: 1, updatedAt: '2026-10-01' })
  await put('captions/id.json', { 'Cá cầu vồng đỏ đực trong bể trồng cây': 'Rainbow merah jantan di akuarium tanaman', 'Cá khác': 'Ikan lain' })
  await mkdir(join(c, 'plants/limnobium-laevigatum'), { recursive: true })
  await writeFile(join(c, 'plants/limnobium-laevigatum/entity.json'), JSON.stringify({ id: 'limnobium-laevigatum', scientificName: 'Limnobium laevigatum', difficulty: 1, light: 'medium', co2: 'none', growth: 'fast', placement: ['floating'], sections: [{ key: 'notes', source: 'tropica', sourceUrl: 'https://tropica.com/limnobium', html: '<p>Floats.</p>' }], photos: [], productSlots: [], updatedAt: '2026-10-01' }, null, 2))
  await writeFile(join(c, 'plants/limnobium-laevigatum/vi.json'), JSON.stringify({ slug: 'beo-tay-nam-my-limnobium-laevigatum', name: 'Bèo tây Nam Mỹ (Limnobium laevigatum)', altNames: ['Bèo nhím Nam Mỹ', 'Amazon frogbit'], sections: { 'notes:tropica': '<p>Bèo tây Nam Mỹ nổi trên mặt nước, khác bèo tây (Eichhornia crassipes).</p>' }, quality: { score: 0.9, indexable: true } }, null, 1))

  const r = await sweep(root)
  const fish = await json(root, 'content/species/glossolepis-incisus/vi.json')
  expect([fish.name, fish.slug, fish.nameFixed]).toEqual(['Cá táo đỏ', 'ca-tao-do', true])
  expect(fish.altNames).toEqual(['Red rainbowfish', 'Cá cầu vồng đỏ', 'Cá cầu vồng táo đỏ'])
  expect(fish.redirectFrom).toEqual([{ slug: 'ca-cau-vong-do', name: 'Cá cầu vồng đỏ' }])
  expect(fish.sections['distribution:seriouslyfish']).toBe('<p>Cá táo đỏ chỉ sống ở hồ Sentani.</p>')
  expect((await json(root, 'content/gallery/glossolepis-incisus.json')).photos[0].caption).toBe('Cá táo đỏ đực trong bể trồng cây')
  expect(await json(root, 'content/captions/id.json')).toEqual({ 'Cá táo đỏ đực trong bể trồng cây': 'Rainbow merah jantan di akuarium tanaman', 'Cá khác': 'Ikan lain' })
  const plant = await json(root, 'content/plants/limnobium-laevigatum/vi.json')
  expect([plant.name, plant.slug, plant.nameFixed]).toEqual(['Bèo Nhật', 'beo-nhat', true])
  expect(plant.altNames).toEqual(['Amazon frogbit'])
  expect(plant.redirectFrom).toEqual([{ slug: 'beo-tay-nam-my-limnobium-laevigatum', name: '' }])
  expect(plant.sections['notes:tropica']).toBe('<p>Bèo Nhật nổi trên mặt nước, khác bèo tây (Eichhornia crassipes).</p>')
  expect(r.text['fish-name']).toEqual(expect.arrayContaining(['species/glossolepis-incisus/vi', 'plants/limnobium-laevigatum/vi']))
  expect((await sweep(root)).files).toEqual([])

  // A writer that puts a dropped name back, or drops a kept one: the next run mends both.
  await writeFile(join(c, 'plants/limnobium-laevigatum/vi.json'), JSON.stringify({ ...plant, altNames: ['Amazon frogbit', 'Bèo nhím Nam Mỹ'] }, null, 1))
  await writeFile(join(c, 'species/glossolepis-incisus/vi.json'), JSON.stringify({ ...fish, altNames: ['Red rainbowfish'] }, null, 1))
  await sweep(root)
  expect((await json(root, 'content/plants/limnobium-laevigatum/vi.json')).altNames).toEqual(['Amazon frogbit'])
  expect((await json(root, 'content/species/glossolepis-incisus/vi.json')).altNames).toEqual(['Red rainbowfish', 'Cá cầu vồng đỏ', 'Cá cầu vồng táo đỏ'])
})

// Curation, 2026-11-13: "bo bo (rận nước)", the daphnia, linked to the water louse named "Rận nước". Astra's second read:
// its own page's text and photos still said "rận nước", so a search for it found the louse.
test('a name that is another animal\'s leaves the page, its other names, its forward and its own words, and stays in other pages\' text', async () => {
  const root = await store()
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  const two = 'Hai con rận nước trên rêu'
  await put('species/asellus-aquaticus/entity.json', species('asellus-aquaticus', 'Asellus aquaticus', { photos: [photo('https://media.aquatome.com/commons/a.webp', two)] }))
  await put('species/asellus-aquaticus/vi.json', { ...vi('Rận nước', {
    'quickFacts:aquariumbreeder': '<p>Asellus aquaticus, còn gọi là rận nước (tên tiếng Anh: Water louse), là một loài giáp xác nhỏ.</p>',
    'behaviour:aquariumbreeder': '<p>Rận nước bò chậm. Vì ăn mùn bã, rận nước dọn bể.</p>',
    'references:aquariumbreeder': '<p>Rận nước</p>',
  }), slug: 'ran-nuoc', altNames: ['Rận nước ngọt', 'Water louse'] })
  await put('gallery/asellus-aquaticus.json', { id: 'asellus-aquaticus', photos: [photo('https://media.aquatome.com/inat/a.webp', 'Rận nước Asellus aquaticus trên đá cuội'), photo('https://media.aquatome.com/commons/a.webp', two)], seen: 2, updatedAt: '2026-10-01' })
  await put('captions/id.json', { [two]: 'Dua kutu air di atas lumut', 'Rận nước Asellus aquaticus trên đá cuội': 'Asellus aquaticus di atas kerikil' })
  await put('summaries/asellus-aquaticus.json', { id: 'asellus-aquaticus', summary: 'Rận nước (Asellus aquaticus) hợp với người muốn một đội dọn mùn bã.', mistakes: ['Rận nước đẻ nhanh hơn tép.'], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' })
  await put('species/poecilia-reticulata/entity.json', species('poecilia-reticulata', 'Poecilia reticulata'))
  await put('species/poecilia-reticulata/vi.json', vi('Cá bảy màu', { 'feeding:seriouslyfish': '<p>Cho cá bột ăn bo bo (rận nước) mỗi ngày.</p>' }))
  await sweep(root)
  const louse = await json(root, 'content/species/asellus-aquaticus/vi.json')
  expect([louse.name, louse.slug, louse.nameFixed, louse.altNames]).toEqual(['Asellus aquaticus', 'asellus-aquaticus', true, ['Water louse']])
  expect(louse.redirectFrom).toEqual([{ slug: 'ran-nuoc', name: '' }])
  expect(louse.sections).toEqual({
    'quickFacts:aquariumbreeder': '<p>Asellus aquaticus (tên tiếng Anh: Water louse) là một loài giáp xác nhỏ.</p>',
    'behaviour:aquariumbreeder': '<p>Asellus bò chậm. Vì ăn mùn bã, Asellus dọn bể.</p>',
    'references:aquariumbreeder': '<p>Rận nước</p>',
  })
  expect((await json(root, 'content/gallery/asellus-aquaticus.json')).photos.map((p: { caption: string }) => p.caption)).toEqual(['Asellus aquaticus trên đá cuội', 'Hai con Asellus trên rêu'])
  expect((await json(root, 'content/species/asellus-aquaticus/entity.json')).photos[0].caption).toBe('Hai con Asellus trên rêu')
  expect(await json(root, 'content/captions/id.json')).toEqual({ 'Hai con Asellus trên rêu': 'Dua kutu air di atas lumut', 'Asellus aquaticus trên đá cuội': 'Asellus aquaticus di atas kerikil' })
  expect(await json(root, 'content/summaries/asellus-aquaticus.json')).toMatchObject({ summary: 'Asellus aquaticus hợp với người muốn một đội dọn mùn bã.', mistakes: ['Asellus đẻ nhanh hơn tép.'], review: 'approved' })
  expect((await json(root, 'content/species/poecilia-reticulata/vi.json')).sections['feeding:seriouslyfish']).toBe('<p>Cho cá bột ăn bo bo (rận nước) mỗi ngày.</p>')
  expect((await sweep(root)).files).toEqual([])
})

// Astra, 2026-11-13: the school size was read before the fold, so the skunk cory's came only on a second run.
test('a page folded into its fish\'s gives that fish its school size in the same run', async () => {
  const root = await store()
  const c = join(root, 'content')
  const sf = { key: 'behaviour', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/brochis-arcuata', html: '<p>Try to buy a mixed-sex group of at least 8-10 specimens.</p>' }
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('species/ditrupa-arietina/entity.json', { ...species('ditrupa-arietina', 'Ditrupa arietina'), sections: [sf] })
  await put('species/ditrupa-arietina/vi.json', vi('Cá Ditrupa arietina', { 'behaviour:seriouslyfish': '<p>Nuôi theo nhóm ít nhất 8–10 con.</p>' }))
  await put('species/corydoras-arcuatus/entity.json', { ...species('corydoras-arcuatus', 'Corydoras arcuatus'), sections: [] })
  await put('species/corydoras-arcuatus/vi.json', vi('Cá chuột skunk', {}))
  await put('traits/corydoras-arcuatus.json', { id: 'corydoras-arcuatus', temperament: 'peaceful', finNipper: false, schoolMin: 6, speciesUpdatedAt: '2026-10-29', generatedAt: '2026-10-29T15:29:02.830Z' })
  const r = await sweep(root)
  expect(r.folds).toEqual(['ditrupa-arietina → corydoras-arcuatus'])
  expect((await json(root, 'content/traits/corydoras-arcuatus.json')).schoolMin).toBe(8)
})

test("a photo credited to someone its source's permission refuses leaves every page and album for good; another credit, a photo the saved page doesn't show, one with no caption and one whose caption's first figure is another's stay (the chief of staff, 2026-11-13)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'sources', 'seriouslyfish'), { recursive: true })
  const sources = JSON.parse(await readFile(new URL('../../../content/sources.json', import.meta.url), 'utf8'))
  sources.seriouslyfish.permission.refusedCredits = ['Example Picture Agency']
  await put('sources.json', sources)
  const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi'
  await writeFile(join(root, 'sources', 'seriouslyfish', 'species-imaginichthys-testi.md'), `---\nurl: ${url}\n---\n\n## Species images · 4\nAdult male.Example Picture Agency\nAdult female.Imaginary Person\nJuvenile in the trade, older.Example Picture Agency\nJuvenile in the trade.Example Picture-agency\nA pair.Imaginary Person\nA pair.Example Picture Agency\nA trio.Example Picture Agency\nA trio.Imaginary Person\n- Adult male. is how the trade sells this fish, though the name it goes by in the trade is not the scientific one\n`)
  const sf = (name: string, caption: string) => ({ ...photo(`https://media.aquatome.com/seriouslyfish/${name}.webp`, caption), author: 'Seriously Fish', sourceUrl: url, source: 'seriouslyfish' })
  const agency = sf('agency', 'Adult male.'), person = sf('person', 'Adult female.'), variant = sf('variant', 'Juvenile in the trade.'), bare = sf('bare', ''), unseen = sf('unseen', 'Not on the saved page.')
  // One caption under two credits: the picker keeps the first figure, so the pair is the person's and the trio the agency's.
  const pair = sf('pair', 'A pair.'), trio = sf('trio', 'A trio.')
  // Another source's photo with a caption the refused line starts with: its credit is its own source's.
  const other = { ...photo('https://media.aquatome.com/commons/other.webp', 'Adult male.') }
  await put('species/imaginichthys-testi/entity.json', species('imaginichthys-testi', 'Imaginichthys testi', { photos: [agency, person, bare, unseen, pair, trio, other] }))
  await put('species/imaginichthys-testi/vi.json', vi('Cá thử', { 'distribution:seriouslyfish': '<p>Suối.</p>' }))
  await put('gallery/imaginichthys-testi.json', { id: 'imaginichthys-testi', photos: [variant], seen: 1, updatedAt: '2026-10-01' })
  const r = await sweep(root)
  expect((await json(root, 'content/species/imaginichthys-testi/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([person, bare, unseen, pair, other].map(p => p.url))
  expect((await json(root, 'content/gallery/imaginichthys-testi.json')).photos).toEqual([])
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  expect(Object.keys(rejected).sort()).toEqual([agency.url, trio.url, variant.url])
  for (const u of [agency.url, trio.url, variant.url]) expect(rejected[u]).toMatch(/^rejected: withheld \[sha256:[a-f0-9]{64}\]$/)
  expect(r.held).toEqual([])
  expect((await sweep(root)).again).toEqual([])
})

// Photo Sourcing, 14 Nov: the aquatic-plants equipment page still showed an Aquarium Co-op photo on the never-again list,
// in all four languages. The never-again pass walked fish, plant, breed, guide and album files only.
test("a photo on the never-again list leaves every equipment page and each language's copy: a type's photo goes, a listed hero gives way to a type's", async () => {
  const root = await mkdtemp(join(tmpdir(), 'sweep-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const p = (name: string) => photo(`https://media.aquatome.com/aquariumcoop/${name}.webp`, 'Aquatic plants')
  const hero = p('hero'), stem = p('stem'), listed = p('listed'), moss = p('moss')
  const type = (id: string, photo: object) => ({ id, name: id, match: id, desc: '', pick: '', buy: id, photo })
  const page = (category: string, heroPhoto: object) => ({ category, name: category, lead: '', intro: '', hero: heroPhoto, types: [type('than', stem), type('reu', listed), type('la', moss)], choose: [], mistakes: [], faq: [] })
  await put('equipment/cay-thuy-sinh.json', page('cay-thuy-sinh', hero))
  await put('equipment/id/cay-thuy-sinh.json', page('cay-thuy-sinh', hero))
  await put('equipment/den.json', page('den', hero))
  await put('equipment/th/den.json', page('den', listed))
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), `${JSON.stringify({ [listed.url]: 'rejected: withheld [sha256:' + 'a'.repeat(64) + ']' }, null, 2)}\n`)
  const r = await sweep(root)
  for (const f of ['equipment/cay-thuy-sinh.json', 'equipment/id/cay-thuy-sinh.json', 'equipment/den.json']) {
    const e = await json(root, `content/${f}`)
    expect(e.hero, f).toEqual(hero)
    expect(e.types.map((t: { photo?: { url: string } }) => t.photo?.url ?? null), f).toEqual([stem.url, null, moss.url])
  }
  // A listed hero gives way to the first type's photo, as the photo check does.
  expect((await json(root, 'content/equipment/th/den.json')).hero).toEqual(stem)
  expect(r.again.filter(x => x.startsWith('equipment/')).length).toBe(5)
  expect((await sweep(root)).again).toEqual([])
})

test('a head its source names only to the genus goes behind a photo named to the species that passes as a head; a pick of it still leads; a second sweep changes nothing', async () => {
  const root = await store()
  await sweep(root)
  const at = 'content/species/corydoras-sterbai/entity.json'
  const e = await json(root, at)
  const own = e.photos[0]
  const genus = photo('https://media.aquatome.com/commons/genus.webp', 'Corydoras sp.')
  await writeFile(join(root, at), JSON.stringify({ ...e, photos: [genus, own] }))
  // Nothing named to the species passes yet: it stays.
  expect((await sweep(root)).named).toEqual([])
  expect((await json(root, at)).photos.map((p: { url: string }) => p.url)).toEqual([genus.url, own.url])
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify({ [own.url]: { 'corydoras-sterbai': { ok: 'yes', typical: true, person: false, logo: false } } }))
  const r = await sweep(root)
  expect((await json(root, at)).photos.map((p: { url: string }) => p.url)).toEqual([own.url, genus.url])
  expect(r.named).toEqual([`species/corydoras-sterbai: ${genus.url} -> ${own.url}`])
  expect((await sweep(root)).files).toEqual([])
  // A person's pick of it leads, reported as a pick, and stays.
  await writeFile(join(root, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/corydoras-sterbai': genus.url }))
  const picked = await sweep(root)
  expect((await json(root, at)).photos.map((p: { url: string }) => p.url)).toEqual([genus.url, own.url])
  expect([picked.named, picked.heads]).toEqual([[], [`species/corydoras-sterbai: ${own.url} -> ${genus.url}`]])
  expect((await sweep(root)).files).toEqual([])
})
