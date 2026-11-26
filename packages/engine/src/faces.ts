import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, deadScreenPhotoUrls, IMAGE_SWITCHES, ownDeadPhotoUrls, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoWaitsFor, publicPhotoVersion, rejectedEntry, SECOND_LOOK_RECORD, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'
import { screenDead, type DeadScreenDeps } from './dead-screen'
import { photoFailure } from './photo-observations'
import { writePhotoState } from './photo-state'
import { captureWaiting, holdForSecondLook, lastPhotoVerdicts, looks, pagesShowing, placesIn, readPassedBefore, readSecondLook, waitingEntry, withoutSettledWaits, type Stood } from './last-photo'

export type FaceDeps = { get: (url: string) => Promise<Uint8Array>; detect: (files: string[]) => Promise<number[]> }

/** Human faces per image via macOS Vision (the engine runs on the home Mac); -1 = unreadable. */
export async function visionFaces(files: string[]): Promise<number[]> {
  const script = fileURLToPath(new URL('../vision/faces.swift', import.meta.url))
  const out: number[] = []
  for (let i = 0; i < files.length; i += 200) {
    const { stdout } = await promisify(execFile)('swift', [script, ...files.slice(i, i + 200)], { maxBuffer: 1 << 20 })
    out.push(...stdout.trim().split('\n').map(Number))
  }
  if (out.length !== files.length) throw new Error(`faces: ${out.length} results for ${files.length} images`)
  return out
}

/**
 * Photos must show the animal or plant, not people: every photo not yet screened is checked once (result cached by URL)
 * and any photo with a human face is dropped from its page, as is any photo the owner rejected by hand (`rejectedFile`:
 * URL → reason; hands, product packshots, English-text banners), and so is a video section's photo the owner rejected.
 * Runs each cycle, so a re-picked photo never publishes. `root`: where engine-state is, for the second look
 * (last-photo.ts). `enrol` receives the new URLs before the face pass writes anything and returns the URLs that must
 * wait for the dead-fish screen. A throw from it stops the pass.
 */
