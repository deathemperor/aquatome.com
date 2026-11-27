import { albumLooked, askedByCheckOf, completedDeadVerdict, DEAD_OWED_FILE, deadLooked, deadScreenPhotoUrls, expandWholePhotoRejections, reviewedPhotoVersion, FACES_FILE, GUIDE_LOOKS_FILE, IMAGE_SWITCHES, ownDeadPhotoUrls, PHOTO_CHECK_FILE, photoLookAnswer, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoClears, photoKey, photoRejections, photoVersionAddressSet, photoWaitsFor, publicPhotoVersion, rejectedEntry, facePhotoStatus, setsCookies, type Photo, type PhotoScreenEntry } from '@aq/schema'
import { albumReceipts, albumTakeOffApplied, albumTakeOffKey, completeAlbumReceipts, pendingAlbumTakeOff, recordAlbumTakeOffs, type TakeOffReceipt } from './album-takeoffs'
import { replacePhotoDocument } from './image-cache-write'
import { compactRejection, compactVerdict, photoFailure, photoModelStop } from './photo-observations'
import { writePhotoState } from './photo-state'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { contactSheet } from './video-images'
import { entriesDir, holdForSecondLook, lastPhotoVerdicts, looks, ownsWaiting, pagesShowing, placesIn, readPassedBefore, readSecondLook, verdictAddressSet, waitingEntry, waitingReview, type Stood } from './last-photo'
import { permittedPhotoSource, readCreditHoldWait, readPhotoSources } from './photo-visibility'

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
export { acknowledgeAlbumTakeOffs } from './album-takeoffs'

export const thumbnail = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
/** A video's thumbnail, then the frames YouTube publishes from about a quarter, half and three quarters through. */
export const videoFrames = (youtubeId: string) => [thumbnail(youtubeId), ...[1, 2, 3].map(n => `https://i.ytimg.com/vi/${youtubeId}/hq${n}.jpg`)]

