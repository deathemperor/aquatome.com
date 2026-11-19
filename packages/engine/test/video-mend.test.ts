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
/** What the editor answers: each sentence it's asked, by its words, or the whole list (a function). */
type Answers = Record<string, string> | ((asked: { n: number; text: string }[]) => { n: number; vi: string }[])
const ANSWERS: Record<string, string> = { 'Mua lọc ở Petco, giá khoảng 5 USD.': 'Lọc mua ở tiệm cá cảnh.', 'Mua lọc ở Petco.': 'Ở tiệm cá cảnh.' }
/**
 * The sentences the editor was asked, from its prompt: "[n] (part) sentence", each with its notes under it.
 */
const askedOf = (prompt: string) => [...prompt.split('Các câu cần sửa:\n')[1]!.matchAll(/^\[(\d+)\] \([^)]+\) (.*)$/gm)].map(m => ({ n: Number(m[1]), text: m[2]! }))
/**
 * The editor answers the sentences it's asked (`answers`, default: the shop and the price gone); asked for the whole
 * guide, as the mend asked before 19 Nov, it returns `draft`. The reviewer scores it.
 */
function deps(root: string, o: { score?: number; answers?: Answers; draft?: object; transcript?: string | null } = {}) {
  const prompts: string[] = []
  const llm = (async (a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    const props = Object.keys((a.schema as { properties: object }).properties)
    if (props.includes('score')) return { score: o.score ?? 0.9, notes: ['fine'] }
    if (props.includes('relevant')) return { relevant: true, kind: 'setup', viTitle: 'Dựng bể nhỏ', summary: ['Bể nhỏ dễ dựng.'], body: FIXED, faq: [{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }], chapters: [], ...o.draft }
    const asked = askedOf(a.prompt)
    const answers = o.answers ?? ANSWERS
    return { sentences: typeof answers === 'function' ? answers(asked) : asked.map(x => ({ n: x.n, vi: answers[x.text] ?? x.text })) }
  }) as Llm
  const yt = { transcript: async () => (o.transcript !== undefined ? o.transcript : '[0:00] buy the filter at Petco for five dollars') }
  return { mend: videoMend(root, { llm, yt, now }), prompts }
}

