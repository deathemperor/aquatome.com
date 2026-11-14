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
 * A photo with a cleared shop's own mark, kept: its screen record says the mark is the shop's own (`owner: 'source'`), the
 * shop is cleared, and the photo is the shop's, in its folder in our store and from one of its pages. Written by the image
 * step for a Glaser photo it can't clean, or by hand on the chief of staff's word for one photo at a time.
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
