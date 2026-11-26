import { isNonCommercial, mirrorSearchTerms, photoAddressSet, photoClears, photoHolds, photoKey, photoLookAnswer as lookOf, PHOTO_SCREEN_FILE, photoRejections, setsCookies, settledWaiting, type Photo } from '@aq/schema'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { machine } from './ceiling'
import { compactRejection } from './photo-observations'
import { replacePhotoDocument, writeImageCache } from './image-cache-write'
import { writePhotoState } from './photo-state'

/**
 * A page's last photo doesn't come off on an automatic check's word alone (the chief of staff, 2026-11-14, after one
 * night's runs left 27 fish pages with no photo). A step that would leave a species, plant or breed page with nothing
 * (none of its own photos where it had some, or, with none of its own, an empty album) takes none of those photos off
 * anywhere and doesn't list them never-again. Each goes on engine-state/_photo-second-look.json for a second,
 * independent look (another model, or a person) and stays where it is until that look agrees.
 *
 * The record: photo → { why (the step's reason as the never-again list keeps it, a category and a hash: no model
 * prose), step, the pages it would have emptied, the day, and on one marked off the places it was taken from }. A look's
 * answer is written by a pull request, never by the engine: `look: { said, by, on }`.
 * - "agree": the sweep moves it to the never-again list, and it leaves every page.
 * - "clear": it stays, and no automatic verdict takes it off any page again.
 * - Any other look, or one that isn't well formed, is no answer: the photo waits.
 *
 * A photo we hold no permission for isn't held: the credit rule (sweep.ts `refusedByCredit`) and the never-again list
 * written by hand take it off at once.
 *
 * What the hold protects is a photo that PASSED the check before (the chief of staff, 20 Nov 2026, amending the rule of
 * 14 Nov): judged again, it is held as above, and so is a photo under any other verdict. A photo's first verdict of dead
 * or a person (the check's, the dead-fish screen's, the face screen's), on a photo that never passed, isn't held, whether
 * a step added it this run or a pages run put it up hours before: it comes off every page, even a page's last photo, and
 * waits for its look marked on both lists. Its record here has `off: true`; the never-again list, which every step that
 * adds photos skips, has it as `waiting: withheld [<the record's hash>]` (`waitingEntry`), so nothing counts it refused.
 * - "agree": its never-again entry takes the verdict's own reason, and the record leaves.
 * - "clear": its never-again entry goes (the sweep), so a step can bring it back, and no verdict takes it off again.
 * Where the two disagree, the record is the truth and the safe side is off the page (the chief of staff, 20 Nov 2026):
 * the sweep writes a marked record's missing waiting entry back, and a waiting entry with no record stays in force and
 * is reported (`mendWaiting`). No disagreement loosens the list for any other kind.
 */
export type Look = { said: 'agree' | 'clear'; by: string; on: string }
/**
 * `back`: the day the sweep put a cleared photo back where it was, or found another reason keeps it off (`putBackCleared`).
 * `left`: on a photo marked off, the places the step that took it off took it from, as they were just before: the file
 * and its place there, its entry being kept on the Mac alone (`notePlaces`).
 */
export type SecondLook = { why: string; step: string; pages: string[]; at: string; off?: true; look?: Look; back?: string; left?: Place[]; settled?: Place[]; parts?: string[] }
export type SecondLooks = Record<string, SecondLook>
export const SECOND_LOOK_FILE = '_photo-second-look.json'

const fileOf = (root: string) => join(root, 'engine-state', SECOND_LOOK_FILE)
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const day = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const has = (sl: SecondLooks, url: string) => Object.hasOwn(sl, url)

/** The record. One that can't be read stops the step that reads it: it takes nothing off rather than guess. */
export async function readSecondLook(root: string): Promise<SecondLooks> {
  const raw = await readFile(fileOf(root), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })
  const v = JSON.parse(raw) as unknown
  if (!object(v)) throw new Error(`${SECOND_LOOK_FILE} is not a map of photos: nothing taken off`)
  return Object.assign(Object.create(null) as SecondLooks, v)
}

/** The second look's answers, as each step asks them. */
export function looks(sl: SecondLooks) {
  const cleared = photoClears(sl)
  const held = photoHolds(sl)
  const off = (url: string) => has(sl, url) && sl[url]!.off === true && !lookOf(sl[url])
  const pendingOff = photoAddressSet(Object.keys(sl).filter(off))
  return {
    /** Cleared: no automatic verdict takes it off. */
    cleared: (url: string) => has(sl, url) && lookOf(sl[url])?.said === 'clear',
    /** Agreed: off as the step's verdict says, and onto the never-again list (the sweep). */
    agreed: (url: string) => has(sl, url) && lookOf(sl[url])?.said === 'agree',
    /** Held with no answer yet: it stays on every page. */
    waiting: (url: string) => has(sl, url) && !lookOf(sl[url]),
    /** A still-visible hold, including one on another address of the photo. */
    held,
    clearedPhoto: cleared,
    /** Off its pages at its first verdict, and on the never-again list as waiting, until its look (above). */
    off,
    /** A source and its mirror share an unanswered first refusal. */
    pendingOff,
    /** Neither waiting nor cleared: a step's verdict may act on it. */
    open: (url: string) => !cleared(url) && (has(sl, url) ? lookOf(sl[url])?.said === 'agree' : !held(url) && !pendingOff(url)),
  }
}

/** A species, plant or breed page: its own photos and its album's, generated ones left out. */
export type PageShows = { ref: string; own: string[]; album: string[]; nonCommercial?: Set<string>; ownStored?: string[]; albumStored?: string[] }

/** Every species, plant and breed page, as the site shows it now. */
export async function pagesShowing(content: string, version: (p: Photo, ref: string, scientificName: string) => string | undefined = p => p.url): Promise<PageShows[]> {
  type Doc = { photos?: (Photo & { unchecked?: boolean })[]; scientificName?: string }
  const urls = (d: Doc | null, ref: string, scientificName: string, album = false, nonCommercial?: Set<string>, stored?: string[]) => (d?.photos ?? []).flatMap(p => {
    const url = p?.url && !p.generated && !(album && p.unchecked) ? version(p, ref, scientificName) : undefined
    if (!url) return []
    stored?.push(p.url)
    if (isNonCommercial(p.licence ?? '')) nonCommercial?.add(url)
    return [url]
  })
  const read = async (f: string) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) as Doc | null
  const out: PageShows[] = []
  for (const kind of ['species', 'plants', 'breeds']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const own = await read(join(content, kind, id, 'entity.json'))
      if (!own) continue
      const ref = `${kind}/${id}`
      const name = own.scientificName ?? ''
      const album = await read(join(content, 'gallery', `${id}.json`))
      const nonCommercial = new Set<string>()
      const ownStored: string[] = [], albumStored: string[] = []
      out.push({ ref, own: urls(own, ref, name, false, nonCommercial, ownStored), album: urls(album, kind === 'species' ? ref : '', name, true, undefined, albumStored), nonCommercial, ownStored, albumStored })
    }
  }
  return out
}

/**
 * The photos whose going, with every other photo `off` says goes (on that page), would leave a page with nothing,
 * url → those pages: a page's own photos where it would have none of its own left, or, on a page with none of its own,
 * its album's where the album would be left empty.
 */
