import { readFileSync } from 'node:fs'
import { toMetric } from '@aq/schema'
import type { Llm } from './claude'
import type { FitCheck } from './fit'
import { hedgesAsk, hedgesLost, HEDGES_SCHEMA, type HedgePair } from './hedges'
import { VI_STYLE } from './phrases'
import { givesDose, withTanks } from './round'
import { sanitizeHtml } from './sanitize'
import { blockOf, plain, quoted, sentences, splice, type Piece } from './sentences'
import { norm } from './reader'

/**
 * A part of a fish, plant or breed page mended for what the reader-fit read found (fit-rewrite.ts), by two rules of the
 * chief of staff's (13 Nov 2026), which the code holds, not the prompts:
 * - Only the sentences a finding quotes are written again; every other sentence is put back word for word (sentences.ts).
 *   A sentence right before or after one that changed, in the same paragraph or list item, may change too when the
 *   writer says why: one that no longer reads once its neighbour changed.
 * - Something left out is accepted only when a finding that names that sentence asks for it to go. On 13 Nov the front
 *   list's first run kept 4 of 17 parts: its reviewer, judging against the English, asked back what the findings had
 *   dropped ("In the population imported now", "bunches are currently NOT produced at Tropica's own nursery", "in the
 *   images", "for less than $10"). Its reviewer now sees the changed sentences before and after, with the findings, and
 *   lists what is left out with the finding that asks for it, which the code checks. The code also counts every word a
 *   changed sentence loses: each is in a finding's quote there, or in what the reviewer listed under a finding that
 *   asks for it to go, or only joins or frames it (JOINING, FRAMES); a word lost and listed by no one isn't kept (Astra's read: a
 *   writer that also dropped "độc với tép" from a sentence asked only for its price passed when its reviewer said
 *   nothing).
 * - A sentence a finding flags is cut, never said another way (the chief of staff, 14 Nov 2026): every sentence that
 *   changed is the one it was with words taken out, in their order, and only joining words put in (GLUE), or what a
 *   wording finding asks for (`adds`). A units finding's measures are left as written and converted by code (`metric`),
 *   or are a breed's figures as code works them out (`adds`; breed-units.ts keepsFigures holds their places). On 14 Nov a
 *   dealer's "Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah" was kept as "Cũng có quần thể
 *   mà cả đực lẫn cái đều có vẻ mang màu của B. merah": a claim about wild fish no source makes (addedWords).
 * The writer's and the reviewer's words are prompts/fit-mend.md and prompts/fit-mend-review.md.
 */
const WRITE = readFileSync(new URL('./prompts/fit-mend.md', import.meta.url), 'utf8').trim()
const REVIEW = withTanks(readFileSync(new URL('./prompts/fit-mend-review.md', import.meta.url), 'utf8').trim())

/** What a finding asks for: a conversion (units) or another word (words) asks for nothing to go. */
const NO_DROP: readonly FitCheck[] = ['units', 'words']

/**
 * Words a sentence may lose when it's reworded around a change without losing anything it says: what only joins ("và",
 * "thì", "của") or points ("này", "đó"). A word that says something isn't one, however small: "bị" (one that suffers
 * it), "được", "có thể", "rất", "cần", "không", "nữa", "một" (Astra's read: "Tép con bị cá ăn" written "Tép con ăn cá"
 * lost only "bị", and passed).
 */
const JOINING = new Set('và hoặc thì là mà rằng các những của này đó bạn'.split(' '))
/**
 * What only frames a sentence or links it to the one before ("Cần lưu ý rằng", "Vì thế"), when it goes whole: not under
 * a negation, and with no two of its words left together ("Không cần lưu ý nhiệt độ" written "Không lưu ý nhiệt độ"
 * lost "cần", Astra's read). A frame that doesn't go whole is counted whole, a shorter one inside it too ("Không cần lưu
 * ý rằng" written "Không cần" isn't let off "lưu ý rằng").
 */
const FRAMES = ['cần lưu ý rằng', 'cần lưu ý', 'lưu ý rằng', 'vì thế', 'vì vậy', 'do đó', 'tuy vậy', 'tuy nhiên', 'ngoài ra', 'cho nên'].map(f => f.split(' '))
const NEGATIONS = new Set(['không', 'chẳng', 'chả', 'chưa', 'đừng'])
/** A figure, with a minus or a mark before it and a range's dash, spaced or not, inside it ("-5", "5 – 8"), or a word. */
const FIGURE_OR_WORD = /(?:[.,]|[–—−-](?=\d))?\d+(?:[.,]\d+|\s*[–—−-]\s*\d+)*|[\p{L}\p{N}]+/gu
/**
 * A text's words; a figure is one, with the marks inside it and a mark before it ("6,5", "6–8", "5 – 8" as "5-8", ".5",
 * "-5"), so a decimal or two figures written as a range, "5" as ".5" or as "-5", is a word taken out and another put in
 * (Astra's reads).
 */
