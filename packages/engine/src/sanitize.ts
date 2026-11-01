import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser'

const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math'])
const BLOCK = new Set(['p', 'ul', 'ol', 'h3', 'table'])
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** "Tác giả: Martin Thoene. Chỉnh sửa lần cuối…": the source article's byline. Pages never name the author; the source is credited under the page. */
const BYLINE = /^\s*tác giả\s*:/i

function render(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return esc(node.text)
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.rawTagName?.toLowerCase() ?? ''
  if (DROP_WITH_CONTENT.has(tag) || (tag === 'p' && BYLINE.test(node.text))) return ''
  const inner = node.childNodes.map(render).join('')
  if (tag === 'br') return '<br>'
  return ALLOWED.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
}

/** Allow-list sanitiser for translated HTML: no attributes, no active content; then tidied (tidyHtml). */
export function sanitizeHtml(html: string): string {
  const root = parse(html, { comment: false })
  const out = root.childNodes.map(render).join('').trim()
  const hasBlock = root.childNodes.some(n => n instanceof HTMLElement && BLOCK.has(n.rawTagName?.toLowerCase() ?? ''))
  return tidyHtml(out && !hasBlock ? `<p>${out}</p>` : out)
}

/**
 * The content rules' safe fixes (content-rules.ts), made whenever the engine writes HTML, and by `pnpm engine audit --fix`
 * on what is stored: a numbered list's headings, entities escaped twice, empty blocks.
 */
export const tidyHtml = (html: string) => tidyHeadings(dropEmptyBlocks(unescapeTwice(html)))

/** "&amp;amp;", "&amp;lt;": an entity escaped twice shows as "&amp;" or "&lt;" on the page. Once is enough. */
export const unescapeTwice = (html: string) => {
  let out = html
  for (let prev = ''; prev !== out;) { prev = out; out = out.replace(/&amp;(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, '&$1;') }
  return out
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
/**
 * Plain text (a page's name, a summary point, an FAQ) holds no entities: the site escapes plain text itself, so a model's
 * "&amp;" reads "&amp;" on the page (2026-11-01, an Indonesian guide's title "Cacing Jangkar &amp; Kutu Ikan").
 */
export const unescapePlain = (s: string) => {
  let out = s
  for (let prev = ''; prev !== out;) {
    prev = out
    out = out.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return ENTITY[e.toLowerCase()]!
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m // not a character: left as written
    })
  }
  return out
}

/** A written page's summary points and FAQ, as plain text: trimmed, entities undone, empty ones dropped. */
export const plainParts = (summary: string[], faq: { q: string; a: string }[]) => ({
  summary: summary.map(s => unescapePlain(s).trim()).filter(Boolean),
  faq: faq.map(f => ({ q: unescapePlain(f.q).trim(), a: unescapePlain(f.a).trim() })).filter(f => f.q && f.a),
})

/** A heading, paragraph or list item with nothing in it, and a list left with no items. */
export const dropEmptyBlocks = (html: string) => {
  let out = html
  for (let prev = ''; prev !== out;) { prev = out; out = out.replace(/<(h3|p|li|ul|ol)>(?:\s|&nbsp;|\u00a0|<br>)*<\/\1>/g, '') }
  return out
}

/** A heading's own number: "#3 …", "3. …", "3) …", "Bước 3", "Top 3" (a heading that merely starts with a count, "10 loại cây", has none). */
export const OWN_NUMBER = /^(?:#\s?(\d+)|(\d+)[.):]\s|(?:top|bước|step|langkah|อันดับ|ขั้นที่)\s?(\d+)\b)/iu

/**
 * A heading with no number of its own between two numbered ones that follow each other (#3, "Xtreme Betta Pellets",
 * #4) belongs to the item above it: it becomes that item's bold lead line, so neither the text nor the page's contents
 * read it as one more item (2026-11-01, the betta foods guide's contents listed a pellet brand between #3 and #4).
 * Countdowns (5, 4, 3) count the same way; an introduction or conclusion outside the run stays a heading.
 */
export function tidyHeadings(html: string): string {
  if (!html.includes('<h3>')) return html
  const root = parse(html)
  const hs = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement && n.rawTagName === 'h3')
  const num = hs.map(h => { const m = h.text.trim().match(OWN_NUMBER); return m ? Number(m[1] ?? m[2] ?? m[3]) : undefined })
  const known = num.filter((n): n is number => n !== undefined)
  if (known.length < 2) return html
  const steps = known.slice(1).map((n, i) => Math.sign(n - known[i]!))
  const dir = steps.filter(s => s < 0).length > steps.filter(s => s > 0).length ? -1 : 1
  let changed = false
  hs.forEach((h, i) => {
    if (num[i] !== undefined) return
    const before = num.slice(0, i).filter(n => n !== undefined).at(-1)
    const after = num.slice(i + 1).find(n => n !== undefined)
    if (before === undefined || after === undefined || after - before !== dir) return
    h.replaceWith(`<p><strong>${h.innerHTML}</strong></p>`)
    changed = true
  })
  return changed ? root.toString() : html
}
