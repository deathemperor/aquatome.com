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

/** `product`: the image sits in a shop product card (class or id naming "product"), e.g. Aquarium Co-Op's product tiles in its articles. */
/**
 * `page`: the photo's own page, when it has one; `author`: the photographer, when the source names one per photo; `credit`:
 * the credit line its source prints under it in its figure (Seriously Fish: a photographer, or a picture agency).
 */
/** `heading`: the heading it sits under (the last one before it), so a guide puts it in the same section. */
/** `link`: where the link around it goes, if one does (source-photos.ts: a link to another article makes it that article's card). */
export type PageImage = { src: string; renditions?: string[]; alt: string; width?: number; height?: number; displayWidth?: number; displayHeight?: number; product?: true; page?: string; author?: string; credit?: string; heading?: string; link?: string }

const PRODUCT_BOX = /product/i
const inProduct = (i: HTMLElement) => {
  for (let n: HTMLElement | null = i; n && n.tagName; n = n.parentNode as HTMLElement | null) if (PRODUCT_BOX.test(`${n.getAttribute?.('class') ?? ''} ${n.getAttribute?.('id') ?? ''}`)) return true
  return false
}

const linkOf = (i: HTMLElement) => {
  for (let n = i.parentNode as HTMLElement | null; n && n.tagName; n = n.parentNode as HTMLElement | null) if (n.rawTagName?.toLowerCase() === 'a') return n.getAttribute('href')
  return undefined
}

/** The credit line in the caption of the figure an image sits in (Seriously Fish: `<figcaption>…<span class="…credit…">`). */
const creditOf = (i: HTMLElement) => {
  for (let n = i.parentNode as HTMLElement | null; n && n.tagName; n = n.parentNode as HTMLElement | null) {
    if (n.rawTagName?.toLowerCase() !== 'figure') continue
    const line = n.querySelector('figcaption [class*="credit"]')
    return (line && clean(dropEmails(inline(line)))) || undefined
  }
  return undefined
}

/** A srcset `w` is a file width; width/height attributes only describe the page layout. */
function pageImage(i: HTMLElement): PageImage | null {
  const src = i.getAttribute('src') ?? i.getAttribute('data-src')
  const w = Number(i.getAttribute('width')) || undefined
  const h = Number(i.getAttribute('height')) || undefined
  const variants = (i.getAttribute('srcset') ?? i.getAttribute('data-srcset') ?? '').split(',')
    .map(candidate => candidate.trim().split(/\s+/))
    .flatMap(([url, descriptor]) => url ? [{ url, width: descriptor?.endsWith('w') ? Number.parseInt(descriptor) : 0 }] : [])
  const largest = variants.filter(candidate => candidate.width > 0).sort((a, b) => b.width - a.width)[0]
  const sized = largest && (!w || largest.width > w) ? largest : undefined
  const chosen = sized?.url ?? src
  if (!chosen) return null
  const renditions = [...new Set([src, ...variants.map(candidate => candidate.url)])].filter((url): url is string => !!url && url !== chosen)
  const alt = clean(dropEmails(i.getAttribute('alt') ?? ''))
  return { src: chosen, alt, ...(sized ? { width: sized.width } : {}), ...(renditions.length ? { renditions } : {}),
    ...(w ? { displayWidth: w } : {}), ...(h ? { displayHeight: h } : {}) }
}

/** The heading each image sits under: the last h1–h4 before it in the page. */
function headings(scope: HTMLElement): Map<HTMLElement, string> {
  const out = new Map<HTMLElement, string>()
  let current = ''
  const visit = (n: Node) => {
    if (!(n instanceof HTMLElement)) return
    const tag = n.rawTagName?.toLowerCase() ?? ''
    if (/^h[1-4]$/.test(tag)) { current = clean(inline(n)); return }
    if (tag === 'img' && current) out.set(n, current)
    n.childNodes.forEach(visit)
  }
  visit(scope)
  return out
}

/**
 * What an ad network puts inside an article once its scripts run (Chrome on a home connection, not GitHub's): Ezoic's
 * video player and display ads (Seriously Fish, 2026-11-03), whose playlist titles and ad labels would be read as the
 * page's text, and its posters, placeholder ("undefined") and "Ezoic" label as its photos.
 */
const AD_INSERTS = '.humix-universal-js-insert, .ez-video-wrap, .ezoic-ad, [id^="ezoic-pub-ad-placeholder"]'

/**
 * A page's comments: the box readers write in, with each commenter's name, words and picture. Never the article: on 16 Nov
 * Aquarium Breeder's comments were found read as its text (78 stored copies, readers' questions in 7 published guides), and
 * only the size floor kept its commenters' pictures from the photo picker. The usual WordPress boxes, then any picture left.
 */
const COMMENTS = '#comments, .comments-area, #respond, .comment-respond, .comment-list, .commentlist, .wp-block-comments, .wp-block-post-comments, img.avatar'

