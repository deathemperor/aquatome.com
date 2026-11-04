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

// verify (scripts/cycle-checks.sh) with `checks` stood in for: each run prints the next of `runs` and fails unless it
// prints "ok". Returns verify's exit code, how many times the checks ran, and what the cycle logged.
function verify(runs: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-verify-'))
  const script = `
    log() { echo "LOG $*"; }
    TEST_LOG="${dir}/test.log"
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() { echo "\${runs[$n]}"; local r="\${runs[$n]}"; n=$((n + 1)); echo $n > "${dir}/n"; [ "$r" = ok ]; }
    verify 'pnpm build && pnpm test'`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  return { code: r.status, runs: Number(readFileSync(join(dir, 'n'), 'utf8')), log: r.stdout }
}

test('tests that ran out of time on a busy Mac run once more before a cycle gives up its pages', () => {
  const again = verify(['Error: Test timed out in 30000ms.', 'ok'])
  expect(again).toMatchObject({ code: 0, runs: 2 })
  expect(again.log).toContain('LOG tests ran out of time on a busy Mac')
  // A test that fails for another reason fails the cycle at once; one that runs out of time twice, after the second run.
  expect(verify(['AssertionError: expected 1 to be 2', 'ok'])).toMatchObject({ code: 1, runs: 1 })
  expect(verify(['Error: Test timed out in 30000ms.', 'Error: Test timed out in 30000ms.'])).toMatchObject({ code: 1, runs: 2 })
})

test('the engine cycle checks through verify before every publish', () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  expect(cycle).toContain('source "$REPO/scripts/cycle-checks.sh"')
  expect(cycle.match(/\bverify '/g)).toHaveLength(2)
  expect(cycle).not.toMatch(/\bchecks '/)
})
