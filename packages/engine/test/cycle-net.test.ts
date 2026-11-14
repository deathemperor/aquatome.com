import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slow } from '@aq/schema/test-time'
import { expect, test } from 'vitest'

// A cycle can't hang on GitHub, and one that hangs anyway is said loudly (the chief of staff, 13 Nov 2026). The Mac's
// 23:10 photos cycle began its fetch as the Mac fell asleep with its lid shut, the connection died on GitHub's side, and
// launchd started no photos run behind it.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPTS = join(ROOT, 'scripts')
const NO_GITHUB = { GITHUB_ACTIONS: '', GITHUB_WORKFLOW_REF: '' }

/** A home of its own, with `gh` standing in for GitHub's CLI: each call a line in gh.log. */
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), 'aq-net-')))
  mkdirSync(join(h, 'bin'))
  const exe = (name: string, body: string) => { writeFileSync(join(h, 'bin', name), `#!/bin/sh\n${body}\n`); chmodSync(join(h, 'bin', name), 0o755); return join(h, 'bin', name) }
  exe('gh', 'echo "$@" >> "$HOME/gh.log"')
  const env = { ...process.env, ...NO_GITHUB, HOME: h, PATH: `${h}/bin:${process.env.PATH}` }
  const gh = () => (existsSync(join(h, 'gh.log')) ? readFileSync(join(h, 'gh.log'), 'utf8').trim().split('\n') : [])
  return { h, env, gh, exe }
}
/** The clock as `clock` gives it (cycle-checks.sh): the Mac asleep for an hour after its first two readings. */
const SLEEPS = 'n=$(cat "$HOME/clock.n" 2>/dev/null || echo 0); echo $((n + 1)) > "$HOME/clock.n"; if [ "$n" -lt 2 ]; then echo "1794500000 0"; else echo "1794503600 3500"; fi'
const net = (h: string, env: NodeJS.ProcessEnv, call: string) => {
  const t = Date.now()
  const r = spawnSync('/bin/bash', ['-c', `log() { echo "LOG $*"; }; source "${SCRIPTS}/cycle-checks.sh"; net ${call}; echo "status $?"`], { cwd: h, encoding: 'utf8', env })
  return { out: r.stdout.trim().split('\n'), seconds: (Date.now() - t) / 1000 }
}

// A stop is said up to 4 s past its limit: the supervisor reads the clock each second, and on this Mac at a load of 60
// its perl and the clock's run slow (a 1 s limit was said at 4 s on 13 Nov, and the engine's own cycles run these tests
// here).
test('a call to GitHub with no answer is stopped at its limit and says so; one that answers keeps its status and output', () => {
  const { h, env } = home()
  const hung = net(h, { ...env, GIT_NET_SECONDS: '2' }, 'sleep 30')
  expect(hung.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [2-6] s, stopped$/), 'status 124'])
  expect(hung.seconds).toBeLessThan(10)
  expect(net(h, env, `sh -c 'echo fetched; exit 3'`).out).toEqual(['fetched', 'status 3'])
  // Astra's read, 13 Nov: a stop that leaned on a file in the temp folder never came when the folder was missing.
  const noTemp = net(h, { ...env, GIT_NET_SECONDS: '1', TMPDIR: '/dev/null/aq-net' }, 'sleep 30')
  expect(noTemp.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [1-5] s, stopped$/), 'status 124'])
  expect(noTemp.seconds).toBeLessThan(10)
  const quick = net(h, env, 'true')
  expect(quick.out).toEqual(['status 0'])
  // A call that answers isn't held back by its watchdog: one that looked each second added a second to every call.
  expect(quick.seconds).toBeLessThan(0.8)
})

test('the stop reaches what the call started too, one that ignores TERM included', () => {
  const { h, env } = home()
  // git pull's fetch, its ssh, a merge driver: here a child, and one that ignores TERM.
  const r = net(h, { ...env, GIT_NET_SECONDS: '1' }, `sh -c 'sleep 30 & echo $! > a; (trap "" TERM; exec sleep 31) & echo $! > b; wait'`)
  expect(r.out.at(-1)).toBe('status 124')
  for (const f of ['a', 'b']) expect(() => process.kill(Number(readFileSync(join(h, f), 'utf8')), 0), f).toThrow()
})

