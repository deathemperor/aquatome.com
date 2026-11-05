import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CHIHIROS_LINES, chihirosLine, controlOf, modelWords, ProductSchema, slugify, toMetric, TranslationSchema, type ProductEntity, type Translation } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { claimsControl, namesSource } from './content-rules'
import { makeProduct, type ProductAsk } from './products'
import { unescapePlain } from './sanitize'
import type { Found } from './video-discovery'
import { readKit } from './video-items'
import { SOURCE_LANGS, throttled, VIDEO_GAP_MS, type VideoMeta, type YouTube } from './youtube'

const EXTRACT = readFileSync(new URL('./prompts/review-extract.md', import.meta.url), 'utf8')
const WRITE = readFileSync(new URL('./prompts/review-write.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')

/** What a video must be to hold findings: past a teaser, short of a stream. */
export const MIN_SECONDS = 240
export const MAX_SECONDS = 3600
const MIN_TRANSCRIPT = 1500

/** One product to look for. A family's page (a maker's plugs) has no model to find in a title: its words and searches instead. */
export type ReviewTarget = { brand: string; model: string; queries?: string[]; titleWords?: string[][] }
export const reviewQueries = (t: ReviewTarget) => t.queries ?? [`${t.brand} ${t.model} review`, `đánh giá ${t.brand} ${t.model}`]

const words = (s: string) => modelWords(s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd'))
const has = (hay: string[], needle: string[]) => hay.some((_, i) => needle.every((w, j) => hay[i + j] === w))
/** Words that make a title another product of the line: "WRGB 2 Pro" isn't the WRGB II page's. */
const VARIANT = new Set(['slim', 'pro', 'rgb', 'vivid', 'plus', 'mini', 'max', 'tiny', 'neo'])
/** The title names this product: its model's words in a row (no variant word after them), or a family's words. */
export function namesProduct(title: string, t: ReviewTarget): boolean {
  const hay = words(title)
  if (t.titleWords) return t.titleWords.every(group => group.some(w => has(hay, words(w))))
  const model = words(t.model)
  if (!model.length) return false
  return hay.some((_, i) => model.every((w, j) => hay[i + j] === w) && !(VARIANT.has(hay[i + model.length]!) && !model.includes(hay[i + model.length]!)))
}
const NOT_A_REVIEW = /#shorts|\bshorts?\b|livestream|\blive\b|trực tiếp|giveaway|thanh lý|giá rẻ/i

/** Why a video can't be a review we read: no embed, too short or long, another language, no captions, the maker unnamed. */
export function unusable(m: VideoMeta, t: ReviewTarget): string | null {
  if (!m.embeddable) return 'not embeddable'
  if (m.durationSec < MIN_SECONDS) return 'too short'
  if (m.durationSec > MAX_SECONDS) return 'too long'
  if (m.lang && !SOURCE_LANGS.includes(m.lang)) return `spoken in ${m.lang}`
  if (m.captions === false) return 'no captions'
  const text = words(`${m.title} ${m.description}`)
  if (!t.titleWords && !has(text, words(t.brand))) return 'maker not named'
  return null
}

const VET_SCHEMA = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'ok', 'reason'], properties: { id: { type: 'string' }, ok: { type: 'boolean' }, reason: { type: 'string' }, lang: { type: 'string' } } } } } }
const VET = (t: ReviewTarget, xs: VideoMeta[]) => `A Vietnamese aquarium handbook summarizes YouTube reviews of "${t.brand} ${t.model}".

ok = true if the video may review, test or report use of this exact product, a comparison where it is one of the main subjects included. ok = false only when the title and description show it isn't: another model or size line of the maker, a range overview where this product is one of many, a spec read-out, a shop's sales video, or a how-to that only uses it. You see only the title and description; the transcript is read next, so when in doubt, ok = true.

reason: a few words. lang: the language spoken ("vi" or "en"; a title may be translated, so also go by the channel). Reply with a verdict for every id.

${xs.map(m => `## ${m.id}\nTitle: ${m.title}\nChannel: ${m.channel}\nLength: ${Math.round(m.durationSec / 60)} min\nDescription: ${m.description.slice(0, 400)}`).join('\n\n')}`

/** A review we have the words of. */
export type ReviewVideo = VideoMeta & { transcript: string; lang: string }
export type ReviewDeps = { find: { searchReviews(q: string): Promise<Found[]> }; yt: YouTube; llm: Llm; sleep: (ms: number) => Promise<void>; gapMs?: number }

/** Turn about between the searches' results, so a language's reviews aren't lost behind the other's. */
function roundRobin(lists: Found[][]): Found[] {
  const out = new Map<string, Found>()
  for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) for (const l of lists) if (l[i] && !out.has(l[i]!.id)) out.set(l[i]!.id, l[i]!)
  return [...out.values()]
}

