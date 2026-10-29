/** Shared bits of the Vietnamese writing evals: cached steps, a small worker pool, a blind pairwise tally. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LlmError } from '../src/claude'

export const cachedIn = (dir: string) => async <T>(file: string, make: () => Promise<T>): Promise<T> => {
  try { return JSON.parse(await readFile(join(dir, file), 'utf8')) } catch { /* not yet */ }
  const v = await make()
  await writeFile(join(dir, file), JSON.stringify(v, null, 2))
  return v
}
export const retry = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f() } catch (e) { if (!(e instanceof LlmError)) throw e; return f() } }
export async function pool<T>(jobs: (() => Promise<T>)[], n = 3): Promise<T[]> {
  const out: T[] = []
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const j = i++; out[j] = await jobs[j]!() } }))
  return out
}

export type Verdict = { better: 'X' | 'Y' | 'tie'; naturalX: number; naturalY: number; worstX?: string[]; worstY?: string[]; why: string }
export const verdictSchema = (worst: boolean) => ({
  type: 'object', required: ['better', 'naturalX', 'naturalY', 'why', ...(worst ? ['worstX', 'worstY'] : [])],
  properties: {
    better: { type: 'string', enum: ['X', 'Y', 'tie'] }, naturalX: { type: 'number' }, naturalY: { type: 'number' }, why: { type: 'string' },
    ...(worst ? { worstX: { type: 'array', items: { type: 'string' } }, worstY: { type: 'array', items: { type: 'string' } } } : {}),
  },
})
/** Every pair of variants, in both orders (position bias cancels out). */
export const pairs = (names: string[]) => names.flatMap((a, i) => names.slice(i + 1).flatMap(b => [[a, b], [b, a]] as [string, string][]))

export function tally(names: string[], rows: { x: string; y: string; v: Verdict }[]) {
  const stat = Object.fromEntries(names.map(n => [n, { wins: 0, losses: 0, ties: 0, natural: [] as number[], worst: [] as string[] }]))
  for (const { x, y, v } of rows) {
    stat[x]!.natural.push(v.naturalX); stat[y]!.natural.push(v.naturalY)
    stat[x]!.worst.push(...(v.worstX ?? [])); stat[y]!.worst.push(...(v.worstY ?? []))
    if (v.better === 'tie') { stat[x]!.ties++; stat[y]!.ties++ } else { const [w, l] = v.better === 'X' ? [x, y] : [y, x]; stat[w!]!.wins++; stat[l!]!.losses++ }
  }
  return stat
}
export const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(2)
