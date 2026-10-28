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

export function gate(score: number, retried: boolean): 'pass' | 'retry' | 'noindex' {
  if (score >= QUALITY_THRESHOLD) return 'pass'
  return retried ? 'noindex' : 'retry'
}
