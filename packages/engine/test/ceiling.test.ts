import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CEILINGS, ceilingMessage, machine, spentToday, stepName, tableInForce, type CeilingTable, type Ceilings, type Place } from '../src/ceiling'
import { LlmError } from '../src/claude'
import { accountsOut } from '../src/gate'
import { errorKind } from '../src/state'

/** A folder of cost logs, a file a name: lines as objects, or as raw text. */
const logs = async (files: Record<string, unknown[]>) => {
  const dir = await mkdtemp(join(tmpdir(), 'ceil-'))
  for (const [name, lines] of Object.entries(files)) await writeFile(join(dir, name), lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + (lines.length ? '\n' : ''))
  return dir
}
const place = (steps: Place['steps'], o: Partial<Place> = {}): Place => ({ default: 1, backstop: 100, steps: { gate: null, moderate: null, ...steps }, ...o })
const one = (mac: Place, github: Place = mac, from = '2026-11-12T00:00:00+07:00'): Ceilings => ({ clock: 'test', tables: [{ from, mac, github }] })

// 17:00 UTC is midnight in Vietnam: a line at 16:59 UTC is still that date's day there, and one at 17:00 the next day's.
const NOW = new Date('2026-11-12T16:59:00.000Z')
const TODAY = NOW.toISOString()
const TODAY_FIRST = '2026-11-11T17:00:00.000Z'
const TOMORROW = '2026-11-12T17:00:00.000Z'
const YESTERDAY = '2026-11-11T16:59:00.000Z'

test('a day\'s spend is this Vietnam day\'s lines, by step and in all, from every cost log in the folder', async () => {
  const dir = await logs({
    'aquatome-cost-pages.jsonl': [
      { at: TODAY, step: 'run', usd: 1.25 },
      { at: TODAY_FIRST, step: 'run', usd: 0.25 },
      { at: TODAY, step: 'gate', usd: 9 },
      { at: TOMORROW, step: 'run', usd: 4 },
      { at: YESTERDAY, step: 'run', usd: 8 },
      { at: TODAY, usd: 7 }, // no step: in the total alone
      { at: TODAY, step: 'run' }, // no cost
      { at: 'not-a-time', step: 'run', usd: 5 },
      'not json', 'null', '',
    ],
    // The same step from another job on the Mac: `run` is in the pages' log and in Seriously Fish's.
    'aquatome-cost-sf.jsonl': [{ at: TODAY, step: 'run', usd: 2 }],
    'other.jsonl': [{ at: TODAY, step: 'run', usd: 100 }],
  })
  const spent = spentToday(join(dir, 'aquatome-cost-pages.jsonl'), NOW)
  expect(spent.by.get('run')).toBe(3.5)
  expect(spent.by.get('gate')).toBe(9)
  expect(spent.total).toBe(19.5)
  // A log not there yet: the others beside it still count.
  expect(spentToday(join(dir, 'aquatome-cost-videos.jsonl'), NOW).total).toBe(19.5)
  expect(spentToday(join(dir, 'missing', 'aquatome-cost-x.jsonl'), NOW)).toEqual({ total: 0, by: new Map() })
})

test('the table in force is the one whose from is the latest that has passed, wherever it stands in the list', () => {
  const t = (from: string): CeilingTable => ({ from, mac: place({}), github: place({}) })
  const first = t('2026-11-12T00:00:00+07:00'), second = t('2026-11-20T00:00:00+07:00')
  for (const list of [[first, second], [second, first]]) {
    expect(tableInForce(list, new Date('2026-11-11T16:59:00.000Z'))).toBeUndefined()
    expect(tableInForce(list, new Date('2026-11-11T17:00:00.000Z'))).toBe(first)
    expect(tableInForce(list, new Date('2026-11-19T16:59:00.000Z'))).toBe(first)
    expect(tableInForce(list, new Date('2026-11-19T17:00:00.000Z'))).toBe(second)
  }
  expect(tableInForce([], NOW)).toBeUndefined()
  expect(tableInForce([t('soon')], NOW)).toBeUndefined()
})

