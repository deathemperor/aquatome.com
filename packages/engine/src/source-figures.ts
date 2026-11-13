import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WRITTEN_LANGS, type UnitLang } from '@aq/schema'
import { englishOf } from './english'
import { putBackFile } from './gate'
import { FOOT_LENGTHS, fromF, givesDose, INCH_SIDES, JOIN, litres, metricFigures, PER, roundConverted, side, sourceGives, type English } from './round'

/**
 * The source's own figures put back (the chief of staff, 2026-11-12). Until then the rounding (round.ts) rounded a
 * figure a fish or plant page's English gives in metric itself: Seriously Fish's "60 × 38 × 30 cm (24 × 15 × 12 in)"
 * became "60 × 40 × 30 cm", beside the source's "68 litres" for 60 × 38 × 30. The 11 Nov rule keeps such a figure as
 * the source gives it, and the rounding now does too. Code, no model, so code checks its work:
 * - in a source's part with its English beside it, or a line of the page's own (a summary point, a question) against
 *   all of it, a tank's sides, litres, a tank's length or °C the old rounding made from a figure the English gives go
 *   back to the English's: one English figure the old rounding gives this one from, and the English not giving the
 *   rounded figure itself, or it stays;
 * - the old rounding gives the part's text as it is from the mended one, word for word, so nothing else changes; the
 *   rounding as it is now leaves the mended text as it is; and each figure put back is one the English gives
 *   (sourceGives, the reader-fit check's reading);
 * - litres in a part that gives a dose anywhere stay (any of them may be a dose's water), and so does a length that
 *   isn't plainly a tank's ("bể dài 120 cm" is; "trong bể, cá dài 120 cm" isn't); only the text between tags is read,
 *   never a tag's attributes;
 * - a page held, AquaTome's own parts, guides and breeds (no English beside them) are left as they are.
 * A run mends at most the pace's language pages (SOURCE_FIGURES_PACE): the named ones first, then those with a tank's
 * sides (what the chief of staff counted), then the rest; each once
 * (engine-state/_source-figures.json): a page is mended whole, every kind in one pass, and one the gate gives its old
 * text back isn't mended again but listed with the checks it failed, for the chief of staff's word (2026-11-12). The
 * gate, last in the run, reads each as any changed page: a live page worse on a check gets its old text back, one with a
 * fault no rewording fixes is held.
 */
export const SOURCE_FIGURES_STATE = 'engine-state/_source-figures.json'
/**
 * The pace (the chief of staff, 2026-11-12): the first 30 language pages; once a cycle has published them (30 marks on
 * GitHub's main), 60 a cycle, without asking. Marks this checkout made and hasn't published count against the run, so a
 * second run before a publish mends nothing more. Only the Mac's photos part runs it (engine-cycle.sh), so a cycle is
 * one run.
 * It stops by itself, and says so, when in any batch (the pages first marked in one run) more than one page in ten is
 * held or given its old text back for something other than its figures (`units`); then it mends nothing until the chief
 * of staff's word, given by taking `stopped` out of SOURCE_FIGURES_BATCHES. A page the gate couldn't read loses its mark
 * (writer-records.ts) and is tried again, staying in its own batch, and in the first 30 within their 30; it isn't counted,
 * held or not (the chief of staff, 2026-11-12: an unread page is not a held page). And a cycle whose gate can't read
 * mends nothing: the run first asks the gate's model one short question (`reader`), and mends nothing if it gets no answer.
 */
export const SOURCE_FIGURES_PACE = { first: 30, perRun: 60, stopAbove: 0.1 }
/**
 * Each batch's pages and what the gate made of each, recorded once, right after the gate of the cycle that mended it
 * (`recordSourceFigures`), so a hold that comes later for something else, or by hand, isn't counted. The gate puts back
 * the marks of pages it couldn't read, never this file, so a batch keeps all its pages.
 */
