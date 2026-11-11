import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser'
import { ownNumber } from '@aq/schema'

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

/**
 * Words the models write one way and Vietnamese readers another (prompts/vi-style.md), each with the way to write it. At
 * the start of a sentence, a block or the text, the word takes a capital.
 * - "Phi châu": a continent is "châu Phi", as "châu Á" and "châu Âu" (the council's review of the home page, 2026-11-06:
 *   "Cá Oscar (cá tai tượng Phi châu)"; the name's own evidence writes "cá tai tượng châu Phi"). "Cá rô phi châu Phi",
 *   African tilapia, stays.
 * - "setup bể": the hobby says "set bể" (vi-style.md; the council's review: the betta guide's title "Cách setup bể cá
 *   betta đẹp"). "Setup" anywhere else ("setup một bể", a creator's own "SETUP Bể" title) stays.
 * - "chỉtiêu": two words a translation ran together ("que thử đa chỉ tiêu", the tank-cycling guide; a design lab,
 *   2026-11-07). The content rule `glued` lists any other such word for a person, who adds it here.
 * - "và/hoặc": English's "and/or", which Vietnamese writes "hoặc" (the editors' first round, 2026-11-07: "nước mềm
 *   và/hoặc nước có tính axit"; 102 pages had it, and neither a hobbyists' forum nor their videos ever write it).
 * - "cá thài lài": no Vietnamese keeper calls a fish that (the owner, 2026-11-11, on the honey gourami's page: "Cá thài
 *   lài doesn't exist in Vietnamese"; the keepers' forum and videos never write it, and "thài lài" is a plant, the
 *   dayflower). The fish it named are written by their names on the site, a gourami otherwise "cá sặc". The content rule
 *   `fish-words` lists any other "thài lài" said of a fish ("họ thài lài", "nuôi thài lài"), for the page to be written again.
 * - "trùn chỉ đỏ", "nửa tá (con)", "thủng lỗ đầu": the reader check's wording findings on top-card pages (2026-11-08), which
 *   the keepers' forum never writes; it writes "trùng huyết", "6 con" and "lủng đầu" (the chief of staff, 2026-11-12). Every
 *   "trùn chỉ đỏ" on the site was read in its sentence: each is the bloodworm, a midge larva, as the site already says
 *   "trùng huyết" 1,079 times ("trùn chỉ" alone is Tubifex, another worm, and stays). A sentence that already gave both
 *   ("trùn chỉ đỏ/trùn huyết", "trùn chỉ đỏ, hay trùng huyết") keeps one.
 * No capture groups in `find`: viWording reads the match's offset as the replacer's second argument.
 */
