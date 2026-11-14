import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import type { FitFinding } from '../src/fit'
import type { Page } from '../src/pages'
import { readReviews } from '../src/review-log'
import { ownTankDose, videoMend } from '../src/video-mend'

const LONG = 'Cây khỏe và mọc nhanh thì rêu hại khó chen vào. '.repeat(6).trim()
const BODY = `<p>Bể nhỏ dễ dựng.</p><h3>Mua đồ</h3><p>Mua lọc ở Petco, giá khoảng 5 USD. Bể 38 lít là vừa.</p><p>${LONG}</p>`
const FIXED = `<p>Bể nhỏ dễ dựng.</p><h3>Mua đồ</h3><p>Lọc mua ở tiệm cá cảnh. Bể 38 lít là vừa.</p><p>${LONG}</p>`
const shop: FitFinding = { check: 'shop', part: 'P1', quote: 'Mua lọc ở Petco', why: 'a US shop', by: 'model' }
const price: FitFinding = { check: 'price', part: 'P1', quote: 'giá khoảng 5 USD', why: 'a price in dollars', by: 'rule' }
const page = (over: Partial<Page> = {}): Page => ({ lang: 'vi', kind: 'guides', id: 'youtube-a1', title: 'Dựng bể nhỏ', path: '/vi/huong-dan/dung-be-nho/', fields: [], lines: [], captions: [], latinNames: [], card: [], ...over })
const now = () => new Date('2026-11-10T00:00:00Z')

async function setup(vi: object = {}, entity: object = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mend-'))
  const dir = join(root, 'content/guides/youtube-a1')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'youtube-a1', kind: 'setup', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=a1', html: '', photos: [], updatedAt: '2026-11-09', mentions: [], video: { youtubeId: 'a1', title: 'Nano tank', channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/@MJ', durationSec: 600, chapters: [], thumb: { url: 'https://i.ytimg.com/vi/a1/mqdefault.jpg', width: 320, height: 180 } }, ...entity }))
  const file = join(dir, 'vi.json')
  await writeFile(file, `${JSON.stringify({ slug: 'dung-be-nho', name: 'Dựng bể nhỏ', altNames: [], sections: {}, body: BODY, summary: ['Bể nhỏ dễ dựng.'], faq: [{ q: 'Mua lọc ở đâu?', a: 'Mua lọc ở Petco.' }], quality: { score: 0.85, indexable: true, bySource: { youtube: 0.85 } }, cover: 'Bể nhỏ', ...vi }, null, 2)}\n`)
  return { root, file, was: await readFile(file, 'utf8') }
}
/** The editor returns `fixed` (default: the shop and the price gone); the reviewer scores it. */
function deps(root: string, o: { score?: number; fixed?: object; transcript?: string | null } = {}) {
  const prompts: string[] = []
  const llm = (async (a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if (Object.keys((a.schema as { properties: object }).properties).includes('score')) return { score: o.score ?? 0.9, notes: ['fine'] }
    return { relevant: true, kind: 'setup', viTitle: 'Tên khác', summary: ['Bể nhỏ dễ dựng.'], body: FIXED, faq: [{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }], chapters: [], ...o.fixed }
  }) as Llm
  const yt = { transcript: async () => (o.transcript !== undefined ? o.transcript : '[0:00] buy the filter at Petco for five dollars') }
  return { mend: videoMend(root, { llm, yt, now }), prompts }
}

