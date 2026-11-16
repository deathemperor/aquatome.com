import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slow } from '@aq/schema/test-time'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * checks_for and verify_cycle (scripts/cycle-checks.sh) in a real repository, as a Mac's engine clone (under
 * $HOME/.local/share/aquatome): main has a code commit, then another part's content; the cycle commits its own
 * files (`mine`), then, with `merge`, main gets more code and the cycle merges it in, changing code itself in the merge
 * when it's `mine`. `unit` is GitHub's word on a commit's unit-test job, given in turn (the last repeats), or a line per
 * call: AQ_UNIT_JOB stands in for gh. `stamp`: the age in hours of the Mac's last whole-suite pass, or none. Returns what
 * the cycle logged, the step verify was given, and whether the stamp is fresh after.
 */
function decide(o: { mine?: string[]; merge?: 'main' | 'mine'; unit?: string[]; stamp?: number; taken?: number; hour?: number; env?: Record<string, string> } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aq-checks-for-'))
  const clone = join(home, '.local/share/aquatome/engine-pages')
  const answers = (o.unit ?? ['success']).join('\n')
  for (const [file, hours] of [['full-suite-passed', o.stamp], ['full-suite-passed.taken', o.taken]] as const) {
    if (hours === undefined) continue
    const stamp = join(home, '.cache/aquatome', file)
    mkdirSync(dirname(stamp), { recursive: true })
    writeFileSync(stamp, '')
    const at = Date.now() / 1000 - hours * 3600
    utimesSync(stamp, at, at)
  }
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${home}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main
    mkdir -p src content && printf 'code' > src/a.ts && git add src && git commit -qm 'feat: code' && git rev-parse HEAD > ../code-sha
    printf '{}' > content/other.json && git add content && git commit -qm 'content: engine sf' && git push -q origin main && cd ..
    mkdir -p "$(dirname "${clone}")" && git clone -q -b main origin.git "${clone}" && cd "${clone}"
    for f in ${(o.mine ?? ['content/page.json']).join(' ')}; do mkdir -p "$(dirname "$f")" && printf 'x' > "$f"; done
    git add -A && git commit -qm 'content: engine pages'
    ${o.merge ? `cd "${home}/other" && printf 'more' > src/b.ts && git add src && git commit -qm 'feat: more code' && git push -q origin main && git rev-parse HEAD > ../code-sha
    cd "${clone}" && git fetch -q && git merge -q --no-ff --no-commit origin/main
    ${o.merge === 'mine' ? `printf 'mine' >> src/a.ts && git add src` : ''}
    git commit -qm 'merge main'` : ''}
    printf '%s\\n' "${answers}" > "${home}/answers"
    cat > "${home}/unit" <<'STUB'
#!/bin/bash
n=$(cat "$(dirname "$0")/calls" 2>/dev/null || echo 0); echo $((n + 1)) > "$(dirname "$0")/calls"
echo "$1" >> "$(dirname "$0")/asked"
lines=$(wc -l < "$(dirname "$0")/answers"); i=$((n + 1)); [ "$i" -le "$lines" ] || i=$lines
sed -n "\${i}p" "$(dirname "$0")/answers"
STUB
    chmod +x "${home}/unit"
    # As on the Mac, wherever the tests run (GitHub's runner sets these); the env option sets them for the cloud's cycle.
    unset GITHUB_ACTIONS GITHUB_WORKFLOW_REF
    export HOME="${home}" AQ_UNIT_JOB="${home}/unit" UNIT_POLL_SECONDS=0 UNIT_WAIT_SECONDS=3 AQ_HOUR=${o.hour ?? 12}
    ${Object.entries(o.env ?? {}).map(([k, v]) => `export ${k}='${v}'`).join('\n')}
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    verify() { echo "VERIFY $1"; }
    verify_cycle
    echo "CODE $?"
    echo "CODESHA $(cat ../../../../code-sha)"
    [ -n "$(find "${home}/.cache/aquatome/full-suite-passed" -mmin -5 2>/dev/null)" ] && echo "STAMP fresh" || echo "STAMP old"
    [ -n "$(find "${home}/.cache/aquatome/full-suite-passed.taken" -mmin -5 2>/dev/null)" ] && echo "TAKEN fresh" || echo "TAKEN old"
    echo "ASKED $(sort -u "${home}/asked" 2>/dev/null | tr '\\n' ' ')"`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal|syntax error|unbound/i)
  const code = r.stdout.match(/^CODESHA (\w+)$/m)?.[1] ?? ''
  return {
    out: r.stdout,
    why: r.stdout.match(/^LOG tests: (.*)$/m)?.[1] ?? '',
    step: r.stdout.match(/^VERIFY (.*)$/m)?.[1] ?? '',
    code,
    asked: r.stdout.match(/^ASKED (.*)$/m)?.[1]?.trim().split(' ').filter(Boolean) ?? [],
    stamp: r.stdout.includes('STAMP fresh'),
    taken: r.stdout.includes('TAKEN fresh'),
  }
}
// Each case builds its own repositories and runs the cycle's script: the four tests took 53 s together at a load of 200
// (16 Nov 2026), so each gets two minutes, scaled.
const FULL = 'pnpm test', CONTENT = 'pnpm engine check-content && pnpm test:content'

// The chief of staff, 16 Nov 2026: a content run checks its content once main's code passed on GitHub; anything that
// can't be shown takes the whole suite.
test('a run whose own commits are content, on a main commit whose unit tests passed on GitHub, checks its content', () => {
  const r = decide({ unit: ['success'], stamp: 2 })
  expect(r.step).toBe(CONTENT)
  // GitHub was asked about the commit that last changed code, not the content commit after it or the run's own.
  expect(r.asked).toEqual([r.code])
  expect(r.why).toBe(`the content's checks: its code is main's ${r.code.slice(0, 9)}, whose unit tests passed on GitHub`)
  expect(r.out).toContain('CODE 0')
  // The short path doesn't stand for a whole-suite pass on the Mac.
  expect(r.stamp).toBe(false)
  // docs/review, the engine's review files, count as content; sources/ and engine-state/ too.
  expect(decide({ mine: ['docs/review/x.md', 'sources/s.json', 'engine-state/e.json'], stamp: 2 }).step).toBe(CONTENT)
}, slow(120_000))

test('anything that can\'t be shown takes the whole suite: code in the run, a failed, cancelled or unanswered job', () => {
  // The run's own commit changes code: a UI string file is code, not content.
  const own = decide({ mine: ['content/page.json', 'apps/site/src/i18n/id.json'], stamp: 2 })
  expect([own.step, own.why]).toEqual([FULL, 'the whole suite: this run\'s own commits change code'])
  expect(own.asked).toEqual([])
  // docs/ outside docs/review is not content.
  expect(decide({ mine: ['docs/governance.md'], stamp: 2 }).step).toBe(FULL)
  for (const word of ['failure', 'cancelled', 'skipped']) {
    const r = decide({ unit: [word], stamp: 2 })
    expect([r.step, r.why], word).toEqual([FULL, `the whole suite: GitHub's unit tests on ${r.code.slice(0, 9)}, the code this run publishes on, ended ${word}`])
  }
  const silent = decide({ unit: [''], stamp: 2 })
  expect([silent.step, silent.why]).toEqual([FULL, `the whole suite: GitHub's unit tests on ${silent.code.slice(0, 9)}, the code this run publishes on, gave no answer`])
  // The cloud's cycle (engine.yml): its token can't read checks, so it takes the whole suite without asking.
  const cloud = decide({ stamp: 2, env: { GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW_REF: 'deathemperor/aquatome.com/.github/workflows/engine.yml@refs/heads/main' } })
  expect([cloud.step, cloud.why, cloud.asked]).toEqual([FULL, 'the whole suite: the cloud\'s runner doesn\'t read GitHub\'s checks', []])
  // With no stand-in, an origin that isn't GitHub (these tests' own repositories) gets no answer, and no call goes out.
  expect(decide({ stamp: 2, env: { AQ_UNIT_JOB: '' } }).why).toMatch(/gave no answer$/)
}, slow(120_000))

