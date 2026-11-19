import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import { amounts, holdsAmount } from './amount'
import { machine, type Machine } from './ceiling'
import type { Llm } from './claude'
import { FIT_TITLE, givesDose, type FitFinding } from './fit'
import type { Mend } from './gate'
import { inline, words } from './mend'
import type { Page } from './pages'
import { VI_STYLE as STYLE } from './phrases'
import { norm, render } from './reader'
import { logReviews } from './review-log'
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
export const SIZE_UNIT = '(?:lít|litres?|liters?|l|cm|centimet|centimét|mm|m|mét|feet|ft|foot|inch(?:es)?|in|gallons?|gal|galông|galon)'
export const DOSE_WORDS = 'oz|ounces?|ml|mililít|mililit|cc|mg|kg|gam|gram|grams|gr|g|ppm|gói|viên|thìa|muỗng|giọt|nắp|cốc|chén|chai|sachets?|tablets?|butir|caps?|scoops?|drops?|teaspoons?|tablespoons?|tsp|tbsp|pumps?'
export const NUMBER_WORDS = 'một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|mười|mươi|trăm|linh|lẻ|nửa|rưỡi'
const OWN_TANK = new RegExp(`(?<![\\p{L}])(?:bể(?:\\s+(?:dài\\s+)?\\d[\\d.,]*\\s*${SIZE_UNIT})?\\s+này|bể ở đây|bể mình|bể của mình|bể trong video|bể mẫu|lần này|hôm đó)(?![\\p{L}])`, 'iu')
const NOT_OWN = new RegExp(`(?<![\\p{L}])(?:cho|thì|trên|từ|theo|per|như|những|các|mọi|nào|loại|kiểu|cỡ|mấy|dạng|tất cả|bất kỳ|bất cứ|không chỉ|co2|co₂|ppm|mỗi(?!\\s+(?:ngày|tuần|tháng|lần|sáng|tối|buổi|đêm|giờ)(?![\\p{L}]))|(?:\\d[\\d.,]*|${NUMBER_WORDS})\\s+bể)(?![\\p{L}])|\\/`, 'iu')
/** Another tank with a figure, beside the one the sentence names ("bể 500 ml châm 2 nắp"). */
const OTHER_TANK = new RegExp(`(?<![\\p{L}])bể\\s+(?:\\d|(?:${NUMBER_WORDS})(?![\\p{L}]))`, 'iu')
const DOSE_AMOUNT = new RegExp(`(?<![\\p{L}\\p{N}])(?:\\d[\\d.,–-]*|${NUMBER_WORDS})\\s*(?:cái\\s+)?(?:${DOSE_WORDS})(?![\\p{L}])`, 'giu')
const SIZE_WORD = new RegExp(`(?<![\\p{L}])${SIZE_UNIT}(?![\\p{L}])`, 'iu')
const NUMBER_WORD = new RegExp(`^(?:${NUMBER_WORDS})$`, 'u')
const DOSE_UNIT = new RegExp(`^(?:${DOSE_WORDS})$`, 'u')
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
/**
 * A sentence's stop: ".", "?", "!" or an ellipsis, with any quote mark after it, before a space or the end. Every one is a
 * stop for what a mend must keep, a genus's initial ("p. aethiopicus", the text as `norm` gives it) too: split finest,
 * no sentence rides along with a named one (Grok's reads).
 */
const MARKS_AFTER = `"'”’»)“‘`
const STOP_MARK = `[.?!…⋯‥][${MARKS_AFTER}]*`
const split = (t: string) => t.split(new RegExp(`\\n|(?<=${STOP_MARK})\\s+`, 'u')).map(x => x.trim()).filter(Boolean)

/**
 * A plain line (the title, a summary point, a question or an answer) as HTML the sentence cutter reads as text, and
 * back, exactly: "&" is "&amp;" there and "&amp;" again here.
 */
const asHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const asPlain = (s: string) => s.replace(/&(amp|lt|gt);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>' })[e]!)
/** A sentence the editor returned for a plain line: its words only, as such a line is kept. */
const flat = (vi: string) => unescapePlain(vi.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
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
 * one its quote is in, wherever the guide says it, within one block.
 *
 * The editor never writes or changes an amount, as amount.ts lists them (the chief of staff, 19 Nov 2026): a sentence it
 * is given holds none once the quotes it's told to take out (a price, the video's own tank's dose) are out, and its answer
 * holds none, but for the label line a dropped dose leaves. A units finding's sentence isn't the editor's, and the mend
 * converts nothing: once the guide is held for units alone, units-mend.ts converts a tank's volume, and any other units
 * finding (inches, feet, degrees, ounces) waits for a person.
 *
 * The file is written, and true returned, only when the edit took every quote out and its review is at the bar, or no
 * lower than the review of the text it mends (a mend never leaves a guide worse, as a redo never does). Its review is
 * then the page's. False, and the file as it was: an answer that numbers a sentence twice or leaves one out, writes an
 * amount, leaves a quote in or empties a part, or a review under both.
 * Nothing, with no editor called, so the gate doesn't count it among a run's mends: not a Vietnamese video guide, a text
 * a person fixed, a quote in no sentence of the guide, nothing but units to mend, a sentence to send that holds an
 * amount, a dose that isn't the video's own tank's, no transcript on this Mac. Nor is a mend tried when a product or a
 * price is quoted in a paragraph that holds an amount, at any place: the editor turns a product into its kind, and "5 ml
 * of that product for 200 litres" would become a dose for every product of the kind (the Writing Lead, 2026-11-11).
 * That text goes back.
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
  // A quote's forms: as written, an apostrophe either way ("Dr. Tim’s"), and the English plural ("Wonder Shells").
  const forms = (quote: string) => [quote, quote.replace(/[’‘`]/g, "'"), quote.replace(/'/g, '’')].flatMap(q => (/[a-z]$/i.test(q) ? [q, `${q}s`] : [q]))
  // Whole words, its punctuation as written, at every place, within one block (Codex's reads of #1690: "ADA" named a
  // sentence about Canada, "Bể mẫu" one with "từ bể, mẫu", and a heading's last word joined the next paragraph's first).
  const holds = (pieces: Piece[], quote: string) => {
    const blocks = blockOf(pieces)
    return [...new Set(forms(quote).flatMap(q => quoted(pieces, q, { whole: true, blocks })))].sort((a, b) => a - b)
  }
  const at = (f: FitFinding) => parts.flatMap((x, k) => holds(x.pieces, f.quote).map(i => ({ k, i })))
  /** A sentence's words as the checks read them. */
  const txt = (k: number, h: string) => norm(parts[k]!.html ? plain(h) : asPlain(h))

  // The editor never writes or changes an amount (the chief of staff, 19 Nov 2026, after six reads of this change each
  // found a new way to read one): what an amount is, is amount.ts's one list, read the same way going in and coming out.
  // Going in, a sentence it's given holds no amount once its findings' prices and the tank's own dose are out (the quotes
  // it's told to take out whole); one that keeps an amount stays held for a person. Units are code's (units-mend.ts): the
  // mend converts none, so a units finding's sentence keeps its amount and isn't the editor's.
  const doseAt = [...new Map(findings.filter(f => f.check === 'dose').flatMap(f => at(f)).map(w => [`${w.k}.${w.i}`, w])).values()]
  const isDose = (k: number, i: number) => doseAt.some(w => w.k === k && w.i === i)
  // A dose the editor may take out is the video's own tank's, at every place its quote is said, and every sentence the
  // cutter keeps with it that holds an amount is the tank's own too: a neighbour's "Bể này" doesn't make a dose the tank's
  // (Codex's fourth and fifth reads). Any other dose waits for a person.
  const doses = doseAt.map(({ k, i }) => txt(k, said[k]![i]!))
  if (doses.some(s => !ownTankDose(s) || split(s).some(x => holdsAmount(x) && !ownTankDose(x)))) return undefined
  // What the editor is told to take out whole, read out of a sentence before it's checked for an amount.
  const outQuotes = findings.filter(f => f.check === 'price' || f.check === 'dose').flatMap(f => forms(norm(f.quote)))
  const rest = (t: string) => outQuotes.reduce((r, q) => r.split(q.toLowerCase()).join(' '), t)
  // A product or a price in a paragraph that holds an amount, at any place it's quoted, waits, but for the video's own
  // tank's dose, which the editor takes: the editor turns a product into its kind, and "5 ml of that product" beside it
  // would become a dose for every product of the kind (the Writing Lead, 2026-11-11). A paragraph, not a sentence: the
  // cutter cuts at a line break ("Châm 5 ml<br> Seachem Prime…"); a line (the title, a point, a question or an answer) is one.
  const para = parts.map(x => (x.html ? blockOf(x.pieces, { lines: false }) : said[parts.indexOf(x)]!.map(() => 0)))
  const around = (k: number, i: number) => said[k]!.flatMap((h, j) => (para[k]![j] === para[k]![i] && !isDose(k, j) ? [txt(k, h)] : [])).join(' ')
  if (findings.some(f => (f.check === 'product' || f.check === 'price') && at(f).some(({ k, i }) => holdsAmount(rest(around(k, i)))))) return undefined
  const named: { k: number; i: number; notes: string[] }[] = []
  for (const f of findings) {
    if (f.check === 'units') continue
    const where = at(f)
    // A quote in no sentence of the guide: nothing here the editor could be shown, nor told to leave.
    if (!where.length) return undefined
    for (const w of where) {
      const n = named.find(x => x.k === w.k && x.i === w.i) ?? named[named.push({ ...w, notes: [] }) - 1]!
      n.notes.push(`"${f.quote}": ${FIT_TITLE[f.check]} (${f.why})${f.check === 'dose' ? `. Đây là liều của chính bể trong video: bỏ con số liều và tên sản phẩm, giữ bước làm, viết "…, ${LABEL_DOSE}."` : ''}`)
    }
  }
  if (!named.length) return undefined
  if (vi.nameFixed && named.some(n => n.k === 0)) return undefined
  if (named.some(n => holdsAmount(rest(txt(n.k, said[n.k]![n.i]!))))) return undefined
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
  // What the editor wrote, as the part keeps it. Coming out, an answer holds no amount, but for the label line a dropped
  // dose leaves, whose words are fixed and give none.
  const changes = parts.map(() => new Map<number, string>())
  for (const [j, n] of named.entries()) {
    const v = answers.get(j + 1)!
    const t = parts[n.k]!.html ? inline(v) : asHtml(flat(v))
    if (holdsAmount(txt(n.k, t).split(LABEL_DOSE).join(' '))) return false
    changes[n.k]!.set(n.i, t)
  }
  const before = parts.map(x => x.text)
  const written = parts.map((x, k) => {
    if (![...changes[k]!].some(([i, t]) => t !== said[k]![i])) return x.text
    const h = splice(x.pieces, changes[k]!).trim()
    return x.html ? h : asPlain(h)
  })
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
  const fixed = draftOf(written)
  const text = norm([fixed.name, ...fixed.summary, render(sanitizeHtml(fixed.body)), ...fixed.faq.flatMap(f => [f.q, f.a])].join('\n'))
  // Every quote but a units one goes, wherever the guide would say it.
  if (findings.some(f => f.check !== 'units' && written.some((t, k) => holds(sentences(parts[k]!.html ? t : asHtml(t)), f.quote).length))) return false
  // The page, as a backstop: no amount it didn't have, and no more of one (the chief of staff, 14 Nov 2026: "every
  // figure in equals every figure out"), the label line's words aside.
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x.toLowerCase(), (m.get(x.toLowerCase()) ?? 0) + 1), new Map<string, number>())
  const had = count(amounts(paragraphs.join('\n'))), has = count(amounts(text.split(LABEL_DOSE).join(' ')))
  if ([...has].some(([x, n]) => n > (had.get(x) ?? 0))) return false

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
  // Each sentence it changed, before and after, in the run's log: a reader reads every one against the video the next
  // morning, for a week from the first night (the chief of staff, 19 Nov 2026). Git has no before-text of a new guide.
  const shownText = (k: number, h: string) => (parts[k]!.html ? plain(h) : asPlain(h)).replace(/\s+/g, ' ').trim()
  for (const n of named) {
    const old = said[n.k]![n.i]!, fresh = changes[n.k]!.get(n.i)!
    if (fresh !== old) console.log(`mended sentence: guides/${p.id} (${e.video.youtubeId}, ${parts[n.k]!.field}): ${JSON.stringify(shownText(n.k, old))} -> ${JSON.stringify(shownText(n.k, fresh))}`)
  }
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
