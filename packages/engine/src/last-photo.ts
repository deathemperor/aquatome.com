import { mkdir, readdir, readFile } from 'node:fs/promises'
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
 */
export type Look = { said: 'agree' | 'clear'; by: string; on: string }
export type SecondLook = { why: string; step: string; pages: string[]; at: string; look?: Look }
export type SecondLooks = Record<string, SecondLook>
export const SECOND_LOOK_FILE = '_photo-second-look.json'

const fileOf = (root: string) => join(root, 'engine-state', SECOND_LOOK_FILE)
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const day = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const lookOf = (e: unknown): Look | undefined => {
  const l = object(e) ? e.look : undefined
  return object(l) && (l.said === 'agree' || l.said === 'clear') && typeof l.by === 'string' && l.by.trim() !== '' && day(l.on) ? (l as Look) : undefined
}
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
    /** Neither waiting nor cleared: a step's verdict may act on it. */
    open: (url: string) => !has(sl, url) || lookOf(sl[url])?.said === 'agree',
  }
}

/** A species, plant or breed page: its own photos and its album's, generated ones left out. */
export type PageShows = { ref: string; own: string[]; album: string[] }

/** Every species, plant and breed page, as the site shows it now. */
export async function pagesShowing(content: string): Promise<PageShows[]> {
  type Doc = { photos?: { url?: unknown; generated?: unknown }[] }
  const urls = (d: Doc | null) => [...new Set((d?.photos ?? []).filter(p => typeof p?.url === 'string' && !p.generated).map(p => p.url as string))]
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

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Puts each photo a step holds on the second look, once. An entry already there, with its look, is kept as it is; the
 * record is read again first, so what another step wrote meanwhile stays. Returns the photos newly put there.
 */
export async function holdForSecondLook(root: string, held: Map<string, { why: string; pages: string[] }>, step: string, at = today()): Promise<string[]> {
  if (!held.size) return []
  const sl = await readSecondLook(root)
  const added: string[] = []
  for (const [url, h] of held) {
    if (has(sl, url)) continue
    sl[url] = { why: compactRejection(h.why), step, pages: [...new Set(h.pages)].sort(), at }
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
    rejected[url] ??= sl[url]!.why
    delete sl[url]
  }
  await writePhotoState(rejectedFile, rejected)
  await writeSecondLook(root, sl)
  return agreed
}
