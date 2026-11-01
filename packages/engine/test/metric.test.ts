import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { metricPages } from '../src/metric'

const page = (sections: Record<string, string>, more: object = {}) => ({ slug: 's', name: 'Cá', altNames: [], sections, quality: { score: 1, indexable: true }, ...more })

test('fish, plant, breed and guide pages in every language come out in metric; other pages and reference lists stay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'metric-'))
  const files: Record<string, object> = {
    'species/a/vi.json': page({ 'quickFacts:seriouslyfish': '<li>Nhiệt độ: 20–30°C (68–86°F)</li>', 'references:seriouslyfish': '<p>Smith (1990) 12 in.</p>' }),
    'species/a/th.json': page({ 'quickFacts:bwaquatics': '<li>ขนาดสูงสุด: ประมาณ 12.5 ซม. (5 นิ้ว)</li>' }),
    'plants/b/vi.json': page({ 'maintenance:aquariumcoop': '<p>Cây cao khoảng 10 đến 12 inch (25 đến 30 cm).</p>' }),
    'breeds/c/id.json': page({}, { body: '<p>Minimal 30 galon (sekitar 114 L).</p>', summary: ['Akuarium 10 galon.'], faq: [{ q: 'Suhu?', a: '75 °F.' }] }),
    'species/d/vi.json': page({ 'diet:seriouslyfish': '<p>Ăn tạp, 24 °C.</p>' }),
    'guides/e/vi.json': page({}, { body: '<p>Bể 20 gallon long.</p>', summary: ['Ống PVC ¾ inch.'] }),
    'guides/e/th.json': page({}, { body: '<p>ลดลงราว 15°F ภายในหนึ่งชั่วโมง</p>' }),
    'glossary/f/vi.json': page({}, { definition: 'Bể 10 gallon.' }),
  }
  for (const [f, v] of Object.entries(files)) {
    await mkdir(join(root, f, '..'), { recursive: true })
    await writeFile(join(root, f), `${JSON.stringify(v, null, 2)}\n`)
  }
  expect(await metricPages(root)).toEqual(['species/a/vi', 'species/a/th', 'plants/b/vi', 'breeds/c/id', 'guides/e/vi', 'guides/e/th'])
  const read = async (f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))
  expect((await read('species/a/vi.json')).sections).toEqual({ 'quickFacts:seriouslyfish': '<li>Nhiệt độ: 20–30°C</li>', 'references:seriouslyfish': '<p>Smith (1990) 12 in.</p>' })
  expect((await read('species/a/th.json')).sections['quickFacts:bwaquatics']).toBe('<li>ขนาดสูงสุด: ประมาณ 12.5 ซม.</li>')
  expect((await read('plants/b/vi.json')).sections['maintenance:aquariumcoop']).toBe('<p>Cây cao khoảng 25 đến 30 cm.</p>')
  expect(await read('breeds/c/id.json')).toMatchObject({ body: '<p>Minimal 114 L.</p>', summary: ['Akuarium 38 liter.'], faq: [{ q: 'Suhu?', a: '24 °C.' }] })
  expect(await read('guides/e/vi.json')).toMatchObject({ body: '<p>Bể khoảng 75 lít (76 × 30 × 30 cm).</p>', summary: ['Ống PVC phi 27.'] })
  expect((await read('guides/e/th.json')).body).toBe('<p>ลดลงราว 8°C ภายในหนึ่งชั่วโมง</p>') // a change of 15 °F, not a temperature
  expect((await read('glossary/f/vi.json')).definition).toBe('Bể 10 gallon.') // not a page this pass writes
  expect(await metricPages(root)).toEqual([]) // done: nothing to change the second time
})

test("a page keeps its file's own indentation: a changed figure is one changed line", async () => {
  const root = await mkdtemp(join(tmpdir(), 'metric-'))
  await mkdir(join(root, 'species/a'), { recursive: true })
  const before = `${JSON.stringify(page({ 'quickFacts:seriouslyfish': '<li>Nhiệt độ: 20–30°C (68–86°F)</li>' }), null, 1)}\n`
  await writeFile(join(root, 'species/a/vi.json'), before)
  await metricPages(root)
  const after = await readFile(join(root, 'species/a/vi.json'), 'utf8')
  const changed = after.split('\n').filter((l, i) => l !== before.split('\n')[i])
  expect(changed).toEqual(['  "quickFacts:seriouslyfish": "<li>Nhiệt độ: 20–30°C</li>"'])
})

test("a guide's topic, already checked, stays checked when only its units change: no model call for a unit", async () => {
  const root = await mkdtemp(join(tmpdir(), 'metric-'))
  const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
  const bodies = { a: '<p>Bể 10 gallon.</p>', b: '<p>Nước 75 °F.</p>', c: '<p>Bể 5 gallon.</p>' }
  for (const [id, body] of Object.entries(bodies)) {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, id === 'b' ? 'id.json' : 'vi.json'), `${JSON.stringify(page({}, { body }), null, 2)}\n`)
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // a: checked; b (Indonesian): held for a person; c: never checked (edited since), so it's still to be read.
  await writeFile(join(root, 'engine-state/_topic-check.json'), JSON.stringify({ a: sha(bodies.a), 'b:id': `held:${sha(bodies.b)}`, c: 'old' }))
  await metricPages(join(root, 'content'), root)
  expect(JSON.parse(await readFile(join(root, 'engine-state/_topic-check.json'), 'utf8'))).toEqual({
    a: sha('<p>Bể 38 lít.</p>'), 'b:id': `held:${sha('<p>Nước 24 °C.</p>')}`, c: 'old',
  })
})
