import type { Photo } from './types'

export function isAllowedLicence(licence: string): boolean {
  const l = licence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/\b(nc|nd)\b/.test(l)) return false
  return /\bcc0\b/.test(l) || /\bcc by( sa)?\b/.test(l)
}

export const filterPhotos = (photos: Photo[]): Photo[] => photos.filter(p => isAllowedLicence(p.licence))
