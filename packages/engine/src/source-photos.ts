import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { Photo, SourceId } from '@aq/schema'
import { parse } from 'node-html-parser'
import { ArchiveRefused } from './archive'
import type { PageImage } from './outline'
import { creditKind, type CreditKind } from './photo-credit'
import { ARTWORK } from './photos'

export type Media = { urlFor: (key: string) => string; put: (key: string, bytes: Uint8Array) => Promise<{ url: string; thumb?: string; width: number; height: number }> }
/** Layout dimensions are never a file size. Filename alternatives wait for retrieval before collapsing. */
/** `credits`: what the page prints under this address where it shows it again (the picture's credit, whichever showing carries it). */
type Picked = PageImage & { probe?: boolean; extra?: boolean; minWidth?: number; alternatives?: Picked[]; credits?: string[] }
/** At most four extra requests per page: newly eligible layout sizes and fallback addresses share this budget. */
const EXTRA_DOWNLOADS = 4
const THUMBNAIL = /\/(?:icons?|thumbs?|thumbnails?)\//i

const JUNK = /logo|icon|sprite|avatar|banner|badge|placeholder|gravatar|payment|flag|button|spinner|loader|emoji|pixel|tracking/i
/** QR codes for the page's own address (PlanetCatfish: quickchart.io/qr?…, /cache/qr/…). */
const QR = /\/qr(\/|\?|$)/i
const SCENERY = /habitat|biotope|locality|\bmap\b/i
/** Shop packshots (food, fertiliser, hardware): wrong as a species or plant photo. Articles drop shop product tiles instead (PageImage.product). */
export const PRODUCT = /fertili[sz]er|cuisine|\bfoods?\b|pellets?|wafers?|flakes?|\btabs?\b|\bcaves?\b|\bshells?\b|bottle|\bpack\b|\bkit\b|filter|heater|substrate|\b\d+(\.\d+)?\s?(ml|oz|g|kg|lb|gal)\b/i
const MIN_WIDTH = 600
/** Long slim fish (loaches, gar) photograph at ~2.6:1; banners are wider still. */
const okShape = (w: number, h: number) => h / w >= 0.25 && h / w <= 1.6
export const SOURCE_PHOTO_LICENCE = 'dùng với sự cho phép'

