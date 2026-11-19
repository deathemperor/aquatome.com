import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import { LlmError } from './claude'
import { waiting, type GalleryPhoto } from './gallery'
import { screenedShop } from './own-mark'
import { compactRejection, compactScreen, photoFailure, photoModelStop } from './photo-observations'
import { writeImageCache } from './image-cache-write'
import { writePhotoState } from './photo-state'
import { piece } from './pieces'
import { judgeSheet, type ShopPhoto, type WatermarkDeps, type WatermarkEntry } from './watermarks'

/**
 * The return of a screened shop's photos (own-mark.ts SCREENED_OWN_MARK: Aquarium Glaser's) that the never-again list
 * holds for a mark, page by page, on the chief of staff's word (16 and 19 Nov). Nothing else takes a photo off that list.
 *
 * For each page asked for, the photos the list holds for a mark ("watermark: ...") that its own photos or its album
 * showed before, as the repository's history last had them (`history`). The watermark screen is asked whose their marks
 * are, as it asks of a new photo (watermarks.ts judgeSheet). Only a photo whose every mark is the shop's own passes: it
 * gets its kept record, comes off the list one photo at a time with its reason in this step's own record
 * (engine-state/_shop-photo-returns.json), and goes back in each of its pages' albums, waiting for the photo check
 * (`unchecked`). The sweep then orders it after every other real photo and holds the page to its cap (own-mark.ts).
 * A photo the screen refuses (a mark someone else's, or none it can place, or no mark at all) stays on the list, and the
 * record says so, so it isn't asked again. One the screen gives no answer for stays listed and is asked next run. A photo
 * listed for anything but a mark (a person, a dead fish, another fish) never comes back here.
 *
 * The writes for a photo that passes go in an order a stopped run can pick up from: its kept record, then its line here
 * with the photo it puts back (`photo`), then off the list, then into its albums, then the line loses `photo`. A line that
 * still has `photo` is finished first, at the start of the next run. A photo listed again for another reason since it
 * was asked (another step's entry in place of the mark's), or with no page left to take it, stays listed and comes back
 * nowhere, and its line says so. Each file is written whole or not at all. The list is read and written by one step at a
 * time only while no other engine step runs in the same checkout: the command refuses to start beside a cycle.
 */
export const RETURNS_FILE = '_shop-photo-returns.json'
export type ReturnEntry = { at: string; pages: string[]; answer: 'returned' | 'refused'; was: string; why: string; photo?: Photo }
export type ReturnCandidate = { page: string; photo: Photo }
export type ReturnDeps = Pick<WatermarkDeps, 'get' | 'look'>
/** The repository's history of a page's files: the commits that touched them, newest first, and a file at a commit. */
export type History = { commits: (paths: string[]) => string[]; show: (commit: string, path: string) => string | undefined }

const readJson = async <T>(file: string, empty: T): Promise<T> => readFile(file, 'utf8').then(s => JSON.parse(s) as T, () => empty)
const PAGE = /^(species|plants|breeds)\/[a-z0-9-]+$/

/** Git in `root`. */
export const gitHistory = (root: string): History => ({
  commits: paths => execFileSync('git', ['log', '--format=%H', '--', ...paths], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean),
  show: (commit, path) => { try { return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return undefined } },
})

/**
 * The listed photos each page (`kind/id`) showed before, its own or in its album, each as the newest commit that had it
 * recorded it; a screened shop's photos from its own pages only.
 */
export function historyCandidates(pages: string[], rejected: Record<string, string>, h: History): ReturnCandidate[] {
  const out: ReturnCandidate[] = []
  for (const page of pages) {
    if (!PAGE.test(page)) continue
    const id = page.split('/')[1]!
    const files = [`content/${page}/entity.json`, `content/gallery/${id}.json`]
    // Each photo's newest record, whatever it says: one that later named another source isn't taken from an older one.
    const newest = new Map<string, Photo>()
    for (const c of h.commits(files)) for (const f of files) {
      const raw = h.show(c, f)
      if (!raw) continue
      let photos: Photo[] = []
      try { photos = (JSON.parse(raw) as { photos?: Photo[] }).photos ?? [] } catch { continue }
      for (const p of photos) if (!newest.has(p.url)) newest.set(p.url, p)
    }
    for (const photo of newest.values()) if (rejected[photo.url]?.startsWith('watermark:') && screenedShop(photo.url, photo.sourceUrl)) out.push({ page, photo })
  }
  return out
}

