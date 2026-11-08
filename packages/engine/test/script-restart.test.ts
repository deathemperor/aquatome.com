import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const scripts = new URL('../../../scripts/', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, scripts), 'utf8')
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe' })

// 2026-11-08: a video run reset its clone to main, where its script now committed before testing, and went on with the
// script it started with (git writes main's as a new file, and bash keeps the one it opened): it tested first, failed,
// and left its work uncommitted.
test("a run whose script changed on main goes on with main's script from the top, once", () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-restart-'))
  git(dir, 'init', '-q', '--bare', '-b', 'main', 'origin.git')
  git(dir, 'clone', '-q', 'origin.git', 'work')
  const work = join(dir, 'work')
  mkdirSync(join(work, 'scripts'))
  copyFileSync(new URL('cycle-checks.sh', scripts), join(work, 'scripts/cycle-checks.sh'))
  const job = (v: string, pad: string) => `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
log() { echo "$*"; }
source scripts/cycle-checks.sh
${pad}echo started >> ../starts.txt
from_main "$@"
echo "${v} $*" >> ../out.txt
`
  writeFileSync(join(work, 'scripts/job.sh'), job('v1', ''))
  git(work, 'add', '.')
  git(work, 'commit', '-q', '-m', 'v1')
  git(work, 'push', '-q', 'origin', 'main')
  git(dir, 'clone', '-q', 'origin.git', 'engine')
  // Main's version: more lines above the reset, so every byte after it moves, and the last line changes.
  writeFileSync(join(work, 'scripts/job.sh'), job('v2', `# ${'a longer comment above the reset. '.repeat(8)}\n`))
  git(work, 'commit', '-q', '-am', 'v2')
  git(work, 'push', '-q', 'origin', 'main')

  execFileSync('bash', [join(dir, 'engine/scripts/job.sh'), 'rewrite'], { cwd: dir, stdio: 'pipe' })
  expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe('v2 rewrite\n')
  // The script it started with, then main's, which finds itself current and goes on.
  expect(readFileSync(join(dir, 'starts.txt'), 'utf8')).toBe('started\nstarted\n')
  expect(existsSync(join(dir, 'engine/.git'))).toBe(true)
})

test('every engine and video script resets through from_main, and a restarted run is not taken for an earlier one', () => {
  for (const f of ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh']) {
    const s = read(f)
    expect(s, f).not.toMatch(/reset -q --hard/)
    expect(s.indexOf('from_main "$@"'), f).toBeGreaterThan(s.indexOf('scripts/cycle-checks.sh'))
    expect(s.indexOf('scripts/cycle-checks.sh'), f).toBeGreaterThan(-1)
    // Its own process number in the PID file is this run, started again.
    expect(s, f).toMatch(/\[ -f "\$PIDFILE" \] && \[ "\$\(cat "\$PIDFILE"\)" != \$\$ \] && ps -p/)
  }
})
