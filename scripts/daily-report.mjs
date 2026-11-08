#!/usr/bin/env node
// The owner's daily report, GitHub's half (daily-report.yml, docs/governance.md): the last 24 hours of this repository as
// JSON, POSTed to the site (apps/site/worker/daily), which adds the site's and the app's numbers, keeps the report and
// mails it. The workflow's run id is its idempotency key: a retried POST never sends twice. Uses the gh CLI (GH_TOKEN) and
// AB_DASH_TOKEN. DRY_RUN=1 prints the JSON instead of posting it (GITHUB_REPOSITORY=owner/name to try it locally).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { productChanges, sectionLines, titleQualifies } from './changelog.mjs'

const REPORT_URL = 'https://aquatome.com/_ab/report'
const DAY_MS = 86_400_000
const MAX_LIST = 50
const MAX_TITLE = 200
/** Product changes: a few lines a pull request, so more than MAX_LIST (github.ts reads the same bound). */
const MAX_CHANGES = 100
/** A conclusion that counts as failed. Cancelled and skipped runs say nothing either way. */
const BAD = new Set(['failure', 'timed_out', 'startup_failure'])
const NOT_RUN = new Set(['cancelled', 'skipped'])
/** The job of testflight.yml that uploads; it was named "upload" until 2026-11-02. */
const UPLOAD_JOBS = new Set(['upload', 'iOS app: sign and upload to TestFlight'])

const ms = t => Date.parse(t)
const subject = commit => commit.commit.message.split('\n')[0]
const clip = s => String(s).slice(0, MAX_TITLE)
const item = x => ({ number: x.number, title: clip(x.title), url: x.html_url })
const listed = xs => ({ total: xs.length, items: xs.slice(0, MAX_LIST).map(item) })

/**
 * engine.yml runs hourly, and most of its runs only find no cycle due and end in seconds. A cycle is a run of over 10
 * minutes, the workflow's own rule; a failed run counts whatever its length.
 */
const idle = (file, run) => file === 'engine.yml' && run.conclusion === 'success' && ms(run.updated_at) - ms(run.created_at) <= 600_000

/** Runs started since `since` that ran, and those that failed. Newest first, as GitHub lists them. */
function tally(file, runs, since) {
  const recent = runs.filter(r => ms(r.created_at) >= since && !NOT_RUN.has(r.conclusion) && !idle(file, r))
  return { runs: recent.length, failed: recent.filter(r => BAD.has(r.conclusion)).length }
}

/** The failures since a workflow's last success on main: nothing when it succeeded last. */
function failingRuns(file, runs) {
  const streak = []
  for (const r of runs) {
    if (r.status !== 'completed') continue
    if (BAD.has(r.conclusion)) streak.push(r)
    else if (r.conclusion === 'success' && !idle(file, r)) break
  }
  return streak
}

/**
 * engine-mac.yml runs only to report a part of the Mac's cycle that failed, so it never succeeds: a failure of the last 24
 * hours counts, by part, until a later `content: engine <part>` commit says that part has run since.
 */
function macFailures(runs, commits, since) {
  const parts = new Map()
  for (const r of runs) {
    if (!BAD.has(r.conclusion) || ms(r.created_at) < since) continue
    const part = /Mac: (\S+) failed/.exec(r.display_title ?? '')?.[1]
    if (part && commits.some(c => subject(c).startsWith(`content: engine ${part} `) && ms(c.commit.committer.date) > ms(r.created_at))) continue
    const seen = parts.get(r.display_title)
    if (seen) Object.assign(seen, { since: r.created_at, failures: seen.failures + 1 })
    else parts.set(r.display_title, { workflow: clip(r.display_title), url: r.html_url, since: r.created_at, failures: 1 })
  }
  return [...parts.values()]
}

function failing(raw, since) {
  return Object.entries(raw.runs).flatMap(([file, runs]) => {
    if (file === 'engine-mac.yml') return macFailures(runs, raw.commits, since)
    const streak = failingRuns(file, runs)
    return streak.length ? [{ workflow: clip(streak[0].name), url: streak[0].html_url, since: streak.at(-1).created_at, failures: streak.length }] : []
  })
}

/** What each `content:` commit is: "content: engine pages 2026-11-05" → "engine pages". */
const commitPart = s => s.replace(/^content:\s*/, '').replace(/\s*\d{4}-\d{2}-\d{2}.*$/, '').slice(0, 60) || 'other'

