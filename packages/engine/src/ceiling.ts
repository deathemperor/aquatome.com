import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import raw from './ceilings.json'

/**
 * Dollars a step may spend on the model in one day, checked before every model call (claude.ts) against the cost log.
 * ceilings.json says which clock a day runs on and holds the tables. A table is in force from its `from` until the next
 * one's, so a ruling can set several days at once. Neither machine sees the other's log, so each has its own share of
 * the day: `mac` (the owner's Mac, where every job has a log of its own in one folder) and `github` (the rewrite's
 * runner, which keeps its log between runs).
 * - `steps`: a step's dollars a day. null is no ceiling: the gate and moderation, which the backstop doesn't stop
 *   either. 0 is no call.
 * - `default`: every step not named, so a new step is never without a ceiling.
 * - `backstop`: when everything logged on the machine that day reaches it, every step that has a ceiling stops.
 * A step stopped here fails its call the way Claude's own usage limit does (state.ts errorKind 'usage'), so it leaves
 * what a step out of its limit leaves: nothing written, no mark, no review logged (ceiling-stop.test.ts).
 */
export type Place = { default: number; backstop: number; steps: { [step: string]: number | null } }
export type CeilingTable = { from: string; note?: string; mac: Place; github: Place }
export type Ceilings = { clock: string; tables: CeilingTable[] }
export type Machine = 'mac' | 'github'

// The file's own keys are narrower than a step's name; ceiling.test.ts holds its shape.
export const CEILINGS = raw as unknown as Ceilings

/** The owner's day, in Vietnam (UTC+7, no summer time): a cycle runs on UTC, and a ceiling's day is a calendar day there. */
export const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

/** Where this process runs: GitHub's runners set GITHUB_ACTIONS, and anything else is the Mac. */
export const machine = (env: NodeJS.ProcessEnv = process.env): Machine => (env.GITHUB_ACTIONS === 'true' ? 'github' : 'mac')

/**
 * The name a call is counted under, and the one its line in the cost log has: the engine's command
 * (`pnpm engine <command>`), or for a script run by itself, the script's name. Never empty, so a logged call always
 * has a ceiling.
 */
export function stepName(argv: readonly string[] = process.argv): string {
  const script = basename(argv[1] ?? '').replace(/\.[cm]?[jt]s$/, '')
  const command = argv[2]
  if (script === 'cli' && command && !command.startsWith('-')) return command
  return script || 'unnamed'
}

/** Where a step run by hand logs its calls when no log is named (cli.ts), so it is counted like a cycle's. */
export const handLog = () => join(process.platform === 'darwin' ? join(homedir(), 'Library/Logs') : tmpdir(), 'aquatome-cost-hand.jsonl')

/** Before the first table, and with none in the file: nothing calls but the gate and moderation. */
const NOTHING: Place = { default: 0, backstop: 0, steps: { gate: null, moderate: null } }

/** The table in force: the one whose `from` is the latest that has passed, wherever it stands in the list. */
export function tableInForce(tables: readonly CeilingTable[], now: Date): CeilingTable | undefined {
  let chosen: CeilingTable | undefined
  let latest = -Infinity
  for (const table of tables) {
    const from = Date.parse(table.from)
    if (Number.isNaN(from) || from > now.getTime() || from <= latest) continue
    chosen = table
    latest = from
  }
  return chosen
}

/** The logs a day's spend is read from: `log`, and every `aquatome-cost-*.jsonl` beside it (a job a file, on the Mac). */
function logsBeside(log: string): string[] {
  const dir = dirname(resolve(log))
  let names: string[] = []
  try {
    names = readdirSync(dir).filter(n => /^aquatome-cost-.*\.jsonl$/.test(n))
  } catch {
    // The folder can't be listed: `log` alone.
  }
  return [...new Set([resolve(log), ...names.map(n => join(dir, n))])]
}

/**
 * What was spent on `now`'s day, in all and by step, from the cost logs beside `log`. Read on every call: other jobs
 * append to them. A call still running isn't logged yet, so two jobs on one step can pass a ceiling by the calls they
 * had in the air. A missing file, a broken line and a line with no cost count as nothing; a line with no step counts
 * in the total alone.
 */
export function spentToday(log: string, now: Date): { total: number; by: Map<string, number> } {
  const day = vnDay(now)
  const by = new Map<string, number>()
  let total = 0
  for (const file of logsBeside(log)) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line) continue
      let row: { step?: unknown; at?: unknown; usd?: unknown } | null
      try {
        row = JSON.parse(line) as typeof row
      } catch {
        continue
      }
      if (typeof row?.at !== 'string' || typeof row.usd !== 'number' || !Number.isFinite(row.usd)) continue
      const at = new Date(row.at)
      if (Number.isNaN(at.getTime()) || vnDay(at) !== day) continue
      total += row.usd
      if (typeof row.step === 'string') by.set(row.step, (by.get(row.step) ?? 0) + row.usd)
    }
  }
  return { total, by }
}

const dollars = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Nothing when the call may go; else the failure's message. It starts "claude failed" and says "limit reached" or
 * "usage limit", which errorKind (state.ts) classes as a usage limit, and the gate as a page it can't read.
 * With no cost log there is nothing to count from, and the call goes: the tests, which call no model (vitest.config.ts
 * clears the variable). The cycles name a log and so does the engine's command (cli.ts). A log that can't be written
 * stops the call, since what it spent would never be counted.
 */
export function ceilingMessage(step: string, log: string | undefined, ceilings: Ceilings = CEILINGS, now = new Date(), where: Machine = machine()): string | undefined {
  if (!log) return
  const place = tableInForce(ceilings.tables, now)?.[where] ?? NOTHING
  const cap = Object.hasOwn(place.steps, step) ? place.steps[step] : place.default
  if (cap == null) return
  try {
    appendFileSync(log, '')
  } catch (e) {
    return `claude failed: the engine's usage limit can't be counted for ${step}, the cost log can't be written (${(e as Error).message.slice(0, 120)})`
  }
  const spent = spentToday(log, now)
  if (spent.total >= place.backstop) return `claude failed: the engine's daily limit reached for every step ($${spent.total.toFixed(2)} of $${dollars(place.backstop)} today)`
  const mine = spent.by.get(step) ?? 0
  if (mine >= cap) return `claude failed: the engine's daily limit reached for ${step} ($${mine.toFixed(2)} of $${dollars(cap)} today)`
}
