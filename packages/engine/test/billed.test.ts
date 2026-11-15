import { readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { Billed, BilledLimit, BILLED_STEP, billedLine, billedLog, unbilled, worstOf } from '../src/billed'
import { CEILINGS, spentToday, tableInForce, type Ceilings } from '../src/ceiling'

const NOW = new Date('2026-11-17T05:00:00Z') // 12:00 in Vietnam
const TODAY = '2026-11-17T04:00:00Z'
const YESTERDAY = '2026-11-16T10:00:00Z' // 17:00 on the 16th in Vietnam
const LINE: Ceilings = {
  clock: CEILINGS.clock,
  tables: CEILINGS.tables,
  api: { tables: [{ from: '2026-11-15T00:00:00+07:00', default: 0, backstop: 15, steps: { [BILLED_STEP]: 10, other: 8 } }] },
}
const dirOf = () => mkdtemp(join(tmpdir(), 'billed-'))
const lines = async (log: string) => (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l))
const answer = (usd: number) => async () => ({ value: 'ok', usd, tokens: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 } })
const later = <T>(v: () => Promise<T>) => new Promise<T>(r => setTimeout(() => r(v()), 5))

test('a billed call within the line goes and is logged in the billed log, as the engine logs its own, which the Mac\'s count never reads', async () => {
  const dir = await dirOf()
  const log = join(dir, 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  expect(await b.call({ model: 'claude-sonnet-5-5', worst: 1, key: 'aaaa' }, answer(0.25))).toBe('ok')
  expect(await lines(log)).toEqual([{ at: NOW.toISOString(), step: BILLED_STEP, key: 'aaaa', model: 'claude-sonnet-5-5', ms: expect.any(Number), usd: 0.25, in: 1000, cacheWrite: 0, cacheRead: 0, out: 200, error: false }])
  // A cost log of the Mac's in the same folder: its day's spend doesn't hold the billed call.
  await writeFile(join(dir, 'aquatome-cost-hand.jsonl'), '')
  expect(spentToday(join(dir, 'aquatome-cost-hand.jsonl'), NOW).total).toBe(0)
  expect(billedLine(BILLED_STEP, log, LINE, NOW)).toEqual({ cap: 10, spent: 0.25, left: 9.75 })
})

test('a call whose worst would pass the line stops the run before it goes, and every call after; the message says how to go on', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  await writeFile(log, [{ at: TODAY, step: BILLED_STEP, usd: 9 }, { at: YESTERDAY, step: BILLED_STEP, usd: 50 }].map(l => JSON.stringify(l)).join('\n') + '\n')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  let ran = 0
  const counted = async () => { ran++; return answer(0.1)() }
  // $1 left today (yesterday's $50 is yesterday's): a call of up to $0.5 goes, one of up to $2 doesn't.
  await b.call({ model: 'm', worst: 0.5 }, counted)
  const refused = b.call({ model: 'm', worst: 2 }, counted)
  await expect(refused).rejects.toBeInstanceOf(BilledLimit)
  await expect(refused).rejects.toThrow(/chat-board-billed's line: \$9\.10 of \$10\.00 spent today.*could cost \$2\.00.*Raise the day's line/)
  // Stopped: even a call that would fit doesn't go.
  await expect(b.call({ model: 'm', worst: 0.01 }, counted)).rejects.toBeInstanceOf(BilledLimit)
  expect(ran).toBe(1)
  expect((await lines(log)).length).toBe(3)
})

test('the calls in the air are held: at once, only what fits the line goes', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  const tries = await Promise.allSettled([1, 2, 3].map(() => b.call({ model: 'm', worst: 4 }, () => later(answer(1)))))
  expect(tries.map(t => t.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
})

test('the line is the step\'s own or the place\'s backstop, whichever is less; an unnamed step, or a day before any table, has none', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  await writeFile(log, `${JSON.stringify({ at: TODAY, step: 'other', usd: 7 })}\n`)
  expect(billedLine(BILLED_STEP, log, LINE, NOW).left).toBe(8)
  expect(billedLine('someone-else', log, LINE, NOW).left).toBe(0)
  expect(billedLine(BILLED_STEP, log, LINE, new Date('2026-11-14T12:00:00Z')).left).toBe(0)
  expect(billedLine(BILLED_STEP, log, { ...LINE, api: undefined }, NOW).left).toBe(0)
  await expect(new Billed('someone-else', log, LINE, () => NOW).call({ model: 'm', worst: 0.01 }, answer(0))).rejects.toBeInstanceOf(BilledLimit)
})

