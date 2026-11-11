import type { Content, Localized, PlantEntity } from '@aq/schema'
import { GALLERY_MIN, GALLERY_STRIP } from './gallery'
import { served, type Lang } from './i18n'
import { guideImages, guidesMentioning } from './mentions'
import { distinctPhotos, pagePictures, takeEach } from './pictures'

/** How many times this process has put a plant's page together. The app's copy and the page share one. */
let plantAssemblies = 0
export const plantPartsBuilt = (): number => plantAssemblies
const plantKept = new WeakMap<Content, WeakMap<Localized<PlantEntity>, Partial<Record<Lang, ReturnType<typeof assemblePlant>>>>>()

/**
 * What a plant's page shows, put together once for the page (pages/cay/[slug].astro) and for the app's copy of it
 * (lib/app-page.ts): its gallery strip, the photos between the sections and the guides that name it. Every picture once,
 * in page order (lib/pictures.ts): the photo, the gallery's first photos, those between the sections, the video guides'
 * cards (two of one channel can carry the same photo). Kept for this content and this plant.
 */
export function plantParts(lang: Lang, c: Content, p: Localized<PlantEntity>) {
  const byPlant = plantKept.get(c) ?? plantKept.set(c, new WeakMap()).get(c)!
  const byLang = byPlant.get(p) ?? byPlant.set(p, {}).get(p)!
  let parts = byLang[lang]
  if (!parts) {
    plantAssemblies++
    byLang[lang] = parts = assemblePlant(lang, c, p)
  }
  return parts
}

function assemblePlant(lang: Lang, c: Content, p: Localized<PlantEntity>) {
  const pics = pagePictures(c)
  pics.add(p.photos[0]?.url)
  // Its gallery's first photos, linking the gallery page, once there are enough for one.
  const gallery = distinctPhotos(c, c.galleries[p.id] ?? [])
  const galleryPath = `/vi/cay/${p.t.slug}/anh/`
  const strip = gallery.length >= GALLERY_MIN && served(lang, galleryPath) ? gallery.slice(0, GALLERY_STRIP).map(x => pics.take([x]) ?? null) : []
  const figures = p.photos.slice(1).filter(x => pics.take([x]))
  const mentioning = guidesMentioning(c, `plant:${p.id}`)
  const videoGuides = mentioning.filter(g => g.video)
  return { gallery, galleryPath, strip, figures, guides: mentioning.filter(g => !g.video), videoGuides, videoPhotos: takeEach(pics, videoGuides, g => guideImages(c, g)) }
}
