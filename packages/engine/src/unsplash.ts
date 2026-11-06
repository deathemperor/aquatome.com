import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GallerySchema, slugify, STAPLE_SPECIES, type Photo } from '@aq/schema'
import { LlmError } from './claude'
import { screen, type Candidate, type GalleryDeps } from './gallery'
import { POPULAR } from './wanted'

export const UNSPLASH_LICENCE = 'Unsplash License'
/** One Unsplash API call: its JSON and the requests left this hour (X-Ratelimit-Remaining). */
export type UnsplashApi = (url: string) => Promise<{ json: unknown; remaining: number }>
type Hit = { id: string; width: number; height: number; urls: { raw: string }; links: { html: string; download_location: string }; user: { name: string; links: { html: string } } }

const MAX = 8 // photos added per gallery; each costs one request (the download report)
const RETRY_DAYS = 180
const UTM = 'utm_source=aquatome&utm_medium=referral'
// Unsplash serves any size from the raw URL; one fixed query string, so the photo caches key the same URL every time.
const sized = (raw: string, w: number) => `${raw}${raw.includes('?') ? '&' : '?'}w=${w}&q=80&fm=jpg&fit=max`

/** A search's photos as gallery candidates: hot-linked (Unsplash's terms), credited to the photographer and their profile. */
export function unsplashCandidates(hits: Hit[]): (Candidate & { report: string })[] {
  return hits.filter(h => Math.max(h.width, h.height) >= 800).map(h => {
    const k = Math.min(1, 1280 / h.width)
    return {
      key: `unsplash:${h.id}`, url: sized(h.urls.raw, 1280), thumb: sized(h.urls.raw, 480), width: Math.round(h.width * k), height: Math.round(h.height * k),
      licence: UNSPLASH_LICENCE, author: h.user.name, authorUrl: `${h.user.links.html}?${UTM}`, sourceUrl: `${h.links.html}?${UTM}`, report: h.links.download_location,
    }
  })
}

/** A photo's id from its page's address: the end of ".../photos/koi-fish-in-dark-water-51RAzy_mDsg" (ids are 11 characters, - and _ among them). */
export const unsplashId = (sourceUrl: string) => new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1)!.slice(-11)

/**
 * The photographer's page for each Unsplash photo stored before credits linked it (`authorUrl`), in the galleries and
 * the breeds' and species' own photos: one request a photo (GET /photos/:id, the same photo in two files asked once),
 * stopping when the hour's requests run out, so a few cycles finish it. A photo with one is never asked again. Runs
 * first in `pnpm engine unsplash`; `remaining` is what the hour has left for its searches.
 */
export async function unsplashCredits(root: string, api: UnsplashApi) {
  const content = join(root, 'content')
  // The pages' own photos first (a breed's leads its page), then the galleries.
  const files = [
    ...(await Promise.all(['breeds', 'species'].map(async kind => (await readdir(join(content, kind)).catch(() => [] as string[])).sort().map(id => join(content, kind, id, 'entity.json'))))).flat(),
    ...(await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort().map(f => join(content, 'gallery', f)),
  ]
  const lacking = (p: Photo) => p.licence === UNSPLASH_LICENCE && !p.authorUrl
  const report = { filled: 0, left: 0, failed: [] as string[], stopped: '', remaining: Infinity }
  const found = new Map<string, string>() // photo id → its photographer's page
  const asked = new Set<string>()
  for (const file of files) {
    const raw = await readFile(file, 'utf8').catch(() => '')
    if (!raw.includes(UNSPLASH_LICENCE)) continue
    const doc = JSON.parse(raw) as { photos?: Photo[] }
    let changed = false
    for (const [i, p] of (doc.photos ?? []).entries()) {
      if (!lacking(p)) continue
      const id = unsplashId(p.sourceUrl)
      if (!asked.has(id) && !report.stopped) {
        if (report.remaining < 1) report.stopped = 'rate limit (0 requests left this hour)'
        else {
          asked.add(id)
          try {
            const r = await api(`https://api.unsplash.com/photos/${id}`)
            report.remaining = r.remaining
            const html = (r.json as { user?: { links?: { html?: string } } }).user?.links?.html
            if (html) found.set(id, `${html}?${UTM}`)
            else report.failed.push(`${id}: no profile in the answer`)
          } catch (err) {
            const m = (err as Error).message
            // 403 is Unsplash's answer once the hour's requests are spent.
            if (/HTTP 403/.test(m)) { report.stopped = `rate limit (${m})`; report.remaining = 0 } else report.failed.push(`${id}: ${m.slice(0, 160)}`)
          }
        }
      }
      const url = found.get(id)
      // Beside the name it links, as a new photo has it.
      if (url) { doc.photos![i] = Object.fromEntries(Object.entries(p).flatMap(([k, v]) => (k === 'author' ? [[k, v], ['authorUrl', url]] : [[k, v]]))) as Photo; report.filled++; changed = true } else report.left++
    }
    if (changed) await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`)
  }
  return report
}

/** The English Wikipedia title a scientific name redirects to ("Paracheirodon innesi" → "Neon tetra"): Unsplash is searched by common name. */
export async function englishName(sci: string, http: GalleryDeps['http']): Promise<string> {
  const r = (await http(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(sci)}`).catch(() => null)) as { query?: { pages?: Record<string, { title: string; missing?: string }> } } | null
  const page = Object.values(r?.query?.pages ?? {})[0]
  return page && page.missing === undefined ? page.title.replace(/\s*\([^)]*\)$/, '') : sci
}

