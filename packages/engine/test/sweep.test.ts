import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
import { checkPagePhotos } from '../src/photo-check'
import { sweep, sweepTranslation } from '../src/sweep'

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
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({
    'https://media.aquatome.com/commons/map.webp': 'a map, not Corydoras adolfoi (species/corydoras-adolfoi)',
    'https://media.aquatome.com/seriouslyfish/ad.webp': "an ad video's poster, not Corydoras adolfoi (species/corydoras-adolfoi)",
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
  expect(rejected['https://media.aquatome.com/sprucepets/arowana.webp']).toMatch(/^card:/)
  expect(rejected['https://media.aquatome.com/sprucepets/corydoras.webp']).toMatch(/^card:/)
  expect((await sweep(root, {})).photos.filter(x => x.includes('read-next'))).toEqual([])
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
  expect((await json(root, 'engine-state/_photo-rejected.json'))[plate.url]).toBe('not a photo: micrographs, not Hemichromis elongatus (species/hemichromis-elongatus)')
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
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({
    [dead.url]: 'unwell: its source\'s caption says "deceased" (species/schistura-spilota)',
    [torn.url]: 'unwell: its source\'s caption says "damage" (species/schistura-spilota)',
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
  // A breed's gallery is read too.
  const bred = sf('bred', 'Two dead specimens of different ages.')
  await put('breeds/ddd-breed/entity.json', { id: 'ddd-breed', kind: 'variety', parents: [], care: {}, photos: [sf('breed-own', 'Adult male.')], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  await put('breeds/ddd-breed/vi.json', vi('Cá chạch lai', {}, { slug: 'ca-chach-lai', body: '<p>Một dòng lai.</p>' }))
  await put('gallery/ddd-breed.json', { id: 'ddd-breed', photos: [bred], seen: 1, updatedAt: '2026-10-01' })
  expect(await unwell()).toBe(1)
  expect((await sweep(root)).photos).toEqual([`breeds/ddd-breed: ${bred.url} (unwell: its source's caption says "dead specimens")`])
  expect((await json(root, 'content/gallery/ddd-breed.json')).photos).toEqual([])
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

const WEEKLY = "claude failed (1): You've hit your weekly limit · resets Nov 14 at 8am (Asia/Saigon)"
// The guide body the sweep already leaves in place, so a counted title is the only thing that would change the file.
const CLEAN = '<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 2:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 3:</strong> thiếu CO2.</p><h3>Phân nền</h3><h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>'

async function countedGuide(root: string, id: string) {
  const dir = join(root, 'content/guides', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id, kind: 'care', source: 'aquariumbreeder', sourceUrl: 'https://x/g', html: '', photos: [], mentions: [], updatedAt: '2026-10-01' }, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi('10 cách xử lý rêu hại nhanh', {}, { body: CLEAN }), null, 2)}\n`)
}

test('a usage limit leaves counted titles as they are and stops the run', async () => {
  const root = await store()
  await countedGuide(root, 'a')
  await countedGuide(root, 'b')
  const file = (id: string) => readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8')
  const before = { a: await file('a'), b: await file('b') }
  let calls = 0
  const r = await sweep(root, { llm: (async () => { calls++; throw new LlmError(WEEKLY) }) as Llm })
  expect(calls).toBe(1)
  expect(r.stopped).toContain('weekly limit')
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
