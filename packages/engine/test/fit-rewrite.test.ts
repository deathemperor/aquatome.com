import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { CHECKLIST, fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { convertible, fitRewrite, mendable, rewriteDue } from '../src/fit-rewrite'
import { loadPages, type Page } from '../src/pages'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url).pathname
const ID = 'danio-margaritatus'
const content = async () => {
  const root = await mkdtemp(join(tmpdir(), 'fit-rewrite-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // The fixture's fish sources aren't shown on a public build, which is what the checker reads: here they are.
  const file = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(file, 'utf8')) as Record<string, { publish: boolean; permission?: object }>
  for (const s of ['seriouslyfish', 'sprucepets']) Object.assign(sources[s]!, { publish: true, permission: { date: '2026-11-08', file: 'test', scope: ['text'] } })
  await writeFile(file, JSON.stringify(sources))
  return root
}
const danio = async (root: string) => (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === ID)!
const part = (p: Page, field: string) => fitText(p).parts.find(x => x.field === field)!.id
const reading = (p: Page, findings: Omit<FitFinding, 'by'>[]): FitState => ({ [fitKey(p)]: { at: '2026-11-08', hash: fitText(p).hash, model: 'opus', checklist: CHECKLIST, findings: findings.map(f => ({ ...f, by: 'model' as const })), products: [] } })
const found = (p: Page) => [
  { check: 'elsewhere' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'Ao cạn nhiều cỏ', why: 'x' },
  { check: 'words' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'cao nguyên Shan', why: 'y' },
  { check: 'words' as const, part: part(p, 'sections.quickFacts:sprucepets'), quote: 'ăn tạp', why: 'w' },
]
const converted = (p: Page) => ({ check: 'units' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: '8 lít', why: 'z' })

/** A stand-in for the rewriter (each part it's given, changed) and its reviewer (a score). */
const fakeLlm = (rewrite: (vi: string) => string, score: number, o: { outAfter?: number; hedges?: { from: string; to: string }[] } = {}) => {
  const calls: string[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('parts')) {
      if (calls.filter(c => c === 'rewrite').length === o.outAfter) throw new LlmError('usage limit')
      calls.push('rewrite')
      return { parts: [...prompt.matchAll(/### (\S+)\n(?:EN:\n[\s\S]*?\n)?VI:\n([\s\S]*?)(?=\n\n### |$)/g)].map(m => ({ id: m[1]!, vi: rewrite(m[2]!.trim()) })) }
    }
    calls.push('review')
    return { score, notes: [], hedges: o.hedges ?? [] }
  }) as Llm
  return { llm, calls }
}

test('what a page has to mend: the parts its current reading faults for the reader, with their wording findings; words alone wait, and units alone on a guide', async () => {
  const p = await danio(await content())
  const state = reading(p, [...found(p), converted(p)])
  expect([...mendable(p, state)].map(([field, fs]) => [field, fs.map(f => f.check)])).toEqual([['sections.habitat:seriouslyfish', ['elsewhere', 'words']], ['sections.aquariumSize:sprucepets', ['units']]])
  expect(rewriteDue(p, state)).toBe(true)
  expect(rewriteDue(p, reading(p, [converted(p)]))).toBe(true)
  // A reading of an older text, words alone, or a kit, which the gate holds: nothing to rewrite here.
  expect(rewriteDue(p, { [fitKey(p)]: { ...state[fitKey(p)]!, hash: 'old' } })).toBe(false)
  expect(rewriteDue(p, reading(p, found(p).filter(f => f.check === 'words')))).toBe(false)
  expect(rewriteDue(p, reading(p, [...found(p), converted(p), { check: 'kit', part: '', quote: 'Cá galaxy', why: 'k' }]))).toBe(false)
  // A guide is written again whole, from its facts: due on any finding but units and words.
  const g = (await loadPages(join(await content(), 'content'), ['vi'])).find(x => x.kind === 'guides')!
  expect(rewriteDue(g, reading(g, [{ check: 'source', part: 'P1', quote: '', why: 's' }]))).toBe(true)
  expect(rewriteDue(g, reading(g, [{ check: 'units', part: 'P1', quote: '', why: 'u' }, { check: 'words', part: 'P1', quote: '', why: 'w' }]))).toBe(false)
  // Read before the kit check, a guide could be a kit: it waits for its next reading.
  const early = reading(g, [{ check: 'source', part: 'P1', quote: '', why: 's' }])
  expect(rewriteDue(g, { [fitKey(g)]: { ...early[fitKey(g)]!, checklist: 1 } })).toBe(false)
})

test('a part its reviewer passes is written and recorded with the page\'s new hash; one it fails leaves the file and the record alone, and waits for a new text or its name', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  const p = await danio(root)
  const failing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.5)
  const before = await readFile(file, 'utf8')
  let r = await fitRewrite(root, [p], reading(p, found(p)), { llm: failing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.notKept).toHaveLength(1)
  expect(await readFile(file, 'utf8')).toBe(before)
  await expect(readFile(join(root, 'engine-state/rewritten.json'), 'utf8')).rejects.toThrow()
  // Tried on this text: the next batch moves on, unless the page is named.
  const again = fakeLlm(vi => vi, 0.9)
  expect((await fitRewrite(root, [p], reading(p, found(p)), { llm: again.llm, now: () => new Date() }, { limit: 5 })).notKept).toEqual([])
  expect(again.calls).toEqual([])

  const passing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.9)
  r = await fitRewrite(root, [p], reading(p, found(p)), { llm: passing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5, retry: true })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  expect(passing.calls).toEqual(['rewrite', 'review'])
  expect(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish']).toContain('Vũng nước cạn, nhiều cỏ')
  const now = await danio(root)
  expect(JSON.parse(await readFile(join(root, 'engine-state/rewritten.json'), 'utf8'))).toEqual({ 'vi/species/danio-margaritatus': { at: '2026-11-08T09:00:00.000Z', hash: fitText(now).hash } })
})

test('a tank size its English gives in gallons, on a page already written, goes to the rewriter with a note to convert it as the writing rules say', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  // "bể chỉ 11 lít" is 3 gallons: the code rounds only the sizes it lists, so it stays as written.
  await writeFile(file, (await readFile(file, 'utf8')).replace('Dung tích bể tối thiểu: 8 lít.', 'Dung tích bể tối thiểu: 11 lít.'))
  const p = await danio(root)
  const prompts: string[] = []
  const { llm, calls } = fakeLlm(vi => vi.replace('11 lít', '10 lít'), 0.9)
  const seen = (async (a: Parameters<Llm>[0]) => { prompts.push(a.prompt); return llm(a) }) as Llm
  const units = [{ check: 'units' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: 'Dung tích bể tối thiểu: 11 lít.', why: 'a volume that shows it was converted from gallons' }]
  const r = await fitRewrite(root, [p], reading(p, units), { llm: seen, now: () => new Date('2026-11-12T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.aquariumSize:sprucepets (0.90)'])
  expect(calls).toEqual(['rewrite', 'review'])
  expect(prompts[0]).toContain('Convert the English\'s US units as the writing rules say')
  expect(prompts[0]).toContain('Never round a dose\'s amount or the water it goes into: convert those exactly')
  expect(prompts[0]).toContain('Dung tích bể tối thiểu: 11 lít.')
  expect(JSON.parse(await readFile(file, 'utf8')).sections['aquariumSize:sprucepets']).toContain('Dung tích bể tối thiểu: 10 lít.')
})

test('units are mended only from US units in the English, and never ride along with another mend of the same part', async () => {
  // The English gives "2 gallons": the writer converts it as its rules say, and its reviewer holds that.
  const root = await content()
  const p = await danio(root)
  const shop = { check: 'source' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: 'Bể trồng nhiều cây', why: 's' }
  // With another finding on the part, the part is mended for that alone: a rounding its reviewer fails can't lose it.
  expect([...mendable(p, reading(p, [converted(p), shop]))].map(([field, fs]) => [field, fs.map(f => f.check)])).toEqual([['sections.aquariumSize:sprucepets', ['source']]])
  // The English already in litres ("tanks as small as 11 litres"): rounding it would say other than the source.
  const entityFile = join(root, 'content/species', ID, 'entity.json')
  await writeFile(entityFile, (await readFile(entityFile, 'utf8')).replace('<p>Minimum tank size: 2 gallons. A planted tank suits them.</p>', '<p>Minimum tank size: 8 litres. A planted tank suits them.</p>'))
  const metric = await danio(root)
  expect(mendable(metric, reading(metric, [converted(metric)])).size).toBe(0)
  expect(rewriteDue(metric, reading(metric, [converted(metric)]))).toBe(false)
})

test('a page is tried twice at most on any of its texts, unless named; a usage limit leaves its count as it was', async () => {
  const root = await content()
  const p = await danio(root)
  const state = reading(p, found(p))
  const triedFile = join(root, 'engine-state/_fit-rewrite.json')
  // Tried once on an older text, before the count: a second try on this text.
  await writeFile(triedFile, JSON.stringify({ [fitKey(p)]: { at: '2026-11-08', hash: 'older' } }))
  const out = fakeLlm(vi => vi, 0.9, { outAfter: 0 })
  expect((await fitRewrite(root, [p], state, { llm: out.llm, now: () => new Date() }, { limit: 5 })).stopped).toContain('usage limit')
  expect(JSON.parse(await readFile(triedFile, 'utf8'))).toEqual({ [fitKey(p)]: { at: '2026-11-08', hash: 'older' } })
  const second = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.5)
  expect((await fitRewrite(root, [p], state, { llm: second.llm, now: () => new Date('2026-11-13T02:00:00Z') }, { limit: 5 })).notKept).toHaveLength(1)
  expect(JSON.parse(await readFile(triedFile, 'utf8'))[fitKey(p)]).toMatchObject({ hash: fitText(p).hash, n: 2 })
  // Its text changes and the read still faults it: twice is enough, until a person names it.
  await writeFile(triedFile, JSON.stringify({ [fitKey(p)]: { at: '2026-11-13', hash: 'changed since', n: 2 } }))
  const third = fakeLlm(vi => vi, 0.9)
  await fitRewrite(root, [p], state, { llm: third.llm, now: () => new Date() }, { limit: 5 })
  expect(third.calls).toEqual([])
  await fitRewrite(root, [p], state, { llm: third.llm, now: () => new Date() }, { limit: 5, retry: true })
  expect(third.calls).not.toEqual([])
})