test('the sentences the gate quotes go to the video\'s editor with the transcript, and the mended guide is written with its review', async () => {
  const { root, file } = await setup()
  const { mend, prompts } = deps(root, { score: 0.8 })
  expect(await mend(page(), [shop, price])).toBe(true)
  const vi = JSON.parse(await readFile(file, 'utf8'))
  expect(vi.body).toBe(FIXED.replace('38 lít', '40 lít')) // rounded, as where the video writer writes
  expect(vi.faq).toEqual([{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }])
  expect(vi).toMatchObject({ name: 'Dựng bể nhỏ', slug: 'dung-be-nho', cover: 'Bể nhỏ', quality: { score: 0.8, indexable: true, bySource: { youtube: 0.8 } } })
  // The editor: the transcript, the guide, and the notes as the reader's, each with its quote and what the check is.
  expect(prompts[0]).toContain('Ghi chú về người đọc:\n- "Mua lọc ở Petco": A foreign shop (a US shop)\n- "giá khoảng 5 USD": A foreign price or shipping cost (a price in dollars)')
  expect(prompts[0]).toContain('Video có nói vậy thì vẫn sửa')
  expect(prompts[0]).toContain('buy the filter at Petco')
  // A foreign price becomes the comparison it was there to make, with no number: the editor is told so, and the
  // reviewer is told that is the video's fact kept, so the mend isn't scored down for the price it took out.
  expect(prompts[0]).toContain('viết lại thành điều mà cái giá ấy muốn nói')
  expect(prompts[0]).toContain('trừ khi video nêu giá bằng đồng Việt Nam')
  expect(prompts[0]).toContain('Câu nào cho liều của một sản phẩm thì giữ tên sản phẩm; không đổi thành loại.')
  expect(prompts[1]).toContain('TRANSCRIPT:')
  expect(prompts[1]).toContain('by MJ Aquascaping')
  expect(prompts[1]).toContain('turned into the comparison the price was there to make')
  expect(prompts[1]!.indexOf('fact kept, not lost')).toBeLessThan(prompts[1]!.indexOf('TRANSCRIPT:'))
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-a1']).toMatchObject([{ score: 0.8, attempt: 'rewrite', kept: true }])
})

test('a mend the page can\'t have leaves the file as it was', async () => {
  // The last column: false once an editor was called, which the gate counts among a run's mends; nothing when none was.
  const cases: [string, Parameters<typeof setup>, Parameters<typeof deps>[1], Partial<Page>, false | undefined][] = [
    ['another language', [], {}, { lang: 'id' }, undefined],
    ['not a guide', [], {}, { kind: 'species' }, undefined],
    ['a guide from an article', [{}, { source: 'aquariumcoop', video: undefined }], {}, {}, undefined],
    ['a body a person fixed', [{ bodyFixed: true }], {}, {}, undefined],
    ['questions a person fixed', [{ faqFixed: true }], {}, {}, undefined],
    ['no transcript on this Mac', [], { transcript: null }, {}, undefined],
    ['an edit that came back broken', [], { fixed: { relevant: false } }, {}, false],
    ['an edit that left a quoted sentence in, here in the FAQ', [], { fixed: { faq: [{ q: 'Mua lọc ở đâu?', a: 'Mua lọc ở Petco.' }] } }, {}, false],
    ['a review under the bar and under the page\'s', [], { score: 0.7 }, {}, false],
  ]
  for (const [name, s, d, p, out] of cases) {
    const { root, file, was } = await setup(...s)
    const { mend, prompts } = deps(root, d)
    expect(await mend(page(p), [shop, price]), name).toBe(out)
    expect(prompts.length > 0, name).toBe(out === false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
})

test('a product or a price quoted in a sentence that gives a dose is not mended: one product\'s dose would become its kind\'s', async () => {
  const dosed = `<p>Bể nhỏ dễ dựng. Châm 5 ml Seachem Prime cho 200 lít mỗi lần thay nước. Lọc thì mua loại nào cũng được.</p><p>Thức ăn Hikari gói 20 g giá 5 USD là đủ dùng lâu.</p><p>${LONG}</p>`
  const product: FitFinding = { check: 'product', part: 'P1', quote: 'Seachem Prime', why: 'a product not sold here', by: 'model' }
  const packet: FitFinding = { check: 'price', part: 'P2', quote: 'giá 5 USD', why: 'a price in dollars', by: 'rule' }
  for (const [name, findings] of [['a product in a dose sentence', [product]], ['a price beside an amount', [packet]], ['one of several', [shop, product]]] as const) {
    const { root, file, was } = await setup({ body: `${dosed}<p>Mua lọc ở Petco.</p>` })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [...findings]), name).toBeUndefined()
    expect(prompts, name).toEqual([]) // no editor, no reviewer: the text goes back as before
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // The same product named where no dose is given goes to the editor as before, and so does a shop in a guide that gives a dose elsewhere.
  // (The editor keeps every figure of the sentences no finding takes.)
  for (const [body, findings, after] of [[`<p>Seachem Prime là loại khử clo quen thuộc.</p><p>${LONG}</p>`, [product], `<p>Bể nhỏ dễ dựng.</p><p>${LONG}</p>`], [`${dosed}<p>Mua lọc ở Petco.</p>`, [shop], dosed]] as const) {
    const { root } = await setup({ body })
    const { mend, prompts } = deps(root, { fixed: { body: after } })
    expect(await mend(page(), [...findings])).toBe(true)
    expect(prompts).toHaveLength(2)
  }
})

test('a mend never leaves a guide worse: under the bar it is kept only when no lower than the text it mends, whose reviews say which', async () => {
  const low = { quality: { score: 0.6, indexable: false, bySource: { youtube: 0.6 }, chat: false } }
  const a = await setup(low)
  expect(await deps(a.root, { score: 0.6 }).mend(page(), [shop])).toBe(true)
  expect(JSON.parse(await readFile(a.file, 'utf8')).quality).toEqual({ score: 0.6, indexable: false, bySource: { youtube: 0.6 }, chat: false }) // still held out of the chat
  const b = await setup(low)
  expect(await deps(b.root, { score: 0.5 }).mend(page(), [shop])).toBe(false)
  expect((await readReviews(b.root, 'video-guide'))['vi/guides/youtube-a1']).toMatchObject([{ score: 0.5, attempt: 'rewrite', kept: false }])
  // At the bar, a guide held out of the chat is let back, as when the video writer writes one.
  const c = await setup(low)
  expect(await deps(c.root, { score: 0.8 }).mend(page(), [shop])).toBe(true)
  expect(JSON.parse(await readFile(c.file, 'utf8')).quality).toEqual({ score: 0.8, indexable: true, bySource: { youtube: 0.8 } })
})

test('the title is the editor\'s only when a fault was in it', async () => {
  const { root, file } = await setup({ name: 'Mua lọc ở Petco cho bể nhỏ' })
  expect(await deps(root).mend(page(), [{ ...shop, part: 'T' }, price])).toBe(true)
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ name: 'Tên khác', slug: 'dung-be-nho' })
})

