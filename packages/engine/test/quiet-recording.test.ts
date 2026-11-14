import { spawn, spawnSync } from './sim-run-turn'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { slow } from '@aq/schema/test-time'

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

/** A Mac as this home stands it in: its load, cores at work of 16, the simulators up, and its free space in GB. */
function mac({ load = '50', cores = 16 as number | null, up = [] as [string, string][], known = [] as [string, string][], free = 500 as number | 'fails' | 'nothing' | 'garbled' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aq-quiet-'))
  const mask = cores === null ? '' : (2 ** cores - 1).toString()
  writeFileSync(join(home, 'load'), load)
  stub(join(home, 'bin/sysctl'), `case "$2" in
    vm.loadavg) head -1 "$HOME/load" | awk '{ if (NF == 1) print "{ " $1 " 1 1 }"; else print "{ " $0 " }" }'; n=$(wc -l < "$HOME/load"); [ "$n" -gt 1 ] && sed -i.bak 1d "$HOME/load" ;;
    hw.ncpu) echo 16 ;;
    kern.sched_recommended_cores) echo ${mask} ;;
  esac; exit 0`)
  stub(join(home, 'bin/xcrun'), 'cat "$HOME/devices.json"')
  stub(join(home, 'bin/df'), free === 'fails' ? 'echo "df: no such disk" >&2; exit 1' : free === 'nothing' ? 'exit 0' : free === 'garbled' ? 'echo "Filesystem"; echo "/dev/x what"'
    : `echo 'Filesystem 1024-blocks Used Available Capacity Mounted on'; echo "/dev/disk3s1s1 971350180 1 ${Math.round(free * 1e9 / 1024)} 1% /"`)
  // Where the disk is: the simulators' 40 GB, the build folders' 8 and the worktrees' 77, as on 14 Nov at 09:00.
  for (const dir of ['Library/Developer/CoreSimulator/Devices', 'Library/Developer/Xcode/DerivedData', '.infinitus/worktrees/aquatome.com/a', '.infinitus/worktrees/aquatome.com/b']) mkdirSync(join(home, dir), { recursive: true })
  stub(join(home, 'bin/du'), 'case "$2" in */Devices) echo "39062500 $2" ;; */DerivedData) echo "7812500 $2" ;; */aquatome.com) echo "75195313 $2" ;; esac')
  const devices = [...up.map(([udid, name]) => ({ udid, name, state: 'Booted' })), ...known.map(([udid, name]) => ({ udid, name, state: 'Shutdown' }))]
  writeFileSync(join(home, 'devices.json'), JSON.stringify({ devices: { 'iOS-27-2': devices } }))
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, MAC_STATUS_PAUSE: '0.01', SIM_RUN_NEXT_PAUSE: '0.01' }
  return { home, env }
}
const status = (m: ReturnType<typeof mac>, ...args: string[]) => spawnSync('python3', [STATUS, ...args], { encoding: 'utf8', env: m.env })
const THREE: [string, string][] = [['A', 'one'], ['B', 'two'], ['C', 'three']]
const FOURTH: [string, string][] = [['D', 'four']]

// 13 November, 23:45: a TestFlight upload stopped at 12 GB free, and no one was watching. Under 30 GB the status says the
// chief of staff hears of it; under 20, what an upload needs, `--space` says no and no new simulator starts.
test('free space under 30 GB is said; under 20 GB `--space` says no and a new simulator does not start', () => {
  expect(status(mac({ free: 100 })).stdout).toMatch(/^free space 100 GB$/m)
  expect(status(mac({ free: 25 })).stdout).toContain('free space 25 GB: under 30 GB, the sweep tells the chief of staff')
  // Under 30 GB it says where the disk is, so whoever reads it needn't ask; above, it doesn't spend the time.
  const where = '  simulators: 40 GB, 2 of them, 1 up\n  Xcode\'s build folders: 8 GB\n  worktrees: 77 GB in 2 folders (the sweep takes merged ones at 03:35)'
  expect(status(mac({ free: 25, up: [['A', 'one']], known: [['D', 'four']] })).stdout).toContain(`under 30 GB, the sweep tells the chief of staff\n${where}\n`)
  expect(status(mac({ free: 100 })).stdout).not.toContain('simulators: 40 GB')
  expect(status(mac({ free: 100, up: [['A', 'one']], known: [['D', 'four']] }), '--where').stdout).toBe(`${where}\n`)
  expect(status(mac({ free: 15 })).stdout).toContain('free space 15 GB: under 20 GB, no simulator or upload starts')
  expect(status(mac({ free: 100 }), '--space')).toMatchObject({ status: 0, stderr: '' })
  expect(status(mac({ free: 25 }), '--space')).toMatchObject({ status: 0, stderr: expect.stringContaining('25 GB free on this Mac, under 30 GB') })
  expect(status(mac({ free: 15 }), '--space')).toMatchObject({ status: 3, stderr: expect.stringContaining('15 GB free on this Mac, under the 20 GB floor') })
  expect(status(mac({ free: 15 }), '--space').stderr).toContain('\n  worktrees: 77 GB in 2 folders')
  // A simulator that isn't up doesn't start, none up or not; one that is up is no new one.
  const low = mac({ free: 15, known: [['D', 'four']], up: [['A', 'one']] })
  expect(status(low, '--cap', 'D')).toMatchObject({ status: 2, stderr: expect.stringContaining('under the 20 GB floor') })
  expect(status(low, '--cap', 'A').status).toBe(0)
  const hook = spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: low.env, input: JSON.stringify({ tool_input: { deviceId: 'D', hostId: 'local' } }) })
  expect(hook).toMatchObject({ status: 2, stderr: expect.stringContaining('under the 20 GB floor') })
  expect(status(mac({ free: 25, known: [['D', 'four']] }), '--cap', 'D').status).toBe(0)
}, slow(60_000))

