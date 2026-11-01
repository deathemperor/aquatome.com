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
  const first = cleanPhoto(photos)
  return first ? [first, ...photos.filter(p => p !== first)] : []
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

/** A grid of fish cards' pictures, none twice (a fish and its colour form often share a photo): what SpeciesGrid shows. */
export const gridPhotos = (c: Content, species: { photos: Photo[] }[], pics = pagePictures(c)) => takeEach(pics, species, s => photosOf(s.photos))

/** Photos with each picture once (a gallery that kept two files of one photo): the gallery page and its strip alike. */
export function distinctPhotos<P extends Photo>(c: Content, photos: P[]): P[] {
  const pics = pagePictures(c)
  return photos.filter(p => pics.take([p]))
}
