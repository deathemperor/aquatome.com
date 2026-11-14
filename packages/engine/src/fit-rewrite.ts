import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD } from '@aq/schema'
import { HTMLElement, parse } from 'node-html-parser'
import { breedFigures, figuresSaid, keepsFigures, moved, unitsLeft, withoutConcentrations, type BreedFigure, type PlacedFigure } from './breed-units'
import { LlmError, type Llm } from './claude'
import { FIT_TITLE, fitDue, fitFindings, fitKey, fitText, type FitCheck, type FitFinding, type FitState } from './fit'
import { rewriteForReader } from './for-reader'
import { METRIC_KINDS } from './metric'
import { goesWhole, mendPart, words as mendWords } from './mend'
import { fixedParts, loadPages, type Page } from './pages'
import { piece } from './pieces'
import { fieldOf as partOf, norm, type ReaderFinding } from './reader'
import { metricFigures, TANK_RULE, US_UNITS } from './round'
import { sentences } from './sentences'
import { isShop } from './species-sources'

/**
 * The collection rewrite: Vietnamese pages the reader-fit read (fit.ts) found wrong for their reader, written again.
 * - A guide by its own writer, from its source's facts and the market table (for-reader.ts), which every check holds.
 * - A fish, plant or breed page part by part: in each part a finding quotes, only the sentences it quotes are written
 *   again, with the findings as notes, and the rest put back word for word; kept only when its reviewer passes the
 *   change and nothing is left out that no finding asks to go (mend.ts). Units too, where the part's English gives the figure in US units ("a pair per 5 gallons (about
 *   19 litres)"): the code rounds a converted figure as it is written (round.ts), but not every one, and a page already
 *   written keeps it; written again, it's converted as the writer's rules say, which its reviewer holds. A part with
 *   another finding here is mended for that alone, so a rounding its reviewer fails can't lose that mend.
 * - A breed page's units, which no English beside it keeps a figure from, as the writing rules say (breed-units.ts: the
 *   source's US figure named as keepers here say, in its body and its FAQ answers), after any other mend of the same
 *   part, in the same try, its quote found again by its litres in the block it was in where that mend reworded it
 *   (the chief of staff, 2026-11-12). One with a dose near it (its paragraph, the one before or after, or the rest of its
 *   section between the headings either side), or with a litre figure with no US figure to work from, is left to a
 *   person (unitsLeft), and so is one code works out no figure for (gallons or a length in it, or a figure already the
 *   size keepers say) and a reworded quote that can't be told apart. Kept only with each paragraph's litres as they
 *   were, in their order, each mended figure in place of its old one and no other moved (keepsFigures).
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
/**
 * Each page tried, by the hash of the text it read, and how often on any of its texts (none: once, before the count);
 * `rule`, the way its parts were mended (none: MEND_RULE 1).
 */
export type Tried = Record<string, { at: string; hash: string; n?: number; rule?: number }>
/**
 * How a fish, plant or breed page's parts are mended. 2: only the sentences a finding quotes (mend.ts, 13 Nov 2026). 3: a
 * part of three sentences or fewer that would lose every one comes off the page (14 Nov 2026). A page tried under an
 * earlier rule is tried once more on the same text, within MAX_TRIES: the front list's first run left 13 parts unkept
 * under rule 1, and the lane's first left 4 pages held on parts rule 3 takes off.
 */
export const MEND_RULE = 3
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
    // Its measures as they are: code converts them (mend.ts `metric`), as no writer's figure can be held to its place
    // (Astra's reads of 14 Nov 2026).
    : f.check === 'units' ? `${FIT_TITLE.units}: ${f.why}. Leave each figure and its unit exactly as written: code converts the US units to metric after you, as the writing rules say. Write no figure of your own.`
    // On where a statement applies (a dealer's batch, the source's own photo or tank), or a check code can't tell: the
    // sentence goes whole, as what's left of it could say of every fish what was said of one (the chief of staff, 14 Nov
    // 2026; mend.ts `goesWhole`).
    : goesWhole(f.check) ? `${FIT_TITLE[f.check]}: ${f.why}. The whole sentence goes: return it empty.`
    // A detail inside it is cut, never said another way (the chief of staff, 14 Nov 2026; mend.ts addedWords holds it).
    : `${FIT_TITLE[f.check]}: ${f.why}. Cut the quoted words, or the whole sentence if nothing true is left without them: never say it another way, and put in nothing it didn't say.`,
  ...(f.fix ? { fix: f.fix } : {}),
})

