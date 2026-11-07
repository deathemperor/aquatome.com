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

// verify (scripts/cycle-checks.sh) with `checks` (one step under the lock) and `calm` stood in for: each run prints the
// next of `runs` and fails unless it prints "ok". Returns verify's exit code, how many times a step ran, the steps that
// ran, and what the cycle logged.
function verify(runs: string[], steps = ['pnpm build && pnpm test']) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-verify-'))
  const script = `
    log() { echo "LOG $*"; }
    TEST_LOG="${dir}/test.log"
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    calm() { :; }
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() { echo "\${runs[$n]}"; echo "$1" >> "${dir}/steps"; local r="\${runs[$n]}"; n=$((n + 1)); echo $n > "${dir}/n"; [ "$r" = ok ]; }
    verify ${steps.map(s => `'${s}'`).join(' ')}`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  const ran = readFileSync(join(dir, 'steps'), 'utf8').trim().split('\n')
  return { code: r.status, runs: Number(readFileSync(join(dir, 'n'), 'utf8')), steps: ran, log: r.stdout }
}

test('tests that ran out of time on a busy Mac run once more before a cycle gives up its pages', () => {
  const again = verify(['Error: Test timed out in 30000ms.', 'ok'])
  expect(again).toMatchObject({ code: 0, runs: 2 })
  expect(again.log).toContain('LOG tests ran out of time on a busy Mac')
  // A test that fails for another reason fails the cycle at once; one that runs out of time twice, after the second run.
  expect(verify(['AssertionError: expected 1 to be 2', 'ok'])).toMatchObject({ code: 1, runs: 1 })
  expect(verify(['Error: Test timed out in 30000ms.', 'Error: Test timed out in 30000ms.'])).toMatchObject({ code: 1, runs: 2 })
})

test('only the step that ran out of time runs again: the build before it passed, and a second one would take hours', () => {
  // 2026-11-07: the pages part's tests ran out of time, and their second run queued the whole build again.
  const steps = ['I18N_LENIENT=1 pnpm build', 'pnpm test']
  expect(verify(['ok', 'Error: Test timed out in 30000ms.', 'ok'], steps)).toMatchObject({ code: 0, runs: 3, steps: [steps[0], steps[1], steps[1]] })
  // A failed build stops the checks there: no tests run on it, and nothing runs again.
  expect(verify(['[ERROR] build failed', 'ok'], steps)).toMatchObject({ code: 1, runs: 1, steps: [steps[0]] })
  // One more run a cycle: tests that ran out of time again fail it.
  expect(verify(['ok', 'Error: Test timed out in 30000ms.', 'Error: Test timed out in 30000ms.'], steps)).toMatchObject({ code: 1, runs: 3 })
})

test('the engine cycle checks through verify before every publish, with the steps its commit needs', () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  expect(cycle).toContain('source "$REPO/scripts/cycle-checks.sh"')
  // Its content, and again after a merge in push(): the same steps (verify_cycle), the build with I18N_LENIENT.
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
