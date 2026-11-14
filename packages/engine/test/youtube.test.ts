import { videoBudgetStopped } from '../src/youtube'
import { denied } from './piece-admission'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { fitRules } from '../src/fit'
import type { Page } from '../src/pages'
import { logReviews, readReviews } from '../src/review-log'
import { chaptersFrom, crowdLines, editDraft, lowVideoGuides, parseTranscript, recheckedGuides, retry403, reviewDraft, storyboardInterval, videoGuides, ytApi, type VideoMeta, type YouTube } from '../src/youtube'

const ev = (s: number, text: string) => ({ tStartMs: s * 1000, segs: [{ utf8: text }] })

test('a frame grab YouTube refuses (403) is asked twice more; any other failure, or a third 403, stands', async () => {
  const refuse = () => new Error('ffmpeg: Error opening input files: Server returned 403 Forbidden (access denied)')
  const wait = async () => {}
  let n = 0
  await expect(retry403(async () => { if (n++ === 0) throw refuse(); return 'frame' }, wait)).resolves.toBe('frame')
  expect(n).toBe(2)
  n = 0
  await expect(retry403(async () => { n++; throw refuse() }, wait)).rejects.toThrow('403')
  expect(n).toBe(3)
  n = 0
  await expect(retry403(async () => { n++; throw new Error('ffmpeg: no frame') }, wait)).rejects.toThrow('no frame')
  expect(n).toBe(1)
})

test("storyboardInterval: YouTube's seconds between tiles, from yt-dlp's tiles ÷ duration (real videos' storyboard specs)", () => {
  // [duration, tiles, interval]: HLrQzpFLI5U, M0kds6giFrU, AsK_yxCXVrY, P7GTfHdl5E8, U9ovPRxMWk8, Ks0OQdOxYd8, ddIenwrxWgU, qaow2ai3eZM
  // DZ0JTLYiawU: 765 s as yt-dlp rounds it, 155 tiles of 5 s (the owner's report of blurry stills, 2026-11-09).
  for (const [d, n, i] of [[123, 63, 2], [356, 73, 5], [500, 101, 5], [539, 109, 5], [607, 123, 5], [761, 154, 5], [765, 155, 5], [1033, 105, 10], [9155, 917, 10]] as const) {
    expect(storyboardInterval(n / d, d)).toBe(i)
  }
  expect(storyboardInterval(0.25, 100)).toBe(4) // no interval gives the count: yt-dlp's own spacing
})

test('parseTranscript: ~30 s lines with m:ss stamps, blank events dropped', () => {
  const t = parseTranscript(JSON.stringify({ events: [ev(0, 'welcome back'), ev(5, '\n'), ev(12, 'algae tips'), ev(31, 'water  changes'), ev(75, 'light')] }))
  expect(t).toBe('[0:00] welcome back algae tips\n[0:31] water changes\n[1:15] light')
})

