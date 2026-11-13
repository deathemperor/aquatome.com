import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const CHECKS = join(fileURLToPath(new URL('../../..', import.meta.url)), 'scripts/cycle-checks.sh')

// verify with `checks`, `calm` and the cores heat has taken stood in for (as in cycle-kept.test.ts): each run records the
// time scale its tests got and the vitest workers it was allowed, and passes when the next of `runs` is "ok".
function scales(taken: number, runs: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-time-scale-'))
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    log() { echo "LOG $*"; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    cores_taken() { echo ${taken}; }
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() { local r="\${runs[$n]}"; n=$((n + 1)); echo "scale=\${AQ_TEST_TIME_SCALE:-unset}" >&3; bash -c 'echo "workers=\${VITEST_MAX_WORKERS:-unset}"' >&3; echo "$r"; [ "$r" = ok ]; }
    verify 'pnpm test' 3>&1 || true; echo "TIMED_OUT=$TIMED_OUT"`], { encoding: 'utf8' })
  const lines = r.stdout.trim().split('\n')
  return { scales: lines.filter(l => /^scale=|^LOG cores/.test(l)), workers: lines.filter(l => l.startsWith('workers=')), timedOut: lines.includes('TIMED_OUT=1') }
}

// The chief of staff, 13 November: with heat taking 4 of the Mac's 12 cores, three engine cycles in a day lost their
// checks to the clock, tests with a 30 s limit running 100–180 s. The gate gives them 6 times their limits then, and on
// a check's second try; on a Mac at full strength, their own.
test("tests get their usual limits on a Mac at full strength, 6 times those while heat has taken cores away", () => {
  expect(scales(0, ['ok']).scales).toEqual(['scale=1'])
  expect(scales(4, ['ok']).scales).toEqual(['LOG cores taken away by heat: tests get 6 times their time', 'scale=6'])
})

test("a check's second try gives its tests 6 times their limits, cool Mac or not", () => {
  expect(scales(0, ['Error: Test timed out in 30000ms.', 'ok']).scales).toEqual(['scale=1', 'scale=6'])
})

// That photos run's second try (16:25) ran no test at all: vitest gives a worker 60 s to start, a limit no setting raises,
// and 25 of the schema's 28 files had none in time. The second try starts two at a time; the first, as many as vitest likes.
test("a check's second try starts two vitest workers at a time, and the first its usual number", () => {
  expect(scales(0, ['Error: [vitest-pool-runner]: Timeout waiting for worker to respond', 'ok']).workers).toEqual(['workers=unset', 'workers=2'])
})

// Out of time twice keeps the run's work for the next run to publish (TIMED_OUT, keep_unpublished); a check that fails
// for anything else drops it. A hook or a worker out of time is as much the Mac's load as a test is.
test('a hook out of time, or a worker that did not start in time, counts as out of time as a test does', () => {
  for (const out of ['Error: Hook timed out in 120000ms.', 'Error: [vitest-pool-runner]: Timeout waiting for worker to respond',
    'Error: [vitest-pool]: Timeout starting forks runner.', 'Error: Test timed out in 30000ms.']) {
    expect(scales(0, [out, out]).timedOut, out).toBe(true)
  }
  expect(scales(0, ['AssertionError: expected 1 to be 2', 'AssertionError: expected 1 to be 2']).timedOut).toBe(false)
})
