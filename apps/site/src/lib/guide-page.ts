import { headingSubject, type Content, type GuideEntity, type LinkTarget, type Localized, type Photo } from '@aq/schema'
import { parse } from 'node-html-parser'
import type { Lang } from './i18n'
import { guideImage, guideImages, mentionIndex } from './mentions'
import { gearRows } from './gear'
import { placeFigures, type Figure, type HeadedFigure } from './figures'
import { readingMinutes, withToc } from './toc'
import { nextGuides } from './home'
import { illustrate, seriesGuides, seriesOf, videoPhoto } from './video'
import { pagePictures, photosOf } from './pictures'
import { PAGE } from '../scripts/filter-list'

/** A guide's photos that name their section, each under the heading this language's text gives it (else Vietnamese's). */
export const sectionFigures = (lang: Lang, photos: GuideEntity['photos']) =>
  photos.flatMap(p => (p.section ? [{ photo: p, label: p.caption, heading: p.section[lang] ?? p.section.vi }] : []))

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const headings = (html: string) => parse(html).querySelectorAll('h3').map(h => h.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)

/**
 * A list of fish: its headings each about one fish (heading → the fish's key), when two or more fish have one. A heading
 * is about a fish when it names it, or its scientific name in brackets ("8. Cá cherry barb (Puntius titteya)").
 */
export function fishSections(html: string, targets: LinkTarget[]): Map<string, string> {
  const named = headings(html).flatMap(h => { const s = headingSubject(h, targets); return s ? [[h, s.key] as const] : [] })
  return new Set(named.map(([, k]) => k)).size >= 2 ? new Map(named) : new Map()
}

type Living = { names: string[]; photos: Photo[]; label: string; href: string }
const living = new WeakMap<Content, Map<string, Living>>()
/** Every fish, plant and man-made fish by key ("species:betta-splendens"): its names, photos, name and page. */
function livingIndex(c: Content): Map<string, Living> {
  const hit = living.get(c)
  if (hit) return hit
  const m = new Map<string, Living>()
  for (const s of c.species) m.set(`species:${s.id}`, { names: [s.scientificName, s.t.name, ...s.t.altNames], photos: s.photos, label: s.t.name, href: `/vi/ca/${s.t.slug}/` })
  for (const p of c.plants) m.set(`plant:${p.id}`, { names: [p.scientificName, p.t.name, ...p.t.altNames], photos: p.photos, label: p.t.name, href: `/vi/cay/${p.t.slug}/` })
  for (const b of c.breeds) m.set(`breed:${b.id}`, { names: [b.t.name, ...b.t.altNames], photos: b.photos, label: b.t.name, href: `/vi/ca/${b.t.slug}/` })
  living.set(c, m)
  return m
}

/** Words without their plural ("green neon tetras" → "green neon tetra"), spaced so a phrase matches whole words. */
const plain = (s: string) => ` ${s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(w => w.replace(/ies$/, 'y').replace(/(?<=\p{L}{3}[^s])s$/u, '')).join(' ')} `
/**
 * The section a guide's own photo shows, from its caption (the source's alt text, often English: "dwarf pea puffer"):
 * the heading whose fish has a name in it, or whose own words are in it ("Cá chạch hồng (Rosy loach)" for "female rosy
 * loach"): phrases of two words or more, or one long name of the heading's fish ("angelfish"), the longest winning.
 * Undefined when none, or two, match.
 */
export function captionSection(caption: string | undefined, hs: string[], fish: Map<string, string>, things: Map<string, Living>): string | undefined {
  if (!caption) return undefined
  const cap = plain(caption)
  const scored = hs.map(h => {
    const own = [h.replace(/^\d{1,2}[.):]\s*/, ''), ...[...h.matchAll(/\(([^)]+)\)/g)].map(x => x[1]!)].flatMap(x => x.split(/\s+\/\s+/)).map(plain).filter(n => n.trim().includes(' '))
    const names = (fish.has(h) ? things.get(fish.get(h)!)?.names ?? [] : []).map(plain).filter(n => n.trim().includes(' ') || n.trim().length >= 6)
    return Math.max(0, ...[...own, ...names].filter(n => cap.includes(n)).map(n => n.length))
  })
  const best = Math.max(0, ...scored)
  return best > 0 && scored.filter(x => x === best).length === 1 ? hs[scored.indexOf(best)] : undefined
}

/**
 * What a guide's page shows, put together once for the page (pages/vi/huong-dan/[slug].astro) and for the app's copy
 * of it (lib/app-page.ts), so the two can't differ: the text with its links, photos and contents, the fish and plants it
 * names, the next guides, its sources. Every picture is chosen here in page order, none twice (lib/pictures.ts).
 */