test('a named step has its ceiling, any other the small one, and the gate and moderation none', async () => {
  const table = one(place({ localize: 25, videos: 0 }))
  const at = (lines: unknown[]) => logs({ 'aquatome-cost-a.jsonl': lines }).then(d => join(d, 'aquatome-cost-a.jsonl'))
  const msg = (step: string, log: string | undefined, c = table, now = NOW) => ceilingMessage(step, log, c, now, 'mac')
  expect(msg('localize', await at([{ at: TODAY, step: 'localize', usd: 24.5 }]))).toBeUndefined()
  const full = await at([{ at: TODAY, step: 'localize', usd: 25 }])
  expect(msg('localize', full)).toBe('claude failed: the engine\'s daily limit reached for localize ($25.00 of $25 today)')
  // A step the file doesn't name is never without a ceiling.
  expect(msg('traits', await at([{ at: TODAY, step: 'traits', usd: 0.5 }]))).toBeUndefined()
  expect(msg('traits', await at([{ at: TODAY, step: 'traits', usd: 1 }]))).toBe('claude failed: the engine\'s daily limit reached for traits ($1.00 of $1 today)')
  // $0 stops the first call.
  expect(msg('videos', await at([]))).toBe('claude failed: the engine\'s daily limit reached for videos ($0.00 of $0 today)')
  // Yesterday's spend is yesterday's.
  expect(msg('localize', await at([{ at: YESTERDAY, step: 'localize', usd: 25 }]))).toBeUndefined()
  // The gate and moderation are never stopped, whatever they or anything else spent.
  const heavy = await at([{ at: TODAY, step: 'gate', usd: 1000 }, { at: TODAY, step: 'moderate', usd: 1000 }])
  expect(msg('gate', heavy)).toBeUndefined()
  expect(msg('moderate', heavy)).toBeUndefined()
  // With no log there is nothing to count from: the tests.
  expect(msg('localize', undefined)).toBeUndefined()
  expect(msg('localize', '')).toBeUndefined()
})

test('the backstop: once everything logged that day reaches it, every step with a ceiling stops, and the gate and moderation go on', async () => {
  const table = one(place({ localize: 25, run: 30 }, { backstop: 40 }))
  const dir = await logs({
    'aquatome-cost-pages.jsonl': [{ at: TODAY, step: 'run', usd: 20 }, { at: TODAY, step: 'gate', usd: 12 }],
    'aquatome-cost-videos.jsonl': [{ at: TODAY, step: 'videos', usd: 0.5 }, { at: TODAY, step: 'moderate', usd: 7.4 }],
  })
  const log = join(dir, 'aquatome-cost-pages.jsonl')
  const msg = (step: string) => ceilingMessage(step, log, table, NOW, 'mac')
  expect(msg('run')).toBeUndefined() // $39.90 in all
  await writeFile(join(dir, 'aquatome-cost-sf.jsonl'), `${JSON.stringify({ at: TODAY, step: 'summaries', usd: 0.1 })}\n`)
  for (const step of ['run', 'localize', 'traits']) expect(msg(step)).toBe('claude failed: the engine\'s daily limit reached for every step ($40.00 of $40 today)')
  expect(msg('gate')).toBeUndefined()
  expect(msg('moderate')).toBeUndefined()
})

test('each machine has its own share, and before the first table nothing calls but the gate and moderation', async () => {
  const table = one(place({ run: 30 }), place({ localize: 25 }, { default: 0 }))
  const dir = await logs({ 'aquatome-cost-a.jsonl': [] })
  const log = join(dir, 'aquatome-cost-a.jsonl')
  expect(ceilingMessage('run', log, table, NOW, 'mac')).toBeUndefined()
  expect(ceilingMessage('run', log, table, NOW, 'github')).toContain('for run ($0.00 of $0 today)')
  expect(ceilingMessage('localize', log, table, NOW, 'github')).toBeUndefined()
  expect(machine({ GITHUB_ACTIONS: 'true' })).toBe('github')
  expect(machine({})).toBe('mac')
  const early = new Date('2026-11-11T00:00:00Z')
  for (const c of [table, { clock: 'test', tables: [] }]) {
    expect(ceilingMessage('run', log, c, early, 'mac')).toContain('limit reached')
    expect(ceilingMessage('gate', log, c, early, 'mac')).toBeUndefined()
    expect(ceilingMessage('moderate', log, c, early, 'github')).toBeUndefined()
  }
})

test('a cost log that can\'t be written stops the call: its spend would never be counted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ceil-'))
  await mkdir(join(dir, 'closed'))
  await chmod(join(dir, 'closed'), 0o500)
  const table = one(place({ run: 30 }))
  for (const log of [join(dir, 'closed', 'aquatome-cost-a.jsonl'), join(dir, 'no-such-folder', 'aquatome-cost-a.jsonl')]) {
    const message = ceilingMessage('run', log, table, NOW, 'mac')
    expect(message).toContain('the cost log can\'t be written')
    expect(errorKind(message)).toBe('usage')
    // The gate is never stopped, by this either.
    expect(ceilingMessage('gate', log, table, NOW, 'mac')).toBeUndefined()
  }
})

test('every message a ceiling stops a call with is a usage limit to the steps (state.ts) and a page it can\'t read to the gate', async () => {
  const dir = await logs({ 'aquatome-cost-a.jsonl': [{ at: TODAY, step: 'run', usd: 50 }] })
  const log = join(dir, 'aquatome-cost-a.jsonl')
  const messages = [
    ceilingMessage('run', log, one(place({ run: 30 })), NOW, 'mac'),
    ceilingMessage('traits', log, one(place({}, { backstop: 40 })), NOW, 'mac'),
    ceilingMessage('run', join(dir, 'none', 'x.jsonl'), one(place({})), NOW, 'mac'),
  ]
  for (const m of messages) {
    expect(m).toMatch(/^claude failed: /)
    expect(errorKind(m)).toBe('usage')
    expect(accountsOut(new LlmError(m))).toBe(true)
  }
})

