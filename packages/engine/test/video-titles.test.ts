import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { tidyTitle, titleFits, translateVideoTitles } from '../src/video-titles'

const video = (youtubeId: string, title: string, lang = 'en') => ({ youtubeId, title, durationSec: 300, lang })

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'video-titles-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(data)) }
  await put('content/species/a/entity.json', { scientificName: 'Aus bus', videos: [video('en-a', 'Keeping Aus'), video('vi-a', 'Nuôi cá A', 'vi'), video('us-a', 'Aus tank tour', 'en-US')] })
  await put('content/species/a/vi.json', { name: 'Cá A' })
  await put('content/species/a/th.json', { name: 'ปลาเอ' })
  // b is a second page of the same fish, so the video on both is asked about once.
  await put('content/species/b/entity.json', { scientificName: 'Aus bus', videos: [video('en-a', 'Keeping Aus'), video('th-b', 'เลี้ยงปลา', 'th')] })
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

test('--only makes just those titles again, already stored ones included, and leaves every other title as it was', async () => {
  const root = await store()
  await translateVideoTitles(root, model(), 'vi')
  const before = await titles(root, 'vi')
  const seen: string[] = []
  expect(await translateVideoTitles(root, model({ seen, answer: t => `mới: ${t}` }), 'vi', { only: ['en-a'] })).toMatchObject({ titles: 1 })
  expect(seen).toEqual(['Cá A, Aus bus|Keeping Aus'])
  expect(await titles(root, 'vi')).toEqual({ ...before, 'en-a': 'mới: Keeping Aus' })
})

test("a full stop at the end comes off, but an abbreviation's dot stays (Thai 'ซม.', 'spp.')", async () => {
  const root = await store()
  const answers: Record<string, string> = { 'Keeping Aus': 'Nuôi cá A.', 'Aus tank tour': 'ปลาเอ 6 ซม.', 'Lamp D after 6 months': 'Hướng dẫn nuôi Farlowella spp.' }
  await translateVideoTitles(root, model({ answer: t => answers[t] ?? t }), 'vi')
  const vi = await titles(root, 'vi')
  expect(vi['en-a']).toBe('Nuôi cá A')
  expect(vi['us-a']).toBe('ปลาเอ 6 ซม.')
  expect(vi['en-d']).toBe('Hướng dẫn nuôi Farlowella spp.')
})

test('a bracket that only repeats the name before it comes off (a page named by its scientific name)', () => {
  expect(tidyTitle('Cá Champsochromis spilorhynchus (Champsochromis spilorhynchus) 6 cm')).toBe('Cá Champsochromis spilorhynchus 6 cm')
  expect(tidyTitle('Hướng dẫn nuôi cá Elassoma gilberti (Elassoma gilberti)')).toBe('Hướng dẫn nuôi cá Elassoma gilberti')
  expect(tidyTitle('Cá đĩa Heckel (Symphysodon discus)')).toBe('Cá đĩa Heckel (Symphysodon discus)')
  expect(tidyTitle('Bể 300 gallon (khoảng 1.136 lít).')).toBe('Bể 300 gallon (khoảng 1.136 lít)')
  expect(tidyTitle('ปลาเอ 6 ซม.')).toBe('ปลาเอ 6 ซม.')
})

