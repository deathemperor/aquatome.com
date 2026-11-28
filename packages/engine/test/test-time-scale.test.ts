import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
// and 25 of the schema's 28 files had none in time. The second try starts two at a time. The first starts four, at night
// too (the owner, 16 Nov 2026: "you are killing the machine"; the chief of staff's cap); GitHub's runner, its own number.
test("a check's first try on the Mac starts four vitest workers at a time, its second two; GitHub's its usual number", () => {
  expect(scales(0, ['Error: [vitest-pool-runner]: Timeout waiting for worker to respond', 'ok']).workers).toEqual(['workers=4', 'workers=2'])
  expect(scales(0, ['ok']).workers).toEqual(['workers=4'])
  expect(scales(0, ['ok'], true).workers).toEqual(['workers=unset'])
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

test('the two failed tries keep separate output after a later check reuses the working log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-check-failures-'))
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    TEST_LOG="$1/engine-test.log"; TEST_FAILURES_DIR="$1/failed"
    source "$2"
    log() { echo "$*"; }; calm() { :; }; settled() { :; }; slow_mac() { :; }
    calls=0
    checks() {
      calls=$((calls + 1))
      case "$calls" in
        1) echo "passed setup" ;;
        2) echo "FAIL test/first.test.ts > first"; return 1 ;;
        3) echo "FAIL test/retry.test.ts > retry"; return 1 ;;
        *) echo "passed later" ;;
      esac
    }
    if verify setup check; then exit 3; fi
    verify next`, 'test', dir, CHECKS], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } })
  expect(r.status, r.stderr).toBe(0)
  expect(readFileSync(join(dir, 'engine-test.log'), 'utf8')).toBe('passed later\n')
  const files = readdirSync(join(dir, 'failed')).sort()
  expect(files).toHaveLength(2)
  expect(files[0]).toContain('.try-1.')
  expect(files[1]).toContain('.try-2.')
  expect(files.map(file => readFileSync(join(dir, 'failed', file), 'utf8'))).toEqual([
    'FAIL test/first.test.ts > first\n',
    'FAIL test/retry.test.ts > retry\n',
  ])
  for (const file of files) expect(r.stdout).toContain(join(dir, 'failed', file))
})

test('a failed archive prints the failed attempt before retry replaces the working log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-check-fallback-'))
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    TEST_LOG="$1/engine-test.log"; TEST_FAILURES_DIR="$1/failed"
    touch "$TEST_FAILURES_DIR"
    source "$2"
    log() { echo "$*"; }; calm() { :; }; settled() { :; }; slow_mac() { :; }
    calls=0
    checks() {
      calls=$((calls + 1))
      if [ "$calls" = 1 ]; then echo "failed check output"; return 1; fi
      echo "passed check output"
    }
    verify check
    verify next`, 'test', dir, CHECKS], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } })
  expect(r.status, r.stderr).toBe(0)
  expect(r.stdout).toContain('failed check output')
  expect(r.stdout).not.toContain('passed check output')
  expect(readFileSync(join(dir, 'engine-test.log'), 'utf8')).toBe('passed check output\n')
})

// ran_out over a check's output: whether verify reads it as tests out of time.
function ranOut(output: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-ran-out-'))
  writeFileSync(join(dir, 'test.log'), output)
  return spawnSync('bash', ['-c', `set -euo pipefail; log() { :; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; ran_out 0`]).status === 0
}

// The tests verify names as failed: failed_tests over a check's output.
function failedTests(output: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-failed-'))
  writeFileSync(join(dir, 'test.log'), output)
  return spawnSync('bash', ['-c', `set -euo pipefail; log() { :; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; failed_tests 0`], { encoding: 'utf8' }).stdout.trim()
}

