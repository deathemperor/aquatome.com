import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import { across, cardWorthy, LARGE_PX, readCalendar, readVerdicts } from './curation'

type Large = NonNullable<Photo['large']>
export type LargeDeps = {
  bytes: (url: string) => Promise<Uint8Array>
  /** A Commons file's address at 2,400 px across (its original when smaller), or none. */
  commons: (file: string) => Promise<string | undefined>
  /** Its pixels, the way up it shows. */
  size: (bytes: Uint8Array) => Promise<{ width: number; height: number }>
  /** Stored at `key`, `width` across (media.ts putLarge). */
  put: (key: string, bytes: Uint8Array, width: number) => Promise<Large>
  sleep: (ms: number) => Promise<void>
}

const MEDIA = 'https://media.aquatome.com/'
const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
/** The large copy's short side: a square crop of it clears curation.ts LARGE_PX (1,140) whatever the photo's shape. */
export const LARGE_SHORT = 1200
/** And its long side, for a panorama. */
export const LARGE_LONG = 2400
/** The size a photo's large copy is stored at, from its full size: never bigger than it came. */
export const largeSize = (full: { width: number; height: number }) => {
  const k = Math.min(1, LARGE_SHORT / Math.min(full.width, full.height), LARGE_LONG / Math.max(full.width, full.height))
  return { width: Math.round(full.width * k), height: Math.round(full.height * k) }
}

/**
 * Where a photo's full size comes from, and the key its large copy is stored under (beside the page's, never one used
 * before), or none: a Commons file named by its page (the stored copy's key is that name's hash, mirror-photos.ts), an
 * iNaturalist photo's original, an Unsplash photo at its large size (which the app loads from Unsplash, as its terms ask).
 * Flickr and GBIF copies keep no address of their full size.
 */
export function largePlan(p: Photo): { key?: string; from: (d: LargeDeps) => Promise<string[]> } | undefined {
  const file = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:(.+)$/.exec(p.sourceUrl)?.[1]
  const name = file && decodeURIComponent(file)
  if (name && p.url === `${MEDIA}commons/${sha16(name)}.webp`) {
    return { key: `commons/${sha16(name)}-large.webp`, from: async d => { const u = await d.commons(name); return u ? [u] : [] } }
  }
  const inat = new RegExp(`^${MEDIA}inaturalist/(\\d+)\\.webp$`).exec(p.url)?.[1]
  if (inat) return { key: `inaturalist/${inat}-large.webp`, from: async () => ['jpg', 'jpeg', 'png'].map(x => `https://inaturalist-open-data.s3.amazonaws.com/photos/${inat}/original.${x}`) }
  if (p.url.startsWith('https://images.unsplash.com/')) {
    const u = new URL(p.url)
    u.searchParams.set('w', String(LARGE_LONG))
    return { from: async () => [u.href] }
  }
  return undefined
}

const isPhoto = (x: unknown): x is Photo => !!x && typeof x === 'object' && typeof (x as Photo).url === 'string' && typeof (x as Photo).sourceUrl === 'string' && typeof (x as Photo).width === 'number'
function photosIn(x: unknown, out: Photo[] = []): Photo[] {
  if (isPhoto(x)) out.push(x)
  else if (Array.isArray(x)) for (const v of x) photosIn(v, out)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) photosIn(v, out)
  return out
}

/**
 * The fish and breeds whose head photo is under the card's size, passes its checks and may have a larger original at its
 * source: what the cycle gives a large copy (`--heads`). The same picture larger, so what leads doesn't change.
 */
export async function headsUnderBar(root: string) {
  const v = await readVerdicts(root)
  const { avoid } = await readCalendar(root)
  const out: string[] = []
  for (const kind of ['species', 'breeds']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const raw = await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8').catch(() => null)
      const head = raw ? (JSON.parse(raw) as { photos?: Photo[] }).photos?.[0] : undefined
      if (head && !head.large && across(head, 'square') < LARGE_PX && largePlan(head) && cardWorthy(head.url, id, v, avoid)) out.push(id)
    }
  }
  return out
}

