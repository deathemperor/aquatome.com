import { parse, type HTMLElement } from 'node-html-parser'
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

const genera = new WeakMap<LinkTarget[], Set<string>>()
const generaOf = (targets: LinkTarget[]) => genera.get(targets) ?? genera.set(targets, new Set(targets.filter(t => t.key.startsWith('genus:')).flatMap(t => t.names))).get(targets)!

/** Pages about one living thing: a species, a plant, a man-made fish. */
const SUBJECT = /^(species|plant|breed):/
/** A scientific name in brackets, "(Paracheirodon simulans)". */
const BRACKETED = /\(\s*([A-Z][a-z]+ [a-z]{3,}(?: [a-z]{3,})?)\s*\)/g
const headingText = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Names this page gives a species by its scientific name in brackets ("Cá neon xanh (Paracheirodon simulans)", in a
 * heading or the text): on this page the name means that species, wherever it appears, though the site gives it to
 * another (P. innesi is "Cá neon xanh") or to nothing yet ("Cá cherry barb"). A species without a page here, in a genus
 * the site has, takes the name off the species that has it: no link rather than the wrong fish.
 */
function bracketed(root: HTMLElement, targets: LinkTarget[], m: { byName: Map<string, LinkTarget>; re: RegExp }): Map<string, LinkTarget | null> {
  const out = new Map<string, LinkTarget | null>()
  const text = root.textContent
  if (!text.includes('(')) return out
  const genera = generaOf(targets)
  /** Where a scientific name points: its page; null for a species without one in a genus the site has; else undefined. */
  const target = (sci: string) => {
    const said = m.byName.get(sci.toLowerCase())
    return said && SUBJECT.test(said.key) ? said : genera.has(sci.split(' ')[0]!) ? null : undefined
  }
  const decide = (to: LinkTarget | null, names: string[]) => {
    for (const n of names) {
      const had = m.byName.get(n.toLowerCase())
      // Only a fish's or plant's name moves ("cá tetra (Paracheirodon innesi)" leaves the group's page its name).
      if (had === to || (had && !SUBJECT.test(had.key)) || (!had && to === null)) continue
      out.set(n.toLowerCase(), to)
    }
  }
  // In the text: the site's longest name for something that ends right before the brackets (up to six words back).
  for (const b of text.matchAll(BRACKETED)) {
    const to = target(b[1]!)
    if (to === undefined) continue
    const words = text.slice(Math.max(0, b.index - 80), b.index).trimEnd().split(/\s+/)
    for (let k = Math.min(6, words.length); k >= 1; k--) {
      const n = words.slice(-k).join(' ').replace(/^[^\p{L}\p{N}]+/u, '')
      if (m.byName.has(n.toLowerCase())) { decide(to, [n]); break }
    }
  }
  // In a heading ("8. Cá cherry barb (Puntius titteya)", "Cá chuột / cory (…)"): every name it gives, of two words or more.
  for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const t = headingText(h.textContent)
    for (const b of t.matchAll(BRACKETED)) {
      const to = target(b[1]!)
      if (to === undefined) continue
      decide(to, t.slice(0, b.index).replace(/^\d{1,2}[.):]\s*/, '').split(/\s+\/\s+|\s+-\s+/).map(x => x.trim()).filter(x => x.split(/\s+/).length >= 2))
    }
  }
  return out
}

/** The one species, plant or man-made fish a heading is about: its scientific name in brackets, else the only one it names. */
export function headingSubject(heading: string, targets: LinkTarget[]): LinkTarget | undefined {
  const m = matcher(targets)
  if (!m) return undefined
  const t = headingText(heading)
  for (const b of t.matchAll(BRACKETED)) {
    const s = m.byName.get(b[1]!.toLowerCase())
    if (s && SUBJECT.test(s.key)) return s
    if (generaOf(targets).has(b[1]!.split(' ')[0]!)) return undefined // a species the site has no page for ("kuhli loach (Pangio kuhlii)")
  }
  const named = new Set<LinkTarget>()
  for (const x of t.matchAll(m.re)) { const s = m.byName.get(x[0].toLowerCase()); if (s && SUBJECT.test(s.key)) named.add(s) }
  return named.size === 1 ? [...named][0] : undefined
}

/** `skip`: lowercased names never linked on this page (its own names, which may also belong to another page). */
export function linkTerms(html: string, targets: LinkTarget[], cls: string, seen: Set<string> = new Set(), skip: Set<string> = new Set()): { html: string; keys: string[] } {
  const m0 = matcher(targets)
  if (!m0) return { html, keys: [] }
  const root = parse(html)
  const alias = bracketed(root, targets, m0)
  // A name the site doesn't know yet joins the page's names for this page only.
  const extra = [...alias].filter(([n, t]) => t && !m0.byName.has(n)).map(([n, t]) => ({ ...t!, names: [n] }))
  const { byName, re } = extra.length ? matcher([...extra, ...targets])! : m0
  const keys: string[] = []
  for (const node of textNodes(root)) {
    let hit = false
    const next = node.rawText.replace(re, m => {
      const t = alias.has(m.toLowerCase()) ? alias.get(m.toLowerCase()) : byName.get(m.toLowerCase())
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
