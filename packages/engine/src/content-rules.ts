import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HTMLElement, parse } from 'node-html-parser'
import { imperialLeft, type DataCardField, type Lang } from '@aq/schema'
import { BOUNDS } from './process'
import { dropEmptyBlocks, OWN_NUMBER, tidyHeadings, tidyHtml, unescapePlain, unescapeTwice } from './sanitize'
import type { Page } from './pages'

/**
 * Rules every published page is checked against, every cycle, in each language (`pnpm engine audit`). Each is a small
 * function from a page to what it found there. A rule never holds a page back. What it can fix safely is fixed whenever
 * the engine writes a page (sanitize.ts tidyHtml, unescapePlain), and on every page each cycle before the build
 * (`pnpm engine sweep`, sweep.ts: the rules in RATCHETED, which the real-content test holds at zero); the rest is listed
 * in docs/review/content-rules.md. A mistake found by hand once becomes a rule here, so it is caught on every page from
 * then on.
 */
export type Rule = {
  id: string
  title: string
  /** What the rule looks for, for the report. */
  about: string
  check: (p: Page, ctx: Ctx) => string[]
}
/** `genera`: every genus the site has a page in; `species`: every Latin name with a page, lower case. */
export type Ctx = { genera: Set<string>; species: Set<string> }
export type Finding = { rule: string; page: Page; detail: string }

const YEAR = /\b(1[789]\d\d|20[0-2]\d)\b/
/** A heading over the sources' list of papers and books. */
const REFS_HEADING = /^(tài liệu tham khảo|tham khảo|nguồn tham khảo|references?|bibliography|referensi|daftar pustaka|เอกสารอ้างอิง|อ้างอิง)\s*:?$/i
/**
 * The innermost blocks of some HTML (headings, paragraphs, list items, table cells) as text, in order. `refs`: a block of
 * a reference list (under a "Tài liệu tham khảo" heading, or a list whose items carry years), written in the papers' own
 * language.
 */
export function blocks(html: string): { tag: string; text: string; refs: boolean }[] {
  const root = parse(html)
  const refLists = root.querySelectorAll('ul, ol').filter(l => l.querySelectorAll('li').filter(li => YEAR.test(li.text)).length >= 2)
  const inside = (el: HTMLElement, l: HTMLElement) => { for (let n: HTMLElement | null = el; n; n = n.parentNode) if (n === l) return true; return false }
  let underRefs = false
  return root.querySelectorAll('h3, p, li, td, th')
    .filter(el => !el.querySelector('h3, p, li, td, th, ul, ol'))
    .map(el => {
      const t = el.text.replace(/\s+/g, ' ').trim()
      if (el.rawTagName === 'h3') underRefs = REFS_HEADING.test(t)
      return { tag: el.rawTagName, text: t, refs: underRefs || refLists.some(l => inside(el, l)) }
    })
    .filter(b => b.text)
}
/** A field's text, one block a line. */
const lines = (html: string) => blocks(html).map(b => b.text).join('\n')
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
/** The page's own text, without the sources' reference sections (titles of papers, in their own language). */
const prose = (p: Page) => p.fields.filter(f => !f.field.startsWith('sections.references'))
const headings = (html: string) => parse(html).childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement && n.rawTagName === 'h3')
const ownNumber = (heading: string) => { const m = heading.trim().match(OWN_NUMBER); return m ? Number(m[1] ?? m[2] ?? m[3]) : undefined }

/** Numbered headings in order, split into runs: a run ends where the numbers start again from 1. Each run's length is its highest number. */
export function numberedRuns(hs: string[]): number[] {
  const runs: number[] = []
  let cur = 0
  for (const n of hs.map(ownNumber)) {
    if (n === undefined) continue
    if (n === 1 && cur) { runs.push(cur); cur = 1 } else cur = Math.max(cur, n)
  }
  if (cur) runs.push(cur)
  return runs.filter(n => n > 1)
}

/** "2 → 4", "3 twice": a number missing or repeated in a run of numbered headings counting up (1, 2, 3…). */
export function numberSlips(hs: string[]): string[] {
  const nums = hs.map(ownNumber).filter((n): n is number => n !== undefined)
  const out: string[] = []
  for (let i = 1; i < nums.length; i++) {
    const [a, b] = [nums[i - 1]!, nums[i]!]
    if (b === 1 || b < a - 1 || b === a - 1) continue // a new run, or a countdown
    if (b === a) out.push(`${a} twice`)
    else if (b > a + 1) out.push(`${a} → ${b}`)
  }
  return out
}

const COUNT_NOUN = 'loại|loài|cách|mẹo|bước|lý do|sai lầm|dấu hiệu|cây|cá|điều|thứ|ý tưởng|câu hỏi|nguyên nhân|lưu ý|bí quyết|jenis|cara|tips?|langkah|alasan|kesalahan|tanda|ikan|tanaman|hal|ชนิด|วิธี|ข้อ|เคล็ดลับ|สัญญาณ|สายพันธุ์|ขั้นตอน|ways|types|species|signs|reasons|mistakes|steps'
const COUNT = new RegExp(`(?<![\\d.,])(\\d{1,2})\\s*(?=(?:${COUNT_NOUN})(?![\\p{L}]))`, 'iu')
const TOP = /\btop\s?(\d{1,2})\b/i
/** "10 loại cây…", "Top 7…", "7 Jenis…", "ไม้น้ำ 10 ชนิด": the number of things a title promises, if it promises one. */
export function titleCount(title: string): number | undefined {
  const m = title.match(COUNT) ?? title.match(TOP)
  const n = m ? Number(m[1]) : undefined
  return n && n > 1 ? n : undefined
}

