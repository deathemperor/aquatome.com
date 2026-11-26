import { askedByCheckOf, completedDeadVerdict, DEAD_OWED_FILE, deadLooked, deadScreenPhotoUrls, FACES_FILE, IMAGE_SWITCHES, ownDeadPhotoUrls, PHOTO_CHECK_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoWaitsFor, publicPhotoVersion, rejectedEntry, facePhotoStatus, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'
import { replacePhotoDocument } from './image-cache-write'
import { compactVerdict, photoFailure, photoModelStop } from './photo-observations'
import { writePhotoState } from './photo-state'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { contactSheet } from './video-images'
import { holdForSecondLook, lastPhotoVerdicts, looks, pagesShowing, placesIn, readPassedBefore, readSecondLook, waitingEntry, type Stood } from './last-photo'
import { permittedPhotoSource } from './photo-visibility'

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
 *
 * `photos`: these photos alone, in the order given, wherever they stand on a page, and no videos. The faces step passes
 * the photos it owes a look, so a dead fish new to a page is off it at that run's push, not hours later at the photo
 * check's first verdict (faces.ts screenNewPhotos; the chief of staff, 21 Nov 2026).
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
- dead: true if any picture on it shows a dead fish or other dead animal, or fish as food: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a fish lying on the ground, a road, a floor, a board, a tray, a mesh, a ruler or a tape measure; a big catch hung up or held up by an angler; a preserved, mounted, museum or lab specimen, in a jar, on a specimen plate, or laid out flat on a plain or gridded background for a photo (for a snail, an empty shell; for a plant, a pressed herbarium sheet). A fish on a hook or a line, in the water or not, is a catch: dead. When you can't tell whether a fish lying out of the water is alive, it is dead. Not dead: a live fish in water, on no hook or line (a tank, a pond, a river, a tub, a cup, a bag, a photo tank), a small live fish on no hook or line, held in a hand or a net for a moment, a drawing, painting or graphic.
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

/** Photos a photo-check verdict judged for dead fish (it has `logo`): the check asked, so the screen doesn't. */
export async function askedByCheck(root: string): Promise<Set<string>> {
  const state = (f: string) => join(root, 'engine-state', f)
  return askedByCheckOf(await readJson<Record<string, unknown>>(state('_photo-check.json')), await readJson<Record<string, unknown>>(state('_photo-subjects.json')))
}

/** `backCheck`: also the videos judged from their thumbnail alone (the screen's verdicts from before it saw frames). */
export async function screenDead(root: string, d: DeadScreenDeps, o: { limit: number; parallel?: number; backCheck?: boolean; photos?: ReadonlySet<string> }) {
  const content = join(root, 'content')
  const state = (f: string) => join(root, 'engine-state', f)
  const records = (await readJson<Record<string, DeadVerdict>>(state('_dead-screen.json'))) ?? {}
  const oldCache = Object.fromEntries(Object.entries(records).filter(([, verdict]) => completedDeadVerdict(verdict)))
  const cache=Object.fromEntries(Object.entries(oldCache).map(([u,v])=>[u,compactVerdict(v)]))
  const videoRejected = (await readJson<Record<string, string>>(state('_video-rejected.json'))) ?? {}
  const photoRejected = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}
  const [check, subjects] = await Promise.all([
    readJson<Record<string, unknown>>(state(PHOTO_CHECK_FILE)),
    readJson<Record<string, unknown>>(state(PHOTO_SUBJECTS_FILE)),
  ])
  const isListed = rejectedEntry(photoRejected)
  const lookedBefore = deadLooked({ screen: cache, check, subjects, secondLook: await readSecondLook(root) })
  // `firstOff`: a page's last photo the hold doesn't keep, its first verdict on a photo that never passed the check (last-photo.ts).
  const report = { sheets: 0, judged: 0, dead: [] as string[], held: [] as string[], firstOff: [] as string[], failed: [] as string[], left: 0, stopped: '' }

  // Videos first (the owner's find), then main photos; each picture once, with every page that shows it.
  const sources = (await readJson<Record<string, SourceInfo>>(join(content, 'sources.json'))) ?? {}
  const version = (p: Photo) => publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
  const videos = new Map<string, Item>()
  const photos = new Map<string, Item>()
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const e = await readJson<{ photos?: Photo[]; videos?: { youtubeId: string }[] }>(file)
      for (const v of o.photos ? [] : e?.videos ?? []) {
        const key = `youtube:${v.youtubeId}`
        if (v.youtubeId in videoRejected || (key in cache && !(o.backCheck && !cache[key]!.frames))) continue
        const it = videos.get(key) ?? { key, url: thumbnail(v.youtubeId), files: [], video: v.youtubeId }
        it.files.push(file)
        videos.set(key, it)
      }
      const head = e?.photos?.[0]
      const urls = o.photos ? [...new Set((e?.photos ?? []).flatMap(deadScreenPhotoUrls))].filter(u => o.photos!.has(u))
        : [head && version(head)?.url]
      for (const url of urls) {
        if (!url || isListed(url) || lookedBefore(url)) continue
        const it = photos.get(url) ?? { key: url, url, files: [] }
        it.files.push(file)
        photos.set(url, it)
      }
    }
  }
  const order = new Map([...(o.photos ?? [])].map((u, i) => [u, i]))
  const todo = [...videos.values(), ...[...photos.values()].sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0))]
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

  // Off the lists and off the pages that show them. A photo whose going would leave a page with nothing stays, held for
  // a second look (last-photo.ts); one the second look cleared stays too.
  const secondLook = await readSecondLook(root)
  const sl = looks(secondLook)
  // A hold on another reason doesn't keep a photo that never passed from this, its first verdict (photo-check.ts spared).
  const passed = photoAddressSet(off.some(x => !x.video) ? await readPassedBefore(root) : [])
  const going = new Set(off.filter(x => !x.video && (sl.open(x.url) || ((sl.waiting(x.url) || sl.held(x.url)) && !passed(x.url)))).map(x => x.url))
  // Photos already listed never-again leave every page anyway (the sweep), so they count as going.
  const last = new Map<string, string[]>()
  if (going.size) {
    const [pages, owned, listed, faces, watermarks] = await Promise.all([
      pagesShowing(content, (p, ref, scientificName) => {
        if (!permittedPhotoSource(p, sources, ref, scientificName)) return undefined
        const reason = isListed(p.url)?.[1]
        // The sweep removes the whole wrapper for a rejection that applies to the photo as a whole.
        if (reason && !/^(?:dead|people|waiting): /.test(reason)) return p.url
        const shown = version(p)?.url
        return shown && !setsCookies(shown) ? shown : undefined
      }),
      ownDeadPhotoUrls(content),
      o.photos ? undefined : readJson<Record<string, string>>(state(DEAD_OWED_FILE)),
      readJson<Record<string, number>>(state(FACES_FILE)),
      readJson<Record<string, PhotoScreenEntry>>(state(PHOTO_SCREEN_FILE)),
    ])
    const looked = deadLooked({ screen: cache, check, subjects, secondLook })
    const { unread, altered: flaggedAlterations } = await facePhotoStatus(content, faces)
    const unjudged = new Set([...owned].filter(url => !looked(url)))
    const waits = photoWaitsFor({ watermarks, owed: listed, unread, flaggedAlterations, faces, unjudged, deadScreen: oldCache, secondLook })
    const unavailable = (u: string) => !!isListed(u) || waits(u)
    for (const [url, refs] of lastPhotoVerdicts(pages, unavailable, going)) last.set(url, refs)
  }
  // Only one that passed the check before is held; this verdict, on one that never did, takes it off, marked (last-photo.ts).
  const held = new Map([...last].filter(([u]) => passed(u)))
  const firstOff = new Map([...last].filter(([u]) => !passed(u)))
  const heldByAddress = photoAddressSet(held.keys())
  const markedByAddress = photoAddressSet(firstOff.keys())
  const holding = new Map<string, { why: string; pages: string[]; off?: true }>()
  type Page = { photos?: Photo[]; videos?: { youtubeId: string }[] }
  const edits = new Map<string, { raw: string; original: Page; page: Page }>()
  const readPage = async (file: string) => {
    const had = edits.get(file)
    if (had) return had
    const raw = await readFile(file, 'utf8')
    const original = JSON.parse(raw) as Page
    const edit = { raw, original, page: { ...original } }
    edits.set(file, edit)
    return edit
  }
  const retainFallback = (p: Photo) => {
    const original = version(p)
    if (!original || original.url === p.url) return false
    // The wrapper holds the original's credit and other metadata until the person's decision or next look.
    const prior = photoRejected[original.url]
    return markedByAddress(original.url) || heldByAddress(original.url) || sl.off(original.url) || prior?.startsWith('waiting:') ||
      (!prior && !going.has(original.url))
  }
  for (const it of off) {
    const why = `dead: ${cache[it.key]!.note} (the dead-fish screen)`
    if (!it.video && (!going.has(it.url) || heldByAddress(it.url))) {
      if (held.has(it.url)) { holding.set(it.url, { why, pages: held.get(it.url)! }); report.held.push(`${it.key}: ${held.get(it.url)!.join(', ')}`) }
      continue
    }
    for (const file of it.files) {
      const { page } = await readPage(file)
      if (it.video) page.videos = (page.videos ?? []).filter(v => v.youtubeId !== it.video)
      else page.photos = (page.photos ?? []).filter(p => p.url !== it.url || retainFallback(p))
    }
    if (!it.video && firstOff.has(it.url)) {
      holding.set(it.url, { why, pages: firstOff.get(it.url)!, off: true })
      report.firstOff.push(`${it.key}: ${firstOff.get(it.url)!.join(', ')}`)
      photoRejected[it.url] ??= waitingEntry(why)
    } else if (it.video || !markedByAddress(it.url)) {
      report.dead.push(`${it.key}: ${cache[it.key]!.note}`)
      if (it.video) videoRejected[it.video] ??= why
      else photoRejected[it.url] ??= why
    }
  }
  // A retry can always find the owning photo until its removal or hold is durable.
  const left = new Map<string, Stood[]>()
  const newFirst = rejectedEntry(Object.fromEntries([...firstOff.keys()].map(url => [url, holding.get(url)!.why])))
  for (const [file, edit] of edits) placesIn(root, file, edit.original, url => edit.page.photos?.some(p => p.url === url) ? undefined : newFirst(url)?.[0], left)
  await holdForSecondLook(root, holding, 'the dead-fish screen', undefined, left)
  const save = (f: string, data: object) => writePhotoState(state(f), data)
  if (off.some(x => x.video)) await save('_video-rejected.json', videoRejected)
  if (off.some(x => !x.video && going.has(x.url) && !heldByAddress(x.url))) await save('_photo-rejected.json', photoRejected)
  if (report.judged) await save('_dead-screen.json', cache)
  for (const [file, { raw, page }] of edits) {
    const next = `${JSON.stringify(page, null, indentOf(raw))}\n`
    if (next !== raw) await replacePhotoDocument(file, next)
  }
  return report
}