const meta = (id: string, over: Partial<VideoMeta> = {}): VideoMeta => ({
  id, title: `Video ${id}`, channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/@MJAquascaping', durationSec: 600, publishedAt: '2023-02-11',
  chapters: [{ start: 0, title: 'Intro' }, { start: 31, title: 'Water changes' }], embeddable: true, captions: true, description: 'Use code MJAQUA', thumb: { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720 }, ...over,
})
const LONG = 'Cây khỏe và mọc nhanh thì rêu hại khó chen vào. '.repeat(6).trim()
const draft = (title: string) => ({ relevant: true, kind: 'plantCare', viTitle: title, summary: ['Thay nước đều.'], body: `<p>Mở đầu.</p><h3>Vì sao rêu mọc</h3><p onclick="x">Ánh sáng.</p><script>x</script><p>${LONG}</p>`, faq: [{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần, khoảng 5 gallon.' }], chapters: ['Mở đầu', 'Thay nước'] })

function deps(root: string, opts: { items?: object; scores?: number[]; videos?: Record<string, Partial<VideoMeta>>; relevant?: boolean; llmFails?: boolean; transcript?: string | null; drafts?: object[] } = {}) {
  const calls = { prompts: [] as string[], transcripts: 0 }
  const scores = [...(opts.scores ?? [0.9])]
  const yt: YouTube = {
    playlist: async id => ({ id, title: 'ALGAE! Everything you need to know!', channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/@MJAquascaping', videos: Object.keys(opts.videos ?? { a1: {} }).map(v => ({ id: v, title: `Video ${v}` })) }),
    video: async id => meta(id, opts.videos?.[id]),
    transcript: async () => { calls.transcripts++; return opts.transcript !== undefined ? opts.transcript : `[0:00] ${'algae grows with too much light. '.repeat(60)}` },
  }
  const llm = async <T,>(a: { prompt: string; schema: object }): Promise<T> => {
    calls.prompts.push(a.prompt)
    if (opts.llmFails) throw new LlmError('usage limit')
    const props = Object.keys((a.schema as { properties: object }).properties)
    if (props.includes('viName')) return { viName: 'Rêu hại: biết để trị', intro: 'Mười bốn video về rêu hại.' } as T
    if (props.includes('score')) return { score: scores.shift() ?? 0.9, notes: ['"Ánh sáng" is vague'] } as T
    if (props.includes('gear')) return (opts.items ?? { taxa: [], gear: [] }) as T
    if (opts.drafts?.length) return opts.drafts.shift() as T
    return (opts.relevant === false ? { ...draft(''), relevant: false } : draft('Cách hạn chế rêu hại trong bể thủy sinh')) as T
  }
  return { calls, d: { yt, llm, root, now: () => new Date('2026-10-29T10:00:00Z'), sleep: async () => {} } }
}

const read = async (root: string, p: string) => JSON.parse(await readFile(join(root, p), 'utf8'))

test('videoGuides writes a sanitised guide with video, series and quality; done videos are not redone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d, calls } = deps(root)
  const r = await videoGuides(d, { playlists: ['PL1'] })
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  const e = await read(root, 'content/guides/youtube-a1/entity.json')
  expect(e).toMatchObject({ source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=a1', kind: 'plantCare', updatedAt: '2026-10-29', video: { youtubeId: 'a1', channel: 'MJ Aquascaping', durationSec: 600, series: { id: 'PL1', position: 0 } } })
  const vi = await read(root, 'content/guides/youtube-a1/vi.json')
  expect(vi.slug).toBe('cach-han-che-reu-hai-trong-be-thuy-sinh')
  expect(vi.body).toBe(`<p>Mở đầu.</p><h3>Vì sao rêu mọc</h3><p>Ánh sáng.</p><p>${LONG}</p>`)
  expect(vi.chapters).toEqual(['Mở đầu', 'Thay nước'])
  expect(vi.faq).toEqual([{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần, khoảng 20 lít.' }])
  expect(vi.quality).toEqual({ score: 0.9, indexable: true, bySource: { youtube: 0.9 } })
  expect(await read(root, 'content/series/PL1.json')).toMatchObject({ playlistId: 'PL1', videoIds: ['a1'], vi: { slug: 'reu-hai-biet-de-tri', name: 'Rêu hại: biết để trị' } })
  expect((await read(root, 'content/changelog.json'))[0]).toMatchObject({ kind: 'guide', id: 'youtube-a1', source: 'youtube', action: 'new' })
  expect(calls.prompts.some(p => p.includes('[0:31] Water changes'))).toBe(true)

  const again = await videoGuides(d, { playlists: ['PL1'] })
  expect(again.written).toEqual([])
  expect(calls.transcripts).toBe(1)
})

test('a low score is rewritten once with the notes, then published unindexed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d, calls } = deps(root, { scores: [0.5, 0.6] })
  await videoGuides(d, { playlists: ['PL1'] })
  expect(calls.prompts.filter(p => p.includes('"Ánh sáng" is vague'))).toHaveLength(1)
  expect((await read(root, 'content/guides/youtube-a1/vi.json')).quality).toEqual({ score: 0.6, indexable: false, bySource: { youtube: 0.6 } })
})

test('skips videos that cannot be embedded, are too short or are not guides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { videos: { a1: { embeddable: false }, a2: { durationSec: 60 } } })
  expect((await videoGuides(d, { playlists: ['PL1'] })).skipped).toEqual(['a1: not embeddable', 'a2: too short'])
  const root2 = await mkdtemp(join(tmpdir(), 'yt-'))
  const r = await videoGuides(deps(root2, { relevant: false }).d, { playlists: ['PL1'] })
  expect(r.skipped).toEqual(['a1: not a guide'])
  expect((await read(root2, 'engine-state/youtube.json')).a1.status).toBe('skipped')
})

test('a video on the rejected list is never made a guide, nor written again by a redo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { videos: { a1: {}, a2: {} } })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_video-rejected.json'), JSON.stringify({ a1: 'harm: tells the reader to suffocate the fish' }))
  expect((await videoGuides(d, { playlists: ['PL1'] })).written).toEqual(['youtube-a2 (0.90)'])
  expect(existsSync(join(root, 'content/guides/youtube-a1'))).toBe(false)
  await writeFile(join(root, 'engine-state/_video-rejected.json'), JSON.stringify({ a2: 'harm: the same' }))
  expect((await videoGuides(d, { playlists: ['PL1'], redo: true })).written).toEqual([])
})

test('no guide on the site is made from a rejected video', async () => {
  const repo = fileURLToPath(new URL('../../..', import.meta.url))
  const rejected = JSON.parse(await readFile(join(repo, 'engine-state/_video-rejected.json'), 'utf8')) as Record<string, string>
  const guides = new Set(await readdir(join(repo, 'content/guides')))
  expect(Object.keys(rejected).filter(id => guides.has(`youtube-${id}`))).toEqual([])
})

test('a model failure stops the run and leaves the video for next time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const r = await videoGuides(deps(root, { llmFails: true }).d, { playlists: ['PL1'] })
  expect(r.stoppedEarly).toBe(true)
  expect(await readFile(join(root, 'engine-state/youtube.json'), 'utf8').catch(() => 'none')).toBe('none')
})

test('captions listed but not downloaded: an error retried after a back-off, not a skip; three in a row stop the run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { transcript: null, videos: { a1: {}, a2: {}, a3: {}, a4: {} } })
  const r = await videoGuides(d, { playlists: ['PL1'] })
  expect(r.stoppedEarly).toBe(true)
  const st = await read(root, 'engine-state/youtube.json')
  expect(Object.keys(st)).toEqual(['a1', 'a2', 'a3'])
  expect(st.a1).toMatchObject({ status: 'error', attempts: 1 })
  const soon = await videoGuides({ ...d, now: () => new Date('2026-10-29T12:00:00Z') }, { playlists: ['PL1'] })
  expect(Object.keys(await read(root, 'engine-state/youtube.json'))).toEqual(['a1', 'a2', 'a3', 'a4']) // only a4 tried; a1–a3 wait 6 h
  expect(soon.errors).toHaveLength(1)
})

test('no English track is a skip; a broken rewrite keeps the first draft', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  expect((await videoGuides(deps(root, { videos: { a1: { captions: false } } }).d, { playlists: ['PL1'] })).skipped).toEqual(['a1: no captions'])
  const root2 = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root2, { scores: [0.6], drafts: [draft('Bản đầu'), { ...draft(''), body: '' }] }).d, { playlists: ['PL1'] })
  expect((await read(root2, 'content/guides/youtube-a1/vi.json'))).toMatchObject({ name: 'Bản đầu', quality: { score: 0.6, indexable: false } })
})

