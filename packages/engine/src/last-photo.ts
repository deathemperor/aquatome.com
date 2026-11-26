import { mirrorSearchTerms, photoAddressSet, photoClears, photoHolds, photoKey, photoLookAnswer as lookOf, setsCookies, settledWaiting, type Photo } from '@aq/schema'
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
export type SecondLook = { why: string; step: string; pages: string[]; at: string; off?: true; look?: Look; back?: string; left?: Place[]; settled?: Place[] }
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
    /** Off its pages at its first verdict, and on the never-again list as waiting, until its look (above). */
    off,
    /** A source and its mirror share an unanswered first refusal. */
    pendingOff,
    /** Neither waiting nor cleared: a step's verdict may act on it. */
    open: (url: string) => has(sl, url) ? lookOf(sl[url])?.said === 'agree' : !cleared(url) && !held(url) && !pendingOff(url),
  }
}

/** A species, plant or breed page: its own photos and its album's, generated ones left out. */
export type PageShows = { ref: string; own: string[]; album: string[] }

/** Every species, plant and breed page, as the site shows it now. */
export async function pagesShowing(content: string, version: (p: Photo, ref: string, scientificName: string) => string | undefined = p => p.url): Promise<PageShows[]> {
  type Doc = { photos?: (Photo & { unchecked?: boolean })[]; scientificName?: string }
  const urls = (d: Doc | null, ref: string, scientificName: string, album = false) => [...new Set((d?.photos ?? []).flatMap(p => {
    const url = p?.url && !p.generated && !(album && p.unchecked) ? version(p, ref, scientificName) : undefined
    return url ? [url] : []
  }))]
  const read = async (f: string) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) as Doc | null
  const out: PageShows[] = []
  for (const kind of ['species', 'plants', 'breeds']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const own = await read(join(content, kind, id, 'entity.json'))
      if (!own) continue
      const ref = `${kind}/${id}`
      const name = own.scientificName ?? ''
      const album = await read(join(content, 'gallery', `${id}.json`))
      out.push({ ref, own: urls(own, ref, name), album: urls(album, kind === 'species' ? ref : '', name, true) })
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
): Map<string, string[]> {
  const addresses = new Map<string, string>()
  for (const url of verdicts) {
    const key = photoKey(url) ?? url
    if (!addresses.has(key)) addresses.set(key, url)
  }
  const byVerdict = (url: string) => addresses.get(photoKey(url) ?? url)
  // Keep the last own-photo decision, and check the album as well when no own photo could have shown.
  const candidates = pages.flatMap(page => page.own.length && page.album.length && page.own.every(url => unavailable(url, page.ref))
    ? [page, { ...page, own: [] }]
    : [page])
  const out = new Map<string, Set<string>>()
  for (const [url, refs] of lastPhotos(candidates, (url, ref) => byVerdict(url) !== undefined || unavailable(url, ref))) {
    const verdict = byVerdict(url)
    if (verdict) {
      const existing = out.get(verdict) ?? new Set<string>()
      for (const ref of refs) existing.add(ref)
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
export async function holdForSecondLook(root: string, held: Map<string, { why: string; pages: string[]; off?: true }>, step: string, at = today(), places?: Map<string, Stood[]>): Promise<string[]> {
  if (!held.size && !places?.size) return []
  const sl = await readSecondLook(root)
  const added: string[] = []
  for (const [url, h] of held) {
    // A first verdict's mark takes the place of a hold on another reason that has no answer yet (photo-check.ts spared).
    if (has(sl, url) && !(h.off && !sl[url]!.off && !lookOf(sl[url]))) continue
    sl[url] = { why: compactRejection(h.why), step, pages: [...new Set(h.pages)].sort(), at, ...(h.off ? { off: true as const } : {}) }
    added.push(url)
  }
  const dir = places?.size ? entriesDir() : undefined
  const captured = dir && places ? await capturePlaces(sl, places, dir) : false
  if (added.length || captured) await writeSecondLook(root, sl)
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
  for (const url of agreed) {
    // A waiting entry, for this reason or another, takes the verdict's own reason, on a record marked off or not: two runs'
    // records can meet in a merge with the unmarked one kept and the waiting entry beside it (the chief of staff, 20 Nov,
    // after that night's seven). On one marked off, a mark's entry does too, which a shop's own kept mark could otherwise
    // lift (the independent reader, 20 Nov).
    if (rejected[url]?.startsWith('waiting:') || (sl[url]!.off && rejected[url]?.startsWith('watermark:'))) rejected[url] = sl[url]!.why
    else rejected[url] ??= sl[url]!.why
    delete sl[url]
  }
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
export type Place = { file: string; index: number; capture?: string }
/** The same, with its entry there, as the step that takes it off holds it. */
export type Stood = Place & { photo: Record<string, unknown>; order?: string[] }
/** A place a photo's mark took it off, as it was just before it first left from the mark on; and how many times it left. */
export type LeftPlace = Stood & { times: number }

/**
 * The places in `data`, a page's, album's or guide's file at `file` read just before a step writes it without them, of
 * each photo `marked` names, added to `into` (url → places, with the entry).
 */
export function placesIn(root: string, file: string, data: { photos?: unknown }, marked: (url: string) => boolean | string | undefined, into: Map<string, Stood[]>) {
  const photos = Array.isArray(data.photos) ? (data.photos as Record<string, unknown>[]) : []
  const order = photos.map(p => typeof p?.url === 'string' ? p.url : '')
  photos.forEach((p, index) => {
    if (typeof p?.url !== 'string') return
    const decision = marked(p.url)
    if (!decision) return
    const url = typeof decision === 'string' ? decision : p.url
    into.set(url, [...(into.get(url) ?? []), { file: relative(root, file), index, photo: JSON.parse(JSON.stringify(p)), order }])
  })
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

type Kept = Stood & { url: string; at: string; why: string }
const keptFile = (dir: string, url: string, mark: SecondLook, p: Place) =>
  join(dir, `${createHash('sha256').update(JSON.stringify([url, mark.at, mark.why, p.file, p.index, ...(p.capture ? [p.capture] : [])])).digest('hex')}.json`)

async function readKept(dir: string, url: string, mark: SecondLook, p: Place): Promise<Kept | undefined> {
  const raw = await readFile(keptFile(dir, url, mark, p), 'utf8').catch(async (e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT' || !(await stat(dir)).isDirectory()) throw e
    return undefined
  })
  if (raw === undefined) return undefined
  const v = JSON.parse(raw) as Kept
  if (v?.url !== url || v.at !== mark.at || v.why !== mark.why || v.file !== p.file || v.index !== p.index || v.capture !== p.capture || typeof v.photo?.url !== 'string' ||
      (v.order !== undefined && (!Array.isArray(v.order) || v.order.some(u => typeof u !== 'string')))) {
    throw new Error('Unrecognized private photo recovery entry')
  }
  return v
}

/** Publish the entry only if absent. Readers see a complete file and repeat writers preserve the first capture. */
async function writeKept(dir: string, url: string, mark: SecondLook, p: Stood) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const file = keptFile(dir, url, mark, p)
  const temporary = `${file}.${randomUUID()}.next`
  try {
    await writeFile(temporary, JSON.stringify({ ...p, url, at: mark.at, why: mark.why }), { mode: 0o600, flag: 'wx' })
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
    const at = previous.get(place.file)
    if (at) at.push(entry)
    else previous.set(place.file, [entry])
  }
  for (const [url, places] of left) {
    const r = has(sl, url) ? sl[url]! : undefined
    if (!r || r.off !== true || lookOf(r) || r.back) continue
    const named = new Map((r.left ?? []).map(p => [p.file, p]))
    const byHost = (place: Stood) => Number(setsCookies(String(place.photo.url)))
    for (const p of [...places].sort((a, b) => byHost(a) - byHost(b))) {
      if (!PLACE.test(p.file)) continue
      const earlierPlace = named.get(p.file)
      if (earlierPlace) {
        if (byHost(p)) continue
        const earlier = await readKept(dir, url, r, earlierPlace)
        if (!earlier || !byHost(earlier)) continue
      }
      const place = { file: p.file, index: p.index, capture: randomUUID() }
      const order = p.order ? [...p.order] : undefined
      if (order) {
        for (const prior of previous.get(p.file) ?? []) {
          const earlier = (await readKept(dir, prior.url, prior.mark, prior.place))?.order
          if (!earlier?.includes(String(p.photo.url))) continue
          // Add neighbors a preceding pass removed from the same file. The current file keeps its own order.
          for (const [i, neighbor] of earlier.entries()) {
            if (order.includes(neighbor)) continue
            order.splice(photoPosition(order, earlier, i, order.length), 0, neighbor)
          }
        }
      }
      await writeKept(dir, url, r, { ...p, ...place, order })
      named.set(p.file, place)
      r.left = [...named.values()]
      const at = previous.get(p.file) ?? []
      if (!previous.has(p.file)) previous.set(p.file, at)
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

function publishedJson(root: string, file: string): Record<string, unknown> | undefined {
  const read = spawnSync('git', ['-C', root, 'show', `refs/remotes/origin/main:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (read.status !== 0) return undefined
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
    const restored = mark?.back && here?.back && mark.at === k.at && mark.why === k.why && here.at === k.at && here.why === k.why &&
      mark.settled?.some(p => p.file === k.file)
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
export function gitHistory(root: string): History {
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
    const marks = git('log', ...line, '--reverse', '--format=%H', `--since=${since}T00:00:00Z`, '--', `engine-state/${SECOND_LOOK_FILE}`)
    if (marks.status !== 0) return undefined
    const states = marks.stdout.split('\n').filter(Boolean)
    const mark = states.find(sha => recordAt(sha)?.[url]?.off === true)
    if (!mark) return []
    const parent = git('rev-parse', '--verify', '-q', `${mark}^`).stdout.trim()
    if (!parent) return []
    const urls = (data: unknown) => {
      const photos = object(data) ? data.photos : undefined
      return Array.isArray(photos) ? photos as Record<string, unknown>[] : []
    }
    // The places that showed it just before its mark (grep's status is 1 when none does).
    const mirrors = mirrorSearchTerms(url)
    const samePhoto = photoAddressSet([url])
    const shown = (p: Record<string, unknown>) => typeof p?.url === 'string' && samePhoto(p.url)
    const publishable = (p: Record<string, unknown>) => typeof p?.url === 'string' && samePhoto(p.url) && !setsCookies(p.url)
    const terms = [url, ...mirrors].flatMap(s => ['-e', s])
    const held = git('grep', '-l', '-F', ...terms, parent, '--', 'content/species', 'content/plants', 'content/breeds', 'content/gallery', 'content/guides')
    if (held.status !== 0 && held.status !== 1) return undefined
    const previous = new Set(held.stdout.split('\n').map(l => l.slice(parent.length + 1)).filter(f => PLACE.test(f) && urls(at(parent, f)).some(shown)))
    const places = [...new Set([...previous, ...captured.map(p => p.file).filter(f => PLACE.test(f))])]
    if (!places.length) return []
    const byFile = new Map(captured.map(p => [p.file, p.photoUrl ?? url]))
    const captureCommits = new Map<string, string>()
    for (const place of captured) {
      if (!place.capture) continue
      const match = (p: Place) => p.file === place.file && p.capture === place.capture
      const published = states.find(sha => {
        const entry = recordAt(sha)?.[url]
        return entry?.left?.some(match) || entry?.settled?.some(match)
      })
      if (published) captureCommits.set(place.file, published)
    }
    const addresses = new Set([url, ...byFile.values()])
    const search = mirrors.length || addresses.size > 1 ? [] : ['-S', url]
    const served = new Set(places.filter(file => urls(at(parent, file)).some(publishable)))
    const log = git('log', ...line, '--reverse', '--format=%H', ...search, `${parent}..HEAD`, '--', ...places)
    if (log.status !== 0) return undefined
    const out = new Map<string, LeftPlace>()
    // Oldest first: the first leaving gives the place and the entry; every leaving counts.
    for (const sha of log.stdout.split('\n').filter(Boolean)) {
      const files = git('diff', '--name-only', '--no-renames', ...search, `${sha}^`, sha, '--', ...places)
      if (files.status !== 0) return undefined
      for (const file of files.stdout.split('\n').filter(Boolean)) {
        const capturedAt = captureCommits.get(file)
        if (capturedAt && capturedAt !== mark && capturedAt !== sha) {
          const afterCapture = git('merge-base', '--is-ancestor', capturedAt, sha)
          if (afterCapture.status === 1) continue
          if (afterCapture.status !== 0) return undefined
        }
        const matches = photoAddressSet([url, byFile.get(file) ?? url])
        const shownAt = (p: Record<string, unknown>) => typeof p?.url === 'string' && matches(p.url)
        const before = urls(at(`${sha}^`, file))
        const publishableAt = (p: Record<string, unknown>) => shownAt(p) && !setsCookies(p.url as string)
        if (before.some(publishableAt)) served.add(file)
        const tracked = served.has(file) ? publishableAt : shownAt
        const index = before.findIndex(tracked)
        if (index < 0 || urls(at(sha, file)).some(tracked)) continue
        const had = out.get(file)
        if (had) had.times++
        else {
          const starting = capturedAt && capturedAt !== mark ? [`${capturedAt}^`, capturedAt] : [parent, mark]
          const wasPresent = (!capturedAt && previous.has(file)) ||
            (byFile.has(file) && starting.some(rev => urls(at(rev, file)).some(shownAt)))
          const times = wasPresent ? 1 : 2
          out.set(file, { file, index, photo: before[index]!, times, order: before.map(p => typeof p?.url === 'string' ? p.url : '') })
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

/** After a push rebase, honor a new removal on main before publishing a completed local restore. */
async function checkUnpublishedRestores(root: string, local: SecondLooks, history: History): Promise<string[]> {
  const done = Object.entries(local).filter(([, mark]) => mark.back && mark.settled?.length && lookOf(mark)?.said === 'clear')
  if (!done.length) return []
  const published = publishedJson(root, `engine-state/${SECOND_LOOK_FILE}`) as SecondLooks | undefined
  const undone: string[] = []
  for (const [url, mark] of done) {
    const prior = published?.[url]
    if (!prior?.off || prior.at !== mark.at || prior.why !== mark.why || prior.back) continue
    const historyPlaces = await history(url, mark.at, mark.settled)
    if (!historyPlaces) throw new Error('Could not verify an unpublished photo restore after pulling main')
    const settled = new Set(mark.settled!.map(p => p.file))
    const matches = photoAddressSet([url])
    for (const p of historyPlaces) {
      if (p.times < 2 || !settled.has(p.file)) continue
      const blockedHost = setsCookies(typeof p.photo.url === 'string' ? p.photo.url : url)
      const matchesRestored = (address: string) => matches(address) && (blockedHost || !setsCookies(address))
      const main = publishedJson(root, p.file)
      if (Array.isArray(main?.photos) && main.photos.some(photo => typeof photo?.url === 'string' && matchesRestored(photo.url))) continue
      const file = join(root, p.file)
      const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (raw === undefined) continue
      const data = JSON.parse(raw) as { photos?: { url: string }[] }
      if (!data.photos) continue
      const keep = data.photos.filter(photo => !matchesRestored(photo.url))
      if (keep.length === data.photos.length) continue
      await replacePhotoDocument(file, `${JSON.stringify({ ...data, photos: keep }, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
      undone.push(`${url}: it left ${p.file} again on main, and that removal stands`)
    }
  }
  return undone
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
  if (dir) await pruneKept(root, dir, sl)
  out.off.push(...await checkUnpublishedRestores(root, sl, history))
  const l = looks(sl)
  const due = Object.keys(sl).filter(u => sl[u]!.off === true && l.cleared(u) && !sl[u]!.back)
  if (!due.length) return out
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  let unlisted = false
  const complete = (mark: SecondLook, recovered: readonly LeftPlace[] = []) => {
    if (mark.left?.length || recovered.length) {
      const settled = new Map((mark.settled ?? []).map(p => [p.file, p]))
      for (const { file, index } of recovered) if (!settled.has(file)) settled.set(file, { file, index })
      for (const p of mark.left ?? []) settled.set(p.file, p)
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
        if (!PLACE.test(p.file) || !Number.isSafeInteger(p.index) || p.index < 0 ||
            (p.capture !== undefined && !/^[a-f0-9-]{36}$/.test(p.capture))) throw new Error('Invalid photo recovery place')
        const kept = await readKept(dir!, u, sl[u]!, p)
        if (kept) captures.set(p.file, kept)
      }
    } catch {
      out.unread.push(u)
      continue
    }
    // A named capture is the checkout's exact entry. An older Git entry can have different metadata.
    if (own.some(p => p.capture && !captures.has(p.file))) { out.unread.push(u); continue }
    const historyPlaces = own.map(p => {
      const url = captures.get(p.file)?.photo.url
      return typeof url === 'string' && url !== u ? { ...p, photoUrl: url } : p
    })
    const read = await history(u, sl[u]!.at, historyPlaces).catch(() => undefined)
    if (!read) { out.unread.push(u); continue }
    const fromHistory = new Map(read.map(p => [p.file, p]))
    const mine: LeftPlace[] = []
    const missing: string[] = []
    for (const p of own) {
      const kept = captures.get(p.file)
      if (kept) mine.push({ ...p, photo: kept.photo, order: kept.order, times: fromHistory.get(p.file)?.times ?? 1 })
      else if (!fromHistory.has(p.file)) missing.push(`${u}: its entry on ${p.file} wasn't kept here`)
    }
    out.off.push(...missing)
    const settled = new Set((sl[u]!.settled ?? []).map(p => p.file))
    const places = [...mine, ...read.filter(p => !settled.has(p.file) && !mine.some(o => o.file === p.file))]
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
      let raw: string, doc: { photos?: Record<string, unknown>[] }
      try {
        raw = await readFile(file, 'utf8')
        doc = JSON.parse(raw) as typeof doc
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') { out.off.push(`${u}: ${p.file} is gone`); continue }
        out.unread.push(u)
        continue restore
      }
      const photos = Array.isArray(doc.photos) ? doc.photos : (doc.photos = [])
      const samePhoto = photoAddressSet([u, address])
      const earlier = earlierOrders.get(p.file) ?? []
      const current = photos.map(photo => String(photo?.url))
      const order = earlier.find(order => order.includes(address) && order.some(url => url !== address && current.includes(url))) ?? p.order ?? []
      if (p.order?.length) {
        earlier.push(p.order)
        earlierOrders.set(p.file, earlier)
      }
      const blockedHost = setsCookies(address)
      if (current.some(url => samePhoto(url) && (blockedHost || !setsCookies(url)))) continue
      const position = order.indexOf(address)
      const index = photoPosition(current, order, position >= 0 ? position : p.index, p.index)
      photos.splice(index, 0, p.photo)
      await replacePhotoDocument(file, `${JSON.stringify(doc, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
      out.back.push(`${p.file}: ${address}`)
    }
    if (entry !== undefined) { delete rejected[u]; unlisted = true }
    complete(sl[u]!, places)
  }
  if (unlisted) await writePhotoState(rejectedFile, rejected)
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
