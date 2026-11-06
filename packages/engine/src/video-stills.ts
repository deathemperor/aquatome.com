import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GuideSchema, type GuideEntity } from '@aq/schema'
import { LlmError } from './claude'
import { dhash } from './gallery'
import type { Media } from './source-photos'
import { sharpFrame, tileTime, type ImageDeps, type VideoFrames } from './video-images'
import { judgeSheet, ocrHit, ocrOf, type WatermarkDeps, type WatermarkEntry } from './watermarks'
import { throttled } from './youtube'

export type StillDeps = Pick<ImageDeps, 'frames' | 'grab' | 'faces'> & {
  get: (url: string) => Promise<Uint8Array>
  media: Media
  /** Text on each image (macOS Vision), as the watermark step reads it. */
  read: WatermarkDeps['read']
  /** The watermark step's model. */
  look: WatermarkDeps['look']
  now: () => Date
}
/** Per guide: when its stills were last worked on, and the stills that stay storyboard tiles for good (by `t`, with why). */
export type StillsState = Record<string, { at: string; kept?: Record<string, string>; failed?: string }>
type Moment = NonNullable<NonNullable<GuideEntity['video']>['figures']>[number]['moments'][number]

const SHARP = /-hd\.webp$/
const sortedJson = (o: Record<string, unknown>) => `${JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2)}\n`

/**
 * Older video guides' stills were storyboard tiles (320 or 160 px). Each becomes the video's own frame at the second its
 * tile shows, uploaded as `t<t>-hd.webp`; its `t`, caption and place stay. A frame is checked against its tile before
 * anything else, then screened as the stills of a new guide are, before it is uploaded:
 * - a face in it (macOS Vision): the still leaves the page, since the tile only hid the person;
 * - text on it: the old still's watermark verdict holds when the model gave one, else the model judges the frame now; a
 *   watermark takes the still off the page and onto `_photo-rejected.json`. Its text and verdict go into
 *   `_photo-watermarks.json` under the new address, so the watermark step doesn't read it again.
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
  const today = d.now().toISOString().slice(0, 10)

  // Guides with a still that is still a tile and not kept as one; one that failed before goes after the others.
  const queue: { id: string; e: GuideEntity }[] = []
  for (const id of (await readdir(file('content', 'guides')).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
    if (o.only && !o.only.includes(id)) continue
    const e = JSON.parse(await readFile(file('content', 'guides', id, 'entity.json'), 'utf8')) as GuideEntity
    if ((e.video?.figures ?? []).some(f => f.moments.some(m => !SHARP.test(m.url) && !(String(m.t) in (state[id]?.kept ?? {}))))) queue.push({ id, e })
  }
  queue.sort((a, b) => Number(!!state[a.id]?.failed) - Number(!!state[b.id]?.failed))

  const dir = await mkdtemp(join(tmpdir(), 'aq-stills-'))
  let inARow = 0
  let worked = false, changed = false
  try {
    for (const { id, e } of queue.slice(0, o.limit ?? queue.length)) {
      const v = e.video!
      const kept: Record<string, string> = { ...state[id]?.kept }
      const fail = (why: string) => { report.failed.push(`${id}: ${why}`); state[id] = { at: today, ...(Object.keys(kept).length ? { kept } : {}), failed: why }; worked = true }

      let frames: VideoFrames
      try { frames = await d.frames(v.youtubeId) } catch (err) {
        if (throttled(err)) { report.stopped = (err as Error).message; break }
        fail((err as Error).message.slice(0, 160)); continue
      }
      if (!frames.stream) { fail('no stream to take frames from'); continue }

      // 1. The frame at each tile's second, when it shows the tile's moment.
      const grabbed: { m: Moment; hd: Uint8Array; png: string }[] = []
      let left = 0
      for (const m of (v.figures ?? []).flatMap(f => f.moments)) {
        if (SHARP.test(m.url) || String(m.t) in kept) continue
        if (m.url in rejected) { kept[String(m.t)] = 'rejected'; continue } // never given a new address that escapes it
        const at = frames.storyboard ? tileTime(frames.storyboard, m.t) : m.t
        try {
          const hd = await sharpFrame(d.grab, frames.stream, at, await d.get(m.url))
          inARow = 0
          if (!hd) { kept[String(m.t)] = `the frame at ${at} s isn't the tile's moment`; report.kept.push(`${id} t${m.t}`); continue }
          const png = join(dir, `${id}-${m.t}.png`)
          await writeFile(png, hd)
          grabbed.push({ m, hd, png })
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

      // 3. Upload what passed, then the guide with its stills swapped and any dropped.
      const swap = new Map<Moment, Moment>()
      for (const { m, hd } of grabbed) {
        const entry = entries.get(m)
        if (!entry) continue
        const s = await d.media.put(`video/${v.youtubeId}/t${m.t}-hd.webp`, hd)
        marks[s.url] = entry
        hashes[s.url] = await dhash(hd)
        swap.set(m, { ...m, url: s.url, width: s.width, height: s.height })
      }
      const figures = v.figures!.map(f => ({ ...f, moments: f.moments.filter(m => !drop.has(m)).map(m => swap.get(m) ?? m) })).filter(f => f.moments.length || f.photo)
      if (swap.size || drop.size) {
        await writeFile(file('content', 'guides', id, 'entity.json'), `${JSON.stringify(GuideSchema.parse({ ...e, video: { ...v, figures } }), null, 2)}\n`)
        changed = true
      }
      state[id] = { at: today, ...(Object.keys(kept).length ? { kept } : {}) }
      worked = true
      report.done.push(`${id}: ${swap.size} sharp, ${drop.size} dropped, ${Object.keys(kept).length} kept as tiles${left ? `, ${left} for next run` : ''}`)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
    if (worked) await writeFile(file('engine-state', '_video-stills.json'), sortedJson(state))
    if (changed) {
      await writeFile(file('engine-state', '_photo-watermarks.json'), `${JSON.stringify(Object.fromEntries(Object.entries(marks).sort()), null, 2)}\n`)
      await writeFile(file('engine-state', '_photo-rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`)
      await writeFile(file('content', 'picture-hashes.json'), sortedJson(hashes))
    }
  }
  return report
}
