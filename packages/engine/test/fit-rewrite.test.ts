import { nameStep } from '../src/ceiling'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { CHECKLIST, fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { breedFigures, figuresSaid, keepsFigures, unitsLeft, withoutConcentrations } from '../src/breed-units'
import { convertible, fitRewrite, MEND_RULE, mendable, rewriteDue } from '../src/fit-rewrite'
import { loadPages, type Page } from '../src/pages'
import { sentences } from '../src/sentences'

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
// A detail's finding, cut from its sentence: one on where a sentence applies takes it whole (mend.ts `goesWhole`), and here
// the whole part, which is the dealer check's.
const found = (p: Page) => [
  { check: 'product' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'Ao cạn nhiều cỏ', why: 'x' },
  { check: 'words' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'cao nguyên Shan', why: 'y' },
  { check: 'words' as const, part: part(p, 'sections.quickFacts:sprucepets'), quote: 'ăn tạp', why: 'w' },
]
const converted = (p: Page) => ({ check: 'units' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: '8 lít', why: 'z' })

/**
 * A stand-in for the writer (each sentence it's asked to fix, changed; with `every`, every sentence of the part, said
 * why or not) and its reviewer (a score, what it lists as left out, hedge pairs).
 */
const fakeLlm = (rewrite: (vi: string) => string, score: number, o: { outAfter?: number; hedges?: { from: string; to: string }[]; every?: { why?: string }; dropped?: { sentence: number; finding: number; text: string }[] } = {}) => {
  const calls: string[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('sentences')) {
      if (calls.filter(c => c === 'rewrite').length === o.outAfter) throw new LlmError('usage limit')
      calls.push('rewrite')
      const part = new Map([...prompt.split('--- PART ---\n')[1]!.split('\n\n')[0]!.matchAll(/^\[(\d+)\] (.*)$/gm)].map(m => [Number(m[1]), m[2]!]))
      const fix = [...prompt.split('--- FIX ---\n')[1]!.matchAll(/^\[(\d+)\]/gm)].map(m => Number(m[1]))
      return { sentences: [...part].filter(([n]) => o.every || fix.includes(n)).map(([n, vi]) => ({ n, vi: o.every && !fix.includes(n) ? vi.replace(/ (và|là) /, ' ') : rewrite(vi), ...(o.every?.why ? { why: o.every.why } : {}) })) }
    }
    calls.push('review')
    return { score, notes: [], dropped: o.dropped ?? [], hedges: o.hedges ?? [] }
  }) as Llm
  return { llm, calls }
}

test('what a page has to mend: the parts its current reading faults for the reader, with their wording findings; words alone wait, and units alone on a guide', async () => {
  const p = await danio(await content())
  const state = reading(p, [...found(p), converted(p)])
  expect([...mendable(p, state)].map(([field, fs]) => [field, fs.map(f => f.check)])).toEqual([['sections.habitat:seriouslyfish', ['product', 'words']], ['sections.aquariumSize:sprucepets', ['units']]])
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
  const failing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.5)
  const before = await readFile(file, 'utf8')
  let r = await fitRewrite(root, [p], reading(p, found(p)), { llm: failing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.notKept).toHaveLength(1)
  expect(await readFile(file, 'utf8')).toBe(before)
  await expect(readFile(join(root, 'engine-state/rewritten.json'), 'utf8')).rejects.toThrow()
  // Tried on this text: the next batch moves on, unless the page is named.
  const again = fakeLlm(vi => vi, 0.9)
  expect((await fitRewrite(root, [p], reading(p, found(p)), { llm: again.llm, now: () => new Date() }, { limit: 5 })).notKept).toEqual([])
  expect(again.calls).toEqual([])

  const passing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.9)
  r = await fitRewrite(root, [p], reading(p, found(p)), { llm: passing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5, retry: true })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  expect(passing.calls).toEqual(['rewrite', 'review'])
  expect(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish']).toContain('Nhiều cỏ')
  const now = await danio(root)
  expect(JSON.parse(await readFile(join(root, 'engine-state/rewritten.json'), 'utf8'))).toEqual({ 'vi/species/danio-margaritatus': { at: '2026-11-08T09:00:00.000Z', hash: fitText(now).hash } })
})

test('a tank size the page gives in gallons goes to the rewriter told to leave it as written, and code converts it', async () => {
  // Astra's reads of 14 Nov 2026: no figure a writer converts can be held to its place, so code converts it.
  const run = async (write: (vi: string) => string) => {
    const root = await content()
    const file = join(root, 'content/species', ID, 'vi.json')
    await writeFile(file, (await readFile(file, 'utf8')).replace('Dung tích bể tối thiểu: 8 lít.', 'Dung tích bể tối thiểu: 2 gallon.'))
    const p = await danio(root)
    const prompts: string[] = []
    const { llm, calls } = fakeLlm(write, 0.9)
    const seen = (async (a: Parameters<Llm>[0]) => { prompts.push(a.prompt); return llm(a) }) as Llm
    const units = [{ check: 'units' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: '2 gallon', why: 'a US unit' }]
    const r = await fitRewrite(root, [p], reading(p, units), { llm: seen, now: () => new Date('2026-11-12T09:00:00Z') }, { limit: 5 })
    return { r, calls, prompts, text: JSON.parse(await readFile(file, 'utf8')).sections['aquariumSize:sprucepets'] as string }
  }
  const left = await run(vi => vi)
  expect(left.r.rewritten).toEqual(['vi/species/danio-margaritatus sections.aquariumSize:sprucepets (0.90)'])
  expect(left.calls).toEqual(['rewrite', 'review'])
  expect(left.prompts[0]).toContain('Leave each figure and its unit exactly as written: code converts the US units to metric after you')
  expect(left.prompts[0]).toContain('Dung tích bể tối thiểu: 2 gallon.')
  expect(left.text).toContain('Dung tích bể tối thiểu: 8 lít.')
  // Converted by the writer: its figure is something the sentence didn't say.
  const own = await run(vi => vi.replace('2 gallon', '8 lít'))
  expect(own.r.rewritten).toEqual([])
  expect(own.r.notKept[0]).toContain('Sentence 1 says what it didn\'t: "8 lít"')
  expect(own.text).toContain('Dung tích bể tối thiểu: 2 gallon.')
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
  const second = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.5)
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
  const passing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.9)
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
  const out = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.9, { outAfter: 1 })
  const r = await fitRewrite(root, [p], two, { llm: out.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.stopped).toContain('usage limit')
  expect(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish']).toContain('Nhiều cỏ')
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/rewritten.json'), 'utf8')))).toEqual(['vi/species/danio-margaritatus'])
  expect(JSON.parse(await readFile(join(root, 'engine-state/_fit-rewrite.json'), 'utf8').catch(() => '{}'))).toEqual({})
})

test('a part said more surely than before is not kept, however well its reviewer scores it', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  // The sentence hedges ("có thể"); a pair the reviewer makes from anything else counts for nothing.
  await writeFile(file, (await readFile(file, 'utf8')).replace('Ao cạn nhiều cỏ ở cao nguyên Shan, Myanmar.', 'Ao cạn nhiều cỏ ở cao nguyên Shan, Myanmar, có thể cả ruộng lúa.'))
  const p = await danio(root)
  const before = await readFile(file, 'utf8')
  const pair = { from: 'Ao cạn nhiều cỏ ở cao nguyên Shan, Myanmar, có thể cả ruộng lúa.', to: 'Nhiều cỏ ở cao nguyên Shan, Myanmar, cả ruộng lúa.' }
  const surer = (vi: string) => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ').replace('có thể ', '')
  // A rewrite that keeps the hedge, with a pair made from nothing on the page: kept. (Dropping "có thể" is a word lost too,
  // which mend.ts's count says on its own.)
  const made = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Nhiều cỏ'), 0.95, { hedges: [{ ...pair, from: 'Ponds, always.' }] })
  expect((await fitRewrite(root, [p], reading(p, found(p)), { llm: made.llm, now: () => new Date() }, { limit: 5 })).rewritten).toHaveLength(1)
  await writeFile(file, before)
  const lost = fakeLlm(surer, 0.95, { hedges: [pair] })
  const r = await fitRewrite(root, [p], reading(p, found(p)), { llm: lost.llm, now: () => new Date() }, { limit: 5, retry: true })
  expect(r.notKept).toHaveLength(1)
  expect(r.notKept[0]).toContain('Said more surely than before')
  expect(await readFile(file, 'utf8')).toBe(before)
})

