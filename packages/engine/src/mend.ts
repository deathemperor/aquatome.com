import { readFileSync } from 'node:fs'
import { toMetric } from '@aq/schema'
import type { Llm } from './claude'
import type { FitCheck } from './fit'
import { hedgesAsk, hedgesLost, HEDGES_SCHEMA, type HedgePair } from './hedges'
import { VI_STYLE } from './phrases'
import { withTanks } from './round'
import { sanitizeHtml } from './sanitize'
import { plain, quoted, sentences, splice } from './sentences'

/**
 * A part of a fish, plant or breed page mended for what the reader-fit read found (fit-rewrite.ts), by two rules of the
 * chief of staff's (13 Nov 2026), which the code holds, not the prompts:
 * - Only the sentences a finding quotes are written again; every other sentence is put back word for word (sentences.ts).
 *   A sentence next to one that changed may change too when the writer says why: one that no longer reads once its
 *   neighbour changed.
 * - Something left out is accepted only when a finding that names that sentence asks for it to go. On 13 Nov the front
 *   list's first run kept 4 of 17 parts: its reviewer, judging against the English, asked back what the findings had
 *   dropped ("In the population imported now", "bunches are currently NOT produced at Tropica's own nursery", "in the
 *   images", "for less than $10"). Its reviewer now sees the changed sentences before and after, with the findings, and
 *   lists what is left out with the finding that asks for it, which the code checks. The code also counts every word a
 *   changed sentence loses: each is in a finding's quote there, or in what the reviewer listed under a finding that
 *   asks for it to go, or only joins or frames it (JOINING, FRAMES, PRONOUNS); a word lost and listed by no one isn't kept (Astra's read: a
 *   writer that also dropped "độc với tép" from a sentence asked only for its price passed when its reviewer said
 *   nothing).
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
 * A pronoun may go only for the noun it stood for, once the sentence it pointed to has gone, and as the sentence's only
 * change: "Chúng chứa thuốc trừ sâu" written "Cây chứa thuốc trừ sâu" after "Cây giá 5 đô la một bó" went. One that goes
 * any other way is lost ("Cá ăn con của chúng" written "Cá thường ăn con", though "thường" was in the sentence before:
 * Astra's read).
 */
const PRONOUNS = new Set(['chúng', 'nó', 'họ'])
/**
 * What only frames a sentence or links it to the one before ("Cần lưu ý rằng", "Vì thế"), when it goes whole: not under
 * a negation, and with no two of its words left together ("Không cần lưu ý nhiệt độ" written "Không lưu ý nhiệt độ"
 * lost "cần", Astra's read). A frame that doesn't go whole is counted whole, a shorter one inside it too ("Không cần lưu
 * ý rằng" written "Không cần" isn't let off "lưu ý rằng").
 */
const FRAMES = ['cần lưu ý rằng', 'cần lưu ý', 'lưu ý rằng', 'vì thế', 'vì vậy', 'do đó', 'tuy vậy', 'tuy nhiên', 'ngoài ra', 'cho nên'].map(f => f.split(' '))
const NEGATIONS = new Set(['không', 'chẳng', 'chả', 'chưa', 'đừng'])
const words = (s: string) => plain(s).normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
/** A sentence's words less the framing phrases that went whole from it. */
const unframed = (ws: string[], after: string[]) => {
  const kept = new Set(after.slice(1).map((w, i) => `${after[i]} ${w}`))
  const out: string[] = []
  for (let i = 0; i < ws.length;) {
    const f = FRAMES.find(f => f.every((w, j) => ws[i + j] === w))
    if (!f) { out.push(ws[i++]!); continue }
    if (NEGATIONS.has(ws[i - 1] ?? '') || f.slice(1).some((w, j) => kept.has(`${f[j]} ${w}`))) out.push(...f)
    i += f.length
  }
  return out
}
/**
 * Words that say something about a claim and so never stand for a noun, whatever the sentence before holds: "Chúng chứa
 * thuốc trừ sâu" written "Không chứa thuốc trừ sâu" after "Cây không được bán ở đây" turns a warning around (Astra's read).
 */
const NOT_NOUNS = new Set([...NEGATIONS, ...'có được bị cần nên phải rất khá đã đang sẽ cũng vẫn còn thường hay luôn ít nhiều'.split(' ')])
/**
 * The pronoun `now` puts a phrase of the sentence before in place of, when that is all that changed from `was`: the
 * phrase as it stood there, word for word, and none of it a word that says something (NOT_NOUNS).
 */
const renamed = (was: string[], now: string[], previous: string[]) => {
  let a = 0
  while (a < was.length && a < now.length && was[a] === now[a]) a++
  let b = 0
  while (b < was.length - a && b < now.length - a && was.at(-1 - b) === now.at(-1 - b)) b++
  const out = was.slice(a, was.length - b), into = now.slice(a, now.length - b)
  return out.length === 1 && PRONOUNS.has(out[0]!) && into.length && !into.some(w => NOT_NOUNS.has(w)) && ` ${previous.join(' ')} `.includes(` ${into.join(' ')} `) ? out[0] : undefined
}
/**
 * The words a sentence lost that nothing covers: neither the new sentence, nor `covered` (quotes, listed drops), nor
 * JOINING, a whole frame, or a pronoun put as its noun from `previous` (the sentence before, as it was).
 */
export function lostWords(before: string, after: string, covered: readonly string[], previous = ''): string[] {
  const now = words(after), was = unframed(words(before), now)
  const left = new Map<string, number>()
  for (const w of was) left.set(w, (left.get(w) ?? 0) + 1)
  for (const w of [...now, ...covered.flatMap(words)]) if (left.has(w)) left.set(w, left.get(w)! - 1)
  const swapped = renamed(was, now, words(previous))
  return [...left].flatMap(([w, n]) => (n > 0 && !JOINING.has(w) ? Array<string>(w === swapped ? n - 1 : n).fill(w) : []))
}

