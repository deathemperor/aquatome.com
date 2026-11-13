import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { lowVideoGuides, reviewBackfill } from '../src/review-backfill'
import { NEAR_BAR, steadyRead, WRITER_BAND } from '../src/quality'
import { logReviews, readReviews } from '../src/review-log'
import type { YouTube } from '../src/youtube'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(v)) }
const guide = (root: string, vid: string, score: number) => Promise.all([
  put(root, `content/guides/youtube-${vid}/entity.json`, { id: `youtube-${vid}`, source: 'youtube', video: { youtubeId: vid, title: `Video ${vid}`, channel: 'MJ Aquascaping' } }),
  put(root, `content/guides/youtube-${vid}/vi.json`, { slug: vid, name: `Bài ${vid}`, summary: ['Ý chính.'], body: `<p>Thân bài ${vid}.</p>`, faq: [], sections: {}, quality: { score, indexable: score >= 0.75 } }),
])
const yt = { transcript: async (id: string) => `[0:00] transcript of ${id}` } as unknown as YouTube

test('video guides under the bar are reviewed again as they are, the owner\'s first, then the lowest; nothing rewritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  await guide(root, 'low', 0.4)
  await guide(root, 'owner', 0.6)
  await guide(root, 'fine', 0.9)
  await put(root, 'engine-state/youtube-videos.json', [{ id: 'owner', by: 'owner' }, { id: 'low', by: 'search' }])
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.65, notes: ['Invents a price list the video never gives.'] } as T }
  const page = await readFile(join(root, 'content/guides/youtube-owner/vi.json'), 'utf8')
  const d = { root, llm, yt, now: () => new Date('2026-11-06T10:00:00Z'), sleep: async () => {} }

  const r = await reviewBackfill(d, { kinds: ['video-guide'], limit: 1 })
  expect(r.checked).toEqual(['video-guide vi/guides/youtube-owner: 0.65 (was 0.60), 1 notes'])
  expect(r.left).toEqual({ 'video-guide': 1 })
  expect(prompts[0]).toContain('transcript of owner')
  expect(prompts[0]).toContain('Thân bài owner.')
  expect(prompts[0]).toContain('by MJ Aquascaping')
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-owner']).toEqual([
    { at: '2026-11-06T10:00:00Z', model: 'sonnet', score: 0.65, notes: ['Invents a price list the video never gives.'], attempt: 'recheck', kept: true },
  ])
  // The page is as it was: a recheck only gives it notes.
  expect(await readFile(join(root, 'content/guides/youtube-owner/vi.json'), 'utf8')).toBe(page)

  expect((await reviewBackfill(d, { kinds: ['video-guide'], limit: 5 })).checked).toEqual(['video-guide vi/guides/youtube-low: 0.65 (was 0.40), 1 notes'])
  // Each has its notes now: nothing left, unless asked for by name.
  expect((await reviewBackfill(d, { kinds: ['video-guide'], limit: 5 })).checked).toEqual([])
  expect((await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, only: ['youtube-fine'] })).checked).toEqual(['video-guide vi/guides/youtube-fine: 0.65 (was 0.90), 1 notes'])
})

test('--reviewed-before: every video guide without a review from then on is reviewed again, whatever its score, each once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  const since = '2026-11-07T12:00:00Z'
  const kept = (vid: string, score: number, at: string) => { const r = { score, notes: [] }; return logReviews(root, 'video-guide', { id: `guides/youtube-${vid}`, lang: 'vi' }, [r], r, { now: new Date(at) }) }
  await guide(root, 'old', 0.9)
  await kept('old', 0.9, '2026-11-06T10:00:00Z') // passed the lenient reviewer
  await guide(root, 'owner', 0.95)
  await kept('owner', 0.95, '2026-11-06T10:00:00Z')
  await guide(root, 'none', 0.8) // no review kept at all
  await guide(root, 'new', 0.5)
  await kept('new', 0.5, '2026-11-07T12:30:00Z') // the stricter reviewer's already: left alone, under the bar or not
  await put(root, 'engine-state/youtube-videos.json', [{ id: 'owner', by: 'owner' }])
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.6, notes: ['Says "nhiều người" for the speaker\'s own habit.'] } as T }
  const d = { root, llm, yt, now: () => new Date('2026-11-07T14:00:00Z'), sleep: async () => {} }

  const r = await reviewBackfill(d, { kinds: ['video-guide'], limit: 2, reviewedBefore: since })
  expect(r.checked).toEqual(['video-guide vi/guides/youtube-owner: 0.60 (was 0.95), 1 notes', 'video-guide vi/guides/youtube-none: 0.60 (was 0.80), 1 notes'])
  expect(r.left).toEqual({ 'video-guide': 1 })
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-owner']![0]).toMatchObject({ at: '2026-11-07T14:00:00Z', attempt: 'recheck', kept: true, score: 0.6 })
  expect((await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, reviewedBefore: since })).checked).toEqual(['video-guide vi/guides/youtube-old: 0.60 (was 0.90), 1 notes'])
  // Each has a review from after the cutoff now: none is picked again.
  expect(await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, reviewedBefore: since })).toMatchObject({ checked: [], left: { 'video-guide': 0 } })
  expect(prompts).toHaveLength(3)
})

