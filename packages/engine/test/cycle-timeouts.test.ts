import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

test('every package the engine cycle tests gives a test 30 s, so a busy Mac doesn\'t stop a cycle from publishing', async () => {
  // The cycle runs the root `pnpm test`: every package's vitest run (scripts/engine-cycle.sh).
  const configs = ['packages', 'apps'].flatMap(dir => readdirSync(join(ROOT, dir)).map(p => join(ROOT, dir, p, 'vitest.config.ts')))
    .filter(existsSync)
  expect(configs.length).toBeGreaterThanOrEqual(3)
  for (const f of configs) {
    const { default: c } = (await import(f)) as { default: { test?: { testTimeout?: number } } }
    expect(c.test?.testTimeout, f.slice(ROOT.length)).toBeGreaterThanOrEqual(30_000)
  }
})

// verify (scripts/cycle-checks.sh) with `checks` (one step under the lock), `calm` and `settled` stood in for: each run
// prints the next of `runs` and fails unless it prints "ok". Returns verify's exit code, how many times a step ran, the
// steps that ran (a second try's as it was given), the waits and tries in order, and what the cycle logged.
const ONE_AT_A_TIME = 'export pnpm_config_workspace_concurrency=1; '
function verify(runs: string[], steps = ['pnpm build && pnpm test']) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-verify-'))
  const script = `
    log() { echo "LOG $*"; }
    TEST_LOG="${dir}/test.log"
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    calm() { echo calm >> "${dir}/order"; }
    settled() { echo settled >> "${dir}/order"; }
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() { echo "\${runs[$n]}"; echo "$1" >> "${dir}/steps"; echo "check $1" >> "${dir}/order"; local r="\${runs[$n]}"; n=$((n + 1)); echo $n > "${dir}/n"; [ "$r" = ok ]; }
    verify ${steps.map(s => `'${s}'`).join(' ')}`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  const lines = (f: string) => readFileSync(join(dir, f), 'utf8').trim().split('\n')
  return { code: r.status, runs: Number(readFileSync(join(dir, 'n'), 'utf8')), steps: lines('steps'), order: lines('order'), log: r.stdout }
}

test('tests that ran out of time on a busy Mac run once more before a cycle gives up its pages', () => {
  const again = verify(['Error: Test timed out in 30000ms.', 'ok'])
  expect(again).toMatchObject({ code: 0, runs: 2 })
  expect(again.log).toContain('LOG tests ran out of time on a busy Mac')
  // A test that fails for another reason runs once more too, and fails the cycle only if it fails again.
  const failed = 'AssertionError: expected 1 to be 2'
  expect(verify([failed, 'ok'])).toMatchObject({ code: 0, runs: 2 })
  expect(verify([failed, failed])).toMatchObject({ code: 1, runs: 2 })
  expect(verify(['Error: Test timed out in 30000ms.', 'Error: Test timed out in 30000ms.'])).toMatchObject({ code: 1, runs: 2 })
})

test('only the step that ran out of time runs again: the build before it passed, and a second one would take hours', () => {
  // 2026-11-07: the pages part's tests ran out of time, and their second run queued the whole build again.
  const steps = ['I18N_LENIENT=1 pnpm build', 'pnpm test']
  expect(verify(['ok', 'Error: Test timed out in 30000ms.', 'ok'], steps)).toMatchObject({ code: 0, runs: 3, steps: [steps[0], steps[1], ONE_AT_A_TIME + steps[1]] })
  // A build that fails twice stops the checks there: no tests run on it.
  expect(verify(['[ERROR] build failed', '[ERROR] build failed', 'ok'], steps)).toMatchObject({ code: 1, runs: 2, steps: [steps[0], ONE_AT_A_TIME + steps[0]] })
  // One more run a cycle: tests that ran out of time again fail it.
  expect(verify(['ok', 'Error: Test timed out in 30000ms.', 'Error: Test timed out in 30000ms.'], steps)).toMatchObject({ code: 1, runs: 3 })
})

test("a second try waits for the first try's own load to go, then runs the packages one at a time: the same step, the same tests", () => {
  // 2026-11-12 02:28: the photos part's second try began the moment its first ended, with both packages side by side,
  // and ran two to four times slower than the first: its site tests ran out of time and the cycle didn't publish.
  for (const first of ['AssertionError: expected 20 to be 10', 'Error: Test timed out in 30000ms.']) {
    const r = verify([first, 'ok'], ['pnpm test'])
    expect(r).toMatchObject({ code: 0, runs: 2, steps: ['pnpm test', ONE_AT_A_TIME + 'pnpm test'] })
    expect(r.order).toEqual(['calm', 'check pnpm test', 'settled', 'calm', 'check ' + ONE_AT_A_TIME + 'pnpm test'])
  }
  // A first try that passes has no second, and nothing waits after it.
  expect(verify(['ok'], ['pnpm test']).order).toEqual(['calm', 'check pnpm test'])
  // And it still fails the cycle when it fails again.
  expect(verify(['AssertionError: expected 1 to be 2', 'AssertionError: expected 1 to be 2'], ['pnpm test'])).toMatchObject({ code: 1, runs: 2 })
})

