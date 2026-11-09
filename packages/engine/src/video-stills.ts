import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GuideSchema, type GuideEntity } from '@aq/schema'
import { LlmError } from './claude'
import { dhash } from './gallery'
import type { Media } from './source-photos'
import { guidePhotoOff, judgeGuidePhotos, PER_SHEET, type GuidePhotoDeps, type GuidePhotoVerdict } from './guide-photos'
import { sharpFrame, stillDone, tileTime, type ImageDeps, type VideoFrames } from './video-images'
import { frameSharpness } from './still-sharpness'
import { judgeSheet, ocrHit, ocrOf, type WatermarkDeps, type WatermarkEntry } from './watermarks'
import { throttled } from './youtube'

export type StillDeps = Pick<ImageDeps, 'frames' | 'grab' | 'faces'> & {
  get: (url: string) => Promise<Uint8Array>
  media: Media
  /** Text on each image (macOS Vision), as the watermark step reads it. */
  read: WatermarkDeps['read']
  /** The watermark step's model. */
  look: WatermarkDeps['look']
  /** guide-photos.ts's model: is anyone in the frame, or a mark added on it. */
  judge: GuidePhotoDeps['look']
  now: () => Date
}
/**
 * Per guide: when its stills were last worked on, whether their `t` are the seconds they show (`timed`), and the stills
 * that stay storyboard tiles for good (by `t`, with why).
 */
export type StillsState = Record<string, { at: string; timed?: true; kept?: Record<string, string>; failed?: string }>
type Moment = NonNullable<NonNullable<GuideEntity['video']>['figures']>[number]['moments'][number]

/** A still's address before 2026-11-07, `t<t>.webp` or `t<t>-hd.webp`: the `t` it was given, its tile k ÷ fps. */
const BY_FPS = /\/t(\d+)(?:-hd)?\.webp$/
/** A tile stored since 2026-11-07, `at<t>.webp`: step 0 leaves its `t` alone, since it reads as the second it shows. */
const AT_SECOND = /\/at\d+\.webp$/
const sortedJson = (o: Record<string, unknown>) => `${JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2)}\n`

/**
 * Older video guides' stills were storyboard tiles (320 or 160 px), and their `t` was the tile k ÷ fps, up to 16 s
 * early on a long video. First each still's `t` becomes the second its tile shows, worked out from the number in its
 * address, so doing it twice changes nothing; a guide with nothing else to do goes first. Then each tile becomes the
 * video's own frame at that second, uploaded as `at<t>-hd.webp`; its caption and place stay, and its `t` too, unless a
 * tile named `at<t>` shows another second (its interval was misread when it was made), when `t` moves there. A frame is checked
 * against its tile before anything else, then screened as the stills of a new guide are, before it is uploaded:
 * - a face in it (macOS Vision): the still leaves the page, since the tile only hid the person;
 * - text on it: the old still's watermark verdict holds when the model gave one, else the model judges the frame now; a
 *   watermark takes the still off the page and onto `_photo-rejected.json`. Its text and verdict go into
 *   `_photo-watermarks.json` under the new address, so the watermark step doesn't read it again;
 * - a person, hands included, or a mark added on it (guide-photos.ts's question, which a tile's smudge hid): the still
 *   leaves the page and goes onto `_photo-rejected.json`. A frame that passes carries its verdict (`person: false`, which
 *   a still needs to show) and is in `_photo-guides.json`, so guide-photos doesn't judge it again.
 * A frame that doesn't show the tile's moment leaves the tile for good (`_video-stills.json`); a grab or a read that
 * fails leaves it for the next run. YouTube throttling, a model failure or three grabs failing in a row stop the run, and
 * the guide in hand is left as it was. `limit`: guides this run.
 */
