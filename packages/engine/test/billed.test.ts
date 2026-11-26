import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, utimesSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { PRICES } from '../../../apps/site/worker/fishid/claude'
import { Billed, BilledLimit, BILLED_STEP, billedCost, billedLine, billedLog, billedPrice, billedWorst, unbilled, worstOf } from '../src/billed'
import { CEILINGS, spentIn, spentToday, tableInForce, type Ceilings } from '../src/ceiling'

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
/** A request whose worst is `usd` at Sonnet 5.5's list price ($10 a million out), and a few cents' millionths for its bytes. */
const ask = (usd: number) => ({ model: 'claude-sonnet-5-5', max_tokens: Math.round(usd * 1e5), messages: [] })
const worst = (usd: number) => billedWorst(ask(usd))!
/** An answer of `out` tokens: at Sonnet's $10 a million, $0.01 each thousand. */
const answer = (out: number) => async () => ({ value: 'ok', tokens: { input: 0, output: out, cacheRead: 0, cacheWrite: 0 } })

test('a billed call within the line goes and is logged in the billed log, as the engine logs its own, which the Mac\'s count never reads', async () => {
  const dir = await dirOf()
  const log = join(dir, 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  expect(await b.call({ body: ask(1), key: 'aaaa' }, answer(25_000))).toBe('ok')
  // Held at its worst before it went, then settled to what it cost, on the hold's day.
  const [held, settled] = await lines(log)
  expect(held).toEqual({ at: NOW.toISOString(), step: BILLED_STEP, key: 'aaaa', model: 'claude-sonnet-5-5', usd: worst(1), held: expect.any(String) })
  expect(settled).toEqual({ at: NOW.toISOString(), step: BILLED_STEP, key: 'aaaa', model: 'claude-sonnet-5-5', ms: expect.any(Number), usd: 0.25 - worst(1), settles: held.held, cost: 0.25, in: 0, cacheWrite: 0, cacheRead: 0, out: 25_000, error: false })
  // A cost log of the Mac's in the same folder: its day's spend doesn't hold the billed call.
  await writeFile(join(dir, 'aquatome-cost-hand.jsonl'), '')
  expect(spentToday(join(dir, 'aquatome-cost-hand.jsonl'), NOW).total).toBe(0)
  expect(billedLine(BILLED_STEP, log, LINE, NOW)).toEqual({ cap: 10, spent: expect.closeTo(0.25, 9), left: expect.closeTo(9.75, 9) })
})

test('a call whose worst would pass the line stops the run before it goes, and every call after; the message says how to go on', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  await writeFile(log, [{ at: TODAY, step: BILLED_STEP, usd: 9 }, { at: YESTERDAY, step: BILLED_STEP, usd: 50 }].map(l => JSON.stringify(l)).join('\n') + '\n')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  let ran = 0
  const counted = async () => { ran++; return answer(10_000)() }
  // $1 left today (yesterday's $50 is yesterday's): a call of up to $0.5 goes, one of up to $2 doesn't.
  await b.call({ body: ask(0.5) }, counted)
  const refused = b.call({ body: ask(2) }, counted)
  await expect(refused).rejects.toBeInstanceOf(BilledLimit)
  await expect(refused).rejects.toThrow("billed calls stopped at chat-board-billed's line: $9.10 of $10.00 spent or held today, and the next call could cost $2.00. Raise the day's line (ceilings.json, api) to go on.")
  // Stopped: even a call that would fit doesn't go.
  await expect(b.call({ body: ask(0.01) }, counted)).rejects.toBeInstanceOf(BilledLimit)
  expect(ran).toBe(1)
  expect((await lines(log)).length).toBe(4)
})

test('the calls in the air are held in the log: at once, only what fits goes, another run sees them, and once settled the day holds what they cost', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const tries = [1, 2, 3].map(() => b.call({ body: ask(4) }, async () => { await gate; return answer(100_000)() }))
  // A second run at once (or this one killed now) counts the two in the air at their worst.
  expect(billedLine(BILLED_STEP, log, LINE, NOW)).toEqual({ cap: 10, spent: 2 * worst(4), left: 10 - 2 * worst(4) })
  await expect(new Billed(BILLED_STEP, log, LINE, () => NOW).call({ body: ask(3) }, answer(0))).rejects.toBeInstanceOf(BilledLimit)
  release()
  expect((await Promise.allSettled(tries)).map(t => t.status)).toEqual(['fulfilled', 'fulfilled', 'rejected'])
  expect(billedLine(BILLED_STEP, log, LINE, NOW).spent).toBeCloseTo(2, 9)
})