// The glowlight tetra's care part as the site had it before the front list's first run (13 Nov 2026), and its English.
const TETRA_VI = '<p>Cá được các trại nhân giống với số lượng khổng lồ nên rất dễ thích nghi và sống tốt trong hầu hết các bể. Trong bể trồng dày cây, cá trông đặc biệt nổi bật. Còn trong bể bày trí quá trơ trọi, màu cá có thể hơi nhợt. Nếu thật sự muốn thấy cá đẹp nhất, bạn có thể set một bể biotope. Nền dùng cát sông, thêm vài cành lũa và ít rễ cây cong queo. Nếu không tìm được lũa có dáng ưng ý, bạn có thể dùng cành dẻ gai (beech) thông thường, miễn là gỗ đã phơi thật khô và lột sạch vỏ. Thêm vài nắm lá khô là bể có cảm giác tự nhiên hẳn. Lá dẻ gai hay lá sồi đều dùng được. Cứ để gỗ và lá nhuộm nước thành màu trà loãng. Vài tuần một lần, bạn vớt lá cũ ra và thay lá mới để lá không mục làm bẩn nước. Bạn cũng có thể bỏ một túi lưới nhỏ đựng than bùn loại dùng được cho bể cá vào lọc để nước giống nước đen ngoài tự nhiên hơn. Đèn nên để khá dịu. Trong điều kiện như vậy, cá mới khoe hết vẻ đẹp thật sự của mình.</p>'
const TETRA_EN = '<p>As it\'s commercially bred in such huge numbers, it is adaptable and will do well in most tanks. It does look particularly effective in a heavily-planted arrangement, and can appear a little washed out in very spartan setups. If you really want to see it at its best, you could set up a biotope tank. Use a substrate of river sand and add a few driftwood branches (if you can\'t find driftwood of the desired shape, common beech is safe to use if thoroughly dried and stripped of bark) and twisted roots. A few handfuls of dried leaves (again beech can be used, or oak leaves are also suitable) would complete the natural feel. Allow the wood and leaves to stain the water the colour of weak tea, removing old leaves and replacing them every few weeks so they don\'t rot and foul the water. A small net bag filled with aquarium-safe peat can be added to the filter to aid in the simulation of black water conditions. Use fairly dim lighting. Under these conditions the true beauty of the fish will be revealed.</p>'
const tetra = async (root: string) => {
  const file = join(root, 'content/species', ID, 'vi.json')
  const vi = JSON.parse(await readFile(file, 'utf8'))
  vi.sections['habitat:seriouslyfish'] = TETRA_VI
  await writeFile(file, JSON.stringify(vi, null, 2))
  const entityFile = join(root, 'content/species', ID, 'entity.json')
  await writeFile(entityFile, (await readFile(entityFile, 'utf8')).replace('<p>[EN source text placeholder for habitat]</p>', TETRA_EN.replaceAll('"', '\\"')))
  const p = await danio(root)
  // A product a keeper here can't buy, cut from its sentence (one on where a sentence applies takes it whole, below).
  return { p, file, beech: [{ check: 'product' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'bạn có thể dùng cành dẻ gai (beech) thông thường', why: 'Beech wood is common in Europe, not something a keeper in Vietnam has at hand.' }] }
}
const said = (html: string) => sentences(html).filter(x => x.sentence).map(x => x.html)

