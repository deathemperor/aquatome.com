import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { checkPages, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
import { CHIHIROS_TESTS, cleanExtracted, figureOf, findReviews, isDue, mergeWritten, namesProduct, productCandidates, productReviews, reviewProduct, secondOf, sourcesWith, TEST_NOTES, testsFor, unusable, watchUrl, type ReviewInput, type Written } from '../src/product-reviews'
import type { VideoMeta, YouTube } from '../src/youtube'

const meta = (id: string, o: Partial<VideoMeta> = {}): VideoMeta => ({ id, title: 'Chihiros WRGB II review', channel: 'Example Scapes', channelUrl: 'https://youtube.example/c', durationSec: 700, chapters: [], embeddable: true, description: 'A review of the Chihiros light.', thumb: { url: 'https://i.ytimg.com/x.jpg', width: 1280, height: 720 }, captions: true, lang: 'en', ...o })
const WRGB = { brand: 'Chihiros', model: 'WRGB II' }

test('the title must name this product, however it writes the model, and not another of the line', () => {
  for (const t of ['Chihiros WRGB II review', 'chihiros wrgb2 long term', 'Đánh giá đèn Chihiros WRGB 2 sau 6 tháng', 'WRGB II 60 review']) expect(namesProduct(t, WRGB), t).toBe(true)
  for (const t of ['Chihiros WRGB 2 Slim review', 'WRGB II Pro after a year', 'Chihiros C2 review', 'My new light']) expect(namesProduct(t, WRGB), t).toBe(false)
  expect(namesProduct('WRGB II Pro after a year', { brand: 'Chihiros', model: 'WRGB II Pro' })).toBe(true)
})

test('a family page\'s titles: one word of each group', () => {
  const tuya = { brand: 'Tuya', model: 'Smart Life power strip', titleWords: [['tuya', 'smart life'], ['plug', 'o cam']] }
  expect(namesProduct('Đánh giá ổ cắm thông minh Tuya', tuya)).toBe(true)
  expect(namesProduct('Smart Life plug setup and review', tuya)).toBe(true)
  expect(namesProduct('Tuya camera review', tuya)).toBe(false)
})

test('a video must be long enough to hold findings, embeddable, in a language we read, with captions, naming the maker', () => {
  expect(unusable(meta('a'), WRGB)).toBeNull()
  expect(unusable(meta('a', { durationSec: 90 }), WRGB)).toBe('too short')
  expect(unusable(meta('a', { durationSec: 9000 }), WRGB)).toBe('too long')
  expect(unusable(meta('a', { embeddable: false }), WRGB)).toBe('not embeddable')
  expect(unusable(meta('a', { lang: 'de' }), WRGB)).toBe('spoken in de')
  expect(unusable(meta('a', { captions: false }), WRGB)).toBe('no captions')
  expect(unusable(meta('a', { title: 'WRGB II review', description: 'a light' }), WRGB)).toBe('maker not named')
  // Captions not known (metadata from the API): asked for later.
  expect(unusable(meta('a', { captions: undefined as unknown as boolean }), WRGB)).toBeNull()
})

const TRANSCRIPT = `[0:05] hi everyone today the light\n[1:30] after two months the fan is quiet\n[7:10] I measured 41 decibels with my phone at one metre\n${'[9:00] more words about the light and the plants in this tank\n'.repeat(40)}`

const ytOf = (metas: Record<string, VideoMeta>, captions: Record<string, string | null> = {}) => {
  const seen: string[] = []
  const yt: YouTube = {
    playlist: async () => { throw new Error('unused') },
    video: async id => { seen.push(id); if (!metas[id]) throw new Error('video gone'); return metas[id]! },
    transcript: async id => (id in captions ? captions[id]! : TRANSCRIPT),
  }
  return { yt, seen }
}
const vetOk = (lang: Record<string, string> = {}): Llm => async <T,>({ prompt }: { prompt: string }) => ({ verdicts: [...prompt.matchAll(/^## (\S+)$/gm)].map(m => ({ id: m[1], ok: !m[1]!.startsWith('no'), reason: 'x', ...(lang[m[1]!] ? { lang: lang[m[1]!] } : {}) })) }) as T

test('findReviews: titles first, one cheap call on all of them, then captions until enough, Vietnamese first', async () => {
  const hits = { 'Chihiros WRGB II review': [{ id: 'en1', title: 'Chihiros WRGB II review', channel: 'A' }, { id: 'pro', title: 'WRGB II Pro review', channel: 'B' }, { id: 'live', title: 'WRGB II live', channel: 'C' }, { id: 'nocap', title: 'Chihiros WRGB2 test', channel: 'D' }, { id: 'noreview', title: 'WRGB 2 unboxing', channel: 'E' }], 'đánh giá Chihiros WRGB II': [{ id: 'vi1', title: 'Đánh giá Chihiros WRGB 2', channel: 'F' }, { id: 'en1', title: 'Chihiros WRGB II review', channel: 'A' }] } as Record<string, { id: string; title: string; channel: string }[]>
  const { yt, seen } = ytOf({ en1: meta('en1'), vi1: meta('vi1', { lang: 'en', title: 'Đánh giá Chihiros WRGB 2' }), nocap: meta('nocap'), noreview: meta('noreview') }, { nocap: null })
  let vets = 0
  const models: (string | undefined)[] = []
  const llm: Llm = async a => { vets++; models.push(a.model); return vetOk({ vi1: 'vi' })(a) }
  const r = await findReviews({ find: { searchReviews: async q => hits[q] ?? [] }, yt, llm, sleep: async () => {} }, WRGB, { keep: 2 })
  expect(vets).toBe(1)
  expect(models).toEqual(['haiku'])
  // A rival of the line and a stream never cost a metadata call.
  expect(seen).not.toContain('pro')
  expect(seen).not.toContain('live')
  // YouTube may guess the language wrong: the vet's reading goes first.
  expect(r.videos.map(v => [v.id, v.lang])).toEqual([['vi1', 'vi'], ['en1', 'en']])
  expect(r.dropped.map(d => d.id)).toEqual(expect.arrayContaining(['pro', 'live', 'noreview']))
})

test('findReviews: at most a few videos read per product, not dozens', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `v${i}`, title: 'Chihiros WRGB II review', channel: 'A' }))
  const metas = Object.fromEntries(many.map(x => [x.id, meta(x.id)]))
  const { yt, seen } = ytOf(metas)
  const r = await findReviews({ find: { searchReviews: async () => many }, yt, llm: vetOk(), sleep: async () => {} }, WRGB)
  expect(seen.length).toBeLessThanOrEqual(6)
  expect(r.videos.length).toBe(3)
})

test('findReviews: YouTube throttling stops the run rather than dropping the video', async () => {
  const yt: YouTube = { playlist: async () => { throw new Error('unused') }, video: async () => { throw new Error('yt-dlp: HTTP Error 429: Too Many Requests') }, transcript: async () => null }
  await expect(findReviews({ find: { searchReviews: async () => [{ id: 'a', title: 'Chihiros WRGB II review', channel: 'A' }] }, yt, llm: vetOk(), sleep: async () => {} }, WRGB)).rejects.toThrow('429')
})

test('a quote finds its second: the start of its line, however it\'s punctuated, across two lines; words not said find nothing', () => {
  const t = '[14:12] that\'s the warranty i think two years gives a one year warranty on all their lights\n[14:44] which is of course it\'s just personal\n[15:15] so just to summarize'
  // A real run's model put this point on the next line, after it was said.
  expect(secondOf(t, 'gives a one year warranty on all their lights')).toBe(852)
  expect(secondOf(t, 'Gives a ONE year, warranty!')).toBe(852)
  expect(secondOf(t, 'on all their lights which is of course')).toBe(852)
  expect(secondOf(t, 'which is of course a slip after the fourth word')).toBe(884)
  expect(secondOf(t, 'a five year warranty on everything')).toBeUndefined()
  expect(secondOf(t, 'warranty')).toBeUndefined() // too few words to place
})

test('extraction: a claim the transcript doesn\'t hold, or a figure not said near it, doesn\'t stand', () => {
  const x = cleanExtracted({
    reviewsProduct: true,
    findings: [
      { kind: 'strength', text: 'Fan quiet after two months.', quote: 'after two months the fan is quiet' },
      { kind: 'strength', text: 'Fan quiet after 2 months.', quote: 'after two months the fan is quiet' }, // a small figure captions spell out
      { kind: 'weakness', text: 'The legs wobble.', quote: 'the legs wobble on thin glass' }, // the transcript has no such words
      { kind: 'note', text: 'Draws 45 W at the wall.', quote: 'after two months the fan is quiet' }, // a figure said nowhere near
    ],
    measured: [
      { what: 'Noise at 1 m', value: '41', unit: 'dB', how: 'phone app', quote: 'I measured 41 decibels with my phone' },
      { what: 'PAR', value: '120', unit: 'umol', how: 'meter', quote: 'I measured 41 decibels with my phone' }, // never said
      { what: 'Looks', value: 'nice', unit: '', how: '', quote: 'I measured 41 decibels with my phone' },
    ],
  }, TRANSCRIPT, 700)
  expect(x.findings.map(f => [f.text, f.t])).toEqual([['Fan quiet after two months.', 90], ['Fan quiet after 2 months.', 90]])
  expect(x.measured.map(m => [m.what, m.t])).toEqual([['Noise at 1 m', 430]])
  // A moment past the video's end (captions that don't match it) doesn't stand either.
  expect(cleanExtracted({ reviewsProduct: true, findings: [{ kind: 'note', text: 'Quiet.', quote: 'after two months the fan is quiet' }], measured: [] }, TRANSCRIPT, 60).findings).toEqual([])
})

const A = watchUrl('aaaaaaaaaaa')
const B = watchUrl('bbbbbbbbbbb')
const two: ReviewInput[] = [
  { url: A, findings: [{ kind: 'strength', text: 'Bright enough for easy plants at 30 cm.', t: 95 }, { kind: 'strength', text: 'Fan almost silent.', t: 310 }], measured: [{ what: 'Noise at 1 m', value: '41', unit: 'dB', how: 'phone app', t: 430 }] },
  { url: B, findings: [{ kind: 'strength', text: 'Good growth for easy plants at 30 cm.', t: 212 }, { kind: 'weakness', text: 'Fan audible at full power.', t: 402 }], measured: [] },
]
const none: Written = { agree: [], differ: [], single: [], measured: [], tested: [] }
const merge = (w: Partial<Written>, o: Partial<Parameters<typeof mergeWritten>[3]> = {}, reviews = two) => mergeWritten({ ...none, ...w }, reviews, CHIHIROS_TESTS, { channels: ['Example Scapes'], controlled: false, ...o })

test('merge: each claim cites each of its reviews once, at its first moment; figures and labels from the findings', () => {
  const m = merge({
    agree: [{ text: 'Đèn đủ sáng cho cây dễ tính ở 30 cm.', refs: ['R1.1', 'R2.1', 'R1.2'] }],
    differ: [{ topic: 'Tiếng quạt', sides: [{ text: 'Một bài thấy gần như không nghe tiếng.', refs: ['R1.2'] }, { text: 'Bài kia nghe rõ khi chạy hết công suất.', refs: ['R2.2'] }] }],
    measured: [{ ref: 'R1.m1', what: 'Độ ồn ở 1 m', how: 'ứng dụng trên điện thoại' }],
  })
  expect(m.problems).toEqual([])
  expect(m.reviews!.agree[0]!.cites).toEqual([{ url: A, t: 95 }, { url: B, t: 212 }])
  expect(m.reviews!.differ[0]!.sides.map(s => s.cites)).toEqual([[{ url: A, t: 310 }], [{ url: B, t: 402 }]])
  expect(m.reviews!.measured).toEqual([{ what: 'Độ ồn ở 1 m', value: '41 dB', how: 'ứng dụng trên điện thoại', cite: { url: A, t: 430 } }])
})

test('merge: "agree" needs two reviews and "differ" two sides from two reviews: otherwise each is one review\'s point', () => {
  const m = merge({
    agree: [{ text: 'Quạt êm.', refs: ['R1.2'] }],
    differ: [{ topic: 'Tiếng quạt', sides: [{ text: 'Êm lúc đầu.', refs: ['R1.2'] }, { text: 'Ồn về sau.', refs: ['R1.2'] }] }],
  })
  expect(m.reviews!.agree).toEqual([])
  expect(m.reviews!.differ).toEqual([])
  expect(m.reviews!.single.map(s => s.text)).toEqual(['Quạt êm.', 'Êm lúc đầu.', 'Ồn về sau.'])
})

test('merge: with one review there is nothing to agree or differ on', () => {
  const m = merge({ agree: [{ text: 'Quạt êm.', refs: ['R1.2', 'R1.1'] }] }, {}, two.slice(0, 1))
  expect(m.reviews!.agree).toEqual([])
  expect(m.reviews!.single[0]!.cites).toEqual([{ url: A, t: 310 }])
})

test('merge: what the reviews didn\'t say doesn\'t publish, and the writer hears why', () => {
  const m = merge({ single: [
    { text: 'Quạt êm hơn hẳn đèn khác 12 dB.', refs: ['R1.2'] }, // a figure in none of its findings
    { text: 'Đèn rất sáng.', refs: ['R9.9'] }, // a finding that doesn't exist
    { text: 'Theo Example Scapes, quạt êm.', refs: ['R1.2'] },
    { text: 'Trong video quạt êm.', refs: ['R1.2'] },
    { text: 'Đèn đạt 9/10 điểm.', refs: ['R1.2'] },
    { text: 'Đèn được 4,5 sao.', refs: ['R1.2'] },
    { text: 'Bạn điều khiển được đèn này bằng AquaTome.', refs: ['R1.2'] },
    { text: 'Hai bài review cùng thấy quạt êm ở 30 cm.', refs: ['R1.1'] }, // its figures are its finding's
  ], measured: [{ ref: 'R1.m1', what: 'Độ ồn ở 1 m', how: '' }] })
  expect(m.reviews!.single.map(s => s.text)).toEqual(['Hai bài review cùng thấy quạt êm ở 30 cm.'])
  expect(m.problems).toHaveLength(7)
  expect(m.problems.join('\n')).toContain('12 is in none of its findings')
  expect(m.problems.join('\n')).toContain('R9.9')
})

test('merge: a product AquaTome does control may say so; it still may not name the channel', () => {
  expect(merge({ single: [{ text: 'Bạn điều khiển được đèn này bằng AquaTome.', refs: ['R1.2'] }] }, { controlled: true }).reviews!.single).toHaveLength(1)
})

test('merge: a measured row needs its Vietnamese label; the value is the extraction\'s, never the writer\'s', () => {
  const m = merge({ single: [{ text: 'Quạt êm.', refs: ['R1.2'] }] })
  expect(m.reviews!.measured).toEqual([])
  expect(m.problems.join()).toContain('no Vietnamese label for R1.m1')
  // A figure of its own in a label doesn't stand either.
  const w = merge({ measured: [{ ref: 'R1.m1', what: 'Độ ồn ở 5 m khi 25 °C', how: '' }] })
  expect(w.reviews).toBeUndefined()
})

test('a reading in the page\'s words: how close it is said in Vietnamese, the figure as it was read', () => {
  expect(figureOf('41')).toBe('41')
  expect(figureOf('30-35')).toBe('30-35')
  expect(figureOf('almost 50')).toBe('khoảng 50')
  expect(figureOf('~1.5')).toBe('khoảng 1.5')
  expect(figureOf('over 50')).toBe('trên 50')
  expect(figureOf('less than 5')).toBe('dưới 5')
  const m = merge({ measured: [{ ref: 'R1.m1', what: 'Nhiệt độ đèn', how: '' }] }, {}, [{ url: A, findings: [], measured: [{ what: 'Light temperature', value: 'almost 50', unit: '°C', how: '', t: 10 }] }])
  expect(m.reviews!.measured[0]!.value).toBe('khoảng 50 °C')
})

test('merge: imperial figures come out metric', () => {
  const inch = [{ url: A, findings: [{ kind: 'strength' as const, text: 'Bright at 12 inches.', t: 95 }], measured: [] }]
  const m = merge({ single: [{ text: 'Đèn đủ sáng ở độ sâu 12 inch.', refs: ['R1.1'] }] }, {}, inch)
  expect(m.reviews!.single[0]!.text).toContain('30 cm')
})

test('merge: our own notes cite our test notes, and only those', () => {
  const m = merge({ tested: [{ text: 'AquaTome thử trên WRGB II Slim: mất điện thì đồng hồ của đèn về 0.', refs: ['T1'] }, { text: 'Đèn bền 10 năm.', refs: ['T2'] }, { text: 'Không có nguồn.', refs: ['R1.1'] }] }, { testUrl: TEST_NOTES.url, controlled: true })
  expect(m.tested).toEqual([{ text: 'AquaTome thử trên WRGB II Slim: mất điện thì đồng hồ của đèn về 0.', cites: [{ url: TEST_NOTES.url }] }])
})

test('our test notes go only to lights we control, name the light tested, and say nothing of Week Aqua', () => {
  expect(testsFor('Chihiros', 'WRGB II')).toBe(CHIHIROS_TESTS)
  expect(testsFor('Chihiros', 'CO2 Diffuser')).toEqual([])
  expect(testsFor('Week Aqua', 'L600 Pro')).toEqual([])
  expect(testsFor('Tuya', 'Smart Life power strip')).toEqual([])
  for (const x of CHIHIROS_TESTS) {
    expect(x.testedOn).toContain('WRGB II Slim')
    expect(`${x.fact} ${x.testedOn}`).not.toMatch(/week ?aqua|owner/i)
  }
})

test('sources: this run\'s reviews after research\'s, whose places the specs point at', () => {
  const research = { url: 'https://maker.example', title: 'M', kind: 'manufacturer' as const, at: '2026-10-01' }
  const old = { url: watchUrl('oldoldoldol'), title: 'Old', kind: 'video' as const, at: '2026-10-01' }
  const e = { id: 'x', brand: 'b', model: 'm', category: 'den', specs: [], variants: [], sources: [research, old, { url: TEST_NOTES.url, title: 'T', kind: 'test' as const, at: '2026-10-01' }], reviews: { checkedAt: '2026-10-01', videos: [{ youtubeId: 'oldoldoldol', title: 'Old', durationSec: 600, lang: 'en', channel: 'C' }] }, updatedAt: '2026-10-01' }
  expect(sourcesWith(e, [{ url: A, title: 'New' }], TEST_NOTES, '2026-11-06').map(s => [s.url, s.kind])).toEqual([['https://maker.example', 'manufacturer'], [A, 'video'], [TEST_NOTES.url, 'test']])
})

const written: Written = { agree: [{ text: 'Đèn đủ sáng cho cây dễ tính ở 30 cm.', refs: ['R1.1', 'R2.1'] }], differ: [], single: [{ text: 'Một bài review thấy quạt gần như không nghe tiếng.', refs: ['R1.2'] }], measured: [{ ref: 'R1.m1', what: 'Độ ồn ở 1 m', how: 'ứng dụng trên điện thoại' }, { ref: 'R2.m1', what: 'Độ ồn ở 1 m', how: 'ứng dụng trên điện thoại' }], tested: [{ text: 'AquaTome thử trên WRGB II Slim: mất điện thì đồng hồ của đèn về 0.', refs: ['T1'] }] }
const extraction = () => ({ reviewsProduct: true, findings: [{ kind: 'strength', text: 'Bright enough for easy plants at 30 cm, after two months.', quote: 'at 30 cm easy plants did fine' }, { kind: 'strength', text: 'Fan almost silent.', quote: 'and the fan is quiet' }], measured: [{ what: 'Noise at 1 m', value: '41', unit: 'dB', how: 'phone app', quote: 'I measured 41 decibels with my phone' }] })
const TRANSCRIPT2 = `[1:30] at 30 cm easy plants did fine after two months and the fan is quiet\n[7:10] I measured 41 decibels with my phone\n${'[9:00] more words about the light and the plants in this tank\n'.repeat(40)}`

/** A stand-in for each model call, counting them: vet, extraction, writing. */
function modelFor(w: Written | ((n: number) => Written) = written) {
  const calls = { vet: 0, extract: 0, write: 0 }
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string; schema: object; model?: string }) => {
    const keys = Object.keys((a.schema as { properties: object }).properties)
    if (keys.includes('verdicts')) { calls.vet++; return vetOk()(a as never) as T }
    if (keys.includes('reviewsProduct')) { calls.extract++; return extraction() as T }
    calls.write++
    prompts.push(a.prompt)
    return (typeof w === 'function' ? w(calls.write) : w) as T
  }
  return { llm, calls, prompts }
}
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'aq-rev-'))
  const dir = join(root, 'content/products/chihiros-wrgb-ii')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'chihiros-wrgb-ii', brand: 'Chihiros', model: 'WRGB II', category: 'den', type: 'thuy-sinh', specs: [{ key: 'Power', value: '30 W', source: 0 }], variants: [], sources: [{ url: 'https://maker.example', title: 'Maker', kind: 'manufacturer', at: '2026-10-01' }], updatedAt: '2026-10-01' }))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: 'chihiros-wrgb-ii', name: 'Đèn Chihiros WRGB II', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  await writeFile(join(root, 'content/sources.json'), '{}')
  return { root, contentRoot: join(root, 'content'), dir }
}
const deps = (llm: Llm, metas: Record<string, VideoMeta> = { aaaaaaaaaaa: meta('aaaaaaaaaaa', { title: 'Chihiros WRGB II after 6 months' }), bbbbbbbbbbb: meta('bbbbbbbbbbb', { title: 'Đánh giá đèn Chihiros WRGB 2', channel: 'Kênh Ví Dụ', lang: 'vi' }) }) => ({
  find: { searchReviews: async () => Object.values(metas).map(m => ({ id: m.id, title: m.title, channel: m.channel })) },
  yt: ytOf(metas, Object.fromEntries(Object.keys(metas).map(k => [k, TRANSCRIPT2]))).yt, llm, sleep: async () => {}, now: () => new Date('2026-11-06T00:00:00Z'),
})

