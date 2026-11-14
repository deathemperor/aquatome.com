import type { Content, Photo } from '@aq/schema'
import { breedGallery, type Breed } from './breeds'
import { GALLERY_MIN } from './gallery'
import { distinctPhotos } from './pictures'

/**
 * The one rule for a fish's or a plant's photo page (the chief of staff, 14 Nov 2026). Its album: the photos it shows,
 * each picture once (a gallery can keep two files of one photo), a species' or a plant's gallery, a breed's own photos
 * after its first and then its gallery. The page is built when the album holds GALLERY_MIN pictures. The photo pages
 * (pages/ca/[slug]/anh.astro, pages/cay/[slug]/anh.astro), the fish and plant pages' strips and links to them, the
 * sitemap and the renamed pages' redirects all read it here, so they can't count differently again: on 14 Nov the sitemap
 * counted a plant's 6 files of 5 pictures and listed a photo page the build never made.
 */
type Albums = Pick<Content, 'galleries' | 'pictureHashes'>
export function albumOf(c: Albums, kind: 'breeds', x: Breed): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'plants', x: { id: string }): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'breeds' | 'plants', x: Breed | { id: string }): Photo[] {
  return distinctPhotos(c, kind === 'breeds' ? breedGallery(c, x as Breed) : (c.galleries[x.id] ?? []))
}

/** Whether an album (albumOf) has its photo page. */
export const hasPhotoPage = (album: readonly Photo[]) => album.length >= GALLERY_MIN
