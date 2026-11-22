import { chmod, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { pattern, PHRASES } from '../src/phrases'
import { plain } from '../src/sentences'
import { applied, CAP, candidates, flagged, hitsIn, LANE, markOf, mendPage, partsOf, pick, reportName, SURE, unrecast, wordingMend, type Hit, type Part } from '../src/wording-mend'

const roots: string[] = []
let log = ''
const was = process.env.ENGINE_COST_LOG
beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wording-log-'))
  roots.push(dir)
  log = join(dir, 'cost.jsonl')
  process.env.ENGINE_COST_LOG = log
})
afterEach(async () => {
  if (was === undefined) delete process.env.ENGINE_COST_LOG
  else process.env.ENGINE_COST_LOG = was
  await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })))
})

type Answer = { picks?: { s: number; h: number; pick: number }[]; verdicts?: { s: number; ok: boolean; why?: string }[]; hedges?: unknown[]; sentences?: { s: number; vi: string }[] }
/** A stand-in model: each call's answer by what its schema asks for, in turn; every prompt kept. */
const model = (answers: { pick?: Answer[]; review?: Answer[]; recast?: Answer[] }) => {
  const asked: { kind: string; prompt: string }[] = []
  const left = { pick: [...(answers.pick ?? [])], review: [...(answers.review ?? [])], recast: [...(answers.recast ?? [])] }
  const llm: Llm = async <T>(a: { system: string; prompt: string; schema: object; model?: string }): Promise<T> => {
    const need = (a.schema as { required: string[] }).required[0]
    const kind = need === 'picks' ? 'pick' : need === 'verdicts' ? 'review' : 'recast'
    asked.push({ kind, prompt: a.prompt })
    const next = left[kind as keyof typeof left].shift()
    if (!next) throw new Error(`no ${kind} answer left`)
    return { hedges: [], ...next } as T
  }
  return { llm, asked }
}
const body = (...ps: string[]) => [{ field: 'body', text: ps.map(p => `<p>${p}</p>`).join('') }] as Part[]
/** A hit on a text of a sentence, whatever the table offers: for how a pick goes in. */
const at = (html: string, text: string): Hit => { const start = html.indexOf(text); return { say: 'x', from: text, start, end: start + text.length, options: [''], negated: false } }
const none = { sentences: 1, offered: 1, mendable: 1, swapped: 0, recast: 0, refused: 0, left: 0 }

test('the swap words: each holds its entry as the list finds it, none cuts how sure or how many, and five entries stay out', () => {
  expect(LANE.map(p => p.say)).toHaveLength(20)
  for (const p of LANE) for (const [k, to] of Object.entries(p.swap!)) {
    expect(new RegExp(pattern(p, 'vi'), 'iu').test(k), `${p.say}: ${k}`).toBe(true)
    expect(k, `${p.say}: ${k}`).toBe(k.toLowerCase())
    if (SURE.has(p.say)) expect(to, `${p.say}: ${k}`).not.toContain('')
  }
  for (const s of SURE) expect(LANE.some(p => p.say === s), s).toBe(true)
  // None of those is ever recast.
  expect([...SURE].filter(s => !unrecast(s))).toEqual([])
  // The repeat check counts "phần lớn", "hầu hết" and "đa số" as one word: no swap of one for another.
  expect(Object.values(LANE.find(p => p.say === 'phần lớn')!.swap!).flat()).toEqual(['chủ yếu là'])
  // Out of the lane: what only the source can fix, and two whose words would change what the page says ("recorded in"
  // isn't "lives in"; "tươi sống" takes in fresh dead food).
  for (const s of ['không xương sống', 'được xem là', 'được cho là', 'ghi nhận', 'thức ăn sống']) expect((PHRASES.vi ?? []).find(p => p.say === s)?.swap, s).toBeUndefined()
})