export async function videoStills(root: string, d: StillDeps, o: { limit?: number; only?: string[] } = {}) {
  const report = { done: [] as string[], dropped: [] as string[], kept: [] as string[], failed: [] as string[], stopped: '' }
  const file = (...p: string[]) => join(root, ...p)
  const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8').catch(() => '{}')) as T
  const state = await json<StillsState>(file('engine-state', '_video-stills.json'))
  const marks = await json<Record<string, WatermarkEntry>>(file('engine-state', '_photo-watermarks.json'))
  const rejected = await json<Record<string, string>>(file('engine-state', '_photo-rejected.json'))
  const hashes = await json<Record<string, string>>(file('content', 'picture-hashes.json'))
  const verdicts = await json<Record<string, GuidePhotoVerdict>>(file('engine-state', '_photo-guides.json'))
  const today = d.now().toISOString().slice(0, 10)

  // Guides with a still that is still a tile and not kept as one, or stills not yet timed; timing alone first, and one
  // that failed before after the others.
  const queue: { id: string; e: GuideEntity; tiles: boolean }[] = []
  for (const id of (await readdir(file('content', 'guides')).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
    if (o.only && !o.only.includes(id)) continue
    const e = JSON.parse(await readFile(file('content', 'guides', id, 'entity.json'), 'utf8')) as GuideEntity
    const all = (e.video?.figures ?? []).flatMap(f => f.moments)
    const tiles = all.some(m => !stillDone(m, state[id]?.kept))
    if (tiles || (!state[id]?.timed && all.some(m => BY_FPS.test(m.url)))) queue.push({ id, e, tiles })
  }
  queue.sort((a, b) => Number(!!state[a.id]?.failed) - Number(!!state[b.id]?.failed) || Number(a.tiles) - Number(b.tiles))

  const dir = await mkdtemp(join(tmpdir(), 'aq-stills-'))
  let inARow = 0
  let worked = false, changed = false
  try {
    for (const { id, e } of queue.slice(0, o.limit ?? queue.length)) {
      const v = e.video!
      let kept: Record<string, string> = { ...state[id]?.kept }
      let timed = !!state[id]?.timed
      const record = () => ({ at: today, ...(timed ? { timed: true as const } : {}), ...(Object.keys(kept).length ? { kept } : {}) })
      const fail = (why: string) => { report.failed.push(`${id}: ${why}`); state[id] = { ...record(), failed: why }; worked = true }
      const save = (figures: NonNullable<typeof v.figures>) => writeFile(file('content', 'guides', id, 'entity.json'), `${JSON.stringify(GuideSchema.parse({ ...e, video: { ...v, figures } }), null, 2)}\n`)

      let frames: VideoFrames
      try { frames = await d.frames(v.youtubeId) } catch (err) {
        if (throttled(err)) { report.stopped = (err as Error).message; break }
        fail((err as Error).message.slice(0, 160)); continue
      }

      // 0. Each still's t: the second its tile shows, from the t its address keeps (the kept tiles' too).
      let figures = v.figures!
      let retimed = 0
      if (!timed && figures.some(f => f.moments.some(m => BY_FPS.test(m.url)))) {
        const sb = frames.storyboard
        if (!sb) { fail('no storyboard to time the stills by'); continue }
        const to = new Map<number, number>()
        figures = figures.map(f => ({ ...f, moments: f.moments.map(m => {
          const n = BY_FPS.exec(m.url)?.[1]
          const t = n === undefined ? m.t : tileTime(sb, Number(n))
          to.set(m.t, t)
          if (t === m.t) return m
          retimed++
          return { ...m, t }
        }) }))
        kept = Object.fromEntries(Object.entries(kept).map(([t, why]) => [String(to.get(Number(t)) ?? t), why]))
      }
      timed = true
      if (!frames.stream) {
        if (retimed) await save(figures)
        fail('no stream to take frames from'); continue
      }

      // 1. The frame at each tile's second, when it shows the tile's moment.
      const grabbed: { m: Moment; t: number; hd: Uint8Array; png: string }[] = []
      let left = 0
      for (const m of figures.flatMap(f => f.moments)) {
        if (stillDone(m, kept)) continue
        if (m.url in rejected) { kept[String(m.t)] = 'rejected'; continue } // never given a new address that escapes it
        try {
          const tile = await d.get(m.url)
          let t = m.t
          let hd = await sharpFrame(d.grab, frames.stream, t, tile)
          // A still made while the video's tile interval was misread (storyboardInterval) names a second up to 1.3% early:
          // the frame is at the second its tile really shows, and the still's play button starts there too.
          const shown = frames.storyboard && AT_SECOND.test(m.url) ? tileTime(frames.storyboard, m.t) : m.t
          if (!hd && shown !== m.t) { hd = await sharpFrame(d.grab, frames.stream, shown, tile); if (hd) { t = shown; retimed++ } }
          inARow = 0
          if (!hd) { kept[String(m.t)] = `the frame at ${m.t} s isn't the tile's moment`; report.kept.push(`${id} t${m.t}`); continue }
          const png = join(dir, `${id}-${m.t}.png`)
          await writeFile(png, hd)
          grabbed.push({ m, t, hd, png })
        } catch (err) {
          if (throttled(err)) { report.stopped = (err as Error).message; break }
          left++
          report.failed.push(`${id} t${m.t}: ${(err as Error).message.slice(0, 160)}`)
          if (++inARow >= 3) { report.stopped = 'three frame grabs failed in a row'; break }
        }
      }
      if (report.stopped) break

      // 2. Faces and text, as for a new guide's stills; the model on text no earlier verdict covers.
      const faces = grabbed.length ? await d.faces(grabbed.map(g => g.png)) : []
      const texts = grabbed.length ? await d.read(grabbed.map(g => g.png)) : []
      const drop = new Set<Moment>()
      const entries = new Map<Moment, WatermarkEntry>()
      const ask: { g: (typeof grabbed)[number]; entry: WatermarkEntry }[] = []
      grabbed.forEach((g, i) => {
        if (faces[i]! > 0) { drop.add(g.m); report.dropped.push(`${id} t${g.m.t}: a face in the frame`); return }
        const lines = texts[i]
        if (faces[i]! < 0 || !lines) { left++; return } // Vision couldn't read it: next run
        const entry: WatermarkEntry = { ocr: ocrOf(lines) }
        const old = marks[g.m.url]
        if (ocrHit(entry.ocr) && typeof old?.watermark === 'boolean') Object.assign(entry, { watermark: old.watermark, kind: old.kind, what: old.what })
        else if (ocrHit(entry.ocr)) ask.push({ g, entry })
        entries.set(g.m, entry)
      })
      try {
        for (let i = 0; i < ask.length; i += 6) {
          const batch = ask.slice(i, i + 6)
          const verdicts = await judgeSheet(batch.map(x => ({ b: Buffer.from(x.g.hd), ocr: x.entry.ocr })), join(dir, `${id}-sheet-${i}.jpg`), d.look)
          batch.forEach((x, j) => { if (verdicts[j]) Object.assign(x.entry, verdicts[j]); else { entries.delete(x.g.m); left++ } })
        }
      } catch (err) {
        if (err instanceof LlmError) { report.stopped = err.message; break }
        throw err
      }
      for (const [m, entry] of entries) if (entry.watermark) {
        drop.add(m)
        entries.delete(m)
        rejected[m.url] ??= `watermark: ${entry.what || entry.kind}`
        report.dropped.push(`${id} t${m.t}: watermark (${entry.what || entry.kind})`)
      }

      // No person and no added mark on what's left.
      const judged = new Map<Moment, GuidePhotoVerdict>()
      const toJudge = grabbed.filter(g => entries.has(g.m))
      try {
        for (let i = 0; i < toJudge.length; i += PER_SHEET) {
          const batch = toJudge.slice(i, i + PER_SHEET)
          const answers = await judgeGuidePhotos(batch.map(g => Buffer.from(g.hd)), join(dir, `${id}-people-${i}.jpg`), d.judge)
          batch.forEach((g, j) => { const v = answers[j]; if (v) judged.set(g.m, v); else { entries.delete(g.m); left++ } })
        }
      } catch (err) {
        if (err instanceof LlmError) { report.stopped = err.message; break }
        throw err
      }
      for (const [m, v] of judged) {
        const why = guidePhotoOff(v, true)
        if (!why) continue
        drop.add(m)
        entries.delete(m)
        rejected[m.url] ??= why
        report.dropped.push(`${id} t${m.t}: ${why}`)
      }

      // 3. Upload what passed, then the guide with its stills swapped and any dropped.
      const swap = new Map<Moment, Moment>()
      for (const { m, t, hd } of grabbed) {
        const entry = entries.get(m)
        if (!entry) continue
        const s = await d.media.put(`video/${v.youtubeId}/at${t}-hd.webp`, hd)
        marks[s.url] = entry
        hashes[s.url] = await dhash(hd)
        verdicts[s.url] = judged.get(m)!
        swap.set(m, { ...m, t, url: s.url, width: s.width, height: s.height, sharpness: await frameSharpness(hd), person: false })
      }
      if (swap.size || drop.size || retimed) await save(figures.map(f => ({ ...f, moments: f.moments.filter(m => !drop.has(m)).map(m => swap.get(m) ?? m) })).filter(f => f.moments.length || f.photo))
      if (swap.size || drop.size) changed = true
      state[id] = record()
      worked = true
      report.done.push(`${id}: ${retimed ? `${retimed} retimed, ` : ''}${swap.size} sharp, ${drop.size} dropped, ${Object.keys(kept).length} kept as tiles${left ? `, ${left} for next run` : ''}`)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (worked) await writeFile(file('engine-state', '_video-stills.json'), sortedJson(state))
    if (changed) {
      await writeFile(file('engine-state', '_photo-watermarks.json'), `${JSON.stringify(Object.fromEntries(Object.entries(marks).sort()), null, 2)}\n`)
      await writeFile(file('engine-state', '_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
      await writeFile(file('content', 'picture-hashes.json'), sortedJson(hashes))
      await writeFile(file('engine-state', '_photo-guides.json'), sortedJson(verdicts))
    }
  }
  return report
}
