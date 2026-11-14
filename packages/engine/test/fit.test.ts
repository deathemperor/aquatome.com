import { expect, test } from 'vitest'
import { CHECKLIST, dealerNotice, doseGroups, fitCounts, fitDue, fitFindings, fitKey, fitOrder, fitPrompt, fitReport, fitRules, fitText, hasDose, keepCautions, keepDoses, keepFit, productOf, readFit, runFit, type FitCheck, type FitDose } from '../src/fit'
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

test('harmful doses as other pages write them; and what is not one: a water change, another medicine\'s ppm, a stock solution, another line', () => {
  const harm = (html: string, lang: Page['lang'] = 'vi') => found('harm', html, { lang })
  for (const [html, lang] of [
    // A salt dip by g/L or ‰, the time first, an hour as "tiếng" or "ชม."
    ['<p>Tắm muối 30 g/L trong 20 phút.</p>', 'vi'],
    ['<p>Ngâm 20–30‰ trong 15–30 phút.</p>', 'vi'],
    ['<p>Tắm cá 15–30 phút trong nước muối 2–3%.</p>', 'vi'],
    ['<p>Rendam ikan 15 menit dalam larutan garam 3%.</p>', 'id'],
    ['<p>Tắm muối 2% trong 1 tiếng.</p>', 'vi'],
    ['<p>แช่เกลือ 3% นาน 1 ชม.</p>', 'th'],
    // Grams per litre with other joining words, or the medicine after the unit; local spellings.
    ['<p>Pha kanamycin 2 g cho 1 lít nước.</p>', 'vi'],
    ['<p>Hòa 0,8 g quinine trong 1 lít.</p>', 'vi'],
    ['<p>Larutkan kanamisin 2 gram dalam 1 liter.</p>', 'id'],
    ['<p>ควินิน 0.8 กรัมต่อน้ำ 1 ลิตร</p>', 'th'],
    ['<p>Ngâm 2–5 g/L kanamycin.</p>', 'vi'],
    ['<p>คานามัยซิน 2–5 กรัมต่อลิตร</p>', 'th'],
    ['<p>Rendam kanamisin 2–5 g/L.</p>', 'id'],
    // Copper as a formula, a table cell, another name; a chelate named in another clause.
    ['<p>Dùng CuSO4 1,5 ppm.</p>', 'vi'],
    ['<p>Cho 2 mg/L CuSO4 vào bể.</p>', 'vi'],
    ['<p>Cu 1,5 ppm là đủ.</p>', 'vi'],
    ['<p>Đồng sunphat 1,5 ppm.</p>', 'vi'],
    ['<p>Sunfat đồng 1,5–2 ppm.</p>', 'vi'],
    ['<table><tr><td>Đồng</td><td>1,5–2 ppm</td></tr></table>', 'vi'],
    ['<p>จุนสี 1.5 ppm</p>', 'th'],
    ['<p>Đồng chelate an toàn hơn; còn đồng sunfat thì giữ 1,5–2 ppm.</p>', 'vi'],
    // One table row, or list item, can't lend the one after it a label.
    ['<table><tr><td>Thuốc tím</td><td>theo nhãn</td></tr><tr><td>Đồng sunfat</td><td>2 ppm</td></tr></table>', 'vi'],
    ['<ul><li>Xanh methylen: theo nhãn</li><li>Đồng sunfat: 2 ppm</li></ul>', 'vi'],
    // A strength given in both units, either first; "hingga" brings the water to a strength, it's no bound.
    ['<p>Tắm muối 3% (khoảng 30 g/L) trong 20 phút.</p>', 'vi'],
    ['<p>Tắm muối 30 g/L (3%) trong 20 phút.</p>', 'vi'],
    ['<p>Rendam garam 3% (30 g/L) selama 20 menit.</p>', 'id'],
    ['<p>แช่เกลือ 3% (30 กรัมต่อลิตร) นาน 20 นาที</p>', 'th'],
    ['<p>Tambahkan garam hingga 3%, rendam 30 menit.</p>', 'id'],
    // A medicine a word after its unit; "vào", "ในน้ำ"; other spellings.
    ['<p>Pha 2 g/lít xanh methylen để ngâm cá.</p>', 'vi'],
    ['<p>Hòa 1 g kanamycin vào 1 lít nước.</p>', 'vi'],
    ['<p>ละลายควินิน 1 กรัมในน้ำ 1 ลิตร</p>', 'th'],
    ['<p>ฟอร์มาลีน 2 กรัมต่อลิตร</p>', 'th'],
    ['<p>Rendam dengan formol 2 g/L.</p>', 'id'],
    // Copper as Vietnamese keepers name it, beside the words "đồng" also is.
    ['<p>Ion đồng 1,5 ppm.</p>', 'vi'],
    ['<p>Giữ nồng độ đồng 1,5–2 ppm trong 14 ngày.</p>', 'vi'],
  ] as const) expect(harm(html, lang), html).toHaveLength(1)
  for (const [html, lang] of [
    ['<p>Sau khi tắm muối, thay 30% nước sau 24 giờ.</p>', 'vi'],
    ['<p>Setelah perawatan garam, ganti 30% air setiap 24 jam.</p>', 'id'],
    ['<p>หลังแช่เกลือ เปลี่ยนน้ำ 30% ทุก 24 ชั่วโมง</p>', 'th'],
    ['<p>Tắm muối giúp giảm 70% ký sinh trùng chỉ sau 30 phút.</p>', 'vi'],
    ['<p>Tép rất nhạy với thuốc đồng, nên dùng formalin 25 ppm.</p>', 'vi'],
    ['<p>Udang sensitif terhadap tembaga, jadi gunakan formalin 15–25 ppm.</p>', 'id'],
    ['<p>Đồng sunfat độc với tép, nên thay bằng thuốc tím 2 ppm.</p>', 'vi'],
    ['<p>Nồng độ đồng đều trong bể, giữ 2 ppm thuốc tím.</p>', 'vi'],
    ['<p>Xanh methylen bán ở dạng dung dịch 1% (10 g/L), dùng 2 ml cho 10 lít.</p>', 'vi'],
    ['<p>Formalin là dung dịch formaldehyde 37% (khoảng 370 g/L), dùng theo nhãn.</p>', 'vi'],
    ['<p>Thuốc tím: pha dung dịch gốc 10 g/L rồi lấy 1 ml cho 5 lít.</p>', 'vi'],
    ['<ul><li>Kanamycin: liều theo nhãn</li><li>Baking soda 1 g/L</li></ul>', 'vi'],
    ['<p>Hidrasi kista dulu selama sekitar 1 jam dalam air dengan kadar garam di bawah 100 g/l, diaerasi.</p>', 'id'],
    ['<p>ผสมเกลือ: สูตรหลักคือเกลือเม็ดไม่เสริมไอโอดีน 30 กรัมต่อน้ำ 1 ลิตร เปิดลมไว้ราว 24 ชั่วโมงให้ไข่อาร์ทีเมียฟัก</p>', 'th'],
    ['<p>จุ่มเกลือ 30–35 g/L นาน 3–5 นาที ถ้าอาการไม่เฉียบพลัน แช่เกลือเจือจาง 5 g/L นาน 90 นาที</p>', 'th'],
    ['<p>เริ่มจากละลายเกลือไม่เสริมไอโอดีนประมาณ 30 กรัมต่อน้ำ 1 ลิตร ใส่ไข่ในปริมาณพอดี คุมอุณหภูมิราว 25–28 °C แล้วรอ 20–24 ชั่วโมง</p>', 'th'],
    // "Đồng" is also together, a field, a fellow, the currency and a province.
    ['<p>Cộng đồng người chơi cá dĩa giữ nitrat dưới 20 ppm.</p>', 'vi'],
    ['<p>Cá rô đồng sống tốt ở TDS 50–300 ppm.</p>', 'vi'],
    ['<p>Cá ăn thịt đồng loại khi nitrat lên 40 ppm.</p>', 'vi'],
    ['<p>Bút đo giá 150 nghìn đồng đo tới 100 ppm.</p>', 'vi'],
    ['<p>Ở Đồng Tháp, nước kênh có TDS 200 ppm.</p>', 'vi'],
    // A tank's salinity, beside its hours of light.
    ['<p>Độ mặn 10–20‰, chiếu sáng 8–10 giờ mỗi ngày.</p>', 'vi'],
    ['<p>ความเค็ม 25 ppt เปิดไฟ 8 ชั่วโมง</p>', 'th'],
    // The dip's own time, not the wait after it, a fast before it or a repeat.
    ['<p>Tắm muối 2% trong 5–10 phút, lặp lại sau 24 giờ nếu cần.</p>', 'vi'],
    ['<p>Tắm muối 2% trong 5 phút rồi theo dõi cá 24 giờ.</p>', 'vi'],
    ['<p>Rendam garam 2% selama 5 menit, ulangi setelah 24 jam.</p>', 'id'],
    ['<p>Cho cá nhịn ăn 24 giờ, rồi tắm muối 2% trong 5 phút.</p>', 'vi'],
    ['<p>Tắm muối 3%, lặp lại sau 24 giờ.</p>', 'vi'],
    // A water change, or what a share of the parasites does, after a salt word.
    ['<p>Sau khi tắm muối, thay 10% lượng nước sau 24 giờ.</p>', 'vi'],
    ['<p>Setelah perawatan garam, ganti air 10% setiap 24 jam.</p>', 'id'],
    ['<p>Setelah mandi garam, ganti 10% volume air setiap 24 jam.</p>', 'id'],
    ['<p>หลังแช่เกลือ เปลี่ยนน้ำ 10% ทุก 24 ชั่วโมง</p>', 'th'],
    ['<p>Tắm muối giúp diệt 5% ký sinh trùng sau 30 phút.</p>', 'vi'],
    // A stock solution named after its strength.
    ['<p>Hòa 1 g metronidazole trong 1 lít nước, rồi lấy 10 ml cho mỗi 40 lít.</p>', 'vi'],
    ['<p>Larutkan 1 g metronidazol dalam 1 liter air sebagai larutan stok.</p>', 'id'],
    // A table row's first cell names its copper's type for the whole row.
    ['<table><tr><td>Kuprum terkelat (chelated copper)</td><td>Ikut label produk yang dibeli. Penternak itu menyasarkan kira-kira 1.5–2.0 ppm kuprum.</td></tr></table>', 'ms'],
  ] as const) expect(harm(html, lang), html).toEqual([])
})

