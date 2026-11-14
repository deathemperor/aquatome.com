import type { Llm } from './claude'
import { unescapePlain } from './sanitize'

/**
 * The glossary step's fact check, sentence by sentence (the chief of staff, 14 Nov 2026). The old check gave one score and
 * picked its own claims each read: on Lũa's drafts its single reads came in at about 0.9 or about 0.72, two reads of one
 * text flagged the same claims in at most 17 of 105 pairs, and one draft scored 0.95 and then 0.72. Here the entry is split
 * into its sentences in code and every read gives every sentence a verdict, so each read judges the same claims: three
 * reads agreed on 95–97% of Lũa's sentences, caught seven planted errors in three reads of three, and moved no untouched
 * sentence to a stop.
 */

export type Verdict = 'supported' | 'loose' | 'unsupported' | 'contradicts' | 'not a claim'
/** One sentence of an entry, the definition or paragraph or list item it stands in, and the heading it stands under, as plain text. */
export type Sentence = { text: string; block: string; heading?: string }
type Read = { verdict: Verdict; why?: string }
/** A sentence the reads call loose, unsupported or contradicted, with what they said. */
export type Flagged = Sentence & { verdicts: Verdict[]; why: string[] }
export type FactCheck = {
  /** The share of its claims (sentences most reads don't call "not a claim") no stop falls on. */
  score: number
  /** Two reads of three (or of a contradiction's three more) say the facts don't carry it: the save stops. */
  stops: Flagged[]
  /** Two reads of three call it loose and it doesn't stop: advice, for the middle path. */
  loose: Flagged[]
}

const plain = (html: string) => unescapePlain(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** A tag that starts or ends a block of text; any other (bold, a link) stands inside one. */
const BLOCK = /<\/?(?:p|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|caption|div|section|blockquote|dl|dt|dd|figure|figcaption|br|hr)\b[^>]*>/gi

/**
 * The entry's sentences: the definition's, then every piece of the body's text in order, each under the heading before it,
 * split where a sentence ends and a capital starts. All the body's text is read wherever it stands, a heading's, a table
 * cell's or text outside any tag (Codex, 14 Nov 2026: a claim in a table cell, which the saved page keeps, was never read).
 * The heading goes with what follows it: an item under "Sai lầm hay gặp" is a warning, not a fragment (Codex: one read
 * called three such items "not a claim").
 */
export function sentences(e: { definition: string; body: string }): Sentence[] {
  const blocks: { block: string; heading?: string }[] = [{ block: plain(e.definition) }]
  let heading: string | undefined
  for (const part of e.body.split(/(<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>)/i)) {
    const h = /^<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>$/i.exec(part)
    if (h) { heading = plain(h[1]!) || undefined; if (heading) blocks.push({ block: heading, heading }); continue }
    for (const b of part.split(BLOCK)) { const block = plain(b); if (block) blocks.push({ block, ...(heading ? { heading } : {}) }) }
  }
  return blocks.flatMap(b => b.block.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“(])/u).map(text => ({ text: text.trim(), ...b })).filter(s => s.text.length > 1))
}
/** Numbered sentences for a read, each section's under its heading. */
const numbered = (list: Sentence[], show: (s: Sentence) => string = s => s.text) =>
  list.map((s, i) => `${s.heading !== list[i - 1]?.heading && s.heading ? `[${s.heading}]\n` : ''}${i + 1}. ${show(s)}`).join('\n')

