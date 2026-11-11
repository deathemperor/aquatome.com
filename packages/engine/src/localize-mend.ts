import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type Section } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { review, TARGETS, translatableIn, type TargetLang } from './localize'
import { logReviews, readReviews, type Store } from './review-log'
import { sanitizeHtml } from './sanitize'

/**
 * The way back for a translated page under the bar. Until now there was none: a page in Indonesian, Thai or Malay that
 * failed its review stayed as it was unless its English changed, and then the whole page was translated again. On
 * 2026-11-11, 720 of the 786 such fish and plant pages had failed when first made and never been touched since, and a
 * second read of a page as it is passed 40 of 263: the reviewer finds the same faults again.
 *
 * So the faults are fixed where they are. The reviewer's notes name parts by number ("Item 4: …"). Only those parts go
 * to the editor, each with its English and its notes, and it corrects what a note rightly names and leaves every other
 * sentence as it is (prompts/localize-fix.md). The same reviewer then reads the whole page, and the fixed page is kept
 * only if it scores higher than the page did. One go a text: a page whose fix didn't score higher isn't tried again
 * until it has a newer kept review.
 *
 * Left alone: a page with a note about a dose, a medicine or harm (a dose is never reworded without its source: that
 * page waits for the dose and harm check), a page whose notes name no part, and a part whose "fix" rewrote it.
 */
const FIX = readFileSync(new URL('./prompts/localize-fix.md', import.meta.url), 'utf8')
const SCHEMA = { type: 'object', required: ['parts'], properties: { parts: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } } } }

/** A note the fix must not act on alone: it is about how much of something goes in the water, a medicine, or what kills. */
const DOSE = /\b(dos(e|es|ed|age|ages|ing)|overdos\w*|medic(ation|ations|ine|ines|ated)|treatments?|mg\s?\/\s?l|ppm|tablespoons?|teaspoons?|copper|formalin|malachite|antibiotics?|chlorine|chloramine|toxic\w*|poison\w*|lethal|fatal|kill(s|ed|ing)?|harmful|dangerous)\b/i

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

export type MendReport = { kept: string[]; notBetter: string[]; skipped: string[]; failed: string[]; stopped: string }

type Page = { sections: Record<string, string>; quality?: { score: number; indexable: boolean; bySource?: Record<string, number>; reason?: string }; held?: boolean }

/**
 * Each of `ids` in order: a page under the bar with notes that name parts is fixed there and read again. `limit`: pages
 * sent to the editor a run. `dry`: no model call; the report says what would be sent.
 */
