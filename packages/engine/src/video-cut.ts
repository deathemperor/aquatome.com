import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fitFindings, fitKey, fitText, type FitCheck, type FitEntry, type FitFinding, type FitState } from './fit'
import { gateChecks, HELD_BY_HAND, WAITS, type HandHold, type Held } from './gate'
import { loadPages, type Page } from './pages'
import { readable } from './reader'
import { givesDose } from './round'
import { blockOf, plain, quoted, sentences, splice, type Piece } from './sentences'

/**
 * The held video guides' cut (the chief of staff, 15 Nov 2026: "cut now", ahead of the sentence-only mend of Tue 17): a
 * video guide the gate holds for sentences its read names as the source talking, a foreign shop, a price or a product has
 * each of those sentences cut whole, by code, with no model; each "words" finding's own
 * fix goes in where its words stand. The gate, last in the run, reads the guide again and lets it out if it passes; one
 * that fails stays held for the mend.
 * - Nothing is lost for good: each sentence it cuts is kept in VIDEO_CUT_FILE (the guide, its part, the sentence before
 *   it, the sentence, its finding and the read's hash), added to and never rewritten, for the mend to write the true ones
 *   back in.
 * - Left as it is, and listed:
 *   - a guide held by hand, fixed by hand (bodyFixed, faqFixed), or cut once already (what a reread finds after is the
 *     mend's); one with a finding a person waits on (harm, a kit, a dose: never touched) or another the cut doesn't take,
 *     advice for elsewhere among them; one whose saved read isn't of its text as it stands;
 *   - a quote not in its text, or across two sentences; a sentence that runs on into the next where a unit or an initial
 *     ends it ("50 W. Nó…");
 *   - a sentence to cut that is a table's cell, names its item ("<strong>X</strong>: …") or opens what follows (a colon),
 *     names something the guide speaks of again, says what comes later, or gives a step or a caution anywhere in it; a dose (an amount, or "một nắp") in its paragraph or
 *     the sentence kept after it;
 *   - a sentence kept after a cut one that reads on from it (a connective, a pronoun, "này/đó" anywhere in it, "thứ hai"),
 *     gives a figure right after a cut one with figures, or speaks of money after a price that goes; a sentence kept
 *     before one that opens it (a colon) or announces a count ("nhờ hai điều");
 *   - a body every sentence of which would go, or a cut of more than a tenth of its words.
 * - A units finding stays: units-mend.ts takes a guide held for units alone, the run after the gate has read the cut.
 * - What a cut empties goes with it: a summary point, a question and its answer, a list, a heading with nothing under it.
 */
export const VIDEO_CUT_FILE = 'engine-state/_video-cut.json'
/**
 * What the cut takes whole. Not advice for a reader elsewhere: those lines most often carry a care fact under a condition
 * (cured oak is safe in a tank; the dechlorinator after the mixer tap), and wait for the mend (the chief of staff, 15 Nov 2026).
 */
export const CUT: readonly FitCheck[] = ['source', 'shop', 'price', 'product']
/** The first run's dozen (the chief of staff, 15 Nov 2026: three of them read before the rest go). */
export const VIDEO_CUT_LIMIT = 12
/** The most of a guide's words a cut takes; a guide that would lose more waits for the mend (the 15 Nov ruling was on cuts of a tenth at most). */
export const VIDEO_CUT_SHARE = 0.1