export type MendFinding = { check: FitCheck; quote: string; note: string }
export type Dropped = { sentence: number; finding: number; text: string }
export type Mended = { html: string; score: number; notes: string[]; lost: HedgePair[]; unasked: string[] }

const WRITER_SCHEMA = {
  type: 'object', required: ['sentences'],
  properties: { sentences: { type: 'array', items: { type: 'object', required: ['n', 'vi'], properties: { n: { type: 'number' }, vi: { type: 'string' }, why: { type: 'string' } } } } },
}
const REVIEW_SCHEMA = {
  type: 'object', required: ['score', 'notes', 'dropped', 'hedges'],
  properties: {
    score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } },
    dropped: { type: 'array', items: { type: 'object', required: ['sentence', 'finding', 'text'], properties: { sentence: { type: 'number' }, finding: { type: 'number' }, text: { type: 'string' } } } },
    hedges: HEDGES_SCHEMA,
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
 * any). A string when it isn't tried: no finding's quote is in the part, or every sentence would go (a part that is all a
 * dealer's notice is the dealer check's to settle, the chief of staff, 13 Nov 2026). With `metric`, a sentence that
 * changes is written in metric (a fish, plant or breed page's rule, metric.ts), and no other: the rest of the page is
 * as it was, byte for byte (Astra's read).
 */
export async function mendPart(llm: Llm, html: string, fs: MendFinding[], o: { en?: string; source?: string; model?: string; metric?: boolean } = {}): Promise<Mended | string> {
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
  const changes = new Map<number, string>()
  // What the writer wrote, before any conversion: the words it lost are counted on this, not on the metric we add.
  const raw = new Map<number, string>()
  const written = (n: number, vi: string) => { const t = inline(vi); raw.set(n - 1, t); return o.metric && t ? toMetric(t, 'vi') : t }
  for (const n of fix) {
    const r = w.sentences.find(x => Number(x.n) === n)
    if (!r) throw new Error(`the writer left out sentence ${n}`)
    changes.set(n - 1, written(n, r.vi))
  }
  // A neighbour of a sentence that changed, said why, and not left out: one that no longer read beside the change.
  for (const r of w.sentences) {
    const n = Number(r.n)
    if (fix.includes(n) || !texts[n - 1] || !r.why?.trim() || !inline(r.vi)) continue
    if (fix.some(m => Math.abs(m - n) === 1 && changes.get(m - 1) !== texts[m - 1])) changes.set(n - 1, written(n, r.vi))
  }
  for (const [i, t] of [...changes]) if (t === texts[i]) changes.delete(i)
  const after = splice(pieces, changes)
  if (!changes.size) return { html, score: 1, notes: [], lost: [], unasked: [] }
  if (texts.every((t, i) => changes.get(i) === '')) return 'every sentence would go, so the part is the dealer check\'s to settle'
  const shown = [...changes.keys()].sort((a, b) => a - b)
  const body = [
    `--- FINDINGS ---\n${named.map((f, i) => `${i + 1}. (${f.check}, in sentence ${f.sentences.join(', ')}) quotes "${f.quote}": ${f.note}`).join('\n')}`,
    ...(o.en ? [`--- ENGLISH, for reference ---\n${o.en}`] : []),
    shown.map(i => `### sentence ${i + 1}\nBEFORE:\n${texts[i]}\nAFTER:\n${changes.get(i) || '(left out)'}`).join('\n\n'),
  ].join('\n\n')
  const r = await llm<{ score: number; notes: string[]; dropped: Dropped[]; hedges: HedgePair[] }>({ system: 'You are a strict Vietnamese editor checking an edit. Reply only with JSON.', prompt: `${REVIEW}\n\n${hedgesAsk('BEFORE', 'AFTER')}\n\n${body}`, schema: REVIEW_SCHEMA })
  const dropped = (r.dropped ?? []).map(d => ({ ...d, sentence: Number(d.sentence), finding: Number(d.finding) }))
  const licensed = dropped.filter(d => asked(d, named))
  // A sentence left out whole needs a finding that asks for something to go, whatever the reviewer lists; and every word
  // a changed sentence lost is quoted by a finding there, or listed under one that asks for it to go, or a joining word.
  const unasked = [
    ...shown.filter(i => changes.get(i) === '' && !named.some(f => !NO_DROP.includes(f.check) && f.sentences.includes(i + 1))).map(i => `Left out, and no finding asks for it to go: "${plain(texts[i]!)}"`),
    ...shown.flatMap(i => {
      const covered = [...named.filter(f => f.sentences.includes(i + 1)).map(f => f.quote), ...licensed.filter(d => d.sentence === i + 1).map(d => d.text)]
      const lost = lostWords(texts[i]!, raw.get(i) ?? changes.get(i)!, covered, texts[i - 1] ?? '')
      return lost.length ? [`Left out of sentence ${i + 1}, and no finding asks for it to go: "${lost.join(' ')}"`] : []
    }),
    ...dropped.filter(d => !asked(d, named)).map(d => `Left out, and no finding asks for it to go: "${d.text}"`),
  ]
  const lost = hedgesLost(r.hedges ?? [], shown.map(i => texts[i]).join('\n'), shown.map(i => changes.get(i)).join('\n'))
  return {
    html: after, score: Math.min(1, Math.max(0, Number(r.score) || 0)), lost, unasked,
    notes: [...unasked, ...lost.map(h => `Said more surely than before: "${h.to}" (was: "${h.from}")`), ...(r.notes ?? []).slice(0, 10)],
  }
}