// Astra's read of 47412f53e: stopping a watchdog that had already ended failed the call under set -e; a call that exits 0
// on TERM was let off before its children were.
test('a call that answers goes on under set -e however slow the clock; one that exits 0 when stopped is still stopped, children and all', () => {
  const { h, env, exe } = home()
  const slow = exe('slow-clock', 'n=$(cat "$HOME/slow.n" 2>/dev/null || echo 0); echo $((n + 1)) > "$HOME/slow.n"; [ "$n" -lt 1 ] || sleep 2; echo "$(date +%s) 0"')
  const r = spawnSync('/bin/bash', ['-c', `set -euo pipefail; log() { echo "LOG $*"; }; source "${SCRIPTS}/cycle-checks.sh"; net true; echo after`], { cwd: h, encoding: 'utf8', env: { ...env, AQ_CLOCK: slow } })
  expect(r.stdout.trim()).toBe('after')
  const polite = net(h, { ...env, GIT_NET_SECONDS: '1' }, `sh -c 'trap "exit 0" TERM; (trap "" TERM; exec sleep 31) & echo $! > c; while :; do sleep 1; done'`)
  expect(polite.out).toEqual([expect.stringMatching(/: no answer from GitHub in \d+ s, stopped$/), 'status 124'])
  expect(() => process.kill(Number(readFileSync(join(h, 'c'), 'utf8')), 0)).toThrow()
})

// Astra's read of 68c49744f: the watchdog looked for the call's process group alone, and a call slow to make its group
// (perl slow to start on a busy Mac) had none at the first look a tenth of a second in: the watchdog ended there, and the
// call ran on with no limit.
test('a call slow to make its process group is still watched, and stopped at its limit', () => {
  const { h, env, exe } = home()
  mkdirSync(join(h, 'perl5'))
  writeFileSync(join(h, 'perl5', 'Slow.pm'), 'package Slow; sleep 1; 1;\n')
  const slow = { ...env, GIT_NET_SECONDS: '2', PERL5LIB: join(h, 'perl5'), PERL5OPT: '-MSlow', AQ_CLOCK: exe('clock', 'echo "$(date +%s) 0"') }
  const r = net(h, slow, 'sleep 30')
  expect(r.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [2-6] s, stopped$/), 'status 124'])
  expect(r.seconds).toBeLessThan(10)
})

// Astra's read of 0420cf4df: until the call's group was made, the watchdog found the call through `ps`, and a `ps` that
// failed ended the watchdog and left the call with no limit. The group is made before the call starts now, by a keeper the
// supervisor holds unreaped until its last signal, and nothing reads `ps`.
test('a call whose perl is slow to start is stopped at its limit when ps fails', () => {
  const { h, env, exe } = home()
  mkdirSync(join(h, 'perl5'))
  writeFileSync(join(h, 'perl5', 'Slow.pm'), 'package Slow; sleep 2; 1;\n')
  exe('ps', 'exit 1')
  const slow = { ...env, GIT_NET_SECONDS: '1', PERL5LIB: join(h, 'perl5'), PERL5OPT: '-MSlow', AQ_CLOCK: exe('clock', 'echo "$(date +%s) 0"') }
  const r = net(h, slow, 'sleep 30')
  expect(r.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [1-6] s, stopped$/), 'status 124'])
  expect(r.seconds).toBeLessThan(10)
})

test('a call that exits 124 itself, inside its limit, keeps its status and isn\'t said to be stopped', () => {
  const { h, env } = home()
  expect(net(h, env, `sh -c 'exit 124'`).out).toEqual(['status 124'])
})