test('a product\'s summary: 1 vet, 1 extraction a review, 1 writing call; videos and our notes as sources; marks to the second', async () => {
  const { contentRoot, dir } = await store()
  const { llm, calls, prompts } = modelFor()
  const r = await reviewProduct(contentRoot, deps(llm), 'chihiros-wrgb-ii', WRGB)
  expect(r).toMatchObject({ written: true, calls: 4, videos: ['bbbbbbbbbbb', 'aaaaaaaaaaa'] })
  expect(calls).toEqual({ vet: 1, extract: 2, write: 1 })
  // The writer never sees a channel, a title or an address, so none can reach the page.
  expect(prompts[0]).not.toMatch(/Example Scapes|Kênh Ví Dụ|after 6 months|youtube\.com/)
  const entity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(entity.sources.map((s: { kind: string }) => s.kind)).toEqual(['manufacturer', 'video', 'video', 'test'])
  expect(entity.sources[1]).toMatchObject({ url: watchUrl('bbbbbbbbbbb'), title: 'Đánh giá đèn Chihiros WRGB 2' })
  expect(entity.specs[0].source).toBe(0)
  expect(entity.reviews.videos.map((v: { youtubeId: string; lang: string }) => [v.youtubeId, v.lang])).toEqual([['bbbbbbbbbbb', 'vi'], ['aaaaaaaaaaa', 'en']])
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))
  expect(vi.reviews.agree[0].cites).toEqual([{ url: watchUrl('bbbbbbbbbbb'), t: 90 }, { url: watchUrl('aaaaaaaaaaa'), t: 90 }])
  expect(vi.tested[0].cites).toEqual([{ url: TEST_NOTES.url }])
  // The page holds up against the content rules as a build reads it.
  const pages = await loadPages(contentRoot, ['vi'])
  const { findings } = checkPages(pages, RULES.filter(x => ['names-source', 'control-claim'].includes(x.id)))
  expect(findings).toEqual([])
  expect(pages[0]).toMatchObject({ control: true, credited: ['Kênh Ví Dụ', 'Example Scapes'] })
})