test('a figure the English gives in metric is the source\'s own, beside a US one or not; only one converted from US units is mended', () => {
  // Numbers stay as the source gives them (the chief of staff, 2026-11-11).
  expect(convertible('Dung tích tối thiểu: 8 lít.', '<p>Minimum tank size: 2 gallons.</p>')).toBe(true)
  expect(convertible('Bể tối thiểu khoảng 68 lít.', '<p>Volume: ~68 litres (~18 US gal).</p><p>Footprint 76 × 30 cm (30 × 12 in).</p>')).toBe(false)
  expect(convertible('Một cặp cho mỗi 19 lít nước.', '<p>A pair per 5 gallons (about 19 litres) of water.</p>')).toBe(false)
  expect(convertible('Lớp nền dày 2,5 cm.', '<p>A substrate 2.5 cm (1 inch) deep.</p>')).toBe(false)
  expect(convertible('nhiệt độ 15,5–21 °C', '<p>15.5 – 21°C (60 – 70°F)</p>')).toBe(false)
  // A US unit left in the Vietnamese is always mended; prose that only looks like a unit isn't one.
  expect(convertible('Dài 2-2,5" (5-6 cm).', '<p>2-2.5" (5-6 cm) long.</p>')).toBe(true)
  expect(convertible('Bể 11 lít.', '<p>Keep 5 in a group, described in 1859 in Ft. Lauderdale; LB-12.</p>')).toBe(false)
})

