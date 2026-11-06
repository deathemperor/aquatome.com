import { headingRoles, ownNumber, type GuideEntity } from '@aq/schema'
import { WRITTEN_OTHER_LANGS, type WrittenOtherLang } from '@aq/schema/langs'
import { parse } from 'node-html-parser'
import type { SourcePhoto } from './source-photos'

type GuidePhoto = GuideEntity['photos'][number]

/** A guide's h3 headings, in order (its sections). */
export const guideHeadings = (html: string) => parse(html).querySelectorAll('h3').map(h => h.text.replace(/\s+/g, ' ').trim())

const FIX = String.raw`(?:loại bỏ|xử lý|xử lí|diệt|tiêu diệt|trị|chữa|điều trị|khắc phục)(?!\p{L})`
/** A guide that fixes a problem: "Cách loại bỏ tảo râu đen (BBA)", "Tảo lam: đặc điểm và cách loại bỏ". */
const FIX_TITLE = new RegExp(String.raw`^(?:cách\s+)?${FIX}|:.*(?<!\p{L})cách\s+${FIX}`, 'iu')
/** A section on the fix: "Cách xử lý tảo râu đen", "Trị nấm cho cá thế nào?", "Làm sao để hết tảo trong bể?". */
const FIX_HEADING = new RegExp(String.raw`^(?:(?:cách|các bước|bước)\s+)?${FIX}|^làm (?:sao|thế nào) để (?:hết|chặn|${FIX})`, 'iu')
/** A closing section, which stays last. */
const CLOSING = /^(?:kết luận|tóm lại|lời kết|tổng kết)(?!\p{L})/iu

/**
 * A guide that fixes a problem, with the fix first: from its first section on the fix to the end (its closing section
 * aside) goes before the causes and the background, after its opening; the text is the same. Found 2026-11-06: the
 * black beard algae guide put "Cách xử lý" last of six. A setup guide ("Cách xử lý lũa") isn't one, and a fix that is
 * one of a numbered run ("6. Cách diệt tảo nâu") stays: moved, the run would no longer count up.
 */
export function fixFirst(title: string, kind: GuideEntity['kind'], body: string): string {
  if (kind === 'setup' || !FIX_TITLE.test(title.trim())) return body
  const root = parse(body)
  const heads = headingRoles(root)
  const first = heads.findIndex(h => FIX_HEADING.test(h.text))
  const fix = heads[first]
  if (first <= 0 || fix!.sub || ownNumber(fix!.text) !== undefined) return body
  const closing = heads.findIndex((h, i) => i > first && CLOSING.test(h.text))
  const nodes = root.childNodes
  const [top, from, to] = [nodes.indexOf(heads[0]!.el), nodes.indexOf(fix!.el), closing < 0 ? nodes.length : nodes.indexOf(heads[closing]!.el)]
  return [...nodes.slice(0, top), ...nodes.slice(from, to), ...nodes.slice(top, from), ...nodes.slice(to)].map(n => n.toString()).join('')
}

/** Words too common in a list heading to tell one fish from another. */
const STOP = new Set(['the', 'and', 'for', 'with', 'fish', 'fishes', 'standard', 'common', 'species', 'best', 'type', 'types', 'care', 'guide', 'spp', 'var'])
const stem = (w: string) => w.replace(/ies$/, 'y').replace(/(?<=[^s])s$/, '')
const words = (s: string) => new Set(s.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))
const latin = (s: string) => [...s.matchAll(/\b([A-Z][a-z]+ [a-z]{3,})\b/g)].map(m => m[1]!)
const number = (s: string) => s.match(/^\s*(\d{1,2})[.):]\s/)?.[1]

/**
 * The guide heading a source heading became ("Standard Goldfish (Carassius auratus)" → "1. Cá vàng thường (Carassius
 * auratus)"): the one sharing its scientific name, its list number, or the most of its words (English names often stay
 * in the Vietnamese heading, "Cá cherry barb"). Undefined when none matches, or two match equally.
 */
export function guideHeading(source: string, headings: string[]): string | undefined {
  const sci = latin(source).map(n => n.toLowerCase())
  const n = number(source)
  const own = words(source)
  const scored = headings.map(h => {
    const theirs = words(h)
    return 5 * sci.filter(x => h.toLowerCase().includes(x)).length + (n && number(h) === n ? 3 : 0) + [...own].filter(w => theirs.has(w)).length
  })
  const best = Math.max(0, ...scored)
  return best > 0 && scored.filter(x => x === best).length === 1 ? headings[scored.indexOf(best)] : undefined
}

/**
 * A guide's photos with the section each sat under in the source (`section`, by the heading each language's text gives
 * it: the other languages by the same position among their headings). A photo whose source heading matches none (the
 * article's title, the introduction) keeps no section; the page spreads those through the text.
 */
export function withSections(photos: SourcePhoto[], bodies: { vi: string } & Partial<Record<WrittenOtherLang, string>>): GuidePhoto[] {
  const vi = guideHeadings(bodies.vi)
  const other = WRITTEN_OTHER_LANGS.map(l => [l, bodies[l] ? guideHeadings(bodies[l]) : []] as const)
  return photos.map(({ heading, ...p }) => {
    const h = heading && guideHeading(heading, vi)
    if (!h) return p
    const i = vi.indexOf(h)
    const at = Object.fromEntries(other.filter(([, hs]) => hs.length === vi.length && hs[i]).map(([l, hs]) => [l, hs[i]!]))
    return { ...p, section: { vi: h, ...at } }
  })
}
