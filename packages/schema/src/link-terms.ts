import { parse } from 'node-html-parser'
import { escapeHtml, escapeRe, textNodes } from './glossary-link'

/** Something a page can link to: any of `names` in the text links to `href`. `exact`: match case too (Latin genus/family names). */
export type LinkTarget = { key: string; href: string; names: string[]; exact?: boolean }

/**
 * Links the first occurrence of each target in the text (outside links, headings and code), longest name first at any
 * position, in one pass. `seen` carries across calls so a page links each target once; returns the keys linked, in order.
 */
export function linkTerms(html: string, targets: LinkTarget[], cls: string, seen: Set<string> = new Set()): { html: string; keys: string[] } {
  const byName = new Map<string, LinkTarget>()
  for (const t of targets) for (const n of t.names) if (n.trim() && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), t)
  if (!byName.size) return { html, keys: [] }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRe)
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
  const root = parse(html)
  const keys: string[] = []
  for (const node of textNodes(root)) {
    let hit = false
    const next = node.rawText.replace(re, m => {
      const t = byName.get(m.toLowerCase())
      if (!t || seen.has(t.key) || (t.exact && !t.names.includes(m))) return m
      seen.add(t.key)
      keys.push(t.key)
      hit = true
      return `<a href="${escapeHtml(t.href)}" class="${cls}">${m}</a>`
    })
    if (hit) node.rawText = next
  }
  return { html: keys.length ? root.toString() : html, keys }
}
