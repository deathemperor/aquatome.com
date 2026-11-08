import { expect, test } from 'vitest'
import { CHECKLIST, doseGroups, fitCounts, fitDue, fitFindings, fitKey, fitOrder, fitPrompt, fitReport, fitRules, fitText, hasDose, keepCautions, keepDoses, keepFit, productOf, readFit, runFit, type FitCheck, type FitDose } from '../src/fit'
import { LlmError, type Llm } from '../src/claude'
import type { Page } from '../src/pages'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const page = (html: string, o: Partial<Page> = {}): Page => ({ lang: 'vi', kind: 'guides', id: 'g', title: 'T', path: '/vi/huong-dan/g/', fields: [{ field: 'body', html }], lines: [], captions: [], latinNames: [], card: [], ...o })
const checks = (html: string, o: Partial<Page> = {}) => fitRules(page(html, o)).map(f => f.check)
const found = (check: FitCheck, html: string, o: Partial<Page> = {}) => fitRules(page(html, o)).filter(f => f.check === check).map(f => f.quote)

test('the chief\'s samples: each is found, by the check it belongs to', () => {
  expect(found('dose', '<p>Dùng 1 gói Maracyn và 1 thìa cà phê Ich-X mỗi 38 lít.</p>')).toEqual(['Dùng 1 gói Maracyn và 1 thìa cà phê Ich-X mỗi 38 lít.'])
  expect(found('product', '<p>Dùng 1 gói Maracyn và 1 thìa cà phê Ich-X mỗi 38 lít.</p>')).toEqual(['Ich-X', 'Maracyn'])
  expect(found('price', '<p>Bạn mua trên Amazon giá khoảng 14 USD.</p>')).toEqual(['14 USD'])
  expect(found('shop', '<p>Bạn mua trên Amazon giá khoảng 14 USD.</p>')).toEqual(['mua trên Amazon'])
  expect(found('units', '<p>Bể Aqueon 208 lít.</p>')).toEqual(['208 lít'])
  expect(found('price', '<p>Tiền ship và phí vận chuyển bằng đường hàng không từ Canada.</p>')).toEqual(['phí vận chuyển'])
})

test('a sentence opening on "mình" and a verb is the writer\'s voice; a fish\'s body is not', () => {
  expect(found('source', '<p>Không biết cá bị gì. Mình chỉ thấy cá có gì đó không ổn.</p>')).toEqual(['Mình chỉ'])
  expect(found('source', '<p>Thân dài. Mình cá dẹp, cá cọ mình vào đá.</p>')).toEqual([])
})

test('a language\'s own words for the source count only in that language', () => {
  expect(found('source', '<p>Loài này mang tên Kami.</p>')).toEqual([])
  expect(found('source', '<p>Kami menyarankan pakan hidup.</p>', { lang: 'id' })).toEqual(['Kami'])
  expect(found('source', '<p>Kami mengesyorkan makanan hidup.</p>', { lang: 'ms' })).toEqual(['Kami'])
})

test('what only looks like a hit is not one', () => {
  // The river, a fish called a dollar, a temperature, an author in taxonomy, a dose's own volume.
  for (const html of ['<p>Cá sống ở lưu vực Amazon, trên sông Amazon.</p>', '<p>Cá đô la và cá silver dollar ăn cây.</p>', '<p>Giữ nước 25 độ C, 19 đến 26 độ.</p>', '<p>Các tác giả xếp loài này vào họ khác.</p>']) {
    expect(fitRules(page(html)).filter(f => f.check !== 'words')).toEqual([])
  }
  expect(found('units', '<p>Dùng 5 ml cho mỗi 38 lít nước.</p>')).toEqual([])
  expect(found('units', '<p>Bể 40 lít là đủ.</p>')).toEqual([])
  expect(found('units', '<p>1 sendok teh per 19–38 liter.</p>', { lang: 'id' })).toEqual([]) // a dose's range
  // A product sold here is no finding, in product or in dose.
  expect(checks('<p>Dùng 5 ml Seachem Prime.</p>').filter(c => c === 'product' || c === 'dose')).toEqual([])
})