test('a held video guide (out of the chat) that passes its recheck goes back in; one under the bar stays held', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  for (const vid of ['pass', 'fail']) {
    await guide(root, vid, 0.8)
    const file = join(root, `content/guides/youtube-${vid}/vi.json`)
    const vi = JSON.parse(await readFile(file, 'utf8'))
    await writeFile(file, JSON.stringify({ ...vi, quality: { ...vi.quality, chat: false } }))
  }
  const llm: Llm = async <T,>(a: { prompt: string }) => (a.prompt.includes('Thân bài pass.') ? { score: 0.8, notes: [] } : { score: 0.6, notes: ['Ranks it "the best"; the speaker never does.'] }) as T
  const r = await reviewBackfill({ root, llm, yt, now: () => new Date('2026-11-07T14:00:00Z'), sleep: async () => {} }, { kinds: ['video-guide'], limit: 5, reviewedBefore: '2026-11-07T12:00:00Z' })
  expect(r.checked).toEqual(['video-guide vi/guides/youtube-fail: 0.60 (was 0.80), 1 notes', 'video-guide vi/guides/youtube-pass: 0.80 (was 0.80), 0 notes, back in the chat'])
  expect(JSON.parse(await readFile(join(root, 'content/guides/youtube-pass/vi.json'), 'utf8')).quality).toEqual({ score: 0.8, indexable: true })
  expect(JSON.parse(await readFile(join(root, 'content/guides/youtube-fail/vi.json'), 'utf8')).quality).toEqual({ score: 0.8, indexable: true, chat: false })
})

test('--parallel: a few reviewed at once, never past the limit, in the rank given; a model failure starts no more', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  for (const vid of ['a', 'b', 'c', 'd', 'e', 'f']) await guide(root, vid, 0.9)
  let busy = 0
  let peak = 0
  // The first call waits for the second, so a loaded machine can't finish one before the next starts and read as one at a time.
  let bothBusy = () => {}
  const both = new Promise<void>(r => { bothBusy = r })
  const llm: Llm = async <T,>() => { peak = Math.max(peak, ++busy); if (busy === 2) bothBusy(); await both; busy--; return { score: 0.6, notes: ['Adds a dose the video never gives.'] } as T }
  const rank = (p: { id: string }) => [p.id.endsWith('-f') ? 0 : p.id.endsWith('-e') ? 1 : 2]
  const d = { root, llm, yt, now: () => new Date('2026-11-07T14:00:00Z'), sleep: async () => {} }
  const o = { kinds: ['video-guide'] as const, limit: 5, reviewedBefore: '2026-11-07T12:00:00Z', rank, parallel: 2 }
  const r = await reviewBackfill(d, o)
  expect(peak).toBe(2)
  expect(r.checked).toHaveLength(5)
  expect(r.left).toEqual({ 'video-guide': 1 })
  expect(Object.keys(await readReviews(root, 'video-guide'))).toEqual(['a', 'b', 'c', 'e', 'f'].map(v => `vi/guides/youtube-${v}`))

  const root2 = await mkdtemp(join(tmpdir(), 'rb-'))
  for (const vid of ['a', 'b', 'c', 'd']) await guide(root2, vid, 0.9)
  let asked = 0
  const down: Llm = async () => { asked++; await new Promise(r => setTimeout(r, 5)); throw new LlmError('claude failed: usage limit reached') }
  const stopped = await reviewBackfill({ ...d, root: root2, llm: down }, o)
  expect([asked, stopped.checked.length, stopped.stopped]).toEqual([2, 0, expect.stringContaining('usage limit')])
})

