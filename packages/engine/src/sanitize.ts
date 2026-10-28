import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser'

const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math'])
const BLOCK = new Set(['p', 'ul', 'ol', 'h3', 'table'])
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function render(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return esc(node.text)
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.rawTagName?.toLowerCase() ?? ''
  if (DROP_WITH_CONTENT.has(tag)) return ''
  const inner = node.childNodes.map(render).join('')
  if (tag === 'br') return '<br>'
  return ALLOWED.has(tag) ? `<${tag}>${inner}</${tag}>` : inner
}

/** Allow-list sanitiser for translated HTML: no attributes, no active content. */
export function sanitizeHtml(html: string): string {
  const root = parse(html, { comment: false })
  const out = root.childNodes.map(render).join('').trim()
  const hasBlock = root.childNodes.some(n => n instanceof HTMLElement && BLOCK.has(n.rawTagName?.toLowerCase() ?? ''))
  return out && !hasBlock ? `<p>${out}</p>` : out
}