test('a slip gets one rewrite, with its notes, and no more', async () => {
  const { contentRoot, dir } = await store()
  const bad = { ...written, single: [{ text: 'Theo Example Scapes, quạt êm.', refs: ['R1.2'] }] }
  const { llm, calls, prompts } = modelFor(n => (n === 1 ? bad : { ...written, single: [{ text: 'Trong video, quạt êm.', refs: ['R1.2'] }] }))
  const r = await reviewProduct(contentRoot, deps(llm), 'chihiros-wrgb-ii', WRGB)
  expect(calls.write).toBe(2)
  expect(prompts[1]).toContain('Example Scapes') // the note quoting its own slip
  expect(r.written).toBe(true)
  // Still failing: that point is left out; the rest publishes.
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))
  expect(vi.reviews.single).toEqual([])
  expect(JSON.stringify(vi)).not.toMatch(/Example Scapes|Trong video/)
})

test('a refresh that finds no reviews keeps the ones the page has; a dry run writes nothing', async () => {
  const { contentRoot, dir } = await store()
  await reviewProduct(contentRoot, deps(modelFor().llm), 'chihiros-wrgb-ii', WRGB)
  const before = await readFile(join(dir, 'vi.json'), 'utf8')
  const gone = await reviewProduct(contentRoot, deps(modelFor({ ...written, agree: [], single: [], measured: [] }).llm, {}), 'chihiros-wrgb-ii', WRGB)
  expect(gone).toMatchObject({ videos: [], written: true }) // our notes written again
  expect(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')).reviews).toEqual(JSON.parse(before).reviews)
  expect(JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')).reviews.videos).toHaveLength(2)
  const after = await readFile(join(dir, 'vi.json'), 'utf8')
  const dry = await reviewProduct(contentRoot, deps(modelFor({ ...written, single: [{ text: 'Một bài review thấy quạt êm.', refs: ['R1.2'] }] }).llm), 'chihiros-wrgb-ii', WRGB, { dryRun: true })
  expect(dry).toMatchObject({ written: false, note: 'dry run' })
  expect(dry.reviews?.single[0]?.text).toBe('Một bài review thấy quạt êm.')
  expect(await readFile(join(dir, 'vi.json'), 'utf8')).toBe(after)
})

test('a product with no reviews and no notes of ours: no writing call, nothing written', async () => {
  const { contentRoot, dir } = await store()
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ id: 'chihiros-wrgb-ii', brand: 'Fluval', model: 'Plant 3.0', category: 'den', specs: [], variants: [], sources: [], updatedAt: '2026-10-01' }))
  const { llm, calls } = modelFor()
  const r = await reviewProduct(contentRoot, deps(llm, {}), 'chihiros-wrgb-ii', { brand: 'Fluval', model: 'Plant 3.0' })
  expect(r).toMatchObject({ written: false, note: 'no reviews with findings', calls: 0 })
  expect(calls).toEqual({ vet: 0, extract: 0, write: 0 })
})

