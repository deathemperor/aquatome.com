import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { amountsOutside, forWriter, hedgesLost, rewriteForReader, sourceOf, writeForReader } from '../src/for-reader'
import { marketFor } from '../src/market'

const FACTS = { topic: 'blue-green algae', facts: [{ section: 'treatment', fact: 'Use 3 ml of 3% hydrogen peroxide per 4 litres.' }], products: [{ name: 'Slime Out', for: 'blue-green algae', ingredient: '', dose: '1 packet per 10 gallons' }], problems: ['cyanobacteria'] }
const good = { name: 'Tảo lam: làm gì trước', summary: ['Hút sạch rồi trị.'], body: '<h3>Trị</h3><p>Hút oxy già 3% vào xi lanh, liều 3 ml cho mỗi 4 lít nước.</p>', faq: [{ q: 'Có hại cá không?', a: 'Quá liều thì hại.' }] }
const fake = (answers: { written: object[]; score?: number; reviews?: { score: number; notes: string[]; hedges?: { fact: string; quote: string }[] }[]; facts?: typeof FACTS }) => {
  const calls: { kind: string; prompt: string; model?: string }[] = []
  const left = [...answers.written]
  const llm = (async (a: Parameters<Llm>[0]) => {
    const props = (a.schema as { properties: Record<string, unknown> }).properties
    if (props.problems) { calls.push({ kind: 'facts', prompt: a.prompt, model: a.model }); return answers.facts ?? FACTS }
    if (props.body) { calls.push({ kind: 'write', prompt: a.prompt, model: a.model }); return left.shift() }
    if (props.findings) { calls.push({ kind: 'fit', prompt: a.prompt, model: a.model }); return { findings: [], products: [], doses: [] } }
    calls.push({ kind: 'review', prompt: a.prompt, model: a.model })
    return answers.reviews?.shift() ?? { score: answers.score ?? 0.9, notes: [] }
  }) as Llm
  return { llm, calls }
}

test('the writer works from the facts and the market table, never the source; what passes first time is kept', async () => {
  const { llm, calls } = fake({ written: [good] })
  const r = await writeForReader({ llm }, 'g', 'Buy Slime Out on Amazon for $14.')
  expect(r).toMatchObject({ kept: true, tries: 1 })
  const write = calls.find(c => c.kind === 'write')!
  expect(write.prompt).not.toContain('Amazon')
  expect(write.prompt).toContain('Use 3 ml of 3% hydrogen peroxide')
  expect(write.prompt).toMatch(/Slime Out: các shop trong nước khó tìm/)
  expect(write.prompt).toContain('3 ml cho mỗi 4 lít nước') // the table's dose for this problem
  expect(write.model).toBe('opus')
})

test('a product\'s dose reaches the writer only when the table says it\'s sold here', async () => {
  expect(forWriter([
    { name: 'Marason', for: 'bacteria', ingredient: 'erythromycin', dose: '10 ml per 20 gallons' },
    { name: 'Ich X', for: 'ich', ingredient: '', dose: '1 tsp per 10 gallons' },
    { name: 'API General Cure', for: 'worms', ingredient: '', dose: '1 packet per 10 gallons' },
  ]).map(x => x.dose)).toEqual(['', '', '1 packet per 10 gallons'])
  const { llm, calls } = fake({ written: [good] })
  await writeForReader({ llm }, 'g', 'x')
  expect(calls.find(c => c.kind === 'write')!.prompt).not.toContain('1 packet per 10 gallons') // Slime Out's, in the facts above
})

test('what fails a check goes back with its notes, and what fails again is not kept', async () => {
  const bad = { ...good, body: '<p>Mua Slime Out trên Amazon giá 14 USD, 1 gói cho bể 38 lít.</p>' }
  const once = fake({ written: [bad, good] })
  const r = await writeForReader({ llm: once.llm }, 'g', 'x')
  expect(r).toMatchObject({ kept: true, tries: 2 })
  const second = once.calls.filter(c => c.kind === 'write')[1]!.prompt
  for (const n of ['shop: "Mua Slime Out trên Amazon"', 'price: "14 USD"', 'units: "38 lít"', 'dose:', 'product: "Slime Out"']) expect(second).toContain(n)
  const twice = fake({ written: [bad, bad] })
  expect((await writeForReader({ llm: twice.llm }, 'g', 'x')).kept).toBe(false)
  // Below the reviewer's bar, however clean.
  expect((await writeForReader({ llm: fake({ written: [good, good], score: 0.5 }).llm }, 'g', 'x')).kept).toBe(false)
})