test('every call the cycle makes to GitHub has the limit', () => {
  for (const file of ['engine-cycle.sh', 'cycle-checks.sh']) {
    const bare = readFileSync(join(SCRIPTS, file), 'utf8').split('\n').filter(l => !/^\s*#/.test(l) && /(^|[^\w/-])git (fetch|pull|push|ls-remote|clone) /.test(l.replace(/net git /g, '')))
    expect(bare, file).toEqual([])
  }
})

/** One of the Mac's engine clones (photos), its origin GitHub over an ssh that takes the call and never answers. */
function macClone() {
  const m = home()
  m.exe('hang', 'exec >/dev/null 2>&1 </dev/null\nsleep 30')
  mkdirSync(join(m.h, '.config/aquatome'), { recursive: true })
  writeFileSync(join(m.h, '.config/aquatome/cf-token'), 'x\n')
  mkdirSync(join(m.h, 'Library/Logs'), { recursive: true })
  const clone = join(m.h, '.local/share/aquatome/engine-photos')
  const sh = (command: string, cwd = m.h) => spawnSync('/bin/bash', ['-c', command], { cwd, encoding: 'utf8', env: m.env })
  sh(`git init -q -b main ${clone} && cd ${clone} && git config user.email a@example.com && git config user.name a && mkdir scripts`)
  for (const f of ['engine-cycle.sh', 'cycle-checks.sh']) copyFileSync(join(SCRIPTS, f), join(clone, 'scripts', f))
  sh('git add . && git commit -qm main && git remote add origin ssh://github.invalid/r.git', clone)
  const cycle = (extra: Record<string, string> = {}) => spawnSync('/bin/bash', [join(clone, 'scripts/engine-cycle.sh'), 'photos'], { cwd: m.h, encoding: 'utf8', env: { ...m.env, CI: '1', GIT_SSH_COMMAND: join(m.h, 'bin/hang'), ...extra } })
  return { ...m, clone, cycle }
}

// It ends: before, a fetch that failed let the run go on from the clone's old checkout (from_main).
test('a Mac cycle whose opening fetch outlives a sleep ends, says the Mac slept, frees the next run and reports why', () => {
  const m = macClone()
  const t = Date.now()
  // The default limit, 600 s, and the Mac asleep for an hour once the fetch has begun.
  const r = m.cycle({ AQ_CLOCK: m.exe('clock', SLEEPS) })
  // 20 s, scaled for this run: a live run's second try gives its tests 6 times their limits.
  expect((Date.now() - t) / 1000).toBeLessThan(slow(20_000) / 1000)
  expect(r.status).toBe(124)
  const stopped = 'git fetch -q origin: no answer from GitHub in 3600 s, stopped; the Mac slept 58 min of that, and a connection doesn\'t outlive a sleep'
  expect(r.stdout).toMatch(new RegExp(`Z ${stopped.replace(/[().]/g, '\\$&')}\\n.*Z the Mac slept 58 min during this cycle\\n?$`))
  // Its PID file gone: the next run starts.
  expect(existsSync(join(m.clone, '.git/aquatome-engine.pid'))).toBe(false)
  expect(m.gh()).toEqual([`workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=photos -f why=exit 124: ${stopped}`])
})

test('"previous cycle still running" says when that cycle\'s last line is hours old', async () => {
  const m = macClone()
  writeFileSync(join(m.h, 'fake-cycle.sh'), 'sleep 60\n')
  const previous = spawn('/bin/bash', [join(m.h, 'fake-cycle.sh')], { detached: true, stdio: 'ignore' })
  try {
    await new Promise(r => setTimeout(r, 300))
    writeFileSync(join(m.clone, '.git/aquatome-engine.pid'), `${previous.pid}\n`)
    const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z')
    const log = join(m.h, 'Library/Logs/aquatome-engine-photos.log')
    // Its own last line 3 h ago; the notices since don't count as its own.
    writeFileSync(log, `${iso(3.1)} cycle start (photos)\nsome step's output\n${iso(2)} past its hours: the photos cycle (pid ${previous.pid}) has run 1 h 6 min\n${iso(1)} stuck: the photos cycle (pid ${previous.pid}) has run 2 h 6 min\n`)
    const hung = m.cycle()
    expect(hung.status).toBe(0)
    expect(hung.stdout.trim()).toMatch(new RegExp(`Z previous cycle \\(pid ${previous.pid}\\) still running, its last line 3 h [56] min ago: likely hung, and nothing here stops it$`))
    // A cycle at work, its last line minutes old: the plain line.
    writeFileSync(log, `${iso(0.2)} gate: took 62 s\n`)
    expect(m.cycle().stdout.trim()).toMatch(new RegExp(`Z previous cycle \\(pid ${previous.pid}\\) still running$`))
    expect(readFileSync(join(m.clone, '.git/aquatome-engine.pid'), 'utf8').trim()).toBe(String(previous.pid))
  } finally {
    process.kill(-previous.pid!)
  }
})

// A fake cycle for engine-stuck.sh: `body` run as a part's engine-cycle.sh, detached, its PID file written.
function fakeCycle(h: string, clones: string, part: string, body: string) {
  mkdirSync(join(h, 'fake', part), { recursive: true })
  writeFileSync(join(h, 'fake', part, 'engine-cycle.sh'), `${body}\n`)
  const cycle = spawn('/bin/bash', [join(h, 'fake', part, 'engine-cycle.sh'), part], { detached: true, stdio: 'ignore' })
  writeFileSync(join(clones, `engine-${part}/.git/aquatome-engine.pid`), `${cycle.pid}\n`)
  return cycle
}
function stuckHome() {
  const { h, env, gh } = home()
  mkdirSync(join(h, 'Library/Logs'), { recursive: true })
  const clones = join(h, 'clones')
  for (const part of ['pages', 'sf', 'photos']) mkdirSync(join(clones, `engine-${part}/.git`), { recursive: true })
  const stuck = (hours: string) => spawnSync('/bin/bash', [join(SCRIPTS, 'engine-stuck.sh')], { cwd: h, encoding: 'utf8', env: { ...env, ENGINE_CLONES: clones, ENGINE_STUCK_HOURS: hours } })
  const log = (part: string) => (existsSync(join(h, `Library/Logs/aquatome-engine-${part}.log`)) ? readFileSync(join(h, `Library/Logs/aquatome-engine-${part}.log`), 'utf8').trim().split('\n') : [])
  return { h, clones, gh, stuck, log }
}
/** The command of process `parent`'s child as ps shows it, once it's `command`, waiting up to 10 s; else it throws, so a
 * slow machine fails plainly instead of classifying a cycle before it's in place. Its pid. */
// Up to 10 s by the clock, however long each ps takes; each ps stopped after 2 s, and one stopped is a try that saw
// nothing, not the end of the wait: on a loaded Mac or runner ps is slow, and the engine isn't wrong. Both times the
// test time scale (AQ_TEST_TIME_SCALE), as a second try runs.
async function seen(parent: number | undefined, command: string) {
  const until = Date.now() + slow(10_000)
  while (Date.now() < until) {
    let table = ''
    try {
      table = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: slow(2_000) })
    } catch (e) {
      if ((e as { code?: string }).code !== 'ETIMEDOUT') throw e
    }
    const c = table.split('\n').map(l => l.trim().split(/\s+/)).find(([, ppid]) => ppid === String(parent))
    if (c?.slice(2).join(' ') === command) return c[0]!
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`the fake cycle never showed "${command}" in ${slow(10_000) / 1000} s`)
}
// HH:MM is a clock time; "N min", a real run's minutes, which a slow machine makes more than none.
const pattern = (line: string) => new RegExp(`Z ${line.replace(/[().]/g, '\\$&').replace('HH:MM', '\\d\\d:\\d\\d').replace(' N min', ' \\d+ min')}$`)

