import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkSentences, droppedInRewrite, rewordLoose, sentences, stopNote } from '../src/glossary-facts'

// The glossary's fact check, sentence by sentence (the chief of staff, 14 Nov 2026): the old one-score check judged claims of
// its own choosing each read, and scored one unchanged draft 0.95 and then 0.72.
const facts = { term: 'pH', english: 'pH', sources: [], facts: [{ section: 'what', fact: 'Tannins lower pH a little', source: 0 }] }
const entry = {
  definition: 'pH đo độ chua của nước. Nó đi từ 0 tới 14.',
  body: '<h3>Trong bể</h3><p>Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.</p><ul><li><strong>Làm pH lên:</strong> san hô.</li></ul>',
}

/** A model that gives each read of all sentences the verdicts `reads` lists (by sentence, "unsupported: why"), and a sentence alone `one`'s. */
function model(reads: Record<string, string>[], one: string[] = [], reword: Record<string, string> = {}) {
  const calls: string[] = []
  const llm: Llm = async ({ prompt, system }) => {
    calls.push(prompt)
    if (system.startsWith('You reword')) return { sentences: [...prompt.matchAll(/^(\d+)\. CÂU: (.*)$/gm)].map(m => ({ n: Number(m[1]), text: reword[m[2]!] ?? m[2]! })) } as never
    const v = (s?: string) => { const [verdict, why] = (s ?? 'supported').split(': '); return { verdict, ...(why ? { why } : {}) } }
    if (prompt.includes('\n\nSENTENCE:\n')) return v(one.shift()) as never
    const say = reads.shift() ?? {}
    return { verdicts: [...prompt.split('\n\nSENTENCES:\n')[1]!.matchAll(/^(\d+)\. (.*)$/gm)].map(m => ({ n: Number(m[1]), ...v(say[m[2]!]) })) } as never
  }
  return { llm, calls }
}

test('an entry is split into its sentences: the definition\'s, then each heading\'s, paragraph\'s and list item\'s, as plain text', () => {
  expect(sentences(entry).map(s => s.text)).toEqual(['pH đo độ chua của nước.', 'Nó đi từ 0 tới 14.', 'Trong bể', 'Lá bàng làm pH xuống.', 'Nên thả lá từ từ rồi đo pH.', 'Làm pH lên: san hô.'])
  expect(sentences(entry)[4]!).toEqual({ text: 'Nên thả lá từ từ rồi đo pH.', block: 'Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.', heading: 'Trong bể' })
  expect(sentences(entry)[5]!).toEqual({ text: 'Làm pH lên: san hô.', block: 'Làm pH lên: san hô.', heading: 'Trong bể', item: 'Làm pH lên' })
})

// The chief of staff, 14 Nov 2026: on Lũa's draft 7, Opus's reads stopped the boiling and rot lines in both runs, where
// Sonnet's stopped them 2 times in 5 and 1 in 5, and neither model stopped a right sentence.
test('every fact read runs on Opus: the three reads, a lone stop\'s re-reads and the read after rewording', async () => {
  const { llm } = model([{ 'Lá bàng làm pH xuống.': 'unsupported: x', 'Nó đi từ 0 tới 14.': 'loose: y' }, { 'Nó đi từ 0 tới 14.': 'loose: y' }, {}], ['supported', 'supported', 'supported'], { 'Nó đi từ 0 tới 14.': 'Nó đi từ 0 đến 14.' })
  const asked: (string | undefined)[] = []
  const spy: Llm = args => { if (args.system.startsWith('You check')) asked.push(args.model); return llm(args) }
  const check = await checkSentences(spy, facts, entry)
  expect(check.loose.map(s => s.text)).toEqual(['Nó đi từ 0 tới 14.'])
  await rewordLoose(spy, 'sonnet', facts, entry, check.loose)
  expect(asked).toEqual(Array(9).fill('opus'))
})

// The measured run, 14 Nov 2026: "Thường dùng nguyên khúc cho bể nuôi Cá đĩa, Cá ông tiên" read supported three times, as
// another wood's fact covered it, though its item was about lũa đỗ quyên, named three sentences before it.
test('a kind\'s sentences are read under its name, as a section\'s are under its heading', async () => {
  const e = { definition: 'Lũa là gỗ.', body: '<h3>Các loại lũa</h3><ul><li><strong>Lũa đỗ quyên</strong> (spider wood): rễ cây. Lũa nhẹ. Thường dùng cho bể cá đĩa.</li><li><strong>Lũa sừng:</strong> màu vàng.</li></ul><p>Ngâm lũa trước.</p>' }
  const { llm, calls } = model([{ 'Lũa nhẹ.': 'unsupported: x' }, {}, {}], ['supported', 'supported', 'supported'])
  await checkSentences(llm, facts, e)
  expect(calls[0]).toContain('SENTENCES:\n1. Lũa là gỗ.\n[Các loại lũa]\n2. Các loại lũa\n[Các loại lũa › Lũa đỗ quyên]\n3. Lũa đỗ quyên (spider wood): rễ cây.\n4. Lũa nhẹ.\n5. Thường dùng cho bể cá đĩa.\n[Các loại lũa › Lũa sừng]\n6. Lũa sừng: màu vàng.\n[Các loại lũa]\n7. Ngâm lũa trước.')
  expect(calls[3]).toContain('HEADING:\nCác loại lũa › Lũa đỗ quyên\n\nPARAGRAPH:\nLũa đỗ quyên (spider wood): rễ cây. Lũa nhẹ. Thường dùng cho bể cá đĩa.\n\nSENTENCE:\nLũa nhẹ.')
})

