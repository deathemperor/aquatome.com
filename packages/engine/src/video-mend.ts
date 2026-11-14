import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { FIT_TITLE, givesDose, type FitFinding } from './fit'
import type { Mend } from './gate'
import { words } from './mend'
import type { Page } from './pages'
import { norm, render } from './reader'
import { logReviews } from './review-log'
import { roundPage } from './round'
import { plainParts, sanitizeHtml, unescapePlain } from './sanitize'
import { setHold } from './video-hold'
import { fixDraft, reviewDraft, type Draft, type WriteOpts, type YouTube } from './youtube'

/** What the mender's editor is told to do, said to its reviewer: a foreign price turned into the comparison it makes is a fact kept (the Writing Lead's ruling, 2026-11-11). */
const REVIEW_NOTE = readFileSync(new URL('./prompts/video-mend-review.md', import.meta.url), 'utf8')

/** The sentence a quote sits in, within its paragraph (both as `norm` gives them); the quote alone when no paragraph has it whole. */
function sentenceOf(paragraphs: string[], quote: string): string {
  for (const p of paragraphs) {
    const i = p.indexOf(quote)
    if (i < 0) continue
    const start = Math.max(p.lastIndexOf('. ', i), p.lastIndexOf('? ', i), p.lastIndexOf('! ', i)) + 1
    const end = p.slice(i + quote.length).search(/[.?!](?:\s|$)/)
    return p.slice(start, end < 0 ? p.length : i + quote.length + end + 1)
  }
  return quote
}

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
  const w = words(text.replace(/(\d)\s*%/gu, '$1 phầntrăm').replace(/(\d)\s*[×xX*]\s*(?=\d)/gu, '$1 ').replace(/([½¼¾⅓⅔⅛])(?=\p{L})/gu, '$1 '))
  const m = new Map<string, number>()
  const add = (k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const after = (j: number) => (w[j] === 'cái' ? w[j + 1] : w[j])
  w.forEach((x, i) => {
    if (NUMBER_WORD.test(x)) {
      if (NUMBER_WORD.test(w[i - 1] ?? '')) return
      let j = i
      while (NUMBER_WORD.test(w[j] ?? '')) j++
      const u = after(j)
      if (u && (DOSE_UNIT.test(u) || SIZE_UNIT_WORD.test(u))) add(`${w.slice(i, j).join(' ')} ${u}`)
      return
    }
    if (!isFigure(x)) return
    const next = after(i + 1)
    add(`${x} ${next && !isFigure(next) ? next : ''}`.trim())
  })
  return m
}
/** A figure's unit: its key's last word, when it has one ("hai mươi nắp" is in nắp). */
const unit = (k: string) => { const p = k.split(' '); return p.length > 1 ? p[p.length - 1]! : '' }
const split = (t: string) => t.split(/\n|(?<=[.?!])\s+/).map(x => x.trim()).filter(Boolean)
/** What `a` has more of than `b`. */
const more = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([k, n]) => (n > (b.get(k) ?? 0) ? [k] : []))
const less = (a: Map<string, number>, gone: Map<string, number>) => new Map([...a].map(([k, n]) => [k, Math.max(0, n - (gone.get(k) ?? 0))]))

