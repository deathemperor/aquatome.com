import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/engine-due.sh')

/**
 * The Mac's hourly starter with a stand-in for `gh`: the repository's ENGINE_EVERY_MINUTES (`every`, '' for none set),
 * how long ago the last cycle started (`minutes`, undefined for none in the last 30 runs), and whether `gh` fails when
 * asked for the setting. Says whether it started a cycle, and what it printed.
 */
const due = (o: { every: string; minutes?: number; ghFails?: boolean }) => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-due-'))
  writeFileSync(join(dir, 'gh'), `#!/bin/sh
case "$1 $2" in
  "variable list") ${o.ghFails ? 'echo "HTTP 502" >&2; exit 1' : `printf '%s\\n' '${o.every}'`} ;;
  "run list") ${o.minutes === undefined ? ':' : `echo ${o.minutes * 60}`} ;;
  "workflow run") echo started > '${dir}/started' ;;
  *) echo "unexpected: gh $*" >&2; exit 2 ;;
esac
`)
  chmodSync(join(dir, 'gh'), 0o755)
  const r = spawnSync('bash', [SCRIPT], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: 'utf8' })
  return { started: existsSync(join(dir, 'started')), out: r.stdout, status: r.status }
}
/** The pace engine.yml's own job uses when no setting is made: the one figure, and it is the workflow's. */
const workflowDefault = Number(/\$\{EVERY:-(\d+)\}/.exec(readFileSync(join(ROOT, '.github/workflows/engine.yml'), 'utf8'))![1])

// 7 to 11 Nov 2026: the repository's setting said a cycle every 350 minutes, to halve what the rewrite spent. The starter
// went by its own 170, and a run it starts is started by hand, which skips the workflow's check: 43 cycles, 9 or 10 a
// day where the setting allows 4, 29 of them started from here.
test('the starter goes by the repository\'s pace, not one of its own', () => {
  expect(due({ every: '350', minutes: 180 }).started).toBe(false)
  expect(due({ every: '350', minutes: 349 }).started).toBe(false)
  const late = due({ every: '350', minutes: 350 })
  expect(late.started).toBe(true)
  expect(late.out).toContain('every 350 min')
  expect(due({ every: '60', minutes: 61 }).started).toBe(true)
  expect(due({ every: '350' }).started).toBe(true) // none in the last 30 runs is overdue
})

test('with no setting made it goes by the default written in engine.yml, the one the workflow\'s job uses', () => {
  expect(workflowDefault).toBeGreaterThan(0)
  expect(due({ every: '', minutes: workflowDefault - 1 }).started).toBe(false)
  expect(due({ every: '', minutes: workflowDefault }).started).toBe(true)
})

test('with no pace to go by, nothing starts: a setting that is not a number, or one that cannot be read', () => {
  const odd = due({ every: 'often', minutes: 9999 })
  expect(odd.started).toBe(false)
  expect(odd.out).toContain('not started')
  const down = due({ every: '350', minutes: 9999, ghFails: true })
  expect(down.started).toBe(false)
  expect(down.status).not.toBe(0)
})

test('the starter has no figure of its own for the pace', () => {
  const s = readFileSync(SCRIPT, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')
  expect(s).toContain('ENGINE_EVERY_MINUTES')
  expect(s).not.toMatch(/\b(170|350)\b/)
  expect(s).not.toMatch(/-ge \$\(\(\s*\d+ \* 60/)
})
