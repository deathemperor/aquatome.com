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
export type PageImage = { src: string; alt: string; width?: number; height?: number; displayWidth?: number; displayHeight?: number; product?: true; page?: string; author?: string; credit?: string; heading?: string; link?: string }

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
    return (line && clean(inline(line))) || undefined
  }
  return undefined
}

/**
 * A page that loads its images late keeps a blank placeholder in an image's own address until its script puts the photo
 * in: Aquarium Breeder, 15 Nov 2026, whose driftwood article's four woods read as four blanks, and whose 109 guides held 36
 * photos between them. A blank is an empty address, a `data:` image, or a one-pixel or placeholder file by its name
 * ("blank.gif", "lazy-placeholder.png"). It's never the photo, and only a blank gives way: a real address is always kept
 * (the chief of staff, 15 Nov 2026).
 */
const BLANK_FILE = /^(?:blank|spacer|pixel|1x1|transparent|placeholder|lazy|lazyload|lazy[-_]load|lazy[-_]placeholder)(?:[-_][a-z0-9]+)*\.(?:gif|png|svg|webp)$/i
const fileName = (u: string) => decodeURIComponent(u.split(/[?#]/)[0]!.split('/').pop() ?? '')
const blank = (u: string | undefined) => !u?.trim() || /^data:/i.test(u.trim()) || BLANK_FILE.test(fileName(u.trim()))
const first = (i: HTMLElement, names: string[]) => names.map(n => i.getAttribute(n)).find(u => !blank(u))
const IMAGE_FILE = /\.(jpe?g|png|webp|avif)$/i
const siteOf = (host: string) => host.toLowerCase().replace(/^www\./, '')
/**
 * The link around a blank image, when it is the photo's own file on the page's own site (its host, or a host under its
 * domain such as its media host): never another page, a shop or a third site. Without the page's address, only a link
 * within the page's site (a relative one) is taken.
 */
const fileLink = (i: HTMLElement, pageUrl?: string) => {
  const l = linkOf(i)
  if (!l) return undefined
  try {
    const page = new URL(pageUrl ?? 'https://page.invalid/')
    const to = new URL(l, page)
    if (!IMAGE_FILE.test(to.pathname)) return undefined
    const site = siteOf(page.hostname), host = siteOf(to.hostname)
    return host === site || host.endsWith(`.${site}`) ? l : undefined
  } catch { return undefined }
}

/** A srcset `w` is a file width; width/height attributes only describe the page layout. */
function pageImage(i: HTMLElement, pageUrl?: string): PageImage | null {
  // Its own address first; for a blank, the lazy address (and the lazy set of sizes below), then the link to its file.
  const src = first(i, ['src', 'data-lazy-src', 'data-src', 'data-original']) ?? fileLink(i, pageUrl)
  const w = Number(i.getAttribute('width')) || undefined
  const h = Number(i.getAttribute('height')) || undefined
  const set = (first(i, ['srcset', 'data-lazy-srcset', 'data-srcset']) ?? '').split(',').map(c => c.trim().split(/\s+/)).flatMap(([u, d]) => (u && !blank(u) && d?.endsWith('w') ? [{ u, w: Number.parseInt(d) }] : [])).sort((a, b) => b.w - a.w)[0]
  const alt = clean(i.getAttribute('alt') ?? '')
  if (set && (!w || set.w > w)) return { src: set.u, alt, width: set.w, ...(w ? { displayWidth: w } : {}), ...(h ? { displayHeight: h } : {}) }
  return src ? { src, alt, ...(w ? { displayWidth: w } : {}), ...(h ? { displayHeight: h } : {}) } : null
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

/** `pageUrl`: the page's own address, which an image loaded late may take its photo's file from (`fileLink`). */
export function htmlToOutline(html: string, contentSelector?: string, pageUrl?: string): { title: string; outline: string; images: PageImage[] } {
  const root = parse(html, { comment: false })
  const title = clean(root.querySelector('title')?.text ?? root.querySelector('h1')?.text ?? '')
  const scope = (contentSelector && root.querySelector(contentSelector)) || root.querySelector('main') || root.querySelector('article') || root.querySelector('body') || root
  for (const ad of scope.querySelectorAll(AD_INSERTS)) ad.remove()
  const under = headings(scope)
  const images = scope.querySelectorAll('img').flatMap(i => {
    const p = pageImage(i, pageUrl)
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
