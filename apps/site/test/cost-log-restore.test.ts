import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { allRuns, cycleSteps, dayStart, keptLogs, ownRuns, restore, unloggedLine, vnDay } from '../../../scripts/cost-log-restore.mjs'

// The cloud cycle's cost log when GitHub's cache has none (scripts/cost-log-restore.mjs): the runs' own copies, and a
// day that can't be counted stops every step with a ceiling (packages/engine/src/ceiling.ts reads the line).

const REPO = 1436734971
type Run = { id: number; event: string; head_branch: string; created_at: string; updated_at: string; repository: { id: number }; head_repository: { id: number } }
type Kept = { text: string; at: string }
const run = (id: number, created: string, updated: string, o: Partial<Run> = {}): Run =>
  ({ id, event: 'workflow_dispatch', head_branch: 'main', created_at: created, updated_at: updated, repository: { id: REPO }, head_repository: { id: REPO }, ...o })
const due = { name: 'Is a cycle due?', steps: [{ name: 'Started by hand, or ENGINE_EVERY_MINUTES since the last cycle started', conclusion: 'success' }] }
// The cycle job of one attempt, its cycle step ended at `ended`.
const cycle = (conclusion: string, ended?: string, attempt = 1) => ({
  name: 'Content cycle: rewrite',
  run_attempt: attempt,
  steps: [{ name: 'Restore the cost log', conclusion }, { name: 'Run this part, test, commit, push, deploy', conclusion, completed_at: ended ?? null }],
})
const skipped = { name: 'Content cycle: rewrite', conclusion: 'skipped', steps: [] }
const ids = (runs: Run[]) => runs.map(r => r.id)

// 12 Nov 2026 as it was: the 06:55Z cycle found no cache. Every run since 11 Nov's last cycle was an hourly check that
// found none due (seconds long, its cycle job skipped), and 11 Nov's cycle kept its log (artifact 13850875027).
const NOW = new Date('2026-11-12T06:55:30Z')
const DAY_12 = [
  run(43171489553, '2026-11-12T06:55:09Z', '2026-11-12T06:55:30Z'),
  run(43164549760, '2026-11-12T05:55:10Z', '2026-11-12T05:55:16Z'),
  run(43162910439, '2026-11-12T05:40:10Z', '2026-11-12T05:40:18Z'),
  run(43157892312, '2026-11-12T04:55:09Z', '2026-11-12T04:55:16Z'),
  run(43151352829, '2026-11-12T03:55:09Z', '2026-11-12T03:55:16Z'),
  run(43150981135, '2026-11-12T03:51:41Z', '2026-11-12T03:51:48Z', { event: 'schedule' }),
  run(43144658638, '2026-11-12T02:55:09Z', '2026-11-12T02:55:17Z'),
  run(43142993990, '2026-11-12T02:40:10Z', '2026-11-12T02:40:16Z'),
  run(42990842284, '2026-11-11T08:55:11Z', '2026-11-11T11:11:30Z'),
  run(42968856039, '2026-11-11T05:55:08Z', '2026-11-11T06:48:39Z'),
]
const kept: Record<number, Kept[]> = { 42990842284: [{ text: '{"at":"2026-11-11T10:02:00.000Z","step":"localize","usd":0.4}\n', at: '2026-11-11T11:11:20Z' }] }

test('12 Nov replayed: the log comes from 11 Nov\'s last cycle, and nothing is held, as no cycle ran that day before', () => {
  const asked: number[] = []
  const runs = ownRuns(DAY_12, REPO, NOW)
  const r = restore(runs, (x: Run) => { asked.push(x.id); return kept[x.id] ?? [] }, () => [due, skipped], NOW)
  expect(r).toEqual({ from: 42990842284, text: kept[42990842284]![0]!.text, unknown: [] })
  // Each run active today, this one too, then the first before today that kept a log; none older.
  expect(asked).toEqual(ids(DAY_12).slice(0, 9))
})

