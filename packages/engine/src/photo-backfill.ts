import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo, SourceId } from '@aq/schema'
import { htmlToOutline, isChallenge } from './outline'
import { mergePhotos } from './run'
import { sourceById } from './sources'
import { pickSourcePhotos, storeSourcePhotos, type Media } from './source-photos'

export type BackfillDeps = {
  get: (url: string) => Promise<{ status: number; html: string }>
  bytes: (url: string, referer: string) => Promise<Uint8Array>
  media: Media
  now: () => Date
  sleep: (ms: number) => Promise<void>
}
type Entity = { photos: Photo[]; scientificName?: string; source?: SourceId; sourceUrl?: string; sections?: { source: SourceId; sourceUrl: string }[] }

const WANT = 3 // pages with fewer photos get their source pages re-read
const RETRY_MS = 30 * 86_400_000

/**
 * Re-reads the source pages of species, plants and guides with fewer than 3 photos and adds the photos the picker
 * missed before (slim fish, images without a pixel size). Each source page is tried at most once a month.
 */
export async function backfillPhotos(root: string, d: BackfillDeps, opts: { limit?: number } = {}): Promise<{ pages: number; added: number; errors: string[] }> {
  const triedFile = join(root, 'engine-state/_photo-backfill.json')
  const tried: Record<string, string> = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}'))
  const names: Record<string, { name?: string }> = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8').catch(() => '{}'))
  const last = new Map<SourceId, number>()
  let pages = 0
  let added = 0
  const errors: string[] = []
  for (const kind of ['species', 'plants', 'guides'] as const) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      if (opts.limit !== undefined && pages >= opts.limit) break
      const file = join(root, 'content', kind, id, 'entity.json')
      const e = JSON.parse(await readFile(file, 'utf8')) as Entity
      if (e.photos.length >= WANT) continue
      // Video guides (source 'youtube') have no web page to read photos from.
      const refs = kind === 'guides' ? (e.source && e.sourceUrl && e.source !== 'youtube' ? [{ source: e.source, sourceUrl: e.sourceUrl }] : []) : (e.sections ?? [])
      const urls = [...new Map(refs.map(r => [r.sourceUrl, r.source])).entries()].filter(([u]) => !tried[u] || d.now().getTime() - Date.parse(tried[u]!) > RETRY_MS)
      if (!urls.length) continue
      pages++
      const before = e.photos.length
      for (const [url, source] of urls) {
        const src = sourceById(source)
        await d.sleep(Math.max(0, (last.get(source) ?? -Infinity) + src.delayMs - d.now().getTime())) // same pace as the engine
        try {
          const r = await d.get(url)
          last.set(source, d.now().getTime())
          const o = htmlToOutline(r.html, src.contentSelector)
          if (r.status >= 400 || isChallenge(o.title, o.outline)) throw new Error(r.status >= 400 ? `HTTP ${r.status}` : 'challenge')
          const picked = pickSourcePhotos(o.images, url, e.scientificName ? [e.scientificName] : [], kind === 'guides' ? 6 : 4, kind === 'guides' ? 'guide' : 'subject')
          const stored = await storeSourcePhotos(source, names[source]?.name ?? source, url, picked, { bytes: d.bytes, media: d.media }, e.photos)
          if (stored.length) e.photos = kind === 'guides' ? [...stored, ...e.photos.filter(p => p.sourceUrl !== url)].slice(0, 6) : mergePhotos(e.photos, source, url, stored)
          tried[url] = d.now().toISOString()
        } catch (err) {
          errors.push(`${kind}/${id} ${url}: ${(err as Error).message.slice(0, 120)}`)
        }
      }
      if (e.photos.length !== before) { added += e.photos.length - before; await writeFile(file, `${JSON.stringify(e, null, 2)}\n`) }
    }
  }
  await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
  return { pages, added, errors }
}
