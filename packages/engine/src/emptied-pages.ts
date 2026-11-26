import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEAD_SCREEN_FILE, deadLooked, deadScreenPhotoUrls, FACES_FILE, LANGS, loadAll, PHOTO_BOXES_FILE, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, SECOND_LOOK_RECORD, vnDate, type Photo } from '@aq/schema'

/**
 * Fish pages our removals left with no photo, first for new photos (the chief of staff, 21 Nov): every page a run's own
 * steps empty goes on engine-state/_priority-emptied.json, `kind/id` → the day it went on, and nothing else, since the
 * repository is public. The album step and the photo check take it with the owner's list (priority-fish.ts), oldest day
 * first, and a page stops being taken first at its first shown photo; the owner's fish keep their six.
 *
 * The sweep lists them, last, after every step of the run that writes a page: a fish page (species or breed) whose page
 * or album file differs from where the run's branch meets main (`base`), that showed a photo there and is a page with no
 * photo now. The sweep runs twice: before the run's commit, where that is the commit the run started from, and on main
 * after the run caught up (cycle-checks.sh sweep_merged), where it is main as it is now, so a page emptied by this run's
 * removal and another run's together is seen there (the independent reader, 21 Nov). A page the list holds already keeps
 * its first day. The one gap: a hand change that takes a page's last photo off the page itself isn't seen, as no run's
 * step made that removal. Hand changes go through the records and the sweep, so the next run's removal is seen (as with
 * the chief of staff's 46 of 21 Nov). And one the engine can't know: a page hidden on the owner's dashboard is dropped by
 * the site at deploy (apps/site/src/lib/hidden.ts, from a file fetched then, not in the repository), so it can be listed
 * and taken first. Nor is a page whose own files didn't change, emptied because the face finder hasn't read another
 * page's own photo that its album shows (load.ts), until a change to its own files brings it in.
 */
export const EMPTIED_FILE = '_priority-emptied.json'

/**
 * The site's GALLERY_MIN (apps/site/src/lib/gallery.ts): an album of this many pictures shows on its fish's page, in the
 * strip that opens the viewer. A test holds the two equal, and the engine's answer to the site's for each case.
 */
export const SITE_GALLERY_MIN = 1

/** A file of the repository, from its root, as some state of it holds it; undefined where it has none. */
export type Read = (path: string) => Promise<string | undefined>

/**
 * The species, plant and guide pages' entity files (from the repository's root) that may name any of `urls`, as the same
 * state as a Read holds them: the pages that may own one as their own photo.
 */
export type Owners = (urls: string[]) => Promise<string[]>

const OWNER_KINDS = ['species', 'plants', 'guides'] as const

/** Owners as the working tree at `root` holds them: each page whose own photos hold one of the addresses. */
export const diskOwners = (root: string): Owners => async urls => {
  const want = new Set(urls), out: string[] = []
  for (const kind of OWNER_KINDS) {
    for (const id of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
      const f = `content/${kind}/${id}/entity.json`
      const s = await readFile(join(root, f), 'utf8').catch(() => undefined)
      if (s !== undefined && ((JSON.parse(s) as { photos?: Photo[] }).photos ?? []).flatMap(deadScreenPhotoUrls).some(u => want.has(u))) out.push(f)
    }
  }
  return out
}

