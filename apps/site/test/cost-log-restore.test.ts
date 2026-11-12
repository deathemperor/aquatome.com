import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dayStart, ownRuns, ranCycle, restore, unloggedLine, vnDay } from '../../../scripts/cost-log-restore.mjs'

// The cloud cycle's cost log when GitHub's cache has none (scripts/cost-log-restore.mjs): the last run's own copy, and a
// day that can't be counted stops every step with a ceiling (packages/engine/src/ceiling.ts reads the line).

const REPO = 1436734971
type Run = { id: number; event: string; head_branch: string; created_at: string; updated_at: string; repository: { id: number }; head_repository: { id: number } }
const run = (id: number, created: string, updated: string, o: Partial<Run> = {}): Run =>
  ({ id, event: 'workflow_dispatch', head_branch: 'main', created_at: created, updated_at: updated, repository: { id: REPO }, head_repository: { id: REPO }, ...o })
const due = { name: 'Is a cycle due?', steps: [{ name: 'Started by hand, or ENGINE_EVERY_MINUTES since the last cycle started', conclusion: 'success' }] }
const cycle = (conclusion: string) => ({ name: 'Content cycle: rewrite', steps: [{ name: 'Restore the cost log', conclusion }, { name: 'Run this part, test, commit, push, deploy', conclusion }] })
const skipped = { name: 'Content cycle: rewrite', conclusion: 'skipped', steps: [] }

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
const kept: Record<number, string> = { 42990842284: '{"at":"2026-11-11T10:02:00.000Z","step":"localize","usd":0.4}\n' }

test('12 Nov replayed: the log comes from 11 Nov\'s last cycle, and nothing is held, as no cycle ran that day before', () => {
  const asked: number[] = []
  const runs = ownRuns(DAY_12, REPO, 43171489553, NOW)
  expect(runs.map(r => r.id)).not.toContain(43171489553)
  const r = restore(runs, (x: Run) => { asked.push(x.id); return kept[x.id] }, () => [due, skipped], NOW)
  expect(r).toEqual({ from: 42990842284, text: kept[42990842284], unknown: [] })
  // Newest first, and it stops at the first log it finds.
  expect(asked).toEqual([43164549760, 43162910439, 43157892312, 43151352829, 43150981135, 43144658638, 43142993990, 42990842284])
})

test('a run that ran the cycle today and kept no log makes the day uncountable; one of an earlier day, or one whose cycle never started, doesn\'t', () => {
  const jobs: Record<number, object[]> = {
    3: [due, cycle('failure')], // ran today, kept nothing
    2: [due, skipped], // an hourly check
    1: [due, cycle('success')], // kept its log
  }
  const runs = [
    run(3, '2026-11-12T01:00:00Z', '2026-11-12T03:00:00Z'),
    run(2, '2026-11-12T00:30:00Z', '2026-11-12T00:30:06Z'),
    run(1, '2026-11-11T12:00:00Z', '2026-11-11T14:00:00Z'),
  ]
  expect(restore(runs, (x: Run) => (x.id === 1 ? 'a\n' : undefined), (x: Run) => jobs[x.id]!, NOW)).toEqual({ from: 1, text: 'a\n', unknown: [3] })
  // No log anywhere: every cycle of the day is unknown, and none of an earlier day is.
  const yesterday = run(4, '2026-11-11T09:00:00Z', '2026-11-11T11:00:00Z')
  expect(restore([...runs, yesterday], () => undefined, (x: Run) => jobs[x.id] ?? [due, cycle('success')], NOW)).toEqual({ unknown: [3] })
  // A cycle that began yesterday in Vietnam and ended today spent part of today.
  const across = run(5, '2026-11-11T16:00:00Z', '2026-11-11T17:30:00Z')
  expect(restore([across], () => undefined, () => [due, cycle('cancelled')], NOW)).toEqual({ unknown: [5] })
})

test('only the cycle step having started counts as a cycle run', () => {
  expect(ranCycle([due, cycle('success')])).toBe(true)
  expect(ranCycle([due, cycle('failure')])).toBe(true)
  expect(ranCycle([due, cycle('cancelled')])).toBe(true)
  // A conclusion this doesn't know reads as spent, the careful way; none yet, or skipped, isn't a start.
  expect(ranCycle([due, cycle('timed_out')])).toBe(true)
  expect(ranCycle([due, { name: 'Content cycle: rewrite', steps: [{ name: 'Run this part, test, commit, push, deploy', conclusion: null }] }])).toBe(false)
  expect(ranCycle([due, skipped])).toBe(false)
  expect(ranCycle([due, cycle('skipped')])).toBe(false)
  expect(ranCycle([due, { name: 'Content cycle: rewrite', conclusion: 'cancelled' }])).toBe(false)
  expect(ranCycle([])).toBe(false)
})