export const SOURCE_FIGURES_BATCHES = 'engine-state/_source-figures-batches.json'
export type SourceFiguresState = Record<string, { at: string; figures: string[] }>
/** `size`: the pages the batch counts, when more than its keys (a batch rebuilt from old marks, adopt). */
export type SourceFiguresBatch = { at: string; keys: string[]; outcomes: Record<string, string>; wrong: string[]; size?: number }
export type SourceFiguresBook = { batches: SourceFiguresBatch[]; stopped?: { at: string; why: string } }
export type SourceFiguresReport = {
  mended: { key: string; file: string; figures: string[]; changes: { field: string; old: string; now: string }[] }[]
  /** Not mended: held, or a part that fails a check above. */
  left: string[]
  /** Mended once and given its old text back by the gate: not mended again. */
  putBack: string[]
  /** Pages still to mend, past this run's pace. */
  waiting?: number
  /** Set when a batch went wrong for more than the pace allows: the mender mends nothing until the chief's word. */
  stopped?: string
  /** Set when the marks on GitHub's main couldn't be read: the mender mends nothing. */
  noMain?: string
  /** Set when the gate's model gave no answer (the accounts out): the mender mends nothing, as the gate couldn't read. */
  noReader?: string
}

type Lang = UnitLang
const dec = (lang: Lang) => (lang === 'th' || lang === 'ms' ? '.' : ',')
/** The English's figures of one kind, as numbers: "38 cm", "22.8 c". */
const given = (en: string, kind: string) => new Set(metricFigures(en, 'en').filter(x => x.endsWith(` ${kind}`)).map(x => Number(x.slice(0, -kind.length - 1))))
/** A tank's sides as the English gives them, whole centimetres: [60, 38, 30]. */
const ENGLISH_SIDES = /(?<![\d.,])(\d{2,3})\s*[×x*∗]\s*(\d{2,3})(?:\s*[×x*∗]\s*(\d{2,3}))?(?![\d.,])\s*-?\s*(?:cm|centimet(?:er|re)s?)(?![\p{L}\p{N}])/giu
const englishSides = (en: string) => [...en.matchAll(ENGLISH_SIDES)].map(m => [m[1], m[2], m[3]].filter((v): v is string => !!v).map(Number))

/** What the old rounding writes, as it wrote it: whole figures (round.ts roundConverted's own patterns). */
const SIDES = /(?<![\d.,])(\d{2,3})(\s*[×x]\s*)(\d{2,3})(?:(\s*[×x]\s*)(\d{2,3}))?(?![\d.,])(\s*(?:cm|ซม\.))/gu
const LITRES = new RegExp(String.raw`(?<![\d.,])(\d{2,3})(?:(${JOIN})(\d{2,3}))?(?![\d.,])(\s*(?:lít|liter|litre|ลิตร|L|l)(?![\p{L}\p{N}]))`, 'gu')
const LENGTH = /(?<![\d.,×x]\s?)(\d{2,3})(?![\d.,])(\s*(?:cm|ซม\.))(?!\s*[×x])/gu
/**
 * Just before a length, what makes it a tank's: "bể dài (ít nhất)", "chiều dài bể tối thiểu:", "akuarium (sepanjang)",
 * "ตู้ขนาด", "ตู้ยาว". A tank named earlier in the sentence isn't enough ("trong bể, cá dài 120 cm" is the fish).
 */
const TANK_LENGTH = /(?:(?:bể|hồ|akuarium|tangki|ตู้)(?:\s*(?:cá|ปลา))?(?:\s*(?:cần|phải|harus|ต้อง))?(?:\s*(?:dài|có chiều dài|sepanjang|panjang(?:nya)?|berukuran|ขนาด|ยาว))?|chiều dài (?:của )?bể|panjang akuarium|ความยาวตู้)(?:\s*(?:tối thiểu|ít nhất|minimal|minimum|setidaknya|sekurang-kurangnya|อย่างน้อย))?\s*[:：]?\s*$/iu
/** HTML's tags, a quoted ">" in an attribute inside its tag: what is between them is the text. */
const TAGS = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/
const TEMP = new RegExp(String.raw`(?<![\d.,])(\d{1,2})(?:(${JOIN})(\d{1,2}))?(?![\d.,])(\s*(?:°\s?C|độ C))`, 'gu')

/** The one figure the old rounding made `n` from, among the English's of its kind: none, or more than one, is no mend. */
const one = (n: number, from: Iterable<number>, made: (x: number) => boolean) => {
  const c = [...new Set([...from].filter(x => x !== n && made(x)))]
  return c.length === 1 ? c[0] : undefined
}

/**
 * A text's figures the old rounding made from its English's, put back: the text and each figure as "old → new". The
 * text as it was when nothing is.
 */