export async function dropFacePhotos(contentRoot: string, cacheFile: string, d: FaceDeps, rejectedFile?: string, root = join(contentRoot, '..'), enrol?: (fresh: string[]) => Promise<ReadonlySet<string>>): Promise<{ checked: number; fresh: string[]; screened: string[]; removed: string[]; held: string[]; firstOff: string[]; failed: string[] }> {
  const cache: Record<string, number> = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const before = await readSecondLook(root)
  const rejected: Record<string, string> = rejectedFile
    ? withoutSettledWaits(JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')), before)
    : {}
  const listed = rejectedEntry(rejected)
  const pages: { file: string; e: { photos?: Photo[]; video?: { figures?: { photo?: Photo }[] } } }[] = []
  for (const kind of ['species', 'plants', 'guides']) {
    for (const id of await readdir(join(contentRoot, kind)).catch(() => [] as string[])) {
      const file = join(contentRoot, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (raw) pages.push({ file, e: JSON.parse(raw) })
    }
  }
  const photoUrls = (p: Photo) => enrol ? deadScreenPhotoUrls(p) : [p.url]
  const todo = [...new Set(pages.flatMap(p => (p.e.photos ?? []).flatMap(photoUrls)))].filter(u => !(u in cache) && !listed(u))
  const waitingForDead = await enrol?.(todo)
  const failed: string[] = []
  // Screened in this run: its verdict is the photo's first from this step.
  const screened = new Set<string>()
  const dir = await mkdtemp(join(tmpdir(), 'faces-'))
  try {
    const files: { url: string; file: string }[] = []
    for (const [i, url] of todo.entries()) {
      try {
        const file = join(dir, String(i))
        await writeFile(file, await d.get(url))
        files.push({ url, file })
      } catch (err) {
        failed.push(`${url}: ${(err as Error).message.slice(0, 120)}`) // not cached: retried next cycle
      }
    }
    const counts = files.length ? await d.detect(files.map(f => f.file)) : []
    files.forEach((f, i) => { if (counts[i]! >= 0) { cache[f.url] = counts[i]!; screened.add(f.url) } })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  // A face takes a photo off, unless its going would leave a species, plant or breed page with nothing: then it stays,
  // held for a second look (last-photo.ts). One the second look cleared stays too.
  const secondLook = await readSecondLook(root)
  const sl = looks(secondLook)
  // A hold on another reason doesn't keep a photo that never passed from a face found now, its first verdict (photo-check.ts spared).
  const passed = photoAddressSet(await readPassedBefore(root))
  const face = (u: string) => cache[u]! > 0 && (sl.open(u) || (sl.waiting(u) && screened.has(u) && !passed(u)))
  const screen = waitingForDead && await readPhotoRecord(root, DEAD_SCREEN_FILE)
  const sources: Record<string, SourceInfo> = waitingForDead
    ? JSON.parse(await readFile(join(contentRoot, 'sources.json'), 'utf8').catch(() => '{}'))
    : {}
  const watermarks = waitingForDead && await readFile(join(root, 'engine-state', PHOTO_SCREEN_FILE), 'utf8')
    .then(raw => JSON.parse(raw) as Record<string, PhotoScreenEntry>, () => undefined)
  const version = (p: Photo) =>
    publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
  // A stored alteration and its original can have separate decisions. Keep the credited wrapper for its other version.
  const keepsOriginal = (p: Photo) => {
    const original = photoUrls(p)[1]
    const why = listed(p.url)?.[1]
    const versionRejection = !why || /^(?:dead|people|waiting): /.test(why)
    const originalRejection = original && listed(original)?.[1]
    return versionRejection && !!original && (!originalRejection || originalRejection.startsWith('waiting:'))
  }
  const dropsStored = (p: Photo) => !keepsOriginal(p) && (!!listed(p.url) || face(p.url))
  const pagesToKeep = await pagesShowing(contentRoot, p => {
    if (!waitingForDead || dropsStored(p)) return p.url
    const shown = version(p)?.url
    return shown && !setsCookies(shown) ? shown : undefined
  })
  const unread = new Set(todo.filter(u => !Object.hasOwn(cache, u)))
  const waits = waitingForDead && photoWaitsFor({ watermarks, unjudged: waitingForDead, unread, deadScreen: screen, secondLook })
  const flagVerdicts = [...new Set([...screened, ...Object.keys(cache)])].filter(u => face(u) && !listed(u))
  const unavailable = (u: string) => !!listed(u) || waits?.(u) === true
  const last = lastPhotoVerdicts(pagesToKeep, unavailable, flagVerdicts)
  // Only one that passed the check before is held; a face found now, on one that never did, takes it off, marked on both
  // lists (last-photo.ts).
  const firstOff = new Map([...last].filter(([u]) => screened.has(u) && !passed(u)))
  for (const u of firstOff.keys()) last.delete(u)
  const heldByAddress = photoAddressSet(last.keys())
  const markedByAddress = photoAddressSet(firstOff.keys())
  const why = 'people: a face (face detection)'
  await holdForSecondLook(root, new Map([...last].map(([u, pages]) => [u, { why, pages }])), 'face detection')
  const left = new Map<string, Stood[]>()
  const removes = (p: Photo) => dropsStored(p) && !heldByAddress(p.url)
  const waiting = captureWaiting(secondLook, listed)
  const newFirst = rejectedEntry(Object.fromEntries([...firstOff.keys()].map(url => [url, why])))
  for (const { file, e } of pages) {
    const removed = new Set((e.photos ?? []).filter(removes).map(p => p.url))
    placesIn(root, file, e, url => removed.has(url) && (waiting(url) ?? newFirst(url)?.[0]), left)
  }
  await holdForSecondLook(root, new Map([...firstOff].map(([u, pages]) => [u, { why, pages, off: true as const }])), 'face detection', undefined, left)
  // A face found now, on a photo that never passed, takes it off every page and album, as the check's verdict of a person
  // does: off a page that keeps other photos, it goes on the never-again list as refused, so the sweep takes its album
  // copies and no step brings it back (the independent reader, 20 Nov).
  // Only where it is given the list to write, as the engine's own call always is.
  const refusedNow = rejectedFile ? [...screened].filter(u => face(u) && !passed(u) && !markedByAddress(u) && !heldByAddress(u)) : []
  if (firstOff.size || refusedNow.length) {
    const file = rejectedFile ?? join(root, 'engine-state', '_photo-rejected.json')
    const now = withoutSettledWaits(JSON.parse(await readFile(file, 'utf8').catch(() => '{}')), secondLook)
    for (const u of firstOff.keys()) now[u] ??= waitingEntry(why)
    for (const u of refusedNow) now[u] ??= why
    await writePhotoState(file, now)
  }
  const held = [...last].map(([u, ps]) => `${u}: ${ps.join(', ')}`)
  const offFirst = [...firstOff].map(([u, ps]) => `${u}: ${ps.join(', ')}`)
  const removed: string[] = []
  for (const { file, e } of pages) {
    const keep = (e.photos ?? []).filter(p => !removes(p))
    // A video section's photo the owner rejected (the images pass screened it for faces when it picked it).
    const figures = (e.video?.figures ?? []).filter(f => f.photo && listed(f.photo.url))
    if (keep.length === (e.photos ?? []).length && !figures.length) continue
    const at = file.slice(contentRoot.length + 1)
    removed.push(...(e.photos ?? []).filter(p => !keep.includes(p)).map(p => `${at}: ${p.url}`), ...figures.map(f => `${at}: ${f.photo!.url}`))
    if (e.photos) e.photos = keep
    for (const f of figures) delete f.photo
    await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
  }
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  return { checked: todo.length - failed.length, fresh: todo, screened: [...screened], removed, held, firstOff: offFirst, failed }
}

/** Sheets of 12 the dead-fish screen takes in one faces step: a pages run's new photos made 11 or 12 (20 to 21 Nov 2026). */
export const NEW_PHOTO_SHEETS = 14

const readPhotoRecord = async (root: string, name: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(root, 'engine-state', name), 'utf8').catch(() => '{}'))

/**
 * The own photos of fish and plant pages, in page order, that no look has judged for a dead fish (the schema's
 * `deadLooked`, the rule the public build hides by) and the never-again list doesn't have (they leave every page anyway).
 */
async function unjudged(root: string, contentRoot: string): Promise<string[]> {
  const read = (name: string) => readPhotoRecord(root, name)
  const [shown, screen, check, subjects, secondLook, rejected] = await Promise.all([
    ownDeadPhotoUrls(contentRoot), read(DEAD_SCREEN_FILE), read(PHOTO_CHECK_FILE), read(PHOTO_SUBJECTS_FILE), read(SECOND_LOOK_RECORD), read(PHOTO_REJECTED_FILE),
  ])
  const looked = deadLooked({ screen, check, subjects, secondLook })
  const listed = rejectedEntry(rejected as Record<string, string>)
  return [...shown].filter(u => !looked(u) && !listed(u))
}

/**
 * What the dead-fish screen owes: every own photo of a fish or plant page that no look has judged, however it came into
 * the face finder's record (the chief of staff, 22 Nov 2026, after 111 came from a run begun before the screen). Those
 * owed before come first, in the order they came (address → the day first owed), then the others, dated `today`.
 */
async function stillOwed(root: string, contentRoot: string, owed: Record<string, string>, today: string): Promise<Record<string, string>> {
  const now = await unjudged(root, contentRoot)
  const open = new Set(now)
  return { ...Object.fromEntries(Object.entries(owed).filter(([u]) => open.has(u))), ...Object.fromEntries(now.filter(u => !(u in owed)).map(u => [u, today])) }
}

/**
 * The faces step (cli.ts `faces`, in every pages, sf and photos run before the push): faces first, then the dead-fish
 * screen (dead-screen.ts) on what it owes on species and plant pages: the photos it was owed before, in the order they
 * came, then those new to the face finder in this run, whether or not the face finder could read them, then every other
 * one no look has judged for a dead fish, however it came onto its page (`stillOwed`). It comes after every write
 * of the face pass, since both rewrite the pages.
 *
 * Each owed photo is on a list (DEAD_OWED_FILE in engine-state), and a public build doesn't show it (the schema's
 * load.ts), until the screen, the photo check or a person has judged it, the never-again list has it or no fish or plant
 * page shows it. The build holds the same line by the looks themselves (the schema's `deadLooked`), list or not. One past the sheets, on a sheet that failed or after a stop (the step's daily line in ceilings.json is `faces`)
 * stays on the list for the next run. The list takes the photos new to the face finder before the face pass writes
 * anything, its record of what it has read last: a list that can't be written stops the step with that record as it
 * was, so they are new to it again in the next run, and wait meanwhile (load.ts: an own photo the face finder hasn't
 * read). The list is written again before the screen runs, so a screen that fails leaves it in force; the screen
 * failing leaves the face pass as written (the chief of staff, 21 Nov 2026: the screen sees every new photo before it
 * can show).
 */
export async function screenNewPhotos(contentRoot: string, cacheFile: string, d: FaceDeps & { dead: DeadScreenDeps }, rejectedFile?: string, root = join(contentRoot, '..')): Promise<{ faces: Awaited<ReturnType<typeof dropFacePhotos>>; dead?: Awaited<ReturnType<typeof screenDead>>; deadFailed?: string; owed: number }> {
  const owedFile = join(root, 'engine-state', DEAD_OWED_FILE)
  const before = JSON.parse(await readFile(owedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const today = new Date().toISOString().slice(0, 10)
  const write = async (x: Record<string, string>) => { await mkdir(join(root, 'engine-state'), { recursive: true }); await writeFile(owedFile, `${JSON.stringify(x, null, 2)}\n`) }
  let enrolled = before
  const faces = await dropFacePhotos(contentRoot, cacheFile, d, rejectedFile, root, async fresh => {
    // The photos new to the face finder are among them, and come first after those owed before.
    enrolled = await stillOwed(root, contentRoot, { ...before, ...Object.fromEntries(fresh.filter(u => !(u in before)).map(u => [u, today])) }, today)
    await write(enrolled)
    return new Set(Object.keys(enrolled))
  })
  const owed = await stillOwed(root, contentRoot, enrolled, today)
  await write(owed)
  if (!Object.keys(owed).length) return { faces, owed: 0 }
  try {
    const dead = await screenDead(root, d.dead, { limit: NEW_PHOTO_SHEETS * 12, photos: new Set(Object.keys(owed)) })
    const left = await stillOwed(root, contentRoot, owed, today)
    await write(left)
    return { faces, dead, owed: Object.keys(left).length }
  } catch (err) {
    return { faces, deadFailed: photoFailure(err), owed: Object.keys(owed).length }
  }
}
