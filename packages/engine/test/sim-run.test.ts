import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

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
  // Each run's end, heard from its start: the second can finish before node has seen the first close (CI, 2026-11-08).
  const firstEnd = new Promise(r => first.on('close', r))
  await until(() => existsSync(`${dir}/first`))
  const second = spawn(SIM_RUN, ['sh', '-c', `touch ${dir}/second`], { env, stdio: 'ignore' })
  const secondEnd = new Promise(r => second.on('close', r))
  await wait(500)
  expect(existsSync(`${dir}/second`)).toBe(false)
  writeFileSync(`${dir}/release`, '')
  expect(await secondEnd).toBe(0)
  expect(await firstEnd).toBe(0)
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

test("the runner's second ask ends the command, so nothing is left running when the turn passes on", async () => {
  const dir = home()
  const run = spawn(SIM_RUN, ['sh', '-c', `trap '' INT TERM; touch ${dir}/up; while :; do sleep 0.05; done`], { env: { ...process.env, HOME: dir }, stdio: 'ignore' })
  await until(() => existsSync(`${dir}/up`))
  run.kill('SIGINT')
  await wait(100)
  run.kill('SIGTERM')
  expect(await new Promise(r => run.on('close', r))).toBe(137)
}, 30_000)

test('at most two copies of a simulator', () => {
  const dir = home()
  writeFileSync(join(dir, 'fake'), '#!/bin/sh\necho "$@"\n', { mode: 0o755 })
  const args = (...a: string[]) => spawnSync(SIM_RUN, [join(dir, 'fake'), ...a], { env: { ...process.env, HOME: dir }, encoding: 'utf8' }).stdout.trim()
  expect(args('test', '-parallel-testing-worker-count', '3')).toBe('test -parallel-testing-worker-count 2')
  expect(args('test', '-parallel-testing-worker-count', '1')).toBe('test -parallel-testing-worker-count 1')
  expect(args('test', '-maximum-parallel-testing-workers', '8')).toBe('test -maximum-parallel-testing-workers 2')
  expect(args('test', '-parallel-testing-enabled', 'YES')).toBe('test -parallel-testing-enabled YES -parallel-testing-worker-count 2')
  expect(args('test', '-parallel-testing-enabled', 'NO')).toBe('test -parallel-testing-enabled NO')
})

test('a session starts a simulator run only through sim-run.py', () => {
  const blocked = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }).status === 2
  for (const c of [
    'xcodebuild test -project a -scheme b',
    'cd apps/ios && xcodebuild test -project a',
    'nice -n 10 xcodebuild test-without-building -xctestrun x',
    'lockf -k ~/.cache/aquatome/checks.lock sh -c "xcodebuild test"',
    'lockf -k ~/.cache/aquatome/checks.lock xcodebuild test',
    'NSUnbufferedIO=YES xcodebuild test',
    'env FOO=1 xcodebuild test',
    '/usr/bin/xcodebuild test',
    'xcrun xcodebuild test',
    'nohup xcodebuild test &',
    'time xcodebuild test',
    'xcodebuild test; echo done',
    'xcodebuild test|xcpretty',
    'if xcodebuild test; then echo ok; fi',
    'for s in a b; do xcodebuild test -scheme "$s"; done',
    'xcodebuild -quiet test',
    'cat apps/ios/scripts/sim-run.py; xcodebuild test',
  ]) expect(blocked(c), c).toBe(true)
  for (const c of [
    'apps/ios/scripts/sim-run.py xcodebuild test -project a',
    'nice -n 10 scripts/sim-run.py xcodebuild test -project a',
    'xcodebuild build-for-testing -project a',
    'xcodebuild -list',
    'xcodebuild -scheme test build',
    'xcodebuild -list\npnpm test -- foo',
    'xcodebuild -version\nswift test --filter a',
    "cat > x.sh <<'EOF'\nxcodebuild test -project a\nEOF",
    "git commit -m \"$(cat <<'EOF'\nxcodebuild test\nEOF\n)\"",
    "gh pr create --body 'ran (xcodebuild test -project a)'",
    "rg 'foo|xcodebuild test ' apps/ios",
    'grep -n "xcodebuild test" apps/ios/README.md',
    'swift test --filter ChatTests',
    'ls',
    'echo "unbalanced',
  ]) expect(blocked(c), c).toBe(false)
  // Words elsewhere in the call don't count.
  expect(spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command: 'ls', description: '(xcodebuild test -project a)' } }), encoding: 'utf8' }).status).toBe(0)
})