type Item = { key: string; url: string; files: string[]; video?: string; rejection?: string; agreement?: [string, string] }
async function readJson<T>(path: string): Promise<T | undefined> {
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  return raw === undefined ? undefined : JSON.parse(raw) as T
}
type PhotoDocument = { photos?: Photo[]; kinds?: { photo?: Photo }[]; video?: { figures?: { photo?: Photo; moments?: unknown[] }[] }; videos?: { youtubeId: string }[] }
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
  const [check, subjects, guideLooks] = await Promise.all([
    readJson<Record<string, unknown>>(state(PHOTO_CHECK_FILE)),
    readJson<Record<string, unknown>>(state(PHOTO_SUBJECTS_FILE)),
    readJson<Record<string, unknown>>(state(GUIDE_LOOKS_FILE)),
  ])
  const watermarkCache = await readJson<Record<string, PhotoScreenEntry>>(state(PHOTO_SCREEN_FILE))
  const initialLooks = await readSecondLook(root)
  const reviewed = reviewedPhotoVersion(initialLooks, check, subjects)
  const hasOwnAlbumDecision = (url: string) => reviewed(url) || Object.hasOwn(initialLooks, url) || completedDeadVerdict(cache[url])
  const separateVersion = o.albums ? hasOwnAlbumDecision : reviewed
  const isListed = photoRejections(await expandWholePhotoRejections(content, photoRejected, watermarkCache), watermarkCache, separateVersion)
  const initialClears = photoClears(initialLooks)
  const lookedBefore = deadLooked({ screen: cache, check, subjects, secondLook: initialLooks })
  // `firstOff`: a page's last photo the hold doesn't keep, its first verdict on a photo that never passed the check (last-photo.ts).
  const report = { sheets: 0, judged: 0, dead: [] as string[], pendingTakeOffs: 0, albumBatches: [] as { id: string; urls: string[] }[], held: [] as string[], firstOff: [] as string[], failed: [] as string[], left: 0, stopped: '' }
  const galleryDir = join(content, 'gallery') + '/'

  const receipts: Record<string, TakeOffReceipt> = o.albums ? await albumReceipts(root) : {}
  const applied = new Map<string, string>()
  const deferred = new Set<string>()
  const reportDead = (url: string, note: string) => {
    const line = `${url}: ${note}`
    if (o.albums) applied.set(url, line)
    else report.dead.push(line)
  }
  const reportAlbumTakeOffs = async () => {
    const pending = photoVersionAddressSet(deferred)
    const completed = Object.keys(receipts).filter(url => pendingAlbumTakeOff(receipts[url]) && !pending(url))
    const ignored = completed.filter(url => initialClears(url) && !isListed(url)?.[1].startsWith('dead:') &&
      !albumTakeOffApplied(receipts[url]) && presentVersions.has(albumTakeOffKey(url)))
    const ready = completed.filter(url => !ignored.includes(url))
    const batches = await completeAlbumReceipts(root, ready, ignored)
    report.dead.push(...ready.map(url => applied.get(url) ?? `${url}: dead screen dead`))
    report.albumBatches = batches
  }

  // Videos first (the owner's find), then main photos; each picture once, with every page that shows it.
  const sources = await readPhotoSources(content)
  const version = (p: Photo) => publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
  const videos = new Map<string, Item>()
  const photos = new Map<string, Item>()
  const knownDead = new Map<string, Item>()
  const albumFiles = new Map<string, Set<string>>()
  const presentVersions = new Set<string>()
  if (o.albums) {
    const looked = albumLooked({ screen: cache, secondLook: initialLooks })
    const cleared = initialClears
    const agreedDead = photoRejections(Object.fromEntries(Object.entries(initialLooks)
      .filter(([, mark]) => mark.why.startsWith('dead:') && photoLookAnswer(mark)?.said === 'agree')
      .map(([url, mark]) => [url, mark.why])), {}, hasOwnAlbumDecision)
    const cachedDead = photoAddressSet(Object.keys(cache).filter(url => cache[url]?.dead === true))
    const pendingReceipt = photoVersionAddressSet(Object.keys(receipts).filter(url => pendingAlbumTakeOff(receipts[url])))
    const knownTakeOff = (url: string): Item | undefined => {
      const listed = isListed(url)
      const entry = listed?.[1]
      const agreement = entry?.startsWith('dead:') ? undefined : agreedDead(url)
      const review = listed && waitingReview(initialLooks, listed[0], listed[1])
      const record = review?.[1]
      const waiting = entry?.startsWith('waiting:')
      const cached = !cleared(url) && (pendingReceipt(url) || (completedDeadVerdict(cache[url]) ? cache[url]?.dead : !hasOwnAlbumDecision(url) && cachedDead(url)))
      if (waiting && !cleared(url) && !agreement && !record && cached && !deferred.has(url)) {
        deferred.add(url)
        report.pendingTakeOffs++
      }
      if (entry?.startsWith('dead:') || (waiting && record && !cleared(url) && ((record.off && record.why.startsWith('dead:')) || cached)) ||
          (!entry && cached) || agreement || (pendingReceipt(url) && !waiting && !cleared(url))) {
        return { key: url, url, files: [], rejection: entry, agreement }
      }
      return undefined
    }
    const albums = await readdir(join(content, 'gallery'))
    for (const name of albums.filter(f => f.endsWith('.json')).sort()) {
      const file = join(content, 'gallery', name)
      const album = JSON.parse(await readFile(file, 'utf8')) as { photos?: Photo[] }
      if (!Array.isArray(album?.photos)) throw new Error(`Album photo inventory unavailable: ${name}`)
      for (const url of new Set(album.photos.flatMap(deadScreenPhotoUrls))) {
        if (!url) continue
        presentVersions.add(albumTakeOffKey(url))
        const key = photoKey(url) ?? url
        if (!albumFiles.has(key)) albumFiles.set(key, new Set())
        albumFiles.get(key)!.add(file)
        const dead = knownDead.get(url) ?? knownTakeOff(url)
        if (!dead && (isListed(url) || looked(url))) continue
        const take = dead ? knownDead : photos
        const it = dead ?? photos.get(url) ?? { key: url, url, files: [] }
        take.set(url, it)
      }
    }
    for (const [url, receipt] of Object.entries(receipts)) {
      if (!pendingAlbumTakeOff(receipt) || knownDead.has(url)) continue
      const dead = knownTakeOff(url)
      if (dead) knownDead.set(url, dead)
    }
    if (!knownDead.size && (!o.limit || !photos.size)) {
      await reportAlbumTakeOffs()
      return { ...report, left: photos.size }
    }
    // Copies can use the source address, its mirror, or a guide's stock slot.
    const byPhoto = new Map<string, Item[]>()
    for (const item of [...photos.values(), ...knownDead.values()]) {
      const key = photoKey(item.url) ?? item.url
      item.files.push(...(albumFiles.get(key) ?? []))
      byPhoto.set(key, [...(byPhoto.get(key) ?? []), item])
    }
    for (const kind of ['species', 'plants', 'breeds', 'guides', 'glossary']) {
      const dir = join(content, kind)
      const pages = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      for (const page of pages.filter(entry => entry.isDirectory())) {
        const file = join(dir, page.name, 'entity.json')
        const entity = JSON.parse(await readFile(file, 'utf8')) as PhotoDocument
        const stock = (entity.video?.figures ?? []).flatMap(figure => figure.photo ? [figure.photo] : [])
        const glossary = (entity.kinds ?? []).flatMap(kind => kind.photo ? [kind.photo] : [])
        const keys = new Set([...(entity.photos ?? []), ...stock, ...glossary].flatMap(deadScreenPhotoUrls).map(url => photoKey(url) ?? url))
        for (const key of keys) for (const it of byPhoto.get(key) ?? []) it.files.push(file)
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

  // Off the lists and off the pages that show them. A photo whose going would leave a page with nothing stays, held for
  // a second look (last-photo.ts); one the second look cleared stays too.
  const secondLook = initialLooks
  // A hold on another reason doesn't keep a photo that never passed from this, its first verdict (photo-check.ts spared).
  const passed = photoVersionAddressSet(!o.albums && off.some(x => !x.video) ? await readPassedBefore(root) : [])
  const sl = looks(secondLook, passed)
  const clearedAlbum = photoClears(secondLook)
  const going = new Set(off.filter(x => !x.video && (o.albums
    ? !!x.agreement || x.rejection?.startsWith('dead:') || !clearedAlbum(x.url)
    : !sl.clearedPhoto(x.url) && !sl.pendingOff(x.url) && (sl.open(x.url) || ((sl.waiting(x.url) || sl.held(x.url)) && !passed(x.url))))).map(x => x.url))
  // Photos already listed never-again leave every page anyway (the sweep), so they count as going.
  const last = new Map<string, string[]>()
  if (!o.albums && going.size) {
    const [pages, owned, listed, faces] = await Promise.all([
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
    ])
    const looked = deadLooked({ screen: cache, check, subjects, secondLook })
    const { unread } = await facePhotoStatus(content, faces)
    const unjudged = new Set([...owned].filter(url => !looked(url)))
    const waits = photoWaitsFor({ watermarks: watermarkCache, owed: listed, unread, faces, unjudged, lookedForDead: looked, check, subjects, deadScreen: oldCache, guideLooks, secondLook })
    const heldForCredit = await readCreditHoldWait(root)
    const unavailable = (u: string) => !!isListed(u) || heldForCredit(u) || waits(u)
    for (const [url, refs] of lastPhotoVerdicts(pages, unavailable, going, undefined, undefined, true)) last.set(url, refs)
  }
  // Only one that passed the check before is held; this verdict, on one that never did, takes it off, marked (last-photo.ts).
  const held = new Map([...last].filter(([u]) => passed(u)))
  const firstOff = new Map([...last].filter(([u]) => !passed(u)))
  const heldByAddress = verdictAddressSet(held.keys(), going)
  const markedByAddress = verdictAddressSet(firstOff.keys(), going)
  const canCapture = !!entriesDir()
  const albumHolds = rejectedEntry(o.albums
    ? Object.fromEntries(Object.entries(secondLook).filter(([url]) => sl.waiting(url)).map(([url, record]) => [url, record.why]))
    : {})
  const albumHold = (url: string) => {
    if (!o.albums) return undefined
    const entry = isListed(url)
    if (entry?.[1].startsWith('waiting:')) {
      const review = waitingReview(secondLook, entry[0], entry[1])
      return review && sl.waiting(review[0]) ? review[0] : undefined
    }
    const key = albumHolds(url)?.[0]
    return key && (sl.waiting(url) || sl.held(url) || sl.pendingOff(url) || isListed(url)?.[0] === key) ? key : undefined
  }
  const holding = new Map<string, { why: string; pages: string[]; off?: true }>()
  type Page = PhotoDocument
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
  const appliesTo = (addresses: Iterable<string>) => {
    const sameVersion = photoVersionAddressSet(addresses)
    const samePhoto = photoAddressSet(addresses)
    return (url: string) => sameVersion(url) || (!hasOwnAlbumDecision(url) && samePhoto(url))
  }
  const goingByAddress = o.albums ? appliesTo(going) : (url: string) => going.has(url)
  const retainFallback = (p: Photo) => {
    const original = version(p)
    if (!original || original.url === p.url) return false
    // The wrapper holds the original's credit and other metadata until the person's decision or next look.
    const prior = isListed(original.url)?.[1]
    return (o.albums && clearedAlbum(original.url) && !prior?.startsWith('dead:')) ||
      markedByAddress(original.url) || heldByAddress(original.url) || albumHold(original.url) || sl.off(original.url) || prior?.startsWith('waiting:') ||
      (!prior && !goingByAddress(original.url))
  }
  const receipted = photoVersionAddressSet(Object.keys(receipts))
  for (const it of off) {
    const note = cache[it.key]?.note ?? (it.rejection ? compactRejection(it.rejection) : '')
    const why = it.agreement?.[1] ?? it.rejection ?? `dead: ${note} (the dead-fish screen)`
    if (!it.video && (!going.has(it.url) || heldByAddress(it.url))) {
      if (held.has(it.url)) { holding.set(it.url, { why, pages: held.get(it.url)! }); report.held.push(`${it.key}: ${held.get(it.url)!.join(', ')}`) }
      continue
    }
    const reviewUrl = it.agreement || it.rejection?.startsWith('dead:') ? undefined : albumHold(it.url)
    if (reviewUrl && !canCapture) {
      report.pendingTakeOffs++
      deferred.add(it.url)
      report.failed.push(`${it.key}: take-off waits for its recovery capture`)
      continue
    }
    const matches = o.albums ? appliesTo([it.url]) : (url: string) => url === it.url
    const remove = (photo: Photo) => matches(photo.url) && !retainFallback(photo) &&
      (!o.albums || !clearedAlbum(photo.url) || photoRejected[photo.url]?.startsWith('dead:') || it.agreement?.[0] === photo.url)
    let removed = false
    if (canCapture || !markedByAddress(it.url)) for (const file of new Set(it.files)) {
      const { page } = await readPage(file)
      if (it.video) page.videos = (page.videos ?? []).filter(v => v.youtubeId !== it.video)
      else {
        if (reviewUrl && file.startsWith(join(content, 'glossary') + '/')) continue
        const prior = page.photos ?? []
        if (prior.some(remove)) {
          page.photos = prior.filter(p => !remove(p))
          removed = true
        }
        // A waiting stock copy keeps its raw slot for a clear. The rejection already keeps it off the public page.
        if (o.albums && !reviewUrl && page.video?.figures?.some(f => f.photo && remove(f.photo))) {
          page.video = { ...page.video, figures: page.video.figures.map(f => f.photo && remove(f.photo) ? { ...f, photo: undefined } : f)
            .filter(f => f.photo || f.moments?.length) }
          removed = true
        }
        if (o.albums && !reviewUrl && page.kinds?.some(k => k.photo && remove(k.photo))) {
          page.kinds = page.kinds.filter(k => !k.photo || !remove(k.photo))
          if (!page.kinds.length) delete page.kinds
          removed = true
        }
      }
    }
    const retainedVersion = o.albums && (reviewUrl || it.rejection?.startsWith('dead:')) &&
      presentVersions.has(albumTakeOffKey(it.url)) && !receipted(it.url)
    if (it.rejection && !it.agreement && !removed && !retainedVersion) continue
    if (reviewUrl) {
      // Keep the existing unanswered review, including its source address, and record the places it can restore.
      const pending = secondLook[reviewUrl]!
      holding.set(reviewUrl, { why: pending.why, pages: pending.pages, off: true })
      if (!ownsWaiting(pending, it.rejection)) photoRejected[reviewUrl] = waitingEntry(pending.why)
      reportDead(it.key, note)
    } else if (!it.video && firstOff.has(it.url)) {
      holding.set(it.url, { why, pages: firstOff.get(it.url)!, off: true })
      report.firstOff.push(`${it.key}: ${firstOff.get(it.url)!.join(', ')}`)
      photoRejected[it.url] = waitingEntry(why)
    } else if (it.video || !markedByAddress(it.url)) {
      reportDead(it.key, note)
      if (it.video) videoRejected[it.video] ??= why
      // Album screening records a take-off even when a wrapper stays to carry a passing original.
      else if (it.agreement) {
        const [address] = it.agreement
        if (!photoRejected[address] || photoRejected[address].startsWith('waiting:')) photoRejected[address] = why
      } else if (!it.rejection) {
        photoRejected[it.url] = why
      }
    }
  }
  // A retry can always find the owning photo until its removal or hold is durable.
  const left = new Map<string, Stood[]>()
  const newFirst = rejectedEntry(Object.fromEntries([...firstOff.keys()].map(url => [url, holding.get(url)!.why])))
  for (const [file, edit] of edits) placesIn(root, file, edit.original, (url, slot) => {
    if (edit.page.photos?.includes(slot.photo as Photo)) return undefined
    const reviewUrl = albumHold(url)
    return newFirst(url)?.[0] ?? (reviewUrl && holding.has(reviewUrl) ? reviewUrl : undefined)
  }, left)
  const save = (f: string, data: object) => writePhotoState(state(f), data)
  // Record the planned take-off before either a rejection or an off mark could cause another step to strip it.
  if (applied.size) Object.assign(receipts, await recordAlbumTakeOffs(root, applied.keys()))
  await holdForSecondLook(root, holding, 'the dead-fish screen', undefined, left)
  if (off.some(x => x.video)) await save('_video-rejected.json', videoRejected)
  if (off.some(x => !x.video && going.has(x.url) && !heldByAddress(x.url))) await save('_photo-rejected.json', photoRejected)
  if (report.judged) await save('_dead-screen.json', cache)
  // While a linked page still needs an edit, keep its album entry so a retry finds the take-off again.
  const writes = [...edits].sort(([a], [b]) => Number(a.startsWith(galleryDir)) - Number(b.startsWith(galleryDir)))
  for (const [file, { raw, page }] of writes) {
    const next = `${JSON.stringify(page, null, indentOf(raw))}\n`
    if (next !== raw) await replacePhotoDocument(file, next)
  }
  if (o.albums) {
    const placed = new Map(writes.filter(([file]) => file.startsWith(galleryDir)).map(([file, edit]) =>
      [file, new Set((edit.page.photos ?? []).flatMap(deadScreenPhotoUrls))]))
    const effective = await expandWholePhotoRejections(content, photoRejected, watermarkCache)
    const listed = photoRejections(effective, watermarkCache, separateVersion)
    const remaining = todo.filter(it => !completedDeadVerdict(cache[it.key]) && !listed(it.url) &&
      it.files.some(file => file.startsWith(galleryDir) && (placed.get(file)?.has(it.url) ?? true)))
    report.left = remaining.length
    const now = Date.now()
    const attempts = Object.fromEntries(remaining.flatMap(({ url }) =>
      attempted.has(url) ? [[url, now]] : Object.hasOwn(retry, url) ? [[url, retry[url]!]] : [],
    ))
    if (Object.keys(attempts).length || Object.keys(retry).length) await writePhotoState(state(ALBUM_RETRY_FILE), attempts)
    if (applied.size) Object.assign(receipts, await recordAlbumTakeOffs(root, applied.keys(), true))
    await reportAlbumTakeOffs()
  }
  return report
}