/** A kept sentence that reads on from the one before it: a connective or a pointer back, which a cut leaves pointing at nothing. */
const LEANS = /^[\s"“‘'(«]*(?:vì vậy|vì thế|bởi vậy|do đó|do vậy|cho nên|thế nên|vậy nên|nên|như vậy|nhờ vậy|nhờ đó|nhờ thế|thế là|kết quả là|từ đó|sau đó|lúc đó|khi đó|lúc này|khi này|điều này|điều đó|việc này|việc đó|cách này|cách đó|chuyện này|chuyện đó|ngoài ra|bên cạnh đó|thêm vào đó|cũng vậy|tương tự|còn|nhưng|tuy vậy|tuy nhiên|dù vậy|mặt khác|đổi lại|ngược lại|thay vào đó|dù|dẫu|mà|và|hoặc)(?![\p{L}])/iu
const POINTS = /(?<![\p{L}])(?:(?:các|những|cái|hai|ba|mấy)\s+(?:bể|con|cây|cá|loại|thứ|bước|cách)\s+(?:này|đó|kia|ấy|trên)|như trên|kể trên|nói trên|vừa nói|ở trên)(?![\p{L}])/iu
/** A sentence that announces what follows it ("nhờ hai điều", "như sau", "dưới đây"): a cut after it leaves it promising what isn't there. */
const FORETELLS = /(?<![\p{L}])(?:(?:hai|ba|bốn|năm|sáu|vài|mấy|một số|các|những)\s+(?:điều|cách|lý do|bước|việc|thứ|điểm|mẹo|loại|lựa chọn|yếu tố)(?:\s+(?:sau|chính|quan trọng))?\s*[.:!]?\s*$|sau đây|như sau|dưới đây)(?![\p{L}])/iu
/**
 * A pointer back anywhere in a kept sentence: a pronoun ("Nó chỉ chạy…", "Đây là…", "của nó"), a thing named with "này",
 * "đó", "ấy" or "kia" ("Tủ này dài 120 cm", "đến đó", "Chỗ này"), "vậy" or "thế", or a word that counts on what came
 * before ("thứ hai", "còn lại", "con số", "lâu hơn", "sẽ đỡ hơn", "Bể khác", "Lúc làm lại"). "Bài này" is the guide; "thế nào" asks and "gì đó" names nothing.
 * Two readers found these after the first six words on 15 Nov 2026, so the whole sentence is read.
 */
const PRONOUN = /(?<![\p{L}])(?:nó|chúng|họ|đây|vậy|thế|con số|thứ hai|thứ ba|thứ tư|còn lại|lâu hơn|nhiều hơn|ít hơn|hơn nữa|đỡ hơn|tốt hơn|hay hơn|khá hơn|kém hơn|khác|làm lại|lần sau|lần trước|lần này)(?![\p{L}])/iu
const DEMONSTRATIVE = /(?<![\p{L}])\p{L}+\s+(?:này|đó|ấy|kia)(?![\p{L}])/iu
const NOT_POINTER = /(?<![\p{L}])(?:bài này|video này|(?:như )?thế nào|thay thế|thế giới|thế hệ|(?:gì|nào|đâu|ai) đó|thuộc họ|họ hàng|họ cá)(?![\p{L}])/giu
export function leans(sentence: string): boolean {
  if (LEANS.test(sentence) || POINTS.test(sentence)) return true
  const s = sentence.replace(NOT_POINTER, ' ')
  return PRONOUN.test(s) || DEMONSTRATIVE.test(s)
}
/**
 * A step or a caution: what a sentence cut whole may not take with it. A remark may wait on the list
 * ("bù lại chúng sống lâu", "ít nơi bán"); a step or a caution may not (the chief of staff, 15 Nov 2026).
 */
// "nên" after a comma is "so" ("…, nên mọi thứ đều tính theo…"), not "should".
const STEP = /(?<![\p{L}])(?:(?<!,\s*)nên|cần|phải|hãy|đừng|tránh|cẩn thận|coi chừng|chú ý|lưu ý|nguy hiểm|độc|chết|bệnh|hại|thêm|dùng|cho vào|đặt|thay|châm|rửa|cắt|tắt|bật|chỉnh|kiểm tra|đo|giữ|trộn|ngâm|cách ly|cho ăn|chuyển|thả|mua|khoan|buộc|tìm)(?![\p{L}])/iu
/** A sentence that says what comes later in the guide. */
const ANNOUNCES = /(?<![\p{L}])(?:dưới đây|sau đây|bên dưới|như sau|bài này|cuối bài|phần dưới|phần sau|lát nữa)(?![\p{L}])/iu
/** The names in a sentence: a word past its first that starts with a capital, of four letters or more ("BioMaster", "Twin"). */
export const names = (sentence: string) => (sentence.split(/\s+/).slice(1).join(' ').match(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}-]{3,}/gu) ?? [])
/** A dose said by its measure ("chỉ cần một nắp", "hai giọt"), which givesDose, reading amounts and units, doesn't see. */
const MEASURE = /(?<![\p{L}])(?:nắp|muỗng|thìa|giọt|viên)(?![\p{L}])/iu
/** A kept sentence on money right after a price that goes ("nên tổng tiền cá cũng không đáng là bao"). */
const MONEY = /(?<![\p{L}])(?:tiền|giá|rẻ|đắt|chi phí|đáng là bao|tốn kém)(?![\p{L}])/iu
/** Which sentences sit in a table's cell: a cut there leaves the cell empty and its row or column unnamed. */
const cells = (pieces: Piece[]) => {
  let cell = false
  const out: boolean[] = []
  for (const p of pieces) {
    if (p.sentence) { out.push(cell); continue }
    for (const m of p.html.matchAll(/<(\/?)(td|th|table)\b/gi)) cell = !m[1] && m[2]!.toLowerCase() !== 'table'
  }
  return out
}
/** Which sentences open a heading: one starts a new section, so it never reads on from the sentence before it. */
const headings = (pieces: Piece[]) => pieces.flatMap((p, i) => (p.sentence ? [/<h[1-6][\s>][^<]*$/i.test(pieces[i - 1]?.html ?? '')] : []))
/**
 * A words finding's fix as the words to put in, or nothing when it isn't one: a fix that lists choices ("\"nhưng\", \"tuy
 * nhiên\""), says what to do ("hoặc nói thẳng"), or names a term inside a longer quote ("Van điện (solenoid) để tắt CO2…" →
 * "van điện từ") is a writer's. A quote that starts a sentence or a cell with a capital keeps it.
 */
