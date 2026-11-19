import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, toMetric, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import { machine, type Machine } from './ceiling'
import type { Llm } from './claude'
import { FIT_TITLE, givesDose, type FitFinding } from './fit'
import type { Mend } from './gate'
import { holding, inline, words } from './mend'
import type { Page } from './pages'
import { VI_STYLE as STYLE } from './phrases'
import { norm, render } from './reader'
import { logReviews } from './review-log'
import { roundConverted } from './round'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { blockOf, plain, quoted, sentences, splice, type Piece } from './sentences'
import { setHold } from './video-hold'
import { reviewDraft, type WriteOpts, type YouTube } from './youtube'

/** What the editor is told: to write again only the numbered sentences, for a reader in Vietnam, and how to answer. */
const MEND = readFileSync(new URL('./prompts/video-mend.md', import.meta.url), 'utf8')
/** What the mender's editor is told to do, said to its reviewer: a foreign price turned into the comparison it makes is a fact kept (the Writing Lead's ruling, 2026-11-11). */
const REVIEW_NOTE = readFileSync(new URL('./prompts/video-mend-review.md', import.meta.url), 'utf8')

/**
 * A dose that is the video's own tank's, not advice ("bể này dùng khoảng 4 nắp", "ở bể 60 lít này là khoảng 3 ml"): the
 * editor drops its figure and its brand for the label. Only a sentence that names the tank and, besides that name and the
 * dose, has no figure, no size, no rate ("cho", "thì", "trên", "từ", "theo", "per", "/", "mỗi" but before a time), no
 * class or count of tanks ("như", "những", "các", "mọi", "nào", "loại", "kiểu", "cỡ", "mấy", "dạng", "tất cả", "bất kỳ",
 * "không chỉ", "hai bể"), no other tank with a figure ("bể 500 ml") and no CO2 or ppm. Anything else is advice, or may be,
 * and waits for a person (the chief of staff, 14 Nov 2026; Grok's reads). Unsure, it waits.
 */
