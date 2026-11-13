import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { FIT_TITLE, fitDue, fitFindings, fitKey, fitText, type FitCheck, type FitFinding, type FitState } from './fit'
import { rewriteForReader } from './for-reader'
import { METRIC_KINDS } from './metric'
import { mendPart } from './mend'
import { fixedParts, loadPages, type Page } from './pages'
import { fieldOf as partOf, norm, type ReaderFinding } from './reader'
import { metricFigures, TANK_RULE, US_UNITS } from './round'

/**
 * The collection rewrite: Vietnamese pages the reader-fit read (fit.ts) found wrong for their reader, written again.
 * - A guide by its own writer, from its source's facts and the market table (for-reader.ts), which every check holds.
 * - A fish, plant or breed page part by part: in each part a finding quotes, only the sentences it quotes are written
 *   again, with the findings as notes, and the rest put back word for word; kept only when its reviewer passes the
 *   change and nothing is left out that no finding asks to go (mend.ts). Units too, where the part's English gives the figure in US units ("a pair per 5 gallons (about
 *   19 litres)"): the code rounds a converted figure as it is written (round.ts), but not every one, and a page already
 *   written keeps it; written again, it's converted as the writer's rules say, which its reviewer holds. A part with
 *   another finding here is mended for that alone, so a rounding its reviewer fails can't lose that mend.
 * Left to others: units on a guide, which its writer rounds; a figure the English gives in metric ("tanks as small as 11
 * litres"), which the check doesn't count (round.ts sourceGives); words, which the phrase list carries; a kit, which no rewording
 * fixes (the gate holds it), advice on a fish, plant or breed page that would hurt (held too, for a person), and the doses
 * compared across pages, which a person settles. A title, a summary line or a question isn't rewritten here. engine-state/rewritten.json has each page rewritten, by its text's hash: the owner's list
 * of pages to look at (page-signals) shows a rewrite until the checker has read a newer text. engine-state/_fit-rewrite.json
 * has each page tried, by the text it read: one not kept or skipped waits until its text changes, or is named (`retry`),
 * and one tried MAX_TRIES times waits for a person to name it.
 */
const MENDED: readonly FitCheck[] = ['product', 'shop', 'price', 'dose', 'source', 'units', 'elsewhere', 'dose-caution', 'lethal']
const PART_FIELD = /^(sections\.(?!references).+|body|definition)$/
/**
 * A units finding the rewrite can mend: its English gives the figure in US units, and none of the metric figures it
 * quotes is one the English gives itself, alone or beside a US one ("~68 litres (~18 US gal)", "5 gallons (about 19
 * litres)"): numbers stay as the source gives them (the chief of staff, 2026-11-11; round.ts sourceGives). A US unit
 * left in the quote itself is always mended.
 */
export function convertible(quote: string, en: string): boolean {
  if (US_UNITS.test(quote)) return true
  if (!US_UNITS.test(en)) return false
  const given = new Set(metricFigures(en, 'en'))
  return !metricFigures(quote, 'vi').some(n => given.has(n))
}
export type Rewritten = Record<string, { at: string; hash: string }>
/**
 * Each page tried, by the hash of the text it read, and how often on any of its texts (none: once, before the count);
 * `rule`, the way its parts were mended (none: MEND_RULE 1).
 */
export type Tried = Record<string, { at: string; hash: string; n?: number; rule?: number }>
/**
 * How a fish, plant or breed page's parts are mended. 2: only the sentences a finding quotes (mend.ts, 13 Nov 2026). A
 * page tried under an earlier rule is tried once more on the same text, within MAX_TRIES: the front list's first run
 * left 13 parts unkept under rule 1, and the chief of staff clears the list to see what rule 2 keeps of them.
 */
export const MEND_RULE = 2
/**
 * A page is tried at most this often, on any of its texts, unless named: a part its reviewers pass that the next read
 * still faults would make the page due again on its new text, a cycle at a time, with only the step's ceiling to stop it.
 */
export const MAX_TRIES = 2