test('a pick goes in its text\'s place, and nothing else of the sentence changes', () => {
  const one = (html: string, to: string, i = 0) => applied(html, [{ hit: hitsIn(html)[i]!, to }])
  expect(one('Dù vậy, cá vẫn khỏe.', 'nhưng')).toBe('Nhưng cá vẫn khỏe.')
  expect(one('Dù vậy, cá vẫn khỏe.', 'tuy nhiên,')).toBe('Tuy nhiên, cá vẫn khỏe.')
  expect(one('Bạn nên thay 30% nước mỗi tuần.', '')).toBe('Thay 30% nước mỗi tuần.')
  expect(one('Nếu bể nhỏ, bạn nên thay nước nhiều hơn.', 'nên')).toBe('Nếu bể nhỏ, nên thay nước nhiều hơn.')
  expect(one('Cá con <strong>bơi tự do</strong> sau ba ngày.', 'bơi được')).toBe('Cá con <strong>bơi được</strong> sau ba ngày.')
  const cut = (html: string, ...texts: string[]) => applied(html, texts.map(t => ({ hit: at(html, t), to: '' })))
  expect(cut('<em>Nhờ vậy,</em> cá khỏe hơn.', 'Nhờ vậy,')).toBe('Cá khỏe hơn.')
  expect(cut('Cá khỏe, nhờ vậy, ít bệnh.', 'nhờ vậy,')).toBe('Cá khỏe, ít bệnh.')
  // The longest key first: "chỗ trú ẩn" is one text, not "chỗ trú" and a word left over.
  expect(hitsIn('Thả thêm chỗ trú ẩn cho cá.').map(h => h.key)).toEqual(['chỗ trú ẩn'])
  expect(one('Thả thêm chỗ trú ẩn cho cá.', 'chỗ trốn')).toBe('Thả thêm chỗ trốn cho cá.')
  // A negation anywhere earlier in the clause offers nothing: "không phải lựa chọn tốt nhất" is a weaker caution.
  expect(hitsIn('Đây không phải lựa chọn lý tưởng cho bể nhỏ.')).toMatchObject([{ say: 'lý tưởng', negated: true, options: [] }])
  expect(hitsIn('Cá không ăn rêu, dù vậy vẫn khỏe.')).toMatchObject([{ say: 'dù vậy', negated: false, options: ['tuy nhiên', 'nhưng'] }])
  // A longer key with no words where they would read wrong; "lý do là" not at a sentence's start.
  expect(hitsIn('Cá dành phần lớn thời gian trốn trong hang.')).toMatchObject([{ key: 'phần lớn thời gian', options: [] }])
  expect(hitsIn('Loài này lý tưởng nhất cho bể nhỏ.')).toMatchObject([{ key: 'lý tưởng nhất', options: ['tốt nhất'] }])
  expect(hitsIn('Nước cứng, nên bạn nên thay nước.')).toMatchObject([{ key: 'nên bạn nên', options: [] }])
  expect(hitsIn('Lý do là cá thiếu oxy.')).toMatchObject([{ say: 'lý do là', options: [] }])
  expect(hitsIn('Cá chết, lý do là thiếu oxy.')).toMatchObject([{ say: 'lý do là', options: ['là do', 'vì'] }])
  // A text the table doesn't know is a hit with nothing offered, for the recast.
  expect(hitsIn('Cá đực giữ lãnh thổ.')).toMatchObject([{ say: 'giữ lãnh thổ', options: [] }])
  // Inside a tag's attribute it isn't text.
  expect(hitsIn('<a title="dù vậy">Xem</a> thêm.')).toEqual([])
})

test('a cut takes only its text: two in one sentence, one after a full stop inside it, one before an entity', () => {
  const cut = (html: string, ...texts: string[]) => applied(html, texts.map(t => ({ hit: at(html, t), to: '' })))
  expect(cut('<em></em> Bạn nên thay nước, nhờ vậy, cá khỏe.', 'Bạn nên', 'nhờ vậy,')).toBe('<em></em> Thay nước, cá khỏe.')
  expect(cut('Nhờ vậy,&nbsp;cá khỏe.', 'Nhờ vậy,')).toBe('&nbsp;Cá khỏe.')
  expect(cut('<strong>Cách xử lý.</strong> Bạn cần cẩn thận và nhấc cây ra thật chậm.', 'Bạn cần')).toBe('<strong>Cách xử lý.</strong> Cẩn thận và nhấc cây ra thật chậm.')
  expect(cut('Nên nuôi chung với Hara spp. Bạn nên tìm hiểu kỹ trước.', 'Bạn nên')).toBe('Nên nuôi chung với Hara spp. Tìm hiểu kỹ trước.')
  expect(cut('<strong>Bạn nên</strong> thay nước.', 'Bạn nên')).toBe('Thay nước.')
})

test('a word is counted once per sentence, as what it became: a swap that left it is no swap for it', async () => {
  const { llm } = model({
    pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 1, h: 2, pick: 0 }] }],
    review: [{ verdicts: [{ s: 1, ok: true }] }],
  })
  const parts = body('Dù vậy, cá hung hăng.')
  const r = await mendPage(llm, 'species/a', parts)
  expect(r.changes.get('body')).toEqual(new Map([[0, 'Nhưng cá hung hăng.']]))
  const root = await site()
  const out = await outside()
  await writeFile(join(root, 'content', 'species', 'a', 'vi.json'), JSON.stringify({ name: 'A', body: '<p>Dù vậy, cá hung hăng.</p>' }))
  const m = model({ pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 1, h: 2, pick: 0 }] }], review: [{ verdicts: [{ s: 1, ok: true }] }], recast: [{ sentences: [] }] })
  const run = await wordingMend(root, { llm: m.llm, now: () => new Date('2026-11-23T02:00:00Z') }, { out, limit: 1, pages: ['species/a'] })
  expect(run.byEntry['dù vậy']).toEqual({ ...none, swapped: 1 })
  expect(run.byEntry['hung hăng']).toEqual({ ...none, left: 1 })
})

test('each sentence is kept or refused on its own; a pick off the list is none, and a sentence with a figure is never recast', async () => {
  const parts = body('Dù vậy, cá vẫn khỏe.', 'Cá rất hung hăng với cá khác.', 'Nhiệt độ 26 °C là lý tưởng.')
  const { llm, asked } = model({
    pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 2, h: 1, pick: 9 }, { s: 3, h: 1, pick: 1 }] }],
    review: [{ verdicts: [{ s: 1, ok: true }, { s: 2, ok: false, why: 'không tự nhiên' }] }, { verdicts: [{ s: 1, ok: true }] }],
    recast: [{ sentences: [{ s: 1, vi: 'Cá rất dữ với cá khác.' }] }],
  })
  const r = await mendPage(llm, 'species/a', parts)
  expect(asked.map(a => a.kind)).toEqual(['pick', 'review', 'recast', 'review'])
  expect(asked[2]!.prompt).not.toContain('26 °C.\n')
  expect(r.changes.get('body')).toEqual(new Map([[0, 'Nhưng cá vẫn khỏe.'], [1, 'Cá rất dữ với cá khác.']]))
  expect(r.outcomes.map(x => [x.n, x.step, x.kept])).toEqual([[0, 'swap', true], [2, 'swap', false], [1, 'recast', true]])
  expect(r.left).toMatchObject([{ n: 2, why: expect.stringContaining('a figure') }])
})

