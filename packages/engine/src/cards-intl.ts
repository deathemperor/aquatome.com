import { createHash } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cardShownIn, CardTextSchema, QUALITY_THRESHOLD, type CardText } from '@aq/schema'
import type { Llm } from './claude'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { TARGETS, type TargetLang } from './localize'

/**
 * The app's short cards (content/cards/<id>) in Indonesian, Thai and Malay. The Vietnamese card is written from dated
 * sources and passes the editors and the gate; the others are translated from it, not written again, since a card is
 * about 80 words of facts whose every figure and date is its sources'. Each is kept only when its reviewer, holding it to
 * the Vietnamese card, passes it, and it fits the card (CardTextSchema: eyebrow 24 characters, title 70). The gate then
 * reads it in the cycle, as it reads every card. engine-state/_cards-intl.json has the Vietnamese text each was made from.
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

/** What each translation was made from: the Vietnamese card's hash, by `<lang>/<id>` (engine-state/_cards-intl.json). */
const MADE = 'engine-state/_cards-intl.json'
export const cardHash = (t: CardText) => createHash('sha1').update(JSON.stringify([t.eyebrow, t.title, t.body])).digest('hex').slice(0, 16)
const exists = (path: string) => readFile(path, 'utf8').then(() => true, () => false)

/**
 * One card in one language: written, reviewed, written again once with the review's notes if it didn't pass. A translation
 * of an older Vietnamese text is made again, and taken down if the new one isn't kept; one whose Vietnamese card is held
 * back is taken down, so no language shows what Vietnamese readers don't get.
 */
export async function localizeCard(root: string, llm: Llm, id: string, lang: TargetLang, o: { model?: string; redo?: boolean } = {}): Promise<CardDone> {
  const dir = join(root, 'content/cards', id)
  const file = join(dir, `${lang}.json`), key = `${lang}/${id}`
  const vi = CardTextSchema.parse(JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')))
  const entity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as { event?: { country: string } }
  // An event in another reader's country shows only there: a betta show in Hà Nội isn't translated.
  if (!cardShownIn(entity, lang)) return { id, skipped: `an event in ${entity.event!.country}, shown only in its country's language` }
  const made = JSON.parse(await readFile(join(root, MADE), 'utf8').catch(() => '{}')) as Record<string, string>
  const save = () => writeFile(join(root, MADE), `${JSON.stringify(Object.fromEntries(Object.entries(made).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  const had = await exists(file)
  if (vi.held) {
    if (!had) return { id, skipped: 'held back in Vietnamese' }
    await rm(file); delete made[key]; await save()
    return { id, skipped: 'held back in Vietnamese: its translation taken down' }
  }
  const from = cardHash(vi)
  if (!o.redo && had && made[key] === from) return { id, skipped: 'done' }
  const attempt = async (notes: string[]) => {
    const w = await llm<CardText>({ system: `You translate the AquaTome app's short cards into ${TARGETS[lang].lang}. Reply only with JSON.`, model: o.model ?? 'opus', schema: WRITE_SCHEMA, prompt: writePrompt(lang, vi, notes) })
    const t = { eyebrow: unescapePlain(w.eyebrow).trim(), title: unescapePlain(w.title).trim(), body: sanitizeHtml(w.body) }
    const fits = CardTextSchema.safeParse(t)
    const r = await llm<{ score: number; notes: string[] }>({ system: 'You check a translated card against the Vietnamese one. Reply only with JSON.', model: o.model ?? 'opus', schema: REVIEW_SCHEMA, prompt: reviewPrompt(lang, vi, t) })
    const size = fits.success ? [] : fits.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    const score = Math.min(1, Math.max(0, Number(r.score) || 0))
    return { t, score, notes: [...size, ...(r.notes ?? [])], fits: fits.success, ok: fits.success && score >= QUALITY_THRESHOLD }
  }
  let best = await attempt([])
  if (!best.ok) {
    const again = await attempt(best.notes)
    if ((again.fits && !best.fits) || (again.fits === best.fits && again.score > best.score)) best = again
  }
  if (best.ok) {
    await writeFile(file, `${JSON.stringify(CardTextSchema.parse(best.t), null, 2)}\n`)
    made[key] = from
  } else if (had && made[key] !== from) {
    // What's there was translated from an older Vietnamese card, which may have been corrected since.
    await rm(file); delete made[key]
  }
  await save()
  return { id, score: best.score, kept: best.ok, notes: best.notes }
}

/** Every card (or `only`), in id order; a card that fails is reported and the rest go on. */
export async function localizeCards(root: string, llm: Llm, lang: TargetLang, o: { only?: string[]; model?: string; redo?: boolean } = {}): Promise<CardDone[]> {
  const dir = join(root, 'content/cards')
  const ids = o.only ?? (await readdir(dir).catch(() => [] as string[])).sort()
  const out: CardDone[] = []
  for (const id of ids) {
    if (!(await exists(join(dir, id, 'vi.json')))) continue
    out.push(await localizeCard(root, llm, id, lang, o).catch(e => ({ id, skipped: `failed: ${(e as Error).message.slice(0, 200)}` })))
  }
  return out
}