test('a page\'s reader decides: a Vietnamese shop or price is foreign in Indonesian, and a product with no data is "market unknown"', () => {
  const id = { lang: 'id' as const, path: '/id/panduan/g/' }
  expect(found('price', '<p>Sebotol 3.000 đồng.</p>', id)).toEqual(['3.000 đồng'])
  expect(found('shop', '<p>Beli di Pharmacity.</p>', id)).toEqual(['Pharmacity'])
  expect(found('price', '<p>Một chai 3.000 đồng.</p>')).toEqual([])
  expect(fitRules(page('<p>Pakai Seachem Prime.</p>', id)).find(f => f.check === 'product')?.why).toContain('market unknown')
  expect(fitPrompt('id')).toContain('Pharmacity')
  expect(fitPrompt('vi')).not.toContain('Pharmacity')
})

test('Thai: no spaces between words', () => {
  const th = { lang: 'th' as const, path: '/th/guides/g/' }
  expect(found('source', '<p>ในวิดีโอแนะนำให้ใช้</p>', th)).toEqual(['ในวิดีโอ'])
  expect(found('units', '<p>ตู้ขนาด 10 แกลลอน</p>', th)).toEqual(['แกลลอน'])
  expect(found('units', '<p>ตู้ขนาด 38 ลิตร</p>', th)).toEqual(['38 ลิตร'])
})

test('the page\'s text leaves out captions and reference lists, and its hash follows its text', () => {
  const p = page('<p>Một.</p>', { captions: [{ url: 'u', caption: '29-Gallon Aquariums - Aquarium Co-Op' }], fields: [{ field: 'body', html: '<p>Một.</p>' }, { field: 'sections.references:sf', html: '<p>Petco 2001.</p>' }] })
  expect(fitText(p).text).not.toMatch(/Gallon|Petco/)
  expect(fitRules(p)).toEqual([])
  expect(fitText(p).hash).not.toBe(fitText(page('<p>Hai.</p>')).hash)
})

test('a model\'s finding holds only with a quote on the page, not taken back, and no dose tied to what\'s sold here', () => {
  const f = (o: object) => ({ check: 'elsewhere', part: 'P1', quote: 'nước máy ở Mỹ', why: 'American tap water', ...o })
  const text = 'Vì nước máy ở Mỹ có chloramine. 5 ml Seachem Prime cho 40 lít.'
  expect(keepFit([f({})], text, 'vi').map(x => x.quote)).toEqual(['nước máy ở Mỹ'])
  expect(keepFit([f({ quote: 'câu không có trên trang' })], text, 'vi')).toEqual([])
  expect(keepFit([f({ why: 'so it is not an error' })], text, 'vi')).toEqual([])
  expect(keepFit([f({ check: 'made-up' })], text, 'vi')).toEqual([])
  expect(keepFit([f({ check: 'dose', quote: '5 ml Seachem Prime', product: 'Seachem Prime' })], text, 'vi')).toEqual([])
  expect(keepFit([f({ check: 'dose', quote: '5 ml Seachem Prime', product: 'Seachem Prime' })], text, 'id').length).toBe(1)
})

test('whether a product is sold is the table\'s call, never the model\'s', async () => {
  expect(productOf('Maracyn 2', 'vi')?.status).toBe('sold')
  expect(productOf('Maracyn', 'vi')?.status).toBe('hard')
  expect(productOf('Hikari', 'vi')).toBeUndefined()
  const llm = (async () => ({ findings: [], products: ['Ich-X', 'Seachem Prime', 'Hikari'] })) as Llm
  const p = page('<p>Một.</p>')
  const e = await readFit(llm, p, 'haiku', new Date('2026-11-08'))
  expect(e).toMatchObject({ at: '2026-11-08', model: 'haiku', products: ['Ich-X', 'Seachem Prime', 'Hikari'] })
  expect(fitFindings(p, e).map(f => [f.check, f.quote])).toEqual([['product', 'Ich-X']])
})

