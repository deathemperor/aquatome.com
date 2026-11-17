#!/usr/bin/env node
// This Mac's upkeep, hourly (install-machine-sweep.sh): what nobody is using stops loading it. Each booted simulator
// runs about 230 processes, and the runner's and leads' worktrees were 141 (2026-11-08). What it isn't sure of it leaves,
// and says so in its log (~/Library/Logs/aquatome-machine-sweep.log).
// - Simulators: a Device session idle for 3 h, a test's copy with no run. One with no session is only noted: nothing here
//   can tell whether someone is using it.
// - Agents: an install-*-schedule.sh plist that was newer than a running job gets loaded once the job ends.
// - Worktrees, at 03:35 or with --worktrees: merged ones. One left alone for 7 days with no live thread is saved first
//   (archiveWorktree: never pushed, kept 30 days), then removed. No --force without that copy.
// - A helper's own checkout (a delegate started with a checkout of its own), every hour: an hour after its thread ended,
//   saved first when it holds a commit on no remote or a change not committed, then removed, each by name in the log
//   (`helperVerdict`; the chief of staff, 16 Nov 2026).
// - ~/.cache/aquatome is what the leads keep (AGENTS.md, This Mac): never touched, but for the archive's copies past 30 days.
// - Scratch: our tests' leftover folders in this user's temp folder and /tmp, untouched for 6 h, open in no process and
//   holding no worktree (`scratch`; the chief of staff, 15 Nov 2026). Nothing else there: other projects', the system's,
//   Xcode's, the browsers'.
// - Free space: under mac-status.py's 30 GB, the chief of staff hears of it once a day while it lasts, in the thread the
//   owner's reports go to (theirs). Who clears what is theirs to say; nothing here deletes for space but that scratch.
// --dry-run says what it would do, and does none of it. --archive <path>...: save and remove those worktrees now, but
// for one a process is working in, and one whose thread is live unless it's named again after --though-live.
import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendToThread } from './infinitus-send.mjs'

const HOME = homedir()
const REPO = join(HOME, '.infinitus/projects/aquatome.com')
const AGENTS = join(HOME, 'Library/LaunchAgents')
const STAMPS = join(HOME, '.cache/aquatome/agents-loaded')
const DEVICE = join(HOME, '.infinitus/userdata/device')
const CLAIMS = join(HOME, '.agent-device/device-claims')
const THREADS = join(HOME, '.infinitus/userdata/statev2.sqlite')
const ARCHIVE = join(HOME, '.cache/aquatome/worktree-archive')
const ARCHIVE_DAYS = 30
const ABANDONED_HOURS = 7 * 24
const DRY = process.argv.includes('--dry-run')
const MAC_STATUS = fileURLToPath(new URL('./mac-status.py', import.meta.url))
const CHIEF = join(HOME, '.config/aquatome/owner-report-thread')
const SPACE_SAID = join(HOME, '.cache/aquatome/space-said')
// Output anyone can make again: what's left of these in a worktree isn't work. Any other ignored file might be (notes,
// page shots), so it counts as a change and goes in the archive.
const REBUILDABLE = /(^|\/)(node_modules|dist(-[^/]*)?|build|\.build|\.astro|\.wrangler|\.swiftpm|DerivedData|__pycache__|test-results|playwright-report|coverage|\.turbo|\.cache|\.vite|xcuserdata|\.DS_Store|[^/]*\.tsbuildinfo|e2e-pages\.json)(\/|$)/
const LIVE_RUNS = ['running', 'queued', 'preparing', 'starting', 'waiting']
const log = message => console.log(`${new Date().toISOString()} ${DRY ? '(dry run) ' : ''}${message}`)
const hoursSince = ms => (Date.now() - ms) / 3_600_000
/** A command's output, or null when it failed or ran out of time: what can't be read is left alone. */
const read = (cmd, args, timeout = 120_000) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 })
  } catch {
    return null
  }
}

/**
 * Whether a booted simulator closes. A run on it (`testing`) or the runner's own (wait-for-simulator.sh) never does. A
 * session last used before this boot isn't this boot's: a claim outlives its simulator, so that one has no session.
 */
export function simVerdict({ name, testing, session, abandoned, idleHours, upHours }) {
  if (testing || name.startsWith('aquatome-ci-')) return 'keep'
  if (session && idleHours <= upHours) return idleHours >= 3 || (abandoned && idleHours >= 0.5) ? 'close' : 'keep'
  return upHours >= 12 ? 'note' : 'keep'
}

