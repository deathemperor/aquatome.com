import { dropCardRepeats, dropOffItems, figuresOffCard, linkTerms, litresOffCard, type Content, type DataCardField, type Section, type SourceId, type SpeciesEntity, type SpeciesRange, type Translation } from '@aq/schema'
import { citeMark, withCite } from './cite'
import type { Figure } from './figures'
import { translator, type Lang } from './i18n'
import { mentionIndex } from './mentions'
import { rangeParts, type RangeParts } from './range'
import { DISPLAY_ORDER } from './sections'

/**
 * The words before each figure in a "ghi khác bảng dữ liệu" note (Vietnamese: the page shows them through t()). `tankL`:
 * a tank given as a volume, in litres, against the card's minimum tank in cm.
 */
export const OFF_LABELS: Partial<Record<DataCardField | 'tankL', string>> = { tempC: 'nhiệt độ', ph: 'pH', gh: 'độ cứng', sizeCm: 'kích thước', tankCm: 'bể tối thiểu', tankL: 'bể tối thiểu' }
/** The blocks whose volumes are tanks: a volume elsewhere is water to change or a filter's flow. */
const TANK_KEYS = new Set(['quickFacts', 'aquariumSize'])

/**
 * `range`: a species' range, for its "Phân bố tự nhiên" (lib/range.ts), shown before the wild's sections. `refs`: the pages
 * AquaTome's own text on the species was researched from (SpeciesEntity refs), which its blocks cite by number.
 */
export type SectionProps = { sections: Section[]; t: Translation; self?: string; selfNames?: string[]; figures?: Figure[]; card?: SpeciesEntity['dataCard']; range?: { id: string; name: string; range?: SpeciesRange }; refs?: SpeciesEntity['refs'] }

/** "Phân bố tự nhiên" goes before the first of the sections about the wild the page has (or the sources' references). */
const RANGE_BEFORE = DISPLAY_ORDER.indexOf('distribution')

/**
 * A species' or plant's text as its page shows it, put together once for the page (components/Sections.astro) and for
 * the app's copy (lib/app-page.ts): the sections in reader order, each block with its links and its source's numbered
 * mark, a note above a block that follows a source the data card didn't, the photos between sections, and the
 * numbered sources. `card`: a species' data card, whose figures are the page's own (@aq/schema card-facts). `wild`: its
 * "Phân bố tự nhiên", when it has a range, shown before group `wildAt`, its sources numbered there in the page's order.
 */
export function sectionParts(lang: Lang, c: Content, { sections, t, self, selfNames = [], figures = [], card, range, refs: researched = [] }: SectionProps) {
  const targets = mentionIndex(c).targets
  // Other species, plants, taxa, groups, places, glossary terms and equipment: first mention on the page, never the page's own names.
  const linked = new Set<string>(self ? [self] : [])
  const own = new Set(selfNames.map(n => n.toLowerCase()))
  // Each source is numbered by where it first appears; every block ends with its source's mark (lib/cite.ts), and the
  // numbered list closes the page's text.
  const refs: { name: string; url: string }[] = []
  const refNo = (name: string, url: string) => { const i = refs.findIndex(r => r.url === url); return i >= 0 ? i + 1 : refs.push({ name, url }) }
  const tr = translator(lang)
  // AquaTome's own text cites each page its facts were researched from (not translated: the card names the page's site).
  const researchMarks = (x: Section) => (x.refs ?? []).flatMap(i => {
    const r = researched[i]
    return r ? [citeMark(lang, refNo(r.title, r.url), r.title, r.url, { tip: new URL(r.url).hostname.replace(/^www\./, ''), more: tr('Mở bài gốc ↗') })] : []
  })
  let fromResearch = false
  // A source the range cites by its page's own address there (its first section with text in this language); none for one
  // the page has no text of.
  const mark = (source: SourceId) => {
    const url = sections.find(x => x.source === source && t.sections[`${x.key}:${x.source}`])?.sourceUrl
    const name = c.sources[source]?.name ?? source
    return url ? citeMark(lang, refNo(name, url), name, url) : ''
  }
  let wild: RangeParts | undefined
  const groups = DISPLAY_ORDER.map((key, k) => {
    if (k === RANGE_BEFORE && range) wild = rangeParts(lang, c, range, mark)
    return { key, blocks: sections.filter(x => x.key === key).flatMap(x => {
      const text = t.sections[`${key}:${x.source}`]
      // A quick-facts line the card already gives goes, and so does one that says otherwise: the card is the page's figure.
      const html = text && card && key === 'quickFacts' ? dropOffItems(card, x.source, dropCardRepeats(x.html, text, x.source, card)) : text
      if (!html) return []
      const name = c.sources[x.source]?.name ?? x.source
      const off = card && key !== 'references' ? [...figuresOffCard(card, x.source, html), ...(TANK_KEYS.has(key) ? litresOffCard(card, html) : [])] : []
      const marks = x.source === 'aquatome' ? researchMarks(x) : []
      if (marks.length) fromResearch = true
      return [{ ...x, name, off, vi: withCite(linkTerms(html, targets, 'ml', linked, own).html, marks.length ? marks.join(' ') : citeMark(lang, refNo(name, x.sourceUrl), name, x.sourceUrl)) }]
    }) }
  }).filter(x => x.blocks.length > 0)
  // Every page researched is listed, a figure's on the card too, after those the text cites.
  for (const r of researched) refNo(r.title, r.url)
  const wildAt = groups.filter(g => DISPLAY_ORDER.indexOf(g.key) < RANGE_BEFORE).length
  // Extra photos go between sections, spread evenly (never after the last one).
  const figAfter = new Map(figures.slice(0, Math.max(0, groups.length - 1)).map((f, k, all) => [Math.floor(((k + 1) * groups.length) / (all.length + 1)) - 1, f] as const))
  // The source list's note: translated text, or AquaTome's own written from research as well.
  const note = fromResearch ? tr('Các phần trên dịch hoặc tổng hợp từ những nguồn này. Mỗi đoạn ghi số nguồn của nó.') : tr('Các phần trên dịch từ những nguồn này. Mỗi đoạn ghi số nguồn của nó.')
  return { groups, refs, note, figAfter, wild, wildAt }
}
