import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/engine-due.sh')

/** GitHub's record of engine.yml's runs, newest first: each run and its cycle job, as `gh run list` and the jobs API give them. */
type Run = { id: number; created: number; cycle: 'ran' | 'running' | 'skipped' | 'queued'; jobStarted?: number; lasted?: number }
/**
 * The tests' now, fixed: the runs are placed against it, and the scripts read it through a stand-in `date` (clock()). On
 * a slow machine a minute can pass between placing a run and the script's reading, and "350 min ago" would read 351.
 */
const NOW = Math.floor(Date.now() / 1000)
const iso = (minutesAgo: number) => new Date((NOW - minutesAgo * 60) * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
/** `date -u +%s`, the scripts' now (engine-last-cycle.sh), says NOW; any other `date` is the real one. */
function clock(dir: string) {
  writeFileSync(join(dir, 'date'), `#!/bin/sh\nif [ "$*" = "-u +%s" ]; then echo ${NOW}; else exec /bin/date "$@"; fi\n`)
  chmodSync(join(dir, 'date'), 0o755)
}
const STEP = [{ name: 'Set up job' }]
function github(dir: string, runs: Run[]) {
  clock(dir)
  // As `gh run list --json` gives them: a check that found nothing due ends in under a minute unless it waited (`lasted`).
  writeFileSync(join(dir, 'runs.json'), JSON.stringify(runs.map(r => {
    const done = r.cycle === 'ran' || r.cycle === 'skipped'
    return { databaseId: r.id, createdAt: iso(r.created), updatedAt: iso(done ? r.created - (r.lasted ?? (r.cycle === 'ran' ? 170 : 0.5)) : 0), status: done ? 'completed' : r.cycle === 'running' ? 'in_progress' : 'queued', conclusion: done ? 'success' : '' }
  })))
  for (const r of runs) {
    const job = r.cycle === 'queued' ? [] : [{
      name: 'Content cycle: rewrite', status: r.cycle === 'running' ? 'in_progress' : 'completed',
      conclusion: r.cycle === 'ran' ? 'success' : r.cycle === 'skipped' ? 'skipped' : null,
      started_at: iso(r.jobStarted ?? r.created), steps: r.cycle === 'skipped' ? [] : STEP,
    }]
    writeFileSync(join(dir, `jobs-${r.id}.json`), JSON.stringify({ jobs: [{ name: 'Is a cycle due?', status: 'completed', conclusion: 'success', started_at: iso(r.created), steps: STEP }, ...job] }))
  }
}
/**
 * A stand-in for `gh`: the repository's ENGINE_EVERY_MINUTES (`every`), GitHub's runs of engine.yml (github()), whose
 * `-q` filters it runs with jq as gh does, and whether it fails when asked for the setting.
 */
function gh(dir: string, o: { every: string; ghFails?: boolean; listFails?: boolean }) {
  writeFileSync(join(dir, 'gh'), `#!/bin/sh
cmd="$1 $2"; url="$2"; q=
while [ $# -gt 0 ]; do [ "$1" = -q ] || [ "$1" = --jq ] && q="$2"; shift; done
case "$cmd" in
  "variable list") ${o.ghFails ? 'echo "HTTP 502" >&2; exit 1' : `printf '%s\\n' '${o.every}'`} ;;
  "run list") ${o.listFails ? 'echo "HTTP 502" >&2; exit 1' : `jq -r "$q" '${dir}/runs.json'`} ;;
  api*) id=$(echo "$url" | sed -E 's|.*/runs/([0-9]+)/jobs|\\1|'); jq -r "$q" "${dir}/jobs-$id.json" ;;
  "workflow run") echo started > '${dir}/started' ;;
  *) echo "unexpected: gh $cmd" >&2; exit 2 ;;
esac
`)
  chmodSync(join(dir, 'gh'), 0o755)
}
/**
 * The Mac's hourly starter: the pace (`every`), when the last cycle started (`minutes` ago, a run whose cycle job ran,
 * after an hourly check that found none due; undefined for none in the last 30 runs) or GitHub's runs as they were
 * (`runs`). Says whether it started a cycle, and what it printed.
 */
const due = (o: { every: string; minutes?: number; runs?: Run[]; ghFails?: boolean; listFails?: boolean }) => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-due-'))
  github(dir, o.runs ?? [{ id: 3, created: 5, cycle: 'skipped' }, ...(o.minutes === undefined ? [] : [{ id: 2, created: o.minutes, cycle: 'ran' as const }])])
  gh(dir, o)
  // A home of its own: the starter's check for a hung cycle (engine-stuck.sh) reads the Mac's engine clones under it.
  const r = spawnSync('bash', [SCRIPT], { env: { ...process.env, HOME: dir, PATH: `${dir}:${process.env.PATH}` }, encoding: 'utf8' })
  return { started: existsSync(join(dir, 'started')), out: r.stdout, status: r.status, err: r.stderr }
}
/** Each call runs the script once, most of a second on a loaded machine: room for a slow one. */
const SLOW = 60_000
/** The pace engine.yml's own job uses when no setting is made: the one figure, and it is the workflow's. */
const workflowDefault = Number(/\$\{EVERY:-(\d+)\}/.exec(readFileSync(join(ROOT, '.github/workflows/engine.yml'), 'utf8'))![1])