test('a call the API refused is logged at nothing; one that failed any other way, at its worst, since it may have been billed', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  await expect(b.call({ model: 'm', worst: 0.3 }, async () => { throw Object.assign(new Error('overloaded'), { status: 529 }) })).rejects.toThrow('overloaded')
  await expect(b.call({ model: 'm', worst: 0.3 }, async () => { throw Object.assign(new Error('Request timed out.'), { status: undefined }) })).rejects.toThrow('timed out')
  expect((await lines(log)).map(l => [l.usd, l.error, l.worst])).toEqual([[0, true, undefined], [0.3, true, true]])
  expect(billedLine(BILLED_STEP, log, LINE, NOW).spent).toBe(0.3)
})

test('a log that can\'t be written stops the run before any call: what it spent would never be counted', async () => {
  const b = new Billed(BILLED_STEP, join(await dirOf(), 'missing', 'aquatome-billed.jsonl'), LINE, () => NOW)
  let ran = false
  await expect(b.call({ model: 'm', worst: 0.1 }, async () => { ran = true; return answer(0)() })).rejects.toThrow(/log can't be written/)
  expect(ran).toBe(false)
})

test('a call\'s worst: every character of its request a token at the dearer of input and cache writing, and all its max_tokens', () => {
  const body = { model: 'm', max_tokens: 1000, messages: [{ role: 'user', content: 'x'.repeat(100) }] }
  const chars = JSON.stringify(body).length
  expect(worstOf(body, { input: 3, output: 15, cacheWrite: 3.75 })).toBeCloseTo((chars * 3.75 + 1000 * 15) / 1e6, 12)
})

test('the billed log is its own, never one the Mac\'s count reads; the tests have none', () => {
  expect(billedLog({ BILLED_COST_LOG: 'off' })).toBeUndefined()
  expect(billedLog({ BILLED_COST_LOG: '/x/y.jsonl' })).toBe('/x/y.jsonl')
  expect(billedLog({})).toMatch(/aquatome-billed\.jsonl$/)
  expect(billedLog({})).not.toMatch(/aquatome-cost-/)
  expect(billedLog()).toBeUndefined()
})

test('ceilings.json: billed money has its own place, $15 a day for the board\'s billed runs from 15 Nov, every line a number, nothing before', () => {
  const tables = CEILINGS.api!.tables
  const froms = tables.map(t => Date.parse(t.from))
  expect(froms).toEqual([...froms].sort((a, b) => a - b))
  for (const t of tables) {
    expect(t.default).toBe(0)
    for (const n of [t.backstop, ...Object.values(t.steps)]) expect(typeof n === 'number' && n >= 0).toBe(true)
  }
  const at = (iso: string) => tableInForce(tables, new Date(iso))
  expect(at('2026-11-14T23:59:00+07:00')).toBeUndefined()
  expect(at('2026-11-15T00:00:00+07:00')).toMatchObject({ backstop: 15, steps: { [BILLED_STEP]: 15 } })
  // Not the machines' tables: the Mac's backstop never counts it, and the engine's steps never read it.
  for (const t of CEILINGS.tables) expect(Object.keys(t.mac.steps)).not.toContain(BILLED_STEP)
})

test('every script that reads the chat\'s keys holds its calls to the billed line, or refuses to run until it does', () => {
  const dir = join(import.meta.dirname, '../scripts')
  const reading = readdirSync(dir).filter(f => f.endsWith('.ts')).filter(f => /anthropic-keys|loadKeys\(|clientFor\(/.test(readFileSync(join(dir, f), 'utf8')))
  expect(reading).toContain('chat-board.ts')
  for (const f of reading) expect(/new Billed\(|^unbilled\('/m.test(readFileSync(join(dir, f), 'utf8')), f).toBe(true)
  expect(() => unbilled('x.ts')).toThrow(/x\.ts would call the chat's keys outside the billed line/)
})

