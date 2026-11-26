import type { Photo } from './types'

export function isAllowedLicence(licence: string): boolean {
  const l = licence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/\b(nc|nd)\b/.test(l)) return false
  // Unsplash License: free to use, commercial too (photos hot-linked and credited, per Unsplash's API terms).
  return /\bcc0\b/.test(l) || /\bcc by( sa)?\b/.test(l) || /^(public domain|pd)\b/.test(l) || l === 'unsplash license'
}

export const filterPhotos = (photos: Photo[]): Photo[] => photos.filter(p => isAllowedLicence(p.licence))

const words = (licence: string) => licence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * A non-commercial photo, by its own licence text ("CC BY-NC 4.0", "Attribution-NonCommercial"): the mark that finds
 * every one of them, in content or a candidate, so they all come off in one step. isAllowedLicence refuses each; only
 * isInatNonCommercial's come in, behind IMAGE_SWITCHES.inatNonCommercial.
 */
export const isNonCommercial = (licence: string): boolean => /\bnc\b|\bnon ?commercial\b/.test(words(licence))

/**
 * A page's own photos as the site shows them: a non-commercial one only as its head with no other real photo, where it's
 * the one way to show that fish (the chief of staff's rule, 17 Nov). The loader (load.ts) and the content stats read it.
 */
export const ncAlone = <P extends { licence?: string; generated?: unknown }>(xs: P[]): P[] => xs.filter((p, i) => !isNonCommercial(p.licence ?? '') || (i === 0 && xs.every((x, j) => j === 0 || x.generated)))

/**
 * An iNaturalist photo under CC BY-NC or CC BY-NC-SA, any version: the licences the owner said yes to (10 Nov), behind
 * IMAGE_SWITCHES.inatNonCommercial: in albums, and as a page's head where it's the one way to show that fish (the chief of
 * staff's rule, 17 Nov). Never ND, all rights reserved or no licence. Known by its licence text and its page on
 * iNaturalist, which our copy keeps (mirror-photos.ts moves only its address); a source's photo shows by its permission.
 */
export const isInatNonCommercial = (p: Pick<Photo, 'licence' | 'sourceUrl' | 'source'>): boolean =>
  !p.source && /^cc by nc( sa)?( \d+( \d+)?)?$/.test(words(p.licence)) && /^https:\/\/www\.inaturalist\.org\/photos\/\d+$/.test(p.sourceUrl)