test('a guide that passes with a reviewer\'s notes goes back once to mend those sentences, and a worse mend is not kept', async () => {
  const mended = { ...good, summary: ['Hút sạch, rồi mới trị.'] }
  const { llm, calls } = fake({ written: [good, mended], reviews: [{ score: 0.86, notes: ['"Cúi xuống" is not in the facts'] }, { score: 0.95, notes: [] }] })
  const r = await writeForReader({ llm }, 'g', 'x')
  expect(r).toMatchObject({ kept: true, tries: 2, score: 0.95 })
  expect(r.written.summary).toEqual(mended.summary)
  const second = calls.filter(c => c.kind === 'write')[1]!.prompt
  for (const n of ['"Cúi xuống" is not in the facts', '--- BẢN NHÁP ---', 'Hút sạch rồi trị.']) expect(second).toContain(n)
  const worse = fake({ written: [good, mended], reviews: [{ score: 0.86, notes: ['x'] }, { score: 0.7, notes: [] }] })
  expect((await writeForReader({ llm: worse.llm }, 'g', 'x')).written.summary).toEqual(good.summary)
})

test('an amount with a figure neither the facts nor the table has is made up', () => {
  expect(amountsOutside('Dùng 3 ml cho 4 lít trong 5 ngày.', '3 ml per 4 litres, for 5 days')).toEqual([])
  expect(amountsOutside('Dùng 7 ml cho 4 lít, 3,5 ml nữa.', '3 ml per 4 litres')).toEqual(['7 ml', '3.5 ml'])
  expect(amountsOutside('Cá lớn 8 cm, có 2 cách.', '')).toEqual([])
  // A source's words and its gallons, said as a keeper here says them.
  expect(amountsOutside('Trị 3 ngày trong bể 40 lít.', 'for three days in a 10-gallon tank')).toEqual([])
  expect(amountsOutside('Bể 80 lít.', 'a 10 gallon tank')).toEqual(['80 l'])
})

test('with no source kept, the facts come from the guide as it stands', async () => {
  const e = { id: 'youtube-none', source: 'youtube' as const, sourceUrl: 'https://www.youtube.com/watch?v=none' }
  expect(await sourceOf('/nowhere', e, { name: 'Tên', body: '<p>Bài.</p>', summary: ['Ý.'], faq: [] })).toMatch(/Tên[\s\S]*Ý\.[\s\S]*Bài\./)
})

test('a guide a person fixed stays unless forced; a kept rewrite replaces its text and drops the box; a failed one leaves the file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'for-reader-'))
  const dir = join(root, 'content/guides/aquariumcoop-blogs-aquarium-x')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'sources/aquariumcoop'), { recursive: true })
  await writeFile(join(root, 'sources/aquariumcoop/blogs-aquarium-x.md'), '---\nurl: u\n---\nThe article.')
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'aquariumcoop-blogs-aquarium-x', kind: 'care', source: 'aquariumcoop', sourceUrl: 'https://www.aquariumcoop.com/blogs/aquarium/x', html: '', photos: [], mentions: [], updatedAt: '2026-11-01' }))
  const vi = { slug: 'x', name: 'Cũ', altNames: [], sections: {}, body: '<p>Cũ.</p>', bodyFixed: true, localNote: { html: '<p>Hộp.</p>', refs: [] } }
  await writeFile(join(dir, 'vi.json'), JSON.stringify(vi))
  const id = 'aquariumcoop-blogs-aquarium-x'
  expect(await rewriteForReader(root, id, { llm: fake({ written: [good] }).llm })).toMatchObject({ skipped: 'a person fixed its text' })
  const failing = await rewriteForReader(root, id, { llm: fake({ written: [good, good], score: 0.1 }).llm }, { force: true })
  expect(failing).toMatchObject({ kept: false })
  expect(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')).name).toBe('Cũ')
  const passing = await rewriteForReader(root, id, { llm: fake({ written: [good] }).llm }, { force: true })
  expect(passing).toMatchObject({ kept: true })
  const out = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))
  expect(out).toMatchObject({ slug: 'x', name: good.name })
  expect(out.bodyFixed).toBeUndefined()
  expect(out.localNote).toBeUndefined()
})