/** 'remove', or why a worktree stays. Only this repository's: not the main checkout, other projects, or a thread's scratchpad. */
export function worktreeVerdict({ path, liveCwd, liveThread, dirty, unpushed, remoteBranch, prs, hours }) {
  const ours = path.startsWith(`${HOME}/.infinitus/worktrees/aquatome.com/`) || (path.startsWith('/private/tmp/') && !path.includes('/claude-'))
  if (!ours) return 'not a worktree this sweep looks after'
  if (liveCwd) return 'a process is working in it'
  if (liveThread) return 'its thread is live'
  // Nobody's for a week, whatever it holds: a copy of the work first, then it goes.
  if (hours >= ABANDONED_HOURS && (dirty || prs.some(p => p.state === 'OPEN'))) return 'archive'
  if (dirty) return 'uncommitted changes'
  if (prs.some(p => p.state === 'OPEN')) return 'open pull request'
  // Its pull request merged at this very commit: GitHub keeps the commits, even when the branch is gone.
  if (prs.some(p => p.state === 'MERGED' && p.atTip)) return hours >= 6 ? 'remove' : 'merged, but touched within 6 h'
  // Every commit is on the remote, and the work merged or its branch was deleted.
  if (unpushed === 0 && (prs.some(p => p.state === 'MERGED') || !remoteBranch)) return hours >= 24 ? 'remove' : 'nothing unpushed, but touched within 24 h'
  if (hours >= ABANDONED_HOURS && !Number.isNaN(unpushed)) return 'archive'
  return unpushed === 0 ? 'its branch is on the remote, unmerged' : 'commits on no remote'
}

/** A helper's own checkout, as Infinitus names one it makes for a delegate (`isolation: "worktree"`). */
const HELPER = /^(infi|infinitus)-[0-9a-f]{8}-[0-9a-f]{16}$/
/** Where Infinitus makes a helper's checkout: straight under this folder. */
const WORKTREES = `${HOME}/.infinitus/worktrees/aquatome.com`
/** How long after its helper's thread ends a helper's checkout goes. */
const HELPER_DONE_HOURS = 1
/**
 * How long one stays when its lead may send it more: its thread was resumed before (more than one run), or its last run
 * didn't finish (a usage limit stopped it, or it was cancelled). On 16 Nov eleven helpers were resumed after pauses of
 * 1.4 to 7.5 h. Three days, as a lead's own checkout (liveWorktrees).
 */
const HELPER_PAUSED_HOURS = 72
/**
 * 'remove', 'archive' (saved first, then removed), or why a helper's checkout stays. `threads`: every thread whose
 * checkout this is, each with its last update (ms), whether a run of it is live, how many runs it has had and its last
 * run's state. Only a checkout Infinitus made for a delegate, whose every thread is a delegate's and has ended, the last
 * over an hour ago (three days for one that may be sent more): a lead's checkout that a delegate shared is the lead's.
 * Anything it can't be sure of (git couldn't count, no thread found, a time it can't read) stays or is saved.
 */
export function helperVerdict({ path, liveCwd, threads, dirty, unpushed, now = Date.now() }) {
  if (dirname(path) !== WORKTREES || !HELPER.test(basename(path))) return "not a helper's checkout"
  if (!threads.length) return 'no thread found for it'
  if (threads.some(t => !t.id.startsWith('thread:delegated-task:'))) return "a lead's thread works in it"
  if (threads.some(t => t.active)) return 'its thread is live'
  if (liveCwd) return 'a process is working in it'
  const ended = (now - Math.max(...threads.map(t => t.at))) / 3_600_000
  if (!(ended >= HELPER_DONE_HOURS)) return 'its thread ended within the hour'
  if (threads.some(t => t.runs !== 1 || t.last !== 'completed') && !(ended >= HELPER_PAUSED_HOURS)) return 'its lead may send it more: resumed before, or its last run unfinished'
  return dirty || unpushed !== 0 ? 'archive' : 'remove'
}

/**
 * Saves what a worktree holds that no remote has, so it can go: a bundle of its commits on no remote, patches of its
 * staged and its unstaged changes, a tar of its untracked files (not build output) and a note of where it was. Local only, since the
 * repository is public: this folder is never pushed. Throws if a part can't be saved, and the worktree stays.
 */