/** What a page's parts are wrong for: its current reading's findings this step mends, by the field each quotes. */
export function mendable(p: Page, state: FitState): Map<string, FitFinding[]> {
  const e = state[fitKey(p)]
  const { parts, hash } = fitText(p)
  const out = new Map<string, FitFinding[]>()
  if (!e || e.hash !== hash) return out
  const fs = fitFindings(p, e)
  const fieldOf = (f: FitFinding) => parts.find(x => x.id === f.part)?.field ?? parts.find(x => f.quote && norm(x.text).includes(norm(f.quote)))?.field
  for (const f of fs.filter(f => MENDED.includes(f.check) && f.check !== 'units')) {
    const field = fieldOf(f)
    if (field && PART_FIELD.test(field)) out.set(field, [...(out.get(field) ?? []), f])
  }
  // Units: only a figure converted from the English's US units (convertible), on a part with nothing else to mend here.
  const mine = new Set(out.keys())
  for (const f of fs.filter(f => f.check === 'units')) {
    const field = fieldOf(f)
    if (field && PART_FIELD.test(field) && !mine.has(field) && convertible(f.quote ?? '', p.en?.[field] ?? '')) out.set(field, [...(out.get(field) ?? []), f])
  }
  // A part rewritten anyway takes its wording findings along.
  for (const f of fs.filter(f => f.check === 'words')) { const field = fieldOf(f); if (field && out.has(field)) out.get(field)!.push(f) }
  return out
}

/**
 * A page wrong for its reader on a check this step mends, by a reading of its current text with the current checklist (a
 * guide read before the kit check could be a kit); a kit is the gate's to hold.
 */
export const rewriteDue = (p: Page, state: FitState) =>
  p.lang === 'vi' && !fitDue([p], state).length && !fitFindings(p, state[fitKey(p)]).some(f => f.check === 'kit') &&
  (p.kind === 'guides' ? fitFindings(p, state[fitKey(p)]).some(f => f.check !== 'words' && f.check !== 'units') : mendable(p, state).size > 0)

const asNote = (f: FitFinding): ReaderFinding => ({
  kind: 'language', severity: 'high', part: f.part, quote: f.quote,
  problem: f.check === 'words' ? `A word keepers here don't use${f.fix ? `: write "${f.fix}"` : ''}.`
    : f.check === 'units' ? `${FIT_TITLE.units}: ${f.why}. Convert the English's US units as the writing rules say (${TANK_RULE.en}; inches to cm), and give no US figure. Never round a dose's amount or the water it goes into: convert those exactly.`
    : `${FIT_TITLE[f.check]}: ${f.why}. Write it for a keeper in Vietnam; drop what only holds abroad.`,
  ...(f.fix ? { fix: f.fix } : {}),
})

/** A finding as the writer's note on the sentences it quotes. */
const noteOf = (f: FitFinding) => { const n = asNote(f); return `${n.problem}${n.fix ? ` Nên viết: "${n.fix}"` : ''}` }

export type RewriteReport = { rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped: string }

/**
 * Rewrites up to `limit` pages, in `pages`' order (the caller ranks them), each due (rewriteDue) and not tried on this text
 * unless `retry`; stops on a model failure (usage limit) with what it has written. Writes the content files, each part as it
 * is kept, engine-state/rewritten.json and engine-state/_fit-rewrite.json.
 */
