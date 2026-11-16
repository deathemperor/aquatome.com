import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { LlmError } from './claude'
import { piece, PieceAdmissionError } from './pieces'
import { contactSheet, frames as tilesOf, sharpFrame, type ImageDeps } from './video-images'
import { throttled } from './youtube'

/**
 * A private sheet of frames from videos named by hand, for a person to look at before any frame is used anywhere (the
 * chief of staff, 13 Nov 2026: a keeper's channel, before the owner's and the keeper's yes). The videos are never listed
 * or searched, and nothing goes to the media host, a page or engine-state: only the kept frames and `frames.json`, in
 * `out`, a folder outside any git checkout.
 *
 * Per video: up to 24 storyboard tiles spread over its length, on one numbered contact sheet in a temporary folder,
 * deleted after the model has seen it. The model answers flags only, never words, so no lettering is ever written out:
 * is the fish the video is about the main subject, whole, side-on, adult, in breeding colours, sharp; is a person, a hand
 * or lettering in it. Of the tiles that pass, up to `per` at least `apart` seconds apart are taken from the video's own
 * stream at the tile's second, and kept only if the Mac reads the frame and finds no face and no text; a screen that
 * fails or can't read the frame leaves it out. One video at a time, `gapMs` apart, and `grabGapMs` between a video's
 * frames; a refusal stops the run, with no retry. A video is a piece (pieces.ts): it starts only when what's left of the
 * step's day line covers one, and its cost is recorded as one.
 */
export type SheetVideo = { id: string; species: string; name: string }
const FLAGS = ['fish', 'whole', 'sideOn', 'adult', 'breeding', 'person', 'hand', 'lettering', 'sharp'] as const
export type FrameFlags = Record<(typeof FLAGS)[number], boolean>
export type SheetFrame = { video: string; species: string; t: number; file: string; flags: FrameFlags }
export type FrameSheetDeps = Pick<ImageDeps, 'frames' | 'grab' | 'get' | 'look' | 'faces'> & {
  /** Per file, whether the Mac reads any text on it (macOS Vision), or null when it can't read the file. The text is never kept. */
  text: (files: string[]) => Promise<(boolean | null)[]>
  sleep: (ms: number) => Promise<void>
}
export type FrameSheetResult = { frames: SheetFrame[]; skipped: string[]; failed: string[]; stopped?: string }

const TILES = 24
export const FLAGS_SCHEMA = {
  type: 'object', required: ['tiles'], additionalProperties: false,
  properties: { tiles: { type: 'array', items: { type: 'object', required: ['n', ...FLAGS], additionalProperties: false, properties: { n: { type: 'number' }, ...Object.fromEntries(FLAGS.map(f => [f, { type: 'boolean' }])) } } } },
}
/** A YouTube video id, and a species page id: nothing else may name a file. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const SPECIES_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
/**
 * YouTube refusing, or asking us to wait: the run stops. yt-dlp's words ("HTTP Error 429", "try again later", a sign-in
 * ask), ffmpeg's ("403 Forbidden", once `ytGrab`'s own retry for a new stream address has given up), and the storyboard
 * fetch's ("HTTP 429", "HTTP 403"). It also stops on a 403 or a sign-in ask that is about one video (private, region,
 * age): the run gives up early rather than ask again.
 */
export const refused = (e: unknown) => throttled(e) || /\bHTTP (Error )?(403|429)\b|\b403 Forbidden\b|try again later|sign in to confirm/i.test((e as Error)?.message ?? '')

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

/**
 * The folder the frames go to: an absolute path, made if missing, whose real path has no git checkout above it (this
 * repository's or another's), so no frame can be committed. Returns its real path.
 */
export async function frameFolder(out: string): Promise<string> {
  if (!isAbsolute(out)) throw new Error('frame-sheet: --out must be an absolute path')
  // Checked from the nearest folder that exists, before any is made, so a refused path leaves nothing behind.
  let base = out
  while (!existsSync(base)) base = dirname(base)
  for (let dir = await realpath(base); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) throw new Error('frame-sheet: --out is inside a git checkout')
    if (dirname(dir) === dir) break
  }
  await mkdir(out, { recursive: true })
  return realpath(out)
}

