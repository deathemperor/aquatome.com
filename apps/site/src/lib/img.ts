import { subjectFrame, thumbOf, type Photo } from '@aq/schema'

/** Commons hands back the original file as the "thumb" when it is no wider than the size asked for: its 500px size instead. */
function commonsThumb(p: Photo) {
  const u = new URL(p.url)
  const m = u.host === 'upload.wikimedia.org' && u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/)
  return m && p.width > 500 ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/500px-${m[2]}` : undefined
}

/** Card/thumbnail source: our recorded 480px thumb, Wikimedia's 500px size, else the full photo. */
export const smallSrc = (p: Photo) => (p.thumb !== p.url ? p.thumb : undefined) ?? (new URL(p.url).host.endsWith('wikimedia.org') ? thumbOf(p.url) ?? commonsThumb(p) : undefined) ?? p.url

/**
 * Whether `address` is the photo itself or a copy of it only resized, never reframed: what may carry the photo's box (the
 * fish's place, as fractions). Our 480-px copy and Wikimedia's sizes (thumbOf, the 500px size), or an Unsplash size
 * scaled to fit (fit=max, no height or crop). Any other copy is another framing, and gets no box.
 */
export function resizeOf(p: Photo, address: string): boolean {
  if (address === p.url || address === thumbOf(p.url) || address === commonsThumb(p)) return true
  const a = new URL(address), b = new URL(p.url)
  return a.host === 'images.unsplash.com' && b.host === a.host && a.pathname === b.pathname && a.searchParams.get('fit') === 'max' && !a.searchParams.has('h') && !a.searchParams.has('crop')
}
/** Whether a larger copy is the same picture: its shape within 1% of the photo's (any more is another framing). */
export const sameShape = (p: { width: number; height: number }, big: { width: number; height: number }) =>
  Math.abs(big.width / big.height / (p.width / p.height) - 1) <= 0.01 + 1e-9

/**
 * How a fish's frame of `ratio` (width over height) shows `p` by the fish's box (subjectFrame; the loader gives a box only
 * with its switch on, SUBJECT_FRAMES): `whole`, the photo whole; `pos`, the crop moved onto the fish, as CSS
 * object-position. Neither: today's centred crop (no box, or the centred crop keeps the fish).
 */
export function fishFrame(p: Photo, ratio: number): { pos?: string; whole?: true } {
  const f = subjectFrame(p, ratio)
  if (f.fit === 'whole') return { whole: true }
  const pct = (v: number) => `${+(v * 100).toFixed(2)}%`
  return f.x === 0.5 && f.y === 0.5 ? {} : { pos: `${pct(f.x)} ${pct(f.y)}` }
}

/** A fish's 4:3 tile (SpeciesCard, and the cards the fish list's script builds): framed only on a copy that is the same picture. */
export const tileFrame = (p: Photo) => (resizeOf(p, smallSrc(p)) ? fishFrame(p, 4 / 3) : {})
