import { execSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { slow } from '@aq/schema/test-time'

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
  // The hour pinned: with no daily mark, full_due goes by the clock (a reader of #1516).
  const env = { ...process.env, HOME: home, PATH: `${home}/bin:${process.env.PATH}`, GITHUB_ACTIONS: '', AQ_HOUR: '12' }
  const sh = (command: string, extra: Record<string, string> = {}, cwd = repo) =>
    execSync(command, { cwd, shell: '/bin/bash', encoding: 'utf8', env: { ...env, ...extra } }).trim()
  sh(`git init -q --bare -b main origin.git && git clone -q origin.git ${repo} 2>/dev/null`, {}, home)
  sh('git config user.email a@example.com && git config user.name a && git checkout -q -b main && mkdir -p content sources engine-state docs/review && touch sources/.gitkeep engine-state/.gitkeep docs/review/.gitkeep && echo main > content/a.json && git add . && git commit -qm main && git push -q -u origin main 2>/dev/null')
  const cycle = (body: string, extra: Record<string, string> = {}) => sh(`
    set -euo pipefail; PUSH_PAUSE=0
    log() { echo "LOG $*"; }; TEST_LOG="${home}/test.log"; source "${CHECKS}"; calm() { :; }; settled() { :; }
    checks() {
      if [ -n "\${CHECK_ONCE:-}" ] && [ ! -f "$HOME/failed-once" ]; then touch "$HOME/failed-once"; printf '%b\\n' "$CHECK_ONCE"; return 1; fi
      [ -z "\${CHECK:-}" ] || { echo "$CHECK"; return 1; }
    }
    # These fixtures make the gated commit directly with git commit.
    publish_fixture_video_recheck() {
      git update-ref "$VIDEO_RECHECK_PENDING_REF" HEAD '' || return 1
      push_video_recheck
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
  const elsewhere = (file = 'content/c.json', text = 'sf') => sh(`rm -rf other && git clone -q origin.git other 2>/dev/null && cd other && git config user.email a@example.com && git config user.name a && mkdir -p $(dirname ${file}) && echo ${text} > ${file} && git add . && git commit -qm sf && git push -q 2>/dev/null`, {}, home)
  const onMain = (file: string) => sh(`git --git-dir=origin.git show main:${file} 2>/dev/null || true`, {}, home)
  const branches = () => sh("git for-each-ref --format='%(refname:short)' refs/heads/").split('\n').filter(b => b !== 'main')
  // The origin refusing every push, or taking them again.
  const refusing = (on: boolean) => sh(on ? 'printf "#!/bin/sh\\nexit 1\\n" > origin.git/hooks/pre-receive && chmod 755 origin.git/hooks/pre-receive' : 'rm -f origin.git/hooks/pre-receive', {}, home)
  return { sh, cycle, timedOutRun, elsewhere, onMain, branches, refusing }
}

test("a run whose tests ran out of time keeps its work, and the next run publishes it on main as it is then", () => {
  const c = clone()
  expect(c.timedOutRun()).toMatch(/LOG tests ran out of time: this run's work is kept on kept\/photos\//)
  expect(c.branches()).toEqual([expect.stringMatching(/^kept\/photos\/\d{8}T\d{6}-out1$/)])
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

test('kept work whose tests run out of time again stays kept, counted; a real failure moves it aside, never pushed', () => {
  const c = clone()
  c.timedOutRun()
  const [kept = ''] = c.branches()
  const again = kept.replace(/-out1$/, '-out2')
  expect(c.cycle('publish_kept photos', { CHECK: 'Error: Test timed out in 30000ms.' })).toContain(`LOG ${kept} isn't published yet (tests out of time again: 2 of 3 cycles in a row): it stays kept for the next run, as ${again}`)
  expect(c.branches()).toEqual([again])
  expect(c.onMain('content/b.json')).toBe('')
  // A real failure ends the row: held under its time, with no count.
  c.cycle('publish_kept photos', { CHECK: 'AssertionError: expected 1 to be 2' })
  expect(c.branches()).toEqual([kept.replace(/^kept\//, 'held/').replace(/-out1$/, '')])
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
  // Its tests passed, so its row of time-outs ends: kept with no count.
  const bare = kept.replace(/-out1$/, '')
  expect(c.cycle('publish_kept photos')).toContain(`LOG ${kept} isn't published yet (the push didn't land): it stays kept for the next run, as ${bare}`)
  expect(c.branches()).toEqual([bare])
  c.refusing(false)
  expect(c.cycle('publish_kept photos')).toContain(`LOG published ${bare}`)
  expect(c.onMain('content/b.json')).toBe('photos')
})

// The chief of staff, 14 Nov 2026: the same work "out of time" three cycles in a row stops being put down to a busy Mac. It
// fails as broken work does, with its output kept and the run failed with a notice; its one more try is its last.
test('kept work out of time three cycles in a row fails as broken work, with its output kept and a notice', () => {
  const c = clone()
  const late = { CHECK: 'Error: Test timed out in 30000ms.' }
  c.timedOutRun()
  const [kept = ''] = c.branches()
  const base = kept.replace(/-out1$/, '')
  c.cycle('publish_kept photos', late)
  expect(c.branches()).toEqual([`${base}-out2`])
  const third = c.cycle('publish_kept photos; echo "FAULT=$FAULT"', late)
  const held = `${base.replace(/^kept\//, 'held/')}-out3`
  const copy = `${c.sh('echo "$HOME"')}/.cache/aquatome/engine-held/${base.replace(/\//g, '-')}.log`
  expect(third).toContain(`LOG ${base} ran out of time 3 cycles in a row, so it's no longer put down to a busy Mac: it fails as broken work does. Its tests:\nLOG   Error: Test timed out in 30000ms.\n`)
  expect(third).toContain(`LOG ${base}-out2 ran out of time 3 cycles in a row: on ${held}, not published`)
  expect(third).toContain(`FAULT=${base} ran out of time 3 cycles in a row and failed as broken work: its tests' output is in ${copy}`)
  expect(c.sh(`cat "${copy}"`)).toContain('Error: Test timed out in 30000ms.')
  expect(c.branches()).toEqual([held])
  expect(c.onMain('content/b.json')).toBe('')
  // Held as checked on main as it was, it waits for main's code to change; then out of time again, it is tried no more.
  expect(c.cycle('publish_kept photos', late)).toBe('')
  c.elsewhere('packages/code.ts', '2')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const last = c.cycle('publish_kept photos', late)
  expect(last).toContain(`LOG ${held} ran out of time 4 cycles in a row: on ${base.replace(/^kept\//, 'held/')}-tried, not tried again`)
  expect(c.branches()).toEqual([`${base.replace(/^kept\//, 'held/')}-tried`])
  expect(c.onMain('content/b.json')).toBe('')
})

// A stand-in for the checks: the first passes while another job lands on main (`landing`, run in a clone of its own), so
// the push after it is refused; every check after that runs out of time, or with `later` set, does that.
// Main's commit during the race clashes with the work's own file, so the work is checked again after it.
const CLASH_LANDS = 'echo sf > content/b.json && git add .'
const racing = (landing: string, later = "echo 'Error: Test timed out in 30000ms.'; return 1") => `checks() {
  if [ ! -f "$HOME/passed" ]; then touch "$HOME/passed"; (cd "$HOME" && rm -rf other && git clone -q origin.git other 2>/dev/null && cd other && git config user.email a@example.com && git config user.name a && ${landing} && git commit -qm sf && git push -q 2>/dev/null); return 0; fi
  ${later}
}`
// Kept work at -out2: its commit (`work`), out of time in its own run, then renamed as a second cycle out of time would.
function atOut2(c: ReturnType<typeof clone>, work = 'echo photos > content/b.json && git add . && git commit -qm "content: engine photos"') {
  c.sh(work)
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const [kept = ''] = c.branches()
  const base = kept.replace(/-out1$/, '')
  c.sh(`git branch -m ${kept} ${base}-out2`)
  return base
}

test.each([
  ['kept', false],
  ['held', false],
  ['kept', true],
  ['held', true],
] as const)('a %s video recheck checks the rebased tree after losing a push (fetch first: %s)', (prefix, fetchFirst) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${prefix}/video-recheck/${when}`
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${branch} && git reset -q --hard origin/main`)
  if (prefix === 'held') {
    c.elsewhere('code.txt', 'new')
    c.sh('git fetch -q origin && git reset -q --hard origin/main')
  }
  c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    ${fetchFirst ? 'sleep() { git fetch -q origin; }' : ''}
    ${racing('echo new > content/disjoint.json && git add .', "echo 'AssertionError: combined tree failed'; return 1")}
    publish_kept video-recheck
  `)
  expect(c.onMain('content/disjoint.json')).toBe('new')
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

test.each(['failed sweep', 'failed sweep commit', 'tracked write during verification'])('a kept video recheck does not publish after a %s', reason => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    TEST_FAILURES_DIR="$HOME/check-logs"
    ${reason === 'failed sweep commit' ? `
      git() {
        if [ "$1" = update-ref ] && [ "$3" = 'content: sweep on main as it is now' ]; then return 1; fi
        command git "$@"
      }
    ` : ''}
    ${reason === 'tracked write during verification'
      ? 'checks() { echo changed > content/a.json; echo "check changed an input"; }'
      : `pnpm() { if [ "$1 $2" = "engine sweep" ]; then cd "$AQ_VIDEO_RECONCILE_WORKTREE" || return 1; echo fixed > content/a.json; echo partial > content/partial.json; return ${reason === 'failed sweep' ? 1 : 0}; fi; }; checks() { [ "$(cat content/a.json)" = fixed ]; }`}
    publish_kept video-recheck
  `)
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/video.json')).toBe('')
  if (reason === 'tracked write during verification') {
    expect(c.sh('cat "$HOME"/check-logs/test.*.try-1.*')).toBe('check changed an input')
  }
  if (reason === 'failed sweep commit') {
    const staged = c.sh('cat "$HOME"/check-logs/video-recheck-checkout.*/staged.patch')
    expect(staged).toContain('+fixed')
    expect(staged).toContain('+partial')
  }
}, slow(60_000))

test('a kept video recheck does not publish with an untracked verification input', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() { echo local-only > content/material-parent.json; }
    publish_kept video-recheck
  `)
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/content/material-parent.json')).toBe('local-only')
  c.cycle('AQ_SCRIPT_HEAD=$(git rev-parse HEAD); publish_kept video-recheck')
  expect(c.branches()).toEqual([])
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/material-parent.json')).toBe('')
}, slow(60_000))

test.each(['startup', 'after recovery'])('video recheck refuses leftover files at %s until it can archive them', where => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  const helper = join(ROOT, 'scripts/video-recheck-publish.sh')
  if (where === 'startup') c.sh('echo local-only > content/material-parent.json')
  else c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    touch "$HOME/archive"
    TEST_FAILURES_DIR="$HOME/archive"
    checks() { echo local-only > content/material-parent.json; }
    publish_kept video-recheck && exit 2
    echo refused
  `)
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.cycle(`
    source '${helper}'
    prepare_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    publish_kept video-recheck
    prepare_video_recheck
  `)).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/material-parent.json')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/content/material-parent.json')).toBe('local-only')
}, slow(60_000))

test('a fresh video recheck saves a failed sweep outside the automatic publish queue', () => {
  const c = clone()
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    echo rechecked > content/video.json
    pnpm() { echo partial > content/a.json; return 1; }
    sweep_new_video_recheck && exit 2
    echo refused
  `)
  expect(log).toContain('refused')
  const [saved] = c.branches()
  expect(saved).toMatch(/^sweep-failed\/video-recheck\//)
  expect(c.sh(`git show ${saved}:content/video.json`)).toBe('rechecked')
  expect(c.onMain('content/video.json')).toBe('')
  c.sh('git checkout -q main')
  expect(c.cycle('publish_kept video-recheck')).toBe('')
  expect(c.onMain('content/a.json')).toBe('main')
}, slow(60_000))

test('video recheck saves tracked and staged work before resetting after a sweep commit failure', () => {
  const c = clone()
  const helper = join(ROOT, 'scripts/video-recheck-publish.sh')
  c.sh('printf "#!/bin/sh\nexit 1\n" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit')
  c.cycle(`
    source '${helper}'
    echo rechecked > content/video.json
    pnpm() { echo partial > content/a.json; return 1; }
    sweep_new_video_recheck && exit 2
    archive_video_recheck_checkout
    git reset -q --hard origin/main
  `)
  const staged = c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-checkout.*/staged.patch')
  expect(staged).toContain('+rechecked')
  expect(staged).toContain('+partial')
  expect(c.sh('cat content/a.json')).toBe('main')
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

test('a video recheck cannot pass on a retry using a file the first check created', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() {
      if [ ! -e "$HOME/first-try" ]; then
        touch "$HOME/first-try"
        echo generated > content/retry-input.json
        return 1
      fi
      touch "$HOME/second-try"
      test -f content/retry-input.json && rm content/retry-input.json
    }
    publish_kept video-recheck
  `)
  expect(log).toContain('the video recheck checkout changed during verification')
  expect(c.sh('test ! -e "$HOME/second-try" && echo stopped')).toBe('stopped')
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/content/retry-input.json')).toBe('generated')
}, slow(60_000))