test('three reviews\' sentences, in four languages: each harmful dose is found, and none of the rest', async () => {
  // Days and overnight are no dip's time: a marine tank's salt left to mix, gravel soaked, would be held.
  const cases: { harm: boolean; lang: Page['lang']; html: string }[] = JSON.parse(await readFile(new URL('./harm-cases.json', import.meta.url), 'utf8'))
  expect(cases.length).toBeGreaterThan(300)
  for (const c of cases) expect(found('harm', c.html, { lang: c.lang }).length > 0, `${c.lang} ${c.html}`).toBe(c.harm)
})

test('a fact\'s source number copied into the text is found; a count of sources or a table of them is not', () => {
  const id = { lang: 'id' as const }, ms = { lang: 'ms' as const }, th = { lang: 'th' as const }
  expect(found('source', '<p>Yang paling sering ditemukan adalah Lernaea cyprinacea (sumber 8).</p>', id)).toEqual(['(sumber 8)'])
  expect(found('source', '<p>Penyakit bintik putih dan Costia (sumber 2, 3, 9).</p>', id)).toEqual(['(sumber 2, 3, 9)'])
  expect(found('source', '<p>Sumber 0 menyebut parasit ini memerlukan cahaya.</p><ul><li>Sumber 1: suhu tinggi mempercepat kitaran hidup.</li></ul>', ms)).toEqual(['Sumber 0', 'Sumber 1'])
  expect(found('source', '<p>รักษาแยกจากตู้หลัก (แหล่งที่ 3)</p><p>แหล่งที่ 2 ระบุว่าปรสิตต้องใช้แสง</p>', th)).toEqual(['(แหล่งที่ 3)', 'แหล่งที่ 2'])
  expect(found('source', '<p>Cá bị nấm thứ phát (nguồn 4). Nguồn 1 cho rằng muối giúp được.</p>')).toEqual(['(nguồn 4)', 'Nguồn 1'])
  expect(found('source', '<p>Dua sumber memberi 22–28 °C, satu sumber 24–29 °C.</p>', ms)).toEqual([])
  expect(found('source', '<p>Panjang ikan menurut satu sumber 4–7 cm.</p>', id)).toEqual([])
  expect(found('source', '<p>Cắm bộ đổi nguồn 12 v vào máy sục. Nguồn điện yếu thì dùng pin.</p>')).toEqual([])
  expect(found('source', '<table><tr><th>Thông số</th><th>Nguồn 1</th><th>Nguồn 2</th></tr><tr><td>nhiệt độ</td><td>24 °C</td><td>26 °C</td></tr></table>')).toEqual([])
  expect(found('source', '<table><tr><th>หัวข้อ</th><th>แหล่งที่ 1</th><th>แหล่งที่ 2</th></tr><tr><td>อุณหภูมิ</td><td>24 °C</td><td>26 °C</td></tr></table>', th)).toEqual([])
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
  expect(fitPrompt('vi')).toContain('lọc bọt biển')
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
  // Read before the harm check, a guide is read for it.
  expect(fitDue([g, s], { [fitKey(g)]: { ...old(g), checklist: 2 }, [fitKey(s)]: { ...old(s), checklist: 2 } }).map(p => p.id)).toEqual(['g'])
})

