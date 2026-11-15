import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { expect, test } from 'vitest'
import { RUN_SCRATCH } from '@aq/schema/test-scratch'

// The chief of staff, 15 Nov 2026: the engine's tests made most of the 718,000 folders left in the temp folder (gate.test.ts
// alone 35,000, about 30 GB). Each run's scratch is one folder that goes when the run ends (vitest.config.ts).
test("this run's scratch is a folder of its own, for the tests and for every program they start", () => {
  expect(basename(tmpdir())).toMatch(new RegExp(`^${RUN_SCRATCH}`))
  expect(execFileSync('sh', ['-c', 'printf %s "$TMPDIR"'], { encoding: 'utf8' })).toBe(tmpdir())
})