test('a low score gets one edit of that draft, from the transcript and the notes, not a fresh draft', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const first = { ...draft('Bản đầu'), faq: [{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần.' }, { q: 'Câu video không trả lời?', a: 'Bịa.' }] }
  const fixed = { ...draft('Bản đã sửa'), kind: 'care', faq: [{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần.' }] }
  const { d, calls } = deps(root, { scores: [0.6, 0.8], drafts: [first, fixed] })
  await videoGuides(d, { playlists: ['PL1'] })
  const writer = calls.prompts.filter(p => p.includes('Bản ghi:'))
  expect(writer).toHaveLength(2)
  const edit = writer[1]!
  expect(edit).toContain('algae grows with too much light') // the transcript, to check the draft against
  expect(edit).toContain('"viTitle":"Bản đầu"') // the draft itself
  expect(edit).toContain('- "Ánh sáng" is vague') // what to fix in it
  expect(edit).not.toContain('Tiêu đề video') // not the writer's brief: nothing to write afresh from
  // The edit may drop an invented FAQ question; what kind of guide it is stays the first draft's.
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Bản đã sửa', faq: [{ q: 'Bao lâu thay nước?' }], quality: { score: 0.8 } })
  expect((await read(root, 'content/guides/youtube-a1/entity.json')).kind).toBe('plantCare')
})

test('an edit that is broken, not a guide or loses chapters keeps the first draft and its score, or its chapter names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root, { scores: [0.6], drafts: [draft('Bản đầu'), { ...draft('Bản sửa'), relevant: false }] }).d, { playlists: ['PL1'] })
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Bản đầu', quality: { score: 0.6, indexable: false } })
  const root2 = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root2, { scores: [0.6, 0.7], drafts: [draft('Bản đầu'), { ...draft('Bản sửa'), chapters: ['Mở đầu'] }] }).d, { playlists: ['PL1'] })
  expect(await read(root2, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Bản sửa', chapters: ['Mở đầu', 'Thay nước'], quality: { score: 0.7 } })
})

test('a guide that still names the creator or the video gets one editor pass; the writer is not given the channel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const named = { ...draft('Bản đầu'), body: `<p>Bể được set trong video chỉ dùng cây in vitro.</p><p>${LONG}</p>` }
  const { d, calls } = deps(root, { drafts: [named, draft('Bản sửa')] })
  await videoGuides(d, { playlists: ['PL1'] })
  const vi = await read(root, 'content/guides/youtube-a1/vi.json')
  expect(vi.name).toBe('Bản sửa')
  expect(vi.body).not.toContain('trong video')
  expect(calls.prompts.filter(p => p.includes('Bài cần biên tập'))).toHaveLength(1)
  expect(calls.prompts.find(p => p.includes('Bản ghi:'))).not.toContain('Kênh:')
  expect(calls.prompts.find(p => p.includes('TRANSCRIPT:'))).toContain('must not name')

  // A clean guide is not edited.
  const clean = deps(await mkdtemp(join(tmpdir(), 'yt-')))
  await videoGuides(clean.d, { playlists: ['PL1'] })
  expect(clean.calls.prompts.filter(p => p.includes('Bài cần biên tập'))).toEqual([])
})

test('the reviewer gets each sentence that speaks for many people or ranks something, to hold against the transcript', async () => {
  const d = { viTitle: 'Trồng ráy', summary: ['Ráy là cây dễ nhất cho người mới.'], body: '<p>Nhiều người chơi luôn cắt bớt rễ trước khi trồng. Lá vàng thì tỉa đi.</p><ul><li>Ai cũng dùng keo 502.</li></ul>', faq: [{ q: 'Có cần phân nước không?', a: 'Không cần.' }] }
  expect(crowdLines(d)).toEqual(['Ráy là cây dễ nhất cho người mới.', 'Nhiều người chơi luôn cắt bớt rễ trước khi trồng.', 'Ai cũng dùng keo 502.'])
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 0.9, notes: [] } as T }
  await reviewDraft(llm, 'I always trim the roots.', d)
  expect(prompts[0]).toContain('CHECK THESE SENTENCES')
  expect(prompts[0]).toContain('- Nhiều người chơi luôn cắt bớt rễ trước khi trồng.')
  expect(prompts[0]).not.toContain('- Lá vàng thì tỉa đi.')
  await reviewDraft(llm, 'I trim yellow leaves.', { ...d, summary: [], body: '<p>Lá vàng thì tỉa đi.</p>' })
  expect(prompts[1]).not.toContain('CHECK THESE SENTENCES')
  // What a mender's editor was told reaches the reviewer only for a mended guide (video-mend.ts).
  expect(prompts[1]).not.toContain('edited for readers in Vietnam')
  await reviewDraft(llm, 'I trim yellow leaves.', d, undefined, 'This guide was edited for readers in Vietnam.')
  expect(prompts[2]).toContain('This guide was edited for readers in Vietnam.\n\nTRANSCRIPT:')
})

test('every review of a guide is kept: the first draft\'s and the rewrite\'s, with the one on the page marked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root, { scores: [0.6, 0.8], drafts: [draft('Bản đầu'), draft('Bản sửa')] }).d, { playlists: ['PL1'] })
  expect((await read(root, 'content/guides/youtube-a1/vi.json'))).toMatchObject({ name: 'Bản sửa', quality: { score: 0.8 } })
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-a1']).toEqual([
    { at: '2026-10-29T10:00:00Z', model: 'sonnet', score: 0.8, notes: ['"Ánh sáng" is vague'], attempt: 'rewrite', kept: true },
    { at: '2026-10-29T10:00:00Z', model: 'sonnet', score: 0.6, notes: ['"Ánh sáng" is vague'], attempt: 'first', kept: false },
  ])
})