/**
 * The runs of a breed figure's old text that are its numbers and unit words, which its conversion replaces: what a units
 * finding covers in mend.ts, not the words between them (Astra's read: "38 lít nước sạch mỗi 2,5 cm" written "15 lít cho
 * mỗi cm" lost "sạch", and passed).
 */
const UNIT_WORDS = new Set(['lít', 'l', 'cm', 'mm', 'm', 'mỗi', 'cho', 'trên', 'từng', 'gallon', 'gal', 'inch'])
const figureRuns = (from: string) => {
  const runs: string[][] = [[]]
  // A figure whole, with its marks, as mend.ts reads words ("2,5").
  for (const w of mendWords(from)) {
    if (/^[.,-]?\d/.test(w) || UNIT_WORDS.has(w)) runs.at(-1)!.push(w)
    else if (runs.at(-1)!.length) runs.push([])
  }
  return runs.filter(r => r.length).map(r => r.join(' '))
}
/** A finding as the writer's note on the sentences it quotes (a breed page's units with the figures to write). */
const noteOf = (f: FitFinding, figures?: BreedFigure[]) => { const n = asNote(f, figures); return `${n.problem}${n.fix ? ` Nên viết: "${n.fix}"` : ''}` }

/** `gone`: each sentence a kept part lost whole, and each that went with it, for the chief of staff (mend.ts `Mended`). */
export type RewriteReport = { rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped: string; gone: string[] }

/**
 * Rewrites up to `limit` pages, in `pages`' order (the caller ranks them), each due (rewriteDue) and not tried on this text
 * unless `retry`; stops on a model failure (usage limit) with what it has written. Writes the content files, each part as it
 * is kept, engine-state/rewritten.json and engine-state/_fit-rewrite.json.
 */
