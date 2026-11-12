import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const script = readFileSync(new URL('../../../scripts/engine-cycle.sh', import.meta.url), 'utf8')

// The steps from the metric step to the gate, run in one part on one machine with pnpm stood in for: the engine steps
// that ran, in order. GitHub runs the rewrite part alone (engine.yml); the Mac runs pages, sf and photos.
function stepsRun(part: string, github: boolean) {
  const from = script.indexOf('pnpm engine metric')
  const to = script.indexOf('gate_or_keep "content: engine $PART"')
  expect(from).toBeGreaterThan(-1)
  expect(to).toBeGreaterThan(from)
  const dir = mkdtempSync(join(tmpdir(), 'aq-menders-'))
  const r = spawnSync('bash', ['-c', `set -euo pipefail\nPART=${part}\npart() { [[ " $* " == *" $PART "* ]]; }\nlog() { :; }\npnpm() { echo "$2" >> "${dir}/ran"; }\n${script.slice(from, to)}`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_ACTIONS: github ? 'true' : '' },
  })
  expect(r.status, r.stderr).toBe(0)
  return readFileSync(join(dir, 'ran'), 'utf8').trim().split('\n')
}

test('the units mender runs in the Mac\'s photos part alone: another part or a cloud cycle beside it would mend the same pages and read them twice', () => {
  // The chief of staff, 2026-11-12: the menders on the Mac only. The Mac's parts overlap, so one part of them.
  expect(stepsRun('photos', false)).toContain('units-mend')
  for (const [part, github] of [['pages', false], ['sf', false], ['rewrite', true]] as const) {
    expect(stepsRun(part, github), part).not.toContain('units-mend')
  }
  // The steps around it run in every part.
  for (const part of ['photos', 'pages', 'rewrite']) expect(stepsRun(part, part === 'rewrite')).toEqual(expect.arrayContaining(['metric', 'sweep']))
})