export function archiveWorktree(path, archive = ARCHIVE, now = new Date()) {
  const git = (...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 })
  const stem = join(archive, `${now.toISOString().slice(0, 10)}-${basename(path)}`)
  let dir = stem
  for (let n = 2; existsSync(dir); n++) dir = `${stem}-${n}`
  mkdirSync(dir, { recursive: true })
  const branch = git('branch', '--show-current').trim()
  const head = git('rev-parse', 'HEAD').trim()
  const unpushed = Number(git('rev-list', '--count', 'HEAD', '--not', '--remotes'))
  if (unpushed > 0) {
    const bundle = join(dir, 'work.bundle')
    git('bundle', 'create', bundle, branch || 'HEAD', '--not', '--remotes')
    git('bundle', 'verify', bundle)
  }
  // The index and the working tree apart: a file staged and then deleted from the working tree is in neither HEAD nor the
  // working tree, only in the index (Codex's read, 17 Nov). Brought back by `git apply --index staged.patch`, then
  // `git apply unstaged.patch`.
  for (const [name, args] of [['staged.patch', ['--cached', 'HEAD']], ['unstaged.patch', []]]) {
    const patch = join(dir, name)
    const out = openSync(patch, 'w')
    try {
      execFileSync('git', ['-C', path, 'diff', '--binary', ...args], { stdio: ['ignore', out, 'pipe'] })
    } finally {
      closeSync(out)
    }
    if (statSync(patch).size === 0) rmSync(patch)
  }
  const ignored = git('status', '--porcelain', '--ignored=matching').split('\n').filter(l => l.startsWith('!! ')).map(l => l.slice(3).replace(/^"|"$/g, '').replace(/\/$/, ''))
  const untracked = [...git('ls-files', '-z', '-o', '--exclude-standard').split('\0'), ...ignored].filter(f => f && !REBUILDABLE.test(f))
  if (untracked.length) {
    const tar = spawnSync('tar', ['-czf', join(dir, 'untracked.tgz'), '-C', path, '--null', '-T', '-'], { input: untracked.join('\0') })
    if (tar.status !== 0) throw new Error(`tar failed for ${path}`)
  }
  const gitDir = git('rev-parse', '--absolute-git-dir').trim()
  const merging = existsSync(join(gitDir, 'MERGE_HEAD')) ? `merging: ${readFileSync(join(gitDir, 'MERGE_HEAD'), 'utf8').trim()}\n` : ''
  writeFileSync(join(dir, 'note.txt'), `path: ${path}\nbranch: ${branch || '(detached)'}\nhead: ${head}\ncommits on no remote: ${unpushed}\n${merging}saved: ${now.toISOString()}\n`)
  return dir
}

/** The archive's copies past their days go. A folder's name starts with the day it was saved. */
export function expireArchive(archive = ARCHIVE, now = Date.now()) {
  if (!existsSync(archive)) return []
  const old = readdirSync(archive).filter(name => { const saved = Date.parse(name.slice(0, 10)); return !Number.isNaN(saved) && now - saved > ARCHIVE_DAYS * 24 * 3_600_000 })
  for (const name of old) rmSync(join(archive, name), { recursive: true, force: true })
  return old
}

/**
 * Saves a worktree, then removes it: true once it's gone. Only --force here, and only with the copy made, and `still`
 * still saying so once it is (a helper resumed while its copy was made keeps its checkout, and the copy too).
 */
function archiveAndRemove(path, repo = REPO, archive = ARCHIVE, say = log, still = () => true) {
  const dir = archiveWorktree(path, archive)
  if (!still()) { say(`saved ${path} in ${dir}, and kept it: its thread or a process moved while it was saved`); return false }
  const plain = spawnSync('git', ['-C', repo, 'worktree', 'remove', path], { encoding: 'utf8' })
  const removed = plain.status === 0 ? plain : spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', path], { encoding: 'utf8' })
  if (removed.status !== 0) throw new Error(removed.stderr.trim().slice(0, 200))
  say(`saved ${path} in ${dir}, and removed it`)
  return true
}

/**
 * --archive <path>...: saves and removes each worktree named, now. One a process is working in stays (`cwds`, null when
 * lsof can't say: then every one stays). So does one whose thread is live (`live`, null when the threads can't be read:
 * then every one stays), unless the caller names that path again after --though-live. With --dry-run it says what it
 * would save and remove, and does neither.
 */
export function archiveNamed(argv, { cwds, live, repo = REPO, archive = ARCHIVE, say = log }) {
  // The paths after a flag, up to the next flag, as git and lsof write them: no trailing slash, no link on the way.
  const after = flag => {
    const rest = argv.includes(flag) ? argv.slice(argv.indexOf(flag) + 1) : []
    const end = rest.findIndex(a => a.startsWith('--'))
    return (end < 0 ? rest : rest.slice(0, end)).map(p => (existsSync(p) ? realpathSync(p) : resolve(p)))
  }
  const though = new Set(after('--though-live'))
  for (const path of after('--archive')) {
    if (!cwds) { say(`kept ${path}: couldn't read whether a process is working in it`); continue }
    if (cwds.some(c => c === path || c.startsWith(`${path}/`))) { say(`kept ${path}: a process is working in it`); continue }
    if (!though.has(path) && (!live || live.has(path))) { say(`kept ${path}: ${live ? 'its thread is live' : "its thread couldn't be read"}. To save and remove it all the same, name it again after --though-live`); continue }
    if (argv.includes('--dry-run')) { say(`would save and remove ${path}`); continue }
    try { archiveAndRemove(path, repo, archive, say) } catch (e) { say(`kept ${path}: could not save it: ${e.message}`) }
    spawnSync('sleep', ['2'])
  }
}