/**
 * An email address: a writer's in a forum post's header ("From: … (address) Date: …"), or one asking readers to write. A
 * person's, never the article's, and the repository is public: never kept (six stored files held one on 17 Nov), in the
 * text, the title, a picture's alt text or its credit. In brackets, the brackets go too. Letters of any language before
 * and after the "@", and a quoted name before it, are one; a picture's name ("@2x.png") isn't, nor anything inside a web
 * address (".../photos/fish@archive.example.com"), which stays whole (Codex's reads, 17 Nov).
 */
const ADDRESS = String.raw`(?:mailto:)?(?<![\p{L}\p{M}\p{N}._%+/-])(?:"[^"\n]{1,64}"|[\p{L}\p{M}\p{N}._%+-]+)@[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)*\.(?!(?:png|jpe?g|gif|webp|svg|avif|bmp|tiff?|heic|heif)(?![\p{L}\p{N}]))\p{L}{2,}(?![\p{L}\p{M}\p{N}-])`
const EMAIL = new RegExp(String.raw`\s*[(<[]\s*${ADDRESS}\s*[)>\]]|${ADDRESS}`, 'giu')
/** A web address, kept whole: an "@" in it is its own. */
const WEB = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
/** An "@" or a quote written as a character reference, as a page's markup may hold them before anything decodes it. */
const AT = /&#0*64;|&#x0*40;|&commat;/gi
const QUOTE = /&quot;|&#0*34;|&#x0*22;/gi
/** A text without its email addresses (EMAIL). Only one with an "@" is looked at: a long run of letters costs nothing. */
export const dropEmails = (s: string): string => {
  const t = s.replace(AT, '@').replace(QUOTE, '"')
  if (!t.includes('@')) return s
  let out = '', at = 0
  for (const m of t.matchAll(WEB)) { out += t.slice(at, m.index).replace(EMAIL, '') + m[0]; at = m.index + m[0].length }
  out += t.slice(at).replace(EMAIL, '')
  // A text with no address stays as it was, character references and all: a stored copy's hash moves only for an address.
  return out === t ? s : out
}

export function htmlToOutline(html: string, contentSelector?: string): { title: string; outline: string; images: PageImage[] } {
  const root = parse(html, { comment: false })
  const title = clean(dropEmails(root.querySelector('title')?.text ?? root.querySelector('h1')?.text ?? ''))
  const scope = (contentSelector && root.querySelector(contentSelector)) || root.querySelector('main') || root.querySelector('article') || root.querySelector('body') || root
  for (const ad of scope.querySelectorAll(AD_INSERTS)) ad.remove()
  for (const box of scope.querySelectorAll(COMMENTS)) box.remove()
  const under = headings(scope)
  const images = scope.querySelectorAll('img').flatMap(i => {
    const p = pageImage(i)
    const heading = under.get(i)
    const link = linkOf(i)
    const credit = creditOf(i)
    return p ? [{ ...p, ...(inProduct(i) ? { product: true as const } : {}), ...(heading ? { heading } : {}), ...(link ? { link } : {}), ...(credit ? { credit } : {}) }] : []
  })
  const out: string[] = []
  walk(scope, out)
  return { title, outline: denoise(out.join('\n')), images }
}

/** Page furniture that changes without the article changing (prices, newsletter, related/featured lists). */
const TAIL = /^#{1,6}\s*(subscribe|recent (blog )?posts|featured products|related (articles|posts|products)|you may also like|more from|newsletter|share this|comments?|(\d+|one)\s+(thoughts?|comments?|responses?|replies)\s+(on|to)(?=\s*["“‘'])|leave a (reply|comment))\b/i
const PRICE = /\b(regular|sale|unit) price\b|\$\s?\d[\d.,]*(\s?USD)?|€\s?\d[\d.,]*|\b\d[\d.,]*\s?(USD|EUR|€)\b|\b(sold out|variant sold out or unavailable|shipping calculated at checkout\.?|add to cart|in stock|out of stock)(?!\w)/gi

/** Keep the article: cut at the first furniture heading, strip prices, stock words and email addresses, collapse blank runs. */
export function denoise(outline: string): string {
  const lines = outline.split('\n')
  const cut = lines.findIndex((l, i) => i > 0 && TAIL.test(l))
  return (cut > 0 ? lines.slice(0, cut) : lines)
    .map(l => dropEmails(l).replace(PRICE, '').replace(/\s{2,}/g, ' ').trimEnd())
    .filter((l, i, a) => l.trim() !== '' || (i > 0 && a[i - 1]!.trim() !== ''))
    .join('\n').trim()
}

const CHALLENGE = /just a moment|robot challenge|attention required|verify you are human|checking your browser|sgcaptcha/i
export const isChallenge = (title: string, text: string): boolean => CHALLENGE.test(title) || CHALLENGE.test(text.slice(0, 600))
