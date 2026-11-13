import { compactVerdict, photoFailure, photoModelStop } from './photo-observations'
import { writePhotoState } from './photo-state'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { contactSheet } from './video-images'

/**
 * No dead fish on a page, for what the photo check hasn't asked about (photo-check.ts asks since 2026-11-05): each species
 * and plant page's videos, by the thumbnail the page shows and three frames from further in, then its main photo when no verdict
 * of the photo check has `logo` (one from before it asked about dead fish). Twelve to a contact sheet, one model call
 * each. A dead fish or fish as food puts a video on engine-state/_video-rejected.json (the sweep takes it off every page,
 * findVideos never picks it) and a photo on _photo-rejected.json (the faces step takes it off every page, the photo
 * sources skip it), and off its page at once. Each is judged once (_dead-screen.json: `youtube:<id>` or the photo's
 * address → verdict); a picture that can't be fetched is tried again next run. Found by the owner (2026-11-07): the
 * speckled peacock bass page's video whose thumbnail shows the fish dead on a road beside a tape measure. The first run
 * (2026-11-07, all 2,875) flagged 180, looked at by eye: 110 dead or preserved, 70 live fish in a hand or water, or
 * graphics, which the prompt now leaves out.
 *
 * A thumbnail is one picture, often chosen by the uploader: the climbing perch Short (2026-11-10) showed a live fish in a
 * hand and passed, with fish gutted in a bowl three quarters through. So a video is its thumbnail and the frames YouTube
 * publishes from about a quarter, half and three quarters through, two by two on one tile. `frames` marks a verdict that
 * saw them. One from before stays until a `backCheck` run, which looks at each of those once.
 */
export type DeadVerdict = { dead: boolean; note: string; frames?: boolean }
export type DeadScreenDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ tiles: ({ n: number } & DeadVerdict)[] }>
}
export const DEAD_SCREEN_SCHEMA = {
  type: 'object', required: ['tiles'],
  properties: { tiles: { type: 'array', items: { type: 'object', required: ['n', 'dead', 'note'], properties: { n: { type: 'number' }, dead: { type: 'boolean' }, note: { type: 'string' } } } } },
}
export const DEAD_SCREEN_PROMPT = `Each numbered tile is what an aquarium handbook's fish or plant page shows: a video, as four pictures two by two (its thumbnail and three frames from through it), or the page's photo. Look at every picture on a tile. For each tile:
- dead: true if any picture on it shows a dead fish or other dead animal, or fish as food: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a fish lying on the ground, a road, a floor, a board, a tray, a mesh, a ruler or a tape measure; a big catch hung up or held up by an angler; a preserved, mounted, museum or lab specimen, in a jar, on a specimen plate, or laid out flat on a plain or gridded background for a photo (for a snail, an empty shell; for a plant, a pressed herbarium sheet). When you can't tell whether a fish lying out of the water is alive, it is dead. Not dead: a live fish in water (a tank, a pond, a river, a tub, a cup, a bag, a photo tank), a small live fish held in a hand or a net for a moment, a drawing, painting or graphic.
- note: a few words on what it shows (for dead: what makes it so, e.g. "fish on a tape measure on a road").
Answer every tile, by its number.`
const PER_SHEET = 12
export const thumbnail = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
/** A video's thumbnail, then the frames YouTube publishes from about a quarter, half and three quarters through. */
export const videoFrames = (youtubeId: string) => [thumbnail(youtubeId), ...[1, 2, 3].map(n => `https://i.ytimg.com/vi/${youtubeId}/hq${n}.jpg`)]

