import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fitFindings, fitKey, fitRules, fitSource, fitText, type FitFinding, type FitState } from './fit'
import { gateChecks, GATE_KINDS, HELD_BY_HAND, type HandHold, type Held } from './gate'
import { loadPages, type Page } from './pages'
import { norm, readable, render } from './reader'
import { doseWaterAt, metricFigures, numberIn, usTankOf } from './round'

/**
 * The units mender: a page the gate holds for units alone, whose saved read of its text as it stands quotes a tank's
 * volume converted from US gallons some other way ("115 lít": 30 gallons to the nearest 5 litres), gets the size a keeper
 * here names (round.ts US_TANKS: "120 lít"). Code, no model, so code checks its work (the chief of staff, 2026-11-11):
 * - it mends only a volume in litres that maps back to a size in the table exactly (usTankOf), quoted by one of the
 *   page's saved units findings; each place the page's text gives that volume is mended, and a US figure in brackets
 *   after it goes with it ("38 lít (10 gallon)" → "40 lít");
 * - a page with a units finding it can't mend that way is left held, as it is, and listed: a range ("75–110 lít"), a
 *   figure in between (470 litres, 125 gallons), inches or degrees ("2,5 cm"), a dose's water ("cho mỗi 38 lít");
 * - each mended part differs from the old only in its figures and their units, each new figure is within a tenth of the
 *   old, and the rules find no units fault left; a page that fails any of these is left held and listed.
 * The gate, last in the run, reads a mended page and lets it out if it passes.
 */
export const UNITS_MEND_FROM = '2026-11-13T08:00:00+07:00'

const UNIT = String.raw`(?:lít|liter|litre|l)(?![\p{L}\p{N}])|ลิตร`
const US = String.raw`gallons?|galon|gal|แกลลอน`
/** A volume in litres, with a US figure in brackets after it if there is one: the figure and its unit. */
const VOLUME = () => new RegExp(String.raw`(?<![\d.,])(\d+(?:[.,]\d+)*)(\s*)(${UNIT})(\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:${US})\s*\))?`, 'giu')
/** A range's other end, before or after, its unit written or not: "75–", "70 lít đến ", "–115". */
const RANGE_BEFORE = /\d(?:\s*(?:lít|liter|litre|ลิตร|l(?![\p{L}\p{N}])))?\s*(?:[–-]|đến|tới|hingga|sampai|ถึง|to)\s*$/iu
const RANGE_AFTER = /^\s*(?:[–-]|đến|tới|hingga|sampai|ถึง|to)\s*\d/iu
/** A dose's water: "cho mỗi 38 lít", "per 38 liter" (round.ts keeps these too). */
const PER = /(?:mỗi|cho|trên|per|setiap|untuk|ต่อ|\/)\s*(?:khoảng\s*)?$/iu
/** A flow, not a tank: "115 lít mỗi giờ", "một tiếng", "lít/giờ", "per hour". Not "một giờ sau" (an hour later), "một tiếng đồng hồ" (for an hour) or "lít/hồ". */
const RATE_AFTER = /^\s*(?:\/\s*(?:h|giờ|tiếng|jam|ชม)(?![\p{L}])|(?:(?:mỗi|một|1)|trong (?:một|1)) (?:giờ|tiếng)(?![\p{L}])(?!\s+(?:sau|nữa|trước|đồng hồ))|per hour|an hour|per jam|sejam|ต่อชั่วโมง)/iu
/** A pump's or a filter's, read with an hour after the volume as a flow whatever follows the hour. */
const FLOW_WORDS = /(?<!\p{L})(?:máy bơm|bơm|lọc|lưu lượng|công suất|pump|filter|flow|pompa|aliran|ปั๊ม|กรอง)(?!\p{L})/iu
const HOUR_AFTER = /^\s*(?:\/\s*|(?:mỗi|một|1|per|an|trong (?:một|1))\s+)?(?:giờ|tiếng|h|jam|hour|ชั่วโมง|ชม)(?![\p{L}])/iu
/** Whether the volume at `at` in `text` is a tank's: not a range's end, a dose's water (doseWaterAt), or a flow. */
const tankAt = (text: string, at: number, end: number) => {
  const sentence = text.slice(0, at).split(/[.;!?\n>]/).at(-1) ?? ''
  const flow = RATE_AFTER.test(text.slice(end)) || (FLOW_WORDS.test(sentence) && HOUR_AFTER.test(text.slice(end)))
  return !PER.test(text.slice(Math.max(0, at - 24), at)) && !doseWaterAt(text, at) && !RANGE_BEFORE.test(text.slice(0, at)) && !RANGE_AFTER.test(text.slice(end)) && !flow
}
/** A metric figure that isn't a volume: a length or a temperature, which only a writer can put right. */
const NOT_VOLUME = /\d\s*(?:cm|mm|ซม|มม|°|độ C)|\d\s*m(?![\p{L}\p{N}])/iu