export async function frameSheet(videos: SheetVideo[], d: FrameSheetDeps, o: { out: string; per: number; apart: number; gapMs: number; grabGapMs: number }): Promise<FrameSheetResult> {
  if (!Number.isInteger(o.per) || o.per < 1 || o.per > 8) throw new Error('frame-sheet: --per must be a whole number from 1 to 8')
  for (const v of videos) if (!VIDEO_ID.test(v.id) || !SPECIES_ID.test(v.species)) throw new Error('frame-sheet: --only takes <videoId>:<species id>')
  const out = await frameFolder(o.out)
  const r: FrameSheetResult = { frames: [], skipped: [], failed: [] }
  const work = await mkdtemp(join(tmpdir(), 'frame-sheet-'))
  try {
    for (const [i, v] of videos.entries()) {
      if (i) await d.sleep(o.gapMs)
      try {
        // A video is a piece: it starts only when what's left of the step's day line covers one (pieces.ts).
        await piece(v.id, async () => {
          const { storyboard: sb, stream, duration } = await d.frames(v.id)
          if (!sb || !stream) { r.skipped.push(`${v.id}: no ${sb ? 'stream' : 'storyboard'}`); return }
          const tileAt = tilesOf(sb, d.get)
          // The last tile there is: the last sheet is often part empty, so the video's length bounds it where known.
          const last = Math.min((sb.fragments.length * sb.rows * sb.columns - 1) * sb.interval, duration ? Math.max(0, duration - 1) : Infinity)
          const times = [...new Set(Array.from({ length: TILES }, (_, k) => Math.round((last * k) / (TILES - 1))))]
          const tiles = [...new Map((await Promise.all(times.map(tileAt))).filter(x => !!x).map(x => [x!.t, x!])).values()]
          if (!tiles.length) { r.skipped.push(`${v.id}: no tiles`); return }
          const sheet = join(work, `${v.id}.jpg`)
          await writeFile(sheet, await contactSheet(tiles.map(x => x.jpg), 320, 180, 4))
          const answers = await d.look<{ tiles: ({ n: number } & FrameFlags)[] }>(sheet, prompt(v.name, tiles.length), FLAGS_SCHEMA).finally(() => rm(sheet, { force: true }))
          const picked: number[] = []
          let grabbed = 0
          for (const a of [...answers.tiles].sort((x, y) => x.n - y.n)) {
            const tile = tiles[a.n - 1]
            if (picked.length >= o.per || !tile || !passes(a) || picked.some(t => Math.abs(t - tile.t) < o.apart)) continue
            if (grabbed++) await d.sleep(o.grabGapMs)
            // The video's own frame at the tile's second; a grab that fails, or shows another moment, leaves the still out.
            const frame = await sharpFrame(d.grab, stream, tile.at, tile.jpg).catch(err => { if (refused(err)) throw err; return null })
            if (!frame) continue
            // Screened in the temporary folder: only a frame with no face and no text, on a read that worked, reaches `out`.
            const draft = join(work, `${v.id}-${tile.t}.png`)
            await writeFile(draft, frame)
            const clean = await Promise.all([d.faces([draft]), d.text([draft])]).then(([f, t]) => f[0] === 0 && t[0] === false, () => false)
            await rm(draft, { force: true })
            if (!clean) continue
            const file = join(out, `${v.id}-${tile.t}.png`)
            await writeFile(file, frame)
            picked.push(tile.t)
            r.frames.push({ video: v.id, species: v.species, t: tile.t, file, flags: Object.fromEntries(FLAGS.map(f => [f, !!a[f]])) as FrameFlags })
          }
          if (!picked.length) r.skipped.push(`${v.id}: no still passed`)
        })
      } catch (e) {
        // Never the error's own words for the model's stop: they can carry what the model wrote.
        if (e instanceof PieceAdmissionError) { r.stopped = `${v.id}: the step's day line`; break }
        if (e instanceof LlmError) { r.stopped = `${v.id}: the model stopped`; break }
        if (refused(e)) { r.stopped = `${v.id}: YouTube refused`; break }
        r.failed.push(`${v.id}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
  await writeFile(join(out, 'frames.json'), `${JSON.stringify(r.frames, null, 2)}\n`)
  return r
}
