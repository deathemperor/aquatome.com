import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Media } from './source-photos'

type Photo = { url: string; thumb?: string; width: number; height: number; licence: string; author: string; sourceUrl: string }
type Stored = Awaited<ReturnType<Media['put']>>
export type MirrorDeps = { bytes: (url: string) => Promise<Uint8Array>; media: Media; sleep: (ms: number) => Promise<void> }

const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/**
 * A hot-linked Commons or iNaturalist photo: its R2 key (one per Commons file or iNaturalist photo, whatever size or
 * query string the URL carries) and the URLs to fetch it from, best first. Undefined for photos we serve already.
 */
export function mirrorPlan(url: string): { key: string; fetch: string[] } | undefined {
  const u = new URL(url)
  if (u.host === 'upload.wikimedia.org' || u.host === 'thumb.wikimedia.org') {
    const m = u.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)
    return m ? { key: `commons/${sha16(decodeURIComponent(m[1]!))}.webp`, fetch: [url] } : undefined
  }
  if (u.host === 'inaturalist-open-data.s3.amazonaws.com' || u.host === 'static.inaturalist.org') {
    const m = u.pathname.match(/^\/photos\/(\d+)\/(square|small|medium|large|original)\.\w+$/)
    return m ? { key: `inaturalist/${m[1]}.webp`, fetch: [...new Set([url.replace(/\/(square|small|medium)\./, '/large.'), url])] } : undefined
  }
  return undefined
}

const isPhoto = (x: unknown): x is Photo => !!x && typeof x === 'object' && typeof (x as Photo).url === 'string' && typeof (x as Photo).licence === 'string' && typeof (x as Photo).sourceUrl === 'string'
function photosIn(x: unknown, out: Photo[] = []): Photo[] {
  if (isPhoto(x)) out.push(x)
  else if (Array.isArray(x)) for (const v of x) photosIn(v, out)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) photosIn(v, out)
  return out
}

/** Content files that hold photos: species, plant and breed pages, galleries, equipment guides. */
async function files(content: string) {
  const out: string[] = []
  for (const kind of ['species', 'plants', 'breeds']) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) out.push(join(content, kind, id, 'entity.json'))
  for (const kind of ['gallery', 'equipment']) for (const f of await readdir(join(content, kind)).catch(() => [] as string[])) if (f.endsWith('.json')) out.push(join(content, kind, f))
  return out
}

/** Caches keyed by photo URL: a mirrored photo keeps its verdicts (no second vision call), and the old URL stays known. */
const URL_KEYED = ['_photo-check.json', '_photo-faces.json', '_photo-rejected.json', '_photo-watermarks.json']

/**
 * Commons and iNaturalist photos are served from our media bucket instead of hot-linked: their hosts set third-party
 * cookies (Lighthouse Best Practices), send JPEGs with a short cache life, and each is one more connection before the
 * page's main picture. Each photo becomes a ≤1200 px WebP plus a 480 px thumb; credit, licence and the link to the
 * photo's own page are kept. `limit`: uploads this run. Idempotent: a photo already on our host is left alone.
 */
export async function mirrorPhotos(root: string, d: MirrorDeps, o: { limit?: number; dryRun?: boolean } = {}) {
  const report = { mirrored: 0, files: 0, pending: 0, failed: [] as string[] }
  const done = new Map<string, Stored>()
  const moved: [string, string][] = []
  for (const file of await files(join(root, 'content'))) {
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const data = JSON.parse(raw) as unknown
    let changed = false
    for (const p of photosIn(data)) {
      const plan = mirrorPlan(p.url)
      if (!plan) continue
      let stored = done.get(plan.key)
      if (!stored) {
        if (o.dryRun || (o.limit !== undefined && done.size >= o.limit)) { report.pending++; continue }
        try {
          let bytes: Uint8Array | undefined
          for (const u of plan.fetch) { bytes = await d.bytes(u).catch(() => undefined); if (bytes) break }
          if (!bytes) throw new Error('not downloadable')
          stored = await d.media.put(plan.key, bytes)
          done.set(plan.key, stored)
          await d.sleep(500) // Wikimedia asks bulk clients to go gently
        } catch (e) {
          report.failed.push(`${p.url}: ${(e as Error).message.slice(0, 120)}`)
          continue
        }
      }
      moved.push([p.url, stored.url])
      Object.assign(p, { url: stored.url, thumb: stored.thumb, width: stored.width, height: stored.height })
      changed = true
    }
    if (changed) {
      const indent = raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
      await writeFile(file, `${JSON.stringify(data, null, indent)}\n`)
      report.files++
    }
  }
  if (moved.length) for (const f of URL_KEYED) {
    const path = join(root, 'engine-state', f)
    const cache = JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as Record<string, unknown> | null
    if (!cache) continue
    let n = 0
    for (const [from, to] of moved) if (from in cache && !(to in cache)) { cache[to] = cache[from]; n++ }
    if (n) await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`)
  }
  report.mirrored = done.size
  return report
}