/** ps's elapsed time, [[dd-]hh:]mm:ss, in hours. */
const etimeHours = etime => {
  const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const [s = 0, m = 0, h = 0] = rest.split(':').map(Number).reverse()
  return Number(days) * 24 + h + m / 60 + s / 3600
}

function simulators() {
  const processes = read('ps', ['-axo', 'etime=,command='])
  const booted = read('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'])
  if (!processes || !booted) return log('simulators: could not read them')
  const lines = processes.split('\n')
  const runsIn = all => all.filter(l => /\/xcodebuild\s/.test(l) && !l.includes('AgentDeviceRunner'))
  const runs = runsIn(lines)
  const claims = new Map()
  for (const f of existsSync(CLAIMS) ? readdirSync(CLAIMS) : []) {
    try {
      const claim = JSON.parse(readFileSync(join(CLAIMS, f), 'utf8'))
      claims.set(claim.device.id, claim)
    } catch { /* a claim being written: the next hour's */ }
  }
  const tools = join(HOME, '.infinitus/tools/agent-device')
  const agentDevice = existsSync(tools) ? readdirSync(tools).map(d => join(tools, d, 'node_modules/agent-device/bin/agent-device.mjs')).filter(existsSync).sort().at(-1) : undefined
  const hosts = join(DEVICE, 'hosts')
  const config = existsSync(hosts) ? readdirSync(hosts).filter(f => f.endsWith('.json')).map(f => join(hosts, f))[0] : undefined
  for (const device of Object.values(JSON.parse(booted).devices).flat()) {
    const claim = claims.get(device.udid)
    const events = claim && join(claim.stateDir, 'sessions', claim.session, 'events.ndjson')
    const up = lines.find(l => l.includes(`launchd_sim`) && l.includes(device.udid))
    const verdict = simVerdict({
      name: device.name,
      testing: runs.some(l => l.includes(device.udid) || l.includes(`name=${device.name}`)),
      session: claim?.session,
      abandoned: !!claim?.abandonedAtMs,
      idleHours: hoursSince((events && existsSync(events) ? statSync(events).mtimeMs : claim?.updatedAtMs) ?? 0),
      upHours: up ? etimeHours(up.trim().split(/\s+/)[0]) : 0,
    })
    if (verdict === 'note') log(`simulator ${device.name} has been up over 12 h with no session: left, as someone may be using it`)
    if (verdict !== 'close') continue
    log(`closing simulator ${device.name}: nobody has used it${claim ? ` (session ${claim.session})` : ''}`)
    if (DRY) continue
    if (claim && agentDevice && config) spawnSync('node', [agentDevice, 'close', '--shutdown', '--platform', 'ios', '--udid', device.udid, '--config', config, '--session', claim.session], { stdio: 'ignore', timeout: 120_000 })
    read('xcrun', ['simctl', 'shutdown', device.udid]) // already down after a clean close: then this does nothing
  }
  // Test copies, when no run is left to use them: a cancelled run leaves them up. Closing the above can take minutes, so
  // this looks again, and Xcode's own test command has no xcodebuild to see.
  const now = (read('ps', ['-axo', 'etime=,command=']) ?? '/xcodebuild ').split('\n')
  const inUse = runsIn(now).length > 0 || now.some(l => l.includes('/Xcode.app/Contents/MacOS/Xcode'))
  const copies = inUse ? null : read('xcrun', ['simctl', '--set', 'testing', 'list', 'devices', 'booted', '-j'])
  for (const copy of copies ? Object.values(JSON.parse(copies).devices).flat() : []) {
    log(`closing test copy ${copy.name}: no run is using it`)
    if (DRY) continue
    read('xcrun', ['simctl', '--set', 'testing', 'shutdown', copy.udid])
    read('xcrun', ['simctl', '--set', 'testing', 'delete', copy.udid])
  }
}

/** A running job keeps its old plist (launchd-agent.sh): the new one loads here, once it has ended. */
function agents() {
  for (const f of readdirSync(AGENTS).filter(f => /^run\.aquatome\..*\.plist$/.test(f))) {
    const label = f.replace(/\.plist$/, '')
    if (label === 'run.aquatome.machine-sweep') continue // always running, here: install-machine-sweep.sh loads it
    const plist = join(AGENTS, f)
    const stamp = join(STAMPS, label)
    if (existsSync(stamp) && statSync(stamp).mtimeMs >= statSync(plist).mtimeMs) continue
    const uid = process.getuid()
    // Only a job launchd has loaded and isn't running. One it can't say about stays, and one not loaded was taken off.
    const state = spawnSync('launchctl', ['print', `gui/${uid}/${label}`], { encoding: 'utf8', timeout: 60_000 })
    if (state.status !== 0 || /^\s*pid = /m.test(state.stdout)) continue
    if (DRY) { log(`would load the new plist of ${label}`); continue }
    spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' })
    if (spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plist], { stdio: 'ignore' }).status !== 0) { log(`could not load ${label}`); continue }
    mkdirSync(STAMPS, { recursive: true })
    writeFileSync(stamp, '')
    log(`loaded the new plist of ${label}`)
  }
}

