import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

test('a call to GitHub with no answer is stopped at its limit and says so; one that answers keeps its status and output', () => {
  const { h, env } = home()
  const hung = net(h, { ...env, GIT_NET_SECONDS: '2' }, 'sleep 30')
  expect(hung.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [2-4] s, stopped$/), 'status 124'])
  expect(hung.seconds).toBeLessThan(10)
  expect(net(h, env, `sh -c 'echo fetched; exit 3'`).out).toEqual(['fetched', 'status 3'])
  // Astra's read, 13 Nov: a stop that leaned on a file in the temp folder never came when the folder was missing.
  const noTemp = net(h, { ...env, GIT_NET_SECONDS: '1', TMPDIR: '/dev/null/aq-net' }, 'sleep 30')
  expect(noTemp.out).toEqual([expect.stringMatching(/^LOG sleep 30: no answer from GitHub in [1-3] s, stopped$/), 'status 124'])
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
  expect((Date.now() - t) / 1000).toBeLessThan(20)
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
    writeFileSync(log, `${iso(3.1)} cycle start (photos)\nsome step's output\n${iso(1)} stuck: the photos cycle (pid ${previous.pid}) has run 2 h 6 min\n`)
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

test('a part\'s cycle running past its hours is said in its log every hour and on GitHub once a day, and not stopped', async () => {
  const { h, env, gh } = home()
  mkdirSync(join(h, 'Library/Logs'), { recursive: true })
  const clones = join(h, 'clones')
  for (const part of ['pages', 'sf', 'photos']) mkdirSync(join(clones, `engine-${part}/.git`), { recursive: true })
  // The photos cycle, in a fetch that won't end; the pages part's PID file left by a cycle long gone, its number now another program's.
  mkdirSync(join(h, 'fake'))
  writeFileSync(join(h, 'fake/engine-cycle.sh'), 'sleep 60\n')
  const cycle = spawn('/bin/bash', [join(h, 'fake/engine-cycle.sh'), 'photos'], { detached: true, stdio: 'ignore' })
  try {
    writeFileSync(join(clones, 'engine-photos/.git/aquatome-engine.pid'), `${cycle.pid}\n`)
    writeFileSync(join(clones, 'engine-pages/.git/aquatome-engine.pid'), `${process.pid}\n`)
    await new Promise(r => setTimeout(r, 300))
    const stuck = (hours: string) => spawnSync('/bin/bash', [join(SCRIPTS, 'engine-stuck.sh')], { cwd: h, encoding: 'utf8', env: { ...env, ENGINE_CLONES: clones, ENGINE_STUCK_HOURS: hours } })
    const log = (part: string) => (existsSync(join(h, `Library/Logs/aquatome-engine-${part}.log`)) ? readFileSync(join(h, `Library/Logs/aquatome-engine-${part}.log`), 'utf8').trim().split('\n') : [])
    // Under its hours: nothing.
    expect(stuck('6').status).toBe(0)
    expect(log('photos')).toEqual([])
    expect(stuck('0').status).toBe(0)
    const line = `stuck: the photos cycle (pid ${cycle.pid}) has run 0 h 0 min, now in: sleep 60. launchd starts no photos run until it ends, and nothing stops it by itself`
    expect(log('photos')).toEqual([expect.stringMatching(new RegExp(`Z ${line.replace(/[().]/g, '\\$&')}$`))])
    expect(gh()).toEqual([`workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=photos -f why=${line}`])
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