test('a call is counted under the engine\'s command, or the name of a script run by itself', () => {
  expect(stepName(['node', '/repo/packages/engine/src/cli.ts', 'localize', '--lang', 'id'])).toBe('localize')
  expect(stepName(['node', '/repo/packages/engine/src/cli.ts', '--limit', '5'])).toBe('cli')
  expect(stepName(['node', '/repo/packages/engine/src/cli.ts'])).toBe('cli')
  expect(stepName(['node', '/repo/packages/engine/scripts/translate-ui.ts', '--lang', 'ms'])).toBe('translate-ui')
  expect(stepName(['node', '/x/dist/cli.mjs', 'gate'])).toBe('gate')
  expect(stepName(['node'])).toBe('unnamed')
})

// The file the engine goes by.
const cap = (when: string, where: 'mac' | 'github', step: string) => { const p = tableInForce(CEILINGS.tables, new Date(when))![where]; return Object.hasOwn(p.steps, step) ? p.steps[step] : p.default }

test('ceilings.json: it names its clock, its tables are in order, one is always in force, and the gate and moderation have no ceiling', () => {
  expect(CEILINGS.clock).toMatch(/Asia\/Saigon \(UTC\+7\)/)
  const froms = CEILINGS.tables.map(t => Date.parse(t.from))
  expect(froms.every(f => !Number.isNaN(f))).toBe(true)
  expect(froms).toEqual([...froms].sort((a, b) => a - b))
  expect(new Set(froms).size).toBe(froms.length)
  // In force from before this change merged, so there is no time with none.
  expect(froms[0]).toBeLessThanOrEqual(Date.parse('2026-11-11T12:00:00Z'))
  for (const t of CEILINGS.tables) for (const p of [t.mac, t.github]) {
    expect(p.steps.gate).toBeNull()
    expect(p.steps.moderate).toBeNull()
    expect(p.default).toBeGreaterThanOrEqual(0)
    expect(p.backstop).toBeGreaterThan(0)
    for (const [step, n] of Object.entries(p.steps)) if (step !== 'gate' && step !== 'moderate') expect(n).toBeGreaterThanOrEqual(0)
  }
})

test('ceilings.json: the stretch on the third sign-in is one allowance on GitHub, and from 13 Nov 08:00 it is one sign-in\'s day', () => {
  // 12 Nov, before 13:00: nothing.
  expect(cap('2026-11-12T12:59:00+07:00', 'github', 'localize')).toBe(0)
  // 12 Nov 13:00 to midnight: translation and the Vietnamese rewrite on GitHub, nothing else anywhere.
  const evening = '2026-11-12T23:00:00+07:00'
  expect(cap(evening, 'github', 'localize')).toBe(25)
  expect(cap(evening, 'github', 'rewrite-vi')).toBe(3)
  for (const step of ['run', 'reader', 'review-backfill', 'videos', 'fit-rewrite', 'anything-new']) expect(cap(evening, 'github', step)).toBe(0)
  for (const step of ['run', 'localize', 'rewrite-vi', 'videos', 'anything-new']) expect(cap(evening, 'mac', step)).toBe(0)
  // Past midnight the day's sums start again, so the same table would allow the $25 twice: nothing more until 08:00.
  for (const where of ['mac', 'github'] as const) for (const step of ['localize', 'rewrite-vi', 'run']) expect(cap('2026-11-13T01:00:00+07:00', where, step)).toBe(0)
  expect(cap('2026-11-13T07:59:00+07:00', 'github', 'localize')).toBe(0)
  // 13 Nov 08:00 on: the one-sign-in column.
  const day = '2026-11-13T09:00:00+07:00'
  const t = tableInForce(CEILINGS.tables, new Date(day))!
  const sum = (p: Place) => Object.values(p.steps).reduce<number>((n, x) => n + (x ?? 0), 0)
  expect(sum(t.mac) + sum(t.github)).toBe(129)
  expect(t.mac.backstop + t.github.backstop).toBe(150)
  expect(t.mac.default).toBe(1)
  expect(t.github.default).toBe(1)
  expect(cap(day, 'mac', 'run')).toBe(30)
  expect(cap(day, 'github', 'localize')).toBe(25)
  // Second reads are $12 between the machines, the 97 video guides have $10 of their own, and the reader-fit rewrite's
  // $5 comes out of the Vietnamese rewrite's $8.
  expect(cap(day, 'mac', 'review-backfill')! + cap(day, 'github', 'review-backfill')!).toBe(12)
  expect(cap(day, 'mac', 'review-backfill-97')).toBe(10)
  expect(cap(day, 'github', 'fit-rewrite')! + cap(day, 'github', 'rewrite-vi')!).toBe(8)
  // A step that runs on the other machine, or a new one, has the small ceiling.
  expect(cap(day, 'github', 'run')).toBe(1)
  expect(cap(day, 'mac', 'anything-new')).toBe(1)
})