// Codex, 14 Nov 2026: a paragraph inside a kind's item lost the kind's name, and could read as another wood's.
test('a kind\'s name holds for everything inside its item: a paragraph or a list in it, under a name of its own too', () => {
  const at = (body: string) => sentences({ definition: 'Lũa là gỗ.', body }).slice(1).map(s => `${s.item ?? '-'}: ${s.text}`)
  expect(at('<ul><li><strong>Lũa đỗ quyên</strong><p>Chìm ngay.</p></li><li>Khác.</li></ul>')).toEqual(['Lũa đỗ quyên: Lũa đỗ quyên', 'Lũa đỗ quyên: Chìm ngay.', '-: Khác.'])
  expect(at('<ul><li><strong>Lũa đỗ quyên:</strong> rễ.<ul><li>Chìm chậm.</li><li><strong>Lưu ý:</strong> dễ gãy.</li></ul>Nhẹ.</li></ul><p>Ngâm trước.</p>')).toEqual(['Lũa đỗ quyên: Lũa đỗ quyên: rễ.', 'Lũa đỗ quyên: Chìm chậm.', 'Lũa đỗ quyên › Lưu ý: Lưu ý: dễ gãy.', 'Lũa đỗ quyên: Nhẹ.', '-: Ngâm trước.'])
  // An item left unclosed ends where the next begins.
  expect(at('<ul><li><strong>Lũa sừng</strong> vàng.<li>Gỗ khác.</ul>')).toEqual(['Lũa sừng: Lũa sừng vàng.', '-: Gỗ khác.'])
  // A heading inside a kind's item keeps it (Codex, 14 Nov 2026).
  expect(sentences({ definition: 'Lũa là gỗ.', body: '<ul><li><strong>Lũa đỗ quyên</strong><h3>Đặc tính</h3><p>Chìm ngay.</p></li></ul><h3>Sau</h3><p>Hết.</p>' }).slice(1).map(s => `${s.heading ?? '-'} | ${s.item ?? '-'}: ${s.text}`))
    .toEqual(['- | Lũa đỗ quyên: Lũa đỗ quyên', 'Đặc tính | Lũa đỗ quyên: Đặc tính', 'Đặc tính | Lũa đỗ quyên: Chìm ngay.', 'Sau | -: Sau', 'Sau | -: Hết.'])
  // A paragraph that opens with a name, outside any list, stands under it alone.
  expect(at('<p><strong>Mopani:</strong> nặng.</p><p>Sau đó.</p>')).toEqual(['Mopani: Mopani: nặng.', '-: Sau đó.'])
})

// Codex, 14 Nov 2026: a claim in a table cell, which the saved page keeps, was never read.
test('every piece of the body\'s text is read, wherever it stands: a table\'s cells, a div, text outside any tag, any heading', () => {
  const e = {
    definition: 'Muối là NaCl.',
    body: 'Chữ ngoài thẻ.<h2>Bảng</h2><table><tr><th>Loại</th><td>Muối loại bỏ mọi độc tố.</td></tr></table><div>Một khối <em>khác</em>.</div><p>Dòng một<br>Dòng hai.</p><h4>Cuối</h4>Hết.',
  }
  const list = sentences(e)
  expect(list.map(s => s.text)).toEqual(['Muối là NaCl.', 'Chữ ngoài thẻ.', 'Bảng', 'Loại', 'Muối loại bỏ mọi độc tố.', 'Một khối khác.', 'Dòng một', 'Dòng hai.', 'Cuối', 'Hết.'])
  expect(list[4]!.heading).toBe('Bảng')
  // Nothing the page would show is left out: every letter of the text, in order.
  const letters = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
  expect(list.map(s => s.text).join('').replace(/\s+/g, '')).toBe(letters(e.definition + e.body))
})

test('two reads of three that say the facts don\'t carry a sentence stop it; one doesn\'t; loose is advice', async () => {
  const advice = 'Nên thả lá từ từ rồi đo pH.'
  const { llm, calls } = model([{ [advice]: 'unsupported: not in the facts', 'Lá bàng làm pH xuống.': 'loose: stronger' }, { [advice]: 'unsupported: advice not given' }, { 'Lá bàng làm pH xuống.': 'loose: stronger', 'Nó đi từ 0 tới 14.': 'unsupported: no range given' }])
  const r = await checkSentences(llm, facts, entry)
  // The sentence one read stopped is read three times more, alone, under its heading; none of those stops it.
  expect(calls).toHaveLength(6)
  expect(calls[0]).toContain('SENTENCES:\n1. pH đo độ chua của nước.\n2. Nó đi từ 0 tới 14.\n[Trong bể]\n3. Trong bể\n4. Lá bàng làm pH xuống.')
  expect(calls[3]).toContain('HEADING:\n(the definition)\n\nPARAGRAPH:\npH đo độ chua của nước. Nó đi từ 0 tới 14.\n\nSENTENCE:\nNó đi từ 0 tới 14.')
  expect(r.stops.map(s => s.text)).toEqual([advice])
  expect(stopNote(r.stops[0]!)).toBe('"Nên thả lá từ từ rồi đo pH.": the facts don\'t carry it (unsupported, unsupported, supported): not in the facts / advice not given')
  expect(r.loose.map(s => s.text)).toEqual(['Lá bàng làm pH xuống.'])
  expect(r.score).toBe(0.83)
})

test('a sentence one read stops is read three times more alone, and stops when two of those do, whatever the other two reads said', async () => {
  const s = 'Lá bàng làm pH xuống.'
  const yes = model([{ [s]: 'contradicts: raises it' }, {}, {}], ['contradicts: raises it', 'supported', 'contradicts: raises it'])
  const r = await checkSentences(yes.llm, facts, entry)
  expect(yes.calls).toHaveLength(6)
  expect(yes.calls[3]).toContain(`HEADING:\nTrong bể\n\nPARAGRAPH:\nLá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.\n\nSENTENCE:\n${s}`)
  expect(r.stops.map(x => x.verdicts)).toEqual([['contradicts', 'supported', 'supported', 'contradicts', 'supported', 'contradicts']])
  const no = model([{ [s]: 'contradicts: raises it' }, {}, {}], ['supported', 'loose: x', 'contradicts: y'])
  expect((await checkSentences(no.llm, facts, entry)).stops).toEqual([])
  // A mistakes-list item one read calls unsupported and two "not a claim" (chu trình nitơ's, 14 Nov 2026) is settled alone.
  const item = 'Làm pH lên: san hô.'
  const settled = model([{ [item]: 'unsupported: coral not named' }, { [item]: 'not a claim: a label' }, { [item]: 'not a claim: a label' }], ['unsupported: coral not named', 'unsupported: x', 'supported'])
  expect((await checkSentences(settled.llm, facts, entry)).stops.map(x => x.text)).toEqual([item])
})