/**
 * A title without the count it promises, when the text doesn't have that many items ("10 cách xử lý rêu hại…" →
 * "Cách xử lý rêu hại…"): what the sweep does when a rewrite of the title isn't kept. Only the title: the page keeps its
 * address.
 */
export function stripCount(title: string): string {
  let t = title
  for (let i = 0; i < 3 && titleCount(t); i++) {
    const atStart = /^\s*(?:top\s?)?\d/i.test(t)
    t = t.replace(/\s*\d{1,2}\s*(?:ชนิด|สายพันธุ์|ข้อ)(?=\s|$)/u, '').replace(TOP, '').replace(COUNT, '').replace(/\s*:\s*:/, ':').replace(/^\s*:\s*/, '').replace(/\s{2,}/g, ' ').trim()
    if (atStart) t = t.charAt(0).toLocaleUpperCase() + t.slice(1)
  }
  return t
}

/** "<strong>Mẹo 3:</strong> …", "Sai lầm 9: …", "เคล็ดลับที่ 2:": a block's numbered label (its word, lower case, and number). */
const LABEL = /^(sai lầm|lỗi|mẹo|cách|bước|lý do|nguyên nhân|dấu hiệu|ý tưởng|lưu ý|kesalahan|tips?|cara|langkah|alasan|penyebab|tanda|ข้อผิดพลาด(?:ที่)?|เคล็ดลับ(?:ที่)?|วิธี(?:ที่)?|ขั้นตอน(?:ที่)?|สาเหตุ(?:ที่)?|mistake|step|tip|reason|sign|way)\s*(\d{1,2})\s*[:.)–-]/iu
type Label = { el: HTMLElement; word: string; n: number }
const labelsOf = (root: HTMLElement): Label[] => root.querySelectorAll('h3, p, li').filter(el => !el.querySelector('p, li')).flatMap(el => {
  const m = el.text.trim().match(LABEL)
  return m ? [{ el, word: m[1]!.toLowerCase(), n: Number(m[2]) }] : []
})
/** Each label word's numbers in order, split into runs where they start again from 1. */
function labelRuns(labels: Label[]): Label[][] {
  const runs: Label[][] = []
  for (const word of new Set(labels.map(l => l.word))) {
    let cur: Label[] = []
    for (const l of labels.filter(x => x.word === word)) {
      if (l.n === 1 && cur.length) { runs.push(cur); cur = [] }
      cur.push(l)
    }
    if (cur.length) runs.push(cur)
  }
  return runs
}
/** A run out of order: its numbers all different, neither counting up nor counting down ("Sai lầm 1, 9, 2, 3…"). */
const outOfOrder = (run: Label[]) => {
  const ns = run.map(l => l.n)
  return ns.length > 1 && new Set(ns).size === ns.length && ns.some((n, i) => i > 0 && n < ns[i - 1]!) && ns.some((n, i) => i > 0 && n > ns[i - 1]!)
}
/** Numbered labels out of order in a text: `"sai lầm" 1, 9, 2, 3…`. */
export const labelSlips = (html: string) => labelRuns(labelsOf(parse(html))).filter(outOfOrder).map(r => `"${r[0]!.word}" ${r.map(l => l.n).join(', ')}`)
/** Labels out of order numbered again in the order they appear, from the run's lowest number ("Sai lầm 1, 9, 2…" → 1, 2, 3…). */
export function renumberLabels(html: string): string {
  if (!/\d/.test(html)) return html
  const root = parse(html)
  const bad = labelRuns(labelsOf(root)).filter(outOfOrder)
  if (!bad.length) return html
  for (const run of bad) {
    const from = Math.min(...run.map(l => l.n))
    run.forEach((l, i) => {
      const re = new RegExp(`(${l.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*)${l.n}(?!\\d)`, 'iu')
      l.el.set_content(l.el.innerHTML.replace(re, (_, pre: string) => `${pre}${from + i}`))
    })
  }
  return root.toString()
}

/** A title promises N things; does the text have N, as a run of numbered headings or labels, a list, N bold leads, or enough headings? */
export function countMismatch(title: string, html: string): string | undefined {
  const want = titleCount(title)
  if (!want) return undefined
  const hs = headings(html).map(h => h.text.trim())
  const runs = numberedRuns(hs)
  const root = parse(html)
  const lists = root.querySelectorAll('ul, ol').map(l => l.childNodes.filter(n => n instanceof HTMLElement && n.rawTagName === 'li').length)
  if (runs.includes(want) || lists.includes(want)) return undefined
  // "Mẹo 1: …" to "Mẹo 13: …" as bold leads ("13 mẹo…"); or exactly as many bold leads as the title promises.
  if (labelRuns(labelsOf(root)).some(r => Math.max(...r.map(l => l.n)) === want)) return undefined
  const leads = root.querySelectorAll('p, li').filter(el => { const f = el.childNodes.find(n => n.text.trim()); return f instanceof HTMLElement && f.rawTagName === 'strong' }).length
  if (leads === want) return undefined
  if (!runs.length && hs.length >= want) return undefined // unnumbered headings, enough of them to hold the items
  const sizes = [...new Set(lists)].sort((a, b) => a - b)
  return `title promises ${want}; ${runs.length ? `numbered headings run to ${runs.join(' and ')}` : `${hs.length} headings, none numbered`}${sizes.length ? `, lists of ${sizes.join(', ')}` : ''}`
}

