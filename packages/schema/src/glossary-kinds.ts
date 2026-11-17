import { HTMLElement, parse } from 'node-html-parser'
import { slugify } from './slug'

/** A kinds heading: "Các loại lũa", "Các dạng Artemia"; not a list of mistakes ("Các loại lỗi", "Các loại sai lầm"). */
const KINDS = /^Các (?:loại|dạng)\b(?!\s+(?:lỗi|sai))/i

/**
 * A term's kinds as its entry writes them: each item of the lists under its first "Các loại …" or "Các dạng …" heading, up
 * to the next heading of any level, by the name before its colon, bracket, comma or dash ("<strong>Lũa đỗ quyên</strong>
 * (spider wood): …" is "Lũa đỗ quyên"; an item naming two woods, "Lũa hải sơn tùng, lũa ngọc linh sam: …", is the
 * first's). A list inside an item is that item's, not more kinds. `id`: the name slugged, the key a kind's own photo is
 * filed under (GlossarySchema `kinds`). The owner, 15 Nov 2026, of the glossary: "what does each look like?"; the chief of
 * staff: where a term names kinds, each kind has its own picture beside its name.
 */
export function glossaryKinds(body: string): { id: string; name: string }[] {
  return kindsSection(body)?.items.map(({ id, name }) => ({ id, name })) ?? []
}

/** A kind as its item writes it: `label`, the words before its colon; `aka`, a name in brackets after them; `html`, its text after the colon. */
export type GlossaryKindItem = { id: string; name: string; label: string; aka?: string; html: string }

/**
 * A term's body split at its kinds (the Design Lead's board, 16 Nov 2026: the kinds as cards, first in the page's body):
 * the kinds heading's words, what stands under it that isn't a list (`intro`), each kind's item, and the body without
 * that section (`rest`, its other parts in their order). None where the entry names no kinds.
 */
export function kindsSection(body: string): { heading: string; intro: string; items: GlossaryKindItem[]; rest: string } | null {
  const items: GlossaryKindItem[] = []
  let within = false, done = false, heading = '', intro = '', rest = ''
  for (const el of parse(body).childNodes) {
    if (!(el instanceof HTMLElement)) { if (!within) rest += el.toString(); else if (el.text.trim()) intro += el.toString(); continue }
    const tag = el.rawTagName?.toLowerCase() ?? ''
    if (/^h[1-6]$/.test(tag) && !done) {
      if (within) { done = true; within = false } else if (KINDS.test(el.text.trim())) { within = true; heading = el.text.trim(); continue }
    }
    if (!within) { rest += el.toString(); continue }
    if (tag !== 'ul' && tag !== 'ol') { intro += el.toString(); continue }
    for (const li of el.childNodes) {
      if (!(li instanceof HTMLElement) || li.rawTagName?.toLowerCase() !== 'li') continue
      // The item's own words, before any list inside it; entities decoded.
      const own = li.childNodes.filter(n => !(n instanceof HTMLElement && /^(ul|ol)$/i.test(n.rawTagName ?? ''))).map(n => n.text).join('')
      const name = own.split(/:|\s\(|,|\s[–-]\s/)[0]!.trim()
      const id = slugify(name)
      if (!id || items.some(k => k.id === id)) continue
      items.push({ id, name, ...itemParts(li.innerHTML, name) })
    }
  }
  return items.length ? { heading, intro, items, rest } : null
}

const plain = (html: string) => parse(html).text.replace(/\s+/g, ' ').trim()

/**
 * "<strong>Lũa đỗ quyên</strong> (spider wood): …" or "Trứng Artemia: …": the label, the bracketed name and the text after
 * the colon, from a capital. More names in bold after the first ("<strong>Lũa nguyệt quế</strong>, <strong>lũa dã
 * quỳ</strong>: …") are other names, never the start of its text (the parity shots, 16 Nov 2026: a card read ", lũa dã quỳ").
 */
function itemParts(inner: string, name: string): { label: string; aka?: string; html: string } {
  const m = /^\s*<strong>([\s\S]*?)<\/strong>((?:\s*,\s*<strong>[\s\S]*?<\/strong>)*)\s*(?:\(([^()]*)\))?\s*:?\s*/.exec(inner)
    ?? /^\s*([^<:(]+?)()\s*(?:\(([^()]*)\))?\s*:\s*/.exec(inner)
  if (!m) return { label: name, html: upFirst(inner.trim()) }
  const label = plain(m[1]!).replace(/:$/, '').trim() || name
  const aka = [...[...m[2]!.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map(b => plain(b[1]!)), ...(m[3] ? [plain(m[3])] : [])].filter(Boolean).join(', ')
  return { label, ...(aka ? { aka } : {}), html: upFirst(inner.slice(m[0].length).trim()) }
}

/** A kind's text from a capital, its first word's, past any tag it opens with ("pH" stays). */
const upFirst = (html: string) => html.replace(/^((?:\s|<[^>]+>)*)([^\s<]+)/, (_, tags: string, word: string) => tags + capitalFirst(word))

/** A sentence from a capital, unless its first word is written with one inside already ("pH", "dGH"). */
export const capitalFirst = (s: string, locale = 'vi') => {
  const word = s.split(/\s/)[0] ?? ''
  return word === word.toLocaleLowerCase(locale) ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s
}

/** A kind's one line on its card: the first sentence of its text, as plain words, from a capital. */
export function kindLine(html: string): string {
  const text = plain(html.replace(/<(ul|ol)[\s\S]*$/i, ''))
  return capitalFirst(/^.*?[.!?](?=\s|$)/su.exec(text)?.[0] ?? text)
}
