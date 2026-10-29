import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { GuideSchema, QUALITY_THRESHOLD, SeriesSchema, TranslationSchema, type GuideEntity, type Series, type Translation } from '@aq/schema'
import { appendChangelog } from './changelog'
import { LlmError, type Llm } from './claude'
import { pickSlug } from './merge'
import { gate } from './quality'
import { sanitizeHtml } from './sanitize'
import { loadState, saveState, type UrlState } from './state'
import type { Finder } from './video-discovery'
import type { Storyboard } from './video-images'

/** YouTube is rate-limiting or bot-checking this machine: stop everything and try again next cycle; no video is at fault. */
export const throttled = (e: unknown) => /HTTP Error 429|Too Many Requests|confirm you.re not a bot/i.test((e as Error)?.message ?? '')

export type VideoMeta = {
  id: string; title: string; channel: string; channelUrl: string; durationSec: number; publishedAt?: string
  chapters: { start: number; title: string }[]; embeddable: boolean; description: string; thumb: { url: string; width: number; height: number }
  /** YouTube lists an English caption track (manual or automatic). */
  captions: boolean
  /** Spoken language is English (or unknown). */
  english?: boolean
}
export type Playlist = { id: string; title: string; channel: string; channelUrl: string; videos: { id: string; title: string }[] }
/**
 * YouTube access: metadata and caption text; for a video with no captions at all, `transcribe` downloads only its audio to a
 * temp folder, transcribes it on this Mac (Whisper) and deletes it. Never video.
 */
export type YouTube = { playlist(id: string): Promise<Playlist>; video(id: string): Promise<VideoMeta>; transcript(id: string): Promise<string | null>; transcribe?(id: string): Promise<string | null> }

const KINDS = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery'] as const
export type Draft = { relevant: boolean; kind: GuideEntity['kind']; viTitle: string; summary: string[]; body: string; faq: { q: string; a: string }[]; chapters: string[] }
const WRITE = readFileSync(new URL('./prompts/video-guide.md', import.meta.url), 'utf8')
const REVIEW = readFileSync(new URL('./prompts/video-review.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
const EDIT = readFileSync(new URL('./prompts/video-edit.md', import.meta.url), 'utf8')
const str = { type: 'string' }
const DRAFT_SCHEMA = {
  type: 'object', required: ['relevant', 'kind', 'viTitle', 'summary', 'body', 'faq', 'chapters'],
  properties: {
    relevant: { type: 'boolean' }, kind: { type: 'string', enum: KINDS }, viTitle: str, summary: { type: 'array', items: str }, body: str,
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: str, a: str } } }, chapters: { type: 'array', items: str },
  },
}
const REVIEW_SCHEMA = { type: 'object', properties: { score: { type: 'number' }, notes: { type: 'array', items: str } }, required: ['score', 'notes'] }
const SERIES_SCHEMA = { type: 'object', properties: { viName: str, intro: str }, required: ['viName', 'intro'] }

/** A draft worth reviewing: a title and some body text. */
export const usable = (d: Draft) => !!d.viTitle?.trim() && sanitizeHtml(d.body ?? '').replace(/<[^>]+>/g, '').trim().length >= 200

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** YouTube json3 captions → "[m:ss] text" lines, one per ~30 s, so the writer can place ideas in the video. */
export function parseTranscript(json3: string): string {
  const events = (JSON.parse(json3).events ?? []) as { tStartMs?: number; segs?: { utf8?: string }[] }[]
  return toLines(events.map(e => ({ start: (e.tStartMs ?? 0) / 1000, text: (e.segs ?? []).map(s => s.utf8 ?? '').join('') })))
}

/** Timed text → "[m:ss] text" lines, one per ~30 s. */
export function toLines(segments: { start: number; text: string }[]): string {
  const lines: string[] = []
  let start = -1
  let buf = ''
  for (const e of segments) {
    const text = e.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const t = e.start
    if (start < 0) start = t
    if (t - start >= 30 && buf) { lines.push(`[${clock(start)}] ${buf.trim()}`); start = t; buf = '' }
    buf += ` ${text}`
  }
  if (buf.trim()) lines.push(`[${clock(start)}] ${buf.trim()}`)
  return lines.join('\n')
}

