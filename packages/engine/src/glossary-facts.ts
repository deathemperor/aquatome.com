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

export type Verdict = 'supported' | 'loose' | 'unsupported' | 'uncredited' | 'contradicts' | 'not a claim'
/**
 * One sentence of an entry, the definition or paragraph or list item it stands in, the heading it stands under, and the
 * kind its block is about (the bold name it opens with, "Lũa đỗ quyên"), as plain text. `opening`: for a list item, the
 * line the list follows when that line ends with a colon ("Một tiệm ghi:"), the credit every item under it carries.
 * `meaning`: a sentence of the definition, the term's meaning, which can't open with a credit.
 */
export type Sentence = { text: string; block: string; heading?: string; item?: string; opening?: string; meaning?: true }
type Read = { verdict: Verdict; why?: string }
/**
 * A sentence the reads call loose, unsupported or contradicted, with what they said. `unjudged`: how many reads it had, when
 * too few gave it a verdict. `unscored`: a stop on a sentence most reads call "not a claim", which the score leaves out.
 */
export type Flagged = Sentence & { verdicts: Verdict[]; why: string[]; unjudged?: number; unscored?: true }
export type FactCheck = {
  /** The share of its claims (sentences most reads don't call "not a claim") no stop falls on. */
  score: number
  /** Two reads of three (or of a contradiction's three more) say the facts don't carry it: the save stops. */
  stops: Flagged[]
  /** Two reads of three call it loose and it doesn't stop: advice, for the middle path. */
  loose: Flagged[]
  /** How many sentences the score counts as claims. */
  claims: number
}

const plain = (html: string) => unescapePlain(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** A heading, whole, or a tag that starts or ends a block of text; any other (bold, a link) stands inside one. */
const TOKENS = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<\/?(?:p|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|caption|div|section|blockquote|dl|dt|dd|figure|figcaption|br|hr)\b[^>]*>/gi

/**
 * The entry's sentences: the definition's, then every piece of the body's text in order, each under the heading before it,
 * split where a sentence ends and a capital starts. All the body's text is read wherever it stands, a heading's, a table
 * cell's or text outside any tag (Codex, 14 Nov 2026: a claim in a table cell, which the saved page keeps, was never read).
 * The heading goes with what follows it: an item under "Sai lầm hay gặp" is a warning, not a fragment (Codex: one read
 * called three such items "not a claim"). So does a kind's name, for every sentence of its item: "Thường dùng nguyên khúc
 * cho bể nuôi cá đĩa" read supported three times, since another wood's fact covered it, though the item was about lũa đỗ
 * quyên (the measured run, 14 Nov 2026). The name holds for everything inside its item, a paragraph or a list nested in it
 * too (Codex, 14 Nov 2026: "<li><strong>Lũa đỗ quyên</strong><p>Chìm ngay.</p></li>" lost it); a list item inside a kind's
 * item that opens with a name of its own stands under both.
 */
export function sentences(e: { definition: string; body: string }): Sentence[] {
  const blocks: { block: string; heading?: string; item?: string; opening?: string; meaning?: true }[] = [{ block: plain(e.definition), meaning: true }]
  let heading: string | undefined
  // Each open list's opening: the line it follows, when that line ends with a colon. An item stands under the nearest one
  // (the chief of staff, 19 Nov 2026: a list under an opening counts as credited, each item included; a full stop ends a
  // credit, so a paragraph after the list stands under none).
  const openings: (string | undefined)[] = []
  const opening = () => openings.findLast(Boolean)
  // The open lists and list items, each item with the name it opens with, if any; a new item closes an unclosed one. One
  // pass over the whole body, so a heading inside a kind's item doesn't drop its name (Codex, 14 Nov 2026).
  const open: ('list' | { name?: string; seen: boolean })[] = []
  const names = () => open.flatMap(x => (x !== 'list' && x.name ? [x.name] : []))
  const push = (block: string, item: string) => { const o = opening(); blocks.push({ block, ...(heading ? { heading } : {}), ...(item ? { item } : {}), ...(o ? { opening: o } : {}) }) }
  const text = (b: string) => {
    const block = plain(b)
    if (!block) return
    const lead = plain(/^\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(b)?.[1] ?? '').replace(/[\s:]+$/, '')
    const li = open.at(-1)
    if (li && li !== 'list' && !li.seen) { li.seen = true; if (lead) li.name = lead }
    const n = names()
    push(block, (n.length ? n : lead ? [lead] : []).join(' › '))
  }
  let at = 0
  for (const m of e.body.matchAll(TOKENS)) {
    text(e.body.slice(at, m.index))
    at = m.index + m[0].length
    if (m[1] !== undefined) { heading = plain(m[2]!) || undefined; if (heading) push(heading, names().join(' › ')); continue }
    const tag = /^<(\/?)([a-z]+)/i.exec(m[0])!
    const [close, name] = [tag[1] === '/', tag[2]!.toLowerCase()]
    if (name === 'ul' || name === 'ol') {
      if (!close) { const last = blocks.length > 1 ? blocks.at(-1)!.block : ''; openings.push(/:\s*$/.test(last) ? last : undefined); open.push('list') }
      else { openings.pop(); while (open.length && open.pop() !== 'list'); }
    } else if (name === 'li') {
      if (open.length && open.at(-1) !== 'list') open.pop()
      if (!close) open.push({ seen: false })
    }
  }
  text(e.body.slice(at))
  return blocks.flatMap(b => b.block.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“(])/u).map(text => ({ text: text.trim(), ...b })).filter(s => s.text.length > 1))
}
/** Where a sentence stands: its heading, and the kind its item is about. */
const under = (s: Sentence) => [s.heading, s.item].filter(Boolean).join(' › ')
/** Where a sentence stands for a read: the definition, or its heading and kind and the opening its list follows, if any. */
const where = (s: Sentence) => (s.meaning ? 'the definition' : [under(s), s.opening ? `under the opening "${s.opening}"` : ''].filter(Boolean).join(' › '))
/** Numbered sentences for a read, each section's under its heading, each kind's under its name too, each list's under its opening. */
// A sentence that stands under nothing after one that stood under an opening says so, or it would read as still under it.
const numbered = (list: Sentence[], show: (s: Sentence) => string = s => s.text) =>
  list.map((s, i) => { const before = list[i - 1] ? where(list[i - 1]!) : ''; return `${where(s) !== before && (where(s) || before) ? `[${where(s) || 'no heading, under no opening'}]\n` : ''}${i + 1}. ${show(s)}` }).join('\n')

