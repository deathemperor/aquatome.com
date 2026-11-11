import { readFileSync } from 'node:fs'
import raw from './ceilings.json'

/**
 * Dollars a step may spend on the model in one Asia/Saigon day, from `from` on. A later table replaces the earlier ones,
 * so a ruling can set several days at once. `default` is every step not named in `steps`; null is no ceiling; 0 is no call.
 */
export type CeilingTable = {
  from: string
  default: number
  steps: { [step: string]: number | null }
}

// The JSON's known keys are the same shape; the index signature is what a step name looks up.
export const CEILINGS: CeilingTable[] = raw as CeilingTable[]

/** The owner's day, in Vietnam: a cycle runs on UTC, and a ceiling is one calendar day there. */
export const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

/** The last table whose `from` is not after `now`. None before the first, or from an empty list. */
export function tableInForce(tables: readonly CeilingTable[], now: Date): CeilingTable | undefined {
  let chosen: CeilingTable | undefined
  const t = now.getTime()
  for (const table of tables) {
    const from = new Date(table.from).getTime()
    if (!Number.isNaN(from) && from <= t) chosen = table
  }
  return chosen
}

/**
 * What `step` has spent on `now`'s Asia/Saigon day, from the cost log. Read on every call: another process of the same
 * step appends to the same file. A missing or unreadable file, a broken line, and a line with no step count as nothing.
 */
export function spentToday(log: string, step: string, now: Date): number {
  let text: string
  try {
    text = readFileSync(log, 'utf8')
  } catch {
    return 0
  }
  const day = vnDay(now)
  let sum = 0
  for (const line of text.split('\n')) {
    if (!line) continue
    let row: { step?: unknown; at?: unknown; usd?: unknown }
    try {
      row = JSON.parse(line) as { step?: unknown; at?: unknown; usd?: unknown }
    } catch {
      continue
    }
    if (typeof row.step !== 'string' || row.step !== step || typeof row.at !== 'string') continue
    const at = new Date(row.at)
    if (Number.isNaN(at.getTime()) || vnDay(at) !== day) continue
    if (typeof row.usd === 'number' && Number.isFinite(row.usd)) sum += row.usd
  }
  return sum
}

const dollars = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Nothing when the call may go. The failure message when `step` is at or over its ceiling for today: it starts with
 * "claude failed" and says "limit reached", which errorKind (state.ts) already classes as a usage limit. No step, no
 * cost log, or no ceiling: the call goes.
 */
export function ceilingMessage(step: string | undefined, log: string | undefined, tables: readonly CeilingTable[], now = new Date()): string | undefined {
  if (!step || !log) return
  const table = tableInForce(tables, now)
  if (!table) return
  const cap = Object.hasOwn(table.steps, step) ? table.steps[step] : table.default
  if (cap == null) return
  const spent = spentToday(log, step, now)
  if (spent < cap) return
  return `claude failed: the engine's daily limit reached for ${step} ($${spent.toFixed(2)} of $${dollars(cap)} today)`
}
