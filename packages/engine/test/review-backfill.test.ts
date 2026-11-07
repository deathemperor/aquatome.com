import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { reviewBackfill } from '../src/review-backfill'
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
