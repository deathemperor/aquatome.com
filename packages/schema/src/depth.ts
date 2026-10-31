import type { Section, SectionKey, SourceId, Translation } from './types'

/**
 * Page depth (docs/governance.md, "Content guards"): is a species page a handbook page, or a thin one made from a shop
 * listing, a dealer's note or a stub? Measured on the source text (the entity's English sections), so a page gets the same
 * verdict in every language.
 */

/** Sources that write species profiles: a page with any of their sections has an in-depth source. */
export const PROFILE_SOURCES: readonly SourceId[] = ['seriouslyfish', 'loachesonline', 'scotcat', 'aquariumbreeder', 'sprucepets', 'aquariumcoop', '2hraquarist']
/** PlanetCatfish writes full profiles and stubs (a distribution line, "unreported"): it counts only when its own sections cover DEPTH_TOPICS care topics. */
export const PROFILE_IF_FULL: readonly SourceId[] = ['planetcatfish']
/** A complete page, whatever its sources: this many characters of text (references aside)… */
export const DEPTH_CHARS = 1500
/** …covering this many of the five care topics. */
export const DEPTH_TOPICS = 3
/** A section of this many words or fewer is near-empty ("Mouthbrooder."): it covers no topic, and the page folds it into its quick facts. */
export const NEAR_EMPTY_WORDS = 5

export type CareTopic = 'tank' | 'water' | 'food' | 'behaviour' | 'breeding'
export const CARE_TOPICS: Partial<Record<SectionKey, CareTopic>> = {
  aquariumSize: 'tank', maintenance: 'tank', equipment: 'tank', waterConditions: 'water', diet: 'food', behaviour: 'behaviour', reproduction: 'breeding',
}

export type Depth = { deep: boolean; chars: number; topics: CareTopic[]; profile?: SourceId }
type Part = Pick<Section, 'key' | 'source' | 'html'>

export const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
export const wordCount = (html: string) => plainText(html).split(' ').filter(w => /[\p{L}\p{N}]/u.test(w)).length

/** Words under each heading, all sources together. */
function wordsByKey(parts: Part[]): Map<SectionKey, number> {
  const out = new Map<SectionKey, number>()
  for (const p of parts) out.set(p.key, (out.get(p.key) ?? 0) + wordCount(p.html))
  return out
}
const topicsOf = (words: Map<SectionKey, number>) =>
  [...new Set([...words].filter(([k, n]) => CARE_TOPICS[k] && n > NEAR_EMPTY_WORDS).map(([k]) => CARE_TOPICS[k]!))].sort()

/** Headings with only a few words under them (quick facts and references aside): the page shows them as quick facts. */
export function nearEmptyKeys(parts: Part[]): Set<SectionKey> {
  return new Set([...wordsByKey(parts)].filter(([k, n]) => k !== 'quickFacts' && k !== 'references' && n <= NEAR_EMPTY_WORDS).map(([k]) => k))
}

/** Deep: the page reaches DEPTH_CHARS and DEPTH_TOPICS, or it has an in-depth source. */
export function speciesDepth(sections: Part[]): Depth {
  const body = sections.filter(s => s.key !== 'references')
  const chars = body.reduce((n, s) => n + plainText(s.html).length, 0)
  const topics = topicsOf(wordsByKey(body))
  const sources = [...new Set(body.map(s => s.source))]
  const profile = sources.find(s => PROFILE_SOURCES.includes(s))
    ?? sources.find(s => PROFILE_IF_FULL.includes(s) && topicsOf(wordsByKey(body.filter(x => x.source === s))).length >= DEPTH_TOPICS)
  const deep = (chars >= DEPTH_CHARS && topics.length >= DEPTH_TOPICS) || !!profile
  return { deep, chars, topics, ...(profile ? { profile } : {}) }
}

/** A species page goes in search only with a passing score and a deep page; `reason` says why it doesn't. */
export function judgeQuality(q: Translation['quality'], scoreOk: boolean, deep: boolean): Translation['quality'] {
  const { reason: _old, ...rest } = q
  const reason = !deep ? 'thin' : !scoreOk ? 'score' : undefined
  return { ...rest, indexable: scoreOk && deep, ...(reason ? { reason } : {}) }
}