// settled (scripts/cycle-checks.sh) with sysctl and sleep stood in for: `loads` are the 1-minute loads it reads in turn,
// on 16 cores. Returns how long it slept, how many loads it read and what it logged.
function settled(loads: number[], env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-settled-'))
  const script = `
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    loads=(${loads.join(' ')})
    # Read in a subshell ($(sysctl …)), so the count is kept in a file.
    sysctl() { if [ "$2" = hw.ncpu ]; then echo 16; else local i; i=$(cat "${dir}/reads" 2>/dev/null || echo 0); echo "{ \${loads[$i]:-99} 1.00 1.00 }"; echo $((i + 1)) > "${dir}/reads"; fi; }
    sleep() { echo "$1" >> "${dir}/slept"; }
    settled`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } })
  const read = (f: string) => { try { return readFileSync(join(dir, f), 'utf8').trim() } catch { return '' } }
  return { code: r.status, slept: read('slept').split('\n').filter(Boolean).map(Number), reads: Number(read('reads') || 0), log: r.stdout }
}

test("settled waits a minute, then until the 1-minute load is under one a core, and goes ahead after 10 minutes more", () => {
  // The first try's workers still in the load: it waits for them to go.
  expect(settled([40, 25, 15])).toMatchObject({ code: 0, slept: [60, 30, 30], reads: 3, log: '' })
  // Already low after the minute: it goes at once.
  expect(settled([3])).toMatchObject({ code: 0, slept: [60], reads: 1 })
  // Never low: 20 reads, 10 minutes, then it says so and goes ahead (the step still runs, and still has to pass).
  const high = settled(Array(30).fill(200))
  expect(high).toMatchObject({ code: 0, reads: 20 })
  expect(high.slept).toEqual([60, ...Array(20).fill(30)])
  expect(high.log).toContain('LOG the load stayed high after the first try: trying again anyway')
  // GitHub's runners run one part each: no wait there.
  expect(settled([200], { GITHUB_ACTIONS: 'true' })).toMatchObject({ code: 0, slept: [], reads: 0 })
})

test('pnpm reads the one-at-a-time setting the second try sets, so its packages do run one after another', () => {
  const get = (env: Record<string, string>) => spawnSync('pnpm', ['config', 'get', 'workspace-concurrency'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } }).stdout.trim()
  expect(get({ pnpm_config_workspace_concurrency: '1' })).toBe('1')
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toContain('checks "export pnpm_config_workspace_concurrency=1; $step"')
})

test('the engine cycle checks through verify before every publish, with the steps its commit needs', () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  expect(cycle).toContain('source "$REPO/scripts/cycle-checks.sh"')
  // Its content, and again after a merge in push(): the same steps (verify_cycle), and no build of the real site.
  expect(cycle.match(/^\s*(if ! )?verify_cycle\b/gm)).toHaveLength(2)
  expect(cycle).not.toMatch(/\bverify '|\bchecks '|pnpm build/)
})

test('the video job checks as the engine cycle does: it waits for a calmer Mac, and tests that ran out of time run again', () => {
  // 2026-11-07: its own checks, without either, failed twice at a load of 667 on 16 cores and held back the videos.
  const cycle = readFileSync(join(ROOT, 'scripts/video-cycle.sh'), 'utf8')
  expect(cycle).toContain('source scripts/cycle-checks.sh')
  expect(cycle.match(/\bverify '/g)).toHaveLength(2)
  expect(cycle).not.toMatch(/\bchecks '|^checks\(\)/m)
})

test('video guides are checked again by their own job alone, recheck then redo, with the video job\'s checks', () => {
  const recheck = readFileSync(join(ROOT, 'scripts/video-recheck.sh'), 'utf8')
  expect(recheck).toContain('source scripts/cycle-checks.sh')
  expect(recheck.match(/\bverify '/g)).toHaveLength(2)
  expect(recheck).toMatch(/^pnpm engine review-backfill --kind video-guide --reviewed-before .*\n(#.*\n)*pnpm engine videos --redo --rechecked-since /m)
  // The low guides in search get their two more reads first, under their own command's ceiling (2026-11-11).
  expect(recheck).toMatch(/^pnpm engine review-backfill-97 .*\n(#.*\n)*pnpm engine review-backfill --kind video-guide /m)
  // The video job checks none again, so the two never check one guide at once.
  expect(readFileSync(join(ROOT, 'scripts/video-cycle.sh'), 'utf8')).not.toMatch(/^pnpm engine (review-backfill|videos --redo)/m)
})