test('a page tried twice and due again is listed for a person; naming it doesn\'t use up a try', async () => {
  const root = await content()
  const p = await danio(root)
  const triedFile = join(root, 'engine-state/_fit-rewrite.json')
  await writeFile(triedFile, JSON.stringify({ [fitKey(p)]: { at: '2026-11-13', hash: 'changed since', n: 2 } }))
  const r = await fitRewrite(root, [p], reading(p, found(p)), { llm: fakeLlm(vi => vi, 0.9).llm, now: () => new Date() }, { limit: 5 })
  expect(r.skipped).toEqual(['1 page tried 2 times and due again, for a person to name: vi/species/danio-margaritatus'])
  await writeFile(triedFile, '{}')
  await fitRewrite(root, [p], reading(p, found(p)), { llm: fakeLlm(vi => vi, 0.5).llm, now: () => new Date() }, { limit: 5, retry: true })
  expect(JSON.parse(await readFile(triedFile, 'utf8'))[fitKey(p)]).toMatchObject({ n: 0 })
})

test('a part a person fixed is not rewritten, whatever the reading finds in it', async () => {
  const root = await content()
  const dir = join(root, 'content/species', ID)
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  e.sections.find((x: { key: string; source: string }) => x.key === 'habitat' && x.source === 'seriouslyfish').fixed = true
  await writeFile(join(dir, 'entity.json'), JSON.stringify(e))
  const p = await danio(root)
  const before = await readFile(join(dir, 'vi.json'), 'utf8')
  const passing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.9)
  const r = await fitRewrite(root, [p], reading(p, found(p)), { llm: passing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual([])
  expect(r.skipped).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish: a person fixed its text'])
  expect(passing.calls).toEqual([])
  expect(await readFile(join(dir, 'vi.json'), 'utf8')).toBe(before)
})

test('stopped part way, a page keeps the parts already kept, and is tried again next batch', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  const p = await danio(root)
  const two = reading(p, [...found(p), { check: 'source', part: part(p, 'sections.aquariumSize:sprucepets'), quote: 'Dung tích bể tối thiểu', why: 'v' }])
  const out = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.9, { outAfter: 1 })
  const r = await fitRewrite(root, [p], two, { llm: out.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.stopped).toContain('usage limit')
  expect(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish']).toContain('Vũng nước cạn, nhiều cỏ')
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/rewritten.json'), 'utf8')))).toEqual(['vi/species/danio-margaritatus'])
  expect(JSON.parse(await readFile(join(root, 'engine-state/_fit-rewrite.json'), 'utf8').catch(() => '{}'))).toEqual({})
})

test('a part said more surely than its English is not kept, however well its reviewer scores it', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  // The section's English hedges ("may"); a pair the reviewer makes from anything else counts for nothing.
  const entityFile = join(root, 'content/species', ID, 'entity.json')
  const entity = await readFile(entityFile, 'utf8')
  await writeFile(entityFile, entity.replace('<p>[EN source text placeholder for habitat]</p>', '<p>Shallow, weedy ponds on the Shan Plateau, and may be rice paddies too.</p>'))
  const p = await danio(root)
  const before = await readFile(file, 'utf8')
  const pair = { from: 'Shallow, weedy ponds on the Shan Plateau, and may be rice paddies too.', to: 'Vũng nước cạn, nhiều cỏ ở cao nguyên Shan, Myanmar.' }
  const made = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.95, { hedges: [{ ...pair, from: 'Ponds, always.' }] })
  expect((await fitRewrite(root, [p], reading(p, found(p)), { llm: made.llm, now: () => new Date() }, { limit: 5 })).rewritten).toHaveLength(1)
  await writeFile(file, before)
  const lost = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.95, { hedges: [pair] })
  const r = await fitRewrite(root, [p], reading(p, found(p)), { llm: lost.llm, now: () => new Date() }, { limit: 5, retry: true })
  expect(r.notKept).toHaveLength(1)
  expect(r.notKept[0]).toContain('Said more surely than before')
  expect(await readFile(file, 'utf8')).toBe(before)
})