async function candidateStore() {
  const { root, contentRoot } = await store()
  const put = async (rel: string, v: unknown) => { await mkdir(join(contentRoot, rel, '..'), { recursive: true }); await writeFile(join(contentRoot, rel), JSON.stringify(v)) }
  await put('equipment/den.json', { category: 'den', name: 'Đèn', types: [{ id: 'thuy-sinh', name: 'Đèn LED thủy sinh' }] })
  await put('equipment/loc.json', { category: 'loc', name: 'Lọc', types: [{ id: 'thung', name: 'Lọc thùng' }], intro: 'Một lựa chọn quen thuộc là Oase BioMaster 350.' })
  const guide = (id: string, gear: object[]) => put(`guides/${id}/entity.json`, { video: { gear } })
  await guide('g1', [{ category: 'loc', type: 'thung', brand: 'JBL', model: 'e701' }, { category: 'khac', brand: 'Weld-On', model: '4' }, { category: 'den', brand: 'Chihiros', model: 'WRGB 2' }])
  await guide('g2', [{ category: 'loc', type: 'thung', brand: 'JBL', model: 'E701' }, { category: 'loc', type: 'thung', brand: 'Oase', model: 'BioMaster 350' }, { category: 'den', brand: 'Week Aqua', model: 'L600 Pro' }, { category: 'den', brand: 'Chihiros', model: 'A Series' }])
  await put('species/x/entity.json', { productSlots: [{ category: 'loc', keywords: ['lọc thùng bể lớn', 'lọc Oase BioMaster 350 chính hãng'] }] })
  await put('plants/y/entity.json', { productSlots: [{ category: 'loc', keywords: ['oase biomaster 350'] }] })
  return { root, contentRoot }
}