/** `limit`: model calls this run. Stops on a model failure (usage limit); the rest wait for the next run. */
export async function returnShopPhotos(root: string, candidates: ReturnCandidate[], d: ReturnDeps, o: { today: string; limit: number }) {
  const state = join(root, 'engine-state'), content = join(root, 'content')
  const cacheFile = join(state, '_photo-watermarks.json'), rejectedFile = join(state, '_photo-rejected.json'), returnsFile = join(state, RETURNS_FILE)
  const old = await readJson<Record<string, unknown>>(cacheFile, {})
  const cache: Record<string, WatermarkEntry> = Object.fromEntries(Object.entries(old).map(([u, v]) => [u, compactScreen(v)]))
  const rejected = await readJson<Record<string, string>>(rejectedFile, {})
  const returns = await readJson<Record<string, ReturnEntry>>(returnsFile, {})
  const sources = await readJson<Record<string, { name?: string; homepage?: string }>>(join(content, 'sources.json'), {})
  const report = { returned: [] as string[], refused: [] as string[], unanswered: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '', resumed: [] as string[], relisted: [] as string[] }
  // Every file this step writes is written whole or not at all (a temporary file, then a rename), so a stop mid-write
  // leaves the last whole copy for the next run to pick up from.
  const saveReturns = () => writeImageCache(returnsFile, `${JSON.stringify(Object.fromEntries(Object.entries(returns).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))), null, 2)}\n`)
  const album = async (page: string, change: (photos: GalleryPhoto[]) => GalleryPhoto[]) => {
    const id = page.split('/')[1]!, file = join(content, 'gallery', `${id}.json`)
    const raw = await readFile(file, 'utf8').catch(() => null)
    const g = raw ? JSON.parse(raw) as { photos?: GalleryPhoto[] } : { id, photos: [], seen: 0, updatedAt: o.today }
    const next = change(g.photos ?? [])
    if (raw && next.length === (g.photos ?? []).length && next.every((p, i) => p === g.photos![i])) return
    g.photos = next
    await writeImageCache(file, `${JSON.stringify(g, null, raw?.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }

  // Each photo once, with every page it goes back to. A page that shows it already, or a copy cleaned of its mark
  // (`original`), takes it no more.
  const shows = async (page: string, url: string) => {
    const id = page.split('/')[1]!
    const own = (await readJson<{ photos?: Photo[] }>(join(content, page, 'entity.json'), {})).photos
    if (!own) return undefined
    const album = (await readJson<{ photos?: Photo[] }>(join(content, 'gallery', `${id}.json`), {})).photos ?? []
    return [...own, ...album].some(p => p.url === url || p.original?.url === url)
  }
  // Off the list, one photo at a time, only while the list still holds it for the mark it was asked about; then back in
  // each of its pages' albums that doesn't show it, waiting for the photo check.
  const finish = async (url: string) => {
    const e = returns[url]!, now = await readJson<Record<string, string>>(rejectedFile, {})
    const { photo: _p, ...line } = e
    const pages: string[] = []
    for (const page of e.pages) if ((await shows(page, url)) !== undefined) pages.push(page)
    const relisted = url in now && compactRejection(now[url]!) !== e.was
    if (relisted || !pages.length) {
      // Listed again meanwhile, or no page left to take it: it stays listed, and any copy an earlier stopped run put
      // back, still waiting, comes out of its albums.
      for (const page of e.pages) await album(page, ps => ps.filter(p => !(p.url === url && p.unchecked)))
      // Taken off by a run that stopped, with no page left now: back on the list as it was.
      if (!(url in now)) { now[url] = e.was; await writePhotoState(rejectedFile, now) }
      returns[url] = { ...line, answer: 'refused', why: relisted ? 'listed again for another reason before it came off' : 'no page left to take it' }
      report.relisted.push(url)
      return
    }
    if (url in now) { delete now[url]; await writePhotoState(rejectedFile, now) }
    const { unchecked: _u, ...clean } = e.photo as GalleryPhoto
    for (const page of pages) if ((await shows(page, url)) === false) await album(page, ps => [...ps, waiting(clean)])
    returns[url] = { ...line, pages }
  }
  // A run that stopped between its writes: its passed photos are finished first.
  const pending = Object.keys(returns).filter(u => returns[u]!.photo)
  for (const url of pending) { await finish(url); if (returns[url]!.answer === 'returned') report.resumed.push(url) }
  if (pending.length) await saveReturns()

  const todo = new Map<string, { photo: Photo; pages: string[]; shop: ShopPhoto }>()
  for (const c of candidates) {
    const url = c.photo.url, source = screenedShop(url, c.photo.sourceUrl), held = source && sources[source]
    const why = !rejected[url]?.startsWith('watermark:') ? 'not listed for a mark'
      : url in returns ? `answered ${returns[url]!.at}`
      : !source || !held?.name || !held.homepage ? "not a screened shop's photo from its own pages"
      : !cache[url] ? 'no screen record to ask with'
      : undefined
    const there = why ? undefined : await shows(c.page, url)
    if (why || there !== false) { report.skipped.push(`${c.page}: ${url} (${why ?? (there === undefined ? 'no such page' : 'on the page already')})`); continue }
    const x = todo.get(url) ?? { photo: c.photo, pages: [], shop: { source: source!, sourceUrl: c.photo.sourceUrl!, name: held!.name!, homepage: held!.homepage! } }
    if (!x.pages.includes(c.page)) x.pages.push(c.page)
    todo.set(url, x)
  }

  const dir = await mkdtemp(join(tmpdir(), 'shop-return-'))
  try {
    const all = [...todo.entries()]
    for (let i = 0, sheet = 0; i < all.length && sheet < o.limit && !report.stopped; i += 6, sheet++) {
      const ok: { url: string; b: Buffer }[] = []
      for (const [url] of all.slice(i, i + 6)) {
        try { ok.push({ url, b: Buffer.from(await d.get(url)) }) } catch (err) { report.failed.push(`${url}: ${photoFailure(err)}`) }
      }
      if (!ok.length) continue
      let v: Awaited<ReturnType<typeof judgeSheet>>
      try {
        v = await piece(`return-${sheet}`, () => judgeSheet(ok.map(x => ({ b: x.b, ocr: cache[x.url]!.ocr, shop: todo.get(x.url)!.shop })), join(dir, `sheet-${sheet}.jpg`), d.look))
      } catch (err) {
        if (err instanceof LlmError) report.stopped = photoModelStop(err)
        else report.failed.push(`sheet ${sheet}: ${photoFailure(err)}`)
        continue
      }
      const passed: string[] = []
      ok.forEach(({ url }, j) => {
        const r = v[j], x = todo.get(url)!
        if (!r) { report.unanswered.push(url); return }
        // The list's reason as the list keeps it, never a reason's own words.
        const was = compactRejection(rejected[url]!)
        if (r.retainedOwnMark) {
          cache[url] = { ...cache[url]!, ...r, retainedOwnMark: { ...r.retainedOwnMark, by: 'return' } }
          returns[url] = { at: o.today, pages: x.pages, answer: 'returned', was, why: "every mark the shop's own (the watermark screen)", photo: x.photo }
          passed.push(url)
        } else {
          returns[url] = { at: o.today, pages: x.pages, answer: 'refused', was, why: r.watermark ? "a mark not the shop's own, or one the screen can't place" : 'no mark the screen can see now' }
          report.refused.push(`${x.pages.join(', ')}: ${url}`)
        }
      })
      // This sheet's answers are kept before any photo comes off the list (the order above).
      if (passed.length) await writePhotoState(cacheFile, Object.fromEntries(Object.entries(cache).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))))
      await saveReturns()
      for (const url of passed) {
        await finish(url)
        if (returns[url]!.answer === 'returned') report.returned.push(`${returns[url]!.pages.join(', ')}: ${url}`)
      }
      if (passed.length) await saveReturns()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return report
}
