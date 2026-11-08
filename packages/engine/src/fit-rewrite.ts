import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { FIT_TITLE, fitFindings, fitKey, fitText, type FitCheck, type FitFinding, type FitState } from './fit'
import { rewriteForReader } from './for-reader'
import { METRIC_KINDS } from './metric'
import { loadPages, type Page } from './pages'
import { norm, rewritePart, type ReaderFinding } from './reader'

/**
 * The collection rewrite: Vietnamese pages the reader-fit read (fit.ts) found wrong for their reader, written again.
 * - A guide by its own writer, from its source's facts and the market table (for-reader.ts), which every check holds.
 * - A fish, plant or breed page part by part: each part a finding quotes goes to the reader step's rewriter with the
 *   findings as notes (reader.ts rewritePart; a section with its English against that English), kept only when its
 *   reviewer passes it.
 * Left to others: units, which the code rounds (round.ts), words, which the phrase list carries, a kit, which no rewording
 * fixes (the gate holds it), and the doses compared across pages, which a person settles. A title, a summary line or a
 * question isn't rewritten here. engine-state/rewritten.json has each page rewritten, by its text's hash: the owner's list
 * of pages to look at (page-signals) shows a rewrite until the checker has read a newer text.
 */
const MENDED: readonly FitCheck[] = ['product', 'shop', 'price', 'dose', 'source', 'elsewhere', 'dose-caution']
const PART_FIELD = /^(sections\.(?!references).+|body|definition)$/
export type Rewritten = Record<string, { at: string; hash: string }>

/** What a page's parts are wrong for: its current reading's findings this step mends, by the field each quotes. */
export function mendable(p: Page, state: FitState): Map<string, FitFinding[]> {
  const e = state[fitKey(p)]
  const { parts, hash } = fitText(p)
  const out = new Map<string, FitFinding[]>()
  if (!e || e.hash !== hash) return out
  const fs = fitFindings(p, e)
  const fieldOf = (f: FitFinding) => parts.find(x => x.id === f.part)?.field ?? parts.find(x => f.quote && norm(x.text).includes(norm(f.quote)))?.field
  for (const f of fs.filter(f => MENDED.includes(f.check))) {
    const field = fieldOf(f)
    if (field && PART_FIELD.test(field)) out.set(field, [...(out.get(field) ?? []), f])
  }
  // A part rewritten anyway takes its wording findings along.
  for (const f of fs.filter(f => f.check === 'words')) { const field = fieldOf(f); if (field && out.has(field)) out.get(field)!.push(f) }
  return out
}

/** A page wrong for its reader on a check this step mends; a kit is the gate's to hold. */
export const rewriteDue = (p: Page, state: FitState) =>
  p.lang === 'vi' && !fitFindings(p, state[fitKey(p)]).some(f => f.check === 'kit') &&
  (p.kind === 'guides' ? fitFindings(p, state[fitKey(p)]).some(f => f.check !== 'words' && f.check !== 'units') && state[fitKey(p)]?.hash === fitText(p).hash : mendable(p, state).size > 0)

const asNote = (f: FitFinding): ReaderFinding => ({
  kind: 'language', severity: 'high', part: f.part, quote: f.quote,
  problem: f.check === 'words' ? `A word keepers here don't use${f.fix ? `: write "${f.fix}"` : ''}.` : `${FIT_TITLE[f.check]}: ${f.why}. Write it for a keeper in Vietnam; drop what only holds abroad.`,
  ...(f.fix ? { fix: f.fix } : {}),
})
const partOf = (t: { sections?: Record<string, string>; body?: string; definition?: string }, field: string) =>
  field === 'body' ? t.body : field === 'definition' ? t.definition : t.sections?.[field.replace(/^sections\./, '')]

export type RewriteReport = { rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped: string }

/**
 * Rewrites up to `limit` pages, in `pages`' order (the caller ranks them), each due (rewriteDue); stops on a model failure
 * (usage limit) with what it has written. Writes the content files and engine-state/rewritten.json.
 */
export async function fitRewrite(root: string, pages: Page[], state: FitState, d: { llm: Llm; now: () => Date }, o: { limit: number }): Promise<RewriteReport> {
  const report: RewriteReport = { rewritten: [], notKept: [], skipped: [], failed: [], stopped: '' }
  const names = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, { name: string }>
  const done: Page[] = []
  for (const p of pages.filter(p => rewriteDue(p, state)).slice(0, o.limit)) {
    const key = fitKey(p)
    try {
      if (p.kind === 'guides') {
        const r = await rewriteForReader(root, p.id, { llm: d.llm })
        if ('skipped' in r) report.skipped.push(`${key}: ${r.skipped}`)
        else if (r.kept) { report.rewritten.push(`${key} (${r.score.toFixed(2)})`); done.push(p) }
        else report.notKept.push(`${key} (${r.score.toFixed(2)}: ${r.notes.slice(0, 2).join('; ')})`)
        continue
      }
      const file = join(root, 'content', p.kind, p.id, 'vi.json')
      const t = JSON.parse(await readFile(file, 'utf8')) as { sections?: Record<string, string>; body?: string; definition?: string; bodyFixed?: boolean }
      let changed = 0
      for (const [field, fs] of mendable(p, state)) {
        const html = partOf(t, field)
        if (!html || (field === 'body' && t.bodyFixed)) { report.skipped.push(`${key} ${field}: ${html ? 'a person fixed its text' : 'not in the file'}`); continue }
        const source = field.startsWith('sections.') ? field.split(':')[1] : p.origin?.source
        const r = await rewritePart(d.llm, html, fs.map(asNote), { en: p.en?.[field], source: source && names[source]?.name })
        if (!r) { report.skipped.push(`${key} ${field}: its quotes aren't in one block`); continue }
        if (r.score < QUALITY_THRESHOLD) { report.notKept.push(`${key} ${field} (${r.score.toFixed(2)}: ${r.notes.slice(0, 2).join('; ')})`); continue }
        if (field === 'body') t.body = r.html
        else if (field === 'definition') t.definition = r.html
        else t.sections![field.replace(/^sections\./, '')] = r.html
        changed++
        report.rewritten.push(`${key} ${field} (${r.score.toFixed(2)})`)
      }
      if (changed) {
        // Fish, plant and breed pages are written in metric only, as by every other writer (metric.ts).
        await writeFile(file, `${JSON.stringify(METRIC_KINDS.includes(p.kind) ? metricPage(t, 'vi') : t, null, 2)}\n`)
        done.push(p)
      }
    } catch (e) {
      if (e instanceof LlmError) { report.stopped = `${key}: ${e.message}`; break }
      report.failed.push(`${key}: ${(e as Error).message.slice(0, 200)}`)
    }
  }
  if (done.length) {
    // The hash of each page as a build reads it now, which is what the checker will read.
    const file = join(root, 'engine-state', 'rewritten.json')
    const rewritten = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Rewritten
    const keys = new Set(done.map(fitKey))
    const at = d.now().toISOString()
    for (const p of (await loadPages(join(root, 'content'), ['vi'])).filter(p => keys.has(fitKey(p)))) rewritten[fitKey(p)] = { at, hash: fitText(p).hash }
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(rewritten).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  }
  return report
}