const VERDICTS = `- supported: every claim in it is in the facts (a figure converted to metric, sensibly rounded, is the same figure);
- loose: supported, but generalised, or put a little more or less strongly than the facts, or joining what several sources say about the same thing, in a way a keeper would not act on differently;
- unsupported: it has a claim, number, cause, name or advice the facts don't give, or gives one kind's, form's or case's trait to another, or drops a qualifier that limits a claim to some kinds, forms or cases (wild fish only, small pieces only), or joins what sources say about different things into one claim;
- contradicts: the facts say otherwise;
- not a claim: a picture, a transition or a heading, with nothing in it to check ("it gives the tank the look of a stream"). An item under a heading of steps, mistakes or warnings is a claim: judge the advice or warning it gives.
For every verdict but supported, say why in a few English words.`
const ALL = `Below are FACTS gathered about a fishkeeping term (each with a source number; the sources list gives each number's kind) and the numbered SENTENCES of a Vietnamese glossary entry written from them, each section's under its [heading]. Give every sentence one verdict against the FACTS:
${VERDICTS}
Reply {"verdicts": [{"n": 1, "verdict": "supported"}, {"n": 2, "verdict": "loose", "why": "..."}]}, one for every sentence, in order.`
const ONE = `Below are FACTS gathered about a fishkeeping term (each with a source number; the sources list gives each number's kind), and one SENTENCE of a Vietnamese glossary entry written from them, in its PARAGRAPH, under its HEADING. Give the SENTENCE one verdict against the FACTS:
${VERDICTS}
Reply {"verdict": "...", "why": "..."}.`
const SYSTEM = 'You check a guide against its facts, sentence by sentence. Reply only with JSON.'
const VERDICT = { type: 'string', enum: ['supported', 'loose', 'unsupported', 'contradicts', 'not a claim'] }
const MANY = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['n', 'verdict'], properties: { n: { type: 'number' }, verdict: VERDICT, why: { type: 'string' } } } } } }
const SINGLE = { type: 'object', required: ['verdict'], properties: { verdict: VERDICT, why: { type: 'string' } } }
const KNOWN = new Set<string>(['supported', 'loose', 'unsupported', 'contradicts', 'not a claim'])
const STOP = new Set<Verdict>(['unsupported', 'contradicts'])
const LOOSE = new Set<Verdict>(['loose'])
const NOT_A_CLAIM = new Set<Verdict>(['not a claim'])
/** A verdict a read left out, or one not on the list, counts as no verdict: it can't stop a sentence or clear one. */
const asRead = (v: { verdict?: string; why?: string } | undefined): Read | null => (v && KNOWN.has(v.verdict ?? '') ? { verdict: v.verdict as Verdict, ...(v.why ? { why: v.why } : {}) } : null)

/** Three reads of numbered sentences, one after another (the later ones read the facts from the cache), each sentence's verdicts in read order. */
async function readAll(llm: Llm, facts: object, listed: string, n: number): Promise<(Read | null)[][]> {
  const out: (Read | null)[][] = Array.from({ length: n }, () => [])
  for (let k = 0; k < 3; k++) {
    const r = await llm<{ verdicts?: { n: number; verdict?: string; why?: string }[] }>({ system: SYSTEM, schema: MANY, prompt: `${ALL}\n\nFACTS:\n${JSON.stringify(facts)}\n\nSENTENCES:\n${listed}` })
    const byN = new Map((r.verdicts ?? []).map(v => [v.n, v]))
    for (let i = 0; i < n; i++) out[i]!.push(asRead(byN.get(i + 1)))
  }
  return out
}
const count = (rs: (Read | null)[], of: Set<Verdict>) => rs.filter(r => r && of.has(r.verdict)).length
const flagged = (s: Sentence, rs: (Read | null)[]): Flagged => ({ ...s, verdicts: rs.flatMap(r => (r ? [r.verdict] : [])), why: rs.flatMap(r => (r?.why && r.verdict !== 'supported' ? [r.why] : [])) })

/**
 * Every sentence read three times against the facts. A sentence two reads call unsupported or contradicted stops the save.
 * One that only one read does is read three more times alone, in its paragraph and under its heading, and two of those
 * that stop it stop it too: a lone stop is settled, not outvoted, whatever the other two said ("not a claim" among them).
 * A sentence two reads call loose is advice (`loose`), never a stop. "Not a claim" takes a sentence out of the score only.
 */