/** Pull requests merged since `since` (ms). */
const merged = (closed, since) => closed.filter(p => p.merged_at && ms(p.merged_at) >= since)

/** What GitHub gave, as the Worker reads it (apps/site/worker/daily/github.ts). `now`: a Date. */
export function summarise(raw, { now, runId, runUrl }) {
  const since = now.getTime() - DAY_MS
  const runs = file => raw.runs[file] ?? []
  const count = file => tally(file, runs(file), since)
  const content = raw.commits.filter(c => subject(c).startsWith('content:'))
  const parts = new Map()
  for (const c of content) parts.set(commitPart(subject(c)), (parts.get(commitPart(subject(c))) ?? 0) + 1)
  const uploads = []
  let uploadsFailed = 0
  for (const r of runs('testflight.yml')) {
    if (ms(r.created_at) < since) continue
    const job = (raw.jobs[r.id] ?? []).find(j => UPLOAD_JOBS.has(j.name))
    // The build number is this workflow's run number (testflight.yml's archive step).
    if (job?.conclusion === 'success') uploads.push({ build: r.run_number, url: r.html_url, at: r.created_at })
    else if (BAD.has(job?.conclusion)) uploadsFailed++
  }
  const live = runs('deploy.yml').find(r => r.conclusion === 'success')
  const issues = raw.issues.filter(i => !i.pull_request && i.user?.login === 'github-actions[bot]')
  const isNote = i => i.labels.some(l => l.name === 'page-review')
  return {
    runId, runUrl, since: new Date(since).toISOString(),
    missing: raw.missing.slice(0, MAX_LIST).map(clip),
    changes: productChanges(merged(raw.closed, since), raw.files).slice(0, MAX_CHANGES),
    deploys: { ...count('deploy.yml'), ...(live ? { live: { sha: live.head_sha.slice(0, 7), url: live.html_url, at: live.created_at } } : {}) },
    engine: count('engine.yml'),
    commits: { total: content.length, parts: [...parts].sort((a, b) => b[1] - a[1]).slice(0, MAX_LIST).map(([name, n]) => ({ name, n })) },
    ios: count('ios.yml'),
    testflight: { uploads: uploads.slice(0, MAX_LIST), failed: uploadsFailed },
    appStore: count('app-store.yml'),
    watch: count('watch.yml'),
    failing: failing(raw, since).slice(0, MAX_LIST),
    issues: listed(issues.filter(i => !isNote(i))),
    notes: issues.filter(isNote).length,
    prs: { ready: listed(raw.open.filter(p => !p.draft)), draft: listed(raw.open.filter(p => p.draft)) },
  }
}

/** The app's next days, as the report prints them. */
const CAL_DAYS = 7
const VN_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
const plusDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
/**
 * What the app's Hôm nay and Khám phá show over the next CAL_DAYS days, from the editorial calendar in `root`, the
 * repository (content/curation.json, docs/curation.md): the weeks they touch, with their Vietnamese theme and the
 * curator's `why`, and each day's fish by its Vietnamese name (a day with none shows the app's own pick). Undefined
 * without a calendar. `now`: a Date; the days are Vietnam's.
 */
export function calendar(root, now) {
  let cur
  try { cur = JSON.parse(readFileSync(join(root, 'content/curation.json'), 'utf8')) } catch { return undefined }
  const name = ref => {
    try { return clip(JSON.parse(readFileSync(join(root, 'content', ref, 'vi.json'), 'utf8')).name ?? ref) } catch { return clip(ref) }
  }
  const from = VN_DATE.format(now)
  const to = plusDays(from, CAL_DAYS - 1)
  const days = Array.from({ length: CAL_DAYS }, (_, i) => {
    const date = plusDays(from, i)
    const fish = cur.days?.find(d => d.date === date)?.fish
    return fish ? { date, fish: name(fish) } : { date }
  })
  const weeks = (cur.weeks ?? []).filter(w => w.to >= from && w.from <= to)
    .map(w => ({ from: w.from, to: w.to, theme: clip(w.theme?.vi ?? ''), ...(w.why ? { why: String(w.why).slice(0, 300) } : {}) }))
  return { weeks, days }
}