/** Owners as commit `at` of the repository at `root` holds them: each such page whose file names one of the addresses. */
const commitOwners = (root: string, at: string): Owners => async urls => {
  const r = spawnSync('git', ['-C', root, 'grep', '-l', '-F', '-f', '-', at, '--', ...OWNER_KINDS.map(k => `content/${k}/*/entity.json`)], { input: urls.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status === 1) return []
  if (r.status !== 0) throw new Error(`git grep at ${at}: ${r.stderr.trim()}`)
  return r.stdout.split('\n').filter(Boolean).map(l => l.slice(at.length + 1))
}

/**
 * What the site's loader reads (@aq/schema load.ts), by whether it decides a fish page and the photos it shows. `content`
 * and `records` (engine-state) are copied for it; `pages` per page (a page's own files and its gallery); `elsewhere` is
 * about other pages, or about how a photo shows, not whether. A test holds this to every file load.ts reads, so a new one
 * is placed here before it can make the engine's answer differ from the site's. The face record and the dead-fish
 * screen's list are read once the face rule is on main, and the looks for a dead fish (the screen's record, the photo
 * check's two, the second look's) once the dead-look rule is. Another page's own entity file can decide whether a photo
 * shows too, when the face finder hasn't read it or no look has judged it for a dead fish (load.ts): those are copied by
 * their address (`Owners`).
 */
export const LOADER_FILES = {
  content: ['sources.json', 'one-voice.json', 'image-approvals.json', 'picture-hashes.json'],
  records: [PHOTO_SCREEN_FILE, '_photo-faces.json', '_photo-dead-owed.json', DEAD_SCREEN_FILE, PHOTO_CHECK_FILE, PHOTO_SUBJECTS_FILE, SECOND_LOOK_RECORD, PHOTO_REJECTED_FILE],
  pages: ['gallery'],
  elsewhere: ['captions', 'cards', 'changelog.json', 'equipment', 'materials', 'page-dates.json', 'products', 'series', 'video-generated.json', 'video-titles', PHOTO_BOXES_FILE],
} as const

/**
 * Whether each of `refs` (`species/id`, `breeds/id`) shows a photo, by the site's own rule, read from where the site
 * reads it: the site's loader (@aq/schema loadAll, as the site's public build runs it in each language it serves, held
 * pages left out: apps/site/src/lib/content.ts getContent) over those pages as `read` holds them, with
 * every other file it reads that decides a fish page and its photos (LOADER_FILES). A page shows a photo when the loader
 * leaves it one of its own, or when its album (a species' gallery; a breed's own photos after its first, then its
 * gallery: apps/site/src/lib/photo-page.ts albumOf) holds SITE_GALLERY_MIN pictures, in any language. A page the loader
 * drops in every language (no section it may show, or held back by the reader-fit gate) has no answer: it is no page,
 * with or without photos. An own photo of a species, plant or guide page that the face finder hasn't read, or of a species
 * or plant page that no look has judged for a dead fish, waits wherever it shows, so the page that owns one of theirs is
 * copied too (`owners`, in the same state as `read`), its entity file
 * being all the loader reads of it there. The loader runs on a copy of those files in the system's temp folder, removed
 * after.
 */
export async function showingPhotos(refs: string[], read: Read, owners: Owners): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (!refs.length) return out
  const tmp = await mkdtemp(join(tmpdir(), 'aq-emptied-'))
  try {
    const put = async (path: string) => {
      const s = await read(path)
      if (s === undefined) return undefined
      await mkdir(dirname(join(tmp, path)), { recursive: true })
      await writeFile(join(tmp, path), s)
      return s
    }
    for (const kind of ['species', 'plants', 'breeds', 'guides', 'gallery']) await mkdir(join(tmp, 'content', kind), { recursive: true })
    for (const f of LOADER_FILES.content) await put(`content/${f}`)
    for (const f of LOADER_FILES.records) await put(`engine-state/${f}`)
    const theirs: string[] = []
    for (const ref of refs) {
      const [kind, id] = ref.split('/') as [string, string]
      for (const f of LANGS.map(l => `content/${kind}/${id}/${l}.json`)) await put(f)
      for (const f of [`content/${kind}/${id}/entity.json`, `content/gallery/${id}.json`]) { const s = await put(f); if (s !== undefined) theirs.push(s) }
    }
    const urls = theirs.flatMap(s => ((JSON.parse(s) as { photos?: Photo[] }).photos ?? []).flatMap(deadScreenPhotoUrls))
    const waits = new Set<string>()
    const record = await read(`engine-state/${FACES_FILE}`)
    if (record !== undefined) {
      const seen = JSON.parse(record) as Record<string, number>
      for (const u of urls) if (!Object.hasOwn(seen, u)) waits.add(u)
    }
    const screen = await read(`engine-state/${DEAD_SCREEN_FILE}`)
    if (screen !== undefined) {
      const state = async (f: string) => { const s = await read(`engine-state/${f}`); return s === undefined ? undefined : JSON.parse(s) as Record<string, unknown> }
      const looked = deadLooked({ screen: JSON.parse(screen) as Record<string, unknown>, check: await state(PHOTO_CHECK_FILE), subjects: await state(PHOTO_SUBJECTS_FILE), secondLook: await state(SECOND_LOOK_RECORD) })
      for (const u of urls) if (!looked(u)) waits.add(u)
    }
    if (waits.size) for (const f of await owners([...waits])) await put(f)
    const album = (photos: unknown[]) => photos.length >= SITE_GALLERY_MIN
    const shows = (ref: string, yes: boolean) => out.set(ref, out.get(ref) === true || yes)
    for (const lang of LANGS) {
      const c = await loadAll({ root: join(tmp, 'content'), lang, publicBuild: true, leaveOutHeld: true })
      for (const s of c.species) shows(`species/${s.id}`, s.photos.length > 0 || album(c.galleries[s.id] ?? []))
      for (const b of c.breeds) shows(`breeds/${b.id}`, b.photos.length > 0 || album([...b.photos.slice(1), ...(c.galleries[b.id] ?? [])]))
    }
    return new Map([...out].filter(([r]) => refs.includes(r)))
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

const REF = /^(species|breeds)\/[a-z0-9-]+$/, DAY = /^\d{4}-\d{2}-\d{2}$/

/** A priority list as written: `kind/id` → day. A malformed line is left out, and a file that isn't JSON reads as none. */
export async function readList(root: string, file: string, ref: RegExp = REF): Promise<Record<string, string>> {
  let raw: unknown
  try { raw = JSON.parse(await readFile(join(root, 'engine-state', file), 'utf8')) } catch { return {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => ref.test(e[0]) && typeof e[1] === 'string' && DAY.test(e[1])))
}

/**
 * The sweep's last part: each fish page this run left with no photo goes on the list, dated `at` (the day in Vietnam, as
 * the lists are dated). Compared with where the branch meets its upstream (main), or with HEAD where it has none; nothing
 * where there's no commit to compare with. A listed page that's gone (folded into another, or renamed) leaves the list,
 * so it names only pages that exist. Returns the pages newly listed.
 */
export async function listEmptied(root: string, at = vnDate(new Date())): Promise<string[]> {
  const git = (...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  // A page that's gone now (folded into another, renamed) is no page left with no photo, and leaves the list.
  const here = (r: string) => access(join(root, 'content', r, 'entity.json')).then(() => true, () => false)
  const list = await readList(root, EMPTIED_FILE)
  const gone: string[] = []
  for (const r of Object.keys(list)) if (!(await here(r))) { gone.push(r); delete list[r] }
  const write = async (added: string[]) => {
    if (!added.length && !gone.length) return added
    for (const r of added) list[r] = at
    const sorted = Object.fromEntries(Object.keys(list).sort().map(k => [k, list[k]]))
    await writeFile(join(root, 'engine-state', EMPTIED_FILE), `${JSON.stringify(sorted, null, 2)}\n`)
    return added
  }
  if (git('rev-parse', '--verify', '-q', 'HEAD').status !== 0) return write([])
  const up = git('rev-parse', '--verify', '-q', '@{upstream}').status === 0 ? git('merge-base', 'HEAD', '@{upstream}') : undefined
  const base = up?.status === 0 && up.stdout.trim() ? up.stdout.trim() : 'HEAD'
  const diff = git('diff', '--name-only', '--no-renames', base, '--', 'content/species', 'content/breeds', 'content/gallery')
  if (diff.status !== 0) return write([])
  const exists = (p: string) => access(join(root, p)).then(() => true, () => git('cat-file', '-e', `${base}:${p}`).status === 0)
  const refs = new Set<string>()
  for (const f of diff.stdout.split('\n')) {
    const page = f.match(/^content\/(species|breeds)\/([a-z0-9-]+)\/entity\.json$/)
    if (page) { refs.add(`${page[1]}/${page[2]}`); continue }
    const id = f.match(/^content\/gallery\/([a-z0-9-]+)\.json$/)?.[1]
    if (!id) continue
    for (const kind of ['species', 'breeds']) if (await exists(`content/${kind}/${id}/entity.json`)) refs.add(`${kind}/${id}`)
  }
  if (!refs.size) return write([])
  const then: Read = async p => { const r = git('show', `${base}:${p}`); return r.status === 0 ? r.stdout : undefined }
  const now: Read = p => readFile(join(root, p), 'utf8').catch(() => undefined)
  const [before, after] = [await showingPhotos([...refs], then, commitOwners(root, base)), await showingPhotos([...refs], now, diskOwners(root))]
  const added: string[] = []
  // Showed a photo then, and is a page with none now: a page the loader drops (no section it may show) isn't one.
  for (const r of [...refs].sort()) if (before.get(r) === true && after.get(r) === false && !Object.hasOwn(list, r) && (await here(r))) added.push(r)
  return write(added)
}
