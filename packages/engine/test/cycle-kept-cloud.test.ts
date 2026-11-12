import { execSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

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
  return { runner, cycle, failedRun, nextRun, land, onGitHub, onMain, branchOnGitHub, refusing }
}

test('a cloud cycle whose tests ran out of time keeps its work on GitHub, and the next run publishes it and deletes that branch', () => {
  const g = github()
  expect(g.failedRun(TIMEOUT)).toMatch(/LOG tests ran out of time: this run's work is kept on kept\/rewrite\/\d{8}T\d{6} for the next run/)
  const [kept = ''] = g.onGitHub()
  expect(kept).toMatch(/^kept\/rewrite\/\d{8}T\d{6}$/)
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
  const held = kept.replace(/^kept\//, 'held/')
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
  // A fix lands. Out of time on its try, it stays held and untried; the run after, it passes and is published.
  g.land('packages/code.ts', '2')
  expect(g.nextRun({ CHECK: TIMEOUT })).toContain(`LOG ${held} isn't published yet (tests out of time again): it stays held for the next run's try`)
  expect(g.onGitHub()).toEqual([held])
  const log = g.nextRun()
  expect(log).toContain(`LOG trying ${held} once more: main's code has changed since it was held`)
  expect(log).toContain(`LOG published ${held}`)
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
})

test('held branches on GitHub are dropped after 14 days, each by its own name; young ones and other jobs\' stay', () => {
  const g = github()
  const when = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace(/[-:]/g, '')
  const [old, tried, young, other, photos] = [`held/rewrite/${when(15)}`, `held/rewrite/${when(16)}-tried`, `held/rewrite/${when(13)}`, `held/rewrite-x/${when(15)}`, `held/photos/${when(15)}`]
  for (const b of [old, tried, young, other, photos]) g.branchOnGitHub(b)
  expect(g.nextRun().split('\n').sort()).toEqual([`LOG ${old} was held 14 days: dropped`, `LOG ${tried} was held 14 days: dropped`].sort())
  expect(g.onGitHub().sort()).toEqual([young, other, photos].sort())
})

test('a branch that can\'t be pushed is said, and the run still goes on to say it isn\'t publishing', () => {
  const g = github()
  g.refusing(true)
  const log = g.failedRun(TIMEOUT, {}, '; echo "WENT ON"')
  expect(log).toMatch(/LOG kept\/rewrite\/\d{8}T\d{6} couldn't be pushed to GitHub: this run's work is lost with the runner\nWENT ON$/)
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
  expect(s.match(/--delete [^\n]*/g)).toEqual(['--delete "refs/heads/$1"', '--delete "refs/heads/$1"'])
})
