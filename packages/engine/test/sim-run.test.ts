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
    'lockf -k ~/.cache/aquatome/checks.lock xcodebuild build-for-testing -project a',
    'xcodebuild -list',
    'lockf -k "$HOME/.cache/aquatome/checks.lock" xcodebuild -scheme test build',
    'xcodebuild -list\npnpm exec vitest run test/foo.test.ts',
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

// 2026-11-08: Astro builds, test suites, e2e and xcodebuild builds side by side took the Mac to heavy thermal pressure, and
// a 0.4 s job took up to 54 s. A session's go through the checks queue; one test file needs no turn.
test('a session runs heavy work only in the checks queue', () => {
  const hook = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' })
  const sentToQueue = (command: string) => { const r = hook(command); return r.status === 2 && r.stderr.includes('checks.lock') }
  for (const c of [
    'pnpm test',
    'pnpm -r --no-bail --if-present test',
    'cd apps/site && pnpm build',
    'pnpm --filter site build',
    'pnpm -C apps/site test',
    'pnpm --filter site e2e',
    'pnpm run e2e:live',
    'npm test',
    'corepack pnpm@12.4.1 test',
    'CONTENT_ROOT=x pnpm exec astro build',
    'npx astro build',
    'node_modules/.bin/astro build',
    'pnpm exec playwright test e2e/a.spec.ts',
    'cd packages/engine && pnpm exec vitest run',
    'nice -n 15 sh -c "pnpm typecheck; pnpm test"',
    'xcodebuild build-for-testing -project a -scheme b',
    'xcodebuild -project a -scheme b',
    'xcodebuild archive -scheme b -archivePath x',
    'lockf -k ~/.cache/aquatome/other.lock pnpm test',
  ]) expect(sentToQueue(c), c).toBe(true)
  for (const c of [
    'lockf -k ~/.cache/aquatome/checks.lock pnpm test',
    'lockf -k "$HOME/.cache/aquatome/checks.lock" nice -n 10 pnpm -r --if-present test',
    'lockf -t 600 -k ~/.cache/aquatome/checks.lock pnpm --filter site build',
    'lockf -k ~/.cache/aquatome/checks.lock nice -n 15 sh -c "pnpm typecheck > a.log; pnpm test > b.log"',
    'lockf -k ~/.cache/aquatome/checks.lock nice -n 10 xcodebuild build-for-testing -project a',
    'apps/ios/scripts/sim-run.py xcodebuild test -project a',
    'pnpm exec vitest run test/sim-run.test.ts',
    'pnpm --filter @aq/engine exec vitest run test/a.test.ts -t name',
    'pnpm typecheck',
    'pnpm install --frozen-lockfile',
    'pnpm engine sweep',
    'xcodebuild -list',
    'xcodebuild -showBuildSettings -scheme b',
    'xcodebuild clean -project a',
    'swift test --filter ChatTests',
    'git commit -m "pnpm test passes"',
    'rg "pnpm build" AGENTS.md',
    "cat > x.sh <<'EOF'\npnpm test\nEOF",
    'gh pr create --body "ran (pnpm test)"',
  ]) expect(hook(c).status, c).toBe(0)
  // A simulator run in the checks queue is still the simulator queue's.
  expect(hook('lockf -k ~/.cache/aquatome/checks.lock xcodebuild test').stderr).toContain('sim-run.py')
})

// Simulator.app's window is WindowServer's to draw every frame, on top of the simulator's own rendering (2026-11-08: the
// screen's compositing was a third of the GPU through a heavy thermal hour). Simulators run headless.
test('a session boots simulators headless, never in Simulator.app', () => {
  const hook = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' })
  for (const c of [
    'open -a Simulator',
    'open -a Simulator.app',
    'open /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app',
    'xcrun simctl boot "iPhone 17" && open -a Simulator',
  ]) {
    const r = hook(c)
    expect(r.status, c).toBe(2)
    expect(r.stderr, c).toContain('headless')
  }
  for (const c of ['xcrun simctl boot "iPhone 17"', 'open https://aquatome.com', 'open -a Preview shot.png', 'rg "open -a Simulator" docs']) {
    expect(hook(c).status, c).toBe(0)
  }
})
