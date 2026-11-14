import { execSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { slow } from '@aq/schema/test-time'

// The cloud's cycle keeps its work as the Mac's engine clones do (cycle-kept.test.ts), on GitHub's branches of the same
// names, since a runner keeps nothing past its run (scripts/cycle-checks.sh, engine_cloud). The chief of staff,
// 2026-11-12, after a cloud cycle lost 682 model calls to one failed test.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const CHECKS = join(ROOT, 'scripts/cycle-checks.sh')
const ENGINE_YML = 'o/r/.github/workflows/engine.yml@refs/heads/main'
const TIMEOUT = 'Error: Test timed out in 30000ms.'
const FAIL = 'AssertionError: expected 1 to be 2'

// A bare repository standing in for GitHub, its main one commit; each run of the cycle is a fresh clone of it, as a
// runner's checkout is, with GITHUB_ACTIONS and engine.yml's workflow ref set. `pnpm` stood in for (the sweep); `checks`
// passes unless CHECK is set, and prints it (so CHECK=TIMEOUT runs out of time).
function github() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aq-cloud-kept-')))
  mkdirSync(join(home, 'bin'))
  writeFileSync(join(home, 'bin/pnpm'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(home, 'bin/pnpm'), 0o755)
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW_REF: ENGINE_YML }
  const sh = (command: string, extra: Record<string, string> = {}, cwd = home) =>
    execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8', env: { ...env, ...extra } }).trim()
  const identity = 'git config user.email a@example.com && git config user.name a'
  sh(`git init -q --bare -b main origin.git && git clone -q origin.git seed 2>/dev/null && cd seed && ${identity} && git checkout -q -b main && mkdir -p content sources engine-state docs/review packages && echo main > content/a.json && echo 1 > packages/code.ts && git add . && git commit -qm main && git push -q -u origin main 2>/dev/null`)
  let n = 0
  const runner = () => {
    const dir = join(home, `runner-${++n}`)
    sh(`git clone -q origin.git ${dir} 2>/dev/null && cd ${dir} && ${identity}`)
    return dir
  }
  const cycle = (dir: string, body: string, extra: Record<string, string> = {}) => sh(`
    set -euo pipefail; PUSH_PAUSE=0
    log() { echo "LOG $*"; }; TEST_LOG="${home}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    checks() { [ -z "\${CHECK:-}" ] || { echo "$CHECK"; return 1; }; }
    ${body}`, extra, dir)
  // A run of the rewrite cycle: its work committed, its checks failing with `check`, then its runner gone.
  const failedRun = (check: string, extra: Record<string, string> = {}, after = '') => {
    const dir = runner()
    sh('echo rewrite > content/b.json && git add . && git commit -qm "content: engine rewrite"', {}, dir)
    return cycle(dir, `verify 'pnpm test' || keep_unpublished rewrite${after}`, { CHECK: check, ...extra })
  }
  // The next cloud run's start: publish_kept on a fresh runner.
  const nextRun = (extra: Record<string, string> = {}) => cycle(runner(), 'publish_kept rewrite', extra)
  // Something else landing on main meanwhile.
  const land = (file: string, text: string) => sh(`cd seed && git pull -q --rebase origin main 2>/dev/null && mkdir -p "$(dirname ${file})" && echo ${text} > ${file} && git add . && git commit -qm "${file}" && git push -q origin HEAD:main 2>/dev/null`)
  const onGitHub = () => sh("git --git-dir=origin.git for-each-ref --format='%(refname:short)' refs/heads/").split('\n').filter(b => b && b !== 'main')
  const onMain = (file: string) => sh(`git --git-dir=origin.git show main:${file} 2>/dev/null || true`)
  const branchOnGitHub = (name: string) => sh(`cd seed && git push -q origin HEAD:refs/heads/${name} 2>/dev/null`)
  const refusing = (on: boolean) => sh(on ? 'printf "#!/bin/sh\\nexit 1\\n" > origin.git/hooks/pre-receive && chmod 755 origin.git/hooks/pre-receive' : 'rm -f origin.git/hooks/pre-receive')
  // GitHub refusing to delete a branch, and only that: one ref of a push refused, the others not, unless it's atomic.
  const refusingDeletes = (on: boolean) => sh(on ? 'printf \'#!/bin/sh\\ncase "$3" in *[!0]*) exit 0 ;; esac\\nexit 1\\n\' > origin.git/hooks/update && chmod 755 origin.git/hooks/update' : 'rm -f origin.git/hooks/update')
  return { runner, cycle, failedRun, nextRun, land, onGitHub, onMain, branchOnGitHub, refusing, refusingDeletes }
}