test('a species translation is reviewed again per source under the bar, against that source\'s English; Indonesian against all of it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  const sec = (key: string, source: string) => ({ key, source, sourceUrl: 'u', html: `<p>${key} from ${source}</p>` })
  await put(root, 'content/sources.json', { seriouslyfish: { permission: { scope: ['translation'] } }, glaser: { permission: { scope: ['translation'] } } })
  await put(root, 'content/species/x/entity.json', { id: 'x', sections: [sec('diet', 'seriouslyfish'), sec('references', 'seriouslyfish'), sec('diet', 'glaser')] })
  await put(root, 'content/species/x/vi.json', { slug: 'x', name: 'X', sections: { 'diet:seriouslyfish': '<p>ăn gì</p>', 'references:seriouslyfish': '<p>Ref</p>', 'diet:glaser': '<p>glaser</p>' }, quality: { score: 0.6, indexable: false, bySource: { seriouslyfish: 0.6, glaser: 0.9 } } })
  await put(root, 'content/species/x/id.json', { slug: 'x', name: 'X', sections: { 'diet:seriouslyfish': '<p>makan</p>' }, quality: { score: 0.5, indexable: false } })
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.7, notes: ['Omits the live food.'] } as T }
  const r = await reviewBackfill({ root, llm, now: () => new Date('2026-11-06T10:00:00Z') }, { kinds: ['translation', 'localize'], limit: 5 })
  expect(r.checked).toEqual(['translation vi/species/x#seriouslyfish: 0.70 (was 0.60), 1 notes', 'localize id/species/x: 0.70 (was 0.50), 1 notes'])
  expect(prompts[0]).toContain('diet from seriouslyfish')
  expect(prompts[0]).not.toContain('glaser')
  expect(prompts[0]).not.toContain('<p>Ref</p>')
  expect(prompts[1]).toContain('(left out)') // the glaser part has no Indonesian
  expect((await readReviews(root, 'translation'))['vi/species/x#seriouslyfish']).toMatchObject([{ attempt: 'recheck', kept: true, notes: ['Omits the live food.'] }])
  expect(Object.keys(await readReviews(root, 'localize'))).toEqual(['id/species/x'])
})

test('a source whose text has left the page isn\'t listed: nothing to check it against, and no failure every run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  const sec = (key: string, source: string) => ({ key, source, sourceUrl: 'u', html: `<p>${key} from ${source}</p>` })
  await put(root, 'content/sources.json', { seriouslyfish: { permission: { scope: ['translation'] } }, glaser: { permission: { scope: ['translation'] } } })
  // Its Glaser part is gone from the page, its score still on record under the bar.
  await put(root, 'content/species/x/entity.json', { id: 'x', sections: [sec('diet', 'seriouslyfish')] })
  await put(root, 'content/species/x/vi.json', { slug: 'x', name: 'X', sections: { 'diet:seriouslyfish': '<p>ăn gì</p>' }, quality: { score: 0.6, indexable: false, bySource: { seriouslyfish: 0.6, glaser: 0.7 } } })
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.8, notes: [] } as T }
  const r = await reviewBackfill({ root, llm, now: () => new Date('2026-11-13T10:00:00Z') }, { kinds: ['translation'], limit: 5 })
  expect(r.checked).toEqual(['translation vi/species/x#seriouslyfish: 0.80 (was 0.60), 0 notes'])
  expect(r.failed).toEqual([])
  expect(r.left).toEqual({ translation: 0 })
  expect(prompts).toHaveLength(1)
})