const file = (src: string) => decodeURIComponent(src.split(/[?#]/)[0]!.split('/').pop() ?? '')
export const dedupeKey = (src: string) => file(src).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/-(\d+x\d+|scaled)$/, '')
const words = (s: string) => s.toLowerCase().replace(/[-_.]+/g, ' ')

/**
 * An image wrapped in a link to another page of the same site is that page's card ("read next"), not a picture of this
 * one (the owner's report, 2026-11-10: arowanas and a corydoras on the platy guide, from The Spruce Pets' cards). A link to
 * the image's own file, to its attachment page or to another site (a photographer's) doesn't make it one.
 */
function linksElsewhere(link: string, pageUrl: string) {
  try {
    const to = new URL(link, pageUrl)
    const page = new URL(pageUrl)
    const path = (u: URL) => u.pathname.replace(/\/$/, '')
    return to.host === page.host && path(to) !== path(page) && !/\.(jpe?g|png|webp|avif|gif)$/i.test(to.pathname) && !/attachment/i.test(`${to.pathname}${to.search}`)
  } catch { return false }
}

/**
 * Best photos from a source page: real photos (not chrome), big enough, about the subject; the subject itself before scenery.
 * `take` (`mayTake`): photos we take no more are passed over before the page's `max` places are counted, so they hold
 * none, and one the page shows whose credit we'd take no more keeps its place.
 */
export function pickSourcePhotos(images: PageImage[], pageUrl: string, names: string[], max = 4, kind: 'subject' | 'guide' = 'subject', minWidth = MIN_WIDTH, take?: (img: Picked) => Take): Picked[] {
  const terms = [...new Set(names.flatMap(n => [n.toLowerCase(), ...n.toLowerCase().split(/\s+/).filter(w => w.length >= 4)]))]
  const seen = new Map<string, Picked>()
  const seenAlt = new Set<string>()
  const ranked: { img: Picked; score: number }[] = []
  const newlyEligible = (img: PageImage) => !img.width && !!img.displayWidth && img.displayWidth < minWidth
  // Preserve the old picker before considering images its layout-width filter used to discard.
  for (const img of [...images.filter(i => !newlyEligible(i)), ...images.filter(newlyEligible)]) {
    let src: string
    try { src = new URL(img.src, pageUrl).href } catch { continue }
    if (!/^https?:/.test(src) || /\.(svg|gif)(\?|$)/i.test(src) || JUNK.test(`${file(src)} ${img.alt}`) || QR.test(src)) continue
    if (img.link && linksElsewhere(img.link, pageUrl)) continue
    const thumbnailWidth = Number(file(src).match(/-(\d+)x\d+\.[a-z0-9]+$/i)?.[1])
    if ((newlyEligible(img) && THUMBNAIL.test(src)) || (thumbnailWidth && thumbnailWidth < minWidth)) continue
    if (img.width && img.width < minWidth) continue
    // The original picker rounded the layout height scaled to the chosen srcset width. Keep that exact pre-filter.
    const hintWidth = img.width ?? img.displayWidth
    const hintHeight = img.width ? img.height ?? (img.displayWidth && img.displayHeight ? Math.round(img.displayHeight * img.width / img.displayWidth) : undefined) : img.displayHeight
    if (hintWidth && hintHeight && !okShape(hintWidth, hintHeight)) continue
    if (kind === 'subject' && PRODUCT.test(`${file(src)} ${img.alt}`)) continue
    // A drawing, plate or stamp the source shows ("Liobagrus kingi: line drawing", "Pieter Bleeker's drawing of…"): not a photo of it.
    if (kind === 'subject' && ARTWORK.test(words(`${file(src)} ${img.alt}`))) continue
    if (kind === 'guide' && img.product) continue // a shop's product tile is an ad, not a picture of what the article says
    const picked: Picked = { ...img, src, minWidth, ...(!img.width ? { probe: true } : {}), ...(newlyEligible(img) ? { extra: true } : {}) }
    const key = dedupeKey(src)
    const caption = img.alt.toLowerCase().trim()
    const altKey = caption ? `${picked.extra ? 'extra' : 'normal'}:${caption}` : ''
    // Photos from pages of their own share captions ("Hoplisoma sterbai") without being copies.
    const duplicate = seen.get(key)
    if (duplicate) {
      const again = [duplicate, ...(duplicate.alternatives ?? [])].find(a => a.src === src)
      const credit = img.credit ?? img.author
      if (!again) (duplicate.alternatives ??= []).push(picked)
      else if (credit) (again.credits ??= []).push(credit)
      continue
    }
    if (altKey && !img.page && seenAlt.has(altKey)) continue
    if (altKey) seenAlt.add(altKey)
    const text = words(`${file(src)} ${img.alt}`)
    const hint = img.width ?? img.displayWidth
    const score = (terms.some(t => text.includes(t)) ? 2 : 0) + ((hint ?? 0) >= 1000 ? 0.5 : 0) - (SCENERY.test(img.alt) ? 1.5 : 0)
    seen.set(key, picked)
    ranked.push({ img: picked, score: score - (hint ? 0 : 0.25) })
  }
  // Judged once every copy of a photo is known: a photo held back under any of its addresses holds no place, and one the
  // page shows that we'd take no more keeps its own, even one the page lays out small, so the places left go to the rest
  // in rank order.
  const ordered = ranked.map((r, i) => ({ ...r, i })).sort((a, b) => b.score - a.score || a.i - b.i).map(r => ({ img: r.img, t: take?.(r.img) ?? 'yes' })).filter(r => r.t !== 'no')
  const placed = (r: { img: Picked; t: Take }) => !r.img.extra || r.t === 'shown'
  const normal = ordered.filter(placed)
  let free = max - normal.filter(r => r.t === 'shown').length
  return [...normal.filter(r => r.t === 'shown' || free-- > 0), ...ordered.filter(r => !placed(r))].map(r => r.img)
}

/**
 * Photos kept on pages of their own (ScotCat): the species page shows thumbnails, each linking to a page with the
 * full image and "© <photographer>". The first `max` photo pages are read (each is a request to the source).
 */
export async function linkedPhotos(html: string, pageUrl: string, photoPage: RegExp, get: (url: string) => Promise<{ html: string }>, max = 4): Promise<PageImage[]> {
  const pages = [...new Set(parse(html).querySelectorAll('a[href]').filter(a => a.querySelector('img')).flatMap(a => {
    try { return [new URL(a.getAttribute('href')!, pageUrl).href] } catch { return [] }
  }).filter(u => photoPage.test(u)))].slice(0, max)
  const out: PageImage[] = []
  for (const u of pages) {
    let page: string
    try { page = (await get(u)).html } catch (e) { if (e instanceof ArchiveRefused) throw e; console.warn(`photo page skipped ${u}: ${(e as Error).message}`); continue }
    const img = parse(page).querySelectorAll('img').filter(i => !/\.(gif|png)$|thumbnails\//i.test(i.getAttribute('src') ?? '')).sort((a, b) => Number(b.getAttribute('width') ?? 0) - Number(a.getAttribute('width') ?? 0))[0]
    if (!img?.getAttribute('src')) continue
    // The credit follows the image; the site's own "©2026 SCOTCAT.COM" footer is further down.
    const at = page.indexOf(img.getAttribute('src')!)
    const author = page.slice(at, at + 600).match(/(?:©|&copy;)(?:\s|&nbsp;|<[^>]+>)*([^<]+)/)?.[1]?.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    const width = Number(img.getAttribute('width')) || undefined
    const height = Number(img.getAttribute('height')) || undefined
    out.push({ src: new URL(img.getAttribute('src')!, u).href, alt: (img.getAttribute('alt') ?? '').replace(/\s*=\s*/, ': ').trim(), ...(width ? { displayWidth: width } : {}), ...(height ? { displayHeight: height } : {}), page: u, ...(author ? { author } : {}) })
  }
  return out
}

/**
 * A credit its source's permission record refuses (content/sources.json `permission.refusedCredits`: a picture agency is
 * never ours, whatever the source allows; the chief of staff, 2026-11-13), compared by its letters and digits alone, so
 * "Example Photo" and "example-photo" are one credit.
 */
export const refusedCredit = (credit: string | undefined, refused: readonly string[] | undefined) => !!credit && !!refused?.some(r => alnum(r) === alnum(credit))
export const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** What a source's permission record says of the credits under its photos (content/sources.json `permission`). */
export type CreditTerms = { refusedCredits?: readonly string[]; coveredCredits?: readonly CreditKind[] }
/** A source's own contributors: a person, or a one-word handle that may be one (the chief of staff, 2026-11-13: taken, as before). */
const CONTRIBUTORS: readonly CreditKind[] = ['person', 'unclear']

/**
 * Whether a source's permission covers a photo, by the credit printed with it (the line under it, or the photographer
 * its own photo page names, read with the photo: ScotCat's ©; no request of its own): 'yes'; 'never' for a refused credit
 * or a picture agency; 'not yet' for a business, an organisation or a person with an organisation the record doesn't
 * list in `coveredCredits` (the chief of staff, 2026-11-13: no new photo of those kinds until the source says its
 * permission covers them; the ones already on pages stay). A credit naming the source itself is its own picture.
 */
export function creditCover(credit: string | undefined, sourceName: string, terms: CreditTerms = {}): 'yes' | 'never' | 'not yet' {
  if (!credit) return 'yes'
  if (refusedCredit(credit, terms.refusedCredits)) return 'never'
  if (alnum(credit) === alnum(sourceName)) return 'yes'
  const kind = creditKind(credit, terms.refusedCredits)
  return kind === 'agency' ? 'never' : CONTRIBUTORS.includes(kind) || terms.coveredCredits?.includes(kind) ? 'yes' : 'not yet'
}

/** Where a source photo is kept in our media bucket: its address hashed, under the source's folder. */
export const photoKey = (source: SourceId, src: string) => `${source}/${createHash('sha256').update(src).digest('hex').slice(0, 16)}.webp`

/** Whether we take a picked photo: 'yes'; 'shown', only under an address the page already shows (`existing`); or 'no'. */
export type Take = 'yes' | 'shown' | 'no'

/**
 * A photo a source page still shows that we take no more ('no'): one taken off the site before
 * (engine-state/_photo-rejected.json: a mark, another species) under any of its addresses, or one whose credit is never
 * covered. One whose credit is not covered yet is 'shown': the page keeps it under the address it shows, and a page that
 * doesn't show it takes none of its copies. A credit is the picture's, whichever of its copies or showings carries it.
 * For `pickSourcePhotos` (Paraphanius mento, 2026-11-13: four photos taken off for a mark held its four places at every
 * read, so its six others were never tried and the page stayed empty) and the store.
 */
export const mayTake = (source: SourceId, sourceName: string, deps: CreditTerms & { media: Pick<Media, 'urlFor'>; blocked?: Record<string, string> }, existing: readonly { url: string }[] = []) => (img: Picked): Take => {
  const copies = [img, ...(img.alternatives ?? [])]
  const urls = copies.map(i => deps.media.urlFor(photoKey(source, i.src)))
  if (urls.some(u => deps.blocked?.[u])) return 'no'
  const cover = copies.flatMap(i => [i.credit ?? i.author, ...(i.credits ?? [])]).map(c => creditCover(c, sourceName, deps))
  if (cover.includes('never')) return 'no'
  if (!cover.includes('not yet')) return 'yes'
  return existing.some(p => urls.includes(p.url)) ? 'shown' : 'no'
}

/** A stored photo and the source heading it sat under (guide-sections.ts turns that into the guide's own heading). */
export type SourcePhoto = Photo & { heading?: string }

/**
 * Copy picked photos to our media bucket (once per image) and credit the source page. `blocked`: photos taken off the
 * site before (engine-state/_photo-rejected.json: watermarks, other species), skipped so a re-read doesn't bring them back.
 * `max` keeps the caller's photo limit while extras fill places the normal picks couldn't fill.
 */
export async function storeSourcePhotos(
  source: SourceId, sourceName: string, pageUrl: string, picked: Picked[],
  deps: CreditTerms & { bytes: (url: string, referer: string) => Promise<Uint8Array>; media: Media; size?: (bytes: Uint8Array) => Promise<{ width?: number; height?: number }>; blocked?: Record<string, string> }, existing: Photo[], max = Infinity,
): Promise<SourcePhoto[]> {
  const out: SourcePhoto[] = []
  let extra = 0
  const keyFor = (src: string) => photoKey(source, src)
  const take = mayTake(source, sourceName, deps, existing)
  const shows = (img: Picked) => existing.some(p => p.url === deps.media.urlFor(keyFor(img.src)))
  // A photo held back is known before any request: none is made for it, nor for a copy the page doesn't show of one it
  // keeps only as it shows it.
  const groups = picked.map(first => {
    const t = take(first), images = [first, ...(first.alternatives ?? [])]
    return { images: t === 'shown' ? images.filter(shows) : images, done: t === 'no', shown: t === 'shown' }
  })
  // All normal requests finish first. Fallbacks and newly eligible photos share the extra turn and its budget.
  for (const extraTurn of [false, true]) for (const group of groups) {
    if (group.done) continue
    for (const [i, img] of group.images.entries()) {
      if (out.length >= max) return out
      const extraRequest = !group.shown && (!!img.extra || i > 0) // a shown photo needs no request, and takes its place first
      if (extraRequest !== extraTurn) continue
      const key = keyFor(img.src)
      if (deps.blocked?.[deps.media.urlFor(key)]) { group.done = true; break }
      const known = existing.find(p => p.url === deps.media.urlFor(key))
      if (known) { out.push(img.heading ? { ...known, heading: img.heading } : known); group.done = true; break }
      if (extraRequest) {
        if (extra >= EXTRA_DOWNLOADS) continue
        extra++
      }
      let bytes: Uint8Array
      try {
        bytes = await deps.bytes(img.src, pageUrl)
      } catch (e) {
        if (e instanceof ArchiveRefused) throw e // the page waits for the archive, rather than losing its pictures
        console.warn(`photo skipped ${img.src}: ${(e as Error).message}`) // one unreachable image doesn't fail the page
        continue
      }
      const { width = 0, height = 0 } = await (deps.size ?? (b => sharp(b).metadata()))(bytes).catch(() => ({ width: 0, height: 0 }))
      if (width < (img.minWidth ?? MIN_WIDTH) || !okShape(width, height)) continue
      const stored = await deps.media.put(key, bytes) // storage failures (token, bucket) fail the page so it is retried
      out.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: img.author ? `${img.author} / ${sourceName}` : sourceName, sourceUrl: pageUrl, ...(img.alt ? { caption: img.alt.slice(0, 200) } : {}), source, ...(img.heading ? { heading: img.heading } : {}) })
      group.done = true
      break
    }
  }
  return out
}
