import { PictureSet, unmarked, type Content, type Photo } from '@aq/schema'
import { cleanPhoto } from './home'

/**
 * The pictures one page shows, so it never shows one twice (the same photo in two files counts: PictureSet). The page
 * decides every picture in its frontmatter, in page order, and hands each card its photo: Astro renders sibling
 * components at the same time, so a card can't safely ask while it renders, and the credits list must match.
 */
export const pagePictures = (c: Pick<Content, 'pictureHashes'>) => new PictureSet(c.pictureHashes)

/** A fish's or plant's photos in the order its card tries them: the first without a dealer's mark, then the rest. */
export function photosOf(photos: Photo[]): Photo[] {
  photos = photos.filter(p => !p.generated)
  const first = cleanPhoto(photos)
  return first ? [first, ...photos.filter(p => p !== first)] : []
}

/**
 * A fish tile's photos (SpeciesCard: the fish lists, their data files, a guide's fish cards, the home page's): its page's
 * head, which the tile shows whole where no frame may fill with it (img.ts tileFrame), then photosOf's for a tile whose
 * page already shows the head. A tile and the page it opens show one photo (the chief of staff and the Design Lead, 13 Nov).
 * A photo carrying a source's banner is never a tile's next photo (the Design Lead, 13 Nov): where the head is shown
 * already and the page's only other photo has a banner, the tile has none. A banner head gives way to a person's pick
 * where the page has another photo (engine-state/_photo-head-picks.json); with none, it leads until one is found. Not for
 * what crops a photo as it is: a fish's round chip on an equipment page.
 */
export const tilePhotos = (photos: Photo[]): Photo[] => {
  const head = photos.find(p => !p.generated)
  return head ? [head, ...photosOf(photos).filter(p => p !== head && unmarked(p))] : []
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
export function distinctPhotos<P extends Photo>(c: Pick<Content, 'pictureHashes'>, photos: P[]): P[] {
  const pics = pagePictures(c)
  return photos.filter(p => pics.take([p]))
}
