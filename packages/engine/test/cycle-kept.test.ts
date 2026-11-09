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
    log() { :; }; TEST_LOG="${dir}/test.log"; source "${CHECKS}"; calm() { :; }
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
  // Out of time, then a real failure; a real failure at once; out of time, then passing.
  expect(timedOut([late, 'AssertionError: expected 1 to be 2'])).toBe('code=1 timed_out=')
  expect(timedOut(['AssertionError: expected 1 to be 2'])).toBe('code=1 timed_out=')
  expect(timedOut([late, 'ok'])).toBe('code=0 timed_out=')
  // A long log after the time-out, as a whole suite's is: still read as out of time, under the scripts' pipefail.
  expect(timedOut(['long', 'long'])).toBe('code=1 timed_out=1')
})

// An engine clone (~/.local/share/aquatome/<job>) of a bare origin, its main one commit; `pnpm` stood in for (the sweep);
// `checks` passes unless CHECK is set, and prints it (so CHECK='Error: Test timed out in …' runs out of time).
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
    log() { echo "LOG $*"; }; TEST_LOG="${home}/test.log"; source "${CHECKS}"; calm() { :; }
    checks() { [ -z "\${CHECK:-}" ] || { echo "$CHECK"; return 1; }; }
    ${body}`, extra)
  // A run of the job: its work committed, its tests out of time twice (keep_timed_out), then the next run's start.
  const timedOutRun = () => {
    sh('echo photos > content/b.json && git add . && git commit -qm "content: engine photos"')
    const log = cycle("verify 'pnpm test' || keep_timed_out photos", { CHECK: 'Error: Test timed out in 30000ms.' })
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
  expect(c.branches()).toEqual([kept.replace(/^kept\//, 'kept-failed/')])
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

test('a real failure, or a checkout that is not an engine clone, keeps nothing', () => {
  const c = clone()
  c.sh('echo photos > content/b.json && git add . && git commit -qm photos')
  c.cycle("verify 'pnpm test' || keep_timed_out photos", { CHECK: 'AssertionError: expected 1 to be 2' })
  expect(c.branches()).toEqual([])
  c.cycle("verify 'pnpm test' || keep_timed_out photos", { CHECK: 'Error: Test timed out in 30000ms.', HOME: '/nonexistent' })
  expect(c.branches()).toEqual([])
})

test('the engine cycle and both video jobs keep timed-out work wherever they give up publishing, and publish it first', () => {
  const jobs: [string, string][] = [['engine-cycle.sh', '"$PART"'], ['video-cycle.sh', 'videos'], ['video-recheck.sh', 'video-recheck']]
  for (const [name, job] of jobs) {
    const s = script(name)
    // Each "not publishing" after the checks keeps the work first: after the run's commit, and after a merge on push.
    const gaveUp = s.split('\n').filter(l => /not publishing/.test(l) && !/gate:/.test(l))
    expect(gaveUp.length, name).toBe(2)
    expect(s.match(new RegExp(`keep_timed_out ${job.replace(/[$"]/g, m => `\\${m}`)}`, 'g'))?.length, name).toBe(2)
    // Kept work is published once a run has installed and set its merge drivers, before it does its own work.
    expect(s, name).toMatch(new RegExp(`pnpm install --frozen-lockfile --silent\\npublish_kept ${job.replace(/[$"]/g, m => `\\${m}`)}\\n`))
    expect(s.indexOf('\npublish_kept '), name).toBeGreaterThan(s.indexOf('merge.entity.driver'))
  }
})