test('the line is the step\'s own or the place\'s backstop, whichever is less; an unnamed step, or a day before any table, has none', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  await writeFile(log, `${JSON.stringify({ at: TODAY, step: 'other', usd: 7 })}\n`)
  expect(billedLine(BILLED_STEP, log, LINE, NOW).left).toBe(8)
  expect(billedLine('someone-else', log, LINE, NOW).left).toBe(0)
  expect(billedLine(BILLED_STEP, log, LINE, new Date('2026-11-14T12:00:00Z')).left).toBe(0)
  expect(billedLine(BILLED_STEP, log, { ...LINE, api: undefined }, NOW).left).toBe(0)
  await expect(new Billed('someone-else', log, LINE, () => NOW).call({ body: ask(0.01) }, answer(0))).rejects.toBeInstanceOf(BilledLimit)
})

test('a call the API refused (4xx, 529) costs nothing; one that failed any other way, or came with no usage, counts at its worst', async () => {
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  const failing = (status: number | undefined) => b.call({ body: ask(0.5) }, async () => { throw Object.assign(new Error(`failed ${status}`), { status }) })
  for (const status of [400, 429, 529, 500, undefined]) await expect(failing(status)).rejects.toThrow(`failed ${status}`)
  expect(await b.call({ body: ask(0.5) }, async () => ({ value: 'no usage' }))).toBe('no usage')
  const settled = (await lines(log)).filter(l => l.settles)
  const w = worst(0.5)
  expect(settled.map(l => [l.cost, l.error, l.worst ?? false])).toEqual([[0, true, false], [0, true, false], [0, true, false], [w, true, true], [w, true, true], [w, false, true]])
  expect(billedLine(BILLED_STEP, log, LINE, NOW).spent).toBeCloseTo(3 * w, 9)
})

