import { dropCardRepeats, figuresOffCard, linkTerms, type Content, type DataCardField, type Section, type SourceId, type SpeciesEntity, type SpeciesRange, type Translation } from '@aq/schema'
import { citeMark, withCite } from './cite'
import type { Figure } from './figures'
import type { Lang } from './i18n'
import { mentionIndex } from './mentions'
import { rangeParts, type RangeParts } from './range'
import { DISPLAY_ORDER } from './sections'

/** The words before each figure in a "ghi khác bảng dữ liệu" note (Vietnamese: the page shows them through t()). */
export const OFF_LABELS: Partial<Record<DataCardField, string>> = { tempC: 'nhiệt độ', ph: 'pH', gh: 'độ cứng', sizeCm: 'kích thước', tankCm: 'bể tối thiểu' }

/** `range`: a species' range, for its "Phân bố tự nhiên" (lib/range.ts), shown before the wild's sections. */
export type SectionProps = { sections: Section[]; t: Translation; self?: string; selfNames?: string[]; figures?: Figure[]; card?: SpeciesEntity['dataCard']; range?: { id: string; name: string; range?: SpeciesRange } }

/** "Phân bố tự nhiên" goes before the first of the sections about the wild the page has (or the sources' references). */
const RANGE_BEFORE = DISPLAY_ORDER.indexOf('distribution')

/**
 * A species' or plant's text as its page shows it, put together once for the page (components/Sections.astro) and for
 * the app's copy (lib/app-page.ts): the sections in reader order, each block with its links and its source's numbered
 * mark, a note above a block that follows a source the data card didn't, the photos between sections, and the
 * numbered sources. `card`: a species' data card, whose figures are the page's own (@aq/schema card-facts). `wild`: its
 * "Phân bố tự nhiên", when it has a range, shown before group `wildAt`, its sources numbered there in the page's order.
 */
export function sectionParts(lang: Lang, c: Content, { sections, t, self, selfNames = [], figures = [], card, range }: SectionProps) {
  const targets = mentionIndex(c).targets
  // Other species, plants, taxa, groups, places, glossary terms and equipment: first mention on the page, never the page's own names.
  const linked = new Set<string>(self ? [self] : [])
  const own = new Set(selfNames.map(n => n.toLowerCase()))
  // Each source is numbered by where it first appears; every block ends with its source's mark (lib/cite.ts), and the
  // numbered list closes the page's text.
  const refs: { name: string; url: string }[] = []
  const refNo = (name: string, url: string) => { const i = refs.findIndex(r => r.url === url); return i >= 0 ? i + 1 : refs.push({ name, url }) }
  // A source the range cites by its page's own address there (its first section's); none for one the page has no text of.
  const mark = (source: SourceId) => {
    const url = sections.find(x => x.source === source)?.sourceUrl
    const name = c.sources[source]?.name ?? source
    return url ? citeMark(lang, refNo(name, url), name, url) : ''
  }
  let wild: RangeParts | undefined
  const groups = DISPLAY_ORDER.map((key, k) => {
    if (k === RANGE_BEFORE && range) wild = rangeParts(lang, c, range, mark)
    return { key, blocks: sections.filter(x => x.key === key).flatMap(x => {
      const text = t.sections[`${key}:${x.source}`]
      const html = text && card && key === 'quickFacts' ? dropCardRepeats(x.html, text, x.source, card) : text
      if (!html) return []
      const name = c.sources[x.source]?.name ?? x.source
      const off = card && key !== 'references' ? figuresOffCard(card, x.source, html) : []
      return [{ ...x, name, off, vi: withCite(linkTerms(html, targets, 'ml', linked, own).html, citeMark(lang, refNo(name, x.sourceUrl), name, x.sourceUrl)) }]
    }) }
  }).filter(x => x.blocks.length > 0)
  const wildAt = groups.filter(g => DISPLAY_ORDER.indexOf(g.key) < RANGE_BEFORE).length
  // Extra photos go between sections, spread evenly (never after the last one).
  const figAfter = new Map(figures.slice(0, Math.max(0, groups.length - 1)).map((f, k, all) => [Math.floor(((k + 1) * groups.length) / (all.length + 1)) - 1, f] as const))
  return { groups, refs, figAfter, wild, wildAt }
}
