import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error a plain script
import { archiveWorktree, expireArchive, simVerdict, worktreeVerdict } from '../../../scripts/machine-sweep.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const home = () => mkdtempSync(join(tmpdir(), 'aq-load-'))

test('the sweep closes a simulator nobody uses, and no other', () => {
  const sim = { name: 'iPhone 17', testing: false, session: 't3-a', abandoned: false, idleHours: 1, upHours: 20 }
  expect(simVerdict(sim)).toBe('keep')
  expect(simVerdict({ ...sim, idleHours: 14 })).toBe('close') // the 15-hour session of 2026-11-07
  expect(simVerdict({ ...sim, abandoned: true, idleHours: 1 })).toBe('close')
  expect(simVerdict({ ...sim, abandoned: true, idleHours: 0.1 })).toBe('keep')
  expect(simVerdict({ ...sim, session: undefined, upHours: 2 })).toBe('keep')
  // No session: nothing says whether someone is using it, so it's only noted.
  expect(simVerdict({ ...sim, session: undefined, upHours: 13 })).toBe('note')
  expect(simVerdict({ ...sim, session: undefined, upHours: 13, testing: true })).toBe('keep')
  // A claim left from before this boot isn't this boot's session: a lead's test run on that simulator must not close.
  expect(simVerdict({ ...sim, abandoned: true, idleHours: 40, upHours: 0.5 })).toBe('keep')
  expect(simVerdict({ ...sim, testing: true, idleHours: 14, upHours: 15 })).toBe('keep')
  expect(simVerdict({ ...sim, name: 'aquatome-ci-1', idleHours: 99 })).toBe('keep')
})

test('the sweep removes a worktree only when no work can be lost and nobody is in it', () => {
  const wt = { path: '/private/tmp/aq-content/x', liveCwd: false, liveThread: false, dirty: false, unpushed: 3, remoteBranch: false, prs: [{ state: 'MERGED', atTip: true }], hours: 30 }
  expect(worktreeVerdict(wt)).toBe('remove')
  expect(worktreeVerdict({ ...wt, hours: 1 })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, liveCwd: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, liveThread: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, dirty: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'OPEN', atTip: true }] })).not.toBe('remove')
  // Commits added after its pull request merged, or a branch closed unmerged, aren't merged work.
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'MERGED', atTip: false }] })).toBe('commits on no remote')
  expect(worktreeVerdict({ ...wt, prs: [{ state: 'CLOSED', atTip: true }] })).toBe('commits on no remote')
  // Everything on the remote: a deleted branch's goes, an unmerged branch's stays.
  expect(worktreeVerdict({ ...wt, unpushed: 0, prs: [] })).toBe('remove')
  expect(worktreeVerdict({ ...wt, unpushed: 0, prs: [], remoteBranch: true })).not.toBe('remove')
  expect(worktreeVerdict({ ...wt, unpushed: NaN, prs: [] })).not.toBe('remove') // git couldn't say
  // Left alone for a week with no live thread: a copy first, then it goes. Never one someone is in, or one git can't read.
  const week = { ...wt, hours: 200 }
  expect(worktreeVerdict({ ...week, dirty: true })).toBe('archive')
  expect(worktreeVerdict({ ...week, prs: [{ state: 'OPEN', atTip: true }] })).toBe('archive')
  expect(worktreeVerdict({ ...week, prs: [] })).toBe('archive')
  expect(worktreeVerdict({ ...week, dirty: true, liveCwd: true })).not.toBe('archive')
  expect(worktreeVerdict({ ...week, dirty: true, liveThread: true })).not.toBe('archive')
  expect(worktreeVerdict({ ...week, unpushed: NaN, prs: [] })).not.toBe('archive')
  // What the leads keep, in ~/.cache/aquatome since the restart of 2026-11-08 emptied /private/tmp: never swept.
  for (const kept of [{ ...wt, unpushed: 0, prs: [] }, { ...week, dirty: true }]) {
    expect(worktreeVerdict({ ...kept, path: join(homedir(), '.cache/aquatome/design/prototype') })).toBe('not a worktree this sweep looks after')
  }
  // Other projects, the main checkout, a thread's scratchpad.
  for (const path of [`${homedir()}/.infinitus/projects/aquatome.com`, `${homedir()}/.infinitus/worktrees/aq-breed-vectors`, '/private/tmp/claude-501/x/scratchpad/y'])
    expect(worktreeVerdict({ ...wt, path })).not.toBe('remove')
})