// Codex, 14 Nov 2026: three empty replies scored an entry 1, and it saved unread.
test('a read that leaves a sentence out, or gives a verdict not on the list, gives it no verdict; a sentence fewer than two reads judge stops, unjudged', async () => {
  let k = 0
  const llm: Llm = async () => {
    k++
    // Sentence 5 has one verdict in three reads; sentence 4 has two, both supported; the rest all three.
    const all = [1, 2, 3, 4, 5, 6].map(n => ({ n, verdict: 'supported' }))
    return { verdicts: all.filter(v => !(v.n === 5 && k > 1) && !(v.n === 4 && k === 2)).map(v => (v.n === 6 && k === 1 ? { ...v, verdict: 'wrong' } : v)) } as never
  }
  const r = await checkSentences(llm, facts, entry)
  expect(r.stops.map(stopNote)).toEqual(['"Nên thả lá từ từ rồi đo pH.": the reads left it unjudged (1 of 3 gave a verdict)'])
  // Re-reads that give no verdict leave a lone stop unsettled: it stops too (Codex, 14 Nov 2026).
  const lone = model([{ 'Lá bàng làm pH xuống.': 'unsupported: x' }, {}, {}], ['', '', ''])
  const unsettled = await checkSentences(lone.llm, facts, entry)
  expect(unsettled.stops.map(stopNote)).toEqual(['"Lá bàng làm pH xuống.": the reads left it unjudged (3 of 6 gave a verdict)'])
  expect(unsettled.score).toBe(0.83)
  expect(r).toMatchObject({ score: 0.83, loose: [] })
  const none: Llm = async () => ({}) as never
  const blank = await checkSentences(none, facts, entry)
  expect(blank.score).toBe(0)
  expect(blank.stops).toHaveLength(6)
})

test('"not a claim" takes a sentence out of the score, and never keeps two stops from stopping it', async () => {
  const s = 'Nó đi từ 0 tới 14.'
  const { llm } = model([{ [s]: 'not a claim' }, { [s]: 'not a claim' }, { 'Nên thả lá từ từ rồi đo pH.': 'unsupported: x' }])
  const r = await checkSentences(llm, facts, entry)
  expect(r).toMatchObject({ score: 1, stops: [], loose: [] })
})

// The middle path's trial on Lũa (14 Nov 2026): 4 of 12 rewordings hedged ("many sources say…, but one notes…"), a rewording
// can read worse than the line it replaced, and a sentence's verdict moved with what stood around it (Codex).
test('the middle path rewords loose sentences once, no hedge, then reads the whole entry again; a rewording that stops goes back', async () => {
  const loose = [
    { text: 'Lá bàng làm pH xuống.', block: 'Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.', heading: 'Trong bể', verdicts: ['loose' as const, 'loose' as const], why: ['stronger than the facts'] },
    { text: 'pH đo độ chua của nước.', block: entry.definition, verdicts: ['loose' as const, 'loose' as const], why: ['also alkalinity'] },
    { text: 'Làm pH lên: san hô.', block: 'Làm pH lên: san hô.', verdicts: ['loose' as const, 'loose' as const], why: ['x'] },
  ]
  const added = 'pH đo độ chua hay kiềm của nước & nhiều hơn.'
  const reword = { 'Lá bàng làm pH xuống.': 'Lá bàng làm pH xuống chút ít.', 'pH đo độ chua của nước.': added }
  const { llm, calls } = model([{ [added]: 'unsupported: added' }, { [added]: 'unsupported: added' }, {}], [], reword)
  const r = await rewordLoose(llm, 'opus', facts, entry, loose)
  expect(calls[0]).toContain('không rào đón ("có nguồn cho rằng", "nhiều nguồn", "có tiệm ghi")')
  expect(calls[0]).toContain('1. CÂU: Lá bàng làm pH xuống.\n   ĐOẠN: Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.\n   LÝ DO: stronger than the facts')
  // The whole entry as it would be saved, read three times as the first check read it.
  expect(calls).toHaveLength(4)
  expect(calls[1]).toContain(`SENTENCES:\n1. ${added}\n2. Nó đi từ 0 tới 14.\n[Trong bể]\n3. Trong bể\n4. Lá bàng làm pH xuống chút ít.\n5. Nên thả lá từ từ rồi đo pH.\n[Trong bể › Làm pH lên]\n6. Làm pH lên: san hô.`)
  expect(r.entry.body).toBe('<h3>Trong bể</h3><p>Lá bàng làm pH xuống chút ít. Nên thả lá từ từ rồi đo pH.</p><ul><li><strong>Làm pH lên:</strong> san hô.</li></ul>')
  expect(r.entry.definition).toBe(entry.definition)
  expect(r.stops).toEqual([])
  expect(r.score).toBe(1)
  expect(r.log).toEqual([
    'Loose, left as written (not placeable): "Làm pH lên: san hô."',
    'Loose, reworded: "Lá bàng làm pH xuống." → "Lá bàng làm pH xuống chút ít." (supported)',
    `Loose, rewording read as unsupported, old wording kept for the reader: "pH đo độ chua của nước." (not "${added}": unsupported, unsupported, supported)`,
  ])
  // A sentence the rewording didn't touch, read as a stop in the whole entry: returned, so the entry isn't saved.
  const other = model([{ 'Nên thả lá từ từ rồi đo pH.': 'unsupported: advice' }, { 'Nên thả lá từ từ rồi đo pH.': 'unsupported: advice' }, {}], [], reword)
  const kept = await rewordLoose(other.llm, 'opus', facts, entry, loose.slice(0, 1))
  expect(kept.stops.map(x => x.text)).toEqual(['Nên thả lá từ từ rồi đo pH.'])
  expect(kept.score).toBe(0.83)
})

// The chief of staff, 15 Nov 2026: chu trình nitơ's rewording read only the facts, and put a brand where a kind stood (house
// rule 8) and took out what the term's notes asked for, with nothing reading the rules after it.
test('a rewording a house rules note quotes goes back to its old wording; one no note quotes stays', async () => {
  const e = { definition: 'Khử clo cho nước máy.', body: '<p>Dùng thuốc khử clo. Thay nước mỗi tuần.</p>' }
  const flag = (text: string) => ({ text, block: 'Dùng thuốc khử clo. Thay nước mỗi tuần.', verdicts: ['loose' as const, 'loose' as const], why: ['a shop names Prime'] })
  const reword = { 'Dùng thuốc khử clo.': 'Dùng Seachem Prime.', 'Thay nước mỗi tuần.': 'Thay khoảng 30% nước mỗi tuần.' }
  const { llm } = model([{}, {}, {}], [], reword)
  const read: string[] = []
  const rules = async (x: typeof e) => { read.push(x.body); return ['Rule 8: "Seachem Prime" is a brand where "thuốc khử clo" is enough.', 'Rule 4: "nước máy" twice.'] }
  const r = await rewordLoose(llm, 'opus', facts, e, [flag('Dùng thuốc khử clo.'), flag('Thay nước mỗi tuần.')], { rules })
  // Read on the entry the rewording made, once.
  expect(read).toEqual(['<p>Dùng Seachem Prime. Thay khoảng 30% nước mỗi tuần.</p>'])
  expect(r.entry.body).toBe('<p>Dùng thuốc khử clo. Thay khoảng 30% nước mỗi tuần.</p>')
  expect(r.log).toEqual([
    'Loose, rewording broke a house rule or dropped a specific, old wording kept for the reader: "Dùng thuốc khử clo." (not "Dùng Seachem Prime.": Rule 8: "Seachem Prime" is a brand where "thuốc khử clo" is enough. / it drops the advice "Dùng thuốc khử clo")',
    'Loose, reworded: "Thay nước mỗi tuần." → "Thay khoảng 30% nước mỗi tuần." (supported)',
  ])
  expect(r.score).toBe(1)
  // A note quoting a whole passage the rewording sits in counts too; a rewording that read stops isn't read for the rules.
  const two = model([{ 'Thay khoảng 30% nước mỗi tuần.': 'unsupported: x' }, { 'Thay khoảng 30% nước mỗi tuần.': 'unsupported: x' }, {}], [], reword)
  const passage = async () => ['Rule 12: "Khử clo cho nước máy. Dùng Seachem Prime. Thay" drops the kind.']
  expect((await rewordLoose(two.llm, 'opus', facts, e, [flag('Dùng thuốc khử clo.'), flag('Thay nước mỗi tuần.')], { rules: passage })).entry.body).toBe(e.body)
})