test('how sure and how many never change: only a plain sentence is recast, and a recast that brings in a hedge is refused', async () => {
  const parts = body(
    'Cá này gần như không ăn rêu.', // how sure: never recast
    'Phần lớn cá tetra thích nước mềm.', // how many: never recast
    'Dù vậy, cá có thể bỏ ăn và đôi khi thở gấp.', // a hedge
    'Dù vậy, loài này được cho là sống ở Lào.', // a listed word only the source can fix
    'Dù vậy, cá <em>gần như</em> không ăn rêu.', // a tag, and a hedge in it
    'Một số con đực hung hăng với cá cùng loài.', // a word of how many no hedge check reads
    'Cá cần chỗ trú.', // plain: the recast may take it
  )
  const { llm, asked } = model({ pick: [{ picks: [] }], recast: [{ sentences: [{ s: 1, vi: 'Cá có thể cần chỗ trốn.' }] }] })
  const r = await mendPage(llm, 'species/a', parts)
  expect(asked.map(a => a.kind)).toEqual(['pick', 'recast'])
  // Shown only as the next sentence's neighbour, never as one to write again.
  expect(asked[1]!.prompt).toMatch(/\[1\] Cá cần «chỗ trú»/)
  expect(asked[1]!.prompt).not.toMatch(/\[2\]/)
  expect(r.left.map(x => x.n)).toEqual([0, 1, 2, 3, 4, 5])
  expect(r.left.map(x => x.why.split(/[,:]/)[0])).toEqual(['it says how sure or how many', 'it says how sure or how many', 'it has a hedge', 'it has a listed word only its source can fix', 'it has a hedge', 'it has a hedge'])
  expect(r.outcomes).toMatchObject([{ n: 6, step: 'recast', kept: false, why: expect.stringContaining('brought in a hedge') }])
  expect(r.changes.size).toBe(0)
})

test('a recast is one sentence, plain, in the same letters', async () => {
  const parts = body('Cá đực giữ lãnh thổ.', 'Cá cái giữ lãnh thổ.', 'Cá con giữ lãnh thổ.')
  const { llm } = model({ recast: [{ sentences: [{ s: 1, vi: 'Cá đực dữ. Cần bể riêng.' }, { s: 2, vi: 'Cá cái <strong>dữ</strong>.' }, { s: 3, vi: 'Cá con rất hung ha\u0306ng.' }] }] })
  const r = await mendPage(llm, 'species/a', parts)
  expect(r.outcomes.map(x => x.why)).toEqual(['it became two sentences', 'it brought in a hedge, a figure, a word of how many or how sure, or a tag', 'it keeps or adds a listed word: hung hăng'])
})

test('a change that puts back a word the page repeats, its other parts counted too, is refused', async () => {
  const twice = '<p>Tuy nhiên, cá khỏe.</p><p>Tuy nhiên, cá ăn khỏe.</p>'
  const swap = (pick: number) => model({ pick: [{ picks: [{ s: 1, h: 1, pick }] }], review: [{ verdicts: [{ s: 1, ok: true }] }], recast: [{ sentences: [] }] }).llm
  const parts = [{ field: 'body', text: `${twice}<p>Dù vậy, cá sống theo đàn.</p>` }] as Part[]
  expect((await mendPage(swap(1), 'species/a', parts)).outcomes[0]).toMatchObject({ step: 'swap', kept: false, why: 'it puts back a word the page already repeats' })
  expect((await mendPage(swap(2), 'species/a', parts)).outcomes[0]).toMatchObject({ step: 'swap', kept: true, after: 'Nhưng cá sống theo đàn.' })
  // The repeats are counted over the whole page: here two in a part a person fixed.
  const { llm } = model({ recast: [{ sentences: [{ s: 1, vi: 'Tuy nhiên, cá đực đuổi cá khác khỏi chỗ của nó.' }] }] })
  const r = await mendPage(llm, 'species/a', body('Cá đực giữ lãnh thổ.'), { rest: twice })
  expect(r.outcomes[0]).toMatchObject({ step: 'recast', kept: false, why: 'it puts back a word the page already repeats' })
})

test(`a page gains at most ${CAP} of one word the lane puts in`, async () => {
  const fish = ['cá tetra', 'cá ngựa vằn', 'cá bảy màu', 'cá sặc', 'cá chuột']
  const parts = body(...fish.map(f => `Dù vậy, ${f} sống theo đàn.`))
  const { llm } = model({
    pick: [{ picks: fish.map((_, i) => ({ s: i + 1, h: 1, pick: 2 })) }],
    review: [{ verdicts: fish.map((_, i) => ({ s: i + 1, ok: true })) }],
    recast: [{ sentences: [] }],
  })
  const r = await mendPage(llm, 'species/a', parts)
  expect(r.outcomes.filter(x => x.kept)).toHaveLength(CAP)
  expect(r.outcomes.filter(x => !x.kept && x.step === 'swap').map(x => x.why)).toEqual([`the page would gain more than ${CAP} of "nhưng"`, `the page would gain more than ${CAP} of "nhưng"`])
  expect([...r.changes.get('body')!.values()]).toEqual(fish.slice(0, CAP).map(f => `Nhưng ${f} sống theo đàn.`))
})

