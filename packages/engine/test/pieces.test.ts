import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { inPiece, nameStep, type Ceilings, type Place } from '../src/ceiling'
import { LlmError } from '../src/claude'
import { piece, typicalPiece } from '../src/pieces'
import { errorKind } from '../src/state'

// A step that works in pieces starts the next only when what's left of its day's line covers a typical one (pieces.ts).

const place = (steps: Place['steps'], o: Partial<Place> = {}): Place => ({ default: 1, backstop: 100, steps: { gate: null, moderate: null, ...steps }, ...o })
const CEIL: Ceilings = { clock: 'test', tables: [{ from: '2026-11-12T00:00:00+07:00', mac: place({ 'write-ideas': 0 }), github: place({ 'write-ideas': 3 }) }] }
const NOW = new Date('2026-11-13T05:00:00Z')
const o = { now: () => NOW, ceilings: CEIL, where: 'github' as const }
const done = (at: string, usd: number, finished = true) => ({ at, step: 'write-ideas', piece: `x ${at}`, pieceUsd: usd, finished })
const spend = (usd: number, more: object = {}) => ({ at: NOW.toISOString(), step: 'write-ideas', usd, ...more })

async function logWith(rows: object[]) {
  const log = join(await mkdtemp(join(tmpdir(), 'pieces-')), 'aquatome-cost-rewrite.jsonl')
  await writeFile(log, rows.map(r => `${JSON.stringify(r)}\n`).join(''))
  process.env.ENGINE_COST_LOG = log
  nameStep('write-ideas')
  return log
}
afterEach(() => { process.env.ENGINE_COST_LOG = 'off'; nameStep(undefined) })

// A stand-in for a piece's model calls: each a cost line, tagged as claude.ts tags one made inside a piece.
const calls = (log: string, ...usd: number[]) => async () => {
  for (const u of usd) appendFileSync(log, `${JSON.stringify({ at: NOW.toISOString(), step: 'write-ideas', piece: inPiece.getStore(), usd: u })}\n`)
  return 'written'
}

test('12 Nov\'s case: a guide costs about $1.30, so with $1 left of the line the next isn\'t started, and nothing is called', async () => {
  const log = await logWith([done('2026-11-10T09:00:00Z', 1.28), done('2026-11-10T09:30:00Z', 1.37), done('2026-11-11T09:00:00Z', 1.3), spend(2)])
  let ran = false
  const err = await piece('aquatome-ca-thieu-oxy', async () => { ran = true }, o).catch(e => e)
  expect(err).toBeInstanceOf(LlmError)
  expect(err.message).toBe('claude failed: the engine\'s daily limit reached for write-ideas: aquatome-ca-thieu-oxy not started: $1.00 left, a piece costs about $1.30')
  // To the step's loop it's a usage limit, which stops it with the idea left for the next run.
  expect(errorKind(err.message)).toBe('usage')
  expect(ran).toBe(false)
})

test('with enough left it runs, and the piece\'s own calls are its cost on record', async () => {
  const log = await logWith([done('2026-11-11T09:00:00Z', 1.3), spend(1), spend(0.5, { step: 'other' })])
  expect(await piece('guide-a', calls(log, 0.6, 0.7), o)).toBe('written')
  const last = JSON.parse((await readFile(log, 'utf8')).trim().split('\n').pop()!)
  expect(last).toEqual({ at: NOW.toISOString(), step: 'write-ideas', piece: `guide-a ${NOW.toISOString()}`, pieceUsd: 1.3, finished: true })
})

test('a piece cut short counts as what it spent, and its error goes on to the step', async () => {
  const log = await logWith([])
  const cut = async () => { await calls(log, 0.5, 0.52)(); throw new LlmError('claude failed: the engine\'s daily limit reached for write-ideas ($1.02 of $1 today)') }
  await expect(piece('guide-b', cut, o)).rejects.toBeInstanceOf(LlmError)
  expect(typicalPiece('write-ideas', log)).toBe(1.02)
  const last = JSON.parse((await readFile(log, 'utf8')).trim().split('\n').pop()!)
  expect(last).toMatchObject({ pieceUsd: 1.02, finished: false })
})

test('with no piece on record it starts; with no cost log, or no ceiling, it just runs', async () => {
  const log = await logWith([spend(2.9)])
  expect(await piece('first', calls(log, 0.05), o)).toBe('written')
  process.env.ENGINE_COST_LOG = 'off'
  expect(await piece('tests', async () => 'ran', o)).toBe('ran')
  await logWith([done('2026-11-11T09:00:00Z', 50), { at: NOW.toISOString(), step: 'gate', usd: 99 }])
  nameStep('gate')
  expect(await piece('page', async () => 'read', o)).toBe('read')
})

test('the typical piece is the middle of the last ten, of this step only; the backstop and a day that can\'t be counted count too', async () => {
  const old = Array.from({ length: 5 }, (_, i) => done(`2026-11-0${i + 1}T09:00:00Z`, 9))
  const recent = [0.9, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5].map((u, i) => done(`2026-11-1${Math.floor(i / 5)}T0${i % 5}:00:00Z`, u))
  const log = await logWith([...old, ...recent, { ...done('2026-11-11T09:00:00Z', 40), step: 'other' }])
  expect(typicalPiece('write-ideas', log)).toBe(1.45)
  // $3 of its line left, but $1 of the day's backstop.
  await logWith([done('2026-11-11T09:00:00Z', 1.3), { at: NOW.toISOString(), step: 'other', usd: 99 }])
  await expect(piece('c', async () => 'no', o)).rejects.toThrow('not started: $1.00 left, a piece costs about $1.30')
  await logWith([done('2026-11-11T09:00:00Z', 1.3), { at: NOW.toISOString(), unlogged: 'run 9 kept no cost log' }])
  await expect(piece('d', async () => 'no', o)).rejects.toThrow('not started: $0.00 left')
})
