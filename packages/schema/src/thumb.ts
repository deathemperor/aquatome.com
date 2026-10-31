export const MEDIA_HOST = 'media.aquatome.com'
export const THUMB_WIDTH = 480
/**
 * Hosts that set third-party cookies on the photos they serve (Wikimedia's WMF-Uniq and GeoIP; iNaturalist's): a page
 * showing one fails Lighthouse's best practices. `pnpm engine mirror-photos` copies their photos to MEDIA_HOST.
 */
export const COOKIE_PHOTO_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org', 'inaturalist-open-data.s3.amazonaws.com', 'static.inaturalist.org']
export const setsCookies = (url: string) => COOKIE_PHOTO_HOSTS.includes(new URL(url).host)

/**
 * Small version of a photo for cards and thumbnails: our R2 photos have a `-480.webp` sibling (made on upload,
 * backfilled by `pnpm engine thumbs`); Wikimedia thumbs come in standard widths. Undefined when there is none.
 */
export function thumbOf(url: string): string | undefined {
  const u = new URL(url)
  if (u.host === MEDIA_HOST && u.pathname.endsWith('.webp') && !u.pathname.endsWith(`-${THUMB_WIDTH}.webp`)) return url.replace(/\.webp$/, `-${THUMB_WIDTH}.webp`)
  if (u.host.endsWith('wikimedia.org') && /\/\d+px-[^/]+$/.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/\d+px-([^/]+)$/, '/500px-$1')
    return u.href
  }
  return undefined
}