// The chief of staff, 14 Nov: a broken reading must not stop the iOS lead's run. A df that fails, says nothing or says
// something else never refuses a simulator, and `--space` lets the job go on.
test("a disk reading that fails, says nothing or can't be read never refuses a simulator or a job", () => {
  for (const free of ['fails', 'nothing', 'garbled'] as const) {
    const m = mac({ free, known: [['D', 'four']] })
    expect(status(m, '--cap', 'D'), free).toMatchObject({ status: 0, stderr: '' })
    expect(status(m, '--space'), free).toMatchObject({ status: 0, stderr: '' })
    expect(status(m).stdout, free).toContain('free space unknown')
    const hook = spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: m.env, input: JSON.stringify({ tool_input: { deviceId: 'D', hostId: 'local' } }) })
    expect(hook, free).toMatchObject({ status: 0, stderr: '' })
  }
}, slow(60_000))

// One mac-status.py per reading. Beside the rest of the suite, at default workers, these readings took 22 s
// on 2026-11-11, against the package's 30 s.
test('quiet enough to record is the load and the cores the takes held at', () => {
  expect(status(mac({ load: '200' })).status).toBe(0)
  const loaded = status(mac({ load: '201' }))
  expect(loaded.status).toBe(1)
  expect(loaded.stdout).toContain('too loaded to record: load 201')
  expect(status(mac({ load: '50', cores: 12 })).status).toBe(0)
  const hot = status(mac({ load: '50', cores: 10 }))
  expect(hot.status).toBe(1)
  expect(hot.stdout).toContain('heat has left 10 cores')
}, slow(60_000))

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

test('a failing xcrun does not stop the verdict', () => {
  const m = mac()
  stub(join(m.home, 'bin/xcrun'), 'exit 1')
  const r = status(m)
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('quiet enough to record')
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
}, slow(30_000))

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
}, slow(60_000))

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
}, slow(60_000))