// Grok's read, 15 Nov 2026: a sentence put back by its words landed on another that read the same, and the entry was saved
// with a stop in it; a short quote reverted a good rewording; a note on words the rewording took out reverted nothing.
test('going back puts in again only the rewordings that stay; a note is about a rewording by the words it put in or took out', async () => {
  const flag = (text: string, block: string) => ({ text, block, verdicts: ['loose' as const, 'loose' as const], why: ['x'] })
  // The definition's rewording stops and goes back; the body's had taken the definition's old words, so it can't stay.
  const e = { definition: 'Dùng thuốc khử clo.', body: '<p>Rồi thả cá.</p>' }
  const one = model([{ 'Khử clo trước.': 'unsupported: x' }, { 'Khử clo trước.': 'unsupported: x' }, {}], [], { 'Dùng thuốc khử clo.': 'Khử clo trước.', 'Rồi thả cá.': 'Dùng thuốc khử clo.' })
  const quoting = async () => ['Rule 12: "Dùng thuốc khử clo." is not in THIS TERM.']
  const r = await rewordLoose(one.llm, 'opus', facts, e, [flag('Dùng thuốc khử clo.', e.definition), flag('Rồi thả cá.', 'Rồi thả cá.')], { rules: quoting })
  expect(r.entry).toEqual(e)
  expect(r.stops).toEqual([])
  expect(r.log[1]).toBe('Loose, rewording not placed once others went back, old wording kept for the reader: "Rồi thả cá." (not "Dùng thuốc khử clo.")')
  // Two body sentences: the one put back holds the other's new words. Neither lands inside the other.
  const b = { definition: 'Một câu.', body: '<p>Chu trình ổn khi TAN và nitrite về 0 hoặc gần 0. Nitrate tăng sau đó.</p>' }
  const block = 'Chu trình ổn khi TAN và nitrite về 0 hoặc gần 0. Nitrate tăng sau đó.'
  const two = model([{}, {}, {}], [], { 'Chu trình ổn khi TAN và nitrite về 0 hoặc gần 0.': 'Chu trình ổn khi TAN và nitrite giảm.', 'Nitrate tăng sau đó.': '0 hoặc gần 0.' })
  const r2 = await rewordLoose(two.llm, 'opus', facts, b, [flag('Chu trình ổn khi TAN và nitrite về 0 hoặc gần 0.', block), flag('Nitrate tăng sau đó.', block)], { rules: async () => ['Rule 12: the line never gives "0 hoặc gần 0" when the filter is mature.'] })
  expect(r2.entry).toEqual(b)
  // A name a note on another sentence quotes, which the rewording kept: not about it. Words it took out: about it.
  const l = { definition: 'Một câu.', body: '<p>Lũa chìm khi ngâm.</p><p>Ngâm lũa mới.</p>' }
  const three = model([{}, {}, {}], [], { 'Lũa chìm khi ngâm.': 'Lũa chìm sau khi ngâm lâu.' })
  const kept = await rewordLoose(three.llm, 'opus', facts, l, [flag('Lũa chìm khi ngâm.', 'Lũa chìm khi ngâm.')], { rules: async () => ['Rule 6: "Lũa" in "Ngâm lũa mới." is not its page\'s name.'] })
  expect(kept.entry.body).toBe('<p>Lũa chìm sau khi ngâm lâu.</p><p>Ngâm lũa mới.</p>')
  const four = model([{}, {}, {}], [], { 'Lũa chìm khi ngâm.': 'Lũa chìm sau khi ngâm lâu.' })
  const back = await rewordLoose(four.llm, 'opus', facts, l, [flag('Lũa chìm khi ngâm.', 'Lũa chìm khi ngâm.')], { rules: async () => ['Rule 12: THIS TERM asks for "khi ngâm." as it was.'] })
  expect(back.entry).toEqual(l)
})

// The chief of staff, 15 Nov 2026: the rewording bought its fit by taking specifics out (pH's weekly 20–30%, chu trình
// nitơ's fish deaths and "0 or near 0", Lũa's "must soak"). A rewording that drops one the facts carry keeps the old wording.
const told = { ...facts, facts: [{ section: 'do', fact: 'Replace about 20–30% of the water weekly. Cardinal tetras (Paracheirodon axelrodi) live below pH 5.5. Below pH 7.3 more of it is ammonium (NH4+). Wait 2 weeks, then add CO2. Keep pH 6.0–6.5. About 2,000 ppm. Lights on 24/24. Keep pH 7.2 for 6 days. Dose 1.500 mg. Specific gravity about 1.020. Use 0.125 g. A shop lists it at 200.000đ/kg. One shop doses 1.234,5 mg. Another costs 2,500.00.', source: 2 }] }
async function reworded(before: string, after: string, names: string[] = []) {
  const e = { definition: 'Một câu.', body: `<p>${before}</p>` }
  const { llm } = model([{}, {}, {}], [], { [before]: after })
  return rewordLoose(llm, 'opus', told, e, [{ text: before, block: before, verdicts: ['loose', 'loose'], why: ['x'] }], { rules: async () => [], names })
}