test('--redo tells the writer what the last review of the guide on the site found, when it was under the bar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root, { scores: [0.6, 0.6] }).d, { playlists: ['PL1'] })
  // The guide on the site scored 0.6 (its rewrite kept); a later recheck found what is wrong with it.
  const found = { score: 0.62, notes: ['Says CO2 is optional; the transcript says it is needed for carpeting plants'] }
  await logReviews(root, 'video-guide', { id: 'guides/youtube-a1', lang: 'vi' }, [found], found, { now: new Date('2026-11-01T00:00:00Z'), recheck: true })
  const again = deps(root)
  await videoGuides(again.d, { playlists: ['PL1'], redo: true })
  const writer = again.calls.prompts.find(p => p.includes('Bản ghi:'))!
  expect(writer).toContain('Bản trước bị người duyệt chấm thấp')
  expect(writer).toContain('- Says CO2 is optional; the transcript says it is needed for carpeting plants')

  // Its last review passed (0.9 now): the next redo writes from the transcript alone.
  const third = deps(root)
  await videoGuides(third.d, { playlists: ['PL1'], redo: true })
  expect(third.calls.prompts.find(p => p.includes('Bản ghi:'))).not.toContain('Bản trước bị người duyệt chấm thấp')
})

test('redo rewrites each written guide once, in the series it is in, even after a failed later attempt; other playlists get no series', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  // A later attempt failed (e.g. throttled): the guide is still on the site.
  const state = join(root, 'engine-state/youtube.json')
  await writeFile(state, JSON.stringify({ a1: { status: 'error', entityIds: [], attempts: 1, updatedAt: '2026-10-29T00:00:00Z' } }))
  // a1 is in PL2 too.
  const again = deps(root)
  const r = await videoGuides(again.d, { playlists: ['PL2', 'PL1'], redo: true })
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect(await read(root, 'content/guides/youtube-a1/entity.json')).toMatchObject({ video: { series: { id: 'PL1', position: 0 } } })
  expect(await readFile(join(root, 'content/series/PL2.json'), 'utf8').catch(() => 'none')).toBe('none')
})

test('--only limits a run to the videos named', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root, { videos: { a1: {}, a2: {} } }).d, { playlists: ['PL1'] })
  const r = await videoGuides(deps(root, { videos: { a1: {}, a2: {} } }).d, { playlists: ['PL1'], redo: true, only: ['a2'] })
  expect(r.written).toEqual(['youtube-a2 (0.90)'])
})

const SINCE = '2026-11-07T12:00:00Z'
const recheck = (root: string, vid: string, score: number, notes: string[], at = '2026-11-07T13:00:00Z', reads?: number[]) => { const r = { score, notes, ...(reads ? { reads } : {}) }; return logReviews(root, 'video-guide', { id: `guides/youtube-${vid}`, lang: 'vi' }, [r], r, { now: new Date(at), recheck: true }) }
/** The redo runs after the rechecks. */
const later = (root: string, o: Parameters<typeof deps>[1] = {}) => { const x = deps(root, o); return { ...x, d: { ...x.d, now: () => new Date('2026-11-08T00:00:00Z') } } }

test('a redo after a recheck: the guides it left under the bar with notes, the owner\'s first, then the lowest, --limit a run, each once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const videos = { a1: {}, a2: {}, a3: {}, a4: {}, a5: {}, a6: {} }
  await videoGuides(deps(root, { videos }).d, { playlists: ['PL1'] })
  await recheck(root, 'a1', 0.6, ['Says many people do it; the speaker says only he does'])
  await recheck(root, 'a2', 0.9, ['A small slip']) // above the bar
  await recheck(root, 'a3', 0.6, []) // nothing for the writer to go on
  await recheck(root, 'a4', 0.5, ['Adds a dose the video never gives'], '2026-11-07T11:00:00Z') // before the cutoff
  await recheck(root, 'a5', 0.5, ['Adds a step the video never gives'], undefined, [0.5, 0.45, 0.6])
  // In search, failed at 0.55 or under on one read: it waits for its two more reads (review-backfill-97) before a redo.
  await recheck(root, 'a6', 0.5, ['Adds a price the video never gives'])
  await writeFile(join(root, 'engine-state/youtube-videos.json'), JSON.stringify([{ id: 'a1', by: 'owner' }]))
  expect(await lowVideoGuides(root)).toEqual(['youtube-a4', 'youtube-a6'])
  expect(await recheckedGuides(root, SINCE)).toEqual([{ id: 'a1', series: 'PL1' }, { id: 'a5', series: 'PL1' }])

  const first = later(root, { videos })
  expect((await videoGuides(first.d, { redo: true, rechecked: SINCE, limit: 1 })).written).toEqual(['youtube-a1 (0.90)'])
  expect(first.calls.prompts.find(p => p.includes('Bản ghi:'))).toContain('- Says many people do it; the speaker says only he does')
  // Still under the bar after its redo: its own review counts now, and it is left alone.
  const second = later(root, { videos, scores: [0.6, 0.6] })
  expect((await videoGuides(second.d, { redo: true, rechecked: SINCE, limit: 1 })).written).toEqual(['youtube-a5 (0.60)'])
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-a5']![0]).toMatchObject({ attempt: 'rewrite', kept: true, at: '2026-11-08T00:00:00Z' })

  // None left: no playlist fetched, no transcript, no model call.
  const third = later(root, { videos })
  let fetched = 0
  const yt: YouTube = { ...third.d.yt, playlist: async id => { fetched++; return third.d.yt.playlist(id) } }
  expect(await videoGuides({ ...third.d, yt }, { redo: true, rechecked: SINCE, limit: 5 })).toMatchObject({ written: [], skipped: [], errors: [] })
  expect([fetched, third.calls.transcripts, third.calls.prompts.length]).toEqual([0, 0, 0])
})

