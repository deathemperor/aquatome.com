import { execSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// The sf and pages runs of 2026-11-07: main's new card figures met their summaries at the merge, past the cycle's only sweep.
test('a cycle sweeps again after each merge with main, before the tests', () => {
  const cycle = script('engine-cycle.sh')
  expect(cycle).toMatch(/\ncatch_up\nsweep_merged\nif ! verify_cycle/)
  expect(cycle).toMatch(/rebase -X theirs; then\n\s*sweep_merged\n\s*verify_cycle/)
  expect(script('video-cycle.sh')).toMatch(/rebase -X theirs; then\n\s*sweep_merged\n\s*verify 'pnpm test'/)
  expect(script('video-recheck.sh')).toMatch(/rebase -X theirs; then\n\s*sweep_merged\n\s*verify 'pnpm test'/)
})

test('what the sweep changes after a merge is committed, and no change leaves no commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-sweep-'))
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'repo/content'), { recursive: true })
  writeFileSync(join(dir, 'bin/pnpm'), '#!/bin/sh\n[ -z "$FIXES" ] || echo fixed > content/a.json\n')
  chmodSync(join(dir, 'bin/pnpm'), 0o755)
  const repo = join(dir, 'repo')
  const sh = (command: string, env = {}) => execSync(command, { cwd: repo, shell: '/bin/bash', encoding: 'utf8', env: { ...process.env, ...env, PATH: `${dir}/bin:${process.env.PATH}` } })
  sh('git init -q && git config user.email a@example.com && git config user.name a && mkdir -p sources engine-state docs/review && touch sources/a engine-state/a docs/review/a && echo old > content/a.json && git add . && git commit -qm first')
  const run = `log() { echo "$*"; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; sweep_merged`
  sh(run)
  expect(sh('git rev-list --count HEAD').trim()).toBe('1')
  sh(run, { FIXES: '1' })
  expect(sh('git rev-list --count HEAD').trim()).toBe('2')
  expect(sh('git status --porcelain').trim()).toBe('')
})

// The run of 2026-11-07 failed its tests with its work uncommitted, and the next run's reset dropped it.
test("a video run's work is committed before its tests, so a run that fails them can still be published", () => {
  const cycle = script('video-cycle.sh')
  expect(cycle.indexOf('git commit -q -m "content: videos')).toBeGreaterThan(0)
  expect(cycle.indexOf('git commit -q -m "content: videos')).toBeLessThan(cycle.indexOf("verify 'pnpm test'"))
})

// The re-check of 2026-11-08: its tests failed on a defect the sweep fixes, and its work, tested before it was committed,
// was left for the next run's reset to drop.
test("a video re-check sweeps its work and commits it before its tests, as the video job does", () => {
  const s = script('video-recheck.sh')
  const sweep = s.indexOf('pnpm engine sweep')
  const commit = s.indexOf('git commit -q -m "content: video guides checked again')
  expect(sweep).toBeGreaterThan(s.indexOf('pnpm engine videos --redo'))
  expect(commit).toBeGreaterThan(sweep)
  expect(commit).toBeLessThan(s.indexOf("verify 'pnpm test'"))
})
