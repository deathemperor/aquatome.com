import { appendFileSync, readFileSync } from 'node:fs'
import { CEILINGS, costLog, inPiece, leftToday, logsBeside, machine, stepName, type Ceilings, type Machine } from './ceiling'
import { LlmError } from './claude'

/**
 * A step that works in pieces (a guide, a page) starts the next piece only when what's left of its day's line covers a
 * typical piece: the middle cost of its last ten pieces in the cost log. Otherwise it stops before starting, with nothing
 * written (the chief of staff, 2026-11-12, after the ideas step spent its $1 line on 7 of a guide's 9 calls and wrote
 * nothing). A piece cut short counts as what it spent, which is at least what such a piece costs. With nothing left it
 * doesn't start; with no piece on record and something left it does, its calls still under the line (ceiling.ts). A
 * piece that spent nothing (its first call refused, or none made) isn't one on record: it would pull the middle to $0.
 * Each call made for a piece carries its name in its cost line (claude.ts), and its end adds a line of its own,
 * `{ at, step, piece, pieceUsd, finished }`, with no `usd`, so nothing is counted twice.
 */
export const PIECES_READ = 10

type PieceLine = { at: string; step: string; piece: string; pieceUsd: number; finished: boolean }

function lines(log: string): unknown[] {
  const out: unknown[] = []
  for (const file of logsBeside(log)) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        out.push(JSON.parse(line))
      } catch {
        // A broken line is no line.
      }
    }
  }
  return out
}

const isPiece = (r: unknown, step: string): r is PieceLine => {
  const x = r as Partial<PieceLine> | null
  return x?.step === step && typeof x.piece === 'string' && typeof x.at === 'string' && typeof x.pieceUsd === 'number' && Number.isFinite(x.pieceUsd)
}

/** The middle cost of `step`'s last ten pieces in the logs beside `log` (any day), or nothing with none on record. */
export function typicalPiece(step: string, log: string): number | undefined {
  const last = lines(log).filter(r => isPiece(r, step)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-PIECES_READ).map(r => r.pieceUsd).sort((a, b) => a - b)
  if (!last.length) return
  const mid = Math.floor(last.length / 2)
  return last.length % 2 ? last[mid] : (last[mid - 1]! + last[mid]!) / 2
}

/** What the calls made for piece `id` cost, from their cost lines. */
const spentOn = (log: string, step: string, id: string) =>
  lines(log).reduce<number>((n, r) => {
    const x = r as { step?: unknown; piece?: unknown; usd?: unknown }
    return x?.step === step && x.piece === id && typeof x.usd === 'number' && Number.isFinite(x.usd) ? n + x.usd : n
  }, 0)

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * Runs `fn`, one piece of the current step named `name`, if what's left of the step's day covers a typical piece; else
 * fails as a step at its ceiling does (a usage limit to state.ts errorKind, so the step's loop stops), without calling
 * `fn`. With no cost log (the tests) or no ceiling, it just runs.
 */
export async function piece<T>(name: string, fn: () => Promise<T>, o: { now?: () => Date; ceilings?: Ceilings; where?: Machine } = {}): Promise<T> {
  const log = costLog()
  if (!log) return fn()
  const step = stepName()
  const now = o.now?.() ?? new Date()
  const left = leftToday(step, log, o.ceilings ?? CEILINGS, now, o.where ?? machine())
  if (left == null) return fn()
  const typical = typicalPiece(step, log)
  if (left <= 0 || (typical != null && left < typical)) throw new LlmError(`claude failed: the engine's daily limit reached for ${step}: ${name} not started: ${money(left)} left${typical != null ? `, a piece costs about ${money(typical)}` : ''}`)
  const id = `${name} ${now.toISOString()}`
  let finished = false
  try {
    const r = await inPiece.run(id, fn)
    finished = true
    return r
  } finally {
    try {
      const pieceUsd = Number(spentOn(log, step, id).toFixed(6))
      if (pieceUsd > 0) appendFileSync(log, `${JSON.stringify({ at: (o.now?.() ?? new Date()).toISOString(), step, piece: id, pieceUsd, finished })}\n`)
    } catch {
      // The piece's own calls are logged (claude.ts); only its sum is lost.
    }
  }
}
