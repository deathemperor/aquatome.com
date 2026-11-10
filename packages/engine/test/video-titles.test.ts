import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { titleFits, translateVideoTitles } from '../src/video-titles'

const video = (youtubeId: string, title: string, lang = 'en') => ({ youtubeId, title, durationSec: 300, lang })

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'video-titles-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(data)) }
  await put('content/species/a/entity.json', { scientificName: 'Aus bus', videos: [video('en-a', 'Keeping Aus'), video('vi-a', 'Nuôi cá A', 'vi'), video('us-a', 'Aus tank tour', 'en-US')] })
  await put('content/species/a/vi.json', { name: 'Cá A' })
  await put('content/species/a/th.json', { name: 'ปลาเอ' })
  await put('content/species/b/entity.json', { scientificName: 'Bus', videos: [video('en-a', 'Keeping Aus'), video('th-b', 'เลี้ยงปลา', 'th')] })
  await put('content/species/b/vi.json', { name: 'Cá B' })
  await put('content/products/d/entity.json', { name: 'Đèn D', reviews: { videos: [video('en-d', 'Lamp D after 6 months')] } })
  await put('content/products/d/vi.json', { name: 'Đèn D' })
  return root
}
const titles = async (root: string, lang: string) => JSON.parse(await readFile(join(root, 'content/video-titles', `${lang}.json`), 'utf8'))

/** Translates each numbered line, as the model would: "bản dịch: <title>". */
function model(o: { seen?: string[]; answer?: (title: string) => string; stop?: boolean } = {}): Llm {
  return (async ({ prompt }: { prompt: string }) => {
    if (o.stop) throw new LlmError('usage limit')
    const lines = prompt.split('\n').map(l => /^(\d+)\. \[(.+?)\] (.+)$/.exec(l)).filter(m => m) as RegExpExecArray[]
    o.seen?.push(...lines.map(m => `${m[2]}|${m[3]}`))
    return { titles: lines.map(m => ({ n: Number(m[1]), title: (o.answer ?? (t => `bản dịch: ${t}`))(m[3]!) })) }
  }) as Llm
}

test("each video not spoken in the page's language gets a title, once, on species and product pages; a video in that language needs none", async () => {
  const root = await store()
  const seen: string[] = []
  const r = await translateVideoTitles(root, model({ seen }), 'vi')
  expect(r).toMatchObject({ titles: 4, left: 0, failed: [], stopped: '' })
  // The fish's name goes with its title; a video on two pages is asked about once.
  expect(seen).toContain('Cá A, Aus bus|Keeping Aus')
  expect(seen.filter(s => s.endsWith('|Keeping Aus'))).toHaveLength(1)
  const vi = await titles(root, 'vi')
  expect(Object.keys(vi).sort()).toEqual(['en-a', 'en-d', 'th-b', 'us-a'])
  expect(vi['en-d']).toBe('bản dịch: Lamp D after 6 months')
  // Again: nothing to ask.
  const again: string[] = []
  expect(await translateVideoTitles(root, model({ seen: again }), 'vi')).toMatchObject({ titles: 0 })
  expect(again).toEqual([])
})

test("only the pages that language has", async () => {
  const root = await store()
  const seen: string[] = []
  await translateVideoTitles(root, model({ seen, answer: () => 'ชื่อไทย' }), 'th')
  expect(Object.keys(await titles(root, 'th')).sort()).toEqual(['en-a', 'us-a', 'vi-a'])
  expect(seen.every(s => s.startsWith('ปลาเอ'))).toBe(true)
})

test('a title handed back in English, or Thai not written in Thai, is not kept and is asked again', async () => {
  const root = await store()
  const r = await translateVideoTitles(root, model({ answer: t => t }), 'vi')
  expect(r.titles).toBe(0)
  expect(r.rejected).toHaveLength(4)
  expect(await titles(root, 'vi').catch(() => ({}))).toEqual({})
  expect(titleFits('Keeping Aus', 'Keeping Aus', 'th')).toBe(false)
  expect(titleFits('Cá Betta', 'Betta fish', 'vi')).toBe(true)
  expect(titleFits('Nuôi cá Betta', 'Nuôi cá Betta', 'vi')).toBe(true)
  expect(titleFits('Nuôi cá Betta', 'Betta care', 'id')).toBe(false)
  expect(titleFits('', 'Betta care', 'vi')).toBe(false)
})

test('--limit is calls; a usage limit stops with what was finished kept', async () => {
  const root = await store()
  expect(await translateVideoTitles(root, model({ stop: true }), 'vi')).toMatchObject({ titles: 0, stopped: 'usage limit' })
  expect(await translateVideoTitles(root, model(), 'vi', { limit: 0 })).toMatchObject({ titles: 0, left: 4 })
})