test('with no billed log there is no billed call; a call that can\'t be settled keeps its hold at its worst and stops the run', async () => {
  let ran = false
  await expect(new Billed(BILLED_STEP, undefined, LINE, () => NOW).call({ body: ask(0.1) }, async () => { ran = true; return answer(0)() })).rejects.toThrow(/no billed log/)
  expect(ran).toBe(false)
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
  expect(await b.call({ body: ask(0.4) }, async () => { await chmod(log, 0o444); return answer(10_000)() })).toBe('ok')
  await chmod(log, 0o644)
  expect(billedLine(BILLED_STEP, log, LINE, NOW).spent).toBe(worst(0.4))
  await expect(b.call({ body: ask(0.1) }, answer(0))).rejects.toThrow(/couldn't be settled/)
})

test('a log that can\'t be written stops the run before any call: what it spent would never be counted', async () => {
  let ran = false
  const go = async () => { ran = true; return answer(0)() }
  // Its folder gone: not even the line's lock can be made beside it.
  await expect(new Billed(BILLED_STEP, join(await dirOf(), 'missing', 'aquatome-billed.jsonl'), LINE, () => NOW).call({ body: ask(0.1) }, go)).rejects.toThrow(/lock can't be made/)
  // Read only: the hold can't be written.
  const log = join(await dirOf(), 'aquatome-billed.jsonl')
  await writeFile(log, '')
  await chmod(log, 0o444)
  await expect(new Billed(BILLED_STEP, log, LINE, () => NOW).call({ body: ask(0.1) }, go)).rejects.toThrow(/log can't be written/)
  await chmod(log, 0o644)
  expect(ran).toBe(false)
})

test('a call\'s worst: every byte of its request a token at the dearer of input and cache writing, and all its max_tokens', () => {
  const body = { model: 'm', max_tokens: 1000, messages: [{ role: 'user', content: 'Bể của mình ổn không?'.repeat(10) }] }
  const bytes = Buffer.byteLength(JSON.stringify(body))
  expect(bytes).toBeGreaterThan(JSON.stringify(body).length)
  expect(worstOf(body, { input: 3, output: 15, cacheWrite: 3.75 })).toBeCloseTo((bytes * 3.75 + 1000 * 15) / 1e6, 12)
})

test('the billed log is its own, never one the Mac\'s count reads; the tests have none', () => {
  expect(billedLog({ BILLED_COST_LOG: 'off' })).toBeUndefined()
  // No other place: a fresh file would start the day at $0.
  expect(billedLog({ BILLED_COST_LOG: '/x/y.jsonl' })).toMatch(/aquatome-billed\.jsonl$/)
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
  const CALLS = /anthropic-keys|loadKeys\(|clientFor\(|new Anthropic\(|@anthropic-ai\/sdk|messages\.(create|stream)\(/
  const reading = readdirSync(dir).filter(f => f.endsWith('.ts')).filter(f => CALLS.test(readFileSync(join(dir, f), 'utf8')))
  expect(reading).toContain('chat-board.ts')
  for (const f of reading) {
    const text = readFileSync(join(dir, f), 'utf8')
    const guard = text.search(/^unbilled\('/m)
    if (guard >= 0) {
      // Refused before anything reads a key or makes a client.
      const first = Math.min(...['loadKeys(', 'clientFor(', 'new Anthropic(', 'messages.create(', 'messages.stream('].map(k => text.indexOf(k)).filter(i => i >= 0))
      expect(guard, f).toBeLessThan(first)
    } else {
      // Held: every request it makes goes through a Billed call.
      // Its own Billed, or one it is handed (board-stream.ts `boardSender`).
      expect(/new Billed\(|\bbilled: Billed\b/.test(text), f).toBe(true)
      expect((text.match(/billed\.call\(/g) ?? []).length, f).toBeGreaterThanOrEqual((text.match(/messages\.(create|stream)\(/g) ?? []).length)
    }
  }
  expect(() => unbilled('x.ts')).toThrow(/x\.ts would call the chat's keys outside the billed line/)
})


describe('Codex\'s read of the billed line (17 Nov)', () => {
  test('a model the chat\'s price list doesn\'t name is refused before it goes: billed money is never counted at a guess', async () => {
    const log = join(await dirOf(), 'aquatome-billed.jsonl')
    const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
    let ran = false
    await expect(b.call({ body: { model: 'claude-unlisted-9', max_tokens: 10, messages: [] } }, async () => { ran = true; return answer(0)() })).rejects.toThrow(/claude-unlisted-9 has no price/)
    expect([ran, existsSync(log), b.stopped]).toEqual([false, false, expect.stringMatching(/no price/)])
    expect(billedPrice('claude-unlisted-9', 10)).toBeUndefined()
    expect(billedCost('claude-unlisted-9', { input: 1, output: 1 })).toBeUndefined()
    for (const model of Object.keys(PRICES)) expect(billedPrice(model, 10), model).toEqual(PRICES[model])
  })

  test('Haiku 5.5 past 100K tokens of prompt is held and settled at its long rate: the hold when its bytes could pass, the settle when its input and cache did', async () => {
    const LONG = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 }
    const haiku = (chars: number) => ({ model: 'claude-haiku-5-5', max_tokens: 1000, messages: [{ role: 'user', content: 'x'.repeat(chars) }] })
    expect(billedWorst(haiku(1000))).toBe(worstOf(haiku(1000), PRICES['claude-haiku-5-5']!))
    expect(billedWorst(haiku(100_000))).toBe(worstOf(haiku(100_000), LONG))
    // The settle counts input, cache reads and cache writes together: 60K + 30K + 20K is past 100K.
    expect(billedCost('claude-haiku-5-5', { input: 60_000, output: 1000, cacheRead: 30_000, cacheWrite: 20_000 })).toBeCloseTo((60_000 * 0.5 + 1000 * 2.5 + 30_000 * 0.05 + 20_000 * 0.625) / 1e6, 12)
    expect(billedCost('claude-haiku-5-5', { input: 60_000, output: 1000, cacheRead: 30_000, cacheWrite: 0 })).toBeCloseTo((60_000 * 0.1 + 1000 * 0.5 + 30_000 * 0.01) / 1e6, 12)
    // Through a call: held at the long rate, settled at it.
    const log = join(await dirOf(), 'aquatome-billed.jsonl')
    const counted: number[] = []
    await new Billed(BILLED_STEP, log, LINE, () => NOW).call({ body: haiku(100_000), onCost: usd => counted.push(usd) }, async () => ({ value: 'ok', tokens: { input: 101_000, output: 1000 } }))
    const [held, settled] = await lines(log)
    expect([held.usd, settled.cost]).toEqual([worstOf(haiku(100_000), LONG), (101_000 * 0.5 + 1000 * 2.5) / 1e6])
    expect(counted).toEqual([settled.cost])
  })

  test('a live process keeps the ledger lock even with an old lock file, and its exit releases it', async () => {
    const log = join(await dirOf(), 'aquatome-billed.jsonl')
    const lock = `${log}.lock.sqlite`
    const hold = JSON.stringify({ at: TODAY, step: BILLED_STEP, usd: 9.5, held: 'other' }) + '\n'
    const other = spawn(process.execPath, ['-e', `
      const db = new (require('node:sqlite').DatabaseSync)(${JSON.stringify(lock)});
      db.exec('BEGIN IMMEDIATE');
      process.on('message', () => {
        require('node:fs').appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(hold)});
        process.exit(0);
      });
      process.send('locked');
    `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    const exited = new Promise<void>(resolve => other.once('exit', () => resolve()))
    try {
      await Promise.race([
        new Promise<void>(resolve => other.once('message', () => resolve())),
        exited.then(() => { throw new Error('lock holder exited before acquiring the lock') }),
      ])
      const old = new Date(Date.now() - 60_000)
      utimesSync(lock, old, old)
      const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
      let ran = false
      const attempt = b.call({ body: ask(1) }, async () => { ran = true; return answer(0)() })
      const refused = expect(attempt).rejects.toThrow(/\$9\.50 of \$10\.00/)
      await new Promise(r => setTimeout(r, 25))
      expect(ran).toBe(false)
      expect(existsSync(log)).toBe(false)
      other.send('finish')
      await refused
      await exited
    } finally {
      if (other.exitCode === null && other.signalCode === null) other.kill()
      await exited
    }
    expect(await new Billed(BILLED_STEP, log, LINE, () => NOW).call({ body: ask(0.1) }, answer(0))).toBe('ok')
  })

  test('an admission that waits across midnight uses the new day’s allowance', async () => {
    const log = join(await dirOf(), 'aquatome-billed.jsonl')
    const lock = new DatabaseSync(`${log}.lock.sqlite`)
    lock.exec('BEGIN IMMEDIATE')
    let now = new Date('2026-11-17T16:59:59Z')
    const ceilings = { ...LINE, api: { tables: [...LINE.api!.tables, { from: '2026-11-18T00:00:00+07:00', default: 0, backstop: 0, steps: {} }] } }
    const billed = new Billed(BILLED_STEP, log, ceilings, () => now)
    let ran = false
    const attempt = billed.call({ body: ask(0.1) }, async () => { ran = true; return answer(0)() })
    now = new Date('2026-11-17T17:00:00Z')
    lock.close()
    await expect(attempt).rejects.toThrow(/\$0\.00 of \$0\.00/)
    expect([ran, existsSync(log)]).toEqual([false, false])
  })

  test('a billed log it can\'t read whole stops the run before the call, where $0 would let it spend past its line; the engine\'s reader keeps skipping what it can\'t read', async () => {
    const hold = { at: TODAY, step: BILLED_STEP, model: 'claude-sonnet-5-5', usd: 2, held: 'h1' }
    const settlement = { ...hold, held: undefined, settles: 'h1', usd: -1, cost: 1 }
    const jsonl = (...rows: unknown[]) => rows.map(row => JSON.stringify(row) + '\n').join('')
    const bad: [string, string, RegExp][] = [
      ['a line that isn\'t JSON', `${JSON.stringify(hold)}\n{"at": "${TODAY}", "st\n`, /isn't JSON \(line 2\)/],
      ['a last line cut short', `${JSON.stringify(hold)}\n{"at":"${TODAY}"`, /cut short/],
      ['a settle with no hold', `${JSON.stringify({ ...hold, held: undefined, settles: 'nowhere', usd: -1 })}\n`, /never held \(line 1\)/],
      ['a line with no dollars', `${JSON.stringify({ ...hold, usd: 'two' })}\n`, /isn't a billed call's \(line 1\)/],
      ['a replayed refund', jsonl(hold, settlement, settlement), /settles a call twice/],
      ['a duplicate hold', jsonl(hold, hold), /repeated hold/],
      ['a refund on a different day', jsonl(hold, { ...settlement, at: YESTERDAY }), /doesn't match its hold/],
      ['a refund on a different step', jsonl(hold, { ...settlement, step: 'other' }), /doesn't match its hold/],
      ['a refund larger than the hold', jsonl(hold, { ...settlement, usd: -3, cost: -1 }), /doesn't match its hold/],
      ['a standalone negative amount', jsonl({ ...hold, held: undefined, usd: -4 }), /negative charge/],
    ]
    for (const [what, text, why] of bad) {
      const log = join(await dirOf(), 'aquatome-billed.jsonl')
      await writeFile(log, text)
      let ran = false
      const b = new Billed(BILLED_STEP, log, LINE, () => NOW)
      await expect(b.call({ body: ask(0.1) }, async () => { ran = true; return answer(0)() }), what).rejects.toThrow(why)
      expect([ran, b.stopped], what).toEqual([false, expect.stringMatching(why)])
      // spentIn, the Mac's count, reads on.
      expect(() => spentIn([log], NOW), what).not.toThrow()
    }
    // One it can't read at all.
    const dir = await dirOf()
    const log = join(dir, 'aquatome-billed.jsonl')
    await writeFile(log, `${JSON.stringify(hold)}\n`)
    await chmod(log, 0o000)
    await expect(new Billed(BILLED_STEP, log, LINE, () => NOW).call({ body: ask(0.1) }, answer(0))).rejects.toThrow(/can't be read/)
    await chmod(log, 0o644)
    // None yet is $0: the first call of all makes it.
    const fresh = join(dir, 'new', 'aquatome-billed.jsonl')
    await mkdir(join(dir, 'new'))
    expect(await new Billed(BILLED_STEP, fresh, LINE, () => NOW).call({ body: ask(0.1) }, answer(0))).toBe('ok')
  })
})
