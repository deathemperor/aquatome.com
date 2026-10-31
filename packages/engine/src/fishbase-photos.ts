import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import { SOURCE_PHOTO_LICENCE, type Media } from './source-photos'

/** A photographer who let us use their FishBase photos (content/sources.json has the permission). */
export const PANITVONG = { source: 'panitvong' as const, name: 'Nonn Panitvong', collaborator: 1825, inat: 'nonnp' }
type Photographer = typeof PANITVONG
export type FishbaseDeps = { get: (url: string) => Promise<string>; bytes: (url: string, referer: string) => Promise<Uint8Array>; media: Media; sleep: (ms: number) => Promise<void> }

const BASE = 'https://fishbase.se'
const CRAWL_DELAY = 10_000 // fishbase.se/robots.txt
export const listUrl = (p: Photographer) => `${BASE}/photos/PhotosList.php?id=${p.collaborator}&vCollaborator=${encodeURIComponent(p.name).replace(/%20/g, '+')}`
export const photoPage = (p: Photographer, pic: string) => `${BASE}/photos/PicturesSummary.php?pic=${encodeURIComponent(pic)}&personnel=${p.collaborator}&what=collab_pic`

/** A collaborator's photo list: one row per photo, the species and the photo's file name. */
export function collaboratorPhotos(html: string): { scientificName: string; pic: string }[] {
  return html.split(/<tr\b/).flatMap(row => {
    const name = row.match(/speciesname=[^"']*["']>([A-Z][a-z]+ [a-z-]+)<\/a>/)?.[1]
    const pic = row.match(/PicturesSummary\.php\?pic=([^&'"]+)/)?.[1]
    return name && pic ? [{ scientificName: name, pic }] : []
  })
}

/**
 * The photographer's FishBase photos of species the site has, added to those species' pages (entity.json), credited to them
 * and linking the photo's FishBase page. A photo already on the page, or one the owner rejected, is skipped, so a rerun only
 * adds photos of species that got a page since.
 */
export async function fishbasePhotos(root: string, d: FishbaseDeps, p: Photographer = PANITVONG) {
  const dir = join(root, 'content/species')
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const bySci = new Map<string, string>()
  for (const id of await readdir(dir)) {
    const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }
    if (e.scientificName) bySci.set(e.scientificName.toLowerCase(), id)
  }
  const report = { added: [] as string[], failed: [] as string[] }
  const list = collaboratorPhotos(await d.get(listUrl(p)))
  for (const { scientificName, pic } of list) {
    const id = bySci.get(scientificName.toLowerCase())
    if (!id) continue
    const file = join(dir, id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    const page = photoPage(p, pic)
    const key = `${p.source}/${pic.replace(/\.[a-z]+$/i, '')}.webp`
    if (e.photos.some(x => x.sourceUrl === page) || rejected[d.media.urlFor(key)]) continue
    try {
      await d.sleep(CRAWL_DELAY)
      const stored = await d.media.put(key, await d.bytes(`${BASE}/images/species/${pic}`, page))
      e.photos.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: p.name, sourceUrl: page, source: p.source })
      await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
      report.added.push(`${id}: ${pic}`)
    } catch (err) {
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  return { ...report, listed: list.length }
}

type InatObs = { taxon?: { name: string; rank: string }; photos: { id: number; url: string; attribution: string }[] }
const FEW = 4 // pages with fewer photos than this get his

/**
 * His iNaturalist photos (all rights reserved; he approved their use) on the pages of the species they show, for pages
 * with fewer than 4 photos. Only photos credited to him; each links its iNaturalist photo page. Reruns skip photos already
 * there and those rejected (many are quick field shots through murky water).
 */
export async function inatPhotos(root: string, d: FishbaseDeps, p: Photographer = PANITVONG) {
  const dir = join(root, 'content/species')
  const bySci = new Map<string, string>()
  for (const id of await readdir(dir)) {
    const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }
    if (e.scientificName) bySci.set(e.scientificName.toLowerCase(), id)
  }
  const obs: InatObs[] = []
  for (let page = 1; ; page++) {
    const r = JSON.parse(await d.get(`https://api.inaturalist.org/v1/observations?user_login=${p.inat}&per_page=200&page=${page}&order_by=id&order=asc`)) as { results: InatObs[] }
    obs.push(...r.results)
    if (r.results.length < 200) break
    await d.sleep(1_000)
  }
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const report = { added: [] as string[], failed: [] as string[] }
  for (const o of obs) {
    const id = o.taxon?.rank === 'species' ? bySci.get(o.taxon.name.toLowerCase()) : undefined
    if (!id) continue
    const file = join(dir, id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    for (const ph of o.photos.filter(x => x.attribution.includes(p.name))) {
      const sourceUrl = `https://www.inaturalist.org/photos/${ph.id}`
      const key = `${p.source}/inat-${ph.id}.webp`
      if (e.photos.length >= FEW || e.photos.some(x => x.sourceUrl === sourceUrl) || rejected[d.media.urlFor(key)]) continue
      try {
        await d.sleep(1_000)
        const stored = await d.media.put(key, await d.bytes(ph.url.replace('/square.', '/large.'), sourceUrl))
        e.photos.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: p.name, sourceUrl, source: p.source })
        await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
        report.added.push(`${id}: ${ph.id}`)
      } catch (err) {
        report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
      }
    }
  }
  return report
}