test('a redo that scores under the recheck of the guide on the site keeps the guide, and isn\'t tried again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const videos = { a1: {} }
  await videoGuides(deps(root, { videos }).d, { playlists: ['PL1'] })
  const was = await readFile(join(root, 'content/guides/youtube-a1/vi.json'), 'utf8')
  await recheck(root, 'a1', 0.7, ['Says many people do it; the speaker says only he does'])
  const worse = later(root, { videos, scores: [0.6, 0.65], drafts: [draft('Bản mới'), draft('Bản sửa')] })
  expect(await videoGuides(worse.d, { redo: true, rechecked: SINCE, limit: 1 })).toMatchObject({ written: [], skipped: ['a1: the new version scored 0.65, under the guide\'s 0.70: kept the guide'] })
  expect(await readFile(join(root, 'content/guides/youtube-a1/vi.json'), 'utf8')).toBe(was)
  const traces = (await readReviews(root, 'video-guide'))['vi/guides/youtube-a1']!
  expect(traces.slice(0, 3).map(t => [t.attempt, t.kept])).toEqual([['rewrite', false], ['first', false], ['recheck', true]])
  expect(await recheckedGuides(root, SINCE)).toEqual([])
})

test('a redo after a recheck that is skipped leaves the guide alone; a model failure leaves it for the next run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  await recheck(root, 'a1', 0.6, ['Ranks it "the best"; the speaker never does'])
  expect((await videoGuides(later(root, { llmFails: true }).d, { redo: true, rechecked: SINCE })).stoppedEarly).toBe(true)
  expect(await recheckedGuides(root, SINCE)).toEqual([{ id: 'a1', series: 'PL1' }])
  expect((await videoGuides(later(root, { relevant: false }).d, { redo: true, rechecked: SINCE })).skipped).toEqual(['a1: not a guide'])
  // No new review, but the video's state says it was tried after the recheck.
  expect(await recheckedGuides(root, SINCE)).toEqual([])
  expect((await read(root, 'content/guides/youtube-a1/vi.json')).quality.score).toBe(0.9)
})

test('a redo after a recheck writes `parallel` guides at once, in the rank given; the state and the changelog keep every one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const videos = { a1: {}, a2: {}, a3: {}, a4: {} }
  await videoGuides(deps(root, { videos }).d, { playlists: ['PL1'] })
  for (const v of Object.keys(videos)) await recheck(root, v, 0.6, ['Adds a step the video never gives'])
  expect((await recheckedGuides(root, SINCE, id => [id === 'youtube-a3' ? 0 : 1])).map(g => g.id)).toEqual(['a3', 'a1', 'a2', 'a4'])
  // A model failure starts no more, and marks none tried.
  const down = later(root, { videos, llmFails: true })
  expect((await videoGuides(down.d, { redo: true, rechecked: SINCE, parallel: 2 })).stoppedEarly).toBe(true)
  expect(down.calls.prompts).toHaveLength(2)
  expect(await recheckedGuides(root, SINCE)).toHaveLength(4)

  const x = later(root, { videos })
  let busy = 0
  let peak = 0
  const llm = async <T,>(a: { prompt: string; schema: object }): Promise<T> => { peak = Math.max(peak, ++busy); await new Promise(r => setTimeout(r, 5)); busy--; return x.d.llm<T>(a) }
  const r = await videoGuides({ ...x.d, llm }, { redo: true, rechecked: SINCE, limit: 4, parallel: 2 })
  expect(r.written.sort()).toEqual(['a1', 'a2', 'a3', 'a4'].map(v => `youtube-${v} (0.90)`))
  expect(peak).toBe(2)
  expect(Object.values(await read(root, 'engine-state/youtube.json')).map(s => (s as { updatedAt: string }).updatedAt)).toEqual(Array(4).fill('2026-11-08T00:00:00.000Z'))
  expect((await read(root, 'content/changelog.json') as { id: string; action: string }[]).filter(e => e.action === 'updated').map(e => e.id).sort()).toEqual(['a1', 'a2', 'a3', 'a4'].map(v => `youtube-${v}`))
  expect(await recheckedGuides(root, SINCE)).toEqual([])
})

test('a guide held out of the chat stays held when its redo is still under the bar, and goes back in when it passes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const videos = { a1: {}, a2: {} }
  await videoGuides(deps(root, { videos }).d, { playlists: ['PL1'] })
  for (const v of ['a1', 'a2']) {
    const file = join(root, `content/guides/youtube-${v}/vi.json`)
    const vi = await read(root, `content/guides/youtube-${v}/vi.json`)
    await writeFile(file, JSON.stringify({ ...vi, quality: { ...vi.quality, chat: false } }))
    await recheck(root, v, 0.6, ['Says "nhiều người" for one creator\'s habit'])
  }
  // a1's new version scores 0.6, then 0.6 after its edit; a2's 0.9.
  await videoGuides(later(root, { videos, scores: [0.6, 0.6] }).d, { redo: true, rechecked: SINCE, limit: 1 })
  await videoGuides(later(root, { videos }).d, { redo: true, rechecked: SINCE, limit: 1 })
  expect((await read(root, 'content/guides/youtube-a1/vi.json')).quality).toEqual({ score: 0.6, indexable: false, bySource: { youtube: 0.6 }, chat: false })
  expect((await read(root, 'content/guides/youtube-a2/vi.json')).quality).toEqual({ score: 0.9, indexable: true, bySource: { youtube: 0.9 } })
})

test('redo rewrites only guides already written: a video not done yet waits for an ordinary run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  const again = deps(root, { videos: { a1: {}, a2: {} } })
  const r = await videoGuides(again.d, { playlists: ['PL1'], redo: true })
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect(again.calls.transcripts).toBe(1)
  expect(await read(root, 'content/guides/youtube-a1/entity.json')).toMatchObject({ video: { series: { id: 'PL1', position: 0 } } })
})