export function lastPhotos(pages: PageShows[], off: (url: string, ref: string) => boolean): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const p of pages) {
    const from = p.own.length ? p.own : p.album
    const going = from.filter(u => off(u, p.ref))
    if (!from.length || going.length < from.length) continue
    for (const u of new Set(going)) out.set(u, [...(out.get(u) ?? []), p.ref])
  }
  return out
}

/** Attribute a page's loss to the address that received the verdict, even when it serves a mirror. */
export function lastPhotoVerdicts(
  pages: PageShows[], unavailable: (url: string, ref: string) => boolean, verdicts: Iterable<string>,
  removesWrapper?: (verdictUrl: string) => boolean,
): Map<string, string[]> {
  const addresses = new Map<string, string>()
  for (const url of verdicts) {
    const key = photoKey(url) ?? url
    if (!addresses.has(key)) addresses.set(key, url)
  }
  const byVerdict = (url: string) => addresses.get(photoKey(url) ?? url)
  const out = new Map<string, Set<string>>()
  for (const page of pages) {
    const unavailableHere = (url: string) => unavailable(url, page.ref)
    const versions = (displayed: string[], stored?: string[]) => displayed.map((url, i) => {
      const wrapper = stored?.[i]
      const verdict = byVerdict(url)
      const onWrapper = wrapper && wrapper !== url ? byVerdict(wrapper) : undefined
      return { url, verdicts: [verdict, onWrapper && removesWrapper?.(onWrapper) ? onWrapper : undefined] }
    })
    const own = versions(page.own, page.ownStored), album = versions(page.album, page.albumStored)
    const off = (p: typeof own[number]) => p.verdicts.some(Boolean) || unavailableHere(p.url)
    const hasOwn = (photos: typeof own) => photos.some(p => !page.nonCommercial?.has(p.url)) || photos.length === 1
    const ownEmpties = own.length && !hasOwn(own.filter(p => !off(p)))
    // A page that already has no eligible own photo can depend on the album.
    const albumEmpties = !hasOwn(own.filter(p => !unavailableHere(p.url))) && album.every(off)
    const removed = [...(ownEmpties ? own : []), ...(albumEmpties ? album : [])]
    for (const { verdicts: hits } of removed) for (const verdict of hits) {
      if (!verdict) continue
      const existing = out.get(verdict) ?? new Set<string>()
      existing.add(page.ref)
      out.set(verdict, existing)
    }
  }
  return new Map([...out].map(([url, refs]) => [url, [...refs]]))
}

const today = () => new Date().toISOString().slice(0, 10)

/** A verdict of the photo check that passed: "yes", with no person in the photo. */
const passes = (v: unknown) => object(v) && v.ok === 'yes' && v.person !== true
/** The photos that passed the photo check before: any page's verdict for it, or the first check's, a pass (above). */
export function passedBefore(subjects: Record<string, unknown>, legacy: Record<string, unknown> = {}): Set<string> {
  const out = new Set<string>()
  for (const [u, by] of Object.entries(subjects)) if (object(by) && Object.values(by).some(passes)) out.add(u)
  for (const [u, v] of Object.entries(legacy)) if (passes(v)) out.add(u)
  return out
}
/** The same, from the check's verdict files as they are now: a step's start. */
export async function readPassedBefore(root: string): Promise<Set<string>> {
  const read = async (f: string) => JSON.parse(await readFile(join(root, 'engine-state', f), 'utf8').catch(() => '{}')) as Record<string, unknown>
  return passedBefore(await read('_photo-subjects.json'), await read('_photo-check.json'))
}
/** The verdicts a photo that never passed doesn't wait on a page under (above). */
export const FIRST_OFF = /^(?:dead|people): /
/** The never-again entry of a photo off at its first verdict: `waiting:` and its record's hash (above). */
export const waitingEntry = (why: string) => compactRejection(why).replace(/^[^:]+:/, 'waiting:')

/**
 * Puts each photo a step holds on the second look, once. An entry already there, with its look, is kept as it is; the
 * record is read again first, so what another step wrote meanwhile stays. Returns the photos newly put there.
 */
export async function holdForSecondLook(root: string, held: Map<string, { why: string; pages: string[]; off?: true; parts?: string[] }>, step: string, at = today(), places?: Map<string, Stood[]>): Promise<string[]> {
  if (!held.size && !places?.size) return []
  const sl = await readSecondLook(root)
  const added: string[] = []
  let extended = false
  for (const [url, h] of held) {
    const existing = sl[url]
    if (existing?.off && h.off && existing.step === step && existing.why === compactRejection(h.why) && !lookOf(existing)) {
      const pages = [...new Set([...existing.pages, ...h.pages])].sort()
      const parts = [...new Set([...(existing.parts ?? []), ...(h.parts ?? [])])].sort()
      extended ||= pages.length !== existing.pages.length || parts.length !== (existing.parts?.length ?? 0)
      existing.pages = pages
      if (parts.length) existing.parts = parts
    }
    // A first verdict's mark takes the place of a hold on another reason that has no answer yet (photo-check.ts spared).
    if (has(sl, url) && !(h.off && !sl[url]!.off && !lookOf(sl[url]))) continue
    sl[url] = { why: compactRejection(h.why), step, pages: [...new Set(h.pages)].sort(), at, ...(h.off ? { off: true as const } : {}), ...(h.parts?.length ? { parts: [...new Set(h.parts)].sort() } : {}) }
    added.push(url)
  }
  const dir = places?.size ? entriesDir() : undefined
  const captured = dir && places ? await capturePlaces(sl, places, dir) : false
  if (added.length || extended || captured) await writeSecondLook(root, sl)
  return added
}

export async function writeSecondLook(root: string, sl: SecondLooks) {
  const sorted = Object.fromEntries(Object.keys(sl).sort().map(k => [k, sl[k]]))
  await mkdir(dirname(fileOf(root)), { recursive: true })
  await writeImageCache(fileOf(root), `${JSON.stringify(sorted, null, 2)}\n`)
}

/**
 * The sweep's part: each photo the second look agreed on goes on the never-again list with the step's reason and
 * leaves the second look. Returns them.
 */
export async function listAgreed(root: string): Promise<string[]> {
  const sl = await readSecondLook(root)
  const agreed = Object.keys(sl).filter(looks(sl).agreed)
  if (!agreed.length) return []
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const watermarks = await readFile(join(root, 'engine-state', PHOTO_SCREEN_FILE), 'utf8').then(
    raw => JSON.parse(raw) as Record<string, { retainedOwnMark?: unknown }>,
    (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return undefined },
  )
  const active = photoRejections(rejected, watermarks)
  const partsFile = join(root, 'engine-state', '_part-photos-off.json')
  const partsOff = agreed.some(url => sl[url]!.parts?.length)
    ? JSON.parse(await readFile(partsFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '{}'
      throw error
    })) as Record<string, { guides?: string[]; agreedGuides?: string[]; holds?: Record<string, string[]> }>
    : undefined
  let partsChanged = false
  for (const url of agreed) {
    // A waiting entry, for this reason or another, takes the verdict's own reason, on a record marked off or not: two runs'
    // records can meet in a merge with the unmarked one kept and the waiting entry beside it (the chief of staff, 20 Nov,
    // after that night's seven). On one marked off, a mark's entry does too, which a shop's own kept mark could otherwise
    // lift (the independent reader, 20 Nov).
    const prior = rejected[url]
    if (!prior || prior.startsWith('waiting:') || (prior.startsWith('watermark:') && (sl[url]!.off || !active(url)))) {
      rejected[url] = sl[url]!.why
    }
    for (const key of sl[url]!.parts ?? []) {
      const part = partsOff?.[key]
      if (!part?.guides) continue
      const id = `sha256:${createHash('sha256').update(url).digest('hex')}`
      if (part.holds?.[id]) {
        delete part.holds[id]
        if (!Object.keys(part.holds).length) delete part.holds
        partsChanged = true
      }
      const guides = new Set(part.agreedGuides)
      for (const page of sl[url]!.pages) {
        const guide = page.startsWith('guides/') ? page.slice('guides/'.length) : ''
        if (part.guides.includes(guide)) guides.add(guide)
      }
      if (guides.size > (part.agreedGuides?.length ?? 0)) {
        part.agreedGuides = [...guides].sort()
        partsChanged = true
      }
    }
    delete sl[url]
  }
  if (partsChanged) await writeImageCache(partsFile, `${JSON.stringify(partsOff, null, 2)}\n`)
  await writePhotoState(rejectedFile, rejected)
  await writeSecondLook(root, sl)
  return agreed
}