/** Everything `summarise` needs, through `api` (a path → its JSON). A part GitHub won't give is named in `missing`, not counted as none. */
export function read(api, repo, now) {
  const missing = []
  const get = (what, path, empty) => {
    try { return api(path) } catch { missing.push(what); return empty }
  }
  // Open issues and pull requests can pass one page (issues lists pull requests too).
  const pages = (what, path) => {
    const all = []
    for (let page = 1; page <= 5; page++) {
      const one = get(what, `${path}&page=${page}`, [])
      all.push(...one)
      if (one.length < 100) break
    }
    return all
  }
  const since = new Date(now.getTime() - DAY_MS).toISOString()
  const files = get('the workflow list', `repos/${repo}/actions/workflows?per_page=100`, { workflows: [] }).workflows
    .filter(w => w.state === 'active' && w.path.startsWith('.github/workflows/')).map(w => w.path.split('/').pop())
  /** @type {Record<string, any[]>} */
  const runs = {}
  // Main's own: a pull request's run says nothing about main, whatever its branch is called.
  for (const f of files) runs[f] = get(`runs of ${f}`, `repos/${repo}/actions/workflows/${f}/runs?branch=main&per_page=100`, { workflow_runs: [] }).workflow_runs.filter(r => r.event !== 'pull_request')
  /** @type {Record<string, any[]>} */
  const jobs = {}
  for (const r of runs['testflight.yml'] ?? []) {
    if (ms(r.created_at) >= ms(since)) jobs[r.id] = get(`the jobs of TestFlight run ${r.id}`, `repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`, { jobs: [] }).jobs
  }
  const closed = get('the merged pull requests', `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, [])
  // A merged PR without a Changelog section falls back to its title, labelled by the files it touched (scripts/changelog.mjs).
  /** @type {Record<number, string[]>} */
  const prFiles = {}
  for (const p of merged(closed, ms(since))) {
    if (!sectionLines(p.body) && titleQualifies(p.title)) prFiles[p.number] = pages(`the files of pull request ${p.number}`, `repos/${repo}/pulls/${p.number}/files?per_page=100`).map(f => f.filename)
  }
  return {
    runs, jobs, closed, files: prFiles,
    commits: get('the commits', `repos/${repo}/commits?sha=main&since=${since}&per_page=100`, []),
    open: pages('the open pull requests', `repos/${repo}/pulls?state=open&per_page=100`),
    issues: pages('the open issues', `repos/${repo}/issues?state=open&per_page=100`),
    missing,
  }
}

const TRANSIENT = status => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
/**
 * POSTs the report, as deploy.sh retries its upload: three tries, 30 then 60 s apart, on what may pass (no answer, 5xx, 429,
 * 409 while another try is in progress). Any other refusal ends it at once. True once the Worker has taken it.
 * @param {unknown} payload
 * @param {{ token?: string, fetchFn?: (url: string, init: RequestInit) => Promise<Response>, sleep?: (t: number) => Promise<unknown>, log?: (line: string) => void }} [options]
 */
export async function post(payload, { token, fetchFn = fetch, sleep = t => new Promise(r => setTimeout(r, t)), log = console.log } = {}) {
  for (let i = 1; i <= 3; i++) {
    let status = 0
    let body = ''
    try {
      const r = await fetchFn(REPORT_URL, {
        method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'aquatome-daily-report' },
      })
      status = r.status
      body = (await r.text()).slice(0, 300)
    } catch (e) {
      log(`no answer from the site: ${e.name}`)
    }
    if (status >= 200 && status < 300) {
      log(`the site took the report: ${body}`)
      return true
    }
    if (status) log(`the site answered ${status}: ${body}`)
    if (status && !TRANSIENT(status)) return false
    if (i < 3) {
      log(`trying again in ${i * 30} s`)
      await sleep(i * 30_000)
    }
  }
  return false
}

// Run as a script it acts; imported (its test, apps/site/test/daily-report.test.ts) it only defines.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId = '0', GITHUB_SERVER_URL: server = 'https://github.com', AB_DASH_TOKEN: token, DRY_RUN: dry } = process.env
  const now = new Date()
  const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }))
  const cal = calendar(fileURLToPath(new URL('..', import.meta.url)), now)
  const payload = { ...summarise(read(api, repo, now), { now, runId, runUrl: `${server}/${repo}/actions/runs/${runId}` }), ...(cal ? { calendar: cal } : {}) }
  if (dry) console.log(JSON.stringify(payload, null, 2))
  else if (!(await post(payload, { token }))) process.exit(1)
}