/** The worktrees a thread still has a use for: it runs, or it isn't a delegated task and last ran within 3 days. Null when the threads can't be read. */
function liveWorktrees() {
  const threads = read('sqlite3', ['-readonly', '-separator', '\t', THREADS, `select json_extract(t.payload_json, '$.worktreePath'), t.thread_id, json_extract(t.payload_json, '$.updatedAt'), (select count(*) from orchestration_v2_projection_runs r where r.thread_id = t.thread_id and r.status in (${LIVE_RUNS.map(s => `'${s}'`).join(', ')})) from orchestration_v2_projection_threads t where t.deleted_at is null and json_extract(t.payload_json, '$.worktreePath') is not null`])
  return threads == null ? null : new Set(threads.split('\n').filter(Boolean).map(l => l.split('\t')).filter(([, id, at, active]) => Number(active) > 0 || (!id.startsWith('thread:delegated-task:') && hoursSince(Date.parse(at)) < 72)).map(([path]) => path))
}

/**
 * Every thread's checkout: path → its threads, each with its id, last update (ms), whether a run of it is live, how many
 * runs it has had and its last run's state. Null when the threads can't be read.
 */
function threadsByPath() {
  const runs = 'orchestration_v2_projection_runs r where r.thread_id = t.thread_id'
  const rows = read('sqlite3', ['-readonly', '-separator', '\t', THREADS, `select json_extract(t.payload_json, '$.worktreePath'), t.thread_id, json_extract(t.payload_json, '$.updatedAt'), (select count(*) from ${runs} and r.status in (${LIVE_RUNS.map(s => `'${s}'`).join(', ')})), (select count(*) from ${runs}), (select r.status from ${runs} order by r.ordinal desc limit 1) from orchestration_v2_projection_threads t where t.deleted_at is null and json_extract(t.payload_json, '$.worktreePath') is not null`])
  if (rows == null) return null
  const by = new Map()
  for (const [path, id, at, active, count, last] of rows.split('\n').filter(Boolean).map(l => l.split('\t'))) by.set(path, [...(by.get(path) ?? []), { id, at: Date.parse(at), active: Number(active) > 0, runs: Number(count), last }])
  return by
}

/** What a worktree holds that a build can't make again: git's status less rebuildable output; null when git can't say. */
function statusOf(path) {
  // Without git's optional lock: a status taken beside a live helper's commit mustn't make that commit fail.
  const listed = read('git', ['--no-optional-locks', '-C', path, 'status', '--porcelain', '--ignored=matching'], 90_000)
  return listed == null ? null : listed.split('\n').filter(l => l && !(l.startsWith('!! ') && REBUILDABLE.test(l.slice(3).replace(/\/$/, '')))).join('\n')
}

/** The threads and the processes as they are now, for helperVerdict: per checkout, its threads and whether a process works in it. Null when either can't be read. */
function helperReads() {
  const cwds = read('lsof', ['-d', 'cwd', '-Fn'])
  const threads = threadsByPath()
  if (cwds == null || threads == null) return null
  const inUse = cwds.split('\n').filter(l => l.startsWith('n')).map(l => l.slice(1))
  return path => ({ path, liveCwd: inUse.some(c => c === path || c.startsWith(`${path}/`)), threads: threads.get(path) ?? [] })
}

/**
 * One pass over helpers' checkouts (helpers(); `io` is the Mac's there, a test's in a test). Each is read three times and
 * goes only when every read lets it: its threads and processes before any git; again with git's counts; and again just
 * before it is saved or removed, so a helper resumed meanwhile keeps its checkout, a clean one too (Codex's read, 17 Nov).
 * Before the first count the remote's branches are fetched, pruned: a branch deleted or replaced there since the last
 * fetch would otherwise still count as holding the checkout's commits. A fetch that fails leaves every one.
 */