test('a run reads what\'s due in a random order, saves, keeps its place, and stops when the accounts are out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fit-'))
  const file = join(dir, 'fit.json')
  const pages = ['a', 'b', 'c', 'd'].map(id => page(`<p>${id}</p>`, { id }))
  expect(fitOrder(pages).map(p => p.id)).toEqual(fitOrder([...pages].reverse()).map(p => p.id))
  let calls = 0
  const ok = (async () => { calls++; return { findings: [], products: [] } }) as Llm
  expect((await runFit(pages, file, { llm: ok, limit: 3, jobs: 1 })).report).toMatchObject({ read: 3, left: 1 })
  expect((await runFit(pages, file, { llm: ok, jobs: 1 })).report).toMatchObject({ read: 1, left: 0 })
  expect((await runFit(pages, file, { llm: ok, jobs: 1 })).report.read).toBe(0)
  expect(calls).toBe(4)
  expect(Object.keys(JSON.parse(await readFile(file, 'utf8')))).toEqual(['vi/guides/a', 'vi/guides/b', 'vi/guides/c', 'vi/guides/d'])
  const out = (async () => { throw new LlmError('usage limit reached') }) as Llm
  const other = await runFit([page('<p>e</p>', { id: 'e' }), page('<p>f</p>', { id: 'f' })], join(dir, 'other.json'), { llm: out, jobs: 1 })
  expect(other.report.stopped).toContain('limit')
  expect(other.report.left).toBe(2)
})

test('a guide read with an older checklist is read again; another page is not, until its text changes', () => {
  const g = page('<p>g</p>'), s = page('<p>s</p>', { kind: 'species', id: 's' })
  const old = (p: Page) => ({ at: '2026-11-07', hash: fitText(p).hash, model: 'opus', findings: [], products: [] })
  expect(fitDue([g, s], { [fitKey(g)]: old(g), [fitKey(s)]: old(s) }).map(p => p.id)).toEqual(['g'])
  expect(fitDue([g], { [fitKey(g)]: { ...old(g), checklist: CHECKLIST } })).toEqual([])
})

test('the report counts and never lists a page', () => {
  const a = page('<p>Mua trên Amazon.</p>', { id: 'a-secret-slug' })
  const entry = { at: '2026-11-08', hash: fitText(a).hash, model: 'm', findings: [], products: ['Hikari', 'hikari', 'Ich-X'] }
  const md = fitReport([a], { 'vi/guides/a-secret-slug': entry })
  expect(md).toContain('| Vietnamese | 1 | 1 | 1 | 1 | 1 |') // its product and its shop
  expect(md).toContain('- hikari: 1') // a product to look up next
  expect(md).not.toContain('a-secret-slug')
  expect(md).not.toContain('ich-x')
})

test('the counts: pages with a finding by check, and in all with words apart', () => {
  const a = page('<p>Mua trên Amazon. Dù vậy vẫn được.</p>', { id: 'a' })
  const b = page('<p>Dù vậy vẫn được.</p>', { id: 'b' })
  const c = page('<p>Ổn.</p>', { id: 'c' })
  const words = { check: 'words' as const, part: 'P1', quote: 'Dù vậy', why: 'x', by: 'model' as const }
  const entry = (p: Page) => ({ at: '2026-11-08', hash: fitText(p).hash, model: 'm', findings: [words], products: [] })
  const n = fitCounts([a, b, c], { 'vi/guides/a': entry(a), 'vi/guides/b': entry(b) }, 'vi')
  expect(n).toMatchObject({ pages: 3, read: 2, wrongReader: 1, by: { shop: 1, words: 2, price: 0 } })
})

const dose = (o: Partial<FitDose> = {}): FitDose => ({ treatment: 'hydrogen peroxide', strength: '3%', amount: 3, amountMax: 0, unit: 'ml', per: 4, perUnit: 'litre', use: 'cyanobacteria', method: 'spot', quote: '3 ml cho mỗi 4 lít', ...o })
const dosed = (id: string, doses: FitDose[]) => {
  const p = page(`<p>${doses.map(d => d.quote).join('. ')}.</p>`, { id })
  return { p, e: { at: '2026-11-08', hash: fitText(p).hash, model: 'm', findings: [], products: [], doses } }
}
const state = (xs: ReturnType<typeof dosed>[]) => Object.fromEntries(xs.map(x => [fitKey(x.p), x.e]))

