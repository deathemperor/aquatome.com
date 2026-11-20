import { unmarked, type Content, type Photo } from '@aq/schema'
import { breedGallery, type Breed } from './breeds'
import { GALLERY_MIN } from './gallery'
import { distinctPhotos } from './pictures'

/**
 * The one rule for a fish's or a plant's album (the chief of staff, 14 Nov 2026): the photos the viewer over its page
 * steps through (GalleryStrip.astro, scripts/album.ts), each picture once (a gallery can keep two files of one photo), a
 * species' or a plant's gallery, a breed's own photos after its first and then its gallery. The strip omits the lead while
 * retaining each photo's position in the viewer. The standalone album page was retired on 18 Nov.
 */
type Albums = Pick<Content, 'galleries' | 'pictureHashes'>
export function albumOf(c: Albums, kind: 'breeds', x: Breed): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'plants', x: { id: string }): Photo[]
export function albumOf(c: Albums, kind: 'species' | 'breeds' | 'plants', x: Breed | { id: string }): Photo[] {
  const photos = kind === 'breeds' ? breedGallery(c, x as Breed) : (c.galleries[x.id] ?? [])
  return distinctPhotos(c, [...photos.filter(unmarked), ...photos.filter(p => !unmarked(p))])
}

/** Whether an album (albumOf) holds enough pictures to show as one. */
export const hasAlbum = (album: readonly Photo[]) => album.length >= GALLERY_MIN