test('a recast with a listed word, or one it was sent to take out, is refused', async () => {
  const parts = body('Cá đực giữ lãnh thổ quanh hang.', 'Cá cần chỗ trú.')
  const { llm } = model({
    pick: [{ picks: [{ s: 1, h: 1, pick: 0 }] }],
    recast: [{ sentences: [{ s: 1, vi: 'Bạn nên để cá đực có hang riêng.' }, { s: 2, vi: 'Cá cần chỗ trú.' }] }],
  })
  const r = await mendPage(llm, 'species/a', parts)
  expect(r.outcomes.map(x => x.why)).toEqual(['it keeps or adds a listed word: bạn nên', 'the writer gave it back as it was'])
  expect(r.changes.size).toBe(0)
})

test('parts a person fixed, references, headings and FAQ questions are left', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wording-parts-'))
  roots.push(dir)
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ sections: [{ key: 'diet', source: 'sf', fixed: true }, { key: 'care', source: 'sf' }] }))
  const parts = await partsOf(dir, { sections: { 'diet:sf': '<p>Bạn nên cho ăn tảo.</p>', 'care:sf': '<h3>Dù vậy</h3><p>Dù vậy, cá khỏe.</p>', 'references:sf': '<p>Bạn nên đọc.</p>' }, faq: [{ q: 'Bạn nên cho ăn gì?', a: 'Bạn nên cho ăn tảo.' }] })
  expect(parts.map(p => p.field)).toEqual(['sections.care:sf', 'faq.0.a'])
  expect(flagged(parts).map(f => [f.field, f.n])).toEqual([['sections.care:sf', 1], ['faq.0.a', 0]])
  expect(await partsOf(dir, { bodyFixed: true, body: '<p>Bạn nên.</p>', summary: ['Bạn nên.'], faq: [{ q: 'q', a: 'Bạn nên.' }] })).toEqual([{ field: 'faq.0.a', text: 'Bạn nên.' }])
  expect(await partsOf(dir, { bodyFixed: true, faqFixed: true, faq: [{ q: 'q', a: 'Bạn nên.' }] })).toEqual([])
  // A table's header is a heading, and a guide's references run from their heading to the part's end.
  const guide = [{ field: 'body', text: '<table><tr><th>pH lý tưởng</th></tr></table><p>Dù vậy, cá khỏe.</p><h3>Tài liệu tham khảo</h3><ul><li>Bạn nên đọc sách.</li></ul>' }]
  expect(flagged(guide).map(f => plain(f.html))).toEqual(['Dù vậy, cá khỏe.'])
})

const site = async () => {
  const root = await mkdtemp(join(tmpdir(), 'wording-root-'))
  roots.push(root)
  const put = async (path: string, v: unknown) => { await mkdir(join(root, 'content', path, '..'), { recursive: true }); await writeFile(join(root, 'content', path), JSON.stringify(v, null, 2)) }
  await put('species/a/vi.json', { name: 'A', sections: { 'care:sf': '<p>Dù vậy, cá vẫn khỏe.</p><p>Cá cần chỗ trú ẩn.</p>' } })
  await put('guides/b/vi.json', { name: 'B', body: '<p>Bạn nên thay nước.</p>', held: { checks: ['source'], at: '2026-11-20' } })
  await put('glossary/c/vi.json', { name: 'C', definition: '<p>Bạn nên đọc.</p>' })
  await put('breeds/d/vi.json', { name: 'D', body: '<p>Cá khỏe.</p>', summary: ['Cá khỏe.'], faq: [{ q: 'Cá có dữ không?', a: 'Cá đực rất hung hăng.' }] })
  return root
}
const outside = async () => { const dir = await mkdtemp(join(tmpdir(), 'wording-out-')); roots.push(dir); return dir }
const files = async (dir: string) => Object.fromEntries(await Promise.all((await readdir(dir, { recursive: true })).filter(f => f.endsWith('.json')).sort().map(async f => [f, await readFile(join(dir, f), 'utf8')])))

