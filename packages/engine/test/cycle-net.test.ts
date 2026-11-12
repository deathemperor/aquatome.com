import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// A cycle can't hang on GitHub, and one that hangs anyway is said loudly (the chief of staff, 13 Nov 2026, after the
// Mac's 23:10 photos cycle hung for hours in its opening fetch and launchd started no photos run behind it).

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPTS = join(ROOT, 'scripts')
const NO_GITHUB = { GITHUB_ACTIONS: '', GITHUB_WORKFLOW_REF: '' }

/** A home of its own, with `gh` standing in for GitHub's CLI: each call a line in gh.log. */
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), 'aq-net-')))
  mkdirSync(join(h, 'bin'))
  writeFileSync(join(h, 'bin/gh'), '#!/bin/sh\necho "$@" >> "$HOME/gh.log"\n')
  chmodSync(join(h, 'bin/gh'), 0o755)
  const env = { ...process.env, ...NO_GITHUB, HOME: h, PATH: `${h}/bin:${process.env.PATH}` }
  const gh = () => (existsSync(join(h, 'gh.log')) ? readFileSync(join(h, 'gh.log'), 'utf8').trim().split('\n') : [])
  return { h, env, gh }
}

test('a call to GitHub with no answer is stopped at its limit and says so; one that answers keeps its status and output', () => {
  const { h, env } = home()
  const net = (call: string) => {
    const t = Date.now()
    const r = spawnSync('/bin/bash', ['-c', `log() { echo "LOG $*"; }; source "${SCRIPTS}/cycle-checks.sh"; net ${call}; echo "status $?"`], { cwd: h, encoding: 'utf8', env: { ...env, GIT_NET_SECONDS: '2' } })
    return { out: r.stdout.trim().split('\n'), seconds: (Date.now() - t) / 1000 }
  }
  const hung = net('sleep 30')
  expect(hung.out).toEqual(['LOG sleep 30: no answer from GitHub in 2 s, stopped', 'status 124'])
  expect(hung.seconds).toBeLessThan(10)
  expect(net(`sh -c 'echo fetched; exit 3'`).out).toEqual(['fetched', 'status 3'])
  expect(net('true').out).toEqual(['status 0'])
})

test('every call the cycle makes to GitHub has the limit', () => {
  for (const file of ['engine-cycle.sh', 'cycle-checks.sh']) {
    const bare = readFileSync(join(SCRIPTS, file), 'utf8').split('\n').filter(l => !/^\s*#/.test(l) && /(^|[^\w/-])git (fetch|pull|push|ls-remote|clone) /.test(l.replace(/net git /g, '')))
    expect(bare, file).toEqual([])
  }
})

// It ends: before, a fetch that failed let the run go on from the clone's old checkout (from_main).
test('a Mac cycle whose opening fetch gets no answer ends, frees the next run and reports why', () => {
  const { h, env, gh } = home()
  // A dead ssh connection: it takes the call and never answers (13 Nov's had no CPU).
  writeFileSync(join(h, 'bin/hang'), '#!/bin/sh\nexec >/dev/null 2>&1 </dev/null\nsleep 30\n')
  chmodSync(join(h, 'bin/hang'), 0o755)
  mkdirSync(join(h, '.config/aquatome'), { recursive: true })
  writeFileSync(join(h, '.config/aquatome/cf-token'), 'x\n')
  const clone = join(h, '.local/share/aquatome/engine-photos')
  const sh = (command: string, cwd = h) => spawnSync('/bin/bash', ['-c', command], { cwd, encoding: 'utf8', env })
  sh(`git init -q -b main ${clone} && cd ${clone} && git config user.email a@example.com && git config user.name a && mkdir scripts`)
  for (const f of ['engine-cycle.sh', 'cycle-checks.sh']) copyFileSync(join(SCRIPTS, f), join(clone, 'scripts', f))
  sh('git add . && git commit -qm main && git remote add origin ssh://github.invalid/r.git', clone)
  const t = Date.now()
  const r = spawnSync('/bin/bash', [join(clone, 'scripts/engine-cycle.sh'), 'photos'], { cwd: h, encoding: 'utf8', env: { ...env, CI: '1', GIT_NET_SECONDS: '2', GIT_SSH_COMMAND: join(h, 'bin/hang') } })
  expect((Date.now() - t) / 1000).toBeLessThan(20)
  expect(r.status).toBe(124)
  expect(r.stdout).toMatch(/Z git fetch -q origin: no answer from GitHub in 2 s, stopped$/m)
  // Its PID file gone: the next run starts.
  expect(existsSync(join(clone, '.git/aquatome-engine.pid'))).toBe(false)
  expect(gh()).toEqual(['workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=photos -f why=exit 124: git fetch -q origin: no answer from GitHub in 2 s, stopped'])
})

test('a part\'s cycle running past its hours is said in its log every hour and on GitHub once, and not stopped', async () => {
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
  } finally {
    process.kill(-cycle.pid!)
  }
})