test("in code, every run: 'about' before the litres a gallon size becomes, litres with the language's thousands mark, one form of a part number, and a page name's 'fish' word in lower case mid-title", () => {
  expect(tidyTitle('Kemas kini akuarium 100 gelen (400 liter), Farlowella membiak lagi', 'ms')).toBe('Kemas kini akuarium 100 gelen (kira-kira 400 liter), Farlowella membiak lagi')
  expect(tidyTitle('Akuarium 300 gelen (1136 liter) yang menakjubkan', 'ms')).toBe('Akuarium 300 gelen (kira-kira 1,136 liter) yang menakjubkan')
  expect(tidyTitle('Bể cá đĩa 300 gallon (khoảng 1136 lít) quá đỉnh', 'vi')).toBe('Bể cá đĩa 300 gallon (khoảng 1.136 lít) quá đỉnh')
  expect(tidyTitle('ตู้ปลา 300 แกลลอน (ประมาณ 1136 ลิตร)', 'th')).toBe('ตู้ปลา 300 แกลลอน (ประมาณ 1,136 ลิตร)')
  expect(tidyTitle('Akuarium discus 300 galon (sekitar 1.136 liter)', 'id')).toBe('Akuarium discus 300 galon (sekitar 1.136 liter)')
  expect(tidyTitle('Vật liệu lọc tốt nhất cho bể thủy sinh cá đĩa, phần 2', 'vi')).toBe('Vật liệu lọc tốt nhất cho bể thủy sinh cá đĩa phần 2')
  expect(tidyTitle('Flame Tetra mula menghuni akuarium saya, bahagian 14', 'ms')).toBe('Flame Tetra mula menghuni akuarium saya bahagian 14')
  expect(tidyTitle('Pemeliharaan, biologi, dan pakan Ikan Paradise (Macropodus opercularis)', 'id')).toBe('Pemeliharaan, biologi, dan pakan ikan Paradise (Macropodus opercularis)')
  expect(tidyTitle('Ikan Discus (Symphysodon discus)', 'ms')).toBe('Ikan Discus (Symphysodon discus)')
  expect(tidyTitle('Hướng dẫn nuôi Cá cành cây (Farlowella spp.) trong bể', 'vi')).toBe('Hướng dẫn nuôi cá cành cây (Farlowella spp.) trong bể')
  // A title written in English-style capitals throughout keeps them: one lower-case word in it would read worse.
  expect(tidyTitle('Cara Menyediakan Tangki Udang Pertama Anda', 'ms')).toBe('Cara Menyediakan Tangki Udang Pertama Anda')
  expect(tidyTitle('Saya dapat cory istimewa! Ikan baharu untuk akuarium discus', 'ms')).toBe('Saya dapat cory istimewa! Ikan baharu untuk akuarium discus')
  // A short title whose page name has two capitals is not a title-case title (the editors, round 7).
  expect(tidyTitle('Pemijahan Ikan Zebra (Danio rerio)', 'id')).toBe('Pemijahan ikan Zebra (Danio rerio)')
  expect(tidyTitle('Unboxing Ikan Hidup: Gertrudae (Pseudomugil gertrudae)', 'id')).toBe('Unboxing Ikan Hidup: Gertrudae (Pseudomugil gertrudae)')
  expect(tidyTitle('Profil Ikan Dokter: Semua tentang Garra rufa dan Penggunaannya di Spa', 'id')).toBe('Profil Ikan Dokter: Semua tentang Garra rufa dan Penggunaannya di Spa')
})

test("a title the editors passed and kept (content/video-titles/kept.json) is never made again, not by --only and not by --redo, which makes every other title again", async () => {
  const root = await store()
  await translateVideoTitles(root, model(), 'vi')
  const before = await titles(root, 'vi')
  await writeFile(join(root, 'content/video-titles/kept.json'), JSON.stringify({ 'en-a': 'passed at 9 (the editors, 15 Nov)' }))
  const seen: string[] = []
  expect(await translateVideoTitles(root, model({ seen, answer: t => `mới: ${t}` }), 'vi', { only: ['en-a', 'en-d'] })).toMatchObject({ titles: 1 })
  expect(seen).toEqual(['Đèn D|Lamp D after 6 months'])
  const all = await translateVideoTitles(root, model({ answer: t => `lại: ${t}` }), 'vi', { redo: true })
  expect(all).toMatchObject({ titles: 3, left: 0 })
  const after = await titles(root, 'vi')
  expect(after['en-a']).toBe(before['en-a'])
  expect(after['en-d']).toBe('lại: Lamp D after 6 months')
})

test('a kept video with no title stored is skipped by a plain run too, not only by --only and --redo (the reviewer, 15 Nov)', async () => {
  const root = await store()
  await mkdir(join(root, 'content/video-titles'), { recursive: true })
  await writeFile(join(root, 'content/video-titles/kept.json'), JSON.stringify({ 'en-a': 'passed at 9 (the editors, 15 Nov)' }))
  const seen: string[] = []
  await translateVideoTitles(root, model({ seen }), 'vi')
  expect(seen.join('\n')).not.toContain('Keeping Aus')
  expect(seen.length).toBeGreaterThan(0)
  expect(await titles(root, 'vi')).not.toHaveProperty('en-a')
})

