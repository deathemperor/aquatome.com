import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import { SOURCE_PHOTO_LICENCE, type Media } from './source-photos'
import type { FishbaseDeps } from './fishbase-photos'

/** Jan D. Bastmeijer's Crypts Pages (content/sources.json has the permission). */
export const CRYPTS = { source: 'cryptspages' as const, name: 'Jan D. Bastmeijer', base: 'https://www.cryptocoryneworld.org' }
export type CryptsDeps = FishbaseDeps
const MAX = 3 // photos added per page
const DELAY = 2_000
export const cryptsPage = (epithet: string) => `${CRYPTS.base}/c_${epithet}.php`

/**
 * The page's photos that are Bastmeijer's own: the file is of the page's species (named after its epithet), from his
 * collection or cultivation (a B-number in the file name), and the caption credits no one else ("photo …", "drawing …").
 * Maps, drawings and herbarium sheets (dried type specimens) are left out. Leaves and whole plants first, flowers next, habitat views last.
 */
export function ownPhotos(html: string, epithet: string): { src: string; file: string }[] {
  const prefix = `${epithet.slice(0, 3).toLowerCase()}_`
  const seen = new Set<string>()
  const out: { src: string; file: string; rank: number }[] = []
  const parts = html.split(/(?=<a href="[^"]+"\s*class="gal_link">)/)
  for (const part of parts) {
    const src = part.match(/^<a href="([^"]+)"\s*class="gal_link">/)?.[1]
    if (!src || seen.has(src)) continue
    seen.add(src)
    const file = src.split('/').pop()!
    const caption = part.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 700)
    if (!file.toLowerCase().startsWith(prefix) || !/_B\d+_/.test(file) || /-(loc|dra|map)\b|SING|herb/i.test(file) || /\b(photo|drawing|foto)\b/i.test(caption) || /\b(herbarium|specimen|holotype|isotype|lectotype|type of)\b/i.test(caption)) continue
    const rank = /\b(view|river|stream|habitat|locality)\b/i.test(caption) ? 2 : /\b(spathe|limb|kettle|inflorescence|spadix)\b/i.test(caption) ? 1 : 0
    out.push({ src, file, rank })
  }
  return out.map((x, i) => ({ ...x, i })).sort((a, b) => a.rank - b.rank || a.i - b.i).map(({ src, file }) => ({ src, file }))
}

/** Up to 3 of Bastmeijer's photos on each Cryptocoryne page that has none of his yet (content/plants/<id>/entity.json). */
export async function cryptsPhotos(root: string, d: CryptsDeps) {
  const dir = join(root, 'content/plants')
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const report = { added: [] as string[], skipped: [] as string[], failed: [] as string[] }
  for (const id of (await readdir(dir)).filter(id => id.startsWith('cryptocoryne-')).sort()) {
    const file = join(dir, id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as { scientificName?: string; photos: Photo[] }
    const epithet = e.scientificName?.match(/^Cryptocoryne ([a-z-]+)$/)?.[1]
    if (!epithet || e.photos.some(p => p.source === CRYPTS.source)) continue
    const page = cryptsPage(epithet)
    try {
      await d.sleep(DELAY)
      const picked = ownPhotos(await d.get(page), epithet).filter(x => !rejected[d.media.urlFor(`${CRYPTS.source}/${x.file.replace(/\.[a-z]+$/i, '')}.webp`)]).slice(0, MAX)
      if (!picked.length) { report.skipped.push(`${id}: no photos of his`); continue }
      for (const x of picked) {
        await d.sleep(DELAY)
        const stored = await d.media.put(`${CRYPTS.source}/${x.file.replace(/\.[a-z]+$/i, '')}.webp`, await d.bytes(new URL(x.src, page).href, page))
        e.photos.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: CRYPTS.name, sourceUrl: page, source: CRYPTS.source })
      }
      await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
      report.added.push(`${id}: ${picked.length}`)
    } catch (err) {
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  return report
}