test('candidates: the lights we control in the owner\'s order, the plugs we switch, then what our pages name, most linked first', async () => {
  const { contentRoot } = await candidateStore()
  const c = await productCandidates(contentRoot)
  const lights = c.filter(x => x.tier === 1)
  expect(lights.map(x => x.model)).toEqual(['WRGB II', 'WRGB II Slim', 'WRGB II Pro', 'C II', 'C II RGB', 'WRGB VIVID III', 'Universal WRGB', 'SEA', 'Commander 4'])
  expect(lights[0]).toMatchObject({ id: 'chihiros-wrgb-ii', links: 1, ask: { category: 'den', type: 'thuy-sinh', kind: 'Đèn LED thủy sinh' } })
  expect(c.filter(x => x.tier === 2).map(x => [x.id, x.ask.category])).toEqual([['tuya-smart-life-power-strip', 'o-cam']])
  expect(c.findIndex(x => x.tier === 3)).toBeGreaterThan(c.findIndex(x => x.tier === 2))
  const rest = c.filter(x => x.tier === 3)
  // Oase: a guide, a species, a plant, a guide's text; JBL: two guides, one row spelled two ways.
  expect(rest.slice(0, 2).map(x => [x.id, x.links])).toEqual([['oase-biomaster-350', 4], ['jbl-e701', 2]])
  // Kit no equipment guide covers isn't a candidate; other lines the tool drives still are, with their links.
  expect(c.map(x => x.id)).not.toContain('weld-on-4')
  expect(rest.find(x => x.id === 'chihiros-a-series')).toMatchObject({ links: 1 })
  expect(rest.map(x => x.id)).toContain('chihiros-commander-x')
  // A video's spelling of a light we have is that light, once. Week Aqua ranks as any kit, never with the lights we control.
  expect(c.filter(x => /wrgb-2|wrgb-ii$/.test(x.id)).map(x => x.id)).toEqual(['chihiros-wrgb-ii'])
  expect(rest.find(x => x.id === 'week-aqua-l600-pro')).toMatchObject({ links: 1, tier: 3 })
})