test('video recheck verification does not export its checkout hash into a check', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() { ! env | grep -Eq '^(VERIFY_TREE|video_verify_tree)='; }
    publish_kept video-recheck
  `)
  expect(log).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/video.json')).toBe('rechecked')
}, slow(60_000))

test.each(['kept', 'held'])('video recheck preserves untracked files if a %s batch cannot archive them before reset', prefix => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${prefix}/video-recheck/${when}`
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    touch "$HOME/archive"
    TEST_FAILURES_DIR="$HOME/archive"
    checks() {
      echo from-main > "$HOME/other/content/retry-input.json"
      git -C "$HOME/other" add content/retry-input.json
      git -C "$HOME/other" commit -qm concurrent
      git -C "$HOME/other" push -q
      echo local-only > content/retry-input.json
      return 1
    }
    publish_kept video-recheck && exit 2
    echo refused
  `)
  expect(log).toContain('could not preserve the video recheck checkout before resetting')
  expect(log).toContain('refused')
  expect(c.branches()).toEqual([branch])
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.onMain('content/retry-input.json')).toBe('from-main')
  expect(c.sh('cat content/retry-input.json')).toBe('local-only')
}, slow(60_000))

test('video recheck cannot publish a material whose parent appears only in ignored content', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh('printf "dist\nengine-state/last-run.json\n" > .gitignore && git add .gitignore && git commit -qm ignores && git push -q')
  c.sh(`mkdir -p content/materials/wood && echo '{"id":"wood","parent":"dist"}' > content/materials/wood/entity.json && git add content && git commit -qm material && git branch ${kept} && git reset -q --hard origin/main`)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    echo run-report > engine-state/last-run.json
    checks() {
      mkdir -p content/materials/dist
      echo '{"id":"dist"}' > content/materials/dist/entity.json
    }
    publish_kept video-recheck
  `)
  expect(log).toContain('the video recheck checkout changed during verification')
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/materials/wood/entity.json')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/content/materials/dist/entity.json')).toBe('{"id":"dist"}')
  expect(c.sh('cat engine-state/last-run.json')).toBe('run-report')
}, slow(60_000))

test('held recovery reports a published branch that could not be removed', () => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const held = `held/video-recheck/${when}`
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${held} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    git() {
      [ "$1 \${2:-} \${3:-}" != 'branch -q -D' ] || return 1
      command git "$@"
    }
    publish_kept video-recheck && exit 2
    echo stopped
  `)
  expect(log).toContain(`published ${held} but its local branch could not be removed`)
  expect(log).toContain('stopped')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.branches()).toEqual([held])
}, slow(60_000))

test('a fresh video publish archives another checkout file before the merge sweep can stage it', () => {
  const c = clone()
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  c.sh('echo stray > sources/local-only.txt')
  c.elsewhere()
  expect(c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    publish_fixture_video_recheck
  `)).toContain('pushed (GitHub deploys it)')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('sources/local-only.txt')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/sources/local-only.txt')).toBe('stray')
}, slow(60_000))

test.each(['kept', 'held'])('a %s video recheck replans with the final page photo', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  const page = 'content/guides/youtube-shared/vi.json'
  c.sh('echo before > content/curation.json && git add content/curation.json && git commit -qm calendar && git push -q')
  c.sh(`
    mkdir -p "$(dirname '${page}')"
    echo batch-photo > '${page}'
    echo rechecked > content/video.json
    echo batch-calendar > content/curation.json
    git add content && git commit -qm 'content: video guides checked again (fixture)'
    git branch '${branch}' && git reset -q --hard origin/main
  `)
  c.elsewhere(page, 'main-photo')
  c.sh(`
    echo editor > "$HOME/other/content/curation.json"
    echo new-code > "$HOME/other/code.txt"
    git -C "$HOME/other" add .
    git -C "$HOME/other" commit -qm editor
    git -C "$HOME/other" push -q
    git fetch -q origin
  `)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    pnpm() {
      cd "$AQ_VIDEO_RECONCILE_WORKTREE" || return 1
      case "$2" in
        sweep)
          test "$(cat '${page}')" = main-photo || return 1
          echo swept-photo > '${page}'
          ;;
        curate)
          test "$(cat content/curation.json)" = editor || return 1
          cat '${page}' > content/curation.json
          ;;
      esac
    }
    verify_cycle() { printf 'VERIFIED %s %s\n' "$(cat '${page}')" "$(cat content/curation.json)"; }
    publish_kept video-recheck
  `)
  expect(log).toContain('VERIFIED swept-photo swept-photo')
  expect(c.onMain(page)).toBe('swept-photo')
  expect(c.onMain('content/curation.json')).toBe('swept-photo')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each([
  ['fresh', 'verification'], ['fresh', 'rebase'], ['kept', 'rebase'], ['held', 'rebase'],
] as const)('a %s video process exit during %s leaves the original batch queued on restart', (lane, stage) => {
  const c = clone()
  const batch = c.sh(`
    echo rechecked > content/video.json
    ${stage === 'rebase' ? 'echo ours > content/a.json' : ':'}
    git add content && git commit -qm recheck && git rev-parse HEAD
  `)
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${lane}/video-recheck/${when}`
  if (lane !== 'fresh') c.sh(`git branch '${branch}' && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  if (stage === 'rebase') c.sh(`
    echo theirs > "$HOME/other/content/a.json"
    git -C "$HOME/other" commit -qam other && git -C "$HOME/other" push -q
  `)
  c.sh('git fetch -q origin')
  expect(() => c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    ${stage === 'verification' ? `
      verify_cycle() { git rev-parse HEAD > "$HOME/interrupted-head"; exit 77; }
    ` : `
      net() {
        if [ "$2" = rebase ]; then
          "$@" || true
          git rev-parse HEAD > "$HOME/interrupted-head"
          exit 77
        fi
        "$@"
      }
    `}
    ${lane === 'fresh' ? 'publish_fixture_video_recheck' : 'publish_kept video-recheck'}
  `)).toThrow()
  expect(c.sh('cat "$HOME/interrupted-head"')).not.toBe(batch)
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.branches()).toEqual(lane === 'fresh' ? [] : [branch])
  if (lane === 'fresh') expect(c.sh('git rev-parse refs/aquatome/video-recheck/pending')).toBe(batch)
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(log).toContain(`published ${lane === 'held' ? 'held' : 'kept'}/video-recheck/`)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('code.txt')).toBe('new-code')
  if (stage === 'rebase') expect(c.onMain('content/a.json')).toBe('ours')
  expect(c.branches()).toEqual([])
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test('video startup can recover an anchored commit before main advances', () => {
  const c = clone()
  const base = c.sh('git rev-parse HEAD')
  expect(() => c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    echo rechecked > content/video.json
    git add content/video.json
    tree=$(git write-tree)
    git() {
      if [ "$1" = update-ref ] && [ "$#" -ge 4 ] && [ "$4" = HEAD ]; then exit 77; fi
      command git "$@"
    }
    commit_video_recheck 'content: video guides checked again (fixture)' '${base}' "$tree" "$tree"
  `)).toThrow()
  expect(c.sh('git rev-parse HEAD')).toBe(base)
  const pending = 'refs/aquatome/video-recheck/pending'
  expect(c.sh(`git show '${pending}:content/video.json'`)).toBe('rechecked')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(log).toContain('published kept/video-recheck/')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test('video recovery publishes only the gated commit when HEAD moves before publishing', () => {
  const c = clone()
  const batch = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    parent=$(git rev-parse HEAD)
    echo rechecked > content/video.json
    git add content/video.json
    tree=$(git write-tree)
    commit_video_recheck 'content: video guides checked again (fixture)' "$parent" "$tree" "$tree"
    git rev-parse HEAD
  `)
  c.sh('echo ungated > content/ungated.json && git add content/ungated.json && git commit -qm ungated')
  const publish = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    verify_cycle() { echo VERIFIED; }
    push_video_recheck || echo refused
  `)
  expect(publish).toContain('refused')
  expect(publish).not.toContain('VERIFIED')
  expect(c.sh('git rev-parse refs/aquatome/video-recheck/pending')).toBe(batch)

  c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/ungated.json')).toBe('')
  expect(c.branches()).toEqual([])
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test('a fresh video recheck rejects a new parent after gating', () => {
  const c = clone()
  const remote = c.sh('git rev-parse origin/main')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    parent=$(git rev-parse HEAD)
    echo rechecked > content/video.json
    gate_or_keep 'content: video guides checked again' content engine-state docs/review
    git add content/video.json
    tree=$(git write-tree)
    echo ungated > content/ungated.json
    git add content/ungated.json && git commit -qm ungated
    git add content/video.json
    verify_cycle() { echo VERIFIED; }
    (commit_video_recheck 'content: video guides checked again (fixture)' "$parent" "$tree" "$tree" && push_video_recheck) || echo refused
  `)
  expect(log).toContain('refused')
  expect(log).not.toContain('VERIFIED')
  expect(c.sh('git ls-remote origin refs/heads/main | cut -f1')).toBe(remote)
  expect(c.branches()).toEqual([])
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
  expect(c.sh('git show :content/video.json')).toBe('rechecked')
}, slow(60_000))

test.each(['unchanged', 'late edit', 'gate failure', 'an unrelated staged edit'])('a fresh video recheck records its isolated gate output after %s', outcome => {
  const c = clone()
  c.sh('mkdir -p content/guides/example && echo old > content/guides/example/vi.json && echo public > README.md && git add content README.md && git commit -qm guide && git push -q')
  const guide = 'content/guides/example/vi.json'
  const tail = script('video-recheck.sh').split('sweep_new_video_recheck || exit 1\n')[1]!
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    video_batch_parent=$(git rev-parse HEAD)
    echo candidate > '${guide}'
    ${outcome === 'an unrelated staged edit' ? 'echo local > README.md && git add README.md' : ':'}
    pnpm() {
      if [ "$1 $2" = 'engine gate' ]; then
        local gate_root="\${AQ_VIDEO_GATE_WORKTREE:-$PWD}"
        test "$(cat "$gate_root/${guide}")" = candidate || return 1
        test "$(cat "$gate_root/README.md")" = public || return 1
        mkdir -p "$gate_root/engine-state" "$gate_root/docs/review"
        echo approved > "$gate_root/${guide}"
        ${outcome === 'late edit' ? `echo ungated > '${guide}'` : ':'}
        ${outcome === 'gate failure' ? 'return 1' : ':'}
      fi
    }
    verify_cycle() { echo "VERIFIED $(cat '${guide}')"; }
    ( ${tail}
    ) || echo refused
  `)
  expect(c.sh('git worktree list --porcelain | awk \'/^worktree / { count++ } END { print count }\'')).toBe('1')
  if (outcome === 'unchanged') {
    expect(log).toContain('VERIFIED approved')
    expect(c.onMain(guide)).toBe('approved')
    expect(c.branches()).toEqual([])
  } else if (outcome === 'gate failure') {
    expect(log).toContain('refused')
    expect(log).not.toContain('VERIFIED')
    expect(c.onMain(guide)).toBe('old')
    expect(c.branches()).toEqual([expect.stringMatching(/^gate-crashed\//)])
    expect(c.sh(`git show '${c.branches()[0]}:${guide}'`)).toBe('approved')
    expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
  } else {
    expect(log).toContain('refused')
    expect(log).not.toContain('VERIFIED')
    expect(c.onMain(guide)).toBe('old')
    if (outcome === 'late edit') expect(c.sh(`cat '${guide}'`)).toBe('ungated')
    else expect(c.sh('git show :README.md')).toBe('local')
    expect(c.sh(`git show 'refs/aquatome/video-recheck/pending:${guide}'`)).toBe('approved')
    expect(c.sh("git show 'refs/aquatome/video-recheck/pending:README.md'")).toBe('public')
    c.cycle(`
      source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
      recover_interrupted_video_recheck
      AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
      from_main
      publish_kept video-recheck
    `)
    expect(c.onMain(guide)).toBe('approved')
    expect(c.onMain('README.md')).toBe('public')
    expect(c.branches()).toEqual([])
  }
}, slow(60_000))

test.each(['fresh', 'kept', 'held'])('a %s video recheck rejects an unstaged publishing edit during reconciliation', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin')
  const remote = c.sh('git rev-parse origin/main')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    pnpm() {
      if [ "$1 $2" = 'engine sweep' ]; then
        echo ungated > content/video.json
        echo SWEEP-EDITED-OUTER
      fi
    }
    verify_cycle() { echo "VERIFIED $(cat content/video.json)"; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(log).toContain('SWEEP-EDITED-OUTER')
  expect(log).not.toContain('VERIFIED')
  expect(c.sh('git ls-remote origin refs/heads/main | cut -f1')).toBe(remote)
  const queued = c.branches()
  expect(queued).toHaveLength(1)
  expect(c.sh(`git rev-parse ${queued[0]}`)).toBe(batch)
}, slow(60_000))

test('video publishing requires a recorded gated commit', () => {
  const c = clone()
  c.sh('echo ungated > content/ungated.json && git add content/ungated.json && git commit -qm ungated')
  const publish = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    verify_cycle() { echo VERIFIED; }
    push_video_recheck || echo refused
  `)
  expect(publish).toContain('refused')
  expect(publish).not.toContain('VERIFIED')
  expect(c.onMain('content/ungated.json')).toBe('')
  expect(c.branches()).toEqual([])
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test.each([false, true])('video startup recovers a first pending-ref lock (queue refs locked: %s)', queueLocked => {
  const c = clone()
  const base = c.sh('git rev-parse HEAD')
  expect(() => c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    echo rechecked > content/video.json
    git add content/video.json
    tree=$(git write-tree)
    mkdir -p .git/refs/aquatome/video-recheck
    touch .git/refs/aquatome/video-recheck/pending.lock
    ${queueLocked ? `
      git() {
        if [ "$1" = branch ] && [ "$#" -ge 3 ] && [[ "$3" = kept/video-recheck/* ]]; then return 1; fi
        command git "$@"
      }
    ` : ''}
    commit_video_recheck 'content: video guides checked again (fixture)' '${base}' "$tree" "$tree"
  `)).toThrow()
  expect(c.sh('git rev-parse HEAD')).toBe(base)
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/pending')).toBe('')
  c.sh('rm .git/refs/aquatome/video-recheck/pending.lock')
  const restart = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(restart).toContain('published kept/video-recheck/')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.branches()).toEqual([])
  expect(c.sh('find "$HOME/.cache/aquatome/engine-check-failures" -maxdepth 1 -name "video-recheck-queue.*"')).toBe('')
}, slow(60_000))

test('video startup archives a failed detached sweep and publishes the queued batch', () => {
  const c = clone()
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  c.elsewhere('content/a.json', 'on-main')
  c.sh('git fetch -q origin')
  const failed = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    pnpm() {
      if [ "$1 $2" = 'engine sweep' ]; then echo partial > content/a.json; return 1; fi
    }
    publish_fixture_video_recheck || echo refused
  `)
  expect(failed).toContain('refused')
  expect(c.sh('git branch --show-current')).toBe('')
  expect(c.sh('cat content/a.json')).toBe('partial')
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.branches()).toHaveLength(1)

  const blocked = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    TEST_FAILURES_DIR="$HOME/blocked-archive"
    touch "$TEST_FAILURES_DIR"
    recover_interrupted_video_recheck || echo refused
  `)
  expect(blocked).toContain('refused')
  expect(c.sh('cat content/a.json')).toBe('partial')

  const restart = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(restart).toContain('published kept/video-recheck/')
  const patch = c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-checkout.*/working.patch')
  expect(patch).toContain('-on-main')
  expect(patch).toContain('+partial')
  expect(c.onMain('content/a.json')).toBe('on-main')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each([
  ['fresh', 'not sent'], ['fresh', 'sent'], ['fresh', 'sent then reverted'], ['fresh', 'sent but unconfirmed'],
  ['fresh', 'lands during handoff'], ['kept', 'not sent'], ['kept', 'sent then reverted'], ['held', 'sent then reverted'],
] as const)('%s video startup recovers an interrupted push that was %s', (lane, outcome) => {
  const c = clone()
  const batch = c.sh("echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD")
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  if (lane !== 'fresh') c.sh(`git branch '${lane}/video-recheck/${when}' && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  c.sh('git fetch -q origin')
  expect(() => c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    sleep() { :; }
    net() {
      ${outcome === 'sent but unconfirmed' ? 'if [ "$2" = fetch ] && [ -f "$HOME/outgoing" ]; then return 1; fi' : ':'}
      if [ "$2" = push ]; then
        printf '%s\n' "${'${5%:refs/heads/main}'}" > "$HOME/outgoing"
        ${outcome === 'not sent' || outcome === 'lands during handoff' ? ':' : '"$@" || return 1'}
        ${outcome === 'sent but unconfirmed' ? 'return 1' : 'exit 77'}
      fi
      "$@"
    }
    ${lane === 'fresh' ? 'publish_fixture_video_recheck' : 'publish_kept video-recheck'}
  `)).toThrow()
  if (outcome === 'sent but unconfirmed') expect(c.branches()).toHaveLength(1)
  const outgoing = c.sh('cat "$HOME/outgoing"')
  expect(outgoing).not.toBe(batch)
  if (outcome === 'sent then reverted') c.sh(`
    git -C "$HOME/other" pull -q --ff-only
    git -C "$HOME/other" revert --no-edit '${outgoing}'
    git -C "$HOME/other" push -q
  `)
  c.sh('git fetch -q origin')
  const restart = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    ${outcome === 'lands during handoff' ? `
      git -C "$HOME/other" fetch -q "$PWD" '${outgoing}'
      git -C "$HOME/other" push -q origin '${outgoing}:refs/heads/main'
      git -C "$HOME/other" reset -q --hard '${outgoing}'
      git -C "$HOME/other" revert --no-edit '${outgoing}'
      git -C "$HOME/other" push -q
      git fetch -q origin
    ` : ''}
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    verify_cycle() { echo VERIFIED; }
    publish_kept video-recheck
  `)
  expect(restart.includes('VERIFIED')).toBe(outcome === 'not sent')
  expect(c.onMain('content/video.json')).toBe(outcome === 'sent then reverted' || outcome === 'lands during handoff' ? '' : 'rechecked')
  expect(c.branches()).toEqual([])
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test('an interrupted queue handoff keeps the existing held video recheck', () => {
  const c = clone()
  const held = 'held/video-recheck/20261128T030000'
  const batch = c.sh("echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD")
  const saved = c.cycle(`
    echo swept > content/sweep.json && git add content/sweep.json && git commit -qm sweep
    video_recheck_recovery_commit '${batch}'
  `)
  c.sh(`git branch '${held}' '${saved}' && git update-ref refs/aquatome/video-recheck/pending '${batch}'`)
  c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
  `)
  expect(c.branches()).toEqual([held])
  expect(c.sh(`git rev-parse '${held}'`)).toBe(saved)
  expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
}, slow(60_000))

test('video recovery archives a stray file before retrying a rejected push', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  c.elsewhere()
  expect(c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    net() {
      if [ "$2" = push ] && [ ! -f "$HOME/rejected-first" ]; then
        touch "$HOME/rejected-first"
        echo stray > sources/local-only.txt
        echo concurrent > "$HOME/other/content/disjoint.json"
        git -C "$HOME/other" add content/disjoint.json
        git -C "$HOME/other" commit -qm concurrent
        git -C "$HOME/other" push -q
        return 1
      fi
      "$@"
    }
    publish_kept video-recheck
  `)).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/disjoint.json')).toBe('concurrent')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('sources/local-only.txt')).toBe('')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/sources/local-only.txt')).toBe('stray')
}, slow(60_000))

