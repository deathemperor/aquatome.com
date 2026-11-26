import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { PRICES } from '../../../apps/site/worker/fishid/claude'
import { CEILINGS, tableInForce, vnDay, type Ceilings, type Place } from './ceiling'

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
 *
 * Codex's read (17 Nov) made four of its edges hard: billed money is priced only from the chat's list (fishid/claude.ts
 * `PRICES`), never at a guess, and at Haiku 5.5's long-prompt rate past 100K tokens (`billedPrice`); the line's check and
 * the hold are one process's at a time, so two runs at once can't both spend the same dollars (`locked`); and a log that
 * can't be read whole stops the run, where counting it at $0 would let it spend past its line (`billedSpent`).
 */
export const BILLED_STEP = 'chat-board-billed'

/** The billed calls' log, beside the hand runs' cost log and never one the Mac's count reads; `off` is none (the tests). */
export function billedLog(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.BILLED_COST_LOG === 'off') return undefined
  return join(process.platform === 'darwin' ? join(homedir(), 'Library/Logs') : tmpdir(), 'aquatome-billed.jsonl')
}

/** Before the first table: no billed call. */
const NOTHING: Place = { default: 0, backstop: 0, steps: {} }

/**
 * What the billed log holds for `now`'s day, read as the line's own count must be: a log that isn't there yet holds
 * nothing; one that can't be read, has a line that isn't a billed line (JSON with its day, step and dollars), ends cut
 * short, or settles a call it never held stops the run (`BilledLimit`), where the engine's reader (ceiling.ts `spentIn`)
 * skips what it can't read, and here that would count the day's spend short.
 */
export function billedSpent(log: string, now: Date): { total: number; by: Map<string, number> } {
  const stop = (why: string) => new BilledLimit(`billed calls stopped: their log ${why}, so what's spent today can't be counted`)
  let text: string
  try {
    text = readFileSync(log, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { total: 0, by: new Map() }
    throw stop(`can't be read (${(e as Error).message.slice(0, 120)})`)
  }
  if (text && !text.endsWith('\n')) throw stop('ends in a line cut short')
  const day = vnDay(now)
  const by = new Map<string, number>()
  const holds = new Map<string, { at: string; step: string; usd: number; settled: boolean }>()
  let total = 0
  for (const [i, line] of text.split('\n').entries()) {
    if (!line) continue
    let row: { at?: unknown; step?: unknown; usd?: unknown; held?: unknown; settles?: unknown; cost?: unknown } | null
    try {
      row = JSON.parse(line) as typeof row
    } catch {
      throw stop(`has a line that isn't JSON (line ${i + 1})`)
    }
    if (typeof row?.at !== 'string' || Number.isNaN(Date.parse(row.at)) || typeof row.step !== 'string' || typeof row.usd !== 'number' || !Number.isFinite(row.usd)) throw stop(`has a line that isn't a billed call's (line ${i + 1})`)
    if (row.held !== undefined) {
      if (typeof row.held !== 'string' || !row.held || holds.has(row.held) || row.settles !== undefined || row.usd < 0)
        throw stop(`has an invalid or repeated hold (line ${i + 1})`)
      holds.set(row.held, { at: row.at, step: row.step, usd: row.usd, settled: false })
    } else if (row.settles !== undefined) {
      const hold = typeof row.settles === 'string' ? holds.get(row.settles) : undefined
      if (!hold) throw stop(`settles a call it never held (line ${i + 1})`)
      if (hold.settled) throw stop(`settles a call twice (line ${i + 1})`)
      if (row.at !== hold.at || row.step !== hold.step || typeof row.cost !== 'number' ||
        !Number.isFinite(row.cost) || row.cost < 0 || row.usd !== row.cost - hold.usd)
        throw stop(`has a settlement that doesn't match its hold (line ${i + 1})`)
      hold.settled = true
    } else if (row.usd < 0) {
      throw stop(`has a negative charge with no hold (line ${i + 1})`)
    }
    if (vnDay(new Date(row.at)) !== day) continue
    total += row.usd
    by.set(row.step, (by.get(row.step) ?? 0) + row.usd)
  }
  return { total, by }
}

/** `step`'s billed line today: its own (or the default), what it spent or holds, and what's left of it or the backstop. */
export function billedLine(step: string, log: string, ceilings: Ceilings = CEILINGS, now = new Date()): { cap: number; spent: number; left: number } {
  const place = tableInForce(ceilings.api?.tables ?? [], now) ?? NOTHING
  const cap = (Object.hasOwn(place.steps, step) ? place.steps[step] : place.default) ?? 0
  const spent = billedSpent(log, now)
  const mine = spent.by.get(step) ?? 0
  return { cap, spent: mine, left: Math.max(0, Math.min(cap - mine, place.backstop - spent.total)) }
}

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }
/**
 * A model's rate past a prompt this long (input, cache reads and cache writes together): Haiku 5.5's, $0.50 in and
 * $2.50 out per million tokens past 100K, cache reads a tenth of input and writes a quarter more (PRICES has its rate to
 * 100K).
 */
