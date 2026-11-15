import { slugify } from './slug'

/**
 * A term's kinds as its entry writes them: each item of the list under its "Các loại …" or "Các dạng …" heading, by the
 * name before its colon, bracket, comma or dash ("<strong>Lũa đỗ quyên</strong> (spider wood): …" is "Lũa đỗ quyên"; an
 * item naming two woods, "Lũa hải sơn tùng, lũa ngọc linh sam: …", is the first's). `id`: that name slugged, the key a
 * kind's own photo is filed under (GlossarySchema `kinds`). The owner, 15 Nov 2026, of the glossary: "what does each look
 * like?"; the chief of staff: where a term names kinds, each kind has its own picture beside its name.
 */
export function glossaryKinds(body: string): { id: string; name: string }[] {
  const list = /<h3>\s*Các (?:loại|dạng)\b[^<]*<\/h3>([\s\S]*?)(?=<h3>|$)/i.exec(body)?.[1] ?? ''
  const out: { id: string; name: string }[] = []
  for (const m of list.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const name = m[1]!.replace(/<[^>]+>/g, '').split(/:|\s\(|,|\s[–-]\s/)[0]!.trim()
    const id = slugify(name)
    if (id && !out.some(k => k.id === id)) out.push({ id, name })
  }
  return out
}