/** yt-dlp; metadata and captions only unless `download` (audio for transcription). */
const run = (args: string[], cwd?: string, download = false) => new Promise<string>((resolve, reject) =>
  execFile('yt-dlp', ['--no-warnings', ...(download ? [] : ['--skip-download']), ...args], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }, (e, out, err) =>
    e ? reject(new Error(`yt-dlp: ${(err || e.message).trim().split('\n').pop()}`)) : resolve(out)))

const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`

const thumbOf = async (id: string) => {
  const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
  const ok = await fetch(maxres, { method: 'HEAD' }).then(r => r.ok, () => false)
  return ok ? { url: maxres, width: 1280, height: 720 } : { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, width: 320, height: 180 }
}

/** Transcripts kept on this machine (not committed): the images pass and rewrites reuse them instead of asking YouTube again. */
const CACHE = process.env.TRANSCRIPT_CACHE ?? join(homedir(), '.cache/thuysinh/transcripts')
async function cached(file: string, make: () => Promise<string | null>): Promise<string | null> {
  const path = join(CACHE, file)
  const hit = await readFile(path, 'utf8').catch(() => null)
  if (hit) return hit
  const v = await make()
  if (v) { await mkdir(CACHE, { recursive: true }); await writeFile(path, v) }
  return v
}

/** yt-dlp on the owner's machine: metadata (-J) and English captions (manual first, else automatic) as json3. */
export const ytDlp: YouTube = {
  async playlist(id) {
    const d = JSON.parse(await run(['--flat-playlist', '-J', `https://www.youtube.com/playlist?list=${id}`]))
    return { id, title: d.title, channel: d.channel ?? d.uploader ?? '', channelUrl: d.channel_url ?? d.uploader_url ?? '', videos: ((d.entries ?? []) as { id?: string; title?: string }[]).flatMap(e => (e.id ? [{ id: e.id, title: e.title ?? '' }] : [])) }
  },
  async video(id) {
    const d = JSON.parse(await run(['-J', watch(id)]))
    const date = typeof d.upload_date === 'string' && /^\d{8}$/.test(d.upload_date) ? `${d.upload_date.slice(0, 4)}-${d.upload_date.slice(4, 6)}-${d.upload_date.slice(6)}` : undefined
    return {
      id, title: d.title, channel: d.channel ?? d.uploader ?? '', channelUrl: d.uploader_url ?? d.channel_url ?? '', durationSec: Number(d.duration) || 0,
      ...(date ? { publishedAt: date } : {}), description: d.description ?? '',
      chapters: ((d.chapters ?? []) as { start_time: number; title: string }[]).map(c => ({ start: Math.round(c.start_time), title: c.title })),
      embeddable: d.playable_in_embed !== false && (d.availability === 'public' || d.availability === 'unlisted'),
      captions: [...Object.keys(d.subtitles ?? {}), ...Object.keys(d.automatic_captions ?? {})].some(l => /^en(-|$)/.test(l)),
      english: !d.language || /^en(-|$)/.test(d.language),
      thumb: await thumbOf(id),
    }
  },
  transcript: id => cached(`${id}.txt`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aq-yt-'))
    try {
      await run(['--write-subs', '--write-auto-subs', '--sub-langs', 'en,en-orig,en-US,en-GB', '--sub-format', 'json3', '-o', '%(id)s.%(ext)s', watch(id)], dir)
      const files = (await readdir(dir)).filter(f => f.endsWith('.json3')).sort((a, b) => a.length - b.length)
      return files[0] ? parseTranscript(await readFile(join(dir, files[0]), 'utf8')) : null
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }),
  transcribe: id => cached(`${id}.whisper.txt`, async () => {
    const python = process.env.WHISPER_PYTHON ?? join(homedir(), '.local/share/thuysinh/whisper-venv/bin/python')
    if (!existsSync(python)) return null // Whisper not installed on this machine: the video stays skipped
    const dir = await mkdtemp(join(tmpdir(), 'aq-audio-'))
    try {
      await run(['-f', 'bestaudio', '-o', 'audio.%(ext)s', watch(id)], dir, true)
      const audio = (await readdir(dir)).find(f => f.startsWith('audio.'))
      if (!audio) return null
      const out = await new Promise<string>((resolve, reject) => execFile(python, [fileURLToPath(new URL('../scripts/transcribe.py', import.meta.url)), join(dir, audio), 'en'], { maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60_000 }, (e, o, err) => (e ? reject(new Error(`whisper: ${(err || e.message).trim().split('\n').pop()}`)) : resolve(o))))
      return toLines(JSON.parse(out) as { start: number; text: string }[])
    } finally {
      await rm(dir, { recursive: true, force: true }) // the audio never outlives the transcript
    }
  }),
}

