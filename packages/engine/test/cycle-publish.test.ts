import { execSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slow } from '@aq/schema/test-time'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// The sf and pages runs of 2026-11-07: main's new card figures met their summaries at the merge, past the cycle's only sweep.
test('a cycle sweeps again after each merge with main, before the tests', () => {
  const cycle = script('engine-cycle.sh')
  expect(cycle).toMatch(/\ncatch_up\nsweep_merged\nif ! verify_cycle/)
  // catch_up's clean pull brings main's holds first (main_holds), as push() does, before that sweep and those checks.
  expect(script('cycle-checks.sh')).toMatch(/if net git pull -q --rebase; then main_holds "\$run" \|\| true; return 0; fi/)
  expect(cycle).toMatch(/rebase -X theirs; then\n\s*replan_merged "\$clash"\n\s*main_holds "\$run" \|\| true\n\s*sweep_merged\n\s*verify_cycle/)
  expect(script('video-cycle.sh')).toMatch(/rebase -X theirs; then\n\s*main_holds "\$run" \|\| true\n\s*sweep_merged\n\s*verify_cycle/)
  expect(script('video-recheck.sh')).toContain('source scripts/video-recheck-publish.sh')
  expect(script('video-recheck-publish.sh')).toMatch(/main_holds "\$batch" "\$refreshed" \|\| true\n\s*if ! sweep_merged strict; then[\s\S]*\n\s*verify_cycle "\$tree" \|\| verification_failed=\$\?/)
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
  // Main's holds put back on a page main read meanwhile (main_holds, push-clash-hold.test.ts) are checked again too.
  for (const f of ['engine-cycle.sh', 'video-cycle.sh']) {
    expect(script(f)).toMatch(/main_holds "\$run" \|\| moved=1\n\s*if ! swept_pull "\$main" \|\| \[ -n "\$moved" \]; then\n\s*verify_cycle \|\|/)
  }
  // Kept work: after a pull that brought main's commits in, checked in full until it has passed; then swept, and checked
  // again only if the sweep changed more than the pages' dates or the migration failed, as a run's own push does, on that
  // one sweep.
  expect(script('cycle-checks.sh')).toMatch(/if \[ -n "\$\{calendar:-\}" \] \|\| \{ \[ "\$refreshed" != "\$main" \] && \[ -z "\$check" \]; \}; then\n\s*head=\$\(git rev-parse HEAD\)\n\s*sweep_merged "\$video_recheck" \|\| .*return 1; }\n\s*swept=1\n\s*if \[ -z "\$video_recheck" \]; then\n\s*if swept_clean "\$head" "\$main" "\$refreshed"; then/)
  expect(script('cycle-checks.sh')).toMatch(/\n\s*if \[ -n "\$check" \]; then\n\s*\[ -n "\$swept" \] \|\| sweep_merged/)

  const dir = mkdtempSync(join(tmpdir(), 'aq-pulled-'))
  mkdirSync(join(dir, 'bin'))
  // The sweep alone: the photo records' migration before it (sweep_merged) has nothing to do here.
  // The content's load passes unless BAD is set.
  writeFileSync(join(dir, 'bin/pnpm'), '#!/bin/sh\n[ "$2" = check-content ] && { echo dates >> ../dates.log; [ -z "$BAD" ]; exit; }\n[ "$2" = sweep ] || exit 0\necho swept >> ../swept.log\n[ -z "$FIXES" ] || echo "$FIXES" > content/b.json\n[ -z "$DATES" ] || echo "$DATES" > content/page-dates.json\n[ -z "$REPORT" ] || echo "$REPORT" > docs/review/photo-subjects.md\n[ -z "$NOANIMAL" ] || echo "$NOANIMAL" > engine-state/_photo-no-animal-heads.json\n[ -z "$LOOKALIKE" ] || echo "$LOOKALIKE" > docs/review/photo-subjects.md.bak\n')
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
  // The chief of staff, 15 Nov 2026: a sweep that changed only the pages' dates has the content loaded, not the tests.
  const dated = () => { try { return readFileSync(join(dir, 'dates.log'), 'utf8').trim().split('\n').length } catch { return 0 } }
  onMain('m3.json')
  expect(pull({ DATES: 'd1' })).toBe('push')
  expect([swept(), dated()]).toEqual([3, 1])
  expect(sh('git show --name-only --format= HEAD', repo).trim()).toBe('content/page-dates.json')
  onMain('m4.json')
  expect(pull({ DATES: 'd2', BAD: '1' })).toBe('test') // the content doesn't load
  expect([swept(), dated()]).toEqual([4, 2])
  onMain('m5.json')
  expect(pull({ DATES: 'd3', FIXES: '2' })).toBe('test') // the dates and more
  expect([swept(), dated()]).toEqual([5, 2])
  onMain('m6.json')
  expect(pull({ DATES: 'd3' })).toBe('push') // the dates as they were: nothing to commit
  expect([swept(), dated()]).toEqual([6, 2])
  // Readers' catch, 15 Nov 2026: the calendar merges line by line, and the loader doesn't open it. One side's change goes
  // with the dates; both sides' is checked in full.
  sh("printf '1\\n2\\n3\\n4\\n5\\n' > content/curation.json && git add . && git commit -qm cal && git push -q 2>/dev/null", other)
  expect(pull({ DATES: 'd4' })).toBe('push') // main's calendar only
  expect([swept(), dated()]).toEqual([7, 3])
  sh("sed -i.bak 1s/1/run/ content/curation.json && rm content/curation.json.bak && git commit -qam 'run calendar'", repo)
  sh("sed -i.bak 5s/5/main/ content/curation.json && rm content/curation.json.bak && git commit -qam 'lead calendar' && git push -q 2>/dev/null", other)
  expect(pull({ DATES: 'd5' })).toBe('test') // both sides' calendar: no load, the tests
  expect([swept(), dated()]).toEqual([8, 3])
  expect(sh('cat content/curation.json', repo).trim().split('\n')).toEqual(['run', '2', '3', '4', 'main'])
  // The Site lead, 15 Nov: so it is when the sweep changes nothing.
  sh("sed -i.bak 3s/3/lead/ content/curation.json && rm content/curation.json.bak && git commit -qam 'lead calendar 2' && git push -q 2>/dev/null", other)
  expect(pull()).toBe('test')
  expect([swept(), dated()]).toEqual([9, 3])
  // Main not moved: the calendar test reads false, though the run changed it, and nothing is swept.
  const still = `log() { :; }; source '${join(ROOT, 'scripts/cycle-checks.sh')}'; m=$(git rev-parse '@{u}'); h=$(git rev-parse HEAD); swept_clean "$h" "$m" "$m" && echo push || echo test`
  expect(sh(still, repo).trim()).toBe('push')
  // The sweep's two reports go with the dates, or alone, the content loaded.
  onMain('m7.json')
  expect(pull({ REPORT: 'r1' })).toBe('push')
  expect([swept(), dated()]).toEqual([10, 4])
  onMain('m8.json')
  expect(pull({ DATES: 'd6', REPORT: 'r2' })).toBe('push')
  expect([swept(), dated()]).toEqual([11, 5])
  onMain('m9.json')
  expect(pull({ NOANIMAL: 'n1' })).toBe('push')
  expect([swept(), dated()]).toEqual([12, 6])
  // A report and anything else, or a file whose name only starts like a report's, is checked in full.
  onMain('m10.json')
  expect(pull({ REPORT: 'r3', FIXES: '3' })).toBe('test')
  onMain('m11.json')
  expect(pull({ LOOKALIKE: 'l1' })).toBe('test')
  expect([swept(), dated()]).toEqual([14, 6])
}, slow(120_000))

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
  expect(cycle.indexOf('git commit -q -m "content: videos')).toBeLessThan(cycle.indexOf('verify_cycle'))
})

