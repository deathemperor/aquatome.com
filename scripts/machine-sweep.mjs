#!/usr/bin/env node
// This Mac's upkeep, hourly (install-machine-sweep.sh): what nobody is using stops loading it. Each booted simulator
// runs about 230 processes, and the runner's and leads' worktrees were 141 (2026-11-08). What it isn't sure of it leaves,
// and says so in its log (~/Library/Logs/aquatome-machine-sweep.log).
// - Simulators: a Device session idle for 3 h, a simulator no session or run holds up for 12 h, a test's copy with no run.
// - Agents: an install-*-schedule.sh plist that was newer than a running job gets loaded once the job ends.
// - Worktrees, at 03:35 or with --worktrees: merged ones. Never with --force, so git refuses any with changes.
// --dry-run says what it would do, and does none of it.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = homedir()
const REPO = join(HOME, '.infinitus/projects/aquatome.com')
const AGENTS = join(HOME, 'Library/LaunchAgents')
const STAMPS = join(HOME, '.cache/aquatome/agents-loaded')
const DEVICE = join(HOME, '.infinitus/userdata/device')
const CLAIMS = join(HOME, '.agent-device/device-claims')
const THREADS = join(HOME, '.infinitus/userdata/statev2.sqlite')
const DRY = process.argv.includes('--dry-run')
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

/** Whether a booted simulator closes. A run on it (`testing`) or the runner's own (wait-for-simulator.sh) never does. */
export function simVerdict({ name, testing, session, abandoned, idleHours, upHours }) {
  if (testing || name.startsWith('aquatome-ci-')) return 'keep'
  if (session) return idleHours >= 3 || (abandoned && idleHours >= 0.5) ? 'close' : 'keep'
  return upHours >= 12 ? 'close' : 'keep'
}

/** 'remove', or why a worktree stays. Only this repository's: not the main checkout, other projects, or a thread's scratchpad. */
export function worktreeVerdict({ path, liveCwd, liveThread, dirty, unpushed, remoteBranch, prs, hours }) {
  const ours = path.startsWith(`${HOME}/.infinitus/worktrees/aquatome.com/`) || (path.startsWith('/private/tmp/') && !path.includes('/claude-'))
  if (!ours) return 'not a worktree this sweep looks after'
  if (liveCwd) return 'a process is working in it'
  if (liveThread) return 'its thread is live'
  if (dirty) return 'uncommitted changes'
  if (prs.some(p => p.state === 'OPEN')) return 'open pull request'
  // Its pull request merged at this very commit: GitHub keeps the commits, even when the branch is gone.
  if (prs.some(p => p.state === 'MERGED' && p.atTip)) return hours >= 6 ? 'remove' : 'merged, but touched within 6 h'
  // Every commit is on the remote, and the work merged or its branch was deleted.
  if (unpushed === 0 && (prs.some(p => p.state === 'MERGED') || !remoteBranch)) return hours >= 24 ? 'remove' : 'nothing unpushed, but touched within 24 h'
  return unpushed === 0 ? 'its branch is on the remote, unmerged' : 'commits on no remote'
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
  const runs = lines.filter(l => /\/xcodebuild\s/.test(l) && !l.includes('AgentDeviceRunner'))
  const claims = new Map()
  for (const f of existsSync(CLAIMS) ? readdirSync(CLAIMS) : []) {
    try {
      const claim = JSON.parse(readFileSync(join(CLAIMS, f), 'utf8'))
      claims.set(claim.device.id, claim)
    } catch { /* a claim being written: the next hour's */ }
  }
  const agentDevice = readdirSync(join(HOME, '.infinitus/tools/agent-device'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(d.parentPath, d.name, 'node_modules/agent-device/bin/agent-device.mjs')).filter(existsSync).sort().at(-1)
  const hosts = join(DEVICE, 'hosts')
  const config = existsSync(hosts) ? readdirSync(hosts).filter(f => f.endsWith('.json')).map(f => join(hosts, f))[0] : undefined
  for (const device of Object.values(JSON.parse(booted).devices).flat()) {
    const claim = claims.get(device.udid)
    const events = claim && join(claim.stateDir, 'sessions', claim.session, 'events.ndjson')
    const up = lines.find(l => l.includes(`launchd_sim`) && l.includes(device.udid))
    const verdict = simVerdict({
      name: device.name,
      testing: runs.some(l => l.includes(device.udid)),
      session: claim?.session,
      abandoned: !!claim?.abandonedAtMs,
      idleHours: events && existsSync(events) ? hoursSince(statSync(events).mtimeMs) : Infinity,
      upHours: up ? etimeHours(up.trim().split(/\s+/)[0]) : 0,
    })
    if (verdict !== 'close') continue
    log(`closing simulator ${device.name}: nobody has used it${claim ? ` (session ${claim.session})` : ''}`)
    if (DRY) continue
    if (claim && agentDevice && config) spawnSync('node', [agentDevice, 'close', '--shutdown', '--platform', 'ios', '--udid', device.udid, '--config', config, '--session', claim.session], { stdio: 'ignore', timeout: 120_000 })
    read('xcrun', ['simctl', 'shutdown', device.udid]) // already down after a clean close: then this does nothing
  }
  // Test copies, when no run is left to use them: a cancelled run leaves them up.
  const copies = runs.length ? null : read('xcrun', ['simctl', '--set', 'testing', 'list', 'devices', 'booted', '-j'])
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
    const plist = join(AGENTS, f)
    const stamp = join(STAMPS, label)
    if (existsSync(stamp) && statSync(stamp).mtimeMs >= statSync(plist).mtimeMs) continue
    const uid = process.getuid()
    if (/^\s*pid = /m.test(read('launchctl', ['print', `gui/${uid}/${label}`]) ?? '')) continue
    if (DRY) { log(`would load the new plist of ${label}`); continue }
    spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' })
    if (spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plist], { stdio: 'ignore' }).status !== 0) { log(`could not load ${label}`); continue }
    mkdirSync(STAMPS, { recursive: true })
    writeFileSync(stamp, '')
    log(`loaded the new plist of ${label}`)
  }
}

