import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { setSourceBlock } from '../state'
import { FB } from './config'
import { albumsIn, listEnd, photoFull, photosIn, photoUrl, storiesIn, wall, type FbAlbum, type FbPost } from './parse'

/** A page as the logged-in browser loaded it: final URL, markup, and the data it carried (embedded and fetched). */
export type FbPage = { url: string; html: string; data: unknown[] }
/** The browser the collector drives (`chromeFb` in ./chrome; a fake in tests). `scroll` returns the data that scrolling fetched, and the page after it. */
export type FbBrowser = { goto: (url: string) => Promise<FbPage>; scroll: () => Promise<{ data: unknown[]; html: string }>; bytes: (url: string, referer: string) => Promise<Uint8Array> }
export type FbCollectDeps = { putRaw: (key: string, bytes: Uint8Array, contentType: string) => Promise<string>; sleep: (ms: number) => Promise<void>; now: () => Date }

export type FbPhotoState = { status: 'new' | 'stored' | 'error'; attempts: number; caption?: string; raw?: string; width?: number; height?: number; error?: string }
export type FbState = {
  posts: Record<string, FbPost & { seenAt: string }>
  albums: Record<string, FbAlbum & { photoIds: string[]; listedAt: string; done: boolean }>
  photos: Record<string, FbPhotoState>
  /** The whole timeline has been scrolled once; after that a run stops at the first stretch of known posts. */
  timelineDone: boolean
}

export class FbBlocked extends Error {
  constructor(readonly kind: 'login' | 'checkpoint') { super(`facebook: ${kind}`) }
}

/** Scrolls in a row that bring no new item: then we're back among items we have. */
const KNOWN_STOP = 3
/** Scrolls in a row that bring nothing at all: Facebook is slow or holding back; stop this list for this run (it isn't marked done). */
const SILENT = 5
const MAX_ATTEMPTS = 3
const ALBUM_REFRESH_DAYS = 7

const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]!]))

export async function loadFbState(root: string): Promise<FbState> {
  const raw = await readFile(join(root, FB.stateFile), 'utf8').catch(() => null)
  return raw ? JSON.parse(raw) : { posts: {}, albums: {}, photos: {}, timelineDone: false }
}

export async function saveFbState(root: string, s: FbState): Promise<void> {
  await mkdir(dirname(join(root, FB.stateFile)), { recursive: true })
  await writeFile(join(root, FB.stateFile), `${JSON.stringify({ ...s, posts: sorted(s.posts), albums: sorted(s.albums), photos: sorted(s.photos) }, null, 2)}\n`)
}

/**
 * One collection run over Jim's profile: timeline posts, then albums, then the full-size photos of both (each photo once,
 * its original copied to the media bucket as-is). Incremental and polite (`FB.polite` between page loads and scrolls),
 * within the run's budgets (`maxScrolls` per list). A normal run reads the top of each list for what's new; a `backfill`
 * run (by hand, with big budgets) scrolls on past known items until Facebook says the list has no next page.
 * A login wall or checkpoint ends the run: what was collected is kept and the source is blocked.
 * Snapshots: sources/facebook-jim/posts/<id>.md and albums/<id>.md.
 */