/** The engine's installer on a home of its own, with launchctl stood in for: `running` says a job is up. Its calls, its plists. */
function install(running: boolean) {
  const dir = home()
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/launchctl'), `#!/bin/sh\necho "$@" >> "${dir}/calls"\n[ "$1" = print ] && ${running ? 'echo "	pid = 5"' : 'exit 1'}\nexit 0\n`, { mode: 0o755 })
  for (const part of ['pages', 'sf', 'photos']) mkdirSync(join(dir, `.local/share/aquatome/engine-${part}/.git`), { recursive: true })
  const r = spawnSync('bash', [join(ROOT, 'scripts/install-engine-schedule.sh')], { env: { ...process.env, HOME: dir, PATH: `${dir}/bin:${process.env.PATH}` }, encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  return { calls: readFileSync(join(dir, 'calls'), 'utf8'), plist: (part: string) => readFileSync(join(dir, `Library/LaunchAgents/run.aquatome.engine-${part}.plist`), 'utf8') }
}

test("the engine's parts give way and start apart, and installing never stops a running one", () => {
  const { calls, plist } = install(false)
  expect(calls).toContain('bootstrap')
  const hours = (p: string) => [...plist(p).matchAll(/<key>Hour<\/key><integer>(\d+)/g)].map(m => Number(m[1]))
  expect(hours('pages')).toEqual([0, 3, 6, 9, 12, 15, 18, 21])
  expect(hours('sf')).toEqual([1, 4, 7, 10, 13, 16, 19, 22])
  expect(hours('photos')).toEqual([2, 5, 8, 11, 14, 17, 20, 23])
  for (const p of ['pages', 'sf', 'photos']) {
    expect(plist(p)).toContain('<key>Nice</key><integer>10</integer>')
    expect(plist(p)).toContain('<key>LowPriorityIO</key><true/>')
    expect(plist(p)).not.toContain('StartInterval')
    expect(spawnSync('plutil', ['-lint', '-'], { input: plist(p) }).status ?? 0).toBe(0)
  }
  expect(install(true).calls).not.toMatch(/bootout|bootstrap/)
})

test('an archived worktree can be brought back: its commits, its changes, its untracked files', () => {
  const dir = home()
  const sh = (cwd: string, script: string) => {
    const r = spawnSync('sh', ['-c', script], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
    expect(r.status, r.stderr).toBe(0)
    return r.stdout
  }
  sh(dir, 'git init -q -b main --bare origin.git && git clone -q origin.git main 2>/dev/null && cd main && git checkout -q -b main 2>/dev/null; echo a > a && git add a && git commit -qm base && git push -q origin main && git worktree add -q -b work ../wt')
  sh(`${dir}/main`, 'printf "NOTES.md\\nbuild/\\n" > .gitignore && git add .gitignore && git commit -qm ignore && git push -q origin main')
  sh(`${dir}/wt`, 'git merge -q --ff-only main && echo unsaved > b && git add b && git commit -qm "on no remote" && echo changed > a && echo new > c && echo mine > NOTES.md && mkdir build && echo out > build/x')
  const saved = archiveWorktree(`${dir}/wt`, `${dir}/archive`, new Date('2026-11-08T00:00:00Z'))
  expect(saved).toBe(`${dir}/archive/2026-11-08-wt`)
  expect(readFileSync(`${saved}/note.txt`, 'utf8')).toContain('branch: work')
  sh(`${dir}/main`, `git fetch -q ${saved}/work.bundle work:restored && git worktree add -q ../back restored && cd ../back && git apply ${saved}/uncommitted.patch && tar -xzf ${saved}/untracked.tgz`)
  expect(readFileSync(`${dir}/back/b`, 'utf8')).toBe('unsaved\n')
  expect(readFileSync(`${dir}/back/a`, 'utf8')).toBe('changed\n')
  expect(readFileSync(`${dir}/back/c`, 'utf8')).toBe('new\n')
  expect(readFileSync(`${dir}/back/NOTES.md`, 'utf8')).toBe('mine\n') // ignored, but nobody can make it again
  expect(existsSync(`${dir}/back/build/x`)).toBe(false) // build output isn't worth keeping
  // The next one of that name, the same day, doesn't overwrite it; nothing on no remote and no changes, just the note.
  sh(`${dir}/main`, 'git worktree add -q --detach ../clean main')
  expect(readdirSync(archiveWorktree(`${dir}/clean`, `${dir}/archive2`))).toEqual(['note.txt'])
  expect(archiveWorktree(`${dir}/wt`, `${dir}/archive`, new Date('2026-11-08T00:00:00Z'))).toBe(`${saved}-2`)
  // Thirty days later it goes, and nothing younger does.
  expect(expireArchive(`${dir}/archive`, Date.parse('2026-12-07T00:00:00Z'))).toEqual([])
  expect(expireArchive(`${dir}/archive`, Date.parse('2026-12-09T00:00:00Z'))).toEqual(['2026-11-08-wt', '2026-11-08-wt-2'])
}, 60_000)

test('a reading of the Mac: the small job, the queues, and load only as background', () => {
  const dir = home()
  const r = spawnSync('python3', ['-I', join(ROOT, 'scripts/machine-metric.py')], { env: { ...process.env, HOME: dir }, encoding: 'utf8' })
  // /usr/sbin's tools are the Mac's: elsewhere this script doesn't run.
  if (process.platform !== 'darwin') return
  expect(r.status, r.stderr).toBe(0)
  expect(JSON.parse(readFileSync(`${dir}/.cache/aquatome/machine-metrics.jsonl`, 'utf8'))).toMatchObject({ small_job_s: expect.any(Number), waiting_checks: expect.any(Number), waiting_sim: expect.any(Number), swap_gb: expect.any(Number), thermal: expect.any(Number), cores: expect.any(Number) })
}, 60_000)

// 2026-11-08: signing on the own Mac took the owner's keychains off their list for minutes (gh's and git's sign-in among
// them). Uploads there now run as AquaTome CI, on a runner of their own, and never touch the owner's keychains.
test("TestFlight's uploads on this Mac run as AquaTome CI on their own runner, and leave the owner's keychains alone", () => {
  const flow = readFileSync(join(ROOT, '.github/workflows/testflight.yml'), 'utf8')
  expect(flow).toContain('runner=["self-hosted","macOS","aquatome-upload"]')
  expect(flow).not.toContain('"self-hosted","macOS","aquatome"]') // main's flows' runner: an upload would wait behind them
  expect(flow).not.toMatch(/login\.keychain|keychain-list|keychain-default/)
})

