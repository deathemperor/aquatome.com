import { readFileSync } from 'node:fs'
import type { Llm } from './claude'
import { hedgesAsk, hedgesLost, HEDGES_SCHEMA, type HedgePair } from './hedges'
import { withTanks } from './round'

import { QUALITY_THRESHOLD } from '@aq/schema'

export { QUALITY_THRESHOLD }
/** Within this of the bar, a check's first read is read twice more: the same text read twice moves about ±0.06. */
export const NEAR_BAR = 0.2
/**
 * The band the page writer's and the translator's reviewers read three times in (the chief of staff, 2026-11-11): within 0.2,
 * 93-99% of their reads would be read three times, and a page they turn back is tried again anyway. Second reads, which move
 * a page in or out of search, keep NEAR_BAR.
 */
export const WRITER_BAND = 0.1
/**
 * A check read once, or, within `band` of the bar, three times: then the median read counts, its notes with it, and `reads`
 * has all three. `given`: a read already made, which counts as the first of the three.
 */
export async function steadyRead<T extends { score: number }>(read: () => Promise<T>, band = NEAR_BAR, given?: T): Promise<T & { reads?: number[] }> {
  const first = given ?? await read()
  if (Math.abs(first.score - QUALITY_THRESHOLD) >= band) return first
  const reads = [first, ...await Promise.all([read(), read()])]
  return { ...[...reads].sort((a, b) => a.score - b.score)[1]!, reads: reads.map(r => r.score) }
}
const TEMPLATE = withTanks(readFileSync(new URL('./prompts/review.md', import.meta.url), 'utf8'))
const SCHEMA = { type: 'object', properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['score', 'notes'] }
/** `hedges`: the reviewer also pairs each hedged sentence with its new one (hedges.ts), and `lost` has those said more surely. */
type Opts = { hedges?: boolean }
export type Review = { score: number; notes: string[]; lost: HedgePair[] }
const ask = (o: Opts, from: string, to: string) => (o.hedges
  ? { more: `\n\n${hedgesAsk(from, to)}`, schema: { ...SCHEMA, properties: { ...SCHEMA.properties, hedges: HEDGES_SCHEMA }, required: [...SCHEMA.required, 'hedges'] } }
  : { more: '', schema: SCHEMA })

/** A second Claude pass scores fidelity + fluency of the Vietnamese against the English (0–1). */
export async function reviewTranslation(llm: Llm, sections: { en: string; vi: string }[], o: Opts = {}): Promise<Review> {
  const pairs = sections.map((s, i) => `### ${i + 1}\nEN:\n${s.en}\nVI:\n${s.vi}`).join('\n\n')
  const { more, schema } = ask(o, 'EN', 'VI')
  const r = await llm<{ score: number; notes: string[]; hedges?: HedgePair[] }>({ system: 'You are a strict English→Vietnamese translation reviewer. Reply only with JSON.', prompt: `${TEMPLATE}${more}\n\n${pairs.slice(0, 80_000)}`, schema })
  const lost = hedgesLost(r.hedges ?? [], sections.map(s => s.en).join('\n'), sections.map(s => s.vi).join('\n'))
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10), lost }
}

const SAME = `Two Vietnamese versions of the same aquarium-handbook text: BEFORE, and AFTER (a rewrite for natural style, with no English source to check against).
Score 0–1 how faithfully AFTER keeps BEFORE's content: 1.0 = every fact, number, name, example, caution and the strength of praise or criticism kept, nothing added; 0.75 = small nuance lost; below 0.75 = a fact, number, warning or caveat dropped, changed or added, or a hedge turned into a certainty.
The editor is told to do these, so they are correct, not errors: converting US/imperial units to metric with sensible rounding, keeping the original only when it adds precision (inches → mm/cm, gallons → litres, °F → °C); writing the source's "I"/"we" as attribution to the source by name ("Theo Aquarium Breeder…") or neutrally; plainer everyday wording for the same thing; established Vietnamese hobby terms. Judge a converted number by whether the conversion is right.
notes: up to 10 short, concrete problems (in English), quoting the phrase. Empty if none.`

/** For text with no English source: does a style rewrite keep the old Vietnamese's meaning? (0–1, like reviewTranslation.) */
export async function reviewRewrite(llm: Llm, parts: { before: string; after: string }[], o: Opts = {}): Promise<Review> {
  const body = parts.map((p, i) => `### ${i + 1}\nBEFORE:\n${p.before}\nAFTER:\n${p.after}`).join('\n\n')
  const { more, schema } = ask(o, 'BEFORE', 'AFTER')
  const r = await llm<{ score: number; notes: string[]; hedges?: HedgePair[] }>({ system: 'You are a strict Vietnamese editor checking a rewrite. Reply only with JSON.', prompt: `${SAME}${more}\n\n${body.slice(0, 80_000)}`, schema })
  const lost = hedgesLost(r.hedges ?? [], parts.map(p => p.before).join('\n'), parts.map(p => p.after).join('\n'))
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10), lost }
}

export function gate(score: number, retried: boolean): 'pass' | 'retry' | 'noindex' {
  if (score >= QUALITY_THRESHOLD) return 'pass'
  return retried ? 'noindex' : 'retry'
}
