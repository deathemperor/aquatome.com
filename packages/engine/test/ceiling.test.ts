import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CEILINGS, ceilingMessage, costLog, handLog, leftYielding, machine, nameStep, spentToday, stepName, tableInForce, type CeilingTable, type Ceilings, type Place } from '../src/ceiling'
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

test('a step that yields spends only what leaves every other named step its whole line, and room for the gate and moderation', async () => {
  const table = one(place({ run: 50, videos: 20, board: 30 }, { backstop: 100 }))
  const at = (lines: unknown[]) => logs({ 'aquatome-cost-a.jsonl': lines }).then(d => join(d, 'aquatome-cost-a.jsonl'))
  const left = async (lines: unknown[], c = table) => leftYielding('board', await at(lines), 5, c, NOW, 'mac')
  // Nothing spent: run and videos keep $70, the gate $5, so $25 of the board's $30.
  expect(await left([])).toBe(25)
  // What the others spend comes out of their own lines, not the board's room; what the gate spent counts.
  expect(await left([{ at: TODAY, step: 'run', usd: 30 }, { at: TODAY, step: 'gate', usd: 4 }, { at: TODAY, step: 'board', usd: 10 }])).toBe(11)
  // A step past its line holds no more room than none, and the board's own line still binds.
  expect(await left([{ at: TODAY, step: 'run', usd: 60 }], one(place({ run: 50, videos: 20, board: 30 }, { backstop: 200 })))).toBe(30)
  // Never below nothing.
  expect(await left([{ at: TODAY, step: 'videos', usd: 15 }, { at: TODAY, step: 'gate', usd: 40 }])).toBe(0)
  // The gate has no ceiling to yield from.
  expect(leftYielding('gate', await at([]), 5, table, NOW, 'mac')).toBeNull()
})

test('a day whose spend can\'t be counted stops every step with a ceiling until it ends, whatever table is in force; the gate and moderation go on', async () => {
  // scripts/cost-log-restore.mjs writes this line when an earlier cloud run that day kept no cost log: no dollar figure
  // is known, so none is invented, and a later table with a higher backstop can't let the day spend again.
  const why = 'run 43171489553 ran the cycle today and kept no cost log'
  const dir = await logs({ 'aquatome-cost-rewrite.jsonl': [{ at: TODAY_FIRST, unlogged: why }, { at: TODAY, step: 'run', usd: 1 }] })
  const log = join(dir, 'aquatome-cost-rewrite.jsonl')
  const later: Ceilings = { clock: 'test', tables: [{ from: '2026-11-12T00:00:00+07:00', mac: place({}), github: place({ run: 30 }, { backstop: 40 }) }, { from: '2026-11-12T08:00:00+07:00', mac: place({}), github: place({ run: 60 }, { backstop: 400 }) }] }
  for (const step of ['run', 'localize', 'write-ideas']) {
    const m = ceilingMessage(step, log, later, NOW, 'github')
    expect(m).toBe(`claude failed: the engine's daily limit reached for every step (today's spend can't be counted: ${why})`)
    expect(errorKind(m)).toBe('usage')
    expect(accountsOut(new LlmError(m!))).toBe(true)
  }
  expect(ceilingMessage('gate', log, later, NOW, 'github')).toBeUndefined()
  expect(ceilingMessage('moderate', log, later, NOW, 'github')).toBeUndefined()
  expect(spentToday(log, NOW)).toMatchObject({ total: 1, unlogged: why })
  // The next day counts again: the line is the day's alone.
  expect(ceilingMessage('run', log, later, new Date(TOMORROW), 'github')).toBeUndefined()
  // A line from yesterday, or one that isn't a reason, stops nothing.
  const other = await logs({ 'aquatome-cost-rewrite.jsonl': [{ at: YESTERDAY, unlogged: why }, { at: TODAY, unlogged: 5 }, { at: TODAY, step: 'run', usd: 1 }] })
  expect(ceilingMessage('run', join(other, 'aquatome-cost-rewrite.jsonl'), later, NOW, 'github')).toBeUndefined()
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
  // The engine's own parser has the last word: the command wherever it stood among the options.
  try {
    nameStep('gate')
    expect(stepName(['node', '/repo/packages/engine/src/cli.ts', '--limit', '1', 'gate'])).toBe('gate')
  } finally {
    nameStep(undefined)
  }
  expect(stepName(['node', '/repo/packages/engine/src/cli.ts', '--limit', '1', 'gate'])).toBe('cli')
})