test('a merge with main: its code is main\'s newest, which GitHub is asked about; a merge that changes code itself is the run\'s own', () => {
  const merged = decide({ merge: 'main', stamp: 2 })
  expect(merged.step).toBe(CONTENT)
  expect(merged.asked).toEqual([merged.code])
  const own = decide({ merge: 'mine', stamp: 2 })
  expect([own.step, own.why]).toEqual([FULL, 'the whole suite: this run\'s own commits change code'])
}, slow(120_000))

test('a unit job still running is waited on, up to its limit: green in time is the short path, still running is the whole suite', () => {
  const late = decide({ unit: ['pending', 'pending', 'success'], stamp: 2 })
  expect(late.step).toBe(CONTENT)
  expect(late.out).toMatch(/LOG GitHub's unit tests on \w{9}, the code this run publishes on, are still running: waiting up to 0 min/)
  const never = decide({ unit: ['pending'], stamp: 2, env: { UNIT_POLL_SECONDS: '1', UNIT_WAIT_SECONDS: '2' } })
  expect(never.step).toBe(FULL)
  expect(never.why).toMatch(/, still running after 0 min$/)
}, slow(120_000))

test('the whole suite runs on this Mac once a day, at a quiet hour, and its pass is remembered', () => {
  // None passed in 20 hours, at a quiet hour: the whole suite, and its pass is stamped.
  const day = decide({ unit: ['success'], stamp: 21, hour: 3 })
  expect([day.step, day.why]).toEqual([FULL, 'the whole suite: its daily run on this Mac'])
  expect(day.asked).toEqual([])
  expect(day.stamp).toBe(true)
  expect(day.taken).toBe(true)
  // Taken by another run in the last 4 hours, still at it: this one checks its content. Taken longer ago: this one runs it.
  expect(decide({ unit: ['success'], stamp: 21, taken: 1, hour: 3 }).step).toBe(CONTENT)
  expect(decide({ unit: ['success'], stamp: 31, taken: 1, hour: 14 }).step).toBe(CONTENT)
  expect(decide({ unit: ['success'], stamp: 21, taken: 5, hour: 3 }).why).toBe('the whole suite: its daily run on this Mac')
  // The same at a busy hour waits for a quiet one, up to 30 hours; none ever passed counts as past 30.
  expect(decide({ unit: ['success'], stamp: 21, hour: 14 }).step).toBe(CONTENT)
  expect(decide({ unit: ['success'], stamp: 31, hour: 14 }).why).toBe('the whole suite: its daily run on this Mac')
  expect(decide({ unit: ['success'], hour: 14 }).why).toBe('the whole suite: its daily run on this Mac')
  // A whole suite taken for another reason is stamped too.
  expect(decide({ unit: ['failure'], stamp: 2 }).stamp).toBe(true)
}, slow(120_000))