export function helperPass(paths, io) {
  const first = paths.length ? io.reads() : undefined
  if (first === null) { io.say("helpers' checkouts: could not read their threads or processes, leaving them"); return 0 }
  let gone = 0, fetched
  for (const path of paths) {
    // The threads and the processes first, git only on a checkout they let go.
    if (helperVerdict({ ...first(path), dirty: false, unpushed: 0 }) !== 'remove') continue
    if ((fetched ??= io.refresh()) === false) { io.say("helpers' checkouts: could not fetch the remote's branches, leaving them"); break }
    const now = io.reads()
    if (now == null) { io.say(`kept ${path}: could not read its threads again`); continue }
    const status = io.status(path)
    const verdict = helperVerdict({ ...now(path), dirty: status == null || status !== '', unpushed: io.unpushed(path) })
    if (verdict !== 'archive' && verdict !== 'remove') continue
    if (io.dry) { io.say(verdict === 'archive' ? `would save and remove ${path}: a helper's, its thread ended` : `would remove ${path}: a helper's, its thread ended, nothing in it that the remote lacks`); continue }
    const fresh = () => { const again = io.reads(); return again != null && helperVerdict({ ...again(path), dirty: false, unpushed: 0 }) === 'remove' }
    if (verdict === 'archive') {
      try { if (io.archive(path, fresh)) gone++ } catch (e) { io.say(`kept ${path}: could not save it: ${e.message}`) }
    } else if (!fresh()) {
      io.say(`kept ${path}: its thread or a process moved while it was read`)
    } else {
      const why = io.remove(path)
      if (why === true) { gone++; io.say(`removed ${path}: a helper's, its thread ended, nothing in it that the remote lacks`) } else io.say(`kept ${path}: ${why}`)
    }
    io.pause()
  }
  return gone
}

/** Hourly: helpers' own checkouts an hour after their threads ended (helperVerdict, helperPass), each named in the log. */
function helpers() {
  const list = read('git', ['-C', REPO, 'worktree', 'list', '--porcelain'])
  if (!list) return log("helpers' checkouts: could not read the worktrees, leaving them")
  const paths = list.split('\n\n').filter(Boolean).slice(1).map(block => block.split('\n')[0].replace('worktree ', '')).filter(path => dirname(path) === WORKTREES && HELPER.test(basename(path)) && existsSync(path))
  const gone = helperPass(paths, {
    reads: helperReads,
    refresh: () => read('git', ['-C', REPO, 'fetch', '--prune', '--quiet', 'origin'], 300_000) != null,
    status: statusOf,
    unpushed: path => Number(read('git', ['--no-optional-locks', '-C', path, 'rev-list', '--count', 'HEAD', '--not', '--remotes']) ?? NaN),
    archive: (path, still) => archiveAndRemove(path, REPO, ARCHIVE, log, still),
    remove: path => { const r = spawnSync('git', ['-C', REPO, 'worktree', 'remove', path], { encoding: 'utf8' }); return r.status === 0 || r.stderr.trim().slice(0, 200) },
    pause: () => spawnSync('sleep', ['2']),
    dry: DRY,
    say: log,
  })
  if (!DRY && gone) read('git', ['-C', REPO, 'worktree', 'prune'])
  log(`helpers' checkouts: removed ${gone}`)
}

function worktrees() {
  const list = read('git', ['-C', REPO, 'worktree', 'list', '--porcelain'])
  const remote = read('git', ['-C', REPO, 'ls-remote', '--heads', 'origin'])
  const pullRequests = read('gh', ['pr', 'list', '-R', 'deathemperor/aquatome.com', '--state', 'all', '--limit', '1000', '--json', 'headRefName,state,headRefOid'])
  const cwds = read('lsof', ['-d', 'cwd', '-Fn'])
  const live = liveWorktrees()
  if (!list || !remote || !pullRequests || cwds == null || live == null) return log('worktrees: could not read what they need, leaving them')
  const remoteBranches = new Set(remote.split('\n').map(l => l.split('\t')[1]?.replace('refs/heads/', '')))
  const prs = JSON.parse(pullRequests)
  const inUse = cwds.split('\n').filter(l => l.startsWith('n')).map(l => l.slice(1))
  let removed = 0
  for (const block of list.split('\n\n').filter(Boolean).slice(1)) {
    const lines = block.split('\n')
    const path = lines[0].replace('worktree ', '')
    const head = lines.find(l => l.startsWith('HEAD '))?.slice(5)
    const branch = lines.find(l => l.startsWith('branch '))?.replace('branch refs/heads/', '')
    if (!existsSync(path)) continue
    const status = statusOf(path)
    const gitDir = read('git', ['-C', path, 'rev-parse', '--absolute-git-dir'])?.trim()
    const logged = gitDir && join(gitDir, 'logs/HEAD')
    // Since anyone touched it: the last checkout or commit, or the newest change not yet committed.
    const changed = (status ?? '').split('\n').filter(Boolean).slice(0, 200).map(l => join(path, l.slice(3).split(' -> ').pop().replaceAll('"', ''))).filter(existsSync).map(f => statSync(f).mtimeMs)
    const verdict = worktreeVerdict({
      path,
      liveCwd: inUse.some(c => c === path || c.startsWith(`${path}/`)),
      liveThread: live.has(path),
      dirty: status == null || status !== '',
      unpushed: Number(read('git', ['-C', path, 'rev-list', '--count', 'HEAD', '--not', '--remotes']) ?? NaN),
      remoteBranch: !!branch && remoteBranches.has(branch),
      prs: prs.filter(p => p.headRefName === branch || p.headRefOid === head).map(p => ({ state: p.state, atTip: p.headRefOid === head })),
      hours: logged && existsSync(logged) ? hoursSince(Math.max(statSync(logged).mtimeMs, ...changed)) : 0,
    })
    if (verdict === 'archive') {
      if (DRY) { log(`would save and remove ${path}`); continue }
      try { archiveAndRemove(path); removed++ } catch (e) { log(`kept ${path}: could not save it: ${e.message}`) }
      spawnSync('sleep', ['2'])
      continue
    }
    if (verdict !== 'remove') { log(`kept ${path}: ${verdict}`); continue }
    if (DRY) { log(`would remove ${path}`); continue }
    const r = spawnSync('git', ['-C', REPO, 'worktree', 'remove', path], { encoding: 'utf8' })
    if (r.status === 0) { removed++; log(`removed ${path}`) } else log(`kept ${path}: ${r.stderr.trim().slice(0, 200)}`)
    spawnSync('sleep', ['2'])
  }
  if (!DRY) read('git', ['-C', REPO, 'worktree', 'prune'])
  log(`worktrees: removed ${removed}`)
  if (!DRY) for (const name of expireArchive()) log(`archive: ${name} is past ${ARCHIVE_DAYS} days, deleted`)
}