test('every call has a cost log: the one a cycle names, else the hand runs\'; only the tests have none', () => {
  expect(costLog({ ENGINE_COST_LOG: '/logs/aquatome-cost-pages.jsonl' })).toBe('/logs/aquatome-cost-pages.jsonl')
  // A step or a script run by itself, with nothing named: counted like a cycle's, not let through.
  expect(costLog({})).toBe(handLog())
  expect(costLog({ ENGINE_COST_LOG: '' })).toBe(handLog())
  expect(handLog()).toMatch(/aquatome-cost-hand\.jsonl$/)
  // vitest.config.ts: these tests' stand-in calls are written nowhere.
  expect(costLog({ ENGINE_COST_LOG: 'off' })).toBeUndefined()
  expect(process.env.ENGINE_COST_LOG).toBe('off')
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

test('ceilings.json: nothing until the third sign-in is back, then one, two and three sign-ins\' days', () => {
  // Until 12 Nov 13:00 every sign-in is out, and nothing has a ceiling above $0.
  for (const where of ['mac', 'github'] as const) for (const step of ['run', 'localize', 'rewrite-vi', 'videos', 'anything-new']) expect(cap('2026-11-12T12:59:00+07:00', where, step)).toBe(0)
  const sum = (p: Place) => Object.values(p.steps).reduce<number>((n, x) => n + (x ?? 0), 0)
  // The ceilings follow the sign-ins that are back (the owner and the chief of staff, 11 Nov 2026): the third on
  // 12 Nov 13:00, the first on 13 Nov 08:00, the second on 14 Nov 08:00. `steps` is every named ceiling added up.
  // The troubleshooting board: $40 on the Mac on 14 Nov and $60 on 15 Nov, then the small line (the chief of staff, 13 Nov
  // 2026), inside the backstop that was already there.
  const periods = [
    { from: '2026-11-12T13:00:00+07:00', to: '2026-11-13T07:59:00+07:00', steps: 142, backstop: 150, small: 1, run: 30, localize: 25, second: 12, fit: 5, vi: 3, crops: 1, board: 1 },
    { from: '2026-11-13T08:00:00+07:00', to: '2026-11-13T21:59:00+07:00', steps: 278, backstop: 300, small: 2, run: 70, localize: 50, second: 18, fit: 10, vi: 12, crops: 4, board: 2 },
    { from: '2026-11-13T22:00:00+07:00', to: '2026-11-14T02:59:00+07:00', steps: 288, backstop: 300, small: 2, run: 70, localize: 50, second: 18, fit: 10, vi: 12, crops: 4, board: 2, glossary: 10 },
    { from: '2026-11-14T03:00:00+07:00', to: '2026-11-14T07:59:00+07:00', steps: 303, backstop: 300, small: 2, run: 70, localize: 50, second: 18, fit: 10, vi: 12, crops: 4, board: 2, glossary: 25 },
    { from: '2026-11-14T08:00:00+07:00', to: '2026-11-14T23:59:00+07:00', steps: 466, backstop: 450, small: 4, run: 105, localize: 75, second: 21, fit: 15, vi: 12, crops: 1, board: 40, glossary: 40, ask: 0 },
    { from: '2026-11-15T00:00:00+07:00', to: '2026-11-15T23:59:00+07:00', steps: 492, backstop: 450, small: 4, run: 105, localize: 75, second: 21, fit: 15, vi: 12, crops: 1, board: 60, glossary: 40, material: 5, ask: 0, ideas: 4 },
    { from: '2026-11-16T00:00:00+07:00', to: '2026-12-31T00:00:00+07:00', steps: 434, backstop: 450, small: 4, run: 105, localize: 75, second: 21, fit: 15, vi: 12, crops: 1, board: 4, glossary: 40, material: 5, ask: 2, ideas: 4 },
  ]
  for (const p of periods) for (const when of [p.from, p.to]) {
    const t = tableInForce(CEILINGS.tables, new Date(when))!
    expect(sum(t.mac) + sum(t.github)).toBe(p.steps)
    expect(t.mac.backstop + t.github.backstop).toBe(p.backstop)
    expect([t.mac.default, t.github.default]).toEqual([p.small, p.small])
    expect(cap(when, 'mac', 'run')).toBe(p.run)
    expect(cap(when, 'github', 'localize')).toBe(p.localize)
    // Second reads are split between the machines: video guides on the Mac, the rest on GitHub.
    expect(cap(when, 'mac', 'review-backfill')! + cap(when, 'github', 'review-backfill')!).toBe(p.second)
    // The reader-fit rewrite's share comes out of the Vietnamese rewrite's line.
    expect(cap(when, 'github', 'fit-rewrite')).toBe(p.fit)
    // The style rewrite: $12 from 13 Nov. At $6 it stopped after 5 pages that day, all 5 kept (the chief of staff, 13 Nov
    // 2026); the cloud's backstop is what keeps the sign-in inside its day, and it stays.
    expect(cap(when, 'github', 'rewrite-vi')).toBe(p.vi)
    // The 97 video guides' two more reads have $10 of their own, whatever the column.
    expect(cap(when, 'mac', 'review-backfill-97')).toBe(10)
    // The card crops: $4 for their first day, 13 Nov, then $1.
    expect(cap(when, 'mac', 'card-crops')).toBe(p.crops)
    expect(cap(when, 'mac', 'chat-board')).toBe(p.board)
    expect(cap(when, 'github', 'chat-board')).toBe(p.small)
    // The glossary's fuller entries, run by hand on the Mac: $10 from 13 Nov 22:00, so Lũa's is written that night, then $40
    // a day from 14 Nov 08:00, about 7 terms a day (the chief of staff, 13 Nov 2026, after the owner found the pages bare).
    // $25 from 14 Nov 03:00 until 08:00, so Lũa's last pass can't run out partway (the chief of staff, 14 Nov 2026).
    expect(cap(when, 'mac', 'glossary-entry')).toBe(p.glossary ?? p.small)
    // The materials writer, run by hand on the Mac: $5 a day from 15 Nov, the two driftwood pages in turn (the chief of
    // staff, 14 Nov 2026).
    expect(cap(when, 'mac', 'material')).toBe(p.material ?? p.small)
    // The album ask: $2 a day on the Mac from 16 Nov, the first day with room under the backstop, and none before (the chief
    // of staff, 14 Nov 2026).
    expect(cap(when, 'mac', 'album-ask')).toBe(p.ask ?? p.small)
    // The ideas step: on 12 Nov its $1 line stopped it part way through its first guide, which costs about $1.30 (9
    // calls), and it wrote nothing. Now a guide starts only when its line covers one (pieces.ts), and the line is $3, two
    // guides, in the cloud, where the step runs; the Mac's is $0 (the chief of staff, 12 Nov 2026). A guide came to $1.51 on
    // 13 and 14 Nov, so $3 left $1.49 after the first and the second never started: one a day. $4 from 15 Nov, two a day
    // (the chief of staff, 14 Nov 2026).
    expect(cap(when, 'github', 'write-ideas')).toBe(p.ideas ?? 3)
    expect(cap(when, 'mac', 'write-ideas')).toBe(0)
    // A step that runs on the other machine, or a new one, has the small ceiling, never none.
    expect(cap(when, 'github', 'run')).toBe(p.small)
    expect(cap(when, 'mac', 'anything-new')).toBe(p.small)
  }
})
