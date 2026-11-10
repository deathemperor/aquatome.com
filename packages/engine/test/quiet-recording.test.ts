import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const STATUS = join(ROOT, 'scripts/mac-status.py')
const QUIET = join(ROOT, 'scripts/quiet-recording.sh')
const FRAMES = join(ROOT, 'scripts/frames-check.py')
const HOOK = join(ROOT, '.claude/hooks/sim-run-only.sh')
const hasLockf = spawnSync('sh', ['-c', 'command -v lockf']).status === 0

const stub = (path: string, body: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
}

/** A Mac as this home stands it in: its load, cores at work of 16, and the simulators up. */
function mac({ load = '50', cores = 16, up = [] as [string, string][] } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aq-quiet-'))
  const mask = (2 ** cores - 1).toString()
  writeFileSync(join(home, 'load'), load)
  stub(join(home, 'bin/sysctl'), `case "$2" in
    vm.loadavg) head -1 "$HOME/load" | sed 's/^/{ /; s/$/ 1 1 }/'; n=$(wc -l < "$HOME/load"); [ "$n" -gt 1 ] && sed -i.bak 1d "$HOME/load" ;;
    hw.ncpu) echo 16 ;;
    kern.sched_recommended_cores) echo ${mask} ;;
  esac; exit 0`)
  stub(join(home, 'bin/xcrun'), 'cat "$HOME/devices.json"')
  writeFileSync(join(home, 'devices.json'), JSON.stringify({ devices: { 'iOS-27-2': up.map(([udid, name]) => ({ udid, name })) } }))
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, MAC_STATUS_PAUSE: '0.01' }
  return { home, env }
}
const status = (m: ReturnType<typeof mac>, ...args: string[]) => spawnSync('python3', [STATUS, ...args], { encoding: 'utf8', env: m.env })
const THREE: [string, string][] = [['A', 'one'], ['B', 'two'], ['C', 'three']]

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

test('it tells a lead the load, the heat, who is up and the cap', () => {
  const m = mac({ cores: 14, up: [['A', 'one'], ['B', 'two']] })
  mkdirSync(join(m.home, '.agent-device/device-claims'), { recursive: true })
  writeFileSync(join(m.home, '.agent-device/device-claims/x.json'), JSON.stringify({ device: { id: 'B' }, workspace: '/a/lab-app-v2' }))
  const out = status(m).stdout
  expect(out).toContain('cores at work 14 of 16: heat took 2, so at most 2 simulators')
  expect(out).toContain('simulators up 2, at most 2: one, two (lab-app-v2)')
})

test('--wait goes on as soon as the load has fallen, and says so if it never does', () => {
  expect(status(mac({ load: '500\n400\n150\n' }), '--wait', '1').status).toBe(0)
  expect(status(mac({ load: '500' }), '--wait', '0.001').status).toBe(1)
})

const boot = (m: ReturnType<typeof mac>, id: string, hostId = 'local') =>
  spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: m.env, input: JSON.stringify({ tool_input: { hostId, id } }) })

test('a device session past the cap is refused and told who is up; one already up, or on another Mac, is not', () => {
  const full = mac({ up: THREE })
  const refused = boot(full, 'D')
  expect(refused.status).toBe(2)
  expect(refused.stderr).toContain('At most 3 simulators')
  expect(refused.stderr).toContain('one, two, three')
  expect(boot(full, 'A').status).toBe(0)
  expect(boot(full, 'D', 'another-mac').status).toBe(0)
  expect(boot(mac({ up: THREE.slice(0, 2) }), 'D').status).toBe(0)
  // A broken check doesn't stop a session.
  expect(spawnSync('python3', [STATUS, '--hook'], { encoding: 'utf8', env: full.env, input: 'not json' }).status).toBe(0)
})

test('with cores taken away by heat, the cap is two', () => {
  const hot = mac({ cores: 14, up: THREE.slice(0, 2) })
  expect(boot(hot, 'D').status).toBe(2)
  expect(boot(hot, 'D').stderr).toContain('At most 2 simulators')
  expect(boot(mac({ cores: 14, up: THREE.slice(0, 1) }), 'D').status).toBe(0)
})