/**
 * Unsplash photos added to the existing galleries of the fish readers look for first: the staples, the breeds, then the
 * popular list. Each search's photos are screened like the gallery's (no faces, the right fish), and each photo kept is
 * reported to Unsplash's download endpoint, as its API terms ask; a photo whose report fails is left out. Demo keys get
 * 50 requests an hour, so the step stops before a gallery could run out mid-way (`remaining`: the requests the hour has
 * left when it starts, after unsplashCredits). content/gallery/<id>.json.
 */
export async function unsplashPhotos(root: string, api: UnsplashApi, d: GalleryDeps, o: { limit: number; remaining?: number }) {
  const content = join(root, 'content')
  const triedFile = join(root, 'engine-state/_unsplash.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const has = async (kind: string) => new Set(await readdir(join(content, kind)).catch(() => [] as string[]))
  const species = await has('species')
  const breeds = await has('breeds')
  // Breeds with no photo at all first (Commons often has none of a line): their pages have no picture yet.
  const photoless = new Set<string>()
  for (const id of breeds) if (!(JSON.parse(await readFile(join(content, 'breeds', id, 'entity.json'), 'utf8')) as { photos: Photo[] }).photos.length) photoless.add(id)
  const ids = [...new Set([...[...photoless].sort(), ...STAPLE_SPECIES, ...[...breeds].sort(), ...POPULAR.map(slugify)])].filter(id => species.has(id) || breeds.has(id))
  const report = { done: [] as string[], failed: [] as string[], stopped: '' }
  let remaining = o.remaining ?? Infinity
  for (const id of ids) {
    if (report.done.length + report.failed.length >= o.limit) break
    if (tried[id] && (d.now().getTime() - Date.parse(tried[id])) / 86_400_000 < RETRY_DAYS) continue
    const breed = breeds.has(id)
    const file = join(content, 'gallery', `${id}.json`)
    const gallery = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { id: string; photos: Photo[]; seen: number; updatedAt: string } | null
      // The gallery step makes species galleries first (Commons, iNaturalist); a breed's may not exist yet.
      ?? (breed ? { id, photos: [], seen: 0, updatedAt: d.now().toISOString().slice(0, 10) } : null)
    if (!gallery) continue
    if (remaining < 1 + MAX) { report.stopped = `rate limit (${remaining} requests left this hour)`; break }
    try {
      const kind = breed ? 'breeds' : 'species'
      const entityFile = join(content, kind, id, 'entity.json')
      const e = JSON.parse(await readFile(entityFile, 'utf8')) as { scientificName?: string; photos: Photo[] }
      const vi = JSON.parse(await readFile(join(content, kind, id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
      const sci = e.scientificName ?? id.replace(/-/g, ' ')
      const query = breed ? id.replace(/-/g, ' ') : await englishName(sci, d.http)
      const r = await api(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30&content_filter=high`)
      remaining = r.remaining
      const seen = new Set(gallery.photos.flatMap(p => [p.url, p.sourceUrl]))
      const cands = unsplashCandidates((r.json as { results?: Hit[] }).results ?? []).filter(c => !rejected[c.url] && !seen.has(c.url) && !seen.has(c.sourceUrl))
      const name = query.toLowerCase() === sci.toLowerCase() ? sci : `${query} (${sci})`
      const kept = (await screen(cands, name, vi.name ?? query, d, breed)).slice(0, MAX)
      const added: Photo[] = []
      for (const p of kept) {
        const c = cands.find(x => x.url === p.url)!
        try { remaining = (await api(c.report)).remaining; added.push(p) } catch { /* not reported: not used */ }
      }
      // A breed page without a photo takes the best ones as its own (the first leads the page), the rest go to the gallery.
      const own = breed && !e.photos.length ? added.splice(0, 4) : []
      if (own.length) await writeFile(entityFile, `${JSON.stringify({ ...e, photos: own }, null, 2)}\n`)
      if (added.length) await writeFile(file, `${JSON.stringify(GallerySchema.parse({ ...gallery, photos: [...gallery.photos, ...added], seen: gallery.seen + cands.length }), null, 2)}\n`)
      tried[id] = d.now().toISOString().slice(0, 10)
      report.done.push(`${id}: ${own.length + added.length} of ${cands.length}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
  return report
}
