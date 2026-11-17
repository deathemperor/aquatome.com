import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { heldMendsOf } from '../src/gate'

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

test('the units mender, the held video guides\' cut and the source figures run in the Mac\'s photos part alone: another part or a cloud cycle beside it would mend the same pages and read them twice', () => {
  // The chief of staff, 2026-11-12: the menders on the Mac only. The Mac's parts overlap, so one part of them.
  expect(stepsRun('photos', false)).toEqual(expect.arrayContaining(['source-figures', 'units-mend']))
  for (const [part, github] of [['pages', false], ['sf', false], ['rewrite', true]] as const) {
    expect(stepsRun(part, github), part).not.toContain('units-mend')
    expect(stepsRun(part, github), part).not.toContain('source-figures')
  }
  // The held video guides' cut goes first, so the units mend takes a guide it left held for units alone (15 Nov 2026).
  const photos = stepsRun('photos', false)
  expect(photos.indexOf('video-cut')).toBeGreaterThan(-1)
  expect(photos.indexOf('video-cut')).toBeLessThan(photos.indexOf('units-mend'))
  for (const [part, github] of [['pages', false], ['sf', false], ['rewrite', true]] as const) expect(stepsRun(part, github), part).not.toContain('video-cut')
  // The steps around it run in every part.
  for (const part of ['photos', 'pages', 'rewrite']) expect(stepsRun(part, part === 'rewrite')).toEqual(expect.arrayContaining(['metric', 'sweep']))
})

test("the held video guides go to their editor in the Mac's videos part alone, at most 4 held and 2 new or live a run", () => {
  // The chief of staff, 15 Nov 2026: two rounds' 83 held mends from five parts went to 27 guides. 16 Nov 2026: 4 held and 2
  // new a run, in place of 24 and 20, as the editor's rewrites under the gate's name ended the Mac's day at 21:50.
  const read = (f: string) => readFileSync(new URL(`../../../scripts/${f}`, import.meta.url), 'utf8')
  const videos = read('video-cycle.sh')
  const gate = videos.indexOf('gate_or_keep "content: videos"')
  for (const line of ['export GATE_HELD_MENDS="${GATE_HELD_MENDS:-4}"', 'export GATE_MENDS="${GATE_MENDS:-2}"']) {
    const at = videos.indexOf(line)
    expect(at, line).toBeGreaterThan(-1)
    expect(at, line).toBeLessThan(gate)
  }
  for (const f of ['engine-cycle.sh', 'video-recheck.sh', 'cycle-checks.sh']) expect(read(f), f).not.toMatch(/GATE_HELD_MENDS/)
  expect(heldMendsOf({})).toBe(0)
  expect(heldMendsOf({ GATE_HELD_MENDS: '4' })).toBe(4)
  // The figures the gate runs with in the videos part, as its shell sets them, and a job's own setting over them.
  const run = (env: Record<string, string>) => spawnSync('bash', ['-c', `${videos.split('\n').filter(l => /^export GATE_(HELD_)?MENDS=/.test(l)).join('\n')}\necho "$GATE_HELD_MENDS $GATE_MENDS"`], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }).stdout.trim()
  expect(run({})).toBe('4 2')
  expect(run({ GATE_HELD_MENDS: '0', GATE_MENDS: '0' })).toBe('0 0')
  // The gate takes its new and live mends from GATE_MENDS (cli.ts), so the setting reaches it.
  expect(readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8')).toContain('process.env.GATE_MENDS')
})
