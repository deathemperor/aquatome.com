import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const STATUS = join(ROOT, 'scripts/mac-status.py')
const QUIET = join(ROOT, 'scripts/quiet-recording.py')
const CHECKS = join(ROOT, 'scripts/checks.sh')
const FRAMES = join(ROOT, 'scripts/frames-check.py')
const HOOK = join(ROOT, '.claude/hooks/sim-run-only.sh')
const hasLockf = spawnSync('sh', ['-c', 'command -v lockf']).status === 0

const stub = (path: string, body: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
}

/** A Mac as this home stands it in: its load, cores at work of 16, and the simulators up. */
function mac({ load = '50', cores = 16 as number | null, up = [] as [string, string][], known = [] as [string, string][] } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aq-quiet-'))
  const mask = cores === null ? '' : (2 ** cores - 1).toString()
  writeFileSync(join(home, 'load'), load)
  stub(join(home, 'bin/sysctl'), `case "$2" in
    vm.loadavg) head -1 "$HOME/load" | awk '{ if (NF == 1) print "{ " $1 " 1 1 }"; else print "{ " $0 " }" }'; n=$(wc -l < "$HOME/load"); [ "$n" -gt 1 ] && sed -i.bak 1d "$HOME/load" ;;
    hw.ncpu) echo 16 ;;
    kern.sched_recommended_cores) echo ${mask} ;;
  esac; exit 0`)
  stub(join(home, 'bin/xcrun'), 'cat "$HOME/devices.json"')
  const devices = [...up.map(([udid, name]) => ({ udid, name, state: 'Booted' })), ...known.map(([udid, name]) => ({ udid, name, state: 'Shutdown' }))]
  writeFileSync(join(home, 'devices.json'), JSON.stringify({ devices: { 'iOS-27-2': devices } }))
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, MAC_STATUS_PAUSE: '0.01', SIM_RUN_NEXT_PAUSE: '0.01' }
  return { home, env }
}
const status = (m: ReturnType<typeof mac>, ...args: string[]) => spawnSync('python3', [STATUS, ...args], { encoding: 'utf8', env: m.env })
const THREE: [string, string][] = [['A', 'one'], ['B', 'two'], ['C', 'three']]
const FOURTH: [string, string][] = [['D', 'four']]

test('quiet enough to record is the load and the cores the takes held at', () => {
  expect(status(mac({ load: '200' })).status).toBe(0)
  const loaded = status(mac({ load: '201' }))
  expect(loaded.status).toBe(1)
  expect(loaded.stdout).toContain('too loaded to record: load 201')
  expect(status(mac({ load: '50', cores: 12 })).status).toBe(0)
  const hot = status(mac({ load: '50', cores: 10 }))
  expect(hot.status).toBe(1)
  expect(hot.stdout).toContain('heat has left 10 cores')
})

test("what can't be read isn't quiet, and a counter that wrapped isn't either", () => {
  const unread = status(mac({ cores: null }))
  expect(unread.status).toBe(1)
  expect(unread.stdout).toContain("the cores at work can't be read")
  expect(unread.stdout).toContain('at most 3')
  const wrapped = status(mac({ load: '12 900' }))
  expect(wrapped.status).toBe(1)
  expect(wrapped.stdout).toContain('load 900')
  expect(status(mac({ load: '180 474' })).status).toBe(0)
})

test('it tells a lead the load, the heat, who is up and the cap', () => {
  const m = mac({ cores: 14, up: [['A', 'one'], ['B', 'two']] })
  mkdirSync(join(m.home, '.agent-device/device-claims'), { recursive: true })
  writeFileSync(join(m.home, '.agent-device/device-claims/x.json'), JSON.stringify({ device: { id: 'B' }, workspace: '/a/lab-app-v2' }))
  const out = status(m).stdout
  expect(out).toContain('cores at work 14 of 16: heat took 2, so at most 2 simulators')
  expect(out).toContain('simulators up 2, at most 2: one, two (lab-app-v2)')
})

test('a run that has finished no longer shows as having the simulator turn', () => {
  const m = mac()
  mkdirSync(join(m.home, '.cache/aquatome'), { recursive: true })
  writeFileSync(join(m.home, '.cache/aquatome/sim.lock'), 'pid 999999, from /a, since 13:18')
  expect(status(m).stdout).toContain('simulator turn: free')
  writeFileSync(join(m.home, '.cache/aquatome/sim.lock'), `pid ${process.pid}, from /a, since 13:18`)
  expect(status(m).stdout).toContain(`simulator turn: pid ${process.pid}`)
})

test('--wait goes on as soon as the load has fallen, and says so if it never does', () => {
  expect(status(mac({ load: '500\n400\n150\n' }), '--wait', '1').status).toBe(0)
  expect(status(mac({ load: '500' }), '--wait', '0.001').status).toBe(1)
})

