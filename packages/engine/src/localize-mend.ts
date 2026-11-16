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
import { sentences } from './sentences'

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
 * the unfixed text, and that read has no note on a dose or harm. One go a text: a fix that changed nothing or didn't
 * score higher is logged with the hash of the text it was a fix of.
 *
 * Left alone: a page with a note about a dose, a medicine or harm (a dose is never reworded without its source: that
 * page waits for the dose and harm check), a page whose notes name no part, a part fixed by hand (localize.ts keeps it
 * too), a part with a dose in it, a part whose "fix" rewrote it or changed a figure or dropped a sentence
 * (keepsWhatItSays), and a page that lacks a part of the English (the reviewer reads it as left out and scores the page
 * down: that is the translator's to add, not a fix in place).
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

/** The parts a note names: "Item 4", "Items 6 and 13", "item 3, 5". Part numbers are the reviewer's, from 1. */
export function partsNamed(note: string): number[] {
  const out = new Set<number>()
  for (const m of note.matchAll(/\bitems?\s+(\d+(?:\s*(?:,|and|&|\/)\s*\d+)*)/gi)) for (const n of m[1]!.match(/\d+/g) ?? []) out.add(Number(n))
  return [...out]
}

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
const DOSE_FIGURE = /\d\s*(?:mg|ml|g|grams?|millilit(?:er|re)s?|mililiter|drops?|tetes|ppm|tsp|tbsp|teaspoons?|tablespoons?|sendok)(?![a-z])|(?:mg|g)\s?\/\s?l(?![a-z])|\d\s*(?:มล|มก|กรัม|หยด|ช้อน)/i
export const hasDose = (html: string): boolean => DOSE_FIGURE.test(plain(html))
/** The figures in a text, a decimal comma read as a point. */
const figures = (html: string) => (plain(html).match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(',', '.')).sort().join(' ')
const blocks = (html: string) => (html.match(/<(?:p|li|br|h[1-6]|tr)\b/gi) ?? []).length
/** Sentences: Thai has no full stops, and a space ends its sentences and clauses. */
const sentencesIn = (lang: TargetLang, html: string) => (lang === 'th' ? plain(html).trim().split(/\s+/).filter(Boolean).length : sentences(html).filter(p => p.sentence).length)
/**
 * Whether a fix of a part says all the old text said: the same figures, the same paragraphs and list items, and no
 * fewer sentences. A fix that changed a figure or dropped a caution is not taken, whatever the reviewer then reads.
 */
export const keepsWhatItSays = (lang: TargetLang, old: string, next: string): boolean =>
  figures(next) === figures(old) && blocks(next) === blocks(old) && sentencesIn(lang, next) >= sentencesIn(lang, old)

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
      const sections = { ...page.sections }
      const changed: string[] = []
      for (const i of named) {
        const p = parts[i - 1]!
        const old = page.sections[p.id]!
        const got = fixed.parts.find(x => x.id === p.id)?.text.trim() ?? ''
        const text = /<[a-z]/i.test(p.en) ? sanitizeHtml(got) : got.replace(/<[^>]+>/g, '').trim()
        if (text === old || !sameTextMended(old, text) || !keepsWhatItSays(lang, old, text)) continue
        sections[p.id] = text
        changed.push(p.id)
      }
      if (!changed.length) {
        // Logged with the hash of the text it was a fix of, so that text isn't sent again.
        await logReviews(root, 'localize', ref, [read], undefined, { now: now(), rewrite: true, textHash: hash })
        report.skipped.push(`${line}: the fix changed nothing`)
        continue
      }
      const next = TranslationSchema.parse(metricPage({ ...page, sections }, lang)) as unknown as Page
      const r = await steadyRead(() => review(llm, lang, parts, new Map(Object.entries(next.sections))))
      const bar = Math.max(was, read.score)
      // A note on a dose or harm after the fix: the fix may have said one otherwise, so it isn't kept.
      const harm = r.notes.some(doseOrHarm)
      const kept = r.score > bar && !harm
      await o.onTry?.({ id, was, read: read.score, score: r.score, kept, parts: changed.map(k => ({ id: k, notes: notesOf.get(parts.findIndex(p => p.id === k) + 1)!, before: page.sections[k]!, after: next.sections[k]! })) })
      if (!kept) {
        // Logged with the hash of the text it was a fix of, so that text isn't sent again.
        await logReviews(root, 'localize', ref, [r], undefined, { now: now(), rewrite: true, textHash: hash })
        report.notBetter.push(`${line}: ${bar} then ${r.score}${harm ? ', a note on a dose or harm' : ''}, left as it was`)
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
