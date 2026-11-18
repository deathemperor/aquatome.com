import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, type Section } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { review, translatableIn, type TargetLang } from './localize'
import { piece } from './pieces'
import { steadyRead } from './quality'
import { sourceTextHash } from './recheck-score'
import { logReviews, readReviews, type Review, type Trace } from './review-log'

/**
 * Two fresh reads on two models (the chief of staff, 16 Nov 2026). An Indonesian or Thai fish page out of search for its
 * score was mostly put there by one early read: on 16 Nov, 30 of 40 such pages passed a fresh read of their text as it
 * is, 29 of those passed Opus too, and 39 of 40 pages in search at exactly the bar read over it again. Readers today fail
 * a bad page: of 12 pages with a fault planted in each, Opus named 12 and Sonnet 11, and each it named fell under the
 * bar. So a page comes back when the steady Sonnet read and then the steady Opus read of its text as it is both pass,
 * and no read of that text carries a note on a dose or harm.
 *
 * - Sonnet reads first; Opus only after a Sonnet pass. The page takes the lower of the two scores.
 * - One try a text: its hash is kept (engine-state/recheck-<lang>.json), and a text tried isn't read again until it
 *   changes. A page that fails either read keeps its place and its old score, and goes to the rewrite as before. So one
 *   pass after one fail changes nothing.
 * - A note on a dose or harm keeps the page out: in either fresh read, in a logged read of this text (by its hash, or
 *   kept since the translator last wrote the page), or in the translator's own read of it. A note on a text the page no
 *   longer has (a fix never kept) doesn't count. Nor does one the Page Recovery or Writing lead has read and cleared, by
 *   page and quoted whole (dose-cleared.json, changed only by pull request); nothing is cleared by pattern. A page held
 *   only on notes cleared since comes back on the reads it had, with no new read.
 * - Pages the translator wrote in the last day go first, then the most-read. Left alone: a page held, at or over the
 *   bar, lacking a part of the English (the reviewer reads it as left out: the translator's to add), or whose score
 *   carries a reason other than its score (`quality.reason` "thin", or any other a step gives it): this step can't weigh
 *   it, so it never erases one. A reason "score" is what this step is for: the page is read as usual, and it goes when the
 *   page comes back (the chief of staff, 16 Nov 2026: Vietnamese fish pages carry it, and a translator that wrote it
 *   here too would otherwise have every page this step exists for skipped).
 * - Every source takes the one new score, as the translator's whole-page read gives them (localize.ts). For these pages
 *   that is read by the build (@aq/schema `cleanQuality`, the lowest source this build may show), the dashboard's list of
 *   pages out of search (content-stats.ts, the same lowest), the second reads (review-backfill.ts, which reads again a
 *   source under the bar: none is), and the translator when a source's English changes (localize.ts, which keeps an
 *   unchanged source's score and gives a changed one the lower of its old and new). Each does with it what it does with
 *   a page the translator scored whole.
 */

/** The two readers, named whatever ENGINE_MODEL says, so the two reads are always of two models. */
export const FIRST_MODEL = 'sonnet'
export const SECOND_MODEL = 'opus'
/** Indonesian and Thai fish pages only, the kinds the 16 Nov trial sampled; others get a 20-page sample first. */
export const RECHECK_LANGS: readonly TargetLang[] = ['id', 'th']

/**
 * A note about how much of something goes in the water, a medicine, or what harms or kills. The words are the Writing
 * Lead's rule (2026-11-11). "drops" counts only after a number: the reviewer's own "the Thai drops the point" is on one
 * closed page in seven.
 */
const DOSE = /\b(dos(e|es|ed|age|ages|ing)|overdos\w*|medic\w*|treat(s|ed|ing|ment|ments)?|quarantin\w*|mg\s?\/\s?l|g\s?\/\s?l|ml|ppm|\d+\s*drops?|tablespoons?|teaspoons?|salts?|copper|formalin|malachite|methylene|bleach\w*|peroxide|permanganate|praziquantel|metronidazole|levamisole|fenbendazole|flubendazole|antibiotics?|chlorine|chloramine|ammonia|nitrites?|nitrates?|toxi\w*|poison\w*|venom\w*|lethal|fatal|deadly|deaths?|mortalit\w*|die[sd]?|dying|kill(s|ed|ing)?|harm\w*|danger\w*|unsafe)\b/i
export const doseOrHarm = (note: string): boolean => DOSE.test(note)

