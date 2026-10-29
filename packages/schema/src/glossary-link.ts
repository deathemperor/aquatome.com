import { HTMLElement, NodeType, parse, type Node, type TextNode } from 'node-html-parser'

export type GlossaryLinkTerm = { name: string; href: string }

const SKIP = new Set(['a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'script', 'style', 'code'])
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function textNodes(node: Node, out: TextNode[] = []): TextNode[] {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) out.push(child as TextNode)
    else if (child instanceof HTMLElement && !SKIP.has(child.rawTagName?.toLowerCase())) textNodes(child, out)
  }
  return out
}

/** Links the first occurrence of each glossary term (longest first) outside links, headings and attributes. */
export function linkGlossary(html: string, terms: GlossaryLinkTerm[], seen: Set<string> = new Set()): string {
  let out = html
  for (const term of [...terms].sort((a, b) => b.name.length - a.name.length)) {
    if (seen.has(term.href)) continue
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term.name)}(?![\\p{L}\\p{N}])`, 'iu')
    const root = parse(out)
    const hit = textNodes(root).find(t => re.test(t.rawText))
    if (!hit) continue
    hit.rawText = hit.rawText.replace(re, m => `<a href="${escapeHtml(term.href)}" class="gl">${m}</a>`)
    out = root.toString()
    seen.add(term.href)
  }
  return out
}