// What carries a claim on two sites, a plain translation as a thing's name, and the meaning, which can't open with a credit:
// the chief of staff, 19 Nov 2026, after the check run again on the six live entries stopped six sentences their readers passed.
const VERDICTS = `- supported: every claim in it is in the facts (a figure converted to metric, sensibly rounded, is the same figure);
- loose: supported, but worded a little more generally, or joining what several sources say about the same thing, in a way a keeper would not act on differently. Never loose, but unsupported: a hedge or an amount changed, a claim said more strongly or of more than its fact ("rất dễ" where the fact says "often", "nhiều tài liệu" where one page says it), or a step, a test or advice the facts don't give as one;
- unsupported: it has a claim, number, cause, name or advice the facts don't give, or gives one kind's, form's or case's trait to another, or drops a qualifier that limits a claim to some kinds, forms or cases (wild fish only, small pieces only), or joins what sources say about different things into one claim, or drops or adds a hedge its fact has or lacks ("can", "may", "some", "often", "usually", "about", "up to": "sẽ" for "can" is unsupported), or rounds, widens or narrows an amount, a time or a count ("vài tuần" for "a couple of weeks"), or says a claim more strongly or of more than its fact, or gives as a step, a test or advice what the facts don't give as one;
- uncredited: the facts carry it, but every fact that carries it comes from one site (count each fact's source and its "also" by their "site": two pages of one site are one), and the sentence states it as plain fact: neither the sentence itself nor the opening its list is under credits a page ("Một tiệm ghi:", "Một bài khác ghi:", "Một nguồn người nuôi ghi:", "Một bài tạp chí ghi:", "Theo một tài liệu tham khảo, …"). A full stop ends a credit: a sentence after the one that credits a page, or a paragraph after a credited list, stands under none. A claim two sites give needs no credit. Two sites carry a claim when one gives it as broadly as the sentence does and another gives the same thing in other words, or for some of the cases it covers. If a fact limits the claim, the entry carries that limit beside it (in the sentence, or the one just before or after); if it doesn't, the claim takes its site's credit. A Vietnamese word that plainly translates what another site's word says ("điểm chết" for "dead spot") is the thing's name and needs no credit. A word that is not a plain translation, or a trade name only one shop uses, as for a wood, stays that shop's word. The term's meaning, the sentences under [the definition], can't open with a credit: it rests on two sites where two define it, and where only one does, it says only what that fact gives and stands without a credit, so a sentence of it is never uncredited: judge what it says;
- contradicts: the facts say otherwise;
- not a claim: a picture, a transition or a heading, with nothing in it to check ("it gives the tank the look of a stream"). An item under a heading of steps, mistakes or warnings is a claim: judge the advice or warning it gives.
For every verdict but supported, say why in a few English words.`
const ALL = `Below are FACTS gathered about a fishkeeping term (each with a source number, and in "also" the other sources that give the same; the sources list gives each number's kind and site) and the numbered SENTENCES of a Vietnamese glossary entry written from them, the term's meaning under [the definition], each section's under its [heading], each kind's under [heading › its name]: a sentence there is about that kind, and each list's items under the opening the list follows, which credits every item. Give every sentence one verdict against the FACTS:
${VERDICTS}
Reply {"verdicts": [{"n": 1, "verdict": "supported"}, {"n": 2, "verdict": "loose", "why": "..."}]}, one for every sentence, in order.`
const ONE = `Below are FACTS gathered about a fishkeeping term (each with a source number, and in "also" the other sources that give the same; the sources list gives each number's kind and site), and one SENTENCE of a Vietnamese glossary entry written from them, in its PARAGRAPH, under its HEADING ("(the definition)" for the term's meaning), and under the OPENING its list follows, if any, which credits it, with the sentences just BEFORE and AFTER it. Give the SENTENCE one verdict against the FACTS:
${VERDICTS}
Reply {"verdict": "...", "why": "..."}.`
const SYSTEM = 'You check a guide against its facts, sentence by sentence. Reply only with JSON.'
/**
 * Every fact read runs on Opus, whatever the engine's model (the chief of staff, 14 Nov 2026). On Lũa's draft 7, two whole
 * checks each: Opus stopped the boiling and rot lines both times, Sonnet 2 times in 5 and 1 in 5, and neither stopped a
 * right sentence. Opus gave the same answer twice, at about $0.47 a check against Sonnet's $0.35. Neither stops a trait
 * carried from one kind to another (the discus and vân thép lines): the read-back carries those.
 */
