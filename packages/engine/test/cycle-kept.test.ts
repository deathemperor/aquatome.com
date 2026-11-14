import { execSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
    // Each "not publishing" after the checks keeps the work first: after the run's commit, after a merge on push, and
    // after the sweep on a clean pull that brought main's commits in.
    const gaveUp = s.split('\n').filter(l => /not publishing/.test(l) && !/gate:/.test(l))
    expect(gaveUp.length, name).toBe(3)
    expect(s.match(new RegExp(`keep_unpublished ${job.replace(/[$"]/g, m => `\\${m}`)}`, 'g'))?.length, name).toBe(3)
    // Kept work is published once a run has installed and set its merge drivers, before it does its own work.
    expect(s, name).toMatch(new RegExp(`pnpm install --frozen-lockfile --silent\\npublish_kept ${job.replace(/[$"]/g, m => `\\${m}`)}\\n`))
    expect(s.indexOf('\npublish_kept '), name).toBeGreaterThan(s.indexOf('merge.entity.driver'))
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
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toContain('pnpm engine photo-privacy --write ||')
  // Missing, every run would keep its work and publish nothing.
  expect(readFileSync(join(ROOT, 'packages/engine/src/cli.ts'), 'utf8')).toContain("cmd === 'photo-privacy'")
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
  for (const [name, job] of [['engine-cycle.sh', '"$PART"'], ['video-cycle.sh', 'videos'], ['video-recheck.sh', 'video-recheck']] as const) {
    expect(script(name), name).toContain(`log "push failed three times"; keep_lost_push ${job};`)
    expect(script(name).match(/push failed three times/g), name).toHaveLength(1)
  }
})