const SIZE_UNIT = '(?:lít|litres?|liters?|l|cm|centimet|centimét|mm|m|mét|feet|ft|foot|inch(?:es)?|in|gallons?|gal|galông|galon)'
const DOSE_WORDS = 'ml|mililít|mililit|cc|mg|kg|gam|gram|grams|gr|g|ppm|gói|viên|thìa|muỗng|giọt|nắp|cốc|chén|chai|sachets?|tablets?|butir|caps?|scoops?|drops?|teaspoons?|tablespoons?|tsp|tbsp|pumps?'
const NUMBER_WORDS = 'một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|mười|mươi|trăm|linh|lẻ|nửa|rưỡi'
const OWN_TANK = new RegExp(`(?<![\\p{L}])(?:bể(?:\\s+(?:dài\\s+)?\\d[\\d.,]*\\s*${SIZE_UNIT})?\\s+này|bể ở đây|bể mình|bể của mình|bể trong video|bể mẫu|lần này|hôm đó)(?![\\p{L}])`, 'iu')
const NOT_OWN = new RegExp(`(?<![\\p{L}])(?:cho|thì|trên|từ|theo|per|như|những|các|mọi|nào|loại|kiểu|cỡ|mấy|dạng|tất cả|bất kỳ|bất cứ|không chỉ|co2|co₂|ppm|mỗi(?!\\s+(?:ngày|tuần|tháng|lần|sáng|tối|buổi|đêm|giờ)(?![\\p{L}]))|(?:\\d[\\d.,]*|${NUMBER_WORDS})\\s+bể)(?![\\p{L}])|\\/`, 'iu')
/** Another tank with a figure, beside the one the sentence names ("bể 500 ml châm 2 nắp"). */
const OTHER_TANK = new RegExp(`(?<![\\p{L}])bể\\s+(?:\\d|(?:${NUMBER_WORDS})(?![\\p{L}]))`, 'iu')
const DOSE_AMOUNT = new RegExp(`(?<![\\p{L}\\p{N}])(?:\\d[\\d.,–-]*|${NUMBER_WORDS})\\s*(?:cái\\s+)?(?:${DOSE_WORDS})(?![\\p{L}])`, 'giu')
const SIZE_WORD = new RegExp(`(?<![\\p{L}])${SIZE_UNIT}(?![\\p{L}])`, 'iu')
const NUMBER_WORD = new RegExp(`^(?:${NUMBER_WORDS})$`, 'u')
const DOSE_UNIT = new RegExp(`^(?:${DOSE_WORDS})$`, 'u')
/** A size's unit, as a word on its own: what a number in words before it is a figure of ("mười lít"). */
const SIZE_UNIT_WORD = new RegExp(`^${SIZE_UNIT}$`, 'iu')
/** An amount written in words in a dose's unit ("hai nắp"), which `givesDose` (digits only) doesn't see. */
const WORD_DOSE = (s: string) => words(s).some((w, i, all) => NUMBER_WORD.test(w) && DOSE_UNIT.test((all[i + 1] === 'cái' ? all[i + 2] : all[i + 1]) ?? ''))
export const ownTankDose = (sentence: string) => {
  if (!(givesDose(sentence) || WORD_DOSE(sentence)) || !OWN_TANK.test(sentence) || NOT_OWN.test(sentence)) return false
  const named = sentence.replace(OWN_TANK, ' ')
  if (OTHER_TANK.test(named)) return false
  const rest = named.replace(DOSE_AMOUNT, ' ')
  return !/\d/.test(rest) && !SIZE_WORD.test(rest)
}
/** The label line a dropped dose leaves, in the words keepers write (the Writing Lead, 14 Nov 2026). */
export const LABEL_DOSE = 'liều theo hướng dẫn trên bao bì'
const isFigure = (w: string) => /^[.,-]?[\d½¼¾⅓⅔⅛]/u.test(w)
/**
 * Each figure with the word after it, its unit, as often as the text has it. A percent is its figure's ("30%"), "60 x
 * 38" is "60 × 38", "4 cái nắp" is "4 nắp", "½" is a figure ("½nắp" too), and a number in words, one word or several,
 * counts before a dose's or a size's unit ("hai mươi nắp", "mười lít") (Grok's reads).
 */
function figures(text: string): Map<string, number> {
  const w = words(text.replace(/(\d)\s*%/gu, '$1 phầntrăm').replace(/(\d)\s*[×xX*]\s*(?=\d)/gu, '$1 ').replace(/([½¼¾⅓⅔⅛])(?=\p{L})/gu, '$1 ')
    // A rate's "/giờ" stays with its unit ("300 lít/giờ" isn't "300 lít").
    .replace(/(\p{L})\s*\/\s*(\p{L}+)/gu, '$1 trên$2'))
  const m = new Map<string, number>()
  const add = (k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const after = (j: number) => (w[j] === 'cái' ? w[j + 1] : w[j])
  const isUnit = (u?: string) => !!u && (DOSE_UNIT.test(u) || SIZE_UNIT_WORD.test(u))
  // What follows a unit and is the figure's: a half ("10 lít rưỡi") or a rate ("lít/giờ").
  const tail = (j: number) => (w[j] === 'rưỡi' || w[j]?.startsWith('trên') ? ` ${w[j]}` : '')
  w.forEach((x, i) => {
    if (NUMBER_WORD.test(x)) {
      if (NUMBER_WORD.test(w[i - 1] ?? '')) return
      // "lít rưỡi", a litre and a half, with no number before it.
      if (x === 'rưỡi' && isUnit(w[i - 1]) && !isFigure(w[i - 2] ?? '') && !NUMBER_WORD.test(w[i - 2] ?? '')) return void add(`${w[i - 1]} rưỡi`)
      let j = i
      while (NUMBER_WORD.test(w[j] ?? '')) j++
      let k = j
      // A range in words takes the unit after it: "từ mười đến hai mươi lít" is ten litres too.
      if (/^(?:đến|tới|hay|hoặc)$/u.test(w[k] ?? '') && NUMBER_WORD.test(w[k + 1] ?? '')) for (k++; NUMBER_WORD.test(w[k] ?? ''); k++);
      const u = after(k)
      if (isUnit(u)) add(`${w.slice(i, j).join(' ')} ${u}${tail(w[k] === 'cái' ? k + 2 : k + 1)}`)
      return
    }
    if (!isFigure(x)) return
    const at = w[i + 1] === 'cái' ? i + 2 : i + 1
    const next = w[at]
    add(`${x} ${next && !isFigure(next) ? `${next}${isUnit(next) ? tail(at + 1) : ''}` : ''}`.trim())
  })
  return m
}
/** A figure's dose unit, when its key has one ("hai mươi nắp" is in nắp, "20 mg trênl" in mg). */
const unit = (k: string) => k.split(' ').slice(1).find(p => DOSE_UNIT.test(p)) ?? ''
/**
 * A sentence's stop: ".", "?", "!" or an ellipsis, with any quote mark after it, before a space or the end. Every one is a
 * stop for what a mend must keep, a genus's initial ("p. aethiopicus", the text as `norm` gives it) too: split finest,
 * no sentence rides along with a named one (Grok's reads).
 */
const MARKS_AFTER = `"'”’»)“‘`
const STOP_MARK = `[.?!…⋯‥][${MARKS_AFTER}]*`
const split = (t: string) => t.split(new RegExp(`\\n|(?<=${STOP_MARK})\\s+`, 'u')).map(x => x.trim()).filter(Boolean)
/** What `a` has more of than `b`. */
const more = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([k, n]) => (n > (b.get(k) ?? 0) ? [k] : []))
const less = (a: Map<string, number>, gone: Map<string, number>) => new Map([...a].map(([k, n]) => [k, Math.max(0, n - (gone.get(k) ?? 0))]))