test('a part\'s cycle that has stopped moving past its hours is called stuck, by its step, in its log every hour and on GitHub once a day, and not stopped', async () => {
  const { h, clones, gh, stuck, log } = stuckHome()
  // The photos cycle, in a fetch that won't end; the pages part's PID file left by a cycle long gone, its number now another program's.
  const cycle = fakeCycle(h, clones, 'photos', '(exec -a "git fetch -q origin" sleep 60)')
  try {
    writeFileSync(join(clones, 'engine-pages/.git/aquatome-engine.pid'), `${process.pid}\n`)
    await seen(cycle.pid, 'git fetch -q origin 60')
    // Under its hours: nothing said, what it's doing noted.
    expect(stuck('6').status).toBe(0)
    expect(log('photos')).toEqual([])
    expect(stuck('0').status).toBe(0)
    const line = `stuck: the photos cycle (pid ${cycle.pid}) has run 0 h N min and hasn't moved since the check at HH:MM: talking to GitHub, in git fetch -q origin 60. launchd starts no photos run until it ends, and nothing stops it by itself`
    expect(log('photos')).toEqual([expect.stringMatching(pattern(line))])
    expect(gh()).toEqual([expect.stringMatching(new RegExp(`^workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=photos -f why=${pattern(line).source.slice(2)}`))])
    // The next hour: its log again, GitHub not again; the cycle still running; the other parts said nothing.
    stuck('0')
    expect(log('photos')).toHaveLength(2)
    expect(gh()).toHaveLength(1)
    expect(() => process.kill(cycle.pid!, 0)).not.toThrow()
    expect([...log('pages'), ...log('sf')]).toEqual([])
    // A day on, GitHub again: the daily report reads a day's failures.
    const day = (Date.now() - 24 * 3_600_000) / 1000
    utimesSync(join(clones, 'engine-photos/.git/aquatome-engine.stuck'), day, day)
    stuck('0')
    expect(gh()).toHaveLength(2)
  } finally {
    process.kill(-cycle.pid!)
  }
})

