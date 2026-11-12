import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD } from '@aq/schema'
import { HTMLElement, parse } from 'node-html-parser'
import { breedFigures, figuresSaid, keepsFigures, moved, unitsLeft, type BreedFigure } from './breed-units'
import { LlmError, type Llm } from './claude'
import { FIT_TITLE, fitDue, fitFindings, fitKey, fitText, type FitCheck, type FitFinding, type FitState } from './fit'
import { rewriteForReader } from './for-reader'
import { METRIC_KINDS } from './metric'
import { fixedParts, loadPages, type Page } from './pages'
import { fieldOf as partOf, norm, rewritePart, type ReaderFinding } from './reader'
import { metricFigures, TANK_RULE, US_UNITS } from './round'

/**
 * The collection rewrite: Vietnamese pages the reader-fit read (fit.ts) found wrong for their reader, written again.
 * - A guide by its own writer, from its source's facts and the market table (for-reader.ts), which every check holds.
 * - A fish, plant or breed page part by part: each part a finding quotes goes to the reader step's rewriter with the
 *   findings as notes (reader.ts rewritePart; a section with its English against that English), kept only when its
 *   reviewer passes it. Units too, where the part's English gives the figure in US units ("a pair per 5 gallons (about
 *   19 litres)"): the code rounds a converted figure as it is written (round.ts), but not every one, and a page already
 *   written keeps it; written again, it's converted as the writer's rules say, which its reviewer holds. A part with
 *   another finding here is mended for that alone, so a rounding its reviewer fails can't lose that mend.
 * - A breed page's units, which no English beside it keeps a figure from, as the writing rules say (breed-units.ts: the
 *   source's US figure named as keepers here say, in its body and its FAQ answers), after any other mend of the same
 *   part, in the same try, its quote found again by its litres in the block it was in where that mend reworded it
 *   (the chief of staff, 2026-11-12). One beside a dose (its paragraph, or the one before or after), or with a litre
 *   figure with no US figure to work from, is left to a person (unitsLeft), and so is a reworded quote that can't be
 *   told apart.
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
/** A breed page's FAQ answer, rewritten for its units alone (no English beside it, as in its body). */
const FAQ_ANSWER = /^faq\.(\d+)\.a$/
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
/** Each page tried, by the hash of the text it read, and how often on any of its texts (none: once, before the count). */
export type Tried = Record<string, { at: string; hash: string; n?: number }>
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
  // On a breed page, which has no English to keep a figure from, any, in an FAQ answer too; after the part's other mend.
  const mine = new Set(out.keys())
  const breed = p.kind === 'breeds'
  for (const f of fs.filter(f => f.check === 'units')) {
    const field = fieldOf(f)
    if (!field) continue
    if (breed ? PART_FIELD.test(field) || FAQ_ANSWER.test(field) : PART_FIELD.test(field) && !mine.has(field) && convertible(f.quote ?? '', p.en?.[field] ?? '')) out.set(field, [...(out.get(field) ?? []), f])
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

/** A breed page's units: its litres are our conversion of a source's US figure, named as keepers here say. */
const BREED_UNITS = `This page has no English beside it: its litres are our conversion of a source's US figure, and are named as keepers here say, worked out from the source's own US figure (${TANK_RULE.en}; another size the nearest round figure keepers say, a minimum never more than a twentieth under it). A tank or water per fish, or per cm of a fish, is an allowance, not a dose: it is named so too. A dose's amount and the water it goes into stay exact`
const asNote = (f: FitFinding, figures?: BreedFigure[]): ReaderFinding => ({
  kind: 'language', severity: 'high', part: f.part, quote: f.quote,
  problem: f.check === 'words' ? `A word keepers here don't use${f.fix ? `: write "${f.fix}"` : ''}.`
    : f.check === 'units' && figures ? `${FIT_TITLE.units}: ${f.why}. ${BREED_UNITS}.${figures.length ? ` Write exactly these figures: ${figuresSaid(figures)}. Change no other figure.` : ''} Give no US figure.`
    : f.check === 'units' ? `${FIT_TITLE.units}: ${f.why}. Convert the English's US units as the writing rules say (${TANK_RULE.en}; inches to cm), and give no US figure. Never round a dose's amount or the water it goes into: convert those exactly.`
    : `${FIT_TITLE[f.check]}: ${f.why}. Write it for a keeper in Vietnam; drop what only holds abroad.`,
  ...(f.fix ? { fix: f.fix } : {}),
})

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
  const due = pages.filter(p => rewriteDue(p, state) && tried[fitKey(p)]?.hash !== fitText(p).hash)
  // Tried MAX_TRIES times and due again: listed for a person to name (`--only`), never tried here.
  const capped = o.retry ? [] : due.filter(p => triesOf(fitKey(p)) >= MAX_TRIES).map(fitKey)
  if (capped.length) report.skipped.push(`${capped.length} page${capped.length > 1 ? 's' : ''} tried ${MAX_TRIES} times and due again, for a person to name: ${capped.slice(0, 10).join(', ')}${capped.length > 10 ? ', …' : ''}`)
  for (const p of pages.filter(p => rewriteDue(p, state) && (o.retry || (tried[fitKey(p)]?.hash !== fitText(p).hash && triesOf(fitKey(p)) < MAX_TRIES))).slice(0, o.limit)) {
    const key = fitKey(p)
    const before = tried[key]
    // A page a person names doesn't use up one of its own tries.
    tried[key] = { at, hash: fitText(p).hash, n: triesOf(key) + (o.retry ? 0 : 1) }
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
      const t = JSON.parse(await readFile(file, 'utf8')) as { sections?: Record<string, string>; body?: string; definition?: string; bodyFixed?: boolean; faq?: { q: string; a: string }[] }
      const fixed = await fixedParts(join(root, 'content', p.kind, p.id))
      // A breed page's facts give its sources' US figures (breed-units.ts).
      const facts = p.kind === 'breeds' ? await readFile(join(root, 'engine-state', 'breeds', `${p.id}.json`), 'utf8').catch(() => '') : ''
      for (const [field, fs] of mendable(p, state)) {
        // An FAQ answer is plain text: rewritten as a paragraph of its own.
        const faq = FAQ_ANSWER.exec(field)
        const read = () => (faq ? t.faq?.[Number(faq[1])]?.a : partOf(t, field))
        if (!read() || (field === 'body' && t.bodyFixed) || fixed.has(field)) { report.skipped.push(`${key} ${field}: ${read() ? 'a person fixed its text' : 'not in the file'}`); continue }
        const source = field.startsWith('sections.') ? field.split(':')[1] : p.origin?.source
        // A breed page's units after the part's other mend, in the same try: a rounding its reviewer fails can't lose it.
        const units = p.kind === 'breeds' ? fs.filter(f => f.check === 'units') : []
        const others = fs.filter(f => !units.includes(f))
        const passes = units.length && others.some(f => f.check !== 'words') ? [others, units] : [fs]
        // Each part's blocks' text; a units quote's block before any mend, to find it again in (breed-units.ts moved).
        const blocksOf = (text: string) => (faq ? [text] : parse(text).childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement).map(e => e.text))
        const start = blocksOf(read()!)
        const home = new Map(units.map(f => [f, start.findIndex(b => norm(b).includes(norm(f.quote)))]))
        for (const pass of passes) {
          const before = read()!
          const html = faq ? `<p>${before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : before
          // A breed page's units: a quote the other mend reworded is found again by its litres, in its block; one beside
          // a dose (its paragraph and the ones next to it), or with a litre figure with no US figure to work from, is
          // left to a person.
          const blocks = blocksOf(before)
          const blockOf = (q: string) => blocks.find(b => norm(b).includes(norm(q)))
          const around = (q: string) => { const i = blocks.findIndex(b => norm(b).includes(norm(q))); return i < 0 ? q : blocks.slice(Math.max(0, i - 1), i + 2).join('\n') }
          const mine: FitFinding[] = []
          for (const f of pass.filter(f => units.includes(f))) {
            const was = home.get(f) ?? -1
            const quote = !f.quote || blockOf(f.quote) ? f.quote : blocks.length === start.length && was >= 0 ? moved(f.quote, blocks[was]!) : undefined
            const left = f.quote && !quote ? 'the other mend reworded it, and its figure can\'t be told apart' : quote ? unitsLeft(quote, facts, around(quote)) : undefined
            if (left) report.skipped.push(`${key} ${field} units: ${left} ("${f.quote}")`)
            else mine.push({ ...f, quote: quote ?? f.quote })
          }
          const now = [...pass.filter(f => !units.includes(f)), ...mine]
          if (!now.some(f => f.check !== 'words')) continue
          const told = new Map(mine.map(f => [f, breedFigures(f.quote ?? '', facts)]))
          const figures = [...told.values()].flat()
          const said = figures.length ? `This is a breed page with no English source: its litres are our conversion of a source's US figure, and the editor was told to name these as keepers here say, from the source's own US figure, a minimum never more than a twentieth under it: ${figuresSaid(figures)}. Those changes are correct, not errors.` : undefined
          const r = await rewritePart(d.llm, html, now.map(f => asNote(f, told.get(f))), { en: p.en?.[field], source: source && names[source]?.name, ...(said ? { figures: said } : {}) })
          if (!r) { report.skipped.push(`${key} ${field}: its quotes aren't in one block`); continue }
          const next = faq ? parse(r.html).text.trim() : r.html
          // Kept at the bar, and saying nothing more surely than before (hedges.ts); a breed page's units with each figure.
          const off = mine.length ? keepsFigures(faq ? next : parse(next).text, mine.map(f => f.quote ?? ''), figures) : undefined
          if (r.score < QUALITY_THRESHOLD || r.lost.length || off) { report.notKept.push(`${key} ${field} (${r.score.toFixed(2)}: ${[...(off ? [off] : []), ...r.notes].slice(0, 2).join('; ')})`); continue }
          if (next === before) { report.skipped.push(`${key} ${field}: the rewrite changed nothing`); continue }
          if (faq) t.faq![Number(faq[1])]!.a = next
          else if (field === 'body') t.body = next
          else if (field === 'definition') t.definition = next
          else t.sections![field.replace(/^sections\./, '')] = next
          // Each part as it's kept, so a later part's failure loses none. Fish, plant and breed pages are written in metric
          // only, as by every other writer (metric.ts).
          await writeFile(file, `${JSON.stringify(METRIC_KINDS.includes(p.kind) ? metricPage(t, 'vi') : t, null, 2)}\n`)
          changed++
          report.rewritten.push(`${key} ${field}${passes.length > 1 && mine.length ? ' units' : ''} (${r.score.toFixed(2)})`)
        }
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
