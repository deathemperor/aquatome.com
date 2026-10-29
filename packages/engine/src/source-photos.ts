import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { Photo, SourceId } from '@aq/schema'
import type { PageImage } from './outline'

export type Media = { urlFor: (key: string) => string; put: (key: string, bytes: Uint8Array) => Promise<{ url: string; thumb?: string; width: number; height: number }> }
/** `probe`: the page gave no pixel size (missing or "100%"), so the real size is checked after download. */
type Picked = PageImage & { probe?: boolean }

const JUNK = /logo|icon|sprite|avatar|banner|badge|placeholder|gravatar|payment|flag|button|spinner|loader|emoji|pixel|tracking/i
const SCENERY = /habitat|biotope|locality|\bmap\b/i
/** Shop packshots (food, fertiliser, hardware): wrong as a species or plant photo. Articles drop shop product tiles instead (PageImage.product). */
export const PRODUCT = /fertili[sz]er|cuisine|\bfoods?\b|pellets?|wafers?|flakes?|\btabs?\b|\bcaves?\b|\bshells?\b|bottle|\bpack\b|\bkit\b|filter|heater|substrate|\b\d+(\.\d+)?\s?(ml|oz|g|kg|lb|gal)\b/i
const MIN_WIDTH = 600
/** Long slim fish (loaches, gar) photograph at ~2.6:1; banners are wider still. */
const okShape = (w: number, h: number) => h / w >= 0.25 && h / w <= 1.6
export const SOURCE_PHOTO_LICENCE = 'dùng với sự cho phép'

const file = (src: string) => decodeURIComponent(src.split(/[?#]/)[0]!.split('/').pop() ?? '')
const dedupeKey = (src: string) => file(src).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/-(\d+x\d+|scaled)$/, '')
const words = (s: string) => s.toLowerCase().replace(/[-_.]+/g, ' ')

/** Best photos from a source page: real photos (not chrome), big enough, about the subject; the subject itself before scenery. */
export function pickSourcePhotos(images: PageImage[], pageUrl: string, names: string[], max = 4, kind: 'subject' | 'guide' = 'subject'): Picked[] {
  const terms = [...new Set(names.flatMap(n => [n.toLowerCase(), ...n.toLowerCase().split(/\s+/).filter(w => w.length >= 4)]))]
  const seen = new Set<string>()
  const seenAlt = new Set<string>()
  const ranked: { img: Picked; score: number }[] = []
  for (const img of images) {
    let src: string
    try { src = new URL(img.src, pageUrl).href } catch { continue }
    if (!/^https?:/.test(src) || /\.(svg|gif)(\?|$)/i.test(src) || JUNK.test(`${file(src)} ${img.alt}`)) continue
    if (img.width && img.width < MIN_WIDTH) continue
    if (img.width && img.height && !okShape(img.width, img.height)) continue
    if (kind === 'subject' && PRODUCT.test(`${file(src)} ${img.alt}`)) continue
    if (kind === 'guide' && img.product) continue // a shop's product tile is an ad, not a picture of what the article says
    const key = dedupeKey(src)
    const altKey = img.alt.toLowerCase().trim()
    if (seen.has(key) || (altKey && seenAlt.has(altKey))) continue
    seen.add(key)
    if (altKey) seenAlt.add(altKey)
    const text = words(`${file(src)} ${img.alt}`)
    const score = (terms.some(t => text.includes(t)) ? 2 : 0) + ((img.width ?? 0) >= 1000 ? 0.5 : 0) - (SCENERY.test(img.alt) ? 1.5 : 0)
    ranked.push({ img: { ...img, src, ...(img.width ? {} : { probe: true }) }, score: score - (img.width ? 0 : 0.25) })
  }
  return ranked.map((r, i) => ({ ...r, i })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max).map(r => r.img)
}

/** Copy picked photos to our media bucket (once per image) and credit the source page. */
export async function storeSourcePhotos(
  source: SourceId, sourceName: string, pageUrl: string, picked: Picked[],
  deps: { bytes: (url: string, referer: string) => Promise<Uint8Array>; media: Media; size?: (bytes: Uint8Array) => Promise<{ width?: number; height?: number }> }, existing: Photo[],
): Promise<Photo[]> {
  const out: Photo[] = []
  for (const img of picked) {
    const key = `${source}/${createHash('sha256').update(img.src).digest('hex').slice(0, 16)}.webp`
    const known = existing.find(p => p.url === deps.media.urlFor(key))
    if (known) { out.push(known); continue }
    let bytes: Uint8Array
    try {
      bytes = await deps.bytes(img.src, pageUrl)
    } catch (e) {
      console.warn(`photo skipped ${img.src}: ${(e as Error).message}`) // one unreachable image doesn't fail the page
      continue
    }
    if (img.probe) {
      const { width = 0, height = 0 } = await (deps.size ?? (b => sharp(b).metadata()))(bytes).catch(() => ({ width: 0, height: 0 }))
      if (width < MIN_WIDTH || !okShape(width, height)) continue
    }
    const stored = await deps.media.put(key, bytes) // storage failures (token, bucket) fail the page so it is retried
    out.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: sourceName, sourceUrl: pageUrl, ...(img.alt ? { caption: img.alt.slice(0, 200) } : {}), source })
  }
  return out
}