test('a title a person picked stays, even when a check quotes it', async () => {
  const { root, file } = await setup({ name: 'Mua lọc ở Petco cho bể nhỏ', nameFixed: true })
  const { mend, prompts } = deps(root)
  expect(await mend(page(), [{ ...shop, quote: 'Mua lọc ở Petco cho bể nhỏ', part: 'T' }])).toBeUndefined() // no editor called
  expect(prompts).toEqual([])
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ name: 'Mua lọc ở Petco cho bể nhỏ', nameFixed: true })
})

// The chief of staff, 14 Nov 2026: the editor takes a source line and units together, figures as written for code to
// convert; and a dose that is the video's own tank's, which it drops, figure and brand, for the label. A dose given as
// advice waits for a person. Every figure in is every figure out, but those of the sentences a finding takes.
const OWN = `<p>Bể dùng ở đây là loại nông: dài 80 cm, sâu 30 cm.</p><p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, ví dụ Quick Start, bể này dùng khoảng 4 nắp.</p><p>${LONG}</p>`
const own: FitFinding = { check: 'source', part: 'P1', quote: 'Bể dùng ở đây là loại nông', why: 'the video\'s own tank', by: 'model' }
const gallons: FitFinding = { check: 'units', part: 'P2', quote: 'Bể 10 gallon', why: 'a US tank', by: 'rule' }
const caps: FitFinding = { check: 'dose', part: 'P3', quote: 'bể này dùng khoảng 4 nắp', why: 'an amount of a named product', by: 'model' }
const brand: FitFinding = { check: 'product', part: 'P3', quote: 'Quick Start', why: 'a US product', by: 'model' }
const kept = (body: string) => ({ fixed: { body, faq: [{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }] } })
test('the editor takes a source line, units and the video\'s own dose together, and writes no figure of its own', async () => {
  const { root, file } = await setup({ body: OWN, faq: [] })
  const { mend, prompts } = deps(root, kept(`<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`))
  expect(await mend(page(), [own, gallons, caps, brand])).toBe(true)
  const body = JSON.parse(await readFile(file, 'utf8')).body as string
  // Code converts the units the editor left as they were; the dose and the brand are gone for the label.
  expect(body).not.toMatch(/gallon|4 nắp|Quick Start|80 cm/)
  expect(body).toMatch(/Bể \d+ lít là đủ cho một đàn nhỏ\./)
  expect(body).toContain('Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.')
  expect(prompts[0]).toContain('"Bể 10 gallon": Imperial units, or a volume that shows it was converted (a US tank). Giữ nguyên mọi con số và đơn vị như đang viết: code đổi sang hệ mét sau.')
  expect(prompts[0]).toContain('"bể này dùng khoảng 4 nắp": A dose tied to a foreign product (an amount of a named product). Đây là liều của chính bể trong video: bỏ con số liều và tên sản phẩm, giữ bước làm, viết "…, liều theo hướng dẫn trên bao bì."')
  expect(prompts[0]).toContain('Chỉ khi ghi chú nói đó là liều của chính bể trong video thì bỏ con số liều và tên sản phẩm')
})