test('stopped, a recording stops its command and frees both turns', async () => {
  const r = recording()
  const rec = spawn(QUIET, r.long, { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.has('pid'))
  rec.kill('SIGTERM')
  await end
  await r.until(() => r.has('stopped'))
  await r.until(() => r.probe('sim.lock') === 'free' && r.probe('checks.lock') === 'free')
}, slow(60_000))

test('its queue process killed outright, a recording stops its command too', async () => {
  const r = recording()
  const rec = spawn(QUIET, r.long, { env: r.m.env, stdio: 'ignore' })
  await r.until(() => r.has('pid'))
  rec.kill('SIGKILL')
  await r.until(() => r.has('stopped'))
  await r.until(() => r.probe('checks.lock') === 'free')
}, slow(60_000))

test.skipIf(process.platform !== 'darwin')('it keeps its place in the checks queue: a job that came after it goes after it', async () => {
  const r = recording()
  const lockFile = join(r.m.home, '.cache/aquatome/checks.lock')
  const openers = () => spawnSync('lsof', ['-t', lockFile], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).length
  const holder = r.hold('checks.lock')
  await r.until(() => r.has('holding'))
  const rec = spawn(QUIET, ['sh', '-c', `[ ! -f ${r.m.home}/second ] && touch ${r.m.home}/first`], { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  // The holder and the recording, which is in the queue once it has the file open.
  await r.until(() => openers() >= 2)
  const second = spawn('python3', ['-c', `import fcntl, os
f = os.open(${JSON.stringify(lockFile)}, os.O_CREAT | os.O_RDWR)
fcntl.flock(f, fcntl.LOCK_EX)
open(${JSON.stringify(join(r.m.home, 'second'))}, "w").close()
`], { stdio: 'ignore' })
  const secondEnd = r.closed(second)
  await r.until(() => openers() >= 3)
  writeFileSync(join(r.m.home, 'release'), '')
  expect(await end).toBe(0)
  await secondEnd
  expect(r.has('first')).toBe(true)
  holder.kill()
}, slow(60_000))

test('the holding process killed, the command stops at once, without it the limit would never come', async () => {
  const r = recording()
  const rec = spawn(QUIET, r.long, { env: r.m.env, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.has('pid'))
  const holder = spawnSync('pgrep', ['-P', String(rec.pid)], { encoding: 'utf8' }).stdout.trim().split('\n')[0]
  process.kill(Number(holder), 'SIGKILL')
  await r.until(() => r.has('stopped'))
  await end
  await r.until(() => r.probe('checks.lock') === 'free')
}, slow(60_000))

test('killed while it waits for the Mac to quieten, it gives the checks turn back', async () => {
  const r = recording()
  writeFileSync(join(r.m.home, 'load'), '500')
  const rec = spawn(QUIET, ['touch', join(r.m.home, 'recorded')], { env: { ...r.m.env, QUIET_WAIT_MINUTES: '5' }, stdio: 'ignore' })
  await r.until(() => r.probe('checks.lock') === 'held')
  rec.kill('SIGKILL')
  await r.until(() => r.probe('checks.lock') === 'free')
  expect(r.has('recorded')).toBe(false)
  writeFileSync(join(r.m.home, 'load'), '50') // its load check, left running, ends with the Mac quiet
}, slow(60_000))

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
}, slow(60_000))

test('stopped while it waits for the Mac to quieten, it gives both turns back at once', async () => {
  const r = recording()
  writeFileSync(join(r.m.home, 'load'), '500')
  const rec = spawn(QUIET, ['touch', join(r.m.home, 'recorded')], { env: { ...r.m.env, QUIET_WAIT_MINUTES: '5' }, stdio: 'ignore' })
  const end = r.closed(rec)
  await r.until(() => r.probe('checks.lock') === 'held')
  rec.kill('SIGTERM')
  await end
  await r.until(() => r.probe('checks.lock') === 'free' && r.probe('sim.lock') === 'free')
  expect(r.has('recorded')).toBe(false)
}, slow(60_000))

test('a recording longer than the wait for the checks turn runs to its end', async () => {
  const r = recording()
  const rec = spawn(QUIET, ['sh', '-c', `sleep 3; touch ${r.m.home}/recorded`], { env: { ...r.m.env, QUIET_CHECKS_WAIT_MINUTES: '0.02' }, stdio: 'ignore' })
  expect(await r.closed(rec)).toBe(0)
  expect(r.has('recorded')).toBe(true)
}, slow(60_000))

test('too loaded after its wait, a recording gives its turns back without recording', () => {
  const m = mac({ load: '500' })
  const r = spawnSync(QUIET, ['sh', '-c', `touch ${m.home}/recorded`], { encoding: 'utf8', env: { ...m.env, QUIET_WAIT_MINUTES: '0.001' } })
  expect(r.status).toBe(75)
  expect(existsSync(`${m.home}/recorded`)).toBe(false)
}, slow(60_000))

test('a recording that runs out of time stops, and its limit is 20 minutes at most', async () => {
  const r = recording()
  const rec = spawn(QUIET, ['1', ...r.long], { env: { ...r.m.env, QUIET_MINUTE_SECONDS: '0.5' }, stdio: 'ignore' })
  expect(await r.closed(rec)).toBe(124)
  expect(r.has('stopped')).toBe(true)
  const m = mac()
  expect(spawnSync(QUIET, ['21', 'true'], { encoding: 'utf8', env: m.env }).status).toBe(64)
  expect(spawnSync(QUIET, ['true'], { encoding: 'utf8', env: m.env }).status).toBe(0)
}, slow(60_000))

test('at the limit a command that ignores the stop is killed, and the exit still says it ran out of time', async () => {
  const r = recording()
  const stubborn = ['sh', '-c', `trap '' TERM; echo $$ > ${r.m.home}/pid; for i in $(seq 1200); do sleep 0.05; done`]
  const rec = spawn(QUIET, ['1', ...stubborn], { env: { ...r.m.env, QUIET_MINUTE_SECONDS: '1' }, stdio: 'ignore' })
  expect(await r.closed(rec)).toBe(124)
  const pid = Number(readFileSync(join(r.m.home, 'pid'), 'utf8'))
  await r.until(() => { try { process.kill(pid, 0); return false } catch { return true } })
  expect(r.probe('sim.lock')).toBe('free')
}, slow(60_000))

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

test('a pause of two frames is inside a move, and a longer one ends it', () => {
  const up = ramp(8, 10, 8)
  const at = 74 // where that ramp ends
  const inside = frames([...still(5, 10), ...up, ...still(2, at), ...ramp(8, at, 8), ...still(5, at + 64)])('16')
  expect(inside.status, inside.stdout).toBe(0)
  const apart = frames([...still(5, 10), ...up, ...still(3, at), ...ramp(8, at, 8), ...still(5, at + 64)])('8,8')
  expect(apart.status, apart.stdout).toBe(0)
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
