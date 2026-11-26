import { albumLooked, askedByCheckOf, completedDeadVerdict, DEAD_OWED_FILE, deadLooked, deadScreenPhotoUrls, FACES_FILE, IMAGE_SWITCHES, ownDeadPhotoUrls, PHOTO_CHECK_FILE, photoLookAnswer, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoClears, photoWaitsFor, publicPhotoVersion, rejectedEntry, facePhotoStatus, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'
import { replacePhotoDocument } from './image-cache-write'
import { compactVerdict, photoFailure, photoModelStop } from './photo-observations'
import { writePhotoState } from './photo-state'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { contactSheet } from './video-images'
import { keptOwnMark, type WatermarkEntry } from './watermarks'
import { entriesDir, holdForSecondLook, lastPhotoVerdicts, looks, pagesShowing, placesIn, readPassedBefore, readSecondLook, waitingEntry, type Stood } from './last-photo'
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
 *
 * In `albums` mode only the screen's own verdict or a person's look counts. A dead version leaves its album
 * when screened, even if it was the album's last photo. Copies on the fish or plant page follow the same verdict.
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
const ALBUM_RETRY_FILE = '_photo-album-dead-retry.json'
export const thumbnail = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
/** A video's thumbnail, then the frames YouTube publishes from about a quarter, half and three quarters through. */
export const videoFrames = (youtubeId: string) => [thumbnail(youtubeId), ...[1, 2, 3].map(n => `https://i.ytimg.com/vi/${youtubeId}/hq${n}.jpg`)]

type Item = { key: string; url: string; files: string[]; video?: string; rejection?: string }
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
export async function screenDead(root: string, d: DeadScreenDeps, o: { limit: number; parallel?: number; backCheck?: boolean; photos?: ReadonlySet<string>; albums?: boolean }) {
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
  const initialLooks = await readSecondLook(root)
  const lookedBefore = deadLooked({ screen: cache, check, subjects, secondLook: initialLooks })
  // `firstOff`: a page's last photo the hold doesn't keep, its first verdict on a photo that never passed the check (last-photo.ts).
  const report = { sheets: 0, judged: 0, dead: [] as string[], held: [] as string[], firstOff: [] as string[], failed: [] as string[], left: 0, stopped: '' }

  // Videos first (the owner's find), then main photos; each picture once, with every page that shows it.
  const sources = (await readJson<Record<string, SourceInfo>>(join(content, 'sources.json'))) ?? {}
  const version = (p: Photo) => publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
  const videos = new Map<string, Item>()
  const photos = new Map<string, Item>()
  const knownDead = new Map<string, Item>()
  const keptAlbumMarks = new Set<string>()
  if (o.albums) {
    const looked = albumLooked({ screen: cache, secondLook: initialLooks })
    const cleared = photoClears(initialLooks)
    const kept = keptOwnMark(photoRejected, (await readJson<Record<string, Pick<WatermarkEntry, 'retainedOwnMark'>>>(state(PHOTO_SCREEN_FILE))) ?? {})
    const effectiveEntry = (url: string) => {
      const entry = isListed(url)
      return entry?.[1].startsWith('watermark:') && (kept(url) || kept(entry[0])) ? undefined : entry
    }
    const albums = await readdir(join(content, 'gallery'))
    for (const name of albums.filter(f => f.endsWith('.json')).sort()) {
      const file = join(content, 'gallery', name)
      const album = JSON.parse(await readFile(file, 'utf8')) as { photos?: Photo[] }
      if (!Array.isArray(album?.photos)) throw new Error(`Album photo inventory unavailable: ${name}`)
      for (const url of new Set(album.photos.flatMap(deadScreenPhotoUrls))) {
        if (!url) continue
        const entry = effectiveEntry(url)
        const record = entry && initialLooks[entry[0]]
        const rejection = entry && (entry[1].startsWith('dead:') ||
          (entry[1].startsWith('waiting:') && record?.off && record.why.startsWith('dead:'))) ? entry[1] : undefined
        if (entry && !rejection) continue
        if (isListed(url) && !entry) keptAlbumMarks.add(url)
        if (rejection && !album.photos.some(photo => {
          if (photo.url !== url) return false
          const original = version(photo)
          return !original || original.url === url || !!effectiveEntry(original.url)
        })) continue
        const alreadyDead = !!rejection || (cache[url]?.dead === true && !cleared(url) && !photoLookAnswer(initialLooks[url]))
        if (!alreadyDead && looked(url)) continue
        const take = alreadyDead ? knownDead : photos
        const it = take.get(url) ?? { key: url, url, files: [], ...(rejection ? { rejection } : {}) }
        it.files.push(file)
        take.set(url, it)
      }
    }
    if (!knownDead.size && (!o.limit || !photos.size)) return { ...report, left: photos.size }
    // A copy picked for a page or guide leaves it at the same push.
    for (const kind of ['species', 'plants', 'breeds', 'guides']) {
      const dir = join(content, kind)
      const pages = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      for (const page of pages.filter(entry => entry.isDirectory())) {
        const file = join(dir, page.name, 'entity.json')
        const entity = JSON.parse(await readFile(file, 'utf8')) as { photos?: Photo[] }
        for (const url of new Set((entity.photos ?? []).flatMap(deadScreenPhotoUrls))) (photos.get(url) ?? knownDead.get(url))?.files.push(file)
      }
    }
  }
  for (const kind of o.albums ? [] : ['species', 'plants']) {
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
  const retry = o.albums ? (await readJson<Record<string, number>>(state(ALBUM_RETRY_FILE))) ?? {} : {}
  const order = new Map([...(o.photos ?? [])].map((u, i) => [u, i]))
  const rank = (url: string) => order.get(url) ?? retry[url] ?? 0
  const todo = [...videos.values(), ...[...photos.values()].sort((a, b) => rank(a.url) - rank(b.url))]
  const batch = todo.slice(0, o.limit)
  report.left = todo.length - batch.length
  const sheets = Array.from({ length: Math.ceil(batch.length / PER_SHEET) }, (_, i) => batch.slice(i * PER_SHEET, (i + 1) * PER_SHEET))

  const dir = await mkdtemp(join(tmpdir(), 'dead-screen-'))
  const off: Item[] = [...knownDead.values()]
  const attempted = new Set<string>()
  try {
    await pool(sheets.map((items, i) => ({ items, i })), o.parallel ?? 1, async ({ items, i }) => {
      if (report.stopped) return
      const ok: { it: Item; b: Buffer; frames: boolean }[] = []
      for (const it of items) {
        attempted.add(it.url)
        try {
          const first = Buffer.from(await d.get(it.url))
          if (!it.video) {
            // Decode each album photo separately so corrupt bytes cannot consume the entire sheet.
            const b = o.albums ? await sharp(first).resize(400, 260, { fit: 'inside', withoutEnlargement: true }).toBuffer() : first
            ok.push({ it, b, frames: false })
            continue
          }
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
        const answers = new Map<number, DeadVerdict>()
        const conflicting = new Set<number>()
        for (const t of v.tiles ?? []) {
          if (!Number.isInteger(t.n) || !ok[t.n - 1] || typeof t.dead !== 'boolean') continue
          const prior = answers.get(t.n)
          if (!prior) answers.set(t.n, t)
          else if (prior.dead !== t.dead) conflicting.add(t.n)
        }
        for (const [tile, t] of answers) {
          const x = ok[tile - 1]!
          if (conflicting.has(tile)) {
            report.failed.push(`${x.it.key}: conflicting screen answers`)
            continue
          }
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

  if (o.albums) {
    const remaining = todo.filter(it => !completedDeadVerdict(cache[it.key]))
    report.left = remaining.length
    const now = Date.now()
    const attempts = Object.fromEntries(remaining.flatMap(({ url }) =>
      attempted.has(url) ? [[url, now]] : Object.hasOwn(retry, url) ? [[url, retry[url]!]] : [],
    ))
    if (Object.keys(attempts).length || Object.keys(retry).length) await writePhotoState(state(ALBUM_RETRY_FILE), attempts)
  }

  // Off the lists and off the pages that show them. A photo whose going would leave a page with nothing stays, held for
  // a second look (last-photo.ts); one the second look cleared stays too.
  const secondLook = await readSecondLook(root)
  const sl = looks(secondLook)
  // A hold on another reason doesn't keep a photo that never passed from this, its first verdict (photo-check.ts spared).
  const passed = photoAddressSet(!o.albums && off.some(x => !x.video) ? await readPassedBefore(root) : [])
  const going = new Set(off.filter(x => !x.video && (sl.open(x.url) || ((sl.waiting(x.url) || sl.held(x.url)) && !passed(x.url)))).map(x => x.url))
  // Photos already listed never-again leave every page anyway (the sweep), so they count as going.
  const last = new Map<string, string[]>()
  if (!o.albums && going.size) {
    const [pages, owned, listed, faces, watermarks] = await Promise.all([
      pagesShowing(content, p => {
        if (!permittedPhotoSource(p, sources)) return undefined
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
  const albumHolds = rejectedEntry(o.albums
    ? Object.fromEntries(Object.entries(secondLook).filter(([url]) => sl.waiting(url)).map(([url, record]) => [url, record.why]))
    : {})
  const albumHold = (url: string) => {
    const key = albumHolds(url)?.[0]
    return key && (sl.waiting(url) || sl.held(url) || isListed(url)?.[0] === key) ? key : undefined
  }
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
    return markedByAddress(original.url) || heldByAddress(original.url) || albumHold(original.url) || sl.off(original.url) || prior?.startsWith('waiting:') ||
      ((!prior || keptAlbumMarks.has(original.url)) && !going.has(original.url))
  }
  for (const it of off) {
    const note = cache[it.key]?.note ?? it.rejection ?? ''
    const why = it.rejection ?? `dead: ${note} (the dead-fish screen)`
    if (!it.video && (!going.has(it.url) || heldByAddress(it.url))) {
      if (held.has(it.url)) { holding.set(it.url, { why, pages: held.get(it.url)! }); report.held.push(`${it.key}: ${held.get(it.url)!.join(', ')}`) }
      continue
    }
    const reviewUrl = albumHold(it.url)
    if (reviewUrl && !entriesDir()) {
      report.failed.push(`${it.key}: take-off waits for its recovery capture`)
      continue
    }
    for (const file of it.files) {
      const { page } = await readPage(file)
      if (it.video) page.videos = (page.videos ?? []).filter(v => v.youtubeId !== it.video)
      else page.photos = (page.photos ?? []).filter(p => p.url !== it.url || retainFallback(p))
    }
    if (reviewUrl) {
      // Keep the existing unanswered review, including its source address, and record the places it can restore.
      const pending = secondLook[reviewUrl]!
      holding.set(reviewUrl, { why: pending.why, pages: pending.pages, off: true })
      photoRejected[reviewUrl] = waitingEntry(pending.why)
      report.dead.push(`${it.key}: ${note}`)
    } else if (!it.video && firstOff.has(it.url)) {
      holding.set(it.url, { why, pages: firstOff.get(it.url)!, off: true })
      report.firstOff.push(`${it.key}: ${firstOff.get(it.url)!.join(', ')}`)
      photoRejected[it.url] ??= waitingEntry(why)
    } else if (it.video || !markedByAddress(it.url)) {
      report.dead.push(`${it.key}: ${note}`)
      if (it.video) videoRejected[it.video] ??= why
      // Album screening records a take-off even when a wrapper stays to carry a passing original.
      else if (!it.rejection) {
        if (keptAlbumMarks.has(it.url)) photoRejected[it.url] = why
        else photoRejected[it.url] ??= why
      }
    }
  }
  // A retry can always find the owning photo until its removal or hold is durable.
  const left = new Map<string, Stood[]>()
  const newFirst = rejectedEntry(Object.fromEntries([...firstOff.keys()].map(url => [url, holding.get(url)!.why])))
  for (const [file, edit] of edits) placesIn(root, file, edit.original, url => {
    if (edit.page.photos?.some(p => p.url === url)) return undefined
    const reviewUrl = albumHold(url)
    return newFirst(url)?.[0] ?? (reviewUrl && holding.has(reviewUrl) ? reviewUrl : undefined)
  }, left)
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