export function swapOf(quote: string, fix: string): string | undefined {
  const n = (x: string) => x.split(/\s+/).filter(Boolean).length
  if (/["“”‘’'«»,;:()/]|(?<![\p{L}])(?:hoặc|or|nói|viết|dùng từ)(?![\p{L}])/iu.test(fix) || n(quote) > 4 || n(fix) > 4 || !fix.trim()) return undefined
  // "rêu cây (moss)" → "moss" leaves the English: a fix with no Vietnamese letter for a quote with one is the writer's.
  if (/[^\x00-\x7f]/.test(quote) && !/[^\x00-\x7f]/.test(fix)) return undefined
  const f = fix.trim()
  return /^\p{Lu}/u.test(quote) ? f[0]!.toLocaleUpperCase('vi') + f.slice(1) : f
}

export type CutLine = { field: string; before: string; html: string; check: FitCheck; why: string; quote: string }
export type VideoCut = {
  key: string
  file: string
  /** Each part it changes, as it was and as it is now. */
  changes: { field: string; old: string; now: string }[]
  cuts: CutLine[]
  swaps: { field: string; quote: string; fix: string }[]
  /** Words findings whose fix isn't a term to put in: left for the mend. */
  unswapped: string[]
  /** What went because a cut emptied it: a summary point, a question and its answer, a heading. */
  emptied: string[]
}
export type VideoCutReport = { cut: VideoCut[]; left: string[] }
/** The list, an entry for each guide and run ("<guide> <time>"): two clones' runs add different keys, which the JSON-map merge keeps both of. */
type Kept = Record<string, { key: string; at: string; read: string; cuts: CutLine[]; swaps: VideoCut['swaps']; emptied: string[] }>
type Lang = Record<string, unknown> & { held?: Held; body?: string; bodyFixed?: boolean; faqFixed?: boolean; summary?: string[]; faq?: { q: string; a: string }[] }

/** A body without lists, and headings, that a cut left with nothing under them: what went, for the report. */
function tidy(html: string): { html: string; emptied: string[] } {
  const emptied: string[] = []
  let out = html, was = ''
  while (out !== was) {
    was = out
    out = out.replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, '')
    out = out.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>(?=\s*(?:<h([1-6])\b|$))/gi, (all, level: string, text: string, next?: string) => {
      if (next !== undefined && Number(next) > Number(level)) return all
      emptied.push(`heading "${plain(text)}"`)
      return ''
    })
  }
  return { html: out.trim(), emptied }
}

/**
 * The cut of one held video guide: what it changes, or why it is left. `file` is its language file as it stands.
 */
