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

/** A text's words as written, lowercased and composed: "đèn" (a light) and "đen" (black) fold alike. */
const writtenOf = (s: string) => s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
/** A query's words, each folded beside its written form. */
const terms = (s: string) => writtenOf(s)
  .flatMap(w => { const f = fold(w); return split(f).filter(x => x.length > 1 || /\d/.test(x)).map(x => ({ f: x, w: x === f ? w : x })) })

type Topic = { path: string; section: string | null; text: string; folded: string[]; hay: Set<string>; written: string[] }
/**
 * Each topic's words, worked out once for a topics file (the Worker keeps one per isolate for 10 minutes), and in how
 * many topics each folded word is.
 */
const folded = new WeakMap<Topics, { list: Topic[]; df: Map<string, number> }>()
const wordsOf = (topics: Topics) => {
  let out = folded.get(topics)
  if (!out) {
    const df = new Map<string, number>()
    const list = Object.entries(topics.pages).flatMap(([path, entries]) => entries.map(([section, text]) => {
      const hay = new Set(words(text))
      for (const w of hay) df.set(w, (df.get(w) ?? 0) + 1)
      return { path, section, text, folded: [...hay], hay, written: writtenOf(text) }
    }))
    out = { list, df }
    folded.set(topics, out)
  }
  return out
}

/** A guide found by a section heading or FAQ question (topics.ts): the section to open it at, and the words that matched. */
export type TopicHit = { item: Item; section: string | null; text: string }

/** A word, or one it begins (past three letters), in a topic's words. */
const within = (words: string[], w: string) => words.some(h => h === w || (h.length > 3 && w.length > 3 && h.startsWith(w)))

/**
 * Guides whose section headings or FAQ questions have the query's words, a guide once, at its best topic, best first.
 * For a question answered past a guide's title (bladder snails, in a guide titled for aquascaping tips).
 *
 * A word weighs by how rare it is among the topics, so "cá", "có" or "không" weigh little and "ốc" or "otto" much, and
 * a topic is a match when it has three fifths of the query's weight: "ốc bùng phát" finds where snails come from, though
 * that heading has no "phát", and "tép chết" finds shrimp, not every death. A word no topic has weighs nothing. When the query has accents, a word that matches only once they are
 * folded away (râu for rau, đen for đèn) weighs half. Among matches, the topic with more of the query, then the one with
 * fewer other words, comes first.
 */
export function searchTopics(topics: Topics, byPath: (path: string) => Item | undefined, query: string, max = 12): TopicHit[] {
  const { list, df } = wordsOf(topics)
  const q = [...new Map(terms(query).map(t => [t.f, t])).values()]
  const accented = q.some(t => t.w !== t.f)
  const weighed = q.map(t => {
    let n = df.get(t.f) ?? 0
    if (t.f.length > 3) for (const [w, k] of df) if (w !== t.f && w.length > 3 && w.startsWith(t.f)) n += k
    return { ...t, weight: n ? Math.log((list.length + 1) / Math.min(n, list.length)) : 0 }
  }).filter(t => t.weight > 0)
  const total = weighed.reduce((sum, t) => sum + t.weight, 0)
  if (!(total > 0)) return []
  const best = new Map<string, TopicHit & { share: number; fit: number }>()
  for (const { path, section, text, folded: words, hay, written } of list) {
    let got = 0
    let hits = 0
    for (const t of weighed) {
      if (!hay.has(t.f) && !within(words, t.f)) continue
      hits++
      got += !accented || within(written, t.w) ? t.weight : t.weight / 2
    }
    const share = got / total
    if (share < 0.6) continue
    const item = byPath(path)
    if (!item) continue
    const fit = hits / words.length
    const was = best.get(path)
    if (!was || share > was.share || (share === was.share && fit > was.fit)) best.set(path, { item, section, text, share, fit })
  }
  return [...best.values()].sort((a, b) => b.share - a.share || b.fit - a.fit).slice(0, max).map(({ share: _, fit: __, ...hit }) => hit)
}
