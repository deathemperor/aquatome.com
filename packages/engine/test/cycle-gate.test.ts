import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const script = (name: string) => readFileSync(join(ROOT, 'scripts', name), 'utf8')

// The gate (gate.ts) reads what a run changed before readers get it, so it runs after the last step that writes pages and
// before the run looks for changes, since its holds are changes, and commits them.
test('each run that writes pages gates them last, before it commits, and only a crash in the gate stops it', () => {
  for (const [name, message, paths] of [
    ['engine-cycle.sh', 'content: engine $PART', 'content sources engine-state docs/review apps/site/src/i18n'],
    ['video-cycle.sh', 'content: videos', 'content engine-state docs/review'],
    ['video-recheck.sh', 'content: video guides checked again', 'content engine-state docs/review'],
  ] as const) {
    const s = script(name)
    // On a crash it keeps what the run itself would commit.
    const gate = s.indexOf(`gate_or_keep "${message}" ${paths} || exit 1`)
    expect(gate, name).toBeGreaterThan(s.indexOf('pnpm engine sweep || log'))
    expect(gate, name).toBeLessThan(s.indexOf('if [ -z "$(git status --porcelain'))
    expect(gate, name).toBeLessThan(s.indexOf(`git add ${paths}`))
    expect(gate, name).toBeLessThan(s.indexOf(`git commit -q -m "${message}`))
  }
})

/**
 * gate_or_keep (scripts/cycle-checks.sh) in a real repository whose GitHub main is a bare one, with a stub for the engine
 * that exits with `code` for `pnpm engine gate`, after the run changed `content/page`.
 */
function gateRun(code: number) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-gate-'))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/pnpm'), `#!/bin/sh\n[ "$1 $2" = "engine gate" ] && exit ${code}\nexit 0\n`, { mode: 0o755 })
  const r = spawnSync('bash', ['-c', `
    set -euo pipefail
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    export PATH="${dir}/bin:$PATH"
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git cycle 2>/dev/null && cd cycle
    mkdir content && printf 'old' > content/page && git add content && git commit -qm 'main' && git push -q origin main
    printf 'new' > content/page && printf 'x' > outside
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    gate_or_keep "content: engine pages" content && echo "CODE 0" || echo "CODE $?"
    echo "HEAD $(git rev-parse --abbrev-ref HEAD)"
    git branch --format='BRANCH %(refname:short) %(subject)'
    echo "ORIGIN $(git --git-dir=../origin.git log --format=%s main | tr '\\n' '|')"
    git status --porcelain | sed 's/^/DIRTY /'`], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal|error/i)
  return r.stdout
}

test('a crash in the gate keeps the run\'s work on a branch of its own, committed and never pushed', () => {
  const out = gateRun(1)
  expect(out).toContain('CODE 1')
  expect(out).toMatch(/^LOG gate: took \d+ s$/m)
  const branch = out.match(/^BRANCH (gate-crashed\/\d{8}T\d{6}) content: engine pages, gate crashed, not published \d{4}-\d{2}-\d{2}$/m)?.[1]
  expect(branch).toBeTruthy()
  expect(out).toContain(`LOG gate: crashed, not publishing: this run's work is committed on ${branch}, not pushed`)
  // main is as it was, here and on GitHub, so neither the next run's reset nor its push can take the work out ungated.
  expect(out).toMatch(/^BRANCH main main$/m)
  expect(out).toContain('ORIGIN main|')
  // Only the paths the run commits go on the branch.
  expect(out).toContain('DIRTY ?? outside')
  expect(out).not.toContain('DIRTY  M content/page')
})

test('a gate that runs through is timed and leaves the run to commit as before', () => {
  const out = gateRun(0)
  expect(out).toContain('CODE 0')
  expect(out).toMatch(/^LOG gate: took \d+ s$/m)
  expect(out).toContain('HEAD main')
  expect(out).not.toContain('gate-crashed')
  expect(out).toContain('DIRTY  M content/page')
})