test('a run that ran the cycle today and kept no log after it makes the day uncountable; one of an earlier day, or one whose cycle never started, doesn\'t', () => {
  const jobs: Record<number, object[]> = {
    3: [due, cycle('failure', '2026-11-12T02:50:00Z')], // ran today, kept nothing
    2: [due, skipped], // an hourly check
    1: [due, cycle('success', '2026-11-11T13:50:00Z')], // kept its log
  }
  const runs = [
    run(3, '2026-11-12T01:00:00Z', '2026-11-12T03:00:00Z'),
    run(2, '2026-11-12T00:30:00Z', '2026-11-12T00:30:06Z'),
    run(1, '2026-11-11T12:00:00Z', '2026-11-11T14:00:00Z'),
  ]
  const logs = (x: Run): Kept[] => (x.id === 1 ? [{ text: 'a\n', at: '2026-11-11T13:55:00Z' }] : [])
  expect(restore(runs, logs, (x: Run) => jobs[x.id]!, NOW)).toEqual({ from: 1, text: 'a\n', unknown: [3] })
  // No log anywhere: every cycle of the day is unknown, and none of an earlier day is.
  const yesterday = run(4, '2026-11-11T09:00:00Z', '2026-11-11T11:00:00Z')
  expect(restore([...runs, yesterday], () => [], (x: Run) => jobs[x.id] ?? [due, cycle('success', '2026-11-11T10:00:00Z')], NOW)).toEqual({ unknown: [3] })
  // A cycle that began yesterday in Vietnam and ended today spent part of today; one that ended before midnight didn't,
  // though its run's last step came after.
  const across = run(5, '2026-11-11T16:00:00Z', '2026-11-11T17:30:00Z')
  expect(restore([across], () => [], () => [due, cycle('cancelled', '2026-11-11T17:20:00Z')], NOW)).toEqual({ unknown: [5] })
  const before = run(6, '2026-11-11T16:00:00Z', '2026-11-11T17:05:00Z')
  expect(restore([before], () => [], () => [due, cycle('success', '2026-11-11T16:55:00Z')], NOW)).toEqual({ unknown: [] })
})

// Astra's read of #1167: a log kept before a cycle ended can't hold what that cycle spent.
test('a run again today of a run that began earlier is read, though another run kept its log since it began', () => {
  // Run 20 began yesterday and ran again at 05:00 today, after run 21 kept its log at 02:58; its second attempt kept none.
  const runs = ownRuns([run(21, '2026-11-12T02:00:00Z', '2026-11-12T03:00:00Z'), run(20, '2026-11-11T08:00:00Z', '2026-11-12T05:10:00Z')], REPO, NOW)
  expect(ids(runs)).toEqual([20, 21])
  const jobs: Record<number, object[]> = {
    20: [due, cycle('success', '2026-11-11T09:00:00Z', 1), due, cycle('failure', '2026-11-12T05:05:00Z', 2)],
    21: [due, cycle('success', '2026-11-12T02:55:00Z')],
  }
  const logs: Record<number, Kept[]> = { 21: [{ text: 'b\n', at: '2026-11-12T02:58:00Z' }], 20: [{ text: 'a\n', at: '2026-11-11T09:02:00Z' }] }
  expect(restore(runs, (x: Run) => logs[x.id]!, (x: Run) => jobs[x.id]!, NOW)).toEqual({ from: 20, text: 'b\na\n', unknown: [20] })
  // Its second attempt keeping its own: counted.
  logs[20]!.push({ text: 'a\nc\n', at: '2026-11-12T05:06:00Z' })
  expect(restore(runs, (x: Run) => logs[x.id]!, (x: Run) => jobs[x.id]!, NOW)).toEqual({ from: 20, text: 'b\na\nc\n', unknown: [] })
  // A run begun more than 8 days ago and run again today is still one of ours.
  expect(ids(ownRuns([run(22, '2026-10-20T00:00:00Z', '2026-11-12T04:00:00Z')], REPO, NOW))).toEqual([22])
})

