import { linkTerms, type Content } from '@aq/schema'
import { slugify } from '@aq/schema/slug'
import { basedOn, breedsOf, careCard, type Breed } from './breeds'
import { GALLERY_STRIP } from './gallery'
import { albumOf, hasPhotoPage } from './photo-page'
import { isVietnamese, type Lang } from './i18n'
import { guideImages, guidesMentioning, mentionIndex } from './mentions'
import { pagePictures, takeEach } from './pictures'
import { sciBeside } from './sci'

/**
 * A hybrid's parent as its page names it: the species page when there is one, else the name the sources give. `vi`: that
 * name is Vietnamese on another language's page (its translation left the parents out), marked as the site marks
 * Vietnamese names in translated text.
 */
export type BreedParent = { name: string; sci?: string; path?: string; certain: boolean; vi?: boolean }

/**
 * A hybrid's parents: the species' own name and page when the handbook has it, with its scientific name beside the name
 * only when the name doesn't say it (lib/sci.ts); otherwise the name the sources give.
 */
export function breedParents(lang: Lang, c: Pick<Content, 'species'>, b: Breed): BreedParent[] {
  const species = new Map(c.species.map(s => [s.id, s]))
  return b.parents.map((p, i) => {
    // A parent the breed's sources name only by its scientific name in brackets is still that species.
    const sci = /\(([A-Z][a-z]+ [a-z]+)\)\s*$/.exec(p.name)?.[1]
    const s = species.get(p.species ?? (sci ? slugify(sci) : ''))
    if (s) return { name: s.t.name, sci: sciBeside(s.t.name, s.scientificName), path: `/vi/ca/${s.t.slug}/`, certain: p.certain }
    const name = b.t.parents?.[i] ?? ((lang !== 'vi' && isVietnamese(p.name) && sci) || p.name)
    return { name, certain: p.certain, ...(lang !== 'vi' && isVietnamese(name) ? { vi: true } : {}) }
  })
}

/**
 * What a breed's page shows, put together once for the page (pages/ca/[breed].astro) and for the app's copy of it
 * (lib/app-page.ts): what it's a form of, a hybrid's parents, its data card, its gallery strip, its own text with the
 * pages it names linked, its lines and the guides that name it. Every picture once, in page order (lib/pictures.ts):
 * the photo, the gallery's first photos, the lines' cards.
 */
export function breedParts(lang: Lang, c: Content, b: Breed) {
  const key = `breed:${b.id}`
  const parents = breedParents(lang, c, b)
  const pics = pagePictures(c)
  pics.add(b.photos[0]?.url)
  const gallery = albumOf(c, 'breeds', b)
  const strip = gallery.slice(0, GALLERY_STRIP).map(p => pics.take([p]) ?? null)
  const lines = breedsOf(lang, c, b.id)
  const linePhotos = takeEach(pics, lines, x => x.photos)
  // Its own text links the species, glossary terms and other pages it names, never itself. The list is the one
  // mentionIndex keeps for this content: building it walks every species, plant and breed name.
  const body = b.t.body ? linkTerms(b.t.body, mentionIndex(c).targets.filter(t => t.key !== key), 'ml').html : ''
  const mentioning = guidesMentioning(c, key)
  // The video guides' cards last, as on the page: two of one channel can carry the same photo.
  const videoGuides = mentioning.filter(g => g.video)
  return {
    key, parent: basedOn(c, b), parents, ...careCard(b), gallery, strip,
    // Its gallery page, once there are enough photos for one.
    galleryPath: hasPhotoPage(gallery) ? `/vi/ca/${b.t.slug}/anh/` : undefined,
    lines, linePhotos, body, guides: mentioning.filter(g => !g.video), videoGuides, videoPhotos: takeEach(pics, videoGuides, g => guideImages(c, g)),
  }
}