function worktrees() {
  const list = read('git', ['-C', REPO, 'worktree', 'list', '--porcelain'])
  const remote = read('git', ['-C', REPO, 'ls-remote', '--heads', 'origin'])
  const pullRequests = read('gh', ['pr', 'list', '-R', 'deathemperor/aquatome.com', '--state', 'all', '--limit', '1000', '--json', 'headRefName,state,headRefOid'])
  const cwds = read('lsof', ['-d', 'cwd', '-Fn'])
  // A thread's worktree stays while it runs, or for 3 days after a thread that isn't a delegated task last ran.
  const threads = read('sqlite3', ['-readonly', '-separator', '\t', THREADS, `select json_extract(t.payload_json, '$.worktreePath'), t.thread_id, json_extract(t.payload_json, '$.updatedAt'), (select count(*) from orchestration_v2_projection_runs r where r.thread_id = t.thread_id and r.status in ('running', 'queued')) from orchestration_v2_projection_threads t where t.deleted_at is null and json_extract(t.payload_json, '$.worktreePath') is not null`])
  if (!list || !remote || !pullRequests || cwds == null || threads == null) return log('worktrees: could not read what they need, leaving them')
  const remoteBranches = new Set(remote.split('\n').map(l => l.split('\t')[1]?.replace('refs/heads/', '')))
  const prs = JSON.parse(pullRequests)
  const live = new Set(threads.split('\n').filter(Boolean).map(l => l.split('\t')).filter(([, id, at, active]) => Number(active) > 0 || (!id.startsWith('thread:delegated-task:') && hoursSince(Date.parse(at)) < 72)).map(([path]) => path))
  const inUse = cwds.split('\n').filter(l => l.startsWith('n')).map(l => l.slice(1))
  let removed = 0
  for (const block of list.split('\n\n').filter(Boolean).slice(1)) {
    const lines = block.split('\n')
    const path = lines[0].replace('worktree ', '')
    const head = lines.find(l => l.startsWith('HEAD '))?.slice(5)
    const branch = lines.find(l => l.startsWith('branch '))?.replace('branch refs/heads/', '')
    if (!existsSync(path)) continue
    const status = read('git', ['-C', path, 'status', '--porcelain'], 90_000)
    const gitDir = read('git', ['-C', path, 'rev-parse', '--absolute-git-dir'])?.trim()
    const logged = gitDir && join(gitDir, 'logs/HEAD')
    const verdict = worktreeVerdict({
      path,
      liveCwd: inUse.some(c => c === path || c.startsWith(`${path}/`)),
      liveThread: live.has(path),
      dirty: status == null || status !== '',
      unpushed: Number(read('git', ['-C', path, 'rev-list', '--count', 'HEAD', '--not', '--remotes']) ?? NaN),
      remoteBranch: !!branch && remoteBranches.has(branch),
      prs: prs.filter(p => p.headRefName === branch || p.headRefOid === head).map(p => ({ state: p.state, atTip: p.headRefOid === head })),
      hours: logged && existsSync(logged) ? hoursSince(statSync(logged).mtimeMs) : 0,
    })
    if (verdict !== 'remove') { log(`kept ${path}: ${verdict}`); continue }
    if (DRY) { log(`would remove ${path}`); continue }
    const r = spawnSync('git', ['-C', REPO, 'worktree', 'remove', path], { encoding: 'utf8' })
    if (r.status === 0) { removed++; log(`removed ${path}`) } else log(`kept ${path}: ${r.stderr.trim().slice(0, 200)}`)
    spawnSync('sleep', ['2'])
  }
  if (!DRY) read('git', ['-C', REPO, 'worktree', 'prune'])
  log(`worktrees: removed ${removed}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  simulators()
  agents()
  if (process.argv.includes('--worktrees') || new Date().getHours() === 3) worktrees()
}
