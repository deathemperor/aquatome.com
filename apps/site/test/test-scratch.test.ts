import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { expect, test } from 'vitest'
import { RUN_SCRATCH } from '@aq/schema/test-scratch'

// The chief of staff, 15 Nov 2026: tests had left 718,000 folders in the temp folder. Each run's scratch is one folder that
// goes when the run ends (vitest.config.ts).
test("this run's scratch is a folder of its own, which goes when the run ends", () => {
  expect(basename(tmpdir())).toMatch(new RegExp(`^${RUN_SCRATCH}`))
})