export async function checkSentences(llm: Llm, facts: object, e: { definition: string; body: string }): Promise<FactCheck> {
  const list = sentences(e)
  if (!list.length) return { score: 1, stops: [], loose: [] }
  const reads = await readAll(llm, facts, numbered(list), list.length)
  const stops: Flagged[] = []
  const loose: Flagged[] = []
  let [claims, stopped] = [0, 0]
  for (const [i, s] of list.entries()) {
    const rs = reads[i]!
    const claim = count(rs, NOT_A_CLAIM) < 2
    if (claim) claims++
    let all = count(rs, STOP) >= 2 ? rs : null
    if (!all && count(rs, STOP) === 1) {
      const again: (Read | null)[] = []
      for (let k = 0; k < 3; k++) again.push(asRead(await llm<{ verdict?: string; why?: string }>({ system: SYSTEM, schema: SINGLE, prompt: `${ONE}\n\nFACTS:\n${JSON.stringify(facts)}\n\nHEADING:\n${s.heading ?? '(the definition)'}\n\nPARAGRAPH:\n${s.block}\n\nSENTENCE:\n${s.text}` })))
      if (count(again, STOP) >= 2) all = [...rs, ...again]
    }
    if (all) { stops.push(flagged(s, all)); if (claim) stopped++; continue }
    if (count(rs, LOOSE) >= 2) loose.push(flagged(s, rs))
  }
  return { score: claims ? Math.round(((claims - stopped) / claims) * 100) / 100 : 1, stops, loose }
}

/** A stop as a note for the rewrite and the log: the sentence, how the reads judged it, and why. */
export const stopNote = (s: Flagged) => `"${s.text}": the facts don't carry it (${s.verdicts.join(', ')}): ${[...new Set(s.why)].join(' / ') || 'no reason given'}`

const REWORD = `Dưới đây là DỮ KIỆN (JSON) đã thu thập về một thuật ngữ cá cảnh, và vài CÂU trong mục thuật ngữ tiếng Việt viết từ đó, mỗi câu trong đoạn của nó, kèm lý do người kiểm tra cho là câu ấy nói rộng hơn, mạnh hơn hoặc gộp hơn dữ kiện. Viết lại từng câu cho đúng điều dữ kiện ghi: giữ ý và giọng văn, vừa với đoạn, chỉ nói điều dữ kiện chịu được. Không thêm ý mới. Không thêm câu hay vế nói các nguồn khác nhau, và không rào đón ("có nguồn cho rằng", "nhiều nguồn", "có tiệm ghi"): nói thẳng điều dữ kiện chịu được, hẹp lại nếu cần. Trả lời {"sentences": [{"n": 1, "text": "..."}]}, mỗi câu một mục, theo thứ tự.`
const REWORD_SCHEMA = { type: 'object', required: ['sentences'], properties: { sentences: { type: 'array', items: { type: 'object', required: ['n', 'text'], properties: { n: { type: 'number' }, text: { type: 'string' } } } } } }
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** How many times a text stands in the entry as written: in the definition (plain text) and the body's HTML, escaped. */
const occurrences = (e: { definition: string; body: string }, text: string) => e.definition.split(text).length - 1 + e.body.split(escapeText(text)).length - 1

/** Where a sentence stands in the entry as written: the definition (plain text), or the body's HTML with the sentence whole in it, untagged. */
function placed<E extends { definition: string; body: string }>(e: E, text: string): ((to: string) => E) | null {
  if (e.definition.includes(text)) return to => ({ ...e, definition: e.definition.replace(text, to) })
  const html = escapeText(text)
  if (e.body.includes(html)) return to => ({ ...e, body: e.body.replace(html, escapeText(to)) })
  return null
}

