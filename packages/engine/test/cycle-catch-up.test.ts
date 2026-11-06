import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * catch_up (scripts/cycle-checks.sh) in a real repository: GitHub's main (a bare repository) moves on with `landed`
 * while the cycle's clone, still on the main it started from, commits its content (`mine`). Returns the clone's
 * commits, newest first, its files, and what the cycle logged.
 */
function catchUp(landed: { file: string; text: string }, mine: { file: string; text: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-catch-up-'))
  const commit = (f: { file: string; text: string }, msg: string) => `printf '%s' '${f.text}' > ${f.file} && git add ${f.file} && git commit -qm '${msg}'`
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main && printf 'a' > shared && git add shared && git commit -qm 'main as the cycle started' && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    cd other && ${commit(landed, 'landed meanwhile')} && git push -q origin main && cd ..
    cd cycle && ${commit(mine, 'content: engine pages')}
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    catch_up
    echo "CODE $?"
    git log --format='COMMIT %s'
    git status --porcelain | sed 's/^/DIRTY /'`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  return { out: r.stdout, commits: [...r.stdout.matchAll(/^COMMIT (.*)$/gm)].map(m => m[1]), read: (f: string) => readFileSync(join(dir, 'cycle', f), 'utf8') }
}

test('a cycle\'s content is checked on top of main as it is now, not the main it started from hours ago', () => {
  const r = catchUp({ file: 'fix', text: 'the test main fixed meanwhile' }, { file: 'page', text: 'new page' })
  expect(r.out).toContain('CODE 0')
  expect(r.commits).toEqual(['content: engine pages', 'landed meanwhile', 'main as the cycle started'])
  expect(r.read('fix')).toBe('the test main fixed meanwhile')
  expect(r.out).not.toContain('DIRTY')
})

test('a clash with what landed meanwhile leaves the cycle\'s commit as it was, for push() to settle', () => {
  const r = catchUp({ file: 'shared', text: 'theirs' }, { file: 'shared', text: 'mine' })
  expect(r.out).toContain('CODE 0')
  expect(r.out).toContain('LOG main changed this cycle\'s files meanwhile')
  expect(r.commits).toEqual(['content: engine pages', 'main as the cycle started'])
  expect(r.read('shared')).toBe('mine')
  expect(r.out).not.toContain('DIRTY')
})

test('the engine cycle commits its content and catches up with main before the check that decides whether it publishes', () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  const at = (s: string) => cycle.lastIndexOf(s)
  expect(at('git commit -q -m "content: engine')).toBeGreaterThan(-1)
  expect(at('\ncatch_up\n')).toBeGreaterThan(at('git commit -q -m "content: engine'))
  expect(at('verify \'I18N_LENIENT=1')).toBeGreaterThan(at('\ncatch_up\n'))
  expect(at('push || exit 1')).toBeGreaterThan(at('verify \'I18N_LENIENT=1'))
})
