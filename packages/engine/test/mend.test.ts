import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import type { FitCheck } from '../src/fit'
import { addedWords, asked, mendPart, type Dropped } from '../src/mend'
import { sentences } from '../src/sentences'

/**
 * The four parts the front list's first run didn't keep because its reviewer asked back what a reader-fit finding had
 * dropped (13 Nov 2026, engine-state/_fit-front.json): each part as the site had it, its English, the finding, and what
 * the writer made of the sentence the finding quotes (and of the one after it, where that no longer read).
 */
const CASES: { page: string; html: string; en: string; check: FitCheck; quote: string; at: number; to: string; next?: string }[] = [
  {
    page: 'species/boraras-merah dimorphism:glaser',
    html: '<p>Loài này rất gần với B. brigittae. Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>',
    en: '<p>The species is very closely related to B. brigittae. In at least some populations the females look like B. brigittae while the males look like B. merah. In the population imported now, however, both sexes appear to show B. merah colouration.</p>',
    check: 'source', quote: 'Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.', at: 3, to: '',
  },
  {
    page: 'plants/hygrophila-difformis maintenance:tropica',
    html: '<p>Cây được bán theo bó thân hoặc theo nhóm cây non gom lại bằng một chiếc kẹp. Bạn tháo kẹp ra rồi tách thành từng cây riêng.</p><p>Cần lưu ý rằng cây dạng bó hiện KHÔNG được trồng tại vườn ươm của chính nhà cung cấp. Vì thế không có gì đảm bảo cây sạch thuốc trừ sâu độc hại, và tốt nhất là KHÔNG cho thẳng vào bể có tép hay các loài cá nhạy cảm. Bạn nên để cây dạng bó trong một bể riêng, thay nước hai lần mỗi tuần, giữ như vậy 2 tuần rồi mới thả tép hoặc cá vào.</p>',
    en: '<p>A bundle of stems or young plants gathered in an anchor. Remove the anchor and split into separate plants.</p><p>Please note that bunches/bundled plants are currently NOT produced at Tropica\'s own nursery. We are unable to guarantee that they are free from harmful pesticides and thus recommend NOT putting them directly in tanks with shrimps and other delicate fish. Keep bundled plants in tanks where water is changed twice a week for 2 weeks before you add shrimps or fish.</p>',
    check: 'source', quote: 'cây dạng bó hiện KHÔNG được trồng tại vườn ươm của chính nhà cung cấp', at: 3, to: '',
    next: 'Không có gì đảm bảo cây dạng bó sạch thuốc trừ sâu độc hại, nên tốt nhất là KHÔNG cho thẳng vào bể có tép hay các loài cá nhạy cảm.',
  },
  {
    page: 'species/mikrogeophagus-ramirezi distribution:seriouslyfish',
    html: '<p>Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco. Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil. Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco.</p><p>Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.</p>',
    en: '<p>The majority of literature suggests that this species is restricted to the Venezuelan and Colombian llanos of the Río Orinoco drainage, although one of the specimens in the images is said to have been collected in the rio Purus, Brazil, an Amazon tributary located some distance from that watershed.</p><p>Type locality is \'Orinoco system, Venezuela\'.</p>',
    check: 'source', quote: 'một trong các mẫu cá trong ảnh', at: 2, to: 'Tuy vậy, có một mẫu cá được cho là bắt ở sông Purus, Brazil.',
  },
  {
    page: 'plants/vallisneria quickFacts:aquariumcoop',
    html: '<p>Vallisneria là loại cây không đòi hỏi khắt khe, có thể biến bể cá thành một khu rừng xanh tươi. Cây mọc nhanh và hấp thụ nhiều nitrat. Cây rẻ và thường có ở các cửa hàng cá với giá dưới 10 đô la.</p>',
    en: '<p>Vallisneria is an undemanding plant that can transform an aquarium into a lush jungle. It grows quickly and takes up a lot of nitrates. It is cheap and frequently found at fish stores for less than $10.</p>',
    check: 'price', quote: 'với giá dưới 10 đô la', at: 3, to: 'Cây rẻ và thường có ở các cửa hàng cá.',
  },
]

