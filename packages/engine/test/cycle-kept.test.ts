import { execSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const CHECKS = join(ROOT, 'scripts/cycle-checks.sh')
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// verify with `checks` and `calm` stood in for, as in cycle-timeouts.test.ts: each run prints the next of `runs` and
// fails unless it prints "ok". Prints verify's exit code and TIMED_OUT.
function timedOut(runs: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-timed-out-'))
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    log() { :; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    n=0; runs=(${runs.map(r => `'${r}'`).join(' ')})
    checks() {
      local r="\${runs[$n]}"; n=$((n + 1))
      if [ "$r" = long ]; then echo 'Error: Test timed out in 30000ms.'; head -c 300000 /dev/zero | tr '\\0' x; return 1; fi
      echo "$r"; [ "$r" = ok ]
    }
    code=0; verify 'pnpm test' || code=$?; echo "code=$code timed_out=$TIMED_OUT"`], { encoding: 'utf8' })
  return r.stdout.trim()
}

test('a run gives up as timed out only when its tests ran out of time on the second try too', () => {
  const late = 'Error: Test timed out in 30000ms.'
  expect(timedOut([late, late])).toBe('code=1 timed_out=1')
  // Out of time, then a real failure; a real failure twice; a real failure, then out of time; passing the second time.
  const failed = 'AssertionError: expected 1 to be 2'
  expect(timedOut([late, failed])).toBe('code=1 timed_out=')
  expect(timedOut([failed, failed])).toBe('code=1 timed_out=')
  expect(timedOut([failed, late])).toBe('code=1 timed_out=1')
  expect(timedOut([late, 'ok'])).toBe('code=0 timed_out=')
  expect(timedOut([failed, 'ok'])).toBe('code=0 timed_out=')
  // A long log after the time-out, as a whole suite's is: still read as out of time, under the scripts' pipefail.
  expect(timedOut(['long', 'long'])).toBe('code=1 timed_out=1')
})

// An engine clone (~/.local/share/aquatome/<job>) of a bare origin, its main one commit; `pnpm` stood in for (the sweep);
// `checks` passes unless CHECK is set, and prints it (so CHECK='Error: Test timed out in …' runs out of time); CHECK_ONCE
// is printed and fails the first check only.
function clone() {
  // The real path: the clone's place is checked against $HOME, and macOS's temporary folder is behind a link.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aq-kept-')))
  const repo = join(home, '.local/share/aquatome/engine-photos')
  mkdirSync(join(home, 'bin'))
  mkdirSync(join(repo, '..'), { recursive: true })
  writeFileSync(join(home, 'bin/pnpm'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(home, 'bin/pnpm'), 0o755)
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, GITHUB_ACTIONS: '' }
  const sh = (command: string, extra: Record<string, string> = {}, cwd = repo) =>
    execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8', env: { ...env, ...extra } }).trim()
  sh(`git init -q --bare -b main origin.git && git clone -q origin.git ${repo} 2>/dev/null`, {}, home)
  sh('git config user.email a@example.com && git config user.name a && git checkout -q -b main && mkdir -p content sources engine-state docs/review && echo main > content/a.json && git add . && git commit -qm main && git push -q -u origin main 2>/dev/null')
  const cycle = (body: string, extra: Record<string, string> = {}) => sh(`
    set -euo pipefail; PUSH_PAUSE=0
    log() { echo "LOG $*"; }; TEST_LOG="${home}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    checks() {
      if [ -n "\${CHECK_ONCE:-}" ] && [ ! -f "$HOME/failed-once" ]; then touch "$HOME/failed-once"; printf '%b\\n' "$CHECK_ONCE"; return 1; fi
      [ -z "\${CHECK:-}" ] || { echo "$CHECK"; return 1; }
    }
    ${body}`, extra)
  // A run of the job: its work committed, its tests out of time twice (keep_unpublished), then the next run's start.
  const timedOutRun = () => {
    sh('echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
    const log = cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
    sh('git fetch -q origin && git reset -q --hard origin/main')
    return log
  }
  // Another job's push meanwhile, from a second clone.
  const elsewhere = (file = 'content/c.json') => sh(`rm -rf other && git clone -q origin.git other 2>/dev/null && cd other && git config user.email a@example.com && git config user.name a && echo sf > ${file} && git add . && git commit -qm sf && git push -q 2>/dev/null`, {}, home)
  const onMain = (file: string) => sh(`git --git-dir=origin.git show main:${file} 2>/dev/null || true`, {}, home)
  const branches = () => sh("git for-each-ref --format='%(refname:short)' refs/heads/").split('\n').filter(b => b !== 'main')
  // The origin refusing every push, or taking them again.
  const refusing = (on: boolean) => sh(on ? 'printf "#!/bin/sh\\nexit 1\\n" > origin.git/hooks/pre-receive && chmod 755 origin.git/hooks/pre-receive' : 'rm -f origin.git/hooks/pre-receive', {}, home)
  return { sh, cycle, timedOutRun, elsewhere, onMain, branches, refusing }
}

test("a run whose tests ran out of time keeps its work, and the next run publishes it on main as it is then", () => {
  const c = clone()
  expect(c.timedOutRun()).toMatch(/LOG tests ran out of time: this run's work is kept on kept\/photos\//)
  expect(c.branches()).toEqual([expect.stringMatching(/^kept\/photos\/\d{8}T\d{6}$/)])
  // The start from main left it out of main, and another job pushed meanwhile.
  expect(c.onMain('content/b.json')).toBe('')
  c.elsewhere()
  const log = c.cycle('publish_kept photos')
  expect(log).toMatch(/LOG published kept\/photos\//)
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(c.onMain('content/c.json')).toBe('sf')
  expect(c.branches()).toEqual([])
  // This run's own work starts from main, as it now is.
  expect(c.sh('git rev-parse HEAD')).toBe(c.sh('git rev-parse origin/main'))
  expect(c.sh('git status --porcelain')).toBe('')
})

test('kept work whose tests run out of time again stays kept; a real failure moves it aside, never pushed', () => {
  const c = clone()
  c.timedOutRun()
  const [kept = ''] = c.branches()
  expect(c.cycle('publish_kept photos', { CHECK: 'Error: Test timed out in 30000ms.' })).toContain(`LOG ${kept} isn't published yet (tests out of time again): it stays kept`)
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/b.json')).toBe('')
  c.cycle('publish_kept photos', { CHECK: 'AssertionError: expected 1 to be 2' })
  expect(c.branches()).toEqual([kept.replace(/^kept\//, 'held/')])
  expect(c.onMain('content/b.json')).toBe('')
  // Another job's kept work isn't this one's to publish.
  c.sh('git branch kept/videos/20261108T000000 HEAD')
  expect(c.cycle('publish_kept photos')).toBe('')
  expect(c.branches()).toContain('kept/videos/20261108T000000')
})

test("kept work whose push doesn't land stays kept, and goes out with the next run's push", () => {
  const c = clone()
  c.timedOutRun()
  const [kept = ''] = c.branches()
  c.refusing(true)
  expect(c.cycle('publish_kept photos')).toContain(`LOG ${kept} isn't published yet (the push didn't land): it stays kept`)
  expect(c.branches()).toEqual([kept])
  c.refusing(false)
  expect(c.cycle('publish_kept photos')).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/b.json')).toBe('photos')
})

test("kept work that clashes with main gets its own lines, as a run's push does, and is checked again", () => {
  const c = clone()
  c.timedOutRun()
  c.elsewhere('content/b.json')
  expect(c.onMain('content/b.json')).toBe('sf')
  const log = c.cycle('publish_kept photos')
  expect(log).toMatch(/LOG published kept\/photos\//)
  expect(c.onMain('content/b.json')).toBe('photos')
})

// As the jobs' scripts end: a commit, its checks, then the push (or giving up).
const publishing = `if ! verify 'pnpm test'; then keep_unpublished photos; echo "NOT PUBLISHED"; exit 0; fi; git push -q origin HEAD:main`
const work = 'echo photos > content/b.json && git add . && git commit -qm "content: engine photos"'
// One colour-coded FAIL line, as the root pnpm test prints it.
const failLine = 'packages/engine test: \\033[41m\\033[1m FAIL \\033[22m\\033[49m test/a.test.ts\\033[2m > \\033[22mkeeps its order'

// 2026-11-10: one flaky test cost the sf cycle its 207 files, and only tests out of time were kept.
test('a test that fails once and then passes still publishes, and is logged as flaky', () => {
  const c = clone()
  c.sh(work)
  const log = c.cycle(publishing, { CHECK_ONCE: failLine })
  expect(log).toContain('LOG a check failed: running it once more')
  expect(log).toContain('LOG flaky: test/a.test.ts > keeps its order')
  expect(log).not.toContain('NOT PUBLISHED')
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(c.branches()).toEqual([])
})

test('a test that fails twice ends on a held branch with nothing published, and no later run publishes it', () => {
  const c = clone()
  c.sh(work)
  const log = c.cycle(publishing, { CHECK: 'AssertionError: expected 1 to be 2' })
  expect(log).toMatch(/LOG checks failed twice: this run's work is on held\/photos\/\d{8}T\d{6}, not published/)
  expect(log).toContain('NOT PUBLISHED')
  expect(c.onMain('content/b.json')).toBe('')
  const [held = ''] = c.branches()
  expect(held).toMatch(/^held\/photos\/\d{8}T\d{6}$/)
  // Off main already, so a next run that can't fetch doesn't carry on from it and push it.
  expect(c.sh('git rev-parse HEAD')).toBe(c.sh('git rev-parse origin/main'))
  // The next run's start: it passes its checks, and the held work still isn't its to publish.
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  expect(c.cycle('publish_kept photos')).toBe('')
  expect(c.onMain('content/b.json')).toBe('')
  expect(c.branches()).toEqual([held])
  expect(c.sh(`git show ${held}:content/b.json`)).toBe('photos')
})

test("a held branch is dropped after 14 days, by its own job's next run", () => {
  const c = clone()
  const when = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace(/[-:]/g, '')
  const [old, young, other] = [`held/photos/${when(15)}`, `held/photos/${when(13)}`, `held/videos/${when(15)}`]
  c.sh(`git branch ${old} HEAD && git branch ${young} HEAD && git branch ${other} HEAD`)
  expect(c.cycle('publish_kept photos')).toBe(`LOG ${old} was held 14 days: dropped`)
  expect(c.branches().sort()).toEqual([young, other].sort())
  // One that can't be deleted (a worktree on it) is logged, and the run goes on.
  const reading = `held/photos/${when(16)}`
  c.sh(`git branch ${reading} HEAD && git worktree add -q ../reading ${reading}`)
  expect(c.cycle('publish_kept photos; echo "WENT ON"')).toBe(`LOG ${reading} is past 14 days and couldn't be dropped\nWENT ON`)
})

test('a checkout that is not an engine clone keeps nothing', () => {
  const c = clone()
  c.sh('echo photos > content/b.json && git add . && git commit -qm photos')
  for (const CHECK of ['Error: Test timed out in 30000ms.', 'AssertionError: expected 1 to be 2']) {
    c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK, HOME: '/nonexistent' })
    expect(c.branches()).toEqual([])
  }
})

test('the engine cycle and both video jobs keep unpublished work wherever they give up publishing, and publish kept work first', () => {
  const jobs: [string, string][] = [['engine-cycle.sh', '"$PART"'], ['video-cycle.sh', 'videos'], ['video-recheck.sh', 'video-recheck']]
  for (const [name, job] of jobs) {
    const s = script(name)
    // Each "not publishing" after the checks keeps the work first: after the run's commit, and after a merge on push.
    const gaveUp = s.split('\n').filter(l => /not publishing/.test(l) && !/gate:/.test(l))
    expect(gaveUp.length, name).toBe(2)
    expect(s.match(new RegExp(`keep_unpublished ${job.replace(/[$"]/g, m => `\\${m}`)}`, 'g'))?.length, name).toBe(2)
    // Kept work is published once a run has installed and set its merge drivers, before it does its own work.
    expect(s, name).toMatch(new RegExp(`pnpm install --frozen-lockfile --silent\\npublish_kept ${job.replace(/[$"]/g, m => `\\${m}`)}\\n`))
    expect(s.indexOf('\npublish_kept '), name).toBeGreaterThan(s.indexOf('merge.entity.driver'))
  }
})
