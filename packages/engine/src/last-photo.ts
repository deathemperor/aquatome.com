import { photoKey, photoLookAnswer as lookOf, type Photo } from '@aq/schema'
import { spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { compactRejection } from './photo-observations'
import { writeImageCache } from './image-cache-write'
import { writePhotoState } from './photo-state'

/**
 * A page's last photo doesn't come off on an automatic check's word alone (the chief of staff, 2026-11-14, after one
 * night's runs left 27 fish pages with no photo). A step that would leave a species, plant or breed page with nothing
 * (none of its own photos where it had some, or, with none of its own, an empty album) takes none of those photos off
 * anywhere and doesn't list them never-again. Each goes on engine-state/_photo-second-look.json for a second,
 * independent look (another model, or a person) and stays where it is until that look agrees.
 *
 * The record: photo → { why (the step's reason as the never-again list keeps it, a category and a hash: no model
 * prose), step, the pages it would have emptied, the day }. A look's answer is written by a pull request, never by the
 * engine: `look: { said, by, on }`.
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
/** `back`: the day the sweep put a cleared photo back where it was, or found another reason keeps it off (`putBackCleared`). */
export type SecondLook = { why: string; step: string; pages: string[]; at: string; off?: true; look?: Look; back?: string }
export type SecondLooks = Record<string, SecondLook>
export const SECOND_LOOK_FILE = '_photo-second-look.json'

const fileOf = (root: string) => join(root, 'engine-state', SECOND_LOOK_FILE)
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
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
  return {
    /** Cleared: no automatic verdict takes it off. */
    cleared: (url: string) => has(sl, url) && lookOf(sl[url])?.said === 'clear',
    /** Agreed: off as the step's verdict says, and onto the never-again list (the sweep). */
    agreed: (url: string) => has(sl, url) && lookOf(sl[url])?.said === 'agree',
    /** Held with no answer yet: it stays on every page. */
    waiting: (url: string) => has(sl, url) && !lookOf(sl[url]),
    /** Off its pages at its first verdict, and on the never-again list as waiting, until its look (above). */
    off: (url: string) => has(sl, url) && sl[url]!.off === true && !lookOf(sl[url]),
    /** Neither waiting nor cleared: a step's verdict may act on it. */
    open: (url: string) => !has(sl, url) || lookOf(sl[url])?.said === 'agree',
  }
}

/** A species, plant or breed page: its own photos and its album's, generated ones left out. */
export type PageShows = { ref: string; own: string[]; album: string[] }