export function cutGuide(p: Page, t: Lang, e: FitEntry | undefined): Omit<VideoCut, 'key' | 'file'> | { left: string } {
  if (t.bodyFixed || t.faqFixed) return { left: 'fixed by hand' }
  if (!e || e.hash !== fitText(p).hash) return { left: 'no saved read of its text as it stands (the gate reads it)' }
  const checks = [...gateChecks(p, e)]
  const fs = fitFindings(p, e)
  // What its hold says as well as what its read finds: a guide held for a person is never touched.
  const waits = [...new Set([...(t.held?.checks ?? []), ...checks, ...fs.map(f => f.check)].filter(c => WAITS.includes(c as FitCheck)))]
  if (waits.length) return { left: `waits for a person: ${waits.join(', ')}` }
  const other = checks.filter(c => !CUT.includes(c) && c !== 'units')
  if (other.length) return { left: `held for ${other.join(', ')}, which the cut doesn't take` }
  const cuts = fs.filter(f => CUT.includes(f.check))
  if (!cuts.length) return { left: 'nothing to cut' }
  const { parts } = fitText(p)
  const fieldOf = (f: FitFinding) => parts.find(x => x.id === f.part)?.field
  const texts = [...readable(p).map(f => ({ field: f.field, text: f.html })), ...p.lines.map(l => ({ field: l.field, text: l.text }))]
  const pieces = new Map<string, Piece[]>(texts.map(x => [x.field, sentences(x.text)]))
  // Each cut sentence, by part: its place among the part's sentences and its finding.
  const gone = new Map<string, Map<number, FitFinding>>()
  for (const f of cuts) {
    const at = fieldOf(f)
    const where = texts.filter(x => (at ? x.field === at : true)).flatMap(x => { const n = quoted(pieces.get(x.field)!, f.quote ?? ''); return n.length ? [{ field: x.field, n }] : [] })
    if (!where.length) return { left: `its ${f.check} finding quotes words not in its text: "${f.quote}"` }
    for (const { field, n } of at ? where : where.slice(0, 1)) {
      if (n.length > 1) return { left: `its ${f.check} finding quotes across two sentences: "${f.quote}"` }
      const m = gone.get(field) ?? gone.set(field, new Map()).get(field)!
      if (!m.has(n[0]!)) m.set(n[0]!, f)
    }
  }
  const words = (html: string) => plain(html).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
  const lost = [...gone].reduce((n, [field, m]) => n + [...m.keys()].reduce((k, i) => k + words(pieces.get(field)!.filter(x => x.sentence)[i]!.html), 0), 0)
  const share = lost / Math.max(1, texts.reduce((n, x) => n + words(x.text), 0))
  // The guide's whole text, to find a name a cut sentence gives that it speaks of again elsewhere.
  const whole = texts.map(x => plain(x.text)).join(' ')
  const out: Omit<VideoCut, 'key' | 'file'> = { changes: [], cuts: [], swaps: [], unswapped: [], emptied: [] }
  const now = new Map<string, string>()
  for (const [field, m] of gone) {
    const ps = pieces.get(field)!
    const said = ps.filter(x => x.sentence).map(x => x.html)
    const block = blockOf(ps)
    const heading = headings(ps)
    const cell = cells(ps)
    for (const [i, f] of m) {
      // A unit or an initial before a full stop ("50 W. Nó…", "25 °C. Cá…") keeps two sentences as one: the cut would take both.
      if (/[.!?…]\s+["“‘(«]*[\p{Lu}\d]/u.test(plain(said[i]!))) return { left: `a sentence it would cut runs on into the next, in ${field}: "${plain(said[i]!)}"` }
      const was = plain(said[i]!)
      if (cell[i]) return { left: `a sentence it would cut is a table's cell, in ${field}: "${was}"` }
      // A label ("<strong>Anubias 'Needle Leaf'</strong>: …") names what its item is about, and a lead-in ending in a colon
      // opens what follows: either cut leaves the rest about nothing.
      if (/<(?:strong|b)\b/i.test(said[i]!) || /^[^.:!?]{1,60}:\s/u.test(was) || /[:：]\s*$/.test(was)) return { left: `a sentence it would cut names or opens what follows it, in ${field}: "${was}"` }
      // A finding on part of a sentence: the rest can be a true step ("Mở vòi đã chỉnh sẵn nhiệt độ rồi châm thuốc khử clo"
      // for the mixer tap alone), which a whole-sentence cut would take.
      // Read whole: a read that quotes all of "Có thể thêm cây thủy sinh nổi, nhất là ở khu ao nông bên trái" for the source's
      // pond still takes a step with it.
      // What it names that the guide speaks of again ("hai lọc BioMaster Thermo 600", then "BioMaster có ngăn lọc thô"), or
      // what it says comes later ("Cách set dưới đây có … một tấm Nút Vàng YouTube", then a part on fixing "tấm trưng bày"):
      // a whole read on 15 Nov found both, far from the cut.
      const named = names(was).find(n => whole.split(n).length - 1 > was.split(n).length - 1)
      if (named) return { left: `a sentence it would cut names "${named}", which the guide speaks of again, in ${field}: "${was}"` }
      if (ANNOUNCES.test(was)) return { left: `a sentence it would cut says what comes later, in ${field}: "${was}"` }
      if (STEP.test(was)) return { left: `a sentence it would cut gives a step or a caution, in ${field}: "${was}"` }
      // A dose in the paragraph of a sentence it cuts: a person reads the paragraph whole.
      let after = i + 1
      while (m.has(after)) after++
      const near = plain([...said.filter((_, j) => block[j] === block[i]), said[after] ?? ''].join(' '))
      if (givesDose(near) || MEASURE.test(near)) return { left: `a dose in the paragraph of a sentence it would cut, in ${field}` }
      // The sentence kept after it, in the same part, that reads on from it.
      let j = i + 1
      while (m.has(j)) j++
      if (j < said.length && !heading[j]) {
        const next = plain(said[j]!)
        if (leans(next)) return { left: `a sentence kept after a cut one reads on from it, in ${field}: "${next}"` }
        // A figure kept right after a cut one that set its terms ("Một cây sưởi khoảng 25 W…" after the tank and the room).
        if (block[j] === block[i] && /\d/.test(was) && /\d/.test(next)) return { left: `a figure kept after a cut one with figures, in ${field}: "${next}"` }
        if (f.check === 'price' && MONEY.test(next)) return { left: `a sentence on money kept after a price that goes, in ${field}: "${next}"` }
      }
      // The sentence kept before it, if it opens what was cut ("Có thể thử các loại sau:").
      let k = i - 1
      while (m.has(k)) k--
      if (k >= 0 && (/[:：]\s*$/.test(plain(said[k]!)) || FORETELLS.test(plain(said[k]!)))) return { left: `a sentence kept before a cut one opens it, in ${field}: "${plain(said[k]!)}"` }
    }
    if (field === 'body' && m.size >= said.length) return { left: 'every sentence of its body would go' }
    for (const [i, f] of [...m].sort(([a], [b]) => a - b)) {
      let b = i - 1
      while (b >= 0 && m.has(b)) b--
      out.cuts.push({ field, before: b >= 0 ? plain(said[b]!) : '', html: said[i]!, check: f.check, why: f.why, quote: f.quote ?? '' })
    }
    now.set(field, m.size >= said.length ? '' : splice(ps, new Map([...m.keys()].map(i => [i, '']))))
  }
  // Last, so a guide a cut would break is listed for that first.
  if (share > VIDEO_CUT_SHARE) return { left: `the cut would take ${Math.round(share * 100)}% of its words` }
  // A "words" finding: its fix where its words stand, in a part the cut keeps, when the fix is a term for the term quoted.
  for (const f of fs.filter(x => x.check === 'words' && x.fix && x.quote)) {
    const field = fieldOf(f)
    const was = field === undefined ? undefined : now.get(field) ?? texts.find(x => x.field === field)?.text
    const fix = swapOf(f.quote!, f.fix!)
    if (field === undefined || !was || !fix || was.split(f.quote!).length !== 2) { out.unswapped.push(`${field ?? '?'}: "${f.quote}" (${f.fix})`); continue }
    now.set(field, was.replace(f.quote!, fix))
    out.swaps.push({ field, quote: f.quote!, fix })
  }
  for (const [field, text] of now) {
    const old = texts.find(x => x.field === field)!.text
    if (field === 'body') {
      const t2 = tidy(text)
      out.emptied.push(...t2.emptied)
      out.changes.push({ field, old, now: t2.html })
    } else out.changes.push({ field, old, now: text.trim() })
  }
  return out
}

/** Where a part is kept in the guide's file: body, summary.N, faq.N.q or faq.N.a. */
const path = (field: string) => field.split('.').map(x => (/^\d+$/.test(x) ? Number(x) : x))
const get = (t: unknown, at: (string | number)[]) => at.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)?.[k], t)