type Item = { key: string; url: string; files: string[]; video?: string }
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const indentOf = (raw: string) => /^\{\n( +)"/.exec(raw)?.[1]?.length ?? 0

/** A video's pictures on one tile, two by two, each without the black bars YouTube pads it to 4:3 with. */
async function videoTile(frames: Buffer[]) {
  const W = 480, H = 270
  const unbarred = async (b: Buffer): Promise<Buffer> => { try { return await sharp(b).trim({ background: '#000', threshold: 20 }).toBuffer() } catch { return b } }
  const parts = await Promise.all(frames.map(async (b, i) => ({ input: await sharp(await unbarred(b)).resize(W, H, { fit: 'contain', background: '#000' }).toBuffer(), left: (i % 2) * W, top: Math.floor(i / 2) * H })))
  return sharp({ create: { width: 2 * W, height: 2 * H, channels: 3, background: '#000' } }).composite(parts).jpeg({ quality: 85 }).toBuffer()
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/** `backCheck`: also the videos judged from their thumbnail alone (the screen's verdicts from before it saw frames). */
export async function screenDead(root: string, d: DeadScreenDeps, o: { limit: number; parallel?: number; backCheck?: boolean }) {
  const content = join(root, 'content')
  const state = (f: string) => join(root, 'engine-state', f)
  const oldCache = (await readJson<Record<string, DeadVerdict>>(state('_dead-screen.json'))) ?? {}
  const cache=Object.fromEntries(Object.entries(oldCache).map(([u,v])=>[u,compactVerdict(v)]))
  const videoRejected = (await readJson<Record<string, string>>(state('_video-rejected.json'))) ?? {}
  const photoRejected = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}
  const asked = new Set<string>() // photos a photo-check verdict judged for dead fish (it has `logo`)
  const legacy = (await readJson<Record<string, { logo?: boolean }>>(state('_photo-check.json'))) ?? {}
  for (const [u, v] of Object.entries(legacy)) if ('logo' in v) asked.add(u)
  const subjects = (await readJson<Record<string, Record<string, { logo?: boolean }>>>(state('_photo-subjects.json'))) ?? {}
  for (const [u, by] of Object.entries(subjects)) if (Object.values(by).some(v => 'logo' in v)) asked.add(u)
  const report = { sheets: 0, judged: 0, dead: [] as string[], failed: [] as string[], left: 0, stopped: '' }

  // Videos first (the owner's find), then main photos; each picture once, with every page that shows it.
  const videos = new Map<string, Item>()
  const photos = new Map<string, Item>()
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const e = await readJson<{ photos?: { url: string }[]; videos?: { youtubeId: string }[] }>(file)
      for (const v of e?.videos ?? []) {
        const key = `youtube:${v.youtubeId}`
        if (v.youtubeId in videoRejected || (key in cache && !(o.backCheck && !cache[key]!.frames))) continue
        const it = videos.get(key) ?? { key, url: thumbnail(v.youtubeId), files: [], video: v.youtubeId }
        it.files.push(file)
        videos.set(key, it)
      }
      const main = e?.photos?.[0]?.url
      if (!main || main in cache || main in photoRejected || asked.has(main)) continue
      const it = photos.get(main) ?? { key: main, url: main, files: [] }
      it.files.push(file)
      photos.set(main, it)
    }
  }
  const todo = [...videos.values(), ...photos.values()]
  const batch = todo.slice(0, o.limit)
  report.left = todo.length - batch.length
  const sheets = Array.from({ length: Math.ceil(batch.length / PER_SHEET) }, (_, i) => batch.slice(i * PER_SHEET, (i + 1) * PER_SHEET))

  const dir = await mkdtemp(join(tmpdir(), 'dead-screen-'))
  const off: Item[] = []
  try {
    await pool(sheets.map((items, i) => ({ items, i })), o.parallel ?? 1, async ({ items, i }) => {
      if (report.stopped) return
      const ok: { it: Item; b: Buffer; frames: boolean }[] = []
      for (const it of items) {
        try {
          const first = Buffer.from(await d.get(it.url))
          if (!it.video) { ok.push({ it, b: first, frames: false }); continue }
          // A frame YouTube doesn't have (a very new or very short video) is passed over.
          const more: Buffer[] = []
          for (const u of videoFrames(it.video).slice(1)) { try { more.push(Buffer.from(await d.get(u))) } catch { /* not published */ } }
          ok.push({ it, b: await videoTile([first, ...more]), frames: more.length > 0 })
        } catch (err) { report.failed.push(`${it.key}: ${photoFailure(err)}`) }
      }
      if (!ok.length) return
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 400, 260, 4, 'contain'))
        const v = await d.look(sheet, DEAD_SCREEN_PROMPT)
        report.sheets++
        for (const t of v.tiles ?? []) {
          const x = ok[t.n - 1]
          if (!x || typeof t.dead !== 'boolean') continue
          cache[x.it.key] = compactVerdict({ dead: t.dead, note: String(t.note ?? '').slice(0, 120), ...(x.frames ? { frames: true } : {}) })
          report.judged++
          if (t.dead) off.push(x.it)
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= photoModelStop(err)
        else report.failed.push(`sheet ${i}: ${photoFailure(err)}`)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // Off the lists and off the pages that show them.
  for (const it of off) {
    const why = `dead: ${cache[it.key]!.note} (the dead-fish screen)`
    report.dead.push(`${it.key}: ${cache[it.key]!.note}`)
    if (it.video) videoRejected[it.video] ??= why
    else photoRejected[it.url] ??= why
    for (const file of it.files) {
      const raw = await readFile(file, 'utf8')
      const e = JSON.parse(raw) as { photos?: { url: string }[]; videos?: { youtubeId: string }[] }
      const next = it.video ? { ...e, videos: (e.videos ?? []).filter(v => v.youtubeId !== it.video) } : { ...e, photos: (e.photos ?? []).filter(p => p.url !== it.url) }
      await writeFile(file, `${JSON.stringify(next, null, indentOf(raw))}\n`)
    }
  }
  const save = (f: string, data: object) => writePhotoState(state(f), data)
  if (report.judged) await save('_dead-screen.json', cache)
  if (off.some(x => x.video)) await save('_video-rejected.json', videoRejected)
  if (off.some(x => !x.video)) await save('_photo-rejected.json', photoRejected)
  return report
}