// What ps says of a process tree, for engine-stuck.sh: a line a process, "pid|ppid|elapsed|cpu|command", rewritten
// between checks. Its only calls: one process's command, elapsed or cpu time, and every process's pid, parent and command
// or cpu time.
const PS = `T="$HOME/ps-table"
if [ "$1" = -A ]; then
  case "$3" in
    pid=,ppid=,command=) awk -F'|' '{ print $1, $2, $5 }' "$T" ;;
    pid=,ppid=,time=) awk -F'|' '{ print $1, $2, $4 }' "$T" ;;
  esac
  exit 0
fi
awk -F'|' -v p="$2" -v f="$4" '$1 == p { print (f == "command=" ? $5 : f == "etime=" ? $3 : $4); found = 1 } END { exit !found }' "$T"`

// Sat 14 Nov, 00:40: a pages run in its 150 minutes of writing, its model calls live, was called stuck. Three cycles 7 h
// 10 min in, as ps would show them over three checks: pages writing, one model call ending and the next beginning, then
// still on that call; photos in its checks, using more CPU, then none more; sf waiting its turn in the checks queue
// throughout. Stuck is the same processes using no more CPU since the last check; a wait for the queue never is.
test('stuck is a cycle whose processes and CPU time stayed the same since the last check; one moving, or queued, is past its hours', () => {
  const { h, env, gh, exe } = home()
  exe('ps', PS)
  mkdirSync(join(h, 'Library/Logs'), { recursive: true })
  const clones = join(h, 'clones')
  for (const [part, pid] of [['pages', 100], ['photos', 200], ['sf', 300]] as const) {
    mkdirSync(join(clones, `engine-${part}/.git`), { recursive: true })
    writeFileSync(join(clones, `engine-${part}/.git/aquatome-engine.pid`), `${pid}\n`)
  }
  const table = (call: number, cpu: string) => writeFileSync(join(h, 'ps-table'), [
    '1|0|9-00:00:00|1:00.00|/sbin/launchd',
    '100|1|07:10:00|00:01.00|/bin/bash /x/scripts/engine-cycle.sh pages',
    '101|100|06:00:00|02:00.00|node /x/node_modules/.bin/engine run --max-minutes 150',
    `${call}|101|00:01:00|00:02.00|claude -p write`,
    '200|1|07:10:00|00:01.00|/bin/bash /x/scripts/engine-cycle.sh photos',
    `201|200|00:20:00|${cpu}|node /x/node_modules/.bin/vitest run`,
    '300|1|07:10:00|00:01.00|/bin/bash /x/scripts/engine-cycle.sh sf',
    '301|300|01:00:00|00:00.01|lockf -k /x/checks.lock nice -n 10 bash -c pnpm test',
  ].join('\n') + '\n')
  const stuck = () => spawnSync('/bin/bash', [join(SCRIPTS, 'engine-stuck.sh')], { cwd: h, encoding: 'utf8', env: { ...env, ENGINE_CLONES: clones } })
  const log = (part: string) => readFileSync(join(h, `Library/Logs/aquatome-engine-${part}.log`), 'utf8').trim().split('\n')
  const end = (part: string) => `. launchd starts no ${part} run until it ends, and nothing stops it by itself`
  table(102, '00:10.00')
  stuck()
  // No check has seen them yet: it can't tell.
  expect(log('pages')[0]).toMatch(pattern(`past its hours: the pages cycle (pid 100) has run 7 h 10 min: writing, now in claude -p write; the next check says whether it moves${end('pages')}`))
  expect(log('photos')[0]).toMatch(pattern(`past its hours: the photos cycle (pid 200) has run 7 h 10 min: its checks, now in node /x/node_modules/.bin/vitest run; the next check says whether it moves${end('photos')}`))
  expect(log('sf')[0]).toMatch(pattern(`past its hours: the sf cycle (pid 300) has run 7 h 10 min: waiting its turn in the checks queue, now in lockf -k /x/checks.lock nice -n 10 bash -c pnpm test${end('sf')}`))
  // An hour on: pages' call ended and the next began; photos used 15 s more CPU.
  table(103, '00:25.00')
  stuck()
  expect(log('pages')[1]).toMatch(pattern(`past its hours: the pages cycle (pid 100) has run 7 h 10 min, still moving: writing, now in claude -p write${end('pages')}`))
  expect(log('photos')[1]).toMatch(pattern(`past its hours: the photos cycle (pid 200) has run 7 h 10 min, still moving: its checks, now in node /x/node_modules/.bin/vitest run${end('photos')}`))
  expect(log('sf')[1]!.replace(/^\S+ /, '')).toBe(log('sf')[0]!.replace(/^\S+ /, ''))
  // Another hour, nothing changed: pages and photos are stuck, by their step; sf is still waiting its turn.
  stuck()
  expect(log('pages')[2]).toMatch(pattern(`stuck: the pages cycle (pid 100) has run 7 h 10 min and hasn't moved since the check at HH:MM: writing, in claude -p write${end('pages')}`))
  expect(log('photos')[2]).toMatch(pattern(`stuck: the photos cycle (pid 200) has run 7 h 10 min and hasn't moved since the check at HH:MM: its checks, in node /x/node_modules/.bin/vitest run${end('photos')}`))
  expect(log('sf')[2]).not.toContain('stuck')
  // GitHub: each once past its hours, and pages and photos again when they stopped moving.
  expect(gh().map(c => c.match(/part=(\w+) -f why=([a-z ]+):/)!.slice(1).join(' '))).toEqual(['pages past its hours', 'sf past its hours', 'photos past its hours', 'pages stuck', 'photos stuck'])
})

// The same with real processes, each step seen in place before it's classified, so a slow machine waits or fails
// plainly rather than classifying too soon: one call of the pages cycle ends, and its next begins.
test('a real cycle whose call ends and whose next begins is still moving, each seen in place first', async () => {
  const { h, clones, gh, stuck, log } = stuckHome()
  const calls = fakeCycle(h, clones, 'pages', 'sleep 60; sleep 61')
  try {
    const first = await seen(calls.pid, 'sleep 60')
    expect(stuck('6').status).toBe(0) // under its hours: noted, nothing said
    expect(log('pages')).toEqual([])
    process.kill(Number(first))
    await seen(calls.pid, 'sleep 61')
    stuck('0')
    expect(log('pages')).toEqual([expect.stringMatching(pattern(`past its hours: the pages cycle (pid ${calls.pid}) has run 0 h N min, still moving: waiting, now in sleep 61. launchd starts no pages run until it ends, and nothing stops it by itself`))])
    expect(gh().filter(c => c.includes('why=stuck'))).toEqual([])
  } finally {
    process.kill(-calls.pid!)
  }
})