test('only this repository\'s own runs on main, by the schedule or by hand, of the last 8 days, and never this one', () => {
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
  expect(ownRuns(runs, REPO, 17, NOW).map(r => r.id)).toEqual([16, 10])
  // Run again, this run's earlier attempt kept its own log, and spent: it counts.
  expect(ownRuns(runs, REPO, 17, NOW, 2).map(r => r.id)).toEqual([17, 16, 10])
})

test('the day is Vietnam\'s, and the line carries a reason, never a dollar figure', () => {
  expect(vnDay(new Date('2026-11-11T17:00:00Z'))).toBe('2026-11-12')
  expect(dayStart(NOW)).toBe(Date.parse('2026-11-11T17:00:00Z'))
  const line = JSON.parse(unloggedLine(NOW, 'run 3 ran the cycle today and kept no cost log'))
  expect(line).toEqual({ at: NOW.toISOString(), unlogged: 'run 3 ran the cycle today and kept no cost log' })
  expect(line).not.toHaveProperty('usd')
})

// The script as engine.yml runs it, with gh and unzip stood in for: what it writes, and what it says.
function runScript(o: { cacheHad?: string; runs: Run[]; artifacts?: Record<number, string>; jobs?: Record<number, object[]>; fail?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-cost-restore-'))
  const bin = join(dir, 'bin')
  execFileSync('mkdir', [bin])
  writeFileSync(join(dir, 'fake.json'), JSON.stringify({ runs: o.runs, artifacts: o.artifacts ?? {}, jobs: o.jobs ?? {}, fail: !!o.fail }))
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const f = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(join(dir, 'fake.json'))}, 'utf8'))
const path = process.argv[3]
if (f.fail) { console.error('HTTP 502'); process.exit(1) }
let m
if (/^repos\\/[^/]+\\/[^/]+$/.test(path)) console.log(JSON.stringify({ id: ${REPO} }))
else if (/workflows\\/engine.yml\\/runs/.test(path)) console.log(JSON.stringify({ workflow_runs: f.runs }))
else if ((m = path.match(/runs\\/(\\d+)\\/artifacts/))) console.log(JSON.stringify({ artifacts: f.artifacts[m[1]] === undefined ? [] : [{ id: Number(m[1]) * 10, name: 'engine-cost-log-rewrite', expired: false, workflow_run: { repository_id: ${REPO}, head_repository_id: ${REPO} } }] }))
else if ((m = path.match(/artifacts\\/(\\d+)\\/zip/))) process.stdout.write(f.artifacts[String(Number(m[1]) / 10)])
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
    env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '100', GITHUB_STEP_SUMMARY: summary },
  })
  return { out, log: existsSync(log) ? readFileSync(log, 'utf8') : undefined, summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '' }
}

const recent = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString()

test('the script: a log the cache gave stays as it is, and GitHub isn\'t asked', () => {
  const r = runScript({ cacheHad: 'cached\n', runs: [], fail: true })
  expect(r.out).toContain('from the cache')
  expect(r.log).toBe('cached\n')
})

test('the script: no cache, so the last run\'s log is restored', () => {
  const r = runScript({ runs: [run(100, recent(0), recent(0)), run(99, recent(1), recent(1)), run(98, recent(5), recent(3))], artifacts: { 98: 'a\nb\n' } })
  expect(r.out).toContain('restored run 98\'s (2 lines)')
  expect(r.log).toBe('a\nb\n')
  expect(r.summary).toBe('')
})

test('the script: a day it can\'t count gets the line, and says so loudly; so does GitHub not answering', () => {
  // Late in a Vietnamese day, so the earlier run is the same day's.
  const today = vnDay(new Date())
  const at = (h: number) => new Date(Math.max(Date.parse(`${today}T00:00:00+07:00`) + 60_000, Date.now() - h * 3600_000)).toISOString()
  const lost = runScript({ runs: [run(97, at(0.5), at(0.2))], jobs: { 97: [due, cycle('failure')] } })
  const line = JSON.parse(lost.log!.trim().split('\n').pop()!)
  expect(line.unlogged).toBe('run 97 ran the cycle today and kept no cost log')
  expect(lost.out).toContain('::warning::')
  expect(lost.summary).toContain('every step with a ceiling stops')
  const down = runScript({ runs: [], fail: true })
  expect(JSON.parse(down.log!.trim()).unlogged).toContain('couldn\'t be fetched')
  expect(down.summary).toContain('every step with a ceiling stops')
  // Nothing kept anywhere and no cycle today: the day really is at $0, said loudly, with nothing held.
  const none = runScript({ runs: [run(96, recent(30), recent(28))], jobs: { 96: [due, cycle('success')] } })
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
  // The artifact it restores from is the one each run keeps.
  expect(yml).toContain('name: engine-cost-log-rewrite')
})
