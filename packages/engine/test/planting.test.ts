import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { plantsWithoutPlanting, writePlanting } from '../src/planting'

const plant = (id: string, sci: string, sections: { key: string; source: string; html: string }[]) => ({
  id, scientificName: sci, difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte', 'foreground'],
  sections: sections.map(s => ({ ...s, sourceUrl: `https://${s.source}/${id}` })), photos: [], productSlots: [], updatedAt: '2026-10-01',
})
const vi = (name: string, sections: Record<string, string>) => ({ slug: name.toLowerCase().replace(/\s+/g, '-'), name, altNames: [], sections, quality: { score: 0.9, indexable: true } })

// Anubias nana as aquatome.com had it (design critique 2026-11-06): its quick facts alone, nothing on planting; a video
// guide on Anubias barteri says how to tie it on.
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'planting-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, 'content', path, '..'), { recursive: true }); await writeFile(join(root, 'content', path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('plants/anubias-barteri-nana/entity.json', plant('anubias-barteri-nana', 'Anubias barteri var. nana', [{ key: 'quickFacts', source: 'tropica', html: '<ul><li>Growth rate: Slow</li></ul>' }, { key: 'notes', source: 'tropica', html: '<p>Flowers often.</p>' }]))
  await put('plants/anubias-barteri-nana/vi.json', vi('Anubias nana', { 'quickFacts:tropica': '<ul><li>Tốc độ phát triển: Chậm</li></ul>', 'notes:tropica': '<p>Hay ra hoa.</p>' }))
  await put('plants/microsorum-pteropus/entity.json', plant('microsorum-pteropus', 'Microsorum pteropus', [{ key: 'maintenance', source: 'tropica', html: '<p>Tie it to wood.</p>' }]))
  await put('plants/microsorum-pteropus/vi.json', vi('Dương xỉ java', { 'maintenance:tropica': '<p>Buộc cây lên lũa.</p>' }))
  await put('guides/youtube-x/entity.json', { id: 'youtube-x', kind: 'plantCare', source: 'youtube', sourceUrl: 'https://youtube.com/watch?v=x', html: '', photos: [], mentions: ['anubias-barteri'], updatedAt: '2026-10-01' })
  await put('guides/youtube-x/vi.json', vi('Trồng ráy', { body: '' }))
  const g = JSON.parse(await readFile(join(root, 'content/guides/youtube-x/vi.json'), 'utf8'))
  await writeFile(join(root, 'content/guides/youtube-x/vi.json'), JSON.stringify({ ...g, body: '<p>Buộc ráy lên lũa bằng chỉ cước, đừng vùi thân rễ xuống nền.</p>' }))
  return root
}

const llm = (scores: number[], html = '<p>Ráy nana hợp tiền cảnh hoặc buộc lên lũa. Đừng vùi thân rễ xuống nền vì dễ thối.</p>') => {
  const prompts: string[] = []
  const f: Llm = async <T>({ prompt, schema }: { prompt: string; schema: object }) => {
    prompts.push(prompt)
    return ((schema as { required: string[] }).required.includes('html') ? { html } : { score: scores.shift() ?? 0, notes: ['"dễ thối" is not in the input'] }) as T
  }
  return Object.assign(f, { prompts })
}