test('a rewording that drops a figure the facts carry keeps the old wording; a figure they don\'t carry may go', async () => {
  const r = await reworded('Thay 20–30% nước mỗi tuần.', 'Thay nước một phần đều đặn.')
  expect(r.entry.body).toBe('<p>Thay 20–30% nước mỗi tuần.</p>')
  expect(r.log).toEqual(['Loose, rewording broke a house rule or dropped a specific, old wording kept for the reader: "Thay 20–30% nước mỗi tuần." (not "Thay nước một phần đều đặn.": it drops the figure 20, the figure 30)'])
  expect((await reworded('Thay 40% nước mỗi tuần.', 'Thay nước một phần mỗi tuần.')).entry.body).toBe('<p>Thay nước một phần mỗi tuần.</p>')
  expect((await reworded('Thay 20–30% nước mỗi tuần.', 'Thay khoảng 20–30% nước mỗi tuần.')).entry.body).toBe('<p>Thay khoảng 20–30% nước mỗi tuần.</p>')
  // Grok's read: a formula's digit and the facts' source number are no figures; 6.0 is 6; a figure a formula sits beside still counts.
  expect((await reworded('Cây cần CO2 mỗi ngày.', 'Cây cần khí cacbonic mỗi ngày.')).entry.body).toBe('<p>Cây cần khí cacbonic mỗi ngày.</p>')
  expect((await reworded('Dưới pH 7,3 nó ở dạng NH4+.', 'Dưới pH 7,3 nó ở dạng amoni.')).entry.body).toBe('<p>Dưới pH 7,3 nó ở dạng amoni.</p>')
  expect((await reworded('Giữ pH 6.0–6.5.', 'Giữ pH 6–6,5.')).entry.body).toBe('<p>Giữ pH 6–6,5.</p>')
  expect((await reworded('Sau 2 tuần thì bơm CO2.', 'Sau đó thì bơm CO2.')).entry.body).toBe('<p>Sau 2 tuần thì bơm CO2.</p>')
  // A thousands group is one number; a figure given twice goes when it goes once; a figure written after pH counts.
  expect((await reworded('Cần khoảng 2.000 ppm.', 'Cần nhiều ppm.')).entry.body).toBe('<p>Cần khoảng 2.000 ppm.</p>')
  expect((await reworded('Cần khoảng 2,000 ppm.', 'Cần nhiều ppm.')).entry.body).toBe('<p>Cần khoảng 2,000 ppm.</p>')
  expect((await reworded('Giá 200.000đ một ký.', 'Giá rẻ.')).entry.body).toBe('<p>Giá 200.000đ một ký.</p>')
  expect((await reworded('Có 1.651 loài.', 'Có 1651 loài.')).entry.body).toBe('<p>Có 1651 loài.</p>')
  expect((await reworded('Giữ pH 6.0 và đợi 6 ngày.', 'Giữ pH 6.0.')).entry.body).toBe('<p>Giữ pH 6.0 và đợi 6 ngày.</p>')
  expect((await reworded('Bật đèn 24/24.', 'Bật đèn 24 giờ.')).entry.body).toBe('<p>Bật đèn 24/24.</p>')
  expect((await reworded('Giữ pH7,2.', 'Giữ pH ổn định.')).entry.body).toBe('<p>Giữ pH7,2.</p>')
  // Each text read in its own language's way: the facts' English "1.500" is 1.5 and "1.020" is 1.02, the entry's "1,020" too.
  expect((await reworded('Liều 1,5 mg.', 'Liều nhỏ.')).entry.body).toBe('<p>Liều 1,5 mg.</p>')
  expect((await reworded('Giữ tỷ trọng khoảng 1,02.', 'Giữ tỷ trọng phù hợp.')).entry.body).toBe('<p>Giữ tỷ trọng khoảng 1,02.</p>')
  expect((await reworded('Giữ tỷ trọng khoảng 1,020.', 'Giữ tỷ trọng khoảng 1,02.')).entry.body).toBe('<p>Giữ tỷ trọng khoảng 1,02.</p>')
  expect((await reworded('Dùng 0,125 g.', 'Dùng một ít.')).entry.body).toBe('<p>Dùng 0,125 g.</p>')
  // Grok's read: the entry's own figures read the Vietnamese way only, so a changed figure is a dropped one.
  expect((await reworded('Giá 200.000đ một ký.', 'Giá 200đ một ký.')).entry.body).toBe('<p>Giá 200.000đ một ký.</p>')
  expect((await reworded('Cần khoảng 2.000 ppm.', 'Cần khoảng 2,000 ppm.')).entry.body).toBe('<p>Cần khoảng 2.000 ppm.</p>')
  expect((await reworded('Giữ pH 6,0–6,5.', 'Giữ pH 6–6.5.')).entry.body).toBe('<p>Giữ pH 6–6.5.</p>')
  // A fact with both marks reads whole, the Vietnamese way and the English way: neither figure may go.
  expect((await reworded('Liều 1.234,5 mg.', 'Liều nhỏ.')).entry.body).toBe('<p>Liều 1.234,5 mg.</p>')
  expect((await reworded('Giá 2.500đ.', 'Giá rẻ.')).entry.body).toBe('<p>Giá 2.500đ.</p>')
})

test('a rewording that drops a named example, a page\'s name or a Latin name the facts write, keeps the old wording', async () => {
  expect((await reworded('Cá neon vua ưa nước chua.', 'Có loài ưa nước chua.', ['Cá neon vua'])).entry.body).toBe('<p>Cá neon vua ưa nước chua.</p>')
  expect((await reworded('Paracheirodon axelrodi sống ở pH dưới 5,5.', 'Có loài sống ở pH dưới 5,5.')).entry.body).toBe('<p>Paracheirodon axelrodi sống ở pH dưới 5,5.</p>')
  expect((await reworded('Cá neon vua ưa nước chua.', 'Cá neon vua sống ở nước chua.', ['Cá neon vua'])).entry.body).toBe('<p>Cá neon vua sống ở nước chua.</p>')
  // Grok's read: a one-word name is an everyday word too; a Latin name counts in another case.
  expect((await reworded('Nuôi mono trong bể lợ.', 'Nuôi cá trong bể lợ.', ['Mono', 'Cá neon vua'])).entry.body).toBe('<p>Nuôi cá trong bể lợ.</p>')
  expect((await reworded('Paracheirodon Axelrodi sống ở pH dưới 5,5.', 'Có loài sống ở pH dưới 5,5.')).entry.body).toBe('<p>Paracheirodon Axelrodi sống ở pH dưới 5,5.</p>')
  // A page's name swapped for a longer one is a drop: the longer is found first.
  expect((await reworded('Cá rô ăn tạp.', 'Cá rô phi ăn tạp.', ['Cá rô', 'Cá rô phi'])).entry.body).toBe('<p>Cá rô ăn tạp.</p>')
  expect((await reworded('Cá rô phi ăn tạp.', 'Cá rô phi ăn mọi thứ.', ['Cá rô', 'Cá rô phi'])).entry.body).toBe('<p>Cá rô phi ăn mọi thứ.</p>')
})