/** A dose or harm note read and cleared by hand: the page (`th/species/<id>`), the note word for word, who, when and why. */
export type Cleared = { page: string; note: string; by: string; at: string; why: string }
const CLEARED = JSON.parse(readFileSync(new URL('./dose-cleared.json', import.meta.url), 'utf8')) as Cleared[]
type Page = { sections: Record<string, string>; quality?: { score: number; indexable: boolean; bySource?: Record<string, number>; reason?: string }; held?: boolean }
type Tried = Record<string, { hash: string; at: string; sonnet: number; opus?: number; back: boolean; /** The dose or harm notes that held it. */ held?: string[] }>
export type RecheckReport = { back: string[]; failed: string[]; held: string[]; skipped: string[]; stopped: string }

export async function recheckLocalized(root: string, llm: Llm, lang: TargetLang, ids: string[], o: { limit?: number; /** Start no page after this many minutes. */ maxMinutes?: number; now?: () => Date; dry?: boolean; cleared?: Cleared[] } = {}): Promise<RecheckReport> {
  if (!RECHECK_LANGS.includes(lang)) throw new Error(`recheck: ${lang} pages aren't in its scope (${RECHECK_LANGS.join(', ')})`)
  const now = () => o.now?.() ?? new Date()
  const dir = join(root, 'content/species')
  const stateFile = join(root, `engine-state/localize-${lang}.json`)
  const triedFile = join(root, `engine-state/recheck-${lang}.json`)
  const translatable = await translatableIn(root)
  const store = await readReviews(root, 'localize').catch(() => ({}) as Record<string, Trace[]>)
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as Record<string, { at?: string; score?: number; notes?: string[] }>
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Tried
  const cleared = o.cleared ?? CLEARED
  const isCleared = (id: string, note: string) => cleared.some(c => c.page === `${lang}/species/${id}` && c.note === note)
  const sonnetLlm: Llm = (a => llm({ ...a, model: FIRST_MODEL })) as Llm
  const opus: Llm = (a => llm({ ...a, model: SECOND_MODEL })) as Llm
  const report: RecheckReport = { back: [], failed: [], held: [], skipped: [], stopped: '' }
  // The translator's pages of the last day first, in the order given (most-read first).
  const since = new Date(now().getTime() - 86_400_000).toISOString().slice(0, 10)
  const order = [...ids.filter(id => (state[id]?.at ?? '') >= since), ...ids.filter(id => (state[id]?.at ?? '') < since)]
  // The page at the lower of its two scores, in search; the translator's record of it says the same. Only if its text is
  // still the text read, and it wasn't held or given another reason while it was read (a hand run beside the cycle): else
  // it is left as it is, and why is returned.
  async function putBack(id: string, file: string, hash: string, score: number, parts: { id: string; en: string }[]): Promise<string | undefined> {
    const page = JSON.parse(await readFile(file, 'utf8')) as Page
    if (sourceTextHash(parts.map(p => ({ id: p.id, en: p.en, vi: page.sections[p.id] ?? '' }))) !== hash) return 'its text changed while it was read'
    if (page.held) return 'it was held while it was read'
    if (page.quality?.reason && page.quality.reason !== 'score') return `its score was given a reason ("${page.quality.reason}") while it was read`
    const { reason: _, ...quality } = page.quality!
    const sources = [...new Set(parts.map(p => p.id.split(':')[1]!))]
    await writeFile(file, `${JSON.stringify({ ...page, quality: { ...quality, score, indexable: true, bySource: Object.fromEntries(sources.map(s => [s, score])) } }, null, 2)}\n`)
    // The translator's record as it is now, not as it was when the run began.
    const latest = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as typeof state
    if (latest[id]) {
      latest[id] = { ...latest[id], score }
      state[id] = latest[id]
      await writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(latest).sort()), null, 2)}\n`)
    }
    return undefined
  }
  // The notes on a dose or harm on this text, read before (the logged reads of it, by its hash, or kept since the
  // translator last wrote the page, and the translator's own), from `after` on only when given; uncleared ones.
  const harmOn = (id: string, hash: string, after?: string) =>
    [...(store[`${lang}/species/${id}`] ?? []).filter(t => (t.textHash === hash && (!after || Date.parse(t.at) > Date.parse(after))) || (!t.textHash && t.kept && t.at.slice(0, 10) >= (state[id]?.at ?? ''))).flatMap(t => t.notes), ...(state[id]?.notes ?? [])]
      .filter(n => doseOrHarm(n) && !isCleared(id, n))
  let sent = 0
  const started = Date.now()
  for (const id of order) {
    if (sent >= (o.limit ?? Infinity)) break
    if (o.maxMinutes !== undefined && Date.now() - started >= o.maxMinutes * 60_000) { report.skipped.push(`stopped after ${o.maxMinutes} min`); break }
    const file = join(dir, id, `${lang}.json`)
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const ref = { id: `species/${id}`, lang }
    try {
      const page = JSON.parse(raw) as Page
      const was = page.quality?.score
      if (page.held || was === undefined || was >= QUALITY_THRESHOLD) continue
      if (page.quality?.reason && page.quality.reason !== 'score') { report.skipped.push(`${id}: its score carries a reason ("${page.quality.reason}"), left as it is`); continue }
      const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { sections: Section[] }
      // The reviewer's numbering: every translatable part with text, in the page's order (localize.ts `review`).
      const parts = e.sections.filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html }))
      if (parts.some(p => !page.sections[p.id]?.trim())) { report.skipped.push(`${id}: a part of the English is not on the page`); continue }
      const hash = sourceTextHash(parts.map(p => ({ id: p.id, en: p.en, vi: page.sections[p.id]! })))
      const before = tried[id]?.hash === hash ? tried[id]! : undefined
      // Tried: left alone, unless both reads passed and every note that held it has been cleared since.
      if (before && (before.back || !(before.held?.length && before.held.every(n => isCleared(id, n)) && (before.opus ?? 0) >= QUALITY_THRESHOLD && before.sonnet >= QUALITY_THRESHOLD))) continue
      if (before) {
        // A note on a dose or harm logged on this text since the try, and not cleared, still holds it.
        const since = [...new Set(harmOn(id, hash, before.at))]
        if (since.length) { report.held.push(`${id}: ${was}, its notes cleared, but a note on a dose or harm since: ${since.map(n => JSON.stringify(n)).join('; ')}`); continue }
        if (o.dry) { report.skipped.push(`${id}: its notes cleared, would come back (dry run)`); continue }
        const refused = await putBack(id, file, hash, Math.min(before.sonnet, before.opus!), parts)
        if (refused) { report.skipped.push(`${id}: ${refused}`); continue }
        tried[id] = { ...before, back: true }
        await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
        report.back.push(`${id}: ${was}, Sonnet ${before.sonnet}, Opus ${before.opus}: back at ${Math.min(before.sonnet, before.opus!)}, its notes on a dose or harm cleared`)
        continue
      }
      if (o.dry) { report.skipped.push(`${id}: ${was}, would be read (dry run)`); sent++; continue }
      sent++
      // A page's reads are one piece: started only when what's left of the day's line covers a page and the last one, else
      // the step stops before it, as at its ceiling (pieces.ts).
      const { sonnet, second } = await piece(`${lang}/${id}`, async () => {
        const sonnet = await steadyRead(() => review(sonnetLlm, lang, parts, new Map(Object.entries(page.sections))))
        await logReviews(root, 'localize', ref, [sonnet], sonnet, { now: now(), recheck: true, textHash: hash, model: FIRST_MODEL })
        let second: Review | undefined
        if (sonnet.score >= QUALITY_THRESHOLD) {
          second = await steadyRead(() => review(opus, lang, parts, new Map(Object.entries(page.sections))))
          await logReviews(root, 'localize', ref, [second], second, { now: now(), recheck: true, textHash: hash, model: SECOND_MODEL })
        }
        return { sonnet, second }
      })
      const line = `${id}: ${was}, Sonnet ${sonnet.score}${second ? `, Opus ${second.score}` : ''}`
      // Every read of this text: the two fresh ones, the logged ones by its hash or kept since the translator last wrote
      // it (every kept one, for a page with no record of the translator's), and the translator's own. A read of a text
      // never kept, or of one since changed, isn't this text's.
      const harm = [...new Set([...[...sonnet.notes, ...(second?.notes ?? [])].filter(n => doseOrHarm(n) && !isCleared(id, n)), ...harmOn(id, hash)])]
      const back = !!second && second.score >= QUALITY_THRESHOLD && !harm.length
      tried[id] = { hash, at: now().toISOString(), sonnet: sonnet.score, ...(second ? { opus: second.score } : {}), back, ...(harm.length ? { held: harm } : {}) }
      await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
      if (!second || second.score < QUALITY_THRESHOLD) { report.failed.push(line); continue }
      if (harm.length) { report.held.push(`${line}: a note on a dose or harm: ${harm.map(n => JSON.stringify(n)).join('; ')}`); continue }
      const score = Math.min(sonnet.score, second.score)
      const refused = await putBack(id, file, hash, score, parts)
      if (refused) {
        // Not a try of this page as it now stands: read afresh once it is a page this step reads again.
        delete tried[id]
        await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
        report.skipped.push(`${line}: ${refused}`)
        continue
      }
      report.back.push(`${line}: back at ${score}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message.slice(0, 200)}`; break }
      report.skipped.push(`${id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  return report
}
