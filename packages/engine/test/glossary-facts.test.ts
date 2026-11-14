import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkSentences, rewordLoose, sentences, stopNote } from '../src/glossary-facts'

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