test('a sample can find the pages with a dose by their words', () => {
  expect(hasDose(page('<p>Dùng 3 ml cho mỗi 4 lít nước.</p>'))).toBe(true)
  expect(hasDose(page('<p>Dùng 3 ml cho mỗi 4 lít nước.</p>'))).toBe(true) // twice: the pattern keeps no place
  expect(hasDose(page('<p>Bể 40 lít, cá 3 cm.</p>'))).toBe(false)
})

test('the helper\'s three oxy già doses: each for its own thing stands, the same thing at another rate is a conflict, nothing is averaged', () => {
  const bga = dosed('bga', [dose()])
  const bba = dosed('bba', [dose({ amount: 1, per: 2, use: 'algae', quote: '1 ml cho mỗi 2 lít' })])
  const tank = dosed('tank', [dose({ amount: 2, per: 5, use: 'algae', method: 'wholeTank', quote: '2 ml cho 5 lít' })])
  const pages = [bga, bba, tank]
  expect(doseGroups(pages.map(x => x.p), state(pages))[0]).toMatchObject({ treatment: 'hydrogen peroxide', strength: '3%', conflicts: [] })
  const other = dosed('other', [dose({ amount: 1, per: 4, quote: '1 ml cho mỗi 4 lít' })])
  const all = [...pages, other]
  expect(doseGroups(all.map(x => x.p), state(all))[0]!.conflicts).toEqual([['vi/guides/bga', 'vi/guides/other']])
  // Both pages count, by language; the report says the rates and never a figure of its own.
  expect(fitCounts(all.map(x => x.p), state(all), 'vi').by['dose-conflict']).toBe(2)
  const md = fitReport(all.map(x => x.p), state(all))
  expect(md).toContain('hydrogen peroxide 3% — **1 conflicts**: cyanobacteria, spot: 0.75 ml/l, 0.25 ml/l (2 pages); algae, spot: 0.5 ml/l (1 pages); algae, wholeTank: 0.4 ml/l (1 pages)')
})

test('what isn\'t a conflict: another strength, a converted gallon, a page\'s own levels, a range that overlaps', () => {
  const a = dosed('a', [dose()])
  const strong = dosed('strong', [dose({ strength: '35%', amount: 1, per: 3.5, quote: '1 ml cho 3,5 lít' })])
  const gallon = dosed('gal', [dose({ per: 1, perUnit: 'gallon', quote: '3 ml per 1 gallon' })])
  const range = dosed('range', [dose({ amount: 0.5, amountMax: 1, per: 1, quote: '0,5 đến 1 ml cho 1 lít' })])
  const all = [a, strong, gallon, range]
  expect(doseGroups(all.map(x => x.p), state(all)).flatMap(g => g.conflicts)).toEqual([])
  const levels = dosed('levels', [dose({ amount: 1, per: 4, quote: '1 ml cho 4 lít' }), dose({ amount: 3, per: 4, quote: '3 ml cho 4 lít' })])
  expect(doseGroups([levels.p, a.p], state([levels, a])).flatMap(g => g.conflicts)).toEqual([])
})