export function mendFigures(text: string, en: string, lang: Lang): { text: string; figures: string[] } {
  const cm = given(en, 'cm'), l = given(en, 'l'), c = given(en, 'c')
  const sides = englishSides(en)
  const dose = givesDose(text)
  const figures: string[] = []
  // A figure or a range's ends put back; what is recorded is what changed, a range whole when both ends did ("60–80 lít"
  // → "57–76 lít"), one end alone when one did ("tháng 1 đến 34°C": only "34°C" was a temperature).
  const ends = (all: string, a: string, j: string | undefined, b: string | undefined, u: string, back: (x: number) => string) => {
    const [na, nb] = [back(Number(a)), b ? back(Number(b)) : undefined]
    const now = `${na}${j && b ? `${j}${nb}` : ''}${u}`
    if (now === all) return all
    if (!b || (na !== a && nb !== b)) figures.push(`${all.trim()} → ${now.trim()}`)
    else if (na !== a) figures.push(`${a}${u.trimEnd()} → ${na}${u.trimEnd()}`)
    else figures.push(`${b}${u.trimEnd()} → ${nb}${u.trimEnd()}`)
    return now
  }
  const mend = (seg: string) => seg
    .replace(SIDES, (all, a: string, x1: string, b: string, x2: string | undefined, z: string | undefined, u: string) => {
      const ns = [a, b, z].filter((v): v is string => !!v).map(Number)
      if (sides.some(g => g.join() === ns.join())) return all
      const from = [...new Map(sides.filter(g => g.length === ns.length && g.some(n => INCH_SIDES.has(n)) && g.every((n, i) => side(n) === ns[i])).map(g => [g.join(), g])).values()]
      if (from.length !== 1) return all
      const [ra, rb, rc] = from[0]!
      const now = `${ra}${x1}${rb}${z ? `${x2}${rc}` : ''}${u}`
      if (now !== all) figures.push(`${all.trim()} → ${now.trim()}`)
      return now
    })
    .replace(LITRES, (all, a: string, j: string | undefined, b: string | undefined, u: string, at: number, s: string) => {
      if (dose || PER.test(s.slice(Math.max(0, at - 24), at))) return all
      return ends(all, a, j, b, u, x => String(l.has(x) ? x : one(x, l, y => litres(y) === x) ?? x))
    })
    .replace(LENGTH, (all, a: string, u: string, at: number, s: string) => {
      const x = Number(a)
      if (cm.has(x) || !TANK_LENGTH.test(s.slice(Math.max(0, at - 40), at))) return all
      const y = one(x, cm, n => FOOT_LENGTHS.has(n) && side(n) === x)
      if (y === undefined) return all
      const now = `${y}${u}`
      figures.push(`${all.trim()} → ${now.trim()}`)
      return now
    })
    .replace(TEMP, (all, a: string, j: string | undefined, b: string | undefined, u: string) => ends(all, a, j, b, u, x => {
      if (c.has(x)) return String(x)
      // A °C a whole °F gives, to one decimal: what the old rounding took to whole degrees.
      const y = one(x, c, d => !Number.isInteger(d * 2) && Math.abs(d * 10 - Math.round(d * 10)) < 1e-9 && fromF(d) && Math.round(d) === x)
      return y === undefined ? String(x) : String(y).replace('.', dec(lang))
    }))
  const out = text.split(TAGS).map((seg, i) => (i % 2 ? seg : mend(seg))).join('')
  return { text: out, figures }
}

/**
 * A part mended, or why not: the old rounding gives the text as it is from the mended one; the rounding as it is now
 * leaves the mended one; each figure put back is one the English gives.
 */
export function mendPart(text: string, en: string, lang: Lang): { text: string; figures: string[] } | { why: string } | undefined {
  const m = mendFigures(text, en, lang)
  if (m.text === text) return undefined
  if (roundConverted(m.text, lang) !== text) return { why: 'the old rounding doesn\'t give its text back from the mended one' }
  if (roundConverted(m.text, lang, en) !== m.text) return { why: 'the rounding would change the mended text' }
  const bad = m.figures.map(f => f.split(' → ')[1]!).find(f => !sourceGives(f, en, lang))
  if (bad) return { why: `"${bad}" isn't a figure its English gives` }
  return m
}

type Translation = { held?: unknown; sections?: Record<string, string>; summary?: string[]; faq?: { q: string; a: string }[] }