// 7 to 11 Nov 2026: the repository's setting said a cycle every 350 minutes, to halve what the rewrite spent. The starter
// went by its own 170, and a run it starts is started by hand, which skips the workflow's check: 43 cycles, 9 or 10 a
// day where the setting allows 4, 29 of them started from here.
test('the starter goes by the repository\'s pace, not one of its own', () => {
  expect(due({ every: '350', minutes: 180 }).started).toBe(false)
  expect(due({ every: '350', minutes: 349 }).started).toBe(false)
  const late = due({ every: '350', minutes: 350 })
  expect(late.started).toBe(true)
  expect(late.out).toContain('(last cycle 350 min ago, every 350 min)')
  expect(due({ every: '60', minutes: 61 }).started).toBe(true)
  const none = due({ every: '350' }) // none in the last 30 runs is overdue
  expect(none.started).toBe(true)
  expect(none.out).toContain('(last cycle none in 30 runs, every 350 min)')
}, SLOW)

test('with no setting made it goes by the default written in engine.yml, the one the workflow\'s job uses', () => {
  expect(workflowDefault).toBeGreaterThan(0)
  expect(due({ every: '', minutes: workflowDefault - 1 }).started).toBe(false)
  expect(due({ every: '', minutes: workflowDefault }).started).toBe(true)
}, SLOW)

test('with no pace to go by, nothing starts: a setting that is not a number, or one that cannot be read', () => {
  const odd = due({ every: 'often', minutes: 9999 })
  expect(odd.started).toBe(false)
  expect(odd.out).toContain('not started')
  const down = due({ every: '350', minutes: 9999, ghFails: true })
  expect(down.started).toBe(false)
  expect(down.status).not.toBe(0)
  // GitHub that won't list the runs isn't a sign that no cycle ran (Astra's read, 13 Nov): nothing starts.
  const unlisted = due({ every: '350', minutes: 9999, listFails: true })
  expect(unlisted.started).toBe(false)
  expect(unlisted.status).not.toBe(0)
}, SLOW)

test('the starter has no figure of its own for the pace', () => {
  const s = readFileSync(SCRIPT, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')
  expect(s).toContain('ENGINE_EVERY_MINUTES')
  expect(s).not.toMatch(/\b(170|350)\b/)
  expect(s).not.toMatch(/-ge \$\(\(\s*\d+ \* 60/)
})

// 13 Nov 2026: the 03:52 hourly check found the 01:56 cycle running, skipped, and waited 55 min behind it in the queue.
// Counted as a cycle by how long it took, it put the next one off from 07:46 to 09:42, and the 08:53 check started none.
const NIGHT: Run[] = [
  { id: 43348201066, created: 0, cycle: 'skipped' },
  { id: 43304622230, created: 301, cycle: 'skipped', lasted: 55 },
  { id: 43284974329, created: 417, cycle: 'ran', jobStarted: 417 },
]
test('a run counts as a cycle only if its cycle job ran: a check that waited in the queue behind a cycle doesn\'t move the pace', () => {
  const night = due({ every: '350', runs: NIGHT.slice(1) })
  expect(night.started).toBe(true)
  expect(night.out).toContain('(last cycle 417 min ago, every 350 min)')
  // A cycle still running counts, from when its job started; a run waiting in the queue, its jobs not started, doesn't.
  expect(due({ every: '350', runs: [{ id: 9, created: 2, cycle: 'queued' }, { id: 8, created: 120, cycle: 'running' }] }).started).toBe(false)
  // A run waiting on GitHub makes its own check, so the starter adds none behind it (Astra's read, 13 Nov); one waiting
  // longer than the pace doesn't hold it.
  const queued = due({ every: '350', runs: [{ id: 9, created: 2, cycle: 'queued' }, { id: 8, created: 400, cycle: 'ran' }] })
  expect(queued.started).toBe(false)
  expect(queued.out).toContain('engine: not started: a run is waiting on GitHub, and its own check decides')
  const stale = due({ every: '350', runs: [{ id: 9, created: 360, cycle: 'queued' }, { id: 8, created: 400, cycle: 'ran' }] })
  expect(stale.started).toBe(true)
  expect(stale.out).toContain('(last cycle 400 min ago, every 350 min)')
}, SLOW)

test('engine.yml\'s due check goes by the same script, and leaves its own run out', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/engine.yml'), 'utf8')
  const step = /- id: due[\s\S]*?run: \|\n([\s\S]*?)\n {2}cycle:/.exec(yml)![1]!.replace(/^ {10}/gm, '')
  expect(yml).toMatch(/sparse-checkout: scripts\/engine-last-cycle\.sh/)
  expect(step).not.toMatch(/updatedAt|600/)
  const dir = mkdtempSync(join(tmpdir(), 'aq-due-yml-'))
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(ROOT, 'scripts/engine-last-cycle.sh'), join(dir, 'scripts/engine-last-cycle.sh'))
  // Its own run counts as a cycle, its cycle job under way, were it not left out.
  github(dir, [{ id: 43348201066, created: 0, cycle: 'running' }, ...NIGHT.slice(1)])
  gh(dir, { every: '350' })
  const run = (self: number) => {
    writeFileSync(join(dir, 'out'), '')
    const r = spawnSync('bash', ['-e', '-c', step], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_EVENT_NAME: 'schedule', GITHUB_OUTPUT: join(dir, 'out'), GITHUB_RUN_ID: String(self), GITHUB_REPOSITORY: 'o/r', EVERY: '350' } })
    return { said: r.stdout.trim(), out: readFileSync(join(dir, 'out'), 'utf8').trim() }
  }
  // The 08:53 check itself, last night: the cycle was due.
  expect(run(43348201066)).toEqual({ said: 'last cycle started 417 min ago', out: 'run=true' })
  // Another run's check, while that one is under way: not due.
  expect(run(1).out).toBe('run=false')
  // GitHub that won't list the runs: the step fails, and says nothing due.
  gh(dir, { every: '350', listFails: true })
  expect(run(43348201066).out).toBe('')
}, SLOW)
