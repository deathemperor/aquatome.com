import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GallerySchema, type Photo } from '@aq/schema'
import { parse } from 'node-html-parser'
import sharp from 'sharp'
import { albumLooks, rankGallery, screenedAt, waiting, type GalleryPhoto, type GalleryState } from './gallery'
import { largeSize } from './large-photos'
import { cantTellOn, type PhotoVerdict } from './photo-check'
import { namedOn } from './photo-named'
import { MAX_PHOTOS } from './run'
import { SOURCE_PHOTO_LICENCE, type Media } from './source-photos'

/** Tropica's plant pages (content/sources.json has the permission, photos included: the owner, 2026-11-10). */
export const TROPICA = { source: 'tropica' as const, name: 'Tropica' }
export type TropicaDeps = {
  get: (url: string) => Promise<string>
  bytes: (url: string, referer: string) => Promise<Uint8Array>
  media: Media & { putLarge: (key: string, bytes: Uint8Array, width: number) => Promise<NonNullable<Photo['large']>> }
  sleep: (ms: number) => Promise<void>
  now: () => Date
}
const DELAY = 5_000 // between requests to Tropica, as the engine reads its pages (sources.ts)
const RETRY_MS = 30 * 86_400_000
const MAX = 4 // photos a page; a page shows four at most
const MIN_WIDTH = 600

/**
 * A plant page's photos, as the paths its picture address takes (`/Plants/043 BDT/2.png`), in the page's order: the ones
 * its row of thumbnails opens (`a.showLargeImage`). The painted drawing beside the plant's facts has a link of its own
 * and is not one of them, nor are the layouts the plant is used in. The page has no alt text or file name that says
 * which is which (found 2026-11-10 on eleven pages: one to four photos each, the drawing always apart).
 */
export function tropicaImages(html: string, pageUrl: string): string[] {
  const out = new Set<string>()
  for (const a of parse(html).querySelectorAll('a.showLargeImage')) {
    let image: string | null
    try { image = new URL(a.getAttribute('href') ?? '', pageUrl).searchParams.get('image') } catch { continue }
    if (image?.startsWith('/Plants/')) out.add(image)
  }
  return [...out]
}

/**
 * The picture at the size Tropica keeps it (1,000 to 1,564 px across on the pages measured). With a height in the
 * address the same endpoint enlarges it to whatever is asked, which is not a bigger photo.
 */
export const tropicaSrc = (image: string) => `https://tropica.com/imagegen.ashx?image=${encodeURI(image)}&class=product`

const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/**
 * A picture as Tropica's page shows it: on white where its background is see-through (a cut-out would otherwise sit on
 * whatever colour the site or the app puts behind it), with its size, and whether it is a scene, the plant in a tank or
 * a close view that fills the frame, rather than a plant or a pot cut out on white: under a fifth of its edge is white.
 */
export async function asShown(raw: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number; scene: boolean }> {
  const meta = await sharp(raw).metadata()
  const bytes = meta.hasAlpha ? new Uint8Array(await sharp(raw).flatten({ background: '#ffffff' }).png().toBuffer()) : raw
  const side = 32
  const px = await sharp(bytes).resize(side, side, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer()
  let white = 0
  let edge = 0
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (x > 0 && x < side - 1 && y > 0 && y < side - 1) continue
      const i = (y * side + x) * 3
      edge++
      if (px[i]! >= 240 && px[i + 1]! >= 240 && px[i + 2]! >= 240) white++
    }
  }
  return { bytes, width: meta.width ?? 0, height: meta.height ?? 0, scene: white / edge < 0.2 }
}

type Entity = { photos: Photo[]; sections?: { key?: string; source: string; sourceUrl: string }[] }
type Gallery = { photos: GalleryPhoto[]; seen: number; updatedAt: string; builtAt?: string }

/**
 * Tropica's own photos of each plant it wrote about, once a plant: up to four from its page, never the drawing, each
 * at the size Tropica keeps it and on white. A page is read again after a month if it gave none.
 *
 * Where they go (agreed with the Curation Lead, 2026-11-10): on a page that has photos, behind them, scenes before
 * cut-outs, so what leads stays, and only as many as the page shows: its lead and one photo between each pair of its
 * sections (the site's section-parts.ts), eight at most (run.ts). Most Tropica pages have two or three sections, and a
 * photo past that would sit in the page's file and show nowhere, so the rest go to its gallery. On a page with none, all
 * go to its gallery, the widest scene marked `best`: the step that fills a page with no photo (lead-photos, once it
 * takes plants) tries the gallery's `best` first, and only a photo the photo check passed can lead. A gallery shows
 * once it has six. A scene wider than the stored 1,200 px keeps its large copy too, for a card.
 *
 * `engine-state/_photo-tropica.json`: plant page → when it was read. `--limit`: pages a run.
 */
