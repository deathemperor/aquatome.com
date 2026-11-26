import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { CEILINGS, spentIn, tableInForce, type Ceilings, type Place } from './ceiling'

/**
 * Billed money: what the chat's board spends on the chat's own Anthropic keys (~/.config/aquatome/anthropic-keys), paid
 * from the API's credit, apart from the Mac's and GitHub's quota. It has its own place in ceilings.json (`api`), so it
 * never takes the engine's room under the Mac's backstop, and its own tables, so one day's line can be raised alone (the
 * chief of staff, 15 Nov 2026: $15 a day to start, raised for a day when a board needs it). Every call is logged as the
 * engine logs its own (claude.ts), in a log of its own that the Mac's count (ceiling.ts `logsBeside`) doesn't read.
 *
 * A call goes only when its worst cost fits what's left of its line today, and it is held in the log at that worst
 * before it goes; once it ends, a second line settles it to what it cost, on the hold's day. So a run killed mid-call,
 * or a second run at once, still counts the calls in the air. Past the line, the run stops before the call, and before
 * every call after it, and says why (`BilledLimit`). A call the API refused (a 4xx, or 529, overloaded) cost nothing;
 * one that failed any other way (a time limit, a dropped stream, another 5xx) or came back with no usage may have been
 * billed, so it is counted at its worst. With no log there is no billed call at all.
 */
export const BILLED_STEP = 'chat-board-billed'

/** The billed calls' log, beside the hand runs' cost log and never one the Mac's count reads; `off` is none (the tests). */
export function billedLog(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.BILLED_COST_LOG === 'off') return undefined
  return join(process.platform === 'darwin' ? join(homedir(), 'Library/Logs') : tmpdir(), 'aquatome-billed.jsonl')
}

/** Before the first table: no billed call. */
const NOTHING: Place = { default: 0, backstop: 0, steps: {} }

/** `step`'s billed line today: its own (or the default), what it spent or holds, and what's left of it or the backstop. */
export function billedLine(step: string, log: string, ceilings: Ceilings = CEILINGS, now = new Date()): { cap: number; spent: number; left: number } {
  const place = tableInForce(ceilings.api?.tables ?? [], now) ?? NOTHING
  const cap = (Object.hasOwn(place.steps, step) ? place.steps[step] : place.default) ?? 0
  const spent = spentIn([log], now)
  const mine = spent.by.get(step) ?? 0
  return { cap, spent: mine, left: Math.max(0, Math.min(cap - mine, place.backstop - spent.total)) }
}

/**
 * The most a Messages call can cost: every byte of its request (system, tools and messages, as JSON) a token at the
 * dearer of input and a 5-minute cache write, and all its max_tokens, thinking within them, as output. A call that
 * writes a 1-hour cache (twice input) would need its own price.
 */
export function worstOf(body: { max_tokens: number }, price: { input: number; output: number; cacheWrite: number }): number {
  return (Buffer.byteLength(JSON.stringify(body)) * Math.max(price.input, price.cacheWrite) + body.max_tokens * price.output) / 1e6
}

/** A run stopped at its billed line, or unable to count what it spends. */
export class BilledLimit extends Error {}

export type Tokens = { input: number; output: number; cacheRead?: number; cacheWrite?: number }
const usd = (n: number) => `$${n.toFixed(2)}`
/** The API answered and refused: nothing ran, nothing billed. */
const refused = (e: unknown) => {
  const s = (e as { status?: unknown } | null)?.status
  return typeof s === 'number' && ((s >= 400 && s < 500) || s === 529)
}

/** One run's billed calls on one step: each held to the line before it goes, each settled once it ends. */
export class Billed {
  /** Why the run stopped: no call goes after it. */
  stopped?: string
  constructor(readonly step = BILLED_STEP, private log = billedLog(), private ceilings: Ceilings = CEILINGS, private clock = () => new Date()) {}

  /** `run`'s `tokens` missing: the API's usage didn't come, and the call counts at its worst. */
  async call<T>(c: { model: string; worst: number; key?: string }, run: () => Promise<{ value: T; usd: number; tokens?: Tokens }>): Promise<T> {
    if (this.stopped) throw new BilledLimit(this.stopped)
    const log = this.log
    if (!log) throw new BilledLimit(this.stopped = 'billed calls stopped: there is no billed log, so what they spend would never be counted')
    // From the line's check to the hold, no wait: no other call of this run comes between.
    const now = this.clock()
    const line = billedLine(this.step, log, this.ceilings, now)
    if (c.worst > line.left) {
      throw new BilledLimit(this.stopped = `billed calls stopped at ${this.step}'s line: ${usd(line.spent)} of ${usd(line.cap)} spent or held today, and the next call could cost ${usd(c.worst)}. Raise the day's line (ceilings.json, api) to go on.`)
    }
    const id = randomUUID()
    const base = { at: now.toISOString(), step: this.step, ...(c.key ? { key: c.key } : {}), model: c.model }
    try {
      appendFileSync(log, `${JSON.stringify({ ...base, usd: c.worst, held: id })}\n`)
    } catch (e) {
      throw new BilledLimit(this.stopped = `billed calls stopped: their log can't be written, so what they spend would never be counted (${(e as Error).message.slice(0, 120)})`)
    }
    const started = Date.now()
    // The settling line: what the call cost (`cost`) less its hold, so the day's sum is what it cost.
    const settle = (cost: number, t: Tokens | undefined, error: boolean) => {
      try {
        appendFileSync(log, `${JSON.stringify({ ...base, ms: Date.now() - started, usd: cost - c.worst, settles: id, cost, in: t?.input, cacheWrite: t?.cacheWrite, cacheRead: t?.cacheRead, out: t?.output, error, ...(cost === c.worst ? { worst: true } : {}) })}\n`)
      } catch (e) {
        // The hold stays, at its worst; the calls after can't be counted.
        this.stopped ??= `billed calls stopped: a call couldn't be settled in the log (${(e as Error).message.slice(0, 120)})`
      }
    }
    try {
      const r = await run()
      settle(r.tokens && Number.isFinite(r.usd) ? r.usd : c.worst, r.tokens, false)
      return r.value
    } catch (e) {
      settle(refused(e) ? 0 : c.worst, undefined, true)
      throw e
    }
  }
}

/**
 * A script that would call the chat's keys outside the billed line refuses to run, until its calls go through `Billed`:
 * everything of ours that calls a model logs its calls and has a line in the day's ceilings (the chief of staff, 15 Nov
 * 2026). billed.test.ts holds every script that reads the keys to one or the other.
 */
export function unbilled(script: string): void {
  throw new Error(`${script} would call the chat's keys outside the billed line (ceilings.json, api): its calls go through src/billed.ts \`Billed\` first`)
}
