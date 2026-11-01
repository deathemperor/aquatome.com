import type { GuideEntity } from '@aq/schema'
import { parse } from 'node-html-parser'
import type { SourcePhoto } from './source-photos'

type GuidePhoto = GuideEntity['photos'][number]

/** A guide's h3 headings, in order (its sections). */
export const guideHeadings = (html: string) => parse(html).querySelectorAll('h3').map(h => h.text.replace(/\s+/g, ' ').trim())

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
 * it: Indonesian and Thai by the same position among their headings). A photo whose source heading matches none (the
 * article's title, the introduction) keeps no section; the page spreads those through the text.
 */
export function withSections(photos: SourcePhoto[], bodies: { vi: string; id?: string; th?: string }): GuidePhoto[] {
  const vi = guideHeadings(bodies.vi)
  const other = { id: bodies.id ? guideHeadings(bodies.id) : [], th: bodies.th ? guideHeadings(bodies.th) : [] }
  return photos.map(({ heading, ...p }) => {
    const h = heading && guideHeading(heading, vi)
    if (!h) return p
    const i = vi.indexOf(h)
    const at = (l: 'id' | 'th') => (other[l].length === vi.length && other[l][i] ? { [l]: other[l][i] } : {})
    return { ...p, section: { vi: h, ...at('id'), ...at('th') } }
  })
}
