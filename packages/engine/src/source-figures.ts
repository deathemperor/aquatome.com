import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WRITTEN_LANGS, type UnitLang } from '@aq/schema'
import { englishOf } from './english'
import { FOOT_LENGTHS, fromF, INCH_SIDES, JOIN, litres, metricFigures, PER, roundConverted, side, sourceGives, TANK, type English } from './round'

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
 * - a page held, AquaTome's own parts, guides and breeds (no English beside them) are left as they are.
 * A run mends at most the pace's language pages, and only while its batches are fewer than the pace allows: the named
 * ones first, then those with a tank's sides (what the chief of staff counted), then the rest; each once
 * (engine-state/_source-figures.json), so a page the gate puts back for a check isn't mended again. The gate, last in the run, reads each as any changed page: a live page
 * worse on a check gets its old text back, one with a fault no rewording fixes is held.
 */
export const SOURCE_FIGURES_STATE = 'engine-state/_source-figures.json'
/**
 * How many language pages a run mends, and how many runs mend at all: the chief of staff sets it after each batch's
 * reads (2026-11-12: 30, one batch, then a line on how many passed and how many were held and for what). A page the gate
 * couldn't read loses its mark (writer-records.ts), so its batch is tried again.
 */
export const SOURCE_FIGURES_PACE = { perRun: 30, batches: 1 }
export type SourceFiguresState = Record<string, { at: string; figures: string[] }>
export type SourceFiguresReport = { mended: { key: string; file: string; figures: string[]; changes: { field: string; old: string; now: string }[] }[]; left: string[]; waiting?: number }

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
      if (PER.test(s.slice(Math.max(0, at - 24), at))) return all
      return ends(all, a, j, b, u, x => String(l.has(x) ? x : one(x, l, y => litres(y) === x) ?? x))
    })
    .replace(LENGTH, (all, a: string, u: string, at: number, s: string) => {
      const x = Number(a)
      if (cm.has(x) || !TANK.test(s.slice(Math.max(0, at - 48), at))) return all
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
  const out = text.split(/(<[^>]+>)/).map((seg, i) => (i % 2 ? seg : mend(seg))).join('')
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

/** `limit`: language pages this run, in place of the pace (a dry run, or by hand). */
export async function sourceFigures(root: string, o: { limit?: number; first?: readonly string[]; dryRun?: boolean; now?: () => Date } = {}): Promise<SourceFiguresReport> {
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
  const report: SourceFiguresReport = { mended: [], left: [] }
  const batches = new Set(Object.values(state).map(x => x.at)).size
  const limit = o.limit ?? (batches < SOURCE_FIGURES_PACE.batches ? SOURCE_FIGURES_PACE.perRun : 0)
  const plans: { key: string; file: string; t: Translation; raw: string; parts: ReturnType<typeof partsOf>; changes: { field: string; old: string; now: string }[]; figures: string[]; sides: boolean }[] = []
  for (const { key, file, t, raw, en } of pages) {
    if (state[key]) continue // once a page: one the gate put back for a check has had its go
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
    if (t.held) { report.left.push(`${key}: held, left as it is`); continue }
    if (why.length) { report.left.push(`${key}: ${why.join('; ')}`); continue }
    plans.push({ key, file, t, raw, parts, changes, figures: [...new Set(figures)], sides: figures.some(f => /\d\s*[×x]\s*\d/.test(f)) })
  }
  plans.sort((a, b) => rank(a.key) - rank(b.key) || Number(b.sides) - Number(a.sides) || a.key.localeCompare(b.key))
  for (const { key, file, t, raw, parts, changes, figures } of plans.slice(0, limit)) {
    report.mended.push({ key, file, figures, changes })
    if (o.dryRun) continue
    for (const c of changes) parts.find(x => x.field === c.field)!.set(c.now)
    await writeFile(join(root, file), `${JSON.stringify(t, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    state[key] = { at, figures }
  }
  report.waiting = plans.length - report.mended.length
  if (!o.dryRun && report.mended.length) await mkdir(join(stateFile, '..'), { recursive: true })
  if (!o.dryRun && report.mended.length) await writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  return report
}