// The re-check of 2026-11-08: its tests failed on a defect the sweep fixes, and its work, tested before it was committed,
// was left for the next run's reset to drop.
test("a video re-check sweeps its work and commits it before its tests, as the video job does", () => {
  const s = script('video-recheck.sh')
  const sweep = s.indexOf('sweep_new_video_recheck || exit 1')
  const commit = s.indexOf('git commit -q -m "content: video guides checked again')
  expect(sweep).toBeGreaterThan(s.indexOf('pnpm engine videos --redo'))
  expect(commit).toBeGreaterThan(sweep)
  expect(commit).toBeLessThan(s.indexOf('\npush_video_recheck'))
})

test.each([
  ['before', 'code.txt', false, 'checked new main\npush\nexit 0'],
  ['during', 'code.txt', false, 'checked old main\nchecked new main\npush\nexit 0'],
  ['during', 'content/other.json', true, 'checked old main\nchecked new main\nkept unpublished\nexit 1'],
  ['before', 'scripts/cycle-checks.sh', true, 'kept lost push\nexit 1'],
  ['during', 'scripts/cycle-checks.sh', true, 'checked old main\nkept lost push\nexit 1'],
  ['during', 'pnpm-workspace.yaml', true, 'checked old main\nkept lost push\nexit 1'],
  ['before', 'package.json', true, 'kept lost push\nexit 1'],
  ['during', 'apps/site/package.json', true, 'checked old main\nkept lost push\nexit 1'],
])('video recheck checks main moving %s its checks with %s', (when, changed, fails, trace) => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-video-push-'))
  const repo = join(dir, 'repo')
  const sh = (command: string, cwd = dir) => execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8' }).trim()
  sh('git init -q --bare --initial-branch=main origin.git && git clone -q origin.git repo 2>/dev/null')
  sh('git config user.email a@example.com && git config user.name a && mkdir content && echo base > content/base.json && git add . && git commit -qm base && git push -q -u origin main', repo)
  sh('git clone -q origin.git other && git -C other config user.email b@example.com && git -C other config user.name b')
  sh('echo video > content/video.json && git add . && git commit -qm video', repo)

  const run = `
    set -euo pipefail
    log() { :; }
    TEST_LOG=test.log
    source '${join(ROOT, 'scripts/cycle-checks.sh')}'
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    net() { if [ "$2" = push ]; then echo push; fi; "$@" 2>/dev/null; }
    main_holds() { :; }; sweep_merged() { :; }; sleep() { :; }
    keep_unpublished() { echo "kept unpublished"; }; keep_lost_push() { echo "kept lost push"; }
    advance() {
      mkdir -p "$(dirname '../other/${changed}')"
      echo remote > '../other/${changed}'
      git -C ../other add .
      git -C ../other commit -qm remote
      git -C ../other push -q
    }
    verify_cycle() {
      if [ -f '${changed}' ]; then echo "checked new main"; return ${changed.startsWith('content/') ? 1 : 0}; fi
      echo "checked old main"
      advance
    }
    ${when === 'before' ? 'advance' : ''}
    status=0; push_video_recheck || status=$?
    echo "exit $status"`
  expect(sh(run, repo)).toBe(trace)
  const remoteFiles = sh('git --git-dir=origin.git ls-tree -r --name-only main').split('\n')
  expect(remoteFiles.includes('content/video.json')).toBe(!fails)
})
