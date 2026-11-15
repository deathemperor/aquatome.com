import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PHOTO_SCREEN_FILE, type Photo, type PhotoScreenEntry, type SourceId } from '@aq/schema'
import { htmlToOutline, isChallenge } from './outline'
import { mergePhotos, readKeeps } from './run'
import { SOURCES, sourceById } from './sources'
import { sourcesOnArchive } from './state'
import { linkedPhotos, mayTake, pickSourcePhotos, storeSourcePhotos, type CreditTerms, type Media } from './source-photos'
import { withSections } from './guide-sections'
import { WRITTEN_OTHER_LANGS } from '@aq/schema/langs'

export type BackfillDeps = {
  get: (url: string) => Promise<{ status: number; html: string }>
  bytes: (url: string, referer: string) => Promise<Uint8Array>
  media: Media
  now: () => Date
  sleep: (ms: number) => Promise<void>
}
type Entity = { photos: (Photo & { section?: unknown })[]; scientificName?: string; family?: string; source?: SourceId; sourceUrl?: string; sections?: { source: SourceId; sourceUrl: string }[] }

const WANT = 3 // pages with fewer photos get their source pages re-read
const RETRY_MS = 30 * 86_400_000
/** Guides read before photos kept their section (and before the cap of 6 went): each is read once more for them. */
const SECTIONS_SINCE = '2026-11-01T12:00:00.000Z'

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
 * successful source read waits a month (apart from the one Glaser bypass); failed monthly reads remain due.
 * A guide keeps every photo of its source, each in the section it sat under
 * (a list of fish has one per fish): guides read before that are read once more. `kinds`: only those.
 */
/**
 * `only`: these pages alone (ids), each read now whenever it was last read: pages a person put first in line, as the
 * chief of staff did on 2026-11-14 for fish left with no photo once photos we hold no permission for came off.
 */