const LONG: Record<string, { over: number; price: Price }> = {
  'claude-haiku-5-5': { over: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } },
}
/** The rate a billed call of `model` is counted at for a prompt of `prompt` tokens; none for a model PRICES doesn't list. */
export function billedPrice(model: string, prompt: number): Price | undefined {
  const p = Object.hasOwn(PRICES, model) ? PRICES[model] : undefined
  const long = Object.hasOwn(LONG, model) ? LONG[model] : undefined
  return p && long && prompt > long.over ? long.price : p
}
/** What a call's tokens cost, at the rate its prompt is billed at; none for a model PRICES doesn't list. */
export function billedCost(model: string, t: Tokens): number | undefined {
  if (![t.input, t.output, t.cacheRead ?? 0, t.cacheWrite ?? 0].every(n => Number.isSafeInteger(n) && n >= 0)) return undefined
  const p = billedPrice(model, t.input + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0))
  return p && (t.input * p.input + t.output * p.output + (t.cacheRead ?? 0) * p.cacheRead + (t.cacheWrite ?? 0) * p.cacheWrite) / 1e6
}
/** A request's worst (`worstOf`), at the long rate when its bytes, each a token, could pass that rate's start. */
export function billedWorst(body: { model: string; max_tokens: number }): number | undefined {
  const p = billedPrice(body.model, Buffer.byteLength(JSON.stringify(body)))
  return p && worstOf(body, p)
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

/** How long a run waits for another's ledger write. */
const LOCK_WAIT_MS = 10_000
/**
 * SQLite holds the process-owned write lock. Its file stays beside the JSONL ledger; a paused process retains its
 * lock and an exited process releases it. Only the lock is in SQLite. The ledger stays in JSONL.
 */
async function locked<T>(log: string, work: () => T): Promise<T> {
  let lock: DatabaseSync
  try {
    lock = new DatabaseSync(`${log}.lock.sqlite`, { timeout: 0 })
  } catch (e) {
    throw new BilledLimit(`billed calls stopped: the billed line's lock can't be made (${(e as Error).message.slice(0, 120)})`)
  }
  try {
    const until = performance.now() + LOCK_WAIT_MS
    for (;;) {
      try {
        lock.exec('BEGIN IMMEDIATE')
        break
      } catch (e) {
        if ((e as { errcode?: number }).errcode !== 5) throw new BilledLimit(`billed calls stopped: the billed line's lock can't be taken (${(e as Error).message.slice(0, 120)})`)
      }
      if (performance.now() >= until) throw new BilledLimit(`billed calls stopped: another run held the billed line's lock for ${LOCK_WAIT_MS / 1000} s`)
      await delay(10)
    }
    return work()
  } finally {
    lock.close()
  }
}

/** One run's billed calls on one step: each held to the line before it goes, each settled once it ends. */
export class Billed {
  /** Why the run stopped: no call goes after it. */
  stopped?: string
  constructor(readonly step = BILLED_STEP, private log = billedLog(), private ceilings: Ceilings = CEILINGS, private clock = () => new Date()) {}

  /**
   * `body`, the request: its worst held to the line, at the chat's list prices (`billedWorst`). `run`'s `tokens` missing:
   * the API's usage didn't come, and the call counts at its worst.
   */
  async call<T, B extends { model: string; max_tokens: number }>(c: { body: B; key?: string; onCost?: (usd: number) => void }, run: () => Promise<{ value: T; tokens?: Tokens }>): Promise<T> {
    if (this.stopped) throw new BilledLimit(this.stopped)
    const model = c.body.model
    const worst = billedWorst(c.body)
    if (worst === undefined) throw new BilledLimit(this.stopped = `billed calls stopped: ${model} has no price in the chat's list (fishid/claude.ts PRICES), so what it spends can't be counted`)
    const log = this.log
    if (!log) throw new BilledLimit(this.stopped = 'billed calls stopped: there is no billed log, so what they spend would never be counted')
    if (!Number.isFinite(worst) || worst < 0 || !Number.isSafeInteger(c.body.max_tokens) || c.body.max_tokens <= 0)
      throw new BilledLimit(this.stopped = 'billed calls stopped: the request has an invalid token limit')
    const id = randomUUID()
    const base = await locked(log, () => {
      if (this.stopped) throw new BilledLimit(this.stopped)
      // Admission can wait across midnight. The hold and its settlement both use the day of admission.
      const now = this.clock()
      const line = billedLine(this.step, log, this.ceilings, now)
      if (worst > line.left) {
        throw new BilledLimit(`billed calls stopped at ${this.step}'s line: ${usd(line.spent)} of ${usd(line.cap)} spent or held today, and the next call could cost ${usd(worst)}. Raise the day's line (ceilings.json, api) to go on.`)
      }
      const row = { at: now.toISOString(), step: this.step, ...(c.key ? { key: c.key } : {}), model }
      try {
        appendFileSync(log, `${JSON.stringify({ ...row, usd: worst, held: id })}\n`)
      } catch (e) {
        throw new BilledLimit(`billed calls stopped: their log can't be written, so what they spend would never be counted (${(e as Error).message.slice(0, 120)})`)
      }
      return row
    }).catch(e => {
      if (e instanceof BilledLimit) this.stopped = e.message
      throw e
    })
    const started = Date.now()
    // The settling line: what the call cost (`cost`) less its hold, so the day's sum is what it cost.
    const settle = async (cost: number, t: Tokens | undefined, error: boolean) => {
      let counted = worst
      try {
        await locked(log, () => appendFileSync(log, `${JSON.stringify({ ...base, ms: Date.now() - started, usd: cost - worst, settles: id, cost, in: t?.input, cacheWrite: t?.cacheWrite, cacheRead: t?.cacheRead, out: t?.output, error, ...(cost === worst ? { worst: true } : {}) })}\n`))
        counted = cost
      } catch (e) {
        // The hold stays, at its worst; the calls after can't be counted.
        this.stopped ??= `billed calls stopped: a call couldn't be settled in the log (${(e as Error).message.slice(0, 120)})`
      }
      c.onCost?.(counted)
    }
    let result: Awaited<ReturnType<typeof run>>
    try {
      result = await run()
    } catch (e) {
      await settle(refused(e) ? 0 : worst, undefined, true)
      throw e
    }
    await settle((result.tokens && billedCost(model, result.tokens)) ?? worst, result.tokens, false)
    return result.value
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