/**
 * A clear that published one place remains in force when a later place is still recovering. An older checkout can
 * carry its waiting entry back into the merge, so apply the clear before any step uses the rejection list.
 */
export function withoutSettledWaits(rejected: Record<string, string>, marks: SecondLooks): Record<string, string> {
  for (const [url, mark] of Object.entries(marks)) if (settledWaiting(rejected[url], mark)) delete rejected[url]
  return rejected
}

/** Leave a waiting copy in place once a valid clear has arrived, even before recovery completes. */
export function withoutClearedWaits(rejected: Record<string, string>, marks: SecondLooks): Record<string, string> {
  for (const [url, mark] of Object.entries(marks)) {
    if (mark.off === true && lookOf(mark)?.said === 'clear' && rejected[url] === waitingEntry(mark.why)) delete rejected[url]
  }
  return rejected
}

/**
 * The sweep's part for a photo off at its first verdict that the look cleared: its waiting entry leaves the never-again
 * list, so the step that found it can bring it back. Returns them. Not one whose record has places while the private
 * folder can't be read here (GitHub's run): the put-back waits for the Mac to put it back, and until then everything,
 * its waiting entry too, stays as it was (the chief of staff, 22 Nov 2026).
 */
export async function unlistCleared(root: string, deferred: ReadonlySet<string> = new Set()): Promise<string[]> {
  const sl = await readSecondLook(root)
  const l = looks(sl)
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  // A later checkout can add a pending place after an earlier place has published. A URL-wide waiting entry
  // would take that earlier copy off again even though the clear still applies to it.
  const waits = (u: string) => !sl[u]!.settled?.length && (deferred.has(u) || (!!sl[u]!.left?.length && !sl[u]!.back))
  const out = Object.keys(sl).filter(u => sl[u]!.off === true && l.cleared(u) && rejected[u] === waitingEntry(sl[u]!.why) && !waits(u))
  if (!out.length) return []
  for (const u of out) delete rejected[u]
  await writePhotoState(rejectedFile, rejected)
  return out
}

/** A place a photo stood: its page's, album's or guide's file (from the repository's root) and its place in `photos`. */
type GuideSlot = ['video', 'figures', number, 'photo' | 'moments']
export type Place = { file: string; index: number; path?: GuideSlot; capture?: string; captureDay?: string }
const placeKey = (p: Pick<Place, 'file' | 'path'>) => `${p.file}:${JSON.stringify(p.path ?? [])}`
const validPlace = (p: Place) => PLACE.test(p.file) && Number.isSafeInteger(p.index) && (p.path === undefined
  ? p.index >= 0
  : p.file.startsWith('content/guides/') && Array.isArray(p.path) && p.path.length === 4 &&
    p.path[0] === 'video' && p.path[1] === 'figures' && Number.isSafeInteger(p.path[2]) && p.path[2] >= 0 &&
    (p.path[3] === 'photo' ? p.index === -1 : p.path[3] === 'moments' && p.index >= 0))
/** The same, with its entry there, as the step that takes it off holds it. */
export type Stood = Place & { partImages?: string[][]; photo: Record<string, unknown>; order?: string[]; heading?: string; partOrder?: string[] }
/** A place a photo's mark took it off, as it was just before it first left from the mark on; and how many times it left. */
export type LeftPlace = Stood & { times: number }

/**
 * The places in `data`, a page's, album's or guide's file at `file` read just before a step writes it without them, of
 * each photo `marked` names, added to `into` (url → places, with the entry).
 */
type PhotoSlot = Omit<Stood, 'file'>
function headingOccurrence(heading: string | undefined, index: number, order: string[] | undefined): number | undefined {
  return heading === undefined || !order ? undefined : order.slice(0, index).filter(value => value === heading).length
}

function sameGuideSlot(p: Pick<PhotoSlot, 'path' | 'heading' | 'partOrder'>, q: PhotoSlot): boolean {
  if (p.path?.[3] !== q.path?.[3]) return false
  if (!p.path || !q.path) return !p.path && !q.path
  if (p.heading === undefined || q.heading === undefined) return p.path[2] === q.path[2]
  if (p.heading !== q.heading) return false
  const first = headingOccurrence(p.heading, p.path[2], p.partOrder)
  const second = headingOccurrence(q.heading, q.path[2], q.partOrder)
  return first === undefined || second === undefined ? p.path[2] === q.path[2] : first === second
}

function figurePhotoUrls(figure: { photo?: unknown; moments?: unknown }): string[] {
  return [figure.photo, ...(Array.isArray(figure.moments) ? figure.moments : [])].flatMap(photo =>
    typeof photo?.url === 'string' ? [photo.url] : [],
  )
}

function photoSlots(data: unknown, guide: boolean): PhotoSlot[] {
  const doc = data as { photos?: unknown; video?: { figures?: unknown } } | undefined
  const out: PhotoSlot[] = []
  const add = (photos: unknown, path?: GuideSlot, heading?: string, partOrder?: string[], partImages?: string[][]) => {
    if (!Array.isArray(photos)) return
    const order = photos.map(p => typeof p?.url === 'string' ? p.url : '')
    photos.forEach((p, index) => {
      if (typeof p?.url !== 'string') return
      out.push({ index: path?.[3] === 'photo' ? -1 : index, photo: p, order, ...(path ? { path } : {}), ...(heading !== undefined ? { heading, partOrder, partImages } : {}) })
    })
  }
  add(doc?.photos)
  const figures = doc?.video?.figures
  if (guide && Array.isArray(figures)) {
    const partOrder = figures.map(f => typeof f?.heading === 'string' ? f.heading : '')
    const partImages = figures.map(figurePhotoUrls)
    figures.forEach((f, index) => {
      const heading = typeof f?.heading === 'string' ? f.heading : undefined
      add([f?.photo], ['video', 'figures', index, 'photo'], heading, partOrder, partImages)
      add(f?.moments, ['video', 'figures', index, 'moments'], heading, partOrder, partImages)
    })
  }
  return out
}

export function placesIn(root: string, file: string, data: unknown, marked: (url: string, slot: PhotoSlot) => boolean | string | undefined, into: Map<string, Stood[]>) {
  const local = relative(root, file)
  for (const slot of photoSlots(data, local.startsWith('content/guides/'))) {
    const address = String(slot.photo.url)
    const decision = marked(address, slot)
    if (!decision) continue
    const url = typeof decision === 'string' ? decision : address
    into.set(url, [...(into.get(url) ?? []), { ...slot, file: local, photo: JSON.parse(JSON.stringify(slot.photo)) }])
  }
}