/**
 * Our tests' scratch in the system temp folder (the chief of staff, 15 Nov 2026: 718,000 folders, about 78 GB, left by
 * tests that never removed theirs, growing 1.5 GB an hour). A test run now keeps its scratch in one folder of its own that
 * goes when the run ends (@aq/schema/test-scratch); what's left is a killed run's folder, and what an older checkout's
 * tests make. The rules are the chief of staff's (~/.cache/aquatome/cos/space/temp-clean.py), at six hours, not a day.
 */
const SCRATCH_HOURS = 6
/** A pass's time: what's left goes in the next hour's. */
const SCRATCH_MINUTES = 20
// mkdtemp's names: a kind, then 6 to 10 random letters or digits with a digit or a capital among them ("gate-x7Kq2a").
const SCRATCH_NAME = /^(?<kind>[A-Za-z][A-Za-z0-9._-]*?)[-._](?<suffix>[A-Za-z0-9_]{6,10})$/
/** What the engine's tests put in a scratch folder that isn't named aq-…: a copy of the repository's content and state. */
const FIXTURE = new Set(['engine-state', 'content', 'sources', 'docs', '.git'])
export const scratchKind = name => {
  // A run's own folder, whatever its letters: about 1 in 180 of mkdtemp's suffixes are all lower case (Grok's read).
  if (/^aq-tests-[A-Za-z0-9]{6}$/.test(name)) return 'aq-tests'
  const m = SCRATCH_NAME.exec(name)
  return m && /[0-9A-Z]/.test(m.groups.suffix) ? m.groups.kind : null
}
/**
 * 'remove', or why a folder in the temp folder stays. It goes only when it is a folder of this user's with mkdtemp's name,
 * open in no process, and neither it nor anything directly in it changed within SCRATCH_HOURS; and when it is a run's
 * own (aq-tests-), or of a kind with at least 20 folders (test litter comes in thousands, a hand-made folder alone) named
 * aq-… or holding only the engine's fixture folders.
 */
export function scratchVerdict({ name, dir, mine, open, worktree, hours, kids, kidsHours, kindCount }) {
  if (!scratchKind(name)) return 'not a scratch name'
  if (!dir || !mine) return 'not our folder'
  if (open) return 'open in a process'
  if (worktree) return 'holds a worktree'
  if (Math.min(hours, kidsHours) < SCRATCH_HOURS) return `changed within ${SCRATCH_HOURS} h`
  if (name.startsWith('aq-tests-')) return 'remove'
  if (kindCount < 20) return 'a kind too rare to be test scratch'
  if (!name.startsWith('aq-') && !(kids.every(k => FIXTURE.has(k)) && kids.some(k => k === 'content' || k === 'engine-state'))) return 'not test scratch by what it holds'
  return 'remove'
}
/**
 * The temp folders our scratch lands in: this user's, which a shell's TMPDIR names, and /tmp, which Node takes when TMPDIR
 * is unset, as it is in launchd's jobs (the engine's cycles) and in a test that starts a program with an env of its own
 * (Grok's read: 1,118 restore folders in /tmp). /tmp first: it's small, and a pass's minutes would otherwise go to the other.
 */
