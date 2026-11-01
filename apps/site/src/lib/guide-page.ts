import type { Content, GuideEntity, Localized } from '@aq/schema'
import type { Lang } from './i18n'
import { guideImage, mentionIndex } from './mentions'
import { gearRows } from './gear'
import { placeFigures } from './figures'
import { readingMinutes, withToc } from './toc'
import { nextGuides } from './home'
import { illustrate, seriesGuides, seriesOf } from './video'

/**
 * What a guide's page shows, put together once for the page (pages/vi/huong-dan/[slug].astro) and for the app's copy
 * of it (lib/app-page.ts), so the two can't differ: the text with its links, photos and contents, the fish and plants it
 * names, the next guides, its sources.
 */
export function guideParts(lang: Lang, c: Content, g: Localized<GuideEntity>) {
  const m = mentionIndex(c).guides.get(g.id)!
  const body = m.html
  const species = [...new Set([...m.species, ...c.species.filter(s => g.mentions.includes(s.id))])]
  const plants = [...new Set([...m.plants, ...c.plants.filter(p => g.mentions.includes(p.id))])]
  const ph = guideImage(c, g)
  const gear = g.video ? gearRows(lang, c, g.video) : []
  // Pictures inside the text: each species/plant photo after the paragraph that first names it, the guide's other photos spread out.
  const shown = (url?: string) => url !== undefined && url !== ph?.url
  const placed = placeFigures(lang, body,
    [...species.map(s => ({ photo: s.photos[0], label: s.t.name, href: `/vi/ca/${s.t.slug}/` })), ...plants.map(p => ({ photo: p.photos[0], label: p.t.name, href: `/vi/cay/${p.t.slug}/` }))]
      .filter((f): f is typeof f & { photo: NonNullable<typeof f.photo> } => shown(f.photo?.url)).slice(0, 6),
    g.photos.filter(p => shown(p.url)).map(photo => ({ photo })))
  const { html: toc0, toc } = withToc(placed)
  const prose = g.video ? illustrate(lang, toc0, g.video) : toc0
  const minutes = readingMinutes(body)
  const series = seriesOf(c, g)
  const inSeries = series ? seriesGuides(c, series) : []
  const pos = inSeries.findIndex(x => x.id === g.id)
  // A series reads in the creator's order: the next parts first, then related guides.
  const next = series ? [...inSeries.slice(pos + 1, pos + 4), ...nextGuides(c, g, 3).filter(x => !inSeries.some(y => y.id === x.id))].slice(0, 3) : nextGuides(c, g)
  // A guide in another language cites only the sources its own facts come from.
  const refs = g.t.refs ?? g.refs
  return { m, body, species, plants, ph, gear, toc, prose, minutes, series, inSeries, pos, next, refs }
}