/** A heading with nothing under it: the next block is another heading (or the end), unless it starts a numbered run under it. */
const isEmptyAt = (els: HTMLElement[], i: number) => {
  const [b, next] = [els[i]!, els[i + 1]]
  if (b.rawTagName !== 'h3' || !b.text.trim()) return false
  if (next && next.rawTagName !== 'h3') return false
  return !(next && ownNumber(next.text) === 1) // "Ưu điểm" over "1. Nhẹ", "2. Rẻ"
}
const elements = (root: HTMLElement) => root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)
/** Headings with nothing under them. */
export function emptySections(html: string): string[] {
  const els = elements(parse(html))
  return els.flatMap((b, i) => (isEmptyAt(els, i) ? [b.text.trim()] : []))
}
/** The text without its empty headings (a heading over another heading, or at the end). */
export function dropEmptyHeadings(html: string): string {
  if (!html.includes('<h3>')) return html
  const root = parse(html)
  let changed = false
  // Again until none is left: "Ưu điểm" over an empty "1. Nhẹ" is empty once that goes.
  for (let els = elements(root), empty = els.filter((_, i) => isEmptyAt(els, i)); empty.length; els = elements(root), empty = els.filter((_, i) => isEmptyAt(els, i))) {
    for (const e of empty) e.remove()
    changed = true
  }
  return changed ? root.toString() : html
}

/** Markdown or HTML a writer left in the text: **bold**, a "## heading", [a link](…), `code`, a tag written out. */
export function leftoverMarkup(t: string): string[] {
  return [
    ...t.matchAll(/(?<![\p{L}\p{N}*])\*\*(?=[\p{L}\p{N}])[^*\n]{1,80}(?<=[\p{L}\p{N}.!?])\*\*(?![\p{L}\p{N}*])/gu),
    ...t.matchAll(/(?:^|\s)#{1,4} \p{L}[^.\n]{0,40}/gmu),
    ...t.matchAll(/\[[^\]\n]{1,80}\]\((?:https?:|\/)[^)\s]*\)/g),
    ...t.matchAll(/`[^`\s][^`\n]{0,40}`/g),
    ...t.matchAll(/<\/?(?:p|br|h\d|li|ul|strong|em|div|span)\b[^>]{0,20}>/gi),
  ].map(m => m[0].trim())
}

/** An entity in plain text (a title, a summary point, an FAQ): the site escapes plain text itself, so readers see "&amp;". */
export const plainEntities = (s: string) => [...s.matchAll(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi)].map(m => m[0])

/**
 * The source site's page furniture left in a text: its readers' comments ("4 bình luận về…", "7 ý kiến về…", "12
 * thoughts on…", "Bình luận của độc giả"), its comment form ("Để lại bình luận", "Leave a Reply"), its related posts
 * ("Bài viết liên quan:" and the list after it). The pages carried readers' names and replies from another site. As a
 * heading, or as a paragraph of its own.
 */
const COMMENTS = /^((\d+|một|one) (bình luận|phản hồi|ý kiến|suy nghĩ|comments?|responses?|thoughts?|repl(y|ies)|komentar|tanggapan|ความคิดเห็น)|bình luận của)/i
const FORM = /^((để lại|gửi) (một )?(bình luận|phản hồi|ý kiến)|leave a (reply|comment)|tinggalkan (balasan|komentar)|แสดงความคิดเห็น)/i
const RELATED = /^(bài viết liên quan|related (posts|articles)|artikel terkait|บทความที่เกี่ยวข้อง)/i
type Furniture = 'comments' | 'form' | 'related'
function furnitureOf(el: HTMLElement): Furniture | undefined {
  const t = el.text.replace(/\s+/g, ' ').trim()
  if (el.rawTagName === 'h3') return COMMENTS.test(t) ? 'comments' : FORM.test(t) ? 'form' : RELATED.test(t) ? 'related' : undefined
  if (el.rawTagName !== 'p') return undefined
  // A paragraph is furniture only when that is all it says: "Bài viết liên quan:", "Để lại bình luận", "4 bình luận về “…”".
  if (/^(\d+|một|one) (bình luận|ý kiến|phản hồi|comments?|responses?|thoughts?|komentar|tanggapan) (về|on|to|untuk|pada|tentang) /i.test(t)) return 'comments'
  if (new RegExp(`${FORM.source}\\s*:?$`, 'i').test(t)) return 'form'
  if (new RegExp(`${RELATED.source}\\s*(:.*)?$`, 'i').test(t)) return 'related'
  return undefined
}
export const furniture = (html: string) => elements(parse(html)).filter(el => furnitureOf(el)).map(el => el.text.replace(/\s+/g, ' ').trim())
/**
 * The text without its furniture: related posts with the list after them, comments and a comment form with everything
 * up to the next heading. Never more than half a text: such a text is left as it is, and listed.
 */
export function cutFurniture(html: string): string {
  const root = parse(html)
  const els = elements(root)
  const cut: HTMLElement[] = []
  for (let i = 0; i < els.length; i++) {
    const kind = furnitureOf(els[i]!)
    if (!kind) continue
    cut.push(els[i]!)
    const listsOnly = kind === 'related' && els[i]!.rawTagName === 'p'
    while (els[i + 1] && els[i + 1]!.rawTagName !== 'h3' && (!listsOnly || ['ul', 'ol'].includes(els[i + 1]!.rawTagName))) cut.push(els[++i]!)
  }
  if (!cut.length || cut.reduce((n, e) => n + e.text.length, 0) > root.text.length / 2) return html
  for (const e of cut) e.remove()
  return root.toString().trim()
}

