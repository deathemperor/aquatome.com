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
 * A call goes only when its worst cost fits what's left of its line today, the run's calls still in the air held too.
 * Else the run stops before it, and before every call after it, and says why (`BilledLimit`). Two runs at once can pass
 * the line by what the other has in the air. A call the API refused (it answered with a status) cost nothing; one that
 * failed any other way (a time limit, a dropped stream) may have been billed for what it wrote, so it is logged at its
 * worst.
 */
export const BILLED_STEP = 'chat-board-billed'

/** The billed calls' log: BILLED_COST_LOG, else one beside the hand runs' cost log; `off` is none (the tests). */
export function billedLog(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.BILLED_COST_LOG === 'off') return undefined
  return env.BILLED_COST_LOG || join(process.platform === 'darwin' ? join(homedir(), 'Library/Logs') : tmpdir(), 'aquatome-billed.jsonl')
}

/** Before the first table: no billed call. */
const NOTHING: Place = { default: 0, backstop: 0, steps: {} }

/** `step`'s billed line today: its own (or the default), what it spent, and what's left of it or of the backstop. */
export function billedLine(step: string, log: string, ceilings: Ceilings = CEILINGS, now = new Date()): { cap: number; spent: number; left: number } {
  const place = tableInForce(ceilings.api?.tables ?? [], now) ?? NOTHING
  const cap = (Object.hasOwn(place.steps, step) ? place.steps[step] : place.default) ?? 0
  const spent = spentIn([log], now)
  const mine = spent.by.get(step) ?? 0
  return { cap, spent: mine, left: Math.max(0, Math.min(cap - mine, place.backstop - spent.total)) }
}

/** The most a Messages call can cost: every character of the request a token, written to cache, and all its max_tokens. */
export function worstOf(body: { max_tokens: number }, price: { input: number; output: number; cacheWrite: number }): number {
  return (JSON.stringify(body).length * Math.max(price.input, price.cacheWrite) + body.max_tokens * price.output) / 1e6
}

/** A run stopped at its billed line, or unable to count what it spends. */
export class BilledLimit extends Error {}

export type Tokens = { input: number; output: number; cacheRead?: number; cacheWrite?: number }
const usd = (n: number) => `$${n.toFixed(2)}`

/** One run's billed calls on one step: each held to the line before it goes, each logged once it ends. */
export class Billed {
  /** Why the run stopped: no call goes after it. */
  stopped?: string
  private held = 0
  constructor(readonly step = BILLED_STEP, private log = billedLog(), private ceilings: Ceilings = CEILINGS, private clock = () => new Date()) {}

  async call<T>(c: { model: string; worst: number; key?: string }, run: () => Promise<{ value: T; usd: number; tokens: Tokens }>): Promise<T> {
    if (this.stopped) throw new BilledLimit(this.stopped)
    const log = this.log
    if (!log) return (await run()).value
    try {
      appendFileSync(log, '')
    } catch (e) {
      throw new BilledLimit(this.stopped = `billed calls stopped: their log can't be written, so what they spend would never be counted (${(e as Error).message.slice(0, 120)})`)
    }
    const line = billedLine(this.step, log, this.ceilings, this.clock())
    if (this.held + c.worst > line.left) {
      throw new BilledLimit(this.stopped = `billed calls stopped at ${this.step}'s line: ${usd(line.spent)} of ${usd(line.cap)} spent today, ${usd(this.held)} in the air, and the next call could cost ${usd(c.worst)}. Raise the day's line (ceilings.json, api) to go on.`)
    }
    this.held += c.worst
    const started = Date.now()
    const write = (cost: number, t: Tokens | undefined, error: boolean, worst: boolean) => {
      try {
        appendFileSync(log, `${JSON.stringify({ at: this.clock().toISOString(), step: this.step, ...(c.key ? { key: c.key } : {}), model: c.model, ms: Date.now() - started, usd: cost, in: t?.input, cacheWrite: t?.cacheWrite, cacheRead: t?.cacheRead, out: t?.output, error, ...(worst ? { worst: true } : {}) })}\n`)
      } catch (e) {
        // This call is done; the next can't be counted.
        this.stopped ??= `billed calls stopped: a call's cost couldn't be logged (${(e as Error).message.slice(0, 120)})`
      }
    }
    try {
      const r = await run()
      write(r.usd, r.tokens, false, false)
      return r.value
    } catch (e) {
      const refused = typeof (e as { status?: unknown } | null)?.status === 'number'
      write(refused ? 0 : c.worst, undefined, true, !refused)
      throw e
    } finally {
      this.held -= c.worst
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