export async function mendLocalized(root: string, llm: Llm, lang: TargetLang, ids: string[], o: { kind?: 'species' | 'plants'; limit?: number; model?: string; now?: () => Date; dry?: boolean } = {}): Promise<MendReport> {
  const kind = o.kind ?? 'species'
  const dir = join(root, 'content', kind)
  const stateFile = join(root, `engine-state/localize-${lang}${kind === 'plants' ? '-plants' : ''}.json`)
  const translatable = await translatableIn(root)
  const store: Store = await readReviews(root, 'localize').catch(() => ({}))
  const fill = (s: string) => s.replaceAll('{{LANG}}', TARGETS[lang].lang).replaceAll('{{COUNTRY}}', TARGETS[lang].country).replace('{{STYLE}}', TARGETS[lang].style)
  const report: MendReport = { kept: [], notBetter: [], skipped: [], failed: [], stopped: '' }
  let sent = 0
  for (const id of ids) {
    if (sent >= (o.limit ?? Infinity)) break
    const file = join(dir, id, `${lang}.json`)
    try {
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const page = JSON.parse(raw) as Page
      const was = page.quality?.score
      if (page.held || was === undefined || was >= QUALITY_THRESHOLD) continue
      const traces = [...(store[`${lang}/${kind}/${id}`] ?? [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      const kept = traces.find(t => t.kept)
      // A page made before reviews were logged has its notes in the translator's record, when that is the page's score.
      const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as Record<string, { score: number; notes?: string[] }>
      const notes = kept ? kept.notes : state[id]?.score === was ? state[id]!.notes ?? [] : []
      if (!notes.length) { report.skipped.push(`${id}: no notes on file`); continue }
      // This step logs one try by itself. The translator's own second try has its first beside it, and may be newer than
      // the kept review when the reader-fit gate put that translation back.
      if (traces.some(t => !t.kept && t.attempt === 'rewrite' && t.at > (kept?.at ?? '') && !traces.some(x => x.attempt === 'first' && x.at === t.at))) { report.skipped.push(`${id}: a fix of this text was tried`); continue }
      if (notes.some(n => DOSE.test(n))) { report.skipped.push(`${id}: a note on a dose, a medicine or harm`); continue }
      const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { sections: Section[] }
      // The reviewer's numbering: every translatable part with text, in the page's order (localize.ts `review`).
      const parts = e.sections.filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html }))
      const notesOf = new Map<number, string[]>()
      for (const n of notes) for (const i of partsNamed(n)) if (i >= 1 && i <= parts.length) notesOf.set(i, [...(notesOf.get(i) ?? []), n])
      // A part the translator left out has nothing to fix in place: that is a new translation's job.
      const named = [...notesOf.keys()].sort((a, b) => a - b).filter(i => page.sections[parts[i - 1]!.id]?.trim())
      if (!named.length) { report.skipped.push(`${id}: its notes name no part`); continue }
      const line = `${id}: ${named.length} of ${parts.length} parts, ${notes.length} notes`
      if (o.dry) { report.skipped.push(`${line} (dry run)`); sent++; continue }
      sent++
      const prompt = [
        fill(FIX),
        `--- PARTS ---\n${named.map(i => { const p = parts[i - 1]!; return `### ${p.id}\nEN:\n${p.en}\n${lang.toUpperCase()}:\n${page.sections[p.id]}\nNOTES:\n${notesOf.get(i)!.map(n => `- ${n}`).join('\n')}` }).join('\n\n')}`,
      ].join('\n\n')
      const fixed = await llm<{ parts: { id: string; text: string }[] }>({ system: `You correct ${TARGETS[lang].lang} translations of aquarium-handbook pages. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
      const sections = { ...page.sections }
      let changed = 0
      for (const i of named) {
        const p = parts[i - 1]!
        const old = page.sections[p.id]!
        const got = fixed.parts.find(x => x.id === p.id)?.text.trim() ?? ''
        const text = /<[a-z]/i.test(p.en) ? sanitizeHtml(got) : got.replace(/<[^>]+>/g, '').trim()
        if (text === old || !sameTextMended(old, text)) continue
        sections[p.id] = text
        changed++
      }
      if (!changed) { report.skipped.push(`${line}: the fix changed nothing`); continue }
      const next = TranslationSchema.parse(metricPage({ ...page, sections }, lang)) as unknown as Page
      const r = await review(llm, lang, parts, new Map(parts.map(p => [p.id, next.sections[p.id] ?? ''])))
      const now = o.now?.() ?? new Date()
      if (r.score <= was) {
        await logReviews(root, 'localize', { id: `${kind}/${id}`, lang }, [r], undefined, { now, rewrite: true })
        report.notBetter.push(`${line}: ${was} then ${r.score}, left as it was`)
        continue
      }
      const sources = [...new Set(e.sections.filter(s => translatable(s.source)).map(s => s.source))]
      const { reason: _, ...quality } = page.quality!
      next.quality = { ...quality, score: r.score, indexable: r.score >= QUALITY_THRESHOLD, bySource: Object.fromEntries(sources.map(s => [s, r.score])) }
      await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
      await logReviews(root, 'localize', { id: `${kind}/${id}`, lang }, [r], r, { now, rewrite: true })
      // The translator's record of the page says what the page says. `from` stays: the English hasn't changed.
      if (state[id]) {
        state[id] = { ...state[id], score: r.score, notes: r.notes }
        await writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort()), null, 2)}\n`)
      }
      report.kept.push(`${line}: ${was} to ${r.score}${r.score >= QUALITY_THRESHOLD ? ', open' : ''}, ${changed} parts changed`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message.slice(0, 200)}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  return report
}
