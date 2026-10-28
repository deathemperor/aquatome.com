import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser'

const DROP = new Set(['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'form', 'svg', 'iframe', 'button', 'template'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'dd', 'dt', 'figcaption', 'table', 'ul', 'ol', 'dl', 'figure'])

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function inline(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.rawTagName?.toLowerCase() ?? ''
  if (DROP.has(tag)) return ''
  if (tag === 'br') return ' '
  return node.childNodes.map(inline).join('')
}

function walk(node: Node, out: string[]): void {
  if (!(node instanceof HTMLElement)) {
    const t = clean(node.text)
    if (t) out.push(t)
    return
  }
  const tag = node.rawTagName?.toLowerCase() ?? ''
  if (DROP.has(tag)) return
  const h = /^h([1-6])$/.exec(tag)
  if (h) { const t = clean(inline(node)); if (t) out.push(`${'#'.repeat(Math.min(Number(h[1]), 3))} ${t}`); return }
  if (tag === 'li') { const t = clean(inline(node)); if (t) out.push(`- ${t}`); return }
  if (tag === 'tr') {
    const cells = node.querySelectorAll('th,td').map(c => clean(inline(c)))
    if (cells.some(Boolean)) out.push(`| ${cells.join(' | ')} |`)
    return
  }
  if (tag === 'p' || tag === 'dt' || tag === 'dd' || tag === 'figcaption' || tag === 'blockquote') { const t = clean(inline(node)); if (t) out.push(t); return }
  const hasBlockChild = node.childNodes.some(c => c instanceof HTMLElement && BLOCK.has(c.rawTagName?.toLowerCase() ?? ''))
  if (!hasBlockChild && BLOCK.has(tag)) { const t = clean(inline(node)); if (t) out.push(t); return }
  for (const c of node.childNodes) walk(c, out)
}

export type PageImage = { src: string; alt: string; width?: number; height?: number }

/** Largest candidate: srcset entry with the biggest `w`, else the plain src with its width/height attributes. */
function pageImage(i: HTMLElement): PageImage | null {
  const src = i.getAttribute('src') ?? i.getAttribute('data-src')
  const w = Number(i.getAttribute('width')) || undefined
  const h = Number(i.getAttribute('height')) || undefined
  const set = (i.getAttribute('srcset') ?? i.getAttribute('data-srcset') ?? '').split(',').map(c => c.trim().split(/\s+/)).flatMap(([u, d]) => (u && d?.endsWith('w') ? [{ u, w: Number.parseInt(d) }] : [])).sort((a, b) => b.w - a.w)[0]
  const alt = clean(i.getAttribute('alt') ?? '')
  if (set && (!w || set.w > w)) return { src: set.u, alt, width: set.w, ...(w && h ? { height: Math.round((h * set.w) / w) } : {}) }
  return src ? { src, alt, ...(w ? { width: w } : {}), ...(h ? { height: h } : {}) } : null
}

export function htmlToOutline(html: string, contentSelector?: string): { title: string; outline: string; images: PageImage[] } {
  const root = parse(html, { comment: false })
  const title = clean(root.querySelector('title')?.text ?? root.querySelector('h1')?.text ?? '')
  const scope = (contentSelector && root.querySelector(contentSelector)) || root.querySelector('main') || root.querySelector('article') || root.querySelector('body') || root
  const images = scope.querySelectorAll('img').flatMap(i => pageImage(i) ?? [])
  const out: string[] = []
  walk(scope, out)
  return { title, outline: denoise(out.join('\n')), images }
}

/** Page furniture that changes without the article changing (prices, newsletter, related/featured lists). */
const TAIL = /^#{1,6}\s*(subscribe|recent (blog )?posts|featured products|related (articles|posts|products)|you may also like|more from|newsletter|share this|comments?)\b/i
const PRICE = /\b(regular|sale|unit) price\b|\$\s?\d[\d.,]*(\s?USD)?|€\s?\d[\d.,]*|\b\d[\d.,]*\s?(USD|EUR|€)\b|\b(sold out|variant sold out or unavailable|shipping calculated at checkout\.?|add to cart|in stock|out of stock)(?!\w)/gi

/** Keep the article: cut at the first furniture heading, strip prices and stock words, collapse blank runs. */
export function denoise(outline: string): string {
  const lines = outline.split('\n')
  const cut = lines.findIndex((l, i) => i > 0 && TAIL.test(l))
  return (cut > 0 ? lines.slice(0, cut) : lines)
    .map(l => l.replace(PRICE, '').replace(/\s{2,}/g, ' ').trimEnd())
    .filter((l, i, a) => l.trim() !== '' || (i > 0 && a[i - 1]!.trim() !== ''))
    .join('\n').trim()
}

const CHALLENGE = /just a moment|robot challenge|attention required|verify you are human|checking your browser|sgcaptcha/i
export const isChallenge = (title: string, text: string): boolean => CHALLENGE.test(title) || CHALLENGE.test(text.slice(0, 600))