/** The largest storyboard (scrub-preview frames) YouTube lists for a video; its sheet URLs are signed, so use them right away. */
export async function ytStoryboard(id: string): Promise<Storyboard | null> {
  const d = JSON.parse(await run(['-J', watch(id)]))
  const sb = ((d.formats ?? []) as (Storyboard & { format_note?: string })[]).filter(f => f.format_note === 'storyboard' && f.fragments?.length).sort((a, b) => b.width - a.width)[0]
  return sb ? { fps: sb.fps, rows: sb.rows, columns: sb.columns, width: sb.width, height: sb.height, fragments: sb.fragments.map(f => ({ url: f.url })) } : null
}

const flat = async (url: string, end = 30) => {
  const d = JSON.parse(await run(['--flat-playlist', '--playlist-end', String(end), '-J', url]))
  return ((d.entries ?? []) as { id?: string; title?: string; channel?: string; uploader?: string }[])
    .flatMap(e => (e.id ? [{ id: e.id, title: e.title ?? '', channel: e.channel ?? e.uploader ?? d.channel ?? '' }] : []))
}

/** Playlist search (YouTube's playlist filter) and a channel's playlists, via yt-dlp: no API key. */
export const ytFinder: Finder = {
  search: q => flat(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAw%253D%253D`),
  channel: h => flat(`https://www.youtube.com/@${h}/playlists`, 100),
  uploads: h => flat(`https://www.youtube.com/@${h}/videos`, 100),
  playlist: id => ytDlp.playlist(id),
}

/** Single videos to turn into guides: engine-state/youtube-videos.json (owner's picks first, then discovery's). */
export async function readSingles(root: string): Promise<string[]> {
  const raw = await readFile(join(root, 'engine-state/youtube-videos.json'), 'utf8').catch(() => '[]')
  const xs = (JSON.parse(raw) as { id: string; by?: string; skip?: boolean }[]).filter(v => !v.skip)
  return [...xs.filter(v => v.by === 'owner'), ...xs.filter(v => v.by !== 'owner')].map(v => v.id)
}

/** Playlists to turn into guides: engine-state/youtube-playlists.json (seeded by hand; discovery appends). */
export async function readPlaylists(root: string): Promise<string[]> {
  const raw = await readFile(join(root, 'engine-state/youtube-playlists.json'), 'utf8').catch(() => '[]')
  const xs = (JSON.parse(raw) as { id: string; by?: string; skip?: boolean }[]).filter(p => !p.skip)
  const mine = (p: { by?: string }) => p.by === 'owner' || p.by === 'seed'
  return [...xs.filter(mine), ...xs.filter(p => !mine(p))].map(p => p.id)
}

/** How a guide is written: the style guide in the writer's prompt, a separate editor pass for phrasing, the model. */
export type WriteOpts = { style?: boolean; edit?: boolean; model?: string }

const videoPrompt = (m: VideoMeta, transcript: string, notes?: string[], style?: boolean) => [
  WRITE,
  ...(style ? [STYLE] : []),
  `Tiêu đề video: ${m.title}`, `Kênh: ${m.channel}`,
  `Chương (${m.chapters.length}):\n${m.chapters.map(c => `- [${clock(c.start)}] ${c.title}`).join('\n') || '(không có)'}`,
  `Mô tả video:\n${m.description.slice(0, 1500)}`,
  `Bản ghi:\n${transcript.slice(0, 120_000)}`,
  ...(notes?.length ? [`Bản trước bị người duyệt chấm thấp. Sửa theo các ghi chú sau:\n${notes.map(n => `- ${n}`).join('\n')}`] : []),
].join('\n\n')

const SYSTEM = 'Bạn viết bài hướng dẫn thủy sinh bằng tiếng Việt. Chỉ trả lời bằng JSON.'

/** A guide draft from the transcript; with `edit`, an editor pass then rewrites the phrasing only (kept if it breaks the shape). */
export async function writeDraft(llm: Llm, m: VideoMeta, transcript: string, o: WriteOpts & { notes?: string[] } = {}): Promise<Draft> {
  const d = await llm<Draft>({ system: SYSTEM, prompt: videoPrompt(m, transcript, o.notes, o.style), schema: DRAFT_SCHEMA, model: o.model })
  return o.edit && d.relevant && usable(d) ? editDraft(llm, d, o.model) : d
}

export async function editDraft(llm: Llm, d: Draft, model?: string): Promise<Draft> {
  const e = await llm<Draft>({ system: 'Bạn là biên tập viên tiếng Việt. Chỉ trả lời bằng JSON.', prompt: `${EDIT}\n\n${STYLE}\n\nBài cần biên tập (JSON):\n${JSON.stringify(d)}`, schema: DRAFT_SCHEMA, model })
  const same = e.relevant && usable(e) && e.summary.length === d.summary.length && e.faq.length === d.faq.length && e.chapters.length === d.chapters.length
  return same ? { ...e, kind: d.kind, relevant: d.relevant } : d
}

export async function reviewDraft(llm: Llm, transcript: string, d: Draft, m?: VideoMeta) {
  const guide = `<h2>${d.viTitle}</h2>\n<ul>${d.summary.map(s => `<li>${s}</li>`).join('')}</ul>\n${d.body}\n${d.faq.map(f => `<p><strong>${f.q}</strong> ${f.a}</p>`).join('\n')}`
  const r = await llm<{ score: number; notes: string[] }>({ system: 'You are a strict reviewer of Vietnamese aquarium guides. Reply only with JSON.', prompt: `${REVIEW}\n\n${m ? `VIDEO: "${m.title}" by ${m.channel} (the creator; the guide may name the channel)\n\n` : ''}TRANSCRIPT:\n${transcript.slice(0, 120_000)}\n\nGUIDE:\n${guide}`, schema: REVIEW_SCHEMA })
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10) }
}

