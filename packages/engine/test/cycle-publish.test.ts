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
  expect(cycle).toMatch(/rebase -X theirs; then\n\s*replan_merged "\$clash"\n\s*sweep_merged\n\s*verify_cycle/)
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

// The chief of staff, 2026-11-12: a photo taken off on main can come back for a cycle on a page the run also changed,
// through a pull at the push that doesn't clash (merge-entity.mjs keeps an item one side changed).
test("a clean pull that brings main's commits in is swept before the push, and the tests run again only when the sweep changed something", () => {
  expect(script('engine-cycle.sh')).toMatch(/elif ! swept_pull "\$main"; then\n\s*verify_cycle \|\|/)
  for (const f of ['video-cycle.sh', 'video-recheck.sh']) expect(script(f)).toMatch(/elif ! swept_pull "\$main"; then\n\s*verify 'pnpm test' \|\|/)
  expect(script('cycle-checks.sh')).toMatch(/\[ "\$\(git rev-parse origin\/main 2>\/dev\/null\)" = "\$main" \] \|\| check=1\n\s*if \[ -n "\$check" \]; then\n\s*sweep_merged/)

  const dir = mkdtempSync(join(tmpdir(), 'aq-pulled-'))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/pnpm'), '#!/bin/sh\necho swept >> ../swept.log\n[ -z "$FIXES" ] || echo fixed > content/b.json\n')
  chmodSync(join(dir, 'bin/pnpm'), 0o755)
  const sh = (command: string, cwd = dir, env = {}) => execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8', env: { ...process.env, ...env, PATH: `${dir}/bin:${process.env.PATH}` } })
  const repo = join(dir, 'repo'), other = join(dir, 'other')
  sh('git init -q --bare origin.git && git clone -q origin.git repo 2>/dev/null')
  sh('git config user.email a@example.com && git config user.name a && mkdir content sources engine-state docs docs/review && touch sources/a engine-state/a docs/review/a && echo a > content/a.json && git add . && git commit -qm main && git push -q origin HEAD 2>/dev/null', repo)
  sh('git clone -q origin.git other 2>/dev/null && cd other && git config user.email b@example.com && git config user.name b')
  sh('echo run > content/run.json && git add . && git commit -qm run', repo)
  const swept = () => { try { return readFileSync(join(dir, 'swept.log'), 'utf8').trim().split('\n').length } catch { return 0 } }
  const pull = (env = {}) => sh(`log() { :; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; main=$(git rev-parse '@{u}'); git pull -q --rebase 2>/dev/null; swept_pull "$main" && echo push || echo test`, repo, env).trim()
  const onMain = (file: string) => sh(`echo x > content/${file} && git add . && git commit -qm ${file} && git push -q 2>/dev/null`, other)

  expect(pull()).toBe('push') // main didn't move: no sweep
  expect(swept()).toBe(0)
  onMain('m1.json')
  expect(pull()).toBe('push') // main moved, the sweep found nothing: the push goes ahead
  expect(swept()).toBe(1)
  expect(sh('git log --format=%s', repo).trim().split('\n')).toEqual(['run', 'm1.json', 'main'])
  onMain('m2.json')
  expect(pull({ FIXES: '1' })).toBe('test') // the sweep changed something: committed, and the tests run again
  expect(swept()).toBe(2)
  expect(sh('git log --format=%s', repo).trim().split('\n')).toEqual(['content: sweep on main as it is now', 'run', 'm2.json', 'm1.json', 'main'])
  expect(sh('git status --porcelain', repo).trim()).toBe('')
})

// The photos part of 2026-11-08: its calendar clashed with an editor's re-plan, and the line-by-line merge named one guide
// on two days running.
test("after a clash in the calendar it is main's calendar, planned again, never a blend of two plans", () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-replan-'))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/pnpm'), '#!/bin/sh\n[ "$1 $2" = "engine curate" ] || exit 0\nx=$(cat content/curation.json); echo "$x, planned" > content/curation.json\n')
  chmodSync(join(dir, 'bin/pnpm'), 0o755)
  const sh = (command: string, cwd = dir) => execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8', env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` } })
  sh('git init -q --bare origin.git && git clone -q origin.git repo 2>/dev/null')
  const repo = join(dir, 'repo')
  sh('git config user.email a@example.com && git config user.name a && mkdir content && echo main > content/curation.json && git add . && git commit -qm main && git push -q origin HEAD 2>/dev/null', repo)
  sh('echo mine > content/curation.json && git commit -qam cycle', repo)
  const replan = (clash: string) => sh(`log() { echo "$*"; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; replan_merged '${clash}'`, repo)
  replan('content/gallery/a.json')
  expect(sh('git rev-list --count HEAD', repo).trim()).toBe('2')
  replan('content/gallery/a.json content/curation.json')
  expect(readFileSync(join(repo, 'content/curation.json'), 'utf8').trim()).toBe('main, planned')
  expect(sh('git rev-list --count HEAD', repo).trim()).toBe('3')
  expect(sh('git status --porcelain', repo).trim()).toBe('')
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