test("tidyTitle changes no meaning: a word before the litres stays ('more than' is not 'about'), an abbreviation or an ellipsis keeps its dots, and a short bracket isn't taken for a repeated name (the reviewer, 15 Nov)", () => {
  expect(tidyTitle('Bể 300 gallon (hơn 1000 lít)', 'vi')).toBe('Bể 300 gallon (hơn 1.000 lít)')
  expect(tidyTitle('ตู้ 300 แกลลอน (กว่า 1136 ลิตร)', 'th')).toBe('ตู้ 300 แกลลอน (กว่า 1,136 ลิตร)')
  expect(tidyTitle('Pakan, filter, dll.', 'id')).toBe('Pakan, filter, dll.')
  expect(tidyTitle('ปลาไหลยาว 2 ม.', 'th')).toBe('ปลาไหลยาว 2 ม.')
  expect(tidyTitle('Cá Betta...', 'vi')).toBe('Cá Betta...')
  expect(tidyTitle('Phần 1 (1)', 'vi')).toBe('Phần 1 (1)')
  expect(tidyTitle('Cá Champsochromis spilorhynchus (Champsochromis spilorhynchus)', 'vi')).toBe('Cá Champsochromis spilorhynchus')
})

test("tidyTitle, the second reviewer's cases: a figure already written with a separator is left as written, a Thai word ending in ม isn't an abbreviation while a unit after a number is, a bracket that is only part of a word isn't a repeat, and Jr. keeps its dot", () => {
  expect(tidyTitle('Akuarium 1 gelen (3.785 liter)', 'ms')).toBe('Akuarium 1 gelen (kira-kira 3.785 liter)')
  expect(tidyTitle('ตู้ 10 แกลลอน (37.854 ลิตร)', 'th')).toBe('ตู้ 10 แกลลอน (ประมาณ 37.854 ลิตร)')
  expect(tidyTitle('Bể 2,5 gallon (9,464 lít)', 'vi')).toBe('Bể 2,5 gallon (khoảng 9,464 lít)')
  expect(tidyTitle('ตู้ไม้น้ำปลาสวยงาม.', 'th')).toBe('ตู้ไม้น้ำปลาสวยงาม')
  expect(tidyTitle('ใส่ปุ๋ย 5 มล.', 'th')).toBe('ใส่ปุ๋ย 5 มล.')
  expect(tidyTitle('ตู้ 20 ล.', 'th')).toBe('ตู้ 20 ล.')
  expect(tidyTitle('Ikan Paracheirodon (Cheirodon) axelrodi', 'id')).toBe('Ikan Paracheirodon (Cheirodon) axelrodi')
  expect(tidyTitle('Lọc thùng Eheim 2217 Jr.', 'vi')).toBe('Lọc thùng Eheim 2217 Jr.')
})

test("tidyTitle drops a bracket repeating words the title gave anywhere before it, and writes the page's scientific name in the page's capitals (the editors, round 8)", () => {
  expect(tidyTitle('Cá da trơn Amblyceps foratum bạch tạng (Amblyceps foratum) hiếm', 'vi')).toBe('Cá da trơn Amblyceps foratum bạch tạng hiếm')
  expect(tidyTitle('Ikan Paracheirodon (Cheirodon) axelrodi', 'id')).toBe('Ikan Paracheirodon (Cheirodon) axelrodi')
  expect(tidyTitle('Cá Betta và cá Corydoras (Corydoras paleatus)', 'vi')).toBe('Cá Betta và cá Corydoras (Corydoras paleatus)')
  expect(tidyTitle('Siput Nerite Waigiensis red racer (Vittina Waigiensis)', 'id', 'Vittina waigiensis')).toBe('Siput Nerite Waigiensis red racer (Vittina waigiensis)')
  expect(tidyTitle('Ikan Discus (Symphysodon discus)', 'ms', 'Symphysodon aequifasciatus')).toBe('Ikan Discus (Symphysodon discus)')
  expect(tidyTitle('Cá Vittina waigiensisx', 'vi', 'Vittina waigiensis')).toBe('Cá Vittina waigiensisx')
})