/**
 * The gate's mender for a Vietnamese video guide (gate.ts `mend`). A new version the video reviewer passed went back
 * whole when one sentence of it named a shop abroad or gave a price in dollars, and the guide had had its one go: 43 of
 * the 94 texts the recheck job's gate put back from 8 to 10 Nov 2026. Here the sentences the gate quotes go to the
 * video's own editor (`fixDraft`), which has the transcript and only cuts or rewords, and the video reviewer reads the
 * result: a text the reader-fit writer made from facts (for-reader.ts) would be another guide, with the passing review
 * left on a text the page doesn't have.
 *
 * The file is written, and true returned, only when the edit took every quoted sentence out and its review is at the bar,
 * or no lower than the review of the text it mends (a mend never leaves a guide worse, as a redo never does). Its review
 * is then the page's. False, and the file as it was: a broken edit, a sentence left in, or a review under both. Nothing,
 * with no editor called, so the gate doesn't count it among a run's mends: not a Vietnamese video guide, a text a person
 * fixed, no transcript on this Mac. Nor is a mend tried when a product or a price is quoted in a sentence that gives a
 * dose: the editor turns a product into its kind, and "5 ml of that product for 200 litres" would become a dose for every
 * product of the kind (the Writing Lead, 2026-11-11). That text goes back.
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
  // A dose the editor may take is the source's own tank's; any other waits for a person, and so does the guide.
  const doses = findings.filter(f => f.check === 'dose').map(f => sentenceOf(paragraphs, norm(f.quote)))
  if (!doses.every(ownTankDose)) return undefined
  const sentence = (f: FitFinding) => sentenceOf(paragraphs, norm(f.quote))
  if (findings.some(f => (f.check === 'product' || f.check === 'price') && givesDose(sentence(f)) && !doses.includes(sentence(f)))) return undefined
  const lang = e.video.lang ?? 'en'
  const transcript = (e.video.transcribed ? null : await d.yt.transcript(e.video.youtubeId, lang)) ?? (await d.yt.transcribe?.(e.video.youtubeId, lang)) ?? null
  if (!transcript) return undefined

  const draft: Draft = { relevant: true, kind: e.kind, viTitle: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [], chapters: vi.chapters ?? [] }
  const notes = findings.map(f => `"${f.quote}": ${FIT_TITLE[f.check]} (${f.why})${f.check === 'units'
    ? '. Giữ nguyên mọi con số và đơn vị như đang viết: code đổi sang hệ mét sau.'
    : f.check === 'dose' ? `. Đây là liều của chính bể trong video: bỏ con số liều và tên sản phẩm, giữ bước làm, viết "…, ${LABEL_DOSE}."` : ''}`)
  const fixed = await fixDraft(d.llm, transcript, draft, notes, { ...d.write, lang, reader: true })
  if (!fixed) return false
  // The title only when a fault was in it: a guide's name isn't the editor's to change otherwise.
  const name = findings.some(f => f.part === 'T') ? unescapePlain(fixed.viTitle).trim() : vi.name
  const text = norm([name, ...fixed.summary, render(sanitizeHtml(fixed.body)), ...fixed.faq.flatMap(f => [f.q, f.a])].join('\n'))
  // A units finding's figures stay as written, for code to convert; every other quote goes.
  if (findings.some(f => f.check !== 'units' && text.includes(norm(f.quote)))) return false
  // No dose figure comes out that didn't go in (the chief of staff, 14 Nov 2026: "every figure in equals every figure
  // out").
  const had = figures(paragraphs.join('\n')), has = figures(text)
  if (more(has, had).some(k => DOSE_UNIT.test(unit(k)))) return false
  // The video's own dose goes, however its sentence is reworded (Grok's read).
  if ([...figures(doses.join('\n'))].some(([k, n]) => DOSE_UNIT.test(unit(k)) && (has.get(k) ?? 0) > (had.get(k) ?? 0) - n)) return false
  // Its figure may stay only in a sentence carried over whole from one with no dose of the tank's ("Ngoài ra còn 4 nắp
  // trong tủ."), never in one the editor wrote, which a count can't tell apart (Grok's read).
  const own = new Set([...figures(doses.join('\n')).keys()].filter(k => DOSE_UNIT.test(unit(k))))
  const carried = new Set(split(paragraphs.join('\n')).filter(x => !doses.some(s => s.trim() === x)))
  if (split(text).some(x => !carried.has(x) && [...figures(x).keys()].some(k => own.has(k)))) return false
  // In every mend, not only beside units or a dose: no figure added, and none lost but those of the sentences a finding
  // takes, each once, and never a units quote's, which stay for code to convert (a shop's mend made "80 cm" "90 cm",
  // Grok's read).
  const taken = less(figures([...new Set(findings.filter(f => f.check !== 'units').map(sentence))].join('\n')), figures(findings.filter(f => f.check === 'units').map(f => norm(f.quote)).join('\n')))
  if (more(has, had).length || more(less(had, taken), has).length) return false

  const review = await reviewDraft(d.llm, transcript, { ...fixed, viTitle: name }, { title: e.video.title, channel: e.video.channel, lang }, REVIEW_NOTE)
  const page = { id: `guides/${p.id}`, lang: 'vi' }
  const now = d.now?.() ?? new Date()
  if (review.score < QUALITY_THRESHOLD && review.score < (vi.quality?.score ?? 0)) {
    await logReviews(root, 'video-guide', page, [review], undefined, { now, rewrite: true })
    return false
  }
  // As the video writer writes a guide (youtube.ts): metric and rounded, held out of the chat while under the bar.
  const held = vi.quality?.chat === false
  const { chat: _chat, ...quality } = vi.quality ?? {}
  const next = TranslationSchema.parse(roundPage(metricPage({
    ...vi, name, body: sanitizeHtml(fixed.body), ...plainParts(fixed.summary, fixed.faq),
    quality: { ...quality, score: review.score, indexable: review.score >= QUALITY_THRESHOLD, bySource: { youtube: review.score }, ...(held && review.score < QUALITY_THRESHOLD ? { chat: false as const } : {}) },
  }, 'vi'), 'vi'))
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(next, null, 2)}\n`)
  if (held && review.score >= QUALITY_THRESHOLD) await setHold(contentRoot, p.id, false)
  await logReviews(root, 'video-guide', page, [review], review, { now, rewrite: true })
  return true
}
