import { thumbOf, type Photo } from '@aq/schema'

/** Commons hands back the original file as the "thumb" when it is no wider than the size asked for: its 500px size instead. */
function commonsThumb(p: Photo) {
  const u = new URL(p.url)
  const m = u.host === 'upload.wikimedia.org' && u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/)
  return m && p.width > 500 ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/500px-${m[2]}` : undefined
}

/** Card/thumbnail source: our recorded 480px thumb, Wikimedia's 500px size, else the full photo. */
export const smallSrc = (p: Photo) => (p.thumb !== p.url ? p.thumb : undefined) ?? (new URL(p.url).host.endsWith('wikimedia.org') ? thumbOf(p.url) ?? commonsThumb(p) : undefined) ?? p.url

/** The least a large copy gives on its short side: the app's large layouts need about 1,200 px. */
export const LARGE_SHORT_PX = 1200

/**
 * A photo's large copy for the app's large layouts, as the page format and the app index carry it, or nothing. A copy
 * under 1,200 px on its short side (a small original, a panorama cut to 2,400 long) is left out, so the app gives that
 * photo its smaller layout rather than stretching it.
 */
export const largeOf = (p: Photo | undefined): { large?: { url: string; width: number; height: number } } => {
  if (!p?.large) return {}
  const width = Math.round(p.large.width), height = Math.round(p.large.height)
  return Math.min(width, height) >= LARGE_SHORT_PX ? { large: { url: p.large.url, width, height } } : {}
}