const THAI_LAI = (qualifier: string) => new RegExp(`(?<!\\p{L})[Cc]á thài lài ${qualifier}(?!\\p{L})`, 'gu')
const WORDING: { find: RegExp; use: string }[] = [
  // The fish the word named, most specific first: a qualifier that goes on ("kêu Mekong") before the one it starts with.
  { find: THAI_LAI('mật(?: ong)?'), use: 'cá sặc mật ong' },
  { find: THAI_LAI('kêu Mekong'), use: 'cá gourami kêu Mekong' },
  { find: THAI_LAI('[Ss]challer'), use: 'cá gourami kêu Mekong' },
  { find: THAI_LAI('kêu'), use: 'cá bã trầu' },
  { find: THAI_LAI('đuôi đỏ'), use: 'cá liquorice gourami phoenicurus' },
  { find: THAI_LAI('quý tộc'), use: 'cá Ctenops nobilis' },
  { find: THAI_LAI('linkei'), use: 'cá liquorice gourami linkei' },
  { find: THAI_LAI('xanh'), use: 'cá sặc bướm' },
  { find: THAI_LAI('ba chấm'), use: 'cá sặc ba chấm' },
  { find: THAI_LAI('sô-cô-la'), use: 'cá chocolate gourami' },
  { find: THAI_LAI('lùn'), use: 'cá sặc lùn' },
  { find: THAI_LAI('ánh trăng'), use: 'cá sặc trăng' },
  { find: THAI_LAI('ngọc trai'), use: 'cá sặc ngọc trai' },
  { find: THAI_LAI('lấp lánh'), use: 'cá thanh ngọc lùn' },
  { find: THAI_LAI('da rắn'), use: 'cá sặc rằn' },
  { find: /(?<!\p{L})[Cc]á thài lài(?!\p{L})/gu, use: 'cá sặc' },
  { find: /(?<!\p{L})(?<![Rr]ô )[Pp]hi châu(?!\p{L})(?! Phi)/gu, use: 'châu Phi' },
  { find: /(?<!\p{L})[Ss]etup bể(?!\p{L})/gu, use: 'set bể' },
  { find: /(?<!\p{L})[Cc]hỉtiêu(?!\p{L})/gu, use: 'chỉ tiêu' },
  { find: /(?<!\p{L})[Vv]à\s*\/\s*hoặc(?!\p{L})/gu, use: 'hoặc' },
  { find: /(?<!\p{L})[Tt]rùn chỉ đỏ(?:\s*\/\s*|,\s*hay\s+)tr(?:ùng|ùn) huyết(?!\p{L})/gu, use: 'trùng huyết' },
  { find: /(?<!\p{L})[Tt]rùn chỉ đỏ \(tr(?:ùng|ùn) huyết, (?=tức )/gu, use: 'trùng huyết (' },
  { find: /(?<!\p{L})[Tt]rùn chỉ đỏ(?!\p{L})/gu, use: 'trùng huyết' },
  { find: /(?<!\p{L})[Nn]ửa tá(?: con(?!\p{L})|(?=\s*(?:[.,;:!?)]|$)))/gu, use: '6 con' },
  { find: /(?<!\p{L})[Tt]hủng lỗ đầu(?!\p{L})/gu, use: 'lủng đầu' },
]
const SENTENCE_START = /(?:^\s*|[.!?…]\s+|<(?:p|li|h3|td|th)>\s*)$/

/** Text (plain or HTML) with the words in WORDING written the way Vietnamese readers write them. */
export const viWording = (s: string) => WORDING.reduce((out, w) =>
  out.replace(w.find, (_m, at: number, all: string) => (SENTENCE_START.test(all.slice(0, at)) ? w.use[0]!.toUpperCase() + w.use.slice(1) : w.use)), s)

/**
 * "thài lài" said of a fish, which no Vietnamese keeper writes (WORDING): each, with a few words before it. The plant
 * keeps it: "cỏ/rau/cây/hoa thài lài", the dayflowers' family "họ Thài lài" with its capital, "thài lài tía".
 */
export const fishThaiLai = (s: string) => [...s.matchAll(/(?<!\p{L})thài lài(?!\p{L})(?! tía)/giu)].flatMap(m => {
  const at = m.index!
  const before = s.slice(Math.max(0, at - 6), at)
  const plant = /(?<!\p{L})(?:cỏ|rau|cây|hoa)\s+$/iu.test(before) || (/(?<!\p{L})họ\s+$/iu.test(before) && m[0][0] === 'T')
  const from = Math.max(0, at - 20)
  return plant ? [] : [`"${from ? s.slice(from, at + m[0].length).replace(/^\S*\s/, '') : s.slice(0, at + m[0].length)}"`]
})

/**
 * Each word in WORDING a text has, and what viWording writes instead: `"Phi châu" → "châu Phi"`. In WORDING's order, on
 * the text as each earlier one left it, so a name is listed once ("cá thài lài mật", not its "cá thài lài" again).
 */
export const wordingSlips = (s: string) => WORDING.reduce<{ text: string; slips: string[] }>((acc, w) => ({
  text: acc.text.replace(w.find, w.use), slips: [...acc.slips, ...[...acc.text.matchAll(w.find)].map(m => `"${m[0]}" → "${w.use}"`)],
}), { text: s, slips: [] }).slips

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
  const num = hs.map(h => ownNumber(h.text))
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