test('a title the owner fixed stays, and the writer is told to call the guide\'s subject by it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'for-reader-'))
  const id = 'aquariumcoop-blogs-aquarium-pencilfish'
  const dir = join(root, 'content/guides', id)
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'sources/aquariumcoop'), { recursive: true })
  await writeFile(join(root, 'sources/aquariumcoop/blogs-aquarium-pencilfish.md'), '---\nurl: u\n---\nThe article.')
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id, kind: 'care', source: 'aquariumcoop', sourceUrl: 'https://www.aquariumcoop.com/blogs/aquarium/pencilfish', html: '', photos: [], mentions: [], updatedAt: '2026-11-01' }))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: 'x', name: 'Hướng dẫn nuôi cá chì', nameFixed: true, altNames: [], sections: {}, body: '<p>Cũ.</p>' }))
  const { llm, calls } = fake({ written: [good] })
  expect(await rewriteForReader(root, id, { llm })).toMatchObject({ kept: true })
  expect(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))).toMatchObject({ name: 'Hướng dẫn nuôi cá chì', nameFixed: true, body: good.body })
  expect(calls.find(c => c.kind === 'write')!.prompt).toContain('Tiêu đề bài đã chốt: "Hướng dẫn nuôi cá chì"')
})

test('a fact the guide says more surely than the facts do goes back, and is not kept if it stays that way', async () => {
  const fact = 'A lot of times a fungal infection means an open wound, and bacteria can follow.'
  const facts = { ...FACTS, facts: [...FACTS.facts, { section: 'causes' as const, fact }] }
  const sure = { ...good, body: `${good.body}<p>Nấm chỉ mọc trên vết thương hở, mà vết hở thì đã nhiễm khuẩn rồi.</p>` }
  const kept = { ...good, body: `${good.body}<p>Cá bị nấm thì thường có vết thương hở, và vi khuẩn có thể nhiễm theo.</p>` }
  const pair = (w: typeof good) => ({ fact, quote: w.body.match(/<p>([^<]*)<\/p>$/)![1]! })
  const once = fake({ facts, written: [sure, kept], reviews: [{ score: 0.95, notes: [], hedges: [pair(sure)] }, { score: 0.95, notes: [], hedges: [pair(kept)] }] })
  const r = await writeForReader({ llm: once.llm }, 'g', 'x')
  expect(r).toMatchObject({ kept: true, tries: 2 })
  expect(once.calls.filter(c => c.kind === 'write')[1]!.prompt).toContain('Nói chắc hơn dữ kiện: "Nấm chỉ mọc trên vết thương hở')
  const twice = fake({ facts, written: [sure, sure], reviews: [{ score: 0.95, notes: [], hedges: [pair(sure)] }, { score: 0.95, notes: [], hedges: [pair(sure)] }] })
  expect((await writeForReader({ llm: twice.llm }, 'g', 'x')).kept).toBe(false)
})

test('the hedge check holds the reviewer to the facts and the page', () => {
  const facts = ['Fish can catch bacteria in shipping.', 'Use 3 ml per 4 litres.']
  const page = 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn. Bình thường cá vẫn khỏe. Dùng 3 ml cho 4 lít.'
  expect(hedgesLost([{ fact: 'Fish can catch bacteria in shipping.', quote: 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn.' }], facts, page)).toHaveLength(1)
  // Not a fact it was given, not a sentence on the page, a fact with no hedge, or "bình thường" taken for "thường": nothing.
  expect(hedgesLost([
    { fact: 'Fish always catch bacteria.', quote: 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn.' },
    { fact: 'Fish can catch bacteria in shipping.', quote: 'Cá nào cũng bệnh.' },
    { fact: 'Use 3 ml per 4 litres.', quote: 'Dùng 3 ml cho 4 lít.' },
    { fact: 'Fish can catch bacteria in shipping.', quote: '' },
  ], facts, page)).toEqual([])
  expect(hedgesLost([{ fact: 'Fish can catch bacteria in shipping.', quote: 'Bình thường cá vẫn khỏe.' }], facts, page)).toHaveLength(1)
  expect(hedgesLost([{ fact: 'Fish can catch bacteria in shipping.', quote: 'Trên đường vận chuyển cá có thể nhiễm khuẩn.' }], facts, 'Trên đường vận chuyển cá có thể nhiễm khuẩn.')).toEqual([])
  // "Hay" before a verb is "often".
  expect(hedgesLost([{ fact: 'People often get hung up on it.', quote: 'Nhiều người hay vướng ở chỗ này.' }], ['People often get hung up on it.'], 'Nhiều người hay vướng ở chỗ này.')).toEqual([])
})

test('a medicine the source names reaches the writer with what it is mistaken for here', () => {
  expect(marketFor('vi', 'Maracyn', [])).toContain('đừng mua nhầm Maracyn Two')
})