test('tidyTitle writes "gallon" where a Vietnamese title says "galông", and the litres beside it are set as for any gallon (the editors, round 9)', () => {
  expect(tidyTitle('Cá hỏa tiễn cỡ lớn trong bể 700 galông (2650 lít)', 'vi')).toBe('Cá hỏa tiễn cỡ lớn trong bể 700 gallon (khoảng 2.650 lít)')
  expect(tidyTitle('Bể 42 galon (sekitar 159 liter)', 'id')).toBe('Bể 42 galon (sekitar 159 liter)')
})

test("a video on the pages of two fish gets no title: it keeps its own, recorded with the reason, and every other video is written as before (the editors, round 10)", async () => {
  const root = await store()
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(data)) }
  for (const [id, sci, name] of [['c', 'Kryptopterus bicirrhis', 'Cá nheo kính'], ['e', 'Kryptopterus vitreolus', 'Cá thủy tinh']]) {
    await put(`content/species/${id}/entity.json`, { scientificName: sci, videos: [video('glass', 'Glass Catfish Care')] })
    await put(`content/species/${id}/vi.json`, { name })
  }
  const seen: string[] = []
  expect(await translateVideoTitles(root, model({ seen }), 'vi')).toMatchObject({ titles: 4, left: 0 })
  expect(seen.some(s => s.endsWith('|Glass Catfish Care'))).toBe(false)
  expect(await titles(root, 'vi')).not.toHaveProperty('glass')
  expect(JSON.parse(await readFile(join(root, 'content/video-titles/vi.refused.json'), 'utf8'))).toEqual({ glass: "wrong fish: on the pages of 2 fish (Kryptopterus bicirrhis, Kryptopterus vitreolus): one title would name one page's fish on the other" })
  // Not by --only or --redo either.
  expect(await translateVideoTitles(root, model(), 'vi', { only: ['glass'] })).toMatchObject({ titles: 0 })
  expect(await translateVideoTitles(root, model(), 'vi', { redo: true })).toMatchObject({ titles: 4 })
  expect(await titles(root, 'vi')).not.toHaveProperty('glass')
})

test("a title stored for such a video before is taken out, so the meaning check, which reads the stored titles, can't pass it and clear its refusal", async () => {
  const root = await store()
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(data)) }
  for (const [id, sci] of [['c', 'Kryptopterus bicirrhis'], ['e', 'Kryptopterus vitreolus']]) {
    await put(`content/species/${id}/entity.json`, { scientificName: sci, videos: [video('glass', 'Glass Catfish Care')] })
    await put(`content/species/${id}/vi.json`, { name: id })
  }
  await translateVideoTitles(root, model(), 'vi')
  // A run with nothing else to write takes it out too.
  await put('content/video-titles/vi.json', { ...(await titles(root, 'vi')), glass: 'Nuôi cá nheo kính' })
  expect(await translateVideoTitles(root, model(), 'vi')).toMatchObject({ titles: 0 })
  expect(await titles(root, 'vi')).not.toHaveProperty('glass')
})

test("a title given new words loses the meaning check's verdicts on the old ones, so the site shows the video's own title until the check reads the new; the same words keep theirs (the reviewers of the check, 16 Nov)", async () => {
  const root = await store()
  await translateVideoTitles(root, model(), 'vi')
  const dir = join(root, 'content/video-titles')
  await writeFile(join(dir, 'vi.passed.json'), JSON.stringify({ 'en-a': 'bản dịch: Keeping Aus', 'en-d': 'bản dịch: Lamp D after 6 months' }))
  await writeFile(join(dir, 'vi.refused.json'), JSON.stringify({ 'us-a': 'dropped: x' }))
  // en-a and us-a get new words; en-d is written again in the same words.
  await translateVideoTitles(root, model({ answer: t => (t === 'Lamp D after 6 months' ? `bản dịch: ${t}` : `mới: ${t}`) }), 'vi', { redo: true, parallel: 2 })
  expect(JSON.parse(await readFile(join(dir, 'vi.passed.json'), 'utf8'))).toEqual({ 'en-d': 'bản dịch: Lamp D after 6 months' })
  expect(JSON.parse(await readFile(join(dir, 'vi.refused.json'), 'utf8'))).toEqual({})
})
