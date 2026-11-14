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
    check: 'source', quote: 'một trong các mẫu cá trong ảnh', at: 2, to: '',
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
    expect(r.whole, c.page).toEqual([])
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

// The chief of staff, 14 Nov 2026: a part whose every sentence goes whole comes off the page when it is three sentences or
// fewer; a longer one is more likely the read's mistake, and stays held with its sentences.
test('a part that would lose every sentence goes whole at three sentences or fewer, each a finding\'s; a longer one is held', async () => {
  const empty = (n: number) => (async () => ({ sentences: Array.from({ length: n }, (_, i) => ({ n: i + 1, vi: '' })) })) as unknown as Llm
  const one = await mendPart(empty(1), '<p>Nơi sống có ảnh chụp: sông Rio Parana, bang Corrientes, Argentina.</p>', [{ check: 'source', quote: 'Nơi sống có ảnh chụp', note: 'n' }])
  if (typeof one === 'string') throw new Error(one)
  expect([one.html, one.gone]).toEqual(['', ['sentence 1 went whole: "Nơi sống có ảnh chụp: sông Rio Parana, bang Corrientes, Argentina."']])
  const three = '<p>Hiện có cá bắt ngoài tự nhiên. Con nào cũng đã lớn. Lô này về từ Venezuela.</p>'
  const all = [{ check: 'source' as FitCheck, quote: 'Hiện có cá bắt ngoài tự nhiên. Con nào cũng đã lớn. Lô này về từ Venezuela.', note: 'n' }]
  const r3 = await mendPart(empty(3), three, all)
  if (typeof r3 === 'string') throw new Error(r3)
  expect(r3.gone).toHaveLength(3)
  // Four sentences: held, with each sentence for the chief of staff.
  const four = await mendPart(empty(4), three.replace('</p>', ' Cá khỏe.</p>'), [{ ...all[0]!, quote: 'Hiện có cá bắt ngoài tự nhiên. Con nào cũng đã lớn. Lô này về từ Venezuela. Cá khỏe.' }])
  expect(four).toBe('every sentence would go, and the part has 4: held for the chief of staff (sentence 1: "Hiện có cá bắt ngoài tự nhiên."; sentence 2: "Con nào cũng đã lớn."; sentence 3: "Lô này về từ Venezuela."; sentence 4: "Cá khỏe.")')
  // A sentence no finding asks to go (the line after, which the writer says goes with it), or one only a wording or a
  // units finding names: held too, as no reviewer reads a part that goes whole.
  const follower = (async () => ({ sentences: [{ n: 1, vi: '' }, { n: 2, vi: '', why: 'it was about those fish' }] })) as unknown as Llm
  expect(await mendPart(follower, '<p>Hiện có cá bắt ngoài tự nhiên. Con nào cũng khỏe.</p>', [{ check: 'source', quote: 'Hiện có cá bắt ngoài tự nhiên.', note: 'n' }])).toMatch(/^every sentence would go, and not each is a finding's to take: held for the chief of staff/)
  expect(await mendPart(empty(1), '<p>Cá dài 2 inch.</p>', [{ check: 'units', quote: '2 inch', note: 'n' }])).toMatch(/^every sentence would go, and not each is a finding's to take/)
  // A price, product or shop finding cuts only its words: the rest of its sentence isn't its to take (Grok's read).
  expect(await mendPart(empty(1), '<p>Cây giá dưới 10 đô la và độc với tép.</p>', [{ check: 'price', quote: 'giá dưới 10 đô la', note: 'n' }])).toMatch(/^every sentence would go, and not each is a finding's to take/)
  expect(await mendPart(empty(2), '<p>Cây mọc nhanh và rẻ. Mua ở Petco.</p>', [{ check: 'price', quote: 'rẻ', note: 'n' }, { check: 'shop', quote: 'Petco', note: 'n' }])).toMatch(/^every sentence would go, and not each is a finding's to take/)
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
  // (A detail's finding: one on where a sentence applies covers all of it, below.)
  const notice = 'Chúng tôi không bán cây này'
  const twice = await mendPart(llm([{ n: 1, vi: 'Thả cây vào bể tép.' }], [{ sentence: 1, finding: 1, text: notice }]), `<p>${notice}; không thả cây vào bể tép.</p>`, [{ check: 'price', quote: notice, note: 'Bỏ lời của người bán.' }])
  if (typeof twice === 'string') throw new Error(twice)
  expect(twice.unasked).toEqual(['Left out of sentence 1, and no finding asks for it to go: "không"'])
  // Astra's read of 36943e68c: a drop inside the quote doesn't move to the same words further on; a quote over two
  // sentences, and the reviewer's drop of it, cover each sentence's share.
  const moved = await mendPart(llm([{ n: 1, vi: 'Bán cây này cho người mới.' }], [{ sentence: 1, finding: 1, text: 'không bán cây này' }]), `<p>${notice}; không bán cây này cho người mới.</p>`, [{ check: 'price', quote: notice, note: 'Bỏ lời của người bán.' }])
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
// way. Last night's nine kept parts: the two restated say what they didn't, the plain cuts don't (and the two on where a
// statement applies go whole, below).
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
  // Only the six joining words the writer is told: "hoặc" makes "both" "either", "rằng" makes a fact something said.
  expect(addedWords('Cá đẹp, dễ nuôi.', 'Cá đẹp và dễ nuôi.')).toEqual([])
  expect(addedWords('Cá đẹp, dễ nuôi.', 'Cá đẹp hoặc dễ nuôi.')).toEqual(['hoặc'])
  expect(addedWords('Cá dễ nuôi.', 'Rằng cá dễ nuôi.')).toEqual(['rằng'])
  // What a wording finding asks for is no addition.
  expect(addedWords('Cá ăn tạp.', 'Cá ăn đủ thứ.', ['đủ thứ'])).toEqual([])
})

test('a mend that says a sentence another way isn\'t kept, whatever its reviewer scores', async () => {
  const html = '<p>Loài này rất gần với B. brigittae. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>'
  const f = [{ check: 'price' as FitCheck, quote: 'Còn ở đợt cá mới nhập về', note: 'n' }]
  const restated = await mendPart(said(2, 'Cũng có quần thể mà cả đực lẫn cái đều có vẻ mang màu của B. merah.'), html, f)
  if (typeof restated === 'string') throw new Error(restated)
  expect(restated.added).toEqual(['Sentence 2 says what it didn\'t: "cũng quần thể có vẻ"'])
})

/** A writer that returns sentence `n` as `vi`, and a reviewer that scores it 1 and lists nothing. */
const said = (n: number, vi: string) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
  ? { sentences: [{ n, vi }] }
  : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm

// The chief of staff, 14 Nov 2026: a finding on where a statement applies (a dealer's batch, the source's own photo) takes
// the whole sentence; cut of those words, the rest says of every fish what was said of that one. Two of last night's nine.
test('a sentence a finding on where it applies names goes whole: a cut of it is refused, the empty string passes', async () => {
  // Boraras merah: the dealer's shipment. Cut of "Còn ở đợt cá mới nhập về", it says both sexes of the species show B.
  // merah's colour.
  const merah = '<p>Loài này rất gần với B. brigittae. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>'
  const batch = [{ check: 'source' as FitCheck, quote: 'Còn ở đợt cá mới nhập về', note: 'A dealer\'s batch.' }]
  const cut = await mendPart(said(2, 'Có vẻ cả đực lẫn cái đều mang màu của B. merah.'), merah, batch)
  if (typeof cut === 'string') throw new Error(cut)
  expect(cut.added).toEqual([])
  expect(cut.whole).toEqual(['Sentence 2 goes whole, as its finding asks, and was kept as "Có vẻ cả đực lẫn cái đều mang màu của B. merah."'])
  const gone = await mendPart(said(2, ''), merah, batch)
  if (typeof gone === 'string') throw new Error(gone)
  expect([gone.whole, gone.added, gone.unasked]).toEqual([[], [], []])
  expect(gone.html).toBe('<p>Loài này rất gần với B. brigittae.</p>')
  // The ram: one fish in the source's photo. Cut of "trong các … trong ảnh", it says a fish of the species was caught in
  // the Purus.
  const ram = '<p>Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco. Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil.</p>'
  const photo = [{ check: 'source' as FitCheck, quote: 'một trong các mẫu cá trong ảnh', note: 'The source\'s own photo.' }]
  const ramCut = await mendPart(said(2, 'Tuy vậy, một mẫu cá được cho là bắt ở sông Purus, Brazil.'), ram, photo)
  if (typeof ramCut === 'string') throw new Error(ramCut)
  expect(ramCut.added).toEqual([])
  expect(ramCut.whole).toEqual(['Sentence 2 goes whole, as its finding asks, and was kept as "Tuy vậy, một mẫu cá được cho là bắt ở sông Purus, Brazil."'])
  const ramGone = await mendPart(said(2, ''), ram, photo)
  if (typeof ramGone === 'string') throw new Error(ramGone)
  expect([ramGone.whole, ramGone.added, ramGone.unasked]).toEqual([[], [], []])
  // A sentence left as it was is kept too, and refused; so is any check the code doesn't name as a detail.
  for (const check of ['source', 'elsewhere', 'harm', 'dose', 'lethal'] as const) {
    const same = await mendPart(said(2, 'Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.'), merah, [{ ...batch[0]!, check }])
    if (typeof same === 'string') throw new Error(same)
    expect(same.whole.length, check).toBe(1)
  }
  // A detail is cut from its sentence: a price, a product's or a shop's name.
  for (const check of ['price', 'product', 'shop'] as const) {
    const r = await mendPart(said(1, 'Cây rẻ.'), '<p>Cây rẻ, giá dưới 10 đô la.</p><p>Cây mọc nhanh.</p>', [{ check, quote: 'giá dưới 10 đô la', note: 'n' }])
    if (typeof r === 'string') throw new Error(r)
    expect([r.whole, r.added, r.unasked], check).toEqual([[], [], []])
  }
})

// The chief of staff, 14 Nov 2026: a sentence left pointing at one that went whole may go with it, when it is the one
// right after, in the same paragraph, its writer returns it empty and says why, and its reviewer agrees. Anything further,
// the part isn't kept.
test('the sentence right after one that went whole goes with it only when its writer and its reviewer say it can\'t stand', async () => {
  const ram = '<p>Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco. Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil. Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco.</p><p>Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.</p>'
  const photo = [{ check: 'source' as FitCheck, quote: 'một trong các mẫu cá trong ảnh', note: 'The source\'s own photo.' }]
  const why = 'It named the river that went: left, it says the Orinoco is the Amazon\'s.'
  const llm = (returned: { n: number; vi: string; why?: string }[], follows: { sentence: number; agree: boolean }[] = [], prompts: string[] = []) => (async ({ prompt, schema }: { prompt: string; schema: { required: string[] } }) => {
    prompts.push(prompt)
    return schema.required.includes('sentences') ? { sentences: returned } : { score: 1, notes: [], dropped: [{ sentence: 3, finding: 0, text: 'Đây là một phụ lưu của Amazon' }], hedges: [], follows }
  }) as Llm
  // The ram's "Đây là một phụ lưu của Amazon": the writer and the reviewer agree, so it goes, and the run lists both.
  const prompts: string[] = []
  const both = await mendPart(llm([{ n: 2, vi: '' }, { n: 3, vi: '', why }], [{ sentence: 3, agree: true }], prompts), ram, photo)
  if (typeof both === 'string') throw new Error(both)
  expect([both.whole, both.unasked, both.added]).toEqual([[], [], []])
  expect(both.html).toBe('<p>Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco.</p><p>Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.</p>')
  expect(both.gone).toEqual([
    'sentence 2 went whole: "Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil."',
    'sentence 3 went with the one before it ("Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil."): "Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco."',
  ])
  expect(prompts[1]).toContain(`--- LEFT OUT WITH THE SENTENCE BEFORE ---\nsentence 3, after sentence 2, which went whole. The editor says: ${why}`)
  // The reviewer doesn't agree, or says nothing of it: not kept.
  for (const follows of [[{ sentence: 3, agree: false }], []]) {
    const r = await mendPart(llm([{ n: 2, vi: '' }, { n: 3, vi: '', why }], follows), ram, photo)
    if (typeof r === 'string') throw new Error(r)
    expect(r.whole).toEqual(['Sentence 3 went with the one before it, and its reviewer doesn\'t agree it no longer reads without it: "Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco."'])
  }
  // No why: it isn't taken, and stays.
  const silent = await mendPart(llm([{ n: 2, vi: '' }, { n: 3, vi: '' }], [{ sentence: 3, agree: true }]), ram, photo)
  if (typeof silent === 'string') throw new Error(silent)
  expect(silent.html).toContain('Đây là một phụ lưu của Amazon')
  // Further: the one before it, the next paragraph's, one after the sentence that went with it, or one after a cut. Not kept.
  const further = (returned: { n: number; vi: string; why?: string }[], html: string, fs = photo) => mendPart(llm(returned, [{ sentence: 3, agree: true }, { sentence: 4, agree: true }]), html, fs)
  const stranded = (n: number, text: string) => `Sentence ${n} no longer reads without what went, and only the one right after a sentence that went whole may go with it: "${text}"`
  const before = await further([{ n: 2, vi: '' }, { n: 1, vi: '', why }], ram)
  if (typeof before === 'string') throw new Error(before)
  expect(before.whole).toEqual([stranded(1, 'Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco.')])
  const across = await further([{ n: 3, vi: '' }, { n: 4, vi: '', why }], ram, [{ check: 'source', quote: 'Đây là một phụ lưu của Amazon', note: 'n' }])
  if (typeof across === 'string') throw new Error(across)
  expect(across.whole).toEqual([stranded(4, 'Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.')])
  const chain = await further([{ n: 2, vi: '' }, { n: 3, vi: '', why }, { n: 4, vi: '', why }], ram.replace('</p><p>', ' '))
  if (typeof chain === 'string') throw new Error(chain)
  expect(chain.whole).toEqual([stranded(4, 'Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.')])
  const afterCut = await further([{ n: 2, vi: '' }, { n: 3, vi: '', why }], ram, [{ check: 'price', quote: 'Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil.', note: 'n' }])
  if (typeof afterCut === 'string') throw new Error(afterCut)
  expect(afterCut.whole).toEqual([stranded(3, 'Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco.')])
  // Astra's read of 1351f22f1: answered twice, empty and then "Cá ăn tép.", the line kept the pass of the first and lost its
  // "không". A sentence answered twice isn't tried.
  const twice = await mendPart(llm([{ n: 1, vi: '' }, { n: 2, vi: '', why }, { n: 2, vi: 'Cá ăn tép.', why }], [{ sentence: 2, agree: true }]), '<p>Ảnh chụp cá ở Purus. Cá không ăn tép. Cá sống lâu.</p>', [{ check: 'source', quote: 'Ảnh chụp cá ở Purus', note: 'n' }])
  expect(twice).toBe('the writer answered sentence 2 twice')
  // Astra's read of fa80ab004: a sentence a detail's cut leaves nothing of goes on the list too.
  const price = await mendPart(llm([{ n: 1, vi: '' }]), '<p>Giá 10 USD. Cá ăn tép. Cá sống lâu.</p>', [{ check: 'price', quote: 'Giá 10 USD.', note: 'n' }])
  if (typeof price === 'string') throw new Error(price)
  expect([price.html, price.gone]).toEqual(['<p>Cá ăn tép. Cá sống lâu.</p>', ['sentence 1 went whole: "Giá 10 USD."']])
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
    ['<p>Bể cần ít nhất 8 lít. Cá sống theo đàn.</p>', '8 lít', 'Bể cần ít nhất .5 lít.', '.5'],
    ['<p>Nước pH 6,5, bể 10 gallon. Cá sống theo đàn.</p>', '10 gallon', 'Nước pH 7, bể 40 lít.', '7 40 lít'],
  ] as const) expect((await run(html, quote, said, en ? { en } : {})).added).toEqual([`Sentence 1 says what it didn't: "${extra}"`])
  // Left as written, code converts it, and nothing is added.
  const left = await run(gal, '2 gallon', 'Dung tích bể tối thiểu: 2 gallon.', { metric: true })
  expect(left.added).toEqual([])
  expect(left.html).toContain('Dung tích bể tối thiểu: 8 lít.')
})

// Astra's fourth read of 14 Nov 2026: a decimal written as a range and "5" as ".5" read as the same words; a breed's figure
// licensed a word in each sentence its finding covered; the converter rounded a dose's water.
test('a figure is one word with its marks; a finding\'s words go in once a part; a part with a dose isn\'t converted', async () => {
  expect(addedWords('Nước cần pH 6,5.', 'Nước cần pH 6–5.')).toEqual(['6-5'])
  expect(addedWords('Bể cần 5 lít.', 'Bể cần .5 lít.')).toEqual(['.5'])
  expect(addedWords('Cá dài 2–5 cm.', 'Cá dài 2–5 cm.')).toEqual([])
  // Astra's fifth read: a spaced range written as two figures, and a figure given a minus.
  expect(addedWords('Cá dài 5 – 8 cm.', 'Cá dài 5, 8 cm.')).toEqual(['5', '8'])
  expect(addedWords('Nhiệt độ 5 °C.', 'Nhiệt độ -5 °C.')).toEqual(['-5'])
  expect(addedWords('Cá dài 5 – 8 cm.', 'Cá dài 5–8 cm.')).toEqual([])
  const llm = (said: string[]) => (async ({ schema }: { schema: { required: string[] } }) => (schema.required.includes('sentences')
    ? { sentences: said.map((vi, i) => ({ n: i + 1, vi })) }
    : { score: 1, notes: [], dropped: [], hedges: [] })) as Llm
  const html = '<p>Bể cần 132 lít. Cá dài 2 cm.</p>'
  const f = [{ check: 'units' as FitCheck, quote: 'Bể cần 132 lít. Cá dài 2 cm.', note: 'Write 130 lít.', adds: ['130 lít'] }]
  const twice = await mendPart(llm(['Bể cần 130 lít.', 'Cá dài 130 cm.']), html, f)
  if (typeof twice === 'string') throw new Error(twice)
  expect(twice.added).toEqual(['Sentence 2 says what it didn\'t: "130"'])
  const once = await mendPart(llm(['Bể cần 130 lít.', 'Cá dài 2 cm.']), html, f)
  if (typeof once === 'string') throw new Error(once)
  expect(once.added).toEqual([])
  // A dose's water stays as written: the converter would make 2 gallons 8 litres.
  const dose = await mendPart(llm(['Pha 1 ml thuốc vào 2 gallon nước.']), '<p>Pha 1 ml thuốc vào 2 gallon nước. Cá sống theo đàn.</p>', [{ check: 'units', quote: '2 gallon', note: 'Leave it.' }], { metric: true })
  if (typeof dose === 'string') throw new Error(dose)
  expect(dose.html).toContain('vào 2 gallon nước')
  expect(dose.html).not.toContain('8 lít')
})

// The Writing Lead, 14 Nov 2026: the writer's rule as one sentence that doesn't contradict itself.
test('the writer is told to cut, join with a listed word only, and add nothing else but a wording note\'s words', async () => {
  const prompts: string[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: { required: string[] } }) => { prompts.push(prompt); return schema.required.includes('sentences') ? { sentences: [{ n: 1, vi: 'Cây mọc nhanh.' }] } : { score: 1, notes: [], dropped: [], hedges: [] } }) as Llm
  await mendPart(llm, '<p>Cây mọc nhanh, giá 5 đô la.</p>', [{ check: 'price', quote: 'giá 5 đô la', note: 'Bỏ giá.' }])
  expect(prompts[0]).toContain('Changing a sentence means cutting it: take out what the note names, and if what\'s left needs joining, join it with one of these words: và, thì, là, mà, nhưng, của. Add no other word the sentence didn\'t have, except the words a wording note gives ("Nên viết"), and never say it another way.')
})