test('a guide AquaTome wrote is checked again as it is, against the facts its writer had, and the check\'s score is the page\'s', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  const g = 'aquatome-thoi-vay'
  // A source listed twice, one that isn't a web page, and a fact about Vietnam, which only the Vietnamese guide has.
  await put(root, `engine-state/topics/${g}.json`, {
    found: true, species: [],
    sources: [{ url: 'note: a book', title: 'Book', kind: 'other' }, { url: 'https://society.example/fin-rot', title: 'Society', kind: 'society' }, { url: 'https://shop.example/a', title: 'Shop', kind: 'shop' }, { url: 'https://society.example/fin-rot', title: 'Society again', kind: 'society' }],
    facts: [
      { section: 'treatment', fact: 'From the book.', source: 0 },
      { section: 'treatment', fact: 'The society lists malachite green as effective in some cases.', source: 3 },
      { section: 'vietnam', fact: 'Shops in Vietnam sell it.', source: 2 },
    ],
  })
  await put(root, `content/guides/${g}/entity.json`, { id: g, kind: 'disease', source: 'aquatome', refs: [{ url: 'https://society.example/fin-rot', title: 'Society' }, { url: 'https://shop.example/a', title: 'Shop' }] })
  const page = (lang: string, score: number) => ({ slug: `thoi-vay-${lang}`, name: `Thối vây ${lang}`, summary: ['Ý chính.'], body: `<p>Xanh malachite: liều theo nhãn (${lang}).</p>`, faq: [{ q: 'Hỏi?', a: 'Đáp.' }], sections: {}, bodyFixed: true, quality: { score, indexable: score >= 0.75 } })
  await put(root, `content/guides/${g}/vi.json`, page('vi', 0.72))
  await put(root, `content/guides/${g}/id.json`, page('id', 0.9))
  const prompts: string[] = []
  const llm: Llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.96, notes: [] } as T }
  const d = { root, llm, now: () => new Date('2026-11-09T10:00:00Z') }

  // Under the bar: the Vietnamese guide, not the Indonesian one.
  const r = await reviewBackfill(d, { kinds: ['topic'], limit: 5 })
  expect(r.checked).toEqual([`topic vi/guides/${g}: 0.96 (was 0.72), 0 notes`])
  const facts = (p: string) => JSON.parse(p.split('FACTS:\n')[1]!.split('\n\nGUIDE:')[0]!)
  // Each source's kind, numbered as the facts cite them, so a page names the society as a society.
  expect(facts(prompts[0]!)).toEqual({ topic: 'Thối vây vi', kind: 'disease', sources: [{ source: 0, kind: 'society' }, { source: 1, kind: 'shop' }], facts: [
    { section: 'treatment', fact: 'The society lists malachite green as effective in some cases.', source: 0 },
    { section: 'vietnam', fact: 'Shops in Vietnam sell it.', source: 1 },
  ] })
  expect(prompts[0]).toContain('Vietnamese GUIDE')
  expect(prompts[0]).toContain('liều theo nhãn (vi)')
  // Dosing by the label is the writers' rule, so the checker counts it as supported.
  expect(prompts[0]).toMatch(/by its label[^\n]*counts as supported[^\n]*never one of the notes/)
  const vi = JSON.parse(await readFile(join(root, `content/guides/${g}/vi.json`), 'utf8'))
  expect(vi).toEqual({ ...page('vi', 0.96), quality: { score: 0.96, indexable: true } })
  expect((await readReviews(root, 'topic'))[`vi/guides/${g}`]).toEqual([{ at: '2026-11-09T10:00:00Z', model: 'sonnet', score: 0.96, notes: [], attempt: 'recheck', kept: true }])

  // Another language: its own facts, without Vietnam's, numbered by its references.
  await reviewBackfill(d, { kinds: ['topic'], limit: 5, only: [`id/guides/${g}`] })
  expect(prompts[1]).toContain('Indonesian (Bahasa Indonesia) GUIDE')
  expect(facts(prompts[1]!)).toEqual({ topic: 'Thối vây vi', kind: 'disease', sources: [{ source: 0, kind: 'society' }], facts: [{ section: 'treatment', fact: 'The society lists malachite green as effective in some cases.', source: 0 }] })
  expect(prompts[1]).toMatch(/naming one as another kind[^\n]*is a wrong claim/)
  expect(JSON.parse(await readFile(join(root, `content/guides/${g}/id.json`), 'utf8')).quality).toEqual({ score: 0.96, indexable: true })
})