test('a plant whose page says nothing on planting gets a short part on it, first under its care, from the page and the guides', async () => {
  const root = await store()
  expect((await plantsWithoutPlanting(join(root, 'content'))).map(p => p.id)).toEqual(['anubias-barteri-nana']) // the fern says "buộc"
  const m = llm([0.9])
  const r = await writePlanting(root, m, { now: () => new Date('2026-11-06T10:00:00Z') })
  expect(r.written).toEqual(['anubias-barteri-nana (0.90)'])
  // The writer had the page's figures and text and the video guide on its species.
  expect(m.prompts[0]).toContain('vị trí: sống bám trên lũa, đá, tiền cảnh')
  expect(m.prompts[0]).toContain('[notes:tropica] Hay ra hoa.')
  expect(m.prompts[0]).toContain('đừng vùi thân rễ xuống nền')
  const e = JSON.parse(await readFile(join(root, 'content/plants/anubias-barteri-nana/entity.json'), 'utf8'))
  expect(e.sections.map((s: { key: string; source: string }) => `${s.key}:${s.source}`)).toEqual(['quickFacts:tropica', 'maintenance:aquatome', 'notes:tropica'])
  expect(e.sections[1]).toMatchObject({ sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', html: '<p>Ráy nana hợp tiền cảnh hoặc buộc lên lũa. Đừng vùi thân rễ xuống nền vì dễ thối.</p>' })
  expect(e.updatedAt).toBe('2026-11-06') // its Indonesian and Thai pages are made again
  const t = JSON.parse(await readFile(join(root, 'content/plants/anubias-barteri-nana/vi.json'), 'utf8'))
  expect(t.sections['maintenance:aquatome']).toBe(e.sections[1].html)
  expect(JSON.parse(await readFile(join(root, 'engine-state/reviews/planting.json'), 'utf8'))['vi/plants/anubias-barteri-nana'][0]).toMatchObject({ score: 0.9, kept: true })
  // Written: the page has its planting now, and nothing is left to do.
  expect(await plantsWithoutPlanting(join(root, 'content'))).toEqual([])
  expect((await writePlanting(root, llm([0.9]))).written).toEqual([])
})

test("a shop's own talk on the page isn't given to the writer", async () => {
  // Bucephalandra Silver's BW Aquatics note, 2026-11-06: its second paragraph became "Bạn nên chuẩn bị sẵn môi trường
  // sống cho cây trước khi mua về" in the sample, as the cycle writes before the sweep takes it off the page.
  const root = await store()
  const at = (f: string) => join(root, 'content/plants/anubias-barteri-nana', f)
  const e = JSON.parse(await readFile(at('entity.json'), 'utf8'))
  e.sections.push({ key: 'notes', source: 'bwaquatics', sourceUrl: 'https://bwaquatics.com/x', html: '<p>Ideal for low light tanks.</p><p>Be sure to have the habitat ready before purchase.</p>' })
  await writeFile(at('entity.json'), JSON.stringify(e))
  const t = JSON.parse(await readFile(at('vi.json'), 'utf8'))
  t.sections['notes:bwaquatics'] = '<p>Hợp bể ánh sáng yếu.</p><p>Hãy chuẩn bị sẵn môi trường sống trước khi mua.</p>'
  await writeFile(at('vi.json'), JSON.stringify(t))
  const m = llm([0.9])
  await writePlanting(root, m)
  expect(m.prompts[0]).toContain('[notes:bwaquatics] Hợp bể ánh sáng yếu.')
  expect(m.prompts[0]).not.toContain('trước khi mua')
})

test('under the bar twice, nothing is written, and the plant is not tried again', async () => {
  const root = await store()
  const m = llm([0.5, 0.6])
  const r = await writePlanting(root, m)
  expect(r.low).toEqual(['anubias-barteri-nana (0.60): "dễ thối" is not in the input'])
  expect(m.prompts[2]).toContain('"dễ thối" is not in the input') // the rewrite had the notes
  expect(JSON.parse(await readFile(join(root, 'content/plants/anubias-barteri-nana/entity.json'), 'utf8')).sections).toHaveLength(2)
  expect(JSON.parse(await readFile(join(root, 'engine-state/_planting.json'), 'utf8'))['anubias-barteri-nana']).toMatchObject({ kept: false, score: 0.6 })
  expect(await writePlanting(root, llm([0.9]))).toMatchObject({ written: [], low: [] })
  // Nothing to go on: no part written.
  const empty = await store()
  expect((await writePlanting(empty, llm([0.9], ''))).none).toEqual(['anubias-barteri-nana'])
  // Its place and height alone (Cryptocoryne willisii's first sample, 2026-11-06): the data card has them; none either.
  const placeOnly = await store()
  const m2 = llm([0.95], '<p>Cryptocoryne willisii là cây trung cảnh. Sau hai tháng trồng trong bể, cây cao 10–20 cm.</p>')
  expect((await writePlanting(placeOnly, m2)).none).toEqual(['anubias-barteri-nana'])
  expect(m2.prompts).toHaveLength(1) // not reviewed
})
