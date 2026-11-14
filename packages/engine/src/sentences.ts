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
export function blockOf(pieces: Piece[]): number[] {
  let block = 0
  const out: number[] = []
  for (const p of pieces) {
    if (p.sentence) out.push(block)
    else if (p.html.split(/(<[^>]*>)/).some(t => BLOCK.test(t))) block++
  }
  return out
}

export const plain = (html: string) => parse(html).text.replace(/\s+/g, ' ').trim()

/**
 * The sentences (their places among the sentences, from 0) that a quote lies in; one that runs across sentences names
 * each. Nothing when the quote isn't in the part.
 */
export function quoted(pieces: Piece[], quote: string): number[] {
  const texts = pieces.filter(p => p.sentence).map(p => norm(plain(p.html)))
  const q = norm(quote)
  if (!q) return []
  const joined = texts.join(' ')
  const at = joined.indexOf(q)
  if (at < 0) return []
  const out: number[] = []
  let start = 0
  texts.forEach((t, i) => { const end = start + t.length; if (start < at + q.length && at < end) out.push(i); start = end + 1 })
  return out
}

/**
 * The part with some of its sentences changed (by their places among the sentences) and every other piece as it was. An
 * empty sentence goes, with the space after it (or before it, at a block's end); a block left with nothing in it goes.
 */
export function splice(pieces: Piece[], changes: ReadonlyMap<number, string>): string {
  const out = pieces.map(p => ({ ...p }))
  let n = -1
  out.forEach((p, i) => {
    if (!p.sentence) return
    n++
    const next = changes.get(n)
    if (next === undefined) return
    p.html = next
    if (next) return
    const after = out[i + 1]
    const before = out[i - 1]
    if (after && !after.sentence && /^\s+$/.test(after.html)) after.html = ''
    else if (before && !before.sentence && /\s$/.test(before.html)) before.html = before.html.replace(/\s+$/, '')
  })
  let html = out.map(p => p.html).join('')
  for (let i = 0; i < 3; i++) html = html.replace(/<(p|li|h[1-6]|dd|dt|blockquote)>\s*<\/\1>/g, '').replace(/<(ul|ol)>\s*<\/\1>/g, '')
  return html
}