export const scratchFolders = () => [...new Set(['/tmp', (process.platform === 'darwin' && read('getconf', ['DARWIN_USER_TEMP_DIR'])?.trim()) || tmpdir()].flatMap(d => { try { return [realpathSync(d)] } catch { return [] } }))]
/** The temp folder's entries a running process of this user has a file open in, or works in; null when lsof can't say. */
const openIn = temp => {
  const out = read('lsof', ['-u', String(process.getuid()), '-Fn'])
  return out == null ? null : new Set(out.split('\n').filter(l => l.startsWith(`n${temp}/`)).map(l => l.slice(temp.length + 2).split('/')[0]))
}
/** The temp folder's entries that hold one of this repository's worktrees (a lead's checkout), which this pass never takes. */
const worktreesIn = temp => {
  const list = read('git', ['-C', REPO, 'worktree', 'list', '--porcelain'])
  if (list == null) return null
  const paths = list.split('\n').filter(l => l.startsWith('worktree ')).map(l => { const p = l.slice(9); try { return realpathSync(p) } catch { return p } })
  return new Set(paths.filter(p => p.startsWith(`${temp}/`)).map(p => p.slice(temp.length + 1).split('/')[0]))
}
export function scratch({ temps = scratchFolders(), open = openIn, worktrees = worktreesIn, now = Date.now(), clock = Date.now, minutes = SCRATCH_MINUTES, dry = DRY, say = log } = {}) {
  const until = clock() + minutes * 60_000
  let removed = 0
  for (const temp of temps) removed += scratchIn(temp, { open, worktrees, now, clock, until, minutes, dry, say })
  return removed
}
function scratchIn(temp, { open, worktrees, now, clock, until, minutes, dry, say }) {
  const held = open(temp), trees = worktrees(temp)
  if (held == null || trees == null) { say(`scratch: ${temp}: lsof or git gave no answer, nothing removed`); return 0 }
  const names = readdirSync(temp)
  const kinds = new Map()
  for (const n of names) { const k = scratchKind(n); if (k) kinds.set(k, (kinds.get(k) ?? 0) + 1) }
  const hoursOf = st => (now - Math.max(st.mtimeMs, st.ctimeMs)) / 3_600_000
  const kept = new Map()
  let removed = 0
  for (const name of names) {
    const kind = scratchKind(name)
    if (!kind) continue
    if (clock() > until) { say(`scratch: ${minutes} min up, the rest next hour`); break }
    const path = join(temp, name)
    let st, kids = []
    try { st = lstatSync(path); if (st.isDirectory()) kids = readdirSync(path) } catch { continue }
    const ages = kids.slice(0, 40).flatMap(k => { try { return [hoursOf(lstatSync(join(path, k)))] } catch { return [] } })
    const verdict = scratchVerdict({ name, dir: st.isDirectory(), mine: st.uid === process.getuid(), open: held.has(name), worktree: trees.has(name), hours: hoursOf(st), kids, kidsHours: Math.min(Infinity, ...ages), kindCount: kinds.get(kind) })
    if (verdict !== 'remove') { kept.set(verdict, (kept.get(verdict) ?? 0) + 1); continue }
    if (!dry) rmSync(path, { recursive: true, force: true })
    removed++
  }
  say(`scratch: ${temp}: ${dry ? 'would remove' : 'removed'} ${removed}; left ${[...kept].map(([why, n]) => `${n} (${why})`).join(', ') || 'none'}`)
  return removed
}

/**
 * Free space against mac-status.py's floor: its `--space` says nothing at 30 GB or more, a warning under, and exits 3
 * under 20. Under 30, the chief of staff hears of it once a day (the day it was said is kept in `said`).
 */
export async function space({ status = () => spawnSync('python3', [MAC_STATUS, '--space'], { encoding: 'utf8' }), send = sendToThread, chief = CHIEF, said = SPACE_SAID, today = new Date().toISOString().slice(0, 10), dry = DRY, say = log } = {}) {
  const r = status()
  const what = (r.stderr ?? '').trim()
  if (!what) return
  say(`space: ${what}`)
  if (dry || (existsSync(said) && readFileSync(said, 'utf8').trim() === today)) return
  const threadId = existsSync(chief) ? readFileSync(chief, 'utf8').trim() : ''
  if (!threadId) return say('space: no thread to tell (~/.config/aquatome/owner-report-thread)')
  const [first, ...where] = what.split('\n')
  await send({ threadId, message: [`The Mac's upkeep (machine-sweep.mjs), once a day while it lasts: ${first}${r.status === 3 ? '' : ' Under 20 GB no simulator or upload starts.'}`, ...(where.length ? ['Where it is:', ...where] : []), '`scripts/mac-status.py` shows who is up.'].join('\n') })
  mkdirSync(join(said, '..'), { recursive: true })
  writeFileSync(said, `${today}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--archive')) {
  const cwds = read('lsof', ['-d', 'cwd', '-Fn'])?.split('\n').filter(l => l.startsWith('n')).map(l => l.slice(1)) ?? null
  archiveNamed(process.argv, { cwds, live: liveWorktrees() })
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // One pass failing leaves the others to run.
  const passes = [simulators, agents, space, helpers, ...(process.argv.includes('--worktrees') || new Date().getHours() === 3 ? [worktrees] : []), scratch]
  for (const pass of passes) {
    try {
      await pass()
    } catch (e) {
      log(`${pass.name}: ${e.message}`)
    }
  }
}