/**
 * Large copies (largeSize: 1,200 on the short side) of the photos that may lead an app card (curation.ts cardWorthy) on
 * the fish and breed pages `ids`, in that order, their own photos and their galleries': the app's large cards need 1,140
 * across, and the page's copy stops at 1,200 wide, which a square crop of a landscape photo can't reach. The site's pages keep
 * showing `url`: their heroes load it with no srcset, and the live Lighthouse check budgets their largest paint. A full
 * size no bigger than the page's copy gets none, and is remembered (`engine-state/_large-none.json`), so each cycle doesn't
 * fetch it again. `limit`: photos fetched this run. `headsOnly`: the page's first photo alone, never its other photos or
 * its gallery, since one of those growing large enough could change which photo leads. Idempotent.
 */
export async function largePhotos(root: string, ids: string[], d: LargeDeps, o: { limit?: number; headsOnly?: boolean } = {}) {
  const report = { added: 0, smaller: 0, skipped: 0, failed: [] as string[] }
  const v = await readVerdicts(root)
  const { avoid } = await readCalendar(root)
  const noneFile = join(root, 'engine-state', '_large-none.json')
  const none = JSON.parse(await readFile(noneFile, 'utf8').catch(() => '{}')) as Record<string, true>
  const noneAtStart = Object.keys(none).length
  let fetched = 0
  // A photo on its page and in its gallery is fetched once.
  const done = new Map<string, Large>()
  const full = () => o.limit !== undefined && fetched >= o.limit
  const saveNone = async () => { if (Object.keys(none).length > noneAtStart) await writeFile(noneFile, `${JSON.stringify(Object.fromEntries(Object.entries(none).sort()), null, 2)}\n`) }
  for (const id of ids) {
    const pages = [join(root, 'content/species', id, 'entity.json'), join(root, 'content/breeds', id, 'entity.json')]
    for (const file of o.headsOnly ? pages : [...pages, join(root, 'content/gallery', `${id}.json`)]) {
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const data = JSON.parse(raw) as unknown
      let changed = false
      for (const p of o.headsOnly ? photosIn((data as { photos?: Photo[] }).photos?.[0]) : photosIn(data)) {
        if (p.large || !cardWorthy(p.url, id, v, avoid)) continue
        if (none[p.url]) { report.smaller++; continue }
        const known = done.get(p.url)
        if (known) { p.large = known; changed = true; continue }
        const plan = largePlan(p)
        if (!plan) { report.skipped++; continue }
        if (full()) break
        fetched++
        try {
          let bytes: Uint8Array | undefined
          let from = ''
          for (const u of await plan.from(d)) { bytes = await d.bytes(u).catch(() => undefined); if (bytes) { from = u; break } }
          if (!bytes) throw new Error('no full size to fetch')
          const size = largeSize(await d.size(bytes))
          if (size.width <= p.width) { report.smaller++; none[p.url] = true; continue }
          if (plan.key) p.large = await d.put(plan.key, bytes, size.width)
          else {
            // Unsplash's, which the app loads from Unsplash at that width.
            const u = new URL(from)
            u.searchParams.set('w', String(size.width))
            p.large = { url: u.href, ...size }
          }
          done.set(p.url, p.large)
          report.added++
          changed = true
        } catch (e) {
          report.failed.push(`${id} ${p.url}: ${(e as Error).message.slice(0, 120)}`)
        } finally {
          await d.sleep(500) // Wikimedia asks bulk clients to go gently
        }
      }
      if (changed) {
        const indent = raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
        await writeFile(file, `${JSON.stringify(data, null, indent)}\n`)
      }
      if (full()) { await saveNone(); return report }
    }
  }
  await saveNone()
  return report
}