test('a fish\'s own water and an unnamed use are not a treatment: a brackish fish and a killifish both stand', () => {
  const salt = (o: Partial<FitDose>) => dose({ treatment: 'salt', strength: '', unit: 'g', perUnit: 'litre', per: 1, method: 'wholeTank', ...o })
  const mono = dosed('mono', [salt({ use: 'water', amount: 10, amountMax: 15, quote: '10–15 g muối cho mỗi lít' })])
  const killi = dosed('killi', [salt({ use: 'water', amount: 1, amountMax: 3, quote: '1–3 g muối cho mỗi lít' })])
  const brine = dosed('brine', [salt({ use: 'other', amount: 30, quote: '30 g muối mỗi lít' })])
  const tonic = dosed('tonic', [salt({ use: 'other', amount: 2, quote: '2 g muối mỗi lít' })])
  expect(doseGroups([mono, killi, brine, tonic].map(x => x.p), state([mono, killi, brine, tonic])).flatMap(g => g.conflicts)).toEqual([])
  // The same treatment for the same thing still is one.
  const f1 = dosed('f1', [salt({ use: 'fungus', amount: 1, quote: '1 g muối mỗi lít' })]), f2 = dosed('f2', [salt({ use: 'fungus', amount: 10, quote: '10 g muối mỗi lít' })])
  expect(doseGroups([f1.p, f2.p], state([f1, f2])).flatMap(g => g.conflicts)).toEqual([['vi/guides/f1', 'vi/guides/f2']])
})

test('a dose says what it\'s for: the program works that out, and the model can\'t report it itself', () => {
  const x = dosed('x', [dose({ use: '', quote: '3 ml cho mỗi 4 lít' }), dose({ method: '', amount: 5, quote: '5 ml cho mỗi 4 lít' })])
  expect(fitFindings(x.p, x.e).filter(f => f.check === 'dose-purpose').map(f => f.quote)).toEqual(['3 ml cho mỗi 4 lít'])
  expect(keepFit([{ check: 'dose-purpose', part: 'P1', quote: 'x', why: 'y' }], 'x', 'vi')).toEqual([])
})

test('a dose counts only with its own figures in its own words: no number is the model\'s', () => {
  const text = 'Dùng 3 ml cho mỗi 4 lít, hoặc 0,5 ml cho 1 lít.'
  expect(keepDoses([dose()], text).length).toBe(1)
  expect(keepDoses([dose({ amount: 7 })], text)).toEqual([]) // a figure not in its quote
  expect(keepDoses([dose({ quote: '9 ml cho mỗi 4 lít', amount: 9 })], text)).toEqual([]) // not on the page
  expect(keepDoses([dose({ amount: 0.5, per: 1, quote: '0,5 ml cho 1 lít' })], text).length).toBe(1)
})

test('a caution the source gives and the page leaves out is flagged; one on the page, or not in the source, is not', async () => {
  const text = '3 ml cho mỗi 4 lít. Cẩn thận với tép.'
  const source = 'It can burn gills. Shrimp will die above this dose.'
  const c = (o: object) => ({ doseQuote: '3 ml cho mỗi 4 lít', sourceQuote: 'Shrimp will die above this dose.', animals: 'shrimp', onPage: false, pageQuote: '', ...o })
  expect(keepCautions([c({})], text, source).map(f => f.check)).toEqual(['dose-caution'])
  expect(keepCautions([c({ onPage: true, pageQuote: 'Cẩn thận với tép.' })], text, source)).toEqual([])
  expect(keepCautions([c({ sourceQuote: 'Made up.' })], text, source)).toEqual([])
  // The model says it's on the page and can't quote it: that isn't on the page.
  expect(keepCautions([c({ onPage: true, pageQuote: 'không có câu này' })], text, source).length).toBe(1)
  const llm = (async (a: { schema: { properties: Record<string, unknown> } }) => a.schema.properties.cautions ? { cautions: [c({})] } : { findings: [], products: [], doses: [dose()] }) as unknown as Llm
  const p = page(`<p>${text}</p>`)
  const read = await readFit(llm, p, 'm', new Date('2026-11-08'), source)
  expect(read).toMatchObject({ sourceRead: true, findings: [{ check: 'dose-caution' }] })
  // No source kept: it can't be told, and the report says how many.
  expect(await readFit(llm, p, 'm', new Date('2026-11-08'))).toMatchObject({ sourceRead: false, findings: [] })
  // No dose: no second call.
  let calls = 0
  const none = (async () => { calls++; return { findings: [], products: [], doses: [] } }) as Llm
  await readFit(none, p, 'm', new Date('2026-11-08'), source)
  expect(calls).toBe(1)
})