/** The writer (the quoted sentence as the case has it, and the next one said why) and a reviewer that lists the drop under finding 1. */
const llmFor = (c: (typeof CASES)[number], prompts: string[] = []) => (async ({ prompt, schema }: { prompt: string; schema: { required: string[] } }) => {
  prompts.push(prompt)
  if (schema.required.includes('sentences')) return { sentences: [{ n: c.at, vi: c.to }, ...(c.next ? [{ n: c.at + 1, vi: c.next, why: 'it said "therefore" of the sentence that went' }] : [])] }
  return { score: 0.9, notes: [], dropped: [{ sentence: c.at, finding: 1, text: c.quote }], hedges: [] }
}) as Llm

const others = (before: string, after: string, at: number[]) => {
  const a = sentences(before).filter(p => p.sentence).map(p => p.html)
  const b = sentences(after).filter(p => p.sentence).map(p => p.html)
  return { before: a.filter((_, i) => !at.includes(i + 1)), after: b }
}

test('a drop a reader-fit finding on that part names passes: the four parts the first run lost to it', async () => {
  for (const c of CASES) {
    const prompts: string[] = []
    const r = await mendPart(llmFor(c, prompts), c.html, [{ check: c.check, quote: c.quote, note: 'Write it for a keeper in Vietnam; drop what only holds abroad.' }], { en: c.en })
    if (typeof r === 'string') throw new Error(`${c.page}: ${r}`)
    expect(r.unasked, c.page).toEqual([])
    expect(r.score, c.page).toBe(0.9)
    expect(r.html, c.page).not.toContain(c.quote)
    // The reviewer is shown the finding that asks for it, and only the sentences that changed.
    expect(prompts[1], c.page).toContain(`quotes "${c.quote}"`)
    expect(prompts[1], c.page).not.toContain('Nơi thu mẫu chuẩn')
    // Every sentence but the one the finding quotes (and a neighbour said why) is as it was.
    const changed = [c.at, ...(c.next ? [c.at + 1] : [])]
    const kept = others(c.html, r.html, changed)
    for (const s of kept.before) expect(r.html, c.page).toContain(s)
  }
})

test('the same drop with no finding that asks for it fails: none on that part, or one that asks for a word or a unit', async () => {
  for (const c of CASES) {
    // The same writer and the same reviewer, but the sentence is named only by a finding that asks for another word.
    for (const check of ['words', 'units'] as const) {
      const r = await mendPart(llmFor(c), c.html, [{ check, quote: c.quote, note: 'A word keepers here don\'t use.' }], { en: c.en })
      if (typeof r === 'string') throw new Error(`${c.page}: ${r}`)
      expect(r.unasked.length, `${c.page} ${check}`).toBeGreaterThan(0)
      expect(r.notes[0], `${c.page} ${check}`).toMatch(/^Left out, and no finding asks for it to go/)
    }
    // No finding at all: nothing names the sentence, so what the reviewer lists is asked by none.
    const drop: Dropped = { sentence: c.at, finding: 1, text: c.quote }
    expect(asked(drop, []), c.page).toBe(false)
    expect(asked({ ...drop, finding: 0 }, [{ check: c.check, sentences: [c.at] }]), c.page).toBe(false)
    // A finding that asks for something to go, but in another sentence.
    expect(asked(drop, [{ check: c.check, sentences: [c.at === 1 ? 2 : 1] }]), c.page).toBe(false)
    expect(asked(drop, [{ check: c.check, sentences: [c.at] }]), c.page).toBe(true)
  }
})

test('a part that would lose every sentence isn\'t mended here: the dealer check settles it', async () => {
  const html = '<p>Hiện có cá phượng hoàng bắt ngoài tự nhiên từ Venezuela, con nào cũng đã lớn hẳn.</p>'
  const llm = (async () => ({ sentences: [{ n: 1, vi: '' }] })) as unknown as Llm
  expect(await mendPart(llm, html, [{ check: 'source', quote: 'Hiện có cá phượng hoàng', note: 'n' }])).toMatch(/every sentence would go/)
})