/**
 * The later copies of a page's paragraphs (60 characters or more), in reading order across its texts: field index →
 * paragraph indexes. Within one text, a short line (under 120 characters) with no other copy beside it is the text's
 * own: a list that repeats it under each item ("Cây dễ chăm và nhân giống bằng cách cắt ngọn hoặc tách chồi bên." under
 * two plants of the nitrate guide). A copy in another text (Seriously Fish's distribution again as its habitat) or a
 * run of copies (a block pasted twice) is a repeat.
 */
export function laterCopies(fields: { field: string; html: string }[]): Map<number, Set<number>> {
  const first = new Map<string, number>()
  const out = new Map<number, Set<number>>()
  fields.forEach((f, fi) => {
    if (f.field.startsWith('sections.references')) return
    const ps = parse(f.html).querySelectorAll('p').map(x => x.text.replace(/\s+/g, ' ').trim())
    const from = ps.map(t => { if (t.length < 60) return undefined; const at = first.get(t); if (at === undefined) first.set(t, fi); return at })
    const copy = (i: number) => from[i] !== undefined
    const keep = new Set(ps.flatMap((t, i) => (copy(i) && (from[i] !== fi || t.length >= 120 || copy(i - 1) || copy(i + 1)) ? [i] : [])))
    if (keep.size) out.set(fi, keep)
  })
  return out
}
/** A page's texts without the later copies of its paragraphs (laterCopies). */
export function dropRepeats<F extends { field: string; html: string }>(fields: F[]): F[] {
  const copies = laterCopies(fields)
  return fields.map((f, fi) => {
    const drop = copies.get(fi)
    if (!drop) return f
    const root = parse(f.html)
    root.querySelectorAll('p').forEach((p, i) => { if (drop.has(i)) p.remove() })
    return { ...f, html: dropEmptyBlocks(root.toString()).trim() }
  })
}

/**
 * "Trang lưu ý rằng…", "Trang cũng nêu…": the translator writing what "the page" (the source) says, instead of saying it.
 * No safe fix (who says it matters): the reader's writer rewrites it, kept only when its reviewer passes it.
 */
// Not "ghi": a guide about websites says what a site lists ("trang ghi đủ các mục sau").
const SOURCE_PAGE = /(?<!\p{L})(?:[Tt]rang (?:này )?(?:cũng )?(?:lưu ý|nêu|cho biết|khuyên|nhấn mạnh)|[Hh]alaman (?:ini )?(?:juga )?(?:menyebutkan|mencatat|menyatakan|menekankan))(?!\p{L})|หน้า(?:นี้|เว็บ(?:นี้)?)(?:ยัง)?(?:ระบุ|กล่าว|แนะนำ)/u
/** Where a page says "the page notes…": the field and the sentence. */
export function sourcePagePhrases(p: Page): { field: string; quote: string }[] {
  return prose(p).flatMap(f => blocks(f.html).filter(b => SOURCE_PAGE.test(b.text)).map(b => ({
    field: f.field, quote: b.text.split(/(?<=[.!?])\s+/).find(s => SOURCE_PAGE.test(s)) ?? b.text,
  })))
}

const VI_LETTER = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/i
const VI_ONLY = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]/i
/** Vietnamese that belongs on any page (as the browser checks allow it): a decree's number, the language's own name. */
const VI_ALLOWED = [/\d+\/\d{4}\/NĐ-CP/g, /Tiếng Việt/g]
const EN_WORDS = new Set('the and of is are was were with to for this that these those it its be been can from on as or by their they will should when which have has not but into than more most such also only very there would could about after before while'.split(' '))
/** A citation: a year, authors or a journal's numbers, or a taxonomic group in brackets ("(Teleostei: Cyprinidae)"). */
const CITATION = /\b(1[789]\d\d|20[0-2]\d)\b|\(\p{Lu}\p{Ll}+:|\b(vol|pp|et al|doi|isbn)\b|journal|bulletin|proceedings|zootaxa|ichthyolog|\d+\s?:\s?\d+[-–]\d+/iu

/** Sentences in English on a Vietnamese, Indonesian or Thai page: no letters of the page's language, and English's small words. */
export function englishSentences(html: string, lang: Lang): string[] {
  return blocks(html).filter(b => !b.refs && !CITATION.test(b.text)).flatMap(b => b.text.replace(/[“"‘][^”"’]{0,300}[”"’]/g, ' ').split(/(?<=[.!?])\s+/)).filter(s => {
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length < 6) return false
    if ((lang === 'vi' && VI_LETTER.test(s)) || (lang === 'th' && /[฀-๿]/.test(s))) return false
    const small = words.filter(w => EN_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length
    return small >= 3 && small / words.length >= 0.2
  }).map(s => clip(s.trim()))
}

/** Vietnamese left on an Indonesian or Thai page, outside the names the site marks as Vietnamese (lang="vi"). */
export function vietnameseLeft(s: string): string | undefined {
  const plain = VI_ALLOWED.reduce((t, re) => t.replace(re, ' '), s.replace(/<span lang="vi">[\s\S]*?<\/span>/g, ' '))
  return parse(plain).text.replace(/\s+/g, ' ').match(new RegExp(`.{0,30}${VI_ONLY.source}.{0,30}`, 'i'))?.[0]?.trim()
}

const IMPERIAL = /°\s?F\b|(?<=\d\s?)(?:inch(?:es)?|inci|นิ้ว)|(?<!\p{L})(?:gallons?|galon|gal)(?!\p{L})|แกลลอน|(?<=\d\s?)(?:ft|feet|foot|kaki|ฟุต)\b|(?<=\d\s?)(?:lbs?|pounds?|ปอนด์)\b/giu
const METRIC = /°\s?C|\d\s?(?:cm|mm|m|km|l|lít|lit|liter|litre|ml|kg|g)\b|ซม|มม|ลิตร|เมตร|กก|องศาเซลเซียส/iu
const UNIT: [RegExp, string][] = [[/°/, '°F'], [/inch|inci|นิ้ว/i, 'inch'], [/gal|แกลลอน/i, 'gallon'], [/ft|feet|foot|kaki|ฟุต/i, 'feet'], [/lb|pound|ปอนด์/i, 'pound']]
const unitOf = (m: string) => UNIT.find(([re]) => re.test(m))?.[1] ?? m
/** Imperial units in a text: those with no metric figure beside them (`alone`, with a little of the text), and the units of those with one. */
export function imperialUnits(t: string): { alone: string[]; beside: string[] } {
  const out = { alone: [] as string[], beside: [] as string[] }
  for (const m of t.matchAll(IMPERIAL)) {
    if (METRIC.test(t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30))) out.beside.push(unitOf(m[0]))
    else out.alone.push(clip(t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).replace(/\s+/g, ' ').trim(), 60))
  }
  return out
}