/** A page's parts with the English each reads (round.ts roundPage): a source's part its own, a line of the page's all. */
function partsOf(t: Translation, en: English) {
  const out: { field: string; text: string; en: string; set: (s: string) => void }[] = []
  for (const [k, v] of Object.entries(t.sections ?? {})) {
    if (k.startsWith('references:') || k.endsWith(':aquatome') || en.sections[k] === undefined) continue
    out.push({ field: `sections.${k}`, text: v, en: en.sections[k]!, set: s => { t.sections![k] = s } })
  }
  for (const [i, v] of (t.summary ?? []).entries()) out.push({ field: `summary.${i}`, text: v, en: en.all, set: s => { t.summary![i] = s } })
  for (const [i, f] of (t.faq ?? []).entries()) {
    out.push({ field: `faq.${i}.q`, text: f.q, en: en.all, set: s => { f.q = s } })
    out.push({ field: `faq.${i}.a`, text: f.a, en: en.all, set: s => { f.a = s } })
  }
  return out
}

const ofKey = (key: string) => {
  const [lang, kind, id] = key.split('/')
  return { lang: lang as Parameters<typeof putBackFile>[0]['lang'], kind: kind as Parameters<typeof putBackFile>[0]['kind'], id: id! }
}
/** Checks a page failed that aren't about its figures. */
const notFigures = (checks: readonly string[] | undefined) => (checks ?? []).filter(c => c !== 'units')