// Astra's read of the first draft: what a writer drops beyond what its finding asks for fails, whatever the reviewer says.
test('a word a changed sentence loses that no finding quotes or asks to go fails, though the reviewer lists nothing', async () => {
  const silent = (sentences: { n: number; vi: string }[]) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences') ? { sentences } : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  // A price finding, and the whole sentence gone with the warning in it.
  const price = await mendPart(silent([{ n: 1, vi: '' }]), '<p>Cây giá dưới 10 đô la và độc với tép. Cây mọc nhanh.</p>', [{ check: 'price', quote: 'giá dưới 10 đô la', note: 'Bỏ giá nước ngoài.' }])
  if (typeof price === 'string') throw new Error(price)
  expect(price.unasked.join(' ')).toMatch(/độc.*tép/)
  // A unit converted, and the warning gone with it.
  const units = await mendPart(silent([{ n: 1, vi: 'Cá dài 5 cm.' }]), '<p>Cá dài 2 inch và độc với tép. Cá sống theo đàn.</p>', [{ check: 'units', quote: '2 inch', note: 'Đổi sang cm.' }])
  if (typeof units === 'string') throw new Error(units)
  expect(units.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "độc với tép"'])
  // The same conversion that keeps the warning passes: the quote's words may go, and "và" only joins.
  const kept = await mendPart(silent([{ n: 1, vi: 'Cá dài 5 cm, độc với tép.' }]), '<p>Cá dài 2 inch và độc với tép. Cá sống theo đàn.</p>', [{ check: 'units', quote: '2 inch', note: 'Đổi sang cm.' }])
  if (typeof kept === 'string') throw new Error(kept)
  expect(kept.unasked).toEqual([])
})

test('a size the writer kept as it was, then put in metric by the code, is not counted as left out', async () => {
  const llm = (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences') ? { sentences: [{ n: 1, vi: 'Cá dài 2 inch.' }] } : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const r = await mendPart(llm, '<p>Cá dài 2 inch, giá 5 đô la.</p>', [{ check: 'price', quote: 'giá 5 đô la', note: 'Bỏ giá nước ngoài.' }], { metric: true })
  if (typeof r === 'string') throw new Error(r)
  expect(r.html).not.toMatch(/inch/)
  expect(r.unasked).toEqual([])
})

// Astra's read of 42eaea950: a word that says something isn't a joining word, and a neighbour may name what its pronoun
// stood for once the sentence it pointed to has gone.
test('a changed sentence that loses "bị", a pronoun, or part of a frame fails, though its reviewer lists nothing', async () => {
  const reviewer = (dropped: Dropped[]) => ({ score: 1, notes: [], dropped, hedges: [] })
  const llm = (sentences: { n: number; vi: string; why?: string }[], dropped: Dropped[] = []) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences') ? { sentences } : reviewer(dropped))) as Llm
  const reversed = await mendPart(llm([{ n: 1, vi: 'Tép con ăn cá.' }]), '<p>Tép con bị cá ăn, giá 5 đô la. Tép sống theo đàn.</p>', [{ check: 'price', quote: 'giá 5 đô la', note: 'Bỏ giá nước ngoài.' }])
  if (typeof reversed === 'string') throw new Error(reversed)
  expect(reversed.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "bị"'])
  const quote = 'Cây giá 5 đô la một bó.'
  const named = await mendPart(llm([{ n: 1, vi: '' }, { n: 2, vi: 'Cây chứa thuốc trừ sâu.', why: '"Chúng" pointed to the sentence that went' }], [{ sentence: 1, finding: 1, text: quote }]), `<p>${quote} Chúng chứa thuốc trừ sâu. Cây mọc nhanh.</p>`, [{ check: 'price', quote, note: 'Bỏ giá nước ngoài.' }])
  if (typeof named === 'string') throw new Error(named)
  // A pronoun counts like any word, even put as its noun: no rule found which noun is its own (Astra's reads, 13 Nov).
  expect(named.unasked).toEqual(['Left out of sentence 2, and no finding asks for it to go: "chúng"'])
  // Astra's read of cb1647216: a pronoun dropped with no noun in its place, and a frame half kept under a negation.
  const price = [{ check: 'price' as const, quote: 'giá 5 đô la', note: 'Bỏ giá nước ngoài.' }]
  const whose = await mendPart(llm([{ n: 1, vi: 'Cá ăn con.' }]), '<p>Cá ăn con của chúng, giá 5 đô la. Cá sống theo đàn.</p>', price)
  if (typeof whose === 'string') throw new Error(whose)
  expect(whose.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "chúng"'])
  const negated = await mendPart(llm([{ n: 1, vi: 'Không lưu ý nhiệt độ.' }]), '<p>Không cần lưu ý nhiệt độ, giá 5 đô la. Cá sống theo đàn.</p>', price)
  if (typeof negated === 'string') throw new Error(negated)
  expect(negated.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "cần"'])
  const halfKept = await mendPart(llm([{ n: 1, vi: 'Lưu ý nhiệt độ.' }]), '<p>Cần lưu ý nhiệt độ, giá 5 đô la. Cá sống theo đàn.</p>', price)
  if (typeof halfKept === 'string') throw new Error(halfKept)
  expect(halfKept.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "cần"'])
  // Astra's read of a43c68867: a word of the sentence before gained elsewhere, and a shorter frame inside a negated one.
  const elsewhere = await mendPart(llm([{ n: 2, vi: 'Cá thường ăn con.' }]), '<p>Cá thường sống theo đàn. Cá ăn con của chúng, giá 5 đô la.</p>', price)
  if (typeof elsewhere === 'string') throw new Error(elsewhere)
  expect(elsewhere.unasked).toEqual(['Left out of sentence 2, and no finding asks for it to go: "chúng"'])
  const inside = await mendPart(llm([{ n: 1, vi: 'Không cần nhiệt độ cao.' }]), '<p>Không cần lưu ý rằng nhiệt độ cao, giá 5 đô la. Cá sống theo đàn.</p>', price)
  if (typeof inside === 'string') throw new Error(inside)
  expect(inside.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "lưu ý"'])
  // A phrase from the sentence before put in the pronoun's place: "Chỉ những cây này" adds that no other plant has it.
  const scoped = await mendPart(llm([{ n: 1, vi: 'Chỉ những cây này chứa thuốc trừ sâu.' }]), '<p>Chúng chứa thuốc trừ sâu, giá 5 đô la. Cá sống theo đàn.</p>', price)
  if (typeof scoped === 'string') throw new Error(scoped)
  expect(scoped.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "chúng"'])
  // Astra's read of 3cf526b4e: the quote and the reviewer's drop of it cover its words once, so a second "không" counts.
  const notice = 'Chúng tôi không bán cây này'
  const twice = await mendPart(llm([{ n: 1, vi: 'Thả cây vào bể tép.' }], [{ sentence: 1, finding: 1, text: notice }]), `<p>${notice}; không thả cây vào bể tép.</p>`, [{ check: 'source', quote: notice, note: 'Bỏ lời của người bán.' }])
  if (typeof twice === 'string') throw new Error(twice)
  expect(twice.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "không"'])
  // Astra's read of 36943e68c: a drop inside the quote doesn't move to the same words further on; a quote over two
  // sentences, and the reviewer's drop of it, cover each sentence's share.
  const moved = await mendPart(llm([{ n: 1, vi: 'Bán cây này cho người mới.' }], [{ sentence: 1, finding: 1, text: 'không bán cây này' }]), `<p>${notice}; không bán cây này cho người mới.</p>`, [{ check: 'source', quote: notice, note: 'Bỏ lời của người bán.' }])
  if (typeof moved === 'string') throw new Error(moved)
  expect(moved.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "không"'])
  const both = 'Chúng tôi bán cây. Giá 5 đô la.'
  const spanning = await mendPart(llm([{ n: 1, vi: '' }, { n: 2, vi: '' }], [{ sentence: 1, finding: 1, text: both }]), `<p>${both} Cây mọc nhanh.</p>`, [{ check: 'price', quote: both, note: 'Bỏ lời và giá của người bán.' }])
  if (typeof spanning === 'string') throw new Error(spanning)
  expect(spanning.unasked).toEqual([])
  expect(spanning.html).toBe('<p>Cây mọc nhanh.</p>')
})

// The Writing Lead, 13 Nov 2026: a neighbour may change only right before or after a sentence that changed, in the same
// paragraph or list item; across a block, the reader starts afresh.
test('a neighbour in the next paragraph or list item stays as it was, though the writer says why', async () => {
  const llm = (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
    ? { sentences: [{ n: 1, vi: 'Cây mọc nhanh.' }, { n: 2, vi: 'Cây ưa sáng.', why: '"Chúng" pointed to the plant' }] }
    : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const price = [{ check: 'price' as const, quote: 'giá 5 đô la', note: 'Bỏ giá nước ngoài.' }]
  for (const html of ['<p>Cây mọc nhanh, giá 5 đô la.</p><p>Chúng ưa sáng.</p>', '<ul><li>Cây mọc nhanh, giá 5 đô la.</li><li>Chúng ưa sáng.</li></ul>']) {
    const r = await mendPart(llm, html, price)
    if (typeof r === 'string') throw new Error(r)
    expect(r.html).toContain('Chúng ưa sáng.')
    expect(r.html).not.toContain('5 đô la')
  }
  // In the same paragraph it may change.
  const same = await mendPart(llm, '<p>Cây mọc nhanh, giá 5 đô la. Chúng ưa sáng.</p>', price)
  if (typeof same === 'string') throw new Error(same)
  expect(same.html).toBe('<p>Cây mọc nhanh. Cây ưa sáng.</p>')
})

// The chief of staff, 14 Nov 2026: what stops a mend from changing a figure the page had. Every word a changed sentence
// loses, a number too, must be quoted by a finding that asks for it to go, so a figure changed beside the asked drop fails.
test('a mend that changes a figure beside the asked drop fails, though its reviewer lists nothing', async () => {
  const llm = (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
    ? { sentences: [{ n: 1, vi: 'Bể tối thiểu 40 lít.' }] }
    : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const r = await mendPart(llm, '<p>Bể tối thiểu 38 lít, giá 5 đô la. Cá sống theo đàn.</p>', [{ check: 'price', quote: 'giá 5 đô la', note: 'Bỏ giá nước ngoài.' }])
  if (typeof r === 'string') throw new Error(r)
  expect(r.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "38"'])
})

// The chief of staff, 14 Nov 2026, on the front list's second run: a sentence a finding flags is cut, never said another
// way. Last night's nine kept parts: the two restated are refused, the plain cuts pass.
test('a sentence that changed is the one it was with words taken out: one that says anything new is caught', () => {
  // Boraras merah: a dealer's shipment turned into wild populations.
  expect(addedWords('Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.', 'Cũng có quần thể mà cả đực lẫn cái đều có vẻ mang màu của B. merah.')).toEqual(['cũng', 'quần', 'thể', 'có', 'vẻ'])
  // The ram: "được cho là" said as hearsay.
  expect(addedWords('Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil.', 'Tuy vậy, nghe nói có một mẫu cá bắt được ở sông Purus, Brazil.')).toEqual(['nghe', 'nói', 'có', 'được'])
  // Vallisneria's price and its fertiliser, cut.
  expect(addedWords('Cây rẻ và thường có ở các cửa hàng cá với giá dưới 10 đô la.', 'Cây rẻ và thường có ở các cửa hàng cá.')).toEqual([])
  expect(addedWords('Phân nước tổng hợp Easy Green được khuyên dùng, nhưng các loại phân khác hoặc mật độ cá cao cũng có thể đáp ứng.', 'Phân nước tổng hợp được khuyên dùng, nhưng các loại phân khác hoặc mật độ cá cao cũng có thể đáp ứng.')).toEqual([])
  // A cut joined again with a joining word passes; a pointer or "bạn" put in is something new; a word moved is too.
  expect(addedWords('Cá đẹp, giá 5 đô la ở Mỹ, dễ nuôi.', 'Cá đẹp và dễ nuôi.')).toEqual([])
  expect(addedWords('Cá dễ nuôi.', 'Bạn thấy cá này dễ nuôi.')).toEqual(['bạn', 'thấy', 'này'])
  expect(addedWords('Cá ăn tạp, dễ nuôi.', 'Dễ nuôi, cá ăn tạp.')).toEqual(['cá', 'ăn', 'tạp'])
  // What a wording finding asks for is no addition.
  expect(addedWords('Cá ăn tạp.', 'Cá ăn đủ thứ.', ['đủ thứ'])).toEqual([])
})

test('a mend that says a sentence another way isn\'t kept, whatever its reviewer scores', async () => {
  const html = '<p>Loài này rất gần với B. brigittae. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>'
  const f = [{ check: 'source' as FitCheck, quote: 'Còn ở đợt cá mới nhập về', note: 'A dealer\'s batch.' }]
  const llm = (said: string) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
    ? { sentences: [{ n: 2, vi: said }] }
    : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const restated = await mendPart(llm('Cũng có quần thể mà cả đực lẫn cái đều có vẻ mang màu của B. merah.'), html, f)
  if (typeof restated === 'string') throw new Error(restated)
  expect(restated.added).toEqual(['Sentence 2 says what it didn\'t: "cũng quần thể có vẻ"'])
  const cut = await mendPart(llm('Có vẻ cả đực lẫn cái đều mang màu của B. merah.'), html, f)
  if (typeof cut === 'string') throw new Error(cut)
  expect(cut.added).toEqual([])
})

// Astra's reads of 14 Nov 2026: a writer's own conversion let a claim through, then "mỗi con", "2 inch" as "2 cm" and a
// figure from another measure, however its figures were held. A units finding's sentence is left as written; code converts.
test('a units finding\'s sentence gains no word or figure from its writer: left as written, code puts it in metric', async () => {
  const llm = (said: string) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
    ? { sentences: [{ n: 1, vi: said }] }
    : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const run = async (html: string, quote: string, said: string, o: { en?: string; metric?: boolean } = {}) => {
    const r = await mendPart(llm(said), html, [{ check: 'units' as FitCheck, quote, note: 'Leave the figures as written.' }], o)
    if (typeof r === 'string') throw new Error(r)
    return r
  }
  const gal = '<p>Dung tích bể tối thiểu: 2 gallon. Cá sống theo đàn.</p>'
  for (const [html, quote, said, extra, en] of [
    [gal, '2 gallon', 'Dung tích bể tối thiểu: 8 lít mỗi con.', '8 lít mỗi con'],
    [gal, '2 gallon', 'Dung tích bể tối thiểu: 1 lít.', '1 lít'],
    [gal, '2 gallon', 'Dung tích bể tối thiểu: khoảng 8 lít.', 'khoảng 8 lít'],
    ['<p>Cá dài 2 inch. Cá sống theo đàn.</p>', '2 inch', 'Cá dài 5 cm và sinh sản quanh năm.', '5 cm sinh sản quanh năm'],
    ['<p>Cá dài 2 inch. Cá sống theo đàn.</p>', '2 inch', 'Cá dài 2 cm.', 'cm'],
    ['<p>Bể cần ít nhất 8 lít. Cá sống theo đàn.</p>', '8 lít', 'Bể cần ít nhất 1 lít.', '1', '<p>The tank needs at least 8 litres. Add 1 shelter.</p>'],
    ['<p>Bể cần ít nhất 8 lít. Cá sống theo đàn.</p>', '8 lít', 'Bể cần ít nhất .5 lít.', '5'],
    ['<p>Nước pH 6,5, bể 10 gallon. Cá sống theo đàn.</p>', '10 gallon', 'Nước pH 7, bể 40 lít.', '7 40 lít'],
  ] as const) expect((await run(html, quote, said, en ? { en } : {})).added).toEqual([`Sentence 1 says what it didn't: "${extra}"`])
  // Left as written, code converts it, and nothing is added.
  const left = await run(gal, '2 gallon', 'Dung tích bể tối thiểu: 2 gallon.', { metric: true })
  expect(left.added).toEqual([])
  expect(left.html).toContain('Dung tích bể tối thiểu: 8 lít.')
})