const figure = (k: number, lang: Page['lang']) => (k >= 1000 ? `${Math.floor(k / 1000)}${lang === 'vi' || lang === 'id' ? '.' : ','}${String(k % 1000).padStart(3, '0')}` : String(k))

/** Each volume in a text, outside HTML tags: its number, where it is, and the text around it. */
function volumes(text: string, lang: Page['lang']) {
  const out: { n: number; at: number; end: number; gallons?: number; all: string; space: string; unit: string }[] = []
  let at = 0
  for (const seg of text.split(/(<[^>]+>)/)) {
    if (!seg.startsWith('<')) {
      for (const m of seg.matchAll(VOLUME())) {
        out.push({ n: numberIn(m[1]!, lang), at: at + m.index, end: at + m.index + m[0].length, all: m[0], space: m[2]!, unit: m[3]!, ...(m[5] ? { gallons: numberIn(m[5], lang) } : {}) })
      }
    }
    at += seg.length
  }
  return out
}

/** Why a units finding can't be mended here, or the volumes it quotes that can. */
function mendOf(f: FitFinding, lang: Page['lang']): { volumes: number[] } | { why: string } {
  const vs = volumes(f.quote, lang)
  if (!vs.length) return NOT_VOLUME.test(f.quote) ? { why: `"${f.quote}": a length or a temperature` } : { volumes: [] }
  if (NOT_VOLUME.test(f.quote.replace(VOLUME(), ''))) return { why: `"${f.quote}": a length or a temperature` }
  for (const v of vs) {
    if (RANGE_BEFORE.test(f.quote.slice(0, v.at)) || RANGE_AFTER.test(f.quote.slice(v.end))) return { why: `"${f.quote}": a range` }
    if (!tankAt(f.quote, v.at, v.end)) return { why: `"${f.quote}": a dose's water or a flow, not a tank` }
    const tank = usTankOf(v.n)
    if (!tank) return { why: `"${v.all}": no US tank size converts to it exactly or to the nearest 5 litres` }
    if (tank[1] === v.n && v.gallons === undefined) return { why: `"${v.all}": already the size a keeper names` }
    if (v.gallons !== undefined && v.gallons !== tank[0]) return { why: `"${v.all}": its gallons aren't the tank its litres convert from` }
  }
  return { volumes: vs.map(v => v.n) }
}

/** A text with each of these volumes as the size a keeper names, where it is a tank's (tankAt). */
function mendText(text: string, lang: Page['lang'], mend: Set<number>): string {
  let out = '', from = 0
  for (const v of volumes(text, lang)) {
    const tank = usTankOf(v.n)
    if (!mend.has(v.n) || !tank || !tankAt(text, v.at, v.end)) continue
    out += `${text.slice(from, v.at)}${figure(tank[1], lang)}${v.space}${v.unit}`
    from = v.end
  }
  return out + text.slice(from)
}

/**
 * The code's check of a mend: the old and new texts are the same once each volume and its unit are taken out, and each new
 * volume is within a tenth of the old one in its place.
 */
export function onlyFigures(old: string, now: string, lang: Page['lang']): boolean {
  const strip = (t: string) => t.replace(VOLUME(), '#')
  const a = volumes(old, lang), b = volumes(now, lang)
  return strip(old) === strip(now) && a.length === b.length && a.every((v, i) => Math.abs(b[i]!.n - v.n) / v.n <= 0.1)
}

/**
 * Whether a mended text has a sentence naming one volume twice that didn't before: "Bể 80 lít là khoảng 75 lít" made
 * "… 80 lít là khoảng 80 lít" says nothing, and needs a writer.
 */
export function namesTwice(old: string, now: string, lang: Page['lang']): boolean {
  const sentences = (t: string) => t.replace(/<[^>]+>/g, '\n').split(/(?<=[.!?])\s+|\n+/)
  const twice = (x: string) => { const ns = volumes(x, lang).map(v => v.n); return new Set(ns).size < ns.length }
  const a = sentences(old)
  return sentences(now).some((x, i) => twice(x) && !twice(a[i] ?? ''))
}

/**
 * What a part was written from, as the repository keeps it: a fish or plant section's English, the research facts
 * behind AquaTome's own sections, an article's or a topic's text for a guide. A video's transcript is kept on one Mac
 * only, so a video guide has none here (undefined), and the code's checks stand alone (the chief of staff, 2026-11-11).
 * A part whose source is kept but empty (a section with no English, no research file) has nothing to mend from: "".
 */