// The summary is the body's in short, so it stays with a body fixed by hand: a new draft's, from the transcript, would bring
// back the line the fix took out (the stand-tap-water guide's "chỉ phí tiền", the independent read of 2026-11-12).
test('redo keeps a body fixed by hand and its summary; the rest of the guide is the new version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  const file = join(root, 'content/guides/youtube-a1/vi.json')
  await writeFile(file, JSON.stringify({ ...(await read(root, 'content/guides/youtube-a1/vi.json')), body: '<p>người sửa</p>', summary: ['Tóm tắt người sửa.'], bodyFixed: true }))
  await videoGuides(deps(root, { drafts: [draft('Tiêu đề mới')] }).d, { playlists: ['PL1'], redo: true, write: { style: true, model: 'opus' } })
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Tiêu đề mới', body: '<p>người sửa</p>', summary: ['Tóm tắt người sửa.'], bodyFixed: true, faq: [{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần, khoảng 20 lít.' }] })
})

// Two guides from one channel had one title (the owner's "Duplicated", 2026-11-11); the titles picked by hand stay.
test('redo keeps a title picked by hand', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  const file = join(root, 'content/guides/youtube-a1/vi.json')
  await writeFile(file, JSON.stringify({ ...(await read(root, 'content/guides/youtube-a1/vi.json')), name: 'Tiêu đề người chọn', nameFixed: true }))
  await videoGuides(deps(root, { drafts: [draft('Tiêu đề mới')] }).d, { playlists: ['PL1'], redo: true })
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Tiêu đề người chọn', nameFixed: true })
})

// A fix made by hand in the FAQ as well as the body (2026-11-10: "nitrat" for the video's nitrite, in both): a new draft's
// questions would bring the old line back.
test('redo keeps a FAQ fixed by hand', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await videoGuides(deps(root).d, { playlists: ['PL1'] })
  const file = join(root, 'content/guides/youtube-a1/vi.json')
  const faq = [{ q: 'Nước còn độc không?', a: 'người sửa' }]
  await writeFile(file, JSON.stringify({ ...(await read(root, 'content/guides/youtube-a1/vi.json')), body: '<p>người sửa</p>', bodyFixed: true, faq, faqFixed: true }))
  await videoGuides(deps(root, { drafts: [draft('Tiêu đề mới')] }).d, { playlists: ['PL1'], redo: true })
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Tiêu đề mới', body: '<p>người sửa</p>', bodyFixed: true, faq, faqFixed: true })
})

// The video jobs go videos, sweep, gate, with no rounding step between (engine-cycle.sh has one: `pnpm engine metric`).
// So a draft's "bể 10 gallon" reached the gate as "bể 38 lít", which its units rule finds, and the new text was put back:
// units was among the reasons for 26 of the 84 guides put back in the recheck job's runs of 8 to 10 Nov 2026.
test('a volume a gallon conversion gives is rounded where the guide is written, so the gate finds no unit to put it back for', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const d = { ...draft('Bể cho cá mới'), summary: ['Một bể 10 gallon là đủ.'], body: `<p>Bể 20 gallon dễ giữ ổn định hơn bể 10 gallon.</p><p>${LONG}</p>`, faq: [{ q: 'Bể bao lớn?', a: 'Từ 10 gallon trở lên.' }] }
  await videoGuides(deps(root, { drafts: [d] }).d, { playlists: ['PL1'] })
  const vi = await read(root, 'content/guides/youtube-a1/vi.json')
  expect(vi.summary).toEqual(['Một bể 40 lít là đủ.'])
  expect(vi.body).toContain('Bể 80 lít dễ giữ ổn định hơn bể 40 lít.')
  expect(vi.faq[0].a).toBe('Từ 40 lít trở lên.')
  const page: Page = { lang: 'vi', kind: 'guides', id: 'youtube-a1', title: vi.name, path: `/vi/huong-dan/${vi.slug}/`, fields: [{ field: 'body', html: vi.body }], lines: [{ field: 'summary.0', text: vi.summary[0] }, { field: 'faq.0.a', text: vi.faq[0].a }], captions: [], latinNames: [], card: [] }
  expect(fitRules(page).filter(f => f.check === 'units')).toEqual([])
  // What the gate found before: the same page with the figures as the writer converts them.
  expect(fitRules({ ...page, fields: [{ field: 'body', html: '<p>Bể 76 lít dễ giữ ổn định hơn bể 38 lít.</p>' }] }).filter(f => f.check === 'units').length).toBeGreaterThan(0)
})

test('redo rewrites a written guide with the same slug and cover; the reviewer is told the channel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const first = deps(root)
  await videoGuides(first.d, { playlists: ['PL1'] })
  const file = join(root, 'content/guides/youtube-a1/vi.json')
  const localNote = { html: '<h3>Ở Việt Nam</h3><p>x</p>', refs: [{ url: 'https://a.test/', title: 'A' }] }
  await writeFile(file, JSON.stringify({ ...(await read(root, 'content/guides/youtube-a1/vi.json')), cover: 'Bí quyết trị rêu hại', localNote }))
  const again = deps(root, { drafts: [draft('Tiêu đề mới')] })
  const r = await videoGuides(again.d, { playlists: ['PL1'], redo: true, write: { style: true, model: 'opus' } })
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Tiêu đề mới', slug: 'cach-han-che-reu-hai-trong-be-thuy-sinh', cover: 'Bí quyết trị rêu hại' })
  expect((await read(root, 'content/guides/youtube-a1/vi.json')).localNote).toEqual(localNote) // a note for local readers isn't the video's: a redo keeps it
  expect(again.calls.prompts.find(p => p.includes('TRANSCRIPT:'))).toContain('by MJ Aquascaping')
  expect(again.calls.prompts.some(p => p.includes('Giọng văn'))).toBe(true) // style guide in the writer's prompt
})