test('an earlier attempt\'s log doesn\'t hold a later attempt that spent and kept none', () => {
  const runs = [run(30, '2026-11-12T01:00:00Z', '2026-11-12T04:00:00Z')]
  const jobs = [due, cycle('failure', '2026-11-12T01:30:00Z', 1), due, cycle('failure', '2026-11-12T03:50:00Z', 2)]
  const first = { text: 'a\n', at: '2026-11-12T01:31:00Z' }
  expect(restore(runs, () => [first], () => jobs, NOW)).toEqual({ from: 30, text: 'a\n', unknown: [30] })
  expect(restore(runs, () => [first, { text: 'a\nb\n', at: '2026-11-12T03:51:00Z' }], () => jobs, NOW)).toEqual({ from: 30, text: 'a\nb\n', unknown: [] })
})

test('the log is every line of today\'s copies and the last earlier day\'s, once each, and no older run is asked', () => {
  const runs = [
    run(43, '2026-11-12T05:00:00Z', '2026-11-12T05:40:00Z'),
    run(42, '2026-11-12T02:00:00Z', '2026-11-12T02:40:00Z'),
    run(41, '2026-11-11T12:00:00Z', '2026-11-11T12:40:00Z'),
    run(40, '2026-11-11T09:00:00Z', '2026-11-11T09:40:00Z'),
  ]
  const logs: Record<number, Kept[]> = {
    // Run 43 found no cache either, so its copy lacks 42's lines.
    43: [{ text: 'z\n', at: '2026-11-12T05:39:00Z' }],
    42: [{ text: 'x\ny\n', at: '2026-11-12T02:39:00Z' }],
    41: [{ text: 'w\nx\n', at: '2026-11-11T12:39:00Z' }],
    40: [{ text: 'v\n', at: '2026-11-11T09:39:00Z' }],
  }
  const asked: number[] = []
  const jobs: Record<number, object[]> = { 43: [due, cycle('success', '2026-11-12T05:38:00Z')], 42: [due, cycle('success', '2026-11-12T02:38:00Z')] }
  const r = restore(runs, (x: Run) => { asked.push(x.id); return logs[x.id]! }, (x: Run) => jobs[x.id]!, NOW)
  expect(r).toEqual({ from: 43, text: 'w\nx\ny\nz\n', unknown: [] })
  expect(asked).toEqual([43, 42, 41])
})

test('only the cycle step having started counts as a cycle run, in any attempt', () => {
  const ran = (jobs: object[]) => cycleSteps(jobs).length
  expect(ran([due, cycle('success')])).toBe(1)
  expect(ran([due, cycle('failure')])).toBe(1)
  expect(ran([due, cycle('cancelled'), due, cycle('success', undefined, 2)])).toBe(2)
  // A conclusion this doesn't know reads as spent, the careful way; none yet (this run's own, to come), or skipped, isn't a start.
  expect(ran([due, cycle('timed_out')])).toBe(1)
  expect(ran([due, { name: 'Content cycle: rewrite', steps: [{ name: 'Run this part, test, commit, push, deploy', conclusion: null }] }])).toBe(0)
  expect(ran([due, skipped])).toBe(0)
  expect(ran([due, cycle('skipped')])).toBe(0)
  expect(ran([due, { name: 'Content cycle: rewrite', conclusion: 'cancelled' }])).toBe(0)
  expect(ran([])).toBe(0)
})

test('only this repository\'s own runs on main, by the schedule or by hand, active in the last 8 days, this one too', () => {
  const runs = [
    run(10, '2026-11-12T05:00:00Z', '2026-11-12T05:00:06Z'),
    run(11, '2026-11-12T04:00:00Z', '2026-11-12T04:30:00Z', { event: 'pull_request' }),
    run(12, '2026-11-12T03:00:00Z', '2026-11-12T03:30:00Z', { head_repository: { id: 99 } }),
    run(13, '2026-11-12T02:00:00Z', '2026-11-12T02:30:00Z', { head_branch: 'fix/x' }),
    run(14, '2026-11-12T01:00:00Z', '2026-11-12T01:30:00Z', { repository: { id: 99 } }),
    run(15, '2026-11-04T06:00:00Z', '2026-11-04T06:30:00Z'),
    run(16, '2026-11-12T06:00:00Z', '2026-11-12T06:30:00Z', { event: 'schedule' }),
    run(17, '2026-11-12T06:50:00Z', '2026-11-12T06:55:00Z'),
  ]
  expect(ids(ownRuns(runs, REPO, NOW))).toEqual([17, 16, 10])
})