const READ_MODEL = 'opus'
const VERDICT = { type: 'string', enum: ['supported', 'loose', 'unsupported', 'uncredited', 'contradicts', 'not a claim'] }
const MANY = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['n', 'verdict'], properties: { n: { type: 'number' }, verdict: VERDICT, why: { type: 'string' } } } } } }
const SINGLE = { type: 'object', required: ['verdict'], properties: { verdict: VERDICT, why: { type: 'string' } } }
const KNOWN = new Set<string>(['supported', 'loose', 'unsupported', 'uncredited', 'contradicts', 'not a claim'])
/**
 * What stops a save. A one-site claim written plain and a hedge or amount changed stop too (the chief of staff, 19 Nov
 * 2026): five of the first six first writes failed their first reader on the one, three on the other, and the check only
 * noted them, so a reader was spent on what the check could have stopped.
 */
const STOP = new Set<Verdict>(['unsupported', 'uncredited', 'contradicts'])
const LOOSE = new Set<Verdict>(['loose'])
const NOT_A_CLAIM = new Set<Verdict>(['not a claim'])
/** A verdict a read left out, or one not on the list, counts as no verdict: it can't stop a sentence or clear one. A sentence fewer than two reads judge isn't cleared: it stops, unjudged (Codex, 14 Nov 2026: three empty replies scored an entry 1). */
const asRead = (v: { verdict?: string; why?: string } | undefined): Read | null => (v && KNOWN.has(v.verdict ?? '') ? { verdict: v.verdict as Verdict, ...(v.why ? { why: v.why } : {}) } : null)

