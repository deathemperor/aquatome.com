import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const CHECKS = join(ROOT, 'scripts/cycle-checks.sh')

/**
 * verify (scripts/cycle-checks.sh) as on the Mac, with its turn (checks.sh, lockf) stood in for: it notes when a step takes the checks lock
 * and gives it back, and hands it to `waiter` (a job that queued meanwhile, as lockf's queue does) at the first give.
 * Returns what took the lock, in order, how often the checks waited for the Mac to calm, and verify's exit code.
 */
function turns(steps: string[], waiter = '') {
  const dir = mkdtempSync(join(tmpdir(), 'aq-turns-'))
  const script = `
    unset GITHUB_ACTIONS
    log() { echo "LOG $*"; }
    TEST_LOG="${dir}/test.log"
    source "${CHECKS}"
    calm() { echo CALM; }
    waiter='${waiter}'
    turn() {
      echo "TAKE \${*: -1}"; "$@"; local r=$?; echo GIVE
      if [ -n "$waiter" ]; then echo "TAKE $waiter"; echo GIVE; waiter=; fi
      return $r
    }
    verify ${steps.map(s => `'${s}'`).join(' ')}
    echo "CODE $?"`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  const lock = readFileSync(join(dir, 'test.log'), 'utf8').split('\n').filter(l => /^(TAKE|GIVE)/.test(l))
  return { lock, calm: r.stdout.match(/^CALM$/gm)?.length ?? 0, code: Number(/^CODE (\d+)$/m.exec(r.stdout)?.[1]) }
}

test('the checks take the lock a step at a time: whoever waits goes in between the build and the tests', () => {
  // 2026-11-07: one part's build and tests held the lock for 3 h 23 min, with four jobs waiting behind them.
  const r = turns(['echo build', 'echo test'], 'xcodebuild test')
  expect(r.lock).toEqual(['TAKE echo build', 'GIVE', 'TAKE xcodebuild test', 'GIVE', 'TAKE echo test', 'GIVE'])
  // The wait for a calmer Mac comes once, before the first step: the queue is the wait after that.
  expect(r).toMatchObject({ calm: 1, code: 0 })
  // A failed step gives the lock back, and the steps after it don't queue for it.
  expect(turns(['exit 3', 'echo test'])).toMatchObject({ lock: ['TAKE exit 3', 'GIVE'], code: 1 })
})

/**
 * verify_cycle (scripts/cycle-checks.sh) in a real repository: GitHub's main (a bare repository) as the cycle left it,
 * then `landed` there meanwhile (another part's push), then this clone's commit of `mine`. Returns the steps it checks.
 */
function stepsFor(mine: string[], landed: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-steps-'))
  const write = (files: string[]) => files.map(f => `mkdir -p "$(dirname ${f})" && echo "$RANDOM" > ${f}`).join(' && ')
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main && echo a > README && git add . && git commit -qm main && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    ${landed.length ? `cd other && ${write(landed)} && git add -A && git commit -qm landed && git push -q origin main && cd ..` : ''}
    cd cycle && git fetch -q && ${write(mine)} && git add -A && git commit -qm 'content: engine pages'
    log() { echo "LOG $*"; }
    source "${CHECKS}"
    verify() { printf 'STEP %s\\n' "$@"; }
    verify_cycle`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  return [...r.stdout.matchAll(/^STEP (.*)$/gm)].map(m => m[1])
}

test('a cycle\'s commit is checked by the tests alone, whatever it changed: deploy.yml builds the real site', () => {
  // 2026-11-07: the real build held the lock 1 to 3 hours a part on this Mac, and no test reads it.
  const tests = ['pnpm test']
  expect(stepsFor(['engine-state/_photo-subjects.json', 'docs/review/photo-subjects.md'])).toEqual(tests)
  expect(stepsFor(['sources/seriouslyfish/betta.json'])).toEqual(tests)
  expect(stepsFor(['content/species/betta-splendens/entity.json', 'engine-state/_photo-subjects.json'])).toEqual(tests)
  expect(stepsFor(['apps/site/src/i18n/id.json'])).toEqual(tests)
})
