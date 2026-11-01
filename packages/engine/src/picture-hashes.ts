import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pictureOf } from '@aq/schema'
import { dhash } from './gallery'

export type PictureHashDeps = { get: (url: string) => Promise<Uint8Array> }
type Pic = { url: string; thumb?: string }

/** Every picture in content: any object with an address and a size (page photos, galleries, guide and video pictures). */
async function contentPictures(dir: string, out = new Map<string, Pic>()): Promise<Map<string, Pic>> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name)
    if (e.isDirectory()) await contentPictures(path, out)
    else if (e.name.endsWith('.json') && e.name !== 'picture-hashes.json') {
      const walk = (o: unknown): void => {
        if (Array.isArray(o)) return o.forEach(walk)
        if (!o || typeof o !== 'object') return
        const x = o as Record<string, unknown>
        if (typeof x.url === 'string' && typeof x.width === 'number' && typeof x.height === 'number' && /^https?:/.test(x.url)) out.set(x.url, { url: x.url, ...(typeof x.thumb === 'string' ? { thumb: x.thumb } : {}) })
        Object.values(x).forEach(walk)
      }
      try { walk(JSON.parse(await readFile(path, 'utf8'))) } catch { /* not ours to judge here */ }
    }
  }
  return out
}

/**
 * The image hash of every picture in content (content/picture-hashes.json, address → hash), so a page never shows one
 * picture twice even when it is two files (pictures.ts in @aq/schema). Each picture is downloaded once (its card thumb
 * when it has one): hashes the galleries already made are reused, a picture that fails to download is tried again next
 * run, and pictures no longer in content leave the file. YouTube thumbnails need none: they are known by their video.
 */
export async function hashPictures(root: string, d: PictureHashDeps, o: { limit?: number; jobs?: number } = {}) {
  const file = join(root, 'content', 'picture-hashes.json')
  const old = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string>
  const pics = await contentPictures(join(root, 'content'))
  const fromGalleries: Record<string, string> = {}
  for (const f of await readdir(join(root, 'engine-state', 'gallery')).catch(() => [] as string[])) {
    const st = JSON.parse(await readFile(join(root, 'engine-state', 'gallery', f), 'utf8').catch(() => '{}')) as { hashes?: Record<string, string> }
    for (const [u, h] of Object.entries(st.hashes ?? {})) if (/^[0-9a-f]{16}$/.test(h)) fromGalleries[u] = h
  }
  const hashes: Record<string, string> = {}
  const todo: Pic[] = []
  for (const p of pics.values()) {
    if (pictureOf(p.url, {}).key.startsWith('yt:')) continue
    const h = old[p.url] ?? fromGalleries[p.url]
    if (h) hashes[p.url] = h
    else todo.push(p)
  }
  const failed: string[] = []
  const work = todo.slice(0, o.limit ?? todo.length)
  const save = () => writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2)}\n`)
  let next = 0, done = 0
  await Promise.all(Array.from({ length: o.jobs ?? 8 }, async () => {
    while (next < work.length) {
      const p = work[next++]!
      try { hashes[p.url] = await dhash(await d.get(p.thumb ?? p.url)) } catch (e) { failed.push(`${p.url}: ${(e as Error).message.slice(0, 100)}`) }
      if (++done % 500 === 0) await save() // a long first run keeps what it has
    }
  }))
  await save()
  return { pictures: pics.size, hashed: work.length - failed.length, left: todo.length - work.length, failed, dropped: Object.keys(old).filter(u => !pics.has(u)).length }
}
