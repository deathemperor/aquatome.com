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

test('an entry is split into its sentences: the definition\'s, then each paragraph\'s and list item\'s, as plain text', () => {
  expect(sentences(entry).map(s => s.text)).toEqual(['pH đo độ chua của nước.', 'Nó đi từ 0 tới 14.', 'Lá bàng làm pH xuống.', 'Nên thả lá từ từ rồi đo pH.', 'Làm pH lên: san hô.'])
  expect(sentences(entry)[3]!.block).toBe('Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.')
})

test('two reads of three that say the facts don\'t carry a sentence stop it; one doesn\'t; loose is advice', async () => {
  const advice = 'Nên thả lá từ từ rồi đo pH.'
  const { llm, calls } = model([{ [advice]: 'unsupported: not in the facts', 'Lá bàng làm pH xuống.': 'loose: stronger' }, { [advice]: 'unsupported: advice not given' }, { 'Lá bàng làm pH xuống.': 'loose: stronger', 'Nó đi từ 0 tới 14.': 'unsupported: no range given' }])
  const r = await checkSentences(llm, facts, entry)
  expect(calls).toHaveLength(3)
  expect(r.stops.map(s => s.text)).toEqual([advice])
  expect(stopNote(r.stops[0]!)).toBe('"Nên thả lá từ từ rồi đo pH.": the facts don\'t carry it (unsupported, unsupported, supported): not in the facts / advice not given')
  expect(r.loose.map(s => s.text)).toEqual(['Lá bàng làm pH xuống.'])
  expect(r.score).toBe(0.8)
})

test('a sentence one read calls contradicted is read three times more alone, and stops when two of those agree', async () => {
  const s = 'Lá bàng làm pH xuống.'
  const yes = model([{ [s]: 'contradicts: raises it' }, {}, {}], ['contradicts: raises it', 'supported', 'contradicts: raises it'])
  const r = await checkSentences(yes.llm, facts, entry)
  expect(yes.calls).toHaveLength(6)
  expect(yes.calls[3]).toContain(`PARAGRAPH:\nLá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.\n\nSENTENCE:\n${s}`)
  expect(r.stops.map(x => x.verdicts)).toEqual([['contradicts', 'supported', 'supported', 'contradicts', 'supported', 'contradicts']])
  const no = model([{ [s]: 'contradicts: raises it' }, {}, {}], ['supported', 'loose: x', 'contradicts: y'])
  expect((await checkSentences(no.llm, facts, entry)).stops).toEqual([])
})

test('a read that leaves a sentence out, or gives a verdict not on the list, neither stops it nor clears it', async () => {
  const llm: Llm = async () => ({ verdicts: [{ n: 4, verdict: 'unsupported' }, { n: 5, verdict: 'wrong' }] }) as never
  const r = await checkSentences(llm, facts, entry)
  expect(r).toMatchObject({ score: 0.8, loose: [] })
  expect(r.stops.map(s => s.text)).toEqual(['Nên thả lá từ từ rồi đo pH.'])
  const none: Llm = async () => ({}) as never
  expect(await checkSentences(none, facts, entry)).toEqual({ score: 1, stops: [], loose: [] })
})

test('"not a claim" takes a sentence out of the score, and never keeps two stops from stopping it', async () => {
  const s = 'Nó đi từ 0 tới 14.'
  const { llm } = model([{ [s]: 'not a claim' }, { [s]: 'not a claim' }, { 'Nên thả lá từ từ rồi đo pH.': 'unsupported: x' }])
  const r = await checkSentences(llm, facts, entry)
  expect(r).toMatchObject({ score: 1, stops: [], loose: [] })
})

// The middle path's trial on Lũa (14 Nov 2026): 4 of 12 rewordings hedged ("many sources say…, but one notes…"), and a
// rewording can read worse than the line it replaced.
test('the middle path rewords loose sentences once, no hedge; a rewording read as unsupported is dropped and the old one stays', async () => {
  const loose = [
    { text: 'Lá bàng làm pH xuống.', block: 'Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.', verdicts: ['loose' as const, 'loose' as const], why: ['stronger than the facts'] },
    { text: 'pH đo độ chua của nước.', block: entry.definition, verdicts: ['loose' as const, 'loose' as const], why: ['also alkalinity'] },
    { text: 'Làm pH lên: san hô.', block: 'Làm pH lên: san hô.', verdicts: ['loose' as const, 'loose' as const], why: ['x'] },
  ]
  const reword = { 'Lá bàng làm pH xuống.': 'Lá bàng làm pH xuống chút ít.', 'pH đo độ chua của nước.': 'pH đo độ chua hay kiềm của nước & nhiều hơn.' }
  const { llm, calls } = model([{ 'pH đo độ chua hay kiềm của nước & nhiều hơn.': 'unsupported: added' }, { 'pH đo độ chua hay kiềm của nước & nhiều hơn.': 'unsupported: added' }, {}], [], reword)
  const r = await rewordLoose(llm, 'opus', facts, entry, loose)
  expect(calls[0]).toContain('không rào đón ("có nguồn cho rằng", "nhiều nguồn", "có tiệm ghi")')
  expect(calls[0]).toContain('1. CÂU: Lá bàng làm pH xuống.\n   ĐOẠN: Lá bàng làm pH xuống. Nên thả lá từ từ rồi đo pH.\n   LÝ DO: stronger than the facts')
  // Only the reworded sentences are read again, each in its paragraph as reworded.
  expect(calls[1]).toContain('1. Lá bàng làm pH xuống chút ít.\n   PARAGRAPH: Lá bàng làm pH xuống chút ít. Nên thả lá từ từ rồi đo pH.')
  expect(calls).toHaveLength(4)
  expect(r.entry.body).toBe('<h3>Trong bể</h3><p>Lá bàng làm pH xuống chút ít. Nên thả lá từ từ rồi đo pH.</p><ul><li><strong>Làm pH lên:</strong> san hô.</li></ul>')
  expect(r.entry.definition).toBe(entry.definition)
  expect(r.log).toEqual([
    'Loose, left as written (not placeable): "Làm pH lên: san hô."',
    'Loose, reworded: "Lá bàng làm pH xuống." → "Lá bàng làm pH xuống chút ít." (supported, supported, supported)',
    'Loose, rewording read as unsupported, old wording kept: "pH đo độ chua của nước." (not "pH đo độ chua hay kiềm của nước & nhiều hơn.": unsupported, unsupported, supported)',
  ])
})

test('a reworded sentence in the body is written back escaped, and one still loose stays, logged', async () => {
  const e = { definition: 'Một câu.', body: '<p>Đá &amp; san hô làm pH lên.</p>' }
  const loose = [{ text: 'Đá & san hô làm pH lên.', block: 'Đá & san hô làm pH lên.', verdicts: ['loose' as const, 'loose' as const], why: ['x'] }]
  const { llm } = model([{ 'Đá & vỏ ốc làm pH lên <nhẹ>.': 'loose: y' }, { 'Đá & vỏ ốc làm pH lên <nhẹ>.': 'loose: y' }, {}], [], { 'Đá & san hô làm pH lên.': 'Đá & vỏ ốc làm pH lên <nhẹ>.' })
  const r = await rewordLoose(llm, 'opus', facts, e, loose)
  expect(r.entry.body).toBe('<p>Đá &amp; vỏ ốc làm pH lên &lt;nhẹ&gt;.</p>')
  expect(r.log).toEqual(['Loose, reworded and still loose: "Đá & san hô làm pH lên." → "Đá & vỏ ốc làm pH lên <nhẹ>." (loose, loose, supported)'])
})