test("a video nobody outside a channel's members can watch is skipped for good and doesn't stop the run", async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { videos: { m1: {}, m2: {}, m3: {}, a1: {} } })
  const transcript = d.yt.transcript
  d.yt.transcript = async (id, lang) => {
    if (id.startsWith('m')) throw new Error(`yt-dlp: ERROR: [youtube] ${id}: This video is available to this channel's members on level: Cây Đẹp - Nước Trong (or any higher level). Join this channel to get access to members-only content and other exclusive perks.`)
    return transcript(id, lang)
  }
  const r = await videoGuides(d, { playlists: ['PL1'] })
  expect(r.stoppedEarly).toBe(false)
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect(r.skipped).toEqual(['m1: members only', 'm2: members only', 'm3: members only'])
  expect((await read(root, 'engine-state/youtube.json')).m1).toMatchObject({ status: 'skipped', error: 'members only' })
})

test('YouTube throttling stops the run without marking any video failed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { videos: { a1: {}, a2: {} } })
  d.yt.transcript = async () => { throw new Error("yt-dlp: ERROR: [youtube] a1: Sign in to confirm you’re not a bot.") }
  const r = await videoGuides(d, { playlists: ['PL1'] })
  expect(r).toMatchObject({ stoppedEarly: true, errors: ['YouTube is throttling (a1): stopped, nothing marked failed'] })
  expect(await readFile(join(root, 'engine-state/youtube.json'), 'utf8').catch(() => 'none')).toBe('none')
})

test('a video without any captions is written from our own transcript of its audio, and marked so', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root, { videos: { a1: { captions: false } } })
  let asked = ''
  d.yt.transcribe = async id => { asked = id; return `[0:00] ${'cyanobacteria grows in low flow. '.repeat(60)}` }
  const r = await videoGuides(d, { playlists: ['PL1'] })
  expect(asked).toBe('a1')
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect((await read(root, 'content/guides/youtube-a1/entity.json')).video.transcribed).toBe(true)
  const root2 = await mkdtemp(join(tmpdir(), 'yt-'))
  const two = deps(root2, { videos: { a1: { captions: false, lang: 'de' } } })
  two.d.yt.transcribe = async () => { throw new Error('not for non-English videos') }
  expect((await videoGuides(two.d, { playlists: ['PL1'] })).skipped).toEqual(['a1: spoken in de'])
})

test('single videos are written after playlists, without a series', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d } = deps(root)
  const r = await videoGuides(d, { playlists: [], singles: ['s1'] })
  expect(r.written).toEqual(['youtube-s1 (0.90)'])
  expect((await read(root, 'content/guides/youtube-s1/entity.json')).video.series).toBeUndefined()
})

test('a Vietnamese video: Vietnamese captions, a no-copying rule for the writer, reviewer and editor, lang kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d, calls } = deps(root, { videos: { a1: { lang: 'vi' } }, scores: [0.6, 0.8] })
  const langs: (string | undefined)[] = []
  const orig = d.yt.transcript
  d.yt.transcript = async (id, lang) => { langs.push(lang); return orig(id) }
  await videoGuides(d, { playlists: ['PL1'] })
  expect(langs).toEqual(['vi'])
  expect(calls.prompts.some(p => p.includes('Ngôn ngữ video: tiếng Việt') && p.includes('không chép lại câu nói'))).toBe(true)
  expect(calls.prompts.some(p => p.includes('spoken in vi') && p.includes('copied from it'))).toBe(true)
  expect(calls.prompts.find(p => p.includes('Bài cần sửa'))).toContain('không chép lại câu nói')
  expect((await read(root, 'content/guides/youtube-a1/entity.json')).video.lang).toBe('vi')
})

test("the video's species and kit are listed, cleaned up; species we have pages for are linked", async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  await mkdir(join(root, 'content/species/neocaridina-davidi'), { recursive: true })
  await mkdir(join(root, 'content/equipment'), { recursive: true })
  await writeFile(join(root, 'content/equipment/co2.json'), JSON.stringify({ category: 'co2', name: 'CO2', types: [{ id: 'binh', name: 'Bộ CO2 bình nạp' }] }))
  const items = {
    taxa: ['Neocaridina davidi', 'Monte Carlo', 'Rotala rotundifolia', 'Neocaridina davidi'],
    gear: [
      { category: 'co2', type: 'binh', brand: 'Chihiros', model: 'Diffuser S', t: 95.4 },
      { category: 'co2', type: 'binh', brand: 'chihiros', model: 'diffuser s', t: 300 }, // the same product again
      { category: 'phan-nuoc', type: 'x', brand: 'Seachem', model: 'Flourish' }, // unknown category: "khac", type dropped
      { category: 'khac' }, // nothing to show
      { category: 'co2', type: 'nope' }, // generic kit of an unknown type: kept as the category
    ],
  }
  const { d, calls } = deps(root, { items })
  await videoGuides(d, { playlists: ['PL1'] })
  const e = await read(root, 'content/guides/youtube-a1/entity.json')
  expect(e.mentions).toEqual(['neocaridina-davidi'])
  expect(e.video.taxa).toEqual(['Neocaridina davidi', 'Rotala rotundifolia'])
  expect(e.video.gear).toEqual([{ category: 'co2', type: 'binh', brand: 'Chihiros', model: 'Diffuser S', t: 95 }, { category: 'khac', brand: 'Seachem', model: 'Flourish' }, { category: 'co2' }])
  expect(calls.prompts.some(p => p.includes('- co2: CO2; binh=Bộ CO2 bình nạp'))).toBe(true)
})