/** Find the unanswered mark for a removal, including a source URL's mirrored copy. */
export function captureWaiting(marks: SecondLooks, entry: (url: string) => [string, string] | undefined): (url: string) => string | undefined {
  const off = looks(marks).off
  return url => {
    const rejection = entry(url)
    return rejection && off(rejection[0]) && rejection[1] === waitingEntry(marks[rejection[0]]!.why) ? rejection[0] : undefined
  }
}

/**
 * Where a photo's entry is kept while it waits off its pages: a private folder on the Mac, outside any checkout, beside
 * the Internet Archive's rest and the magazine's ledger. An entry names its photographer, and a name written into the
 * public record for a photo no commit ever showed would stay in the repository's past for good. Each mark and place
 * gets its own immutable file, so concurrent Mac checkouts can record different places without overwriting one another.
 * `AQ_PUT_BACK_ENTRIES` names another folder, or `off`. Undefined where none can be read: on GitHub, or off.
 */
export function entriesDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.AQ_PUT_BACK_ENTRIES === 'off') return undefined
  if (env.AQ_PUT_BACK_ENTRIES) return env.AQ_PUT_BACK_ENTRIES
  return machine(env) === 'mac' ? join(homedir(), '.cache/aquatome/put-back') : undefined
}

type Kept = Stood & { replaces?: string; url: string; at: string; why: string }
const keptFile = (dir: string, url: string, mark: SecondLook, p: Place) =>
  join(dir, `${createHash('sha256').update(JSON.stringify([url, p.captureDay ?? mark.at, mark.why, p.file, p.index, ...(p.path ? [p.path] : []), ...(p.capture ? [p.capture] : [])])).digest('hex')}.json`)

async function readKept(dir: string, url: string, mark: SecondLook, p: Place): Promise<Kept | undefined> {
  const raw = await readFile(keptFile(dir, url, mark, p), 'utf8').catch(async (e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT' || !(await stat(dir)).isDirectory()) throw e
    return undefined
  })
  if (raw === undefined) return undefined
  const v = JSON.parse(raw) as Kept
  if (v?.url !== url || v.at !== (p.captureDay ?? mark.at) || v.why !== mark.why || v.file !== p.file || v.index !== p.index || placeKey(v) !== placeKey(p) || v.capture !== p.capture || typeof v.photo?.url !== 'string' ||
      (v.order !== undefined && (!Array.isArray(v.order) || v.order.some(u => typeof u !== 'string')))) {
    throw new Error('Unrecognized private photo recovery entry')
  }
  return v
}

/** Publish the entry only if absent. Readers see a complete file and repeat writers preserve the first capture. */
async function writeKept(dir: string, url: string, mark: SecondLook, p: Stood, replaces?: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const file = keptFile(dir, url, mark, p)
  const temporary = `${file}.${randomUUID()}.next`
  try {
    await writeFile(temporary, JSON.stringify({ ...p, replaces, url, at: mark.at, why: mark.why }), { mode: 0o600, flag: 'wx' })
    try { await link(temporary, file) } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readKept(dir, url, mark, p))) throw e
    }
  } finally { await rm(temporary, { force: true }) }
}

/** Keep the private entry before naming its place on the public record. Updates are published together with the mark. */
async function capturePlaces(sl: SecondLooks, left: Map<string, Stood[]>, dir: string): Promise<boolean> {
  let changed = false
  const previous = new Map<string, { url: string; mark: SecondLook; place: Place }[]>()
  for (const [url, mark] of Object.entries(sl)) for (const place of mark.left ?? []) {
    const entry = { url, mark, place }
    const at = previous.get(placeKey(place))
    if (at) at.push(entry)
    else previous.set(placeKey(place), [entry])
  }
  for (const [url, places] of left) {
    const r = has(sl, url) ? sl[url]! : undefined
    if (!r || r.off !== true || lookOf(r) || r.back) continue
    const named = new Map((r.left ?? []).map(p => [placeKey(p), p]))
    const byHost = (place: Stood) => Number(setsCookies(String(place.photo.url)))
    for (const p of [...places].sort((a, b) => byHost(a) - byHost(b))) {
      if (!validPlace(p)) continue
      const earlierPlace = named.get(placeKey(p))
      if (earlierPlace) {
        const earlier = await readKept(dir, url, r, earlierPlace)
        if (!earlier) throw new Error('Photo take-off is waiting for an existing private capture')
        if (byHost(p) || !byHost(earlier)) continue
      }
      const place = { file: p.file, index: p.index, ...(p.path ? { path: p.path } : {}), capture: randomUUID() }
      const order = p.order ? [...p.order] : undefined
      if (order) {
        for (const prior of previous.get(placeKey(p)) ?? []) {
          const earlier = (await readKept(dir, prior.url, prior.mark, prior.place))?.order
          if (!earlier?.includes(String(p.photo.url))) continue
          // Add neighbors a preceding pass removed from the same file. The current file keeps its own order.
          for (const [i, neighbor] of earlier.entries()) {
            if (order.includes(neighbor)) continue
            order.splice(photoPosition(order, earlier, i, order.length), 0, neighbor)
          }
        }
      }
      await writeKept(dir, url, r, { ...p, ...place, order }, earlierPlace?.capture)
      named.set(placeKey(p), place)
      r.left = [...named.values()]
      const at = previous.get(placeKey(p)) ?? []
      if (!previous.has(placeKey(p))) previous.set(placeKey(p), at)
      at.push({ url, mark: r, place })
      changed = true
    }
  }
  return changed
}

/** Capture a further removal under an existing waiting mark before the sweep writes the page or album. */
export async function notePlaces(root: string, left: Map<string, Stood[]>, dir = entriesDir()) {
  if (!left.size || !dir) return
  const sl = await readSecondLook(root)
  if (await capturePlaces(sl, left, dir)) await writeSecondLook(root, sl)
}

