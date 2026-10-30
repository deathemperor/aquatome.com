import { thumbOf, type Photo } from '@aq/schema'

/** Commons hands back the original file as the "thumb" when it is no wider than the size asked for: its 500px size instead. */
function commonsThumb(p: Photo) {
  const u = new URL(p.url)
  const m = u.host === 'upload.wikimedia.org' && u.pathname.match(/^\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/)
  return m && p.width > 500 ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/500px-${m[2]}` : undefined
}

/** Card/thumbnail source: our recorded 480px thumb, Wikimedia's 500px size, else the full photo. */
export const smallSrc = (p: Photo) => (p.thumb !== p.url ? p.thumb : undefined) ?? (new URL(p.url).host.endsWith('wikimedia.org') ? thumbOf(p.url) ?? commonsThumb(p) : undefined) ?? p.url