/** Two spellings of one epithet: an ending changed with the genus ("aequifasciata", "aequifasciatus") or a letter or two off ("serverus"). */
function sameEpithet(a: string, b: string): boolean {
  const stem = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/(us|um|a|is|e|i|ii|ae)$/, '')
  const [x, y] = [stem(a), stem(b)]
  if (x === y) return true
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0]!
    d[0] = i
    for (let j = 1; j <= y.length; j++) { const t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = t }
  }
  return d[y.length]! <= (Math.min(x.length, y.length) >= 6 ? 2 : 1)
}
/** Words that follow a genus in a caption without being its species ("Corydoras resting", "Botia species are…"). */
const NOT_EPITHET = new Set('species are is was were has have had resting swimming feeding fry juvenile juveniles male males female females adult adults pair pairs group school shoal inflorescence flower flowers leaf leaves plant plants fish specimen specimens eggs young wild close head tail body with from and the in at on of by for showing sp spp cf aff var ssp subsp'.split(' '))
const LATIN = /(?:a|ae|us|um|is|i|ii|ensis|ense|oides|atus|ata|ens|ix|ops|ax|or|on|es|ei|ys|yx|ma|na)$/

/**
 * A photo caption that names a fish other than the page's ("Manduba (Ageneiosus inermis)" on Ageneiosus marmoratus): a
 * Latin name, in a genus the site has, that is another page's species or looks like one, in a caption that doesn't name
 * the page's species too (a spelling of it, one of its other names, a cultivar's name, "syn. O. vittatus"). In a caption
 * the engine wrote in Vietnamese, only another page's species counts ("Riccardia chia thùy" is Vietnamese).
 */