test('runs are asked for back to the oldest GitHub can still run again, and past the most pages the day can\'t be counted', () => {
  const page = (days: number[]) => days.map((d, i) => run(i, new Date(NOW.getTime() - d * 86_400_000).toISOString(), NOW.toISOString()))
  const full = (d: number) => page(Array(100).fill(d))
  const asked: number[] = []
  const pages = [full(1), full(10), full(29), [...full(29).slice(1), ...page([31])], full(40)]
  expect(allRuns((n: number) => { asked.push(n); return pages[n - 1]! }, NOW)).toHaveLength(400)
  expect(asked).toEqual([1, 2, 3, 4])
  expect(allRuns(() => page([0, 1]), NOW)).toHaveLength(2)
  expect(() => allRuns(() => full(1), NOW, 3)).toThrow('more than 300 runs in 30 days')
})

test('a run\'s copies are its own artifacts under the log\'s name, a copy each attempt, or the one name runs had before', () => {
  const art = (name: string, o: object = {}) => ({ name, expired: false, workflow_run: { repository_id: REPO, head_repository_id: REPO }, ...o })
  const all = [
    art('engine-cost-log-rewrite'),
    art('engine-cost-log-rewrite-1'),
    art('engine-cost-log-rewrite-2'),
    art('engine-cost-log-rewrite-x'),
    art('engine-test-log-rewrite'),
    art('engine-cost-log-rewrite-3', { expired: true }),
    art('engine-cost-log-rewrite-4', { workflow_run: { repository_id: REPO, head_repository_id: 99 } }),
  ]
  expect(keptLogs(all, REPO).map((a: { name: string }) => a.name)).toEqual(['engine-cost-log-rewrite', 'engine-cost-log-rewrite-1', 'engine-cost-log-rewrite-2'])
})

test('the day is Vietnam\'s, and the line carries a reason, never a dollar figure', () => {
  expect(vnDay(new Date('2026-11-11T17:00:00Z'))).toBe('2026-11-12')
  expect(dayStart(NOW)).toBe(Date.parse('2026-11-11T17:00:00Z'))
  const line = JSON.parse(unloggedLine(NOW, 'run 3 ran the cycle today and kept no cost log'))
  expect(line).toEqual({ at: NOW.toISOString(), unlogged: 'run 3 ran the cycle today and kept no cost log' })
  expect(line).not.toHaveProperty('usd')
})

