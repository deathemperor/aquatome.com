import { readFileSync } from 'node:fs'
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
 *   lists what is left out with the finding that asks for it, which the code checks.
 * The writer's and the reviewer's words are prompts/fit-mend.md and prompts/fit-mend-review.md.
 */
const WRITE = readFileSync(new URL('./prompts/fit-mend.md', import.meta.url), 'utf8').trim()
const REVIEW = withTanks(readFileSync(new URL('./prompts/fit-mend-review.md', import.meta.url), 'utf8').trim())

/** What a finding asks for: a conversion (units) or another word (words) asks for nothing to go. */
const NO_DROP: readonly FitCheck[] = ['units', 'words']

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
 * dealer's notice is the dealer check's to settle, the chief of staff, 13 Nov 2026).
 */
export async function mendPart(llm: Llm, html: string, fs: MendFinding[], o: { en?: string; source?: string; model?: string } = {}): Promise<Mended | string> {
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
  for (const n of fix) {
    const r = w.sentences.find(x => Number(x.n) === n)
    if (!r) throw new Error(`the writer left out sentence ${n}`)
    changes.set(n - 1, inline(r.vi))
  }
  // A neighbour of a sentence that changed, said why, and not left out: one that no longer read beside the change.
  for (const r of w.sentences) {
    const n = Number(r.n)
    if (fix.includes(n) || !texts[n - 1] || !r.why?.trim() || !inline(r.vi)) continue
    if (fix.some(m => Math.abs(m - n) === 1 && changes.get(m - 1) !== texts[m - 1])) changes.set(n - 1, inline(r.vi))
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
  // A sentence left out whole needs a finding that asks for something to go, whatever the reviewer lists.
  const unasked = [
    ...shown.filter(i => changes.get(i) === '' && !named.some(f => !NO_DROP.includes(f.check) && f.sentences.includes(i + 1))).map(i => `Left out, and no finding asks for it to go: "${plain(texts[i]!)}"`),
    ...(r.dropped ?? []).filter(d => !asked({ ...d, sentence: Number(d.sentence), finding: Number(d.finding) }, named)).map(d => `Left out, and no finding asks for it to go: "${d.text}"`),
  ]
  const lost = hedgesLost(r.hedges ?? [], shown.map(i => texts[i]).join('\n'), shown.map(i => changes.get(i)).join('\n'))
  return {
    html: after, score: Math.min(1, Math.max(0, Number(r.score) || 0)), lost, unasked,
    notes: [...unasked, ...lost.map(h => `Said more surely than before: "${h.to}" (was: "${h.from}")`), ...(r.notes ?? []).slice(0, 10)],
  }
}
