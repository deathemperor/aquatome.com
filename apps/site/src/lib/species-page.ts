import type { Content, Localized, SectionKey, SpeciesEntity } from '@aq/schema'
import { breedsOf } from './breeds'
import { companionsOf } from './companions'
import { GALLERY_MIN, GALLERY_STRIP } from './gallery'
import { served, translator, type Lang } from './i18n'
import { guidesMentioning } from './mentions'
import { distinctPhotos, pagePictures, takeEach } from './pictures'
import { foldNearEmpty } from './sections'
import { approvedSummary } from './summaries'

const JUMPS: [SectionKey, string][] = [['aquariumSize', 'Bể'], ['waterConditions', 'Nước'], ['diet', 'Thức ăn'], ['behaviour', 'Nuôi chung'], ['reproduction', 'Sinh sản']]

/**
 * What a species' page shows, put together once for the page (pages/vi/ca/[slug].astro) and for the app's copy of it
 * (lib/app-page.ts), so the two can't differ: its country, summary, gallery strip, photos between the sections, breeds,
 * tank mates, videos and the guides that name it. Every picture is chosen here in page order, none twice
 * (lib/pictures.ts): the photo, the gallery's first photos, the photos between the sections, the breeds' cards.
 */
export async function speciesParts(lang: Lang, c: Content, s: Localized<SpeciesEntity>) {
  const t = translator(lang)
  const places = s.places.map(id => c.places.find(p => p.id === id)).filter(p => p !== undefined)
  const country = places.find(p => p.kind === 'country')
  const firstSource = s.sections[0]
  const summary = await approvedSummary(s.id)
  // The gallery as its page has it (each picture once), so a thumb opens its own photo there.
  const pics = pagePictures(c)
  pics.add(s.photos[0]?.url)
  const gallery = distinctPhotos(c, c.galleries[s.id] ?? [])
  const galleryPath = `/vi/ca/${s.t.slug}/anh/`
  const strip = gallery.length >= GALLERY_MIN && served(lang, galleryPath) ? gallery.slice(0, GALLERY_STRIP).map(p => pics.take([p]) ?? null) : []
  const figures = s.photos.slice(1).filter(p => pics.take([p]))
  // Other languages' pages carry what's written for every reader; Vietnam-only parts (shops, climate, Vietnamese notes) stay on /vi/.
  const vn = lang === 'vi'
  const videos = vn ? s.videos : s.videos.filter(v => (v.lang ?? 'en') !== 'vi')
  const breeds = breedsOf(lang, c, s.id)
  const breedPhotos = takeEach(pics, breeds, b => b.photos)
  const mates = await companionsOf(lang, c, s.id)
  const showMates = !!(mates.self.temperament || mates.self.schoolMin || mates.good.length || mates.avoid.length)
  const tool = `/vi/cong-cu/nuoi-chung/?ca=${s.t.slug}${mates.self.schoolMin ? `:${mates.self.schoolMin}` : ''}`
  // A heading over a few words ("Mouthbrooder.") is shown as a quick fact instead (lib/sections.ts).
  const text = foldNearEmpty(s.sections, s.t, t)
  // The jump row: the parts readers look for, in page order (the photo strip comes before the text).
  const written = (key: SectionKey) => text.sections.some(x => x.key === key && text.t.sections[`${key}:${x.source}`])
  const jumps = [
    ...(strip.some(Boolean) ? [{ href: '#gal-h', label: t('Ảnh') }] : []),
    ...JUMPS.filter(([key]) => written(key)).map(([key, label]) => ({ href: `#muc-${key}`, label: t(label) })),
  ]
  const mentioning = guidesMentioning(c, `species:${s.id}`)
  return {
    country, firstSource, summary, gallery, galleryPath, strip, figures, vn, videos, breeds, breedPhotos, mates, showMates, tool, text, jumps,
    guides: mentioning.filter(g => !g.video), videoGuides: mentioning.filter(g => g.video),
  }
}
