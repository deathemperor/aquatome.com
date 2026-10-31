import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dropParts, splitSections, topicCheck } from '../src/topic-check'

// The lighting-hours guide as published on 2026-10-31: the video ends on pre-filters, and so did the guide.
const h = (t: string) => `<h3>${t}</h3><p>${t}…</p>`
const guide = {
  slug: 'be-thuy-sinh-nen-bat-den', name: 'Bể thủy sinh nên bật đèn mấy tiếng mỗi ngày, liên tục hay chia buổi',
  body: `<p>Mở đầu.</p>${h('Bật đèn bao nhiêu tiếng mỗi ngày')}${h('Bật liên tục hay chia làm hai buổi')}${h('Cây sủi bọt nói lên điều gì')}${h('Chọn đèn theo túi tiền')}${h('Vì sao nên lắp thêm lọc phụ trước lọc thùng')}${h('Vệ sinh lọc phụ bao lâu một lần')}${h('Bắt đầu từ đâu')}`,
  summary: ['Bật đèn 6–8 tiếng.', 'Lọc phụ giúp vệ sinh dễ.'],
  faq: [{ q: 'Bật đèn mấy tiếng?', a: '6–8 tiếng.' }, { q: 'Bao lâu vệ sinh lọc phụ?', a: 'Hai tuần.' }],
}
const offTopic = { offTopic: [{ section: 5, reason: 'pre-filters' }, { section: 6, reason: 'pre-filter cleaning' }], faq: [2], summary: [2] }

test('sections split at each <h3>, the opening kept', () => {
  const s = splitSections(guide.body)
  expect(s.intro).toBe('<p>Mở đầu.</p>')
  expect(s.sections.map(x => x.heading)).toHaveLength(7)
  expect(s.sections[4]!.heading).toBe('Vì sao nên lắp thêm lọc phụ trước lọc thùng')
})

test('off-topic sections go, with the FAQ questions and summary points only about them', () => {
  const g = dropParts(guide, offTopic)
  expect(splitSections(g.body).sections.map(x => x.heading)).toEqual(['Bật đèn bao nhiêu tiếng mỗi ngày', 'Bật liên tục hay chia làm hai buổi', 'Cây sủi bọt nói lên điều gì', 'Chọn đèn theo túi tiền', 'Bắt đầu từ đâu'])
  expect(g.faq).toEqual([guide.faq[0]])
  expect(g.summary).toEqual([guide.summary[0]])
})

async function site(guides: Record<string, object>) {
  const root = await mkdtemp(join(tmpdir(), 'tc-'))
  for (const [id, g] of Object.entries(guides)) {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify(g))
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  return root
}
const read = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8'))

test('a drifting guide is trimmed once; unchanged guides are not asked again', async () => {
  const root = await site({ 'youtube-light': guide, 'youtube-ok': { ...guide, name: 'Đèn và lọc', body: `${h('Đèn')}${h('Lọc')}` } })
  let calls = 0
  const llm = async <T,>({ prompt }: { prompt: string }) => { calls++; return (prompt.includes('TITLE: Bể thủy sinh') ? offTopic : { offTopic: [] }) as T }
  const r = await topicCheck(root, llm, { limit: 10 })
  expect(r.trimmed.map(t => t.id)).toEqual(['youtube-light'])
  expect(splitSections((await read(root, 'youtube-light')).body).sections).toHaveLength(5)
  expect((await read(root, 'youtube-ok')).body).toBe(`${h('Đèn')}${h('Lọc')}`)
  expect((await topicCheck(root, llm, { limit: 10 })).checked).toEqual([])
  expect(calls).toBe(2)
})

test('never the closing section, and never more than half a guide: that one is held for a person', async () => {
  const root = await site({ 'youtube-light': guide })
  const all = { offTopic: [1, 2, 3, 4, 5, 6, 7].map(section => ({ section, reason: 'x' })) }
  const r = await topicCheck(root, async <T,>() => all as T, { limit: 10 })
  expect(r.trimmed).toEqual([])
  expect(r.held).toEqual(['youtube-light: 6 of 7 sections flagged'])
  expect((await read(root, 'youtube-light')).body).toBe(guide.body)
})

test('AquaTome guides are written separately in each language: the Indonesian and Thai copies are checked too', async () => {
  const root = await site({ 'aquatome-light': { ...guide, body: `${h('Đèn')}${h('Lọc')}` } })
  const id = { ...guide, name: 'Berapa jam lampu akuarium dinyalakan' }
  await writeFile(join(root, 'content/guides/aquatome-light/id.json'), JSON.stringify(id))
  const llm = async <T,>({ prompt }: { prompt: string }) => (prompt.includes('TITLE: Berapa jam') ? offTopic : { offTopic: [] }) as T
  const r = await topicCheck(root, llm, { limit: 10 })
  expect(r.trimmed.map(t => t.id)).toEqual(['aquatome-light:id'])
  const after = JSON.parse(await readFile(join(root, 'content/guides/aquatome-light/id.json'), 'utf8'))
  expect(splitSections(after.body).sections).toHaveLength(5)
  expect((await read(root, 'aquatome-light')).body).toBe(`${h('Đèn')}${h('Lọc')}`)
})
