import type { Photo } from '@aq/schema'
import { alterationNotice, creditLicenceUrl } from './gallery'
import { smallSrc } from './img'
import { licenceLabel } from './i18n'
import { isUnsplash } from './unsplash'

/**
 * A fish's, breed's or plant's whole album, for the photo viewer that opens over its page (scripts/album.ts): every
 * photo with what its credit needs, in the album's order, so a strip's thumb i opens photo i. The owner, 17 Nov 2026:
 * "opening a new page for it is unnecessary". Short keys, as a page carries up to 132 of them. `lu`: the licence's own
 * page, which the credit links (the gallery page's credits list did); `ai`, `x`, `un`: made by AI, altered (the notice
 * its credit adds), an Unsplash photo (credited as Unsplash asks, lib/unsplash.ts).
 */
export type AlbumPhoto = { u: string; t: string; w: number; h: number; c?: string; a: string; l?: string; lu?: string; s: string; b?: string; ai?: 1; x?: 1; un?: 1 }

export const albumPhotos = (photos: Photo[]): AlbumPhoto[] => photos.map(p => {
  const l = p.generated ? '' : licenceLabel(p.licence)
  const lu = l ? creditLicenceUrl(p.licence) : undefined
  return {
    u: p.url, t: smallSrc(p), w: p.width, h: p.height, ...(p.caption ? { c: p.caption } : {}), a: p.author, ...(l ? { l } : {}), ...(lu ? { lu } : {}),
    s: p.sourceUrl, ...(p.authorUrl ? { b: p.authorUrl } : {}), ...(p.generated ? { ai: 1 as const } : {}), ...(alterationNotice(p) ? { x: 1 as const } : {}),
    ...(isUnsplash(p.licence) ? { un: 1 as const } : {}),
  }
})

/** The album as the page carries it, in a <script type="application/json">: no "<" in it, so no caption can end the script. */
export const albumJson = (data: { name: string; ai: string; altered: string; photos: AlbumPhoto[] }) => JSON.stringify(data).replace(/</g, '\\u003c')