test('a figure the editor changes, drops or adds beside units or a dose leaves the file as it was; so does a dose figure in any mend', async () => {
  const cases: [string, string, FitFinding[]][] = [
    ['the units sentence\'s figure changed', `<p>Bể 40 lít là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['the units sentence dropped', `<p>Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a dose figure of its own', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, khoảng 5 ml, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['the dose kept', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, bể này dùng khoảng 4 nắp.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a dose figure in a shop\'s mend', `<p>Bể nhỏ dễ dựng.</p><p>Lọc mua ở tiệm cá cảnh. Châm 5 ml vi sinh.</p><p>${LONG}</p>`, [shop, price]],
    // The video's own dose kept in a reworded sentence, or written in words (Grok's read).
    ['the dose reworded and kept', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, khoảng 4 nắp, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a dose in words', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, năm nắp, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a dose in another unit', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, 4 cái nắp, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    // A dose figure in several words, as a fraction sign, or in English caps (Grok's fourth read).
    ['a dose in compound words', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, hai mươi nắp, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a dose as a fraction sign', `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, ½ nắp, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['caps in a shop\'s mend', `<p>Bể nhỏ dễ dựng.</p><p>Lọc mua ở tiệm cá cảnh. Châm 5 caps vi sinh.</p><p>${LONG}</p>`, [shop, price]],
    // A dose in several words added to a shop's mend, or a fraction sign written against its unit (Grok's fifth read).
    ['a dose in several words in a shop\'s mend', `<p>Bể nhỏ dễ dựng.</p><p>Lọc mua ở tiệm cá cảnh. Châm hai mươi nắp.</p><p>${LONG}</p>`, [shop, price]],
    ['½ against its unit in a shop\'s mend', `<p>Bể nhỏ dễ dựng.</p><p>Lọc mua ở tiệm cá cảnh. Châm ½nắp.</p><p>${LONG}</p>`, [shop, price]],
  ]
  for (const [name, body, findings] of cases) {
    const { root, file, was } = await setup(findings.includes(shop) ? {} : { body: OWN, faq: [] })
    expect(await deps(root, kept(body)).mend(page(), findings), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
})

test('a dose given as advice, or with nothing naming the video\'s tank, waits for a person: no editor is called', async () => {
  for (const line of ['Châm 5 ml vi sinh cho mỗi 50 lít nước.', 'Châm khoảng 4 nắp vi sinh.', 'Bể này châm 2 ml cho mỗi 10 lít.']) {
    const { root, file, was } = await setup({ body: `<p>${line}</p><p>${LONG}</p>`, faq: [] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [{ ...caps, quote: line.slice(0, -1) }]), line).toBeUndefined()
    expect(prompts, line).toEqual([])
    expect(await readFile(file, 'utf8'), line).toBe(was)
  }
})

test('a figure keeps its percent, a units quote keeps its figure beside another finding, and a sentence two findings quote is taken once (Grok\'s read)', async () => {
  const units = (quote: string): FitFinding => ({ ...gallons, quote })
  const cases: [string, string, string, FitFinding[]][] = [
    ['a percent sign dropped', '<p>Thay 30% nước mỗi tuần. Bể 10 gallon là đủ.</p>', '<p>Thay 30 nước mỗi tuần. Bể 10 gallon là đủ.</p>', [units('Bể 10 gallon')]],
    // A size in words changed beside a units finding (Grok's fifth read).
    ['a size in words changed', '<p>Bể mười lít là đủ cho một đàn nhỏ. Bể 10 gallon là đủ.</p>', '<p>Bể năm mươi lít là đủ cho một đàn nhỏ. Bể 10 gallon là đủ.</p>', [units('Bể 10 gallon')]],
    // A shop's mend that changes a figure in a sentence no finding takes (Grok's fifth read).
    ['a figure changed beside a shop', '<p>Bể dài 80 cm. Mua lọc ở Petco, giá khoảng 5 USD.</p>', '<p>Bể dài 90 cm. Lọc mua ở tiệm cá cảnh.</p>', [{ ...shop, quote: 'Mua lọc ở Petco' }, { ...price, quote: 'giá khoảng 5 USD' }]],
    ['a units figure dropped beside a shop', '<p>Bể 10 gallon mua ở Petco.</p>', '<p>Bể mua ở tiệm cá cảnh.</p>', [units('Bể 10 gallon'), { ...shop, quote: 'mua ở Petco' }]],
    ['a figure lost after a sentence two findings quote', '<p>Bể mẫu dài 30 cm, mua ở Petco. Đèn cách mặt nước 30 cm.</p><p>Bể 10 gallon là đủ.</p>', '<p>Bể mua ở tiệm cá cảnh. Đèn cách mặt nước.</p><p>Bể 10 gallon là đủ.</p>', [{ ...own, quote: 'Bể mẫu dài 30 cm' }, { ...shop, quote: 'mua ở Petco' }, units('Bể 10 gallon')]],
  ]
  for (const [name, before, after, findings] of cases) {
    const { root, file, was } = await setup({ body: `${before}<p>${LONG}</p>`, faq: [] })
    expect(await deps(root, kept(`${after}<p>${LONG}</p>`)).mend(page(), findings), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // "60 x 38 x 30 cm" written "60 × 38 × 30 cm" is the same figures.
  const { root } = await setup({ body: `<p>Bể 10 gallon là đủ.</p><p>Kích thước 60 x 38 x 30 cm là vừa.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(root, kept(`<p>Bể 10 gallon là đủ.</p><p>Kích thước 60 × 38 × 30 cm là vừa.</p><p>${LONG}</p>`)).mend(page(), [units('Bể 10 gallon')])).toBe(true)
})

test('the video\'s own dose is one that names its tank and gives no rate; a rate per volume or per tank, a CO2 rate, or a bare "ở đây" waits (Grok\'s read)', () => {
  for (const s of ['Châm phân nước mỗi ngày, ở bể 60 lít này là khoảng 3 ml.', 'Ở bể này châm phân nước khoảng 3 ml mỗi ngày.', 'Bể này dùng hai nắp.', 'Bể mẫu dùng vi sinh Multibio, châm 2 nắp.', 'Bể này dùng 2 sachet Quick Start.', 'Ở bể 1 mét này châm 3 ml.', 'Ở bể 50 litres này châm 3 ml.']) expect(ownTankDose(s), s).toBe(true)
  for (const s of ['Một cách xử lý là tăng phân nước, ở đây là 20 ml mỗi ngày cho bể 60 cm.', 'Bể này 100 lít thì châm 10 ml.', 'Bể này dùng 10 ml cho một lít.', 'Với sủi inline cho sương mịn, khoảng 5–6 giọt mỗi giây cho mức chừng 30 ppm ở bể này.', 'Châm 5 ml cho mỗi 50 lít.', 'Ở đây châm 3 ml.',
    // A rate however it's worded, a size beside the dose, a type of tank (Grok's second read).
    'Bể này 60 cm thì châm 10 ml.', 'Bể này 20 gallon thì châm 5 ml.', 'Bể này 1,2 m thì châm 2 nắp.', 'Bể này châm 5 ml cho mỗi 10 gallons.', 'Bể này dùng 5 ml cho mỗi 10 galông.', 'Bể này châm 5 ml mỗi bể 60 lít.', 'Bể này châm 5 ml cho những bể 60 cm.', 'Bể này châm 5 ml cho bể từ 60 cm.', 'Bể mẫu dùng vi sinh Multibio, bể 1,2 m châm 2 nắp.', 'Loại bể này châm 4 nắp.',
    // Rates and sizes in other words, a class of tank a word away, a dose in mg/l, a reading beside one (Grok's third read).
    'Bể này châm 5 ml theo lít.', 'Bể này dùng 5 ml per gallon.', 'Bể mẫu dùng vi sinh, bể 50 litre châm 2 nắp.', 'Bể này 4 feet châm 4 nắp.', 'Bể này châm 2 nắp, bể một mét.', 'Cỡ như bể này châm 4 nắp.', 'Những cái bể này châm 4 nắp.', 'Những bể như bể này châm 4 nắp.', 'Bể mẫu nào cũng châm 2 nắp.', 'Bể này châm phân, bể này dùng 20 mg/l.', 'Ở bể 60 lít này châm 20 mg/l.', 'Bể này châm 4 nắp, nitrat khoảng 20 mg/l.',
    // Another tank with a figure in a dose's unit or in words, a count or class of tanks, CO₂ (Grok's fourth read).
    'Bể mẫu dùng vi sinh, bể 500 ml châm 2 nắp.', 'Bể này châm 2 nắp, bể 60 cc.', 'Bể này châm 2 nắp, bể mười litres.', 'Bể này châm 2 nắp, bể sáu mươi centimet.', 'Không chỉ bể này, châm 4 nắp.', 'Dạng bể này châm 4 nắp.', 'Tất cả bể này châm 4 nắp.', 'Hai bể này châm 4 nắp.', 'Bất kỳ bể này cũng châm 4 nắp.', 'Bể này châm 5 giọt CO₂.']) expect(ownTankDose(s), s).toBe(false)
})

test('the video\'s own dose stays only in a sentence carried over whole, in any dose unit (Grok\'s second read)', async () => {
  const cases: [string, string, string, FitFinding[]][] = [
    ['the dose kept, another copy dropped', `${OWN}<p>Ngoài ra còn 4 nắp trong tủ.</p>`, `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, khoảng 4 nắp, liều theo hướng dẫn trên bao bì.</p><p>Ngoài ra còn trong tủ.</p><p>${LONG}</p>`, [own, gallons, caps]],
    ['a sachet kept', `<p>Bể 10 gallon là đủ.</p><p>Châm vi sinh ngay, bể này dùng 2 sachet.</p><p>${LONG}</p>`, `<p>Bể 10 gallon là đủ.</p><p>Châm vi sinh ngay, 2 sachet, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [gallons, { ...caps, quote: 'bể này dùng 2 sachet' }]],
    ['caps written as sachets in words', OWN, `<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, hai sachet, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p>`, [own, gallons, caps]],
  ]
  for (const [name, before, after, findings] of cases) {
    const { root, file, was } = await setup({ body: before, faq: [] })
    expect(await deps(root, kept(after)).mend(page(), findings), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // The other copy kept as it was, beside the dose gone: the mend stands.
  const two = await setup({ body: `${OWN}<p>Ngoài ra còn 4 nắp trong tủ.</p>`, faq: [] })
  expect(await deps(two.root, kept(`<p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.</p><p>${LONG}</p><p>Ngoài ra còn 4 nắp trong tủ.</p>`)).mend(page(), [own, gallons, caps])).toBe(true)
})
