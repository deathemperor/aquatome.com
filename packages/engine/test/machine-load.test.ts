import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error a plain script
import { archiveNamed, archiveWorktree, expireArchive, helperPass, helperVerdict, scratch, scratchFolders, scratchKind, scratchVerdict, simVerdict, space, worktreeVerdict } from '../../../scripts/machine-sweep.mjs'
import { slow } from '@aq/schema/test-time'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const home = () => mkdtempSync(join(tmpdir(), 'aq-load-'))

const sh = (cwd: string, script: string) => {
  const r = spawnSync('sh', ['-c', script], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  expect(r.status, r.stderr).toBe(0)
  return r.stdout
}

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

// GitHub started the 07:00 report about 5 hours late, four days running.
// The chief of staff, 16 Nov 2026: a helper's own checkout goes an hour after its thread ends, saved first when it holds a
// commit on no remote or a change not committed. A lead's checkout a helper shared stays the lead's.
test("the sweep takes a helper's own checkout an hour after its thread ends, saving first what the remote lacks", () => {
  const now = Date.parse('2026-11-17T10:00:00Z')
  const done = { id: 'thread:delegated-task:command%3Amcp%3Ax%3Adelegate-task%3Ay', at: now - 2 * 3_600_000, active: false, runs: 1, last: 'completed' }
  const h = { path: `${homedir()}/.infinitus/worktrees/aquatome.com/infi-ffb9be67-8366a39a0df50f26`, liveCwd: false, threads: [done], dirty: false, unpushed: 0, now }
  expect(helperVerdict(h)).toBe('remove')
  expect(helperVerdict({ ...h, path: `${homedir()}/.infinitus/worktrees/aquatome.com/infinitus-0c47974a-12259ca8fd11f902` })).toBe('remove')
  // Its own commit, a change not committed, or git that can't count: saved first.
  expect(helperVerdict({ ...h, unpushed: 2 })).toBe('archive')
  expect(helperVerdict({ ...h, dirty: true })).toBe('archive')
  expect(helperVerdict({ ...h, unpushed: NaN })).toBe('archive')
  // Within the hour, still running, a process in it, or no thread found: it stays.
  expect(helperVerdict({ ...h, threads: [{ ...done, at: now - 30 * 60_000 }] })).toBe('its thread ended within the hour')
  expect(helperVerdict({ ...h, threads: [done, { ...done, at: now - 10 * 60_000 }] })).toBe('its thread ended within the hour')
  expect(helperVerdict({ ...h, threads: [{ ...done, active: true }] })).toBe('its thread is live')
  expect(helperVerdict({ ...h, liveCwd: true })).toBe('a process is working in it')
  expect(helperVerdict({ ...h, threads: [] })).toBe('no thread found for it')
  expect(helperVerdict({ ...h, threads: [{ ...done, at: NaN }] })).toBe('its thread ended within the hour')
  // A time it can't read beside an old one it can, or a live thread beside an ended one: it stays. An hour to the ms: it goes.
  expect(helperVerdict({ ...h, threads: [{ ...done, at: NaN }, { ...done, at: now - 30 * 3_600_000 }] })).toBe('its thread ended within the hour')
  expect(helperVerdict({ ...h, threads: [done, { ...done, active: true }] })).toBe('its thread is live')
  expect(helperVerdict({ ...h, threads: [{ ...done, at: now - 3_600_000 }] })).toBe('remove')
  // One its lead may send more (a reader's count, 17 Nov: 21 of 1,047 helpers were resumed over an hour after a run ended,
  // after up to 7.5 h): resumed before, or its last run stopped by a usage limit or cancelled. Three days, then it goes.
  const paused = 'its lead may send it more: resumed before, or its last run unfinished'
  expect(helperVerdict({ ...h, threads: [{ ...done, runs: 11, at: now - 15 * 3_600_000 }] })).toBe(paused)
  expect(helperVerdict({ ...h, threads: [{ ...done, last: 'failed' }] })).toBe(paused)
  expect(helperVerdict({ ...h, threads: [{ ...done, last: 'cancelled' }] })).toBe(paused)
  expect(helperVerdict({ ...h, threads: [done, { ...done, runs: 2 }] })).toBe(paused)
  expect(helperVerdict({ ...h, threads: [{ ...done, runs: 11, at: now - 72 * 3_600_000 }] })).toBe('remove')
  expect(helperVerdict({ ...h, threads: [{ ...done, runs: NaN }] })).toBe(paused)
  // A lead's checkout, even one a finished helper shared, and anything not named as Infinitus names a helper's.
  expect(helperVerdict({ ...h, threads: [done, { id: '9e9c8b4c-lead', at: now - 5 * 3_600_000, active: false }] })).toBe("a lead's thread works in it")
  for (const path of [`${homedir()}/.infinitus/worktrees/aquatome.com/lab-app-v2`, `${homedir()}/.infinitus/worktrees/aquatome.com/trail-not-fish`, `${homedir()}/.infinitus/worktrees/other/infi-ffb9be67-8366a39a0df50f26`, `${homedir()}/.infinitus/projects/aquatome.com`, `${homedir()}/.infinitus/worktrees/aquatome.com/lab-app-v2/infi-ffb9be67-8366a39a0df50f26`])
    expect(helperVerdict({ ...h, path })).toBe("not a helper's checkout")
})

// Codex's read, 17 Nov: a helper resumed while git counted its checkout lost a clean one, since only a save read its
// threads again; and a branch deleted or replaced on the remote since the last fetch still counted as holding its commits.
test("a helper's checkout goes only when every read lets it, the last just before acting, and the remote's branches are fetched first", () => {
  const path = `${homedir()}/.infinitus/worktrees/aquatome.com/infi-ffb9be67-8366a39a0df50f26`
  const ended = { id: 'thread:delegated-task:command%3Amcp%3Ax%3Adelegate-task%3Ay', at: Date.now() - 2 * 3_600_000, active: false, runs: 1, last: 'completed' }
  const pass = (o: { live?: number[]; refresh?: boolean; status?: string; unpushed?: number; dry?: boolean } = {}) => {
    const did: string[] = []
    let n = 0
    const gone = helperPass([path], {
      reads: () => { n++; did.push(`read ${n}`); return (p: string) => ({ path: p, liveCwd: false, threads: [{ ...ended, active: !!o.live?.includes(n) }] }) },
      refresh: () => { did.push('fetch'); return o.refresh ?? true },
      status: () => { did.push('status'); return o.status ?? '' },
      unpushed: () => { did.push('count'); return o.unpushed ?? 0 },
      archive: (_: string, still: () => boolean) => { did.push('save'); if (!still()) return false; did.push('removed'); return true },
      remove: () => { did.push('removed'); return true },
      pause: () => {},
      dry: !!o.dry,
      say: (m: string) => did.push(m),
    })
    return { gone, did }
  }
  // Every read lets it go: fetched before git counts, read once more just before it's removed.
  expect(pass()).toEqual({ gone: 1, did: ['read 1', 'fetch', 'read 2', 'status', 'count', 'read 3', 'removed', expect.stringMatching(/^removed /)] })
  // Resumed while git counted: a clean checkout stays, as a saved one does.
  expect(pass({ live: [3] })).toEqual({ gone: 0, did: ['read 1', 'fetch', 'read 2', 'status', 'count', 'read 3', `kept ${path}: its thread or a process moved while it was read`] })
  expect(pass({ live: [3], unpushed: 1 }).did).not.toContain('removed')
  expect(pass({ unpushed: 1 })).toMatchObject({ gone: 1, did: expect.arrayContaining(['save', 'removed']) })
  // A fetch that fails leaves it; so does a dry run, which only says.
  expect(pass({ refresh: false })).toEqual({ gone: 0, did: ['read 1', 'fetch', "helpers' checkouts: could not fetch the remote's branches, leaving them"] })
  expect(pass({ dry: true }).did).not.toContain('removed')
  // A dry run doesn't fetch either: a fetch prunes the remote's branches and moves FETCH_HEAD (Codex's read, 17 Nov).
  expect(pass({ dry: true }).did).toEqual(['read 1', 'read 2', 'status', 'count', `would remove ${path}: a helper's, its thread ended, nothing in it that the remote lacks`])
  // Nothing to look at: no reads, no fetch.
  expect(helperPass([], { reads: () => { throw new Error('read') }, refresh: () => { throw new Error('fetch') } })).toBe(0)
})

test("the owner's morning report is started from this Mac at 06:58, a minute's work before 07:00, by the same job", () => {
  const dir = home()
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin/launchctl'), `#!/bin/sh\necho "$@" >> "${dir}/calls"\n[ "$1" = print ] && exit 1\nexit 0\n`, { mode: 0o755 })
  const r = spawnSync('bash', [join(ROOT, 'scripts/install-daily-report-schedule.sh')], { env: { ...process.env, HOME: dir, PATH: `${dir}/bin:${process.env.PATH}` }, encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  const plist = readFileSync(join(dir, 'Library/LaunchAgents/run.aquatome.daily-report.plist'), 'utf8')
  expect(plist).toContain('<key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>58</integer></dict>')
  expect(plist).toContain('gh workflow run daily-report.yml -R deathemperor/aquatome.com --ref main')
  expect(plist).toContain('/opt/homebrew/bin')
  expect(plist).not.toContain('RunAtLoad')
  expect(readFileSync(join(dir, 'calls'), 'utf8')).toContain('bootstrap')
  expect(spawnSync('plutil', ['-lint', '-'], { input: plist }).status ?? 0).toBe(0)
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
  sh(dir, 'git init -q -b main --bare origin.git && git clone -q origin.git main 2>/dev/null && cd main && git checkout -q -b main 2>/dev/null; echo a > a && git add a && git commit -qm base && git push -q origin main && git worktree add -q -b work ../wt')
  sh(`${dir}/main`, 'printf "NOTES.md\\nbuild/\\n" > .gitignore && git add .gitignore && git commit -qm ignore && git push -q origin main')
  sh(`${dir}/wt`, 'git merge -q --ff-only main && echo unsaved > b && git add b && git commit -qm "on no remote" && echo changed > a && echo new > c && echo mine > NOTES.md && mkdir build && echo out > build/x')
  // Staged, then deleted from the working tree: only the index has it (Codex's read, 17 Nov); and a change staged apart
  // from a later one to the same file.
  sh(`${dir}/wt`, 'echo staged > d && git add d && rm d && echo first > e && git add e && echo second > e')
  const saved = archiveWorktree(`${dir}/wt`, `${dir}/archive`, new Date('2026-11-08T00:00:00Z'))
  expect(saved).toBe(`${dir}/archive/2026-11-08-wt`)
  expect(readFileSync(`${saved}/note.txt`, 'utf8')).toContain('branch: work')
  sh(`${dir}/main`, `git fetch -q ${saved}/work.bundle work:restored && git worktree add -q ../back restored && cd ../back && git apply --index ${saved}/staged.patch && git apply ${saved}/unstaged.patch && tar -xzf ${saved}/untracked.tgz`)
  expect(readFileSync(`${dir}/back/b`, 'utf8')).toBe('unsaved\n')
  expect(readFileSync(`${dir}/back/a`, 'utf8')).toBe('changed\n')
  expect(readFileSync(`${dir}/back/c`, 'utf8')).toBe('new\n')
  expect(readFileSync(`${dir}/back/NOTES.md`, 'utf8')).toBe('mine\n') // ignored, but nobody can make it again
  expect(sh(`${dir}/back`, 'git show :d')).toBe('staged\n')
  expect(existsSync(`${dir}/back/d`)).toBe(false)
  expect([sh(`${dir}/back`, 'git show :e'), readFileSync(`${dir}/back/e`, 'utf8')]).toEqual(['first\n', 'second\n'])
  expect(existsSync(`${dir}/back/build/x`)).toBe(false) // build output isn't worth keeping
  // The next one of that name, the same day, doesn't overwrite it; nothing on no remote and no changes, just the note.
  sh(`${dir}/main`, 'git worktree add -q --detach ../clean main')
  expect(readdirSync(archiveWorktree(`${dir}/clean`, `${dir}/archive2`))).toEqual(['note.txt'])
  expect(archiveWorktree(`${dir}/wt`, `${dir}/archive`, new Date('2026-11-08T00:00:00Z'))).toBe(`${saved}-2`)
  // A merge left half done on a picture: its sides are only in the index's stages, which no patch carries. Not saved, so
  // it stays (helperPass and --archive say "kept"), and nothing is written (Codex's read, 17 Nov).
  sh(`${dir}/main`, 'git worktree add -q -b clash ../clash')
  sh(`${dir}/clash`, 'printf "\\0base" > p.bin && git add p.bin && git commit -qm pic && git branch side && printf "\\0ours" > p.bin && git commit -qam ours && git checkout -q side && printf "\\0theirs" > p.bin && git commit -qam theirs && git checkout -q clash && (git merge -q side 2>/dev/null || true)')
  expect(sh(`${dir}/clash`, 'git ls-files --unmerged')).toContain('p.bin')
  expect(() => archiveWorktree(`${dir}/clash`, `${dir}/archive3`)).toThrow(/unmerged/)
  expect(existsSync(`${dir}/archive3`)).toBe(false)
  // Thirty days later it goes, and nothing younger does.
  expect(expireArchive(`${dir}/archive`, Date.parse('2026-12-07T00:00:00Z'))).toEqual([])
  expect(expireArchive(`${dir}/archive`, Date.parse('2026-12-09T00:00:00Z'))).toEqual(['2026-11-08-wt', '2026-11-08-wt-2'])
}, slow(60_000))

test('--archive saves and removes a worktree its caller names, only says so with --dry-run, and leaves one whose thread is live', () => {
  const dir = realpathSync(home()) // as git and lsof write a path
  const at = (name: string) => `${dir}/${name}`
  sh(dir, 'git init -q -b main main && cd main && echo a > a && git add a && git commit -qm base && for n in dry gone live named unread busy; do git worktree add -q -b $n ../$n; done')
  const run = (argv: string[], live: Set<string> | null = new Set(), cwds: string[] | null = []) => {
    const said: string[] = []
    archiveNamed(argv, { cwds, live, repo: at('main'), archive: at('archive'), say: (line: string) => said.push(line) })
    return said
  }
  // --dry-run, before the paths or after them: it says what it would do, and nothing is saved and nothing goes.
  expect(run(['--dry-run', '--archive', at('dry'), at('gone')])).toEqual([`would save and remove ${at('dry')}`, `would save and remove ${at('gone')}`])
  expect(run(['--archive', at('gone'), '--dry-run'])).toEqual([`would save and remove ${at('gone')}`])
  expect(existsSync(at('dry')) && existsSync(at('gone'))).toBe(true)
  expect(existsSync(at('archive'))).toBe(false)
  // Without it the same worktree is saved and goes: on 2026-11-11 twelve were, with --dry-run given.
  expect(run(['--archive', at('gone')])).toEqual([expect.stringMatching(/^saved .*\/gone in .*\/archive\/\d{4}-\d\d-\d\d-gone, and removed it$/)])
  expect(existsSync(at('gone'))).toBe(false)
  expect(readdirSync(at('archive'))).toHaveLength(1)
  // A live thread's worktree stays, with a slash after its path too, until the caller names that very path again.
  const live = new Set([at('live'), at('named')])
  expect(run(['--archive', at('live'), `${at('named')}/`], live)).toEqual(['live', 'named'].map(n => `kept ${at(n)}: its thread is live. To save and remove it all the same, name it again after --though-live`))
  expect(run(['--archive', at('live'), at('named'), '--though-live', `${at('named')}/`, at('dry')], live)).toEqual([expect.stringContaining(`kept ${at('live')}: its thread is live`), expect.stringContaining(`saved ${at('named')} in`)])
  expect(existsSync(at('live'))).toBe(true)
  expect(existsSync(at('named'))).toBe(false)
  expect(existsSync(at('dry'))).toBe(true) // named only after the word: nobody asked for it to go
  // Threads nobody could read: it stays, as the nightly pass leaves every worktree then.
  expect(run(['--archive', at('unread')], null)).toEqual([expect.stringContaining(`kept ${at('unread')}: its thread couldn't be read`)])
  expect(run(['--dry-run', '--archive', at('unread'), '--though-live', at('unread')], null)).toEqual([`would save and remove ${at('unread')}`])
  expect(existsSync(at('unread'))).toBe(true)
  // The word is about the thread alone: a process working in it keeps it.
  expect(run(['--archive', at('busy'), '--though-live', at('busy')], new Set(), [`${at('busy')}/packages`])).toEqual([`kept ${at('busy')}: a process is working in it`])
  // And when lsof can't say who is working where, nothing goes, named again or not.
  expect(run(['--archive', at('busy'), '--though-live', at('busy')], new Set(), null)).toEqual([`kept ${at('busy')}: couldn't read whether a process is working in it`])
  expect(existsSync(at('busy'))).toBe(true)
}, slow(60_000))

test('a reading of the Mac: the small job, the queues, and load only as background', () => {
  const dir = home()
  const r = spawnSync('python3', ['-I', join(ROOT, 'scripts/machine-metric.py')], { env: { ...process.env, HOME: dir }, encoding: 'utf8' })
  // /usr/sbin's tools are the Mac's: elsewhere this script doesn't run.
  if (process.platform !== 'darwin') return
  expect(r.status, r.stderr).toBe(0)
  expect(JSON.parse(readFileSync(`${dir}/.cache/aquatome/machine-metrics.jsonl`, 'utf8'))).toMatchObject({ small_job_s: expect.any(Number), waiting_checks: expect.any(Number), waiting_sim: expect.any(Number), swap_gb: expect.any(Number), thermal: expect.any(Number), cores: expect.any(Number) })
}, slow(60_000))

// 2026-11-08: signing on the own Mac took the owner's keychains off their list for minutes (gh's and git's sign-in among
// them). Uploads there now run as AquaTome CI, on a runner of their own, and never touch the owner's keychains.
test("TestFlight's uploads on this Mac run as AquaTome CI on their own runner, and leave the owner's keychains alone", () => {
  const flow = readFileSync(join(ROOT, '.github/workflows/testflight.yml'), 'utf8')
  expect(flow).toContain('runner=["self-hosted","macOS","aquatome-upload"]')
  expect(flow).not.toContain('"self-hosted","macOS","aquatome"]') // main's flows' runner: an upload would wait behind them
  expect(flow).not.toMatch(/login\.keychain|keychain-list|keychain-default/)
})

// 2026-11-08: main's run back on this Mac, two copies of its simulator: a 0.4 s job on the Mac took 5 to 12 s.
test("main's flow jobs on this Mac test on its one simulator, with no copies", () => {
  const ios = readFileSync(join(ROOT, '.github/workflows/ios.yml'), 'utf8')
  const own = ios.match(/if \[ "\$LOCAL" = true \]; then\n([\s\S]*?)\n\s*else/)?.[1] ?? ''
  expect(own).toContain('runner=["self-hosted","macOS","aquatome"]')
  expect(own).toContain("parallel=-parallel-testing-enabled NO'")
  expect(own).not.toContain('worker-count')
})

// 13 November, 23:45: a TestFlight upload stopped at 12 GB free, and nobody was watching. The sweep reads mac-status.py's
// floor each hour: under 30 GB the chief of staff hears of it in their thread, once a day, with where the disk is.
test('free space under 30 GB reaches the chief of staff once a day, with where it is; at 30 or more, or in a dry run, nothing goes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-space-'))
  const chief = join(dir, 'thread')
  writeFileSync(chief, 'the-chief\n')
  const said = join(dir, 'said')
  const sent: { threadId: string; message: string }[] = []
  const lines: string[] = []
  const where = '  simulators: 40 GB, 39 of them, 1 up\n  worktrees: 77 GB in 105 folders (the sweep takes merged ones at 03:35)'
  const at = (stderr: string, { status = 0, today = '2026-11-14', dry = false } = {}) =>
    space({ status: () => ({ status, stderr }), send: async (m: { threadId: string; message: string }) => { sent.push(m) }, chief, said, today, dry, say: (l: string) => lines.push(l) })
  await at('')
  expect(sent).toEqual([])
  await at(`25 GB free on this Mac, under 30 GB: the sweep tells the chief of staff\n${where}`, { dry: true })
  expect(sent).toEqual([])
  await at(`25 GB free on this Mac, under 30 GB: the sweep tells the chief of staff\n${where}`)
  expect(sent).toEqual([{ threadId: 'the-chief', message: `The Mac's upkeep (machine-sweep.mjs), once a day while it lasts: 25 GB free on this Mac, under 30 GB: the sweep tells the chief of staff Under 20 GB no simulator or upload starts.\nWhere it is:\n${where}\n\`scripts/mac-status.py\` shows who is up.` }])
  // The same day: said in the log, not sent again. The next day, under the floor: sent again.
  await at(`22 GB free on this Mac, under 30 GB: the sweep tells the chief of staff\n${where}`)
  expect(sent).toHaveLength(1)
  await at(`15 GB free on this Mac, under the 20 GB floor (AGENTS.md, This Mac): nothing big starts until there's more.\n${where}`, { status: 3, today: '2026-11-15' })
  expect(sent).toHaveLength(2)
  expect(sent[1]!.message).toMatch(/^The Mac's upkeep \(machine-sweep\.mjs\), once a day while it lasts: 15 GB free on this Mac, under the 20 GB floor/)
  expect(sent[1]!.message).not.toContain('Under 20 GB no simulator')
  expect(lines.filter(l => l.startsWith('space: '))).toHaveLength(4)
})

// The chief of staff, 15 Nov 2026: tests had left 718,000 folders, about 78 GB, in the temp folder, and the hourly sweep
// takes ours older than six hours, by the chief of staff's rules (~/.cache/aquatome/cos/space/temp-clean.py).
test("the sweep takes our tests' scratch untouched for 6 h and open in no process, and nothing else in the temp folder", () => {
  const temp = mkdtempSync(join(tmpdir(), 'aq-load-'))
  const make = (name: string, kids: string[] = []) => { mkdirSync(join(temp, name)); for (const k of kids) mkdirSync(join(temp, name, k)) }
  const litter = Array.from({ length: 21 }, (_, i) => `gate-Kq2a${String(i).padStart(2, '0')}`)
  for (const n of litter) make(n, ['content', 'engine-state'])
  make('aq-tests-a1B2c3') // a killed run's own folder
  make('aq-open-k3Jd9s') // a run still working in it
  make('gate-Zz9Yy8', ['notes']) // a gate- folder holding something else
  make('lonely-a1B2c3', ['content']) // one of its kind: made by hand
  make('com.apple.dock.launchpad') // not mkdtemp's name
  const said: string[] = []
  // One of them holds a lead's worktree (Grok's read): never taken.
  const pass = (now: number, dry = false) => scratch({ temps: [temp], open: () => new Set(['aq-open-k3Jd9s']), worktrees: () => new Set(['gate-Kq2a20']), now, dry, say: (m: string) => said.push(m) })
  // Everything here changed just now.
  expect(pass(Date.now())).toBe(0)
  expect(pass(Date.now() + 7 * 3_600_000, true)).toBe(21)
  expect(readdirSync(temp)).toHaveLength(26)
  expect(pass(Date.now() + 7 * 3_600_000)).toBe(21)
  expect(readdirSync(temp).sort()).toEqual(['aq-open-k3Jd9s', 'com.apple.dock.launchpad', 'gate-Kq2a20', 'gate-Zz9Yy8', 'lonely-a1B2c3'])
  expect(said.at(-1)).toMatch(/removed 21; left .*open in a process.*holds a worktree.*not test scratch by what it holds.*a kind too rare/)
})

test("a folder goes only when it's ours by name, owner and what it holds, and nothing in it changed within 6 h", () => {
  const ours = { name: 'gate-Kq2a00', dir: true, mine: true, open: false, hours: 7, kids: ['content', '.git'], kidsHours: 7, kindCount: 35_000 }
  expect(scratchVerdict(ours)).toBe('remove')
  expect(scratchVerdict({ ...ours, kidsHours: 5 })).toBe('changed within 6 h')
  expect(scratchVerdict({ ...ours, mine: false })).toBe('not our folder')
  expect(scratchVerdict({ ...ours, name: 'gate-abcdef' })).toBe('not a scratch name')
  expect(scratchVerdict({ ...ours, kids: ['content', 'Photos Library.photoslibrary'] })).toBe('not test scratch by what it holds')
  expect(scratchVerdict({ ...ours, name: 'aq-tests-x1y2z3', kindCount: 1, kids: ['anything'] })).toBe('remove')
  // A run's own folder whose suffix came out all lower case (about 1 in 180), and one holding a worktree (Grok's read).
  expect([scratchKind('aq-tests-abcdef'), scratchVerdict({ ...ours, name: 'aq-tests-abcdef', kindCount: 1 })]).toEqual(['aq-tests', 'remove'])
  expect(scratchVerdict({ ...ours, worktree: true })).toBe('holds a worktree')
})

test("the sweep looks in /tmp as well as this user's temp folder: launchd's jobs have no TMPDIR, so Node writes there", () => {
  expect(scratchFolders()).toContain(realpathSync('/tmp'))
  expect(scratchFolders()).toContain(realpathSync(process.platform === 'darwin' ? execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim() : tmpdir()))
})
