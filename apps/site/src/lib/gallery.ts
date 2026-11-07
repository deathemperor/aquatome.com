import type { Photo, SourceId, SourceInfo } from '@aq/schema'
import type { T } from './i18n'

/** A licence's deed page, for structured data (Google Images shows "Licensable" with it). */
export function licenceUrl(licence: string): string | undefined {
  const l = licence.toLowerCase()
  if (/cc0/.test(l)) return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (/public domain/.test(l)) return 'https://creativecommons.org/publicdomain/mark/1.0/'
  if (/unsplash/.test(l)) return 'https://unsplash.com/license'
  const v = l.match(/\d\.\d/)?.[0] ?? '4.0'
  if (/by[- ]sa/.test(l)) return `https://creativecommons.org/licenses/by-sa/${v}/`
  if (/\bby\b/.test(l)) return `https://creativecommons.org/licenses/by/${v}/`
  return undefined
}
/** A gallery page needs enough photos to be worth a page of its own. */
export const GALLERY_MIN = 6
/** Photos shown in the strip on the species page. */
export const GALLERY_STRIP = 8
/** Thumbnails at most in a fish page's photo column on a tall computer screen: the strip's, then the gallery's next ones. */
export const GALLERY_COLUMN = 40

/** Photo sites by the address of a photo's own page. */
const SITES: [RegExp, string][] = [[/(^|\.)inaturalist\.org$/, 'iNaturalist'], [/(^|\.)unsplash\.com$/, 'Unsplash'], [/(^|\.)flickr\.com$/, 'Flickr'], [/(^|\.)gbif\.org$/, 'GBIF'], [/(^|\.)wikimedia\.org$/, 'Wikimedia Commons']]

/** Where a gallery's photos come from, each once in first-seen order: the photo site, or the source that let us use them. */
export function photoFrom(photos: Photo[], sources: Partial<Record<SourceId, SourceInfo>>): string[] {
  return [...new Set(photos.map(p => {
    if (p.source) return sources[p.source]?.name ?? p.source
    const host = new URL(p.sourceUrl).host
    return SITES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, '')
  }))]
}

/**
 * The gallery page's line about its photos: how many, from which sites, and that they are under open licences when all
 * are (a gallery with photos a source let us use names the source, and no more). The app's copy of the gallery carries
 * it too.
 */
export function galleryNote(t: T, photos: Photo[], sources: Partial<Record<SourceId, SourceInfo>>): string {
  const from = photoFrom(photos, sources).join(', ').replace(/, ([^,]*)$/, ` ${t('và')} $1`)
  const open = photos.every(p => !p.source)
  return t(open ? '{n} ảnh từ {from}, giấy phép mở.' : '{n} ảnh từ {from}.', { n: photos.length, from })
}
