import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkPages, RATCHETED, RULES } from '../src/content-rules'
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
      photo('https://media.aquatome.com/commons/batch.webp', 'Imported as a contaminant in a batch of Corydoras sterbai')],
  }), 1)
  await put('summaries/corydoras-adolfoi.json', { id: 'corydoras-adolfoi', summary: 'Bể từ 10 cm.', mistakes: [], speciesUpdatedAt: '2026-10-01', generatedAt: '2026-10-02', review: 'approved' })
  await put('species/corydoras-adolfoi/vi.json', vi('Cá chuột Adolfo', { 'distribution:seriouslyfish': `<p>${REPEAT}</p>`, 'habitat:seriouslyfish': `<p>${REPEAT}</p><p>Nền cát.</p>` }), 1)
  await put('gallery/corydoras-adolfoi.json', { id: 'corydoras-adolfoi', photos: [photo('https://media.aquatome.com/inat/tetra.webp', 'A Black Widow Tetra (Gymnocorymbus ternetzi).')], seen: 1, updatedAt: '2026-10-01' })
  await put('species/corydoras-sterbai/entity.json', species('corydoras-sterbai', 'Corydoras sterbai', { photos: [photo('https://media.aquatome.com/commons/sterbai.webp', 'Corydoras sterbai')] }))
  await put('species/corydoras-sterbai/vi.json', vi('Cá chuột sterbai', { 'distribution:seriouslyfish': '<p>Brazil.</p>' }))
  await put('species/gymnocorymbus-ternetzi/entity.json', species('gymnocorymbus-ternetzi', 'Gymnocorymbus ternetzi'))
  await put('species/gymnocorymbus-ternetzi/vi.json', vi('Cá tứ vân đen', { 'distribution:seriouslyfish': '<p>Paraguay.</p>' }))
  // A guide: a title promising 10 over 3 sections, mistakes numbered out of order, an empty heading, comments and related posts.
  await put('guides/g/entity.json', { id: 'g', kind: 'care', source: 'aquariumbreeder', sourceUrl: 'https://x/g', html: '', photos: [], mentions: [], updatedAt: '2026-10-01' })
  await put('guides/g/vi.json', vi('10 cách xử lý rêu hại nhanh', {}, {
    body: '<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 3:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 2:</strong> thiếu CO2.</p>'
      + '<p>Bài viết liên quan:</p><ul><li>15+ thức ăn sống</li></ul><h3>Phân nền</h3><h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>'
      + '<h3>4 bình luận về “Rêu hại”</h3><ul><li><p><strong>Marcia:</strong> Cảm ơn.</p></li></ul><h3>Để lại bình luận</h3>',
  }))
  // A breed whose tank is shorter than twice the fish.
  await put('breeds/huyet-long/entity.json', { id: 'huyet-long', kind: 'variety', parents: [], care: { sizeCm: [{ source: 0, value: 90 }], tankCm: [{ source: 0, value: 150 }] }, photos: [], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
  await put('breeds/huyet-long/vi.json', vi('Huyết Long', {}, { body: '<p>Rồng đỏ.</p>' }))
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))