/**
 * The middle path for loose (the chief of staff, 14 Nov 2026): the sentences two reads call loose go back once to the
 * writer with the reasons, to be reworded to what the facts carry, with no remark that sources differ and no hedge (four of
 * twelve rewordings in the trial hedged). Only they change. Then the whole entry as it would be saved is read again, three
 * times, as the first check read it: a sentence's verdict moves with what stands around it (Codex, 14 Nov 2026), so the
 * text that ships is the text judged. A new wording that read stops goes back to the old one, logged for the reader;
 * one still loose stays, logged. Any other sentence that read stops is returned in `stops`, and the entry isn't saved. No
 * loop. A sentence written across tags (a bold kind's name, a link) can't be placed and is logged as it was.
 *
 * A sentence is known by where it stands, never by its text alone (Codex, 14 Nov 2026: a rewording that matched the
 * definition word for word took the definition's stop away with it). So a loose sentence is placed only when it stands
 * once in the entry, and its new wording only when that wording stood nowhere before and the entry then reads as it did
 * but for that one sentence, which stands once: the final read's verdict on it is its own, and going back finds it.
 */
export async function rewordLoose<E extends { definition: string; body: string }>(llm: Llm, model: string, facts: object, e: E, loose: Flagged[]): Promise<{ entry: E; log: string[]; stops: Flagged[] }> {
  const log: string[] = []
  const texts = sentences(e).map(s => s.text)
  const here = loose.filter(s => (occurrences(e, s.text) === 1 && texts.filter(t => t === s.text).length === 1 && placed(e, s.text)) || (log.push(`Loose, left as written (not placeable): "${s.text}"`), false))
  if (!here.length) return { entry: e, log, stops: [] }
  const listed = here.map((s, i) => `${i + 1}. CÂU: ${s.text}\n   ĐOẠN: ${s.block}\n   LÝ DO: ${[...new Set(s.why)].join(' / ')}`).join('\n')
  const r = await llm<{ sentences?: { n: number; text: string }[] }>({ system: 'You reword sentences of a Vietnamese aquarium glossary entry to what its facts carry. Reply only with JSON.', model, schema: REWORD_SCHEMA, prompt: `${REWORD}\n\n--- CÂU ---\n${listed}\n\n--- DỮ KIỆN ---\n${JSON.stringify(facts)}` })
  const now = here.map((s, i) => ({ s, to: (r.sentences ?? []).find(x => x.n === i + 1)?.text.replace(/\s+/g, ' ').trim() ?? '' }))
  let entry = e
  const changed: typeof now = []
  for (const x of now) {
    const was = sentences(entry).map(s => s.text)
    const want = was.map(t => (t === x.s.text ? x.to : t))
    const next = x.to && x.to !== x.s.text && occurrences(entry, x.to) === 0 ? placed(entry, x.s.text)?.(x.to) : undefined
    // The same sentences in the same order but this one, which stands once: not two sentences, nor one run into the next.
    if (next && JSON.stringify(sentences(next).map(s => s.text)) === JSON.stringify(want) && want.filter(t => t === x.to).length === 1) { entry = next; changed.push(x) }
    else log.push(`Loose, not reworded: "${x.s.text}"`)
  }
  if (!changed.length) return { entry: e, log, stops: [] }
  const final = await checkSentences(llm, facts, entry)
  const verdictsOf = (text: string) => [...final.stops, ...final.loose].find(f => f.text === text)?.verdicts.join(', ') ?? 'supported'
  for (const x of changed) {
    if (final.stops.some(f => f.text === x.to)) {
      entry = placed(entry, x.to)?.(x.s.text) ?? entry
      log.push(`Loose, rewording read as unsupported, old wording kept for the reader: "${x.s.text}" (not "${x.to}": ${verdictsOf(x.to)})`)
    } else log.push(`${final.loose.some(f => f.text === x.to) ? 'Loose, reworded and still loose' : 'Loose, reworded'}: "${x.s.text}" → "${x.to}" (${verdictsOf(x.to)})`)
  }
  return { entry, log, stops: final.stops.filter(f => !changed.some(x => x.to === f.text)) }
}