test('a run writes only under its out folder, takes each page up once for its marks, and a dry run calls no model', async () => {
  const root = await site()
  const out = await outside()
  const content = await files(join(root, 'content'))
  const dry = model({})
  const d0 = await wordingMend(root, { llm: dry.llm, now: () => new Date('2026-11-23T02:00:00Z') }, { out, limit: 40, dry: true })
  expect(dry.asked).toEqual([])
  expect(d0.pages).toEqual(['species/a', 'breeds/d'])
  expect(Object.keys(await files(out))).toEqual([reportName(d0)])

  const { llm, asked } = model({
    pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 2, h: 1, pick: 1 }] }, { picks: [{ s: 1, h: 1, pick: 1 }] }],
    review: [{ verdicts: [{ s: 1, ok: true }, { s: 2, ok: true }] }, { verdicts: [{ s: 1, ok: true }] }],
  })
  const r = await wordingMend(root, { llm, now: () => new Date('2026-11-23T02:00:00Z') }, { out, limit: 40 })
  expect(r.failed).toEqual([])
  expect(asked.map(a => a.kind)).toEqual(['pick', 'review', 'pick', 'review'])
  expect(await files(join(root, 'content'))).toEqual(content)
  expect(JSON.parse(await readFile(join(out, 'content/species/a/vi.json'), 'utf8')).sections['care:sf']).toBe('<p>Nhưng cá vẫn khỏe.</p><p>Cá cần chỗ trốn.</p>')
  expect(JSON.parse(await readFile(join(out, 'content/breeds/d/vi.json'), 'utf8')).faq[0]).toEqual({ q: 'Cá có dữ không?', a: 'Cá đực rất hung dữ.' })
  const state = JSON.parse(await readFile(join(out, '_wording-mend.json'), 'utf8')) as Record<string, { marks: string[] }>
  expect(state['species/a']!.marks).toEqual(['dù vậy: dù vậy, → tuy nhiên, | nhưng', 'chỗ trú: chỗ trú ẩn → chỗ trốn'])
  expect(r.byEntry['dù vậy']).toEqual({ ...none, swapped: 1 })

  // Marked for every text it has: not taken up again. A mark the page lacks (its entry's words changed) brings it back.
  const again = model({})
  expect((await wordingMend(root, { llm: again.llm, now: () => new Date() }, { out, limit: 40 })).pages).toEqual([])
  expect(again.asked).toEqual([])
  state['species/a']!.marks = ['dù vậy: dù vậy, → nhưng', 'chỗ trú: chỗ trú ẩn → chỗ trốn']
  await writeFile(join(out, '_wording-mend.json'), JSON.stringify(state))
  const back = model({ pick: [{ picks: [] }] })
  expect((await wordingMend(root, { llm: back.llm, now: () => new Date() }, { out, limit: 40 })).pages).toEqual(['species/a'])
})

test('a page whose model fails is neither written nor marked, and the run stops', async () => {
  const root = await site()
  const out = await outside()
  const { llm } = model({})
  const r = await wordingMend(root, { llm, now: () => new Date() }, { out, limit: 40 })
  expect(r.failed).toEqual([expect.stringContaining('species/a: no pick answer left')])
  expect(r.stopped).toContain('species/a failed')
  expect(Object.keys(await files(out))).toEqual([reportName(r)])
})

test('a run never writes into the repository: not with its out folder in it, nor through a link to a page', async () => {
  const root = await site()
  const live = await files(join(root, 'content'))
  const d = { llm: model({}).llm, now: () => new Date('2026-11-23T02:00:00Z') }
  await expect(wordingMend(root, d, { out: root, limit: 40 })).rejects.toThrow(/repository/)
  await expect(wordingMend(root, d, { out: join(root, 'trial'), limit: 40 })).rejects.toThrow(/repository/)
  const out = await outside()
  await mkdir(join(out, 'content', 'species'), { recursive: true })
  await symlink(join(root, 'content', 'species', 'a'), join(out, 'content', 'species', 'a'))
  const { llm } = model({ pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 2, h: 1, pick: 1 }] }], review: [{ verdicts: [{ s: 1, ok: true }, { s: 2, ok: true }] }] })
  const r = await wordingMend(root, { llm, now: d.now }, { out, limit: 1 })
  expect(r.failed).toEqual([expect.stringContaining('outside')])
  expect(await files(join(root, 'content'))).toEqual(live)
})

test('a malformed limit fails before a page is read, and each run keeps its own report', async () => {
  const root = await site()
  const out = await outside()
  const d = (at: string) => ({ llm: model({}).llm, now: () => new Date(at) })
  await expect(wordingMend(root, d('2026-11-23T02:00:00Z'), { out, limit: Number('nope') })).rejects.toThrow(/limit/)
  const a = await wordingMend(root, d('2026-11-23T02:00:00Z'), { out, limit: 40, dry: true })
  const b = await wordingMend(root, d('2026-11-24T02:00:00Z'), { out, limit: 40, dry: true })
  expect(Object.keys(await files(out)).sort()).toEqual([reportName(a), reportName(b)].sort())
  expect(reportName(a)).not.toBe(reportName(b))
})

test('a fixed part whose page record can\'t be read is never offered: the run stops before any model call', async () => {
  const root = await site()
  await mkdir(join(root, 'content', 'species', 'a', 'entity.json')) // a folder: reading it fails, and not for a missing file
  await expect(candidates(join(root, 'content'))).rejects.toThrow()
})

test('a mark names the words a text may take, so a change to them brings the page back', () => {
  const [h] = hitsIn('Dù vậy, cá vẫn khỏe.')
  expect(markOf(h!)).toBe('dù vậy: dù vậy, → tuy nhiên, | nhưng')
  expect(markOf({ ...h!, options: ['nhưng'] })).not.toBe(markOf(h!))
  expect(markOf(hitsIn('Cá đực giữ lãnh thổ.')[0]!)).toBe('giữ lãnh thổ: giữ lãnh thổ → recast 1')
  expect(markOf(hitsIn('Loài này không nhiều khả năng sống sót.')[0]!)).toBe('nhiều khả năng: nhiều khả năng → (none)')
})