export async function tropicaPhotos(root: string, d: TropicaDeps, o: { limit?: number } = {}) {
  const dir = join(root, 'content/plants')
  const triedFile = join(root, 'engine-state/_photo-tropica.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const subjects = JSON.parse(await readFile(join(root, 'engine-state/_photo-subjects.json'), 'utf8').catch(() => '{}')) as Record<string, Record<string, PhotoVerdict>>
  const looksOn = await albumLooks(root, subjects)
  const on = await namedOn(join(root, 'content'))
  const report = { added: [] as string[], skipped: [] as string[], failed: [] as string[] }
  let pages = 0
  for (const id of (await readdir(dir).catch(() => [] as string[])).sort()) {
    const file = join(dir, id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as Entity | null
    const page = e?.sections?.find(s => s.source === TROPICA.source)?.sourceUrl
    if (!e || !page) continue
    const gfile = join(root, 'content/gallery', `${id}.json`)
    const g = JSON.parse(await readFile(gfile, 'utf8').catch(() => 'null')) as Gallery | null
    if ([...e.photos, ...(g?.photos ?? [])].some(p => p.source === TROPICA.source)) continue
    if (tried[page] && d.now().getTime() - Date.parse(tried[page]) < RETRY_MS) continue
    if (o.limit !== undefined && pages >= o.limit) break
    pages++
    try {
      await d.sleep(DELAY)
      const fresh: (Photo & { scene: boolean })[] = []
      for (const image of tropicaImages(await d.get(page), page).slice(0, MAX)) {
        const src = tropicaSrc(image)
        const key = `${TROPICA.source}/${sha16(src)}.webp`
        if (rejected[d.media.urlFor(key)]) continue
        await d.sleep(DELAY)
        const raw = await d.bytes(src, page) // a failed request fails the page, which is read again next run
        // An address that answers with something that is no picture (an error page) is left out, and the page keeps the rest.
        const shown = await asShown(raw).catch(() => undefined)
        if (!shown) { report.failed.push(`${id}: ${image} is no picture`); continue }
        if (shown.width < MIN_WIDTH) continue
        const stored = await d.media.put(key, shown.bytes)
        const big = largeSize(shown)
        const large = big.width > stored.width ? await d.media.putLarge(key.replace(/\.webp$/, '-large.webp'), shown.bytes, big.width) : undefined
        fresh.push({ ...stored, ...(large ? { large } : {}), licence: SOURCE_PHOTO_LICENCE, author: TROPICA.name, sourceUrl: page, source: TROPICA.source, scene: shown.scene })
      }
      tried[page] = d.now().toISOString()
      if (!fresh.length) { report.skipped.push(`${id}: no photo to take`); continue }
      const scenes = fresh.filter(p => p.scene).sort((a, b) => b.width / b.height - a.width / a.height)
      const ordered = [...scenes, ...fresh.filter(p => !p.scene)]
      const plain = ({ scene: _, ...p }: Photo & { scene: boolean }): Photo => p
      const empty = !e.photos.length
      const shows = Math.min(MAX_PHOTOS, new Set((e.sections ?? []).map(x => x.key)).size)
      const own = empty ? [] : ordered.slice(0, Math.max(0, shows - e.photos.length))
      const rest = ordered.slice(own.length)
      if (own.length) {
        e.photos.push(...own.map(plain))
        await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
      }
      if (rest.length) {
        // Ranked as the sweep ranks it (gallery.ts orderAlbums), so the next sweep doesn't move its photos again.
        const st = JSON.parse(await readFile(join(root, 'engine-state/gallery', `${id}.json`), 'utf8').catch(() => '{}')) as Partial<GalleryState>
        const photos = rankGallery([...(g?.photos ?? []), ...rest.map((p, i) => waiting({ ...plain(p), kind: p.scene ? 'submersed' : 'other', ...(empty && p.scene && i === 0 ? { best: true } : {}) }))], cantTellOn(subjects, id), screenedAt(st.judged ?? []), looksOn(id), on(id))
        await mkdir(join(root, 'content/gallery'), { recursive: true })
        await writeFile(gfile, `${JSON.stringify(GallerySchema.parse({ id, photos, seen: g?.seen ?? 0, updatedAt: d.now().toISOString().slice(0, 10), ...(g?.builtAt ? { builtAt: g.builtAt } : {}) }), null, 2)}\n`)
      }
      report.added.push(`${id}: ${[own.length ? `${own.length} behind its photos` : '', rest.length ? `${rest.length} in its gallery` : ''].filter(Boolean).join(', ')}`)
    } catch (err) {
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`) // read again next run
    }
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
  return report
}