test.each(['fresh', 'kept'])('a %s video recheck pushes the commit whose tree passed', kind => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  if (kind === 'kept') c.sh(`git branch ${kept} && git reset -q --hard origin/main`)
  c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    net() {
      if [ "$2" = push ]; then
        echo unverified > content/newer.json
        git add content/newer.json
        git commit -qm "local HEAD moved"
      fi
      "$@"
    }
    ${kind === 'kept' ? 'publish_kept video-recheck' : 'publish_fixture_video_recheck'}
  `)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/newer.json')).toBe('')
}, slow(60_000))

test.each(['fresh', 'kept', 'held'])('a %s video recheck keeps its batch when the checkout moves after a rejected push', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    sleep() { :; }
    net() {
      if [ "$2" = push ] && [ ! -f "$HOME/rejected-first" ]; then
        touch "$HOME/rejected-first"
        echo concurrent > "$HOME/other/content/disjoint.json"
        git -C "$HOME/other" add content/disjoint.json
        git -C "$HOME/other" commit -qm concurrent
        git -C "$HOME/other" push -q
        git fetch -q origin && git reset -q --hard origin/main
        return 1
      fi
      "$@"
    }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(log).toContain(kind === 'fresh' ? 'refused' : 'isn\'t published yet')
  expect(c.onMain('content/disjoint.json')).toBe('concurrent')
  expect(c.onMain('content/video.json')).toBe('')
  const branches = c.branches()
  if (kind === 'fresh') expect(branches).toEqual([expect.stringMatching(/^kept\/video-recheck\/\d{8}T\d{6}$/)])
  else expect(branches).toEqual([branch])
  expect(c.sh(`git show ${branches[0]}:content/video.json`)).toBe('rechecked')
}, slow(60_000))

test.each([
  ['fresh', 'fetch'], ['kept', 'fetch'], ['held', 'fetch'],
  ['fresh', 'clash retry'], ['kept', 'clash retry'], ['held', 'clash retry'],
] as const)('a %s video recheck rebases only its recorded batch if HEAD advances during %s', (kind, stage) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  c.sh("echo rechecked > content/video.json && git add content/video.json && git commit -qm 'content: video guides checked again (fixture)'")
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  if (stage === 'clash retry') {
    c.sh('echo editor > "$HOME/other/content/video.json" && git -C "$HOME/other" add content/video.json && git -C "$HOME/other" commit -qm editor && git -C "$HOME/other" push -q')
  }
  c.sh('git fetch -q origin')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    net() {
      if ${stage === 'fetch' ? '[ "$2" = fetch ]' : '{ [ "$2" = rebase ] && [ "$4" = -X ]; }'} && [ ! -f "$HOME/head-advanced" ]; then
        echo ungated > content/ungated.json
        git add content/ungated.json && git commit -qm ungated || return 1
        touch "$HOME/head-advanced"
      fi
      "$@"
    }
    verify_cycle() {
      if [ -e content/ungated.json ]; then echo VERIFIED-UNGATED; else echo VERIFIED-GATED; fi
    }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck' : 'publish_kept video-recheck'}
  `)
  expect(c.sh('test -f "$HOME/head-advanced" && echo advanced')).toBe('advanced')
  expect(log).toContain('VERIFIED-GATED')
  expect(log).not.toContain('VERIFIED-UNGATED')
  // Recovery keeps a page that main already published at the same path.
  expect(c.onMain('content/video.json')).toBe(kind !== 'fresh' && stage === 'clash retry' ? 'editor' : 'rechecked')
  expect(c.onMain('code.txt')).toBe('new-code')
  expect(c.onMain('content/ungated.json')).toBe('')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each(['fresh', 'kept', 'held'])('a %s video recheck rejects a commit added after rebase completes', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  c.sh('git fetch -q origin')
  const interrupted = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    sleep() { :; }
    net() {
      "$@" || return "$?"
      if [ "$2" = rebase ] && [ "$3" = -q ] && [ ! -f "$HOME/after-rebase" ]; then
        echo ungated > content/ungated.json
        git add content/ungated.json && git commit -qm ungated || return 1
        touch "$HOME/after-rebase"
      fi
    }
    verify_cycle() { echo VERIFIED; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(c.sh('test -f "$HOME/after-rebase" && echo advanced')).toBe('advanced')
  expect(interrupted).not.toContain('VERIFIED')
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.onMain('content/ungated.json')).toBe('')
  const queued = c.branches()
  expect(queued).toHaveLength(1)
  expect(c.sh(`git rev-parse ${queued[0]}`)).toBe(batch)

  c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    recover_interrupted_video_recheck
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    from_main
    publish_kept video-recheck
  `)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/ungated.json')).toBe('')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each([
  ['fresh', false], ['kept', false], ['held', false],
  ['fresh', true], ['kept', true], ['held', true],
] as const)('a %s video recheck rejects a commit inserted during replay (later pick: %s)', (kind, laterPick) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  if (laterPick) c.sh('echo swept > content/sweep.json && git add content/sweep.json && git commit -qm sweep')
  const batch = c.sh('git rev-parse HEAD')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  c.sh('git fetch -q origin')
  const remote = c.sh('git rev-parse origin/main')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    sleep() { :; }
    net() {
      if [ "$2" = rebase ]; then
        git rebase --exec 'if [ ! -e "$HOME/inserted-during-replay" ]; then echo ungated > content/ungated.json && git add content/ungated.json && env -u GIT_REFLOG_ACTION git commit -qm ungated && touch "$HOME/inserted-during-replay"; fi' "\${@:3}"
      else
        "$@"
      fi
    }
    verify_cycle() { echo VERIFIED; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(c.sh('test -f "$HOME/inserted-during-replay" && echo inserted')).toBe('inserted')
  expect(log).not.toContain('VERIFIED')
  expect(c.sh('git ls-remote origin refs/heads/main | cut -f1')).toBe(remote)
  const queued = c.branches()
  expect(queued).toHaveLength(1)
  expect(c.sh(`git rev-parse ${queued[0]}`)).toBe(batch)
}, slow(60_000))

test.each([0, 1])('a fresh video recheck keeps its batch when checkout moves at the final pull (exit %i)', status => {
  const c = clone()
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    net() {
      if [ "$2" = pull ] && [ "$4" = --no-rebase ] && [ ! -f "$HOME/moved-checkout" ]; then
        touch "$HOME/moved-checkout"
        git reset -q --hard origin/main
        return ${status}
      fi
      "$@"
    }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('refused')
  expect(c.onMain('content/video.json')).toBe('')
  const branches = c.branches()
  expect(branches).toEqual([expect.stringMatching(/^kept\/video-recheck\/\d{8}T\d{6}$/)])
  expect(c.sh(`git show ${branches[0]}:content/video.json`)).toBe('rechecked')
}, slow(60_000))

test('a fresh video recheck rejects an unexpected same-tree commit after the final pull', () => {
  const c = clone()
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    net() {
      "$@" || return "$?"
      if [ "$2" = pull ] && [ "$4" = --no-rebase ]; then
        git commit --allow-empty -qm 'unexpected local commit'
      fi
    }
    verify_cycle() { echo VERIFIED; }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('VERIFIED')
  expect(log).toContain('refused')
  expect(c.onMain('content/video.json')).toBe('')
  const queued = c.branches()
  expect(queued).toHaveLength(1)
  expect(c.sh(`git rev-parse ${queued[0]}`)).toBe(batch)
}, slow(60_000))

test.each(['fresh', 'kept', 'held'])('a %s video recheck rebases its batch even when HEAD resets to main', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    net() {
      if [ "$2" = rebase ] && [ ! -f "$HOME/moved-checkout" ]; then
        touch "$HOME/moved-checkout"
        git reset -q --hard origin/main
      fi
      "$@"
    }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck' : 'publish_kept video-recheck'}
  `)
  expect(c.sh('test -f "$HOME/moved-checkout" && echo reset')).toBe('reset')
  expect(log).toContain(kind === 'fresh' ? 'pushed (GitHub deploys it)' : `published ${branch}`)
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('code.txt')).toBe('new')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each([false, true])('a fresh video recheck handles a patch main already applied, then reverted: %s', reverted => {
  const c = clone()
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  c.elsewhere('content/video.json', 'rechecked')
  if (reverted) c.sh('git -C "$HOME/other" revert --no-edit HEAD && git -C "$HOME/other" push -q')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain(reverted ? 'refused' : 'pushed (GitHub deploys it)')
  expect(c.onMain('content/video.json')).toBe(reverted ? '' : 'rechecked')
  const branches = c.branches()
  expect(branches).toHaveLength(reverted ? 1 : 0)
  if (reverted) expect(c.sh(`git show ${branches[0]}:content/video.json`)).toBe('rechecked')
}, slow(60_000))