test('a guide read near the bar is read twice more and gets the median read; one read well clear of it takes one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  const g = 'aquatome-mang'
  await put(root, `engine-state/topics/${g}.json`, { found: true, species: [], sources: [{ url: 'https://a.example/x', title: 'A' }], facts: [{ section: 'what', fact: 'A fact.', source: 0 }] })
  await put(root, `content/guides/${g}/entity.json`, { id: g, kind: 'disease', source: 'aquatome', refs: [{ url: 'https://a.example/x', title: 'A' }] })
  await put(root, `content/guides/${g}/vi.json`, { slug: 'mang', name: 'Mang', summary: [], body: '<p>Thân.</p>', faq: [], sections: {}, quality: { score: 0.5, indexable: false } })
  // The median is the third read, so its notes are the third read's.
  let scores = [0.6, 0.9, 0.8]
  const llm: Llm = async <T,>() => { const s = scores.shift()!; return { score: s, notes: [`read ${s}`] } as T }
  const d = { root, llm, now: () => new Date('2026-11-09T10:00:00Z') }

  await reviewBackfill(d, { kinds: ['topic'], limit: 5, only: [`vi/guides/${g}`] })
  expect(scores).toEqual([])
  expect(JSON.parse(await readFile(join(root, `content/guides/${g}/vi.json`), 'utf8')).quality).toEqual({ score: 0.8, indexable: true })
  expect((await readReviews(root, 'topic'))[`vi/guides/${g}`]![0]).toMatchObject({ score: 0.8, notes: ['read 0.8'], reads: [0.6, 0.9, 0.8], kept: true })

  scores = [0.97, 0.5]
  await reviewBackfill(d, { kinds: ['topic'], limit: 5, only: [`vi/guides/${g}`] })
  expect(scores).toEqual([0.5])
  expect((await readReviews(root, 'topic'))[`vi/guides/${g}`]![0]).toEqual({ at: '2026-11-09T10:00:00Z', model: 'sonnet', score: 0.97, notes: ['read 0.97'], attempt: 'recheck', kept: true })
})

// The chief of staff, 2026-11-11: a read near the bar is read twice more and the middle one counts. Second reads (which
// move a page in or out of search) within 0.2 of it; the page writer's and the translator's reviewers within 0.1.
test('three reads near the bar: within the band two more and the middle counts; a read already made can be the first', async () => {
  const scores = (xs: number[]) => { let i = 0; const calls: number[] = []; return { calls, read: async () => { calls.push(i); return { score: xs[i++]!, notes: [`read ${i}`] } } } }
  let s = scores([0.82, 0.6, 0.9])
  expect(await steadyRead(s.read, WRITER_BAND)).toEqual({ score: 0.82, notes: ['read 1'], reads: [0.82, 0.6, 0.9] }) // 0.07 from the bar
  s = scores([0.86, 0.6, 0.9])
  expect(await steadyRead(s.read, WRITER_BAND)).toEqual({ score: 0.86, notes: ['read 1'] }) // 0.11 away: one read
  s = scores([0.86, 0.6, 0.9])
  expect(await steadyRead(s.read, NEAR_BAR)).toEqual({ score: 0.86, notes: ['read 1'], reads: [0.86, 0.6, 0.9] })
  // A read made before is the first: two more, whatever its score with an endless band.
  s = scores([0.7, 0.8])
  expect(await steadyRead(s.read, Infinity, { score: 0.4, notes: ['before'] })).toEqual({ score: 0.7, notes: ['read 1'], reads: [0.4, 0.7, 0.8] })
  expect(s.calls).toHaveLength(2)
})