export const words = (s: string) => (plain(s).normalize('NFC').toLowerCase().match(FIGURE_OR_WORD) ?? []).map(w => (/^[.,–—−-]?\d/.test(w) ? w.replace(/\s+/g, '').replace(/[–—−]/g, '-') : w))
/** Which of a sentence's words belong to a framing phrase that went whole from it. */
const framed = (ws: string[], after: string[]) => {
  const kept = new Set(after.slice(1).map((w, i) => `${after[i]} ${w}`))
  const off = ws.map(() => false)
  for (let i = 0; i < ws.length;) {
    const f = FRAMES.find(f => f.every((w, j) => ws[i + j] === w))
    if (!f) { i++; continue }
    if (!NEGATIONS.has(ws[i - 1] ?? '') && !f.slice(1).some((w, j) => kept.has(`${f[j]} ${w}`))) f.forEach((_, j) => { off[i + j] = true })
    i += f.length
  }
  return off
}
/** Where `q` first stands in `ws`, word for word: its positions, or none. */
const firstAt = (ws: readonly string[], q: readonly string[]) => {
  for (let i = 0; q.length && i + q.length <= ws.length; i++) if (q.every((w, j) => ws[i + j] === w)) return q.map((_, j) => i + j)
  return []
}
/** The words of `was` lost from `now` once the positions `covered` and the frames that went whole are set aside. */
const lostFrom = (was: string[], now: string[], covered: readonly number[][]) => {
  const off = framed(was, now)
  for (const at of covered) for (const i of at) off[i] = true
  const left = new Map<string, number>()
  was.forEach((w, i) => { if (!off[i]) left.set(w, (left.get(w) ?? 0) + 1) })
  for (const w of now) if (left.has(w)) left.set(w, left.get(w)! - 1)
  return [...left].flatMap(([w, n]) => (n > 0 && !JOINING.has(w) ? Array<string>(n).fill(w) : []))
}
/**
 * The words a sentence lost that nothing covers: neither the new sentence, nor `covered` (quotes, listed drops), nor
 * JOINING or a whole frame. Each covering text covers its words where it first stands in the sentence, word for word,
 * wherever the others stand: a quote and the reviewer's drop of the same words cover them once, and a drop doesn't move
 * to the same words further on (Astra's reads: "Chúng tôi không bán cây này; không thả cây vào bể tép" written "Thả cây
 * vào bể tép" passed). A text not in the sentence word for word covers nothing. A pronoun counts like any word: a
 * neighbour that names what its "Chúng" stood for loses it, and the part stays as it was. Every rule tried for telling its
 * noun from a claim let one through ("Không", "Chỉ những cây này", a word of the sentence before put anywhere: Astra's
 * reads, 13 Nov), and a part kept as it was is no harm.
 */
export function lostWords(before: string, after: string, covered: readonly string[]): string[] {
  const was = words(before)
  return lostFrom(was, words(after), covered.map(c => firstAt(was, words(c))))
}

/**
 * What may go whole by code: a foreign product or medicine, a shop or a price, the owner's complaint. Not a sentence a read
 * calls advice for elsewhere or the source talking, which can be a fact misread (a fish's wild habitat): its writer cuts it.
 */
const CUTTABLE: readonly FitCheck[] = ['product', 'shop', 'price']
/**
 * The part with each sentence a `CUTTABLE` finding quotes cut whole, by code: no model and no new word (the chief of staff,
 * 14 Nov 2026: a sentence a finding flags is deleted, or its foreign detail is). What a writer's cut the guard refused gets
 * instead (fit-rewrite.ts). Nothing when no such sentence is in the part, or every sentence would go (the dealer check's).
 * `gone`: each sentence it took, as `Mended.gone` lists a writer's, for the run's list to the chief of staff. `near`:
 * findings no sentence it takes may stand next to, nor be (a dose, its caution, a lethal level: cut of the product's name,
 * a dose beside it would read as a dose of whatever came before; the readers of #1578, 17 Nov 2026). Such a sentence stays
 * for its page's next try, and the others go; nothing when one of those findings quotes no single sentence of the part, as
 * code can't tell where it stands. Nor does code cut a heading, a sentence whose block would keep only its number, the
 * last line under a heading, or one the next line points back at (the readers of #1578, 17 Nov 2026): each stays for a
 * writer or a person.
 */