const boot = (m: ReturnType<typeof mac>, deviceId: string | undefined, hostId = 'local') =>
  spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: m.env, input: JSON.stringify({ tool_input: { hostId, deviceId } }) })

test('a device session past the cap is refused and told who is up; one already up, or on another Mac, is not', () => {
  const full = mac({ up: THREE, known: FOURTH })
  const refused = boot(full, 'D')
  expect(refused.status).toBe(2)
  expect(refused.stderr).toContain('At most 3 simulators')
  expect(refused.stderr).toContain('one, two, three')
  expect(boot(full, 'A').status).toBe(0)
  expect(boot(full, 'D', 'another-mac').status).toBe(0)
  // An Android emulator isn't one of these, and a call that names no device has picked none yet.
  expect(boot(full, 'repro35').status).toBe(0)
  expect(boot(full, undefined).status).toBe(0)
  expect(boot(mac({ up: THREE.slice(0, 2), known: FOURTH }), 'D').status).toBe(0)
  // A broken check doesn't stop a session.
  expect(spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: full.env, input: 'not json' }).status).toBe(0)
})

test('with cores taken away by heat, the cap is two', () => {
  const hot = mac({ cores: 14, up: THREE.slice(0, 2), known: FOURTH })
  expect(boot(hot, 'D').status).toBe(2)
  expect(boot(hot, 'D').stderr).toContain('At most 2 simulators')
  expect(boot(mac({ cores: 14, up: THREE.slice(0, 1), known: FOURTH }), 'D').status).toBe(0)
})

test("a session's simctl boot past the cap stops at the hook; one it can't read, or that's already up, goes on", () => {
  const command = (m: ReturnType<typeof mac>, c: string) => spawnSync(HOOK, { encoding: 'utf8', env: m.env, input: JSON.stringify({ tool_input: { command: c } }) })
  const full = mac({ up: THREE, known: FOURTH })
  expect(command(full, 'xcrun simctl boot D').status).toBe(2)
  expect(command(full, 'xcrun simctl boot D').stderr).toContain('At most 3 simulators')
  expect(command(full, 'xcrun simctl boot four').status).toBe(2)
  expect(command(full, 'xcrun simctl boot A').status).toBe(0)
  expect(command(full, 'xcrun simctl boot one').status).toBe(0)
  expect(command(full, 'U=D; xcrun simctl boot "$U"').status).toBe(0)
  expect(command(mac({ up: THREE.slice(0, 2), known: FOURTH }), 'xcrun simctl boot D').status).toBe(0)
})

test('checks.sh puts the shared queue back when a lockf without -k has replaced the link with a file', () => {
  const m = mac()
  const shared = join(m.home, 'shared')
  mkdirSync(shared)
  writeFileSync(join(shared, 'checks.lock'), '')
  mkdirSync(join(m.home, '.cache/aquatome'), { recursive: true })
  const lock = join(m.home, '.cache/aquatome/checks.lock')
  writeFileSync(lock, '')
  if (!hasLockf) stub(join(m.home, 'bin/lockf'), 'shift 2; exec "$@"')
  const r = spawnSync(CHECKS, ['true'], { encoding: 'utf8', env: { ...m.env, AQ_SHARED_LOCKS: shared } })
  expect(r.status, r.stderr).toBe(0)
  expect(lstatSync(lock).isSymbolicLink()).toBe(true)
  expect(readlinkSync(lock)).toBe(join(shared, 'checks.lock'))
}, 30_000)

// Tries a lock without waiting: "held" if someone has it.
const PROBE = `import fcntl, os, sys
f = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR)
try:
    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    print("free")
except BlockingIOError:
    print("held")
`
function recording() {
  const m = mac()
  const lock = (name: string) => join(m.home, '.cache/aquatome', name)
  mkdirSync(join(m.home, '.cache/aquatome'), { recursive: true })
  writeFileSync(join(m.home, 'probe.py'), PROBE)
  const probe = (name: string) => spawnSync('python3', [join(m.home, 'probe.py'), lock(name)], { encoding: 'utf8' }).stdout.trim()
  // Holds a lock until released, as a job in that queue does; bounded, so a failed test leaves nothing running.
  const hold = (name: string) => spawn('python3', ['-c', `import fcntl, os, time
f = os.open(${JSON.stringify(lock(name))}, os.O_CREAT | os.O_RDWR)
fcntl.flock(f, fcntl.LOCK_EX)
open(${JSON.stringify(join(m.home, 'holding'))}, "w").close()
for i in range(1500):
    if os.path.exists(${JSON.stringify(join(m.home, 'release'))}): break
    time.sleep(0.02)
`], { stdio: 'ignore' })
  const until = async (ok: () => boolean) => { for (let i = 0; i < 1200 && !ok(); i++) await new Promise(r => setTimeout(r, 25)); expect(ok()).toBe(true) }
  const has = (f: string) => existsSync(join(m.home, f))
  const closed = (p: ReturnType<typeof spawn>) => new Promise<number | null>(r => p.on('close', c => r(c)))
  // A recording that notes it has started, then stays until stopped, and notes that too.
  const long = ['sh', '-c', `trap 'touch ${m.home}/stopped; exit 0' TERM; echo $$ > ${m.home}/pid; for i in $(seq 1200); do sleep 0.05; done`]
  return { m, probe, hold, until, has, closed, long }
}