// A content run's short step (CONTENT_STEP, cycle-checks.sh) runs each package's test:content script, and pnpm prefixes its
// lines "<package> test:content: ": read as the whole suite's, or a time-out there would hold the work instead of keeping it.
test('the short step\'s output reads as the whole suite\'s: its time-outs are time-outs, its failed tests named', () => {
  for (const prefix of ['packages/engine test: ', 'packages/engine test:content: ']) {
    expect(ranOut(`${prefix}Error: Test timed out in 30000ms.`), prefix).toBe(true)
    expect(ranOut(`${prefix}AssertionError: expected 'Error: Test timed out in 30000ms.' to equal 'ok'`), prefix).toBe(false)
    expect(failedTests(`${prefix} FAIL  test/a.test.ts > keeps its order`), prefix).toBe('test/a.test.ts > keeps its order')
  }
})

// 13 November, 22:36 and 23:35: a test that failed on its own quoted "Test timed out in" in its source, which vitest
// prints under the failure, and the run's work was kept for ever as out of time instead of held. Only vitest's own line
// counts, at the start of a line after pnpm's prefix, colours off: never a quote of one in an assertion, a diff, a test's
// title, a stack line or the source.
test("only vitest's own time-out line is a time-out: a failing test that quotes one, anywhere, isn't", () => {
  const grey = (x: string) => `\u001b[90m${x}\u001b[39m`
  const red = (x: string) => `\u001b[31m${x}\u001b[39m`
  const quoted = [
    'packages/engine test:  FAIL  test/cycle-timeouts.test.ts > Error: Test timed out in 30000ms. runs once more',
    'packages/engine test:    × test/cycle-timeouts.test.ts > Error: Hook timed out in 120000ms. is a time-out 12ms',
    "packages/engine test: AssertionError: expected 'Error: Test timed out in 30000ms.' to equal 'ok'",
    'packages/engine test: - Error: Test timed out in 30000ms.',
    'packages/engine test: + Error: [vitest-pool]: Timeout starting forks runner.',
    'packages/engine test:   Error: Test timed out in 30000ms.',
    'packages/engine test:     at Object.<anonymous> (Error: Test timed out in 30000ms.)',
    `packages/engine test:     ${grey('40|')}   const again = verify(['Error: Test timed out in 30000ms.', 'ok'])`,
    `packages/engine test:       ${grey('|')}                 ^`,
    `    42|   expect(verify(['Error: Hook timed out in 120000ms.'])).toBe(1)`,
    "Error: expected 'Error: Test timed out in 30000ms.' to be 'ok'",
  ]
  for (const line of quoted) expect(ranOut(line), line).toBe(false)
  expect(ranOut(quoted.join('\n'))).toBe(false)
  // vitest's own, as the Mac's logs have them, alone or after a failure that quotes one.
  for (const line of ['packages/engine test: Error: Test timed out in 30000ms.', `packages/engine test: ${red('Error')}: Hook timed out in 120000ms.`,
    'Error: Test timed out in 30000ms.', 'Error: [vitest-pool-runner]: Timeout waiting for worker to respond', 'Error: [vitest-pool]: Timeout starting forks runner.']) {
    expect(ranOut(line), line).toBe(true)
    expect(ranOut(`${quoted.join('\n')}\n${line}`), line).toBe(true)
  }
  // vitest's whole output, colours and all, from the version the engine pins (5.0.5, 14 Nov), written to a file as the
  // cycle's log is: a test out of time and a hook out of time, each run alone (`pnpm exec vitest run <file>`, the engine's)
  // and through pnpm's recursive run (`pnpm -r --stream`, the schema's), whose "<package> test: " prefix is the one the
  // cycle's `pnpm test` gives when packages run side by side (fixtures/vitest-timeouts/; the checkout's folder is <repo>).
  for (const name of ['test-bare', 'hook-bare', 'test-recursive', 'hook-recursive']) {
    const out = readFileSync(fileURLToPath(new URL(`fixtures/vitest-timeouts/${name}.log`, import.meta.url)), 'utf8')
    expect(out, name).toMatch(/(Test|Hook) timed out in 100ms\./)
    expect(ranOut(out), name).toBe(true)
    expect(ranOut(`${quoted.join('\n')}\n${out}`), name).toBe(true)
  }
})