export async function fitRewrite(root: string, pages: Page[], state: FitState, d: { llm: Llm; now: () => Date }, o: { limit: number; retry?: boolean; mend?: ReadonlySet<string> }): Promise<RewriteReport> {
  const report: RewriteReport = { rewritten: [], notKept: [], skipped: [], failed: [], stopped: '', gone: [] }
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
      // A guide is written whole from its facts, but one in `mend` (the lane's: no reader has read it, fit-front.ts) is mended
      // sentence by sentence, cut only, as a fish page is (the chief of staff, 14 Nov 2026).
      if (p.kind === 'guides' && !o.mend?.has(key)) {
        // A figure the guide had stays, but where a finding's quote asks it to go or change (for-reader.ts figuresLost).
        const r = await piece(key, () => rewriteForReader(root, p.id, { llm: d.llm }, { gone: fitFindings(p, state[key]).map(f => f.quote ?? '') }))
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
        // Each part's blocks, with their tags; a units quote's block before any mend, to find it again in (breed-units.ts moved).
        const blocksOf = (text: string) => (faq ? [{ tag: 'p', text }] : parse(text).childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement).map(e => ({ tag: e.rawTagName.toLowerCase(), text: e.text })))
        const textOf = (text: string) => blocksOf(text).map(b => b.text.replace(/\s+/g, ' ')).join('\n')
        const start = blocksOf(read()!).map(b => b.text)
        const home = new Map(units.map(f => [f, start.findIndex(b => norm(b).includes(norm(f.quote)))]))
        // One piece (pieces.ts): what's left of the day's line covers a part's mend, or it isn't started.
        await piece(`${key} ${field}`, async () => {
          for (const pass of passes) {
            const before = read()!
            const html = faq ? `<p>${before.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : before
            // A breed page's units: a quote the other mend reworded is found again by its litres, in its block; one with a
            // dose near it (its paragraph, the ones next to it and the rest of its section, between the headings either
            // side), with a litre figure with no US figure to work from, or with no figure worked out at all, is left to a
            // person.
            const els = blocksOf(before)
            const blocks = els.map(b => b.text)
            const blockOf = (q: string) => blocks.find(b => norm(b).includes(norm(q)))
            const heading = (j: number) => /^h[1-6]$/.test(els[j]!.tag)
            const around = (q: string) => {
              const i = blocks.findIndex(b => norm(b).includes(norm(q)))
              if (i < 0) return q
              let a = i
              while (a > 0 && !heading(a - 1)) a--
              let z = i
              while (z < blocks.length - 1 && !heading(z + 1)) z++
              // Its paragraph and the ones beside it whole; the rest of its section without its concentrations ("2,5 mg/l"
              // of oxygen), which put nothing into any water.
              return blocks.map((b, j) => (Math.abs(j - i) <= 1 ? b : j >= a && j <= z ? withoutConcentrations(b) : '')).filter(Boolean).join('\n')
            }
            const mine: FitFinding[] = []
            const told = new Map<FitFinding, BreedFigure[]>()
            for (const f of pass.filter(f => units.includes(f))) {
              const was = home.get(f) ?? -1
              const quote = !f.quote || blockOf(f.quote) ? f.quote : blocks.length === start.length && was >= 0 ? moved(f.quote, blocks[was]!) : undefined
              // Each figure read whole in the quote's paragraph (breed-units.ts breedFigures).
              const figures = quote ? breedFigures(quote, facts, blockOf(quote)) : []
              // An FAQ answer's question is beside it: "Pha 1 ml thuốc vào bao nhiêu nước?" makes its answer a dose's water.
              const near = (q: string) => (faq ? `${t.faq?.[Number(faq[1])]?.q ?? ''}\n${around(q)}` : around(q))
              const left = f.quote && !quote ? 'the other mend reworded it, and its figure can\'t be told apart'
                : (quote ? unitsLeft(quote, facts, near(quote), blockOf(quote)) : undefined) ?? (figures.length ? undefined : 'code works out no figure for it (gallons or a length in it, or a figure already the size keepers say)')
              if (left) { report.skipped.push(`${key} ${field} units: ${left} ("${f.quote}")`); continue }
              const g = { ...f, quote: quote ?? f.quote }
              mine.push(g)
              told.set(g, figures)
            }
            const now = [...pass.filter(f => !units.includes(f)), ...mine]
            if (!now.some(f => f.check !== 'words')) continue
            // Each figure once: the check's own finding on "132 lít" and the model's on its sentence mend one figure.
            const seen = new Set<string>()
            const figures: PlacedFigure[] = [...told].flatMap(([g, fs]) => {
              const block = blocks.findIndex(b => norm(b).includes(norm(g.quote ?? '')))
              return fs.filter(x => !seen.has(`${block}|${x.at}`) && !!seen.add(`${block}|${x.at}`)).map(x => ({ ...x, block }))
            })
            const said = figures.length ? `This is a breed page with no English source: its litres are our conversion of a source's US figure, and the editor was told to name these as keepers here say, from the source's own US figure, a minimum never more than a twentieth under it: ${figuresSaid(figures)}. Those changes are correct, not errors.` : undefined
            const r = await mendPart(d.llm, html, now.map(f => ({ check: f.check, quote: f.quote ?? '', note: noteOf(f, told.get(f)), covers: told.get(f)?.flatMap(x => figureRuns(x.from)), ...(f.check === 'words' && f.fix ? { adds: [f.fix] } : told.get(f)?.length ? { adds: told.get(f)!.map(x => x.to) } : {}) })), { en: p.en?.[field], source: source && names[source]?.name, model: 'opus', metric: METRIC_KINDS.includes(p.kind), ...(said ? { figures: said } : {}) })
            if (typeof r === 'string') { report.skipped.push(`${key} ${field}: ${r}`); continue }
            const next = faq ? parse(r.html).text.trim() : r.html
            // Kept at the bar, leaving out only what a finding asks to go, saying nothing more surely than before (hedges.ts),
            // and a breed page's units with each figure.
            const off = mine.length ? keepsFigures(textOf(before), textOf(next), mine.map(f => f.quote ?? ''), figures) : undefined
            if (r.score < QUALITY_THRESHOLD || r.lost.length || r.unasked.length || r.added.length || r.whole.length || off) { report.notKept.push(`${key} ${field} (${r.score.toFixed(2)}: ${[...(off ? [off] : []), ...r.notes].slice(0, 2).join('; ')})`); continue }
            if (next === before) { report.skipped.push(`${key} ${field}: the rewrite changed nothing`); continue }
            const [sk, ss] = field.startsWith('sections.') ? field.slice('sections.'.length).split(':') : []
            const lines = (h: string) => sentences(h).filter(x => x.sentence).length
            // Every line gone (mendPart, three or fewer): only a source's part can come off the page; a body, an answer or a
            // definition stays held, its sentences for the chief of staff.
            const emptied = !lines(next)
            if (emptied && !(sk && ss)) { report.skipped.push(`${key} ${field}: every sentence would go, and it isn't a part that can come off: held for the chief of staff (${r.gone.join('; ')})`); continue }
            report.gone.push(...r.gone.map(g => `${key} ${field} ${g}`))
            // A part a cut reduces to one line, or a shop's quick facts it had to mend, isn't a part (the chief of staff, 14 Nov
            // 2026: "A part reduced to one line from a dealer's stock list isn't a part", "is dropped, not kept"): off the page in
            // every language, as the sweep takes a dealer's notice off (sweep.ts). One reduced to one line goes with its heading
            // when it's the heading's only text, listed for the chief; a shop's list with more left stays when it is.
            const thin = lines(next) <= 1 && lines(before) > 1
            if (sk && ss && (thin || emptied || (isShop(ss) && sk === 'quickFacts'))) {
              const dir = join(root, 'content', p.kind, p.id)
              const entityFile = join(dir, 'entity.json')
              const raw = await readFile(entityFile, 'utf8')
              const e = JSON.parse(raw) as { sections: { key: string; source: string; html: string }[] }
              const other = e.sections.some(s => s.key === sk && s.source !== ss && s.html.trim() && t.sections?.[`${sk}:${s.source}`]?.trim())
              if (other || thin || emptied) {
                const k = `${sk}:${ss}`
                await writeFile(entityFile, `${JSON.stringify({ ...e, sections: e.sections.filter(s => !(s.key === sk && s.source === ss)) }, null, 2)}\n`)
                for (const f of (await readdir(dir)).filter(f => /^[a-z]{2}\.json$/.test(f) && f !== 'vi.json')) {
                  const l = JSON.parse(await readFile(join(dir, f), 'utf8')) as { sections?: Record<string, string> }
                  if (l.sections && k in l.sections) { delete l.sections[k]; await writeFile(join(dir, f), `${JSON.stringify(l, null, 2)}\n`) }
                }
                delete t.sections![k]
                await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
                changed++
                report.rewritten.push(`${key} ${field} off the page (${emptied ? 'every line went' : thin ? 'one line left' : 'a shop\'s list'}${other ? '' : ', its heading with it: for the chief of staff'})`)
                break
              }
            }
            if (faq) t.faq![Number(faq[1])]!.a = next
            else if (field === 'body') t.body = next
            else if (field === 'definition') t.definition = next
            else t.sections![field.replace(/^sections\./, '')] = next
            // Each part as it's kept, so a later part's failure loses none. The sentences that changed are in metric already
            // (mendPart); nothing else on the page is touched (Astra's read: converting the page changed parts no one read).
            await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
            changed++
            report.rewritten.push(`${key} ${field}${passes.length > 1 && mine.length ? ' units' : ''} (${r.score.toFixed(2)})`)
          }
        })
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