/** Three reads of numbered sentences, one after another (the later ones read the facts from the cache), each sentence's verdicts in read order. */
async function readAll(llm: Llm, facts: object, listed: string, n: number): Promise<(Read | null)[][]> {
  const out: (Read | null)[][] = Array.from({ length: n }, () => [])
  for (let k = 0; k < 3; k++) {
    const r = await llm<{ verdicts?: { n: number; verdict?: string; why?: string }[] }>({ system: SYSTEM, model: READ_MODEL, schema: MANY, prompt: `${ALL}\n\nFACTS:\n${JSON.stringify(facts)}\n\nSENTENCES:\n${listed}` })
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
 * A sentence fewer than two reads give a verdict stops, unjudged: what the check didn't read, it can't clear.
 * `pass`: a sentence of the site's own house form, which carries no claim from the facts (glossary-dose.ts), isn't read.
 */
export async function checkSentences(llm: Llm, facts: object, e: { definition: string; body: string }, pass: (text: string) => boolean = () => false): Promise<FactCheck> {
  const list = sentences(e).filter(s => !pass(s.text))
  if (!list.length) return { score: 1, claims: 0, stops: [], loose: [] }
  const reads = await readAll(llm, facts, numbered(list), list.length)
  const stops: Flagged[] = []
  const loose: Flagged[] = []
  let [claims, stopped] = [0, 0]
  for (const [i, s] of list.entries()) {
    const rs = reads[i]!
    if (rs.filter(Boolean).length < 2) { claims++; stopped++; stops.push({ ...flagged(s, rs), unjudged: rs.length }); continue }
    const claim = count(rs, NOT_A_CLAIM) < 2
    if (claim) claims++
    let all = count(rs, STOP) >= 2 ? rs : null
    if (!all && count(rs, STOP) === 1) {
      const again: (Read | null)[] = []
      for (let k = 0; k < 3; k++) again.push(asRead(await llm<{ verdict?: string; why?: string }>({ system: SYSTEM, model: READ_MODEL, schema: SINGLE, prompt: `${ONE}\n\nFACTS:\n${JSON.stringify(facts)}\n\nHEADING:\n${s.meaning ? '(the definition)' : under(s) || '(none)'}\n\nOPENING:\n${s.opening ?? '(none)'}\n\nPARAGRAPH:\n${s.block}\n\nSENTENCE:\n${s.text}\n\nBEFORE:\n${list[i - 1]?.text ?? '(none)'}\n\nAFTER:\n${list[i + 1]?.text ?? '(none)'}` })))
      // Re-reads too few of which give a verdict don't settle it: it stops, unjudged (Codex, 14 Nov 2026).
      if (again.filter(Boolean).length < 2) { stops.push({ ...flagged(s, [...rs, ...again]), unjudged: 6, ...(claim ? {} : { unscored: true as const }) }); if (claim) stopped++; continue }
      if (count(again, STOP) >= 2) all = [...rs, ...again]
    }
    if (all) { stops.push({ ...flagged(s, all), ...(claim ? {} : { unscored: true as const }) }); if (claim) stopped++; continue }
    if (count(rs, LOOSE) >= 2) loose.push(flagged(s, rs))
  }
  return { score: scoreOf(claims, stopped), claims, stops, loose }
}
const scoreOf = (claims: number, stopped: number) => (claims ? Math.round(((claims - stopped) / claims) * 100) / 100 : 1)

/** A stop as a note for the rewrite and the log: the sentence, how the reads judged it, and why. */
export const stopNote = (s: Flagged) => s.unjudged
  ? `"${s.text}": the reads left it unjudged (${s.verdicts.length} of ${s.unjudged} gave a verdict)`
  : `"${s.text}": the facts don't carry it (${s.verdicts.join(', ')}): ${[...new Set(s.why)].join(' / ') || 'no reason given'}`

const REWORD = `Dưới đây là DỮ KIỆN (JSON) đã thu thập về một thuật ngữ cá cảnh, và vài CÂU trong mục thuật ngữ tiếng Việt viết từ đó, mỗi câu trong đoạn của nó, kèm lý do người kiểm tra cho là câu ấy nói rộng hơn, mạnh hơn hoặc gộp hơn dữ kiện. Viết lại từng câu cho đúng điều dữ kiện ghi: giữ ý và giọng văn, vừa với đoạn, chỉ nói điều dữ kiện chịu được. Không thêm ý mới. Không thêm câu hay vế nói các nguồn khác nhau, và không rào đón ("có nguồn cho rằng", "nhiều nguồn"): nói thẳng điều dữ kiện chịu được, hẹp lại nếu cần. Nếu điều còn lại chỉ một site ghi (đếm theo "site" của nguồn: hai trang của một site là một), câu mở bằng lời ghi nguồn của trang ấy như mục vẫn viết ("Một tiệm ghi: …", "Một bài tạp chí ghi: …"). Câu đã đứng dưới LỜI MỞ của chính trang ấy thì không thêm gì; lời mở của trang ấy đứng ngay cạnh câu (CÂU TRƯỚC, CÂU SAU) thì nối theo nó ("Tiệm ấy cũng ghi: …"), không mở lời mới. Câu thuộc NGHĨA của thuật ngữ (PHẦN) không mở bằng lời ghi nguồn. Trả lời {"sentences": [{"n": 1, "text": "..."}]}, mỗi câu một mục, theo thứ tự.`
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
 * The figures a text gives, each as often as it gives it, with the numbers it can be read as (Grok's reads, 15 Nov 2026).
 * Vietnamese writes thousands with dots and the decimal with a comma ("200.000", "1.234,5"), English the other way round
 * ("2,000", "1,500.00"); any other mark is a decimal ("6.0" is 6, "7,3" 7.3). The facts keep no one way (an English fact
 * quotes a shop's "200.000đ"), so a fact's figure reads both ways ("2,000" is 2 or 2000). The entry is Vietnamese and reads
 * one way, so a figure the rewording changed ("200.000đ" to "200đ") is a figure it dropped. "20–30%" gives 20 and 30.
 * Never a digit inside a word or a formula (CO2, NH4+, H3PO4), but "pH7,2" gives 7.2.
 */
type Figure = { text: string; reads: string[] }
/** A figure's number when `thousands` marks thousands in it, and the other mark the decimal. */
const written = (n: string, thousands: '.' | ',') => {
  const decimal = thousands === '.' ? ',' : '.'
  const grouped = new RegExp(`^[1-9]\\d{0,2}(?:\\${thousands}\\d{3})+(?:\\${decimal}\\d+)?$`).test(n)
  return String(Number(grouped ? n.split(thousands).join('').replace(decimal, '.') : n.replace(/^(\d+)[.,](\d+).*$/, '$1.$2')))
}
const figures = (text: string, entry = false): Figure[] => [...text.replace(/pH(?=\d)/g, 'pH ').matchAll(/(?<![\p{L}\p{N}.,])\d+(?:[.,]\d+)*/gu)].map(m => (
  { text: m[0], reads: [...new Set([written(m[0], '.'), ...(entry ? [] : [written(m[0], ',')])])] }
))
/** The figures `before` gives that `after` doesn't: each matched once to a figure after it that reads the same. */
const lessOf = (before: Figure[], after: Figure[]) => {
  const left = [...after]
  return before.filter(f => { const i = left.findIndex(g => g.reads.some(r => f.reads.includes(r))); if (i < 0) return true; left.splice(i, 1); return false })
}
const has = (text: string, w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'iu').test(text)
const escapeRe = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * The names a text holds: these (a page's name, a kind's) where they are two words or more, as whole words in any case,
 * and any Latin name (a genus and its species) the facts write, in any case. A one-word name ("Mono", "Front") is an
 * everyday word too.
 */
const namesIn = (text: string, names: string[], facts = '') => [
  // The longest first, each taken out of the text once found, so "Cá rô" isn't found inside "Cá rô phi".
  ...[...names].map(n => n.trim()).filter(n => /\S\s+\S/.test(n)).sort((a, b) => b.length - a.length).filter(n => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'giu')
    return re.test(text) && ((text = text.replace(re, ' ')), true)
  }),
  ...[...text.matchAll(/(?<![\p{L}\p{N}])[A-Za-z][a-z]+ [A-Za-z][a-z]{2,}(?![\p{L}\p{N}])/gu)].map(m => m[0]).filter(n => /^[A-Z]/.test(n) && facts.toLowerCase().includes(n.toLowerCase())),
]
/** The words of a caution in Vietnamese: a warning, a must, a never; read on a text without the phrases where they mean something else. */
const CAUTIONS = ['không được', 'không nên', 'đừng', 'chớ', 'tránh', 'phải', 'cẩn thận', 'lưu ý', 'coi chừng', 'cảnh báo', 'nguy hiểm', 'độc', 'hại', 'chết']
const NOT_CAUTIONS = /(?<![\p{L}\p{N}])(?:không phải|độc đáo|độc lập|độc quyền|độc nhất|độc giả|đơn độc|bên phải|tay phải|phía phải|phải không|có phải|phải chăng|lẽ phải|phải trái)(?![\p{L}\p{N}])/giu
const cautionsIn = (text: string) => { const t = text.replace(NOT_CAUTIONS, ' '); return CAUTIONS.filter(w => has(t, w)) }
/** Each caution word as often as the text says it. */
const cautionWords = (text: string) => {
  const t = text.replace(NOT_CAUTIONS, ' ')
  return CAUTIONS.flatMap(w => Array.from({ length: (t.match(new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'giu')) ?? []).length }, () => w))
}
/** What `before` has that `after` hasn't, each matched once. */
const less = <T>(before: T[], after: T[]) => {
  const left = [...after]
  return before.filter(x => { const i = left.indexOf(x); if (i < 0) return true; left.splice(i, 1); return false })
}
/** Words too common to tell one part of a sentence from another. */
const FUNCTION_WORDS = new Set(['của', 'và', 'hoặc', 'thì', 'là', 'có', 'một', 'các', 'những', 'cho', 'với', 'từ', 'trong', 'khi', 'đã', 'sẽ', 'được', 'bị', 'này', 'đó', 'mà', 'nên', 'rồi', 'cũng', 'để', 'ra', 'vào', 'lại', 'nó', 'như', 'hay', 'đến', 'tới', 'ở', 'rất', 'càng', 'thường', 'thể'])
const wordsOf = (text: string) => (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter(w => !FUNCTION_WORDS.has(w))
/**
 * A sentence's pieces of advice (the chief of staff, 15 Nov 2026: a dropped piece of advice counts): its parts between
 * commas, semicolons and colons, and either side of "hoặc", "rồi" and "và", each an option, a step or a reason. A part is
 * left out when fewer than half of its own words stand in the other text: chu trình nitơ's seeding sentence lost its water,
 * floss and media from an established tank that way ("…, hoặc lấy nước, bông lọc từ một bể đã ổn định; riêng vật liệu lọc
 * thì chỉ lấy từ bể đã ổn định…" → "Châm thêm men vi sinh nitrat hóa của hãng uy tín."). One word was too few (Grok's read,
 * 15 Nov 2026): "nước" kept "nước đã khử clo" once a merged sentence said "thay 20–30% nước". `strict`: half its words
 * standing isn't enough either ("lấy nước" kept by "lấy", Grok's second read), for a sentence no note asked to change.
 */
const adviceLost = (before: string, after: string, strict = false) => {
  const kept = new Set(wordsOf(after))
  // A comma between two digits is a decimal ("pH 4,0"), not a break between parts.
  return before.split(/[;:]|,(?!\d)|(?<!\d),|\s(?:hoặc|rồi|và)\s/u).map(p => p.trim().replace(/[.!?…]+$/u, '')).filter(p => {
    const own = [...new Set(wordsOf(p))], standing = own.filter(w => kept.has(w)).length * 2
    return own.length > 0 && (strict ? standing <= own.length : standing < own.length)
  })
}
/** The facts' own words, not their source numbers. */
const factText = (facts: object) => ((facts as { facts?: { fact: string }[] }).facts ?? []).map(f => f.fact).join('\n')

/**
 * The phrases a note quotes, "…" or “…”, of three characters or more: its own quotes only, read as pairs that nest, so a
 * quoted sentence keeps its own quotation marks whole ("Nhiều tiệm ghi "không ra màu", còn…"; Grok's reads, 15 Nov 2026:
 * paired left to right, the words after an inner quote became a quote of their own). A straight mark at the start, or after
 * a space or an opening bracket and before a character, opens; any other closes the last one open. One written \" (a saved
 * review's "là \"không ra màu\", còn…") is a mark inside the quote, never its end. A note whose marks don't pair up gives no
 * quote at all (Grok's fifth and sixth reads: the splitter can cut a sentence inside a quotation, and a note on such a piece,
 * "Ngâm 2 tuần." Rồi thôi.", read as quoting the separate step "Ngâm 2 tuần." and freed it): such a piece stays held, on the
 * safe side.
 */
const quotes = (note: string) => {
  const found: string[] = [], open: number[] = []
  for (let i = 0; i < note.length; i++) {
    const c = note[i]
    if (note[i - 1] === '\\') continue
    if (c === '“' || (c === '"' && (i === 0 || /[\s([]/.test(note[i - 1]!)) && /\S/.test(note[i + 1] ?? ''))) open.push(i + 1)
    else if (c === '"' || c === '”') {
      if (!open.length) return []
      const at = open.pop()!
      if (!open.length) found.push(note.slice(at, i))
    }
  }
  return open.length ? [] : found.map(q => q.replace(/\\"/g, '"').trim()).filter(q => q.length >= 3)
}

/**
 * The middle path for loose (the chief of staff, 14 Nov 2026): the sentences two reads call loose go back once to the
 * writer with the reasons, to be reworded to what the facts carry, with no remark that sources differ and no hedge (four of
 * twelve rewordings in the trial hedged). Only they change. Then the whole entry as it would be saved is read again, three
 * times, as the first check read it: a sentence's verdict moves with what stands around it (Codex, 14 Nov 2026), so the
 * text that ships is the text judged. A new wording that read stops goes back to the old one, logged for the reader;
 * one still loose stays, logged. Any other sentence that read stops is returned in `stops`, and the entry isn't saved. No
 * loop. A sentence written across tags (a bold kind's name, a link) can't be placed and is logged as it was. When the
 * entry was read again, `score` is the score of the entry as returned (Codex, 14 Nov 2026: the first check's was kept).
 *
 * A sentence is known by where it stands, never by its text alone (Codex, 14 Nov 2026: a rewording that matched the
 * definition word for word took the definition's stop away with it). So a loose sentence is placed only when it stands
 * once in the entry, and its new wording only when that wording stood nowhere before and the entry then reads as it did
 * but for that one sentence, which stands once: the final read's verdict on it is its own, and going back finds it.
 */
export async function rewordLoose<E extends { definition: string; body: string }>(llm: Llm, model: string, facts: object, e: E, loose: Flagged[], keep: { rules?: (e: E) => Promise<string[]>; names?: string[]; fits?: (e: E) => boolean; pass?: (text: string) => boolean } = {}): Promise<{ entry: E; log: string[]; stops: Flagged[]; score?: number }> {
  const log: string[] = []
  const texts = sentences(e).map(s => s.text)
  // The definition's first sentence says what the thing is, and no later read catches a change to it (the chief of staff,
  // 15 Nov 2026: Artemia's "Artemia là loài tôm li ti." became its English name, dry food's lost four of its seven forms):
  // it stays as written.
  const lead = sentences({ definition: e.definition, body: '' })[0]?.text
  const here = loose.filter(s => (s.text === lead && s.block === plain(e.definition) ? (log.push(`Loose, left as written (the definition's first sentence): "${s.text}"`), false) : true)
    && ((occurrences(e, s.text) === 1 && texts.filter(t => t === s.text).length === 1 && placed(e, s.text)) || (log.push(`Loose, left as written (not placeable): "${s.text}"`), false)))
  if (!here.length) return { entry: e, log, stops: [] }
  // Each sentence with its list's opening and the sentences beside it, so a one-site rewording joins its page's credit
  // where it stands, even in the paragraph before (Codex, 19 Nov 2026), and the meaning marked, which opens with none (the
  // chief of staff, 19 Nov 2026).
  const all = sentences(e)
  const beside = (s: Flagged) => { const i = all.findIndex(x => x.text === s.text); return `\n   CÂU TRƯỚC: ${all[i - 1]?.text ?? '(không có)'}\n   CÂU SAU: ${all[i + 1]?.text ?? '(không có)'}` }
  const listed = here.map((s, i) => `${i + 1}. CÂU: ${s.text}\n   ĐOẠN: ${s.block}${s.meaning ? '\n   PHẦN: NGHĨA của thuật ngữ' : ''}${s.opening ? `\n   LỜI MỞ: ${s.opening}` : ''}\n   LÝ DO: ${[...new Set(s.why)].join(' / ')}${beside(s)}`).join('\n')
  const r = await llm<{ sentences?: { n: number; text: string }[] }>({ system: 'You reword sentences of a Vietnamese aquarium glossary entry to what its facts carry. Reply only with JSON.', model, schema: REWORD_SCHEMA, prompt: `${REWORD}\n\n--- CÂU ---\n${listed}\n\n--- DỮ KIỆN ---\n${JSON.stringify(facts)}` })
  const now = here.map((s, i) => ({ s, to: (r.sentences ?? []).find(x => x.n === i + 1)?.text.replace(/\s+/g, ' ').trim() ?? '' }))
  // Puts rewordings into the entry as written, in order, each where its sentence stands: the same sentences in the same
  // order but this one, which stands once; not two sentences, nor one run into the next. Going back is the same: the
  // rewordings that stay put in again from the entry as written, never a sentence put back by its words, which could
  // land on another that now reads the same (Grok, 15 Nov 2026).
  type Rewording = (typeof now)[number]
  const place = (xs: Rewording[]) => {
    let entry = e
    const done: Rewording[] = []
    for (const x of xs) {
      const was = sentences(entry).map(s => s.text)
      const want = was.map(t => (t === x.s.text ? x.to : t))
      const next = x.to && x.to !== x.s.text && occurrences(entry, x.to) === 0 ? placed(entry, x.s.text)?.(x.to) : undefined
      if (next && JSON.stringify(sentences(next).map(s => s.text)) === JSON.stringify(want) && want.filter(t => t === x.to).length === 1) { entry = next; done.push(x) }
    }
    return { entry, done }
  }
  const first = place(now)
  for (const x of now) if (!first.done.includes(x)) log.push(`Loose, not reworded: "${x.s.text}"`)
  const changed = first.done
  if (!changed.length) return { entry: e, log, stops: [] }
  const final = await checkSentences(llm, facts, first.entry, keep.pass)
  const verdictsOf = (text: string) => [...final.stops, ...final.loose].find(f => f.text === text)?.verdicts.join(', ') ?? 'supported'
  const stopped = (x: Rewording) => final.stops.some(f => f.text === x.to)
  const unstopped = place(changed.filter(x => !stopped(x)))
  // The rewording reads only the facts, so the house rules and the term's notes are read again on what it kept: a rewording
  // a rules note is about goes back to its old wording too (the chief of staff, 15 Nov 2026: chu trình nitơ's put a brand
  // where a kind stood, and took out the fish deaths and "0 or near 0" its notes asked for). A note is about a rewording
  // when it quotes words the rewording put in or took out, or a passage that holds its new sentence whole; never by words
  // the sentence had either way, as a name a note on another sentence also quotes.
  const ruled = keep.rules && unstopped.done.length ? await keep.rules(unstopped.entry) : []
  const about = (n: string, x: Rewording) => quotes(n).some(q => x.to.includes(q) !== x.s.text.includes(q) || q.includes(x.to))
  // Nor may it buy its fit by taking specifics out (the chief of staff, 15 Nov 2026: pH lost its weekly 20–30%, chu trình
  // nitơ its fish deaths and its "0 or near 0", Lũa its "must soak"): a figure the facts carry, a named example (a page's
  // name, a kind's, a Latin name) or a caution the old wording had and the new one hasn't keeps the old wording.
  // The facts' own words, not their source numbers.
  // A piece of advice counts too, an option, step or reason the old wording gave (the chief of staff, 15 Nov 2026).
  const said = factText(facts), carried = new Set(figures(said).flatMap(f => f.reads))
  const dropped = (x: Rewording) => [
    ...lessOf(figures(x.s.text, true), figures(x.to, true)).filter(f => f.reads.some(r => carried.has(r))).map(f => `the figure ${f.text}`),
    ...namesIn(x.s.text, keep.names ?? [], said).filter(n => !namesIn(x.to, keep.names ?? [], said).includes(n)).map(n => `the name ${n}`),
    ...cautionsIn(x.s.text).filter(w => !cautionsIn(x.to).includes(w)).map(w => `the caution "${w}"`),
    ...adviceLost(x.s.text, x.to).map(p => `the advice "${p}"`),
  ]
  const broke = new Map(unstopped.done.map(x => [x, [...ruled.filter(n => about(n, x)), ...(dropped(x).length ? [`it drops ${dropped(x).join(', ')}`] : [])]]))
  const staying = unstopped.done.filter(x => !broke.get(x)!.length)
  let { entry, done } = staying.length === unstopped.done.length ? unstopped : place(staying)
  // Past its length, the last rewordings go back to their old wording until it fits.
  const long = new Set<Rewording>()
  while (keep.fits && !keep.fits(entry) && done.length) { long.add(done.at(-1)!); ({ entry, done } = place(done.slice(0, -1))) }
  for (const x of changed) {
    if (stopped(x)) log.push(`Loose, rewording read as unsupported, old wording kept for the reader: "${x.s.text}" (not "${x.to}": ${verdictsOf(x.to)})`)
    else if (broke.get(x)?.length) log.push(`Loose, rewording broke a house rule or dropped a specific, old wording kept for the reader: "${x.s.text}" (not "${x.to}": ${broke.get(x)!.join(' / ')})`)
    else if (long.has(x)) log.push(`Loose, rewording would take the entry past its length, old wording kept for the reader: "${x.s.text}" (not "${x.to}")`)
    else if (!done.includes(x)) log.push(`Loose, rewording not placed once others went back, old wording kept for the reader: "${x.s.text}" (not "${x.to}")`)
    else log.push(`${final.loose.some(f => f.text === x.to) ? 'Loose, reworded and still loose' : 'Loose, reworded'}: "${x.s.text}" → "${x.to}" (${verdictsOf(x.to)})`)
  }
  // The stops of the entry as returned: a sentence that read stops and still stands in it, wherever it stands.
  const standing = new Set(sentences(entry).map(s => s.text))
  const stops = final.stops.filter(f => standing.has(f.text))
  // The score of the entry as saved: a reworded sentence that stopped is back in its old wording, which read loose.
  return { entry, log, stops, score: scoreOf(final.claims, stops.filter(f => !f.unscored).length) }
}

const DROP = 'The rewrite dropped from "'
/**
 * What a rewrite on notes took out that nothing let go (the chief of staff, 15 Nov 2026: pH's trim for length dropped
 * "pH đổi đột ngột có thể làm cá chết." and the log scale's worked example, and nothing checked the rewrite). Two things
 * let a sentence go, and nothing else: a stop on it, a sentence the fact check stopped (the facts don't carry it, or the
 * reads left it unjudged) where it stood, under its heading and in its kind's item (the eighth read, 15 Nov 2026: Lũa's
 * "Chưa thấy tiệm Việt Nam bán dưới tên tiếng Việt." stands under two kinds, and a stop on one copy let both go); and
 * the term's own `free` list in its notes file (glossary-asks.json), which the chief of staff reads: a sentence it lists
 * whole, or one of a passage's sentences, may go wherever it stands; a phrase it lists may go from its sentence. A
 * review note never does, whatever it quotes: a note quotes a sentence to keep it, to place an addition beside it or to
 * say where a thing already stands as often as to change it (the seventh read, 15 Nov 2026: with their real notes,
 * pH's rewrites could cut "Nếu nước nguồn dưới 8…", the definition's "Điều cần tránh là pH đổi đột ngột." and "Muốn
 * đổi pH…", and nitrogen's the 50% emergency change, each because a note quoted it). Any other sentence that is gone
 * from where it stood, the definition, the body under its heading or a kind's item, must leave nothing behind: its
 * figures the facts carry, its names and its cautions, counted over the whole entry so what moved is kept (the 0,5 pace
 * moved from the mistakes to the steps); and each piece of its advice, which stands in one of the new or moved
 * sentences: a repeat taken out goes by the free list too (GH's notes line: what GH measures is said once, in the
 * definition). A kind's sentence keeps its advice in its kind's item, while that item stands. One note for each such
 * sentence, naming what it lost, for the writer to write it as it was.
 */
export function droppedInRewrite(before: { definition: string; body: string }, after: { definition: string; body: string }, facts: object, stops: Pick<Sentence, 'text' | 'heading' | 'item' | 'meaning'>[], names: string[] = [], free: string[] = []): string[] {
  const placed = (e: { definition: string; body: string }) => [
    ...sentences({ definition: e.definition, body: '' }).map(s => ({ ...s, key: `d ${s.text}` })),
    ...sentences({ definition: '', body: e.body }).map(s => ({ ...s, key: `b ${s.heading ?? ''}\n${s.item ?? ''}\n${s.text}` })),
  ]
  const was = placed(before), is = placed(after)
  // A stop on a body sentence never frees the meaning's copy of it, nor the other way (Codex, 19 Nov 2026).
  const stopped = (s: Sentence) => stops.some(x => x.text === s.text && (x.heading ?? '') === (s.heading ?? '') && (x.item ?? '') === (s.item ?? '') && !x.meaning === !s.meaning)
  // A listed passage frees each of its own sentences, never one that is only words inside another sentence (Grok's third
  // read: a shop's sentence quoting the step "Ngâm 2 tuần." freed the step).
  const whole = (s: Sentence) => stopped(s) || free.some(q => q === s.text || (q.includes(s.text) && sentences({ definition: q, body: '' }).some(x => x.text === s.text)))
  const unfreed = (t: string) => free.filter(q => t.includes(q)).reduce((s, q) => s.split(q).join(' '), t)
  const now = new Set(is.map(s => s.key)), then = new Set(was.map(s => s.key))
  const gone = was.filter(s => !now.has(s.key) && !whole(s)).map(s => ({ ...s, u: unfreed(s.text) }))
  if (!gone.length) return []
  const said = factText(facts), carried = new Set(figures(said).flatMap(f => f.reads))
  const rest = was.filter(s => !whole(s)).map(s => unfreed(s.text)).join(' ')
  const all = is.map(s => s.text).join(' ')
  const figs = lessOf(figures(rest, true), figures(all, true)).filter(f => f.reads.some(r => carried.has(r)))
  const named = less(namesIn(rest, names, said), namesIn(all, names, said))
  const warned = less(cautionWords(rest), cautionWords(all))
  // Where a gone sentence's advice must stand anew: its kind's item, if the rewrite kept that item; else the whole entry.
  const items = new Set(is.flatMap(s => (s.item ? [s.item] : [])))
  const within = (item?: string) => is.filter(s => !item || !items.has(item) || s.item === item)
  // Each thing lost goes to the first gone sentence that had it. A figure goes by its number, named as that sentence wrote
  // it (Grok: "pH 4,0" cut, with "4 tuần" still standing, left a 4 no sentence wrote as "4" to take it).
  const take = <T>(pool: T[], has: (x: T) => boolean) => { const mine = pool.filter(has); pool.splice(0, pool.length, ...pool.filter(x => !mine.includes(x))); return mine }
  return gone.flatMap(({ text: t, u, item }) => {
    const own = figures(u, true), as = (f: Figure) => own.find(g => g.reads.some(r => f.reads.includes(r)))
    // Each piece stands in one new or moved sentence, not in their words pooled (the eighth read's Sonnet reviewer: "Cá cần
    // nước sạch." cut read as kept, its words scattered through a longer sentence added beside it).
    const fresh = within(item).filter(s => !then.has(s.key)).map(s => s.text)
    const lost = [
      ...take(figs, f => !!as(f)).map(f => `the figure ${as(f)!.text}`),
      ...take(named, n => namesIn(u, names, said).includes(n)).map(n => `the name ${n}`),
      ...take(warned, w => cautionWords(u).includes(w)).map(w => `the caution "${w}"`),
      ...adviceLost(u, '', true).filter(p => fresh.every(f => adviceLost(p, f, true).length)).map(p => `the advice "${p}"${item && items.has(item) ? ` under ${item}` : ''}`),
    ]
    return lost.length ? [`${DROP}${t}" ${[...new Set(lost)].join(', ')}, and nothing lets that sentence go: write it as it was, word for word.`] : []
  })
}