test('a rewording that drops a caution, a death or a must, keeps the old wording', async () => {
  expect((await reworded('Cá thả sớm rất dễ bệnh và chết.', 'Cá thả sớm rất dễ mắc bệnh.')).entry.body).toBe('<p>Cá thả sớm rất dễ bệnh và chết.</p>')
  expect((await reworded('Lũa mới phải ngâm trước.', 'Lũa mới thường được ngâm trước.')).entry.body).toBe('<p>Lũa mới phải ngâm trước.</p>')
  expect((await reworded('Lũa mới phải ngâm trước.', 'Lũa mới phải ngâm kỹ trước.')).entry.body).toBe('<p>Lũa mới phải ngâm kỹ trước.</p>')
  // Grok's read: the same words in a phrase that is no caution.
  expect((await reworded('Màu sắc độc đáo.', 'Màu sắc lạ.')).entry.body).toBe('<p>Màu sắc lạ.</p>')
  expect((await reworded('Có phải thay nước không?', 'Thay nước định kỳ.')).entry.body).toBe('<p>Thay nước định kỳ.</p>')
  expect((await reworded('Đây không phải là muối.', 'Đây chẳng là muối.')).entry.body).toBe('<p>Đây chẳng là muối.</p>')
})

// The chief of staff, 15 Nov 2026: a dropped piece of advice counts. Chu trình nitơ's seeding sentence lost its established
// tank's water, floss and media to a rewording the fact read called supported.
test('a rewording that drops a piece of advice, an option or a step the old wording gave, keeps the old wording', async () => {
  const seeding = 'Châm thêm men vi sinh của hãng uy tín, hoặc lấy nước, bông lọc từ một bể đã ổn định; riêng vật liệu lọc thì chỉ lấy từ bể đã ổn định mà cá trong đó đều khỏe.'
  const r = await reworded(seeding, 'Châm thêm men vi sinh nitrat hóa của hãng uy tín.')
  expect(r.entry.body).toBe(`<p>${seeding}</p>`)
  expect(r.log[0]).toContain('it drops the advice "lấy nước", the advice "bông lọc từ một bể đã ổn định", the advice "riêng vật liệu lọc thì chỉ lấy từ bể đã ổn định mà cá trong đó đều khỏe"')
  // One option of a list.
  expect((await reworded('Nếu pH thấp, thêm baking soda, đá vôi, san hô vụn hoặc vỏ sò.', 'Nếu pH thấp, thêm baking soda, đá vôi hoặc vỏ sò.')).entry.body).toBe('<p>Nếu pH thấp, thêm baking soda, đá vôi, san hô vụn hoặc vỏ sò.</p>')
  // A rewording that keeps each part, in its own words, stays.
  expect((await reworded('Bể càng lâu năm, pH càng tụt dần do chất hữu cơ tích lại.', 'Khi bể lâu năm, pH thường tụt dần do chất hữu cơ tích lại.')).entry.body).toBe('<p>Khi bể lâu năm, pH thường tụt dần do chất hữu cơ tích lại.</p>')
  expect((await reworded('Clo trong nước sẽ giết vi khuẩn có lợi.', 'Nước máy có thể chứa clo, sẽ giết vi khuẩn có lợi.')).entry.body).toBe('<p>Nước máy có thể chứa clo, sẽ giết vi khuẩn có lợi.</p>')
})