const readJson = async <T>(p: string): Promise<T | undefined> => { try { return JSON.parse(await readFile(p, 'utf8')) } catch { return undefined } }
const writeJson = (p: string, v: unknown) => writeFile(p, `${JSON.stringify(v, null, 2)}\n`)

async function guideSlugs(contentRoot: string, own?: string): Promise<Set<string>> {
  const set = new Set<string>()
  for (const id of await readdir(join(contentRoot, 'guides')).catch(() => [] as string[])) {
    const t = await readJson<Translation>(join(contentRoot, 'guides', id, 'vi.json'))
    if (t && t.slug !== own) set.add(t.slug)
  }
  return set
}

/** content/series/<playlist>.json: the creator's order, with a Vietnamese name and intro written once. */
async function ensureSeries(contentRoot: string, llm: Llm, p: Playlist): Promise<Series> {
  const dir = join(contentRoot, 'series')
  await mkdir(dir, { recursive: true })
  const prev = await readJson<Series>(join(dir, `${p.id}.json`))
  let vi = prev?.vi
  if (!vi) {
    const r = await llm<{ viName: string; intro: string }>({
      system: 'You name Vietnamese aquarium guide series. Reply only with JSON.', schema: SERIES_SCHEMA,
      prompt: `A YouTube playlist became a series of Vietnamese guides on AquaTome. Give it a clear Vietnamese name (viName, ≤ 60 characters, what the series teaches, not a translation of a clickbait title) and a 1–2 sentence Vietnamese intro (what a reader learns; plain, no exclamation marks, no "Hãy cùng"). Vietnamese hobbyists call algae "rêu hại", not "tảo".\n\nPlaylist: ${p.title}\nChannel: ${p.channel}\nVideos:\n${p.videos.map(v => `- ${v.title}`).join('\n')}`,
    })
    const taken = new Set<string>()
    for (const f of await readdir(dir)) { const s = await readJson<Series>(join(dir, f)); if (s) taken.add(s.vi.slug) }
    vi = { slug: pickSlug(r.viName, 'video', taken), name: r.viName.trim(), intro: r.intro.trim() }
  }
  const series = SeriesSchema.parse({ id: p.id, playlistId: p.id, title: p.title, channel: p.channel, channelUrl: p.channelUrl, videoIds: p.videos.map(v => v.id), vi })
  await writeJson(join(dir, `${p.id}.json`), series)
  return series
}