test('a turn stands for a while: longer for a summary, a day for a failure, three tries', () => {
  const now = new Date('2026-11-06T00:00:00Z')
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  expect(isDue(undefined, now)).toBe(true)
  expect(isDue({ at: ago(89), status: 'written' }, now)).toBe(false)
  expect(isDue({ at: ago(91), status: 'written' }, now)).toBe(true)
  expect(isDue({ at: ago(29), status: 'no-reviews' }, now)).toBe(false)
  expect(isDue({ at: ago(31), status: 'no-reviews' }, now)).toBe(true)
  expect(isDue({ at: ago(179), status: 'not-sold' }, now)).toBe(false)
  expect(isDue({ at: ago(2), status: 'error', attempts: 1 }, now)).toBe(true)
  expect(isDue({ at: ago(2), status: 'error', attempts: 3 }, now)).toBe(false)
})

const cycleDeps = (llm: Llm, research: Llm = async () => { throw new Error('no research expected') }) => ({ ...deps(llm), research, get: async () => '' })

test('a run does the next one due, records it, and moves on next time', async () => {
  const { root } = await candidateStore()
  const { llm, calls } = modelFor()
  const r = await productReviews(root, cycleDeps(llm), { limit: 1, noNewPages: true })
  expect(r.done.map(x => x.id)).toEqual(['chihiros-wrgb-ii'])
  expect(calls.write).toBe(1)
  const state = JSON.parse(await readFile(join(root, 'engine-state/_product-reviews.json'), 'utf8'))
  expect(state['chihiros-wrgb-ii']).toMatchObject({ status: 'written' })
  // Late in a cycle, no long research for a page: those wait; there's nothing else due here.
  const again = await productReviews(root, cycleDeps(llm), { limit: 1, noNewPages: true })
  expect(again.done).toEqual([])
  expect(again.skipped[0]).toBe('chihiros-wrgb-ii-slim: no page yet')
})