export async function collect(root: string, b: FbBrowser, d: FbCollectDeps, o: { maxMinutes: number; maxPhotos: number; maxScrolls: number; backfill?: boolean }) {
  const s = await loadFbState(root)
  const report = { newPosts: 0, newAlbums: 0, stored: 0, failed: [] as string[], warnings: [] as string[], blocked: undefined as 'login' | 'checkpoint' | undefined }
  const start = d.now().getTime()
  const timeLeft = () => d.now().getTime() - start < o.maxMinutes * 60_000
  const nowIso = () => d.now().toISOString()
  /** A page that fails to load costs that item, not the run; a wall still ends the run. */
  const tryPage = async <T>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn() } catch (err) {
      if (err instanceof FbBlocked) throw err
      report.warnings.push(`${what}: ${(err as Error).message.slice(0, 200)}`)
      return undefined
    }
  }

  const open = async (url: string) => {
    const p = await b.goto(url)
    await d.sleep(FB.polite)
    const w = wall(p.url, p.html)
    if (w) throw new FbBlocked(w)
    return p
  }
  const queue = (ids: string[]) => { for (const id of ids) s.photos[id] ??= { status: 'new', attempts: 0 } }
  const addPosts = (data: unknown[]) => {
    let added = 0
    for (const p of storiesIn(data, FB.ownerId)) {
      if (s.posts[p.id]) continue
      s.posts[p.id] = { ...p, seenAt: nowIso() }
      queue(p.photoIds)
      added++
    }
    report.newPosts += added
    return added
  }
  /**
   * Scroll a list: until Facebook says it has no next page (true), or, unless backfilling an unfinished list, until
   * `KNOWN_STOP` scrolls bring nothing new; `SILENT` scrolls bringing nothing at all, or the budget, end it for this run.
   */
  const scrollList = async (what: string, done: boolean, kind: 'Story' | 'Photo' | null, take: (got: { data: unknown[]; html: string }) => { items: number; added: number }) => {
    let known = 0
    let empty = 0
    for (let n = 0; n < o.maxScrolls && timeLeft(); n++) {
      const got = await b.scroll()
      await d.sleep(FB.polite)
      const { items, added } = take(got)
      if (kind && listEnd(got.data, kind)) return true
      empty = items ? 0 : empty + 1
      known = added ? 0 : known + 1
      if (empty >= SILENT) { if (!done && o.backfill) report.warnings.push(`${what}: Facebook stopped sending more before the end (slow, or holding back); continues next backfill`); return false }
      if ((done || !o.backfill) && known >= KNOWN_STOP) return false
    }
    if (!done && o.backfill) report.warnings.push(`${what}: scroll budget used up before the end; continues next backfill`)
    return false
  }

  try {
    // Timeline
    const profile = await open(FB.profile)
    if (!storiesIn(profile.data, FB.ownerId).length) report.warnings.push('timeline: no posts on the profile page (has Facebook changed its page data?)')
    addPosts(profile.data)
    if (listEnd(profile.data, 'Story') || await scrollList('timeline', s.timelineDone, 'Story', ({ data }) => ({ items: storiesIn(data, FB.ownerId).length, added: addPosts(data) }))) s.timelineDone = true
    // Posts showing fewer photos than they hold: the post's own page, else the post's photo set, lists them all.
    for (const p of Object.values(s.posts).filter(p => p.more)) {
      if (!timeLeft()) break
      await tryPage(`post ${p.id}`, async () => {
        const full = storiesIn((await open(p.url)).data, FB.ownerId).find(x => x.id === p.id)
        let ids = [...new Set([...p.photoIds, ...full?.photoIds ?? []])]
        if (!full || full.more) ids = [...new Set([...ids, ...photosIn((await open(`https://www.facebook.com/media/set/?set=pcb.${p.id}`)).data).filter(x => !x.video).map(x => x.id)])]
        p.photoIds = ids
        queue(ids)
        p.more = false
      })
    }
    await saveFbState(root, s)

    // Albums (the tab scrolled for albums beyond the first screen)
    const tab = await open(`${FB.profile}photos_albums`)
    const listed = new Map(albumsIn(tab.html).map(a => [a.id, a]))
    await scrollList('albums tab', true, null, ({ html }) => {
      const found = albumsIn(html).filter(a => !listed.has(a.id))
      for (const a of found) listed.set(a.id, a)
      return { items: found.length, added: found.length }
    })
    for (const a of listed.values()) {
      if (!timeLeft()) break
      const prev = s.albums[a.id]
      if (prev?.done && (d.now().getTime() - Date.parse(prev.listedAt)) / 86_400_000 < ALBUM_REFRESH_DAYS) continue
      if (!prev) report.newAlbums++
      const album = (s.albums[a.id] = { ...a, photoIds: prev?.photoIds ?? [], listedAt: nowIso(), done: prev?.done ?? false })
      const take = ({ data }: { data: unknown[] }) => {
        const photos = photosIn(data).filter(p => !p.video)
        const fresh = photos.map(p => p.id).filter(id => !album.photoIds.includes(id))
        album.photoIds.push(...fresh)
        queue(fresh)
        return { items: photos.length, added: fresh.length }
      }
      await tryPage(`album ${a.title}`, async () => {
        const page = await open(a.url)
        take(page)
        if (listEnd(page.data, 'Photo') || await scrollList(`album ${a.title}`, album.done, 'Photo', take)) album.done = true
      })
      await saveFbState(root, s)
    }

    // Photos: the full-size image from each photo's page
    const todo = Object.entries(s.photos).filter(([, p]) => p.status === 'new' || (p.status === 'error' && p.attempts < MAX_ATTEMPTS)).slice(0, o.maxPhotos)
    for (const [i, [id, p]] of todo.entries()) {
      if (!timeLeft()) break
      try {
        const page = await open(photoUrl(id))
        const full = photoFull(page.data, id)
        if (!full) throw new Error('no image on the photo page')
        const bytes = await b.bytes(full.src, photoUrl(id))
        const { format } = await sharp(bytes).metadata()
        const ext = format === 'jpeg' ? 'jpg' : format
        if (!ext || !['jpg', 'png', 'webp', 'gif'].includes(ext)) throw new Error(`not an image (${format})`)
        const raw = await d.putRaw(`${FB.rawPrefix}/${id}.${ext}`, bytes, `image/${format}`)
        s.photos[id] = { status: 'stored', attempts: p.attempts + 1, raw, width: full.width, height: full.height, ...(full.caption ? { caption: full.caption } : {}) }
        report.stored++
      } catch (err) {
        if (err instanceof FbBlocked) throw err
        const msg = (err as Error).message.slice(0, 200)
        s.photos[id] = { ...p, status: 'error', attempts: p.attempts + 1, error: msg }
        report.failed.push(`${id}: ${msg}`)
      }
      if (i % 20 === 19) await saveFbState(root, s)
    }
  } catch (err) {
    if (!(err instanceof FbBlocked)) throw err
    report.blocked = err.kind
    await setSourceBlock(root, FB.id, nowIso())
  } finally {
    await saveFbState(root, s)
    await writeSnapshots(root, s)
  }
  return report
}

