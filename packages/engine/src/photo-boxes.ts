import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
/** Where the animal is, as fractions of the image from its top-left corner (the loader's `subject`, in the photo's pixels). */
export type SubjectBox = { x: number; y: number; w: number; h: number }
/** What Vision found in one image: the animal's box, none (null), or the image couldn't be read. */
export type Found = SubjectBox | null | 'unreadable'
export type BoxDeps = { get: (url: string) => Promise<Uint8Array>; find: (files: string[]) => Promise<Found[]> }

const fraction = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1
/**
 * One batch's answers from vision/subject.swift, one line per image in order. Anything else (a line too few or too many,
 * a value that is no box, null or "unreadable") throws, so nothing is recorded against the wrong photo.
 */
export function parseSubjects(stdout: string, n: number): Found[] {
  const lines = stdout.trim().split('\n')
  if (lines.length !== n) throw new Error(`subject: ${lines.length} lines for ${n} images`)
  return lines.map((l, i) => {
    const x = JSON.parse(l) as unknown
    if (x === null || x === 'unreadable') return x
    const b = x as SubjectBox
    if (b && typeof b === 'object' && [b.x, b.y, b.w, b.h].every(fraction) && b.w > 0 && b.h > 0) return { x: b.x, y: b.y, w: b.w, h: b.h }
    throw new Error(`subject: line ${i + 1} is no box: ${l.slice(0, 80)}`)
  })
}

/** Where the animal is in each image, via macOS Vision's subject lifting (vision/subject.swift); the engine runs on the Mac. */
export async function visionSubjects(files: string[]): Promise<Found[]> {
  const script = fileURLToPath(new URL('../vision/subject.swift', import.meta.url))
  const out: Found[] = []
  for (let i = 0; i < files.length; i += 200) {
    const batch = files.slice(i, i + 200)
    const { stdout } = await promisify(execFile)('swift', [script, ...batch], { maxBuffer: 1 << 22 })
    out.push(...parseSubjects(stdout, batch.length))
  }
  return out
}

/**
 * Where the fish is in every fish and breed photo (the chief of staff, 2026-11-12: so a tile, a banner or a card keeps
 * the whole fish, or shows the photo whole). Each photo is boxed once, by address, into `recordFile`
 * (engine-state/_photo-boxes.json; the content loader adds it to each photo as `subject`): its box, or null where Vision
 * finds no animal, which draws as today. Heads first, then a page's other photos, then its album's; `limit` photos a run.
 * One that can't be fetched or read isn't recorded, and is tried again next run. No model call.
 */
export async function boxPhotos(root: string, recordFile: string, d: BoxDeps, o: { limit: number }): Promise<{ boxed: number; none: number; left: number; failed: string[] }> {
  const record: Record<string, SubjectBox | null> = JSON.parse(await readFile(recordFile, 'utf8').catch(() => '{}'))
  const heads: string[] = [], others: string[] = [], albums: string[] = []
  for (const kind of ['species', 'breeds']) {
    for (const id of (await readdir(join(root, kind)).catch(() => [] as string[])).sort()) {
      const raw = await readFile(join(root, kind, id, 'entity.json'), 'utf8').catch(() => null)
      if (!raw) continue
      const photos = (JSON.parse(raw) as { photos?: { url: string }[] }).photos ?? []
      if (photos[0]) heads.push(photos[0].url)
      others.push(...photos.slice(1).map(p => p.url))
      const g = JSON.parse(await readFile(join(root, 'gallery', `${id}.json`), 'utf8').catch(() => '{}')) as { photos?: { url: string; unchecked?: unknown }[] }
      // A photo waiting for the photo check is on no page yet: boxed once it shows.
      albums.push(...(g.photos ?? []).filter(p => !p.unchecked).map(p => p.url))
    }
  }
  const todo = [...new Set([...heads, ...others, ...albums])].filter(u => !(u in record))
  const now = todo.slice(0, Math.max(0, o.limit))
  const failed: string[] = []
  let boxed = 0, none = 0
  const dir = await mkdtemp(join(tmpdir(), 'photo-boxes-'))
  try {
    const files: { url: string; file: string }[] = []
    for (const [i, url] of now.entries()) {
      try {
        const file = join(dir, String(i))
        await writeFile(file, await d.get(url))
        files.push({ url, file })
      } catch (err) {
        failed.push(`${url}: ${(err as Error).message.slice(0, 120)}`)
      }
    }
    const found = files.length ? await d.find(files.map(f => f.file)) : []
    files.forEach((f, i) => {
      const x = found[i]
      if (x === 'unreadable' || x === undefined) return void failed.push(`${f.url}: unreadable`)
      record[f.url] = x
      if (x) boxed++
      else none++
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  await writeFile(recordFile, `${JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`)
  return { boxed, none, left: todo.length - now.length, failed }
}