export async function fitRewrite(root: string, pages: Page[], state: FitState, d: { llm: Llm; now: () => Date }, o: { limit: number; retry?: boolean }): Promise<RewriteReport> {
  const report: RewriteReport = { rewritten: [], notKept: [], skipped: [], failed: [], stopped: '' }
  const names = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, { name: string }>
  const triedFile = join(root, 'engine-state', '_fit-rewrite.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Tried
  const done: Page[] = []
  const at = d.now().toISOString()
  const triesOf = (k: string) => (tried[k] ? tried[k].n ?? 1 : 0)
  // Tried on this text, and (but a guide, which is written whole) by the way parts are mended now.
  const triedOn = (p: Page) => tried[fitKey(p)]?.hash === fitText(p).hash && (p.kind === 'guides' || (tried[fitKey(p)]?.rule ?? 1) >= MEND_RULE)
  const due = pages.filter(p => rewriteDue(p, state) && !triedOn(p))
  // Tried MAX_TRIES times and due again: listed for a person to name (`--only`), never tried here.
  const capped = o.retry ? [] : due.filter(p => triesOf(fitKey(p)) >= MAX_TRIES).map(fitKey)
  if (capped.length) report.skipped.push(`${capped.length} page${capped.length > 1 ? 's' : ''} tried ${MAX_TRIES} times and due again, for a person to name: ${capped.slice(0, 10).join(', ')}${capped.length > 10 ? ', …' : ''}`)
  for (const p of pages.filter(p => rewriteDue(p, state) && (o.retry || (!triedOn(p) && triesOf(fitKey(p)) < MAX_TRIES))).slice(0, o.limit)) {
    const key = fitKey(p)
    const before = tried[key]
    // A page a person names doesn't use up one of its own tries.
    tried[key] = { at, hash: fitText(p).hash, n: triesOf(key) + (o.retry ? 0 : 1), rule: MEND_RULE }
    let changed = 0
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
      const fixed = await fixedParts(join(root, 'content', p.kind, p.id))
      for (const [field, fs] of mendable(p, state)) {
        const html = partOf(t, field)
        if (!html || (field === 'body' && t.bodyFixed) || fixed.has(field)) { report.skipped.push(`${key} ${field}: ${html ? 'a person fixed its text' : 'not in the file'}`); continue }
        const source = field.startsWith('sections.') ? field.split(':')[1] : p.origin?.source
        const r = await mendPart(d.llm, html, fs.map(f => ({ check: f.check, quote: f.quote ?? '', note: noteOf(f) })), { en: p.en?.[field], source: source && names[source]?.name, model: 'opus', metric: METRIC_KINDS.includes(p.kind) })
        if (typeof r === 'string') { report.skipped.push(`${key} ${field}: ${r}`); continue }
        // Kept at the bar, leaving out only what a finding asks to go, and saying nothing more surely than before (hedges.ts).
        if (r.score < QUALITY_THRESHOLD || r.lost.length || r.unasked.length) { report.notKept.push(`${key} ${field} (${r.score.toFixed(2)}: ${r.notes.slice(0, 2).join('; ')})`); continue }
        if (r.html === html) { report.skipped.push(`${key} ${field}: the rewrite changed nothing`); continue }
        if (field === 'body') t.body = r.html
        else if (field === 'definition') t.definition = r.html
        else t.sections![field.replace(/^sections\./, '')] = r.html
        // Each part as it's kept, so a later part's failure loses none. The sentences that changed are in metric already
        // (mendPart); nothing else on the page is touched (Astra's read: converting the page changed parts no one read).
        await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
        changed++
        report.rewritten.push(`${key} ${field} (${r.score.toFixed(2)})`)
      }
    } catch (e) {
      // Stopped part way (the accounts out): what it kept is kept, and the page isn't counted as tried.
      if (e instanceof LlmError) { if (before) tried[key] = before; else delete tried[key]; if (changed) done.push(p); report.stopped = `${key}: ${e.message}`; break }
      report.failed.push(`${key}: ${(e as Error).message.slice(0, 200)}`)
    }
    if (changed) done.push(p)
  }
  const sorted = (x: Record<string, unknown>) => `${JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`
  if (Object.keys(tried).length) await writeFile(triedFile, sorted(tried))
  if (done.length) {
    // The hash of each page as a build reads it now, which is what the checker will read.
    const file = join(root, 'engine-state', 'rewritten.json')
    const rewritten = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Rewritten
    const keys = new Set(done.map(fitKey))
    for (const p of (await loadPages(join(root, 'content'), ['vi'])).filter(p => keys.has(fitKey(p)))) rewritten[fitKey(p)] = { at, hash: fitText(p).hash }
    await writeFile(file, sorted(rewritten))
  }
  return report
}