test.each([
  ['equivalent', false],
  ['equivalent', true],
  ['exact', false],
  ['exact', true],
] as const)('kept video recovery requires the guide change as well as the sweep (%s commit, reverted: %s)', (identity, reverted) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const kept = `kept/video-recheck/${when}`
  const guide = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm "content: video guides checked again 2026-11-28" && git rev-parse HEAD')
  const candidate = c.sh(`echo swept > content/sweep.json && git add content/sweep.json && git commit -qm sweep && git branch ${kept} && git rev-parse HEAD`)
  c.sh('git reset -q --hard origin/main')
  if (identity === 'exact') {
    c.sh(`git push -q origin ${guide}:refs/heads/main`)
    c.elsewhere('code.txt', 'new')
  } else {
    c.elsewhere('content/video.json', 'rechecked')
  }
  if (reverted) c.sh(`git -C "$HOME/other" revert --no-edit ${identity === 'exact' ? guide : 'HEAD'} && git -C "$HOME/other" push -q`)
  const remoteHead = () => c.sh('git ls-remote origin refs/heads/main | cut -f1')
  const before = remoteHead()
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    publish_kept video-recheck
  `)
  if (reverted) {
    expect(log).toContain("isn't published yet")
    expect(remoteHead()).toBe(before)
    expect(c.branches()).toEqual([kept])
    expect(c.sh(`git rev-parse ${kept}`)).toBe(candidate)
    expect(c.onMain('content/video.json')).toBe('')
    expect(c.onMain('content/sweep.json')).toBe('')
  } else {
    expect(log).toContain(`LOG published ${kept}`)
    expect(c.branches()).toEqual([])
    expect(c.onMain('content/video.json')).toBe('rechecked')
    expect(c.onMain('content/sweep.json')).toBe('swept')
  }
}, slow(60_000))

test.each(['fresh', 'kept', 'held'])('a %s video recheck preserves its batch if the sweep resets the checkout', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    pnpm() {
      if [ "$2" = sweep ]; then git reset -q --hard origin/main; fi
    }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(log).toContain(kind === 'fresh' ? 'refused' : "isn't published yet")
  expect(c.onMain('content/video.json')).toBe('')
  const branches = c.branches()
  if (kind === 'fresh') expect(branches).toEqual([expect.stringMatching(/^kept\/video-recheck\/\d{8}T\d{6}$/)])
  else expect(branches).toEqual([branch])
  expect(c.sh(`git rev-parse ${branches[0]}`)).toBe(batch)
}, slow(60_000))

test.each([
  ['fresh', false], ['kept', false], ['held', false],
  ['fresh', true], ['kept', true], ['held', true],
] as const)('a %s video recheck rejects a commit made during the sweep (sweep edits: %s)', (kind, edited) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const branch = `${kind}/video-recheck/${when}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  if (kind !== 'fresh') c.sh(`git branch ${branch} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin')
  const remote = () => c.sh('git ls-remote origin refs/heads/main | cut -f1')
  const previous = remote()
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    pnpm() {
      if [ "$1 $2" = 'engine sweep' ]; then
        echo ungated > content/ungated.json
        git add content/ungated.json && git commit -qm ungated || return 1
        echo SWEEP-MOVED-HEAD
        ${edited ? 'echo swept > content/a.json' : ':'}
      fi
    }
    verify_cycle() { echo VERIFIED; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(log).toContain('SWEEP-MOVED-HEAD')
  expect(log).not.toContain('VERIFIED')
  expect(remote()).toBe(previous)
  const queued = c.branches()
  expect(queued).toHaveLength(1)
  expect(c.sh(`git rev-parse ${queued[0]}`)).toBe(batch)
}, slow(60_000))

test.each([
  ['held', false, false],
  ['kept', false, false],
  ['held', true, false],
  ['held', true, true],
] as const)('a fresh video recheck retains its %s status when recovery refs are locked (both: %s, pending: %s)', (queue, blockBoth, pendingLocked) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const suffix = queue === 'kept' ? '-out1' : ''
  const locked = `${queue}/video-recheck/${when}${suffix}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  const backup = `${queue}/video-recheck/${when}_${batch}${suffix}`
  c.sh(`mkdir -p .git/refs/heads/${queue}/video-recheck && touch .git/refs/heads/${locked}.lock`)
  if (blockBoth) c.sh(`touch .git/refs/heads/${backup}.lock`)
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    date() {
      if [ "$*" = '-u +%Y%m%dT%H%M%S' ]; then echo '${when}'; else command date "$@"; fi
    }
    checks() {
      ${pendingLocked ? 'touch .git/refs/aquatome/video-recheck/pending.lock' : ':'}
      echo '${queue === 'kept' ? 'Error: Test timed out in 30000ms.' : 'real check failure'}'
      return 1
    }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('refused')
  if (blockBoth) {
    expect(log).toContain('could not queue the failed video recheck')
    expect(c.branches()).toEqual([])
    const archived = pendingLocked ? locked : backup
    expect(c.sh(`git -C "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-ref.* rev-parse refs/heads/${archived}`)).toBe(batch)
    if (pendingLocked) c.sh('rm .git/refs/aquatome/video-recheck/pending.lock')
    for (const attempt of [1, 2]) {
      expect(c.cycle(`
        source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
        git() {
          if [ "$1" = branch ] && [ "$#" -ge 3 ] && [[ "$3" = held/video-recheck/* ]]; then return 1; fi
          command git "$@"
        }
        recover_interrupted_video_recheck || echo 'queued status retained'
      `)).toContain('queued status retained')
      expect(c.sh('find "$HOME/.cache/aquatome/engine-check-failures" -maxdepth 1 -type d -name "video-recheck-ref.*" | wc -l'), `restart ${attempt}`).toBe('1')
    }
    const restart = c.cycle(`
      source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
      recover_interrupted_video_recheck
      AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
      from_main
      verify_cycle() { echo UNEXPECTED-VERIFY; }
      publish_kept video-recheck
    `)
    expect(restart).not.toContain('UNEXPECTED-VERIFY')
    expect(c.branches()).toHaveLength(1)
    expect(c.branches()[0]?.startsWith('held/video-recheck/')).toBe(true)
    expect(c.sh(`git rev-parse ${c.branches()[0]}`)).toBe(batch)
    expect(c.sh('git for-each-ref refs/aquatome/video-recheck/')).toBe('')
  } else {
    expect(c.branches()).toEqual([backup])
    expect(c.sh(`git rev-parse ${backup}`)).toBe(batch)
  }
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

test.each([false, true])('a fresh video recheck saves interrupted work when its kept refs are locked (both: %s)', blockBoth => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const kept = `kept/video-recheck/${when}`
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  const backup = `${kept}_${batch}`
  c.sh(`mkdir -p .git/refs/heads/kept/video-recheck && touch .git/refs/heads/${kept}.lock`)
  if (blockBoth) c.sh(`touch .git/refs/heads/${backup}.lock`)
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    date() {
      if [ "$*" = '-u +%Y%m%dT%H%M%S' ]; then echo '${when}'; else command date "$@"; fi
    }
    checks() { echo changed > content/a.json; }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('refused')
  expect(c.onMain('content/video.json')).toBe('')
  if (blockBoth) {
    expect(c.branches()).toEqual([])
    expect(c.sh(`git -C "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-ref.* rev-parse refs/heads/${backup}`)).toBe(batch)
  } else {
    expect(c.branches()).toEqual([backup])
    expect(c.sh(`git rev-parse ${backup}`)).toBe(batch)
  }
}, slow(60_000))

test.each(['', '-out2'])('two video batches with the same recovery time both publish from the kept queue (existing count: %j)', count => {
  const c = clone()
  const when = '20261127T030000'
  const kept = `kept/video-recheck/${when}${count}`
  const earlier = c.sh(`echo first > content/first.json && git add content/first.json && git commit -qm 'content: video guides checked again (first)' && git branch ${kept} && git rev-parse HEAD`)
  c.sh("git reset -q --hard origin/main && echo second > content/second.json && git add content/second.json && git commit -qm 'content: video guides checked again (second)'")
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    date() {
      if [ "$*" = '-u +%Y%m%dT%H%M%S' ]; then echo '${when}'; else command date "$@"; fi
    }
    keep_lost_push video-recheck refused
    git reset -q --hard origin/main
    test "$(git rev-parse ${kept})" = '${earlier}'
    publish_kept video-recheck
  `)
  expect(log).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/first.json')).toBe('first')
  expect(c.onMain('content/second.json')).toBe('second')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test.each([
  ['fresh', false, false], ['kept', false, false], ['held', false, false],
  ['fresh', true, false], ['kept', true, false], ['held', true, false],
  ['fresh', false, true], ['kept', false, true], ['held', false, true],
] as const)('a %s video recheck replans main’s calendar after an earlier guide conflict (failure: %s, main moves: %s)', (kind, fails, mainMoves) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const saved = `${kind}/video-recheck/${when}`
  c.sh('echo before > content/curation.json && echo before > content/video.json && git add content && git commit -qm calendar && git push -q')
  const batch = c.sh(`
    echo rechecked > content/video.json
    git add content/video.json
    git commit -qm 'content: video guides checked again (fixture)'
    echo removed > content/curation.json
    git add content/curation.json
    git commit -qm 'content: sweep (fixture)'
    git rev-parse HEAD
  `)
  if (kind !== 'fresh') c.sh(`git branch ${saved} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  c.sh(`
    echo other-guide > "$HOME/other/content/video.json"
    ${mainMoves ? ':' : 'echo editor > "$HOME/other/content/curation.json"'}
    git -C "$HOME/other" add content
    git -C "$HOME/other" commit -qm editor
    git -C "$HOME/other" push -q
    git fetch -q origin
    git branch --unset-upstream
  `)
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    sleep() { :; }
    ${mainMoves ? `
      net() {
        if [ "$2" = rebase ] && [ ! -e "$HOME/editor-landed" ]; then
          local status=0
          "$@" || status=$?
          if [ "$status" != 0 ]; then
            echo editor > "$HOME/other/content/curation.json"
            git -C "$HOME/other" add content/curation.json &&
              git -C "$HOME/other" commit -qm 'calendar editor' &&
              git -C "$HOME/other" push -q || return 1
            touch "$HOME/editor-landed"
          fi
          return "$status"
        fi
        "$@"
      }
    ` : ''}
    pnpm() {
      [ "$1 $2" = "engine curate" ] || return 0
      cd "$AQ_VIDEO_RECONCILE_WORKTREE" || return 1
      printf 'CURATE %s\n' "$(cat content/curation.json)"
      ${fails ? 'echo incomplete > content/curation.json; return 1' : 'printf "%s, replanned\n" "$(cat content/curation.json)" > content/planned && mv content/planned content/curation.json'}
    }
    verify_cycle() { printf 'VERIFIED %s\n' "$(cat content/curation.json)"; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(log).toContain('CURATE editor')
  if (fails) {
    expect(log).not.toContain('VERIFIED')
    expect(c.onMain('content/curation.json')).toBe('editor')
    expect(c.onMain('content/video.json')).toBe('other-guide')
    const branches = c.branches()
    expect(branches).toHaveLength(1)
    expect(c.sh(`git rev-parse ${branches[0]}`)).toBe(batch)
  } else {
    const verified = log.match(/^VERIFIED .*$/gm)
    expect(verified).toEqual(mainMoves ? ['VERIFIED removed', 'VERIFIED editor, replanned'] : ['VERIFIED editor, replanned'])
    expect(c.onMain('content/curation.json')).toBe('editor, replanned')
    expect(c.onMain('content/video.json')).toBe('rechecked')
    expect(c.branches()).toEqual([])
  }
}, slow(60_000))

test.each([
  ['fresh', 'undo'], ['kept', 'undo'],
  ['fresh', 'cherry-picked'], ['kept', 'cherry-picked'], ['held', 'cherry-picked'],
  ['kept', 'guide reverted'], ['kept', 'replan failed'],
  ['fresh', 'main reverted'], ['kept', 'main reverted'], ['held', 'main reverted'], ['kept', 'merged revert'],
] as const)('a %s video recheck preserves main’s calendar after %s', (kind, history) => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const saved = `${kind}/video-recheck/${when}`
  c.sh('echo before > content/curation.json && git add content/curation.json && git commit -qm calendar && git push -q')
  const guide = c.sh("echo rechecked > content/video.json && git add content/video.json && git commit -qm 'content: video guides checked again (fixture)' && git rev-parse HEAD")
  const calendar = c.sh("echo batch-calendar > content/curation.json && git commit -qam 'sweep calendar' && git rev-parse HEAD")
  if (history === 'undo') c.sh('git revert --no-edit HEAD')
  const batch = c.sh('git rev-parse HEAD')
  const editorReverted = history === 'main reverted' || history === 'merged revert'
  const mainCalendar = editorReverted ? 'before' : 'editor'
  if (kind !== 'fresh') c.sh(`git branch ${saved} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new-code')
  c.sh(`
    git -C "$HOME/other" fetch -q "$PWD" '${calendar}'
    ${history === 'guide reverted' ? `git -C "$HOME/other" cherry-pick '${guide}' && git -C "$HOME/other" revert --no-edit HEAD` : ':'}
    ${history === 'merged revert' ? 'git -C "$HOME/other" switch -qc editorial' : ':'}
    ${history === 'undo' ? ':' : `git -C "$HOME/other" cherry-pick '${calendar}'`}
    ${editorReverted ? 'git -C "$HOME/other" revert --no-edit HEAD' : `
      echo editor > "$HOME/other/content/curation.json"
      git -C "$HOME/other" commit -qam 'editor changes calendar'
    `}
    ${history === 'merged revert' ? 'git -C "$HOME/other" switch -q main && git -C "$HOME/other" merge -q --no-ff editorial -m "editorial changes"' : ':'}
    git -C "$HOME/other" push -q
    git fetch -q origin
  `)
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    pnpm() {
      [ "$1 $2" = "engine curate" ] || return 0
      cd "$AQ_VIDEO_RECONCILE_WORKTREE" || return 1
      printf 'CURATE %s\n' "$(cat content/curation.json)"
      ${history === 'replan failed' ? 'echo incomplete > content/curation.json; return 1' : `echo ${mainCalendar}-replanned > content/curation.json`}
    }
    verify_cycle() { printf 'VERIFIED %s\n' "$(cat content/curation.json)"; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  if (history !== 'guide reverted') expect(log).toContain(`CURATE ${mainCalendar}`)
  if (history === 'guide reverted' || history === 'replan failed') {
    expect(log).not.toContain('VERIFIED')
    expect(c.onMain('content/curation.json')).toBe('editor')
    expect(c.onMain('content/video.json')).toBe('')
    expect(c.branches()).toEqual([saved])
    expect(c.sh(`git rev-parse ${saved}`)).toBe(batch)
  } else {
    expect(log).toContain(`VERIFIED ${mainCalendar}-replanned`)
    expect(c.onMain('content/curation.json')).toBe(`${mainCalendar}-replanned`)
    expect(c.onMain('content/video.json')).toBe('rechecked')
    expect(c.branches()).toEqual([])
  }
}, slow(60_000))

test('a fresh video recheck publishes to origin/main without a configured upstream', () => {
  const c = clone()
  c.sh('git branch --unset-upstream && echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck')
  c.elsewhere('code.txt', 'from-main')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('pushed (GitHub deploys it)')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('code.txt')).toBe('from-main')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test('a fresh video recheck keeps the batch when origin/main cannot be resolved', () => {
  const c = clone()
  const batch = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git rev-parse HEAD')
  c.sh('git update-ref -d refs/remotes/origin/main')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD^)
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain("could not find the batch's base on origin/main")
  const branches = c.branches()
  expect(branches).toEqual([expect.stringMatching(/^kept\/video-recheck\/\d{8}T\d{6}$/)])
  expect(c.sh(`git rev-parse ${branches[0]}`)).toBe(batch)
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

test('video recheck treats empty fixture review directories as verification inputs', () => {
  const c = clone()
  const path = 'apps/site/test/engine-state/reviews'
  c.sh(`mkdir -p ${path}`)
  const log = c.cycle(`
    if video_recheck_tree >/dev/null; then echo clean; else echo dirty; fi
    prepare_video_recheck
  `)
  expect(log).toContain('dirty')
  expect(c.sh(`test ! -d ${path} && echo removed`)).toBe('removed')
}, slow(60_000))

test('kept video recovery preserves the batch when main has its exact tip but reverts the guide', () => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const kept = `kept/video-recheck/${when}`
  const guide = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm "content: video guides checked again 2026-11-28" && git rev-parse HEAD')
  const candidate = c.sh(`echo swept > content/sweep.json && git add content/sweep.json && git commit -qm sweep && git branch ${kept} && git rev-parse HEAD`)
  c.sh(`git push -q origin ${candidate}:refs/heads/main && git revert --no-edit ${guide} && git push -q`)
  const remoteHead = () => c.sh('git ls-remote origin refs/heads/main | cut -f1')
  const reverted = remoteHead()
  const log = c.cycle('AQ_SCRIPT_HEAD=$(git rev-parse HEAD); publish_kept video-recheck')
  expect(log).toContain("isn't published yet")
  expect(remoteHead()).toBe(reverted)
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.onMain('content/sweep.json')).toBe('swept')
  expect(c.branches()).toEqual([kept])
  expect(c.sh(`git rev-parse ${kept}`)).toBe(candidate)
}, slow(60_000))

test('a fresh video recheck keeps the original batch when main reverts its guide during verification', () => {
  const c = clone()
  const candidate = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm "content: video guides checked again 2026-11-28" && git rev-parse HEAD')
  c.elsewhere('content/video.json', 'rechecked')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    checks() {
      if [ ! -f "$HOME/reverted" ]; then
        test -f content/video.json
        git -C "$HOME/other" revert --no-edit HEAD >/dev/null
        git -C "$HOME/other" push -q
        touch "$HOME/reverted"
      fi
    }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('refused')
  const branches = c.branches()
  expect(branches).toEqual([expect.stringMatching(/^kept\/video-recheck\/\d{8}T\d{6}$/)])
  expect(c.sh(`git rev-parse ${branches[0]}`)).toBe(candidate)
  expect(c.onMain('content/video.json')).toBe('')
  expect(c.sh('git ls-remote origin refs/heads/main | cut -f1')).toBe(c.sh('git -C "$HOME/other" rev-parse HEAD'))
}, slow(60_000))

test.each(['fresh', 'kept'])('a %s video recheck retains its original batch when tests fail on newer main', kind => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const candidate = c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm "content: video guides checked again 2026-11-28" && git rev-parse HEAD && git push -q')
  if (kind === 'kept') c.sh(`git branch kept/video-recheck/${when} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'broken')
  const sweep = `
    pnpm() {
      if [ "$2" = sweep ]; then echo swept > "$AQ_VIDEO_RECONCILE_WORKTREE/content/sweep.json"; fi
    }
  `
  const failed = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    ${sweep}
    checks() { test ! -f code.txt; }
    ${kind === 'fresh' ? 'publish_fixture_video_recheck || echo refused' : 'publish_kept video-recheck'}
  `)
  expect(failed).toContain('failed')
  const branches = c.branches()
  expect(branches).toEqual([expect.stringMatching(/^held\/video-recheck\/\d{8}T\d{6}$/)])
  const [held] = branches
  expect(c.sh(`git rev-parse ${held}^1`)).toBe(candidate)
  expect(c.sh(`git show ${held}^2:code.txt`)).toBe('broken')
  expect(c.sh(`git show ${held}^2:content/sweep.json`)).toBe('swept')
  expect(c.cycle('publish_kept video-recheck')).toBe('')
  c.sh('git -C "$HOME/other" revert --no-edit HEAD && git -C "$HOME/other" push -q && git fetch -q origin')
  const recovered = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    ${sweep}
    checks() { test ! -f code.txt; }
    publish_kept video-recheck
  `)
  expect(recovered).toContain(`LOG published ${held}`)
  expect(c.branches()).toEqual([])
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('content/sweep.json')).toBe('swept')
  expect(c.onMain('code.txt')).toBe('')
  expect(c.sh(`git merge-base --is-ancestor ${candidate} origin/main && echo retained`)).toBe('retained')
}, slow(60_000))