/** Pause between videos: each costs YouTube 2–3 requests, and bursts got this machine rate-limited (429, bot check). */
const VIDEO_GAP_MS = 20_000

export type VideoDeps = { yt: YouTube; llm: Llm; root: string; now: () => Date; sleep: (ms: number) => Promise<void> }
export type VideoReport = { written: string[]; skipped: string[]; errors: string[]; stoppedEarly: boolean }

/**
 * Each playlist video not done yet → an original Vietnamese guide (guides/youtube-<id>/), reviewed against the transcript
 * and rewritten once with the reviewer's notes if it scores low (then published unindexed, like translations).
 */
/** redo: rewrite guides already written (same slug, cover kept), e.g. after a prompt change. */
export async function videoGuides(deps: VideoDeps, opts: { playlists?: string[]; singles?: string[]; limit?: number; maxMinutes?: number; write?: WriteOpts; redo?: boolean } = {}): Promise<VideoReport> {
  const { yt, llm, root } = deps
  const contentRoot = join(root, 'content')
  const deadline = opts.maxMinutes ? deps.now().getTime() + opts.maxMinutes * 60_000 : Infinity
  const report: VideoReport = { written: [], skipped: [], errors: [], stoppedEarly: false }
  const state = await loadState(root, 'youtube')
  const set = async (id: string, s: Omit<UrlState, 'attempts' | 'updatedAt'>) => {
    state[id] = { ...s, attempts: s.status === 'error' ? (state[id]?.attempts ?? 0) + 1 : 0, updatedAt: deps.now().toISOString() }
    await saveState(root, 'youtube', state)
  }
  /** New, or failed fewer than 3 times and waited 6 h × attempts (so an outage doesn't use up every video's tries in one day). */
  const due = (id: string) => {
    const s = state[id]
    return !s || (opts.redo && s.status === 'processed') || (s.status === 'error' && s.attempts < 3 && deps.now().getTime() - Date.parse(s.updatedAt) > s.attempts * 6 * 3_600_000)
  }
  let failedInARow = 0

  /** One video → guide. true: stop the whole run (model down, YouTube throttling, repeated failures). */
  async function one(vid: string, series?: Series, position = 0): Promise<boolean> {
    try {
      const m = await yt.video(vid)
      // No captions at all: our own transcript of the audio (English videos, when Whisper is installed).
      const ownTranscript = !m.captions && m.english !== false && !!yt.transcribe
      const skip = !m.embeddable ? 'not embeddable' : m.durationSec < 120 ? 'too short' : !m.captions && !ownTranscript ? 'no English captions' : null
      const transcript = skip ? null : ownTranscript ? await yt.transcribe!(vid) : await yt.transcript(vid)
      if (!skip && !transcript && ownTranscript) { await set(vid, { status: 'skipped', entityIds: [], error: 'no captions; transcription unavailable' }); report.skipped.push(`${vid}: no captions; transcription unavailable`); failedInARow = 0; return false }
      // Listed but not downloaded (rate limit, network): an error, retried later — not a skip.
      if (!skip && !transcript) throw new Error('English captions listed but not downloaded')
      const why = skip ?? (transcript!.length < 1500 ? 'captions too short' : null)
      if (why) { await set(vid, { status: 'skipped', entityIds: [], error: why }); report.skipped.push(`${vid}: ${why}`); failedInARow = 0; return false }

      const write = (notes?: string[]) => writeDraft(llm, m, transcript!, { ...opts.write, notes })
      let d = await write()
      if (!d.relevant) { await set(vid, { status: 'skipped', entityIds: [], error: 'not a guide' }); report.skipped.push(`${vid}: not a guide`); failedInARow = 0; return false }
      if (!usable(d)) throw new Error('draft without a title or body')
      let { score, notes } = await reviewDraft(llm, transcript!, d, m)
      if (gate(score, false) === 'retry') {
        const again = await write(notes)
        // A broken rewrite keeps the first draft and its score.
        if (again.relevant && usable(again)) { d = again; score = (await reviewDraft(llm, transcript!, d, m)).score }
      }

      const id = `youtube-${vid}`
      const dir = join(contentRoot, 'guides', id)
      const prev = { entity: await readJson<GuideEntity>(join(dir, 'entity.json')), vi: await readJson<Translation>(join(dir, 'vi.json')) }
      const now = deps.now().toISOString().slice(0, 10)
      const entity = GuideSchema.parse({
        id, kind: d.kind, source: 'youtube', sourceUrl: watch(vid), html: '', photos: [], mentions: prev.entity?.mentions ?? [], updatedAt: now,
        video: { youtubeId: vid, title: m.title, channel: m.channel, channelUrl: m.channelUrl, durationSec: m.durationSec, ...(m.publishedAt ? { publishedAt: m.publishedAt } : {}), chapters: m.chapters, ...(series ? { series: { id: series.id, position } } : {}), thumb: m.thumb, ...(ownTranscript ? { transcribed: true } : {}) },
      })
      const name = d.viTitle.trim()
      const vi = TranslationSchema.parse({
        slug: prev.vi?.slug ?? pickSlug(name, 'video', await guideSlugs(contentRoot)), name, altNames: [], sections: {},
        body: sanitizeHtml(d.body), summary: d.summary.map(s => s.trim()).filter(Boolean), faq: d.faq.filter(f => f.q.trim() && f.a.trim()),
        ...(m.chapters.length && d.chapters.length === m.chapters.length ? { chapters: d.chapters.map(c => c.trim()) } : {}),
        quality: { score, indexable: score >= QUALITY_THRESHOLD, bySource: { youtube: score } },
        ...(prev.vi?.cover ? { cover: prev.vi.cover } : {}),
      })
      await mkdir(dir, { recursive: true })
      await writeJson(join(dir, 'entity.json'), entity)
      await writeJson(join(dir, 'vi.json'), vi)
      await appendChangelog(contentRoot, [{ date: now, kind: 'guide', id, source: 'youtube', action: prev.entity ? 'updated' : 'new' }])
      await set(vid, { status: 'processed', entityIds: [id] })
      report.written.push(`${id} (${score.toFixed(2)})`)
      failedInARow = 0
    } catch (e) {
      if (e instanceof LlmError) { report.errors.push(`${vid}: ${e.message}`); report.stoppedEarly = true; return true } // usage limit or CLI down: stop, retry next run
      if (throttled(e)) { report.errors.push(`YouTube is throttling (${vid}): stopped, nothing marked failed`); report.stoppedEarly = true; return true }
      await set(vid, { status: 'error', entityIds: [], error: (e as Error).message.slice(0, 300) })
      report.errors.push(`${vid}: ${(e as Error).message}`)
      // Three in a row looks like yt-dlp or the network, not these videos: stop rather than mark the whole queue failed.
      if (++failedInARow >= 3) { report.stoppedEarly = true; return true }
    }
    return false
  }

  for (const pl of opts.playlists ?? await readPlaylists(root)) {
    let p: Playlist
    try { p = await yt.playlist(pl) } catch (e) { report.errors.push(`playlist ${pl}: ${(e as Error).message}`); continue }
    if (!p.videos.some(v => due(v.id))) continue
    let series: Series
    try { series = await ensureSeries(contentRoot, llm, p) } catch (e) {
      if (e instanceof LlmError) { report.errors.push(`playlist ${pl}: ${e.message}`); report.stoppedEarly = true; return report }
      report.errors.push(`playlist ${pl}: ${(e as Error).message}`)
      continue
    }
    for (const [i, { id: vid }] of p.videos.entries()) {
      if (!due(vid)) continue
      if (deps.now().getTime() > deadline || (opts.limit !== undefined && report.written.length >= opts.limit)) { report.stoppedEarly = true; return report }
      if (await one(vid, series, i)) return report
      await deps.sleep(VIDEO_GAP_MS)
    }
  }
  // Single videos (engine-state/youtube-videos.json): no series.
  for (const vid of opts.singles ?? await readSingles(root)) {
    if (!due(vid)) continue
    if (deps.now().getTime() > deadline || (opts.limit !== undefined && report.written.length >= opts.limit)) { report.stoppedEarly = true; return report }
    if (await one(vid)) return report
    await deps.sleep(VIDEO_GAP_MS)
  }
  return report
}