// Grok's read of 15 Nov 2026: four ways a rewrite on notes still lost a read sentence with no note to say so.
test('a rewrite\'s drop check: a part with one word left, a figure by its number, a phrase let go only, and a definition cut while its sentence stands in the body', () => {
  const said = { facts: [{ fact: 'pH 4.0 is ten times more acidic than pH 5.0; cardinals live below pH 5.5' }, { fact: 'Change 20–30% weekly; wait 4 weeks' }] }
  type Stop = Parameters<typeof droppedInRewrite>[3][number]
  const drop = (before: { definition: string; body: string }, after: { definition: string; body: string }, stops: Stop[] = [], free: string[] = []) => droppedInRewrite(before, after, said, stops, [], free)
  const note = (t: string, lost: string) => `The rewrite dropped from "${t}" ${lost}, and nothing lets that sentence go: write it as it was, word for word.`
  const one = 'Một câu.'
  // A part kept only by "nước", which the merged sentence says for another reason.
  expect(drop({ definition: one, body: '<p>Thay 20–30% nước mỗi tuần, nước đã khử clo.</p><p>Ngâm lũa mới 1–2 tuần.</p>' }, { definition: one, body: '<p>Ngâm lũa mới 1–2 tuần, thay 20–30% nước.</p>' }))
    .toEqual([note('Thay 20–30% nước mỗi tuần, nước đã khử clo.', 'the advice "nước đã khử clo"')])
  // A merge that keeps every word stays.
  expect(drop({ definition: one, body: '<p>Ngâm lũa mới 1–2 tuần.</p><p>Thay nước mỗi ngày.</p>' }, { definition: one, body: '<p>Ngâm lũa mới 1–2 tuần và thay nước mỗi ngày.</p>' })).toEqual([])
  // 4,0 cut while "4 tuần" stands: the 4 left over is the sentence's 4,0.
  expect(drop({ definition: one, body: '<p>pH 4,0 là rất chua.</p><p>Đợi 4 tuần.</p>' }, { definition: one, body: '<p>pH rất chua.</p><p>Đợi 4 tuần.</p>' }))
    .toEqual([note('pH 4,0 là rất chua.', 'the figure 4,0')])
  // The term's free list: "10 lần" lets those words go, not the worked example's figures; the sentence listed whole goes.
  const log = 'Mỗi nấc cách nhau 10 lần, tức là pH 4,0 chua gấp 10 lần pH 5,0.'
  const cut = drop({ definition: one, body: `<p>${log}</p>` }, { definition: one, body: '<p>Thang đo.</p>' }, [], ['10 lần'])
  expect(cut).toHaveLength(1)
  expect(cut[0]).toContain('the figure 4,0, the figure 5,0')
  expect(drop({ definition: one, body: `<p>${log}</p>` }, { definition: one, body: '<p>Thang đo.</p>' }, [], [log])).toEqual([])
  // "Cá neon vua" let go: the name may change, the rest of the sentence stays.
  expect(drop({ definition: one, body: '<p>Cá neon vua sống dưới pH 5,5.</p>' }, { definition: one, body: '<p>Có loài chịu nước chua.</p>' }, [], ['Cá neon vua'])[0]).toContain('the figure 5,5')
  // A definition cut to two words, its old sentence still in the body.
  const lead = 'Giữ pH ổn định quan trọng hơn con số chính xác.'
  expect(drop({ definition: lead, body: `<p>${lead}</p>` }, { definition: 'Độ chua.', body: `<p>${lead}</p>` })).toHaveLength(1)
  // Grok's second read: half a part's words left is not enough, here "lấy" of "lấy nước".
  const seeding = 'Châm thêm men vi sinh của hãng uy tín, hoặc lấy nước, bông lọc từ một bể đã ổn định; riêng vật liệu lọc thì chỉ lấy từ bể đã ổn định mà cá trong đó đều khỏe.'
  expect(drop({ definition: one, body: `<p>${seeding}</p>` }, { definition: one, body: '<p>Châm thêm men vi sinh của hãng uy tín, hoặc lấy từ một bể đã ổn định; riêng thì chỉ lấy từ bể đã ổn định mà cá trong đó đều khỏe.</p>' })[0]).toContain('the advice "lấy nước"')
  // A sentence with quotation marks of its own, on the free list, goes; a stop lets go the sentence the check stopped.
  const shop = 'Nhiều tiệm ghi lũa sa tùng là "không ra màu", còn tạp chí cá cảnh thì nói gỗ nào cũng tiết tanin.'
  expect(drop({ definition: one, body: `<p>${shop}</p><p>Gỗ mềm.</p>` }, { definition: one, body: '<p>Gỗ mềm.</p>' })).toHaveLength(1)
  expect(drop({ definition: one, body: `<p>${shop}</p><p>Gỗ mềm.</p>` }, { definition: one, body: '<p>Gỗ mềm.</p>' }, [], [shop])).toEqual([])
  expect(drop({ definition: one, body: `<p>${shop}</p><p>Gỗ mềm.</p>` }, { definition: one, body: '<p>Gỗ mềm.</p>' }, [{ text: shop }])).toEqual([])
  // Grok's third read: a step inside another sentence's quotation marks isn't freed by a stop on that sentence; a passage
  // on the free list frees each of its sentences.
  const step = { facts: [{ fact: 'Soak new wood 2 weeks before use.' }] }
  const shopSays = 'Nhiều tiệm ghi "Ngâm 2 tuần." là đủ, còn sách thì nói khác.'
  const stepGone = droppedInRewrite({ definition: one, body: `<p>Ngâm 2 tuần.</p><p>${shopSays}</p>` }, { definition: one, body: `<p>${shopSays}</p>` }, step, [{ text: shopSays }])
  expect(stepGone).toHaveLength(1)
  expect(stepGone[0]).toContain('the advice "Ngâm 2 tuần"')
  expect(drop({ definition: one, body: '<p>Đừng sốc cá.</p><p>Thả từ từ.</p>' }, { definition: one, body: '<p>Thả từ từ.</p>' })[0]).toContain('the caution "đừng"')
  expect(drop({ definition: one, body: '<p>Lũa nổi. Đừng luộc lũa.</p><p>Thả từ từ.</p>' }, { definition: one, body: '<p>Thả từ từ.</p>' }, [], ['Lũa nổi. Đừng luộc lũa.'])).toEqual([])
  const passage = 'Lũa nổi. Nhiều tiệm ghi "không ra màu", còn tạp chí thì nói khác.'
  expect(drop({ definition: one, body: `<p>${passage}</p><p>Gỗ mềm.</p>` }, { definition: one, body: '<p>Gỗ mềm.</p>' }, [], [passage])).toEqual([])
  // Grok's fourth to sixth reads: a stop on a piece the splitter cut inside a quotation frees that piece, never the
  // separate step.
  const told = 'Sách nói "xong." Ngâm 2 tuần.'
  expect(droppedInRewrite({ definition: one, body: `<p>Ngâm 2 tuần.</p><p>${told}</p>` }, { definition: one, body: `<p>${told}</p>` }, step, [{ text: told }])[0]).toContain('the advice "Ngâm 2 tuần"')
  for (const shop of ['Sách nói "Xong. Ngâm 2 tuần."', 'Sách nói "Xong. Ngâm 2 tuần." Rồi thôi.', 'Sách nói "Xong. Ngâm 2 tuần".']) {
    const pieces = sentences({ definition: '', body: `<p>${shop}</p>` }).map(x => ({ text: x.text }))
    expect(droppedInRewrite({ definition: one, body: `<p>Ngâm 2 tuần.</p><p>${shop}</p>` }, { definition: one, body: `<p>${shop}</p>` }, step, pieces.slice(-1))[0]).toContain('the advice "Ngâm 2 tuần"')
    expect(droppedInRewrite({ definition: one, body: `<p>Ngâm 2 tuần.</p><p>${shop}</p>` }, { definition: one, body: '<p>Ngâm 2 tuần.</p>' }, step, pieces)).toEqual([])
  }
  // A sentence moved from the body to the definition is kept.
  expect(drop({ definition: 'Lũa là gỗ khô.', body: '<p>Lũa làm nước ngả vàng.</p>' }, { definition: 'Lũa là gỗ khô. Lũa làm nước ngả vàng.', body: '' })).toEqual([])
  // A sentence said twice, its repeat taken out, goes by the free list too (GH's notes line: what GH measures is said once,
  // in the definition), and so does a step whose words stand only inside another sentence.
  const measures = 'GH là tổng canxi và magie hòa tan trong nước.'
  expect(drop({ definition: measures, body: `<p>${measures} Đo bằng dGH.</p>` }, { definition: measures, body: '<p>Đo bằng dGH.</p>' })).toHaveLength(1)
  expect(drop({ definition: measures, body: `<p>${measures} Đo bằng dGH.</p>` }, { definition: measures, body: '<p>Đo bằng dGH.</p>' }, [], [measures])).toEqual([])
  expect(drop({ definition: one, body: '<p>Ngâm lũa mới 2 tuần.</p><p>Lũa cũ thì không cần ngâm lũa mới 2 tuần.</p>' }, { definition: one, body: '<p>Lũa cũ thì không cần ngâm lũa mới 2 tuần.</p>' })).toHaveLength(1)
  // The seventh read: a kind's sentence kept only under another kind is gone from its own (Lũa's "Chưa thấy tiệm Việt Nam
  // bán dưới tên tiếng Việt.", under two kinds); a kind renamed keeps its sentences.
  const none = 'Chưa thấy tiệm Việt Nam bán dưới tên tiếng Việt.'
  const kinds = (b: string) => ({ definition: one, body: `<ul><li><strong>Lũa đỗ quyên</strong> Chìm nhanh. ${none}</li><li><strong>${b}</strong> Nổi lâu. ${none}</li></ul>` })
  expect(drop(kinds('Lũa mopani'), { definition: one, body: `<ul><li><strong>Lũa đỗ quyên</strong> Chìm nhanh. ${none}</li><li><strong>Lũa mopani</strong> Nổi lâu.</li></ul>` }))
    .toEqual([note(none, `the advice "${none.slice(0, -1)}" under Lũa mopani`)])
  expect(drop(kinds('Lũa mopani'), kinds('Gỗ mopani'))).toEqual([])
  // The eighth read: a stop on one copy lets that copy go, not the other kind's.
  const cutBoth = { definition: one, body: '<ul><li><strong>Lũa đỗ quyên</strong> Chìm nhanh.</li><li><strong>Lũa mopani</strong> Nổi lâu.</li></ul>' }
  expect(drop(kinds('Lũa mopani'), cutBoth, [{ text: none, item: 'Lũa mopani' }])).toEqual([note(none, `the advice "${none.slice(0, -1)}" under Lũa đỗ quyên`)])
  expect(drop(kinds('Lũa mopani'), cutBoth, [{ text: none, item: 'Lũa mopani' }, { text: none, item: 'Lũa đỗ quyên' }])).toEqual([])
  // The Sonnet reviewer's read: a sentence said under two headings can't lose one copy unseen, and a piece of advice must
  // stand in one new sentence, not in the new sentences' words pooled.
  const twice = 'Không đo pH trong lúc bể đang chạy chu trình.'
  const sections = (end: string) => ({ definition: one, body: `<h3>Nên làm gì</h3><p>Thay nước đều.</p><p>${twice}</p><h3>Sai lầm hay gặp</h3>${end}` })
  expect(drop(sections(`<p>${twice}</p>`), sections(''))).toEqual([note(twice, `the advice "${twice.slice(0, -1)}"`)])
  expect(drop({ definition: one, body: '<p>Cá cần nước sạch.</p><p>Thay nước đều.</p>' }, { definition: one, body: '<p>Cá cần ăn đều.</p><p>Thay nước sạch hằng tuần.</p>' }))
    .toEqual([note('Cá cần nước sạch.', 'the advice "Cá cần nước sạch"')])
})

