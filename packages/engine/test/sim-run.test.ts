import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SIM_RUN = join(ROOT, 'apps/ios/scripts/sim-run.py')
const HOOK = join(ROOT, '.claude/hooks/sim-run-only.sh')
const NEXT_TURN = join(ROOT, 'scripts/next-turn.py')
const CHECKS = join(ROOT, 'scripts/checks.sh')
const hasLockf = spawnSync('sh', ['-c', 'command -v lockf']).status === 0

const until = async (ok: () => boolean) => { while (!ok()) await new Promise(r => setTimeout(r, 25)) }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const home = () => mkdtempSync(join(tmpdir(), 'aq-load-'))

test('a simulator run waits for the one before it, across checkouts', async () => {
  const dir = home()
  const env = { ...process.env, HOME: dir }
  const first = spawn(SIM_RUN, ['sh', '-c', `touch ${dir}/first; for i in $(seq 1200); do [ -f ${dir}/release ] && break; sleep 0.05; done`], { env, stdio: 'ignore' })
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

// The photos cycle of 2026-11-08, under load: the stop came while Popen was still returning, before this script knew its
// command, so it ended alone (143) and left the command running with no parent. Here the stop comes at that moment on
// purpose: Popen is wrapped so the signal lands after the command is up and before Popen has returned.
test('a stop that comes while the command is starting still reaches it', () => {
  const dir = home()
  const harness = `
import importlib.util, os, signal, subprocess, sys, time
spec = importlib.util.spec_from_file_location("sim_run", ${JSON.stringify(SIM_RUN)})
sim_run = importlib.util.module_from_spec(spec); spec.loader.exec_module(sim_run)
real = subprocess.Popen
def starting(argv, *a, **k):
    if argv[:1] != ["sh"]:  # sim-run's own calls (ps), not the command
        return real(argv, *a, **k)
    p = real(argv, *a, **k)
    open(${JSON.stringify(`${dir}/pid`)}, "w").write(str(p.pid))
    while not os.path.exists(${JSON.stringify(`${dir}/up`)}): time.sleep(0.01)
    os.kill(os.getpid(), signal.SIGTERM)
    time.sleep(0.2)
    return p
sim_run.subprocess.Popen = starting
sys.argv = ["sim-run.py", "sh", "-c", ${JSON.stringify(`trap 'touch ${dir}/stopped; exit 7' TERM; touch ${dir}/up; while :; do sleep 0.05; done`)}]
sim_run.main()
`
  const r = spawnSync('python3', ['-I', '-c', harness], { env: { ...process.env, HOME: dir }, encoding: 'utf8', timeout: 20_000 })
  const left = Number(readFileSync(`${dir}/pid`, 'utf8'))
  const running = spawnSync('kill', ['-0', String(left)]).status === 0
  if (running) spawnSync('kill', ['-9', String(left)])
  expect(running).toBe(false)
  expect(r.status, r.stderr).toBe(7)
  expect(existsSync(`${dir}/stopped`)).toBe(true)
}, 30_000)

// A stand-in for macOS's sysctl: a 16-core Mac, and the cores it leaves to work, one reading a call, the last one kept.
const hot = (masks: number[]) => {
  const dir = home()
  writeFileSync(join(dir, 'masks'), masks.join('\n') + '\n')
  writeFileSync(join(dir, 'sysctl'), `#!/bin/sh
[ "$2" = hw.ncpu ] && { echo 16; exit 0; }
n=$(cat "${dir}/calls" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "${dir}/calls"
mask=$(sed -n "\${n}p" "${dir}/masks"); [ -n "$mask" ] || mask=$(tail -1 "${dir}/masks")
echo $mask
`)
  chmodSync(join(dir, 'sysctl'), 0o755)
  const calls = () => (existsSync(join(dir, 'calls')) ? Number(readFileSync(join(dir, 'calls'), 'utf8')) : 0)
  const run = (env: Record<string, string>) => spawnSync(SIM_RUN, ['true'], { env: { ...process.env, HOME: dir, PATH: `${dir}:${process.env.PATH}`, SIM_RUN_COOL_PAUSE: '0', ...env }, encoding: 'utf8' })
  return { run, calls }
}

// Main's iOS runs back on this Mac (2026-11-08) wait while macOS has taken cores away, as the engine's runs do. Its heat
// level alone said less: heavy with all 16 cores at work. Leads' runs don't wait here, nor do pull requests' jobs on
// GitHub's Macs, which run sim-run too.
test("this Mac's runner's simulator run waits while cores are taken away, and a lead's or GitHub's Macs' doesn't", () => {
  const all = 0xffff
  const runner = hot([0x41f, 0xc3f, 0x7fff, all]) // 6, 8, then 15 of 16 cores, then all
  const r = runner.run({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' })
  expect(r.status).toBe(0)
  expect(runner.calls()).toBe(4)
  expect(r.stdout).toContain('10 of its cores taken away')
  expect(hot([all]).run({ RUNNER_ENVIRONMENT: 'self-hosted' }).stdout).not.toContain('hot')
  for (const env of [{ GITHUB_ACTIONS: '', RUNNER_ENVIRONMENT: '' }, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }]) {
    const other = hot([0x41f])
    expect(other.run({ ...env, SIM_RUN_COOL_MINUTES: '0.0001' }).status).toBe(0) // a short wait, should it wrongly wait
    expect(other.calls()).toBe(0)
  }
  // Still taken away at the end of the wait: it goes on.
  const stuck = hot([0x41f])
  const s = stuck.run({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted', SIM_RUN_COOL_MINUTES: '0.0001' })
  expect(s.status).toBe(0)
  expect(s.stdout).toContain('went on after')
}, 30_000)

// 2026-11-08: after main's simulator booted, its mediaanalysisd took 3.4 cores at normal priority for 8 min, and a 0.4 s job
// on the Mac took up to 23 s. Stand-ins, named as the daemons are, inside a simulator's runtime and outside it. macOS's
// alone, as simulators and taskpolicy are (and nice goes to 20 there, 19 on Linux): CI's Linux skips it, the Mac's cycles run it.
test.skipIf(process.platform !== 'darwin')("while a run has its turn, its simulator's photo and media analysis runs in the background, and the Mac's own doesn't", async () => {
  const dir = home()
  const daemon = (path: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    symlinkSync('/bin/sleep', join(dir, path))
    return spawn(join(dir, path), ['30'], { stdio: 'ignore' })
  }
  const sim = daemon('CoreSimulator/Volumes/iOS/RuntimeRoot/System/Library/PrivateFrameworks/MediaAnalysis.framework/mediaanalysisd')
  const mac = daemon('System/Library/PrivateFrameworks/PhotoAnalysis.framework/Versions/A/Support/photoanalysisd')
  const nice = (pid?: number) => Number(spawnSync('ps', ['-o', 'nice=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim())
  try {
    await wait(200)
    const before = nice(mac.pid)
    expect(nice(sim.pid)).toBe(before)
    // The run lasts until the stand-in is in the background, or 20 s: a fixed second ran out on a busy Mac, at nice 10,
    // before sim-run had looked once (2026-11-08).
    const until = `i=0; until [ "$(ps -o nice= -p ${sim.pid} | tr -d ' ')" = 20 ] || [ $i -ge 400 ]; do sleep 0.05; i=$((i + 1)); done`
    expect(spawnSync(SIM_RUN, ['sh', '-c', until], { env: { ...process.env, HOME: dir, SIM_RUN_QUIET_PAUSE: '0.1' } }).status).toBe(0)
    expect(nice(sim.pid)).toBe(20)
    expect(nice(mac.pid)).toBe(before)
  } finally {
    sim.kill()
    mac.kill()
  }
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
  // No simulators up: whether this Mac is at its cap just now isn't this test's business.
  const dir = home()
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/xcrun'), '#!/bin/sh\necho \'{"devices": {}}\'\n')
  chmodSync(join(dir, 'bin/xcrun'), 0o755)
  const hook = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` } })
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

// A queue of its own (HOME) whose project thread is "cos", with a first run on the simulator until `release`; runs that
// write their word to `order` when their turn comes; and the chief of staff's scripts/next-turn.py.
function keptQueue(via: string[] = [SIM_RUN]) {
  const dir = home()
  mkdirSync(join(dir, '.config/aquatome'), { recursive: true })
  writeFileSync(join(dir, '.config/aquatome/owner-report-thread'), 'cos\n')
  const env = { ...process.env, HOME: dir, SIM_RUN_NEXT_PAUSE: '0.1', CHECKS_NEXT_PAUSE: '0.1', T3CODE_THREAD_ID: 'cos' }
  const [queue, ...queueArgs] = via as [string, ...string[]]
  const first = spawn(queue, [...queueArgs, 'sh', '-c', `touch ${dir}/up; for i in $(seq 1200); do [ -f ${dir}/release ] && break; sleep 0.05; done`], { env, stdio: 'ignore' })
  const firstEnd = new Promise(r => first.on('close', r))
  const run = (word: string, cwd = dir) => { const p = spawn(queue, [...queueArgs, 'sh', '-c', `echo ${word} >> ${dir}/order`], { env, cwd, stdio: 'ignore' }); return new Promise(r => p.on('close', r)) }
  const next = (thread: string, ...args: string[]) => spawnSync(NEXT_TURN, args, { env: { ...env, T3CODE_THREAD_ID: thread }, encoding: 'utf8' })
  const order = () => (existsSync(`${dir}/order`) ? readFileSync(`${dir}/order`, 'utf8').trim().split('\n') : [])
  return { dir, env, run, next, order, up: () => until(() => existsSync(`${dir}/up`)), release: () => writeFileSync(`${dir}/release`, ''), firstEnd }
}

// 2026-11-09: the chief of staff gave the photo grid's flows the next turn, ahead of main's job and a lead's run, and the
// queue, first come first served, had no way to.
test("the chief of staff keeps the next turn for a run, which goes ahead of the runs that queued before it", async () => {
  const q = keptQueue()
  await q.up()
  const other = q.run('other')
  await wait(300)
  const grid = q.run('photo-grid')
  await wait(300)
  expect(q.next('cos', 'photo-grid').status).toBe(0)
  q.release()
  expect(await grid).toBe(0)
  expect(await other).toBe(0)
  expect(q.order()).toEqual(['photo-grid', 'other'])
  expect(existsSync(`${q.dir}/.cache/aquatome/sim.next`)).toBe(false) // taken, so the turn after is anyone's
  expect(await q.firstEnd).toBe(0)
}, 30_000)

test('a turn kept for a run that has not queued yet waits for it, and a pid names one too', async () => {
  const q = keptQueue()
  await q.up()
  const other = q.run('other')
  await wait(300)
  q.next('cos', 'late-run')
  q.release()
  await wait(1000)
  expect(q.order()).toEqual([])
  expect(await q.run('late-run')).toBe(0)
  expect(await other).toBe(0)
  expect(q.order()).toEqual(['late-run', 'other'])

  const r = keptQueue()
  await r.up()
  const a = r.run('a')
  await wait(300)
  const b = spawn(SIM_RUN, ['sh', '-c', `echo b >> ${r.dir}/order`], { env: { ...process.env, HOME: r.dir, SIM_RUN_NEXT_PAUSE: '0.1' }, stdio: 'ignore' })
  await wait(300)
  r.next('cos', String(b.pid))
  r.release()
  await new Promise(res => b.on('close', res))
  await a
  expect(r.order()).toEqual(['b', 'a'])
}, 30_000)

test("only the chief of staff's thread keeps a turn, and a kept turn lapses with its minutes or its run", async () => {
  const q = keptQueue()
  for (const thread of ['a-lead', '']) {
    const r = q.next(thread, 'grid')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('only the chief of staff')
  }
  expect(existsSync(`${q.dir}/.cache/aquatome/sim.next`)).toBe(false)
  await q.up()
  const other = q.run('other')
  await wait(300)
  q.next('cos', 'nobody', '0.01')
  q.release()
  expect(await other).toBe(0) // after the 0.6 s
  expect(q.order()).toEqual(['other'])
  // A pid that isn't a process keeps nothing, and a number too large to be one, left in the file, lets every run go.
  expect(q.next('cos', '999999').stderr).toContain('no process 999999')
  expect(await q.run('after')).toBe(0)
  writeFileSync(`${q.dir}/.cache/aquatome/sim.next`, `${Date.now() / 1000 + 600} 42551258011`)
  expect(await q.run('large')).toBe(0)
  expect(q.order()).toEqual(['other', 'after', 'large'])
  // Minutes have a cap, and a pid keeps the turn in its own queue alone.
  expect(q.next('cos', 'x', '100000').stdout).toContain('for up to 120 min')
  const sleeper = spawn('sleep', ['30'])
  expect(q.next('cos', String(sleeper.pid)).stdout).toContain('the next checks turn kept')
  expect(existsSync(`${q.dir}/.cache/aquatome/sim.next`)).toBe(true) // the word's, from before
  expect(readFileSync(`${q.dir}/.cache/aquatome/checks.next`, 'utf8')).toContain(String(sleeper.pid))
  sleeper.kill()
}, 30_000)

// Durable caches can put test homes under /Users. They must never acquire the real Mac's queue.
test.skipIf(!hasLockf)('a nested test home never links into the shared Mac queue', () => {
  const dir = home(), nested = join(dir, 'nested-home')
  mkdirSync(nested)
  const r = spawnSync(CHECKS, ['true'], { env: { ...process.env, HOME: nested, AQ_SHARED_LOCKS: '' } })
  expect(r.status).toBe(0)
  expect(lstatSync(join(nested, '.cache/aquatome/checks.lock')).isSymbolicLink()).toBe(false)
})

// The checks queue: the grid's build waited behind two engine cycles, and its command says nothing of the grid: its folder does.
test.skipIf(!hasLockf)("in the checks queue too, the run the turn is kept for goes first, named by its folder, and a plain lockf job by its pid", async () => {
  const q = keptQueue([CHECKS])
  await q.up()
  const other = q.run('other')
  await wait(300)
  mkdirSync(join(q.dir, 'wt-grid'))
  const grid = q.run('grid', join(q.dir, 'wt-grid'))
  await wait(300)
  expect(q.next('cos', 'wt-grid').status).toBe(0)
  q.release()
  expect(await grid).toBe(0)
  expect(await other).toBe(0)
  expect(q.order()).toEqual(['grid', 'other'])
  expect(await q.firstEnd).toBe(0)

  const r = keptQueue([CHECKS])
  await r.up()
  const a = r.run('a')
  await wait(300)
  const plain = spawn('lockf', ['-k', `${r.dir}/.cache/aquatome/checks.lock`, 'sh', '-c', `echo plain >> ${r.dir}/order`], { stdio: 'ignore' })
  await wait(300)
  r.next('cos', String(plain.pid))
  r.release()
  await new Promise(res => plain.on('close', res))
  await a
  expect(r.order()).toEqual(['plain', 'a'])
  // The command's own status comes back, and a step back isn't one.
  expect(spawnSync(CHECKS, ['sh', '-c', 'exit 7'], { env: r.env }).status).toBe(7)

  // A checks.sh run named by the pid ps shows waiting, its lockf's, is that run.
  const t = keptQueue([CHECKS])
  await t.up()
  const b = t.run('b')
  await wait(300)
  const named = spawn(CHECKS, ['sh', '-c', `echo named >> ${t.dir}/order`], { env: t.env, stdio: 'ignore' })
  // On a busy Mac checks.sh takes more than a moment to reach its lockf: a fixed wait read no pid, and kept nothing (2026-11-09).
  let waiting = ''
  await until(() => (waiting = spawnSync('pgrep', ['-P', String(named.pid), 'lockf'], { encoding: 'utf8' }).stdout.trim()) !== '')
  // A name that came back blank keeps nothing, and says so.
  expect(t.next('cos', '').status).not.toBe(0)
  expect(t.next('cos', waiting).status).toBe(0)
  t.release()
  await new Promise(res => named.on('close', res))
  await b
  expect(t.order()).toEqual(['named', 'b'])
}, 30_000)

test("a session other than the chief of staff's can't keep a turn, whatever its command says its thread is", () => {
  const dir = home()
  mkdirSync(join(dir, '.config/aquatome'), { recursive: true })
  writeFileSync(join(dir, '.config/aquatome/owner-report-thread'), 'cos\n')
  const hook = (command: string, thread: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: { ...process.env, HOME: dir, T3CODE_THREAD_ID: thread } })
  for (const c of ['scripts/next-turn.py wt-grid', 'T3CODE_THREAD_ID=cos scripts/next-turn.py wt-grid', 'python3 scripts/next-turn.py --sim 123']) {
    const r = hook(c, 'a-lead')
    expect(r.status, c).toBe(2)
    expect(r.stderr, c).toContain('Only the chief of staff')
  }
  expect(hook('scripts/next-turn.py wt-grid', 'cos').status).toBe(0)
  expect(hook('scripts/next-turn.py --kept checks 1 x', 'a-lead').status).toBe(0)
  expect(hook('scripts/next-turn.py --help', 'a-lead').status).toBe(0)
})

// 2026-11-10: `next-turn.py --help` took "--help" for a run's name and kept both queues' next turns for it.
test('a name that starts with a dash keeps nothing, and --help prints the usage for any thread', () => {
  const q = keptQueue()
  const kept = () => ['sim', 'checks'].filter(queue => existsSync(`${q.dir}/.cache/aquatome/${queue}.next`))
  for (const args of [['--bogus'], ['-x'], ['--sim', '--help'], ['--checks', '-h'], ['-5']]) {
    const r = q.next('cos', ...args)
    expect(r.status, args.join(' ')).toBe(1)
    expect(r.stderr, args.join(' ')).toContain('scripts/next-turn.py [--sim | --checks]')
  }
  for (const [thread, flag] of [['cos', '--help'], ['cos', '-h'], ['a-lead', '--help']] as const) {
    const r = q.next(thread, flag)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('scripts/next-turn.py [--sim | --checks]')
  }
  expect(kept()).toEqual([])
  // A good name after all that still keeps both.
  expect(q.next('cos', 'wt-grid').status).toBe(0)
  expect(kept()).toEqual(['sim', 'checks'])
  q.release()
})

test('the checks queue through scripts/checks.sh is the queue, for the hook and the engine', () => {
  const hook = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }).status
  for (const c of ['scripts/checks.sh nice -n 10 pnpm test', 'cd apps/ios && ../../scripts/checks.sh nice -n 10 xcodebuild build-for-testing -project a',
    '"$(git rev-parse --show-toplevel)/scripts/checks.sh" pnpm --filter site build']) expect(hook(c), c).toBe(0)
  expect(hook('scripts/checks.sh nice -n 10 xcodebuild test -project a')).toBe(2) // a simulator run is still sim-run's
  const cycle = readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')
  expect(cycle).toMatch(/\nturn\(\) \{ "\$CHECKS_SH" "\$@"; \}\nchecks\(\) \{[^\n]*else turn bash -c "\$1"/)
})

test('a session kills only by pid, and a lockf on a queue keeps the lock', () => {
  const hook = (command: string) => spawnSync(HOOK, { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' })
  const refused = (command: string, why: string) => {
    const r = hook(command)
    expect(r.status, command).toBe(2)
    expect(r.stderr, command).toContain(why)
  }
  for (const c of [
    'pkill -f "sleep 25"',
    'killall Simulator',
    '/usr/bin/pkill -9 node',
    'cd x && sudo pkill foo; echo done',
    'sh -c "pkill -f foo"',
    "bash -lc 'killall foo'",
    'x=$(pkill foo)',
    'echo foo | xargs pkill -f',
    'kill $(pgrep -f foo)',
    'kill -9 $(pgrep -f foo | head -1)',
    'kill "$(pgrep -f foo)"',
    'kill `pgrep -f foo`',
    'sudo kill $(/usr/bin/pgrep foo)',
    'pgrep -f foo | xargs kill',
    'pgrep -f foo | head -1 | xargs -n1 kill -9',
    "pgrep foo | xargs -I{} sh -c 'kill {}'",
    'pgrep -f foo 2>&1 | xargs kill',
    'pgrep -f foo |\n  xargs kill',
    'kill $(\npgrep foo)',
    'pgrep foo | xargs -r sudo kill',
    'pgrep foo | xargs -I {} kill {}',
  ]) refused(c, 'a pid you started')
  for (const c of [
    'lockf -t 0 $HOME/.cache/aquatome/checks.lock true',
    'lockf ~/.cache/aquatome/checks.lock pnpm test',
    'nice -n 10 lockf -n /Users/Shared/aquatome/sim.lock true',
    "sh -c 'lockf -t 0 ~/.cache/aquatome/checks.lock true'",
  ]) refused(c, 'needs -k')
  for (const c of [
    'kill 12345',
    'kill -TERM $!',
    'kill $(cat my.pid)',
    'kill 1; pgrep foo',
    'pgrep -f foo',
    'pgrep -f foo | wc -l',
    'echo $(pgrep -f foo)',
    'cat my.pids | xargs kill',
    'git ls-files | xargs grep -ln pkill',
    'rg -l killall | xargs grep -n killall',
    'pgrep foo | xargs echo kill',
    'pgrep foo; cat my.pids | xargs kill',
    'git log --grep pkill',
    'grep -rn "pkill" scripts',
    'echo "do not pkill"',
    'git commit -m "kill $(pgrep foo) is refused"',
    'lockf -k ~/.cache/aquatome/checks.lock true',
    'lockf -k -t 0 ~/.cache/aquatome/checks.lock true',
    'lockf -kn ~/.cache/aquatome/sim.lock true',
    'lockf -t 5 ~/some/other.lock true',
  ]) expect(hook(c).status, c).toBe(0)
})
