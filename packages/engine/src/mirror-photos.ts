import { writePhotoState } from './photo-state'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IMAGE_SWITCHES, isInatNonCommercial, isNonCommercial, mirrorPlan, type ImageSwitches } from '@aq/schema'
import type { Media } from './source-photos'
import { looks, readSecondLook } from './last-photo'

type Photo = { url: string; thumb?: string; width: number; height: number; licence: string; author: string; sourceUrl: string }
type Stored = Awaited<ReturnType<Media['put']>>
export type MirrorDeps = { bytes: (url: string) => Promise<Uint8Array>; media: Media; sleep: (ms: number) => Promise<void> }

export { mirrorPlan } from '@aq/schema'

const isPhoto = (x: unknown): x is Photo => !!x && typeof x === 'object' && typeof (x as Photo).url === 'string' && typeof (x as Photo).licence === 'string' && typeof (x as Photo).sourceUrl === 'string'
function photosIn(x: unknown, out: Photo[] = []): Photo[] {
  if (isPhoto(x)) out.push(x)
  else if (Array.isArray(x)) for (const v of x) photosIn(v, out)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) photosIn(v, out)
  return out
}

/** Content files that hold photos: species, plant and breed pages, guides, galleries, equipment guides. */
async function files(content: string) {
  const out: string[] = []
  for (const kind of ['species', 'plants', 'breeds', 'guides']) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) out.push(join(content, kind, id, 'entity.json'))
  for (const kind of ['gallery', 'equipment']) for (const f of await readdir(join(content, kind)).catch(() => [] as string[])) if (f.endsWith('.json')) out.push(join(content, kind, f))
  return out
}

/**
 * Caches keyed by photo URL: a mirrored photo keeps its verdicts (no second vision call), and the old URL stays known.
 * The dead-fish screen's list of photos it owes a look too, so one still owed keeps waiting at its new address.
 */
const URL_KEYED = ['_album-ask.json', '_dead-screen.json', '_photo-check.json', '_photo-dead-owed.json', '_photo-faces.json', '_photo-guides.json', '_photo-rejected.json', '_photo-subjects.json', '_photo-watermarks.json']

/**
 * Commons, iNaturalist, Flickr and GBIF photos are served from our media bucket instead of hot-linked: their hosts set third-party
 * cookies (Lighthouse Best Practices), send JPEGs with a short cache life, and each is one more connection before the
 * page's main picture. Each photo becomes a ≤1200 px WebP plus a 480 px thumb; credit, licence and the link to the
 * photo's own page are kept. `limit`: uploads this run. Idempotent: a photo already on our host is left alone. A
 * non-commercial photo is copied only where the site shows it: an iNaturalist photo under CC BY-NC or CC BY-NC-SA in an
 * album or on a fish's page, which keeps one only as its head (gallery.ts dropNonCommercial), its switch on (`switches`,
 * IMAGE_SWITCHES.inatNonCommercial).
 */
export async function mirrorPhotos(root: string, d: MirrorDeps, o: { limit?: number; dryRun?: boolean; switches?: Readonly<ImageSwitches> } = {}) {
  const nc = (o.switches ?? IMAGE_SWITCHES).inatNonCommercial
  const albums = join(root, 'content', 'gallery')
  const shows = (file: string) => file.startsWith(albums) || ['species', 'plants', 'breeds'].some(k => file.startsWith(join(root, 'content', k)) && file.endsWith('entity.json'))
  const report = { mirrored: 0, files: 0, pending: 0, failed: [] as string[] }
  const done = new Map<string, Stored>()
  const moved: [string, string][] = []
  const edits = new Map<string, string>()
  // A photo off at its first verdict is coming off every page: it isn't copied, so its waiting entry and its record keep
  // one address (last-photo.ts; the independent reader, 20 Nov).
  const marked = looks(await readSecondLook(root)).pendingOff
  for (const file of await files(join(root, 'content'))) {
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const data = JSON.parse(raw) as unknown
    let changed = false
    for (const p of photosIn(data)) {
      const plan = mirrorPlan(p.url)
      if (!plan || marked(p.url)) continue
      if (isNonCommercial(p.licence) && !(nc && shows(file) && isInatNonCommercial(p))) continue
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
      edits.set(file, `${JSON.stringify(data, null, indent)}\n`)
    }
  }
  if (moved.length) for (const f of URL_KEYED) {
    const path = join(root, 'engine-state', f)
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 'null'
      throw error
    })
    const cache = JSON.parse(raw) as Record<string, unknown> | null
    if (!cache) continue
    let n = 0
    for (const [from, to] of moved) if (from in cache && !(to in cache)) {
      const value = cache[from]
      if (f === '_photo-rejected.json' && typeof value === 'string' && value.startsWith('waiting:')) continue
      cache[to] = value
      n++
    }
    if (n) await writePhotoState(path, cache)
  }
  // Keep a source reference available for retry until its transferred records are durable.
  for (const [file, raw] of edits) await writeFile(file, raw)
  report.files = edits.size
  report.mirrored = done.size
  return report
}
