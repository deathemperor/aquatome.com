import type { Content, GuideEntity, Localized, Photo, PlantEntity } from '@aq/schema'
import type { PlantIndexItem, SpeciesIndexItem } from '../scripts/filter'
import { GUIDE_KIND_LABELS, PLANT_LABELS } from './format'
import { cleanPhoto, listOrder } from './home'
import type { Lang, T } from './i18n'
import { smallSrc } from './img'
import { guideImage } from './mentions'
import { toIndexItem } from './species-index'

/**
 * The fish and plant lists' data, a file per language (/data/<lang>/species.json, /data/<lang>/plants.json) that the
 * list's script fetches when a reader filters or goes past the first page: the HTML has only that page's cards, so it
 * stays the same size however many species and plants there are. One item per card, in the list's order: what the
 * filter reads, and what a card built in the browser shows and credits (scripts/species-card.ts, plant-card.ts).
 */

/** The photo a card shows: its small picture, and its credit (author, licence, its page on the source). */
export type CardPhoto = { src: string; w: number; h: number; author: string; licence: string; url: string }
/** Only what the filter reads (no gh, sizeCm), and the card's photo. */
export type SpeciesListItem = Omit<SpeciesIndexItem, 'gh' | 'sizeCm'> & { photo?: CardPhoto }
/** The filter's figures, and the card's name, line about light and CO₂ (in the page's language) and photo. */
export type PlantListItem = PlantIndexItem & { name: string; scientificName: string; meta: string; photo?: CardPhoto }

const cardPhoto = (p: Photo): CardPhoto => ({ src: smallSrc(p), w: p.width, h: p.height, author: p.author, licence: p.licence, url: p.sourceUrl })

/** Every species in the fish list's order, with the photo its card shows (SpeciesCard: cleanPhoto). */
export function speciesList(lang: Lang, c: Content): SpeciesListItem[] {
  return listOrder(lang, c).map(s => {
    const { gh, sizeCm, ...i } = toIndexItem(s)
    const p = cleanPhoto(s.photos)
    return p ? { ...i, photo: cardPhoto(p) } : i
  })
}

/** A plant card's line: "Ánh sáng yếu, CO₂ không cần" (PlantCard). */
export const plantMeta = (t: T, p: Localized<PlantEntity>) =>
  t('Ánh sáng {light}, CO₂ {co2}', { light: t(PLANT_LABELS.light[p.light]!).toLowerCase(), co2: t(PLANT_LABELS.co2[p.co2]!).toLowerCase() })

/** Every plant in the plant list's order. A plant with no position in the content has no `placement`: the filter counts it unsure, never a match. */
export function plantList(t: T, c: Content): PlantListItem[] {
  return c.plants.map(p => ({
    slug: p.t.slug, name: p.t.name, scientificName: p.scientificName, light: p.light, co2: p.co2, difficulty: p.difficulty,
    ...(p.placement.length ? { placement: p.placement } : {}), meta: plantMeta(t, p), ...(p.photos[0] ? { photo: cardPhoto(p.photos[0]) } : {}),
  }))
}

/** The guides the guide list shows, in its order: written ones (video guides have /vi/video/, discovery notes /vi/kham-pha/). */
export const listedGuides = (c: Content) => c.guides.filter(g => g.kind !== 'discovery' && !g.video)

/** A guide card's subject and its line on where the guide comes from, in the page's language (GuideCard). */
export const guideWords = (t: T, c: Content, g: Localized<GuideEntity>) => ({
  label: t(GUIDE_KIND_LABELS[g.kind]!),
  src: g.video ? t('Theo video của {name}', { name: g.video.channel })
    : g.source === 'aquatome' ? t('AquaTome tổng hợp, {n} nguồn', { n: (g.t.refs ?? g.refs)?.length ?? 0 })
    : t('Dịch từ {name}', { name: c.sources[g.source]?.name ?? g.source }),
})

/** A guide list card's address, subject (to filter on), words and picture (GuideCard: guideImage). */
export type GuideListItem = { slug: string; kind: string; name: string; label: string; src: string; photo?: CardPhoto }

/** Every guide in the guide list's order (/data/<lang>/guides.json): the list's HTML has only its first page. */
export function guideList(t: T, c: Content): GuideListItem[] {
  return listedGuides(c).map(g => {
    const p = guideImage(c, g)
    return { slug: g.t.slug, kind: g.kind, name: g.t.name, ...guideWords(t, c, g), ...(p ? { photo: cardPhoto(p) } : {}) }
  })
}
