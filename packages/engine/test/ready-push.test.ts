import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const HOOK = join(ROOT, '.claude/hooks/ready-push.sh')

// A checkout on branch `feat/x`, and in it a folder `other` on branch `feat/other`, with `gh` stood in for: PR is "ready", "draft" or "none"; FILES the pull request's;
// RUN its last iOS run's status ("queued", "in_progress", or "" for one that ended). gh's --jq filters are applied here.
function hook(command: string, { PR = 'ready', FILES = 'apps/ios/AquaTome/A.swift docs/a.md', RUN = 'queued', from = 'pr' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-ready-push-'))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/gh'), `#!/bin/sh
echo "$*" >> "${dir}/asked"
case "$1 $2" in
  "pr view") [ "$PR" = none ] && exit 1; [ "$PR" = ready ] && printf '%s\\n' $FILES; exit 0 ;;
  "run list") [ -n "$RUN" ] && echo "$RUN https://github.com/o/r/actions/runs/1"; exit 0 ;;
esac
exit 1
`)
  chmodSync(join(dir, 'bin/gh'), 0o755)
  spawnSync('git', ['init', '-q', '-b', 'feat/x'], { cwd: dir })
  mkdirSync(join(dir, 'other'))
  spawnSync('git', ['init', '-q', '-b', 'feat/other'], { cwd: join(dir, 'other') })
  const r = spawnSync(HOOK, [], {
    input: JSON.stringify({ tool_input: { command: command.replaceAll('$DIR', dir) }, cwd: from === 'other' ? join(dir, 'other') : dir }),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, PR, FILES, RUN },
  })
  const asked = spawnSync('cat', [join(dir, 'asked')], { encoding: 'utf8' }).stdout
  return { code: r.status, said: r.stderr, asked }
}

test("a push to a ready iOS pull request whose run hasn't ended stops, and says what it costs and how to go ahead", () => {
  const queued = hook('git push')
  expect(queued.code).toBe(2)
  expect(queued.said).toContain('still queued (https://github.com/o/r/actions/runs/1)')
  expect(queued.said).toContain('about 80 Mac-minutes')
  expect(queued.said).toContain('If you know that run will fail (you found the bug it will hit), push now as AQ_PUSH_ANYWAY=1 git push')
  expect(queued.asked).toContain('pr view feat/x')
  expect(hook('git push -u origin HEAD', { RUN: 'in_progress' }).said).toContain('still running')
  // Another branch's push asks about that branch; inside bash -c, and after other commands, too.
  expect(hook('git push origin feat/y').asked).toContain('pr view feat/y')
  expect(hook('git add -A && bash -c "git push --force-with-lease"').code).toBe(2)
})

test('a push goes through when told to, when the run ended, and for a draft, no pull request or no app change', () => {
  expect(hook('AQ_PUSH_ANYWAY=1 git push').code).toBe(0)
  expect(hook('export AQ_PUSH_ANYWAY=1 && git push').code).toBe(0)
  expect(hook('git push', { RUN: '' }).code).toBe(0)
  expect(hook('git push', { PR: 'draft' }).code).toBe(0)
  expect(hook('git push', { PR: 'none' }).code).toBe(0)
  expect(hook('git push', { FILES: 'apps/site/src/a.ts docs/a.md' }).code).toBe(0)
  expect(hook('git push', { FILES: 'protocols/owner-feedback.openapi.json' }).code).toBe(2)
})

test("only a push of a branch is one: deleting, tags, a dry run and words that only say git push aren't", () => {
  for (const command of ['git push origin --delete feat/x', 'git push --tags', 'git push -n', 'git commit -qm "git push later"',
    'echo git push', 'gh pr view 12', "cat <<'EOF'\ngit push\nEOF"]) {
    const r = hook(command)
    expect(r.code, command).toBe(0)
    expect(r.asked, command).toBe('')
  }
})

test("a push after a cd is the branch of the folder it goes to, and a cd it can't follow lets the push go", () => {
  // From the pull request's folder to another repository's: that one's branch is asked about.
  expect(hook('cd other && git push').asked).toContain('pr view feat/other')
  expect(hook('cd other && git push').asked).not.toContain('feat/x')
  // From elsewhere into the pull request's folder: it stops there.
  expect(hook('cd $DIR && git push', { from: 'other' }).code).toBe(2)
  expect(hook('cd $DIR && bash -c "git push"', { from: 'other' }).code).toBe(2)
  // A folder that isn't there, one in a variable, or back with `cd -`: no check, and no question to gh.
  for (const command of ['cd nowhere && git push', 'cd "$HOME/x" && git push', 'cd - && git push']) {
    const r = hook(command)
    expect(r.code, command).toBe(0)
    expect(r.asked, command).toBe('')
  }
})