const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim()
const photoLine = (s: FbState, id: string) => s.photos[id]?.raw ?? photoUrl(id)

/** Raw snapshots for the later rewriting step: each post's text and photos, each album's photos and captions. */
async function writeSnapshots(root: string, s: FbState) {
  const dir = join(root, FB.snapshotDir)
  await mkdir(join(dir, 'posts'), { recursive: true })
  await mkdir(join(dir, 'albums'), { recursive: true })
  for (const p of Object.values(s.posts)) {
    const photos = p.photoIds.map(id => `  - ${photoLine(s, id)}`)
    await writeFile(join(dir, 'posts', `${p.id}.md`), `---\nurl: ${p.url}\n${p.time ? `time: ${p.time}\n` : ''}${p.reshare ? 'reshare: true\n' : ''}${photos.length ? `photos:\n${photos.join('\n')}\n` : ''}---\n\n${p.text}\n`)
  }
  for (const a of Object.values(s.albums)) {
    const lines = a.photoIds.map(id => `- ${photoLine(s, id)}${s.photos[id]?.caption ? ` — ${oneLine(s.photos[id]!.caption!)}` : ''}`)
    await writeFile(join(dir, 'albums', `${a.id}.md`), `---\nurl: ${a.url}\ntitle: ${oneLine(a.title)}\n---\n\n${lines.join('\n')}\n`)
  }
}
