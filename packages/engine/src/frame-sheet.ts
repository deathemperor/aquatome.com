import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LlmError } from './claude'
import { contactSheet, frames as tilesOf, sharpFrame, type ImageDeps } from './video-images'
import { throttled } from './youtube'

/**
 * A private sheet of frames from videos named by hand, for a person to look at before any frame is used anywhere (the
 * chief of staff, 13 Nov 2026: a keeper's channel, before the owner's and the keeper's yes). The videos are never listed
 * or searched, and nothing goes to the media host, a page or engine-state: only files in `out`.
 *
 * Per video: up to 24 storyboard tiles spread over its length, on one numbered contact sheet. The model answers flags
 * only, never words, so no lettering is ever written out: is the fish the video is about the main subject, whole,
 * side-on, adult, in breeding colours, sharp; is a person, a hand or lettering in it. Of the tiles that pass, up to `per`
 * at least `apart` seconds apart are taken from the video's own stream at the tile's second, and kept only if the Mac
 * finds no face and no text on the frame. One video at a time, `gapMs` apart; a refusal stops the run, with no retry.
 */
export type SheetVideo = { id: string; species: string; name: string }
const FLAGS = ['fish', 'whole', 'sideOn', 'adult', 'breeding', 'person', 'hand', 'lettering', 'sharp'] as const
export type FrameFlags = Record<(typeof FLAGS)[number], boolean>
export type SheetFrame = { video: string; species: string; t: number; file: string; flags: FrameFlags }
export type FrameSheetDeps = Pick<ImageDeps, 'frames' | 'grab' | 'get' | 'look' | 'faces'> & {
  /** Whether the Mac reads any text on each file (macOS Vision). The text itself is never kept. */
  text: (files: string[]) => Promise<boolean[]>
  sleep: (ms: number) => Promise<void>
}
export type FrameSheetResult = { frames: SheetFrame[]; skipped: string[]; failed: string[]; stopped?: string }

const TILES = 24
export const FLAGS_SCHEMA = {
  type: 'object', required: ['tiles'],
  properties: { tiles: { type: 'array', items: { type: 'object', required: ['n', ...FLAGS], properties: { n: { type: 'number' }, ...Object.fromEntries(FLAGS.map(f => [f, { type: 'boolean' }])) } } } },
}

const prompt = (name: string, n: number) => `These are ${n} numbered stills from one aquarium video about ${name}.
For every still, answer with true or false only:
- fish: ${name} is the main subject (not another species, not only fry or eggs)
- whole: the whole fish is in the frame, head to tail, not cut by an edge
- sideOn: seen from the side
- adult: an adult, not a juvenile
- breeding: in breeding colours
- person: any person or part of one is in it
- hand: a hand or arm is in it
- lettering: any text, logo, watermark, credit or caption is on it
- sharp: in focus, not blurred by motion
Answer for all ${n} stills, by n.`

const passes = (f: FrameFlags) => f.fish && f.whole && f.sideOn && f.adult && f.sharp && !f.person && !f.hand && !f.lettering

export async function frameSheet(videos: SheetVideo[], d: FrameSheetDeps, o: { out: string; per: number; apart: number; gapMs: number }): Promise<FrameSheetResult> {
  const r: FrameSheetResult = { frames: [], skipped: [], failed: [] }
  await mkdir(join(o.out, 'sheets'), { recursive: true })
  for (const [i, v] of videos.entries()) {
    if (i) await d.sleep(o.gapMs)
    try {
      const { storyboard: sb, stream } = await d.frames(v.id)
      if (!sb || !stream) { r.skipped.push(`${v.id}: no ${sb ? 'stream' : 'storyboard'}`); continue }
      const tileAt = tilesOf(sb, d.get)
      const last = (sb.fragments.length * sb.rows * sb.columns - 1) * sb.interval
      const times = [...new Set(Array.from({ length: TILES }, (_, k) => Math.round((last * k) / (TILES - 1))))]
      const tiles = [...new Map((await Promise.all(times.map(tileAt))).filter(x => !!x).map(x => [x!.t, x!])).values()]
      if (!tiles.length) { r.skipped.push(`${v.id}: no tiles`); continue }
      const sheet = join(o.out, 'sheets', `${v.id}.jpg`)
      await writeFile(sheet, await contactSheet(tiles.map(x => x.jpg), 320, 180, 4))
      const answers = (await d.look<{ tiles: ({ n: number } & FrameFlags)[] }>(sheet, prompt(v.name, tiles.length), FLAGS_SCHEMA)).tiles
      const picked: number[] = []
      let kept = 0
      for (const a of [...answers].sort((x, y) => x.n - y.n)) {
        const tile = tiles[a.n - 1]
        if (kept >= o.per || !tile || !passes(a) || picked.some(t => Math.abs(t - tile.t) < o.apart)) continue
        // The video's own frame at the tile's second; a grab that fails, or shows another moment, leaves the still out.
        const frame = await sharpFrame(d.grab, stream, tile.at, tile.jpg).catch(err => { if (throttled(err)) throw err; return null })
        if (!frame) continue
        const file = join(o.out, `${v.id}-${tile.t}.png`)
        await writeFile(file, frame)
        if ((await d.faces([file]))[0] || (await d.text([file]))[0]) { await rm(file, { force: true }); continue }
        picked.push(tile.t)
        kept++
        r.frames.push({ video: v.id, species: v.species, t: tile.t, file, flags: Object.fromEntries(FLAGS.map(f => [f, !!a[f]])) as FrameFlags })
      }
      if (!kept) r.skipped.push(`${v.id}: no still passed`)
    } catch (e) {
      if (throttled(e) || e instanceof LlmError) { r.stopped = `${v.id}: ${(e as Error).message.slice(0, 200)}`; break }
      r.failed.push(`${v.id}: ${(e as Error).message.slice(0, 200)}`)
    }
  }
  await writeFile(join(o.out, 'frames.json'), `${JSON.stringify(r.frames, null, 2)}\n`)
  return r
}
