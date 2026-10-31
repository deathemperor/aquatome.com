import { parse } from 'node-html-parser'
import { escapeHtml, escapeRe, textNodes } from './glossary-link'

/**
 * Something a page can link to: any of `names` in the text links to `href`. `exact`: match case too (Latin genus/family names). `cls` overrides the link class.
 * `tip`: a short explanation the page shows when the link is hovered or tapped (glossary terms), as data-term / data-tip.
 */
export type LinkTarget = { key: string; href: string; names: string[]; exact?: boolean; cls?: string; tip?: { term: string; text: string } }

/**
 * Links the first occurrence of each target in the text (outside links, headings and code), longest name first at any
 * position, in one pass. `seen` carries across calls so a page links each target once; returns the keys linked, in order.
 */
const matchers = new WeakMap<LinkTarget[], { byName: Map<string, LinkTarget>; re: RegExp } | null>()
function matcher(targets: LinkTarget[]) {
  if (matchers.has(targets)) return matchers.get(targets)!
  const byName = new Map<string, LinkTarget>()
  for (const t of targets) for (const n of t.names) if (n.trim() && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), t)
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRe)
  const m = byName.size ? { byName, re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu') } : null
  matchers.set(targets, m) // one compiled matcher per targets array (a build reuses the same one for every page)
  return m
}

/** `skip`: lowercased names never linked on this page (its own names, which may also belong to another page). */
export function linkTerms(html: string, targets: LinkTarget[], cls: string, seen: Set<string> = new Set(), skip: Set<string> = new Set()): { html: string; keys: string[] } {
  const m = matcher(targets)
  if (!m) return { html, keys: [] }
  const { byName, re } = m
  const root = parse(html)
  const keys: string[] = []
  for (const node of textNodes(root)) {
    let hit = false
    const next = node.rawText.replace(re, m => {
      const t = byName.get(m.toLowerCase())
      if (!t || seen.has(t.key) || skip.has(m.toLowerCase()) || (t.exact && !t.names.includes(m))) return m
      seen.add(t.key)
      keys.push(t.key)
      hit = true
      const tip = t.tip ? ` data-term="${escapeHtml(t.tip.term)}" data-tip="${escapeHtml(t.tip.text)}"` : ''
      return `<a href="${escapeHtml(t.href)}" class="${t.cls ?? cls}"${tip}>${m}</a>`
    })
    if (hit) node.rawText = next
  }
  return { html: keys.length ? root.toString() : html, keys }
}