async function writtenFrom(root: string, p: Page, field: string): Promise<string | undefined> {
  const research = async () => ((JSON.parse(await readFile(join(root, 'engine-state/species-research', `${p.id}.json`), 'utf8').catch(() => '{}')) as { facts?: { fact: string }[] }).facts ?? []).map(f => f.fact).join('\n')
  if (p.en) {
    if (field.endsWith(':aquatome')) return research()
    return p.en[field] ?? [...Object.entries(p.en).filter(([k]) => !k.endsWith(':aquatome')).map(([, v]) => v), await research()].join('\n')
  }
  return p.kind === 'guides' && p.origin?.source === 'youtube' ? undefined : fitSource(root, p)
}
/** A source as text: an English section's HTML read as the checker reads it, a research fact as it is. */
const asText = (from: string) => render(from) || from
/** The US tank sizes a source gives in gallons: "a 20-gallon tank", "50 gallons", "5.5 gal". */
const gallonsIn = (text: string) => new Set([...text.matchAll(/(\d+(?:\.\d+)?)[\s-]*(?:US\s+)?gal(?:lon)?s?\b/gi)].map(m => Number(m[1])))

type Lang = Record<string, unknown> & { name: string; held?: Held; body?: string; definition?: string; sections?: Record<string, string>; summary?: string[]; faq?: { q: string; a: string }[] }
/** Where a part the checker reads (fitText) is kept in the page's language file. */
const PATH = (field: string): (string | number)[] => {
  if (field.startsWith('sections.')) return ['sections', field.slice('sections.'.length)]
  return field.split('.').map(x => (/^\d+$/.test(x) ? Number(x) : x))
}
const get = (t: unknown, path: (string | number)[]) => path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)?.[k], t) as string
const set = (t: unknown, path: (string | number)[], v: string) => { const o = get(t, path.slice(0, -1)) as unknown as Record<string | number, string>; o[path.at(-1)!] = v }

export type UnitsMend = { key: string; file: string; changes: { field: string; old: string; now: string }[]; figures: string[] }
export type UnitsMendReport = { mended: UnitsMend[]; left: string[]; waiting?: string }

/**
 * Mends the pages held for units alone, `limit` a run (those named in `first` first, then the longest held), and writes
 * them unless `dryRun`. Before UNITS_MEND_FROM it only waits, but for a dry run.
 */