export function otherFish(caption: string, sci: string, others: string[], ctx: Ctx, strict = false): string | undefined {
  const clean = caption.replace(/['‘’"]/g, '')
  const genus = sci.split(/\s+/)[0]!
  const ownWords = [sci, ...others].flatMap(n => n.replace(/['‘’"]/g, '').split(/\s+/).slice(1)).filter(w => /^[a-z]{4,}$/i.test(w))
  // Every Latin name in the caption, abbreviated ones too ("O. vittatus"): one of the page's own means the photo is its.
  const all = [...clean.matchAll(/\b([A-Z][a-z]{2,}|[A-Z]\.) ([a-z]{4,})\b/g)]
  if (all.some(m => ownWords.some(w => sameEpithet(m[2]!, w)))) return undefined
  const vietnamese = VI_LETTER.test(caption)
  const other = all.filter(m => !m[1]!.endsWith('.') && !NOT_EPITHET.has(m[2]!) && !/(?:syn\.?|synonym|formerly|previously|referred to as|known as|traded as|sold as|=)\s*\(?$/i.test(clean.slice(Math.max(0, m.index - 30), m.index)))
    .find(m => ctx.species.has(`${m[1]} ${m[2]}`.toLowerCase()) || (!strict && !vietnamese && (ctx.genera.has(m[1]!) || m[1] === genus) && LATIN.test(m[2]!)))
  return other ? `${other[1]} ${other[2]}` : undefined
}

/**
 * A photo the sweep takes off the page: its caption names another species the site has a page for, and nothing in it
 * says the fish is still the page's: "imported as a contaminant in a batch of wild Garra flavatra" (on Garra
 * rakhinica), "Here with Garra flavatra", "among a shipment of Rasboroides vaterifloris", "known at the time as…".
 */
export function wrongFish(caption: string, sci: string, others: string[], ctx: Ctx): string | undefined {
  const other = otherFish(caption, sci, others, ctx, true)
  if (!other) return undefined
  const before = caption.slice(0, caption.indexOf(other.split(' ')[0]!))
  if (/(?<!\p{L})(with|among|batch|shipment|contaminant|mixed|cùng|với|bersama|dengan)(?!\p{L})/iu.test(before.slice(-40))) return undefined
  if (/\b(known\b[^.]{0,20}?\bas|formerly|previously|referred to as|mistaken|confused|misidentified|hybrid)\b/i.test(caption)) return undefined
  return other
}
/** A caption saying the photo is a map. */
export const isMap = (caption: string) => MAP.test(caption)

/** A caption saying the picture is a map ("Belontia signata map", "bản đồ phân bố"). */
const MAP = /(?<!\p{L})(map|range map|bản đồ|peta|แผนที่)(?!\p{L})/iu

const range = (v: number | { min: number; max: number }) => (typeof v === 'number' ? `${v}` : `${v.min}–${v.max}`)

type Figure = number | { min: number; max: number }
/**
 * The card figures to keep off the page, each with why: outside the bounds the engine keeps when it reads a page, upside
 * down, or a minimum tank shorter than twice the largest adult fish the card gives (the tank, not the fish: a size is
 * measured, a tank is advice, and too small a tank is the harmful one).
 */
export function cardSlips<V extends { field: DataCardField; value: Figure }>(card: V[]): { v: V; why: string }[] {
  const out = card.flatMap(v => {
    const [lo, hi] = BOUNDS[v.field]
    const x = v.value
    if (typeof x !== 'number' && x.min > x.max) return [{ v, why: 'upside down' }]
    const [a, b] = typeof x === 'number' ? [x, x] : [x.min, x.max]
    return a < lo || b > hi ? [{ v, why: `outside ${lo}–${hi}` }] : []
  })
  const sizes = card.filter(v => v.field === 'sizeCm' && typeof v.value === 'number' && !out.some(o => o.v === v)).map(v => v.value as number)
  const fish = sizes.length ? Math.max(...sizes) : 0
  for (const v of card) if (v.field === 'tankCm' && typeof v.value === 'number' && v.value < 2 * fish && !out.some(o => o.v === v)) out.push({ v, why: `shorter than twice the fish (${fish} cm)` })
  return out
}
const firstFew = (xs: string[], n = 3) => [...xs.slice(0, n).map(s => `"${s}"`), ...(xs.length > n ? [`and ${xs.length - n} more`] : [])]

/** The rules whose defects the sweep fixes on every page each cycle (sweep.ts), held at zero by the real-content test. */
export const RATCHETED: readonly string[] = ['furniture', 'headings', 'repeated', 'labels', 'caption', 'card', 'title-count', 'imperial']

export const RULES: Rule[] = [
  {
    id: 'numbering', title: 'Numbered headings broken or miscounted',
    about: 'A heading with no number between two numbered ones that follow each other ("#3 …", "Xtreme Betta Pellets", "#4 …") becomes its item\'s bold lead line when the engine writes the page (listed until then); a number skipped or repeated is listed.',
    check: p => prose(p).flatMap(f => {
      const hs = headings(f.html).map(h => h.text.trim())
      const tidied = tidyHeadings(f.html)
      const kept = new Set(tidied === f.html ? hs : headings(tidied).map(h => h.text.trim()))
      return [...hs.filter(h => !kept.has(h)).map(h => `"${clip(h, 60)}" sits inside a numbered run`), ...numberSlips(hs).map(s => `numbers go ${s}`)]
    }),
  },
  {
    id: 'title-count', title: 'Title promises a count the text doesn\'t have',
    about: 'A title with a number ("10 loại cây…", "Top 5…") whose text has no run of numbered headings or labels, no list or bold leads of that many, and not enough headings for that many items. The sweep has the title rewritten (reviewer-gated), else drops the number from it; the address stays.',
    check: p => p.fields.filter(f => f.field === 'body').flatMap(f => countMismatch(p.title, f.html) ?? []),
  },
  {
    id: 'headings', title: 'Empty headings and blocks',
    about: 'A heading with nothing under it, an empty block: the sweep drops them.',
    check: p => [
      ...prose(p).flatMap(f => emptySections(f.html)).map(h => `nothing under "${clip(h, 60)}"`),
      ...prose(p).filter(f => dropEmptyBlocks(f.html) !== f.html).map(f => `an empty block in ${f.field}`),
    ],
  },
  {
    id: 'repeated-headings', title: 'A heading twice on a page',
    about: 'The same heading twice on one page. Listed: which of the two sections to keep is a person\'s call.',
    check: p => {
      const all = prose(p).flatMap(f => headings(f.html).map(h => h.text.trim().toLowerCase())).filter(Boolean)
      return [...new Set(all.filter((h, i) => all.indexOf(h) !== i))].map(h => `"${clip(h, 60)}" twice`)
    },
  },
  {
    id: 'furniture', title: 'The source site\'s comments or related posts',
    about: 'The source page\'s furniture, as a heading or a paragraph of its own ("4 bình luận về…", "7 ý kiến về…", "Để lại bình luận", "Leave a Reply", "Bài viết liên quan:"): other readers\' names and replies, a comment form, links to the source\'s other posts. The sweep cuts it, with the list of related posts or everything up to the next heading, never more than half a text.',
    check: p => [...new Set(prose(p).flatMap(f => furniture(f.html)))].map(h => `"${clip(h, 70)}"`),
  },
  {
    id: 'labels', title: 'Numbered labels out of order',
    about: 'Labels such as "Sai lầm 1", "Mẹo 2", "Bước 3" whose numbers neither count up nor down ("Sai lầm 1, 9, 2, 3…"): the sweep numbers them again in the order they appear.',
    check: p => [...new Set(prose(p).flatMap(f => labelSlips(f.html)))],
  },
  {
    id: 'source-page', title: 'Text that reports what "the page" says',
    about: '"Trang lưu ý…", "Trang cũng nêu…" (and the Indonesian and Thai): the translator writing what the source page says instead of saying it. The reader\'s writer rewrites it on Vietnamese pages, kept only when its reviewer passes it; listed otherwise.',
    check: p => sourcePagePhrases(p).map(x => `"${clip(x.quote, 80)}"`),
  },
  {
    id: 'markup', title: 'Markdown, HTML or entities left in the text',
    about: '**bold**, "## heading", [link](…), `code` or a tag written out as text; "&amp;" in a title, summary or FAQ, or an entity escaped twice in the text (both fixed when the engine writes the page, listed until then).',
    check: p => [
      ...[...prose(p).map(f => lines(f.html)), ...p.lines.map(l => l.text), p.title].flatMap(leftoverMarkup).map(m => `"${clip(m, 60)}"`),
      ...[...new Set([p.title, ...p.lines.map(l => l.text)].flatMap(plainEntities))].map(e => `"${e}" in plain text`),
      ...prose(p).filter(f => unescapeTwice(f.html) !== f.html).map(f => `an entity escaped twice in ${f.field}`),
    ],
  },
  {
    id: 'repeated', title: 'A paragraph repeated on the page',
    about: 'The same paragraph (60 characters or more) twice on one page: in two of its texts, as a run of copies, or 120 characters or more (a short line a list repeats under each item is the text\'s own). The sweep drops the later copy.',
    check: p => {
      const fields = prose(p)
      const copies = [...laterCopies(fields)].flatMap(([fi, is]) => parse(fields[fi]!.html).querySelectorAll('p').filter((_, i) => is.has(i)).map(x => x.text.replace(/\s+/g, ' ').trim()))
      return [...new Set(copies)].map(s => `"${clip(s, 70)}"`)
    },
  },
  {
    id: 'english', title: 'Sentences left in English',
    about: 'A sentence with no word of the page\'s language and English\'s small words (the, and, of…), outside reference lists, citations and quotes.',
    check: p => [...new Set([...prose(p).map(f => f.html), ...p.lines.map(l => `<p>${l.text}</p>`)].flatMap(h => englishSentences(h, p.lang)))].map(s => `"${s}"`),
  },
  {
    id: 'vietnamese', title: 'Vietnamese left on Indonesian and Thai pages',
    about: 'Letters only Vietnamese uses, outside the Vietnamese names the site marks as such.',
    check: p => (p.lang === 'vi' ? [] : [...new Set([p.title, ...prose(p).map(f => f.html), ...p.lines.map(l => l.text), ...p.captions.map(c => c.caption)].flatMap(s => vietnameseLeft(s) ?? []))].map(s => `"${s}"`)),
  },
  {
    // One detector with the metric test's (@aq/schema imperialLeft): a figure in °F, inches, feet, gallons or pounds.
    // A unit named with no figure ("tính bằng gallon Mỹ", "Aturan satu galon per inci") is no figure to convert.
    id: 'imperial', title: 'Imperial figures',
    about: 'A figure in °F, inches, feet, gallons or pounds (`pnpm engine metric` converts fish, plant, breed and guide pages before each build). Imperial figures beside a metric one are counted at the top.',
    check: p => {
      const left = [...new Set([...prose(p).map(f => lines(f.html)), ...p.lines.map(l => l.text)].flatMap(imperialLeft))]
      return left.length ? [firstFew(left).join('; ')] : []
    },
  },
  {
    // The photos are the same in every language: checked on the Vietnamese page.
    id: 'caption', title: 'A photo caption naming another fish, or a map',
    about: 'A species or plant photo whose caption names another species the site has a page for, and not the page\'s, with nothing saying the fish is still the page\'s; or says it is a map. The sweep takes the photo off the page (and off every page, through engine-state/_photo-rejected.json, unless another page it is on is that fish\'s). Checked on the Vietnamese page; the photos are the same in every language.',
    check: (p, ctx) => (!p.sci || p.lang !== 'vi' ? [] : [...new Set(p.captions.flatMap(c => {
      const other = wrongFish(c.caption, p.sci!, p.latinNames, ctx)
      // Found by the reader's eye (2026-11-01): "Pterophyllum scalare map" shown as a photo of the fish.
      return [...(other ? [`${other}: "${clip(c.caption, 80)}"`] : []), ...(isMap(c.caption) ? [`a map, not the fish: "${clip(c.caption, 80)}"`] : [])]
    }))]),
  },
  {
    id: 'caption-unsure', title: 'A photo caption that may name another fish',
    about: 'A caption naming a Latin name in a genus the site has, that no page has, or another page\'s species with words saying the fish may still be the page\'s ("in a batch of", "here with"). Listed, not removed: `pnpm engine check-photos --only <id>` looks again. Checked on the Vietnamese page.',
    check: (p, ctx) => (!p.sci || p.lang !== 'vi' ? [] : [...new Set(p.captions.flatMap(c => {
      const other = otherFish(c.caption, p.sci!, p.latinNames, ctx)
      return other && !wrongFish(c.caption, p.sci!, p.latinNames, ctx) ? [`${other}: "${clip(c.caption, 80)}"`] : []
    }))]),
  },
  {
    // The card is the same in every language: checked on the Vietnamese page.
    id: 'card', title: 'Data card values outside sane bounds',
    about: 'A figure outside the bounds the engine keeps when it reads a page (temperature 4–40 °C, pH 2–10.5, GH 0–50, size 0.3–300 cm, tank 10–1000 cm, difficulty 1–8), a range upside down, or a minimum tank shorter than twice the adult fish. The sweep hides the figure from the card (kept in the page\'s file, marked `hidden` with why). Checked on the Vietnamese page; the card is the same in every language.',
    check: p => {
      if (p.lang !== 'vi') return []
      const slips = cardSlips(p.card)
      const out = slips.filter(s => !s.why.startsWith('shorter')).map(({ v, why }) => `${v.field} ${range(v.value)} (${v.source}): ${why}`)
      const tanks = slips.filter(s => s.why.startsWith('shorter')).map(s => s.v.value as number)
      const sizes = p.card.filter(c => c.field === 'sizeCm' && typeof c.value === 'number').map(c => c.value as number)
      if (tanks.length) out.push(`minimum tank ${Math.min(...tanks)} cm for a fish of ${Math.max(...sizes)} cm (less than twice its length)`)
      return out
    },
  },
]

/** The genera and species the site has pages for. */
export const ctxOf = (pages: Page[]): Ctx => ({
  genera: new Set(pages.flatMap(p => (p.sci ? [p.sci.split(' ')[0]!] : []))),
  species: new Set(pages.flatMap(p => (p.sci ? [p.sci.split(/\s+/).slice(0, 2).join(' ').toLowerCase()] : []))),
})

/** Every rule on every page; a rule that throws on a page is reported as such and the others still run. */
export function checkPages(pages: Page[], rules: Rule[] = RULES): { findings: Finding[]; errors: string[] } {
  const ctx = ctxOf(pages)
  const findings: Finding[] = []
  const errors: string[] = []
  for (const page of pages) for (const rule of rules) {
    try { for (const detail of rule.check(page, ctx)) findings.push({ rule: rule.id, page, detail }) }
    catch (e) { errors.push(`${rule.id} on ${page.path}: ${(e as Error).message.slice(0, 200)}`) }
  }
  return { findings, errors }
}

const SITE = 'https://aquatome.com'
const md = (s: string) => s.replace(/([[\]|*_`<>\\])/g, '\\$1')

/** docs/review/content-rules.md: one section per rule, each page once with what was found there, in a stable order. */
export function rulesReport(pages: Page[], r: { findings: Finding[]; errors: string[] }, rules: Rule[] = RULES): string {
  const per = (lang: Lang) => pages.filter(p => p.lang === lang).length
  const beside = new Map<string, number>()
  for (const p of pages) for (const f of prose(p)) for (const u of imperialUnits(lines(f.html)).beside) beside.set(u, (beside.get(u) ?? 0) + 1)
  const sections = rules.map(rule => {
    const byPage = new Map<string, { page: Page; details: string[] }>()
    for (const f of r.findings.filter(f => f.rule === rule.id)) {
      const e = byPage.get(f.page.path) ?? { page: f.page, details: [] }
      e.details.push(f.detail)
      byPage.set(f.page.path, e)
    }
    const rows = [...byPage.values()].sort((a, b) => a.page.path.localeCompare(b.page.path))
      .map(({ page, details }) => `- [${page.lang} · ${md(page.title)}](${SITE}${page.path}) — ${details.map(md).join('; ')}`)
    return `## ${rule.title} (${rows.length})\n\n${rule.about}\n\n${rows.join('\n') || '- none'}\n`
  })
  return `# Content rules

Generated by \`pnpm engine audit\` every engine cycle: rules every published page is checked against, in Vietnamese,
Indonesian and Thai (\`packages/engine/src/content-rules.ts\`, docs/governance.md). A rule never holds a page back. What
a rule can fix safely is fixed whenever the engine writes a page, and on every page each cycle before the build
(\`pnpm engine sweep\`; the real-content test holds those rules at zero); the rest is listed here, each page once per rule.

Pages checked: ${pages.length} (Vietnamese ${per('vi')}, Indonesian ${per('id')}, Thai ${per('th')}). Imperial units
beside a metric figure: ${[...beside].sort().map(([u, n]) => `${u} ${n}`).join(', ') || 'none'}.
${r.errors.length ? `\nRules that failed on a page (fix the rule):\n\n${r.errors.map(e => `- ${md(e)}`).join('\n')}\n` : ''}
${sections.join('\n')}`
}

type Stored = { name?: string; altNames?: string[]; sections?: Record<string, string>; body?: string; definition?: string; summary?: string[]; faq?: { q: string; a: string }[] }
/** The fixes made on write, on one stored translation: tidyHtml on its HTML, unescapePlain on its plain text. */
export function fixTranslation(t: Stored): Stored {
  return {
    ...t,
    ...(t.name !== undefined ? { name: unescapePlain(t.name) } : {}),
    ...(t.altNames ? { altNames: t.altNames.map(unescapePlain) } : {}),
    ...(t.sections ? { sections: Object.fromEntries(Object.entries(t.sections).map(([k, v]) => [k, tidyHtml(v)])) } : {}),
    ...(t.body !== undefined ? { body: tidyHtml(t.body) } : {}),
    ...(t.definition !== undefined ? { definition: tidyHtml(t.definition) } : {}),
    ...(t.summary ? { summary: t.summary.map(unescapePlain) } : {}),
    ...(t.faq ? { faq: t.faq.map(f => ({ q: unescapePlain(f.q), a: unescapePlain(f.a) })) } : {}),
  }
}

/** The fixes made on write, applied to the translations already stored, in every language. Returns the files changed. */
export async function fixStored(contentRoot: string): Promise<string[]> {
  const changed: string[] = []
  for (const kind of ['species', 'plants', 'guides', 'breeds', 'glossary', 'products']) {
    for (const id of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).sort()) {
      for (const lang of ['vi', 'id', 'th']) {
        const file = join(contentRoot, kind, id, `${lang}.json`)
        const raw = await readFile(file, 'utf8').catch(() => null)
        if (!raw) continue
        const before = JSON.parse(raw) as Stored
        const after = fixTranslation(before)
        if (JSON.stringify(after) !== JSON.stringify(before)) { await writeFile(file, `${JSON.stringify(after, null, 2)}\n`); changed.push(`${kind}/${id}/${lang}.json`) }
      }
    }
  }
  return changed
}