const readJson = async <T>(file: string, empty: T): Promise<T> => JSON.parse(await readFile(file, 'utf8').catch(() => JSON.stringify(empty))) as T
const writeJson = async (file: string, v: unknown) => {
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, `${JSON.stringify(v, null, 1)}\n`)
}
/** The marks on GitHub's main, or undefined when git can't say. */
function marksOnMain(root: string): SourceFiguresState | undefined {
  try {
    return JSON.parse(execFileSync('git', ['show', `origin/main:${SOURCE_FIGURES_STATE}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 })) as SourceFiguresState
  } catch {
    try { execFileSync('git', ['rev-parse', '--verify', '-q', 'origin/main'], { cwd: root, stdio: 'ignore' }) } catch { return undefined }
    return {} // main is there, without the file: nothing marked yet
  }
}
/**
 * Marks from before the batches were kept, in a batch of their run's. That run (12 Nov 2026) mended the first 30, and a
 * page the gate couldn't read lost its mark, so a batch rebuilt with no batches kept yet counts at least 30.
 */
function adopt(book: SourceFiguresBook, state: SourceFiguresState): boolean {
  const known = new Set(book.batches.flatMap(b => b.keys))
  const orphans = Object.entries(state).filter(([k]) => !known.has(k))
  const fresh = !book.batches.length
  for (const [key, { at }] of orphans) {
    const b = book.batches.find(x => x.at === at) ?? book.batches[book.batches.push({ at, keys: [], outcomes: {}, wrong: [] }) - 1]!
    b.keys.push(key)
  }
  if (fresh) for (const b of book.batches) b.size = Math.max(b.keys.length, SOURCE_FIGURES_PACE.first)
  book.batches.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return orphans.length > 0
}

/**
 * What the gate made of each page of a batch not recorded yet, once, for the pages `gated` says the gate has answered.
 * A page the gate couldn't read since it was mended (its put-back `unread`, after its mark or, the mark put back, after
 * its batch) isn't counted, held or not: the gate holds such a page for its old text's own fault, or for harm it found in
 * another language, never for this mend (the chief of staff, 2026-11-12: an unread page is not a held page). It waits to
 * be tried again. A held page is held, whether or not it kept its mark. One still marked has a put-back written after its
 * mark, or passed. The stop
 * is set when a batch's pages counted against it first go past one in ten, and stays until the chief of staff's word takes
 * it out.
 */
/** A put-back written at or after `from`: the gate writes its time to the second (gate.ts), a mark and a batch to the millisecond. */
const since = (back: string, from: string) => Date.parse(back) >= Math.floor(Date.parse(from) / 1000) * 1000
async function recordInto(root: string, book: SourceFiguresBook, state: SourceFiguresState, at: string, gated: (key: string) => boolean): Promise<string[]> {
  const recorded: string[] = []
  for (const b of book.batches) {
    const before = b.wrong.length
    for (const key of b.keys) {
      if (b.outcomes[key] !== undefined || !gated(key)) continue
      const mark = state[key]
      const k = ofKey(key)
      const t = await readJson<{ held?: { checks?: string[] } }>(join(root, 'content', k.kind, k.id, `${k.lang}.json`), {})
      if (!t.held && !mark) continue
      const back = await readJson<{ at?: string; checks?: string[]; unread?: boolean }>(join(root, putBackFile(k)), {})
      const answer = !!mark && !!back.at && since(back.at, mark.at)
      if (back.unread && back.at && since(back.at, mark?.at ?? b.at)) continue
      let outcome = 'passed'
      let wrong = false
      if (t.held) {
        const checks = t.held.checks ?? []
        outcome = `held${checks.length ? ` for ${checks.join(', ')}` : ''}`
        wrong = !checks.length || notFigures(checks).length > 0
      } else if (answer) {
        outcome = `given its old text back${back.checks?.length ? ` for ${back.checks.join(', ')}` : ''}`
        wrong = notFigures(back.checks).length > 0
      }
      b.outcomes[key] = outcome
      if (wrong) b.wrong.push(key)
      recorded.push(`${key}: ${outcome}`)
    }
    const size = b.size ?? b.keys.length
    const allowed = size * SOURCE_FIGURES_PACE.stopAbove
    if (before <= allowed && b.wrong.length > allowed) {
      const why = `the batch of ${b.at}: ${b.wrong.length} of ${size} pages: ${b.wrong.map(k => `${k} ${b.outcomes[k]}`).join('; ')}`
      book.stopped = book.stopped ? { ...book.stopped, why: `${book.stopped.why}. And ${why}` } : { at, why }
    }
  }
  return recorded
}

/** Right after the gate: what it made of each page mended (recordInto). A dry run writes nothing. */
export async function recordSourceFigures(root: string, o: { now?: () => Date; dryRun?: boolean } = {}): Promise<{ recorded: string[]; stopped?: string }> {
  const at = (o.now ?? (() => new Date()))().toISOString()
  const state = await readJson<SourceFiguresState>(join(root, SOURCE_FIGURES_STATE), {})
  const bookFile = join(root, SOURCE_FIGURES_BATCHES)
  const book = await readJson<SourceFiguresBook>(bookFile, { batches: [] })
  const adopted = adopt(book, state)
  const stopped = book.stopped
  const recorded = await recordInto(root, book, state, at, () => true)
  if (!o.dryRun && (adopted || recorded.length || book.stopped !== stopped)) await writeJson(bookFile, book)
  return { recorded, ...(book.stopped ? { stopped: book.stopped.why } : {}) }
}

/**
 * `limit`: language pages this run, in place of the pace (a dry run, or by hand); it never passes the stop or an unread
 * main but in a dry run. `onMain`: the marks on GitHub's main, read from git when not given.
 */
export async function sourceFigures(root: string, o: { limit?: number; first?: readonly string[]; dryRun?: boolean; now?: () => Date; onMain?: SourceFiguresState; reader?: () => Promise<string | undefined> } = {}): Promise<SourceFiguresReport> {
  const at = (o.now ?? (() => new Date()))().toISOString()
  const stateFile = join(root, SOURCE_FIGURES_STATE)
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as SourceFiguresState
  const pages: { key: string; file: string; t: Translation; raw: string; en: English }[] = []
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const entity = await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8').catch(() => null)
      if (!entity) continue
      const en = englishOf((JSON.parse(entity) as { sections?: { key: string; source: string; html: string }[] }).sections ?? [])
      for (const lang of WRITTEN_LANGS) {
        const file = `content/${kind}/${id}/${lang}.json`
        const raw = await readFile(join(root, file), 'utf8').catch(() => null)
        if (raw) pages.push({ key: `${lang}/${kind}/${id}`, file, t: JSON.parse(raw) as Translation, raw, en })
      }
    }
  }
  const rank = (k: string) => { const i = o.first?.indexOf(k) ?? -1; return i >= 0 ? i : (o.first?.length ?? 0) }
  const report: SourceFiguresReport = { mended: [], left: [], putBack: [] }
  const bookFile = join(root, SOURCE_FIGURES_BATCHES)
  const book = await readJson<SourceFiguresBook>(bookFile, { batches: [] })
  let bookChanged = adopt(book, state)
  const onMain = o.onMain ?? marksOnMain(root)
  if (!onMain) report.noMain = `couldn't read ${SOURCE_FIGURES_STATE} on origin/main`
  // A batch not recorded yet (old marks, or a record step that failed) is recorded first, for the pages a published
  // cycle's gate has answered (marks on main, and holds), so a batch that went wrong stops this run before it mends.
  const stoppedBefore = book.stopped
  if ((await recordInto(root, book, state, at, k => !state[k] || !!onMain?.[k])).length || book.stopped !== stoppedBefore) bookChanged = true
  if (book.stopped) report.stopped = book.stopped.why
  const pace = () => {
    if (!onMain) return 0
    const published = Object.keys(onMain).length
    const unpublished = Object.keys(state).filter(k => !onMain[k]).length
    return Math.max(0, (published < SOURCE_FIGURES_PACE.first ? SOURCE_FIGURES_PACE.first - published : SOURCE_FIGURES_PACE.perRun) - unpublished)
  }
  // The stop and an unread main hold whatever the limit; only a dry run looks past them.
  let limit = !o.dryRun && (report.stopped || report.noMain) ? 0 : (o.limit ?? (report.stopped ? 0 : pace()))
  const batched = new Set(book.batches.flatMap(b => b.keys))
  const plans: { key: string; file: string; t: Translation; raw: string; parts: ReturnType<typeof partsOf>; changes: { field: string; old: string; now: string }[]; figures: string[]; sides: boolean }[] = []
  for (const { key, file, t, raw, en } of pages) {
    const lang = key.split('/')[0] as Lang
    const changes: { field: string; old: string; now: string }[] = []
    const figures: string[] = []
    const why: string[] = []
    const parts = partsOf(t, en)
    for (const x of parts) {
      const m = mendPart(x.text, x.en, lang)
      if (!m) continue
      if ('why' in m) { why.push(`${x.field}: ${m.why}`); continue }
      changes.push({ field: x.field, old: x.text, now: m.text })
      figures.push(...m.figures)
    }
    if (!changes.length && !why.length) continue
    // Once a page, no loop: one mended before whose text has the old figures again is one the gate gave its old text
    // back, and it waits for the chief of staff's word, listed with the checks it failed (engine-state/put-back/). A
    // page the gate couldn't read has lost its mark (writer-records.ts), and is tried again.
    if (state[key]) {
      const back = JSON.parse(await readFile(join(root, putBackFile(ofKey(key))), 'utf8').catch(() => '{}')) as { checks?: string[] }
      report.putBack.push(`${key}: the gate gave it its old text back${back.checks?.length ? ` for ${back.checks.join(', ')}` : ''}; waits for the chief of staff's word`)
      continue
    }
    if (t.held) { report.left.push(`${key}: held, left as it is`); continue }
    if (why.length) { report.left.push(`${key}: ${why.join('; ')}`); continue }
    plans.push({ key, file, t, raw, parts, changes, figures: [...new Set(figures)], sides: figures.some(f => /\d\s*[×x]\s*\d/.test(f)) })
  }
  plans.sort((a, b) => rank(a.key) - rank(b.key) || Number(b.sides) - Number(a.sides) || a.key.localeCompare(b.key))
  // A cycle whose gate can't read mends nothing: what it mended would get its old text back unread (the chief of staff,
  // 2026-11-12). Asked only when there is something to mend; a dry run asks nothing.
  if (limit > 0 && plans.length && !o.dryRun && o.reader) {
    const no = await o.reader()
    if (no) { report.noReader = no; limit = 0 }
  }
  for (const { key, file, t, raw, parts, changes, figures } of plans.slice(0, limit)) {
    report.mended.push({ key, file, figures, changes })
    if (o.dryRun) continue
    for (const c of changes) parts.find(x => x.field === c.field)!.set(c.now)
    await writeFile(join(root, file), `${JSON.stringify(t, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    state[key] = { at, figures }
  }
  report.waiting = plans.length - report.mended.length
  if (o.dryRun) return report
  // A page tried again (the gate couldn't read it) stays in its own batch; the order that chose it first brings it first.
  const fresh = report.mended.map(m => m.key).filter(k => !batched.has(k))
  if (fresh.length) { book.batches.push({ at, keys: fresh, outcomes: {}, wrong: [] }); bookChanged = true }
  if (report.mended.length) await writeJson(stateFile, Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))))
  if (bookChanged) await writeJson(bookFile, book)
  return report
}