test('a recording runs with both turns held, after what is running, and gives them back', async () => {
  const r = recording()
  const holder = r.hold('checks.lock')
  const held = r.closed(holder)
  await r.until(() => r.has('holding'))
  const probes = ['sim.lock', 'checks.lock'].map(n => `python3 ${r.m.home}/probe.py ${r.m.home}/.cache/aquatome/${n} >> ${r.m.home}/seen`).join('; ')
  const rec = spawn(QUIET, ['sh', '-c', `${probes}; touch ${r.m.home}/recorded`], { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.probe('sim.lock') === 'held')
  // Long enough for a recording that skipped the checks queue to have started, even on a very loaded Mac.
  for (let i = 0; i < 80 && !r.has('recorded'); i++) await new Promise(p => setTimeout(p, 25))
  expect(r.has('recorded')).toBe(false)
  writeFileSync(join(r.m.home, 'release'), '')
  expect(await end).toBe(0)
  await held
  expect(readFileSync(join(r.m.home, 'seen'), 'utf8')).toBe('held\nheld\n')
  expect(r.probe('sim.lock')).toBe('free')
  expect(r.probe('checks.lock')).toBe('free')
}, 60_000)

test.skipIf(!hasLockf)('it waits for a job holding the checks queue through lockf', async () => {
  const r = recording()
  const holder = spawn('lockf', ['-k', join(r.m.home, '.cache/aquatome/checks.lock'), 'sh', '-c', `touch ${r.m.home}/holding; for i in $(seq 800); do [ -f ${r.m.home}/release ] && exit 0; sleep 0.05; done`], { env: r.m.env, stdio: 'ignore' })
  await r.until(() => r.has('holding'))
  const rec = spawn(QUIET, ['touch', join(r.m.home, 'recorded')], { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.probe('sim.lock') === 'held')
  for (let i = 0; i < 80 && !r.has('recorded'); i++) await new Promise(p => setTimeout(p, 25))
  expect(r.has('recorded')).toBe(false)
  writeFileSync(join(r.m.home, 'release'), '')
  expect(await end).toBe(0)
  expect(r.has('recorded')).toBe(true)
  holder.kill()
}, 60_000)

test('stopped, a recording stops its command and frees both turns', async () => {
  const r = recording()
  const rec = spawn(QUIET, r.long, { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.has('pid'))
  rec.kill('SIGTERM')
  await end
  await r.until(() => r.has('stopped'))
  await r.until(() => r.probe('sim.lock') === 'free' && r.probe('checks.lock') === 'free')
}, 60_000)

test('its queue process killed outright, a recording stops its command too', async () => {
  const r = recording()
  const rec = spawn(QUIET, r.long, { env: r.m.env, stdio: 'ignore' })
  await r.until(() => r.has('pid'))
  rec.kill('SIGKILL')
  await r.until(() => r.has('stopped'))
  await r.until(() => r.probe('checks.lock') === 'free')
}, 60_000)

test('no checks turn in time: it gives the simulator turn back without recording', async () => {
  const r = recording()
  const holder = r.hold('checks.lock')
  const held = r.closed(holder)
  await r.until(() => r.has('holding'))
  const rec = spawn(QUIET, ['touch', join(r.m.home, 'recorded')], { env: { ...r.m.env, QUIET_CHECKS_WAIT_MINUTES: '0.002' }, stdio: 'ignore' })
  expect(await r.closed(rec)).toBe(75)
  expect(r.has('recorded')).toBe(false)
  expect(r.probe('sim.lock')).toBe('free')
  writeFileSync(join(r.m.home, 'release'), '')
  await held
}, 60_000)

test('too loaded after its wait, a recording gives its turns back without recording', () => {
  const m = mac({ load: '500' })
  const r = spawnSync(QUIET, ['sh', '-c', `touch ${m.home}/recorded`], { encoding: 'utf8', env: { ...m.env, QUIET_WAIT_MINUTES: '0.001' } })
  expect(r.status).toBe(75)
  expect(existsSync(`${m.home}/recorded`)).toBe(false)
}, 60_000)

test('a recording that runs out of time stops, and its limit is 20 minutes at most', async () => {
  const r = recording()
  const rec = spawn(QUIET, ['1', ...r.long], { env: { ...r.m.env, QUIET_MINUTE_SECONDS: '0.5' }, stdio: 'ignore' })
  expect(await r.closed(rec)).toBe(124)
  expect(r.has('stopped')).toBe(true)
  const m = mac()
  expect(spawnSync(QUIET, ['21', 'true'], { encoding: 'utf8', env: m.env }).status).toBe(64)
  expect(spawnSync(QUIET, ['true'], { encoding: 'utf8', env: m.env }).status).toBe(0)
}, 60_000)

test('a command that takes a queue itself is refused: it would wait for its own turn', () => {
  const m = mac()
  expect(spawnSync(QUIET, ['apps/ios/scripts/sim-run.py', 'xcodebuild', 'test'], { encoding: 'utf8', env: m.env }).status).toBe(64)
  expect(spawnSync(QUIET, ['scripts/checks.sh', 'true'], { encoding: 'utf8', env: m.env }).status).toBe(64)
})

/** A video stood in for: each frame a flat grey, so each step is the difference between two levels. `gap`, its frames' spacing in seconds. */
function frames(levels: number[], gap = 1 / 30) {
  const home = mkdtempSync(join(tmpdir(), 'aq-frames-'))
  mkdirSync(join(home, 'bin'))
  const ffmpeg = join(home, 'bin/ffmpeg')
  writeFileSync(ffmpeg, `#!/usr/bin/env python3\nimport sys\nfor v in ${JSON.stringify(levels)}: sys.stdout.buffer.write(bytes([v]) * (107 * 232))\n`)
  chmodSync(ffmpeg, 0o755)
  const ffprobe = join(home, 'bin/ffprobe')
  writeFileSync(ffprobe, `#!/usr/bin/env python3\nfor i in range(${levels.length}): print(f"{i * ${gap}:.6f},")\n`)
  chmodSync(ffprobe, 0o755)
  return (expected: string) => spawnSync('python3', [FRAMES, 'take.mp4', '--expected', expected], { encoding: 'utf8', env: { ...process.env, PATH: `${home}/bin:${process.env.PATH}` } })
}
const still = (n: number, v: number) => Array<number>(n).fill(v)
// A move in n even steps from v, up by `step` a frame.
const ramp = (n: number, v: number, step: number) => Array.from({ length: n }, (_, i) => v + (i + 1) * step)

test('a move with every frame passes', () => {
  const r = frames([...still(5, 10), ...ramp(18, 10, 8), ...still(5, 154)])('18')
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('18 of 18 expected, largest step 6%: kept')
  expect(r.stdout).toContain('every frame kept')
})

test('a move that jumped loses, even with frames after the jump: one frame carrying most of the change', () => {
  // As in the take at load 850: a card to the full page in one frame, then small changes settling.
  const r = frames([...still(5, 10), 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230, 235, ...still(5, 235)])('18')
  expect(r.status).toBe(1)
  expect(r.stdout).toMatch(/18 of 18 expected, largest step 62%: LOST FRAMES/)
})

test('too few frames lose, and so does a file below the real rate', () => {
  const few = frames([...still(5, 10), ...ramp(12, 10, 12), ...still(5, 154)])('18')
  expect(few.status).toBe(1)
  expect(few.stdout).toContain('12 of 18 expected')
  const slow = frames([...still(5, 10), ...ramp(18, 10, 8), ...still(5, 154)], 0.48)('18')
  expect(slow.status).toBe(1)
  expect(slow.stdout).toContain('2 frames a second, and a recording needs 30')
})

test('each big move has its own expected count, and a small settling move is not judged', () => {
  const open = ramp(18, 10, 8)
  const close = ramp(12, 154, -8)
  const r = frames([...still(5, 10), ...open, ...still(10, 154), 158, 154, ...still(10, 154), ...close, ...still(5, 58)])('18,12')
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('move 1')
  expect(r.stdout).toContain('12 of 12 expected')
  expect(r.stdout).not.toContain('move 3')
})

test('a take missing a move it was expected to have fails', () => {
  const r = frames([...still(5, 10), ...ramp(18, 10, 8), ...still(5, 154)])('18,12')
  expect(r.status).toBe(1)
  expect(r.stdout).toContain('1 big moves found, 2 expected')
  expect(r.stdout).toContain('frames lost')
})

test('no move found says so', () => {
  const r = frames(still(20, 10))('18')
  expect(r.status).toBe(2)
  expect(r.stdout).toContain('no move found')
})