// 13 Nov 2026: AquaTome's own guide to the seasons was faulted, for a Vietnamese reader, for "Ban đêm phòng có thể xuống
// 12–14 °C" on a winter night: a winter in Hà Nội. It was kept off the Curation Lead's winter shelf for it.
test("for Vietnam the North's winter is the reader's own; a home heated as abroad still isn't", () => {
  expect(fitPrompt('vi')).toContain("For this reader the North's winter is their own (December to February: rooms at 10–15 °C at night")
  expect(fitPrompt('vi')).toContain('a furnace, radiators or central heating, a basement, snow or a frozen pond still does')
  for (const lang of ['id', 'th', 'ms'] as const) expect(fitPrompt(lang)).not.toContain("North's winter")
  for (const lang of ['vi', 'th'] as const) for (const kind of ['guides', 'cards'] as const) expect(fitPrompt(lang, kind)).not.toContain('{{CLIMATE_NOTE}}')
  // In the elsewhere check itself, after its examples.
  expect(fitPrompt('vi')).toMatch(/- elsewhere: [^\n]*phạm luật"\)\. For this reader the North's winter/)
})

test('advice that would hurt is a finding the checker keeps, and its prompt asks for it', () => {
  const text = '[P1 Bắt cá] Tăng CO₂ gấp 5 đến 10 lần và tắt lọc cho tới khi cá ngáp.'
  const harm = { check: 'harm', part: 'P1', quote: 'Tăng CO₂ gấp 5 đến 10 lần và tắt lọc', why: 'fish suffocate', fix: '', product: '' }
  expect(keepFit([harm], text, 'vi').map(x => x.check)).toEqual(['harm'])
  expect(fitPrompt('vi', 'guides')).toContain('- harm: ')
})

test('doses that need no reading to call harmful, as the guides of 8 Nov had them, in each language', () => {
  const harm = (html: string, lang: Page['lang'] = 'vi') => found('harm', html, { lang })
  // A medicine in grams per litre: named before the figure, after a salt's own figure, or between the figure and its unit.
  expect(harm('<ul><li>Kanamycin ngâm: 2–5 g/L</li></ul>')).toEqual(['Kanamycin ngâm: 2–5 g/L'])
  expect(harm('<p>Đốm trắng: pha muối 1% cùng 0.8 g quinine mỗi lít.</p>')).toHaveLength(1)
  expect(harm('<p>Bintik putih: garam 1% dengan kina 0,8 g per liter.</p>', 'id')).toHaveLength(1)
  expect(harm('<p>เกลือ 1% ร่วมกับควินิน 0.8 กรัมต่อลิตร</p>', 'th')).toHaveLength(1)
  expect(harm('<p>Sumber ini juga menyenaraikan mandian kanamycin 2–5 g/L.</p>', 'ms')).toHaveLength(1)
  // A salt dip of 2% or more over 10 minutes, in a table too.
  expect(harm('<p>Khuyến nông khuyên tắm muối 2–3% định kỳ, mỗi lần 15–20 phút.</p>')).toHaveLength(1)
  expect(harm('<table><tr><td>Tắm muối NaCl</td><td>Nồng độ 2–3% trong 15–30 phút</td></tr></table>')).toHaveLength(1)
  expect(harm('<p>Rendaman garam rutin 2–3% selama 15–20 menit.</p>', 'id')).toHaveLength(1)
  expect(harm('<p>แช่เกลือ 2–3% เป็นประจำครั้งละ 15–20 นาทีเพื่อฆ่าไข่</p>', 'th')).toHaveLength(1)
  expect(harm('<p>Tắm muối 2% trong 1 giờ.</p>')).toHaveLength(1)
  // Copper at 1 ppm or more with nothing to say which product or type it is.
  expect(harm('<p>Họ ước tính mức này vào khoảng 1,5–2,0 ppm đồng, giữ nước ấm 30 ngày.</p>')).toHaveLength(1)
  expect(harm('<p>ซึ่งร้านระบุว่าราว 1.5–2.0 ppm copper ที่อุณหภูมิ 29°C</p>', 'th')).toHaveLength(1)
  expect(harm('<p>Đồng sunfat giữ ở 1,5 ppm trong 10 ngày.</p>')).toHaveLength(1)

  // What only looks like one: a vet's dip, a salt figure, a soak for decor, a copper type or label named, a weak copper
  // level, alkalinity, "đồng ý", a word that holds "kina", a stock solution's strength, a dose in milligrams.
  for (const [html, lang] of [
    ['<p>Tắm muối 30 g/lít, từ 30 giây đến 10 phút tùy loài; cá nghiêng mình thì vớt ra ngay.</p>', 'vi'],
    ['<p>Tắm muối 3% trong 5–10 phút.</p>', 'vi'],
    ['<p>Một nghiên cứu còn thấy nâng độ mặn từ 0 lên 3 g/L làm số sán tăng. Praziquantel diệt sán trưởng thành.</p>', 'vi'],
    ['<p>Ngâm đồ trong nước muối 1–2% khoảng 10–15 phút, xả lại rồi đặt vào bể.</p>', 'vi'],
    ['<p>Dekorasi: rendam dalam air garam 2% selama 10–15 menit, bilas.</p>', 'id'],
    ['<p>Thuốc đồng: liều theo nhãn thuốc bạn mua. Mỗi loại giữ một mức riêng: đồng chelate thường 1,5–2,0 ppm, đồng sunfat thấp hơn nhiều.</p>', 'vi'],
    ['<p>Kuprum terkelat komersial pada kira-kira 5 ml bagi setiap 20 liter (sekitar 1.5–2.0 ppm kuprum).</p>', 'ms'],
    ['<p>Liều dùng là 0,15 ppm ion đồng, ngâm tối đa 10 ngày.</p>', 'vi'],
    ['<p>Đồng sunfat: không dùng khi độ kiềm dưới 50 mg/L.</p>', 'vi'],
    ['<p>คอปเปอร์ซัลเฟต: ห้ามใช้เมื่อค่าอัลคาลินิตีต่ำกว่า 50 mg/L</p>', 'th'],
    ['<p>ใส่คอปเปอร์ซัลเฟต ความเข้มข้นควรอย่างน้อย 1.5–2 mg/l แล้วกำจัดทองแดงออกก่อนปล่อยปลา</p>', 'th'],
    ['<p>Merck thì không đồng ý và ghi rằng 2 mg/L NH3 đủ giết nhiều loài cá.</p>', 'vi'],
    ['<p>Kemungkinan 3 g per liter pupuk cukup.</p>', 'id'],
    ['<p>Dung dịch 1–2,5% glutaraldehyde thường chứa 10–25 g/L.</p>', 'vi'],
    ['<p>Kanamycin 50–100 mg/L.</p>', 'vi'],
  ] as const) expect(harm(html, lang), html).toEqual([])
  // Each is held as harm: a finding of the rules', with why.
  expect(fitRules(page('<p>Kanamycin ngâm: 2–5 g/L</p>')).find(f => f.check === 'harm')).toMatchObject({ by: 'rule', why: expect.stringContaining('milligrams') })
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
  const entry = (p: Page) => ({ at: '2026-11-08', hash: fitText(p).hash, model: 'm', findings: [], products: [] })
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

test("a card's checklist: its dated sources are expected, and its own check is read on cards only", async () => {
  expect(fitPrompt('vi', 'cards')).toContain('- card: this one is a short card')
  expect(fitPrompt('vi', 'cards')).toContain('theo …, 2026')
  for (const kind of [undefined, 'guides'] as const) {
    expect(fitPrompt('vi', kind)).not.toContain('- card:')
    expect(fitPrompt('vi', kind)).not.toContain('{{CARD_NOTE}}')
  }
  const llm = (async () => ({ findings: [{ check: 'card', part: 'P1', quote: 'phát hiện', why: 'described, not discovered', fix: '', product: '' }], products: [] })) as Llm
  const card = { ...page('<p>Các nhà khoa học vừa phát hiện một loài rasbora.</p>'), kind: 'cards' as const }
  expect((await readFit(llm, card, 'm', new Date('2026-11-08'))).findings.map(f => f.check)).toEqual(['card'])
  expect((await readFit(llm, page('<p>Các nhà khoa học vừa phát hiện một loài rasbora.</p>'), 'm', new Date('2026-11-08'))).findings).toEqual([])
})

test("a test's lethal level with its figure is found on any page, in each language; a plain threshold or a disease's toll is not", () => {
  for (const [lang, s] of [
    ['vi', 'Nồng độ gây chết 50% sau 96 giờ ở cá hồi vân là 0,24–11,0 mg/L NO2-N, trong khi ở cá chép là 88,0 mg/L.'],
    ['vi', 'Ở cá chẽm, LC50 (nồng độ làm chết một nửa số cá thử nghiệm) giảm từ 274 mg/L ở 17 °C xuống còn 154 mg/L ở 27 °C.'],
    ['vi', 'Mức nhiệt làm chết một nửa số cá là 39°C.'],
    ['vi', 'Thí nghiệm cho thấy con trưởng thành chịu được pH 2,43 trong 96 giờ (ngưỡng LC50).'],
    ['vi', 'Lymnaea stagnalis (ốc ao) (LC50 > 7,9 mg N/L hay 7,9 ppm)'],
    ['id', 'Ikan air dingin seperti rainbow trout (LC50 96 jam: 0,24–11,0 mg/L NO2-N) jauh lebih peka daripada ikan mas (88,0 mg/L).'],
    ['id', 'Konsentrasi mematikan (kematian 50%) berada pada pH 5,71 dan 8,22.'],
    ['id', 'Suhu yang mematikan 50% populasi adalah 39 °C.'],
    ['ms', 'Kepekatan maut (50% kematian) adalah pada pH 5.71 dan 8.22.'],
    ['ms', 'Suhu yang membunuh 50% populasi ialah 39 °C.'],
    ['th', 'ค่าที่ทำให้ตาย 50% คือ pH 5.71 และ 8.22'],
    ['th', 'อุณหภูมิที่ทำให้ประชากรตาย 50% คือ 39 °C'],
    ['th', 'กุ้งน้ำจืดมีค่า LC50 ที่ 96 ชั่วโมงเท่ากับ 8.6 มก./ลิตร'],
    ['vi', 'The temperature lethal to 50% of the population was 39°C.'],
    ['vi', 'The lethal concentration (50% mortality) was at pH 5.71 and 8.22.'],
    ['vi', 'Its oral LD50 in rats is 300 mg/kg.'],
  ] as const) expect(found('lethal', `<p>${s}</p>`, { lang }), s).toHaveLength(1)
  for (const [lang, s] of [
    ['vi', 'Một mức đồng tương đối an toàn ở pH cao vẫn có thể thành liều gây chết khi pH thấp hơn.'],
    ['vi', 'Bệnh nhung có thể làm chết một nửa số cá trong 3 ngày nếu không chữa.'],
    ['vi', 'Trong khoa học, LC50 là nồng độ làm chết một nửa số con vật thử nghiệm.'],
    ['vi', 'About 2 mg/L of un-ionized ammonia is lethal to many fish.'],
    ['vi', 'Velvet can kill half the fish in 3 days.'],
    ['id', 'Nitrit di atas 0,1 mg/L bersifat racun.'],
    ['th', 'ปลาตายครึ่งหนึ่งภายใน 3 วัน'],
  ] as const) expect(found('lethal', `<p>${s}</p>`, { lang }), s).toEqual([])
})

test('units: a figure the page\'s English gives in metric itself isn\'t counted; one converted from US units is', () => {
  const fish = (vi: string, en: string, o: Partial<Page> = {}, field = 'sections.aquariumSize:seriouslyfish') =>
    page(vi, { kind: 'species', fields: [{ field, html: vi }], en: { [field]: en }, ...o })
  const units = (p: Page, found: { part: string; quote: string }[] = []) => fitFindings(p, { at: '2026-11-11', hash: fitText(p).hash, model: 'm', products: [], findings: found.map(f => ({ ...f, check: 'units' as const, why: 'converted', by: 'model' as const })) }).filter(f => f.check === 'units').map(f => f.quote)
  // The source's own figure, alone or beside a US one: the rule's "38 lít" and the model's quote both go.
  expect(units(fish('<p>Bể chỉ 11 lít cũng nuôi được.</p>', '<p>Kept in tanks as small as 11 litres.</p>'), [{ part: 'P1', quote: 'Bể chỉ 11 lít' }])).toEqual([])
  expect(units(fish('<p>Bể 38 lít là đủ.</p>', '<p>A 10-gallon (38 litre) tank is enough.</p>'))).toEqual([])
  expect(units(fish('<p>ลึกประมาณ 2.5–4 ซม.</p>', '<p>About 2.5–4 cm deep.</p>', { lang: 'th' }), [{ part: 'P1', quote: 'ลึกประมาณ 2.5–4 ซม.' }])).toEqual([])
  // Converted by the writer: the English has gallons or inches only, or one of the quote's figures isn't the English's.
  expect(units(fish('<p>Bể 38 lít là đủ.</p>', '<p>A 10-gallon tank is enough.</p>'))).toEqual(['38 lít'])
  expect(units(fish('<p>Nền dày 2,5–5 cm.</p>', '<p>A substrate 1–2 inches (2.5 cm) deep.</p>'), [{ part: 'P1', quote: 'Nền dày 2,5–5 cm' }])).toEqual(['Nền dày 2,5–5 cm'])
  // A US unit left on the page counts, whatever the English gives beside it.
  expect(units(fish('<p>Bể 10 gallon (38 lít).</p>', '<p>A 10-gallon (38 litre) tank.</p>'))).toEqual(['gallon'])
  // A section AquaTome wrote from many sources' facts has no English of its own: its figures still count.
  expect(units(fish('<p>Bể 38 lít là đủ.</p>', '<p>Bể 38 lít là đủ.</p>', {}, 'sections.aquariumSize:aquatome'))).toEqual(['38 lít'])
  // The same words in two parts: each part's English must give the figure, whatever part the finding names.
  const two = page('', { kind: 'species', fields: [{ field: 'sections.aquariumSize:seriouslyfish', html: '<p>Bể 38 lít.</p>' }, { field: 'sections.aquariumSize:aquariumcoop', html: '<p>Bể 38 lít.</p>' }], en: { 'sections.aquariumSize:seriouslyfish': '<p>A 10-gallon tank.</p>', 'sections.aquariumSize:aquariumcoop': '<p>A 38 litre tank.</p>' } })
  expect(units(two)).toEqual(['38 lít'])
  expect(units(two, [{ part: 'P2', quote: 'Bể 38 lít' }])).toEqual(['38 lít', 'Bể 38 lít'])
  expect(units(fish('<p>Bể 38 lít là đủ.</p>', '<p>Kept in 38 litres.</p>'), [{ part: '', quote: 'Bể 38 lít là đủ' }, { part: 'P9', quote: 'bể 40 lít' }])).toEqual(['bể 40 lít'])
  // A guide keeps its source elsewhere: still counted.
  expect(units(page('<p>Bể 38 lít là đủ.</p>'))).toEqual(['38 lít'])
})

// The 16 Vietnamese matches the chief of staff's count was checked by hand on (13 Nov 2026), as the site had them: half a
// dealer's own news, half trade history the reader keeps.
test('a dealer\'s own current batch or stock is the source check\'s; trade history stays', () => {
  const news = [
    'Dành cho khách hàng của chúng tôi: các loài này có mã 454900 (jardinii) và 454912 (leichardti) trong danh mục hàng.',
    'Sau một thời gian gián đoạn, cuối cùng cũng lại có một lô cá nhập từ Congo. Trong lô này có hai loài Distichodus rất đẹp.',
    'Một trong số đó là Poptella paraguayensis, nay đã được nhập về từ Paraguay. Đây là loài cá lớn, dài khoảng 8 cm.',
    'Gần đây có một lô cá rô leo nhập từ Bengal. Trong lô, đa số là một loài đầu to.',
    'Nhưng nếu dựa vào hoa văn ở lô cá này thì hầu như con nào cũng thuộc một loài khác nhau.',
    'Corydoras imitator hiện được nhập về từ vùng thượng nguồn sông Rio Negro ở Brazil.',
    'Bây giờ dạng thuần đã có hàng trở lại.',
    'Gần đây có một đợt nhập từ Thái Lan về vài con đực có càng to khác thường.',
    // Two more from the first run of the front list: a part that is a dealer's notice, and an import's colours.
    'Hiện ngoài tiệm có bán cá phượng hoàng bắt ngoài tự nhiên ở Venezuela.',
    'Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.',
    // And from the count on the site: a batch in, this batch's fish.
    'Mới đây có một lô lớn Corydoras burgessi về, toàn cá trưởng thành.',
    'Đợt này về rất nhiều loài đẹp, trong đó có những loài rất hiếm.',
    'Cá trong lô nhập về dài 14-18 cm. Lô này chỉ có 7 con.',
    'Tên cũ cũng để chỉ ông. Hiện nay lại có cá thể hoang dã mới trưởng thành của loài này.',
    // Astra's read: a brood just in, and a wild batch just in.
    'Nhiều loài Parotocinclus họ hàng gần khá khó nuôi, nhưng lứa cá mới nhập này lại khá khỏe.',
    'Trong đợt cá hoang dã mới nhập gần đây có một con đực màu đỏ.',
    // A bare "lô này" after a sentence cut short by a genus's initial.
    'Congo có ba loài cá phổi: Protopterus aethiopicus, P. annectens và P. dolloi. Lô này có ít nhất hai loài là P. aethiopicus và P. dolloi.',
    // The batch's own fish, which the read passed on the Crenuchus guide (the chief of staff, 14 Nov 2026).
    'Những con trong lô dài khoảng 5 cm và đã phân biệt rõ đực cái.',
    'Các cá thể của đợt nhập này đều còn nhỏ.',
    'Cá trong đợt nhập hiện nay có hoa văn rất đồng đều.',
    'Những con trong đợt cá mới nhập về đều khỏe.',
  ]
  const history = [
    'Cũng có con có thêm những đốm trắng nhỏ. Hai dạng màu này có thể lẫn chung trong cùng một lô nhập.',
    'Tiệm cá bày bán quá nhiều loài, nên có những con bán khắp nơi mà người chơi lại ít để mắt tới.',
    'Lý do là màu sắc của chúng biến đổi rất nhiều, và chúng thường được nhập về lẫn lộn với nhau.',
    'Cửa hàng cá bán khá nhiều loài, nhưng nhiều loài phải đúng mùa mới có hàng.',
    'Có khi cá về tiệm chỉ vì lẫn vào lô cá khác.',
    'Năm 2002, một loài cá chì lùn màu đỏ đậm từ Peru được nhập về dưới tên Nannostomus marginatus “Purple”.',
    'Nhiều khả năng tiếng xấu đó bắt nguồn từ những thiếu sót trong các đợt nhập đầu tiên vào thập niên 1970. Cá nhập về hiện nay thì nuôi không gặp vấn đề gì cả.',
    'Ngày nay được nhập về khá đều từ nhiều nơi.',
    // The count's false hits on the site: a museum's lots, the mixed batches a fish comes in, rounds and rarity, "now
    // sold everywhere", taxa now available.
    'Ông tìm thấy hai lô mẫu ghi nhãn Badis dario từ Wynaad. Hóa ra hai lô này cùng loài với mẫu vật mới.',
    'Cá thường về lẫn trong các lô hàng trộn. Những lô này có thể có cả các loài Gastromyzon khác.',
    'Những đợt này có thể dễ dàng làm chết các con yếu hơn.',
    'Muốn cắt vòng đời thì phải làm hai đợt. Trong đợt này phân cá có thể trông lạ.',
    'Thỉnh thoảng lắm mới có một đợt cá nhập về.',
    'Loài cá tuyệt vời này bây giờ bán ở khắp nơi.',
    'Hơn nữa, hiện đã có sẵn các đơn vị phân loại danh nghĩa.',
    'Vì thế bạn sẽ phải liên tục săn loài mới để bổ sung vào danh mục hàng.',
    // A batch told with its year, or as where the type specimens came from: history, the sentence after it too.
    'Tháng 4/2002, nhà cung cấp nhận một lô Tetraodon mbu từ Cộng hòa Congo. Cá trong lô này to hơn mọi lô họ từng nhận trước đó.',
    'Bộ mẫu chuẩn dùng để mô tả loài lấy từ một lô cá hoang dã nhập từ Peru về Đức. Sau đó, công ty nhập lô cá này ra thông báo rằng cá được bắt ở Saramirisa.',
    'Hiện nay lại có ý kiến cho rằng đây là một loài riêng.',
    // A keeper's own plants (Astra's read), and a shop putting a new brood in with the old.
    'Cây ở lô này nằm ngoài nước khá lâu và được cất trong tủ lạnh trước khi trồng.',
    'Đến đó, nhân viên tiệm lại thả lứa mới về chung với đàn cũ chưa bán hết.',
    // A dated batch with a quoted question inside its sentence: still one sentence, its year still read (Astra's read).
    'Năm 2002, nhà cung cấp hỏi “Có cá không?” rồi nhận một lô. Cá trong lô này rất lớn.',
    'Năm 2002, một lô cá do ông A. Werner nhập về. Cá trong lô này rất lớn.',
    // Fish that come in other batches or mixed ones, a museum's lots, a round of treatment: not this batch's fish.
    'Đôi khi có vài con trong lô cá khác.',
    'Những con trong lô hàng trộn thường nhỏ hơn.',
    'Những con trong lô mẫu ở bảo tàng đều là cá cái.',
    'Các con trong đợt điều trị đều khỏe lại.',
    // A spawning, a migration, another import lot (Grok's read).
    'Những con trong đợt cá đẻ đều là cá bột.',
    'Cá của đợt cá sinh sản đã tách riêng.',
    'Những con trong đợt mới đẻ còn rất nhỏ.',
    'Cá trong đợt vừa đẻ đang bơi.',
    'Những con trong đợt nhập cư bơi ngược sông.',
    'Có vài con trong lô nhập khác.',
  ]
  const dealer = (text: string) => fitRules(page(`<p>${text}</p>`, { kind: 'species' })).filter(f => f.check === 'source' && f.why.startsWith('a dealer'))
  for (const t of news) expect(dealer(t).length, t).toBeGreaterThan(0)
  for (const t of history) expect(dealer(t), t).toEqual([])
  // Wholly a notice, each sentence one (two of the four such parts on the site on 13 Nov); a notice beside a fact, or a
  // dated batch, isn't.
  for (const t of ['<p>Hiện ngoài tiệm có bán cá phượng hoàng bắt ngoài tự nhiên ở Venezuela.</p>', '<p>Gần đây có một đợt nhập từ Thái Lan về vài con đực có càng to khác thường.</p>', '<p>Lô này chỉ có 7 con.</p><p>Mới đây có một lô lớn Corydoras burgessi về.</p>']) expect(dealerNotice(t), t).toBe(true)
  for (const t of ['<p>Loài này rất gần với B. brigittae. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>', `<p>${history[8]}</p>`, '<p>Cá chuột hiền.</p>', '', '<p>Cá cần nước mềm… Lô này chỉ có 7 con.</p>', '<p>Người ta gọi nó là “cá chuột.” Lô này chỉ có 7 con.</p>', '<p>Lô này chỉ có 7 con. pH phù hợp là 6–7.</p>', '<p>Lô này chỉ có 7 con; loài này cần nước mềm và pH 6–7.</p>', '<p>Lô này chỉ có 7 con, loài này cần nước mềm.</p>', '<p>Lô này chỉ có 7 con, chúng cần nước mềm và chua.</p>',
    // Every comma ends a clause, so the ram's notice that goes on about its batch after one stays too, to be rewritten.
    '<p>Hiện ngoài tiệm có bán cá phượng hoàng bắt ngoài tự nhiên ở Venezuela, con nào cũng đã lớn hẳn.</p>',
    // Cut at every stop, so a notice cut in two by a quoted question or an initial stays too: unsure, nothing comes off.
    '<p>Lô này gồm cá mang nhãn “dolloi?” với 7 con.</p>', '<p>Lô này chỉ có 7 con P. dolloi.</p>']) expect(dealerNotice(t), t).toBe(false)
  // Its quote is the words that say it, so the rewrite takes only the sentence they're in.
  expect(dealer(news[6]!).map(f => f.quote)).toEqual(['đã có hàng trở lại'])
  // The keeper's plants under a heading that says they came in weak, as the video's guide has them.
  expect(fitRules(page('<h3>Cây về yếu thì chuyện gì đã xảy ra</h3><p>Cây ở lô này nằm ngoài nước khá lâu và được cất trong tủ lạnh trước khi trồng.</p>', { kind: 'species' })).filter(f => f.why.startsWith('a dealer'))).toEqual([])
  // Only Vietnamese, for now.
  expect(fitRules(page('<p>Bây giờ dạng thuần đã có hàng trở lại.</p>', { lang: 'id', path: '/id/panduan/g/' })).filter(f => f.why.startsWith('a dealer'))).toEqual([])
})

// The Writing Lead, 14 Nov 2026: the glowlight tetra's "Lá dẻ gai hay lá sồi đều dùng được" passed the read.
test('the elsewhere check names leaves and wood keepers here don\'t buy or gather, and nothing to use instead', () => {
  expect(fitPrompt('vi')).toMatch(/- elsewhere: [^\n]*Leaves, wood and other things for the tank that keepers in Vietnam don't buy or gather, such as beech or oak leaves and wood from European trees: an elsewhere finding\. Quote the words\. Not:/)
  // Nothing to use instead: a writer given "lá bàng" would say what the source didn't (the Writing Lead).
  expect(fitPrompt('vi')).not.toContain('lá bàng')
  // It names Vietnam and what keepers there use: no other language's reader is judged by it (Astra's read).
  for (const lang of ['id', 'th', 'ms'] as const) {
    expect(fitPrompt(lang), lang).not.toContain('Leaves, wood and other things')
    expect(fitPrompt(lang), lang).not.toContain('{{LEAVES_NOTE}}')
  }
})

// The chief of staff, 14 Nov 2026: on a guide written from the video above it, the video's build told as a worked example
// that names its own size and figures is the guide's own, not the source talking (the Writing Lead's words).
test('a video guide\'s read takes the video\'s build told as a worked example; no other page\'s does', () => {
  expect(fitPrompt('vi', 'guides', true)).toContain('On a guide written from the video above it: the video\'s build written as an example that names its own size and figures ("Ví dụ, một bể dài 45 cm…"')
  expect(fitPrompt('vi', 'guides', true)).toContain('Still a finding: a first-person story, a bare "bể này", "ở đây", "lần này" or "hôm đó", "bể mẫu"')
  for (const [lang, kind, video] of [['vi', 'guides', false], ['vi', 'species', false], ['th', 'guides', true]] as const) {
    expect(fitPrompt(lang, kind, video)).not.toContain('On a guide written from the video')
    expect(fitPrompt(lang, kind, video)).not.toContain('{{VIDEO_NOTE}}')
  }
})