export async function backfillPhotos(root: string, d: BackfillDeps, opts: { limit?: number; kinds?: string[]; only?: string[] } = {}): Promise<{ pages: number; added: number; errors: string[] }> {
  const moved = await sourcesOnArchive(root)
  const triedFile = join(root, 'engine-state/_photo-backfill.json')
  const tried: Record<string, string> = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}'))
  // Old outlines retain neither layout widths nor alternate image URLs. Empty Glaser pages get one cooldown bypass,
  // within this step's existing limit. Ordinary failed monthly reads remain due by the existing rules.
  const intakeFile = join(root, 'engine-state/_photo-intake-retry.json')
  const intake: Record<string, string> = JSON.parse(await readFile(intakeFile, 'utf8').catch(() => '{}'))
  const names: Record<string, { name?: string; publish?: boolean | 'photos'; permission?: CreditTerms & { markRemoval?: { allowed?: boolean } } }> = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8').catch(() => '{}'))
  const blocked: Record<string, string> = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}'))
  const screen: Record<string, PhotoScreenEntry> | undefined = JSON.parse(await readFile(join(root, 'engine-state', PHOTO_SCREEN_FILE), 'utf8').catch(() => 'null')) ?? undefined
  const last = new Map<SourceId, number>()
  // Every request to a source (its page, photo pages, images) at the engine's pace for it.
  const polite = <A extends unknown[], R>(source: SourceId, f: (...a: A) => Promise<R>) => async (...a: A) => {
    await d.sleep(Math.max(0, (last.get(source) ?? -Infinity) + sourceById(source).delayMs - d.now().getTime()))
    try { return await f(...a) } finally { last.set(source, d.now().getTime()) }
  }
  let pages = 0
  let added = 0
  const errors: string[] = []
  for (const kind of (['species', 'plants', 'guides'] as const).filter(k => !opts.kinds || opts.kinds.includes(k))) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      if (opts.limit !== undefined && pages >= opts.limit) break
      if (opts.only && !opts.only.includes(id)) continue
      const file = join(root, 'content', kind, id, 'entity.json')
      const e = JSON.parse(await readFile(file, 'utf8')) as Entity
      const unsectioned = kind === 'guides' && !e.photos.some(p => p.section)
      if (e.photos.length >= WANT && !unsectioned) continue
      // Video guides (source 'youtube') have no web page to read photos from.
      const own = kind === 'guides' ? (e.source && e.sourceUrl && e.source !== 'youtube' ? [{ source: e.source, sourceUrl: e.sourceUrl }] : []) : (e.sections ?? [])
      const scotcat = kind === 'species' && !own.some(r => r.source === 'scotcat') ? scotcatUrl(e.scientificName, e.family) : undefined
      const refs = scotcat ? [...own, { source: 'scotcat' as const, sourceUrl: scotcat }] : own
      // Only sources the engine reads (not our own guides, Facebook or video), and not those read through the Internet
      // Archive: the archive keeps no usable copies of their photos. Nor one whose photos a step of its own takes (Tropica).
      const retryIntake = (u: string, s: SourceId) => s === 'glaser' && !e.photos.length && !!tried[u] && !intake[u]
      const due = (u: string, s: SourceId) => !!opts.only || retryIntake(u, s) || !tried[u] || d.now().getTime() - Date.parse(tried[u]!) > RETRY_MS || (unsectioned && tried[u]! < SECTIONS_SINCE)
      const urls = [...new Map(refs.map(r => [r.sourceUrl, r.source])).entries()].filter(([u, s]) => SOURCES.some(x => x.id === s) && sourceById(s).via !== 'archive' && !sourceById(s).photoStep && !moved.has(s) && due(u, s))
      if (!urls.length) continue
      pages++
      const before = e.photos.length
      const was = JSON.stringify(e.photos)
      for (const [url, source] of urls) {
        const src = sourceById(source)
        const get = polite(source, d.get)
        const max = kind === 'guides' ? Infinity : 4
        try {
          if (source === 'glaser') intake[url] = d.now().toISOString()
          const r = await get(url)
          if (r.status === 404 && url === scotcat) { tried[url] = d.now().toISOString(); continue } // ScotCat has it under another name, or not at all
          const o = htmlToOutline(r.html, src.contentSelector)
          if (r.status >= 400 || isChallenge(o.title, o.outline)) throw new Error(r.status >= 400 ? `HTTP ${r.status}` : 'challenge')
          // Same photos as the engine takes: from their own pages where the source keeps them there (ScotCat).
          const images = src.photoPages ? await linkedPhotos(r.html, url, src.photoPages, get) : o.images
          const name = names[source]?.name ?? source
          const terms = names[source]?.permission
          const photoDeps = { bytes: polite(source, d.bytes), media: d.media, blocked, refusedCredits: terms?.refusedCredits, coveredCredits: terms?.coveredCredits }
          const picked = pickSourcePhotos(images, url, e.scientificName ? [e.scientificName] : [], max, kind === 'guides' ? 'guide' : 'subject', src.minPhotoWidth, mayTake(source, name, photoDeps, e.photos))
          const stored = await storeSourcePhotos(source, name, url, picked, photoDeps, e.photos, max)
          if (stored.length && kind === 'guides') {
            const body = async (l: string) => (JSON.parse(await readFile(join(root, 'content', kind, id, `${l}.json`), 'utf8').catch(() => '{}')) as { body?: string }).body
            e.photos = [...withSections(stored, { vi: (await body('vi')) ?? '', ...Object.fromEntries(await Promise.all(WRITTEN_OTHER_LANGS.map(async l => [l, await body(l)]))) }), ...e.photos.filter(p => p.sourceUrl !== url)]
          } else if (stored.length) e.photos = mergePhotos(e.photos, source, url, stored.map(({ heading: _, ...p }) => p), readKeeps(`${kind}/${id}`, e.scientificName ?? '', blocked, names, screen))
          tried[url] = d.now().toISOString()
        } catch (err) {
          errors.push(`${kind}/${id} ${url}: ${(err as Error).message.slice(0, 120)}`)
        } finally {
          if (source === 'glaser') await writeFile(intakeFile, `${JSON.stringify(Object.fromEntries(Object.entries(intake).sort()), null, 2)}\n`)
        }
      }
      if (JSON.stringify(e.photos) !== was) { added += e.photos.length - before; await writeFile(file, `${JSON.stringify(e, null, 2)}\n`) }
    }
  }
  await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
  return { pages, added, errors }
}
