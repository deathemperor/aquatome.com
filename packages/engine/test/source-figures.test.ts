import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { mendPart, recordSourceFigures, sourceFigures, SOURCE_FIGURES_BATCHES, SOURCE_FIGURES_PACE, SOURCE_FIGURES_STATE, type SourceFiguresBook, type SourceFiguresState } from '../src/source-figures'

const SF = 'Base dimensions 90 ∗ 38 cm. An aquarium measuring 90 × 38 × 30 cm (36 × 15 × 12 in) - approximately 103 litres. A 10 gallon (38 litre) tank for fry. 73–82 °F (22.8–27.8 °C). Monthly averages vary from 17.2°C in December and January to 33.9°C in April.'

test("the old rounding's figures go back to the English's: sides, litres, a tank's length, °C", () => {
  expect(mendPart('<p>Đáy bể: 90 × 40 cm. Một bể 90 × 40 × 30 cm (khoảng 103 lít).</p>', SF, 'vi')).toEqual({
    text: '<p>Đáy bể: 90 × 38 cm. Một bể 90 × 38 × 30 cm (khoảng 103 lít).</p>',
    figures: ['90 × 40 cm → 90 × 38 cm', '90 × 40 × 30 cm → 90 × 38 × 30 cm'],
  })
  expect(mendPart('Bể 40 lít cho cá con.', SF, 'vi')).toEqual({ text: 'Bể 38 lít cho cá con.', figures: ['40 lít → 38 lít'] })
  expect(mendPart('Nhiệt độ: 23 đến 28 °C', SF, 'vi')).toEqual({ text: 'Nhiệt độ: 22,8 đến 27,8 °C', figures: ['23 đến 28 °C → 22,8 đến 27,8 °C'] })
  expect(mendPart('อุณหภูมิ 23–28 °C', SF, 'th')).toEqual({ text: 'อุณหภูมิ 22.8–27.8 °C', figures: ['23–28 °C → 22.8–27.8 °C'] })
  expect(mendPart('bể dài ít nhất 120 cm', 'A tank at least 122 cm (4 ft) long.', 'vi')).toEqual({ text: 'bể dài ít nhất 122 cm', figures: ['120 cm → 122 cm'] })
  // A range whose first number isn't a temperature ("tháng 1"): only its last end was rounded, and only it goes back.
  expect(mendPart('Từ 17°C vào tháng 12 và tháng 1 đến 34°C vào tháng 4.', SF, 'vi')).toEqual({ text: 'Từ 17,2°C vào tháng 12 và tháng 1 đến 33,9°C vào tháng 4.', figures: ['17°C → 17,2°C', '34°C → 33,9°C'] })
})

test('a figure that may be its own stays: the English gives it too, two English figures round to it, a dose\'s water, no English figure', () => {
  expect(mendPart('Bể 60 × 40 × 30 cm.', 'A 60 × 40 × 30 cm tank, or 60 × 38 × 30 cm.', 'vi')).toBeUndefined()
  expect(mendPart('Bể 60 × 40 × 30 cm.', 'Tanks of 61 × 38 × 30 cm or 60 × 38 × 30 cm.', 'vi')).toBeUndefined()
  expect(mendPart('Bể 40 lít.', 'A 38 litre or a 40 litre tank.', 'vi')).toBeUndefined()
  expect(mendPart('1 gói cho mỗi 40 lít nước.', SF, 'vi')).toBeUndefined()
  expect(mendPart('Bể 60 × 40 × 30 cm.', 'A tank of 24 × 15 × 12 in.', 'vi')).toBeUndefined()
  expect(mendPart('Cá dài 120 cm.', 'It grows to 122 cm.', 'vi')).toBeUndefined() // a fish's length, not a tank's
  // An independent read's cases: a dose's water across a tag or with no "per", a fish's length in a tank, an attribute.
  const DOSE_EN = 'One packet per 10 gallons. A 38 litre tank.'
  expect(mendPart('<p>1 gói cho mỗi <strong>40 lít</strong>.</p>', DOSE_EN, 'vi')).toBeUndefined()
  expect(mendPart('Hòa 1 gói trong 40 lít.', DOSE_EN, 'vi')).toBeUndefined()
  expect(mendPart('Trong bể, cá dài 120 cm.', 'In aquaria the fish grows to 4 feet. A 122 cm tank.', 'vi')).toBeUndefined()
  expect(mendPart('<a title="x > 40 lít">X</a>', 'A 38 litre tank.', 'vi')).toBeUndefined()
  // A tank's length named as one is put back: "bể dài", "chiều dài bể tối thiểu:", "akuarium", "ตู้ขนาด".
  for (const [t, lang] of [['Bể dài 120 cm là đủ.', 'vi'], ['Chiều dài bể tối thiểu: 120 cm', 'vi'], ['Akuarium 120 cm sudah cukup.', 'id'], ['ตู้ขนาด 120 ซม. ก็พอ', 'th']] as const) {
    expect(mendPart(t, 'A 122 cm (4 ft) tank.', lang), t).toHaveProperty('text', t.replace('120', '122'))
  }
})

