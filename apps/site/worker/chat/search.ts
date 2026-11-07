import type { Item } from './handbook'
import type { Topics } from './topics'

/**
 * The chat's search of the handbook's pages by their names (the app index: a page's name, other names and scientific
 * name or channel), for Claude's search_handbook tool. Not the site's search (Pagefind, in the browser), which the
 * Worker can't run: guides are found by the words of their titles. Accents and đ are matched as readers type them, a
 * leading "cá" is optional, and a page named exactly what was searched for comes first, as the site's search does.
 * Thai, written without spaces between words, is cut into words by the platform's word breaker (Intl.Segmenter), so a
 * word matches inside a name or title, and its marks are kept: they are letters there, not accents.
 */
export const fold = (s: string) => s.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
const bare = (s: string) => s.replace(/^(ca|tep|oc|cay) /, '')
const THAI = /\p{Script=Thai}/u
const thai = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : undefined
/** A folded text's words: a space between each, and Thai cut into its words. */
const split = (s: string) => s.split(' ').flatMap(w => (thai && THAI.test(w) ? [...thai.segment(w)].filter(x => x.isWordLike).map(x => x.segment) : [w]))
const words = (s: string) => split(fold(s)).filter(w => w.length > 1 || /\d/.test(w))

/** How well an item answers the query: 0 for not at all. */
export function score(item: Item, query: string): number {
  const q = fold(query)
  if (!q) return 0
  const names = [item.name, ...(item.aka ?? []), ...(item.sub && item.kind !== 'video' ? [item.sub] : [])].map(fold)
  if (names.some(n => n === q || bare(n) === bare(q))) return 100
  if (names.some(n => n.startsWith(q) || bare(n).startsWith(bare(q)))) return 60
  const want = words(bare(q))
  if (!want.length) return 0
  const hay = new Set([...names, fold(item.sub ?? ''), fold(item.path.split('/').filter(Boolean).at(-1) ?? '')].flatMap(split))
  const hit = want.filter(w => hay.has(w) || [...hay].some(h => h.length > 3 && w.length > 3 && h.startsWith(w))).length
  // Every word found: a match; most of them, a weaker one (a question's extra words).
  return hit === want.length ? 40 : hit >= Math.max(2, Math.ceil(want.length * 0.6)) ? 10 + hit : 0
}

/** The best matches, best first (the index's order among equals), of a kind when given. */
export function search(items: Item[], query: string, kind: Item['kind'] | null, max = 12): Item[] {
  return items.map((item, i) => ({ item, i, s: kind && item.kind !== kind ? 0 : score(item, query) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, max).map(x => x.item)
}

/** Each topic's words, worked out once for a topics file (the Worker keeps one per isolate for 10 minutes). */
const folded = new WeakMap<Topics, { path: string; section: string | null; text: string; hay: Set<string> }[]>()
const wordsOf = (topics: Topics) => {
  let out = folded.get(topics)
  if (!out) {
    out = Object.entries(topics.pages).flatMap(([path, list]) => list.map(([section, text]) => ({ path, section, text, hay: new Set(words(text)) })))
    folded.set(topics, out)
  }
  return out
}

/** A guide found by a section heading or FAQ question (topics.ts): the section to open it at, and the words that matched. */
export type TopicHit = { item: Item; section: string | null; text: string }

/**
 * Guides whose section headings or FAQ questions have the query's words, as a title has them in score(): every word,
 * or most of them; a guide once, at its best topic, best first. For a question answered past a guide's title (bladder
 * snails, in a guide titled for aquascaping tips).
 */
export function searchTopics(topics: Topics, byPath: (path: string) => Item | undefined, query: string, max = 12): TopicHit[] {
  const want = words(bare(fold(query)))
  if (!want.length) return []
  const best = new Map<string, TopicHit & { s: number }>()
  for (const { path, section, text, hay } of wordsOf(topics)) {
    const item = byPath(path)
    if (!item) continue
    const hit = want.filter(w => hay.has(w) || [...hay].some(h => h.length > 3 && w.length > 3 && h.startsWith(w))).length
    const s = hit === want.length ? 40 + hit : hit >= Math.max(2, Math.ceil(want.length * 0.6)) ? 10 + hit : 0
    if (s > (best.get(path)?.s ?? 0)) best.set(path, { item, section, text, s })
  }
  return [...best.values()].sort((a, b) => b.s - a.s).slice(0, max).map(({ s: _, ...hit }) => hit)
}
