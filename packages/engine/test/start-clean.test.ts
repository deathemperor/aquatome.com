import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slow } from '@aq/schema/test-time'
import { expect, test } from 'vitest'
import { LIVE_RUN_SETTINGS } from './start-clean'

const ENGINE = fileURLToPath(new URL('..', import.meta.url))
const SCRIPTS = join(ENGINE, '../../scripts')

// A live run's settings, as the Mac's pages run had them on its second try on 13 Nov 2026.
const LIVE: Record<(typeof LIVE_RUN_SETTINGS)[number], string> = {
  AQ_ASLEEP0: '100000',
  AQ_SCRIPT_HEAD: '0'.repeat(40),
  CLAUDE_CODE_OAUTH_TOKENS: 'a live run token',
  VITEST_MAX_WORKERS: '2',
  pnpm_config_workspace_concurrency: '1',
  ENGINE_PROFILE: 'Default',
  ENGINE_MAX_MINUTES: '150',
  SKIP_VIDEOS: '1',
}

// The chief of staff, 13 Nov 2026: every Mac engine run from 18:20 failed its checks on these two files, which passed on
// GitHub. Run here as a live run's second try runs them: its settings around them, a worker cap of two.
test("the tests that failed every Mac run on 13 Nov pass with a live run's settings around them", () => {
  const outside = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')))
  const r = spawnSync(process.execPath, [join(ENGINE, 'node_modules/vitest/vitest.mjs'), 'run', 'test/test-time-scale.test.ts', 'test/cycle-net.test.ts'], {
    cwd: ENGINE,
    encoding: 'utf8',
    env: { ...outside, ...LIVE },
  })
  expect(r.status, r.stdout + r.stderr).toBe(0)
}, slow(120_000))

// One complaint, a check over all: a setting the next change has a run export, or set for the tests it runs, is on the
// list, or kept on purpose here.
test('every setting a live run sets for the tests it runs is on the list', () => {
  const read = (f: string) => readFileSync(join(SCRIPTS, f), 'utf8')
  const set = new Set<string>()
  for (const f of ['engine-cycle.sh', 'cycle-checks.sh']) {
    for (const m of read(f).matchAll(/\bexport\s+([A-Za-z_]\w*)/g)) set.add(m[1]!)
    for (const m of read(f).matchAll(/\b([A-Za-z_]\w*)=\S*\s+checks\b/g)) set.add(m[1]!)
  }
  for (const m of read('install-engine-schedule.sh').matchAll(/<key>([A-Z_]+)<\/key><string>/g)) set.add(m[1]!)
  // PATH: the run's node. AQ_TEST_TIME_SCALE: the tests' own limits, and verify sets it again for each step it checks.
  // ENGINE_COST_LOG: vitest.config.ts sets it to off.
  const kept = ['PATH', 'AQ_TEST_TIME_SCALE', 'ENGINE_COST_LOG']
  const listed: readonly string[] = LIVE_RUN_SETTINGS
  expect([...set].filter(name => !kept.includes(name) && !listed.includes(name)).sort()).toEqual([])
  expect(Object.keys(LIVE).sort()).toEqual([...LIVE_RUN_SETTINGS].sort())
})
