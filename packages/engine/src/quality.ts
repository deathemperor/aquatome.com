import { readFileSync } from 'node:fs'
import type { Llm } from './claude'

import { QUALITY_THRESHOLD } from '@aq/schema'

export { QUALITY_THRESHOLD }
const TEMPLATE = readFileSync(new URL('./prompts/review.md', import.meta.url), 'utf8')
const SCHEMA = { type: 'object', properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } }, required: ['score', 'notes'] }

/** A second Claude pass scores fidelity + fluency of the Vietnamese against the English (0–1). */
export async function reviewTranslation(llm: Llm, sections: { en: string; vi: string }[]): Promise<{ score: number; notes: string[] }> {
  const pairs = sections.map((s, i) => `### ${i + 1}\nEN:\n${s.en}\nVI:\n${s.vi}`).join('\n\n')
  const r = await llm<{ score: number; notes: string[] }>({ system: 'You are a strict English→Vietnamese translation reviewer. Reply only with JSON.', prompt: `${TEMPLATE}\n\n${pairs.slice(0, 80_000)}`, schema: SCHEMA })
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10) }
}

const SAME = `Two Vietnamese versions of the same aquarium-handbook text: BEFORE, and AFTER (a rewrite for natural style, with no English source to check against).
Score 0–1 how faithfully AFTER keeps BEFORE's content: 1.0 = every fact, number, unit, name, caution and the source's attribution kept, nothing added; 0.75 = small nuance lost; below 0.75 = a fact, number, warning or caveat dropped, changed or added, or a hedge turned into a certainty.
notes: up to 10 short, concrete problems (in English), quoting the phrase. Empty if none.`

/** For text with no English source: does a style rewrite keep the old Vietnamese's meaning? (0–1, like reviewTranslation.) */
export async function reviewRewrite(llm: Llm, parts: { before: string; after: string }[]): Promise<{ score: number; notes: string[] }> {
  const body = parts.map((p, i) => `### ${i + 1}\nBEFORE:\n${p.before}\nAFTER:\n${p.after}`).join('\n\n')
  const r = await llm<{ score: number; notes: string[] }>({ system: 'You are a strict Vietnamese editor checking a rewrite. Reply only with JSON.', prompt: `${SAME}\n\n${body.slice(0, 80_000)}`, schema: SCHEMA })
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10) }
}

export function gate(score: number, retried: boolean): 'pass' | 'retry' | 'noindex' {
  if (score >= QUALITY_THRESHOLD) return 'pass'
  return retried ? 'noindex' : 'retry'
}
