import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type Section } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { review, TARGETS, translatableIn, type TargetLang } from './localize'
import { NEAR_BAR, steadyRead } from './quality'
import { sourceTextHash } from './recheck-score'
import { logReviews, readReviews, type Store } from './review-log'
import { sanitizeHtml } from './sanitize'

/**
 * The way back for a translated page under the bar. Until now there was none: a page in Indonesian, Thai or Malay that
 * failed its review stayed as it was unless its English changed, and then the whole page was translated again. On
 * 2026-11-11, 720 of the 786 such fish and plant pages had failed when first made and never been touched since, and a
 * second read of a page as it is passed 40 of 263: the reviewer finds the same faults again.
 *
 * So the faults are fixed where they are, from a read of the text the page has now. A review is that read when it
 * stored this text's hash and is a steady one: near the bar, the middle of three reads (quality.ts steadyRead). The 14
 * head pages read three times on 2026-11-11 gave the other verdict on one read in 20 within minutes and one in 4
 * across the afternoon, and 8 of them read 0.15 to 0.35 over their score on file, so a score on file is not that read.
 * Where none is on file the reviewer reads the page first (logged as a recheck, with the hash), and a page that passes
 * needs no fix: its read is logged, and the page is left as it is. Otherwise the notes name parts by number ("Item 4:
 * …"). Only those parts go to the editor, each with its English and its notes, and it corrects what a note rightly
 * names and leaves every other sentence as it is (prompts/localize-fix.md). The same reviewer then reads the whole page
 * the same steady way, and the fixed page is kept only if it scores higher than both the page's score and the read of
 * the unfixed text, and that read has no note on a dose or harm, nor on something left out of a part it changed. One
 * go a text: a fix that changed nothing or wasn't kept is logged with the hash of the text it was a fix of.
 *
 * Left alone: a page with a note about a dose, a medicine or harm (a dose is never reworded without its source: that
 * page waits for the dose and harm check), a page whose notes name no part, a part fixed by hand (localize.ts keeps it
 * too), a part with a dose in it, a part whose "fix" rewrote it, changed a figure or its unit, or changed anything its
 * notes don't quote (keepsWhatItSays), and a page that lacks a part of the English (the reviewer reads it as left out and scores
 * the page down: that is the translator's to add, not a fix in place).
 */
const FIX = readFileSync(new URL('./prompts/localize-fix.md', import.meta.url), 'utf8')
const SCHEMA = { type: 'object', required: ['parts'], properties: { parts: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } } } }

/**
 * A note the fix must not act on alone: it is about how much of something goes in the water, a medicine, or what
 * harms or kills. The words are the Writing Lead's rule (2026-11-11). "drops" counts only after a number: the
 * reviewer's own "the Thai drops the point" is on one closed page in seven.
 */
const DOSE = /\b(dos(e|es|ed|age|ages|ing)|overdos\w*|medic\w*|treat(s|ed|ing|ment|ments)?|quarantin\w*|mg\s?\/\s?l|g\s?\/\s?l|ml|ppm|\d+\s*drops?|tablespoons?|teaspoons?|salts?|copper|formalin|malachite|methylene|bleach\w*|peroxide|permanganate|praziquantel|metronidazole|levamisole|fenbendazole|flubendazole|antibiotics?|chlorine|chloramine|ammonia|nitrites?|nitrates?|toxi\w*|poison\w*|venom\w*|lethal|fatal|deadly|deaths?|mortalit\w*|die[sd]?|dying|kill(s|ed|ing)?|harm\w*|danger\w*|unsafe)\b/i
export const doseOrHarm = (note: string): boolean => DOSE.test(note)