export async function unitsMend(root: string, o: { limit?: number; first?: readonly string[]; dryRun?: boolean; now?: () => Date } = {}): Promise<UnitsMendReport> {
  const now = (o.now ?? (() => new Date()))()
  if (!o.dryRun && now.getTime() < Date.parse(UNITS_MEND_FROM)) return { mended: [], left: [], waiting: UNITS_MEND_FROM }
  const state = JSON.parse(await readFile(join(root, 'engine-state/_fit.json'), 'utf8').catch(() => '{}')) as FitState
  const byHand = JSON.parse(await readFile(join(root, HELD_BY_HAND), 'utf8').catch(() => '{}')) as Record<string, HandHold>
  const pages = (await loadPages(join(root, 'content'))).filter(p => (GATE_KINDS as readonly string[]).includes(p.kind) && !byHand[`${p.kind}/${p.id}`])
  const held: { p: Page; file: string; t: Lang }[] = []
  for (const p of pages) {
    const file = `content/${p.kind}/${p.id}/${p.lang}.json`
    const t = JSON.parse(await readFile(join(root, file), 'utf8')) as Lang
    if (t.held?.checks.join() === 'units') held.push({ p, file, t })
  }
  const rank = (k: string) => { const i = o.first?.indexOf(k) ?? -1; return i >= 0 ? i : (o.first?.length ?? 0) }
  held.sort((a, b) => rank(fitKey(a.p)) - rank(fitKey(b.p)) || a.t.held!.at.localeCompare(b.t.held!.at) || fitKey(a.p).localeCompare(fitKey(b.p)))
  // A guide's title is its own: a mend that would give it another page's title of its kind leaves it held (the owner's
  // "Duplicated" report stays closed; the chief of staff, 2026-11-11).
  const titles = new Set(pages.map(p => `${p.lang}/${p.kind}/${norm(p.title)}`))
  const report: UnitsMendReport = { mended: [], left: [] }
  for (const { p, file, t } of held) {
    if (report.mended.length >= (o.limit ?? 6)) break
    const key = fitKey(p), e = state[key]
    const leave = (why: string) => { report.left.push(`${key}: ${why}`) }
    if (e?.hash !== fitText(p).hash) { leave('no saved read of its text as it stands (the gate reads it)'); continue }
    const checks = gateChecks(p, e)
    if (!checks.has('units')) continue // nothing left to mend: the gate lets it out, or holds it for harm beside it
    const other = [...checks].filter(c => c !== 'units')
    if (other.length) { leave(`held for ${other.join(', ')} too`); continue }
    const units = fitFindings(p, e).filter(f => f.check === 'units')
    const plans = units.map(f => mendOf(f, p.lang))
    const why = plans.find((x): x is { why: string } => 'why' in x)
    if (why) { leave(why.why); continue }
    const mend = new Set(plans.flatMap(x => ('volumes' in x ? x.volumes : [])))
    if (!mend.size) { leave('its units findings quote no volume'); continue }
    // Where the page keeps what it was written from, that must give the tank in gallons: a figure it gives in litres
    // stays as it gives it ("about 108 litres", made "110" by a translator, is no 29-gallon tank).
    const { parts: read } = fitText(p)
    let unsourced = ''
    for (const [i, f] of units.entries()) {
      const from = await writtenFrom(root, p, read.find(x => x.id === f.part)?.field ?? '')
      const v = plans[i] as { volumes: number[] }
      const missing = from !== undefined ? v.volumes.map(n => usTankOf(n)!).find(([g]) => !gallonsIn(from).has(g)) : undefined
      if (missing) { unsourced = `"${f.quote}": what it was written from gives no ${missing[0]} gallons`; break }
    }
    if (unsourced) { leave(unsourced); continue }
    // Every part the checker reads, mended where it gives one of these volumes.
    // A name a person fixed stays (nameFixed): the rules keep the page held if it still has a units fault.
    const parts = [...(p.nameFixed || t.nameFixed ? [] : [{ field: 'name', text: p.title }]), ...readable(p).map(f => ({ field: f.field, text: f.html })), ...p.lines.map(l => ({ field: l.field, text: l.text }))]
    // In a part whose source the repository keeps, a volume is mended only where that source gives the tank in gallons
    // and not the litres themselves ("Raise the fry in 75 litres" in another section stays).
    const changes: { field: string; old: string; now: string }[] = []
    for (const x of parts) {
      const from = await writtenFrom(root, p, x.field)
      // A part with no source kept mends nothing; a video guide, whose source isn't in the repository, mends all.
      const here = from === undefined ? mend : new Set([...mend].filter(n => gallonsIn(from).has(usTankOf(n)![0]) && !metricFigures(asText(from), 'en').includes(`${n} l`)))
      const n = mendText(x.text, p.lang, here)
      if (n !== x.text) changes.push({ field: x.field, old: x.text, now: n })
    }
    const next: Page = {
      ...p,
      title: changes.find(c => c.field === 'name')?.now ?? p.title,
      fields: p.fields.map(f => ({ ...f, html: changes.find(c => c.field === f.field)?.now ?? f.html })),
      lines: p.lines.map(l => ({ ...l, text: changes.find(c => c.field === l.field)?.now ?? l.text })),
    }
    const left = fitRules(next).filter(f => f.check === 'units').map(f => f.quote)
    if (!changes.length) { leave('none of its volumes is where the page can be mended (a range, a dose\'s water)'); continue }
    if (!changes.every(c => onlyFigures(c.old, c.now, p.lang))) { leave('a mended part would differ in more than its figures'); continue }
    if (changes.some(c => namesTwice(c.old, c.now, p.lang))) { leave('a mended sentence would name one volume twice'); continue }
    if (left.length) { leave(`the rules would still find ${left.join(', ')}`); continue }
    if (changes.some(c => get(t, PATH(c.field)) !== c.old)) { leave('its file isn\'t the text the checker read'); continue }
    const title = changes.find(c => c.field === 'name')?.now
    if (title && titles.has(`${p.lang}/${p.kind}/${norm(title)}`)) { leave(`its title would be another page's: "${title}"`); continue }
    const figures = [...new Set(changes.flatMap(c => volumes(c.old, p.lang).map((v, i) => [v, volumes(c.now, p.lang)[i]!] as const).filter(([a, b]) => a.all !== b.all).map(([a, b]) => `${a.all} -> ${b.all}`)))]
    report.mended.push({ key, file, changes, figures })
    if (title) titles.add(`${p.lang}/${p.kind}/${norm(title)}`)
    if (o.dryRun) continue
    for (const c of changes) set(t, PATH(c.field), c.now)
    await writeFile(join(root, file), `${JSON.stringify(t, null, 2)}\n`)
  }
  return report
}