test('a fresh video recheck sweeps new main after the final pull advances the tree', () => {
  const c = clone()
  c.sh('echo rechecked > content/video.json && git add content/video.json && git commit -qm "content: video guides checked again 2026-11-28"')
  c.elsewhere('content/video.json', 'rechecked')
  const log = c.cycle(`
    source '${join(ROOT, 'scripts/video-recheck-publish.sh')}'
    AQ_SCRIPT_HEAD=$(git rev-parse '@{u}')
    pnpm() {
      cd "$AQ_VIDEO_RECONCILE_WORKTREE" || return 1
      if [ "$2" = photo-privacy ] && [ -f engine-state/old-record.json ]; then
        git mv engine-state/old-record.json engine-state/new-record.json
      fi
    }
    checks() {
      if [ ! -f "$HOME/advanced" ]; then
        mkdir -p "$HOME/other/engine-state"
        echo migrated > "$HOME/other/engine-state/old-record.json"
        git -C "$HOME/other" add engine-state/old-record.json
        git -C "$HOME/other" commit -qm incoming
        git -C "$HOME/other" push -q
        touch "$HOME/advanced"
      fi
      test ! -f engine-state/old-record.json
    }
    publish_fixture_video_recheck || echo refused
  `)
  expect(log).toContain('pushed (GitHub deploys it)')
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.onMain('engine-state/new-record.json')).toBe('migrated')
  expect(c.onMain('engine-state/old-record.json')).toBe('')
  expect(c.branches()).toEqual([])
}, slow(60_000))

test('video recheck preparation excludes an ignored fixture parent read by the material loader', async () => {
  const c = clone()
  const fixture = 'apps/site/test/fixture-content'
  const root = join(c.sh('pwd'), fixture)
  const material = JSON.parse(readFileSync(join(ROOT, fixture, 'materials/lua/entity.json'), 'utf8'))
  mkdirSync(join(root, 'materials/wood'), { recursive: true })
  writeFileSync(join(root, 'sources.json'), '{}')
  writeFileSync(join(root, 'materials/wood/entity.json'), JSON.stringify({ ...material, id: 'wood', parent: 'dist' }))
  c.sh(`echo dist > .gitignore && git add .gitignore ${fixture} && git commit -qm fixture`)
  const parent = JSON.stringify({ ...material, id: 'dist' })
  mkdirSync(join(root, 'materials/dist'))
  writeFileSync(join(root, 'materials/dist/entity.json'), parent)
  await expect(loadAll({ root, lang: 'vi', publicBuild: false })).resolves.toMatchObject({ materials: [] })
  c.cycle('prepare_video_recheck')
  await expect(loadAll({ root, lang: 'vi', publicBuild: false })).rejects.toThrow('material wood: parent "dist" is not another material')
  expect(c.sh(`cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/${fixture}/materials/dist/entity.json`)).toBe(parent)
}, slow(60_000))

test('video recheck preparation excludes ignored screening records read by the public fixture loader', async () => {
  const c = clone()
  const fixture = 'apps/site/test/fixture-content'
  const root = join(c.sh('pwd'), fixture)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'sources.json'), '{}')
  c.sh(`git add ${fixture} && git commit -qm fixture`)
  const record = 'apps/site/test/engine-state/_photo-watermarks.json'
  const malformed = '{local record'
  c.sh(`mkdir -p apps/site/test/engine-state && echo '${record}' >> .git/info/exclude`)
  writeFileSync(join(root, '..', 'engine-state', '_photo-watermarks.json'), malformed)
  const loadFixture = () => loadAll({ root, lang: 'vi', publicBuild: true })
  await expect(loadFixture()).rejects.toThrow(SyntaxError)
  c.cycle('prepare_video_recheck')
  await expect(loadFixture()).resolves.toMatchObject({ species: [] })
  expect(c.sh(`cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/${record}`)).toBe(malformed)
}, slow(60_000))

test('held video recovery archives an ignored site input before running checks', () => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const held = `held/video-recheck/${when}`
  c.sh('mkdir -p apps/site && echo .hidden.json > apps/site/.gitignore && git add apps/site/.gitignore && git commit -qm ignores && git push -q')
  c.sh(`echo rechecked > content/video.json && git add content/video.json && git commit -qm recheck && git branch ${held} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  c.sh(`echo '{"/vat-lieu/lua-sa-tung/":true}' > apps/site/.hidden.json`)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() { [ ! -f apps/site/.hidden.json ]; }
    publish_kept video-recheck
  `)
  expect(log).toContain(`LOG published ${held}`)
  expect(c.branches()).toEqual([])
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/apps/site/.hidden.json')).toBe('{"/vat-lieu/lua-sa-tung/":true}')
}, slow(60_000))

test.each(['untracked file', 'empty directory'])('a held video recheck whose tree passed can publish after a stray species %s', stray => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const held = `held/video-recheck/${when}`
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${held} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  c.sh('mkdir -p content/species/local-only')
  if (stray === 'untracked file') c.sh('echo untracked > content/species/local-only/entity.json')
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() {
      for directory in content/species/*; do
        [ ! -d "$directory" ] || [ -f "$directory/entity.json" ] || return 1
      done
    }
    publish_kept video-recheck
  `)
  expect(log).toContain(`LOG published ${held}`)
  expect(c.branches()).toEqual([])
  expect(c.onMain('content/video.json')).toBe('rechecked')
  expect(c.sh('test ! -d content/species/local-only && echo removed')).toBe('removed')
  if (stray === 'untracked file')
    expect(c.sh('cat "$HOME"/.cache/aquatome/engine-check-failures/video-recheck-inputs.*/files/content/species/local-only/entity.json')).toBe('untracked')
}, slow(60_000))