test('API metadata leaves captions unknown: captions are asked for, else our own transcript, else a skip (not an error)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d, calls } = deps(root, { videos: { a1: { captions: undefined } }, transcript: null })
  d.yt.transcribe = async () => `[0:00] ${'cyanobacteria grows in low flow. '.repeat(60)}`
  expect((await videoGuides(d, { playlists: ['PL1'] })).written).toEqual(['youtube-a1 (0.90)'])
  expect(calls.transcripts).toBe(1)
  expect((await read(root, 'content/guides/youtube-a1/entity.json')).video.transcribed).toBe(true)
  const root2 = await mkdtemp(join(tmpdir(), 'yt-'))
  const two = deps(root2, { videos: { a1: { captions: undefined } }, transcript: null })
  two.d.yt.transcribe = async () => null // Whisper not on this machine
  const r = await videoGuides(two.d, { playlists: ['PL1'] })
  expect(r.skipped).toEqual(['a1: no captions; transcription unavailable'])
  expect(r.errors).toEqual([])
})

test('ytApi: playlist pages and video details from the Data API, with the key; private and deleted entries dropped', async () => {
  const asked: string[] = []
  const get = async (u: string) => {
    asked.push(u)
    const q = new URL(u).searchParams
    expect(q.get('key')).toBe('K')
    if (u.includes('/playlists?')) return { items: [{ snippet: { title: 'Algae', channelTitle: 'MJ Aquascaping', channelId: 'UC1' } }] }
    if (u.includes('/playlistItems?')) return q.get('pageToken')
      ? { items: [{ snippet: { title: 'Deleted video', resourceId: { videoId: 'x' } } }, { snippet: { title: 'Part 2', resourceId: { videoId: 'b2' } } }] }
      : { items: [{ snippet: { title: 'Part 1', resourceId: { videoId: 'a1' } } }, { snippet: { title: 'Private video', resourceId: { videoId: 'y' } } }], nextPageToken: 'P2' }
    return { items: [{ snippet: { title: 'Part 1', channelTitle: 'MJ Aquascaping', channelId: 'UC1', publishedAt: '2023-02-11T10:00:00Z', description: '0:00 Intro\n1:05 Why algae\n12:30 Fixes', defaultAudioLanguage: 'en-GB', thumbnails: { high: { url: 'https://i.ytimg.com/vi/a1/hqdefault.jpg', width: 480, height: 360 } } }, contentDetails: { duration: 'PT14M5S' }, status: { embeddable: true, privacyStatus: 'public' } }] }
  }
  const yt = ytApi('K', get)
  expect(await yt.playlist('PL1')).toEqual({ id: 'PL1', title: 'Algae', channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/channel/UC1', videos: [{ id: 'a1', title: 'Part 1' }, { id: 'b2', title: 'Part 2' }] })
  const m = await yt.video('a1')
  expect(m).toMatchObject({ durationSec: 845, publishedAt: '2023-02-11', lang: 'en', embeddable: true, chapters: [{ start: 0, title: 'Intro' }, { start: 65, title: 'Why algae' }, { start: 750, title: 'Fixes' }], thumb: { width: 480 } })
  expect(m.captions).toBeUndefined()
  expect(asked).toHaveLength(4)
})

test('chapters: only when the description lists at least three, from 0:00, in order', () => {
  expect(chaptersFrom('1:00 a\n2:00 b\n3:00 c')).toEqual([])
  expect(chaptersFrom('0:00 a\n2:00 b')).toEqual([])
  expect(chaptersFrom('Intro text\n0:00 - Start\n1:02:03 End part\n59:00 back')).toEqual([])
  expect(chaptersFrom('0:00 - Start\n10:00 | Middle\n1:02:03 End')).toEqual([{ start: 0, title: 'Start' }, { start: 600, title: 'Middle' }, { start: 3723, title: 'End' }])
})

test('last item cost refuses admission without calls or content writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-admission-'))
  const { d, calls } = deps(root)
  await denied('videos', root, async () => {
    const r = await videoGuides(d, { playlists: [], singles: ['a1'] })
    expect(r.stoppedEarly).toBe(true)
    expect(r.written).toEqual([])
    expect(r.errors).toEqual([])
    expect(r.stopped).toContain('not started')
    expect(calls.prompts).toEqual([])
  })
})

test('videos follow-up pictures stop on admission or usage, but can follow the writing limit', () => {
  const r = { written: [], skipped: [], errors: [], stoppedEarly: true }
  expect(videoBudgetStopped(r)).toBe(false)
  expect(videoBudgetStopped({ ...r, stopped: 'not started' })).toBe(true)
  expect(videoBudgetStopped({ ...r, errors: ["claude failed: the engine's daily limit reached for videos"] })).toBe(true)
})

// Astra's read of 14 Nov 2026: the editor a guide's slip goes to kept every idea, a story of the day too, which the writer,
// its reviewer and the mender drop (the Writing Lead, 14 Nov 2026).
test('the editor of a guide that names its video drops a story of the day, and writes the video\'s tank as an example', async () => {
  const prompts: string[] = []
  const llm = (async (a: { prompt: string }) => { prompts.push(a.prompt); return {} }) as never
  const d = { relevant: true, kind: 'howto', title: 'T', summary: ['a'], body: '<p>Trong video, hôm đó làm đến tối.</p>', faq: [], chapters: [] }
  await editDraft(llm, d as never)
  expect(prompts[0]).toContain('câu chỉ kể chuyện hôm làm ("Hôm đó làm đến tối") thì bỏ')
  expect(prompts[0]).toContain('viết thành một ví dụ tự nói rõ cỡ bể ("Ví dụ, một bể dài 45 cm…")')
  expect(prompts[0]).not.toContain('thì viết lại thành lời nói thẳng')
})
