import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadAll, PHOTO_BOXES_FILE, PHOTO_SCREEN_FILE, vnDate } from '@aq/schema'

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
 * the chief of staff's 46 of 21 Nov).
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
 * What the site's loader reads (@aq/schema load.ts), by whether it decides a fish page and the photos it shows. `content`
 * and `records` (engine-state) are copied for it; `pages` per page (a page's own files and its gallery); `elsewhere` is
 * about other pages, or about how a photo shows, not whether. A test holds this to every file load.ts reads, so a new one
 * is placed here before it can make the engine's answer differ from the site's. The face record and the dead-fish
 * screen's list are read once the face rule is on main.
 */
export const LOADER_FILES = {
  content: ['sources.json', 'one-voice.json', 'image-approvals.json', 'picture-hashes.json'],
  records: [PHOTO_SCREEN_FILE, '_photo-faces.json', '_photo-dead-owed.json'],
  pages: ['gallery'],
  elsewhere: ['captions', 'cards', 'changelog.json', 'equipment', 'materials', 'page-dates.json', 'products', 'series', 'video-generated.json', 'video-titles', PHOTO_BOXES_FILE],
} as const

/**
 * Whether each of `refs` (`species/id`, `breeds/id`) shows a photo, by the site's own rule, read from where the site
 * reads it: the site's loader (@aq/schema loadAll, as a public build runs it) over those pages as `read` holds them, with
 * every other file it reads that decides a fish page and its photos (LOADER_FILES). A page shows a photo when the loader
 * leaves it one of its own, or when its album (a species' gallery; a breed's own photos after its first, then its
 * gallery: apps/site/src/lib/photo-page.ts albumOf) holds SITE_GALLERY_MIN pictures. A page the loader drops (no section
 * it may show) has no answer: it is no page, with or without photos. The loader runs on a copy of those files in the
 * system's temp folder, removed after.
 */
export async function showingPhotos(refs: string[], read: Read): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (!refs.length) return out
  const tmp = await mkdtemp(join(tmpdir(), 'aq-emptied-'))
  try {
    const put = async (path: string) => {
      const s = await read(path)
      if (s === undefined) return
      await mkdir(dirname(join(tmp, path)), { recursive: true })
      await writeFile(join(tmp, path), s)
    }
    for (const kind of ['species', 'plants', 'breeds', 'guides', 'gallery']) await mkdir(join(tmp, 'content', kind), { recursive: true })
    for (const f of LOADER_FILES.content) await put(`content/${f}`)
    for (const f of LOADER_FILES.records) await put(`engine-state/${f}`)
    for (const ref of refs) {
      const [kind, id] = ref.split('/') as [string, string]
      for (const f of [`content/${kind}/${id}/entity.json`, `content/${kind}/${id}/vi.json`, `content/gallery/${id}.json`]) await put(f)
    }
    const c = await loadAll({ root: join(tmp, 'content'), lang: 'vi', publicBuild: true })
    const album = (photos: unknown[]) => photos.length >= SITE_GALLERY_MIN
    for (const s of c.species) out.set(`species/${s.id}`, s.photos.length > 0 || album(c.galleries[s.id] ?? []))
    for (const b of c.breeds) out.set(`breeds/${b.id}`, b.photos.length > 0 || album([...b.photos.slice(1), ...(c.galleries[b.id] ?? [])]))
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
  const [before, after] = [await showingPhotos([...refs], then), await showingPhotos([...refs], now)]
  const added: string[] = []
  // Showed a photo then, and is a page with none now: a page the loader drops (no section it may show) isn't one.
  for (const r of [...refs].sort()) if (before.get(r) === true && after.get(r) === false && !Object.hasOwn(list, r) && (await here(r))) added.push(r)
  return write(added)
}