test('the kinds take turns, and the rarest entry gets its sentences first', () => {
  const page = (key: string, html: string) => { const sentences = flagged([{ field: 'body', text: `<p>${html}</p>` }]); return { key, dir: '', vi: {}, parts: [], sentences, marks: sentences.flatMap(f => f.hits.map(markOf)) } }
  const cands = [page('species/a', 'Dù vậy, cá khỏe.'), page('species/b', 'Dù vậy, cá khỏe.'), page('plants/c', 'Dù vậy, cây khỏe.'), page('guides/d', 'Cá cần chỗ trú.')]
  expect(pick(cands, {}, { limit: 3 }).map(c => c.key)).toEqual(['species/a', 'plants/c', 'guides/d'])
  expect(pick(cands, {}, { limit: 1, perEntry: 1 }).map(c => c.key)).toEqual(['guides/d'])
  expect(pick(cands, { 'species/a': { at: '', marks: cands[0]!.marks } }, { limit: 9 }).map(c => c.key)).toEqual(['species/b', 'plants/c', 'guides/d'])
  // A sentence counts for its entry only if the lane may mend it: "Phần lớn cá…" has no word offered and is never recast.
  expect(pick([page('species/e', 'Phần lớn cá khỏe.'), page('species/f', 'Phần lớn là cá hoang dã.')], {}, { limit: 1, perEntry: 1 }).map(c => c.key)).toEqual(['species/f'])
})

// The re-reads of 22 Nov (Codex, Fable), one test each.
test('the swap words offer nothing where they would change or break the sentence', () => {
  const offers = (html: string) => hitsIn(html).map(h => [h.say, h.key, h.options])
  expect(offers('Phần lớn thời gian cá nằm yên.')).toEqual([['phần lớn', 'phần lớn thời gian', []]]) // "thường" drops "most of the time"
  expect(offers('Chia thức ăn thành các khẩu phần ăn.')).toEqual([['khẩu phần', undefined, []]]) // "các thức ăn" loses the portions
  expect(offers('Cá con chuyển sang giai đoạn <em>bơi tự do</em>.')).toEqual([['bơi tự do', undefined, []]])
  expect(hitsIn('Không <em>phải là lựa chọn lý tưởng.</em>')).toMatchObject([{ say: 'lý tưởng', negated: true, options: [] }]) // the tag is a space
  expect(offers('Nhưng dù vậy, cá vẫn khỏe.')).toEqual([['dù vậy', 'nhưng dù vậy', []]]) // not "nhưng nhưng"
  expect(offers('Đây là lựa chọn lý tưởng cho bể nhỏ.')).toEqual([['lý tưởng', 'lựa chọn lý tưởng', ['lựa chọn rất hợp']]]) // never "tốt nhất", a ranking
  expect(offers('Càng lý tưởng càng tốt.')).toEqual([['lý tưởng', 'lý tưởng', []]])
  expect(offers('Một lý do là hoa văn của nó.')).toEqual([['lý do là', 'một lý do là', []]])
  expect(offers('Bệnh này nhiều khả năng hơn là do nấm.')).toEqual([['nhiều khả năng', 'nhiều khả năng hơn', []]])
  expect(offers('Chim tìm chỗ trú đông.')).toEqual([['chỗ trú', 'chỗ trú đông', []]])
  expect(offers('Thì bạn cần bể lớn hơn nhiều.')).toEqual([['bạn nên', 'bạn cần', ['cần']]]) // no cut: "cần" is the need
  expect(offers('Như vậy bạn nên thay nước.')).toEqual([['bạn nên', 'vậy bạn nên', []]]) // "vậy nên" would be a new tic
  expect(offers('Cá này nuôi chung bể cộng đồng được.')).toEqual([['bể cộng đồng', 'chung bể cộng đồng', []]])
  expect(offers('Thả vào bể cộng đồng.')).toEqual([['bể cộng đồng', 'bể cộng đồng', ['bể chung']]])
})

// The trial build's last read (22 Nov, 11:00; Codex, Fable): what it found breaking a sentence, or changing what it says.
test('the last read: no words offered where they break the sentence, make it surer, or lose a ranking', () => {
  const offers = (html: string, say?: string) => hitsIn(html).filter(h => !say || h.say === say).map(h => [h.say, h.key, h.options])
  expect(offers('Vì vậy, bể của bạn cần đủ rộng.')).toEqual([['bạn nên', 'của bạn cần', []]]) // not "bể của cần"
  expect(offers('Đèn mạnh khiến bạn cần thay nước nhiều hơn.')).toEqual([['bạn nên', 'khiến bạn cần', []]])
  expect(offers('Cách này giảm bớt hành vi hung hăng.')).toEqual([['hung hăng', 'hành vi hung hăng', ['hành vi hung dữ']]]) // not "hành vi dữ"
  expect(offers('Phần lớn sự hung hăng là do chật chỗ.', 'hung hăng')).toEqual([['hung hăng', 'sự hung hăng', ['sự hung dữ']]]) // not "sự dữ"
  expect(offers('Cá này ít khi làm bạn cùng bể bị thương.')).toEqual([['bạn cùng bể', 'làm bạn cùng bể bị', []]]) // not "nuôi chung bị thương"
  expect(offers('Người ta cho rằng lý do là để tránh cá dữ.')).toEqual([['lý do là', 'rằng lý do là', []]])
  expect(offers('Xem hình minh họa. Lý do là Granville đã đổi tên.')).toEqual([['lý do là', 'lý do là', []]]) // a sentence starts there
  expect(offers('Tuy vậy, cá mồi sống vẫn là lựa chọn lý tưởng nhất.', 'lý tưởng')).toEqual([['lý tưởng', 'lựa chọn lý tưởng nhất', []]]) // not "rất hợp nhất"
  expect(offers('Rất nhiều khả năng cá bị nấm.')).toEqual([['nhiều khả năng', 'rất nhiều khả năng', []]]) // "Rất chắc" is surer
})

