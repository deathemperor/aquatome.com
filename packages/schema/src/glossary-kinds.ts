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
  const out: { id: string; name: string }[] = []
  let within = false
  for (const el of parse(body).childNodes) {
    if (!(el instanceof HTMLElement)) continue
    const tag = el.rawTagName?.toLowerCase() ?? ''
    if (/^h[1-6]$/.test(tag)) {
      if (within) break
      within = KINDS.test(el.text.trim())
      continue
    }
    if (!within || (tag !== 'ul' && tag !== 'ol')) continue
    for (const li of el.childNodes) {
      if (!(li instanceof HTMLElement) || li.rawTagName?.toLowerCase() !== 'li') continue
      // The item's own words, before any list inside it; entities decoded.
      const own = li.childNodes.filter(n => !(n instanceof HTMLElement && /^(ul|ol)$/i.test(n.rawTagName ?? ''))).map(n => n.text).join('')
      const name = own.split(/:|\s\(|,|\s[–-]\s/)[0]!.trim()
      const id = slugify(name)
      if (id && !out.some(k => k.id === id)) out.push({ id, name })
    }
  }
  return out
}