test('a cloud cycle whose tests ran out of time keeps its work on GitHub, and the next run publishes it and deletes that branch', () => {
  const g = github()
  expect(g.failedRun(TIMEOUT)).toMatch(/LOG tests ran out of time: this run's work is kept on kept\/rewrite\/\d{8}T\d{6}-out1 for the next run/)
  const [kept = ''] = g.onGitHub()
  expect(kept).toMatch(/^kept\/rewrite\/\d{8}T\d{6}-out1$/)
  expect(g.onMain('content/b.json')).toBe('')
  g.land('content/c.json', 'sf')
  expect(g.nextRun()).toContain(`LOG published ${kept}`)
  expect(g.onMain('content/b.json')).toBe('rewrite')
  expect(g.onMain('content/c.json')).toBe('sf')
  expect(g.onGitHub()).toEqual([])
})

test('kept work that fails its tests for real in the next run moves to held on GitHub, under the same time', () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const held = kept.replace(/^kept\//, 'held/').replace(/-out1$/, '')
  expect(g.nextRun({ CHECK: FAIL })).toContain(`LOG ${kept} failed its tests twice: on ${held}, not published`)
  expect(g.onGitHub()).toEqual([held])
  expect(g.onMain('content/b.json')).toBe('')
})

test('a real failure is held on GitHub, unpublished, until main\'s code changes; then it gets one more try', () => {
  const g = github()
  expect(g.failedRun(FAIL)).toMatch(/LOG checks failed twice: this run's work is on held\/rewrite\/\d{8}T\d{6}, not published/)
  const [held = ''] = g.onGitHub()
  expect(held).toMatch(/^held\/rewrite\/\d{8}T\d{6}$/)
  // Only pages and notes landed since: nothing that could pass it now, so it isn't tried.
  g.land('content/c.json', 'sf')
  g.land('docs/note.md', 'note')
  expect(g.nextRun()).toBe('')
  expect(g.onGitHub()).toEqual([held])
  // A fix lands. Out of time on its try, it stays held, counted once, and untried; the run after, it passes and is published.
  g.land('packages/code.ts', '2')
  expect(g.nextRun({ CHECK: TIMEOUT })).toContain(`LOG ${held} isn't published yet (tests out of time again: 1 of 3 cycles in a row): it stays held for the next run's try, as ${held}-out1`)
  expect(g.onGitHub()).toEqual([`${held}-out1`])
  const log = g.nextRun()
  expect(log).toContain(`LOG trying ${held}-out1 once more: main's code has changed since it was held`)
  expect(log).toContain(`LOG published ${held}-out1`)
  expect(g.onMain('content/b.json')).toBe('rewrite')
  expect(g.onGitHub()).toEqual([])
})

test('a held one that fails its one more try is marked tried, and isn\'t tried again', () => {
  const g = github()
  g.failedRun(FAIL)
  const [held = ''] = g.onGitHub()
  g.land('packages/code.ts', '2')
  expect(g.nextRun({ CHECK: FAIL })).toContain(`LOG ${held} failed its tests again: on ${held}-tried, not tried again`)
  expect(g.onGitHub()).toEqual([`${held}-tried`])
  g.land('packages/code.ts', '3')
  expect(g.nextRun({ CHECK: FAIL })).toBe('')
  expect(g.onGitHub()).toEqual([`${held}-tried`])
  expect(g.onMain('content/b.json')).toBe('')
  // Its own limit: three runs and two landings, 30.6 s under a whole suite's load on 14 Nov, past the 30 s default.
}, slow(60_000))

test('held branches on GitHub are dropped after 14 days, each by its own name; young ones and other jobs\' stay', () => {
  const g = github()
  const when = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace(/[-:]/g, '')
  const [old, tried, young, other, photos] = [`held/rewrite/${when(15)}`, `held/rewrite/${when(16)}-tried`, `held/rewrite/${when(13)}`, `held/rewrite-x/${when(15)}`, `held/photos/${when(15)}`]
  for (const b of [old, tried, young, other, photos]) g.branchOnGitHub(b)
  expect(g.nextRun().split('\n').sort()).toEqual([`LOG ${old} was held 14 days: dropped`, `LOG ${tried} was held 14 days: dropped`].sort())
  expect(g.onGitHub().sort()).toEqual([young, other, photos].sort())
})

// Astra's read of #1172: work published from a branch that then couldn't be deleted would be published again.
test('a publish whose branch GitHub won\'t delete doesn\'t land on main either, so nothing is published twice', () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  g.refusingDeletes(true)
  expect(g.nextRun()).toContain(`LOG ${kept} isn't published yet (the push didn't land): it stays kept for the next run`)
  expect(g.onMain('content/b.json')).toBe('')
  // Its checks passed, and the rename that ends its row was refused too: its name with no count is beside it.
  const bare = kept.replace(/-out1$/, '')
  expect(g.onGitHub()).toEqual([bare, kept])
  g.refusingDeletes(false)
  expect(g.nextRun()).toContain(`LOG published ${bare}`)
  expect(g.onMain('content/b.json')).toBe('rewrite')
  expect(g.onGitHub()).toEqual([])
  // And once published, a later run finds nothing to publish.
  g.land('content/b.json', 'newer')
  expect(g.nextRun()).toBe('')
  expect(g.onMain('content/b.json')).toBe('newer')
  // Its own limit: since 14 Nov a name added and one dropped too, 4.8 s alone, past the test above that ran 30.6 s.
}, slow(60_000))

test('a move GitHub won\'t finish leaves the branch where it was, never in two places', () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const held = kept.replace(/^kept\//, 'held/').replace(/-out1$/, '')
  g.refusingDeletes(true)
  expect(g.nextRun({ CHECK: FAIL })).toContain(`LOG ${kept} failed its tests twice and couldn't be moved to ${held}: it stays kept for the next run`)
  expect(g.onGitHub()).toEqual([kept])
  g.refusingDeletes(false)
  expect(g.nextRun({ CHECK: FAIL })).toContain(`LOG ${kept} failed its tests twice: on ${held}, not published`)
  expect(g.onGitHub()).toEqual([held])
  // The same for a held one's one more try.
  g.land('packages/code.ts', '2')
  g.refusingDeletes(true)
  expect(g.nextRun({ CHECK: FAIL })).toContain(`LOG ${held} failed its tests again and couldn't be moved to ${held}-tried: it stays held`)
  expect(g.onGitHub()).toEqual([held])
})

// Astra's read of #1172: a held branch kept as it began, on an older main, took its one more try on the main it had just
// failed on.
test('kept work that fails on a newer main is held as checked there, and its one more try waits for a main newer still', () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const held = kept.replace(/^kept\//, 'held/').replace(/-out1$/, '')
  g.land('packages/code.ts', '2')
  const log = g.nextRun({ CHECK: FAIL })
  expect(log).toContain(`LOG ${kept} failed its tests twice: on ${held}, not published`)
  expect(log).not.toContain('trying')
  expect(g.onGitHub()).toEqual([held])
  expect(g.nextRun()).toBe('')
  g.land('packages/code.ts', '3')
  const tried = g.nextRun()
  expect(tried).toContain(`LOG trying ${held} once more: main's code has changed since it was held`)
  expect(tried).toContain(`LOG published ${held}`)
  expect(g.onMain('content/b.json')).toBe('rewrite')
  expect(g.onMain('packages/code.ts')).toBe('3')
})

// The chief of staff, 14 Nov 2026: the count is in GitHub's branch name, the one thing the next runner has.
test("in the cloud, out of time three cycles in a row is held at the bound, under GitHub's names, with a notice", () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const base = kept.replace(/-out1$/, '')
  expect(g.nextRun({ CHECK: TIMEOUT })).toContain(`LOG ${kept} isn't published yet (tests out of time again: 2 of 3 cycles in a row): it stays kept for the next run, as ${base}-out2`)
  expect(g.onGitHub()).toEqual([`${base}-out2`])
  const third = g.cycle(g.runner(), 'publish_kept rewrite; echo "FAULT=$FAULT"', { CHECK: TIMEOUT })
  const held = `${base.replace(/^kept\//, 'held/')}-out3`
  expect(third).toContain(`LOG ${base}-out2 ran out of time 3 cycles in a row: on ${held}, not published`)
  expect(third).toContain(`FAULT=${base} ran out of time 3 cycles in a row and failed as broken work: its tests' output is in this run's log`)
  expect(g.onGitHub()).toEqual([held])
  expect(g.onMain('content/b.json')).toBe('')
})