test('the last read: a recast keeps a count word and the way its sentence ends', async () => {
  // "từng cặp" says it's pair by pair, so the sentence isn't sent; "hàng chục" brought in is refused.
  const r0 = await mendPage(model({}).llm, 'species/a', body('Trước khi đẻ, từng cặp cá bắt đầu giữ lãnh thổ.'))
  expect(r0.left).toMatchObject([{ why: expect.stringContaining('a figure') }])
  const { llm } = model({
    recast: [{ sentences: [{ s: 1, vi: 'Cá đực đuổi hàng chục cá khác.' }, { s: 2, vi: 'Cá đực đuổi cá lạ.' }, { s: 3, vi: '“Cá đực đuổi cá lạ”' }] }],
    review: [{ verdicts: [{ s: 1, ok: true }] }],
  })
  const r = await mendPage(llm, 'species/a', body('Cá đực giữ lãnh thổ quanh hang.', 'Vì sao cá đực giữ lãnh thổ?', '“Cá đực giữ lãnh thổ.”'))
  expect(r.outcomes.map(x => [x.n, x.kept, x.why])).toEqual([[0, false, expect.stringContaining('brought in')], [1, false, 'it ends another way: a question made a statement, or the like'], [2, true, undefined]])
  expect(r.changes.get('body')).toEqual(new Map([[2, '“Cá đực đuổi cá lạ.”']])) // not "…lạ”.”"
})

test('a swap that puts one word twice in a row is refused', async () => {
  const { llm } = model({ pick: [{ picks: [{ s: 1, h: 1, pick: 1 }] }], recast: [{ sentences: [] }] })
  const r = await mendPage(llm, 'species/a', body('Thả vào bể cộng đồng chung với cá hiền.'))
  expect(r.outcomes[0]).toMatchObject({ step: 'swap', kept: false, after: 'Thả vào bể chung chung với cá hiền.', why: 'it puts one word twice in a row' })
  expect(r.changes.size).toBe(0)
})

test('a capital only where a sentence starts: not after "spp.", and a letter written as a number', () => {
  const html = 'Anubias spp. nhiều khả năng sống tốt.'
  expect(applied(html, [{ hit: hitsIn(html).find(h => h.say === 'nhiều khả năng')!, to: 'chắc' }])).toBe('Anubias spp. chắc sống tốt.')
  expect(applied('Bạn cần &#273;ổi nước.', [{ hit: at('Bạn cần &#273;ổi nước.', 'Bạn cần'), to: '' }])).toBe('Đổi nước.')
})

test('a recast keeps how many and its one sentence: "cả", a fraction, a stop with no space after, and its own full stop', async () => {
  const r0 = await mendPage(model({}).llm, 'species/a', body('Cả đàn giữ lãnh thổ.'))
  expect(r0.left).toMatchObject([{ why: expect.stringContaining('a figure') }])
  const { llm } = model({
    recast: [{ sentences: [{ s: 1, vi: 'Cá đực canh ⅔ cái hang.' }, { s: 2, vi: 'Cá đực đuổi cá lạ!Cá cái trốn.' }, { s: 3, vi: 'Cá đực đuổi cá khác khỏi chỗ của nó' }] }],
    review: [{ verdicts: [{ s: 1, ok: true }] }],
  })
  const r = await mendPage(llm, 'species/a', body('Cá đực giữ lãnh thổ quanh hang.', 'Cá đực giữ lãnh thổ rất dữ.', 'Cá đực giữ lãnh thổ.'))
  expect(r.outcomes.map(x => [x.n, x.kept, x.why])).toEqual([[0, false, expect.stringContaining('a figure')], [1, false, 'it became two sentences'], [2, true, undefined]])
  expect(r.changes.get('body')).toEqual(new Map([[2, 'Cá đực đuổi cá khác khỏi chỗ của nó.']]))
})

test('the repeat check counts only what was picked, and a fixed part with the same words as an editable one', async () => {
  // Only "hung hăng" picked: "Nhìn chung" stays, so nothing of its kind went out or came back.
  const { llm } = model({ pick: [{ picks: [{ s: 1, h: 1, pick: 0 }, { s: 1, h: 2, pick: 2 }] }], review: [{ verdicts: [{ s: 1, ok: true }] }] })
  const r = await mendPage(llm, 'species/a', body('Nói chung cá khỏe.', 'Nói chung cá ăn khỏe.', 'Nhìn chung cá hung hăng.'))
  expect(r.changes.get('body')).toEqual(new Map([[2, 'Nhìn chung cá dữ.']]))
  // A fixed part that reads like an editable one is still the page's: "Tuy nhiên" a third time is refused.
  const root = await mkdtemp(join(tmpdir(), 'wording-root-'))
  roots.push(root)
  const dir = join(root, 'content/species/t')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ sections: [{ key: 'care', source: 'sf' }, { key: 'habitat', source: 'sf' }, { key: 'diet', source: 'sf', fixed: true }] }))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ name: 'T', sections: { 'care:sf': '<p>Tuy nhiên, cá khỏe.</p>', 'habitat:sf': '<p>Dù vậy, cá ăn ít.</p>', 'diet:sf': '<p>Tuy nhiên, cá khỏe.</p>' } }))
  const [c] = await candidates(join(root, 'content'))
  const m = model({ pick: [{ picks: [{ s: 1, h: 1, pick: 1 }] }] })
  const r2 = await mendPage(m.llm, c!.key, c!.parts, { rest: c!.rest ?? '' })
  expect(r2.outcomes[0]).toMatchObject({ step: 'swap', kept: false, why: 'it puts back a word the page already repeats' })
})

