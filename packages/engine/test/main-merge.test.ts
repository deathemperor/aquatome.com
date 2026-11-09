import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const ONLY_MAIN = join(ROOT, 'apps/ios/scripts/only-main-merged.sh')
const HOOK = join(ROOT, '.claude/hooks/main-merge.sh')

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }

/** A repository whose `main` has an app file and a doc, and a branch `pr` off it that changes the app file. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'aq-merge-'))
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' })
    return { ok: r.status === 0, out: r.stdout.trim() }
  }
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-qm', message)
    return git('rev-parse', 'HEAD').out
  }
  git('init', '-q', '-b', 'main')
  write('apps/ios/AquaTome/A.swift', 'a\nb\nc\nd\ne\nf\ng\n')
  write('apps/ios/AquaTome/B.swift', 'one\n')
  write('docs/notes.md', 'x\n')
  commit('start')
  git('checkout', '-qb', 'pr')
  write('apps/ios/AquaTome/A.swift', 'a\nb\nc\nd\ne\nf\nG, the change\n')
  const before = commit('the change')
  git('update-ref', 'refs/remotes/origin/main', 'main')
  return { dir, git, write, commit, before }
}

const onlyMain = (dir: string, before: string, after: string) =>
  spawnSync(ONLY_MAIN, [before, after, 'main'], { cwd: dir, env: ENV, encoding: 'utf8' })

test('a push that only merges main in is told apart from new code in the app', () => {
  const r = repo()
  // Main moves on: another app file and a doc.
  r.git('checkout', '-q', 'main')
  r.write('apps/ios/AquaTome/B.swift', 'two\n')
  r.write('docs/notes.md', 'y\n')
  r.commit('main moves on')
  r.git('checkout', '-q', 'pr')
  r.git('merge', '-q', '--no-edit', 'main')
  const merged = r.git('rev-parse', 'HEAD').out
  expect(onlyMain(r.dir, r.before, merged).status).toBe(0)
  // Anything else is new code: a plain commit, the merge with an app change folded in, a merge of another branch.
  r.write('apps/ios/AquaTome/B.swift', 'two, and more\n')
  const commit = r.commit('a change of its own')
  expect(onlyMain(r.dir, merged, commit).stdout).toContain('not a merge')
  r.git('reset', '-q', '--hard', merged)
  r.write('apps/ios/AquaTome/A.swift', 'a\nb\nc\nd\ne\nf\nG, changed in the merge\n')
  r.git('commit', '-q', '--amend', '-a', '--no-edit')
  expect(onlyMain(r.dir, r.before, r.git('rev-parse', 'HEAD').out).stdout).toContain('beyond the merge')
  r.git('checkout', '-qb', 'other', r.before + '~1')
  r.write('docs/other.md', 'z\n')
  r.commit('another branch')
  r.git('checkout', '-q', 'pr')
  r.git('reset', '-q', '--hard', r.before)
  r.git('merge', '-q', '--no-edit', 'other')
  expect(onlyMain(r.dir, r.before, r.git('rev-parse', 'HEAD').out).stdout).toContain("isn't main's")
})

test("a merge of main that resolved a conflict in the app's files runs, one in a doc doesn't", () => {
  for (const [file, runs] of [['apps/ios/AquaTome/A.swift', true], ['docs/notes.md', false]] as const) {
    const r = repo()
    // The branch and main both change the same line.
    if (file === 'docs/notes.md') {
      r.write(file, 'the branch\n')
      r.commit('the branch writes the doc')
    }
    const before = r.git('rev-parse', 'HEAD').out
    r.git('checkout', '-q', 'main')
    r.write(file, file.endsWith('.md') ? 'main\n' : 'a\nb\nc\nd\ne\nf\nmain\n')
    r.commit('main changes the same line')
    r.git('checkout', '-q', 'pr')
    expect(r.git('merge', '-q', '--no-edit', 'main').ok).toBe(false)
    r.write(file, file.endsWith('.md') ? 'both\n' : 'a\nb\nc\nd\ne\nf\nG, the change, and main\n')
    r.commit('merge main, resolved')
    const got = onlyMain(r.dir, before, r.git('rev-parse', 'HEAD').out)
    expect(got.status, `${file}: ${got.stdout}`).toBe(runs ? 1 : 0)
    if (runs) expect(got.stdout).toContain('resolved a conflict in apps/ios/AquaTome/A.swift')
  }
})

/** The hook on `command`, run in `dir`, with `gh pr view` answering `draft` (true, false, or no pull request). */
function hook(dir: string, command: string, draft: boolean | null) {
  const bin = mkdtempSync(join(tmpdir(), 'aq-gh-'))
  writeFileSync(join(bin, 'gh'), draft === null ? '#!/bin/sh\nexit 1\n' : `#!/bin/sh\necho ${draft}\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  const input = JSON.stringify({ tool_input: { command }, cwd: dir })
  return spawnSync(HOOK, [], { input, env: { ...ENV, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' }).status
}

test("a ready pull request's branch takes main in only to resolve a conflict", () => {
  const r = repo()
  r.git('checkout', '-q', 'main')
  r.write('apps/ios/AquaTome/B.swift', 'two\n')
  r.commit('main moves on')
  r.git('update-ref', 'refs/remotes/origin/main', 'main')
  r.git('checkout', '-q', 'pr')
  for (const command of ['git merge origin/main', 'git fetch -q origin && git merge --no-edit origin/main', 'git pull origin main',
    'git pull --no-rebase origin main', `git -C ${r.dir} merge main`, 'git rebase origin/main', 'gh pr update-branch 12',
    "bash -c 'git merge origin/main'"])
    expect(hook(r.dir, command, false), command).toBe(2)
  // A draft's branch, a branch with no pull request, another branch merged, and words that only name main.
  expect(hook(r.dir, 'git merge origin/main', true)).toBe(0)
  expect(hook(r.dir, 'git merge origin/main', null)).toBe(0)
  for (const command of ['git merge feature', 'git commit -m "merge origin/main later"', 'git log origin/main..HEAD',
    'git pull', 'git pull origin pr', "cat <<'EOF'\ngit merge origin/main\nEOF", 'gh pr view --json mergeable'])
    expect(hook(r.dir, command, false), command).toBe(0)
  // A conflict with main: that's what a merge of main is for.
  r.git('checkout', '-q', 'main')
  r.write('apps/ios/AquaTome/A.swift', 'a\nb\nc\nd\ne\nf\nmain\n')
  r.commit('main changes the same line')
  r.git('update-ref', 'refs/remotes/origin/main', 'main')
  r.git('checkout', '-q', 'pr')
  expect(hook(r.dir, 'git merge origin/main', false)).toBe(0)
})
