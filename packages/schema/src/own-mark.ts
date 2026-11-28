import { CREDIT_HOLD_REJECTION, isVersionRejection, photoAddressSet, photoKey, rejectedEntry, type PhotoRejection } from './photo-address'

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
export const retainedOwnMark = (url: string, entry: { retainedOwnMark?: unknown } | undefined) => {
  const kept = entry?.retainedOwnMark as { owner?: unknown; source?: unknown; sourceUrl?: unknown; by?: unknown; word?: unknown } | undefined
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

/** An approved shop mark waives only that watermark rejection, leaving other photo decisions in force. */
export function photoRejections(
  rejected: Record<string, string>,
  marks: Record<string, { retainedOwnMark?: unknown }> = {},
  heldVersion: (url: string, refusal: [string, string]) => boolean = () => false,
): PhotoRejection {
  const retained = photoAddressSet(Object.keys(marks).filter(url => retainedOwnMark(url, marks[url])))
  const active = Object.entries(rejected).filter(([url, why]) => !why.startsWith('watermark:') || !retained(url))
  const whole = active.filter(([, why]) => !isVersionRejection(why))
  const permanent = rejectedEntry(Object.fromEntries(whole.filter(([, why]) => !why.startsWith('watermark:') && why !== CREDIT_HOLD_REJECTION)))
  const anyWhole = rejectedEntry(Object.fromEntries(whole))
  const any = rejectedEntry(Object.fromEntries(active))
  return url => {
    const refusal = permanent(url) ?? anyWhole(url) ?? any(url)
    if (refusal && refusal[0] !== url && isVersionRejection(refusal[1]) && heldVersion(url, refusal) &&
        !photoKey(url)?.startsWith('commons/')) return undefined
    return refusal
  }
}