test('second reads read three times within the band given; the low video guides in search get two more reads, once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  await guide(root, 'near', 0.6) // under the bar: second reads take it
  await guide(root, 'low', 0.8) // in search, its newest second read 0.4
  await guide(root, 'out', 0.5) // out of search already
  await guide(root, 'edge', 0.8) // in search, its second read 0.55: one of them
  await guide(root, 'over', 0.8) // in search, its second read 0.6: the regular second reads' band takes it
  const log = (vid: string, score: number) => { const r = { score, notes: ['old'] }; return logReviews(root, 'video-guide', { id: `guides/youtube-${vid}`, lang: 'vi' }, [r], r, { recheck: true, now: new Date('2026-11-08T00:00:00Z') }) }
  for (const [vid, score] of [['low', 0.4], ['out', 0.4], ['edge', 0.55], ['over', 0.6]] as const) await log(vid, score)
  let n = 0
  const llm: Llm = async <T,>() => ({ score: [0.6, 0.8, 0.7][n++ % 3]!, notes: [] }) as T
  const d = { root, llm, yt, now: () => new Date('2026-11-13T01:00:00Z'), sleep: async () => {} }
  await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, only: ['youtube-near'], band: NEAR_BAR })
  // 0.6 alone keeps it under the bar; the middle of 0.6, 0.8 and 0.7 is what counts.
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-near']![0]).toMatchObject({ score: 0.7, reads: [0.6, 0.8, 0.7] })
  expect(n).toBe(3)

  expect(await lowVideoGuides(root)).toEqual(['youtube-edge', 'youtube-low'])
  n = 0
  await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, only: ['youtube-low'], fromLastRead: true, band: Infinity })
  expect(n).toBe(2) // the newest second read is the first of the three
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-low']![0]).toMatchObject({ attempt: 'recheck', score: 0.6, reads: [0.4, 0.6, 0.8] })
  expect(await lowVideoGuides(root)).toEqual(['youtube-edge']) // read three times: done
})

test('the low video guides: a usage limit on the second or third read saves nothing and counts nothing; a guide read since it was listed is passed over', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  await guide(root, 'low', 0.8)
  const r0 = { score: 0.4, notes: ['old'] }
  await logReviews(root, 'video-guide', { id: 'guides/youtube-low', lang: 'vi' }, [r0], r0, { recheck: true, now: new Date('2026-11-08T00:00:00Z') })
  const before = await readReviews(root, 'video-guide')
  let n = 0
  const out: Llm = async <T,>() => { if (n++ === 1) throw new LlmError('usage limit'); return { score: 0.7, notes: [] } as T }
  const d = { root, llm: out, yt, now: () => new Date('2026-11-13T01:00:00Z'), sleep: async () => {} }
  const r = await reviewBackfill(d, { kinds: ['video-guide'], limit: 5, only: ['youtube-low'], fromLastRead: true, band: Infinity })
  expect(r.stopped).toContain('usage limit')
  expect(r.checked).toEqual([])
  expect(await readReviews(root, 'video-guide')).toEqual(before)
  expect(await lowVideoGuides(root)).toEqual(['youtube-low'])
  // Read three times by another job after it was listed: nothing to start from, so no read.
  const r3 = { score: 0.5, notes: [], reads: [0.4, 0.5, 0.6] }
  await logReviews(root, 'video-guide', { id: 'guides/youtube-low', lang: 'vi' }, [r3], r3, { recheck: true, now: new Date('2026-11-13T02:00:00Z') })
  n = 0
  const counted: Llm = async <T,>() => { n++; return { score: 0.7, notes: [] } as T }
  const again = await reviewBackfill({ ...d, llm: counted }, { kinds: ['video-guide'], limit: 5, only: ['youtube-low'], fromLastRead: true, band: Infinity })
  expect(n).toBe(0)
  expect(again.failed).toEqual(['vi/guides/youtube-low: no single second read to start from'])
})

test('place names on second reads are read three times within the band, and each name keeps the reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rb-'))
  await put(root, 'content/places/rio-negro/entity.json', { id: 'rio-negro', name: 'Rio Negro', kind: 'river', country: 'Brazil' })
  await put(root, 'content/places/rio-negro/vi.json', { slug: 'rio-negro', name: 'sông Rio Negro', altNames: [], sections: {} })
  await put(root, 'content/places/rio-negro/id.json', { slug: 'rio-negro', name: 'Sungai Rio Negro', altNames: [], sections: {}, quality: { score: 0.6, indexable: false } })
  let n = 0
  const llm: Llm = async <T,>() => ({ score: [0.6, 0.8, 0.7][n++ % 3]!, notes: [] }) as T
  await reviewBackfill({ root, llm, now: () => new Date('2026-11-13T01:00:00Z') }, { kinds: ['places'], limit: 5, band: NEAR_BAR })
  expect(n).toBe(3)
  expect((await readReviews(root, 'places'))['id/places/rio-negro']![0]).toMatchObject({ attempt: 'recheck', score: 0.7, reads: [0.6, 0.8, 0.7] })
})
