import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error a plain script
import { simVerdict, worktreeVerdict } from '../../../scripts/machine-sweep.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SIM_RUN = join(ROOT, 'apps/ios/scripts/sim-run.py')
const HOOK = join(ROOT, '.claude/hooks/sim-run-only.sh')

const until = async (ok: () => boolean) => { while (!ok()) await new Promise(r => setTimeout(r, 25)) }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const home = () => mkdtempSync(join(tmpdir(), 'aq-load-'))

test('a simulator run waits for the one before it, across checkouts', async () => {
  const dir = home()
  const env = { ...process.env, HOME: dir }
  const first = spawn(SIM_RUN, ['sh', '-c', `touch ${dir}/first; until [ -f ${dir}/release ]; do sleep 0.05; done`], { env, stdio: 'ignore' })
  await until(() => existsSync(`${dir}/first`))
  const second = spawn(SIM_RUN, ['sh', '-c', `touch ${dir}/second`], { env, stdio: 'ignore' })
  await wait(500)
  expect(existsSync(`${dir}/second`)).toBe(false)
  writeFileSync(`${dir}/release`, '')
  const code = await new Promise(r => second.on('close', r))
  expect(code).toBe(0)
  expect(first.exitCode).toBe(0)
}, 30_000)

test("a job's stop reaches the command, and the turn passes on", async () => {
  const dir = home()
  const env = { ...process.env, HOME: dir }
  const run = spawn(SIM_RUN, ['sh', '-c', `trap 'touch ${dir}/stopped; exit 7' TERM; touch ${dir}/up; while :; do sleep 0.05; done`], { env, stdio: 'ignore' })
  await until(() => existsSync(`${dir}/up`))
  run.kill('SIGTERM')
  expect(await new Promise(r => run.on('close', r))).toBe(7)
  expect(existsSync(`${dir}/stopped`)).toBe(true)
  expect(spawnSync(SIM_RUN, ['true'], { env }).status).toBe(0)
}, 30_000)

test('at most two copies of a simulator', () => {
  const dir = home()
  writeFileSync(join(dir, 'fake'), '#!/bin/sh\necho "$@"\n', { mode: 0o755 })
  const args = (...a: string[]) => spawnSync(SIM_RUN, [join(dir, 'fake'), ...a], { env: { ...process.env, HOME: dir }, encoding: 'utf8' }).stdout.trim()
  expect(args('test', '-parallel-testing-worker-count', '3')).toBe('test -parallel-testing-worker-count 2')
  expect(args('test', '-parallel-testing-worker-count', '1')).toBe('test -parallel-testing-worker-count 1')
})

test('a session starts a simulator run only through sim-run.py', () => {
  const blocked = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }).status === 2
  for (const c of [
    'xcodebuild test -project a -scheme b',
    'cd apps/ios && xcodebuild test -project a',
    'nice -n 10 xcodebuild test-without-building -xctestrun x',
    'lockf -k ~/.cache/aquatome/checks.lock sh -c "x"; xcodebuild -project a test',
  ]) expect(blocked(c), c).toBe(true)
  for (const c of [
    'apps/ios/scripts/sim-run.py xcodebuild test -project a',
    'xcodebuild build-for-testing -project a',
    'xcodebuild -list',
    'grep -n "xcodebuild test" apps/ios/README.md',
    'swift test --filter ChatTests',
    'ls',
  ]) expect(blocked(c), c).toBe(false)
})

test('the sweep closes a simulator nobody uses, and no other', () => {
  const sim = { name: 'iPhone 17', testing: false, session: 't3-a', abandoned: false, idleHours: 1, upHours: 2 }
  expect(simVerdict(sim)).toBe('keep')
  expect(simVerdict({ ...sim, idleHours: 14 })).toBe('close') // the 15-hour session of 2026-11-07
  expect(simVerdict({ ...sim, abandoned: true, idleHours: 1 })).toBe('close')
  expect(simVerdict({ ...sim, abandoned: true, idleHours: 0.1 })).toBe('keep')
  expect(simVerdict({ ...sim, session: undefined })).toBe('keep')
  expect(simVerdict({ ...sim, session: undefined, upHours: 13 })).toBe('close')
  expect(simVerdict({ ...sim, session: undefined, upHours: 13, testing: true })).toBe('keep')
  expect(simVerdict({ ...sim, name: 'aquatome-ci-1', idleHours: 99 })).toBe('keep')
})

