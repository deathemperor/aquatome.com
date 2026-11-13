import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { mendPart, sourceFigures, SOURCE_FIGURES_PACE, SOURCE_FIGURES_STATE } from '../src/source-figures'

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

test('a run mends the pace\'s pages, the named first, each once, and no more than the pace\'s total', async () => {
  const root = await site(SOURCE_FIGURES_PACE.perRun + 2)
  const dry = await sourceFigures(root, { dryRun: true, limit: 1000 })
  expect(dry.mended).toHaveLength(SOURCE_FIGURES_PACE.perRun + 2)
  expect(dry.left).toEqual(['id/species/f0: held, left as it is'])
  await expect(readFile(join(root, SOURCE_FIGURES_STATE), 'utf8')).rejects.toThrow() // a dry run writes nothing
  const first = await sourceFigures(root, { first: ['vi/species/f9'], now: () => new Date('2026-11-12T12:00:00Z') })
  expect(first.mended).toHaveLength(SOURCE_FIGURES_PACE.perRun)
  expect(first.mended[0]!.key).toBe('vi/species/f9')
  expect(first.waiting).toBe(2)
  const f9 = JSON.parse(await readFile(join(root, 'content/species/f9/vi.json'), 'utf8'))
  expect(f9.sections).toEqual({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 38 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' })
  expect(JSON.parse(await readFile(join(root, SOURCE_FIGURES_STATE), 'utf8'))['vi/species/f9']).toEqual({ at: '2026-11-12T12:00:00.000Z', figures: ['90 × 40 × 30 cm → 90 × 38 × 30 cm'] })
  // The pace's total is reached: the next run waits for the chief of staff's next pace.
  const second = await sourceFigures(root, { now: () => new Date('2026-11-12T15:00:00Z') })
  expect(second.mended).toEqual([])
  expect(second.waiting).toBe(2)
  // A guide has no English beside it: never touched.
  expect(JSON.parse(await readFile(join(root, 'content/guides/g/vi.json'), 'utf8')).body).toBe('<p>Bể 90 × 40 × 30 cm.</p>')
})

test('a page the gate gave its old text back is listed with what it failed, not mended again; one it couldn\'t read is', async () => {
  const root = await site(2)
  await sourceFigures(root, { limit: 2, now: () => new Date('2026-11-12T12:00:00Z') })
  // The gate gave f0 its old text back for a check, and couldn't read f1 (its mark is gone: writer-records.ts).
  const old = page({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 40 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' })
  for (const id of ['f0', 'f1']) await writeFile(join(root, `content/species/${id}/vi.json`), `${JSON.stringify(old, null, 2)}\n`)
  await mkdir(join(root, 'engine-state/put-back/species'), { recursive: true })
  await writeFile(join(root, 'engine-state/put-back/species/f0.vi.json'), JSON.stringify({ at: '2026-11-12T12:30:00Z', checks: ['source'], findings: [], text: {} }))
  const state = JSON.parse(await readFile(join(root, SOURCE_FIGURES_STATE), 'utf8'))
  delete state['vi/species/f1']
  await writeFile(join(root, SOURCE_FIGURES_STATE), JSON.stringify(state))
  const r = await sourceFigures(root, { limit: 10, now: () => new Date('2026-11-12T15:00:00Z') })
  expect(r.putBack).toEqual(["vi/species/f0: the gate gave it its old text back for source; waits for the chief of staff's word"])
  expect(r.mended.map(m => m.key)).toEqual(['vi/species/f1'])
  expect(JSON.parse(await readFile(join(root, 'content/species/f0/vi.json'), 'utf8')).sections['aquariumSize:seriouslyfish']).toBe('<p>Bể 90 × 40 × 30 cm.</p>')
})

test('a page the gate couldn\'t read, in a batch whose others it read, is tried again within the same total', async () => {
  const root = await site(SOURCE_FIGURES_PACE.upTo + 2)
  const first = await sourceFigures(root, { now: () => new Date('2026-11-12T12:00:00Z') })
  const unread = first.mended[3]!.key
  const state = JSON.parse(await readFile(join(root, SOURCE_FIGURES_STATE), 'utf8'))
  delete state[unread]
  await writeFile(join(root, SOURCE_FIGURES_STATE), JSON.stringify(state))
  const [, kind, id] = unread.split('/')
  await writeFile(join(root, `content/${kind}/${id}/vi.json`), `${JSON.stringify(page({ 'aquariumSize:seriouslyfish': '<p>Bể 90 × 40 × 30 cm.</p>', 'aquariumSize:aquatome': '<p>Bể 90 × 40 × 30 cm.</p>' }), null, 2)}\n`)
  const again = await sourceFigures(root, { now: () => new Date('2026-11-12T15:00:00Z') })
  expect(again.mended.map(m => m.key)).toEqual([unread])
})