/** The parts a note names: "Item 4", "Items 6 and 13", "item 3, 5", "Items 2, 3, and 4", "Items 3–5". Part numbers are the reviewer's, from 1. */
export function partsNamed(note: string): number[] {
  const out = new Set<number>()
  for (const m of note.matchAll(/\bitems?\s+(\d+(?:\s*(?:,\s*and|,|and|&|\/|[-–]|to)\s*\d+)*)/gi))
    for (const r of m[1]!.matchAll(/(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?/g)) {
      const [a, b] = [Number(r[1]), Number(r[2] ?? r[1])]
      for (let i = a; i <= Math.min(b, a + 50); i++) out.add(i)
    }
  return [...out]
}

/** The phrases a note quotes ("…", “…”, '…'): the reviewer is asked to quote each problem phrase, so this is where its fault is. */
export const quotesIn = (note: string): string[] =>
  [...note.matchAll(/["“]([^"“”]{2,}?)["”]|'([^']{2,}?)'/g)].map(m => flat(m[1] ?? m[2]!)).filter(q => q.length >= 2)

/** Whether `next` is `old` with passages changed, not another text: most of the old text is still in it, at about its length. */
export function sameTextMended(old: string, next: string): boolean {
  if (!next.trim() || next.length < old.length * 0.7 || next.length > old.length * 1.4) return false
  const grams = (s: string) => { const g: string[] = []; for (let i = 0; i + 4 <= s.length; i++) g.push(s.slice(i, i + 4)); return g }
  const has = new Set(grams(next))
  const want = grams(old)
  return !want.length || want.filter(g => has.has(g)).length / want.length >= 0.7
}

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
/** A part with a dose in it (2 ml, 5 mg/l, 3 drops, 2 กรัม): its figures are its source's, and the editor is never sent it. */
const DOSE_FIGURE = /\d\s*(?:mg|ml|g|grams?|millilit(?:er|re)s?|mililiter|drops?|tetes|titis|ppm|tsp|tbsp|teaspoons?|tablespoons?|sendok|sdt|sdm|sudu)(?![a-z])|(?:mg|g)\s?\/\s?l(?![a-z])|\d\s*(?:มล|มก|กรัม|หยด|ช้อน|ซีซี|มิลลิกรัม|มิลลิลิตร)|\d\s*cc(?![a-z])/i
export const hasDose = (html: string): boolean => DOSE_FIGURE.test(plain(html))
/** A part's text, as compared: no tags, one space between words, one kind of dash. */
const flat = (html: string) => plain(html).replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const blocks = (html: string) => (html.match(/<(?:p|li|br|h[1-6]|tr)\b/gi) ?? []).length
/** Number words: a fix that turns "six" into "five" changes a figure as surely as one that turns 6 into 5. */
const NUMBER_WORDS: Record<TargetLang, RegExp> = {
  id: /\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|setengah|separuh)\b/gi,
  ms: /\b(?:satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|setengah|separuh)\b/gi,
  // Not สาม, ร้อย or พัน: they are inside common words (สามารถ, ร้อยละ, พันธุ์).
  th: /หนึ่ง|สอง|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ครึ่ง/g,
}
/**
 * The figures in a text in order, each with what follows it (in Thai, which writes a unit onto the next word, its next six
 * characters), then its number words: "24 °C" and "24 °F", "2 meter" and "2 sentimeter", "20 ลิตร" and "20 มิลลิลิตร",
 * "หก" and "ห้า" all differ.
 */
const figures = (lang: TargetLang, text: string) =>
  `${[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*([^\s\d]{0,10})/gu)].map(m => `${m[1]!.replace(',', '.')}${lang === 'th' ? m[2]!.slice(0, 6) : (/^[°%\p{L}]+/u.exec(m[2]!)?.[0] ?? '').toLowerCase()}`).join(' ')} | ${(text.match(NUMBER_WORDS[lang]) ?? []).map(w => w.toLowerCase()).join(' ')}`
/**
 * Where a fix may change a part: each phrase its notes quote, wherever it stands, widened to whole words (in Thai, by
 * three characters each side, as Thai sets no space between words).
 */
function editable(lang: TargetLang, text: string, quotes: string[]): [number, number][] {
  const out: [number, number][] = []
  for (const q of quotes) for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
    let [a, b] = [i, i + q.length]
    if (lang === 'th') [a, b] = [Math.max(0, a - 3), Math.min(text.length, b + 3)]
    else { while (a > 0 && text[a - 1] !== ' ') a--; while (b < text.length && text[b] !== ' ') b++ }
    out.push([a, b])
  }
  return out.sort((x, y) => x[0] - y[0])
}
/**
 * Whether a fix of a part says all the old text said. Everything outside the phrases its notes quote is still there,
 * word for word and in order (text may be added between); a quoted phrase is reworded, not dropped (what stands in its
 * place is at least a third of its length); the figures, with what follows each, and the number words are the same; the
 * paragraphs and list items are the same. A fix that cut a caution, a sentence or a clause no note quotes, or changed a
 * figure or its unit, is not taken, whatever the reviewer then reads.
 */
export function keepsWhatItSays(lang: TargetLang, old: string, next: string, quotes: string[]): boolean {
  const [a, b] = [flat(old), flat(next)]
  if (blocks(old) !== blocks(next) || figures(lang, a) !== figures(lang, b)) return false
  // The quoted spans, joined where only a space parts them; the old text between them is what no note quotes.
  const spans: [number, number][] = []
  for (const [x, y] of editable(lang, a, quotes)) {
    const last = spans.at(-1)
    if (last && x <= last[1] + 1) last[1] = Math.max(last[1], y)
    else spans.push([x, y])
  }
  // Each unquoted piece found in the fix in order; what lies between two of them stands in for the span they part.
  let at = 0
  for (let j = 0; j <= spans.length; j++) {
    const piece = a.slice(j ? spans[j - 1]![1] : 0, j < spans.length ? spans[j]![0] : a.length).trim()
    const i = piece ? b.indexOf(piece, at) : j ? b.length : 0
    if (i < 0) return false
    if (j && b.slice(at, i).trim().length * 3 < a.slice(...spans[j - 1]!).trim().length) return false
    at = i + piece.length
  }
  return true
}
/** A note that something is left out. After a fix, one that doesn't name only parts the fix left alone means it may have cut it. */
const LEFT_OUT = /\b(?:omit\w*|omission|left out|leaves? out|leaving out|missing|miss(?:es|ed)|drops?|dropped|removed?|lost|lacks?|no longer|cut|deleted|absent)\b/i

/** One fix tried, kept or not: what each part sent was and came back as. */
export type MendTry = { id: string; was: number; read: number; score: number; kept: boolean; parts: { id: string; notes: string[]; before: string; after: string }[] }
export type MendReport = { read: string[]; kept: string[]; notBetter: string[]; skipped: string[]; failed: string[]; stopped: string }

type Page = { sections: Record<string, string>; quality?: { score: number; indexable: boolean; bySource?: Record<string, number>; reason?: string }; held?: boolean }
type Part = { id: string; en: string; fixed?: boolean }

/** Hash of what the reviewer reads: each part's English and the page's text for it. A read with this hash is of this text. */
export const pageTextHash = (parts: Part[], sections: Record<string, string>): string => sourceTextHash(parts.map(p => ({ id: p.id, en: p.en, vi: sections[p.id] ?? '' })))

/**
 * Each of `ids` in order: a page under the bar is read if no read of its text is on file, then fixed where that read's
 * notes name parts, and read again. `limit`: pages a model is called for in a run. `readsOnly`: stop after the read.
 * `dry`: no model call; the report says what would be read or sent. `onTry`: every fix tried, the ones not kept too.
 */
export async function mendLocalized(root: string, llm: Llm, lang: TargetLang, ids: string[], o: { kind?: 'species' | 'plants'; limit?: number; model?: string; now?: () => Date; dry?: boolean; readsOnly?: boolean; onTry?: (t: MendTry) => void | Promise<void> } = {}): Promise<MendReport> {
  const kind = o.kind ?? 'species'
  const dir = join(root, 'content', kind)
  const stateFile = join(root, `engine-state/localize-${lang}${kind === 'plants' ? '-plants' : ''}.json`)
  const translatable = await translatableIn(root)
  const store: Store = await readReviews(root, 'localize').catch(() => ({}))
  const fill = (s: string) => s.replaceAll('{{LANG}}', TARGETS[lang].lang).replaceAll('{{COUNTRY}}', TARGETS[lang].country).replace('{{STYLE}}', TARGETS[lang].style)
  const now = () => o.now?.() ?? new Date()
  const report: MendReport = { read: [], kept: [], notBetter: [], skipped: [], failed: [], stopped: '' }
  let sent = 0
  for (const id of ids) {
    if (sent >= (o.limit ?? Infinity)) break
    const file = join(dir, id, `${lang}.json`)
    const ref = { id: `${kind}/${id}`, lang }
    try {
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const page = JSON.parse(raw) as Page
      const was = page.quality?.score
      if (page.held || was === undefined || was >= QUALITY_THRESHOLD) continue
      const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { sections: Section[] }
      // The reviewer's numbering: every translatable part with text, in the page's order (localize.ts `review`).
      const parts: Part[] = e.sections.filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html, fixed: s.fixed === true }))
      if (parts.some(p => !page.sections[p.id]?.trim())) { report.skipped.push(`${id}: a part of the English is not on the page`); continue }
      const hash = pageTextHash(parts, page.sections)
      const traces = store[`${lang}/${kind}/${id}`] ?? []
      if (traces.some(t => !t.kept && t.attempt === 'rewrite' && t.textHash === hash)) { report.skipped.push(`${id}: a fix of this text was tried`); continue }
      let read: { score: number; notes: string[]; reads?: number[] } | undefined = traces.find(t => t.kept && t.textHash === hash && (t.reads || Math.abs(t.score - QUALITY_THRESHOLD) >= NEAR_BAR))
      if (read && read.score >= QUALITY_THRESHOLD) { report.skipped.push(`${id}: its read passes, left as it is`); continue }
      // `limit` counts the pages a model is called for, once each: a page skipped below takes no place.
      let counted = false
      if (!read) {
        if (o.dry) { report.skipped.push(`${id}: needs a new read first (dry run)`); sent++; continue }
        sent++
        counted = true
        read = await steadyRead(() => review(llm, lang, parts, new Map(Object.entries(page.sections))))
        await logReviews(root, 'localize', ref, [read], read, { now: now(), recheck: true, textHash: hash })
        report.read.push(`${id}: ${was} then ${read.score}, ${read.notes.length} notes${read.score >= QUALITY_THRESHOLD ? ', passes as it is' : ''}`)
        if (read.score >= QUALITY_THRESHOLD) continue
      }
      if (o.readsOnly) continue
      const notes = read.notes
      if (!notes.length) { report.skipped.push(`${id}: its read left no notes`); continue }
      if (notes.some(doseOrHarm)) { report.skipped.push(`${id}: a note on a dose, a medicine or harm`); continue }
      const notesOf = new Map<number, string[]>()
      for (const n of notes) for (const i of partsNamed(n)) if (i >= 1 && i <= parts.length) notesOf.set(i, [...(notesOf.get(i) ?? []), n])
      if (!notesOf.size) { report.skipped.push(`${id}: its notes name no part`); continue }
      // A part fixed by hand keeps its text, and a part with a dose its figures: neither goes to the editor.
      const named = [...notesOf.keys()].sort((a, b) => a - b).filter(i => { const p = parts[i - 1]!; return !p.fixed && !hasDose(p.en) && !hasDose(page.sections[p.id]!) })
      if (!named.length) { report.skipped.push(`${id}: its notes name only parts fixed by hand or with a dose`); continue }
      const line = `${id}: ${named.length} of ${parts.length} parts, ${notes.length} notes`
      if (o.dry) { report.skipped.push(`${line} (dry run)`); sent++; continue }
      if (!counted) sent++
      const prompt = [
        fill(FIX),
        `--- PARTS ---\n${named.map(i => { const p = parts[i - 1]!; return `### ${p.id}\nEN:\n${p.en}\n${lang.toUpperCase()}:\n${page.sections[p.id]}\nNOTES:\n${notesOf.get(i)!.map(n => `- ${n}`).join('\n')}` }).join('\n\n')}`,
      ].join('\n\n')
      const fixed = await llm<{ parts: { id: string; text: string }[] }>({ system: `You correct ${TARGETS[lang].lang} translations of aquarium-handbook pages. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
      const offered: Record<string, string> = {}
      for (const i of named) {
        const p = parts[i - 1]!
        const old = page.sections[p.id]!
        const got = fixed.parts.find(x => x.id === p.id)?.text.trim() ?? ''
        const text = /<[a-z]/i.test(p.en) ? sanitizeHtml(got) : got.replace(/<[^>]+>/g, '').trim()
        if (text !== old && sameTextMended(old, text)) offered[p.id] = text
      }
      // Each part as it would be written (metric units: a figure the editor gave in °F or gallons is converted here), then
      // checked against the old. Only the parts taken change: every other part stays as it is on the page.
      const metric = (TranslationSchema.parse(metricPage({ ...page, sections: { ...page.sections, ...offered } }, lang)) as unknown as Page).sections
      const sections = { ...page.sections }
      const changed: string[] = []
      for (const k of Object.keys(offered)) {
        const quotes = notesOf.get(parts.findIndex(p => p.id === k) + 1)!.flatMap(quotesIn)
        if (!metric[k] || metric[k] === page.sections[k] || !keepsWhatItSays(lang, page.sections[k]!, metric[k]!, quotes)) continue
        sections[k] = metric[k]!
        changed.push(k)
      }
      if (!changed.length) {
        // Logged with the hash of the text it was a fix of, so that text isn't sent again.
        await logReviews(root, 'localize', ref, [read], undefined, { now: now(), rewrite: true, textHash: hash })
        report.skipped.push(`${line}: the fix changed nothing`)
        continue
      }
      const next: Page = { ...page, sections }
      const r = await steadyRead(() => review(llm, lang, parts, new Map(Object.entries(next.sections))))
      const bar = Math.max(was, read.score)
      // A note on a dose or harm after the fix, or on something left out of a part it changed: the fix may have said one
      // otherwise or cut it, so it isn't kept.
      const harm = r.notes.some(doseOrHarm)
      const touched = new Set(changed.map(k => parts.findIndex(p => p.id === k) + 1))
      const lost = r.notes.some(n => LEFT_OUT.test(n) && (!partsNamed(n).length || partsNamed(n).some(i => touched.has(i))))
      const kept = r.score > bar && !harm && !lost
      await o.onTry?.({ id, was, read: read.score, score: r.score, kept, parts: changed.map(k => ({ id: k, notes: notesOf.get(parts.findIndex(p => p.id === k) + 1)!, before: page.sections[k]!, after: next.sections[k]! })) })
      if (!kept) {
        // Logged with the hash of the text it was a fix of, so that text isn't sent again.
        await logReviews(root, 'localize', ref, [r], undefined, { now: now(), rewrite: true, textHash: hash })
        report.notBetter.push(`${line}: ${bar} then ${r.score}${harm ? ', a note on a dose or harm' : ''}${lost ? ', a note on something left out of a part it changed' : ''}, left as it was`)
        continue
      }
      const sources = [...new Set(e.sections.filter(s => translatable(s.source)).map(s => s.source))]
      const { reason: _, ...quality } = page.quality!
      next.quality = { ...quality, score: r.score, indexable: r.score >= QUALITY_THRESHOLD, bySource: Object.fromEntries(sources.map(s => [s, r.score])) }
      await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
      await logReviews(root, 'localize', ref, [r], r, { now: now(), rewrite: true, textHash: pageTextHash(parts, next.sections) })
      // The translator's record of the page says what the page says. `from` stays: the English hasn't changed.
      const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as Record<string, { score: number; notes?: string[] }>
      if (state[id]) {
        state[id] = { ...state[id], score: r.score, notes: r.notes }
        await writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort()), null, 2)}\n`)
      }
      report.kept.push(`${line}: ${bar} to ${r.score}${r.score >= QUALITY_THRESHOLD ? ', open' : ''}, ${changed.length} parts changed`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message.slice(0, 200)}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  return report
}
