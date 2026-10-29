import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

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
 * URL → reason; hands, product packshots, English-text banners). Runs each cycle, so a re-picked photo never publishes.
 */
export async function dropFacePhotos(contentRoot: string, cacheFile: string, d: FaceDeps, rejectedFile?: string): Promise<{ checked: number; removed: string[]; failed: string[] }> {
  const cache: Record<string, number> = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const rejected: Record<string, string> = rejectedFile ? JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) : {}
  const pages: { file: string; e: { photos?: Photo[] } }[] = []
  for (const kind of ['species', 'plants', 'guides']) {
    for (const id of await readdir(join(contentRoot, kind)).catch(() => [] as string[])) {
      const file = join(contentRoot, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (raw) pages.push({ file, e: JSON.parse(raw) })
    }
  }
  const todo = [...new Set(pages.flatMap(p => (p.e.photos ?? []).map(x => x.url)))].filter(u => !(u in cache) && !(u in rejected))
  const failed: string[] = []
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
    files.forEach((f, i) => { if (counts[i]! >= 0) cache[f.url] = counts[i]! })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  const removed: string[] = []
  for (const { file, e } of pages) {
    const keep = (e.photos ?? []).filter(p => !(cache[p.url]! > 0) && !(p.url in rejected))
    if (keep.length === (e.photos ?? []).length) continue
    removed.push(...e.photos!.filter(p => !keep.includes(p)).map(p => `${file.slice(contentRoot.length + 1)}: ${p.url}`))
    e.photos = keep
    await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
  }
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  return { checked: todo.length - failed.length, removed, failed }
}
