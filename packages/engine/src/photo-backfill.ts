import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo, SourceId } from '@aq/schema'
import { htmlToOutline, isChallenge } from './outline'
import { mergePhotos } from './run'
import { SOURCES, sourceById } from './sources'
import { linkedPhotos, pickSourcePhotos, storeSourcePhotos, type Media } from './source-photos'

export type BackfillDeps = {
  get: (url: string) => Promise<{ status: number; html: string }>
  bytes: (url: string, referer: string) => Promise<Uint8Array>
  media: Media
  now: () => Date
  sleep: (ms: number) => Promise<void>
}
type Entity = { photos: Photo[]; scientificName?: string; family?: string; source?: SourceId; sourceUrl?: string; sections?: { source: SourceId; sourceUrl: string }[] }

const WANT = 3 // pages with fewer photos get their source pages re-read
const RETRY_MS = 30 * 86_400_000

// The catfish families ScotCat covers (one index page each, see sources.ts).
const CATFISH = new Set(['Ailiidae', 'Akysidae', 'Amblycipitidae', 'Amphiliidae', 'Anchariidae', 'Andinichthyidae', 'Ariidae', 'Aspredinidae', 'Astroblepidae', 'Auchenipteridae', 'Auchenoglanididae', 'Austroglanididae', 'Bagridae', 'Callichthyidae', 'Cetopsidae', 'Chacidae', 'Clariidae', 'Claroteidae', 'Cranoglanididae', 'Diplomystidae', 'Doradidae', 'Heptapteridae', 'Heteropneustidae', 'Horabagridae', 'Ictaluridae', 'Kryptoglanidae', 'Lacantuniidae', 'Loricariidae', 'Malapteruridae', 'Mochokidae', 'Nematogenyidae', 'Pangasiidae', 'Phreatobiidae', 'Pimelodidae', 'Plotosidae', 'Pseudopimelodidae', 'Ritidae', 'Schilbeidae', 'Scoloplacidae', 'Siluridae', 'Sisoridae', 'Trichomycteridae'])
/** ScotCat's factsheet address for a catfish: /<family>/<genus>_<species>.htm (a 404 when ScotCat uses another name). */
export function scotcatUrl(scientificName?: string, family?: string): string | undefined {
  const parts = scientificName?.toLowerCase().split(/\s+/) ?? []
  if (!family || !CATFISH.has(family) || parts.length < 2 || parts.length > 3 || !parts.every(w => /^[a-z]+$/.test(w))) return undefined
  return `https://www.scotcat.com/${family.toLowerCase()}/${parts.join('_')}.htm`
}

/**
 * Re-reads the source pages of species, plants and guides with fewer than 3 photos and adds the photos the picker
 * missed before (slim fish, images without a pixel size); catfish from other sources also get ScotCat's photos. Each
 * source page is tried at most once a month.
 */
export async function backfillPhotos(root: string, d: BackfillDeps, opts: { limit?: number } = {}): Promise<{ pages: number; added: number; errors: string[] }> {
  const triedFile = join(root, 'engine-state/_photo-backfill.json')
  const tried: Record<string, string> = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}'))
  const names: Record<string, { name?: string }> = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8').catch(() => '{}'))
  const last = new Map<SourceId, number>()
  // Every request to a source (its page, photo pages, images) at the engine's pace for it.
  const polite = <A extends unknown[], R>(source: SourceId, f: (...a: A) => Promise<R>) => async (...a: A) => {
    await d.sleep(Math.max(0, (last.get(source) ?? -Infinity) + sourceById(source).delayMs - d.now().getTime()))
    try { return await f(...a) } finally { last.set(source, d.now().getTime()) }
  }
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
      const own = kind === 'guides' ? (e.source && e.sourceUrl && e.source !== 'youtube' ? [{ source: e.source, sourceUrl: e.sourceUrl }] : []) : (e.sections ?? [])
      const scotcat = kind === 'species' && !own.some(r => r.source === 'scotcat') ? scotcatUrl(e.scientificName, e.family) : undefined
      const refs = scotcat ? [...own, { source: 'scotcat' as const, sourceUrl: scotcat }] : own
      // Only sources the engine reads (not our own guides, Facebook or video), and not those read through the Internet
      // Archive: the archive keeps no usable copies of their photos.
      const urls = [...new Map(refs.map(r => [r.sourceUrl, r.source])).entries()].filter(([u, s]) => SOURCES.some(x => x.id === s) && sourceById(s).via !== 'archive' && (!tried[u] || d.now().getTime() - Date.parse(tried[u]!) > RETRY_MS))
      if (!urls.length) continue
      pages++
      const before = e.photos.length
      for (const [url, source] of urls) {
        const src = sourceById(source)
        const get = polite(source, d.get)
        try {
          const r = await get(url)
          if (r.status === 404 && url === scotcat) { tried[url] = d.now().toISOString(); continue } // ScotCat has it under another name, or not at all
          const o = htmlToOutline(r.html, src.contentSelector)
          if (r.status >= 400 || isChallenge(o.title, o.outline)) throw new Error(r.status >= 400 ? `HTTP ${r.status}` : 'challenge')
          // Same photos as the engine takes: from their own pages where the source keeps them there (ScotCat).
          const images = src.photoPages ? await linkedPhotos(r.html, url, src.photoPages, get) : o.images
          const picked = pickSourcePhotos(images, url, e.scientificName ? [e.scientificName] : [], kind === 'guides' ? 6 : 4, kind === 'guides' ? 'guide' : 'subject', src.minPhotoWidth)
          const stored = await storeSourcePhotos(source, names[source]?.name ?? source, url, picked, { bytes: polite(source, d.bytes), media: d.media }, e.photos)
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