test('the sentences a finding names go to the editor numbered, with the transcript, and come back into the guide by code', async () => {
  const { root, file } = await setup()
  const { mend, prompts } = deps(root, { score: 0.8 })
  expect(await mend(page(), [shop, price])).toBe(true)
  const vi = JSON.parse(await readFile(file, 'utf8'))
  // Only the named sentence changed: "Bể 38 lít là vừa." beside it is as it was, byte for byte (the whole-guide mend
  // rounded it to 40 lít, a sentence no finding names).
  expect(vi.body).toBe(FIXED)
  // The quote said again in the FAQ is named there too.
  expect(vi.faq).toEqual([{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }])
  expect(vi).toMatchObject({ name: 'Dựng bể nhỏ', summary: ['Bể nhỏ dễ dựng.'], slug: 'dung-be-nho', cover: 'Bể nhỏ', quality: { score: 0.8, indexable: true, bySource: { youtube: 0.8 } } })
  // The editor: the transcript, the whole guide to read, and the sentences to write again, each with its notes.
  expect(prompts[0]).toContain('Các câu cần sửa:\n[1] (thân bài) Mua lọc ở Petco, giá khoảng 5 USD.\n- "Mua lọc ở Petco": A foreign shop (a US shop)\n- "giá khoảng 5 USD": A foreign price or shipping cost (a price in dollars)\n\n[2] (trả lời FAQ) Mua lọc ở Petco.\n- "Mua lọc ở Petco": A foreign shop (a US shop)')
  expect(prompts[0]).toContain('Cả bài, để đọc:\nTIÊU ĐỀ: Dựng bể nhỏ\nTÓM TẮT: Bể nhỏ dễ dựng.\nBể nhỏ dễ dựng.\n## Mua đồ')
  expect(prompts[0]).toContain('Chỉ viết lại các câu được đánh số. Mọi câu khác trong bài giữ nguyên')
  expect(prompts[0]).toContain('Video có nói vậy thì vẫn sửa')
  expect(prompts[0]).toContain('buy the filter at Petco')
  // Gone: the lines that sent the editor to every other place that says the same, and to cut the rest of an idea.
  expect(prompts[0]).not.toContain('sửa hết')
  expect(prompts[0]).not.toContain('bỏ cả ý đó')
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

// The chief of staff, 19 Nov 2026: 15 of the 21 held guides mended from 18 Nov were thrown away after paying, each for a
// sentence no finding named that the editor changed. An editor that would tidy one can't now: it isn't shown one to write.
test('every sentence no finding names stays byte for byte, whatever the editor would do with it', async () => {
  const before = `<p>Bể nhỏ dễ dựng. Cá ăn vào buổi sáng.</p><h3>Mua đồ</h3><p>Mua lọc ở Petco, giá khoảng 5 USD. Bể 38 lít là vừa.</p><p>Lọc nên mua ở tiệm Petco cho rẻ.</p><p>${LONG}</p>`
  const { root, file } = await setup({ body: before })
  // Asked for the whole guide (the mend before this change), the editor rewords one sentence and tidies another that
  // says the same thing another way: that mend was refused. Asked for sentences, it answers those, and some it wasn't
  // asked, which are left alone.
  const tidied = { body: `<p>Bể nhỏ dễ dựng. Cá ăn buổi sáng.</p><h3>Mua đồ</h3><p>Lọc mua ở tiệm cá cảnh. Bể 38 lít là vừa.</p><p>Lọc nên mua ở tiệm cá cảnh.</p><p>${LONG}</p>` }
  const extra = (asked: { n: number; text: string }[]) => [...asked.map(x => ({ n: x.n, vi: ANSWERS[x.text] ?? x.text })), { n: 0, vi: 'Cá ăn buổi sáng.' }, { n: 99, vi: 'Lọc nên mua ở tiệm cá cảnh.' }]
  const { mend, prompts } = deps(root, { draft: tidied, answers: extra })
  expect(await mend(page(), [shop, price])).toBe(true)
  const vi = JSON.parse(await readFile(file, 'utf8'))
  expect(vi.body).toBe(before.replace('Mua lọc ở Petco, giá khoảng 5 USD.', 'Lọc mua ở tiệm cá cảnh.'))
  expect(vi.summary).toEqual(['Bể nhỏ dễ dựng.'])
  expect(vi.faq).toEqual([{ q: 'Mua lọc ở đâu?', a: 'Ở tiệm cá cảnh.' }])
  // The editor was shown only the named sentences to write; the one that says the same another way it wasn't.
  expect(askedOf(prompts[0]!).map(x => x.text)).toEqual(['Mua lọc ở Petco, giá khoảng 5 USD.', 'Mua lọc ở Petco.'])
})

test('a sentence is one as the sentence cutter has it: two it can\'t tell apart go together, and the next one after a stop stays', async () => {
  // "…Petco.“ Cá…": an opening mark after the stop, so the cutter keeps the two as one, and the editor has both.
  const one = await setup({ body: `<p>Ông nói “Mua lọc ở Petco.“ Cá ăn vào buổi sáng.</p><p>${LONG}</p>`, faq: [] })
  const a = deps(one.root, { answers: { 'Ông nói “Mua lọc ở Petco.“ Cá ăn vào buổi sáng.': 'Cá ăn vào buổi sáng.' } })
  expect(await a.mend(page(), [shop])).toBe(true)
  expect(JSON.parse(await readFile(one.file, 'utf8')).body).toBe(`<p>Cá ăn vào buổi sáng.</p><p>${LONG}</p>`)
  // A plain stop: the quote's sentence alone, the next as it was.
  const two = await setup({ body: `<p>Bể 10 gallon là đủ.</p><p>Bể này dùng khoảng 4 nắp. Cá ăn vào buổi sáng.</p><p>${LONG}</p>`, faq: [] })
  const b = deps(two.root, { answers: { 'Bể này dùng khoảng 4 nắp.': 'Châm vi sinh, liều theo hướng dẫn trên bao bì.' } })
  expect(await b.mend(page(), [gallons, { ...caps, quote: 'Bể này dùng khoảng 4 nắp.' }])).toBe(true)
  expect(askedOf(b.prompts[0]!).map(x => x.text)).toEqual(['Bể này dùng khoảng 4 nắp.'])
  expect(JSON.parse(await readFile(two.file, 'utf8')).body).toMatch(/^<p>Bể \d+ lít là đủ\.<\/p><p>Châm vi sinh, liều theo hướng dẫn trên bao bì\. Cá ăn vào buổi sáng\.<\/p>/)
})

test('a mend the page can\'t have leaves the file as it was', async () => {
  // The last column: false once an editor was called, which the gate counts among a run's mends; nothing when none was.
  const twice = (asked: { n: number; text: string }[]) => [...asked.map(x => ({ n: x.n, vi: ANSWERS[x.text] ?? x.text })), { n: 1, vi: 'Lọc mua trên mạng.' }]
  const cases: [string, Parameters<typeof setup>, Parameters<typeof deps>[1], Partial<Page>, FitFinding[], false | undefined][] = [
    ['another language', [], {}, { lang: 'id' }, [shop, price], undefined],
    ['not a guide', [], {}, { kind: 'species' }, [shop, price], undefined],
    ['a guide from an article', [{}, { source: 'aquariumcoop', video: undefined }], {}, {}, [shop, price], undefined],
    ['a body a person fixed', [{ bodyFixed: true }], {}, {}, [shop, price], undefined],
    ['questions a person fixed', [{ faqFixed: true }], {}, {}, [shop, price], undefined],
    ['no transcript on this Mac', [], { transcript: null }, {}, [shop, price], undefined],
    ['a quote in no sentence of the guide', [], {}, {}, [shop, { ...price, quote: 'giá 9 EUR' }], undefined],
    ['nothing but units', [{ body: `<p>Bể 10 gallon là đủ.</p><p>${LONG}</p>` }], {}, {}, [gallons], undefined],
    ['an answer that numbers a sentence twice', [], { answers: twice }, {}, [shop, price], false],
    ['an answer that leaves a sentence out', [], { answers: asked => asked.slice(1).map(x => ({ n: x.n, vi: '' })) }, {}, [shop, price], false],
    ['an edit that left a quote in, here in the FAQ', [], { answers: { ...ANSWERS, 'Mua lọc ở Petco.': 'Mua lọc ở Petco.' } }, {}, [shop, price], false],
    ['a question emptied, its answer left', [{ faq: [{ q: 'Mua lọc ở Petco không?', a: 'Có.' }] }], { answers: { ...ANSWERS, 'Mua lọc ở Petco không?': '' } }, {}, [shop, price], false],
    // Its only sentence gone, a body left with a line break is empty (Codex's read of #1690).
    ['a body emptied but for a line break', [{ body: '<p>Mua lọc ở Petco.<br></p>', faq: [] }], { answers: { 'Mua lọc ở Petco.': '' } }, {}, [shop], false],
    // A body is empty when it has no words, whatever tags are left (Codex's second read of #1690).
    ['a body emptied but for a table', [{ body: '<table><tbody><tr><td>Mua lọc ở Petco.</td></tr></tbody></table>', faq: [] }], { answers: { 'Mua lọc ở Petco.': '' } }, {}, [shop], false],
    ['a review under the bar and under the page\'s', [], { score: 0.7 }, {}, [shop, price], false],
  ]
  for (const [name, s, d, p, findings, out] of cases) {
    const { root, file, was } = await setup(...s)
    const { mend, prompts } = deps(root, d)
    expect(await mend(page(p), findings), name).toBe(out)
    expect(prompts.length > 0, name).toBe(out === false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
})

// Codex's read of #1690: a quote's words are whole words wherever the guide says them. "ADA" isn't in "Canada", and the
// sentence that says "Canada" is neither the editor's nor a quote left in.
test('a quote names only the sentences that hold its words whole', async () => {
  const ada: FitFinding = { check: 'product', part: 'P1', quote: 'ADA', why: 'a product not sold here', by: 'model' }
  const { root, file } = await setup({ body: `<p>Cá nhập từ Canada rất khỏe. Phân nền ADA Amazonia giữ màu nước.</p><p>${LONG}</p>`, faq: [] })
  const { mend, prompts } = deps(root, { answers: { 'Phân nền ADA Amazonia giữ màu nước.': 'Phân nền giữ màu nước.' } })
  expect(await mend(page(), [ada])).toBe(true)
  expect(askedOf(prompts[0]!).map(x => x.text)).toEqual(['Phân nền ADA Amazonia giữ màu nước.'])
  expect(JSON.parse(await readFile(file, 'utf8')).body).toBe(`<p>Cá nhập từ Canada rất khỏe. Phân nền giữ màu nước.</p><p>${LONG}</p>`)
  // Nor does a dose in the sentence about Canada hold the guide back (Codex's second read).
  const dosed = await setup({ body: `<p>Châm 5 ml thuốc khử clo cho bể cá nhập từ Canada.</p><p>Phân nền ADA Amazonia giữ màu nước.</p><p>${LONG}</p>`, faq: [] })
  const d = deps(dosed.root, { answers: { 'Phân nền ADA Amazonia giữ màu nước.': 'Phân nền giữ màu nước.' } })
  expect(await d.mend(page(), [ada])).toBe(true)
  expect(askedOf(d.prompts[0]!).map(x => x.text)).toEqual(['Phân nền ADA Amazonia giữ màu nước.'])
  // Nor across a comma: "bể, mẫu" isn't "Bể mẫu" (Codex's fourth read).
  const comma = await setup({ body: `<p>Bể mẫu đặt gần cửa sổ.</p><p>Sau khi lấy nước từ bể, mẫu cần được đo ngay.</p><p>${LONG}</p>`, faq: [] })
  const c = deps(comma.root, { answers: { 'Bể mẫu đặt gần cửa sổ.': 'Đặt bể gần cửa sổ.' } })
  expect(await c.mend(page(), [{ ...own, quote: 'Bể mẫu' }])).toBe(true)
  expect(askedOf(c.prompts[0]!).map(x => x.text)).toEqual(['Bể mẫu đặt gần cửa sổ.'])
})

test('a sentence comes back as the part keeps it: inline markup in the body, plain words in a line, an "&" either way', async () => {
  // Block tags in a body sentence don't nest a paragraph in a paragraph.
  const a = await setup()
  expect(await deps(a.root, { answers: { ...ANSWERS, 'Mua lọc ở Petco, giá khoảng 5 USD.': '<p>Lọc mua ở <strong>tiệm cá cảnh</strong>.</p>' } }).mend(page(), [shop, price])).toBe(true)
  expect(JSON.parse(await readFile(a.file, 'utf8')).body).toBe(FIXED.replace('tiệm cá cảnh', '<strong>tiệm cá cảnh</strong>'))
  // A summary point the editor writes with "&amp;" is kept with "&", and one it isn't asked keeps its own "&" as it was.
  const b = await setup({ summary: ['Mua lọc ở Petco & tiệm khác.', 'Cá & tép ăn sáng.'] })
  expect(await deps(b.root, { answers: { ...ANSWERS, 'Mua lọc ở Petco & tiệm khác.': 'Lọc mua ở tiệm cá cảnh &amp; trên mạng.' } }).mend(page(), [shop, price])).toBe(true)
  expect(JSON.parse(await readFile(b.file, 'utf8')).summary).toEqual(['Lọc mua ở tiệm cá cảnh & trên mạng.', 'Cá & tép ăn sáng.'])
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
  // Said first with no dose and again in one, the product or the price waits just the same (Codex's read of #1690).
  for (const [name, body, f] of [
    ['a product named first with no dose, then in one', `<p>Seachem Prime là loại khử clo quen thuộc.</p><p>Châm 5 ml Seachem Prime cho 200 lít mỗi lần thay nước.</p><p>${LONG}</p>`, product],
    ['a price said first alone, then beside an amount', `<p>Lọc giá 5 USD.</p><p>Thức ăn Hikari gói 20 g giá 5 USD là đủ dùng lâu.</p><p>${LONG}</p>`, packet],
    // A dose in words is a dose (Codex's second read).
    ['a product named first with no dose, then in a dose in words', `<p>Seachem Prime là loại khử clo quen thuộc.</p><p>Châm hai nắp Seachem Prime cho mỗi 50 lít.</p><p>${LONG}</p>`, product],
  ] as const) {
    const { root, file, was } = await setup({ body, faq: [] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [f]), name).toBeUndefined()
    expect(prompts, name).toEqual([])
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // The same product named where no dose is given goes to the editor as before, and so does a shop in a guide that gives
  // a dose elsewhere, whose dose stays as it was.
  for (const [body, findings, answers, after] of [
    [`<p>Seachem Prime là loại khử clo quen thuộc.</p><p>${LONG}</p>`, [product], { 'Seachem Prime là loại khử clo quen thuộc.': '' }, `<p>${LONG}</p>`],
    [`${dosed}<p>Mua lọc ở Petco.</p>`, [shop], { 'Mua lọc ở Petco.': '' }, dosed],
  ] as const) {
    const { root, file } = await setup({ body, faq: [] })
    const { mend, prompts } = deps(root, { answers })
    expect(await mend(page(), [...findings])).toBe(true)
    expect(prompts).toHaveLength(2)
    expect(JSON.parse(await readFile(file, 'utf8')).body).toBe(after)
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
  expect(await deps(root, { answers: { ...ANSWERS, 'Mua lọc ở Petco cho bể nhỏ': 'Tên khác' } }).mend(page(), [{ ...shop, part: 'T' }, price])).toBe(true)
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ name: 'Tên khác', slug: 'dung-be-nho' })
})

test('a title a person picked stays, even when a check quotes it', async () => {
  // Nor does code convert its units for another finding's mend (Codex's fifth read of #1690).
  const fixed = await setup({ name: 'Bể 38 lít với lớp nền 2 inch', nameFixed: true, body: `<p>Lớp nền dày 2 inch.</p><p>Mua đá ở Petco.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(fixed.root, { answers: { 'Mua đá ở Petco.': 'Mua đá ở tiệm cá cảnh.' } }).mend(page(), [{ ...gallons, quote: '2 inch' }, { ...shop, quote: 'Petco' }])).toBe(true)
  const after = JSON.parse(await readFile(fixed.file, 'utf8'))
  expect(after.name).toBe('Bể 38 lít với lớp nền 2 inch')
  expect(after.body).toMatch(/^<p>Lớp nền dày \d+ cm\.<\/p><p>Mua đá ở tiệm cá cảnh\.<\/p>/)
  for (const f of [{ ...shop, quote: 'Mua lọc ở Petco cho bể nhỏ', part: 'T' }, shop]) {
    const { root, file } = await setup({ name: 'Mua lọc ở Petco cho bể nhỏ', nameFixed: true })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [f])).toBeUndefined() // no editor called
    expect(prompts).toEqual([])
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ name: 'Mua lọc ở Petco cho bể nhỏ', nameFixed: true })
  }
})

// The chief of staff, 14 Nov 2026: the editor takes a source line and a dose that is the video's own tank's, which it
// drops, figure and brand, for the label; units are code's. A dose given as advice waits for a person. Every figure in is
// every figure out, but those of the sentences the editor is given.
const OWN = `<p>Bể dùng ở đây là loại nông: dài 80 cm, sâu 30 cm.</p><p>Bể 10 gallon là đủ cho một đàn nhỏ.</p><p>Châm vi sinh ngay, ví dụ Quick Start, bể này dùng khoảng 4 nắp.</p><p>${LONG}</p>`
const own: FitFinding = { check: 'source', part: 'P1', quote: 'Bể dùng ở đây là loại nông', why: 'the video\'s own tank', by: 'model' }
const gallons: FitFinding = { check: 'units', part: 'P2', quote: 'Bể 10 gallon', why: 'a US tank', by: 'rule' }
const caps: FitFinding = { check: 'dose', part: 'P3', quote: 'bể này dùng khoảng 4 nắp', why: 'an amount of a named product', by: 'model' }
const brand: FitFinding = { check: 'product', part: 'P3', quote: 'Quick Start', why: 'a US product', by: 'model' }
const P1 = 'Bể dùng ở đây là loại nông: dài 80 cm, sâu 30 cm.'
const P3 = 'Châm vi sinh ngay, ví dụ Quick Start, bể này dùng khoảng 4 nắp.'
/** The source line gone and the dose's sentence as given. */
const ownTank = (p3: string) => ({ answers: { [P1]: '', [P3]: p3 } })
test('the editor takes a source line and the video\'s own dose, code the units, and no figure comes of its own', async () => {
  const { root, file } = await setup({ body: OWN, faq: [] })
  const { mend, prompts } = deps(root, ownTank('Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.'))
  expect(await mend(page(), [own, gallons, caps, brand])).toBe(true)
  const body = JSON.parse(await readFile(file, 'utf8')).body as string
  // Code converts the units sentence, which the editor isn't shown; the dose and the brand are gone for the label.
  expect(body).not.toMatch(/gallon|4 nắp|Quick Start|80 cm/)
  expect(body).toMatch(/^<p>Bể \d+ lít là đủ cho một đàn nhỏ\.<\/p><p>Châm vi sinh ngay, liều theo hướng dẫn trên bao bì\.<\/p>/)
  expect(askedOf(prompts[0]!).map(x => x.text)).toEqual([P1, P3])
  expect(prompts[0]).not.toContain('"Bể 10 gallon":')
  expect(prompts[0]).toContain('[2] (thân bài) Châm vi sinh ngay, ví dụ Quick Start, bể này dùng khoảng 4 nắp.\n- "bể này dùng khoảng 4 nắp": A dose tied to a foreign product (an amount of a named product). Đây là liều của chính bể trong video: bỏ con số liều và tên sản phẩm, giữ bước làm, viết "…, liều theo hướng dẫn trên bao bì."\n- "Quick Start": ')
  expect(prompts[0]).toContain('Chỉ khi ghi chú nói đó là liều của chính bể trong video thì bỏ con số liều và tên sản phẩm')
})

test('a figure the editor adds, keeps of the video\'s own dose, or writes in another way leaves the file as it was', async () => {
  const cases: [string, string][] = [
    ['a dose figure of its own', 'Châm vi sinh ngay, khoảng 5 ml, liều theo hướng dẫn trên bao bì.'],
    ['the dose kept', 'Châm vi sinh ngay, bể này dùng khoảng 4 nắp.'],
    // The video's own dose kept in a reworded sentence, or written in words (Grok's read).
    ['the dose reworded and kept', 'Châm vi sinh ngay, khoảng 4 nắp, liều theo hướng dẫn trên bao bì.'],
    ['a dose in words', 'Châm vi sinh ngay, năm nắp, liều theo hướng dẫn trên bao bì.'],
    ['a dose in another unit', 'Châm vi sinh ngay, 4 cái nắp, liều theo hướng dẫn trên bao bì.'],
    // A dose figure in several words, as a fraction sign (Grok's fourth read).
    ['a dose in compound words', 'Châm vi sinh ngay, hai mươi nắp, liều theo hướng dẫn trên bao bì.'],
    ['a dose as a fraction sign', 'Châm vi sinh ngay, ½ nắp, liều theo hướng dẫn trên bao bì.'],
    ['caps written as sachets in words', 'Châm vi sinh ngay, hai sachet, liều theo hướng dẫn trên bao bì.'],
  ]
  for (const [name, p3] of cases) {
    const { root, file, was } = await setup({ body: OWN, faq: [] })
    expect(await deps(root, ownTank(p3)).mend(page(), [own, gallons, caps]), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // An ounce is a dose's unit: the video's own dose in ounces goes, not into grams (Codex's fifth read; main too).
  const oz = await setup({ body: `<p>Bể 10 gallon là đủ.</p><p>Bể này dùng 4 thìa muối (½ oz).</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(oz.root, { answers: { 'Bể này dùng 4 thìa muối (½ oz).': 'Thêm ½ oz muối, liều theo hướng dẫn trên bao bì.' } }).mend(page(), [gallons, { ...caps, quote: 'Bể này dùng 4 thìa muối' }])).toBe(false)
  expect(await readFile(oz.file, 'utf8')).toBe(oz.was)
  // A dose added to a shop's mend, in figures, caps, words or against its unit (Grok's fifth read).
  for (const fix of ['Lọc mua ở tiệm cá cảnh. Châm 5 ml vi sinh.', 'Lọc mua ở tiệm cá cảnh. Châm 5 caps vi sinh.', 'Lọc mua ở tiệm cá cảnh. Châm hai mươi nắp.', 'Lọc mua ở tiệm cá cảnh. Châm ½nắp.']) {
    const { root, file, was } = await setup()
    expect(await deps(root, { answers: { ...ANSWERS, 'Mua lọc ở Petco, giá khoảng 5 USD.': fix } }).mend(page(), [shop, price]), fix).toBe(false)
    expect(await readFile(file, 'utf8'), fix).toBe(was)
  }
})

test('a dose given as advice, or with nothing naming the video\'s tank, waits for a person: no editor is called', async () => {
  // Every place the dose's quote is said: the tank's own the first time, advice the next (Codex's second read of #1690).
  const twice = await setup({ body: `<p>Bể này dùng khoảng 4 nắp.</p><p>Lần sau, bể này dùng khoảng 4 nắp cho mỗi 200 lít.</p><p>${LONG}</p>`, faq: [] })
  const t = deps(twice.root)
  expect(await t.mend(page(), [{ ...caps, quote: 'Bể này dùng khoảng 4 nắp' }])).toBeUndefined()
  expect(t.prompts).toEqual([])
  expect(await readFile(twice.file, 'utf8')).toBe(twice.was)
  for (const line of ['Châm 5 ml vi sinh cho mỗi 50 lít nước.', 'Châm khoảng 4 nắp vi sinh.', 'Bể này châm 2 ml cho mỗi 10 lít.']) {
    const { root, file, was } = await setup({ body: `<p>${line}</p><p>${LONG}</p>`, faq: [] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [{ ...caps, quote: line.slice(0, -1) }]), line).toBeUndefined()
    expect(prompts, line).toEqual([])
    expect(await readFile(file, 'utf8'), line).toBe(was)
  }
})

test('a figure in a sentence the editor is given keeps its percent, its half, its rate and its size in words (Grok\'s reads)', async () => {
  const at = (quote: string): FitFinding => ({ ...own, quote })
  const cases: [string, string, string, FitFinding[]][] = [
    ['a percent sign dropped', 'Thay 30% nước mỗi tuần.', 'Thay 30 nước mỗi tuần.', [at('Thay 30% nước')]],
    // A size in words changed (Grok's fifth read).
    ['a size in words changed', 'Bể mười lít là đủ cho một đàn nhỏ.', 'Bể năm mươi lít là đủ cho một đàn nhỏ.', [at('Bể mười lít')]],
    // A half, a range in words, a rate (Grok's sixth read).
    ['a half in words dropped', 'Bể mười lít rưỡi là đủ.', 'Bể mười lít là đủ.', [at('Bể mười lít rưỡi')]],
    ['a half dropped', 'Bể 10 lít rưỡi là đủ.', 'Bể 10 lít là đủ.', [at('Bể 10 lít rưỡi')]],
    ['a range in words changed', 'Bể từ mười đến hai mươi lít là đủ.', 'Bể từ năm đến hai mươi lít là đủ.', [at('Bể từ mười')]],
    ['a rate in words made a volume', 'Bơm ba trăm lít/giờ.', 'Bơm ba trăm lít.', [at('Bơm ba trăm')]],
    ['a rate made a volume', 'Bơm 300 lít/giờ.', 'Bơm 300 lít.', [at('Bơm 300')]],
    // A fraction in words is one figure: a quarter cap isn't three quarters (Codex's fifth read; main too).
    ['a written fraction changed', 'Theo video, châm một phần tư nắp vi sinh.', 'Châm ba phần tư nắp vi sinh.', [at('Theo video')]],
    // A units quote's figure is code's, even in a sentence a shop's finding gives the editor.
    ['a units figure dropped beside a shop', 'Bể 10 gallon mua ở Petco.', 'Bể mua ở tiệm cá cảnh.', [{ ...gallons, quote: 'Bể 10 gallon' }, { ...shop, quote: 'mua ở Petco' }]],
    // A units quote of the unit alone keeps its sentence's figure too (Codex's read of #1690).
    ['a units figure dropped beside a shop, its quote the unit alone', 'Bể 10 gallon mua ở Petco.', 'Bể mua ở tiệm cá cảnh.', [{ ...gallons, quote: 'gallon' }, { ...shop, quote: 'mua ở Petco' }]],
    // The same figure kept in a product's name, which code doesn't convert, isn't the tank's kept (Codex's second read).
    ['a units figure dropped, the same figure kept in a product\'s name', 'Bể 10 gallon và bộ Aqueon 10 Gallon bán ở Petco.', 'Bộ Aqueon 10 Gallon bán ở tiệm cá cảnh.', [{ ...gallons, quote: 'gallon' }, { ...shop, quote: 'bán ở Petco' }]],
  ]
  for (const [name, before, after, findings] of cases) {
    const { root, file, was } = await setup({ body: `<p>${before}</p><p>${LONG}</p>`, faq: [] })
    expect(await deps(root, { answers: { [before]: after } }).mend(page(), findings), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // A figure that leaves one answer for another: the page's counts hold, its sentences' don't (Codex's read of #1690).
  const moved = await setup({ body: `<p>Bể mẫu dài 30 cm, mua ở Petco.</p><p>Đèn mua ở Amazon, công suất 20 W.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(moved.root, { answers: { 'Bể mẫu dài 30 cm, mua ở Petco.': 'Bể mua ở tiệm cá cảnh.', 'Đèn mua ở Amazon, công suất 20 W.': 'Đèn mua trên mạng, treo cách mặt nước 30 cm, công suất 20 W.' } }).mend(page(), [at('Bể mẫu dài 30 cm'), { ...shop, quote: 'mua ở Amazon' }])).toBe(false)
  expect(await readFile(moved.file, 'utf8')).toBe(moved.was)
  // The units figure kept beside the shop gone: code converts it.
  const kept = await setup({ body: `<p>Bể 10 gallon mua ở Petco.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(kept.root, { answers: { 'Bể 10 gallon mua ở Petco.': 'Bể 10 gallon mua ở tiệm cá cảnh.' } }).mend(page(), [{ ...gallons, quote: 'gallon' }, { ...shop, quote: 'mua ở Petco' }])).toBe(true)
  expect(JSON.parse(await readFile(kept.file, 'utf8')).body).toMatch(/^<p>Bể \d+ lít mua ở tiệm cá cảnh\.<\/p>/)
  // "60 x 38 x 30 cm" written "60 × 38 × 30 cm" is the same figures.
  const x = await setup({ body: `<p>Bể 10 gallon là đủ.</p><p>Bể mẫu kích thước 60 x 38 x 30 cm là vừa.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(x.root, { answers: { 'Bể mẫu kích thước 60 x 38 x 30 cm là vừa.': 'Một bể kích thước 60 × 38 × 30 cm là vừa.' } }).mend(page(), [gallons, at('Bể mẫu')])).toBe(true)
  // A sentence two findings quote is sent once with both notes, and the same figure kept in the sentence after it stays.
  const two = await setup({ body: `<p>Bể mẫu dài 30 cm, mua ở Petco. Đèn cách mặt nước 30 cm.</p><p>${LONG}</p>`, faq: [] })
  const d = deps(two.root, { answers: { 'Bể mẫu dài 30 cm, mua ở Petco.': 'Bể mua ở tiệm cá cảnh.' } })
  expect(await d.mend(page(), [at('Bể mẫu dài 30 cm'), { ...shop, quote: 'mua ở Petco' }])).toBe(true)
  expect(askedOf(d.prompts[0]!)).toHaveLength(1)
  expect(JSON.parse(await readFile(two.file, 'utf8')).body).toBe(`<p>Bể mua ở tiệm cá cảnh. Đèn cách mặt nước 30 cm.</p><p>${LONG}</p>`)
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
  const cases: [string, string, Record<string, string>, FitFinding[]][] = [
    ['the dose kept in the editor\'s sentence, another copy as it was', `${OWN}<p>Ngoài ra còn 4 nắp trong tủ.</p>`, { [P1]: '', [P3]: 'Châm vi sinh ngay, khoảng 4 nắp, liều theo hướng dẫn trên bao bì.' }, [own, gallons, caps]],
    ['a sachet kept', `<p>Bể 10 gallon là đủ.</p><p>Châm vi sinh ngay, bể này dùng 2 sachet.</p><p>${LONG}</p>`, { 'Châm vi sinh ngay, bể này dùng 2 sachet.': 'Châm vi sinh ngay, 2 sachet, liều theo hướng dẫn trên bao bì.' }, [gallons, { ...caps, quote: 'bể này dùng 2 sachet' }]],
  ]
  for (const [name, before, answers, findings] of cases) {
    const { root, file, was } = await setup({ body: before, faq: [] })
    expect(await deps(root, { answers }).mend(page(), findings), name).toBe(false)
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // The other copy kept as it was, beside the dose gone: the mend stands.
  const two = await setup({ body: `${OWN}<p>Ngoài ra còn 4 nắp trong tủ.</p>`, faq: [] })
  expect(await deps(two.root, ownTank('Châm vi sinh ngay, liều theo hướng dẫn trên bao bì.')).mend(page(), [own, gallons, caps])).toBe(true)
  expect(JSON.parse(await readFile(two.file, 'utf8')).body).toContain('<p>Ngoài ra còn 4 nắp trong tủ.</p>')
})

test('a dose whose sentence reads on past an initial or an abbreviation waits for a person: no editor is called (Grok\'s reads)', async () => {
  for (const [line, quote] of [['Bể này dùng khoảng 4 nắp, loài P. aethiopicus, mỗi 10 lít.', '4 nắp, loài P.'], ['Bể này dùng khoảng 4 nắp, loài "P. aethiopicus", mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp v.v. mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp, vd. mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp, loài sp. aethiopicus, mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp, loài «P. aethiopicus», mỗi 10 lít.', '4 nắp'],
    // A capital or a figure after an abbreviation is no sentence start (Grok's fifth read).
    ['Bể này dùng khoảng 4 nắp, loài P. Scalare, mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp, vd. 5 ml cho mỗi 10 lít.', '4 nắp'], ['Bể này dùng khoảng 4 nắp v.v. 5 ml mỗi 10 lít.', '4 nắp'], ["Bể này dùng khoảng 4 nắp, loài sp. 'Pygmy', mỗi 10 lít.", '4 nắp'],
    // The tank named only in the next sentence: not its own dose (Grok's sixth read).
    ['Châm 5 ml. Bể này ổn.', '5 ml']] as const) {
    const { root, file, was } = await setup({ body: `<p>${line}</p><p>${LONG}</p>`, faq: [] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [{ ...caps, quote }]), line).toBeUndefined()
    expect(prompts, line).toEqual([])
    expect(await readFile(file, 'utf8'), line).toBe(was)
  }
})

// Codex's three reads of #1690 found these one by one; here they're crossed: where a quote is said (first, later, the
// FAQ), how a dose is written (figures, words, a fraction, a compound), what stands between the quote and the dose (one
// sentence, a line break, a stop), and a figure the sentence already has.
test('crossed: a product or a price in a paragraph that gives a dose waits, however the dose is written and wherever the quote is said', async () => {
  const product: FitFinding = { check: 'product', part: 'P1', quote: 'Seachem Prime', why: 'a product not sold here', by: 'model' }
  const usd: FitFinding = { check: 'price', part: 'P1', quote: '7 USD', why: 'a price in dollars', by: 'rule' }
  for (const f of [product, usd]) {
    const q = f === usd ? 'thuốc giá 7 USD' : f.quote
    for (const dose of ['5 ml', 'hai nắp', '½ nắp', '⅜ nắp', 'hai mươi giọt']) {
      for (const line of [`Châm ${dose} ${q} cho mỗi 50 lít.`, `Châm ${dose}<br> ${q} cho mỗi 50 lít.`, `Dùng ${q} cho nhanh. Châm ${dose} cho mỗi 50 lít.`]) {
        for (const place of ['first', 'later', 'faq']) {
          const intro = `<p>Có loại ${q} quen thuộc.</p>`
          const body = place === 'first' ? `<p>${line}</p><p>${LONG}</p>` : place === 'later' ? `${intro}<p>${line}</p><p>${LONG}</p>` : `${intro}<p>${LONG}</p>`
          const faq = place === 'faq' ? [{ q: 'Châm bao nhiêu?', a: line.replace('<br>', '') }] : []
          const { root, file, was } = await setup({ body, faq })
          const { mend, prompts } = deps(root)
          const name = `${f.check}, ${dose}, ${place}: ${line}`
          expect(await mend(page(), [f]), name).toBeUndefined()
          expect(prompts, name).toEqual([])
          expect(await readFile(file, 'utf8'), name).toBe(was)
        }
      }
    }
  }
})

test('crossed: a dose quote is the tank\'s own at every place it\'s said, or the guide waits; and no answer to a dose\'s sentence keeps one of its doses', async () => {
  const q = 'Bể này dùng khoảng 4 nắp'
  for (const [name, body, faq] of [
    ['advice said again later', `<p>${q}.</p><p>${q} cho mỗi 200 lít.</p><p>${LONG}</p>`, []],
    ['advice after a line break', `<p>${q}.</p><p>Lần sau.<br> ${q} cho mỗi 200 lít.</p><p>${LONG}</p>`, []],
    ['advice in the FAQ', `<p>${q}.</p><p>${LONG}</p>`, [{ q: 'Châm bao nhiêu?', a: `${q} cho mỗi 200 lít.` }]],
    // The cutter keeps the next sentence with it (a stop inside <strong>): that neighbour's "Bể này" doesn't make the
    // dose the tank's (Codex's fourth read).
    ['a neighbour names the tank', `<p><strong>Châm 5 ml Seachem Prime.</strong> Bể này đã ổn định.</p><p>${LONG}</p>`, []],
  ] as const) {
    const { root, file, was } = await setup({ body, faq: [...faq] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [{ ...caps, quote: name === 'a neighbour names the tank' ? 'Châm 5 ml Seachem Prime.' : q }]), name).toBeUndefined()
    expect(prompts, name).toEqual([])
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // Every sentence the cutter keeps with a dose's, cut at every stop, that gives a dose is the tank's own too, whatever
  // quote finds it: a general dose beside it would go with it (Codex's fifth read).
  for (const [name, body, findings] of [
    ['a general dose kept with it', `<p><strong>Bể này dùng 4 nắp. Châm 5 ml Seachem Prime.</strong></p><p>${LONG}</p>`, [{ ...caps, quote: 'Bể này dùng 4 nắp.' }]],
    ['and a product finding on it', `<p><strong>Bể này dùng 4 nắp. Châm 5 ml Seachem Prime.</strong></p><p>${LONG}</p>`, [{ ...caps, quote: 'Bể này dùng 4 nắp.' }, { check: 'product', part: 'P1', quote: 'Seachem Prime', why: 'a product not sold here', by: 'model' }]],
    ['found by a curly apostrophe', `<p><strong>Châm 5 ml Dr. Tim’s One and Only. Bể này đã ổn định.</strong></p><p>Bể này châm 5 ml Dr. Tim's One and Only.</p><p>${LONG}</p>`, [{ ...caps, quote: "5 ml Dr. Tim's One and Only" }]],
  ] as const) {
    const { root, file, was } = await setup({ body, faq: [] })
    const { mend, prompts } = deps(root)
    expect(await mend(page(), [...findings] as FitFinding[]), name).toBeUndefined()
    expect(prompts, name).toEqual([])
    expect(await readFile(file, 'utf8'), name).toBe(was)
  }
  // Both the tank's own, the second with another dose: an answer that keeps it, however written, is refused.
  for (const more of ['2 nắp', 'hai nắp', '½ nắp']) {
    const second = `Bể này dùng khoảng 4 nắp thuốc khử clo và ${more} vi sinh.`
    const { root, file, was } = await setup({ body: `<p>Bể này dùng khoảng 4 nắp thuốc khử clo.</p><p>${second}</p><p>${LONG}</p>`, faq: [] })
    const answers = { 'Bể này dùng khoảng 4 nắp thuốc khử clo.': 'Châm thuốc khử clo, liều theo hướng dẫn trên bao bì.', [second]: `Châm ${more} vi sinh.` }
    expect(await deps(root, { answers }).mend(page(), [{ ...caps, quote: q }]), more).toBe(false)
    expect(await readFile(file, 'utf8'), more).toBe(was)
  }
})

test('crossed: a sentence a units finding names keeps every figure code converts it to, whatever figure it already had', async () => {
  const units: FitFinding[] = [{ ...gallons, quote: 'gallon' }, { ...shop, quote: 'bán ở Petco' }]
  const cases: [string, string][] = [
    ['Bể 40 lít và bể 10 gallon bán ở Petco.', 'Bể 40 lít bán ở tiệm cá cảnh.'],
    ['Bể 38 lít và bể 10 gallon bán ở Petco.', 'Bể 38 lít bán ở tiệm cá cảnh.'],
    ['Bể 10 gallon và bộ Aqueon 10 Gallon bán ở Petco.', 'Bộ Aqueon 10 Gallon bán ở tiệm cá cảnh.'],
    ['Bể 40 lít, bể 10 gallon và bộ Aqueon 10 Gallon bán ở Petco.', 'Bể 40 lít và bộ Aqueon 10 Gallon bán ở tiệm cá cảnh.'],
    ['Bể 38 lít, bể 10 gallon và bộ Aqueon 10 Gallon bán ở Petco.', 'Bể 38 lít và bộ Aqueon 10 Gallon bán ở tiệm cá cảnh.'],
  ]
  for (const [before, after] of cases) {
    const { root, file, was } = await setup({ body: `<p>${before}</p><p>${LONG}</p>`, faq: [] })
    expect(await deps(root, { answers: { [before]: after } }).mend(page(), units), before).toBe(false)
    expect(await readFile(file, 'utf8'), before).toBe(was)
  }
  // A figure the sentence had before code converts it is kept too: "20 lít (5 gallon)" is one 20 lít once converted
  // (Codex's fourth read).
  const min = 'Cá cần bể tối thiểu 20 lít (5 gallon), theo video.'
  const m = await setup({ body: `<p>${min}</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(m.root, { answers: { [min]: 'Cá cần bể phù hợp.' } }).mend(page(), [{ ...gallons, quote: 'gallon' }, { ...own, quote: 'theo video' }])).toBe(false)
  expect(await readFile(m.file, 'utf8')).toBe(m.was)
  // A price beside the units goes, as the editor is told: its figure is the finding's.
  const priced = await setup({ body: `<p>Bể 10 gallon giá 20 USD.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(priced.root, { answers: { 'Bể 10 gallon giá 20 USD.': 'Bể 10 gallon giá rẻ.' } }).mend(page(), [{ ...gallons, quote: 'gallon' }, { ...price, quote: 'giá 20 USD' }])).toBe(true)
  // Every figure kept: code converts it.
  const ok = await setup({ body: `<p>Bể 40 lít và bể 10 gallon bán ở Petco.</p><p>${LONG}</p>`, faq: [] })
  expect(await deps(ok.root, { answers: { 'Bể 40 lít và bể 10 gallon bán ở Petco.': 'Bể 40 lít và bể 10 gallon bán ở tiệm cá cảnh.' } }).mend(page(), units)).toBe(true)
})