test('a reworded sentence in the body is written back escaped, and one still loose stays, logged; a rewording of two sentences isn\'t placed', async () => {
  const e = { definition: 'Một câu.', body: '<p>Đá &amp; san hô làm pH lên.</p>' }
  const loose = [{ text: 'Đá & san hô làm pH lên.', block: 'Đá & san hô làm pH lên.', verdicts: ['loose' as const, 'loose' as const], why: ['x'] }]
  const { llm } = model([{ 'Đá & vỏ ốc làm pH lên <nhẹ>.': 'loose: y' }, { 'Đá & vỏ ốc làm pH lên <nhẹ>.': 'loose: y' }, {}], [], { 'Đá & san hô làm pH lên.': 'Đá & vỏ ốc làm pH lên <nhẹ>.' })
  const r = await rewordLoose(llm, 'opus', facts, e, loose)
  expect(r.entry.body).toBe('<p>Đá &amp; vỏ ốc làm pH lên &lt;nhẹ&gt;.</p>')
  expect(r.log).toEqual(['Loose, reworded and still loose: "Đá & san hô làm pH lên." → "Đá & vỏ ốc làm pH lên <nhẹ>." (loose, loose, supported)'])
  const two = model([], [], { 'Đá & san hô làm pH lên.': 'Đá làm pH lên. San hô cũng vậy.' })
  expect(await rewordLoose(two.llm, 'opus', facts, e, loose)).toEqual({ entry: e, log: ['Loose, not reworded: "Đá & san hô làm pH lên."'], stops: [] })
})

// Codex, 14 Nov 2026: a rewording word for word the same as the definition took the definition's stop away with it.
test('a sentence is known by where it stands: a rewording that matches another sentence, runs into the next, or a sentence written twice, isn\'t placed', async () => {
  const e = { definition: 'Nó chìm ngay.', body: '<p>Nó chìm nhanh. Nó nổi lại.</p><p>Gỗ mềm.</p><p>Gỗ mềm.</p>' }
  const flag = (text: string, block: string) => ({ text, block, verdicts: ['loose' as const, 'loose' as const], why: ['x'] })
  const same = model([], [], { 'Nó chìm nhanh.': 'Nó chìm ngay.' })
  expect(await rewordLoose(same.llm, 'opus', facts, e, [flag('Nó chìm nhanh.', 'Nó chìm nhanh. Nó nổi lại.')])).toEqual({ entry: e, log: ['Loose, not reworded: "Nó chìm nhanh."'], stops: [] })
  expect(same.calls).toHaveLength(1)
  const runOn = model([], [], { 'Nó chìm nhanh.': 'Nó chìm khá nhanh' })
  expect((await rewordLoose(runOn.llm, 'opus', facts, e, [flag('Nó chìm nhanh.', 'Nó chìm nhanh. Nó nổi lại.')])).log).toEqual(['Loose, not reworded: "Nó chìm nhanh."'])
  const twice = model([], [], { 'Gỗ mềm.': 'Gỗ khá mềm.' })
  expect(await rewordLoose(twice.llm, 'opus', facts, e, [flag('Gỗ mềm.', 'Gỗ mềm.')])).toEqual({ entry: e, log: ['Loose, left as written (not placeable): "Gỗ mềm."'], stops: [] })
  // Two rewordings that land on the same words: the second isn't placed, so the final read judges each sentence once.
  const both = model([{}, {}, {}], [], { 'Nó chìm nhanh.': 'Nó chìm khá nhanh.', 'Nó nổi lại.': 'Nó chìm khá nhanh.' })
  const r = await rewordLoose(both.llm, 'opus', facts, e, [flag('Nó chìm nhanh.', 'Nó chìm nhanh. Nó nổi lại.'), flag('Nó nổi lại.', 'Nó chìm nhanh. Nó nổi lại.')])
  expect(r.entry.body).toBe('<p>Nó chìm khá nhanh. Nó nổi lại.</p><p>Gỗ mềm.</p><p>Gỗ mềm.</p>')
  expect(r.log).toEqual(['Loose, not reworded: "Nó nổi lại."', 'Loose, reworded: "Nó chìm nhanh." → "Nó chìm khá nhanh." (supported)'])
})