test('a held video recheck stays eligible for retry if its failing verification changed tracked files', () => {
  const c = clone()
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const held = `held/video-recheck/${when}`
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${held} && git reset -q --hard origin/main`)
  c.elsewhere('code.txt', 'new')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    checks() { echo changed > content/a.json; echo 'AssertionError: failed on a changed tree'; return 1; }
    publish_kept video-recheck
  `)
  expect(c.branches()).toEqual([held])
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

test('a kept video recheck waits for a fresh shell when main changes the verification scripts', () => {
  const c = clone()
  const kept = 'kept/video-recheck/20261127T030000'
  c.sh(`echo rechecked > content/video.json && git add . && git commit -qm recheck && git branch ${kept} && git reset -q --hard origin/main`)
  const log = c.cycle(`
    AQ_SCRIPT_HEAD=$(git rev-parse HEAD)
    ${racing('mkdir scripts && echo new > scripts/cycle-checks.sh && git add .', 'echo stale-checks; return 0')}
    publish_kept video-recheck
  `)
  expect(log).toContain('video recheck rules changed during this run')
  expect(c.branches()).toEqual([kept])
  expect(c.onMain('content/video.json')).toBe('')
}, slow(60_000))

// The chief of staff, 14 Nov 2026: a check that passed ends the row at that moment, before any push is tried. A batch at
// -out2 passed, lost the push to another job, and main's newer commit was checked and ran out of time: it was held as
// out of time three cycles in a row, with a pass in between.
test('a check that passed ends the row before any push: a push lost to a race, then out of time, counts from there', () => {
  const c = clone()
  const base = atOut2(c)
  // A race that clashes, which is checked again: one that merges cleanly now goes out after the sweep.
  const log = c.cycle(`${racing(CLASH_LANDS)}; publish_kept photos`)
  expect(log).toContain(`LOG ${base}-out2 isn't published yet (tests out of time again: 1 of 3 cycles in a row): it stays kept for the next run, as ${base}-out1`)
  expect(c.branches()).toEqual([`${base}-out1`])
  // Main's own, from the race: the work isn't published.
  expect(c.onMain('content/b.json')).toBe('sf')
}, slow(60_000))

test('a check that passed ends the row before any push: a clash after it leaves the work kept with no count', () => {
  const c = clone()
  // The kept work changes a page that main then deletes, a clash even its own lines can't settle.
  const base = atOut2(c, 'echo photos > content/a.json && git add . && git commit -qm "content: engine photos"')
  const log = c.cycle(`${racing('git rm -q content/a.json')}; publish_kept photos`)
  expect(log).toContain(`LOG ${base}-out2 isn't published yet (a clash with main): it stays kept for the next run, as ${base}`)
  expect(c.branches()).toEqual([base])
}, slow(60_000))

// After a pass the branch has its new name: main's page protection on the push's next try reads that, or it reads
// nothing and lets the kept work's page win.
test('after a pass, a page another job published before the next try still goes out as main has it', () => {
  const c = clone()
  const base = atOut2(c, 'mkdir -p content/species/x && echo kept-name > content/species/x/vi.json && echo kept-th > content/species/x/th.json && git add . && git commit -qm "content: engine photos"')
  const log = c.cycle(`${racing('mkdir -p content/species/x && echo main-name > content/species/x/vi.json && git add .', 'return 0')}; publish_kept photos`)
  expect(log).toContain(`LOG ${base}: 1 pages and 0 other files a later run published first stay as main has them`)
  expect(log).toContain(`LOG published ${base}-out2`)
  expect(c.onMain('content/species/x/vi.json')).toBe('main-name')
  expect(c.onMain('content/species/x/th.json')).toBe('')
  expect(c.branches()).toEqual([])
}, slow(60_000))

// The chief of staff, 14 Nov 2026: a failed rename broke the bound. A rename never forces over a branch that exists; a
// count that can't be written leaves the work kept as it is, said in a FAULT line; nothing is held on a count that might
// include a pass not recorded; and a batch found under two names is never processed twice.
test('a rename or a move never forces over a branch that exists', () => {
  const c = clone()
  const t = 'photos/20261114T000000'
  c.sh(`git branch kept/${t}-out1 HEAD && echo other > content/o.json && git add . && git commit -qm other && git branch kept/${t}-out2 HEAD && git branch held/${t}-out3 HEAD && git reset -q --hard HEAD~1`)
  const refs = () => c.sh("git for-each-ref --format='%(refname:short) %(objectname)' refs/heads/")
  const before = refs()
  expect(c.cycle(`rename_branch kept/${t}-out1 kept/${t}-out2 2>/dev/null || echo refused`)).toBe('refused')
  expect(c.cycle(`move_branch kept/${t}-out1 held/${t}-out3 2>/dev/null || echo refused`)).toBe('refused')
  expect(refs()).toBe(before)
  // A move whose delete fails (a worktree someone reads the branch in) takes back the branch it made: never two names.
  c.sh(`git worktree add -q ../reading kept/${t}-out1`)
  expect(c.cycle(`move_branch kept/${t}-out1 held/${t} 2>/dev/null || echo refused`)).toBe('refused')
  expect(refs()).toBe(before)
}, slow(60_000))

test("a count that can't be written leaves the work kept under its present name, with a FAULT line", () => {
  const c = clone()
  c.timedOutRun()
  const [kept = ''] = c.branches()
  const log = c.cycle('rename_branch() { return 1; }; publish_kept photos; echo "FAULT=${FAULT:-}"', { CHECK: 'Error: Test timed out in 30000ms.' })
  expect(log).toContain(`LOG ${kept} isn't published yet (tests out of time again: 2 of 3 cycles in a row): it stays kept for the next run`)
  expect(log).toContain(`FAULT=${kept} ran out of time again and couldn't be renamed ${kept.replace(/-out1$/, '-out2')}: it stays as ${kept}, its count not moved on`)
  expect(c.branches()).toEqual([kept])
}, slow(60_000))

test('a pass whose rename fails is never held on the count it leaves', () => {
  const c = clone()
  const base = atOut2(c)
  const log = c.cycle(`${racing(CLASH_LANDS)}; rename_branch() { return 1; }; publish_kept photos; echo "FAULT=\${FAULT:-}"`)
  expect(log).toContain(`LOG ${base}-out2 isn't published yet (tests out of time again): it stays kept for the next run`)
  expect(log).toContain(`FAULT=${base}-out2 passed its checks and couldn't be renamed ${base}: it stays as ${base}-out2, and its count is wrong until it is`)
  // Codex's read of 6d2aea2bd: the next run knew nothing of the pass, and out of time it held the work at -out3. The
  // pass is left as its name with no count, beside the counted one on the same work, which the next run takes.
  const names = c.branches()
  const next = c.cycle('publish_kept photos', { CHECK: 'Error: Test timed out in 30000ms.' })
  expect(c.branches()).toEqual([`${base}-out1`])
  expect(next).toContain(`LOG ${base} isn't published yet (tests out of time again: 1 of 3 cycles in a row): it stays kept for the next run, as ${base}-out1`)
  expect(names).toEqual([base, `${base}-out2`])
  expect(log).toContain(`LOG ${base}-out2 passed and couldn't lose its count: ${base} is beside it on the same work, the name the next run takes`)
}, slow(60_000))

test('a batch under two names on one commit loses its old name and is published once; on two commits neither is touched', () => {
  const c = clone()
  const t = 'kept/photos/20261114T000000'
  c.sh(`${'echo photos > content/b.json && git add . && git commit -qm "content: engine photos"'} && git branch ${t}-out1 HEAD && git branch ${t}-out2 HEAD && git reset -q --hard origin/main`)
  const log = c.cycle('publish_kept photos')
  expect(log).toContain(`LOG ${t}-out1 is the same work as ${t}-out2, left by a rename that half-worked: dropped`)
  expect(log).toContain(`LOG published ${t}-out2`)
  expect(log).not.toContain(`publishing ${t}-out1`)
  expect(c.branches()).toEqual([])
  expect(c.onMain('content/b.json')).toBe('photos')
  // On two commits: neither is published, renamed or dropped, and the run says so.
  const d = clone()
  d.sh(`echo one > content/d.json && git add . && git commit -qm one && git branch ${t}-out1 HEAD && echo two > content/d.json && git commit -qam two && git branch ${t} HEAD && git reset -q --hard origin/main`)
  const refs = () => d.sh("git for-each-ref --format='%(refname:short) %(objectname)' refs/heads/")
  const before = refs()
  const split = d.cycle('publish_kept photos; echo "FAULT=${FAULT:-}"')
  expect(split).toBe(`FAULT=photos/20261114T000000 is on ${t}, ${t}-out1, on different commits: none of them is touched (left by 1 run)`)
  expect(refs()).toBe(before)
  expect(d.onMain('content/d.json')).toBe('')
}, slow(60_000))

// The chief of staff, 14 Nov: a batch left under two names mustn't sit unnoticed. Its first run says so in FAULT, later
// runs only once a day while it lasts; each run that leaves it is counted, and mac-status.py lists it.
test('a batch under two names says so in FAULT on its first run and once a day after, counted, and mac-status lists it', () => {
  const c = clone()
  const t = 'kept/photos/20261114T000000'
  const batch = 'photos/20261114T000000'
  c.sh(`echo one > content/d.json && git add . && git commit -qm one && git branch ${t}-out1 HEAD && echo two > content/d.json && git commit -qam two && git branch ${t} HEAD && git reset -q --hard origin/main`)
  const why = `${batch} is on ${t}, ${t}-out1, on different commits: none of them is touched`
  const run = () => c.cycle('publish_kept photos; echo "FAULT=${FAULT:-}"')
  const record = () => c.sh('cat "$(git rev-parse --absolute-git-dir)/aquatome-two-names" 2>/dev/null || true')
  const listed = () => c.sh(`python3 -c 'import importlib.util as u; s = u.spec_from_file_location("m", "${join(ROOT, 'scripts/mac-status.py')}"); m = u.module_from_spec(s); s.loader.exec_module(m); print("\\n".join(m.two_names()))'`)
  expect(run()).toContain(`FAULT=${why} (left by 1 run)`)
  // The same day: counted and logged, no FAULT.
  const second = run()
  expect(second).toContain(`LOG ${why} (left by 2 runs; said in FAULT once a day)`)
  expect(second.split('\n').at(-1)).toBe('FAULT=')
  expect(record().split('\t').slice(0, 2)).toEqual([batch, '2'])
  expect(listed()).toBe(`under two names, in engine-photos: ${batch}, left by 2 runs: ${why}`)
  // A day on: FAULT again.
  c.sh(`f="$(git rev-parse --absolute-git-dir)/aquatome-two-names"; awk -F'\t' -v OFS='\t' '{ $3 = $3 - 82800 } 1' "$f" > "$f.x" && mv "$f.x" "$f"`)
  expect(run().split('\n').at(-1)).toBe(`FAULT=${why} (left by 3 runs)`)
  // Put right by hand (one name dropped): published, and the record and the listing go.
  c.sh(`git branch -q -D ${t}-out1`)
  const after = run()
  expect(after).toContain(`LOG published ${t}`)
  expect(after.split('\n').at(-1)).toBe('FAULT=')
  expect(record()).toBe('')
  expect(listed()).toBe('')
  // Same work under two names whose old name can't be dropped (a worktree has it): no longer only a log line.
  const d = clone()
  d.sh(`echo photos > content/b.json && git add . && git commit -qm "content: engine photos" && git branch ${t}-out1 HEAD && git branch ${t} HEAD && git reset -q --hard origin/main && git worktree add -q ../wt ${t}-out1`)
  const stuck = d.cycle('publish_kept photos; echo "FAULT=${FAULT:-}"')
  expect(stuck).toContain(`LOG ${t}-out1 is the same work as ${t} and couldn't be dropped: neither is processed this run`)
  expect(stuck.split('\n').at(-1)).toBe(`FAULT=${batch} is on ${t}, ${t}-out1, the same work, and ${t}-out1 couldn't be dropped: none of them is processed (left by 1 run)`)
  expect(d.onMain('content/b.json')).toBe('')
}, slow(60_000))

// The read of 299c718d5: a fault waits for the run's end, so a later batch still goes out.
test('two kept batches: the first faults at the bound, and the second is still published', () => {
  const c = clone()
  c.sh('echo first > content/first.json && git add . && git commit -qm first && git branch kept/photos/20261114T000000-out2 HEAD && git reset -q --hard origin/main')
  c.sh('echo second > content/second.json && git add . && git commit -qm second && git branch kept/photos/20261114T010000 HEAD && git reset -q --hard origin/main')
  // The first batch's checks run out of time; the second's pass.
  const log = c.cycle(`checks() { [ ! -f content/first.json ] || { echo 'Error: Test timed out in 30000ms.'; return 1; }; }; publish_kept photos; echo "FAULT=$FAULT"`)
  expect(log).toContain('LOG kept/photos/20261114T000000-out2 ran out of time 3 cycles in a row: on held/photos/20261114T000000-out3, not published')
  expect(log).toContain('LOG published kept/photos/20261114T010000')
  expect(log).toMatch(/FAULT=kept\/photos\/20261114T000000 ran out of time 3 cycles in a row/)
  expect(c.onMain('content/second.json')).toBe('second')
  expect(c.onMain('content/first.json')).toBe('')
  expect(c.branches()).toEqual(['held/photos/20261114T000000-out3'])
}, slow(60_000))

test("a check that didn't run neither counts nor ends the row: a clash with main, or its photo records", () => {
  const c = clone()
  c.sh('git branch kept/photos/20261114T000000-out2 HEAD')
  for (const why of ['a clash with main', "its photo records couldn't be migrated"])
    expect(c.cycle(`KEPT_FAILED=; KEPT_WHY="${why}"; count_outs kept/photos/20261114T000000-out2; echo "$BRANCH [$KEPT_FAILED]"`), why).toBe('kept/photos/20261114T000000-out2 []')
  expect(c.branches()).toEqual(['kept/photos/20261114T000000-out2'])
})

// Astra's read of #1172, on the Mac since 14 Nov: a rename there kept the work's first main, so kept work that failed on
// a newer main was tried again in the same run, on the main it had just failed on.
test('on the Mac too, kept work that fails on a newer main is held as checked there, and waits for a main newer still', () => {
  const c = clone()
  c.timedOutRun()
  const [kept = ''] = c.branches()
  const held = kept.replace(/^kept\//, 'held/').replace(/-out1$/, '')
  c.elsewhere('packages/code.ts', '2')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const log = c.cycle('publish_kept photos', { CHECK: 'AssertionError: expected 1 to be 2' })
  expect(log).toContain(`LOG ${kept} failed its tests twice: on ${held}, not published`)
  expect(log).not.toContain('trying')
  expect(c.branches()).toEqual([held])
  expect(c.cycle('publish_kept photos')).toBe('')
  c.elsewhere('packages/code.ts', '3')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const tried = c.cycle('publish_kept photos')
  expect(tried).toContain(`LOG trying ${held} once more: main's code has changed since it was held`)
  expect(tried).toContain(`LOG published ${held}`)
  expect(c.onMain('content/b.json')).toBe('photos')
})

test("kept work that clashes with main on a page main had gets its own lines, as a run's push does, and is checked again", () => {
  const c = clone()
  c.sh('echo photos > content/a.json && git add . && git commit -qm "content: engine photos"')
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  c.elsewhere('content/a.json')
  expect(c.onMain('content/a.json')).toBe('sf')
  const log = c.cycle('publish_kept photos')
  expect(log).toMatch(/LOG published kept\/photos\//)
  expect(c.onMain('content/a.json')).toBe('photos')
})

// 14 Nov, 03:14: a kept batch landed on four fish pages a later run had published at 02:49, gave them its own names, and
// their first addresses answered 404. A page main got from a later run while the work was kept stays as main has it,
// the whole page: the kept work's files in its folder are dropped (its translation was of another draft; the chief of
// staff, 14 Nov). The rest of the kept work goes out.
test('a page a later run published while the work was kept stays as main has it, whole; the rest of the kept work is published', () => {
  const c = clone()
  c.sh('mkdir -p content/species/x && echo kept-name > content/species/x/vi.json && echo kept-entity > content/species/x/entity.json && echo kept-th > content/species/x/th.json && echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const [kept = ''] = c.branches()
  c.elsewhere('content/species/x/vi.json', 'main-name')
  const log = c.cycle('publish_kept photos')
  expect(log).toContain(`LOG ${kept}: 1 pages and 0 other files a later run published first stay as main has them`)
  expect(log).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/species/x/vi.json')).toBe('main-name')
  // Main's folder whole: the kept work's other files there, written beside another draft, don't go out.
  expect(c.onMain('content/species/x/entity.json')).toBe('')
  expect(c.onMain('content/species/x/th.json')).toBe('')
  expect(c.onMain('content/b.json')).toBe('photos')
}, slow(60_000))

// Grok's read of 19652e876: main_pages ran on every try of the push, and a try with main where it was skipped the checks,
// so a push lost after the sweep had edited main's page went out next try with that page put back, unchecked.
test("a push's next try never sends a tree its checks didn't see, though main's pages were put back over the sweep", () => {
  const c = clone()
  c.sh('mkdir -p content/species/x && echo kept-name > content/species/x/vi.json && echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const [kept = ''] = c.branches()
  c.elsewhere('content/species/x/vi.json', 'main-name')
  // The sweep edits main's page (a name cleaned up); GitHub refuses the first push only.
  c.sh(`printf '#!/bin/sh\\n[ "$1 $2" = "engine sweep" ] && [ -f content/species/x/vi.json ] && echo swept-name > content/species/x/vi.json\\nexit 0\\n' > "$HOME/bin/pnpm"`)
  c.sh(`printf '#!/bin/sh\\n[ -f "$HOME/refused-once" ] && exit 0\\ntouch "$HOME/refused-once"\\nexit 1\\n' > "$HOME/origin.git/hooks/pre-receive" && chmod 755 "$HOME/origin.git/hooks/pre-receive"`)
  const log = c.cycle('checks() { cat content/species/x/vi.json >> "$HOME/checked"; }; publish_kept photos')
  expect(log).toContain(`LOG published ${kept}`)
  const checked = c.sh('cat "$HOME/checked"').split('\n')
  expect(c.onMain('content/species/x/vi.json')).toBe(checked.at(-1))
  expect(c.onMain('content/b.json')).toBe('photos')
}, slow(60_000))

// The Site lead and the chief of staff, 15 Nov 2026: the held photos run passed its checks and lost its push three times,
// each try a re-test of 30 to 50 minutes while main took leads' merges, most with code. Once the work has passed on a newer
// main, its lost push goes again as a run's own push does: swept, and checked again only if the sweep changed something,
// the migration failed, or it clashed. Here main moves while the first check runs, as on a busy day, so the first push is
// refused for real. `before` runs ahead of the kept run, and what it leaves uncommitted goes into the kept work.
type Clone = ReturnType<typeof clone>
function raced(file: string, text: string, o: { before?: (c: Clone) => void; sweep?: string; pnpm?: string } = {}) {
  const c = clone()
  o.before?.(c)
  c.timedOutRun()
  const [kept = ''] = c.branches()
  if (o.sweep) c.sh(`printf '#!/bin/sh\\n[ "$1 $2" = "engine sweep" ] && ${o.sweep}\\nexit 0\\n' > "$HOME/bin/pnpm"`)
  if (o.pnpm) c.sh(`printf '%s\\n' '#!/bin/sh' '${o.pnpm}' 'exit 0' > "$HOME/bin/pnpm"`)
  const move = `rm -rf "$HOME/other" && git clone -q "$HOME/origin.git" "$HOME/other" 2>/dev/null && cd "$HOME/other" && git config user.email a@example.com && git config user.name a && mkdir -p "$(dirname ${file})" && printf '%b\\n' '${text}' > ${file} && git add . && git commit -qm other && git push -q 2>/dev/null`
  const log = c.cycle(`checks() { echo run >> "$HOME/checked"; [ -f "$HOME/moved" ] || { touch "$HOME/moved"; ( ${move} ); }; }; publish_kept photos`)
  return { c, kept, log, checks: c.sh('grep -c run "$HOME/checked"') }
}
const AGAIN = "LOG main moved and the sweep changed nothing the checks read: pushing again, not checked again, as a run's own push does"

test('after a pass, a push lost to main moving goes again after the sweep, not checked again: content, or code', () => {
  for (const [file, text] of [['content/c.json', 'sf'], ['packages/code.ts', '2']] as const) {
    const { c, kept, log, checks } = raced(file, text)
    expect(log).toContain(AGAIN)
    expect(log).toContain(`LOG published ${kept}`)
    expect(checks).toBe('1')
    expect([c.onMain('content/b.json'), c.onMain(file)]).toEqual(['photos', text])
    expect(c.branches()).toEqual([])
  }
}, slow(120_000))

test('after a pass, a push lost to main is checked again when the sweep on the merge changes something', () => {
  const { c, kept, log, checks } = raced('content/c.json', 'sf', { sweep: '[ -f content/c.json ] && echo swept > content/s.json' })
  expect(log).not.toContain(AGAIN)
  expect(log).toContain(`LOG published ${kept}`)
  expect(checks).toBe('2')
  expect(c.onMain('content/s.json')).toBe('swept')
}, slow(60_000))

// The chief of staff, 15 Nov 2026: the sweep on the merge dates main's changed pages, nearly every time main takes content.
test("after a pass, a push lost to main whose sweep changes only the pages' dates goes again, the content loaded, not the tests", () => {
  const dated = '[ -f content/c.json ] && echo dated > content/page-dates.json'
  const { c, kept, log, checks } = raced('content/c.json', 'sf', { pnpm: `[ "$1 $2" = "engine sweep" ] && ${dated}; [ "$1 $2" = "engine check-content" ] && echo dates-checked >> "$HOME/checked"` })
  expect(log).toContain("LOG the sweep changed only the pages' dates or its reports, and the content loads as the site's loader loads it: not checked again")
  expect(log).toContain(AGAIN)
  expect(log).toContain(`LOG published ${kept}`)
  expect(checks).toBe('1')
  expect(c.sh('grep -c dates-checked "$HOME/checked"')).toBe('1')
  expect([c.onMain('content/page-dates.json'), c.onMain('content/b.json')]).toEqual(['dated', 'photos'])
  // Content that doesn't load is checked in full.
  const bad = raced('content/c.json', 'sf', { pnpm: `[ "$1 $2" = "engine sweep" ] && ${dated}; [ "$1 $2" = "engine check-content" ] && exit 1` })
  expect(bad.log).not.toContain(AGAIN)
  expect(bad.log).toContain("LOG the content didn't load, or took too long: checked again")
  expect(bad.log).toContain(`LOG published ${bad.kept}`)
  expect(bad.checks).toBe('2')
}, slow(120_000))

test('after a pass, a push lost to main is checked again when both sides changed the calendar, the sweep changing the dates or nothing', () => {
  // Readers' catch, and the Site lead: the calendar merges line by line, and the loader doesn't open it.
  for (const sweep of ['grep -q main content/curation.json && echo dated > content/page-dates.json', 'true']) {
    const { c, kept, log, checks } = raced('content/curation.json', '1\\n2\\n3\\n4\\nmain', {
      before: c => c.sh("printf '1\\n2\\n3\\n4\\n5\\n' > content/curation.json && git add . && git commit -qm cal && git push -q 2>/dev/null && printf 'run\\n2\\n3\\n4\\n5\\n' > content/curation.json"),
      pnpm: `[ "$1 $2" = "engine sweep" ] && ${sweep}`,
    })
    expect(log, sweep).toContain('LOG the calendar changed on main and in this run: checked again')
    expect(log, sweep).not.toContain(AGAIN)
    expect(log, sweep).toContain(`LOG published ${kept}`)
    expect(checks, sweep).toBe('2')
    expect(c.onMain('content/curation.json').split('\n')).toEqual(['run', '2', '3', '4', 'main'])
  }
}, slow(120_000))

test('after a pass, a push lost to main whose migration fails is not published, though a second migration would pass', () => {
  // Grok's read: the check swept again, which cleared the failed migration's flag, and the tests then passed. A run's own
  // push sweeps once and publishes nothing.
  const fails = 'if [ "$1 $2" = "engine photo-privacy" ] && [ -f content/c.json ] && [ ! -f "$HOME/failed-migration" ]; then touch "$HOME/failed-migration"; exit 1; fi'
  const { c, log } = raced('content/c.json', 'sf', { pnpm: fails })
  expect(log).not.toContain(AGAIN)
  expect(log).not.toContain('LOG published')
  expect(log).toContain("its photo records couldn't be migrated")
  expect(c.onMain('content/b.json')).toBe('')
}, slow(60_000))

test('after a pass, a push lost to main that clashes with the work is checked again, its own lines kept', () => {
  // A file on main the work changed, then main changed the same line.
  const { c, kept, log, checks } = raced('content/m.json', 'sf', { before: c => c.sh('echo base > content/m.json && git add . && git commit -qm m && git push -q 2>/dev/null && echo photos > content/m.json') })
  expect(log).not.toContain(AGAIN)
  expect(log).toContain(`LOG published ${kept}`)
  expect(checks).toBe('2')
  expect(c.onMain('content/m.json')).toBe('photos')
}, slow(60_000))

// The chief of staff, 14 Nov 2026: git's rename detection read a page main moved into a path the kept work also wrote as
// moved, not added, and the kept version won. Added means absent where the branch was cut.
test('a page main moved to where the kept work wrote one stays as main has it', () => {
  const c = clone()
  c.elsewhere('content/species/old/vi.json', 'main-name')
  c.sh('git pull -q --rebase')
  c.sh('mkdir -p content/species/x && echo kept-name > content/species/x/vi.json && echo kept-th > content/species/x/th.json && git add . && git commit -qm "content: engine photos"')
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const [kept = ''] = c.branches()
  c.sh('rm -rf other && git clone -q origin.git other 2>/dev/null && cd other && git config user.email a@example.com && git config user.name a && git mv content/species/old content/species/x && git commit -qm moved && git push -q 2>/dev/null', {}, c.sh('echo "$HOME"'))
  const log = c.cycle('publish_kept photos')
  expect(log).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/species/x/vi.json')).toBe('main-name')
  expect(c.onMain('content/species/x/th.json')).toBe('')
  expect(c.onMain('content/species/old/vi.json')).toBe('')
}, slow(60_000))

// Codex's read of 6d2aea2bd: a rebase replays each commit of the kept work, so a page it added and a later commit deleted
// was added on main's and then deleted, main's page with it, though the kept work's last commit has no such page.
test('kept work that added a page and deleted it again leaves the page main published meanwhile as main has it', () => {
  const c = clone()
  c.sh('mkdir -p content/species/x content/gallery && echo kept-name > content/species/x/vi.json && echo kept-gallery > content/gallery/g.json && git add . && git commit -qm "content: engine pages" && git rm -rq content/species/x content/gallery/g.json && echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
  c.cycle("verify 'pnpm test' || keep_unpublished photos", { CHECK: 'Error: Test timed out in 30000ms.' })
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const [kept = ''] = c.branches()
  c.elsewhere('content/species/x/vi.json', 'main-name')
  c.elsewhere('content/gallery/g.json', 'main-gallery')
  const log = c.cycle('publish_kept photos')
  expect(c.onMain('content/species/x/vi.json')).toBe('main-name')
  expect(c.onMain('content/gallery/g.json')).toBe('main-gallery')
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(log).toContain(`LOG ${kept}: 1 pages and 1 other files a later run published first stay as main has them`)
  expect(log).toContain(`LOG published ${kept}`)
}, slow(60_000))

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

// 13 Nov: three held batches sat on the Mac until the chief of staff had them renamed by hand, as only GitHub's runner
// tried a held batch again. On the Mac too, once main's code has changed since it was held, it gets one more try.
test("a held batch on the Mac gets one more try once main's code has changed, and is published if it passes", () => {
  const c = clone()
  c.sh(work)
  c.cycle(publishing, { CHECK: 'AssertionError: expected 1 to be 2' })
  const [held = ''] = c.branches()
  // Only pages landed since: not tried.
  c.elsewhere('content/c.json', 'sf')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  expect(c.cycle('publish_kept photos')).toBe('')
  // A fix to the code lands: the next run tries it, and it passes and goes out.
  c.elsewhere('packages/code.ts', '2')
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const log = c.cycle('publish_kept photos')
  expect(log).toContain(`LOG trying ${held} once more: main's code has changed since it was held`)
  expect(log).toContain(`LOG published ${held}`)
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(c.branches()).toEqual([])
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
    // Each "not publishing" after the checks keeps the work first: after the run's commit, after a merge on push, and
    // after the sweep on a clean pull that brought main's commits in.
    if (name === 'video-recheck.sh') {
      expect(s, name).toContain('\npush_video_recheck\n')
      expect(script('video-recheck-publish.sh')).toMatch(/if \[ "\$verification_failed" != 0 \]; then\n\s*keep_unpublished video-recheck "\$batch" \|\| log .*\n.*not publishing.*\n\s*return 1/)
    } else {
      const gaveUp = s.split('\n').filter(l => /not publishing/.test(l) && !/gate:/.test(l))
      expect(gaveUp.length, name).toBe(3)
      expect(s.match(new RegExp(`keep_unpublished ${job.replace(/[$"]/g, m => `\\${m}`)}`, 'g'))?.length, name).toBe(3)
    }
    // Kept work is published once a run has installed and set its merge drivers, before it does its own work.
    if (name === 'video-recheck.sh') {
      const interrupted = s.indexOf('recover_interrupted_video_recheck ||')
      expect(interrupted).toBeGreaterThan(0)
      expect(interrupted).toBeLessThan(s.indexOf('from_main "$@"'))
    }
    const install = s.indexOf('pnpm install --frozen-lockfile --silent')
    const recovery = s.indexOf(`\npublish_kept ${job}\n`)
    expect(install, name).toBeGreaterThanOrEqual(0)
    expect(recovery, name).toBeGreaterThan(install)
    expect(recovery, name).toBeGreaterThan(s.indexOf('merge.entity.driver'))
  }
})

// 13 Nov 2026: two engine pushes made on older code put photo records in the format before photo-privacy.ts on main, and
// every run's tests failed on them. Here `pnpm` stands in for the migration (`engine photo-privacy --write`: "legacy"
// becomes "migrated" in engine-state, or it fails) and for the sweep, each call noted in order with the checks, which fail
// while an old record is left, as the privacy test does.
function migrating(c: ReturnType<typeof clone>, fails = false) {
  c.sh(`cat > "$HOME/bin/pnpm" <<'EOF'
#!/bin/sh
case "$2" in
  photo-privacy) echo migrate >> "$HOME/order"; ${fails ? 'exit 1' : `perl -pi -e 's/legacy/migrated/g' engine-state/*.json`} ;;
  sweep) echo sweep >> "$HOME/order" ;;
esac
exit 0
EOF`)
  return { order: () => c.sh('cat "$HOME/order" 2>/dev/null || true').split('\n').filter(Boolean).join(' ') }
}
test('the migration the cycle calls is a command of the engine', () => {
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toContain('cycle_reconcile_engine photo-privacy --write ||')
  // Missing, every run would keep its work and publish nothing.
  expect(readFileSync(join(ROOT, 'packages/engine/src/cli.ts'), 'utf8')).toContain("cmd === 'photo-privacy'")
  // So is the content's load: missing, every sweep that changed only the dates would be checked in full, as before.
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toContain('  net nice -n 10 pnpm engine check-content || { log "the content didn\'t load, or took too long: checked again"; return 1; }')
  expect(readFileSync(join(ROOT, 'packages/engine/src/cli.ts'), 'utf8')).toContain("cmd === 'check-content'")
})
const privacy = `checks() { echo tests >> "$HOME/order"; ! grep -q legacy engine-state/*.json; }`
// As engine-cycle.sh ends: main caught up with, swept and checked, then pushed.
const ending = `${privacy}; catch_up; sweep_merged; if ! verify_cycle; then keep_unpublished photos; echo "NOT PUBLISHED"; exit 0; fi; git push -q origin HEAD:main`
// As engine-cycle.sh's push() takes a clean pull: swept, and checked again when that changed anything.
const pushing = `${privacy}; main=$(git rev-parse '@{u}'); git pull -q --rebase; if ! swept_pull "$main" && ! verify_cycle; then keep_unpublished photos; echo "NOT PUBLISHED"; exit 0; fi; git push -q origin HEAD:main`

test('old-format photo records that a pull brings in are migrated before the tests, and go out migrated', () => {
  const c = clone()
  const m = migrating(c)
  c.sh(work)
  c.elsewhere('engine-state/_photo-watermarks.json', 'legacy')
  expect(c.cycle(ending)).not.toContain('NOT PUBLISHED')
  expect(m.order()).toBe('migrate sweep tests')
  expect(c.onMain('engine-state/_photo-watermarks.json')).toBe('migrated')
  expect(c.onMain('content/b.json')).toBe('photos')
  // At the push, a clean pull that brought them in: migrated, and the tests run again on that.
  c.sh('echo more > content/d.json && git add . && git commit -qm "content: engine photos"')
  c.elsewhere('engine-state/_photo-check.json', 'legacy')
  c.sh('rm -f "$HOME/order"')
  expect(c.cycle(pushing)).not.toContain('NOT PUBLISHED')
  expect(m.order()).toBe('migrate sweep tests')
  expect(c.onMain('engine-state/_photo-check.json')).toBe('migrated')
  // Kept work, published on a main that has them.
  const k = clone()
  const n = migrating(k)
  k.timedOutRun()
  k.elsewhere('engine-state/_photo-rejected.json', 'legacy')
  expect(k.cycle(`${privacy}; publish_kept photos`)).toMatch(/LOG published kept\/photos\//)
  expect(n.order()).toBe('migrate sweep tests')
  expect(k.onMain('engine-state/_photo-rejected.json')).toBe('migrated')
  expect(k.onMain('content/b.json')).toBe('photos')
}, slow(60_000))

test('a migration that fails publishes nothing, and the work is kept for the next run, never held', () => {
  const c = clone()
  migrating(c, true)
  c.sh(work)
  c.elsewhere('engine-state/_photo-watermarks.json', 'legacy')
  const log = c.cycle(`${ending.replace('echo "NOT PUBLISHED"', 'echo "NOT PUBLISHED, reported as: $FAILED"')}`)
  expect(log).toContain('LOG photo records: the migration failed, so nothing is published')
  // The run's failure is reported with that line (engine-cycle.sh finish), never as plain failed tests.
  expect(log).toMatch(/NOT PUBLISHED, reported as: photo records not migrated: this run's work is kept on kept\/photos\//)
  expect(log).toContain('LOG photo records not migrated: not tested, not published')
  expect(log).toMatch(/LOG photo records not migrated: this run's work is kept on kept\/photos\/\d{8}T\d{6} for the next run/)
  expect(c.sh('cat "$HOME/order"')).not.toContain('tests')
  expect(c.onMain('content/b.json')).toBe('')
  const [kept = ''] = c.branches()
  expect(kept).toMatch(/^kept\/photos\//)
  // The next run: still failing, it stays kept; once the migration works, it goes out migrated.
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  const again = c.cycle(`${privacy}; publish_kept photos; echo "FAULT=$FAULT"`)
  expect(again).toContain(`LOG ${kept} isn't published yet (its photo records couldn't be migrated): it stays kept`)
  // The run goes on to its own work, and reports this when it ends.
  expect(again).toContain(`FAULT=${kept} isn't published: its photo records couldn't be migrated, and it stays kept`)
  expect(c.branches()).toEqual([kept])
  migrating(c)
  expect(c.cycle(`${privacy}; publish_kept photos; [ -z "$MIGRATE_FAILED" ] && echo cleared`)).toMatch(/LOG published kept\/photos\/[\s\S]*cleared/)
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(c.onMain('engine-state/_photo-watermarks.json')).toBe('migrated')
  expect(c.branches()).toEqual([])
}, slow(60_000))

// engine-cycle.sh's finish, on its own: a fault the run went on past fails the run when it ends, and on the Mac goes to
// GitHub as a failed run's line does (engine-mac.yml), which the daily report lists.
test('a run that kept work back for its photo records ends failed, and says why on GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-finish-'))
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${dir}/gh.log'\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  const finish = /^finish\(\) \{[\s\S]*?^\}$/m.exec(script('engine-cycle.sh'))![0]
  const run = (body: string, extra: Record<string, string> = {}) => spawnSync('bash', ['-c', `
    set -euo pipefail; PART=pages; PIDFILE='${dir}/pid'; LAST=; FAILED=; log() { LAST="$*"; }; clock() { echo "1 0"; }
    ${finish}
    trap finish EXIT
    ${body}`], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_ACTIONS: '', ...extra } })
  expect(run('true').status).toBe(0)
  expect(run('FAULT="kept/pages/x isn\'t published: its photo records couldn\'t be migrated, and it stays kept"').status).toBe(1)
  expect(readFileSync(join(dir, 'gh.log'), 'utf8')).toBe("workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=pages -f why=exit 1: kept/pages/x isn't published: its photo records couldn't be migrated, and it stays kept\n")
  // On GitHub, the run itself fails.
  expect(run('FAULT=x', { GITHUB_ACTIONS: 'true' }).status).toBe(1)
  expect(readFileSync(join(dir, 'gh.log'), 'utf8').split('\n').filter(Boolean)).toHaveLength(1)
})

// Astra's read of 1df3f00d7: the failure test above takes the run's ending, and a clean pull at the push whose sweep
// commits nothing went unchecked: swept_pull's guard taken out, a failed migration there would publish.
test('at the push, a clean pull whose migration fails publishes nothing, even when its sweep commits nothing', () => {
  const c = clone()
  migrating(c, true)
  c.sh(work)
  c.elsewhere('content/c.json', 'sf')
  const log = c.cycle(pushing)
  expect(log).toContain('LOG photo records: the migration failed, so nothing is published')
  expect(log).toContain('NOT PUBLISHED')
  expect(c.onMain('content/b.json')).toBe('')
  expect(c.branches()[0]).toMatch(/^kept\/photos\//)
}, slow(60_000))

test('kept work is judged by its own migration, not an earlier branch\'s', () => {
  const c = clone()
  // A branch whose pull fails before its sweep, after another branch's migration failed.
  const r = c.cycle('MIGRATE_FAILED=1; net() { return 1; }; push_kept kept/photos/b || true; echo "why=$KEPT_WHY migrate=$MIGRATE_FAILED"')
  expect(r).toContain('why=a clash with main migrate=')
  expect(r).not.toContain('migrate=1')
  // Two branches held back by their records are both named in the run's fault.
  expect(readFileSync(CHECKS, 'utf8')).toContain('FAULT="${FAULT:+$FAULT; }$branch isn\'t published')
})

// A video job that kept work back for its photo records ends failed and says why on GitHub, as a part's cycle does.
test('a video job that kept work back for its photo records ends failed, and says why on GitHub', () => {
  for (const [name, job] of [['video-cycle.sh', 'videos'], ['video-recheck.sh', 'video-recheck']] as const) {
    expect(script(name), name).toContain(`trap 'status=$?; rm -f "$PIDFILE"; fault_exit "$status" ${job}' EXIT`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'aq-fault-'))
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${dir}/gh.log'\n`)
  chmodSync(join(dir, 'gh'), 0o755)
  const run = (body: string, extra: Record<string, string> = {}) => spawnSync('bash', ['-c', `
    set -euo pipefail; log() { :; }; source "${CHECKS}"
    trap 'status=$?; fault_exit "$status" videos' EXIT
    ${body}`], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_ACTIONS: '', ...extra } })
  expect(run('true').status).toBe(0)
  expect(run('FAULT="kept/videos/x isn\'t published: its photo records couldn\'t be migrated, and it stays kept"').status).toBe(1)
  expect(readFileSync(join(dir, 'gh.log'), 'utf8')).toBe("workflow run engine-mac.yml -R deathemperor/aquatome.com -f part=videos -f why=exit 1: kept/videos/x isn't published: its photo records couldn't be migrated, and it stays kept\n")
  // A job that failed already keeps its own status.
  expect(run('FAULT=x; exit 3').status).toBe(3)
})

// 14 Nov: the sf run's checks passed, and its push lost to main's merges three times; it stayed in the clone, whose next
// run starts from main and would have dropped it. Each job's push lost three times keeps its work, as work out of time.
test('work whose push lost to main three times is kept, never over a name already there, and the next run publishes it', () => {
  const c = clone()
  c.sh('echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
  const work = c.sh('git rev-parse HEAD')
  expect(c.cycle('keep_lost_push photos')).toMatch(/^LOG push failed three times: this run's work is kept on kept\/photos\/\d{8}T\d{6} for the next run$/)
  const [kept = ''] = c.branches()
  expect(c.sh(`git rev-parse ${kept}`)).toBe(work)
  // The next run starts from main, then publishes it first.
  c.sh('git fetch -q origin && git reset -q --hard origin/main')
  c.elsewhere()
  expect(c.cycle('publish_kept photos')).toContain(`LOG published ${kept}`)
  expect(c.onMain('content/b.json')).toBe('photos')
  expect(c.branches()).toEqual([])
  // A kept branch of the same name (the same second): left as it is, and the run says so.
  c.sh('echo again > content/d.json && git add . && git commit -qm "content: engine photos again"')
  const home = c.sh('echo "$HOME"')
  mkdirSync(join(home, 'clock'))
  writeFileSync(join(home, 'clock/date'), '#!/bin/sh\n[ "$*" = "-u +%Y%m%dT%H%M%S" ] && echo 20261114T100000 || exec /bin/date "$@"\n')
  chmodSync(join(home, 'clock/date'), 0o755)
  c.sh('git branch kept/photos/20261114T100000 origin/main')
  const before = c.sh('git rev-parse kept/photos/20261114T100000')
  expect(c.cycle('keep_lost_push photos || echo "code=$?"', { PATH: `${home}/clock:${home}/bin:${process.env.PATH}` }))
    .toBe("LOG push failed three times, and kept/photos/20261114T100000 is already there: this run's work isn't kept\ncode=1")
  expect(c.sh('git rev-parse kept/photos/20261114T100000')).toBe(before)
})

test("the pages, sf and photos cycles, the video job and the video recheck keep their work when their push loses three times", () => {
  for (const [name, job] of [['engine-cycle.sh', '"$PART"'], ['video-cycle.sh', 'videos']] as const) {
    expect(script(name), name).toContain(`log "push failed three times"; keep_lost_push ${job};`)
    expect(script(name).match(/push failed three times/g), name).toHaveLength(1)
  }
  expect(script('video-recheck-publish.sh')).toMatch(/for try in 1 2 3; do[\s\S]+could not publish after three attempts"\n\s*keep_lost_push video-recheck/)
})