/**
 * Each sentence (from 0) that holds a quote's words in a row, whole words, as `cutWhole` finds them: the last word may be
 * the English plural ("Wonder Shells" for the table's "Wonder Shell"), and "Easy Carbo" isn't in "Easy Carbon".
 */
export function holding(pieces: Piece[], quote: string): number[] {
  // A curly apostrophe is a straight one ("Dr. Tim’s"), and a price's sign is part of it: "$12" isn't the "12" of "12 cm"
  // (Codex's read of #1578).
  const straight = (s: string) => s.replace(/[’‘`]/g, "'")
  const x = words(straight(quote))
  const sign = /[$€£¥₫]/u.test(quote) ? norm(straight(quote)) : ''
  return x.length ? pieces.filter(p => p.sentence).flatMap((p, i) => { const w = words(straight(p.html)); return w.some((_, k) => x.every((y, j) => w[k + j] === y || (j === x.length - 1 && /^[a-z]+$/.test(y) && w[k + j] === `${y}s`))) && (!sign || norm(straight(plain(p.html))).includes(sign)) ? [i] : [] }) : []
}

export function cutWhole(html: string, fs: readonly { check: FitCheck; quote?: string }[], o: { near?: readonly { quote?: string }[] } = {}): { html: string; gone: string[] } | undefined {
  const pieces = sentences(html)
  const n = pieces.filter(p => p.sentence).length
  // Each sentence that holds the quote's words in a row, whole words (Astra's read: "ADA" matched in "Canada" cut the
  // wrong sentence and left the product); a quote across two sentences is the writer's, not cut here. The last word may
  // be the English plural: the market table's "Wonder Shell" is "Wonder Shells" on five pages (17 Nov 2026).
  const holds = (quote: string) => holding(pieces, quote)
  const near = (o.near ?? []).map(f => (f.quote ? holds(f.quote) : []))
  if (near.some(x => !x.length)) return undefined
  const close = new Set(near.flat())
  const texts = pieces.filter(p => p.sentence).map(p => p.html)
  const seen = texts.map(t => plain(t))
  // A list's or a heading's own number ("3.", "2)") is a sentence to the splitter, not a line: a dose past it is still the
  // next line, and a block left with only its number is a line cut in half (the readers of #1578, 17 Nov 2026).
  const bare = (i: number) => /^[\s\d.,:;()–—-]*$/u.test(seen[i]!)
  const step = (i: number, d: number) => { let j = i + d; while (j >= 0 && j < n && bare(j)) j += d; return j }
  // Each sentence's block, and whether that block is a heading: a heading cut leaves its section under the one before.
  const block = blockOf(pieces)
  let tag = ''
  const heading = pieces.flatMap(p => { if (p.sentence) return [/^h[1-6]$/.test(tag)]; for (const m of p.html.matchAll(/<(h[1-6]|p|li|td|th|dt|dd|div|blockquote|figcaption)\b/gi)) tag = m[1]!.toLowerCase(); return [] })
  // A line that points back would point at nothing: the sentence before it stays. "này", "đó" or "ấy" anywhere in it ("Hai
  // sản phẩm này…", "Với loại đèn này…"), or a start that counts or names what came before ("Cả ba…", "Hai…", "Chúng…").
  // Keeping a sentence is the cheaper mistake (Codex's read of #1578).
  const points = (i: number) => /(?<![\p{L}\p{N}])(?:này|đó|ấy)(?![\p{L}\p{N}])|^(?:chúng|nó|đây|cả|hai|ba|bốn)(?![\p{L}\p{N}])/iu.test(seen[i] ?? '')
  // Each sentence's section, by the headings before it: a section left with its heading alone isn't a section.
  let sections = 0, head = -1
  const section = texts.map((_, i) => { if (heading[i] && block[i] !== head) { sections++; head = block[i]! } return sections })
  const gone = new Set(fs.filter(f => CUTTABLE.includes(f.check) && f.quote).flatMap(f => holds(f.quote!)).filter(i => !heading[i] && !close.has(step(i, -1)) && !close.has(i) && !close.has(step(i, 1))))
  for (let changed = true; changed;) {
    changed = false
    for (const i of gone) {
      const after = step(i, 1)
      const rest = texts.map((_, j) => j).filter(j => j !== i && block[j] === block[i] && !gone.has(j))
      const kept = texts.map((_, j) => j).filter(j => j !== i && section[j] === section[i] && !heading[j] && !bare(j) && !gone.has(j))
      if ((after < n && !gone.has(after) && points(after)) || (rest.length && rest.every(bare)) || (section[i]! > 0 && !kept.length)) { gone.delete(i); changed = true }
    }
  }
  if (!gone.size || gone.size >= n) return undefined
  return { html: splice(pieces, new Map([...gone].map(i => [i, '']))), gone: [...gone].sort((a, b) => a - b).map(i => `sentence ${i + 1} went whole: "${plain(texts[i]!)}"`) }
}

/**
 * What a sentence cut may put in to join what's left: only these, the six the writer is told (prompts/fit-mend.md), not a
 * pointer ("này", "đó") or "bạn", which say who or which, nor "hoặc", which can make "both" "either" (the chief of staff,
 * 14 Nov 2026: "The rewrite may mend the grammar round a deletion and nothing else").
 */
const GLUE = new Set('và thì là mà nhưng của'.split(' '))
/**
 * What a cut may take from inside a sentence: a detail, the rest of the sentence true without it (a price, a product's or
 * a shop's name, a unit, a keepers' word). A finding on where the statement applies, a dealer's batch or stock, the
 * source's own photo, video or tank (`source`), takes its sentence whole: cut of those words, the rest says of everything
 * what was said of that batch ("Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah" cut to "Có vẻ
 * cả đực lẫn cái…"). So does any check the code can't tell is one or the other (`elsewhere`, a dose's, a lethal level):
 * losing a true line is the cheaper mistake (the chief of staff, 14 Nov 2026).
 */
const DETAIL: readonly FitCheck[] = ['price', 'product', 'shop', 'units', 'words']
export const goesWhole = (check: FitCheck) => !DETAIL.includes(check)

/**
 * Whether a source finding quotes exactly the second clause of its sentence, "X, nhưng Y" (or "song Y"), its joining word
 * and stop aside, in the part's last sentence. Then the writer cuts only that clause, code refuses what's left if it keeps
 * any of it, and its reviewer reads what's left as it reads any cut (the chief
 * of staff, 15 Nov 2026: "Cá Leporinus đôi khi hay gây gổ với cá cùng loài" is true of every Leporinus, and went whole
 * with "những con này tới giờ vẫn khá hiền", which was of one batch). The writer may still take the sentence whole, when
 * what's left isn't true of every such fish. A cut by code alone was tried first: three stand-in reads found it could
 * leave half a sentence, or one the next sentence leaned on, with nothing to read it.
 */
const HALF = /,\s+(?:nhưng|song)(?! song)\s+/giu
// "Tuy …, nhưng …", "Mặc dù …, nhưng …": what comes before the clause is half a sentence on its own.
const CONCEDES = /^(?:tuy(?!\s+nhiên)|mặc dù|dù|dẫu)\s/iu
/** A sentence's last ", nhưng"/", song" clause: what comes before it, the clause with its joining word, and after it. */
const halves = (s: string) => {
  const last = [...s.matchAll(HALF)].at(-1)
  return last ? { head: s.slice(0, last.index!), tail: s.slice(last.index!), rest: s.slice(last.index! + last[0].length) } : undefined
}
export function batchHalf(html: string, f: { check: FitCheck; quote?: string }): boolean {
  if (f.check !== 'source' || !f.quote) return false
  const pieces = sentences(html)
  const on = quoted(pieces, f.quote)
  const all = pieces.filter(p => p.sentence)
  // Only in the part's last sentence: one after it may lean on the half that goes ("Vì vậy …"), and the mender's reviewer
  // reads only the sentences that changed (a stand-in read of 15 Nov 2026).
  if (on.length !== 1 || on[0] !== all.length - 1) return false
  const h = halves(plain(all[on[0]!]!.html))
  if (!h || CONCEDES.test(h.head.trim())) return false
  const bare = (x: string) => norm(x).replace(/[.!?…]+$/u, '').replace(/^(?:nhưng|song)\s+/u, '').trim()
  return bare(h.rest) === bare(f.quote)
}
/**
 * The words `after` has that `before` hasn't, in its order: each of its words is the next of `before`'s that is still to
 * come, or a joining word (GLUE), or one of `allowed` (each once). Words only taken out, and joined again, add none.
 */
export function addedWords(before: string, after: string, allowed: readonly string[] | readonly Map<string, number>[] = []): string[] {
  const was: string[] = [...words(before)]
  // The words each finding may put in, each once: a list, or its findings' tallies, spent across the part (`tally`).
  const pools = allowed.length && typeof allowed[0] !== 'string' ? allowed as readonly Map<string, number>[] : [tally(allowed as readonly string[])]
  const out: string[] = []
  let at = 0
  for (const w of words(after)) {
    const i = was.indexOf(w, at)
    if (i >= 0) { at = i + 1; continue }
    if (GLUE.has(w)) continue
    const pool = pools.find(m => m.get(w))
    if (pool) { pool.set(w, pool.get(w)! - 1); continue }
    out.push(w)
  }
  return out
}
/** A finding's words to put in, each as often as it gives it. */
const tally = (xs: readonly string[]) => xs.flatMap(a => words(a)).reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>())

/**
 * A finding to mend: what it quotes, the writer's note, (`covers`) the other text its change replaces, as a breed page's
 * units the old figure ("38 lít mỗi 2,5 cm" for a quote of "38 lít"), and (`adds`) what it asks to be put in: a wording
 * finding's keepers' word.
 */
/** `whole: false`: only the quoted words go, though the check takes a sentence whole, unless the writer takes it whole (batchHalf). */
export type MendFinding = { check: FitCheck; quote: string; note: string; covers?: readonly string[]; adds?: readonly string[]; whole?: false }
export type Dropped = { sentence: number; finding: number; text: string }
/** `added`: each changed sentence that says what it didn't (addedWords): the part isn't kept with any. */
/**
 * `whole`: what the whole-sentence rule refuses (`goesWhole`). `stranded`: of those, each line the writer says no longer
 * reads without what went, which a code cut of the same sentence would leave too. `follows`: each sentence the writer took
 * with the one before it, its reviewer agreeing or not, which a code cut of the one before would leave behind. `gone`:
 * each sentence the part lost, whatever its finding, and each that went with the one before it, as the run lists them for
 * the chief of staff.
 */
export type Mended = { html: string; score: number; notes: string[]; lost: HedgePair[]; unasked: string[]; added: string[]; whole: string[]; stranded: string[]; follows: number[]; gone: string[] }

const WRITER_SCHEMA = {
  type: 'object', required: ['sentences'],
  properties: { sentences: { type: 'array', items: { type: 'object', required: ['n', 'vi'], properties: { n: { type: 'number' }, vi: { type: 'string' }, why: { type: 'string' } } } } },
}
const REVIEW_SCHEMA = {
  type: 'object', required: ['score', 'notes', 'dropped', 'hedges', 'follows'],
  properties: {
    score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } },
    dropped: { type: 'array', items: { type: 'object', required: ['sentence', 'finding', 'text'], properties: { sentence: { type: 'number' }, finding: { type: 'number' }, text: { type: 'string' } } } },
    hedges: HEDGES_SCHEMA,
    follows: { type: 'array', items: { type: 'object', required: ['sentence', 'agree'], properties: { sentence: { type: 'number' }, agree: { type: 'boolean' } } } },
  },
}

/** A sentence as the writer returned it: inline markup only, as the site keeps it; nothing when it's to go. */
const inline = (vi: string) => {
  const t = vi.trim()
  if (!t) return ''
  return sanitizeHtml(t).replace(/<\/?(p|ul|ol|li|h3|table|thead|tbody|tr|th|td)>/g, ' ').replace(/<br>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Whether something left out is asked for: its finding is one of the part's (numbered from 1), asks for something to go,
 * and quotes the sentence it was left out of (numbered from 1).
 */
export const asked = (d: Dropped, named: readonly { check: FitCheck; sentences: readonly number[] }[]) => {
  const f = named[d.finding - 1]
  return !!f && !NO_DROP.includes(f.check) && f.sentences.includes(d.sentence)
}

/**
 * The part mended, its review, and what was left out with no finding asking for it (`unasked`: the part isn't kept with
 * any). A string when it isn't tried: no finding's quote is in the part, or every sentence would go in a part of more than
 * three, or one with a sentence no finding asks to go (held, its sentences for the chief of staff). With `metric`, a sentence that
 * changes is written in metric (a fish, plant or breed page's rule, metric.ts), and no other: the rest of the page is
 * as it was, byte for byte (Astra's read).
 */
export async function mendPart(llm: Llm, html: string, fs: MendFinding[], o: { en?: string; source?: string; model?: string; metric?: boolean; figures?: string } = {}): Promise<Mended | string> {
  const pieces = sentences(html)
  const texts = pieces.filter(p => p.sentence).map(p => p.html)
  // Each finding the part's text quotes, with the sentences (from 1) its quote lies in.
  const named = fs.map(f => ({ ...f, sentences: quoted(pieces, f.quote).map(i => i + 1) })).filter(f => f.sentences.length)
  if (!named.length) return 'its findings\' quotes aren\'t in its text'
  const fix = [...new Set(named.flatMap(f => f.sentences))].sort((a, b) => a - b)
  const prompt = [
    WRITE, VI_STYLE,
    ...(o.source ? [`Nguồn của nội dung: ${o.source}. Chỗ bài gốc xưng "tôi"/"chúng tôi" thì viết trung tính, không nhắc ${o.source} hay "tác giả".`] : []),
    `--- PART ---\n${texts.map((t, i) => `[${i + 1}] ${t}`).join('\n')}`,
    ...(o.en ? [`--- ENGLISH ---\n${o.en}`] : []),
    `--- FIX ---\n${fix.map(n => `[${n}] ${named.filter(f => f.sentences.includes(n)).map(f => f.note).join(' ')}`).join('\n')}`,
  ].join('\n\n')
  const w = await llm<{ sentences: { n: number; vi: string; why?: string }[] }>({ system: 'You edit Vietnamese for an aquarium handbook. Reply only with JSON.', prompt, schema: WRITER_SCHEMA, ...(o.model ? { model: o.model } : {}) })
  // A sentence answered twice is answered neither way: which answer counts is a guess, and the first can carry a pass the
  // second doesn't earn (Astra's read: a line that went with the one before kept its pass once a second answer reworded it).
  const twice = [...new Set(w.sentences.map(x => Number(x.n)).filter((n, i, a) => a.indexOf(n) !== i))]
  if (twice.length) return `the writer answered sentence ${twice.join(', ')} twice`
  const changes = new Map<number, string>()
  // What the writer wrote, before any conversion: the words it lost are counted on this, not on the metric we add.
  const raw = new Map<number, string>()
  // Not where a dose is given: its water is converted exactly or not at all, and the converter rounds (round.ts givesDose,
  // read over the whole part; Astra's read: "Pha 1 ml thuốc vào 2 gallon nước" became "8 lít").
  const metric = o.metric && !givesDose(html) && !givesDose(o.en ?? '')
  const written = (n: number, vi: string) => { const t = inline(vi); raw.set(n - 1, t); return metric && t ? toMetric(t, 'vi') : t }
  for (const n of fix) {
    const r = w.sentences.find(x => Number(x.n) === n)
    if (!r) throw new Error(`the writer left out sentence ${n}`)
    changes.set(n - 1, written(n, r.vi))
  }
  // A neighbour of a sentence that changed, said why, and not left out: one that no longer read beside the change, right
  // before or after it in the same paragraph or list item (the Writing Lead: across a block, the reader starts afresh).
  const block = blockOf(pieces)
  // One the writer returns empty, said why, can't be cut to read: left, it points at what went ("Đây là một phụ lưu của
  // Amazon" after the ram's photo sentence, which then says it of the Orinoco). It goes too only when it is the sentence
  // right after one that went whole, in the same paragraph, and the reviewer agrees it no longer reads true or whole
  // without it (`follows`): not the one before, nor one after that. Any other, the part is a person's (the chief of staff,
  // 14 Nov 2026).
  const wentWhole = (m: number) => fix.includes(m) && named.some(f => goesWhole(f.check) && f.sentences.includes(m)) && changes.get(m - 1) === ''
  const follows = new Map<number, string>()
  const stranded: string[] = []
  for (const r of w.sentences) {
    const n = Number(r.n)
    if (fix.includes(n) || !texts[n - 1] || !r.why?.trim()) continue
    const beside = fix.some(m => Math.abs(m - n) === 1 && block[m - 1] === block[n - 1] && changes.get(m - 1) !== texts[m - 1])
    if (inline(r.vi)) { if (beside) changes.set(n - 1, written(n, r.vi)) } else if (beside && wentWhole(n - 1) && block[n - 2] === block[n - 1]) {
      changes.set(n - 1, '')
      follows.set(n, r.why.trim())
    } else stranded.push(`Sentence ${n} no longer reads without what went, and only the one right after a sentence that went whole may go with it: "${plain(texts[n - 1]!)}"`)
  }
  for (const [i, t] of [...changes]) if (t === texts[i]) changes.delete(i)
  const after = splice(pieces, changes)
  // A sentence a finding takes whole (`goesWhole`): any answer for it but an empty one is refused, whatever its reviewer
  // scores.
  const whole = [...[...new Set(named.filter(f => goesWhole(f.check) && f.whole !== false).flatMap(f => f.sentences))].sort((a, b) => a - b)
    .filter(n => raw.get(n - 1)).map(n => `Sentence ${n} goes whole, as its finding asks, and was kept as "${plain(raw.get(n - 1)!)}"`), ...stranded,
    // A batch half's sentence kept holds only what came before the clause: a word of the clause left says of every such
    // fish what was said of one batch ("…, nhưng khá hiền"; a stand-in read of 15 Nov 2026), and so does the clause left.
    ...[...new Set(named.filter(f => f.whole === false).flatMap(f => f.sentences))].sort((a, b) => a - b).filter(n => raw.get(n - 1)).flatMap(n => {
      const left = addedWords(halves(plain(texts[n - 1]!))?.head ?? '', raw.get(n - 1)!)
      return left.length ? [`Sentence ${n} keeps only what comes before its batch half, as its finding asks, and kept of the half: "${left.join(' ')}"`] : []
    })]
  if (!changes.size) return { html, score: 1, notes: whole, lost: [], unasked: [], added: [], whole, stranded, follows: [], gone: [] }
  // Every sentence to go: a part of three or fewer, each named by a finding that takes its sentence whole
  // (`goesWhole`: a price, product or shop finding cuts only its words, Grok's read), comes off the page whole
  // (fit-rewrite.ts), with nothing left to review. A longer one is more likely the read's mistake than the page's, and
  // stays held, its sentences for the chief of staff (14 Nov 2026: four pages were held for good on one-line parts that
  // were all the source's, "Nơi sống có ảnh chụp: …", which no dealer check takes).
  if (texts.every((t, i) => changes.get(i) === '')) {
    const said = texts.map((t, i) => `sentence ${i + 1}: "${plain(t!)}"`).join('; ')
    if (texts.length > 3) return `every sentence would go, and the part has ${texts.length}: held for the chief of staff (${said})`
    if (!texts.every((_, i) => named.some(f => goesWhole(f.check) && f.sentences.includes(i + 1)))) return `every sentence would go, and not each is a finding's to take: held for the chief of staff (${said})`
    return { html: '', score: 1, notes: [], lost: [], unasked: [], added: [], whole: [], stranded: [], follows: [], gone: texts.map((t, i) => `sentence ${i + 1} went whole: "${plain(t!)}"`) }
  }
  const shown = [...changes.keys()].sort((a, b) => a - b)
  const body = [
    `--- FINDINGS ---\n${named.map((f, i) => `${i + 1}. (${f.check}, in sentence ${f.sentences.join(', ')}) quotes "${f.quote}": ${f.note}`).join('\n')}`,
    ...(o.en ? [`--- ENGLISH, for reference ---\n${o.en}`] : []),
    // A breed page's units: the figures the notes change, which the reviewer is told are right (fit-rewrite.ts).
    ...(o.figures ? [`--- FIGURES ---\n${o.figures}`] : []),
    shown.map(i => `### sentence ${i + 1}\nBEFORE:\n${texts[i]}\nAFTER:\n${changes.get(i) || '(left out)'}`).join('\n\n'),
    ...(follows.size ? [`--- LEFT OUT WITH THE SENTENCE BEFORE ---\n${[...follows].map(([n, why]) => `sentence ${n}, after sentence ${n - 1}, which went whole. The editor says: ${why}`).join('\n')}`] : []),
  ].join('\n\n')
  const r = await llm<{ score: number; notes: string[]; dropped: Dropped[]; hedges: HedgePair[]; follows?: { sentence: number; agree: boolean }[] }>({ system: 'You are a strict Vietnamese editor checking an edit. Reply only with JSON.', prompt: `${REVIEW}\n\n${hedgesAsk('BEFORE', 'AFTER')}\n\n${body}`, schema: REVIEW_SCHEMA })
  const dropped = (r.dropped ?? []).map(d => ({ ...d, sentence: Number(d.sentence), finding: Number(d.finding) }))
  const licensed = dropped.filter(d => asked(d, named))
  const flat = texts.flatMap((t, i) => words(t!).map((w, k) => ({ w, i, k })))
  // A sentence left out whole needs a finding that asks for something to go, whatever the reviewer lists; and every word
  // a changed sentence lost is quoted by a finding there, or listed under one that asks for it to go, or a joining word.
  const agreed = new Set((r.follows ?? []).filter(x => x.agree === true).map(x => Number(x.sentence)))
  const unagreed = [...follows.keys()].filter(n => !agreed.has(n)).map(n => `Sentence ${n} went with the one before it, and its reviewer doesn't agree it no longer reads without it: "${plain(texts[n - 1]!)}"`)
  const unasked = [
    ...shown.filter(i => changes.get(i) === '' && !follows.has(i + 1) && !named.some(f => !NO_DROP.includes(f.check) && f.sentences.includes(i + 1))).map(i => `Left out, and no finding asks for it to go: "${plain(texts[i]!)}"`),
    ...shown.filter(i => !follows.has(i + 1)).flatMap(i => {
      // Each quote and listed drop where it first stands in the part, and the share of it in this sentence: a quote over
      // two sentences covers its words in each (Astra's read). A finding that takes its sentence whole covers all of it.
      // A batch half's sentence the writer kept loses only the quoted clause; one it took whole, all of it.
      const emptied = !(raw.get(i) ?? changes.get(i))
      // A kept one loses the clause with its joining word, whether or not the quote has it.
      const covered = [...named.filter(f => f.sentences.includes(i + 1)).flatMap(f => (goesWhole(f.check) && (f.whole !== false || emptied) ? [texts[i]!] : f.whole === false ? [halves(plain(texts[i]!))?.tail ?? f.quote] : [f.quote, ...(f.covers ?? [])])), ...licensed.filter(d => named[d.finding - 1]!.sentences.includes(i + 1)).map(d => d.text)]
      const gone = lostFrom(words(texts[i]!), words(raw.get(i) ?? changes.get(i)!), covered.map(c => firstAt(flat.map(x => x.w), words(c)).flatMap(n => (flat[n]!.i === i ? [flat[n]!.k] : []))))
      return gone.length ? [`Left out of sentence ${i + 1}, and no finding asks for it to go: "${gone.join(' ')}"`] : []
    }),
    ...dropped.filter(d => !asked(d, named) && !follows.has(d.sentence)).map(d => `Left out, and no finding asks for it to go: "${d.text}"`),
  ]
  // Every changed sentence is the one it was, cut: what the writer wrote, before metric, as the words lost are counted. A
  // units finding's sentence too: the writer leaves its measures as they are and code converts them (`metric`), or gives
  // the figures code worked out for a breed (`adds`). Astra's reads of 14 Nov 2026: a writer's own conversion let "mỗi
  // con", "2 inch" as "2 cm" and a figure from another measure through, however its figures were held.
  // A finding's words to put in are spent across the part, not given again to each sentence it covers (Astra's read: a
  // breed's "130 lít" let "130" into a fish's length beside it).
  const pools = new Map(named.map(f => [f, tally(f.adds ?? [])]))
  const added = shown.flatMap(i => {
    const now = raw.get(i) ?? changes.get(i)!
    const mine = named.filter(f => f.sentences.includes(i + 1))
    if (!now) return []
    const extra = addedWords(texts[i]!, now, mine.map(f => pools.get(f)!))
    return extra.length ? [`Sentence ${i + 1} says what it didn't: "${extra.join(' ')}"`] : []
  })
  const lost = hedgesLost(r.hedges ?? [], shown.map(i => texts[i]).join('\n'), shown.map(i => changes.get(i)).join('\n'))
  const gone = [
    // Every sentence the part lost, a detail's that came to nothing too (Astra's read of fa80ab004).
    ...fix.filter(n => changes.get(n - 1) === '').map(n => `sentence ${n} went whole: "${plain(texts[n - 1]!)}"`),
    ...[...follows.keys()].map(n => `sentence ${n} went with the one before it ("${plain(texts[n - 2]!)}"): "${plain(texts[n - 1]!)}"`),
  ]
  return {
    html: after, score: Math.min(1, Math.max(0, Number(r.score) || 0)), lost, unasked, added, whole: [...whole, ...unagreed], stranded, follows: [...follows.keys()], gone,
    notes: [...unasked, ...added, ...whole, ...unagreed, ...lost.map(h => `Said more surely than before: "${h.to}" (was: "${h.from}")`), ...(r.notes ?? []).slice(0, 10)],
  }
}
