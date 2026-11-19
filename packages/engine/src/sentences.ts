import { parse } from 'node-html-parser'
import { norm } from './reader'

/**
 * A part's HTML cut into its sentences and what lies between them (tags, spaces), which join back into the same HTML
 * byte for byte. A directed rewrite (fit-rewrite.ts) changes only the sentences a finding names and puts the rest back
 * as they were (the chief of staff, 13 Nov 2026): on 13 Nov the front list's rewrites changed every sentence of a part,
 * for no gain ("Đèn nên để khá dịu" became "Đèn để khá tối"), and gave the reviewer reasons to refuse that no finding
 * asked about.
 * It cuts coarsely: where a cut is unsure, two sentences stay one, which only means a little more is written again.
 * - A block's tags end a sentence (a paragraph, a list item, a heading, a cell, a line break).
 * - Inside a block, a sentence ends at . ! ? or … with a space after it and a capital, a digit, a quote or a bracket
 *   next, never inside <strong> or <em>, and never after a genus's initial ("B. merah") or an abbreviation ("sp.").
 */
export type Piece = { sentence: boolean; html: string }

const BLOCK = /^<\/?(p|li|ul|ol|h[1-6]|div|table|thead|tbody|tr|td|th|blockquote|dl|dt|dd|figure|figcaption|section|br|hr)\b/i
const OPEN = /^<([a-z][a-z0-9]*)\b[^>]*?(\/)?>$/i
const CLOSE = /^<\/([a-z][a-z0-9]*)\s*>$/i
const END = /[.!?…]+["'”’»)]*(?=\s)/g
const NEXT = /^\s+(?=[\p{Lu}\d"'“‘«(])/u
/** Words before a full stop that don't end a sentence: an initial, and the abbreviations a fish or plant page uses. */
const ABBREVIATION = /(?:^|[\s(])(?:\p{Lu}|sp|spp|ssp|subsp|cf|aff|var|ca|vd|v\.v|etc|e\.g|i\.e|St|Dr|Mr|Mrs|No|nr|TS|ThS|PGS|GS|approx)$/u

export function sentences(html: string): Piece[] {
  const out: Piece[] = []
  let cur = ''
  let depth = 0
  const gap = (s: string) => { if (!s) return; const last = out.at(-1); if (last && !last.sentence) last.html += s; else out.push({ sentence: false, html: s }) }
  const flush = () => {
    if (!cur) return
    // A sentence's own leading and trailing spaces belong to the gaps beside it.
    const lead = /^\s*/.exec(cur)![0]
    const trail = /\s*$/.exec(cur.slice(lead.length))![0]
    const body = cur.slice(lead.length, cur.length - trail.length)
    gap(lead)
    if (body && parse(body).text.trim()) out.push({ sentence: true, html: body })
    else gap(body)
    gap(trail)
    cur = ''
  }
  for (const token of html.split(/(<[^>]*>)/)) {
    if (!token) continue
    if (token.startsWith('<')) {
      if (BLOCK.test(token)) { flush(); depth = 0; gap(token); continue }
      const open = OPEN.exec(token)
      if (open && !open[2]) depth++
      else if (CLOSE.test(token)) depth = Math.max(0, depth - 1)
      cur += token
      continue
    }
    let from = 0
    if (depth === 0) {
      for (const m of token.matchAll(END)) {
        const end = m.index! + m[0].length
        const space = NEXT.exec(token.slice(end))
        if (!space) continue
        const word = (cur + token.slice(from, m.index)).replace(/<[^>]*>/g, '')
        if (m[0].startsWith('.') && m[0].length === 1 && ABBREVIATION.test(word)) continue
        cur += token.slice(from, end)
        flush()
        gap(space[0])
        from = end + space[0].length
      }
    }
    cur += token.slice(from)
  }
  flush()
  return out
}

/** A sentence's words as a reader sees them: its tags gone, its entities read. */
/**
 * Each sentence's block (numbered from 0, one entry a sentence): a paragraph, a list item, a cell or a line, so a
 * neighbour across one is never in the same paragraph or list item (the Writing Lead, 13 Nov 2026).
 */
export function blockOf(pieces: Piece[], o: { lines?: boolean } = {}): number[] {
  // `lines: false`: a line break or a rule doesn't end a block, so a paragraph is one ("Châm 5 ml<br> Seachem Prime…").
  const ends = (t: string) => BLOCK.test(t) && (o.lines !== false || !/^<(br|hr)\b/i.test(t))
  let block = 0
  const out: number[] = []
  for (const p of pieces) {
    if (p.sentence) out.push(block)
    else if (p.html.split(/(<[^>]*>)/).some(ends)) block++
  }
  return out
}

export const plain = (html: string) => parse(html).text.replace(/\s+/g, ' ').trim()

/**
 * Where a quote stands in a text, both as `norm` gives them: its first place, or, `whole`, every place where its ends that
 * are a letter or a figure meet no letter or figure ("ADA" isn't in "Canada", "$5" is in "giá $5"; Codex's read of #1690).
 */
export function places(text: string, q: string, whole = false): number[] {
  const word = (c?: string) => !!c && /[\p{L}\p{N}]/u.test(c)
  const out: number[] = []
  for (let at = q ? text.indexOf(q) : -1; at >= 0; at = text.indexOf(q, at + 1)) {
    if (!whole) return [at]
    if ((word(q[0]) && word(text[at - 1])) || (word(q.at(-1)) && word(text[at + q.length]))) continue
    out.push(at)
  }
  return out
}

/**
 * The sentences (their places among the sentences, from 0) that a quote lies in; one that runs across sentences names
 * each. Nothing when the quote isn't in the part. `whole`: its words whole, at every place the part says it. `blocks`:
 * within one block.
 */
export function quoted(pieces: Piece[], quote: string, o: { whole?: boolean; blocks?: number[] } = {}): number[] {
  const texts = pieces.filter(p => p.sentence).map(p => norm(plain(p.html)))
  const q = norm(quote)
  const joined = texts.join(' ')
  const out = new Set<number>()
  for (const at of places(joined, q, o.whole)) {
    const these: number[] = []
    let start = 0
    texts.forEach((t, i) => { const end = start + t.length; if (start < at + q.length && at < end) these.push(i); start = end + 1 })
    // `blocks` (each sentence's, `blockOf`): a place that runs from one block into the next isn't the quote's.
    if (o.blocks && these.some(i => o.blocks![i] !== o.blocks![these[0]!])) continue
    these.forEach(i => out.add(i))
  }
  return [...out].sort((a, b) => a - b)
}

/**
 * The part with some of its sentences changed (by their places among the sentences) and every other piece as it was. An
 * empty sentence goes, with the space after it (or before it, at a block's end); a block left with nothing in it, or only
 * a line break or a hard space, goes (Codex's read of #1690: "<p><br></p>" was a body).
 */
export function splice(pieces: Piece[], changes: ReadonlyMap<number, string>): string {
  // A sentence this splice empties is marked, so only a block it emptied goes: a separator or an empty block already in
  // the part stays as it was (Codex's second read of #1690). The mark is a character neither the part nor a change holds
  // (Codex's third read: a NUL already in a block).
  const all = [...pieces.map(p => p.html), ...changes.values()].join('')
  let code = 0xe000
  while (all.includes(String.fromCharCode(code))) code++
  const GONE = String.fromCharCode(code)
  const out = pieces.map(p => ({ ...p }))
  let n = -1
  out.forEach((p, i) => {
    if (!p.sentence) return
    n++
    const next = changes.get(n)
    if (next === undefined) return
    p.html = next || GONE
    if (next) return
    const after = out[i + 1]
    // The space before it, past any sentence already gone and its space: two going together at a paragraph's end leave
    // none ("Orinoco. </p>").
    let j = i - 1
    while (j >= 0 && (out[j]!.html === '' || out[j]!.html === GONE)) j--
    const before = out[j]
    if (after && !after.sentence && /^\s+$/.test(after.html)) after.html = ''
    else if (before && !before.sentence && /\s$/.test(before.html)) before.html = before.html.replace(/\s+$/, '')
  })
  let html = out.map(p => p.html).join('')
  const blank = `(?:\\s|&nbsp;|<br\\s*\\/?>|${GONE})*`
  for (let i = 0; i < 3; i++) {
    html = html.replace(new RegExp(`<(p|li|h[1-6]|dd|dt|blockquote)>${blank}${GONE}${blank}<\\/\\1>`, 'g'), GONE)
      .replace(new RegExp(`<(ul|ol)>\\s*${GONE}[\\s${GONE}]*<\\/\\1>`, 'g'), GONE)
  }
  return html.replaceAll(GONE, '')
}