/** The guide's file with the cut's changes: a summary point or an answer left empty goes, its question with it. */
export function applyCut(t: Lang, c: Pick<VideoCut, 'changes' | 'emptied'>): Lang {
  const next = structuredClone(t)
  const dropSummary = new Set<number>(), dropFaq = new Set<number>()
  for (const ch of c.changes) {
    const at = path(ch.field)
    if (at[0] === 'summary' && !ch.now) { dropSummary.add(at[1] as number); continue }
    if (at[0] === 'faq' && !ch.now) { dropFaq.add(at[1] as number); continue }
    const o = get(next, at.slice(0, -1)) as Record<string | number, string>
    o[at.at(-1)!] = ch.now
  }
  if (next.summary) next.summary = next.summary.filter((_, i) => !dropSummary.has(i))
  if (next.faq) next.faq = next.faq.filter((_, i) => !dropFaq.has(i))
  return next
}

/**
 * Cuts the held video guides in Vietnamese, `limit` a run (those named in `first` first, then the longest held), and
 * writes them and the list unless `dryRun`.
 */
export async function videoCut(root: string, o: { limit?: number; first?: readonly string[]; dryRun?: boolean; now?: () => Date } = {}): Promise<VideoCutReport> {
  const state = JSON.parse(await readFile(join(root, 'engine-state/_fit.json'), 'utf8').catch(() => '{}')) as FitState
  const byHand = JSON.parse(await readFile(join(root, HELD_BY_HAND), 'utf8').catch(() => '{}')) as Record<string, HandHold>
  const pages = (await loadPages(join(root, 'content'), ['vi'])).filter(p => p.kind === 'guides' && p.id.startsWith('youtube-'))
  const held: { p: Page; file: string; t: Lang }[] = []
  for (const p of pages) {
    const file = `content/guides/${p.id}/vi.json`
    const t = JSON.parse(await readFile(join(root, file), 'utf8')) as Lang
    if (t.held && !byHand[`guides/${p.id}`]) held.push({ p, file, t })
  }
  const rank = (k: string) => { const i = o.first?.indexOf(k) ?? -1; return i >= 0 ? i : (o.first?.length ?? 0) }
  held.sort((a, b) => rank(fitKey(a.p)) - rank(fitKey(b.p)) || a.t.held!.at.localeCompare(b.t.held!.at) || fitKey(a.p).localeCompare(fitKey(b.p)))
  const report: VideoCutReport = { cut: [], left: [] }
  const keptFile = join(root, VIDEO_CUT_FILE)
  const kept = JSON.parse(await readFile(keptFile, 'utf8').catch(() => '{}')) as Kept
  const at = (o.now ?? (() => new Date()))().toISOString()
  for (const { p, file, t } of held) {
    if (report.cut.length >= (o.limit ?? VIDEO_CUT_LIMIT)) break
    const key = fitKey(p)
    // One cut a guide: what a reread finds after it is the mend's, and losses never add up past the tenth.
    if (Object.values(kept).some(x => x.key === key)) { report.left.push(`${key}: cut once already`); continue }
    const r = cutGuide(p, t, state[key])
    if ('left' in r) { if (r.left !== 'nothing to cut') report.left.push(`${key}: ${r.left}`); continue }
    if (r.changes.some(c => (get(t, path(c.field)) as string | undefined)?.trim() !== c.old.trim())) { report.left.push(`${key}: its file isn't the text its read was of`); continue }
    report.cut.push({ key, file, ...r })
    if (o.dryRun) continue
    kept[`${key} ${at}`] = { key, at, read: state[key]!.hash, cuts: r.cuts, swaps: r.swaps, emptied: r.emptied }
    // The list first, so a run stopped between the two never leaves a cut that isn't on it.
    await writeFile(keptFile, `${JSON.stringify(Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
    await writeFile(join(root, file), `${JSON.stringify(applyCut(t, r), null, 2)}\n`)
  }
  return report
}
