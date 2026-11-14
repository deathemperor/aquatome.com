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
 * A dose that is the video's own tank's, not advice ("bể này dùng khoảng 4 nắp"): the editor drops its figure and its
 * brand for the label. One given as so much per volume ("5 ml cho mỗi 50 lít"), or with no word naming the video's tank,
 * is advice, and waits for a person (the chief of staff, 14 Nov 2026). Unsure, it waits.
 */
const OWN_TANK = /(?<![\p{L}])(?:bể này|bể ở đây|bể mình|bể của mình|bể trong video|ở đây|lần này|hôm đó)(?![\p{L}])/iu
const PER_VOLUME = /(?:mỗi|cho|trên|\/)\s*(?:khoảng\s*)?\d[\d.,–-]*\s*(?:lít|l|gallon|gal)(?![\p{L}])|(?:mỗi|\/)\s*(?:lít|l)(?![\p{L}])/iu
export const ownTankDose = (sentence: string) => givesDose(sentence) && OWN_TANK.test(sentence) && !PER_VOLUME.test(sentence)
/** The label line a dropped dose leaves, in the words keepers write (the Writing Lead, 14 Nov 2026). */
export const LABEL_DOSE = 'liều theo hướng dẫn trên bao bì'
const DOSE_UNIT = /^(?:ml|mililít|mililit|cc|mg|kg|gam|gram|gr|g|gói|viên|thìa|muỗng|giọt|nắp|cốc|chén|chai)$/u
const isFigure = (w: string) => /^[.,-]?\d/.test(w)
/** Each figure with the word after it, its unit, as often as the text has it. */
function figures(text: string): Map<string, number> {
  const w = words(text)
  const m = new Map<string, number>()
  w.forEach((x, i) => {
    if (!isFigure(x)) return
    const k = `${x} ${w[i + 1] && !isFigure(w[i + 1]!) ? w[i + 1] : ''}`.trim()
    m.set(k, (m.get(k) ?? 0) + 1)
  })
  return m
}
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
  // No dose figure comes out that didn't go in; and beside units or a dose, no figure at all, and none lost but those of
  // the sentences a finding takes (the chief of staff, 14 Nov 2026: "every figure in equals every figure out").
  const had = figures(paragraphs.join('\n')), has = figures(text)
  if (more(has, had).some(k => DOSE_UNIT.test(k.split(' ')[1] ?? ''))) return false
  if (findings.some(f => f.check === 'units' || f.check === 'dose')) {
    const taken = figures(findings.filter(f => f.check !== 'units').map(sentence).join('\n'))
    if (more(has, had).length || more(less(had, taken), has).length) return false
  }

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