test('a references heading is the whole heading: "Tài liệu trích dẫn" is one, "Nguồn gốc" isn\'t', () => {
  expect(flagged([{ field: 'body', text: '<h3>Tài liệu trích dẫn</h3><p>Dù vậy, cá khỏe.</p>' }])).toEqual([])
  expect(flagged([{ field: 'body', text: '<h3>Nguồn gốc</h3><p>Dù vậy, cá khỏe.</p>' }]).map(f => plain(f.html))).toEqual(['Dù vậy, cá khỏe.'])
  expect(flagged([{ field: 'body', text: '<h3>Giá tham khảo</h3><p>Dù vậy, cá rẻ.</p>' }])).toHaveLength(1)
})

test('the picker counts a sentence for a word only where the lane may reach it', () => {
  const cand = (key: string, ...ps: string[]) => { const parts = body(...ps); return { key, dir: '', vi: {}, parts, marks: [key], sentences: flagged(parts) } }
  // "giữ lãnh thổ" has no words in place, so only a recast reaches it, and beside "hung hăng" a kept swap ends the sentence first.
  const cands = [cand('species/a', 'Cá đực hung hăng và giữ lãnh thổ.'), cand('species/b', 'Cá cái hung hăng và giữ lãnh thổ.'), cand('species/c', 'Cá đực giữ lãnh thổ.')]
  expect(pick(cands, {}, { limit: 2, perEntry: 1 }).map(c => c.key).sort()).toEqual(['species/a', 'species/c'])
})

test('the trial never writes through a hard link, and a page whose mark fails leaves no draft', async () => {
  const root = await site()
  const out = await outside()
  const live = join(root, 'content/species/a/vi.json')
  const before = await readFile(live, 'utf8')
  await mkdir(join(out, 'content/species/a'), { recursive: true })
  await link(live, join(out, 'content/species/a/vi.json')) // a draft there already, a hard link to the live page
  const answers = () => model({ pick: [{ picks: [{ s: 1, h: 1, pick: 2 }, { s: 2, h: 1, pick: 1 }] }], review: [{ verdicts: [{ s: 1, ok: true }, { s: 2, ok: true }] }] }).llm
  const now = () => new Date('2026-11-23T02:00:00Z')
  const r = await wordingMend(root, { llm: answers(), now }, { out, limit: 1, pages: ['species/a'] })
  expect(r.failed).toEqual([])
  expect(await readFile(live, 'utf8')).toBe(before)
  expect(JSON.parse(await readFile(join(out, 'content/species/a/vi.json'), 'utf8')).sections['care:sf']).toBe('<p>Nhưng cá vẫn khỏe.</p><p>Cá cần chỗ trốn.</p>')
  // The marks behind a link: read, never written through, so the page fails, and its new draft goes.
  const out2 = await outside()
  await writeFile(join(out2, 'real.json'), '{}')
  await symlink(join(out2, 'real.json'), join(out2, '_wording-mend.json'))
  const r2 = await wordingMend(root, { llm: answers(), now }, { out: out2, limit: 1, pages: ['species/a'] })
  expect(r2.failed).toEqual([expect.stringContaining('species/a')])
  expect((await readdir(out2, { recursive: true })).filter(f => f.endsWith('vi.json'))).toEqual([])
  // Nor does the report count an edit for it: none landed (Codex, the last read).
  expect(r2.outcomes).toEqual([])
  // A draft already there that can't be read stops the page before anything goes over it.
  const out3 = await outside()
  const prior = join(out3, 'content/species/a/vi.json')
  await mkdir(dirname(prior), { recursive: true })
  await writeFile(prior, '{"old":1}')
  await chmod(prior, 0o000)
  const r3 = await wordingMend(root, { llm: answers(), now }, { out: out3, limit: 1, pages: ['species/a'] }).finally(() => chmod(prior, 0o644))
  expect(r3.failed).toEqual([expect.stringContaining('species/a')])
  expect(await readFile(prior, 'utf8')).toBe('{"old":1}')
  expect(r3.outcomes).toEqual([])
})

test('two runs in the same millisecond keep two reports; a page record that is a link to nothing stops the run', async () => {
  const root = await site()
  const out = await outside()
  const now = () => new Date('2026-11-23T02:00:00Z')
  await wordingMend(root, { llm: model({}).llm, now }, { out, limit: 40, dry: true })
  await wordingMend(root, { llm: model({}).llm, now }, { out, limit: 40, dry: true })
  expect((await readdir(out)).filter(f => f.startsWith('dry-run-'))).toHaveLength(2)
  const dir = join(root, 'content/species/a')
  await symlink(join(dir, 'gone.json'), join(dir, 'entity.json'))
  await expect(partsOf(dir, {})).rejects.toThrow('a link to nothing')
})
