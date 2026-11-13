import { PictureSet, type Content, type Photo } from '@aq/schema'
import { cleanPhoto } from './home'

/**
 * The pictures one page shows, so it never shows one twice (the same photo in two files counts: PictureSet). The page
 * decides every picture in its frontmatter, in page order, and hands each card its photo: Astro renders sibling
 * components at the same time, so a card can't safely ask while it renders, and the credits list must match.
 */
export const pagePictures = (c: Content) => new PictureSet(c.pictureHashes)

/** A fish's or plant's photos in the order its card tries them: the first without a dealer's mark, then the rest. */
export function photosOf(photos: Photo[]): Photo[] {
  photos = photos.filter(p => !p.generated)
  const first = cleanPhoto(photos)
  return first ? [first, ...photos.filter(p => p !== first)] : []
}

/**
 * A fish tile's photos (SpeciesCard: the fish lists, their data files, a guide's fish cards, the home page's): photosOf,
 * else, where the large cards refuse every photo (photoFitsCard), the page's head, which the tile shows whole (img.ts
 * tileFrame). A tile never says "no photo yet" while its page shows one (the chief of staff, 13 Nov). Not for what crops a
 * photo as it is or places it at its own shape: a fish's round chip on an equipment page, a guide's fish section.
 */
export const tilePhotos = (photos: Photo[]): Photo[] => {
  const tried = photosOf(photos)
  return tried.length ? tried : photos.filter(p => !p.generated).slice(0, 1)
}

/** Each item's picture, in order: the first of its photos the page doesn't show yet, else none (null). */
export const takeEach = <T>(pics: PictureSet, items: T[], photos: (x: T) => (Photo | undefined)[]): (Photo | null)[] =>
  items.map(x => pics.take(photos(x)) ?? null)

const lists = new WeakMap<Content, Map<string, (Photo | null)[]>>()
/**
 * A list's card pictures, chosen once for the whole list in its order, none twice and none of `above` (what its page
 * shows before the list): the list's first page, its numbered pages and its data file (the cards the browser builds for
 * "Xem thêm" or a filter) read the same ones, so a card is the same wherever it is built, and the cards the browser adds
 * repeat nothing above them. `list`: the list's address under /vi/ ("ca", "nhom/catfish"); `items`, the list itself.
 */
export function listPictures<T>(c: Content, list: string, items: T[], photos: (x: T) => (Photo | undefined)[], above: (Photo | null | undefined)[] = []): (Photo | null)[] {
  const known = lists.get(c) ?? lists.set(c, new Map()).get(c)!
  let chosen = known.get(list)
  if (!chosen) {
    const pics = pagePictures(c)
    for (const p of above) pics.add(p?.url)
    known.set(list, chosen = takeEach(pics, items, photos))
  }
  return chosen
}

/**
 * A fish page's photo column (GalleryStrip.astro `more`): the gallery's photos after its strip, in order, each one the page
 * doesn't show yet, else null so each keeps its place (its #aN on the gallery page), until the column holds `most`
 * thumbnails with the strip's.
 */
export function morePhotos(pics: PictureSet, gallery: Photo[], strip: (Photo | null)[], most: number): (Photo | null)[] {
  const more: (Photo | null)[] = []
  for (const p of gallery.slice(strip.length)) {
    if (strip.filter(Boolean).length + more.filter(Boolean).length >= most) break
    more.push(pics.take([p]) ?? null)
  }
  return more
}

/** A grid of fish cards' pictures, none twice (a fish and its colour form often share a photo): what SpeciesGrid shows. */
export const gridPhotos = (c: Content, species: { photos: Photo[] }[], pics = pagePictures(c)) => takeEach(pics, species, s => tilePhotos(s.photos))

/** Photos with each picture once (a gallery that kept two files of one photo): the gallery page and its strip alike. */
export function distinctPhotos<P extends Photo>(c: Content, photos: P[]): P[] {
  const pics = pagePictures(c)
  return photos.filter(p => pics.take([p]))
}