export function guideParts(lang: Lang, c: Content, g: Localized<GuideEntity>) {
  const index = mentionIndex(c)
  const m = index.guides.get(g.id)!
  const body = m.html
  const species = [...new Set([...m.species, ...c.species.filter(s => g.mentions.includes(s.id))])]
  const plants = [...new Set([...m.plants, ...c.plants.filter(p => g.mentions.includes(p.id))])]
  const ph = guideImage(c, g)
  const gear = g.video ? gearRows(lang, c, g.video) : []
  // A section's picture is never the lead. A video guide shows its video's thumbnail instead.
  const lead = ph && !g.photos.find(p => p.url === ph.url)?.section ? ph : undefined
  const top = g.video ? videoPhoto(g.video) : lead
  const pics = pagePictures(c)
  pics.add(top?.url)
  const things = livingIndex(c)
  const hs = headings(body)
  const fish = fishSections(body, index.targets)
  const label = (heading: string) => { const t = things.get(fish.get(heading) ?? ''); return t ? { label: t.label, href: t.href } : {} }
  // The guide's own photos: under the heading the source had them (engine), else the one their caption names, else
  // spread through the text. In a fish's section, captioned with that fish's name.
  const headed: HeadedFigure[] = [], spread: Figure[] = []
  for (const p of g.photos) {
    if (p.url === lead?.url || !pics.take([p])) continue
    const section = sectionFigures(lang, [p])[0]
    const heading = section?.heading ?? captionSection(p.caption, hs, fish, things)
    if (heading) headed.push({ ...(section ?? { photo: p }), ...label(heading), heading })
    else spread.push({ photo: p })
  }
  // Each fish's section shows that fish: the guide's own photo of it, else the first of its page's photos not shown yet.
  for (const [heading, key] of fish) {
    if (headed.some(f => norm(f.heading) === norm(heading))) continue
    const photo = pics.take(photosOf(things.get(key)?.photos ?? []))
    if (photo) headed.push({ photo, ...label(heading), heading })
  }
  // Other fish and plants: a photo after the paragraph that first names them, outside the fish sections (six at most).
  const listed = new Set(fish.values())
  const anchored = [...species.map(s => ({ key: `species:${s.id}`, photos: s.photos, label: s.t.name, href: `/vi/ca/${s.t.slug}/` })), ...plants.map(p => ({ key: `plant:${p.id}`, photos: p.photos, label: p.t.name, href: `/vi/cay/${p.t.slug}/` }))]
    .filter(x => !listed.has(x.key) && x.photos[0] && !pics.has(x.photos[0].url)).slice(0, 6)
    .flatMap(({ photos, label, href }) => { const photo = pics.take([photos[0]]); return photo ? [{ photo, label, href }] : [] })
  const placed: Figure[] = []
  const prose0 = placeFigures(lang, body, anchored, spread, headed, { quiet: new Set([...fish.keys()].map(norm)), placed })
  // From here on, what the page really shows (a spread photo with no room left is not shown).
  const shown = pagePictures(c)
  shown.add(top?.url)
  for (const f of placed) shown.add(f.photo.url)
  const { html: toc0, toc } = withToc(prose0, body)
  const prose = g.video ? illustrate(lang, toc0, g.video, shown) : toc0
  const minutes = readingMinutes(body)
  const series = seriesOf(c, g)
  const inSeries = series ? seriesGuides(c, series) : []
  const pos = inSeries.findIndex(x => x.id === g.id)
  // A series reads in the creator's order: the next parts first, then related guides.
  const next = series ? [...inSeries.slice(pos + 1, pos + 4), ...nextGuides(c, g, 3).filter(x => !inSeries.some(y => y.id === x.id))].slice(0, 3) : nextGuides(c, g)
  // Below the text, in page order: the next guides' covers, then the fish and plant cards (a page of them, fish first: a
  // listicle names a hundred or more), each with a picture the page doesn't show yet, or none.
  const covers = next.map(x => shown.take(guideImages(c, x)) ?? null)
  const cardSpecies = species.slice(0, PAGE), cardPlants = plants.slice(0, PAGE - cardSpecies.length)
  const speciesPhotos = cardSpecies.map(s => shown.take(photosOf(s.photos)) ?? null)
  const plantPhotos = cardPlants.map(p => shown.take(photosOf(p.photos)) ?? null)
  // A guide in another language cites only the sources its own facts come from.
  const refs = g.t.refs ?? g.refs
  /** Every photo the page shows, for its credits. */
  const credited = [ph, ...placed.map(f => f.photo), ...(g.video?.figures ?? []).map(f => f.photo), ...covers, ...speciesPhotos, ...plantPhotos].filter((p): p is Photo => !!p)
  return { m, body, species, plants, ph, lead, gear, toc, prose, minutes, series, inSeries, pos, next, refs, covers, cardSpecies, cardPlants, speciesPhotos, plantPhotos, credited }
}