/**
 * The reviews of one product with captions, a few, Vietnamese first: searches, a title check, each one's metadata (at most
 * `shortlist`), one cheap model call on them all, captions until `keep` have them. YouTube throttling or the model's limit
 * passes through to stop the run; a video that fails only drops out.
 */
export async function findReviews(d: ReviewDeps, t: ReviewTarget, o: { keep?: number; shortlist?: number } = {}): Promise<{ videos: ReviewVideo[]; dropped: { id: string; why: string }[]; calls: number }> {
  const dropped: { id: string; why: string }[] = []
  const lists: Found[][] = []
  for (const q of reviewQueries(t)) {
    lists.push(await d.find.searchReviews(q))
    await d.sleep(d.gapMs ?? VIDEO_GAP_MS)
  }
  const named = roundRobin(lists).filter(x => {
    const why = NOT_A_REVIEW.test(x.title) ? 'not a review, by its title' : !namesProduct(x.title, t) ? 'another product, by its title' : null
    if (why) dropped.push({ id: x.id, why })
    return !why
  })
  const metas: VideoMeta[] = []
  for (const x of named.slice(0, o.shortlist ?? 6)) {
    try {
      const m = await d.yt.video(x.id)
      const why = unusable(m, t)
      if (why) dropped.push({ id: x.id, why }); else metas.push(m)
    } catch (e) {
      if (throttled(e)) throw e
      dropped.push({ id: x.id, why: (e as Error).message.slice(0, 120) })
    }
  }
  if (!metas.length) return { videos: [], dropped, calls: 0 }
  const { verdicts } = await d.llm<{ verdicts: { id: string; ok: boolean; reason: string; lang?: string }[] }>({ system: 'You vet YouTube product reviews. Reply only with JSON.', prompt: VET(t, metas), schema: VET_SCHEMA, model: 'haiku' })
  const ok = metas.flatMap(m => {
    const v = verdicts.find(x => x.id === m.id)
    if (!v?.ok) { dropped.push({ id: m.id, why: v?.reason ?? 'not judged' }); return [] }
    return [{ ...m, lang: v.lang && SOURCE_LANGS.includes(v.lang) ? v.lang : m.lang ?? 'en' }]
  })
  const videos: ReviewVideo[] = []
  for (const m of [...ok].sort((a, b) => Number(b.lang === 'vi') - Number(a.lang === 'vi'))) {
    if (videos.length >= (o.keep ?? 3)) break
    await d.sleep(d.gapMs ?? VIDEO_GAP_MS)
    try {
      const transcript = await d.yt.transcript(m.id, m.lang)
      if (!transcript || transcript.length < MIN_TRANSCRIPT) { dropped.push({ id: m.id, why: 'no captions' }); continue }
      videos.push({ ...m, transcript })
    } catch (e) {
      if (throttled(e)) throw e
      dropped.push({ id: m.id, why: (e as Error).message.slice(0, 120) })
    }
  }
  return { videos, dropped, calls: 1 }
}

