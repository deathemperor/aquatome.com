import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const CHECKS = join(fileURLToPath(new URL('../../..', import.meta.url)), 'scripts/cycle-checks.sh')

// verify with `checks`, `calm`, the cores heat has taken and the 5-minute load stood in for (as in cycle-kept.test.ts):
// each run records the time scale its tests got and the vitest workers it was allowed, and passes when the next of `runs`
// is "ok". `load`: "<5-minute load> <cores>", or "" where there's no reading.
function scales(taken: number, runs: string[], github = false, load = '0 16') {
  const dir = mkdtempSync(join(tmpdir(), 'aq-time-scale-'))
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    log() { echo "LOG $*"; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    cores_taken() { echo ${taken}; }; load5() { echo '${load}'; }
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() { local r="\${runs[$n]}"; n=$((n + 1)); echo "scale=\${AQ_TEST_TIME_SCALE:-unset}" >&3; bash -c 'echo "workers=\${VITEST_MAX_WORKERS:-unset}"' >&3; echo "$r"; [ "$r" = ok ]; }
    verify 'pnpm test' 3>&1 || true; echo "TIMED_OUT=$TIMED_OUT"`], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: github ? 'true' : '' } })
  const lines = r.stdout.trim().split('\n')
  return { scales: lines.filter(l => /^scale=|^LOG (cores|a busy)/.test(l)), workers: lines.filter(l => l.startsWith('workers=')), timedOut: lines.includes('TIMED_OUT=1') }
}

// The chief of staff, 13 November: with heat taking 4 of the Mac's 12 cores, three engine cycles in a day lost their
// checks to the clock, tests with a 30 s limit running 100–180 s. The gate gives them 6 times their limits then, and on
// a check's second try; on a Mac at full strength, their own.
test("tests get their usual limits on a Mac at full strength, 6 times those while heat has taken cores away", () => {
  expect(scales(0, ['ok']).scales).toEqual(['scale=1'])
  expect(scales(4, ['ok']).scales).toEqual(['LOG cores taken away by heat: tests get 6 times their time', 'scale=6'])
})

// The night of 13 November: the first tries ran on a Mac with every core at work and a 5-minute load past one a core,
// at their own limits, and ran out of time. A load of one a core or more gives them 6 times their limits too; GitHub's
// runners are machines of their own, whose load is their own steps'.
test('tests get 6 times their limits on a busy Mac too, its 5-minute load at one a core or more, heat or none', () => {
  expect(scales(0, ['ok'], false, '16 16').scales).toEqual(['LOG a busy Mac, its 5-minute load 16 on 16 cores: tests get 6 times their time', 'scale=6'])
  expect(scales(0, ['ok'], false, '15 16').scales).toEqual(['scale=1'])
  expect(scales(0, ['ok'], false, '').scales).toEqual(['scale=1'])
  expect(scales(0, ['ok'], true, '40 16').scales).toEqual(['scale=1'])
  // Heat is said first: it's the cause the owner can see on the Mac's status.
  expect(scales(4, ['ok'], false, '40 16').scales).toEqual(['LOG cores taken away by heat: tests get 6 times their time', 'scale=6'])
})

test("a check's second try on the Mac gives its tests 6 times their limits, cool Mac or not; GitHub's keeps its own", () => {
  expect(scales(0, ['Error: Test timed out in 30000ms.', 'ok']).scales).toEqual(['scale=1', 'scale=6'])
  // engine.yml runs the same gate on a runner of its own, with no heat.
  const github = scales(0, ['Error: Test timed out in 30000ms.', 'ok'], true)
  expect(github.scales).toEqual(['scale=1', 'scale=1'])
  expect(github.workers).toEqual(['workers=unset', 'workers=unset'])
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

// ran_out over a check's output: whether verify reads it as tests out of time.
function ranOut(output: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-ran-out-'))
  writeFileSync(join(dir, 'test.log'), output)
  return spawnSync('bash', ['-c', `set -euo pipefail; log() { :; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; ran_out 0`]).status === 0
}

// 13 November, 22:36 and 23:35: a test that failed on its own quoted "Test timed out in" in its source, which vitest
// prints under the failure, and the run's work was kept for ever as out of time instead of held. The source lines come
// numbered, coloured, and under pnpm's prefix; a real time-out's line is never one of them.
test("a failing test's source that quotes a time-out isn't a time-out; a real one, with the same prefix and colours, is", () => {
  const grey = (x: string) => `\u001b[90m${x}\u001b[39m`
  const frame = [
    'packages/engine test:  FAIL  test/cycle-timeouts.test.ts > tests that ran out of time on a busy Mac run once more',
    'packages/engine test: AssertionError: expected { code: 1, runs: 2 } to match object { code: 0, runs: 2 }',
    'packages/engine test:  ❯ test/cycle-timeouts.test.ts:41:17',
    `packages/engine test:     ${grey('39|')} test('tests that ran out of time on a busy Mac run once more', () => {`,
    `packages/engine test:     ${grey('40|')}   const again = verify(['Error: Test timed out in 30000ms.', 'ok'])`,
    `packages/engine test:     ${grey('41|')}   expect(again).toMatchObject({ code: 0, runs: 2 })`,
    `packages/engine test:       ${grey('|')}                 ^`,
    `    42|   expect(verify(['Error: Hook timed out in 120000ms.'])).toBe(1)`,
  ].join('\n')
  expect(ranOut(frame)).toBe(false)
  expect(ranOut(`${frame}\npackages/engine test: Error: Test timed out in 30000ms.`)).toBe(true)
  expect(ranOut(`packages/engine test: ${grey('Error: Hook timed out in 120000ms.')}`)).toBe(true)
  expect(ranOut('Error: [vitest-pool]: Timeout starting forks runner.')).toBe(true)
})
