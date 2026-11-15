import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { RUN_SCRATCH, runScratch } from '../src/test-scratch'

// The chief of staff, 15 Nov 2026: tests had left 718,000 folders, about 78 GB, in the system temp folder.
test("this run's scratch is a folder of its own, which goes when the run ends", () => {
  expect(basename(tmpdir())).toMatch(new RegExp(`^${RUN_SCRATCH}`))
})

test("a run's folder takes the temp folder's place, and goes with all it holds when the run ends", () => {
  const parent = mkdtempSync(join(tmpdir(), 'scratch-'))
  const env: NodeJS.ProcessEnv = {}
  const { dir, end } = runScratch(parent, env)
  expect([dirname(dir), env.TMPDIR, env.TMP, env.TEMP]).toEqual([parent, dir, dir, dir])
  mkdirSync(join(dir, 'gate-a1B2c3/content'), { recursive: true })
  writeFileSync(join(dir, 'gate-a1B2c3/content/x.json'), '{}')
  end()
  expect(existsSync(dir)).toBe(false)
})