test('the sweep removes a worktree only when no work can be lost and nobody is in it', () => {
  const wt = { path: '/private/tmp/aq-content/x', liveCwd: false, liveThread: false, dirty: false, unpushed: 3, remoteBranch: false, prs: [{ state: 'MERGED', atTip: true }], hours: 30 }
  expect(worktreeVerdict(wt)).toBe('remove')
  expect(worktreeVerdict({ ...wt, hours: 1 })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, liveCwd: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, liveThread: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, dirty: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'OPEN', atTip: true }] })).not.toBe('remove')
  // Commits added after its pull request merged, or a branch closed unmerged, aren't merged work.
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'MERGED', atTip: false }] })).toBe('commits on no remote')
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'CLOSED', atTip: true }] })).toBe('commits on no remote')
  // Everything on the remote: a deleted branch's goes, an unmerged branch's stays.
  expect(worktreeVerdict({ ...wt, unpushed: 0, prs: [] })).toBe('remove')
  expect(worktreeVerdict({ ...wt, unpushed: 0, prs: [], remoteBranch: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, unpushed: NaN, prs: [] })).not.toBe('remove') // git couldn't say
  // Other projects, the main checkout, a thread's scratchpad.
  for (const path of [`${homedir()}/.infinitus/projects/aquatome.com`, `${homedir()}/.infinitus/worktrees/aq-breed-vectors`, '/private/tmp/claude-501/x/scratchpad/y'])
    expect(worktreeVerdict({ ...wt, path })).not.toBe('remove')
})

/** The engine's installer on a home of its own, with launchctl stood in for: `running` says a job is up. Its calls, its plists. */
function install(running: boolean) {
  const dir = home()
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/launchctl'), `#!/bin/sh\necho "$@" >> "${dir}/calls"\n[ "$1" = print ] && ${running ? 'echo "	pid = 5"' : 'exit 1'}\nexit 0\n`, { mode: 0o755 })
  for (const part of ['pages', 'sf', 'photos']) mkdirSync(join(dir, `.local/share/aquatome/engine-${part}/.git`), { recursive: true })
  const r = spawnSync('bash', [join(ROOT, 'scripts/install-engine-schedule.sh')], { env: { ...process.env, HOME: dir, PATH: `${dir}/bin:${process.env.PATH}` }, encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  return { calls: readFileSync(join(dir, 'calls'), 'utf8'), plist: (part: string) => readFileSync(join(dir, `Library/LaunchAgents/run.aquatome.engine-${part}.plist`), 'utf8') }
}

test("the engine's parts give way and start apart, and installing never stops a running one", () => {
  const { calls, plist } = install(false)
  expect(calls).toContain('bootstrap')
  const hours = (p: string) => [...plist(p).matchAll(/<key>Hour<\/key><integer>(\d+)/g)].map(m => Number(m[1]))
  expect(hours('pages')).toEqual([0, 3, 6, 9, 12, 15, 18, 21])
  expect(hours('sf')).toEqual([1, 4, 7, 10, 13, 16, 19, 22])
  expect(hours('photos')).toEqual([2, 5, 8, 11, 14, 17, 20, 23])
  for (const p of ['pages', 'sf', 'photos']) {
    expect(plist(p)).toContain('<key>Nice</key><integer>10</integer>')
    expect(plist(p)).toContain('<key>LowPriorityIO</key><true/>')
    expect(plist(p)).not.toContain('StartInterval')
    expect(spawnSync('plutil', ['-lint', '-'], { input: plist(p) }).status ?? 0).toBe(0)
  }
  expect(install(true).calls).not.toMatch(/bootout|bootstrap/)
})
