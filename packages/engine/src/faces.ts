import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { writePhotoState } from './photo-state'
import { holdForSecondLook, lastPhotos, looks, pagesShowing, readPassedBefore, readSecondLook, waitingEntry } from './last-photo'

export type FaceDeps = { get: (url: string) => Promise<Uint8Array>; detect: (files: string[]) => Promise<number[]> }
type Photo = { url: string }

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
 * (last-photo.ts).
 */
export async function dropFacePhotos(contentRoot: string, cacheFile: string, d: FaceDeps, rejectedFile?: string, root = join(contentRoot, '..')): Promise<{ checked: number; removed: string[]; held: string[]; firstOff: string[]; failed: string[] }> {
  const cache: Record<string, number> = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const rejected: Record<string, string> = rejectedFile ? JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) : {}
  const pages: { file: string; e: { photos?: Photo[]; video?: { figures?: { photo?: Photo }[] } } }[] = []
  for (const kind of ['species', 'plants', 'guides']) {
    for (const id of await readdir(join(contentRoot, kind)).catch(() => [] as string[])) {
      const file = join(contentRoot, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (raw) pages.push({ file, e: JSON.parse(raw) })
    }
  }
  const todo = [...new Set(pages.flatMap(p => (p.e.photos ?? []).map(x => x.url)))].filter(u => !(u in cache) && !(u in rejected))
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
  const sl = looks(await readSecondLook(root))
  // A hold on another reason doesn't keep a photo that never passed from a face found now, its first verdict (photo-check.ts spared).
  const passed = await readPassedBefore(root)
  const face = (u: string) => cache[u]! > 0 && (sl.open(u) || (sl.waiting(u) && screened.has(u) && !passed.has(u)))
  const last = new Map([...lastPhotos(await pagesShowing(contentRoot), u => face(u) || u in rejected)].filter(([u]) => face(u) && !(u in rejected)))
  // Only one that passed the check before is held; a face found now, on one that never did, takes it off, marked on both
  // lists (last-photo.ts).
  const firstOff = new Map([...last].filter(([u]) => screened.has(u) && !passed.has(u)))
  for (const u of firstOff.keys()) last.delete(u)
  const why = 'people: a face (face detection)'
  await holdForSecondLook(root, new Map([...last].map(([u, pages]) => [u, { why, pages }])), 'face detection')
  await holdForSecondLook(root, new Map([...firstOff].map(([u, pages]) => [u, { why, pages, off: true as const }])), 'face detection')
  // A face found now, on a photo that never passed, takes it off every page and album, as the check's verdict of a person
  // does: off a page that keeps other photos, it goes on the never-again list as refused, so the sweep takes its album
  // copies and no step brings it back (the independent reader, 20 Nov).
  // Only where it is given the list to write, as the engine's own call always is.
  const refusedNow = rejectedFile ? [...screened].filter(u => face(u) && !passed.has(u) && !firstOff.has(u) && !last.has(u)) : []
  if (firstOff.size || refusedNow.length) {
    const file = rejectedFile ?? join(root, 'engine-state', '_photo-rejected.json')
    const now = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string>
    for (const u of firstOff.keys()) now[u] ??= waitingEntry(why)
    for (const u of refusedNow) now[u] ??= why
    await writePhotoState(file, now)
  }
  const held = [...last].map(([u, ps]) => `${u}: ${ps.join(', ')}`)
  const offFirst = [...firstOff].map(([u, ps]) => `${u}: ${ps.join(', ')}`)
  const removed: string[] = []
  for (const { file, e } of pages) {
    const keep = (e.photos ?? []).filter(p => !(face(p.url) && !last.has(p.url)) && !(p.url in rejected))
    // A video section's photo the owner rejected (the images pass screened it for faces when it picked it).
    const figures = (e.video?.figures ?? []).filter(f => f.photo && f.photo.url in rejected)
    if (keep.length === (e.photos ?? []).length && !figures.length) continue
    const at = file.slice(contentRoot.length + 1)
    removed.push(...(e.photos ?? []).filter(p => !keep.includes(p)).map(p => `${at}: ${p.url}`), ...figures.map(f => `${at}: ${f.photo!.url}`))
    if (e.photos) e.photos = keep
    for (const f of figures) delete f.photo
    await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
  }
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  return { checked: todo.length - failed.length, removed, held, firstOff: offFirst, failed }
}