test('a part is mended only when the old rounding gives its text back from the mended one', () => {
  // "41" isn't what the old rounding writes (it rounds to 5 cm): a writer's figure, left as it is.
  expect(mendPart('Bể 90 × 41 × 30 cm.', SF, 'vi')).toBeUndefined()
  expect(mendPart('Bể 90 × 40 × 30 cm.', SF, 'vi')).not.toHaveProperty('why')
})

const page = (sections: Record<string, string>, more: object = {}) => ({ slug: 's', name: 'Cá', altNames: [], sections, quality: { score: 1, indexable: true }, ...more })
async function site(n: number) {
  const root = await mkdtemp(join(tmpdir(), 'source-figures-'))
  const write = async (f: string, v: object) => { await mkdir(join(root, f, '..'), { recursive: true }); await writeFile(join(root, f), `${JSON.stringify(v, null, 2)}\n`) }
  for (let i = 0; i < n; i++) {
    await write(`content/species/f${i}/entity.json`, { id: `f${i}`, sections: [{ key: 'aquariumSize', source: 'seriouslyfish', sourceUrl: 'https://example.org', html: `<p>${SF}</p>` }] })
    await write(`content/species/f${i}/vi.json`, page({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 40 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' }))
  }
  await write('content/species/f0/id.json', page({ 'aquariumSize:seriouslyfish': '<p>Akuarium 90 × 40 × 30 cm.</p>' }, { held: { checks: ['harm'], at: '2026-11-08' } }))
  await write('content/guides/g/vi.json', page({}, { body: '<p>Bể 90 × 40 × 30 cm.</p>' }))
  return root
}

const P = SOURCE_FIGURES_PACE
const at = (h: number) => ({ now: () => new Date(Date.UTC(2026, 10, 12, h)) })
const T12 = '2026-11-12T12:00:00.000Z'
const marks = async (root: string) => JSON.parse(await readFile(join(root, SOURCE_FIGURES_STATE), 'utf8')) as SourceFiguresState
const book = async (root: string) => JSON.parse(await readFile(join(root, SOURCE_FIGURES_BATCHES), 'utf8')) as SourceFiguresBook
const OLD = page({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 40 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' })
const file = (key: string) => { const [lang, kind, id] = key.split('/'); return { page: `content/${kind}/${id}/${lang}.json`, back: `engine-state/put-back/${kind}/${id}.${lang}.json` } }
const edit = async (root: string, key: string, f: (t: Record<string, unknown>) => object) => {
  const p = join(root, file(key).page)
  await writeFile(p, `${JSON.stringify(f(JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>), null, 2)}\n`)
}
/** The gate's answer: a put-back file, and with `text`, the page's old text back. */
const putBack = async (root: string, key: string, v: { at: string; checks: string[]; unread?: true }, text = true) => {
  await mkdir(join(root, file(key).back, '..'), { recursive: true })
  await writeFile(join(root, file(key).back), JSON.stringify({ findings: [], text: {}, ...v }))
  if (text) await edit(root, key, () => OLD)
}
/** The gate couldn't read it: its old text back, and its mark gone (writer-records.ts). */
const unread = async (root: string, key: string, when: string) => {
  await putBack(root, key, { at: when, checks: [], unread: true })
  const state = await marks(root)
  delete state[key]
  await writeFile(join(root, SOURCE_FIGURES_STATE), JSON.stringify(state))
}

test('a run mends the first 30, the named first; once those are on main, 60 a run; marks not on main count against a run', async () => {
  const root = await site(P.first + P.perRun + 5)
  const dry = await sourceFigures(root, { dryRun: true, limit: 1000 })
  expect(dry.mended).toHaveLength(P.first + P.perRun + 5)
  expect(dry.left).toEqual(['id/species/f0: held, left as it is'])
  await expect(readFile(join(root, SOURCE_FIGURES_STATE), 'utf8')).rejects.toThrow() // a dry run writes nothing
  const first = await sourceFigures(root, { first: ['vi/species/f9'], onMain: {}, ...at(12) })
  expect(first.mended).toHaveLength(P.first)
  expect(first.mended[0]!.key).toBe('vi/species/f9')
  expect(first.waiting).toBe(P.perRun + 5)
  const f9 = JSON.parse(await readFile(join(root, 'content/species/f9/vi.json'), 'utf8'))
  expect(f9.sections).toEqual({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 38 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' })
  expect((await marks(root))['vi/species/f9']).toEqual({ at: T12, figures: ['90 × 40 × 30 cm → 90 × 38 × 30 cm'] })
  // Not on main yet: a second run mends nothing more, and records nothing for pages the gate hasn't read.
  expect([(await sourceFigures(root, { onMain: {}, ...at(13) })).mended.length]).toEqual([0])
  expect((await book(root)).batches[0]!.outcomes).toEqual({})
  // The first 30 on main: 60 a run, without asking, and again nothing more until those are on main.
  const published = await marks(root)
  expect((await sourceFigures(root, { onMain: published, ...at(15) })).mended).toHaveLength(P.perRun)
  expect((await sourceFigures(root, { onMain: published, ...at(16) })).mended).toHaveLength(0)
  const last = await sourceFigures(root, { onMain: await marks(root), ...at(18) })
  expect([last.mended.length, last.waiting, last.stopped]).toEqual([5, 0, undefined])
  expect((await book(root)).batches.map(b => [b.at, b.keys.length])).toEqual([[T12, P.first], ['2026-11-12T15:00:00.000Z', P.perRun], ['2026-11-12T18:00:00.000Z', 5]])
  // A guide has no English beside it: never touched.
  expect(JSON.parse(await readFile(join(root, 'content/guides/g/vi.json'), 'utf8')).body).toBe('<p>Bể 90 × 40 × 30 cm.</p>')
})

test('with no way to read the marks on main, it mends nothing', async () => {
  const r = await sourceFigures(await site(3), at(12)) // not a git checkout
  expect([r.mended.length, r.waiting]).toEqual([0, 3])
  expect(r.noMain).toMatch(/origin\/main/)
})

test('it stops by itself when more than one page in ten of a batch went wrong for more than its figures, as the gate answered the mend', async () => {
  const root = await site(P.first + P.perRun + 10)
  const keys = (await sourceFigures(root, { onMain: {}, ...at(12) })).mended.map(m => m.key)
  // The gate: three given their old text back for `source`, one in ten; three for `units` alone and one put back before
  // this mend, which don't count; and one it couldn't read.
  for (const k of keys.slice(0, 3)) await putBack(root, k, { at: '2026-11-12T12:30:00Z', checks: ['source'] })
  for (const k of keys.slice(3, 6)) await putBack(root, k, { at: '2026-11-12T12:30:00Z', checks: ['units'] })
  await putBack(root, keys[6]!, { at: '2026-11-10T00:00:00Z', checks: ['price'] }, false)
  await unread(root, keys[7]!, '2026-11-12T12:30:00Z')
  const once = await recordSourceFigures(root, at(13))
  expect([once.recorded.length, once.stopped]).toEqual([P.first - 1, undefined])
  const b = (await book(root)).batches[0]!
  expect([b.keys.length, b.wrong, b.outcomes[keys[3]!], b.outcomes[keys[6]!], b.outcomes[keys[7]!]]).toEqual([P.first, keys.slice(0, 3), 'given its old text back for units', 'passed', undefined])
  // A hold that comes later, for something else or by hand, isn't the gate's answer to this mend.
  await edit(root, keys[8]!, t => ({ ...t, held: { checks: ['harm'], at: '2026-11-12' } }))
  // 29 on main: the page it couldn't read is tried again first, within the 30, and stays in its batch.
  const retry = await sourceFigures(root, { onMain: await marks(root), ...at(15) })
  expect(retry.mended.map(m => m.key)).toEqual([keys[7]])
  expect((await book(root)).batches.map(x => x.keys.length)).toEqual([P.first])
  // The gate holds it for harm: the fourth of its 30. Recorded, it stops.
  await edit(root, keys[7]!, t => ({ ...t, held: { checks: ['harm'], at: '2026-11-12' } }))
  const why = /^the batch of 2026-11-12T12:00:00.000Z: 4 of 30 pages: .*given its old text back for source.*held for harm$/
  const rec = await recordSourceFigures(root, at(16))
  expect(rec.recorded).toEqual([`${keys[7]}: held for harm`])
  expect(rec.stopped).toMatch(why)
  // Nothing is mended while pages wait, and the stop stays once the holds and put-backs are gone.
  for (const k of [keys[7]!, keys[8]!]) await edit(root, k, ({ held: _, ...t }) => t)
  for (const k of keys.slice(0, 3)) await rm(join(root, file(k).back))
  const stopped = await sourceFigures(root, { onMain: await marks(root), ...at(18) })
  expect([stopped.mended.length, stopped.waiting]).toEqual([0, P.perRun + 10])
  expect(stopped.stopped).toMatch(why)
  // The chief's word takes it out: the mender goes on, and the same batch doesn't stop it again.
  const { stopped: _, ...cleared } = await book(root)
  await writeFile(join(root, SOURCE_FIGURES_BATCHES), JSON.stringify(cleared))
  expect((await recordSourceFigures(root, at(19))).stopped).toBeUndefined()
  expect((await sourceFigures(root, { onMain: await marks(root), ...at(21) })).mended).toHaveLength(P.perRun)
})

test('a page the gate gave its old text back is listed with what it failed, not mended again; one it couldn\'t read is', async () => {
  const root = await site(2)
  await sourceFigures(root, { limit: 2, onMain: {}, ...at(12) })
  // The gate gave f0 its old text back for its figures (one for another check would stop a batch of two), and couldn't read f1.
  await putBack(root, 'vi/species/f0', { at: '2026-11-12T12:30:00Z', checks: ['units'] })
  await unread(root, 'vi/species/f1', '2026-11-12T12:30:00Z')
  const r = await sourceFigures(root, { limit: 10, onMain: await marks(root), ...at(15) })
  expect(r.putBack).toEqual(["vi/species/f0: the gate gave it its old text back for units; waits for the chief of staff's word"])
  expect(r.mended.map(m => m.key)).toEqual(['vi/species/f1'])
  expect(JSON.parse(await readFile(join(root, 'content/species/f0/vi.json'), 'utf8')).sections['aquariumSize:seriouslyfish']).toBe('<p>Bể 90 × 40 × 30 cm.</p>')
})

test('marks from before the batches were kept make a batch of 30, recorded before the run mends any more', async () => {
  const root = await site(P.first + P.perRun)
  const keys = (await sourceFigures(root, { onMain: {}, ...at(12) })).mended.map(m => m.key)
  await rm(join(root, SOURCE_FIGURES_BATCHES))
  // That run's gate gave three their old text back for `source` and couldn't read one: 3 of 30, though 29 kept marks.
  for (const k of keys.slice(0, 3)) await putBack(root, k, { at: '2026-11-12T12:30:00Z', checks: ['source'] })
  await unread(root, keys[3]!, '2026-11-12T12:30:00Z')
  const going = await sourceFigures(root, { onMain: await marks(root), ...at(15) })
  expect(going.stopped).toBeUndefined()
  expect((await book(root)).batches[0]).toMatchObject({ at: T12, size: P.first, wrong: keys.slice(0, 3) })
  expect(going.mended.map(m => m.key)).toEqual([keys[3]]) // 29 on main: the one it couldn't read, within the 30
  // A fourth given its old text back: recorded at the start of the next run, which then mends nothing.
  const root2 = await site(P.first + P.perRun)
  const keys2 = (await sourceFigures(root2, { onMain: {}, ...at(12) })).mended.map(m => m.key)
  await rm(join(root2, SOURCE_FIGURES_BATCHES))
  for (const k of keys2.slice(0, 4)) await putBack(root2, k, { at: '2026-11-12T12:30:00Z', checks: ['source'] })
  const stopped = await sourceFigures(root2, { onMain: await marks(root2), ...at(15) })
  expect([stopped.mended.length, stopped.waiting]).toEqual([0, P.perRun])
  expect(stopped.stopped).toMatch(/^the batch of 2026-11-12T12:00:00.000Z: 4 of 30 pages/)
})

test('an unread page is not a held page: one the gate couldn\'t read and then held isn\'t counted, one held on a later read is', async () => {
  // The chief of staff, 2026-11-12. With no read, the gate holds a page only for its old text's own fault or harm it found
  // in another language, never for the mend: a quiet night with the accounts out stops nothing.
  const root = await site(P.first + 5)
  const keys = (await sourceFigures(root, { onMain: {}, ...at(12) })).mended.map(m => m.key)
  for (const k of keys.slice(0, 3)) await putBack(root, k, { at: '2026-11-12T12:30:00Z', checks: ['source'] })
  for (const k of keys.slice(3)) await unread(root, k, '2026-11-12T12:30:00Z')
  for (const k of keys.slice(3, 10)) await edit(root, k, t => ({ ...t, held: { checks: ['kit'], at: '2026-11-12' } }))
  const r = await recordSourceFigures(root, at(13))
  expect([r.recorded.length, r.stopped]).toEqual([3, undefined])
  expect((await book(root)).batches[0]!.wrong).toHaveLength(3)
  // Mended again and read: held then, and counted (its unread put-back is older than its new mark).
  const m = await marks(root)
  m[keys[3]!] = { at: '2026-11-12T15:00:00.000Z', figures: [] }
  await writeFile(join(root, SOURCE_FIGURES_STATE), JSON.stringify(m))
  const later = await recordSourceFigures(root, at(16))
  expect(later.recorded).toEqual([`${keys[3]}: held for kit`])
  expect(later.stopped).toMatch(/4 of 30 pages/)
})

test('a put-back in the same second as its batch is its answer: the gate writes its time to the second', async () => {
  const root = await site(P.first + 5)
  const keys = (await sourceFigures(root, { onMain: {}, now: () => new Date(Date.UTC(2026, 10, 12, 12, 0, 0, 500)) })).mended.map(m => m.key)
  // Unread and then held, in the batch's second: not counted. Given its old text back in its mark's second: counted.
  for (const k of keys.slice(0, 4)) {
    await unread(root, k, '2026-11-12T12:00:00Z')
    await edit(root, k, t => ({ ...t, held: { checks: ['kit'], at: '2026-11-12' } }))
  }
  for (const k of keys.slice(4, 7)) await putBack(root, k, { at: '2026-11-12T12:00:00Z', checks: ['source'] })
  const r = await recordSourceFigures(root, at(13))
  expect(r.recorded.filter(x => !x.endsWith(': passed'))).toEqual(keys.slice(4, 7).map(k => `${k}: given its old text back for source`))
  expect(r.stopped).toBeUndefined()
})

test('a cycle whose gate can\'t read mends nothing: it asks the gate\'s model first, only when there is something to mend', async () => {
  const root = await site(5)
  let asked = 0
  const out = async () => { asked++; return 'usage limit until 08:00' }
  const none = await sourceFigures(root, { onMain: {}, reader: out, ...at(12) })
  expect([none.mended.length, none.noReader, asked]).toEqual([0, 'usage limit until 08:00', 1])
  await expect(readFile(join(root, SOURCE_FIGURES_STATE), 'utf8')).rejects.toThrow()
  expect((await sourceFigures(root, { onMain: {}, reader: out, dryRun: true, limit: 10, ...at(12) })).mended).toHaveLength(5)
  expect(asked).toBe(1) // a dry run asks nothing
  const read = await sourceFigures(root, { onMain: {}, reader: async () => { asked++; return undefined }, ...at(13) })
  expect([read.mended.length, read.noReader, asked]).toEqual([5, undefined, 2])
  // Nothing left to mend before the published ones: nothing asked.
  await sourceFigures(root, { onMain: {}, reader: out, ...at(14) })
  expect(asked).toBe(2)
})

test('stopped, or with no main to read, a limit by hand mends nothing; a dry run of the record writes nothing', async () => {
  const root = await site(P.first + 5)
  const keys = (await sourceFigures(root, { onMain: {}, ...at(12) })).mended.map(m => m.key)
  for (const k of keys.slice(0, 4)) await putBack(root, k, { at: '2026-11-12T12:30:00Z', checks: ['source'] })
  const before = await readFile(join(root, SOURCE_FIGURES_BATCHES), 'utf8')
  expect((await recordSourceFigures(root, { dryRun: true, ...at(13) })).stopped).toMatch(/4 of 30 pages/)
  expect(await readFile(join(root, SOURCE_FIGURES_BATCHES), 'utf8')).toBe(before)
  expect((await recordSourceFigures(root, at(13))).stopped).toMatch(/4 of 30 pages/)
  expect((await sourceFigures(root, { limit: 1, onMain: await marks(root), ...at(15) })).mended).toEqual([])
  expect((await sourceFigures(await site(3), { limit: 1, ...at(12) })).mended).toEqual([]) // not a git checkout
})