test('a branch that can\'t be pushed is said, and the run still goes on to say it isn\'t publishing', () => {
  const g = github()
  g.refusing(true)
  const log = g.failedRun(TIMEOUT, {}, '; echo "WENT ON"')
  expect(log).toMatch(/LOG kept\/rewrite\/\d{8}T\d{6}-out1 couldn't be pushed to GitHub: this run's work is lost with the runner\nWENT ON$/)
  g.refusing(false)
  expect(g.onGitHub()).toEqual([])
})

test('only engine.yml\'s runs keep work on GitHub or touch its kept branches: another workflow\'s checkout, as ci.yml\'s tests, doesn\'t', () => {
  const g = github()
  for (const GITHUB_WORKFLOW_REF of ['o/r/.github/workflows/ci.yml@refs/heads/main', '']) {
    for (const check of [TIMEOUT, FAIL]) g.failedRun(check, { GITHUB_WORKFLOW_REF })
    expect(g.onGitHub()).toEqual([])
  }
  g.branchOnGitHub('kept/rewrite/20261112T065500')
  expect(g.nextRun({ GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/ci.yml@refs/heads/main' })).toBe('')
  expect(g.onGitHub()).toEqual(['kept/rewrite/20261112T065500'])
  expect(g.onMain('content/b.json')).toBe('')
})

test('GitHub\'s branches are deleted only by their exact names', () => {
  const s = readFileSync(CHECKS, 'utf8')
  expect(s.match(/--delete [^\n]*/g)).toEqual(['--delete "refs/heads/$1"'])
  // A deleting refspec in a push names one variable's branch, never a pattern: publishing, moving and renaming.
  expect([...s.matchAll(/(?:^|[\s"])(:refs\/heads\/[^"\s]*)/gm)].map(m => m[1])).toEqual([':refs/heads/$1', ':refs/heads/$1', ':refs/heads/$BRANCH'])
})

// The chief of staff, 14 Nov 2026: a rename never forces over a branch that exists, and a count GitHub won't take leaves
// the work kept under its present name, said in a FAULT line.
test("a rename on GitHub never moves a branch already there; a count GitHub won't take leaves the work kept as it is, with a FAULT line", () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const out2 = kept.replace(/-out1$/, '-out2')
  // A branch at the new name on GitHub only, on main's commit: a plain push would move it on to the kept work.
  g.branchOnGitHub(out2)
  const refs = () => g.cycle(g.runner(), "git ls-remote origin 'refs/heads/kept/*'")
  const was = refs()
  expect(was.split('\n')).toHaveLength(2)
  expect(g.cycle(g.runner(), `git fetch -q origin "+refs/heads/${kept}:refs/heads/${kept}"; rename_branch ${kept} ${out2} 2>/dev/null || echo refused`)).toBe('refused')
  expect(refs()).toBe(was)
  // GitHub refusing deletes, so no rename lands: out of time again, the work stays kept as it is, and the run says so.
  g.cycle(g.runner(), `git push -q origin --delete refs/heads/${out2}`)
  g.refusingDeletes(true)
  const log = g.cycle(g.runner(), 'publish_kept rewrite; echo "FAULT=${FAULT:-}"', { CHECK: TIMEOUT })
  expect(log).toContain(`FAULT=${kept} ran out of time again and couldn't be renamed ${out2}: it stays as ${kept}, its count not moved on`)
  expect(g.onGitHub()).toEqual([kept])
}, slow(60_000))

// Codex's read of 6d2aea2bd: a pass whose rename GitHub refused was known to that run only, and the next runner, out of
// time, held the work at -out3. The pass goes on GitHub as the name with no count, beside the counted one.
test("a pass whose rename GitHub refuses is still known to the next runner, which counts from there", () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const base = kept.replace(/-out1$/, '')
  g.nextRun({ CHECK: TIMEOUT })
  expect(g.onGitHub()).toEqual([`${base}-out2`])
  // GitHub refusing deletes: the pass's rename and the publish are refused; a name added isn't.
  g.refusingDeletes(true)
  const passed = g.cycle(g.runner(), 'publish_kept rewrite; echo "FAULT=${FAULT:-}"')
  expect(passed).toContain(`FAULT=${base}-out2 passed its checks and couldn't be renamed ${base}`)
  g.refusingDeletes(false)
  const next = g.nextRun({ CHECK: TIMEOUT })
  expect(g.onGitHub()).toEqual([`${base}-out1`])
  expect(next).toContain(`LOG ${base} isn't published yet (tests out of time again: 1 of 3 cycles in a row): it stays kept for the next run, as ${base}-out1`)
  expect(passed).toContain(`LOG ${base}-out2 passed and couldn't lose its count: ${base} is beside it on the same work, the name the next run takes`)
  expect(g.onMain('content/b.json')).toBe('')
}, slow(60_000))

// Codex's read of 6d2aea2bd: one_name deleted the old name here before GitHub refused to delete it there, so the batch's
// other name was this run's only one and was published, and the old name, still on GitHub, was published again next run.
test("a batch under two names whose old name GitHub won't delete is left whole: neither is published until it can be", () => {
  const g = github()
  g.failedRun(TIMEOUT)
  const [kept = ''] = g.onGitHub()
  const out2 = kept.replace(/-out1$/, '-out2')
  g.cycle(g.runner(), `git fetch -q origin "+refs/heads/${kept}:refs/heads/${kept}" && git push -q origin "refs/heads/${kept}:refs/heads/${out2}"`)
  // GitHub refusing to delete the old name only: the other's publish deletes it.
  g.cycle(g.runner(), `printf '#!/bin/sh\\n[ "$1" = refs/heads/${kept} ] && [ "$3" = 0000000000000000000000000000000000000000 ] && exit 1\\nexit 0\\n' > "$HOME/origin.git/hooks/update" && chmod 755 "$HOME/origin.git/hooks/update"`)
  const log = g.nextRun()
  expect(log).toContain(`LOG ${kept} is the same work as ${out2} and couldn't be dropped: neither is processed this run`)
  expect(log).not.toContain('publishing')
  expect(g.onMain('content/b.json')).toBe('')
  expect(g.onGitHub()).toEqual([kept, out2])
  g.refusingDeletes(false)
  const next = g.nextRun()
  expect(next).toContain(`LOG published ${out2}`)
  expect(next).not.toContain(`publishing ${kept}`)
  expect(g.onMain('content/b.json')).toBe('rewrite')
  expect(g.onGitHub()).toEqual([])
}, slow(60_000))
