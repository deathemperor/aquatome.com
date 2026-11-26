import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompactScreen } from './photo-observations'

import { retainedOwnMark, SCREENED_OWN_MARK } from '@aq/schema'
export { KEPT_BY, KEPT_WORD, OWN_MARK_SHOPS, isOwnMarkShop, keptAuthorOk, ownMarkSite, retainedOwnMark, SCREENED_OWN_MARK, screenedShop, type OwnMarkShop } from '@aq/schema'

/** The kept-mark photos (engine-state/_photo-watermarks.json), which an album puts after its unmarked ones (gallery.ts rankGallery). */
export async function keptMarks(root: string): Promise<(url: string) => boolean> {
  const raw = await readFile(join(root, 'engine-state', '_photo-watermarks.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{}'
    throw error
  })
  const marks = JSON.parse(raw) as Record<string, CompactScreen>
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
 * How many of a screened shop's kept-mark photos a page shows, its own photos and its album together (the chief of staff,
 * 16 Nov, and 19 Nov: the two together): three at most, after every clean one; six where the page has no clean photo at
 * all, enough for its album row. A photo still waiting for the photo check, and a non-commercial one, count as clean.
 */
export const KEPT_IN_ALBUM = 3
export const KEPT_IN_ALBUM_ALONE = 6

type Pic = { url: string; generated?: unknown }
/** A screened shop's photo (SCREENED_OWN_MARK) whose mark is kept (`kept`), not an AI picture. */
const shopKept = (kept: (url: string) => boolean) => (p: Pic) => !p.generated && kept(p.url) && SCREENED_OWN_MARK.some(s => p.url.startsWith(`https://media.aquatome.com/${s}/`))
/** The page's limit: KEPT_IN_ALBUM, or KEPT_IN_ALBUM_ALONE where no real photo without a kept mark is on the page or in its album. */
const keptLimit = (own: Pic[], album: Pic[], kept: (url: string) => boolean) =>
  [...own, ...album].some(p => !p.generated && !kept(p.url)) ? KEPT_IN_ALBUM : KEPT_IN_ALBUM_ALONE

/**
 * A page's own photos with no more of a screened shop's kept-mark photos than the page shows (keptLimit, its album read
 * for whether the page has a clean photo): the first in the page's order stay, so a kept-mark photo that is the page's
 * head stays. The rest (`out`) leave the page's file only, as keptCap's do.
 */
export function keptCapOwn<P extends Pic>(own: P[], album: Pic[], kept: (url: string) => boolean): { own: P[]; out: P[] } {
  const out = own.filter(shopKept(kept)).slice(keptLimit(own, album, kept))
  return { own: out.length ? own.filter(p => !out.includes(p)) : own, out }
}

/**
 * An album with no more of a screened shop's kept-mark photos than its page has room left for: the page's limit
 * (keptLimit), less those among the page's own photos (`own`), which the page shows first. The first in the album's order
 * stay. The rest (`out`) leave the album file only: they stay in our store and in engine state, and off the never-again
 * list.
 */
export function keptCap<P extends Pic>(album: P[], own: Pic[], kept: (url: string) => boolean): { album: P[]; out: P[] } {
  const room = Math.max(0, keptLimit(own, album, kept) - own.filter(shopKept(kept)).length)
  const out = album.filter(shopKept(kept)).slice(room)
  return { album: out.length ? album.filter(p => !out.includes(p)) : album, out }
}