test('a candidate with no page gets one first, by the existing research; the model\'s limit stops the run with nothing marked failed', async () => {
  const { root, contentRoot } = await candidateStore()
  const facts = { found: true, specs: [], variants: [], prices: [], fits: [], usage: [], issues: [], alternatives: [], sources: [{ url: 'https://maker.example', title: 'Maker', kind: 'manufacturer' }] }
  const { llm } = modelFor()
  const write: Llm = async a => ('score' in (a.schema as { properties: object }).properties ? { score: 0.9, notes: [] } : 'name' in (a.schema as { properties: object }).properties ? { name: 'Đèn Chihiros WRGB II Slim', summary: ['Đèn mỏng.'], body: '<p>Đèn mỏng.</p>', faq: [], labels: {} } : llm(a)) as never
  const r = await productReviews(root, cycleDeps(write, async <T,>() => facts as T), { only: ['chihiros-wrgb-ii-slim'] })
  expect(r.done.map(x => x.id)).toEqual(['chihiros-wrgb-ii-slim'])
  expect(JSON.parse(await readFile(join(contentRoot, 'products/chihiros-wrgb-ii-slim/entity.json'), 'utf8')).model).toBe('WRGB II Slim')

  const limited: Llm = async () => { throw new LlmError('usage limit') }
  const stopped = await productReviews(root, cycleDeps(limited), { only: ['chihiros-wrgb-ii'] })
  expect(stopped.stopped).toContain('usage limit')
  const state = JSON.parse(await readFile(join(root, 'engine-state/_product-reviews.json'), 'utf8'))
  expect(state['chihiros-wrgb-ii']).toBeUndefined()
})