/**
 * A plain line (the title, a summary point, a question or an answer) as HTML the sentence cutter reads as text, and
 * back, exactly: "&" is "&amp;" there and "&amp;" again here.
 */
const asHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const asPlain = (s: string) => s.replace(/&(amp|lt|gt);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>' })[e]!)
/** A sentence the editor returned for a plain line: its words only, as such a line is kept. */
const flat = (vi: string) => unescapePlain(vi.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
/** Metric and rounded, as the video writer writes a guide (youtube.ts): only what changes, so the rest stays byte for byte. */
const metric = (s: string) => roundConverted(toMetric(s, 'vi'), 'vi')
const WHERE: [RegExp, string][] = [[/^name$/, 'tiêu đề'], [/^summary\./, 'tóm tắt'], [/^body$/, 'thân bài'], [/^faq\.\d+\.q$/, 'câu hỏi FAQ'], [/^faq\.\d+\.a$/, 'trả lời FAQ']]
const SENTENCES_SCHEMA = { type: 'object', required: ['sentences'], properties: { sentences: { type: 'array', items: { type: 'object', required: ['n', 'vi'], properties: { n: { type: 'number' }, vi: { type: 'string' } } } } } }
type Part = { field: string; html: boolean; text: string; pieces: Piece[] }

/**
 * The gate's mender for a Vietnamese video guide (gate.ts `mend`). A new version the video reviewer passed went back
 * whole when one sentence of it named a shop abroad or gave a price in dollars, and the guide had had its one go: 43 of
 * the 94 texts the recheck job's gate put back from 8 to 10 Nov 2026. Here the sentences the gate quotes go to an editor
 * with the transcript, and the video reviewer reads the result: a text the reader-fit writer made from facts
 * (for-reader.ts) would be another guide, with the passing review left on a text the page doesn't have.
 *
 * Only the sentences a finding names are written again, and code puts each back in its place: every other sentence of
 * the guide is kept byte for byte (the chief of staff, 19 Nov 2026). Until then the editor got the whole guide and
 * returned it whole, and 15 of the 21 held guides mended from 18 Nov were thrown away after paying for it, each for a
 * sentence no finding named that the editor had changed. A sentence is one as sentences.ts cuts it (coarsely: unsure,
 * two stay one), in the title, each summary point, the body, and each question and answer, and a finding names every
 * one its quote is in, wherever the guide says it. A units finding's sentence isn't the editor's: code converts it.
 *
 * The file is written, and true returned, only when the edit took every quote out and its review is at the bar, or no
 * lower than the review of the text it mends (a mend never leaves a guide worse, as a redo never does). Its review is
 * then the page's. False, and the file as it was: an answer that numbers a sentence twice or leaves one out, a quote left
 * in, a figure moved, a part it would empty, or a review under both. Nothing, with no editor called, so the gate doesn't
 * count it among a run's mends: not a Vietnamese video guide, a text a person fixed, a quote in no sentence of the
 * guide, nothing but units to mend, no transcript on this Mac. Nor is a mend tried when a product or a price is quoted in
 * a paragraph that gives a dose, at any place: the editor turns a product into its kind, and "5 ml of that product for 200 litres" would
 * become a dose for every product of the kind (the Writing Lead, 2026-11-11). That text goes back.
 */
export const videoMend = (root: string, d: { llm: Llm; yt: Pick<YouTube, 'transcript' | 'transcribe'>; now?: () => Date; write?: WriteOpts }): Mend => async (p: Page, findings: FitFinding[]) => {
  if (p.lang !== 'vi' || p.kind !== 'guides' || !findings.length) return undefined
  const contentRoot = join(root, 'content')
  const dir = join(contentRoot, 'guides', p.id)
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as GuideEntity
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  if (e.source !== 'youtube' || !e.video || vi.bodyFixed || vi.faqFixed) return undefined
  // A title a person picked (nameFixed) isn't the editor's to change, so a fault quoted in it can't be mended here.
  if (vi.nameFixed && findings.some(f => f.part === 'T')) return undefined
  const paragraphs = [vi.name, ...(vi.summary ?? []), ...render(sanitizeHtml(vi.body ?? '')).split('\n'), ...(vi.faq ?? []).flatMap(f => [f.q, f.a])].map(norm)

  // The guide's parts, each cut into its sentences, and the ones each finding names: every sentence its quote is in, in
  // any part (a quote said again in the FAQ is named there too), each sent once with all its notes.
  const parts: Part[] = [
    { field: 'name', html: false, text: vi.name },
    ...(vi.summary ?? []).map((s, i) => ({ field: `summary.${i}`, html: false, text: s })),
    { field: 'body', html: true, text: vi.body ?? '' },
    ...(vi.faq ?? []).flatMap((f, i) => [{ field: `faq.${i}.q`, html: false, text: f.q }, { field: `faq.${i}.a`, html: false, text: f.a }]),
  ].map(x => ({ ...x, pieces: sentences(x.html ? x.text : asHtml(x.text)) }))
  const said = parts.map(x => x.pieces.filter(q => q.sentence).map(q => q.html))
  // Whole words, at every place (Codex's read of #1690: "ADA" named a sentence about Canada).
  const holds = (pieces: Piece[], quote: string) => [...new Set([...quoted(pieces, quote, { whole: true }), ...holding(pieces, quote)])]
  const at = (f: FitFinding) => parts.flatMap((x, k) => holds(x.pieces, f.quote).map(i => ({ k, i })))
  /** A sentence's words as the checks read them. */
  const txt = (k: number, h: string) => norm(parts[k]!.html ? plain(h) : asPlain(h))
  // One reading of where a finding stands, for every check: each sentence `at` names (Codex's reads of #1690: a first-place
  // reading missed a dose, a price and a product said again).
  const doseAt = [...new Map(findings.filter(f => f.check === 'dose').flatMap(f => at(f)).map(w => [`${w.k}.${w.i}`, w])).values()]
  const isDose = (k: number, i: number) => doseAt.some(w => w.k === k && w.i === i)
  // A dose the editor may take is the source's own tank's, at every place its quote is said: each gets the note to drop
  // it. Any other waits for a person, and so does the guide.
  const doses = doseAt.map(({ k, i }) => txt(k, said[k]![i]!))
  if (doses.some(s => !ownTankDose(s))) return undefined
  // A dose however it's written: any figure in a dose's unit, in figures, in words or as a fraction ("½ nắp").
  const dosed = (x: string) => givesDose(x) || [...figures(x).keys()].some(k => DOSE_UNIT.test(unit(k)))
  // A product or a price in a paragraph that gives a dose, at any place it's quoted, waits, but for the video's own tank's
  // dose, which the editor takes. A paragraph, not a sentence: the cutter cuts at a line break ("Châm 5 ml<br> Seachem
  // Prime…"); a line (the title, a point, a question or an answer) is one.
  const para = parts.map(x => (x.html ? blockOf(x.pieces, { lines: false }) : said[parts.indexOf(x)]!.map(() => 0)))
  const around = (k: number, i: number) => said[k]!.flatMap((h, j) => (para[k]![j] === para[k]![i] && !isDose(k, j) ? [txt(k, h)] : [])).join(' ')
  if (findings.some(f => (f.check === 'product' || f.check === 'price') && at(f).some(({ k, i }) => dosed(around(k, i))))) return undefined
  const named: { k: number; i: number; notes: string[] }[] = []
  const convert: { k: number; i: number }[] = []
  for (const f of findings) {
    const where = at(f)
    if (f.check === 'units') { convert.push(...where); continue }
    // A quote in no sentence of the guide: nothing here the editor could be shown, nor told to leave.
    if (!where.length) return undefined
    for (const w of where) {
      const n = named.find(x => x.k === w.k && x.i === w.i) ?? named[named.push({ ...w, notes: [] }) - 1]!
      n.notes.push(`"${f.quote}": ${FIT_TITLE[f.check]} (${f.why})${f.check === 'dose' ? `. Đây là liều của chính bể trong video: bỏ con số liều và tên sản phẩm, giữ bước làm, viết "…, ${LABEL_DOSE}."` : ''}`)
    }
  }
  if (!named.length) return undefined
  if (vi.nameFixed && named.some(n => n.k === 0)) return undefined
  named.sort((a, b) => a.k - b.k || a.i - b.i)
  const lang = e.video.lang ?? 'en'
  const transcript = (e.video.transcribed ? null : await d.yt.transcript(e.video.youtubeId, lang)) ?? (await d.yt.transcribe?.(e.video.youtubeId, lang)) ?? null
  if (!transcript) return undefined

  const shown = (k: number, h: string) => (parts[k]!.html ? h : asPlain(h))
  const whole = [`TIÊU ĐỀ: ${vi.name}`, ...(vi.summary ?? []).map(s => `TÓM TẮT: ${s}`), render(sanitizeHtml(vi.body ?? '')), ...(vi.faq ?? []).flatMap(f => [`HỎI: ${f.q}`, `ĐÁP: ${f.a}`])].join('\n')
  const asked = named.map((n, j) => `[${j + 1}] (${WHERE.find(([r]) => r.test(parts[n.k]!.field))![1]}) ${shown(n.k, said[n.k]![n.i]!)}\n${n.notes.map(t => `- ${t}`).join('\n')}`)
  const own = lang === 'vi' ? ['Video bằng tiếng Việt: không chép lại câu nói trong bản ghi; chỗ nào sửa thì viết bằng lời của bạn.'] : []
  const w = await d.llm<{ sentences: { n: number; vi: string }[] }>({
    system: 'Bạn là biên tập viên tiếng Việt. Chỉ trả lời bằng JSON.',
    prompt: [MEND, ...(d.write?.style ? [STYLE] : []), ...own, `Bản ghi:\n${transcript.slice(0, 120_000)}`, `Cả bài, để đọc:\n${whole}`, `Các câu cần sửa:\n${asked.join('\n\n')}`].join('\n\n'),
    schema: SENTENCES_SCHEMA, ...(d.write?.model ? { model: d.write.model } : {}),
  })
  // Each named sentence answered once; a number it wasn't asked is left alone. Two answers for one, or none: which to
  // put in is a guess, and the edit is broken.
  const answers = new Map<number, string>()
  for (const s of w.sentences ?? []) {
    const n = Number(s.n)
    if (!Number.isInteger(n) || n < 1 || n > named.length) continue
    if (answers.has(n)) return false
    answers.set(n, String(s.vi ?? ''))
  }
  if (answers.size < named.length) return false
  // What the editor wrote, as the checks read it, and as it's written: metric and rounded, a units finding's sentence too.
  const raw = parts.map(() => new Map<number, string>())
  const out = parts.map(() => new Map<number, string>())
  named.forEach((n, j) => {
    const v = answers.get(j + 1)!
    const t = parts[n.k]!.html ? inline(v) : asHtml(flat(v))
    raw[n.k]!.set(n.i, t)
    out[n.k]!.set(n.i, t && metric(t))
  })
  for (const c of convert) if (!out[c.k]!.has(c.i)) out[c.k]!.set(c.i, metric(said[c.k]![c.i]!))
  const assemble = (changes: Map<number, string>[]) => parts.map((x, k) => {
    if (![...changes[k]!].some(([i, t]) => t !== said[k]![i])) return x.text
    const h = splice(x.pieces, changes[k]!).trim()
    return x.html ? h : asPlain(h)
  })
  const before = parts.map(x => x.text)
  const [checked, written] = [assemble(raw), assemble(out)]
  // A part it would empty: the title, the body, or one side of a question and its answer, which would leave the other about nothing.
  const faqAt = (k: number) => /^faq\.(\d+)\.[qa]$/.exec(parts[k]!.field)?.[1]
  // Empty is no words, whatever tags are left ("<table>…<td></td>…</table>", Codex's second read of #1690).
  const empty = (k: number) => !(parts[k]!.html ? plain(written[k]!) : written[k]!).trim()
  const bodyAt = parts.findIndex(x => x.field === 'body')
  if (empty(0) || (plain(before[bodyAt]!) && empty(bodyAt))) return false
  if (parts.some((x, k) => faqAt(k) !== undefined && empty(k) && written[parts.findIndex((y, m) => m !== k && faqAt(m) === faqAt(k))])) return false
  const draftOf = (v: string[]) => {
    const get = (f: string) => v[parts.findIndex(x => x.field === f)]!
    return {
      name: get('name'), body: get('body'), summary: (vi.summary ?? []).map((_, i) => get(`summary.${i}`)).filter(Boolean),
      faq: (vi.faq ?? []).map((_, i) => ({ q: get(`faq.${i}.q`), a: get(`faq.${i}.a`) })).filter(f => f.q && f.a),
    }
  }
  const c = draftOf(checked), fixed = draftOf(written)
  const text = norm([c.name, ...c.summary, render(sanitizeHtml(c.body)), ...c.faq.flatMap(f => [f.q, f.a])].join('\n'))
  // A units finding's figures stay as written, for code to convert; every other quote goes, wherever the guide would say it.
  if (findings.some(f => f.check !== 'units' && checked.some((t, k) => holds(sentences(parts[k]!.html ? t : asHtml(t)), f.quote).length))) return false
  // No dose figure comes out that didn't go in (the chief of staff, 14 Nov 2026: "every figure in equals every figure
  // out").
  const had = figures(paragraphs.join('\n')), has = figures(text)
  if (more(has, had).some(k => DOSE_UNIT.test(unit(k)))) return false
  // The video's own dose goes, however its sentence is reworded (Grok's read).
  if ([...figures(doses.join('\n'))].some(([k, n]) => DOSE_UNIT.test(unit(k)) && (has.get(k) ?? 0) > (had.get(k) ?? 0) - n)) return false
  // Its figure may stay only in a sentence carried over whole from one with no dose of the tank's ("Ngoài ra còn 4 nắp
  // trong tủ."), never in one the editor wrote, which a count can't tell apart (Grok's read).
  const ownDose = new Set([...figures(doses.join('\n')).keys()].filter(k => DOSE_UNIT.test(unit(k))))
  const carried = new Set(split(paragraphs.join('\n')).filter(x => !doses.some(s => s.trim() === x)))
  if (split(text).some(x => !carried.has(x) && [...figures(x).keys()].some(k => ownDose.has(k)))) return false
  // No figure added, and none lost but those of the sentences the editor was given, each once, and never a units quote's,
  // which stay for code to convert (a shop's mend made "80 cm" "90 cm", Grok's read).
  const taken = less(figures(named.map(n => norm(parts[n.k]!.html ? plain(said[n.k]![n.i]!) : asPlain(said[n.k]![n.i]!))).join('\n')), figures(findings.filter(f => f.check === 'units').map(f => norm(f.quote)).join('\n')))
  if (more(has, had).length || more(less(had, taken), has).length) return false
  // And sentence by sentence: an answer's figures are its own sentence's, so none moves from one answer to another. A
  // sentence a units finding names keeps its units quotes' figures, and its answer converts to every figure the sentence
  // did, so a figure said again in a product's name ("Aqueon 10 Gallon"), which code leaves, isn't the tank's kept (Codex's
  // reads of #1690).
  // An answer to a dose's sentence keeps none of its doses, however written. And a sentence a units finding names keeps
  // each figure code converts it to, as many times as the sentence converts to it: a figure it already had ("Bể 40 lít
  // và bể 10 gallon", where 10 gallon is 40 lít) doesn't stand in for one dropped (Codex's third read).
  const units = new Set(convert.map(c => `${c.k}.${c.i}`))
  const unitFigures = figures(findings.filter(f => f.check === 'units').map(f => norm(f.quote)).join('\n'))
  if (named.some(n => {
    const s = said[n.k]![n.i]!, a = raw[n.k]!.get(n.i)!, was = figures(txt(n.k, s)), now = figures(txt(n.k, a))
    if (more(now, was).length) return true
    if (isDose(n.k, n.i) && [...now.keys()].some(k => DOSE_UNIT.test(unit(k)))) return true
    if (!units.has(`${n.k}.${n.i}`)) return false
    const conv = figures(txt(n.k, metric(s))), got = figures(txt(n.k, metric(a)))
    return more(new Map([...was].filter(([f]) => unitFigures.has(f))), now).length > 0 || [...less(conv, was).keys()].some(k => (less(conv, was).get(k) ?? 0) > 0 && (got.get(k) ?? 0) < conv.get(k)!)
  })) return false

  const review = await reviewDraft(d.llm, transcript, { viTitle: fixed.name, summary: fixed.summary, body: fixed.body, faq: fixed.faq }, { title: e.video.title, channel: e.video.channel, lang }, REVIEW_NOTE)
  const page = { id: `guides/${p.id}`, lang: 'vi' }
  const now = d.now?.() ?? new Date()
  if (review.score < QUALITY_THRESHOLD && review.score < (vi.quality?.score ?? 0)) {
    await logReviews(root, 'video-guide', page, [review], undefined, { now, rewrite: true })
    return false
  }
  // Held out of the chat while under the bar, as the video writer writes a guide (youtube.ts).
  const held = vi.quality?.chat === false
  const { chat: _chat, ...quality } = vi.quality ?? {}
  const next = TranslationSchema.parse({
    ...vi, ...fixed,
    quality: { ...quality, score: review.score, indexable: review.score >= QUALITY_THRESHOLD, bySource: { youtube: review.score }, ...(held && review.score < QUALITY_THRESHOLD ? { chat: false as const } : {}) },
  })
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(next, null, 2)}\n`)
  if (held && review.score >= QUALITY_THRESHOLD) await setHold(contentRoot, p.id, false)
  await logReviews(root, 'video-guide', page, [review], review, { now, rewrite: true })
  return true
}

/**
 * The gate's mender where this runs: the Mac's alone (the chief of staff, 15 Nov 2026). Its transcript comes through
 * yt-dlp, which GitHub's runners don't have, so each mend the cloud's gate sent failed before any model call and spent one
 * of the run's mends and a log line: 12 held video guides each cloud cycle. There the gate has no mender; the Mac's mend.
 */
export const gateMend = (root: string, d: Parameters<typeof videoMend>[1], where: Machine = machine()): Mend | undefined =>
  where === 'mac' ? videoMend(root, d) : undefined
