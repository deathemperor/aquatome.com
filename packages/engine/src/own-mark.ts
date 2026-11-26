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
 * for a Glaser photo it can't clean, by the return step for a listed one (shop-return.ts), or by hand on the chief of
 * staff's word for one photo at a time. A record says who wrote it (`by`); one a person writes from 19 Nov also says on
 * whose word and on what date (`word`), or keeps nothing (the chief of staff, 19 Nov).
 */
export const retainedOwnMark = (url: string, entry: Pick<CompactScreen, 'retainedOwnMark'> | undefined) => {
  const kept = entry?.retainedOwnMark
  return !!kept && kept.owner === 'source' && isOwnMarkShop(kept.source) && typeof kept.sourceUrl === 'string'
    && url.startsWith(`https://media.aquatome.com/${kept.source}/`) && OWN_MARK_SHOPS[kept.source].test(kept.sourceUrl)
    && keptAuthorOk(kept)
}

/** Who wrote a kept record (the chief of staff, 19 Nov): the watermark screen, the return step, the image step, or a person. */
export const KEPT_BY = ['screen', 'return', 'image', 'person'] as const
/** On whose word a person writes one. */
export const KEPT_WORD = ['owner', 'chief of staff'] as const
/**
 * Whether a kept record says who wrote it as it must: one from before 19 Nov says neither who nor on whose word, and
 * keeps; any other names a known writer, and a person's names whose word and the date. A record that says either in any
 * other way keeps nothing. The raw file is read as well as the compacted one (keptMarks), so this is checked here.
 */
export const keptAuthorOk = (k: { by?: unknown; word?: unknown }): boolean => {
  if (k.by === undefined) return k.word === undefined
  if (!(KEPT_BY as readonly unknown[]).includes(k.by)) return false
  if (k.word === undefined) return k.by !== 'person'
  const w = k.word as { who?: unknown; date?: unknown } | null
  return !!w && typeof w === 'object' && (KEPT_WORD as readonly unknown[]).includes(w.who) && typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date)
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
 * How many of a screened shop's kept-mark photos a page shows, its own photos and its album together (the chief of staff,
 * 16 Nov, and 19 Nov: the two together): three at most, after every clean one; six where the page has no clean photo at
 * all, enough for its album row. A photo still waiting for the photo check, and a non-commercial one, count as clean.
 */
export const KEPT_IN_ALBUM = 3
export const KEPT_IN_ALBUM_ALONE = 6

type Pic = { url: string; generated?: unknown }
/** A screened shop's photo (SCREENED_OWN_MARK) whose mark is kept (`kept`), not an AI picture. */
const shopKept = (kept: (url: string) => boolean) => (p: Pic) => !p.generated && kept(p.url) && SCREENED_OWN_MARK.some(s => p.url.startsWith(folder(s)))
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
