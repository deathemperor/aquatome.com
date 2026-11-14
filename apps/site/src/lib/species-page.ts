import type { Content, Localized, SectionKey, SpeciesEntity } from '@aq/schema'
import { breedsOf } from './breeds'
import { companionsOf } from './companions'
import { GALLERY_COLUMN, GALLERY_STRIP } from './gallery'
import { albumOf, hasPhotoPage } from './photo-page'
import { served, translator, type Lang } from './i18n'
import { guideImages, guidesMentioning } from './mentions'
import { morePhotos, pagePictures, takeEach } from './pictures'
import { foldNearEmpty } from './sections'
import { approvedSummary } from './summaries'

/**
 * The data card with its sources named for the page: a figure AquaTome researched names the page it comes from (its
 * title), as a breed's card does (lib/breeds.ts careCard); the others their source. The card itself (KeyFacts, the
 * sections' notes) keeps source ids.
 */
export function namedCard(c: Content, s: SpeciesEntity) {
  const card = Object.fromEntries(Object.entries(s.dataCard).map(([f, vs]) => [f, (vs ?? []).map(v => (v.source === 'aquatome' && v.ref !== undefined && s.refs?.[v.ref] ? { source: `aquatome:${v.ref}`, value: v.value } : v))]))
  const sources: Partial<Record<string, { name: string }>> = { ...c.sources, ...Object.fromEntries((s.refs ?? []).map((r, i) => [`aquatome:${i}`, { name: r.title }])) }
  return { card, sources }
}

const JUMPS: [SectionKey, string][] = [['aquariumSize', 'Bể'], ['waterConditions', 'Nước'], ['diet', 'Thức ăn'], ['behaviour', 'Nuôi chung'], ['reproduction', 'Sinh sản']]
/** Five chips fit a phone's row, or nearly. Past that these give way, in this order: breeding, then the tank, whose size is in the key facts just over the row and whose part comes first under it. The photos never do. */
const JUMP_MAX = 5
const JUMPS_GIVE_WAY = ['#muc-reproduction', '#muc-aquariumSize']
type JumpChip = { href: string; label: string; end?: boolean }

/** The jump row (components/JumpChips.astro) from its chips in page order, as many as the row holds. */
export function jumpRow<T extends { href: string }>(chips: T[]): T[] {
  const out = new Set<string>()
  for (const href of JUMPS_GIVE_WAY) if (chips.length - out.size > JUMP_MAX && chips.some(c => c.href === href)) out.add(href)
  return chips.filter(c => !out.has(c.href))
}

/**
 * What a species' page shows, put together once for the page (pages/ca/[slug].astro) and for the app's copy of it
 * (lib/app-page.ts), so the two can't differ: its country, summary, gallery strip, photos between the sections, breeds,
 * tank mates, videos and the guides that name it. Every picture is chosen here in page order, none twice
 * (lib/pictures.ts): the photo, the gallery's first photos, the photos between the sections, the breeds' cards. Then the
 * gallery's next photos, which fill the photo column on a tall computer screen: chosen last, so they never take a photo
 * from the parts the app's copy shares (it shows the strip alone).
 */
export async function speciesParts(lang: Lang, c: Content, s: Localized<SpeciesEntity>) {
  const t = translator(lang)
  const places = s.places.map(id => c.places.find(p => p.id === id)).filter(p => p !== undefined)
  const country = places.find(p => p.kind === 'country')
  const firstSource = s.sections[0]
  // A page AquaTome wrote itself from research (no licensed source has the species): the pages it researched, not a source it translated.
  const researched = s.refs?.length && s.sections.every(x => x.source === 'aquatome') ? s.refs.length : 0
  const summary = await approvedSummary(s.id)
  // The gallery as its page has it (each picture once), so a thumb opens its own photo there.
  const pics = pagePictures(c)
  pics.add(s.photos[0]?.url)
  const gallery = albumOf(c, 'species', s)
  const galleryPath = `/vi/ca/${s.t.slug}/anh/`
  const grid = hasPhotoPage(gallery) && served(lang, galleryPath)
  const strip = grid ? gallery.slice(0, GALLERY_STRIP).map(p => pics.take([p]) ?? null) : []
  const figures = s.photos.slice(1).filter(p => pics.take([p]))
  // Other languages' pages carry what's written for every reader; Vietnam-only parts (shops, climate, Vietnamese notes) stay on /vi/.
  const vn = lang === 'vi'
  // What to buy (Vietnam's shops: Vietnamese pages only), after the care text, with a chip in the jump row.
  const kit = vn && s.productSlots.length > 0
  const videos = vn ? s.videos : s.videos.filter(v => (v.lang ?? 'en') !== 'vi')
  const breeds = breedsOf(lang, c, s.id)
  const breedPhotos = takeEach(pics, breeds, b => b.photos)
  const more = strip.some(Boolean) ? morePhotos(pics, gallery, strip, GALLERY_COLUMN) : []
  const mates = await companionsOf(lang, c, s.id)
  const showMates = !!(mates.self.temperament || mates.self.schoolMin || mates.good.length || mates.avoid.length)
  const tool = `/vi/cong-cu/nuoi-chung/?ca=${s.t.slug}${mates.self.schoolMin ? `:${mates.self.schoolMin}` : ''}`
  // A heading over a few words ("Mouthbrooder.") is shown as a quick fact instead (lib/sections.ts).
  const text = foldNearEmpty(s.sections, s.t, t)
  // The jump row: the care questions, the shop, then the gallery page at its end, with how many it has. A fish with no
  // grid has no chip for its photos: the photo is right above the row.
  const written = (key: SectionKey) => text.sections.some(x => x.key === key && text.t.sections[`${key}:${x.source}`])
  const jumps = jumpRow<JumpChip>([
    ...JUMPS.filter(([key]) => written(key)).map(([key, label]) => ({ href: `#muc-${key}`, label: t(label) })),
    ...(kit ? [{ href: '#mua-do', label: t('Mua đồ') }] : []),
    ...(grid ? [{ href: galleryPath, label: t('Ảnh {n}', { n: gallery.length }), end: true }] : []),
  ])
  const mentioning = guidesMentioning(c, `species:${s.id}`)
  // The video guides' cards last, as on the page: two of one channel can carry the same photo.
  const videoGuides = mentioning.filter(g => g.video)
  return {
    country, firstSource, researched, ...namedCard(c, s), summary, gallery, galleryPath, strip, more, figures, vn, kit, videos, breeds, breedPhotos, mates, showMates, tool, text, jumps,
    guides: mentioning.filter(g => !g.video), videoGuides, videoPhotos: takeEach(pics, videoGuides, g => guideImages(c, g)),
  }
}