function publishedJson(root: string, file: string, rev = 'refs/remotes/origin/main'): Record<string, unknown> | undefined {
  const read = spawnSync('git', ['-C', root, 'show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (read.status !== 0) {
    if (/path .+ (?:does not exist in|exists on disk, but not in)|invalid object name|not a git repository/.test(read.stderr ?? '')) return undefined
    throw new Error('Could not read the published photo recovery records')
  }
  const value: unknown = JSON.parse(read.stdout)
  if (!object(value)) throw new Error('Invalid published photo recovery record')
  return value
}

/** Private recovery entries outlive an unpublished restore or agree. Prune only against a matching published outcome. */
async function pruneKept(root: string, dir: string, local: SecondLooks) {
  const files = (await readdir(dir).catch(() => [] as string[])).filter(f => /^[a-f0-9]{64}\.json$/.test(f))
  if (!files.length) return
  const marks = publishedJson(root, `engine-state/${SECOND_LOOK_FILE}`) as SecondLooks | undefined
  const rejected = publishedJson(root, 'engine-state/_photo-rejected.json')
  if (!marks || !rejected) return
  for (const file of files) {
    const path = join(dir, file)
    const raw = await readFile(path, 'utf8').catch(() => undefined)
    let k: Kept | undefined
    try { k = raw === undefined ? undefined : JSON.parse(raw) as Kept } catch { continue }
    if (!k || typeof k.url !== 'string' || !day(k.at) || typeof k.why !== 'string') continue
    const mark = marks[k.url], here = local[k.url]
    const restored = mark?.back && here?.back && mark.why === k.why && here.why === k.why &&
      mark.settled?.some(p => placeKey(p) === placeKey(k) && (p.capture === k.capture || !k.replaces || p.capture !== k.replaces))
    const agreed = !mark && !here && rejected[k.url] === k.why
    if (restored || agreed) await rm(path, { force: true })
  }
}

/**
 * The repository's history, as the put-back reads it: each page, album or guide file that showed a photo just before
 * the commit that marked it off, and that it left from that commit on, with its place and its entry as they were just
 * before it first left. That commit is the first since the start of `since` (its record's day, UTC, as records are
 * dated) whose record has it `off`. None if no commit since marked it. Undefined where there's no history to read here
 * (not a repository, or a shallow clone): nothing is put back, and a full clone does it later.
 */
type HistoryPlace = Place & { photoUrl?: string }
export type History = (url: string, since: string, captured?: readonly HistoryPlace[]) => Promise<LeftPlace[] | undefined>

/** The pages, albums and guides a photo shows on. */
const PLACE = /^content\/(?:(?:species|plants|breeds|guides)\/[^/]+\/entity\.json|gallery\/[^/]+\.json)$/

/**
 * `History` from git in `root`, along main's own line (the independent reader, 21 Nov). The places are the files that
 * showed the photo just before its mark and that it left from the mark on: a check's mark takes it off in its own commit,
 * a mark written by hand leaves that to the next run, which reads its waiting entry (the 46 the chief of staff marked
 * by hand on 21 Nov all left their pages in the next run). A removal before the mark was another reason's and stays, and so does one from
 * a place it came to after the mark. A place it left more than once, so it came back and left again, counts each time.
 * Each merge is read as its change to main, so a removal made in a merge counts and one made on both sides of a merge
 * counts once. A page renamed as it left keeps its old file, which the put-back reports gone.
 */
export function gitHistory(root: string, tip = 'HEAD'): History {
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' },
  })
  const at = (rev: string, file: string): unknown => {
    const r = git('show', `${rev}:${file}`)
    if (r.status === 0) return JSON.parse(r.stdout) as unknown
    if (/path .+ (?:does not exist in|exists on disk, but not in)/.test(r.stderr ?? '')) return undefined
    throw new Error('Could not read the photo recovery history')
  }
  const line = ['--first-parent', '--diff-merges=first-parent', '--no-patch', '--no-renames']
  // The record as each commit had it, read once for every photo the sweep asks about.
  const records = new Map<string, SecondLooks | undefined>()
  const recordAt = (sha: string) => {
    if (!records.has(sha)) {
      const value = at(sha, `engine-state/${SECOND_LOOK_FILE}`)
      if (value !== undefined && !object(value)) throw new Error('Invalid photo recovery history record')
      records.set(sha, value as SecondLooks | undefined)
    }
    return records.get(sha)
  }
  const find: History = async (url, since, captured = []) => {
    const shallow = git('rev-parse', '--is-shallow-repository')
    if (shallow.status !== 0 || shallow.stdout.trim() !== 'false') return undefined
    const marks = git('log', ...line, '--reverse', '--format=%H', `--since=${since}T00:00:00Z`, tip, '--', `engine-state/${SECOND_LOOK_FILE}`)
    if (marks.status !== 0) return undefined
    const states = marks.stdout.split('\n').filter(Boolean)
    const mark = states.find(sha => recordAt(sha)?.[url]?.off === true)
    if (!mark) return []
    const parent = git('rev-parse', '--verify', '-q', `${mark}^`).stdout.trim()
    if (!parent) return []
    const addresses = new Set([url, ...captured.map(p => p.photoUrl ?? url)])
    const samePhoto = photoAddressSet(addresses)
    const spots = (rev: string, file: string) => photoSlots(at(rev, file), file.startsWith('content/guides/'))
      .filter(p => typeof p.photo.url === 'string' && samePhoto(p.photo.url))
    const capturedKeys = new Set(captured.map(placeKey))
    // The places that showed it just before its mark (grep's status is 1 when none does).
    const mirrors = mirrorSearchTerms(url)
    const terms = [url, ...mirrors].flatMap(s => ['-e', s])
    const held = git('grep', '-l', '-F', ...terms, parent, '--', 'content/species', 'content/plants', 'content/breeds', 'content/gallery', 'content/guides')
    if (held.status !== 0 && held.status !== 1) return undefined
    const previous = new Set(held.stdout.split('\n').map(l => l.slice(parent.length + 1)).filter(f => PLACE.test(f) && spots(parent, f).length > 0))
    const places = [...new Set([...previous, ...captured.map(p => p.file).filter(f => PLACE.test(f))])]
    if (!places.length) return []
    const captureCommits = new Map<string, string>()
    for (const place of captured) {
      if (!place.capture) continue
      const match = (p: Place) => placeKey(p) === placeKey(place) && p.capture === place.capture
      const published = states.find(sha => {
        const entry = recordAt(sha)?.[url]
        return entry?.left?.some(match) || entry?.settled?.some(match)
      })
      if (published) captureCommits.set(placeKey(place), published)
    }
    const search = mirrors.length || addresses.size > 1 ? [] : ['-S', url]
    const served = new Set<string>()
    const log = git('log', ...line, '--reverse', '--format=%H', ...search, `${parent}..${tip}`, '--', ...places)
    if (log.status !== 0) return undefined
    const out = new Map<string, LeftPlace>()
    // Oldest first: the first leaving gives the place and the entry; every leaving counts.
    for (const sha of log.stdout.split('\n').filter(Boolean)) {
      const files = git('diff', '--name-only', '--no-renames', ...search, `${sha}^`, sha, '--', ...places)
      if (files.status !== 0) return undefined
      for (const file of files.stdout.split('\n').filter(Boolean)) {
        const before = spots(`${sha}^`, file), after = spots(sha, file)
        const seen = new Set<string>()
        for (const p of before) if (!setsCookies(String(p.photo.url))) served.add(placeKey({ ...p, file }))
        for (const p of before) {
          // A part can move when a neighboring part is dropped.
          const same = (q: PhotoSlot) => sameGuideSlot(p, q)
          const position = { file, index: p.index, ...(p.path ? { path: p.path } : {}) }
          const key = placeKey(position)
          const usable = (q: PhotoSlot) => !served.has(key) || !setsCookies(String(q.photo.url))
          if (!usable(p) || seen.has(key) || after.some(q => same(q) && usable(q))) continue
          seen.add(key)
          const capturedAt = captureCommits.get(key)
          if (capturedAt && capturedAt !== mark && capturedAt !== sha) {
            const afterCapture = git('merge-base', '--is-ancestor', capturedAt, sha)
            if (afterCapture.status === 1) continue
            if (afterCapture.status !== 0) return undefined
          }
          const had = out.get(key)
          if (had) had.times++
          else {
            const starting = capturedAt && capturedAt !== mark ? [`${capturedAt}^`, capturedAt] : [parent, mark]
            const wasPresent = (!capturedAt && spots(parent, file).some(same)) ||
              (capturedKeys.has(key) && starting.some(rev => spots(rev, file).some(same)))
            out.set(key, { ...position, photo: p.photo, order: p.order, times: wasPresent ? 1 : 2, ...(p.heading !== undefined ? { heading: p.heading, partOrder: p.partOrder, partImages: p.partImages } : {}) })
          }
        }
      }
    }
    return [...out.values()]
  }
  return (url, since, captured) => find(url, since, captured).catch(() => undefined)
}

