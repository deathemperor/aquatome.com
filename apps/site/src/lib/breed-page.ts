import { linkTerms, type Content } from '@aq/schema'
import { slugify } from '@aq/schema/slug'
import { basedOn, breedGallery, breedsOf, careCard, type Breed } from './breeds'
import { GALLERY_MIN, GALLERY_STRIP } from './gallery'
import { isVietnamese, type Lang } from './i18n'
import { guideImages, guidesMentioning, linkTargets } from './mentions'
import { distinctPhotos, pagePictures, takeEach } from './pictures'

/**
 * A hybrid's parent as its page names it: the species page when there is one, else the name the sources give. `vi`: that
 * name is Vietnamese on another language's page (its translation left the parents out), marked as the site marks
 * Vietnamese names in translated text.
 */
export type BreedParent = { name: string; sci?: string; path?: string; certain: boolean; vi?: boolean }

/**
 * What a breed's page shows, put together once for the page (pages/ca/[breed].astro) and for the app's copy of it
 * (lib/app-page.ts): what it's a form of, a hybrid's parents, its data card, its gallery strip, its own text with the
 * pages it names linked, its lines and the guides that name it. Every picture once, in page order (lib/pictures.ts):
 * the photo, the gallery's first photos, the lines' cards.
 */
export function breedParts(lang: Lang, c: Content, b: Breed) {
  const key = `breed:${b.id}`
  const species = new Map(c.species.map(s => [s.id, s]))
  const parents: BreedParent[] = b.parents.map((p, i) => {
    // A parent the breed's sources name only by its scientific name in brackets is still that species.
    const sci = /\(([A-Z][a-z]+ [a-z]+)\)\s*$/.exec(p.name)?.[1]
    const s = species.get(p.species ?? (sci ? slugify(sci) : ''))
    if (s) return { name: s.t.name, sci: s.scientificName, path: `/vi/ca/${s.t.slug}/`, certain: p.certain }
    const name = b.t.parents?.[i] ?? ((lang !== 'vi' && isVietnamese(p.name) && sci) || p.name)
    return { name, certain: p.certain, ...(lang !== 'vi' && isVietnamese(name) ? { vi: true } : {}) }
  })
  const pics = pagePictures(c)
  pics.add(b.photos[0]?.url)
  const gallery = distinctPhotos(c, breedGallery(c, b))
  const strip = gallery.slice(0, GALLERY_STRIP).map(p => pics.take([p]) ?? null)
  const lines = breedsOf(lang, c, b.id)
  const linePhotos = takeEach(pics, lines, x => x.photos)
  // Its own text links the species, glossary terms and other pages it names, never itself.
  const body = b.t.body ? linkTerms(b.t.body, linkTargets(c).filter(t => t.key !== key), 'ml').html : ''
  const mentioning = guidesMentioning(c, key)
  const videoGuides = mentioning.filter(g => g.video)
  const videoPhotos = takeEach(pics, videoGuides, g => guideImages(c, g))
  return {
    key, parent: basedOn(c, b), parents, ...careCard(b), gallery, strip,
    // Its gallery page, once there are enough photos for one.
    galleryPath: gallery.length >= GALLERY_MIN ? `/vi/ca/${b.t.slug}/anh/` : undefined,
    lines, linePhotos, body, guides: mentioning.filter(g => !g.video), videoGuides, videoPhotos,
  }
}