test("a session's simctl boot past the cap stops at the hook", () => {
  const command = (m: ReturnType<typeof mac>, c: string) => spawnSync(HOOK, { encoding: 'utf8', env: m.env, input: JSON.stringify({ tool_input: { command: c } }) })
  const full = mac({ up: THREE })
  expect(command(full, 'xcrun simctl boot D').status).toBe(2)
  expect(command(full, 'xcrun simctl boot D').stderr).toContain('At most 3 simulators')
  expect(command(full, 'xcrun simctl boot A').status).toBe(0)
  expect(command(mac({ up: THREE.slice(0, 2) }), 'xcrun simctl boot D').status).toBe(0)
})

test.skipIf(!hasLockf)('a recording runs with both turns held, after what is running, and gives them back', async () => {
  const m = mac({ up: [] })
  mkdirSync(join(m.home, '.cache/aquatome'), { recursive: true })
  // Someone holds the checks queue: the recording has the simulator turn, and waits for theirs.
  const holder = spawn('lockf', ['-k', join(m.home, '.cache/aquatome/checks.lock'), 'sh', '-c', `touch ${m.home}/holding; for i in $(seq 400); do [ -f ${m.home}/release ] && exit 0; sleep 0.05; done`], { env: m.env, stdio: 'ignore' })
  while (!existsSync(`${m.home}/holding`)) await new Promise(r => setTimeout(r, 25))
  const rec = spawn(QUIET, ['sh', '-c', `touch ${m.home}/recorded; cat ${m.home}/.cache/aquatome/sim.lock > ${m.home}/turn`], { env: { ...m.env, SIM_RUN_NEXT_PAUSE: '0.01' }, stdio: 'ignore' })
  const end = new Promise(r => rec.on('close', r))
  while (!readFileSync(join(m.home, '.cache/aquatome/sim.lock'), { flag: 'a+' }).length) await new Promise(r => setTimeout(r, 25))
  // Long enough for a recording that skipped the checks queue to have started, even on a very loaded Mac.
  for (let i = 0; i < 80 && !existsSync(`${m.home}/recorded`); i++) await new Promise(r => setTimeout(r, 25))
  expect(existsSync(`${m.home}/recorded`)).toBe(false)
  writeFileSync(`${m.home}/release`, '')
  expect(await end).toBe(0)
  expect(existsSync(`${m.home}/recorded`)).toBe(true)
  expect(readFileSync(`${m.home}/turn`, 'utf8')).toMatch(/^pid \d+/)
  holder.kill()
}, 30_000)

test.skipIf(!hasLockf)('too loaded after its wait, a recording gives its turns back without recording', () => {
  const m = mac({ load: '500' })
  const r = spawnSync(QUIET, ['sh', '-c', `touch ${m.home}/recorded`], { encoding: 'utf8', env: { ...m.env, QUIET_WAIT_MINUTES: '0.001' } })
  expect(r.status).toBe(75)
  expect(existsSync(`${m.home}/recorded`)).toBe(false)
}, 30_000)

test('a recording holds its turns 20 minutes at most', () => {
  const m = mac()
  const r = spawnSync(QUIET, ['21', 'true'], { encoding: 'utf8', env: m.env })
  expect(r.status).toBe(64)
  expect(spawnSync(QUIET, ['true'], { encoding: 'utf8', env: { ...m.env, QUIET_WAIT_MINUTES: '0.001' } }).status).toBe(0)
}, 30_000)

/** A video stood in for: each frame a flat grey, so each step is the difference between two levels. */
function frames(levels: number[], rate = '30/1') {
  const home = mkdtempSync(join(tmpdir(), 'aq-frames-'))
  mkdirSync(join(home, 'bin'))
  const ffmpeg = join(home, 'bin/ffmpeg')
  writeFileSync(ffmpeg, `#!/usr/bin/env python3\nimport sys\nfor v in ${JSON.stringify(levels)}: sys.stdout.buffer.write(bytes([v]) * (107 * 232))\n`)
  chmodSync(ffmpeg, 0o755)
  stub(join(home, 'bin/ffprobe'), `echo "${rate}"`)
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
  const slow = frames([...still(5, 10), ...ramp(18, 10, 8), ...still(5, 154)], '3600/1723')('18')
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

test('no move found says so', () => {
  const r = frames(still(20, 10))('18')
  expect(r.status).toBe(2)
  expect(r.stdout).toContain('no move found')
})
