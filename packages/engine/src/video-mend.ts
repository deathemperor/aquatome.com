import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { FIT_TITLE, type FitFinding } from './fit'
import type { Mend } from './gate'
import type { Page } from './pages'
import { norm, render } from './reader'
import { logReviews } from './review-log'
import { roundPage } from './round'
import { plainParts, sanitizeHtml, unescapePlain } from './sanitize'
import { setHold } from './video-hold'
import { fixDraft, reviewDraft, type Draft, type WriteOpts, type YouTube } from './youtube'

/** What the mender's editor is told to do, said to its reviewer: a foreign price turned into the comparison it makes is a fact kept (the Writing Lead's ruling, 2026-11-11). */
const REVIEW_NOTE = readFileSync(new URL('./prompts/video-mend-review.md', import.meta.url), 'utf8')

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
 * is then the page's. False, and the file as it was: not a Vietnamese video guide, a text a person fixed, no transcript on
 * this Mac, a broken edit, a sentence left in, or a review under both.
 */
export const videoMend = (root: string, d: { llm: Llm; yt: Pick<YouTube, 'transcript' | 'transcribe'>; now?: () => Date; write?: WriteOpts }): Mend => async (p: Page, findings: FitFinding[]) => {
  if (p.lang !== 'vi' || p.kind !== 'guides' || !findings.length) return false
  const contentRoot = join(root, 'content')
  const dir = join(contentRoot, 'guides', p.id)
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as GuideEntity
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  if (e.source !== 'youtube' || !e.video || vi.bodyFixed || vi.faqFixed) return false
  const lang = e.video.lang ?? 'en'
  const transcript = (e.video.transcribed ? null : await d.yt.transcript(e.video.youtubeId, lang)) ?? (await d.yt.transcribe?.(e.video.youtubeId, lang)) ?? null
  if (!transcript) return false

  const draft: Draft = { relevant: true, kind: e.kind, viTitle: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [], chapters: vi.chapters ?? [] }
  const notes = findings.map(f => `"${f.quote}": ${FIT_TITLE[f.check]} (${f.why})`)
  const fixed = await fixDraft(d.llm, transcript, draft, notes, { ...d.write, lang, reader: true })
  if (!fixed) return false
  // The title only when a fault was in it: a guide's name isn't the editor's to change otherwise.
  const name = findings.some(f => f.part === 'T') ? unescapePlain(fixed.viTitle).trim() : vi.name
  const text = norm([name, ...fixed.summary, render(sanitizeHtml(fixed.body)), ...fixed.faq.flatMap(f => [f.q, f.a])].join('\n'))
  if (findings.some(f => text.includes(norm(f.quote)))) return false

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
