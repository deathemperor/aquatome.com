import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const script = readFileSync(new URL('../../../scripts/engine-cycle.sh', import.meta.url), 'utf8')

// The steps from the metric step to the gate, run with pnpm stood in for: the engine steps that ran, in order.
function stepsRun(github: boolean) {
  const from = script.indexOf('pnpm engine metric')
  const to = script.indexOf('gate_or_keep "content: engine $PART"')
  expect(from).toBeGreaterThan(-1)
  expect(to).toBeGreaterThan(from)
  const dir = mkdtempSync(join(tmpdir(), 'aq-menders-'))
  const r = spawnSync('bash', ['-c', `set -euo pipefail\nlog() { :; }\npnpm() { echo "$2" >> "${dir}/ran"; }\n${script.slice(from, to)}`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_ACTIONS: github ? 'true' : '' },
  })
  expect(r.status, r.stderr).toBe(0)
  return readFileSync(join(dir, 'ran'), 'utf8').trim().split('\n')
}

test('the two menders run on the Mac alone: a cloud cycle beside a Mac cycle would mend the same pages and read them twice', () => {
  // The chief of staff, 2026-11-12: the source figures' and the units' menders on the Mac only; the sweep runs on both.
  expect(stepsRun(false)).toEqual(['metric', 'source-figures', 'sweep', 'units-mend'])
  expect(stepsRun(true)).toEqual(['metric', 'sweep'])
})
