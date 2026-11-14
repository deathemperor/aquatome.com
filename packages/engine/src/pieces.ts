import { appendFileSync, readFileSync } from 'node:fs'
import { CEILINGS, costLog, inPiece, leftToday, logsBeside, machine, stepName, type Ceilings, type Machine } from './ceiling'
import { LlmError } from './claude'

/**
 * A step that works in pieces (a guide, a page) starts the next piece only when what's left of its day's line covers both
 * a typical piece (the middle cost of its last ten in the cost log) and its last piece. Otherwise it stops before
 * starting, with nothing written (the chief of staff, 2026-11-12, after the ideas step spent its $1 line on 7 of a guide's
 * 9 calls and wrote nothing). The last piece too since 13 Nov: the middle was $1.49 while the guide before cost $1.63, so
 * the next was started on less than that and cut short (the chief of staff: "a step doesn't start an item when what's
 * left of its line is less than its last item cost"). A piece cut short counts as what it spent, which is at least what such a piece costs. With nothing left it
 * doesn't start; with no piece on record and something left it does, its calls still under the line (ceiling.ts). A
 * piece that spent nothing (its first call refused, or none made) isn't one on record: it would pull the middle to $0.
 * Each call made for a piece carries its name in its cost line (claude.ts), and its end adds a line of its own,
 * `{ at, step, piece, pieceUsd, finished }`, with no `usd`, so nothing is counted twice.
 */
export const PIECES_READ = 10

export class PieceAdmissionError extends LlmError {}

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

/** `step`'s pieces on record in the logs beside `log` (any day), oldest first. */
const recorded = (step: string, log: string) => lines(log).filter(r => isPiece(r, step)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

/** What `step`'s last piece cost, or nothing with none on record. */
export const lastPiece = (step: string, log: string): number | undefined => recorded(step, log).at(-1)?.pieceUsd

/** The middle cost of `step`'s last ten pieces in the logs beside `log` (any day), or nothing with none on record. */
export function typicalPiece(step: string, log: string): number | undefined {
  const last = recorded(step, log).slice(-PIECES_READ).map(r => r.pieceUsd).sort((a, b) => a - b)
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
 * Runs `fn`, one piece of the current step named `name`, if what's left of the step's day covers a typical piece and the
 * last one; else
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
  const typical = typicalPiece(step, log), last = lastPiece(step, log)
  const need = typical == null || last == null ? undefined : Math.max(typical, last)
  if (left <= 0 || (need != null && left < need)) throw new PieceAdmissionError(`claude failed: the engine's daily limit reached for ${step}: ${name} not started: ${money(left)} left${need != null ? `, a piece costs about ${money(need)}` : ''}`)
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

/** CLI steps whose items check admission and record their complete cost. Both backfill commands share the worker. */
export const WRAPPED: Record<string, string> = {
  traits: 'traits.ts', range: 'range.ts', 'check-photos': 'photo-check.ts', 'guide-photos': 'guide-photos.ts', watermarks: 'watermarks.ts',
  'write-ideas': 'ideas.ts', summaries: 'summaries.ts', 'rewrite-vi': 'vi-backfill.ts', 'fit-rewrite': 'fit-rewrite.ts',
  localize: 'localize.ts', 'localize-guides': 'topics.ts', reader: 'reader.ts', run: 'run.ts', videos: 'youtube.ts',
  gallery: 'gallery.ts', 'album-ask': 'album-ask.ts', 'review-backfill': 'review-backfill.ts', 'review-backfill-97': 'review-backfill.ts', material: 'materials.ts',
}
/** Steps with no engine items to check. */
export const ONE_CALL: Record<string, string> = {
  autofix: 'GitHub workflow outside the engine; scripts/claude-spend.mjs accounts for it.',
  'nightly-review': 'GitHub workflow outside the engine; scripts/claude-spend.mjs accounts for it.',
  'page-review': 'GitHub workflow outside the engine; scripts/claude-spend.mjs accounts for it.',
  gate: 'No daily line (null).', moderate: 'No daily line (null).',
  'card-crops': 'Reserved ceiling; no engine CLI handler in this checkout.',
  'chat-board': 'Ceiling set ahead of its step; no engine CLI handler yet. When one lands, it goes on WRAPPED or here with its reason.',
  'glossary-entry': 'Ceiling set ahead of its step; no engine CLI handler yet. When one lands, it goes on WRAPPED or here with its reason.',

}
