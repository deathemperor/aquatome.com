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

export function htmlToOutline(html: string, contentSelector?: string): { title: string; outline: string; images: { src: string; alt: string }[] } {
  const root = parse(html, { comment: false })
  const title = clean(root.querySelector('title')?.text ?? root.querySelector('h1')?.text ?? '')
  const scope = (contentSelector && root.querySelector(contentSelector)) || root.querySelector('main') || root.querySelector('article') || root.querySelector('body') || root
  const images = scope.querySelectorAll('img').flatMap(i => {
    const src = i.getAttribute('src') ?? i.getAttribute('data-src')
    return src ? [{ src, alt: clean(i.getAttribute('alt') ?? '') }] : []
  })
  const out: string[] = []
  walk(scope, out)
  return { title, outline: out.join('\n'), images }
}

const CHALLENGE = /just a moment|robot challenge|attention required|verify you are human|checking your browser/i
export const isChallenge = (title: string, text: string): boolean => CHALLENGE.test(title) || CHALLENGE.test(text.slice(0, 600))