// The script as engine.yml runs it, with gh and unzip stood in for: what it writes, and what it says. `artifacts` is
// each run's copies.
function runScript(o: { cacheHad?: string; runs: Run[]; artifacts?: Record<number, Kept[]>; jobs?: Record<number, object[]>; fail?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-cost-restore-'))
  const bin = join(dir, 'bin')
  execFileSync('mkdir', [bin])
  writeFileSync(join(dir, 'fake.json'), JSON.stringify({ runs: o.runs, artifacts: o.artifacts ?? {}, jobs: o.jobs ?? {}, fail: !!o.fail }))
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const f = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(join(dir, 'fake.json'))}, 'utf8'))
const path = process.argv[3]
if (f.fail) { console.error('HTTP 502'); process.exit(1) }
const own = { repository_id: ${REPO}, head_repository_id: ${REPO} }
let m
if (/^repos\\/[^/]+\\/[^/]+$/.test(path)) console.log(JSON.stringify({ id: ${REPO} }))
else if (/workflows\\/engine.yml\\/runs/.test(path)) console.log(JSON.stringify({ workflow_runs: f.runs }))
else if ((m = path.match(/runs\\/(\\d+)\\/artifacts/))) console.log(JSON.stringify({ artifacts: (f.artifacts[m[1]] ?? []).map((k, i) => ({ id: Number(m[1]) * 10 + i, name: 'engine-cost-log-rewrite-' + (i + 1), created_at: k.at, expired: false, workflow_run: own })) }))
else if ((m = path.match(/artifacts\\/(\\d+)\\/zip/))) process.stdout.write(f.artifacts[String(Math.floor(Number(m[1]) / 10))][Number(m[1]) % 10].text)
else if ((m = path.match(/runs\\/(\\d+)\\/jobs/))) console.log(JSON.stringify({ jobs: f.jobs[m[1]] ?? [] }))
else { console.error('unexpected ' + path); process.exit(1) }
`)
  writeFileSync(join(bin, 'unzip'), '#!/bin/sh\ncat "$2"\n')
  chmodSync(join(bin, 'gh'), 0o755)
  chmodSync(join(bin, 'unzip'), 0o755)
  const log = join(dir, 'aquatome-cost-rewrite.jsonl')
  if (o.cacheHad !== undefined) writeFileSync(log, o.cacheHad)
  const summary = join(dir, 'summary.md')
  const out = execFileSync(process.execPath, [new URL('../../../scripts/cost-log-restore.mjs', import.meta.url).pathname, log], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', GITHUB_STEP_SUMMARY: summary },
  })
  return { out, log: existsSync(log) ? readFileSync(log, 'utf8') : undefined, summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '' }
}

const recent = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString()

test('the script: a log the cache gave stays as it is, and GitHub isn\'t asked', () => {
  const r = runScript({ cacheHad: 'cached\n', runs: [], fail: true })
  expect(r.out).toContain('from the cache')
  expect(r.log).toBe('cached\n')
})

test('the script: no cache, so the runs\' own copies are restored', () => {
  const r = runScript({ runs: [run(100, recent(0), recent(0)), run(99, recent(1), recent(1)), run(98, recent(30), recent(28))], artifacts: { 98: [{ text: 'a\nb\n', at: recent(28) }] } })
  expect(r.out).toContain('restored the runs\' own, the last from run 98 (2 lines)')
  expect(r.log).toBe('a\nb\n')
  expect(r.summary).toBe('')
})

test('the script: a day it can\'t count gets the line, and says so loudly; so does GitHub not answering', () => {
  // Late in a Vietnamese day, so the earlier run is the same day's.
  const today = vnDay(new Date())
  const at = (h: number) => new Date(Math.max(Date.parse(`${today}T00:00:00+07:00`) + 60_000, Date.now() - h * 3600_000)).toISOString()
  const lost = runScript({ runs: [run(97, at(0.5), at(0.2))], jobs: { 97: [due, cycle('failure', at(0.3))] } })
  const line = JSON.parse(lost.log!.trim().split('\n').pop()!)
  expect(line.unlogged).toBe('run 97 ran the cycle today and kept no cost log after it')
  expect(lost.out).toContain('::warning::')
  expect(lost.summary).toContain('every step with a ceiling stops')
  const down = runScript({ runs: [], fail: true })
  expect(JSON.parse(down.log!.trim()).unlogged).toContain('couldn\'t be fetched')
  expect(down.summary).toContain('every step with a ceiling stops')
  // Nothing kept anywhere and no cycle today: the day really is at $0, said loudly, with nothing held.
  const none = runScript({ runs: [run(96, recent(30), recent(28))], jobs: { 96: [due, cycle('success', recent(28))] } })
  expect(none.log).toBeUndefined()
  expect(none.summary).toContain('Neither the cache nor any run')
})

test('engine.yml runs it after the cache is read and before anything reads the log, with a token to ask GitHub', () => {
  const yml = readFileSync(new URL('../../../.github/workflows/engine.yml', import.meta.url), 'utf8')
  const at = (s: string) => { const i = yml.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
  const restoreAt = at('node scripts/cost-log-restore.mjs /tmp/aquatome-cost-rewrite.jsonl')
  expect(at('- name: Restore the cost log')).toBeLessThan(restoreAt)
  expect(restoreAt).toBeLessThan(at('- name: Drop cost lines older than 8 days'))
  expect(restoreAt).toBeLessThan(at('run: scripts/engine-cycle.sh rewrite'))
  expect(yml.slice(yml.lastIndexOf('- name:', restoreAt), restoreAt)).toContain('GH_TOKEN: ${{ github.token }}')
  // The copies it restores from are the ones each attempt keeps, under a name of its own.
  expect(yml).toContain('name: engine-cost-log-rewrite-${{ github.run_attempt }}')
})