/**
 * The subject verdict a second look's clear answers, on the pages its record names, for a photo marked off at its first
 * verdict: the dead fish (a person is a mark on a verdict, not a verdict of its own). Another fish, nothing of the
 * subject and "no" are the page's own, and stand (the chief of staff, 21 Nov).
 */
export const CLEARED_VERDICT = 'dead' as const

/** Place a URL next to its nearest saved neighbors when some have already returned. */
function photoPosition(current: string[], order: string[], at: number, fallback: number): number {
  const following = new Set(order.slice(at + 1))
  const preceding = new Set(order.slice(0, at))
  const next = current.findIndex(url => following.has(url))
  if (next >= 0) return next
  const prev = current.findLastIndex(url => preceding.has(url))
  return prev >= 0 ? prev + 1 : Math.min(fallback, current.length)
}

/** Reconcile photo removals and restorations that were replayed over a newer main. */
async function reconcileRebasedPlaces(root: string, local: SecondLooks) {
  const out = { back: [] as string[], off: [] as string[] }
  const main = 'refs/remotes/origin/main'
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const done = Object.entries(local).filter(([, mark]) => mark.settled?.length && lookOf(mark)?.said === 'clear')
  if (!done.length) return out
  const before = process.env.AQ_PHOTO_PRE_REBASE ?? git('rev-parse', '--verify', '-q', 'ORIG_HEAD').stdout.trim()
  if (!before) return out
  const common = git('merge-base', before, main)
  if (common.status !== 0) {
    if (git('rev-parse', '--verify', '-q', main).status !== 0) return out
    throw new Error('Could not verify the original base of a rebased photo recovery')
  }
  const base = common.stdout.trim()
  if (base === before || base === git('rev-parse', main).stdout.trim()) return out
  const records = `engine-state/${SECOND_LOOK_FILE}`
  const published = publishedJson(root, records, main) as SecondLooks | undefined
  const previous = publishedJson(root, records, before) as SecondLooks | undefined
  const original = publishedJson(root, records, base) as SecondLooks | undefined
  if (!published || !previous) return out
  const diff = git('diff', '--name-only', '-z', main, '--', 'content')
  if (diff.status !== 0) throw new Error('Could not compare restored photos with main')
  const changed = new Set(diff.stdout.split('\0'))
  const history = gitHistory(root, main)
  const commits = git('log', '--first-parent', '--reverse', '--format=%H', `${base}..${before}`, '--', records)
  if (commits.status !== 0) throw new Error('Could not read the pre-rebase photo recovery history')
  const localStates = commits.stdout.split('\n').filter(Boolean).map(sha => ({
    sha, marks: publishedJson(root, records, sha) as SecondLooks | undefined,
  }))
  for (const [url, mark] of done) {
    const prior = published[url], pending = previous[url]
    if (!prior?.off || !pending?.off || prior.why !== mark.why || pending.why !== mark.why) continue
    const places = mark.settled!.filter(place => changed.has(place.file))
    if (!places.length) continue
    const restoredHere = places.filter(place => pending.settled?.some(p => placeKey(p) === placeKey(place)) &&
      !original?.[url]?.settled?.some(p => placeKey(p) === placeKey(place)))
    const historyPlaces = restoredHere.length ? await history(url, mark.at, restoredHere) : []
    if (!historyPlaces) throw new Error('Could not verify an unpublished photo restore after pulling main')
    const matches = photoAddressSet([url])
    for (const place of places) {
      const file = join(root, place.file)
      const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (raw === undefined) continue
      type Doc = { photos?: Record<string, unknown>[]; video?: { figures?: { heading?: unknown; photo?: Record<string, unknown>; moments?: Record<string, unknown>[] }[] } }
      const doc = JSON.parse(raw) as Doc
      const guide = place.file.startsWith('content/guides/')
      const departure = historyPlaces.find(p => placeKey(p) === placeKey(place) && p.times >= 2)
      const at = (data: unknown) => photoSlots(data, guide).filter(slot =>
        sameGuideSlot(departure ?? place, slot) && typeof slot.photo.url === 'string' && matches(slot.photo.url) && !setsCookies(slot.photo.url))
      const publicSlots = at(publishedJson(root, place.file, main))
      const previousSlots = at(publishedJson(root, place.file, before))
      const currentSlots = at(doc)
      const returned = publicSlots[0]
      if (departure && !returned) {
        const landed = localStates.find(state => state.marks?.[url]?.settled?.some(p => placeKey(p) === placeKey(place)))
        if (!landed) throw new Error('Could not verify the original entry restored before pulling main')
        const old = new Set(at(publishedJson(root, place.file, landed.sha)).map(slot => JSON.stringify(slot.photo)))
        const stale = currentSlots.filter(slot => old.has(JSON.stringify(slot.photo)) &&
          previousSlots.some(previous => JSON.stringify(previous.photo) === JSON.stringify(slot.photo)))
        if (!stale.length) continue
        for (const slot of stale.toReversed()) {
          if (!slot.path) doc.photos!.splice(slot.index, 1)
          else {
            const figure = doc.video!.figures![slot.path[2]]!
            if (slot.path[3] === 'photo') delete figure.photo
            else figure.moments!.splice(slot.index, 1)
          }
        }
        await replacePhotoDocument(file, `${JSON.stringify(doc, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
        out.off.push(`${url}: it left ${place.file} again on main, and that removal stands`)
        continue
      }
      if (!returned || !prior.settled?.some(p => placeKey(p) === placeKey(place)) || lookOf(pending) ||
          !pending.left?.some(p => placeKey(p) === placeKey(place)) || previousSlots.length || currentSlots.length ||
          !at(publishedJson(root, place.file, base)).length) continue
      const insert = (photos: Record<string, unknown>[]) => {
        const index = photoPosition(photos.map(p => String(p.url)), returned.order ?? [], returned.index, place.index)
        photos.splice(index, 0, returned.photo)
      }
      if (!returned.path) {
        insert(doc.photos ??= [])
      } else {
        const figures = doc.video?.figures
        if (!figures) continue
        const index = returned.path[2]
        let figure = figures[index]
        if (!figure || figure.heading !== returned.heading) {
          figure = { heading: returned.heading, moments: [] }
          figures.splice(index, 0, figure)
        }
        if (returned.path[3] === 'photo') {
          if (figure.photo) continue
          figure.photo = returned.photo
        } else {
          insert(figure.moments ??= [])
        }
      }
      await replacePhotoDocument(file, `${JSON.stringify(doc, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
      out.back.push(`${place.file}: ${returned.photo.url}`)
    }
  }
  return out
}

/**
 * The sweep's part, before anything else reads a page: each photo off at its first verdict that the look cleared goes
 * back where it was, once (the chief of staff, 20 Nov 2026). Every page, album and guide that showed it when it was
 * marked off and that it left from then on, at its place there and as its entry was: first the places its record holds,
 * which the step that took it off wrote (`notePlaces`), with their entries from the Mac's private folder, then any other
 * the repository's history shows; one that already shows it is left as it is. Where its record has places, a run that
 * can't read that folder waits, unmarked; a place whose entry the folder doesn't hold, and that history doesn't show, is
 * reported and stays off, as before places were noted. An unreadable place waits for retry. An entry leaves the folder
 * only after the matching restore, refusal or agreement reaches main (`pruneKept`).
 * Its own waiting entry leaves the never-again list with it, so nothing later in the pass takes it off on that.
 *
 * Only the removal its mark made comes back, and nothing another reason took off (the independent reader, 21 Nov):
 * - a photo on the never-again list for anything else stays off everywhere;
 * - a place it left before its mark keeps that removal, and so does a place it came to only after the mark, and one it
 *   came back to and left again;
 * - a reason on record always wins (the chief of staff, 21 Nov): a page or album whose subject record refuses the photo
 *   (`refused`: another fish, nothing of the subject, "no") stays without it, Synodontis robbianus's album being the case.
 *   On its record's pages the clear sets aside only the verdict it answers, the dead fish (`CLEARED_VERDICT`), as the
 *   album step does;
 * - a file that's gone (a page renamed or folded) is passed over and reported.
 * The sweep's own rules (the credit rule, the cap, the captions) still act on what returns. Its record takes `back` (the
 * day), so a later removal, on any step's word, stands, and its places leave it. Where there's no history to read, it
 * waits, unmarked (`unread`).
 * Returns `file: url` for each place it went back to, `url: why` for each place or photo kept off, and `unread`.
 */
export async function putBackCleared(root: string, history: History, at = today(), refused: (id: string, url: string, aside?: typeof CLEARED_VERDICT) => boolean = () => false, dir = entriesDir()): Promise<{ back: string[]; off: string[]; unread: string[] }> {
  const out = { back: [] as string[], off: [] as string[], unread: [] as string[] }
  const sl = await readSecondLook(root)
  const rebased = await reconcileRebasedPlaces(root, sl)
  out.off.push(...rebased.off)
  out.back.push(...rebased.back)
  if (dir) await pruneKept(root, dir, sl)
  const l = looks(sl)
  const due = Object.keys(sl).filter(u => sl[u]!.off === true && l.cleared(u) && !sl[u]!.back)
  if (!due.length) return out
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  let unlisted = false
  // The part-photo list (video-images.ts): a stock photo by its Commons page, as written or hashed, a frame by its
  // address. A photo back on a guide's part leaves it for that guide; an entry for every guide is a person's, and stays.
  const partsFile = join(root, 'engine-state', '_part-photos-off.json')
  const partsOff = JSON.parse(await readFile(partsFile, 'utf8').catch(() => '{}')) as Record<string, { why: string; guides?: string[]; seconds?: number[]; agreedGuides?: string[]; manualGuides?: string[]; holds?: Record<string, string[]> }>
  let lifted = false
  const parts = {
    lift: (key: string, guide: string, photo: string) => {
      const entry = partsOff[key]
      if (!entry) return
      const photoKey = `sha256:${createHash('sha256').update(photo).digest('hex')}`
      if (entry.holds?.[photoKey]?.includes(guide)) {
        const rest = entry.holds[photoKey].filter(g => g !== guide)
        if (rest.length) entry.holds[photoKey] = rest
        else delete entry.holds[photoKey]
        if (!Object.keys(entry.holds).length) delete entry.holds
        lifted = true
      }
      if (!entry.guides?.includes(guide) || entry.agreedGuides?.includes(guide) || entry.manualGuides?.includes(guide)) return
      const recorded = Object.values(entry.holds ?? {}).some(guides => guides.includes(guide))
      const unresolved = Object.entries(sl).some(([url, mark]) => url !== photo && !mark.back &&
        mark.pages.includes(`guides/${guide}`) && mark.parts?.includes(key))
      if (recorded || unresolved) return
      entry.guides = entry.guides.filter(g => g !== guide)
      if (!entry.guides.length) delete partsOff[key]
      lifted = true
    },
  }
  const complete = (mark: SecondLook, recovered: readonly LeftPlace[] = []) => {
    if (mark.left?.length || recovered.length) {
      const settled = new Map((mark.settled ?? []).map(p => [placeKey(p), p]))
      for (const p of recovered) {
        const key = placeKey(p)
        if (!settled.has(key)) settled.set(key, { file: p.file, index: p.index, ...(p.path ? { path: p.path } : {}) })
      }
      for (const p of mark.left ?? []) settled.set(placeKey(p), p)
      mark.settled = [...settled.values()]
      delete mark.left
    }
    mark.back = at
  }
  const earlierOrders = new Map<string, string[][]>()
  restore: for (const u of due) {
    const entry = rejected[u]
    if (entry !== undefined && entry !== waitingEntry(sl[u]!.why)) {
      out.off.push(`${u}: on the never-again list as ${entry.split(':')[0]}`)
      complete(sl[u]!)
      continue
    }
    // Its record's places first: a run that brought it and took it off made one commit, which history never shows it in.
    // Their entries are kept on the Mac alone (`entriesDir`): a run that can't read them waits, unmarked, as one with no
    // history to read does.
    const own = sl[u]!.left ?? []
    if (own.length && !dir) { out.unread.push(u); continue }
    const captures = new Map<string, Kept>()
    try {
      for (const p of own) {
        if (!validPlace(p) ||
            (p.captureDay !== undefined && !day(p.captureDay)) ||
            (p.capture !== undefined && !/^[a-f0-9-]{36}$/.test(p.capture))) throw new Error('Invalid photo recovery place')
        const kept = await readKept(dir!, u, sl[u]!, p)
        if (kept) captures.set(placeKey(p), kept)
      }
    } catch {
      out.unread.push(u)
      continue
    }
    // A named capture is the checkout's exact entry. An older Git entry can have different metadata.
    if (own.some(p => p.capture && !captures.has(placeKey(p)))) { out.unread.push(u); continue }
    const historyPlaces = own.map(p => {
      const url = captures.get(placeKey(p))?.photo.url
      return typeof url === 'string' && url !== u ? { ...p, photoUrl: url } : p
    })
    const read = await history(u, sl[u]!.at, historyPlaces).catch(() => undefined)
    if (!read) { out.unread.push(u); continue }
    const fromHistory = new Map(read.map(p => [placeKey(p), p]))
    const mine: LeftPlace[] = []
    const missing: string[] = []
    for (const p of own) {
      const kept = captures.get(placeKey(p))
      if (kept) mine.push({ ...p, photo: kept.photo, order: kept.order, heading: kept.heading, partOrder: kept.partOrder, partImages: kept.partImages, times: fromHistory.get(placeKey(p))?.times ?? 1 })
      else if (!fromHistory.has(placeKey(p))) missing.push(`${u}: its entry on ${p.file} wasn't kept here`)
    }
    out.off.push(...missing)
    const settled = new Set((sl[u]!.settled ?? []).map(placeKey))
    const places = [...mine, ...read.filter(p => !settled.has(placeKey(p)) && !mine.some(o => placeKey(o) === placeKey(p)))]
    if (!places.length && !own.length) out.off.push(`${u}: it left no page or album that showed it when it was marked off`)
    const named = new Set(sl[u]!.pages.map(x => x.split('/')[1]))
    for (const p of places) {
      if (p.times > 1) { out.off.push(`${u}: it left ${p.file} again after it came back, and that removal stands`); continue }
      const id = p.file.match(/^content\/(?:species|plants|breeds)\/([^/]+)\/entity\.json$|^content\/gallery\/([^/]+)\.json$/)
      const page = id?.[1] ?? id?.[2]
      const address = typeof p.photo.url === 'string' ? p.photo.url : u
      const aliasRejection = address === u ? undefined : rejected[address]
      if (aliasRejection && aliasRejection !== waitingEntry(sl[u]!.why)) {
        out.off.push(`${u}: its copy on ${p.file} is on the never-again list as ${aliasRejection.split(':')[0]}`)
        continue
      }
      const aside = page && named.has(page) ? CLEARED_VERDICT : undefined
      if (page && (refused(page, u, aside) || (u !== address && refused(page, address, aside)))) { out.off.push(`${u}: the check refused it on ${page}`); continue }
      const file = join(root, p.file)
      let raw: string, doc: { photos?: Record<string, unknown>[]; video?: { figures?: Record<string, unknown>[] } }
      try {
        raw = await readFile(file, 'utf8')
        doc = JSON.parse(raw) as typeof doc
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') { out.off.push(`${u}: ${p.file} is gone`); continue }
        out.unread.push(u)
        continue restore
      }
      const samePhoto = photoAddressSet([u, address])
      const guideId = p.path ? p.file.match(/^content\/guides\/([^/]+)\/entity\.json$/)?.[1] : undefined
      let into: { photos?: Record<string, unknown>[]; moments?: Record<string, unknown>[]; photo?: Record<string, unknown> } = doc
      let slot: 'photos' | 'moments' | 'photo' = 'photos'
      if (p.path) {
        const figures = doc.video?.figures
        if (!guideId || !Array.isArray(figures)) { out.off.push(`${u}: its part of ${p.file} is gone`); continue }
        const saved = p.path[2]
        const headings = figures.flatMap((figure, i) => figure.heading === p.heading ? [i] : [])
        const priorHeadingCount = p.partOrder?.filter(heading => heading === p.heading).length ?? 0
        const occurrence = headingOccurrence(p.heading, saved, p.partOrder)
        const score = (figure: Record<string, unknown>, index: number) => {
          if (figure.heading !== p.partOrder?.[index]) return 0
          if (p.partOrder?.filter(heading => heading === figure.heading).length === 1) return 1
          const images = figurePhotoUrls(figure)
          return p.partImages?.[index]?.reduce((total, url) => {
            if (!images.includes(url)) return total
            const shared = p.partImages?.some((part, i) => i !== index && part.includes(url))
            return total + (shared ? 1 : 2)
          }, 0) ?? 0
        }
        const ranked = p.partImages ? headings.map(i => ({ i, score: score(figures[i]!, saved) }))
          .filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score) : []
        const corresponding = occurrence === undefined ? saved : headings[occurrence]
        const found = ranked.find(candidate => candidate.score === ranked[0]?.score && candidate.i === corresponding)?.i ?? ranked[0]?.i
        const dropped = found === undefined && priorHeadingCount > 1 && headings.length < priorHeadingCount && !!p.partImages
        const at = p.heading === undefined ? saved : found ?? (dropped ? -1 : occurrence === undefined
          ? figures[saved]?.heading === p.heading ? saved : headings[0] ?? -1
          : headings[occurrence] ?? -1)
        if (at < 0 && p.heading !== undefined) {
          into = { heading: p.heading, moments: [] } as typeof into
          const positions = figures.map(figure => p.partOrder?.map((_, i) => ({ i, score: score(figure, i) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0]?.i ?? -1)
          const next = positions.findIndex(index => index > saved)
          const prev = positions.findLastIndex(index => index >= 0 && index < saved)
          const index = next >= 0 ? next : prev >= 0 ? prev + 1 : Math.min(saved, figures.length)
          figures.splice(index, 0, into)
        } else {
          if (!figures[at]) { out.off.push(`${u}: its part of ${p.file} is gone`); continue }
          into = figures[at]!
        }
        slot = p.path[3]
      }
      if (slot === 'photo') {
        if (typeof into.photo?.url === 'string' && samePhoto(into.photo.url)) continue
        if (into.photo) { out.off.push(`${u}: its part of ${p.file} already has a photo`); continue }
        into.photo = p.photo
      } else {
        const photos = Array.isArray(into[slot]) ? into[slot]! : (into[slot] = [])
        const earlier = earlierOrders.get(placeKey(p)) ?? []
        const current = photos.map(photo => String(photo?.url))
        const order = earlier.find(order => order.includes(address) && order.some(url => url !== address && current.includes(url))) ?? p.order ?? []
        if (p.order?.length) {
          earlier.push(p.order)
          earlierOrders.set(placeKey(p), earlier)
        }
        const blockedHost = setsCookies(address)
        if (current.some(url => samePhoto(url) && (blockedHost || !setsCookies(url)))) continue
        if (!blockedHost) {
          for (let i = photos.length - 1; i >= 0; i--) {
            if (samePhoto(current[i]!) && setsCookies(current[i]!)) photos.splice(i, 1)
          }
        }
        const position = order.indexOf(address)
        const index = photoPosition(photos.map(photo => String(photo.url)), order, position >= 0 ? position : p.index, p.index)
        photos.splice(index, 0, p.photo)
      }
      await replacePhotoDocument(file, `${JSON.stringify(doc, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
      out.back.push(`${p.file}: ${address}`)
    }
    for (const key of sl[u]!.parts ?? []) for (const g of sl[u]!.pages) if (g.startsWith('guides/')) parts.lift(key, g.slice('guides/'.length), u)
    if (entry !== undefined) { delete rejected[u]; unlisted = true }
    complete(sl[u]!, places)
  }
  if (unlisted) await writePhotoState(rejectedFile, rejected)
  if (lifted) await writeImageCache(partsFile, `${JSON.stringify(partsOff, null, 2)}\n`)
  await writeSecondLook(root, sl)
  return out
}

/**
 * The sweep's part where the two lists disagree on a photo off at its first verdict (the chief of staff, 20 Nov 2026: the
 * record is the truth, and the safe side is off the page). Runs after `listAgreed` and `unlistCleared`.
 * - A record marked `off` with no answer and no never-again entry: its waiting entry is written back (`back`). One whose
 *   entry is a waiting entry for another reason takes the record's. One whose entry is another kind's keeps that entry,
 *   which keeps the photo off as well, and is reported (`other`): a waiting entry in its place would let a "clear" lift it.
 * - A waiting entry with no record marked for it stays in force, so the photo stays off, and is reported (`alone`).
 * Nothing leaves the never-again list here.
 */
export async function mendWaiting(root: string, deferred: ReadonlySet<string> = new Set()): Promise<{ back: string[]; other: string[]; alone: string[] }> {
  const sl = await readSecondLook(root)
  const l = looks(sl)
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const out = { back: [] as string[], other: [] as string[], alone: [] as string[] }
  for (const u of Object.keys(sl)) {
    if (!l.off(u) && !(deferred.has(u) && sl[u]!.off === true && !sl[u]!.back && !sl[u]!.settled?.length)) continue
    const want = waitingEntry(sl[u]!.why), have = rejected[u]
    if (have === want) continue
    if (have === undefined || have.startsWith('waiting:')) { rejected[u] = want; out.back.push(u) }
    else out.other.push(`${u}: its never-again entry is another kind's, left in force`)
  }
  for (const [u, why] of Object.entries(rejected)) if (why.startsWith('waiting:') && !(sl[u]?.off && !sl[u].back && why === waitingEntry(sl[u].why))) out.alone.push(`${u}: no second-look record marked for it, kept off`)
  if (out.back.length) await writePhotoState(rejectedFile, rejected)
  return out
}