test('the sweep makes every page pass the rules it fixes, keeps each file\'s indentation and date, and does nothing the second time', async () => {
  const root = await store()
  const before = checkPages(await loadPages(join(root, 'content')), RULES.filter(r => RATCHETED.includes(r.id))).findings.map(f => f.rule)
  expect(new Set(before)).toEqual(new Set(['furniture', 'headings', 'repeated', 'labels', 'caption', 'card', 'title-count']))
  const r = await sweep(root)
  expect(checkPages(await loadPages(join(root, 'content')), RULES.filter(r => RATCHETED.includes(r.id))).findings.map(f => `${f.rule}: ${f.page.path}: ${f.detail}`)).toEqual([])

  // Text: comments and related posts cut, the empty heading gone, mistakes numbered in order; the address kept.
  const g = await json(root, 'content/guides/g/vi.json')
  expect(g.body).toBe('<h3>Đèn</h3><p><strong>Sai lầm 1:</strong> đèn mạnh.</p><p><strong>Sai lầm 2:</strong> bật lâu.</p><h3>CO2</h3><p><strong>Sai lầm 3:</strong> thiếu CO2.</p>'
    + '<h3>Kết luận</h3><p>Kiên nhẫn là chính, thay nước đều đặn mỗi tuần và theo dõi cây.</p>')
  expect([g.name, g.slug]).toEqual(['Cách xử lý rêu hại nhanh', '10-cách-xử-lý-rêu-hại-nhanh'])
  expect(r.titles).toEqual(['vi/g: "10 cách xử lý rêu hại nhanh" → "Cách xử lý rêu hại nhanh" (number dropped)'])
  // The later copy of the paragraph goes; a one-space file stays one-space.
  const raw = await readFile(join(root, 'content/species/corydoras-adolfoi/vi.json'), 'utf8')
  expect(JSON.parse(raw).sections).toEqual({ 'distribution:seriouslyfish': `<p>${REPEAT}</p>`, 'habitat:seriouslyfish': '<p>Nền cát.</p>' })
  expect(raw).toMatch(/^\{\n "slug"/)

  // Photos: the other Corydoras and the map off the page, the tetra off its gallery; "in a batch of" kept. The map and
  // the tetra, on no other page, leave every page; C. sterbai stays on its own page and out of the rejected list.
  const e = await json(root, 'content/species/corydoras-adolfoi/entity.json')
  expect(e.photos.map((p: { url: string }) => p.url.split('/').pop())).toEqual(['own.webp', 'batch.webp'])
  expect(e.updatedAt).toBe('2026-10-01')
  expect((await json(root, 'content/gallery/corydoras-adolfoi.json')).photos).toEqual([])
  expect((await json(root, 'content/species/corydoras-sterbai/entity.json')).photos).toHaveLength(1)
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({
    'https://media.aquatome.com/commons/map.webp': 'a map, not Corydoras adolfoi (species/corydoras-adolfoi)',
    'https://media.aquatome.com/inat/tetra.webp': 'caption names Gymnocorymbus ternetzi, not Corydoras adolfoi (species/corydoras-adolfoi)',
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

test('a title rewritten by the model is kept when the reviewer passes it, and the number dropped when not', async () => {
  const llm = (title: string, score: number): Llm => async <T>({ schema }: { schema: object }) =>
    ((schema as { required: string[] }).required.includes('title') ? { title } : { score, notes: score < 0.75 ? ['subject changed'] : [] }) as T
  const kept = await store()
  expect((await sweep(kept, { llm: llm('3 cách xử lý rêu hại nhanh', 0.9) })).titles).toEqual(['vi/g: "10 cách xử lý rêu hại nhanh" → "3 cách xử lý rêu hại nhanh" (rewritten (0.90))'])
  const refused = await store()
  expect((await sweep(refused, { llm: llm('Rêu hại', 0.4) })).titles).toEqual(['vi/g: "10 cách xử lý rêu hại nhanh" → "Cách xử lý rêu hại nhanh" (number dropped; rewrite "Rêu hại" not kept (0.40: subject changed))'])
  // A rewrite still promising a count the text lacks is not even reviewed.
  const wrong = await store()
  expect((await sweep(wrong, { llm: llm('7 cách xử lý rêu hại', 0.9) })).titles[0]).toContain('number dropped; rewrite "7 cách xử lý rêu hại" not kept (0.00')
  // Reference lists are left as published.
  expect(sweepTranslation({ sections: { 'references:x': `<p>${REPEAT}</p>`, 'notes:x': `<p>${REPEAT}</p>` } }).t.sections).toEqual({ 'references:x': `<p>${REPEAT}</p>`, 'notes:x': `<p>${REPEAT}</p>` })
})