test('other kit gets a page only if it\'s sold here: no shop price, not-sold for a good while, with only the research spent', async () => {
  const { root, contentRoot } = await candidateStore()
  const facts = { found: true, specs: [], variants: [], prices: [], fits: [], usage: [], issues: [], alternatives: [], sources: [] }
  const { llm, calls } = modelFor()
  const r = await productReviews(root, cycleDeps(llm, async <T,>() => facts as T), { only: ['jbl-e701'] })
  expect(r.done).toEqual([])
  expect(r.skipped).toEqual(['jbl-e701: JBL e701: no Vietnamese shop shows a price'])
  expect(calls).toEqual({ vet: 0, extract: 0, write: 0 })
  expect(JSON.parse(await readFile(join(root, 'engine-state/_product-reviews.json'), 'utf8'))['jbl-e701']).toMatchObject({ status: 'not-sold' })
  await expect(readFile(join(contentRoot, 'products/jbl-e701/entity.json'), 'utf8')).rejects.toThrow()
})

test('a dry run writes no state and makes no page', async () => {
  const { root, contentRoot } = await candidateStore()
  const { llm, calls } = modelFor()
  const r = await productReviews(root, cycleDeps(llm), { dryRun: true, limit: 2 })
  expect(r.done.map(x => x.id)).toEqual(['chihiros-wrgb-ii'])
  expect(calls.write).toBe(1)
  await expect(readFile(join(root, 'engine-state/_product-reviews.json'), 'utf8')).rejects.toThrow()
  await expect(readFile(join(contentRoot, 'products/chihiros-wrgb-ii-slim/entity.json'), 'utf8')).rejects.toThrow()
})
