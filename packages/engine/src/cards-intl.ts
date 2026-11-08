import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CardTextSchema, QUALITY_THRESHOLD, type CardText } from '@aq/schema'
import type { Llm } from './claude'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { TARGETS, type TargetLang } from './localize'

/**
 * The app's short cards (content/cards/<id>) in Indonesian, Thai and Malay. The Vietnamese card is written from dated
 * sources and passes the editors and the gate; the others are translated from it, not written again, since a card is
 * about 80 words of facts whose every figure and date is its sources'. Each is kept only when its reviewer, holding it to
 * the Vietnamese card, passes it, and it fits the card (CardTextSchema: eyebrow 24 characters, title 70). The gate then
 * reads it in the cycle, as it reads every card. A card held back in Vietnamese isn't translated.
 */
const WRITE_SCHEMA = { type: 'object', additionalProperties: false, required: ['eyebrow', 'title', 'body'], properties: { eyebrow: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } }
const REVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } }

const writePrompt = (lang: TargetLang, vi: CardText, notes: string[]) => {
  const T = TARGETS[lang]
  return [
    `Translate this short card from the AquaTome app from Vietnamese into ${T.lang}, for an aquarium hobbyist in ${T.country}. ${T.style}`,
    '- Say what the Vietnamese says, no more and no less: each figure, date, place, name and source as it gives them, and as sure or unsure as it is. A scientific name stays as it is, in <em>.',
    '- eyebrow: at most 24 characters. title: at most 70 characters. body: HTML, the same paragraphs and tags as the Vietnamese.',
    ...(notes.length ? [`The last translation was sent back for these. Fix them:\n${notes.map(n => `- ${n}`).join('\n')}`] : []),
    `CARD:\n${JSON.stringify({ eyebrow: vi.eyebrow, title: vi.title, body: vi.body })}`,
  ].join('\n\n')
}
const reviewPrompt = (lang: TargetLang, vi: CardText, t: CardText) => `Below is a short card in Vietnamese and its ${TARGETS[lang].lang} translation. Score 0–1: 1.0 = it says exactly what the Vietnamese says (every figure, date, name and claim, as sure or unsure), in words a hobbyist in ${TARGETS[lang].country} would write. Lower it for anything added, dropped, said more or less surely, or wrong, and for wording keepers there wouldn't use. notes: up to 6 problems, in English, quoting the words. Empty if none. Reply only with JSON.

VIETNAMESE:
${JSON.stringify({ eyebrow: vi.eyebrow, title: vi.title, body: vi.body })}

${TARGETS[lang].lang.toUpperCase()}:
${JSON.stringify({ eyebrow: t.eyebrow, title: t.title, body: t.body })}`

export type CardDone = { id: string; skipped?: string; score?: number; kept?: boolean; notes?: string[] }

/** One card in one language: written, reviewed, written again once with the review's notes if it didn't pass. */
export async function localizeCard(root: string, llm: Llm, id: string, lang: TargetLang, o: { model?: string; redo?: boolean } = {}): Promise<CardDone> {
  const dir = join(root, 'content/cards', id)
  const file = join(dir, `${lang}.json`)
  if (!o.redo && (await readFile(file, 'utf8').then(() => true, () => false))) return { id, skipped: 'done' }
  const vi = CardTextSchema.parse(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')))
  if (vi.held) return { id, skipped: 'held back in Vietnamese' }
  const attempt = async (notes: string[]) => {
    const w = await llm<CardText>({ system: `You translate the AquaTome app's short cards into ${TARGETS[lang].lang}. Reply only with JSON.`, model: o.model ?? 'opus', schema: WRITE_SCHEMA, prompt: writePrompt(lang, vi, notes) })
    const t = { eyebrow: unescapePlain(w.eyebrow).trim(), title: unescapePlain(w.title).trim(), body: sanitizeHtml(w.body) }
    const fits = CardTextSchema.safeParse(t)
    const r = await llm<{ score: number; notes: string[] }>({ system: 'You check a translated card against the Vietnamese one. Reply only with JSON.', model: o.model ?? 'opus', schema: REVIEW_SCHEMA, prompt: reviewPrompt(lang, vi, t) })
    const size = fits.success ? [] : fits.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    return { t, score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: [...size, ...(r.notes ?? [])], fits: fits.success }
  }
  let best = await attempt([])
  if (best.score < QUALITY_THRESHOLD || best.notes.length) {
    const again = await attempt(best.notes)
    if ((again.fits && !best.fits) || (again.fits === best.fits && again.score > best.score)) best = again
  }
  const kept = best.fits && best.score >= QUALITY_THRESHOLD
  if (kept) await writeFile(file, `${JSON.stringify(CardTextSchema.parse(best.t), null, 2)}\n`)
  return { id, score: best.score, kept, notes: best.notes }
}

/** Every card not yet in `lang` (or `only`, or all again with `redo`), in id order. */
export async function localizeCards(root: string, llm: Llm, lang: TargetLang, o: { only?: string[]; model?: string; redo?: boolean } = {}): Promise<CardDone[]> {
  const ids = o.only ?? (await readdir(join(root, 'content/cards')).catch(() => [] as string[])).sort()
  const out: CardDone[] = []
  for (const id of ids) out.push(await localizeCard(root, llm, id, lang, o))
  return out
}
