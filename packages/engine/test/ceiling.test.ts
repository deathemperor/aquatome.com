import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import ceilings from '../src/ceilings.json'
import { ceilingMessage, spentToday, tableInForce, type CeilingTable } from '../src/ceiling'
import { errorKind } from '../src/state'

const logOf = async (lines: unknown[]) => {
  const path = join(await mkdtemp(join(tmpdir(), 'ceil-')), 'cost.jsonl')
  await writeFile(path, lines.map(line => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + (lines.length ? '\n' : ''))
  return path
}

// 17:00 UTC is midnight in Vietnam. A line at 16:59 UTC is still that UTC date's Saigon day; 17:00 UTC is the next one.
const NOW = new Date('2026-11-11T16:59:00.000Z')
const TODAY = '2026-11-11T16:59:00.000Z'
const TODAY_EARLIER = '2026-11-10T17:00:00.000Z' // Saigon 11 Nov, 00:00
const TOMORROW = '2026-11-11T17:00:00.000Z'
const YESTERDAY = '2026-11-10T16:59:00.000Z'

test('today\'s spend counts only this step\'s lines on today\'s Asia/Saigon day', async () => {
  const log = await logOf([
    { at: TODAY, step: 'localize', usd: 1.25 },
    { at: TODAY_EARLIER, step: 'localize', usd: 0.25 },
    { at: TODAY, step: 'run', usd: 9 },
    { at: TOMORROW, step: 'localize', usd: 4 },
    { at: YESTERDAY, step: 'localize', usd: 8 },
    { at: TODAY, usd: 7 },
    { at: TODAY, step: null, usd: 3 },
    { at: 'not-a-time', step: 'localize', usd: 5 },
    'not json',
    '',
  ])
  expect(spentToday(log, 'localize', NOW)).toBe(1.5)
  expect(spentToday(join(log, '..', 'missing.jsonl'), 'localize', NOW)).toBe(0)
  expect(spentToday(join(log, '..'), 'localize', NOW)).toBe(0) // a directory: unreadable, so nothing
})

test('the table in force is the last whose from has passed, and there is none before the first', () => {
  const first: CeilingTable = { from: '2026-11-12T00:00:00+07:00', default: 1, steps: { run: 30 } }
  const second: CeilingTable = { from: '2026-11-20T00:00:00+07:00', default: 2, steps: { run: 10 } }
  expect(tableInForce([first, second], new Date('2026-11-11T16:59:00.000Z'))).toBeUndefined()
  expect(tableInForce([], new Date('2026-11-12T03:00:00.000Z'))).toBeUndefined()
  // 12 Nov 00:00 in Vietnam, the first table's from.
  expect(tableInForce([first, second], new Date('2026-11-11T17:00:00.000Z'))).toBe(first)
  expect(tableInForce([first, second], new Date('2026-11-19T16:59:00.000Z'))).toBe(first)
  expect(tableInForce([first, second], new Date('2026-11-19T17:00:00.000Z'))).toBe(second)
  // Last in the list, including when an earlier table is written after a later one.
  expect(tableInForce([second, first], new Date('2026-11-19T17:00:00.000Z'))).toBe(first)
})

test('a listed step uses its ceiling, an unlisted one the default, null never stops, and 0 stops at once', async () => {
  const table: CeilingTable = { from: '2026-11-12T00:00:00+07:00', default: 1, steps: { localize: 25, gate: null, videos: 0 } }
  const now = new Date('2026-11-12T03:00:00.000Z')
  const before = new Date('2026-11-11T16:59:00.000Z')
  const at = await logOf([{ at: now.toISOString(), step: 'localize', usd: 25 }])
  const under = await logOf([{ at: now.toISOString(), step: 'localize', usd: 24.5 }])
  const other = await logOf([{ at: now.toISOString(), step: 'traits', usd: 1 }])
  const belowDefault = await logOf([{ at: now.toISOString(), step: 'traits', usd: 0.5 }])
  const gate = await logOf([{ at: now.toISOString(), step: 'gate', usd: 1000 }])
  const empty = await logOf([])
  expect(ceilingMessage('localize', under, [table], now)).toBeUndefined()
  const message = ceilingMessage('localize', at, [table], now)
  expect(message).toBe('claude failed: the engine\'s daily limit reached for localize ($25.00 of $25 today)')
  expect(errorKind(message)).toBe('usage')
  expect(ceilingMessage('localize', at, [table], before)).toBeUndefined()
  expect(ceilingMessage('traits', belowDefault, [table], now)).toBeUndefined()
  expect(ceilingMessage('traits', other, [table], now)).toBe('claude failed: the engine\'s daily limit reached for traits ($1.00 of $1 today)')
  expect(ceilingMessage('gate', gate, [table], now)).toBeUndefined()
  expect(ceilingMessage('videos', empty, [table], now)).toBe('claude failed: the engine\'s daily limit reached for videos ($0.00 of $0 today)')
  expect(ceilingMessage(undefined, at, [table], now)).toBeUndefined()
  expect(ceilingMessage('localize', undefined, [table], now)).toBeUndefined()
})

test('ceilings.json parses, every from is a time, and the gate has no ceiling', () => {
  expect(ceilings.length).toBeGreaterThan(0)
  for (const table of ceilings) {
    expect(Number.isNaN(new Date(table.from).getTime())).toBe(false)
    expect(table.steps.gate).toBeNull()
  }
})