/** Every species, plant and breed page, as the site shows it now. */
export async function pagesShowing(content: string, version: (p: Photo) => string | undefined = p => p.url): Promise<PageShows[]> {
  type Doc = { photos?: Photo[] }
  const urls = (d: Doc | null) => [...new Set((d?.photos ?? []).flatMap(p => {
    const url = p?.url && !p.generated ? version(p) : undefined
    return url ? [url] : []
  }))]
  const read = async (f: string) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) as Doc | null
  const out: PageShows[] = []
  for (const kind of ['species', 'plants', 'breeds']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const own = await read(join(content, kind, id, 'entity.json'))
      if (!own) continue
      out.push({ ref: `${kind}/${id}`, own: urls(own), album: urls(await read(join(content, 'gallery', `${id}.json`))) })
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
  pages: PageShows[], off: (url: string, ref: string) => boolean, verdicts: Iterable<string>,
): Map<string, string[]> {
  const addresses = new Map<string, string[]>()
  for (const url of verdicts) {
    const key = photoKey(url) ?? url
    addresses.set(key, [...(addresses.get(key) ?? []), url])
  }
  const out = new Map<string, Set<string>>()
  for (const [url, refs] of lastPhotos(pages, off)) {
    for (const verdict of addresses.get(photoKey(url) ?? url) ?? []) {
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
export async function holdForSecondLook(root: string, held: Map<string, { why: string; pages: string[]; off?: true }>, step: string, at = today()): Promise<string[]> {
  if (!held.size) return []
  const sl = await readSecondLook(root)
  const added: string[] = []
  for (const [url, h] of held) {
    // A first verdict's mark takes the place of a hold on another reason that has no answer yet (photo-check.ts spared).
    if (has(sl, url) && !(h.off && !sl[url]!.off && !lookOf(sl[url]))) continue
    sl[url] = { why: compactRejection(h.why), step, pages: [...new Set(h.pages)].sort(), at, ...(h.off ? { off: true as const } : {}) }
    added.push(url)
  }
  if (added.length) await writeSecondLook(root, sl)
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
 * The sweep's part for a photo off at its first verdict that the look cleared: its waiting entry leaves the never-again
 * list, so the step that found it can bring it back. Returns them.
 */
export async function unlistCleared(root: string): Promise<string[]> {
  const sl = await readSecondLook(root)
  const l = looks(sl)
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const out = Object.keys(sl).filter(u => sl[u]!.off === true && l.cleared(u) && rejected[u] === waitingEntry(sl[u]!.why))
  if (!out.length) return []
  for (const u of out) delete rejected[u]
  await writePhotoState(rejectedFile, rejected)
  return out
}

/**
 * A place a photo's mark took it off: its page's, album's or guide's file (from the repository's root), its place in the
 * list and its entry there, as they were just before it first left from the mark on; and how many times it left.
 */
export type LeftPlace = { file: string; index: number; photo: Record<string, unknown>; times: number }
/**
 * The repository's history, as the put-back reads it: each page, album or guide file that showed a photo just before
 * the commit that marked it off, and that it left from that commit on, with its place and its entry as they were just
 * before it first left. That commit is the first since the start of `since` (its record's day, UTC, as records are
 * dated) whose record has it `off`. None if no commit since marked it. Undefined where there's no history to read here
 * (not a repository, or a shallow clone): nothing is put back, and a full clone does it later.
 */
export type History = (url: string, since: string) => Promise<LeftPlace[] | undefined>

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
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const line = ['--first-parent', '--diff-merges=first-parent', '--no-patch', '--no-renames']
  // The record as each commit had it, read once for every photo the sweep asks about.
  const records = new Map<string, SecondLooks | undefined>()
  const recordAt = (sha: string) => {
    if (!records.has(sha)) {
      const r = git('show', `${sha}:engine-state/${SECOND_LOOK_FILE}`)
      let v: unknown
      try { v = r.status === 0 ? JSON.parse(r.stdout) : undefined } catch { v = undefined }
      records.set(sha, object(v) ? (v as SecondLooks) : undefined)
    }
    return records.get(sha)
  }
  return async (url, since) => {
    const shallow = git('rev-parse', '--is-shallow-repository')
    if (shallow.status !== 0 || shallow.stdout.trim() !== 'false') return undefined
    const marks = git('log', ...line, '--reverse', '--format=%H', `--since=${since}T00:00:00Z`, '--', `engine-state/${SECOND_LOOK_FILE}`)
    if (marks.status !== 0) return undefined
    const mark = marks.stdout.split('\n').filter(Boolean).find(sha => recordAt(sha)?.[url]?.off === true)
    if (!mark) return []
    const parent = git('rev-parse', '--verify', '-q', `${mark}^`).stdout.trim()
    if (!parent) return []
    const at = (rev: string, file: string) => { const r = git('show', `${rev}:${file}`); try { return r.status === 0 ? JSON.parse(r.stdout) as { photos?: unknown } : undefined } catch { return undefined } }
    const urls = (d: { photos?: unknown } | undefined) => (Array.isArray(d?.photos) ? d.photos as Record<string, unknown>[] : [])
    // The places that showed it just before its mark (grep's status is 1 when none does).
    const held = git('grep', '-l', '-F', '-e', url, parent, '--', 'content/species', 'content/plants', 'content/breeds', 'content/gallery', 'content/guides')
    if (held.status !== 0 && held.status !== 1) return undefined
    const places = held.stdout.split('\n').map(l => l.slice(parent.length + 1)).filter(f => PLACE.test(f) && urls(at(parent, f)).some(p => p?.url === url))
    if (!places.length) return []
    const log = git('log', ...line, '--reverse', '--format=%H', '-S', url, `${parent}..HEAD`, '--', ...places)
    if (log.status !== 0) return undefined
    const out = new Map<string, LeftPlace>()
    // Oldest first: the first leaving gives the place and the entry; every leaving counts.
    for (const sha of log.stdout.split('\n').filter(Boolean)) {
      const files = git('diff', '--name-only', '--no-renames', '-S', url, `${sha}^`, sha, '--', ...places)
      for (const file of files.stdout.split('\n').filter(Boolean)) {
        const before = urls(at(`${sha}^`, file)), index = before.findIndex(p => p?.url === url)
        if (index < 0 || urls(at(sha, file)).some(p => p?.url === url)) continue
        const had = out.get(file)
        if (had) had.times++
        else out.set(file, { file, index, photo: before[index]!, times: 1 })
      }
    }
    return [...out.values()]
  }
}

/**
 * The subject verdict a second look's clear answers, on the pages its record names, for a photo marked off at its first
 * verdict: the dead fish (a person is a mark on a verdict, not a verdict of its own). Another fish, nothing of the
 * subject and "no" are the page's own, and stand (the chief of staff, 21 Nov).
 */
export const CLEARED_VERDICT = 'dead' as const

/**
 * The sweep's part, before anything else reads a page: each photo off at its first verdict that the look cleared goes
 * back where it was, once (the chief of staff, 20 Nov 2026). Every page, album and guide that showed it when it was
 * marked off and that it left from then on, at its place there and as its entry was, from the repository's history; one
 * that already shows it is left as it is.
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
 * day), so a later removal, on any step's word, stands. Where there's no history to read, it waits, unmarked (`unread`).
 * Returns `file: url` for each place it went back to, `url: why` for each place or photo kept off, and `unread`.
 */
export async function putBackCleared(root: string, history: History, at = today(), refused: (id: string, url: string, aside?: typeof CLEARED_VERDICT) => boolean = () => false): Promise<{ back: string[]; off: string[]; unread: string[] }> {
  const out = { back: [] as string[], off: [] as string[], unread: [] as string[] }
  const sl = await readSecondLook(root)
  const l = looks(sl)
  const due = Object.keys(sl).filter(u => sl[u]!.off === true && l.cleared(u) && !sl[u]!.back)
  if (!due.length) return out
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  let unlisted = false
  for (const u of due) {
    const entry = rejected[u]
    if (entry !== undefined && entry !== waitingEntry(sl[u]!.why)) {
      out.off.push(`${u}: on the never-again list as ${entry.split(':')[0]}`)
      sl[u]!.back = at
      continue
    }
    const places = await history(u, sl[u]!.at)
    if (!places) { out.unread.push(u); continue }
    if (!places.length) out.off.push(`${u}: it left no page or album that showed it when it was marked off`)
    const named = new Set(sl[u]!.pages.map(x => x.split('/')[1]))
    for (const p of places) {
      if (p.times > 1) { out.off.push(`${u}: it left ${p.file} again after it came back, and that removal stands`); continue }
      const id = p.file.match(/^content\/(?:species|plants|breeds)\/([^/]+)\/entity\.json$|^content\/gallery\/([^/]+)\.json$/)
      const page = id?.[1] ?? id?.[2]
      if (page && refused(page, u, named.has(page) ? CLEARED_VERDICT : undefined)) { out.off.push(`${u}: the check refused it on ${page}`); continue }
      const file = join(root, p.file)
      const raw = await readFile(file, 'utf8').catch(() => undefined)
      if (raw === undefined) { out.off.push(`${u}: ${p.file} is gone`); continue }
      const doc = JSON.parse(raw) as { photos?: Record<string, unknown>[] }
      const photos = Array.isArray(doc.photos) ? doc.photos : (doc.photos = [])
      if (photos.some(x => x?.url === u)) continue
      photos.splice(Math.min(p.index, photos.length), 0, p.photo)
      await writeFile(file, `${JSON.stringify(doc, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
      out.back.push(`${p.file}: ${u}`)
    }
    if (entry !== undefined) { delete rejected[u]; unlisted = true }
    sl[u]!.back = at
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
export async function mendWaiting(root: string): Promise<{ back: string[]; other: string[]; alone: string[] }> {
  const sl = await readSecondLook(root)
  const l = looks(sl)
  const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
  const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const out = { back: [] as string[], other: [] as string[], alone: [] as string[] }
  for (const u of Object.keys(sl)) {
    if (!l.off(u)) continue
    const want = waitingEntry(sl[u]!.why), have = rejected[u]
    if (have === want) continue
    if (have === undefined || have.startsWith('waiting:')) { rejected[u] = want; out.back.push(u) }
    else out.other.push(`${u}: its never-again entry is another kind's, left in force`)
  }
  for (const [u, why] of Object.entries(rejected)) if (why.startsWith('waiting:') && !(l.off(u) && why === waitingEntry(sl[u]!.why))) out.alone.push(`${u}: no second-look record marked for it, kept off`)
  if (out.back.length) await writePhotoState(rejectedFile, rejected)
  return out
}
