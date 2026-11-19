import type { Content, Photo } from '@aq/schema'
import { breedGallery, type Breed } from './breeds'
import { GALLERY_MIN } from './gallery'
import { distinctPhotos } from './pictures'

/**
 * The one rule for a fish's or a plant's album (the chief of staff, 14 Nov 2026): the photos the viewer over its page
 * steps through (GalleryStrip.astro, scripts/album.ts), each picture once (a gallery can keep two files of one photo), a
 * species' or a plant's gallery, a breed's own photos after its first and then its gallery. It counts as an album when
 * it holds GALLERY_MIN pictures. The fish and plant pages' strips, their "Xem tất cả" and the app's gallery all read it
 * here, so they can't count differently again: on 14 Nov the sitemap counted a plant's 6 files of 5 pictures and listed
 * a photo page the build never made. The album had a page of its own until 18 Nov (the owner, 17 Nov: "opening a new
 * page for it is unnecessary"); its addresses forward to the fish's or plant's page (worker/paths.ts galleryParent).
 */
type Albums = Pick<Content, 'galleries' | 'pictureHashes'>
export function albumOf(c: Albums, kind: 'breeds', x: Breed): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'plants', x: { id: string }): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'breeds' | 'plants', x: Breed | { id: string }): Photo[] {
  return distinctPhotos(c, kind === 'breeds' ? breedGallery(c, x as Breed) : (c.galleries[x.id] ?? []))
}

/** Whether an album (albumOf) holds enough pictures to show as one. */
export const hasAlbum = (album: readonly Photo[]) => album.length >= GALLERY_MIN