test('a directed rewrite changes only the sentence its finding quotes: every other sentence is written back word for word, whatever the writer returns', async () => {
  const root = await content()
  const { p, file, beech } = await tetra(root)
  // The writer changes every sentence it's shown, and says no why: only the beech sentence is taken.
  const llm = fakeLlm(vi => vi.replace('dẻ gai (beech) ', ''), 0.9, { every: {} })
  const r = await fitRewrite(root, [p], reading(p, beech), { llm: llm.llm, now: () => new Date('2026-11-13T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  const before = said(TETRA_VI)
  const after = said(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish'])
  expect(after).toHaveLength(before.length)
  const changed = before.map((s, i) => (s === after[i] ? -1 : i)).filter(i => i >= 0)
  expect(changed).toEqual([5])
  expect(after[5]).toContain('dùng cành thông thường')
  expect(after).toContain('Đèn nên để khá dịu.')
})

// The chief of staff, 14 Nov 2026: a finding on where a statement applies takes the whole sentence, whatever the reviewer
// scores.
test('a sentence a finding on where it applies names is not kept cut, only gone', async () => {
  const root = await content()
  const { p, file, beech } = await tetra(root)
  const abroad = [{ ...beech[0]!, check: 'elsewhere' as const }]
  const before = await readFile(file, 'utf8')
  const cut = await fitRewrite(root, [p], reading(p, abroad), { llm: fakeLlm(vi => vi.replace('dẻ gai (beech) ', ''), 1).llm, now: () => new Date('2026-11-13T09:00:00Z') }, { limit: 5 })
  expect(cut.rewritten).toEqual([])
  expect(cut.notKept.join(' ')).toContain('Sentence 6 goes whole')
  expect(await readFile(file, 'utf8')).toBe(before)
  const gone = await fitRewrite(root, [p], reading(p, abroad), { llm: fakeLlm(() => '', 0.9).llm, now: () => new Date('2026-11-13T09:00:00Z') }, { limit: 5, retry: true })
  expect(gone.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  // Listed for the chief of staff.
  expect(gone.gone).toEqual([`vi/species/danio-margaritatus sections.habitat:seriouslyfish sentence 6 went whole: "${said(TETRA_VI)[5]!.replace(/<[^>]+>/g, '')}"`])
  expect(cut.gone).toEqual([])
  expect(said(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish'])).toEqual(said(TETRA_VI).filter((_, i) => i !== 5))
})

test('a changed sentence is written in metric, and nothing else on the page is touched', async () => {
  const root = await content()
  const { file, beech } = await tetra(root)
  // The sentence the finding quotes gives a length in inches: cut, it's written in metric.
  const vi = JSON.parse(await readFile(file, 'utf8'))
  vi.sections['habitat:seriouslyfish'] = TETRA_VI.replace('cành dẻ gai (beech) thông thường', 'cành dẻ gai (beech) dài 12 inch thông thường')
  await writeFile(file, JSON.stringify(vi, null, 2))
  const q = await danio(root)
  const inch = [{ ...beech[0]!, part: part(q, 'sections.habitat:seriouslyfish'), quote: 'cành dẻ gai (beech) dài 12 inch' }]
  // Another part the reading didn't fault, with a size in inches beside its centimetres (Astra's read).
  const other = Object.keys(vi.sections).find(k => k !== 'habitat:seriouslyfish' && !k.startsWith('references'))!
  vi.sections[other] = '<p>Kích thước trưởng thành: 6 inch/15 cm.</p>'
  await writeFile(file, JSON.stringify(vi, null, 2))
  const llm = fakeLlm(vi => vi.replace('dẻ gai (beech) ', ''), 0.9)
  const r = await fitRewrite(root, [q], reading(q, inch), { llm: llm.llm, now: () => new Date('2026-11-13T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toHaveLength(1)
  const saved = JSON.parse(await readFile(file, 'utf8'))
  expect(saved.sections[other]).toBe('<p>Kích thước trưởng thành: 6 inch/15 cm.</p>')
  expect(said(saved.sections['habitat:seriouslyfish'])[5]).not.toMatch(/inch/)
  expect(said(saved.sections['habitat:seriouslyfish'])[5]).toMatch(/dùng cành dài 30 cm thông thường/)
})

test('a sentence beside the changed one changes too only when the writer says why; one further off never does', async () => {
  const root = await content()
  const { p, file, beech } = await tetra(root)
  const llm = fakeLlm(vi => vi.replace('dẻ gai (beech) ', ''), 0.9, { every: { why: 'its subject changed' } })
  await fitRewrite(root, [p], reading(p, beech), { llm: llm.llm, now: () => new Date('2026-11-13T09:00:00Z') }, { limit: 5 })
  const before = said(TETRA_VI)
  const after = said(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish'])
  expect(before.map((s, i) => (s === after[i] ? -1 : i)).filter(i => i >= 0)).toEqual([4, 5, 6])
})

test('a page whose parts were tried the old way is tried once more on the same text; one tried this way waits for a new text', async () => {
  const root = await content()
  const p = await danio(root)
  const triedFile = join(root, 'engine-state/_fit-rewrite.json')
  await writeFile(triedFile, JSON.stringify({ [fitKey(p)]: { at: '2026-11-13', hash: fitText(p).hash, n: 1 } }))
  const once = fakeLlm(vi => vi, 0.9)
  await fitRewrite(root, [p], reading(p, found(p)), { llm: once.llm, now: () => new Date() }, { limit: 5 })
  expect(once.calls).not.toEqual([])
  expect(JSON.parse(await readFile(triedFile, 'utf8'))[fitKey(p)]).toMatchObject({ n: 2, rule: MEND_RULE })
  await writeFile(triedFile, JSON.stringify({ [fitKey(p)]: { at: '2026-11-13', hash: fitText(p).hash, n: 1, rule: MEND_RULE } }))
  const again = fakeLlm(vi => vi, 0.9)
  await fitRewrite(root, [p], reading(p, found(p)), { llm: again.llm, now: () => new Date() }, { limit: 5 })
  expect(again.calls).toEqual([])
})

/** A breed page (no English beside it) with ranchu's case: a source finding and a converted tank in one paragraph, and a converted tank in an FAQ answer. */
const breed = async (o: { faq?: string; faqQuote?: string; faqQ?: string; body?: string } = {}) => {
  const root = await content()
  const file = join(root, 'content/breeds/pigeon-blood-discus/vi.json')
  const t = JSON.parse(await readFile(file, 'utf8'))
  t.body += o.body ?? '<p>Một người chơi ở Anh kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>'
  t.faq[0].a = o.faq ?? 'Cá con có thể bắt đầu trong bể 110 lít.'
  if (o.faqQ) t.faq[0].q = o.faqQ
  await writeFile(file, JSON.stringify(t, null, 2))
  await mkdir(join(root, 'engine-state/breeds'), { recursive: true })
  await writeFile(join(root, 'engine-state/breeds/pigeon-blood-discus.json'), JSON.stringify({ keeping: ['For one large fish, 35 US gal (about 132 L) is the bare minimum; 40–50 gal (151–189 L) is better.'] }))
  const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'pigeon-blood-discus')!
  // The part's other mend, a detail cut from its sentence (one on where a sentence applies would take it whole).
  const source = { check: 'product' as const, part: part(p, 'body'), quote: 'Một người chơi ở Anh kể rằng cá cần nhiều chỗ.', why: 's' }
  const tank = { check: 'units' as const, part: part(p, 'body'), quote: 'Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.', why: 'a converted 35-gallon figure' }
  const faq = { check: 'units' as const, part: part(p, 'faq.0.a'), quote: o.faqQuote ?? o.faq ?? 'Cá con có thể bắt đầu trong bể 110 lít.', why: 'a converted 29-gallon tank' }
  return { root, file, p, source, tank, faq }
}
/**
 * A mender (mend.ts) that does what its notes ask in the sentences it is to fix (the figures it is told, or the source's
 * wording), and a reviewer's score.
 */
const notesLlm = (o: { figures?: (vi: string) => string; other?: (vi: string) => string } = {}) => {
  const prompts: { kind: 'rewrite' | 'review'; prompt: string }[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('sentences')) {
      prompts.push({ kind: 'rewrite', prompt })
      const told = prompt.includes('Write exactly these figures')
      const fix = told ? (o.figures ?? ((vi: string) => vi.replace('132 lít', '130 lít').replace('110 lít', '120 lít'))) : (o.other ?? ((vi: string) => vi.replace(' ở Anh', '')))
      const part = new Map([...prompt.split('--- PART ---\n')[1]!.split('\n\n')[0]!.matchAll(/^\[(\d+)\] (.*)$/gm)].map(m => [Number(m[1]), m[2]!]))
      const asked = [...prompt.split('--- FIX ---\n')[1]!.matchAll(/^\[(\d+)\]/gm)].map(m => Number(m[1]))
      return { sentences: [...part].filter(([n]) => asked.includes(n)).map(([n, vi]) => ({ n, vi: fix(vi) })) }
    }
    prompts.push({ kind: 'review', prompt })
    return { score: 0.9, notes: [], dropped: [], hedges: [] }
  }) as Llm
  return { llm, prompts }
}

test('a breed page\'s figures, from its source\'s own US figure: a table tank its size, another the round figure keepers say, a minimum never a twentieth under', () => {
  // The chief of staff, 2026-11-12: 35 gallons 130 lít, 1,000 gallons 4.000 lít, 3 gallons a fish 12 lít, 10 gallons an inch 15 lít mỗi cm; 90 cm stays.
  expect(breedFigures('Một nguồn coi 132 lít là mức tối thiểu', 'For one large Ryukin, 35 US gal (about 132 L) is the bare minimum; 40–50 gal (151–189 L) is better.').map(f => f.to)).toEqual(['130 lít'])
  expect(breedFigures('khoảng 3.800 lít cho mỗi con, hồ sâu ít nhất 90 cm.', 'Pond guidance: about 1,000 gallons (about 3,800 L) per fish and at least 90 cm deep.').map(f => f.to)).toEqual(['4.000 lít'])
  expect(breedFigures('Cứ thêm một con thì cộng thêm khoảng 11 lít.', 'A tank of at least about 38 L (10 US gal) suits 4 fish. Add about 11 L (3 gal) for each extra fish.').map(f => f.to)).toEqual(['12 lít'])
  expect(breedFigures('khoảng 40 lít cho mỗi 2,5 cm chiều dài cá trưởng thành', 'Allow about 38 L per 2.5 cm of adult length.').map(f => `${f.from} → ${f.to}`)).toEqual(['40 lít cho mỗi 2,5 cm → 15 lít cho mỗi cm'])
  // The nearest a twentieth under a minimum: the next one up (7 gallons, 26,5 litres: not 25 but 30; 1,150 gallons: 4.400).
  expect(breedFigures('cần khoảng 26 lít', 'about 26 L (7 gal)').map(f => f.to)).toEqual(['30 lít'])
  expect(breedFigures('hồ khoảng 4.350 lít', '1,150 gallons (about 4,350 L)').map(f => f.to)).toEqual(['4.400 lít'])
  // A US tank in the table is its size; a range's ends each; a figure already a keeper's, or no US figure, stays.
  expect(breedFigures('bể 110 lít', '').map(f => f.to)).toEqual(['120 lít'])
  expect(breedFigures('bể 75–115 lít sẽ thoải mái hơn', '').map(f => f.to)).toEqual(['80 lít', '120 lít'])
  expect(breedFigures('bể 40 lít, hoặc 65 lít', 'about 38 L (10 gal)')).toEqual([])
  // The facts' own US figure beside the page's litres, not the nearest: 1.050 lít is 280 gallons, 1.100 (275 would give 1.000, 5,65% under).
  expect(breedFigures('hồ tối thiểu 1.050 lít', 'Minimum pond 280 gallons (about 1,050 L). Separate holding pool 275 gallons (1,041 L).').map(f => f.to)).toEqual(['1.100 lít'])
})

test('a breed page\'s figure is kept only as its whole quantity, and a dose\'s water or a figure with no US figure is left to a person', () => {
  // 10 gallons an inch: 15 lít mỗi cm, not 15 lít mỗi 2,5 cm, nor a 15-litre tank beside an allowance reworded.
  const quote = ['khoảng 40 lít cho mỗi 2,5 cm chiều dài']
  const perCm = { ...breedFigures(quote[0]!, '', quote[0])[0]!, block: 0 }
  expect(keepsFigures(quote[0]!, 'Cho khoảng 15 lít cho mỗi cm chiều dài.', quote, [perCm])).toBeUndefined()
  expect(keepsFigures(quote[0]!, 'Cho khoảng 15 lít cho mỗi 2,5 cm chiều dài.', quote, [perCm])).toContain('15 lít cho mỗi cm')
  expect(keepsFigures(quote[0]!, 'Cá con ở bể 15 lít; cá lớn cần 40 lít nước với từng 2,5 cm.', quote, [perCm])).toContain('15 lít cho mỗi cm')
  // The part's litres as they were, the figure in place of its old one: the same litres in another paragraph don't
  // stand in for one dropped, and no other figure moves.
  const min = { ...breedFigures('132 lít là mức tối thiểu', '35 US gal (about 132 L)', 'Một nguồn coi 132 lít là mức tối thiểu.')[0]!, block: 1 }
  const two = 'Bể nuôi chung thường 130 lít.\nMột nguồn coi 132 lít là mức tối thiểu.'
  expect(keepsFigures(two, 'Bể nuôi chung thường 130 lít.\nMột nguồn coi 130 lít là mức tối thiểu.', ['132 lít là mức tối thiểu'], [min])).toBeUndefined()
  expect(keepsFigures(two, 'Bể nuôi chung thường 130 lít.\nMột nguồn coi bể rộng là cần.', ['132 lít là mức tối thiểu'], [min])).toBe('the figures as keepers say them aren\'t there: 130 lít')
  expect(keepsFigures(two, 'Bể nuôi chung thường 120 lít.\nMột nguồn coi 130 lít là mức tối thiểu.', ['132 lít là mức tối thiểu'], [min])).toBe('another figure changed: 130 lít gone, 120 lít added')
  expect(keepsFigures(two.replace('130 lít.', '100 lít.'), 'Bể nuôi chung thường 120 lít.\nMột nguồn coi 130 lít là mức tối thiểu.', ['132 lít là mức tối thiểu'], [min])).toBe('another figure changed: 100 lít gone, 120 lít added')
  // A dose's water stays exact: any figure beside a dose, its sentences before and after too (round.ts givesDose).
  const facts = 'Dose 1 ml per 10 US gal (38 L). 35 US gal (about 132 L) at least.'
  for (const block of ['Dùng 1 ml thuốc trong 38 lít nước.', 'Hòa 1 gói muối vào 38 lít nước.', 'Lấy 1 ml xanh methylen. Hòa vào 38 lít nước.']) expect(unitsLeft('38 lít', facts, block)).toBe('a dose is given beside it, whose water stays exact')
  expect(unitsLeft('132 lít là mức tối thiểu', facts, 'Dùng 1 ml thuốc trong 38 lít nước. Một nguồn coi 132 lít là mức tối thiểu.')).toBe('a dose is given beside it, whose water stays exact')
  expect(unitsLeft('132 lít là mức tối thiểu', facts, 'Một nguồn coi 132 lít là mức tối thiểu.')).toBeUndefined()
  // No US figure to work from: 36 gallons isn't beside 136 lít, nor a US tank; a Vietnamese decimal after thousands is read.
  expect(unitsLeft('Cần 136 lít cho một con.', 'Minimum 36 US gallons.')).toBe('no US figure to work 136 lít from')
  expect(unitsLeft('Cần 1.132,5 lít cho một con.', 'Minimum 36 US gallons.')).toBe('no US figure to work 1.132,5 lít from')
})

// Astra's read of 1e0aa388b: counts alone let figures trade places, a reading of the water and a treatment's rate were
// both taken for readings, and some ways of writing "per inch" were read as a tank.
test('a breed page\'s figures are held to their places, a treatment\'s rate is a dose, and each way of writing per inch is read', () => {
  const facts = '35 US gal (about 132 L) at least. A water-change bin of 50 US gal (190 L).'
  const place = (quote: string, block: string, i: number) => breedFigures(quote, facts, block).map(f => ({ ...f, block: i }))
  // Across paragraphs: 132 and 190 written as 200 and 130, each in the other's place.
  const across = 'Bể nuôi tối thiểu 132 lít.\nThùng thay nước 190 lít.'
  const both = [...place('132 lít', 'Bể nuôi tối thiểu 132 lít.', 0), ...place('190 lít', 'Thùng thay nước 190 lít.', 1)]
  expect(both.map(f => f.to)).toEqual(['130 lít', '200 lít'])
  expect(keepsFigures(across, 'Bể nuôi tối thiểu 130 lít.\nThùng thay nước 200 lít.', ['132 lít', '190 lít'], both)).toBeUndefined()
  expect(keepsFigures(across, 'Bể nuôi tối thiểu 200 lít.\nThùng thay nước 130 lít.', ['132 lít', '190 lít'], both)).toBe('the figures as keepers say them aren\'t there: 130 lít, 200 lít')
  // Within one: the minimum written as the bin's 100 and the bin as 130.
  const within = 'Bể nuôi tối thiểu 132 lít. Thùng thay nước 100 lít.'
  const one = place('132 lít', within, 0)
  expect(keepsFigures(within, 'Bể nuôi tối thiểu 130 lít. Thùng thay nước 100 lít.', ['132 lít'], one)).toBeUndefined()
  expect(keepsFigures(within, 'Bể nuôi tối thiểu 100 lít. Thùng thay nước 130 lít.', ['132 lít'], one)).toBe('its figures changed places')
  // Paragraphs split or joined, or a figure not where it was read: for a person.
  expect(keepsFigures(within, 'Bể nuôi tối thiểu 130 lít.\nThùng thay nước 100 lít.', ['132 lít'], one)).toBe('its paragraphs went from 1 to 2, so its figures can\'t be held to their places')
  expect(keepsFigures('Thùng thay nước 100 lít. Bể nuôi tối thiểu 132 lít.', 'Thùng thay nước 100 lít. Bể nuôi tối thiểu 130 lít.', ['132 lít'], one)).toContain('isn\'t where it was read')
  // The same 132 lít under another heading stays, and the mended one's paragraph is all that's read for its quote.
  const apart = 'Một nguồn coi 132 lít là mức tối thiểu.\nBể dự phòng 132 lít.'
  const first = place('132 lít là mức tối thiểu', 'Một nguồn coi 132 lít là mức tối thiểu.', 0)
  expect(keepsFigures(apart, 'Một nguồn coi 130 lít là mức tối thiểu.\nBể dự phòng 132 lít.', ['132 lít'], first)).toBeUndefined()
  expect(keepsFigures(apart, 'Một nguồn coi 130 lít là mức tối thiểu.\nBể dự phòng 130 lít.', ['132 lít'], first)).toBe('another figure changed: 132 lít gone, 130 lít added')

  // A reading of the water is no dose; a treatment's rate, in so many mg a litre too, is.
  expect(withoutConcentrations('Oxy hòa tan nên giữ từ 2,5 mg/l trở lên.')).not.toMatch(/2,5/)
  expect(withoutConcentrations('Giữ nitrat dưới 20 mg/l.')).not.toMatch(/20/)
  for (const dose of ['Dùng xanh methylen với liều 2 mg/l.', 'Tắm cá bằng oxy già với liều 1 ml/l.', 'Hydrogen peroxide (oxy già) 1 ml/l.', 'Thêm CO2 với liều 20 mg/l.', 'Bổ sung CO2 20 mg/l.']) expect(withoutConcentrations(dose)).toBe(dose)
  expect(unitsLeft('132 lít', facts, withoutConcentrations('Bể nuôi tối thiểu 132 lít.\nDùng xanh methylen với liều 2 mg/l.'))).toBe('a dose is given beside it, whose water stays exact')

  // Per inch, each way: "cho 2,5 cm", "mỗi 2,54 cm", "mỗi 1 inch"; any other length is for a person.
  const inch = 'Allow about 10 US gal (38 L) per inch of adult length.'
  for (const block of ['Cần 38 lít cho 2,5 cm chiều dài cá.', 'Cần 38 lít mỗi 2,54 cm chiều dài cá.', 'Cần 38 lít mỗi 1 inch chiều dài cá.', 'Cần 38 lít cho mỗi inch chiều dài cá.']) {
    expect(breedFigures('38 lít', inch, block).map(f => [f.to, f.was, f.is])).toEqual([['15 lít cho mỗi cm', '38/2.5cm', '15/cm']])
  }
  for (const block of ['Cần 38 lít mỗi 5 cm chiều dài cá.', 'Cần 38 lít cho 3 inch chiều dài cá.']) {
    expect(breedFigures('38 lít', inch, block)).toEqual([])
    expect(unitsLeft('38 lít', inch, block, block)).toBe('a figure per a length code doesn\'t work from (only per inch or per cm)')
  }
})

// Astra's fifth read, 2026-11-13: each of these saved a wrong figure or refused a right one.
test('a substance named beside a treatment is no reading, a tank set on something is no allowance, and one of two like figures may be mended alone', () => {
  // A treatment with the substance it treats: its figure is a dose, whatever the words.
  for (const dose of ['Khử nitrit bằng muối 1 g/l.', 'Xử lý nitrit: muối 1 g/l.', 'Khử nitrit bằng muối với liều 1 g/l.']) expect(withoutConcentrations(dose)).toBe(dose)
  expect(unitsLeft('38 lít', '10 US gal (38 L).', withoutConcentrations('Chuẩn bị 38 lít nước.\nKhử nitrit bằng muối 1 g/l.'))).toBe('a dose is given beside it, whose water stays exact')
  // Readings written as keepers write them.
  for (const reading of ['Giữ ôxy hòa tan trên 5 mg/l.', 'Ammonia dưới 0,5 mg/l.', 'NH₃ dưới 0,02 mg/l.', 'Nitrat: < 20 mg/l.']) expect(withoutConcentrations(reading)).not.toMatch(/\d/)
  // Where a tank stands is no allowance per inch or per a length.
  const facts = '10 US gal (38 L). 35 US gal (132 L).'
  expect(breedFigures('38 lít', facts, 'Bể 38 lít đặt trên 2,5 cm xốp lót.').map(f => [f.to, f.is])).toEqual([['40 lít', '40']])
  expect(breedFigures('132 lít', facts, 'Bể 132 lít đặt trên 5 cm xốp lót.').map(f => [f.to, f.is])).toEqual([['130 lít', '130']])
  expect(unitsLeft('132 lít', facts, 'Bể 132 lít đặt trên 5 cm xốp lót.', 'Bể 132 lít đặt trên 5 cm xốp lót.')).toBeUndefined()
  // One of two "132 lít" in a paragraph mended in its place; the other stays.
  const two = 'Bể chính 132 lít. Thùng dự phòng 132 lít.'
  const first = breedFigures('132 lít', facts, two).slice(0, 1).map(f => ({ ...f, block: 0 }))
  expect(first.map(f => [f.to, f.n])).toEqual([['130 lít', 0]])
  expect(keepsFigures(two, 'Bể chính 130 lít. Thùng dự phòng 132 lít.', ['132 lít'], first)).toBeUndefined()
  expect(keepsFigures(two, 'Bể chính 132 lít. Thùng dự phòng 130 lít.', ['132 lít'], first)).toBeDefined()
  // A range per inch is told once, as a range.
  const range = breedFigures('38–76 lít cho mỗi 2,5 cm', 'Allow 10 to 20 US gal (38–76 L) per inch.', 'Khoảng 38–76 lít cho mỗi 2,5 cm chiều dài cá.')
  expect(range.map(f => f.is)).toEqual(['15/cm', '30/cm'])
  expect(figuresSaid(range)).toBe('"38–76 lít cho mỗi 2,5 cm" → "15–30 lít cho mỗi cm" (10 US gallons to 20 US gallons per inch)')
})

// Astra's sixth read, 2026-11-13: each saved a wrong figure on d6ab7611d.
test('a dose said before its substance stays a dose, a length no allowance is goes to a person, and a mended figure stays after its own words', () => {
  // The dose word before the substance, or between: still a dose, so the water stays exact.
  for (const dose of ['Liều CO2 là 20 mg/l.', 'Châm phân nitrat 10 mg/l.', 'Dùng dung dịch ammonia 2 mg/l để chạy chu trình không cá.']) expect(withoutConcentrations(dose)).toBe(dose)
  expect(unitsLeft('38 lít', '10 US gal (38 L).', withoutConcentrations('Chuẩn bị 38 lít nước.\nThay nước định kỳ.\nLiều CO2 là 20 mg/l.'))).toBe('a dose is given beside it, whose water stays exact')
  for (const reading of ['Giữ ôxy hòa tan ổn định trên 5 mg/l.', 'Nitrat không được vượt quá 20 mg/l.', 'NH₄⁺ dưới 0,2 mg/l.', 'O₂ hòa tan trên 5 mg/l.']) expect(withoutConcentrations(reading)).not.toMatch(/\d/)
  // A length after a volume that no allowance reads: for a person, not a tank, and not per inch.
  const inch = 'Allow about 10 US gal (38 L) per inch of adult length.'
  for (const block of ['Cần 38 lít nước đã khử clo mỗi 2,5 cm chiều dài cá.', 'Cần 38 lít cho 2,5 cm.', 'Rút 38 lít mỗi 2,5 cm mực nước hạ xuống.', 'Cần 38 lít cho 2,5 cm chiều dài bể.']) {
    expect(breedFigures('38 lít', inch, block), block).toEqual([])
    expect(unitsLeft('38 lít', inch, block, block), block).toBe('a figure per a length code doesn\'t work from (only per inch or per cm)')
  }
  // Still read: the allowances keepers write, and a tank that stands on something.
  for (const block of ['Cần 38 lít nước sạch mỗi 2,5 cm chiều dài cá.', 'Cần 38 lít/inch.', 'Cần khoảng 38 lít cho mỗi inch cá.']) expect(breedFigures('38 lít', inch, block).map(f => f.to), block).toEqual(['15 lít cho mỗi cm'])
  expect(breedFigures('38 lít', '10 US gal (38 L).', 'Bể 38 lít đặt trên 2,5 cm xốp lót.').map(f => f.to)).toEqual(['40 lít'])
  // The main tank's figure mended by trading the sentences round, so the spare's is the one changed: not kept.
  const facts = '35 US gal (132 L).'
  const two = 'Bể chính 132 lít. Thùng dự phòng 132 lít.'
  const first = breedFigures('132 lít', facts, two).slice(0, 1).map(f => ({ ...f, block: 0 }))
  expect(keepsFigures(two, 'Thùng dự phòng 130 lít. Bể chính 132 lít.', ['132 lít'], first)).toBe('a mended figure isn\'t after its own words: 130 lít')
  expect(keepsFigures(two, 'Bể chính 130 lít. Thùng dự phòng 132 lít.', ['132 lít'], first)).toBeUndefined()
  // A range per inch in two paragraphs: each told once, as its own range.
  const both = [0, 1].flatMap(i => breedFigures('38–76 lít mỗi inch', 'Allow 10 to 20 US gal (38–76 L) per inch.', `${i ? 'Cá lớn' : 'Cá nhỏ'}: 38–76 lít mỗi inch cá.`).map(f => ({ ...f, block: i })))
  expect(figuresSaid(both)).toBe('"38–76 lít mỗi inch" → "15–30 lít cho mỗi cm" (10 US gallons to 20 US gallons per inch); "38–76 lít mỗi inch" → "15–30 lít cho mỗi cm" (10 US gallons to 20 US gallons per inch)')
})

test('an allowance with words before its length goes to a person, a dose after a colon stays a dose, waste breaking down is a reading, and a labelled tank stays after its label', () => {
  // "mỗi khoảng 2,5 cm", "mỗi con cá dài 2,5 cm": a length after the volume, words between; not a tank.
  for (const block of ['Cần 38 lít nước cho mỗi khoảng 2,5 cm chiều dài cá.', 'Cần 38 lít nước cho mỗi con cá dài 2,5 cm.']) {
    expect(breedFigures('38 lít', '10 US gal (38 L).', block), block).toEqual([])
    expect(unitsLeft('38 lít', '10 US gal (38 L).', block, block), block).toBe('a figure per a length code doesn\'t work from (only per inch or per cm)')
  }
  // A tank set on a mat with words before its thickness is still a tank.
  expect(breedFigures('38 lít', '10 US gal (38 L).', 'Bể 38 lít đặt trên tấm xốp dày 2,5 cm.').map(f => f.to)).toEqual(['40 lít'])
  // The dose's word before a colon: a dose, so the water stays exact.
  const dose = 'Liều dùng: ammonia 2 mg/l để chạy chu trình không cá.'
  expect(withoutConcentrations(dose)).toBe(dose)
  expect(unitsLeft('38 lít', '10 US gal (38 L).', withoutConcentrations(`Chuẩn bị 38 lít nước.\nĐợi nước ổn định.\n${dose}`))).toBe('a dose is given beside it, whose water stays exact')
  // Waste breaking down ("phân hủy") or a fish's waste ("phân cá") is no fertiliser: what it raises is a reading.
  for (const reading of ['Chất thải phân hủy làm ammonia lên tới 2 mg/l.', 'Phân cá làm amoniac lên tới 2 mg/l.']) expect(withoutConcentrations(reading), reading).not.toMatch(/\d/)
  expect(withoutConcentrations('Bón phân nitrat 10 mg/l.')).toMatch(/10 mg\/l/)
  // Each tank after its label: trading them round mends the spare's, not kept.
  const two = 'Bể chính: 132 lít. Thùng dự phòng: 132 lít.'
  const first = breedFigures('132 lít', '35 US gal (132 L).', two).slice(0, 1).map(f => ({ ...f, block: 0 }))
  expect(keepsFigures(two, 'Thùng dự phòng: 130 lít. Bể chính: 132 lít.', ['132 lít'], first)).toBe('a mended figure isn\'t after its own words: 130 lít')
  expect(keepsFigures(two, 'Bể chính: 130 lít. Thùng dự phòng: 132 lít.', ['132 lít'], first)).toBeUndefined()
  // Each tank before its words too.
  const after = '132 lít cho bể chính. 132 lít cho thùng dự phòng.'
  const one = breedFigures('132 lít', '35 US gal (132 L).', after).slice(0, 1).map(f => ({ ...f, block: 0 }))
  expect(keepsFigures(after, '130 lít cho thùng dự phòng. 132 lít cho bể chính.', ['132 lít'], one)).toBe('a mended figure isn\'t after its own words: 130 lít')
  expect(keepsFigures(after, '130 lít cho bể chính. 132 lít cho thùng dự phòng.', ['132 lít'], one)).toBeUndefined()
})

test('two tanks in a paragraph keep their own words, numbered ones too; any dose word earlier in the sentence holds; a length after a volume no allowance reads goes to a person', () => {
  // Two different tanks traded round, each with the other's mend: not kept.
  const facts = '35 US gal (132 L). 50 US gal (190 L).'
  const two = 'Bể chính: 132 lít. Thùng dự phòng: 190 lít.'
  const both = breedFigures('132 lít', facts, two).concat(breedFigures('190 lít', facts, two)).map(f => ({ ...f, block: 0 }))
  expect(both.map(f => f.to)).toEqual(['130 lít', '200 lít'])
  expect(keepsFigures(two, 'Thùng dự phòng: 130 lít. Bể chính: 200 lít.', ['132 lít', '190 lít'], both)).toBe('a mended figure isn\'t after its own words: 130 lít, 200 lít')
  expect(keepsFigures(two, 'Bể chính: 130 lít. Thùng dự phòng: 200 lít.', ['132 lít', '190 lít'], both)).toBeUndefined()
  // Tanks told apart by their numbers.
  const numbered = 'Bể 1: 132 lít. Bể 2: 132 lít.'
  const first = breedFigures('132 lít', '35 US gal (132 L).', numbered).slice(0, 1).map(f => ({ ...f, block: 0 }))
  expect(keepsFigures(numbered, 'Bể 2: 130 lít. Bể 1: 132 lít.', ['132 lít'], first)).toBe('a mended figure isn\'t after its own words: 130 lít')
  expect(keepsFigures(numbered, 'Bể 1: 130 lít. Bể 2: 132 lít.', ['132 lít'], first)).toBeUndefined()
  // A per-inch allowance mended to per cm, beside another figure: still after its own words.
  const inch = 'Allow about 10 US gal (38 L) per inch of adult length. 35 US gal (132 L).'
  const allowance = 'Bể chính 132 lít, cần 38 lít cho mỗi 2,5 cm chiều dài cá.'
  const perCm = breedFigures('38 lít', inch, allowance).map(f => ({ ...f, block: 0 }))
  expect(perCm.map(f => f.to)).toEqual(['15 lít cho mỗi cm'])
  expect(keepsFigures(allowance, 'Bể chính 132 lít, cần 15 lít cho mỗi cm chiều dài cá.', ['38 lít cho mỗi 2,5 cm'], perCm)).toBeUndefined()
  // "Cho" a substance is a dose, and so is a dose word anywhere before it in the sentence.
  for (const dose of ['Cho ammonia 2 mg/l để chạy chu trình không cá.', 'Bổ sung vào bể đang chạy chu trình ammonia 2 mg/l.']) {
    expect(withoutConcentrations(dose), dose).toBe(dose)
    expect(unitsLeft('38 lít', '10 US gal (38 L).', withoutConcentrations(`Chuẩn bị 38 lít nước.\nKhử clo và giữ nhiệt độ ổn định.\n${dose}`)), dose).toBe('a dose is given beside it, whose water stays exact')
  }
  // "Cho" a fish, before a reading, is no dose: butterfly koi's "con số chung cho koi: oxy hòa tan tối thiểu khoảng 2,5 mg/L".
  expect(withoutConcentrations('Một nguồn đưa ra con số chung cho koi: oxy hòa tan tối thiểu khoảng 2,5 mg/L, cho ăn khoảng 5% trọng lượng cơ thể.')).not.toMatch(/2,5/)
  // A length after the volume that no allowance reads, a range too: for a person. The tank's own size stays a tank's.
  for (const block of ['Cần 38 lít nước ứng với 2,5 cm chiều dài cá.', 'Cần 38 lít cho mỗi 5–7,5 cm chiều dài cá.']) {
    expect(breedFigures('38 lít', '10 US gal (38 L).', block), block).toEqual([])
    expect(unitsLeft('38 lít', '10 US gal (38 L).', block, block), block).toBe('a figure per a length code doesn\'t work from (only per inch or per cm)')
  }
  for (const block of ['Bể 38 lít dài 60 cm.', 'Bể 38 lít (60 × 30 × 30 cm).', 'Bể 38 lít, kính dày 5 mm.']) expect(breedFigures('38 lít', '10 US gal (38 L).', block).map(f => f.to), block).toEqual(['40 lít'])
})

test('a per-inch allowance mended as told is kept beside a tank; a tank keeps its label after a colon and its size with words before it; "cho vào" holds its dose; a length of the fish goes to a person', () => {
  // The writer is told "15 lít cho mỗi cm": written so, beside another figure, it is kept.
  const inch = 'Allow about 10 US gal (38 L) per inch of adult length. 35 US gal (132 L).'
  for (const [before, after] of [['Bể chính 132 lít, cần 38 lít mỗi 2,5 cm chiều dài cá.', 'Bể chính 132 lít, cần 15 lít cho mỗi cm chiều dài cá.'], ['Bể chính 132 lít, cần 38 lít nước cho mỗi 2,5 cm chiều dài cá.', 'Bể chính 132 lít, cần 15 lít nước cho mỗi cm chiều dài cá.']] as const) {
    const figs = breedFigures('38 lít', inch, before).map(f => ({ ...f, block: 0 }))
    expect(figs.map(f => f.to), before).toEqual(['15 lít cho mỗi cm'])
    expect(keepsFigures(before, after, ['38 lít'], figs), before).toBeUndefined()
  }
  // Each tank's label before its colon, with words after it: trading their mends is refused.
  const facts = '35 US gal (132 L). 50 US gal (190 L).'
  for (const word of ['tối thiểu', 'khoảng']) {
    const two = `Bể chính: ${word} 132 lít. Thùng dự phòng: ${word} 190 lít.`
    const both = breedFigures('132 lít', facts, two).concat(breedFigures('190 lít', facts, two)).map(f => ({ ...f, block: 0 }))
    expect(keepsFigures(two, `Thùng dự phòng: ${word} 130 lít. Bể chính: ${word} 200 lít.`, ['132 lít', '190 lít'], both), word).toBe('a mended figure isn\'t after its own words: 130 lít, 200 lít')
    expect(keepsFigures(two, `Bể chính: ${word} 130 lít. Thùng dự phòng: ${word} 200 lít.`, ['132 lít', '190 lít'], both), word).toBeUndefined()
  }
  // A tank's own size with words before its figure is still its size.
  for (const block of ['Bể 132 lít dài khoảng 90 cm.', 'Bể 132 lít sâu ít nhất 50 cm.']) expect(breedFigures('132 lít', '35 US gal (132 L).', block).map(f => f.to), block).toEqual(['130 lít'])
  // "Cho vào" a running tank, the substance later in the sentence: a dose.
  const dose = 'Cho vào bể đang chạy chu trình ammonia 2 mg/l.'
  expect(withoutConcentrations(dose)).toBe(dose)
  expect(unitsLeft('38 lít', '10 US gal (38 L).', withoutConcentrations(`Chuẩn bị 38 lít nước.\nKhử clo và giữ nhiệt độ ổn định.\n${dose}`))).toBe('a dose is given beside it, whose water stays exact')
  // The fish's length, named after it: for a person, not the tank's size.
  const fish = 'Cần 38 lít nước ứng với chiều dài 2,5 cm của cá.'
  expect(breedFigures('38 lít', '10 US gal (38 L).', fish)).toEqual([])
  expect(unitsLeft('38 lít', '10 US gal (38 L).', fish, fish)).toBe('a figure per a length code doesn\'t work from (only per inch or per cm)')
})

test('a breed page\'s units are mended, in an FAQ answer too, after the part\'s other mend in the same try, with each figure as the rule names it', async () => {
  const { root, file, p, source, tank, faq } = await breed()
  const state = reading(p, [source, tank, faq])
  // Due on its units alone too: no English beside a breed page to keep a figure from.
  expect(rewriteDue(p, reading(p, [faq]))).toBe(true)
  expect([...mendable(p, state)].map(([field, fs]) => [field, fs.map(f => f.check)])).toEqual([['body', ['product', 'units']], ['faq.0.a', ['units']]])
  const { llm, prompts } = notesLlm()
  const r = await fitRewrite(root, [p], state, { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/breeds/pigeon-blood-discus body (0.90)', 'vi/breeds/pigeon-blood-discus body units (0.90)', 'vi/breeds/pigeon-blood-discus faq.0.a (0.90)'])
  const t = JSON.parse(await readFile(file, 'utf8'))
  expect(t.body).toContain('<p>Một người chơi kể rằng cá cần nhiều chỗ. Một nguồn coi 130 lít là mức tối thiểu cho một con lớn.</p>')
  expect(t.faq[0].a).toBe('Cá con có thể bắt đầu trong bể 120 lít.')
  // The rewriter is told each figure, a per-fish allowance isn't a dose, and its reviewer is told the same.
  const [, units, faqRewrite] = prompts.filter(x => x.kind === 'rewrite')
  expect(units!.prompt).toContain('Write exactly these figures: "132 lít" → "130 lít" (35 US gallons)')
  expect(units!.prompt).toContain('A tank or water per fish, or per cm of a fish, is an allowance, not a dose')
  expect(faqRewrite!.prompt).toContain('"110 lít" → "120 lít" (29 US gallons)')
  expect(prompts.filter(x => x.kind === 'review').map(x => x.prompt.includes('"132 lít" → "130 lít"') || x.prompt.includes('"110 lít" → "120 lít"'))).toEqual([false, true, true])
})

test('a breed page\'s units quote the other mend reworded is found again by its litres; a dose\'s water is left to a person', async () => {
  // The other finding quotes both sentences, so its mend (mend.ts: only the sentences a finding quotes) rewords the tank's.
  const both = 'Một người chơi ở Anh kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.'
  const { root, file, p, source, tank } = await breed()
  const { llm, prompts } = notesLlm({ other: vi => vi.replace(' ở Anh', '').replace(' cho một con lớn', '') })
  const r = await fitRewrite(root, [p], reading(p, [{ ...source, quote: both }, tank]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/breeds/pigeon-blood-discus body (0.90)', 'vi/breeds/pigeon-blood-discus body units (0.90)'])
  expect(JSON.parse(await readFile(file, 'utf8')).body).toContain('Một người chơi kể rằng cá cần nhiều chỗ. Một nguồn coi 130 lít là mức tối thiểu.')
  // The units pass mends the tank's sentence as the other mend left it.
  const units = prompts.filter(x => x.kind === 'rewrite')[1]!.prompt
  expect(units).toContain('] Một nguồn coi 132 lít là mức tối thiểu.')
  expect(units.split('--- FIX ---\n')[1]).toContain('Write exactly these figures: "132 lít" → "130 lít"')
  // The reviewer holds the guard too, not the figures alone.
  expect(prompts.filter(x => x.kind === 'review')[1]!.prompt).toContain('a minimum never more than a twentieth under it')

  // A spare tank of the same size: in another paragraph it stays, the minimum found in its own; in the same one, which is which is for a person.
  const reword = { other: (vi: string) => vi.replace(' ở Anh', '').replace(' cho một con lớn', '') }
  const apart = await breed({ body: '<p>Bể dự phòng có 132 lít nước.</p><p>Một người chơi ở Anh kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>' })
  await fitRewrite(apart.root, [apart.p], reading(apart.p, [{ ...apart.source, quote: both }, apart.tank]), { llm: notesLlm(reword).llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(JSON.parse(await readFile(apart.file, 'utf8')).body).toContain('<p>Bể dự phòng có 132 lít nước.</p><p>Một người chơi kể rằng cá cần nhiều chỗ. Một nguồn coi 130 lít là mức tối thiểu.</p>')
  const together = await breed({ body: '<p>Bể dự phòng có 132 lít nước. Một người chơi ở Anh kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>' })
  const t2 = await fitRewrite(together.root, [together.p], reading(together.p, [{ ...together.source, quote: both }, together.tank]), { llm: notesLlm(reword).llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(t2.rewritten).toEqual(['vi/breeds/pigeon-blood-discus body (0.90)'])
  expect(t2.skipped).toContain('vi/breeds/pigeon-blood-discus body units: the other mend reworded it, and its figure can\'t be told apart ("Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.")')
  expect(JSON.parse(await readFile(together.file, 'utf8')).body).toContain('Bể dự phòng có 132 lít nước. Một người chơi kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít là mức tối thiểu.')

  const dose = await breed({ faq: 'Khi cá bệnh, dùng 1 ml thuốc trong 38 lít nước.', faqQuote: '38 lít nước' })
  const none = notesLlm()
  const d = await fitRewrite(dose.root, [dose.p], reading(dose.p, [dose.faq]), { llm: none.llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(none.prompts).toEqual([])
  // A dose in the FAQ's question makes its answer's water the dose's (Astra's read of 1e0aa388b).
  const asked = await breed({ faq: 'Dùng 38 lít nước đã khử clo.', faqQuote: '38 lít nước', faqQ: 'Pha 1 ml thuốc vào bao nhiêu nước?' })
  const askedLlm = notesLlm()
  const a = await fitRewrite(asked.root, [asked.p], reading(asked.p, [asked.faq]), { llm: askedLlm.llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(askedLlm.prompts).toEqual([])
  expect(a.skipped.every(x => x.includes('a dose is given beside it'))).toBe(true)
  // The check's own units finding on the figure too (fit.ts fitRules): both left.
  expect(d.skipped).toEqual(['vi/breeds/pigeon-blood-discus faq.0.a units: a dose is given beside it, whose water stays exact ("38 lít")', 'vi/breeds/pigeon-blood-discus faq.0.a units: a dose is given beside it, whose water stays exact ("38 lít nước")'])
})

test('a breed page\'s figure with a dose near it, in its paragraph, the one before or after or the rest of its section, is left; one under another heading is mended', async () => {
  for (const [body, left] of [
    ['<p>Khi cá bệnh, chuẩn bị 1 gói muối.</p><p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>', true],
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Thêm 1 gói muối rồi khuấy đều.</p>', true],
    // Its section, between the headings either side: a treatment's water two paragraphs from its dose is left (Astra's
    // read of cceab6d07), and a dose under another heading leaves the tank to be mended.
    ['<p>Chuẩn bị 132 lít nước trong một thùng riêng.</p><p>Khử clo và chỉnh nhiệt độ bằng với nước trong bể.</p><p>Thêm 1 ml xanh methylen vào thùng rồi khuấy đều.</p>', true],
    ['<p>Khi cá bệnh, chuẩn bị 1 gói muối.</p><p>Cá thích nước sạch.</p><p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>', true],
    ['<p>Khi cá bệnh, chuẩn bị 1 gói muối.</p><h3>Nuôi thế nào</h3><p>Cá thích nước sạch.</p><p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>', false],
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Cá thích nước sạch.</p><h3>Bệnh</h3><p>Cá thích nước sạch.</p><p>Khi cá bệnh, thêm 1 gói muối.</p>', false],
    // Koi's and butterfly koi's oxygen, a concentration, in their section but not beside the tank: the tank is mended.
    // Beside it, read whole as before: left.
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Cá thích nước sạch.</p><p>Oxy hòa tan nên giữ từ 2,5 mg/l trở lên.</p>', false],
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Cá thích nước sạch.</p><p>Oxy hòa tan tối thiểu khoảng 2,5 mg/L, cho ăn hai lần mỗi ngày.</p>', false],
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Oxy hòa tan nên giữ từ 2,5 mg/l trở lên.</p>', true],
    ['<p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p><p>Cá thích nước sạch.</p><p>Oxy hòa tan nên giữ từ 2,5 mg/l, và thêm 1 gói muối khi cá bệnh.</p>', true],
  ] as const) {
    const b = await breed({ body })
    const quote = body.startsWith('<p>Chuẩn bị') ? 'Chuẩn bị 132 lít nước trong một thùng riêng.' : b.tank.quote
    const { llm, prompts } = notesLlm()
    const r = await fitRewrite(b.root, [b.p], reading(b.p, [{ ...b.tank, quote }]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
    expect(prompts.length > 0).toBe(!left)
    expect(r.skipped.some(x => x.includes('a dose is given beside it'))).toBe(left)
  }
})

test('a breed page\'s units finding code works out no figure for is left to a person: gallons or a length in it, or a figure already the size keepers say', async () => {
  // Page Recovery's probes on cceab6d07: each went to the rewriter told no figure, and its change was kept. (120 lít,
  // no US tank's conversion and not in this breed's facts, has no US figure to work from: left too.)
  const none = 'code works out no figure for it (gallons or a length in it, or a figure already the size keepers say)'
  for (const [body, quote, rewrite, why] of [
    ['<p>Một nguồn coi bể 30 gallon là đủ cho hai con.</p>', 'Một nguồn coi bể 30 gallon là đủ cho hai con.', ['bể 30 gallon', 'bể 110 lít'], none],
    ['<p>Một nguồn coi bể 40 lít là đủ cho cá con.</p>', 'Một nguồn coi bể 40 lít là đủ cho cá con.', ['bể 40 lít', 'bể 38 lít'], none],
    ['<p>Một nguồn coi bể 120 lít là đủ cho hai con.</p>', 'Một nguồn coi bể 120 lít là đủ cho hai con.', ['bể 120 lít', 'bể 114 lít'], 'no US figure to work 120 lít from'],
    ['<p>Cá trưởng thành dài khoảng 30,5 cm.</p>', 'Cá trưởng thành dài khoảng 30,5 cm.', ['30,5 cm', '25 cm'], none],
  ] as const) {
    const b = await breed({ body })
    const before = await readFile(b.file, 'utf8')
    const { llm, prompts } = notesLlm({ other: vi => vi.replace(rewrite[0], rewrite[1]) })
    const f = { check: 'units' as const, part: part(b.p, 'body'), quote, why: 'a converted figure' }
    const r = await fitRewrite(b.root, [b.p], reading(b.p, [f]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
    expect(prompts).toEqual([])
    expect(r.rewritten).toEqual([])
    // The check's own finding on the gallons ("gallon") too: each left.
    expect(r.skipped).toContain(`vi/breeds/pigeon-blood-discus body units: ${why} ("${quote}")`)
    expect(r.skipped.every(x => x.includes(none) || x.includes(why))).toBe(true)
    expect(await readFile(b.file, 'utf8')).toBe(before)
  }
})

test('a breed page\'s units rewrite is kept only with the part\'s litres as they were and the figure in place of its old one: the same litres in another paragraph don\'t stand in for it', async () => {
  // Page Recovery's probe (the figure dropped, "130 lít" in another paragraph) and Astra's (132 written 120, a spare tank's 130 lít beside it).
  for (const [to, off] of [
    ['bể rộng', 'the figures as keepers say them aren\'t there: 130 lít'],
    ['120 lít', 'the figures as keepers say them aren\'t there: 130 lít'],
  ] as const) {
    const b = await breed({ body: '<p>Bể dự phòng thường 130 lít.</p><p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>' })
    const before = await readFile(b.file, 'utf8')
    const { llm } = notesLlm({ figures: vi => vi.replace('132 lít', to) })
    const r = await fitRewrite(b.root, [b.p], reading(b.p, [b.tank]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
    expect(r.rewritten).toEqual([])
    expect(r.notKept).toHaveLength(1)
    expect(r.notKept[0]).toMatch(new RegExp(`^vi/breeds/pigeon-blood-discus body \\(0\\.90: ${off}`))
    // A figure written as words is something the sentence didn't say, too (mend.ts addedWords).
    if (to === 'bể rộng') expect(r.notKept[0]).toContain('Sentence 5 says what it didn\'t: "bể rộng"')
    expect(await readFile(b.file, 'utf8')).toBe(before)
  }
  // Told right, it's kept, the spare tank as it was; quoted twice (the check's own finding on "132 lít" too), mended once.
  const b = await breed({ body: '<p>Bể dự phòng thường 130 lít.</p><p>Một nguồn coi 132 lít là mức tối thiểu cho một con lớn.</p>' })
  const { llm, prompts } = notesLlm()
  const r = await fitRewrite(b.root, [b.p], reading(b.p, [b.tank, { ...b.tank, quote: '132 lít' }]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/breeds/pigeon-blood-discus body (0.90)'])
  expect(prompts.find(x => x.kind === 'review')!.prompt.split('--- FIGURES ---\n')[1]!.split('\n\n')[0]!.match(/"132 lít" → "130 lít"/g)).toHaveLength(1)
  expect(JSON.parse(await readFile(b.file, 'utf8')).body).toContain('<p>Bể dự phòng thường 130 lít.</p><p>Một nguồn coi 130 lít là mức tối thiểu cho một con lớn.</p>')
})

test('a breed page\'s per-inch figure is read whole from its paragraph, in each way it is written, and named per cm', async () => {
  // Astra's read of cceab6d07: "38 lít mỗi 2,5 cm", quoted as "38 lít" alone, was told and kept as 40 lít mỗi 2,5 cm.
  const facts = 'Allow about 10 US gal (38 L) per inch of adult length.'
  for (const block of ['Cần khoảng 38 lít mỗi 2,5 cm chiều dài cá.', 'Cần khoảng 38 lít cho mỗi 2,5 cm chiều dài cá.', 'Cần khoảng 38 lít nước trên mỗi 2,5 cm chiều dài.', 'Cần 38 lít/2,5 cm chiều dài.', 'Cần 38 lít nước cho từng 2,5 cm chiều dài.']) {
    expect(breedFigures('38 lít', facts, block).map(f => [f.to, f.was, f.is])).toEqual([['15 lít cho mỗi cm', '38/2.5cm', '15/cm']])
    expect(breedFigures(block, facts).map(f => f.to)).toEqual(['15 lít cho mỗi cm'])
  }
  // A tank of 38 litres is a tank: 40. A figure already given per cm of fish is no tank: none.
  expect(breedFigures('38 lít', facts, 'Cá con ở bể 38 lít.').map(f => f.to)).toEqual(['40 lít'])
  expect(breedFigures('19 lít cho mỗi cm', 'Minimum 5 US gal (19 L).')).toEqual([])

  const b = await breed({ body: '<p>Cần khoảng 38 lít mỗi 2,5 cm chiều dài cá.</p>' })
  await writeFile(join(b.root, 'engine-state/breeds/pigeon-blood-discus.json'), JSON.stringify({ keeping: [facts] }))
  const f = { check: 'units' as const, part: part(b.p, 'body'), quote: '38 lít', why: 'a converted per-inch figure' }
  for (const [write, kept] of [['40 lít mỗi 2,5 cm', false], ['15 lít cho mỗi cm', true]] as const) {
    const before = await readFile(b.file, 'utf8')
    const { llm, prompts } = notesLlm({ figures: vi => vi.replace('38 lít mỗi 2,5 cm', write) })
    const r = await fitRewrite(b.root, [b.p], reading(b.p, [f]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5, retry: true })
    expect(prompts[0]!.prompt).toContain('Write exactly these figures: "38 lít mỗi 2,5 cm" → "15 lít cho mỗi cm" (10 US gallons per inch)')
    if (kept) expect(JSON.parse(await readFile(b.file, 'utf8')).body).toContain('<p>Cần khoảng 15 lít cho mỗi cm chiều dài cá.</p>')
    else { expect(r.notKept[0]).toContain('the figures as keepers say them aren\'t there: 15 lít cho mỗi cm'); expect(await readFile(b.file, 'utf8')).toBe(before) }
  }
  // Astra's read of 60e5e37fd: the figure's words are covered, not the ones between them: "nước sạch" dropped isn't kept.
  const clean = await breed({ body: '<p>Cần 38 lít nước sạch mỗi 2,5 cm chiều dài cá.</p>' })
  await writeFile(join(clean.root, 'engine-state/breeds/pigeon-blood-discus.json'), JSON.stringify({ keeping: [facts] }))
  const before = await readFile(clean.file, 'utf8')
  const g = { check: 'units' as const, part: part(clean.p, 'body'), quote: '38 lít', why: 'a converted per-inch figure' }
  const r = await fitRewrite(clean.root, [clean.p], reading(clean.p, [g]), { llm: notesLlm({ figures: () => 'Cần 15 lít cho mỗi cm chiều dài cá.' }).llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual([])
  expect(r.notKept.join(' ')).toMatch(/Left out of sentence \d+, and no finding asks for it to go: "nước sạch"/)
  expect(await readFile(clean.file, 'utf8')).toBe(before)
})

test('a breed page\'s units rewrite that names another figure isn\'t kept, and the part\'s other mend stays', async () => {
  const { root, file, p, source, tank } = await breed()
  const { llm } = notesLlm({ figures: vi => vi.replace('132 lít', '140 lít') })
  const r = await fitRewrite(root, [p], reading(p, [source, tank]), { llm, now: () => new Date('2026-11-12T12:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/breeds/pigeon-blood-discus body (0.90)'])
  // Its 140, a figure the sentence didn't have and code didn't work out, is named too (mend.ts addedWords).
  expect(r.notKept).toEqual(['vi/breeds/pigeon-blood-discus body (0.90: the figures as keepers say them aren\'t there: 130 lít; Sentence 5 says what it didn\'t: "140")'])
  expect(JSON.parse(await readFile(file, 'utf8')).body).toContain('Một người chơi kể rằng cá cần nhiều chỗ. Một nguồn coi 132 lít')
})
for (const kind of ['species', 'guides']) test(`admission stops a ${kind} rewrite before calls, content writes or retry records`, async () => {
  const root = await content()
  const prior = process.env.ENGINE_COST_LOG
  try {
    const p = kind === 'species' ? await danio(root) : (await loadPages(join(root, 'content'), ['vi'])).find(p => p.kind === 'guides')!
    const state = reading(p, kind === 'species' ? found(p) : [{ check: 'source', part: 'P1', quote: '', why: 's' }])
    const files = (await readdir(root, { recursive: true })).filter(f => f.endsWith('.json'))
    const before = await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))
    const log = join(root, 'cost.jsonl')
    await writeFile(log, JSON.stringify({ at: new Date().toISOString(), step: 'fit-rewrite', piece: 'last', pieceUsd: 10000, finished: true }) + '\n')
    process.env.ENGINE_COST_LOG = log
    nameStep('fit-rewrite')
    const model = fakeLlm(vi => vi, 1)
    const report = await fitRewrite(root, [p], state, { llm: model.llm, now: () => new Date() }, { limit: 1 })
    expect(report.stopped).toContain('not started')
    expect(report.failed).toEqual([])
    expect(model.calls).toEqual([])
    expect((await readdir(root, { recursive: true })).filter(f => f.endsWith('.json'))).toEqual(files)
    expect(await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))).toEqual(before)
  } finally {
    if (prior === undefined) delete process.env.ENGINE_COST_LOG
    else process.env.ENGINE_COST_LOG = prior
    nameStep(undefined)
    await rm(root, { recursive: true, force: true })
  }
})

// The chief of staff, 14 Nov 2026: "A part left with one line, or with only what a dealer's list gave it, is dropped, not
// kept" (the angelfish's quick facts, down to "Xuất xứ: Brazil").
test('a part a cut reduces to one line goes off the page in every language, its heading with it when it was the heading\'s only text', async () => {
  const root = await content()
  const dir = join(root, 'content/species', ID)
  const p = await danio(root)
  await writeFile(join(dir, 'id.json'), JSON.stringify({ sections: { 'quickFacts:sprucepets': '<ul><li>Akuarium minimal: 8 liter</li><li>Pakan: omnivora</li></ul>', 'habitat:seriouslyfish': '<p>Kolam.</p>' } }, null, 2))
  const stock = { check: 'source' as const, part: part(p, 'sections.quickFacts:sprucepets'), quote: 'Bể tối thiểu: 8 lít', why: 'a dealer\'s list' }
  const r = await fitRewrite(root, [p], reading(p, [stock]), { llm: fakeLlm(vi => (vi.includes('Bể tối thiểu') ? '' : vi), 0.9).llm, now: () => new Date('2026-11-14T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.quickFacts:sprucepets off the page (one line left)'])
  const entity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(entity.sections.map((s: { key: string; source: string }) => `${s.key}:${s.source}`)).not.toContain('quickFacts:sprucepets')
  expect(entity.sections.map((s: { key: string; source: string }) => `${s.key}:${s.source}`)).toContain('quickFacts:seriouslyfish')
  expect(Object.keys(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')).sections)).not.toContain('quickFacts:sprucepets')
  expect(JSON.parse(await readFile(join(dir, 'id.json'), 'utf8')).sections).toEqual({ 'habitat:seriouslyfish': '<p>Kolam.</p>' })

  // A heading with no other source's text: the part goes, and the heading with it, listed for the chief of staff.
  const lone = await content()
  const file = join(lone, 'content/species', ID, 'vi.json')
  const vi = JSON.parse(await readFile(file, 'utf8'))
  vi.sections['habitat:seriouslyfish'] = '<p>Ao cạn nhiều cỏ ở cao nguyên Shan, Myanmar. Một cửa hàng ở Đức có bán.</p>'
  await writeFile(file, JSON.stringify(vi, null, 2))
  const q = await danio(lone)
  const shop = { check: 'shop' as const, part: part(q, 'sections.habitat:seriouslyfish'), quote: 'Một cửa hàng ở Đức có bán.', why: 'a shop' }
  const s = await fitRewrite(lone, [q], reading(q, [shop]), { llm: fakeLlm(vi => (vi.includes('cửa hàng') ? '' : vi), 0.9).llm, now: () => new Date() }, { limit: 5 })
  expect(s.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish off the page (one line left, its heading with it: for the chief of staff)'])
  expect(Object.keys(JSON.parse(await readFile(file, 'utf8')).sections)).not.toContain('habitat:seriouslyfish')
  const loneEntity = JSON.parse(await readFile(join(lone, 'content/species', ID, 'entity.json'), 'utf8'))
  expect(loneEntity.sections.map((x: { key: string }) => x.key)).not.toContain('habitat')

  // One line that was one line, a detail cut from it: not reduced, kept (the chief of staff: "reduced to one line").
  const one = await content()
  const oneFile = join(one, 'content/species', ID, 'vi.json')
  const ov = JSON.parse(await readFile(oneFile, 'utf8'))
  ov.sections['habitat:seriouslyfish'] = '<p>Ao cạn nhiều cỏ ở cao nguyên Shan, giá 5 đô la ở Mỹ.</p>'
  await writeFile(oneFile, JSON.stringify(ov, null, 2))
  const o1 = await danio(one)
  const price = { check: 'price' as const, part: part(o1, 'sections.habitat:seriouslyfish'), quote: ', giá 5 đô la ở Mỹ', why: 'a US price' }
  const kept = await fitRewrite(one, [o1], reading(o1, [price]), { llm: fakeLlm(vi => vi.replace(', giá 5 đô la ở Mỹ', ''), 0.9).llm, now: () => new Date() }, { limit: 5 })
  expect(kept.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  expect(JSON.parse(await readFile(oneFile, 'utf8')).sections['habitat:seriouslyfish']).toBe('<p>Ao cạn nhiều cỏ ở cao nguyên Shan.</p>')
})

// The chief of staff, 14 Nov 2026: four pages were held for good on one-line parts that were all the source's, which no
// dealer check takes. A part of three sentences or fewer whose every sentence goes whole comes off the page.
test('a short part whose every sentence goes whole comes off the page, with its heading when it was the only text; a longer one stays held', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  const vi = JSON.parse(await readFile(file, 'utf8'))
  vi.sections['habitat:seriouslyfish'] = '<p>Nơi sống có ảnh chụp: sông Rio Parana, bang Corrientes, Argentina.</p>'
  await writeFile(file, JSON.stringify(vi, null, 2))
  const p = await danio(root)
  const photo = { check: 'source' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'Nơi sống có ảnh chụp', why: 'the source\'s photo' }
  const r = await fitRewrite(root, [p], reading(p, [photo]), { llm: fakeLlm(() => '', 0.9).llm, now: () => new Date() }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish off the page (every line went, its heading with it: for the chief of staff)'])
  expect(r.gone).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish sentence 1 went whole: "Nơi sống có ảnh chụp: sông Rio Parana, bang Corrientes, Argentina."'])
  expect(Object.keys(JSON.parse(await readFile(file, 'utf8')).sections)).not.toContain('habitat:seriouslyfish')
  const entity = JSON.parse(await readFile(join(root, 'content/species', ID, 'entity.json'), 'utf8'))
  expect(entity.sections.map((x: { key: string }) => x.key)).not.toContain('habitat')
  // A longer part: held, with its sentences in the run's report.
  const long = await content()
  const longFile = join(long, 'content/species', ID, 'vi.json')
  const lv = JSON.parse(await readFile(longFile, 'utf8'))
  lv.sections['habitat:seriouslyfish'] = '<p>Hiện có cá bắt ngoài tự nhiên. Con nào cũng đã lớn. Lô này về từ Venezuela. Cá khỏe.</p>'
  await writeFile(longFile, JSON.stringify(lv, null, 2))
  const q = await danio(long)
  const before = await readFile(longFile, 'utf8')
  const stock = { check: 'source' as const, part: part(q, 'sections.habitat:seriouslyfish'), quote: 'Hiện có cá bắt ngoài tự nhiên. Con nào cũng đã lớn. Lô này về từ Venezuela. Cá khỏe.', why: 'a dealer\'s stock' }
  const held = await fitRewrite(long, [q], reading(q, [stock]), { llm: fakeLlm(() => '', 0.9).llm, now: () => new Date() }, { limit: 5 })
  expect([held.rewritten, held.gone]).toEqual([[], []])
  expect(held.skipped.join(' ')).toContain('every sentence would go, and the part has 4: held for the chief of staff (sentence 1: "Hiện có cá bắt ngoài tự nhiên."')
  expect(await readFile(longFile, 'utf8')).toBe(before)
})

// The lane's guides (fit-front.ts): no reader has read them, so they're cut sentence by sentence, not written whole.
test('a guide in the lane is mended sentence by sentence, not written whole from its facts', async () => {
  const root = await content()
  // The fixture's guide source shown, as content() shows its fish sources.
  const sourcesFile = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(sourcesFile, 'utf8')) as Record<string, object>
  Object.assign(sources.aquariumcoop!, { publish: true, permission: { date: '2026-11-08', file: 'test', scope: ['text'] } })
  await writeFile(sourcesFile, JSON.stringify(sources))
  const file = join(root, 'content/guides/loc-cho-be-nano/vi.json')
  const t = JSON.parse(await readFile(file, 'utf8'))
  t.body = '<p>Lọc bio (lọc vi sinh bằng mút) rẻ, an toàn cho tép con và đủ cho bể dưới 40 lít. Một cửa hàng ở Mỹ bán loại này giá 5 đô la, rất đáng tiền.</p>'
  await writeFile(file, JSON.stringify(t, null, 2))
  const g = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'loc-cho-be-nano')!
  const price = { check: 'price' as const, part: part(g, 'body'), quote: 'Một cửa hàng ở Mỹ bán loại này giá 5 đô la, rất đáng tiền.', why: 'a US shop and price' }
  const lane = fakeLlm(vi => vi.replace('Một cửa hàng ở Mỹ bán loại này giá 5 đô la, rất đáng tiền.', ''), 0.9)
  const r = await fitRewrite(root, [g], reading(g, [price]), { llm: lane.llm, now: () => new Date() }, { limit: 5, mend: new Set([fitKey(g)]) })
  expect(r.rewritten).toEqual(['vi/guides/loc-cho-be-nano body (0.90)'])
  expect(lane.calls).toEqual(['rewrite', 'review'])
  expect(JSON.parse(await readFile(file, 'utf8')).body).toBe('<p>Lọc bio (lọc vi sinh bằng mút) rẻ, an toàn cho tép con và đủ cho bể dưới 40 lít.</p>')
})
