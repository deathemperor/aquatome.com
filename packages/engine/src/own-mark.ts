import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompactScreen } from './photo-observations'

/**
 * The shops whose own mark on their own photos the owner allows: Aquarium Glaser's logo first (the chief of staff,
 * 2026-11-10), then every cleared shop (15 Nov). Cleared: a source the engine reads as a shop or importer (sources.ts
 * `shop`), whose photos the owner granted (content/sources.json), and whose lettering on the photo is its own: its name,
 * its logo, its own photographer's credit. A photographer's or an archive's mark on another source's photo is never
 * covered. Each shop's photos sit in its own folder in our store, and its pages on its own host. A test holds this list to
 * the sources marked `shop`, so a new shop is weighed here before its marks are kept.
 */
export const OWN_MARK_SHOPS = {
  glaser: /^https?:\/\/(www\.)?aquariumglaser\.de\//,
  bwaquatics: /^https?:\/\/(www\.)?bwaquatics\.com\//,
} as const
export type OwnMarkShop = keyof typeof OWN_MARK_SHOPS
export const isOwnMarkShop = (s: unknown): s is OwnMarkShop => typeof s === 'string' && Object.hasOwn(OWN_MARK_SHOPS, s)
/** Whether an address is one of a cleared shop's own pages. */
export const ownMarkSite = (sourceUrl: string) => Object.values(OWN_MARK_SHOPS).some(host => host.test(sourceUrl))

/**
 * The shops whose own marks the watermark screen judges itself (watermarks.ts): Aquarium Glaser's (the chief of staff,
 * 16 Nov). On its photo from its own pages, the shop's own lettering (its banner, its name, its logo, its web address) is
 * a mark the screen records and keeps, never a reason for the never-again list; anyone else's mark is refused as before.
 * BW Aquatics' kept marks still need their record by hand, photo by photo.
 */
export const SCREENED_OWN_MARK: readonly OwnMarkShop[] = ['glaser']
const folder = (shop: OwnMarkShop) => `https://media.aquatome.com/${shop}/`
/** The screened shop whose photo this is: in its folder in our store and taken from one of its own pages; else none. */
export const screenedShop = (url: string, sourceUrl: string | undefined): OwnMarkShop | undefined =>
  SCREENED_OWN_MARK.find(s => url.startsWith(folder(s)) && typeof sourceUrl === 'string' && OWN_MARK_SHOPS[s].test(sourceUrl))

/**
 * A photo with a cleared shop's own mark, kept: its screen record says the mark is the shop's own (`owner: 'source'`), the
 * shop is cleared, and the photo is the shop's, in its folder in our store and from one of its pages. Written by the
 * watermark screen for a screened shop's photo whose every mark is the shop's own (SCREENED_OWN_MARK), by the image step
 * for a Glaser photo it can't clean, or by hand on the chief of staff's word for one photo at a time.
 */
export const retainedOwnMark = (url: string, entry: CompactScreen | undefined) => {
  const kept = entry?.retainedOwnMark
  return !!kept && kept.owner === 'source' && isOwnMarkShop(kept.source) && typeof kept.sourceUrl === 'string'
    && url.startsWith(`https://media.aquatome.com/${kept.source}/`) && OWN_MARK_SHOPS[kept.source].test(kept.sourceUrl)
}

/** The kept-mark photos (engine-state/_photo-watermarks.json), which an album puts after its unmarked ones (gallery.ts rankGallery). */
export async function keptMarks(root: string): Promise<(url: string) => boolean> {
  const marks = JSON.parse(await readFile(join(root, 'engine-state', '_photo-watermarks.json'), 'utf8').catch(() => '{}')) as Record<string, CompactScreen>
  return url => retainedOwnMark(url, marks[url])
}

/**
 * A page's own photos with the kept-mark ones (`kept`) after every other real photo and before the AI pictures that
 * follow it; the rest as they were. Run after any step that orders a page's photos (the photo check's, the sweep's), so a
 * kept-mark photo goes after the unmarked ones whatever their naming class (the chief of staff, 15 Nov). Where it is the
 * only real photo, it stays first.
 */
export function keptLast<P extends { url: string; generated?: unknown }>(photos: P[], kept: (url: string) => boolean): P[] {
  const marked = photos.filter(p => !p.generated && kept(p.url))
  if (!marked.length) return photos
  const rest = photos.filter(p => !marked.includes(p))
  const at = rest.reduce((end, p, i) => (p.generated ? end : i + 1), 0)
  return [...rest.slice(0, at), ...marked, ...rest.slice(at)]
}

/**
 * How many of a screened shop's kept-mark photos an album shows (the chief of staff, 16 Nov): three at most, after every
 * clean one; six where its page has no clean photo at all, enough for its album row.
 */
export const KEPT_IN_ALBUM = 3
export const KEPT_IN_ALBUM_ALONE = 6

/**
 * An album with no more of a screened shop's kept-mark photos (SCREENED_OWN_MARK) than it shows: KEPT_IN_ALBUM, or
 * KEPT_IN_ALBUM_ALONE where no real photo without a kept mark is on the page (`own`) or in the album. The first in the
 * album's order stay. The rest (`out`) leave the album file only: they stay in our store and in engine state, and off
 * the never-again list.
 */
export function keptCap<P extends { url: string; generated?: unknown }>(album: P[], own: { url: string; generated?: unknown }[], kept: (url: string) => boolean): { album: P[]; out: P[] } {
  const shops = (p: P) => !p.generated && kept(p.url) && SCREENED_OWN_MARK.some(s => p.url.startsWith(folder(s)))
  const clean = [...own, ...album].some(p => !p.generated && !kept(p.url))
  const out = album.filter(shops).slice(clean ? KEPT_IN_ALBUM : KEPT_IN_ALBUM_ALONE)
  return { album: out.length ? album.filter(p => !out.includes(p)) : album, out }
}
