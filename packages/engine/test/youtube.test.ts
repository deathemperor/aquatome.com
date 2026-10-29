import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { parseTranscript, videoGuides, type VideoMeta, type YouTube } from '../src/youtube'

const ev = (s: number, text: string) => ({ tStartMs: s * 1000, segs: [{ utf8: text }] })

test('parseTranscript: ~30 s lines with m:ss stamps, blank events dropped', () => {
  const t = parseTranscript(JSON.stringify({ events: [ev(0, 'welcome back'), ev(5, '\n'), ev(12, 'algae tips'), ev(31, 'water  changes'), ev(75, 'light')] }))
  expect(t).toBe('[0:00] welcome back algae tips\n[0:31] water changes\n[1:15] light')
})

const meta = (id: string, over: Partial<VideoMeta> = {}): VideoMeta => ({
  id, title: `Video ${id}`, channel: 'MJ Aquascaping', channelUrl: 'https://www.youtube.com/@MJAquascaping', durationSec: 600, publishedAt: '2023-02-11',
  chapters: [{ start: 0, title: 'Intro' }, { start: 31, title: 'Water changes' }], embeddable: true, captions: true, description: 'Use code MJAQUA', thumb: { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720 }, ...over,
})
const LONG = 'Cây khỏe và mọc nhanh thì rêu hại khó chen vào. '.repeat(6).trim()
const draft = (title: string) => ({ relevant: true, kind: 'plantCare', viTitle: title, summary: ['Thay nước đều.'], body: `<p>Mở đầu.</p><h3>Vì sao rêu mọc</h3><p onclick="x">Ánh sáng.</p><script>x</script><p>${LONG}</p>`, faq: [{ q: 'Bao lâu thay nước?', a: 'Mỗi tuần.' }], chapters: ['Mở đầu', 'Thay nước'] })

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

test('redo rewrites a written guide with the same slug and cover; the reviewer is told the channel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const first = deps(root)
  await videoGuides(first.d, { playlists: ['PL1'] })
  const file = join(root, 'content/guides/youtube-a1/vi.json')
  await writeFile(file, JSON.stringify({ ...(await read(root, 'content/guides/youtube-a1/vi.json')), cover: 'Bí quyết trị rêu hại' }))
  const again = deps(root, { drafts: [draft('Tiêu đề mới')] })
  const r = await videoGuides(again.d, { playlists: ['PL1'], redo: true, write: { style: true, model: 'opus' } })
  expect(r.written).toEqual(['youtube-a1 (0.90)'])
  expect(await read(root, 'content/guides/youtube-a1/vi.json')).toMatchObject({ name: 'Tiêu đề mới', slug: 'cach-han-che-reu-hai-trong-be-thuy-sinh', cover: 'Bí quyết trị rêu hại' })
  expect(again.calls.prompts.find(p => p.includes('TRANSCRIPT:'))).toContain('by MJ Aquascaping')
  expect(again.calls.prompts.some(p => p.includes('Giọng văn'))).toBe(true) // style guide in the writer's prompt
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

test('a Vietnamese video: Vietnamese captions, a no-copying rule for the writer and reviewer, lang kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yt-'))
  const { d, calls } = deps(root, { videos: { a1: { lang: 'vi' } } })
  const langs: (string | undefined)[] = []
  const orig = d.yt.transcript
  d.yt.transcript = async (id, lang) => { langs.push(lang); return orig(id) }
  await videoGuides(d, { playlists: ['PL1'] })
  expect(langs).toEqual(['vi'])
  expect(calls.prompts.some(p => p.includes('Ngôn ngữ video: tiếng Việt') && p.includes('không chép lại câu nói'))).toBe(true)
  expect(calls.prompts.some(p => p.includes('spoken in vi') && p.includes('copied from it'))).toBe(true)
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
