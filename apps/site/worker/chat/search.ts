import type { Item } from './handbook'
import type { Topics } from './topics'

/**
 * The chat's search of the handbook's pages by their names (the app index: a page's name, other names and scientific
 * name or channel), for Claude's search_handbook tool. Not the site's search (Pagefind, in the browser), which the
 * Worker can't run: guides are found by the words of their titles. Accents and đ are matched as readers type them, a
 * leading "cá" is optional (but "cá vàng" isn't "tép vàng"), and a page named exactly what was searched for comes first, as the site's search does, then a page whose own name it is before one that has it among its other names.
 * Thai, written without spaces between words, is cut into words by the platform's word breaker (Intl.Segmenter), so a
 * word matches inside a name or title, and its marks are kept: they are letters there, not accents.
 */
export const fold = (s: string) => s.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
const LEAD = /^(ca|tep|oc|cay) /
const bare = (s: string) => s.replace(LEAD, '')
const lead = (s: string) => LEAD.exec(s)?.[1]
/** Two names alike once a leading "cá" is dropped (the same, or one beginning with the other): unless each leads with
 * another animal's word, as "cá vàng" (a goldfish) and "tép vàng" (a shrimp) do. */
const bareTo = (n: string, q: string, alike: (a: string, b: string) => boolean) => alike(bare(n), bare(q)) && (!lead(n) || !lead(q) || lead(n) === lead(q))
const THAI = /\p{Script=Thai}/u
const thai = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : undefined
/** A folded text's words: a space between each, and Thai cut into its words. */
const split = (s: string) => s.split(' ').flatMap(w => (thai && THAI.test(w) ? [...thai.segment(w)].filter(x => x.isWordLike).map(x => x.segment) : [w]))
const words = (s: string) => split(fold(s)).filter(w => w.length > 1 || /\d/.test(w))

/** How well an item answers the query: 0 for not at all. */
export function score(item: Item, query: string): number {
  const q = fold(query)
  if (!q) return 0
  const own = fold(item.name)
  const others = [...(item.aka ?? []), ...(item.sub && item.kind !== 'video' ? [item.sub] : [])].map(fold)
  const names = [own, ...others]
  // Named exactly that, then alike past a leading "cá", then beginning with it; at each, its own name before its others.
  const by = (best: number, match: (n: string) => boolean) => (match(own) ? best : others.some(match) ? best - 5 : 0)
  const named = by(100, n => n === q) || by(90, n => bareTo(n, q, (a, b) => a === b)) || by(60, n => n.startsWith(q) || bareTo(n, q, (a, b) => a.startsWith(b)))
  if (named) return named
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

/** The five tone marks, which may sit on either vowel of a pair: "khoẻ" and "khỏe", "hoà" and "hòa", "thuỷ" and "thủy". */
const TONES = /[\u0300\u0301\u0303\u0309\u0323]/gu
/** A decomposed word with its tone mark moved to the end: the same word wherever the mark was typed. */
const toneLast = (d: string) => d.replace(TONES, '') + (d.match(TONES) ?? []).join('')
/** A word as written, lowercased and decomposed, its tone mark last. */
const written = (w: string) => toneLast(w.toLowerCase().normalize('NFD'))
/** A text's words as written: "đèn" (a light) and "đen" (black) fold alike. Decomposed once for the whole text. */
const writtenOf = (s: string) => s.toLowerCase().normalize('NFD').split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map(toneLast)
const LATIN = /\p{Script=Latin}/u

type Topic = { path: string; section: string | null; text: string; folded: string[]; written: string[] }
/** Each topic's words, folded and as written, worked out once for a topics file (the Worker keeps one per isolate for 10 minutes). */
const folded = new WeakMap<Topics, Topic[]>()
const wordsOf = (topics: Topics) => {
  let out = folded.get(topics)
  if (!out) {
    out = Object.entries(topics.pages).flatMap(([path, entries]) => entries.map(([section, text]) => ({ path, section, text, folded: [...new Set(words(text))], written: writtenOf(text) })))
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
 * that heading has no "phát", and "tép chết" finds shrimp, not every death. A word no topic has weighs nothing. When the
 * query has accents, a word's rarity is counted as written (nấm, fungus, is rare though nam also folds năm and Nam), and
 * a word that matches only once they are folded away (râu for rau, đen for đèn) weighs half; a tone mark may sit on
 * either vowel. Among matches, the topic with more of the query, then the one with fewer other words, comes first.
 */
export function searchTopics(topics: Topics, byPath: (path: string) => Item | undefined, query: string, max = 12): TopicHit[] {
  const list = wordsOf(topics)
  // The query's words, a word asked twice once, with every way it was written.
  const byFold = new Map<string, Set<string>>()
  for (const w of query.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)) {
    const f = fold(w)
    for (const x of split(f).filter(x => x.length > 1 || /\d/.test(x))) byFold.set(x, (byFold.get(x) ?? new Set()).add(x === f ? written(w) : x))
  }
  const accented = [...byFold].some(([f, ws]) => [...ws].some(w => w !== f))
  const want = [...byFold].map(([f, ws]) => ({ f, ws: [...ws], checked: accented && [...ws].some(w => LATIN.test(w)) }))
  if (!want.length) return []
  // Which topics have each word, folded and as written; a topic counted once however often it has the word.
  const near = want.map(() => 0)
  const exact = want.map(() => 0)
  const found: { topic: Topic; near: boolean[]; exact: boolean[] }[] = []
  for (const topic of list) {
    const n = want.map(t => within(topic.folded, t.f))
    if (!n.some(Boolean)) continue
    const e = want.map((t, i) => n[i]! && t.ws.some(w => within(topic.written, w)))
    n.forEach((x, i) => { if (x) near[i]!++; if (e[i]) exact[i]!++ })
    found.push({ topic, near: n, exact: e })
  }
  const weight = want.map((t, i) => { const k = t.checked ? exact[i] || near[i]! : near[i]!; return k ? Math.log((list.length + 1) / k) : 0 })
  const total = weight.reduce((sum, w) => sum + w, 0)
  if (!(total > 0)) return []
  const best = new Map<string, TopicHit & { share: number; fit: number }>()
  for (const { topic, near: n, exact: e } of found) {
    let got = 0
    let hits = 0
    want.forEach((t, i) => {
      if (!n[i] || !weight[i]) return
      hits++
      got += !t.checked || e[i] ? weight[i]! : weight[i]! / 2
    })
    const share = got / total
    if (share < 0.6) continue
    const item = byPath(topic.path)
    if (!item) continue
    const fit = hits / topic.folded.length
    const was = best.get(topic.path)
    if (!was || share > was.share || (share === was.share && fit > was.fit)) best.set(topic.path, { item, section: topic.section, text: topic.text, share, fit })
  }
  return [...best.values()].sort((a, b) => b.share - a.share || b.fit - a.fit).slice(0, max).map(({ share: _, fit: __, ...hit }) => hit)
}