export type Finding = { kind: 'strength' | 'weakness' | 'note'; text: string; t: number }
export type Measured = { what: string; value: string; unit: string; how: string; t: number }
/** What the model answers: words to find each one by, not a second, which it can only guess at. */
export type Extracted = { reviewsProduct: boolean; findings: (Omit<Finding, 't'> & { quote: string })[]; measured: (Omit<Measured, 't'> & { quote: string })[] }
const EXTRACT_SCHEMA = {
  type: 'object', required: ['reviewsProduct', 'findings', 'measured'],
  properties: {
    reviewsProduct: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', required: ['kind', 'text', 'quote'], properties: { kind: { type: 'string', enum: ['strength', 'weakness', 'note'] }, text: { type: 'string' }, quote: { type: 'string' } } } },
    measured: { type: 'array', items: { type: 'object', required: ['what', 'value', 'unit', 'how', 'quote'], properties: { what: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' }, how: { type: 'string' }, quote: { type: 'string' } } } },
  },
}

/** The figures in a text, digits only ("1,200" and "1200" alike). */
const figures = (s: string) => (s.match(/\d[\d.,]*\d|\d/g) ?? []).map(x => x.replace(/[.,]/g, ''))
/** A figure captions may spell out ("two months", "eight watts"), so its absence from them says nothing. */
const smallFigure = (x: string) => x.length === 1
/** The transcript's lines within `span` seconds of `t`. */
function near(transcript: string, t: number, span = 120): string {
  return transcript.split('\n').filter(l => { const m = LINE.exec(l); return m && Math.abs(Number(m[1]) * 60 + Number(m[2]) - t) <= span }).join(' ')
}
const LINE = /^\[(\d+):(\d\d)\]\s?(.*)$/
const plainWords = (s: string) => s.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const MIN_QUOTE = 3
/**
 * The second a quote was said: the start of the line it starts in, so a link plays it rather than starting just after it.
 * Undefined when the words aren't in the transcript. A slip late in a long quote still finds its place by the first words.
 */
export function secondOf(transcript: string, quote: string): number | undefined {
  const timed = transcript.split('\n').flatMap(l => { const m = LINE.exec(l); return m ? plainWords(m[3]!).map(w => ({ w, t: Number(m[1]) * 60 + Number(m[2]) })) : [] })
  const q = plainWords(quote)
  if (q.length < MIN_QUOTE) return undefined
  for (const needle of [q, q.slice(0, 4)]) {
    const at = timed.findIndex((_, i) => needle.every((w, j) => timed[i + j]?.w === w))
    if (at >= 0) return timed[at]!.t
  }
  return undefined
}
/**
 * Only what the words back. Each finding and reading must quote the transcript, and its second comes from where that quote
 * is, not from the model, which put one point on a line after it was said (found reading a real run). Every figure must be
 * said around that moment: a model reading a long transcript can make up a reading.
 */
export function cleanExtracted(x: Extracted, transcript: string, durationSec: number): { findings: Finding[]; measured: Measured[] } {
  const said = (text: string, t: number) => { const there = new Set(figures(near(transcript, t))); return figures(text).every(f => smallFigure(f) || there.has(f)) }
  const placed = <T extends { quote: string }>(xs: T[]) => xs.flatMap(({ quote, ...rest }) => { const t = secondOf(transcript, quote ?? ''); return t !== undefined && t <= durationSec ? [{ ...rest, t }] : [] })
  return {
    findings: placed(x.findings).filter(f => f.text?.trim() && said(f.text, f.t)),
    measured: placed(x.measured).filter(m => /\d/.test(m.value ?? '') && m.what?.trim() && said(m.value, m.t)),
  }
}

/** What one review found: one model call. Null when it turns out not to review this product. */
export async function extractFindings(llm: Llm, v: ReviewVideo, t: ReviewTarget, model?: string): Promise<{ findings: Finding[]; measured: Measured[] } | null> {
  const x = await llm<Extracted>({
    system: 'You read aquarium product reviews and report what they found. Reply only with JSON.', schema: EXTRACT_SCHEMA, ...(model ? { model } : {}),
    prompt: `${EXTRACT}\n\nProduct: ${t.brand} ${t.model}\nSpoken in: ${v.lang}\n\nTranscript:\n${v.transcript.slice(0, 60_000)}`,
  })
  if (!x.reviewsProduct) return null
  const clean = cleanExtracted(x, v.transcript, v.durationSec)
  return clean.findings.length || clean.measured.length ? clean : null
}

/** One review as the writer gets it: no title, channel or address, so none can reach the page. */
export type ReviewInput = { url: string; findings: Finding[]; measured: Measured[] }
export type TestFact = { fact: string; testedOn: string }
const inputFor = (reviews: ReviewInput[], tests: TestFact[]) => ({
  reviews: reviews.map((r, i) => ({ id: `R${i + 1}`, findings: r.findings.map((f, j) => ({ id: `R${i + 1}.${j + 1}`, kind: f.kind, text: f.text })), measured: r.measured.map((m, j) => ({ id: `R${i + 1}.m${j + 1}`, what: m.what, value: `${m.value} ${m.unit}`.trim(), how: m.how })) })),
  tests: tests.map((x, i) => ({ id: `T${i + 1}`, fact: x.fact, testedOn: x.testedOn })),
})

type Point = { text: string; refs: string[] }
export type Written = { agree: Point[]; differ: { topic: string; sides: Point[] }[]; single: Point[]; measured: { ref: string; what: string; how: string }[]; tested: Point[] }
const POINT = { type: 'object', required: ['text', 'refs'], properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } } }
const WRITE_SCHEMA = {
  type: 'object', required: ['agree', 'differ', 'single', 'measured', 'tested'],
  properties: {
    agree: { type: 'array', items: POINT }, single: { type: 'array', items: POINT }, tested: { type: 'array', items: POINT },
    differ: { type: 'array', items: { type: 'object', required: ['topic', 'sides'], properties: { topic: { type: 'string' }, sides: { type: 'array', items: POINT } } } },
    measured: { type: 'array', items: { type: 'object', required: ['ref', 'what', 'how'], properties: { ref: { type: 'string' }, what: { type: 'string' }, how: { type: 'string' } } } },
  },
}

/** A score or rating of our own: the page has none, and a reviewer's isn't repeated as if it were a finding. */
const SCORE = /★|⭐|(?<![\d.,])\d(?:[.,]\d)?\s*\/\s*(?:5|10)(?![\d])|(?<![\d.,])\d(?:[.,]\d)?\s*sao(?!\p{L})/u

/** A reading as the page shows it, in the page's words: "almost 50" → "khoảng 50", "over 50" → "trên 50", "30-35" as it is. */
export function figureOf(value: string): string {
  const figure = /\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?/.exec(value)?.[0] ?? ''
  const rest = value.replace(figure, '').trim()
  const word = /over|above|more than|at least|>/i.test(rest) ? 'trên ' : /under|below|less than|at most|</i.test(rest) ? 'dưới ' : rest ? 'khoảng ' : ''
  return `${word}${figure}`
}

export type Merged = { reviews?: NonNullable<Translation['reviews']>; tested: NonNullable<Translation['tested']>; problems: string[] }
const emptyReviews = (r: NonNullable<Translation['reviews']>) => !r.agree.length && !r.differ.length && !r.single.length && !r.measured.length

/**
 * The writer's answer as the page's, by rule, holding it to its findings: each point's refs must exist and be of its kind;
 * "agree" needs two reviews, else it is one review's point; "differ" needs two reviews on its sides, else its sides are
 * each one review's; a figure must be in the findings it cites; no channel, no talk of the video, no score, no claim that
 * AquaTome controls a product it doesn't. A point that fails is left out and listed in `problems` (the writer gets one more
 * go with them). Each point cites each of its reviews once, at the first moment it cites.
 */
export function mergeWritten(w: Written, reviews: ReviewInput[], tests: TestFact[], o: { channels: string[]; controlled: boolean; testUrl?: string; name?: string }): Merged {
  const problems: string[] = []
  const finding = new Map<string, { review: number; url: string; t: number; text: string }>()
  reviews.forEach((r, i) => {
    r.findings.forEach((f, j) => finding.set(`R${i + 1}.${j + 1}`, { review: i, url: r.url, t: f.t, text: f.text }))
    r.measured.forEach((m, j) => finding.set(`R${i + 1}.m${j + 1}`, { review: i, url: r.url, t: m.t, text: `${m.what} ${m.value} ${m.unit}` }))
  })
  const clean = (s: string) => unescapePlain(s).trim()
  const speaks = (text: string, source: string) => {
    if (!text) return false
    for (const n of namesSource(text, o.channels)) problems.push(`"${text}" names its source ("${n}"): state the finding directly`)
    if (namesSource(text, o.channels).length) return false
    if (SCORE.test(text)) { problems.push(`"${text}" gives a score: leave scores out`); return false }
    if (claimsControl(text) && !o.controlled) { problems.push(`"${text}" says AquaTome controls this product: leave control out`); return false }
    // "2 bài review" counts the sources; "WRGB 2" is the product's name.
    const there = figures(`${source} ${modelWords(o.name ?? '').join(' ')}`)
    const missing = figures(text.replace(/\d+\s+bài(?!\p{L})/gu, '')).filter(f => !smallFigure(f) && !there.includes(f))
    if (missing.length) { problems.push(`"${text}": ${missing.join(', ')} is in none of its findings`); return false }
    return true
  }
  /** A point's reviews, with its first moment in each; refs that don't exist are noted and dropped. */
  const cited = (p: Point) => {
    const hits = p.refs.flatMap(r => { const f = finding.get(r); if (!f) problems.push(`"${clean(p.text)}" cites ${r}, which doesn't exist`); return f ? [f] : [] })
    return { hits, reviews: [...new Set(hits.map(h => h.review))] }
  }
  const toPoint = (p: Point) => {
    const text = clean(p.text)
    const { hits, reviews: rs } = cited(p)
    if (!hits.length || !speaks(text, hits.map(h => h.text).join(' '))) return null
    return { reviews: rs, point: { text: toMetric(text, 'vi'), cites: rs.map(i => { const h = hits.find(x => x.review === i)!; return { url: h.url, t: h.t } }) } }
  }
  const single: NonNullable<Translation['reviews']>['single'] = (w.single ?? []).flatMap(p => { const x = toPoint(p); return x ? [x.point] : [] })
  const agree: typeof single = []
  for (const p of w.agree ?? []) { const x = toPoint(p); if (x) (x.reviews.length >= 2 ? agree : single).push(x.point) }
  const differ: NonNullable<Translation['reviews']>['differ'] = []
  for (const d of w.differ ?? []) {
    const sides = d.sides.flatMap(p => { const x = toPoint(p); return x ? [x] : [] })
    const topic = clean(d.topic)
    if (sides.length >= 2 && new Set(sides.flatMap(s => s.reviews)).size >= 2 && topic && !namesSource(topic, o.channels).length) differ.push({ topic: toMetric(topic, 'vi'), sides: sides.map(s => s.point) })
    else single.push(...sides.map(s => s.point))
  }
  const measured: NonNullable<Translation['reviews']>['measured'] = []
  reviews.forEach((r, i) => r.measured.forEach((m, j) => {
    const ref = `R${i + 1}.m${j + 1}`
    const label = (w.measured ?? []).find(x => x.ref === ref)
    const what = clean(label?.what ?? '')
    const how = clean(label?.how ?? '')
    const source = `${m.what} ${m.how}`
    if (!what) { problems.push(`no Vietnamese label for ${ref} (${m.what})`); return }
    if (!speaks(what, source) || (how && !speaks(how, source))) return
    measured.push({ what: toMetric(what, 'vi'), value: toMetric(`${figureOf(m.value)} ${m.unit}`.trim(), 'vi'), how: toMetric(how, 'vi'), cite: { url: r.url, t: m.t } })
  }))
  const tested: Merged['tested'] = !o.testUrl ? [] : (w.tested ?? []).flatMap(p => {
    const text = clean(p.text)
    const facts = p.refs.flatMap(r => { const f = /^T(\d+)$/.exec(r); const x = f && tests[Number(f[1]) - 1]; return x ? [x] : [] })
    if (!facts.length) { if (text) problems.push(`"${text}" cites no test note`); return [] }
    return speaks(text, facts.map(f => `${f.fact} ${f.testedOn}`).join(' ')) ? [{ text: toMetric(text, 'vi'), cites: [{ url: o.testUrl! }] }] : []
  })
  const r = { agree, differ, single, measured }
  return { ...(emptyReviews(r) ? {} : { reviews: r }), tested, problems }
}

/** The one writing call (a second only when the first breaks a rule). */
export async function writeReviews(llm: Llm, t: ReviewTarget, reviews: ReviewInput[], tests: TestFact[], options: { channels: string[]; controlled: boolean; testUrl?: string; model?: string }): Promise<Merged & { calls: number }> {
  const o = { ...options, name: `${t.brand} ${t.model}` }
  const call = (notes?: string[]) => llm<Written>({
    system: 'Bạn viết phần tóm tắt các bài review sản phẩm bằng tiếng Việt, chỉ từ dữ kiện được đưa. Chỉ trả lời bằng JSON.', schema: WRITE_SCHEMA, model: o.model ?? 'opus',
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước phạm các lỗi sau. Viết lại, sửa hết:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\nSản phẩm: ${t.brand} ${t.model}\n\n--- ĐẦU VÀO ---\n${JSON.stringify(inputFor(reviews, tests), null, 1)}`,
  })
  const first = mergeWritten(await call(), reviews, tests, o)
  if (!first.problems.length) return { ...first, calls: 1 }
  return { ...mergeWritten(await call(first.problems), reviews, tests, o), calls: 2 }
}

/**
 * AquaTome's own test notes that answer a buyer's question about a Chihiros light: docs/research/aquarium-device-control.md,
 * "Hands-on results". One light was tested, so each says which. Week Aqua's results are left out: a page mustn't read as if
 * we support them.
 */
export const TEST_NOTES = { url: 'https://github.com/deathemperor/aquatome.com/blob/main/docs/research/aquarium-device-control.md#hands-on-results-2026-10-31', title: 'Ghi chép thử nghiệm của AquaTome: điều khiển đèn thủy sinh qua Bluetooth (31/10/2026)' }
const TESTED_ON = 'Chihiros WRGB II Slim, firmware 24'
export const CHIHIROS_TESTS: TestFact[] = [
  { testedOn: TESTED_ON, fact: 'A power cut resets the light\'s clock to zero. Its saved schedule runs on that clock, so the clock has to be set again after a power cut.' },
  { testedOn: TESTED_ON, fact: 'The light can report its saved schedule when asked, but not the manual level set on each channel: a control app has to remember those itself.' },
  { testedOn: TESTED_ON, fact: 'A saved schedule read back from the light shows one level, the first channel\'s. The other channels\' schedule levels can\'t be read back.' },
  { testedOn: TESTED_ON, fact: 'A new schedule replaces the saved one rather than adding to it.' },
]
export const testsFor = (brand: string, model: string): TestFact[] => (controlOf(brand, model)?.kind === 'light' ? CHIHIROS_TESTS : [])

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** Sources after this run's reviews: earlier reviews' off the end (specs point at those before them), these added. */
export function sourcesWith(e: ProductEntity, videos: { url: string; title: string }[], notes: { url: string; title: string } | undefined, at: string): ProductEntity['sources'] {
  const old = new Set([...(e.reviews?.videos ?? []).map(v => watchUrl(v.youtubeId)), TEST_NOTES.url])
  const base = [...e.sources]
  while (base.length && old.has(base.at(-1)!.url)) base.pop()
  const known = new Set(base.map(s => s.url))
  return [...base, ...videos.filter(v => !known.has(v.url)).map(v => ({ ...v, kind: 'video' as const, at })), ...(notes && !known.has(notes.url) ? [{ ...notes, kind: 'test' as const, at }] : [])]
}

export type ReviewReport = { id: string; videos: string[]; dropped: { id: string; why: string }[]; calls: number; written: boolean; note?: string; problems: string[]; reviews?: Translation['reviews']; tested?: Translation['tested'] }

/**
 * A product page's review summary, from what YouTube has: 1 vet, 1 extraction a review, 1 writing call (2 when the first
 * breaks a rule). Reviews that can't back a point leave the page as it was. `dryRun`: nothing written, the result returned.
 */
export async function reviewProduct(contentRoot: string, d: ReviewDeps & { now: () => Date }, id: string, t: ReviewTarget, o: { keep?: number; extractModel?: string; writeModel?: string; dryRun?: boolean } = {}): Promise<ReviewReport> {
  const dir = join(contentRoot, 'products', id)
  const entity = ProductSchema.parse(JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')))
  const vi = TranslationSchema.parse(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')))
  const found = await findReviews(d, t, { keep: o.keep ?? 3 })
  const dropped = [...found.dropped]
  let calls = found.calls
  const used: { v: ReviewVideo; input: ReviewInput }[] = []
  for (const v of found.videos) {
    const x = await extractFindings(d.llm, v, t, o.extractModel)
    calls++
    if (x) used.push({ v, input: { url: watchUrl(v.id), ...x } }); else dropped.push({ id: v.id, why: 'nothing it found, once read' })
  }
  const tests = testsFor(entity.brand, entity.model)
  const report = { id, videos: used.map(u => u.v.id), dropped, calls }
  if (!used.length && !tests.length) return { ...report, written: false, note: 'no reviews with findings', problems: [] }
  const m = await writeReviews(d.llm, t, used.map(u => u.input), tests, {
    channels: used.map(u => u.v.channel).filter(c => c.trim().toLowerCase() !== entity.brand.trim().toLowerCase()),
    controlled: !!controlOf(entity.brand, entity.model), ...(tests.length ? { testUrl: TEST_NOTES.url } : {}), ...(o.writeModel ? { model: o.writeModel } : {}),
  })
  calls += m.calls
  const out = { ...report, calls, problems: m.problems, ...(m.reviews ? { reviews: m.reviews } : {}), ...(m.tested.length ? { tested: m.tested } : {}) }
  if (!m.reviews && !m.tested.length) return { ...out, written: false, note: 'nothing passed its checks' }
  if (o.dryRun) return { ...out, written: false, note: 'dry run' }

  const today = d.now().toISOString().slice(0, 10)
  const citedVideos = new Set([...(m.reviews?.agree ?? []), ...(m.reviews?.single ?? []), ...(m.reviews?.differ ?? []).flatMap(x => x.sides)].flatMap(p => p.cites.map(c => c.url)).concat((m.reviews?.measured ?? []).map(x => x.cite.url)))
  // What this run didn't replace stays: a refresh that finds no reviews doesn't wipe the ones the page has.
  const videos = m.reviews
    ? used.filter(u => citedVideos.has(watchUrl(u.v.id))).map(u => ({ youtubeId: u.v.id, title: u.v.title, durationSec: u.v.durationSec, lang: u.v.lang, channel: u.v.channel }))
    : entity.reviews?.videos ?? []
  const reviews = m.reviews ?? vi.reviews
  const tested = m.tested.length ? m.tested : vi.tested
  const { reviews: _old, ...base } = entity
  const next: ProductEntity = ProductSchema.parse({
    ...base, sources: sourcesWith(entity, videos.map(v => ({ url: watchUrl(v.youtubeId), title: v.title })), tested?.length ? TEST_NOTES : undefined, today), updatedAt: today,
    ...(videos.length ? { reviews: { checkedAt: today, videos } } : {}),
  })
  const { reviews: _r, tested: _t, ...rest } = vi
  const nextVi: Translation = TranslationSchema.parse({ ...rest, ...(reviews ? { reviews } : {}), ...(tested?.length ? { tested } : {}) })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(next, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(nextVi, null, 2)}\n`)
  return { ...out, written: true }
}

/** What a candidate needs to get a page, and to find its reviews. */
export type Candidate = ReviewTarget & { id: string; ask: ProductAsk; tier: 1 | 2 | 3; links: number }

/** The lights to do first: the owner's order, for the lines the tool drives. The other lines rank with everything else. */
const LIGHTS_FIRST = ['WRGB II', 'WRGB II Slim', 'WRGB II Pro', 'C II', 'C II RGB', 'WRGB VIVID III', 'Universal WRGB', 'SEA', 'Commander 4']
/**
 * One page a plug maker: strips in Vietnam are mostly unbranded ones on the maker's platform, so a buyer asks about the
 * platform, and the app switches any of them. Sonoff (eWeLink) joins when the app can (@aq/schema PLUG_FAMILIES).
 */
const PLUG_PAGES: Record<string, ReviewTarget> = {
  tuya: {
    brand: 'Tuya', model: 'Smart Life power strip',
    queries: ['tuya smart plug review', 'smart life power strip review', 'đánh giá ổ cắm thông minh tuya'],
    titleWords: [['tuya', 'smart life', 'smartlife'], ['plug', 'strip', 'socket', 'o cam', 'outlet', 'power bar']],
  },
}

const readJson = async <T,>(p: string): Promise<T | undefined> => { try { return JSON.parse(await readFile(p, 'utf8')) as T } catch { return undefined } }
const idOf = (brand: string, model: string) => slugify(`${brand} ${model}`)
/** The same product however it's written: a line of a light we control, else its maker and model's words. */
const keyOf = (brand: string, model: string) => { const line = brand.toLowerCase() === 'chihiros' ? chihirosLine(model) : undefined; return `${words(brand).join('')}|${words(line ?? model).join('')}` }

/**
 * The products to write or refresh, in order: the Chihiros lights AquaTome controls, the plugs it switches, then the kit our
 * pages point readers to, most-linked first. A link is a video guide naming it (series are guides, gear.ts creatorsUse), or a
 * species or plant page whose shop keywords name it, or an equipment guide's text. Kit outside the equipment guides' categories
 * (paint, glue, fertilizer brands) isn't a candidate. Whether it is sold in Vietnam takes research: makeProduct's shop prices.
 */
export async function productCandidates(contentRoot: string): Promise<Candidate[]> {
  const kit = await readKit(contentRoot)
  const kindOf = (cat: string, type?: string) => { const k = kit.find(x => x.category === cat); return k?.types.find(t => t.id === type)?.name ?? k?.name ?? cat }
  const list = async (kind: string) => readdir(join(contentRoot, kind)).catch(() => [] as string[])
  const pages: ProductEntity[] = []
  for (const id of await list('products')) { const e = await readJson<ProductEntity>(join(contentRoot, 'products', id, 'entity.json')); if (e) pages.push(e) }
  // A page's own id over the one a video's spelling would make: "Chihiros WRGB 2" is chihiros-wrgb-ii.
  const pageIds = new Map(pages.map(e => [keyOf(e.brand, e.model), e.id]))
  const idFor = (brand: string, model: string) => pageIds.get(keyOf(brand, model)) ?? idOf(brand, model)
  const light = (line: string, tier: 1 | 3, links: number): Candidate => ({ id: idFor('Chihiros', line), brand: 'Chihiros', model: line, tier, links, ask: { brand: 'Chihiros', model: line, category: 'den', type: 'thuy-sinh', kind: kindOf('den', 'thuy-sinh') } })
  // Named kit: most guides first.
  const named = new Map<string, { brand: string; model: string; category: string; type?: string; guides: Set<string> }>()
  for (const id of await list('guides')) {
    const v = (await readJson<{ video?: { gear?: { category: string; type?: string; brand?: string; model?: string }[] } }>(join(contentRoot, 'guides', id, 'entity.json')))?.video
    for (const g of v?.gear ?? []) {
      if (!g.brand || !g.model || !kit.some(k => k.category === g.category)) continue
      const k = keyOf(g.brand, g.model)
      const e = named.get(k) ?? { brand: g.brand, model: g.model, category: g.category, ...(g.type ? { type: g.type } : {}), guides: new Set<string>() }
      e.guides.add(id)
      named.set(k, e)
    }
  }
  // Pages' words: the shop keywords, the equipment guides' text.
  const texts: string[] = []
  for (const kind of ['species', 'plants']) for (const id of await list(kind)) {
    const slots = (await readJson<{ productSlots?: { keywords: string[] }[] }>(join(contentRoot, kind, id, 'entity.json')))?.productSlots ?? []
    const ks = slots.flatMap(s => s.keywords)
    if (ks.length) texts.push(words(ks.join(' , ')).join(' '))
  }
  for (const f of (await readdir(join(contentRoot, 'equipment')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const eq = await readJson<unknown>(join(contentRoot, 'equipment', f))
    if (eq) texts.push(words(JSON.stringify(eq)).join(' '))
  }
  const linksIn = (brand: string, model: string) => { const name = ` ${[...words(brand), ...words(model)].join(' ')} `; return texts.filter(t => ` ${t} `.includes(name)).length }
  const score = (e: { brand: string; model: string; guides?: Set<string> }) => (e.guides?.size ?? 0) + linksIn(e.brand, e.model)

  const out: Candidate[] = []
  const taken = new Set<string>()
  const add = (c: Candidate) => { const k = keyOf(c.brand, c.model); if (!taken.has(k)) { taken.add(k); out.push(c) } }
  const lineLinks = (line: string) => { const guides = named.get(keyOf('Chihiros', line))?.guides; return score({ brand: 'Chihiros', model: line, ...(guides ? { guides } : {}) }) }
  for (const line of LIGHTS_FIRST.filter(l => CHIHIROS_LINES.includes(l))) add(light(line, 1, lineLinks(line)))
  for (const t of Object.values(PLUG_PAGES)) if (controlOf(t.brand, t.model)) add({ ...t, id: idFor(t.brand, t.model), tier: 2, links: 0, ask: { brand: t.brand, model: t.model, category: 'o-cam', kind: 'Ổ cắm thông minh Wi-Fi' } })
  const ask = (e: { brand: string; model: string; category: string; type?: string }) => ({ brand: e.brand, model: e.model, category: e.category, ...(e.type ? { type: e.type } : {}), kind: kindOf(e.category, e.type) })
  const rest: Candidate[] = [
    ...CHIHIROS_LINES.filter(l => !LIGHTS_FIRST.includes(l)).map(l => light(l, 3, lineLinks(l))),
    ...[...named.values()].map(e => ({ id: idFor(e.brand, e.model), brand: e.brand, model: e.model, tier: 3 as const, links: score(e), ask: ask(e) })),
    // The pages we already have, linked or not, get their reviews too.
    ...pages.map(e => ({ id: e.id, brand: e.brand, model: e.model, tier: 3 as const, links: score(e), ask: ask(e) })),
  ]
  for (const c of rest.sort((a, b) => b.links - a.links || a.id.localeCompare(b.id))) add(c)
  return out
}

/** engine-state/_product-reviews.json: each candidate's last turn. */
export type ReviewState = Record<string, { at: string; status: 'written' | 'no-reviews' | 'not-sold' | 'error'; videos?: string[]; note?: string; attempts?: number }>
const FILE = (root: string) => join(root, 'engine-state/_product-reviews.json')
export const readReviewState = async (root: string): Promise<ReviewState> => (await readJson<ReviewState>(FILE(root))) ?? {}
const DAY = 86_400_000
/** How long a turn stands: a summary 3 months, no reviews yet 1, a product research couldn't find 6; a failure a day, 3 tries. */
export function isDue(s: ReviewState[string] | undefined, now: Date): boolean {
  if (!s) return true
  const age = now.getTime() - Date.parse(s.at)
  if (s.status === 'error') return (s.attempts ?? 1) < 3 && age > DAY
  return age > (s.status === 'written' ? 90 : s.status === 'no-reviews' ? 30 : 180) * DAY
}

export type CycleDeps = ReviewDeps & { research: Llm; get: (url: string) => Promise<string>; now: () => Date }
export type CycleReport = { done: ReviewReport[]; skipped: string[]; stopped?: string }

/**
 * `limit` products, most wanted first: a page if it has none (makeProduct: a long research call, so `noNewPages` late in a
 * cycle leaves those for the next), then its review summary. YouTube throttling or the model's limit stops the run, marking
 * nothing failed.
 */
export async function productReviews(root: string, d: CycleDeps, o: { limit?: number; only?: string[]; noNewPages?: boolean; dryRun?: boolean; researchModel?: string; extractModel?: string; writeModel?: string } = {}): Promise<CycleReport> {
  const contentRoot = join(root, 'content')
  const report: CycleReport = { done: [], skipped: [] }
  const state = await readReviewState(root)
  const save = async (id: string, s: ReviewState[string]) => {
    state[id] = s
    if (o.dryRun) return
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(FILE(root), `${JSON.stringify(state, null, 2)}\n`)
  }
  const candidates = await productCandidates(contentRoot)
  const now = d.now()
  let left = o.limit ?? 1
  for (const c of candidates) {
    if (left <= 0) break
    if (o.only ? !o.only.includes(c.id) : !isDue(state[c.id], now)) continue
    const hasPage = await readFile(join(contentRoot, 'products', c.id, 'entity.json')).then(() => true, () => false)
    if (!hasPage && (o.noNewPages || o.dryRun)) { report.skipped.push(`${c.id}: no page yet`); continue }
    left--
    const at = now.toISOString()
    try {
      if (!hasPage) {
        // A light or plug we control gets its page; other kit only if it's sold here, which research finds out.
        const made = await makeProduct(contentRoot, { research: d.research, llm: d.llm, get: d.get, now: d.now }, c.ask, { ...(o.researchModel ? { researchModel: o.researchModel } : {}), factsDir: join(root, 'engine-state/products'), requireShopPrice: c.tier === 3 })
        if (!made.id) { report.skipped.push(`${c.id}: ${made.skipped}`); await save(c.id, { at, status: 'not-sold', note: made.skipped ?? '' }); continue }
      }
      const r = await reviewProduct(contentRoot, d, c.id, c, { ...(o.extractModel ? { extractModel: o.extractModel } : {}), ...(o.writeModel ? { writeModel: o.writeModel } : {}), ...(o.dryRun ? { dryRun: true } : {}) })
      report.done.push(r)
      await save(c.id, { at, status: r.written ? 'written' : 'no-reviews', videos: r.videos, ...(r.note ? { note: r.note } : {}) })
    } catch (e) {
      if (e instanceof LlmError || throttled(e)) { report.stopped = `${c.id}: ${(e as Error).message.slice(0, 200)}`; return report }
      report.skipped.push(`${c.id}: ${(e as Error).message.slice(0, 200)}`)
      await save(c.id, { at, status: 'error', note: (e as Error).message.slice(0, 200), attempts: (state[c.id]?.attempts ?? 0) + 1 })
    }
  }
  return report
}
