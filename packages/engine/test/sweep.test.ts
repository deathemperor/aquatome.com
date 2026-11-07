import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
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
