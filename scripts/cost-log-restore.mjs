#!/usr/bin/env node
// The cloud cycle's cost log, checked against the runs' own copies each run. The log is the day's spend, which each
// step's ceiling is counted from (packages/engine/src/ceiling.ts), and engine.yml carries it from run to run in GitHub's
// cache. GitHub evicts a cache it hasn't read for a week, or when the repository's caches pass their size, and on 12 Nov
// 2026 a cycle found none: it counted the day from $0. A cache can also be older than a run that spent (one whose runner
// was lost before it saved). So the log is the cache's lines and every line of the runs' own copies (each attempt of a
// run keeps it as its artifact, engine-cost-log-rewrite-<attempt>, for weeks).
// If an attempt that ran the cycle today kept no copy after it, what it spent can't be counted, so the log gets a line
// saying so, and ceiling.ts stops every step with a ceiling for the rest of the day (the gate and moderation, which have
// none, go on). So does a list GitHub can't give in full. If no cycle ran today, the day starts from $0, as it should.
//
//   cost-log-restore.mjs <log>
//
// Needs gh, unzip, GH_TOKEN with actions: read and GITHUB_REPOSITORY. Says what it did on stdout, and in
// $GITHUB_STEP_SUMMARY with a warning when a day's spend can't be counted.

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DAY = 24 * 3600_000
/** Vietnam's calendar day (UTC+7, no summer time): the day a ceiling counts (ceiling.ts). */
export const vnDay = d => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
/** When `now`'s day began in Vietnam. */
export const dayStart = now => Date.parse(`${vnDay(now)}T00:00:00+07:00`)

export const ARTIFACT = 'engine-cost-log-rewrite'
export const CYCLE_JOB = 'Content cycle: rewrite'
export const CYCLE_STEP = 'Run this part, test, commit, push, deploy'
export const UPLOAD_STEP = 'Keep the cost log (a line a model call, with its account)'
/** GitHub runs a run again up to 30 days after it began, so one that old can have spent today. */
export const RERUN_DAYS = 30

/**
 * Every run of engine.yml on main that GitHub can still run again, asked for a page at a time: `page(n)` gives GitHub's
 * list, newest started first, a hundred a page. It stops at the first page that reaches one older than RERUN_DAYS, or
 * isn't full. Past `most` pages the earlier runs can't all be asked about, so neither can the day.
 */
export function allRuns(page, now, most = 20) {
  const all = []
  for (let n = 1; n <= most; n++) {
    const got = page(n)
    all.push(...got)
    if (got.length < 100 || got.some(r => now.getTime() - Date.parse(r.created_at) >= RERUN_DAYS * DAY)) return all
  }
  throw new Error(`more than ${most * 100} runs in ${RERUN_DAYS} days`)
}

/**
 * Every item of one of GitHub's lists, a page at a time: `page(n)` gives a page of a hundred. It stops at the first page
 * that isn't full; past `most` pages it throws, as what the list holds can't all be read, so neither can the day.
 */
export function pagesOf(page, most = 10) {
  const all = []
  for (let n = 1; n <= most; n++) {
    const got = page(n)
    all.push(...got)
    if (got.length < 100) return all
  }
  throw new Error(`more than ${most * 100} items in one list`)
}

/**
 * The engine's runs that may have logged, the last active first: this repository's own, on main, started by the
 * schedule or by hand, active in the last 8 days (engine.yml drops older lines), this one too (an earlier attempt of it
 * kept its own log, and spent). A run of another repository's branch, or of a pull request, counts for nothing. By when
 * a run last did anything, not when it began: one run again today began days ago.
 */
export function ownRuns(runs, repoId, now) {
  return runs
    .filter(r => r.head_branch === 'main' && ['schedule', 'workflow_dispatch'].includes(r.event)
      && r.repository?.id === repoId && r.head_repository?.id === repoId && now.getTime() - Date.parse(r.updated_at) < 8 * DAY)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
}

/**
 * A run's copies of the log among its artifacts: named engine-cost-log-rewrite-<attempt> (a run again can't keep a
 * second under its first attempt's name), or engine-cost-log-rewrite as runs before 13 Nov 2026 named it; not expired;
 * from this repository's own run (a fork's pull request can upload one under any name).
 */
/** The attempt a copy's name says it was kept by; none for the one name runs had before 13 Nov 2026. */
export const attemptOf = name => (name === ARTIFACT ? undefined : Number(name.slice(ARTIFACT.length + 1)))
export const keptLogs = (artifacts, repoId) => artifacts.filter(a => (a.name === ARTIFACT || new RegExp(`^${ARTIFACT}-\\d+$`).test(a.name ?? ''))
  && !a.expired && a.workflow_run?.repository_id === repoId && a.workflow_run?.head_repository_id === repoId)

/**
 * The cycle steps a run's jobs (every attempt's, as GitHub lists them) ran, each with its job's attempt: any conclusion
 * but skipped or none counts, so a conclusion this doesn't know reads as spent. The hourly checks that found no cycle
 * due skip the job, a job with no steps never ran, and this run's own step, still to come, has none.
 */
export const cycleSteps = jobs => jobs.filter(j => j.name === CYCLE_JOB).flatMap(j => (j.steps ?? []).map(s => ({ ...s, attempt: j.run_attempt })))
  .filter(s => s.name === CYCLE_STEP && s.conclusion != null && s.conclusion !== 'skipped')

/**
 * The attempt that kept a run's copy under the one name runs had before 13 Nov 2026 (a run of then, run again since, still
 * uses it): the only attempt whose cycle job's upload step succeeded, since a later attempt can't keep a second copy
 * under the same name. None when no attempt's did, or more than one's (one with no log to keep succeeds too).
 */
export function legacyAttempt(jobs) {
  const ok = new Set(jobs.filter(j => j.name === CYCLE_JOB && (j.steps ?? []).some(s => s.name === UPLOAD_STEP && s.conclusion === 'success')).map(j => j.run_attempt))
  return ok.size === 1 ? [...ok][0] : undefined
}

/**
 * Whether copy `k` holds what cycle step `s` spent: kept by the step's own attempt. A job's steps run in turn, and the
 * copy is kept by the upload step after the cycle step, so it holds the cycle's lines; the times aren't compared, as the
 * step's is the runner's clock and the copy's GitHub's (Astra's third read: a runner five seconds ahead made a whole log
 * read as late). Another attempt's copy can't hold it: a later attempt that found an older cache kept a log without
 * it. A copy under the old name is its uploading attempt's (legacyAttempt), or no attempt's. A cancelled cycle's copy
 * holds nothing for sure (Astra's fourth read): a call is logged when its answer comes back (claude.ts), so a call the
 * cancel cut off is in no copy, and the day can't be counted.
 */
const covers = (k, s, legacy) => s.attempt !== undefined && s.conclusion !== 'cancelled' && (k.attempt ?? legacy) === s.attempt

/** Every line of `texts`, once each, in the order first met. */
export function union(texts) {
  const lines = new Set(texts.filter(t => t !== undefined).flatMap(t => t.split('\n').filter(Boolean)))
  return lines.size ? [...lines].map(l => `${l}\n`).join('') : undefined
}

/**
 * The log as the runs kept it, and the runs whose spend today it can't hold (`unknown`). `logsOf(run)` is the copies a
 * run kept, `{ text, at, attempt }`; `jobsOf(run)` its jobs. Each run active today is read: a cycle step of it that ended
 * today counts as logged only when its own attempt kept a copy (covers).
 * Then the copies of the first run active before today, for the lines of earlier days. The text is every line of those
 * copies, once each: a run's copy holds the earlier runs' lines it found in the cache, so they overlap.
 */
export function restore(runs, logsOf, jobsOf, now) {
  const start = dayStart(now)
  const texts = []
  const unknown = []
  let from
  for (const run of runs) {
    const today = Date.parse(run.updated_at) >= start
    const kept = logsOf(run)
    if (today) {
      const jobs = jobsOf(run)
      const legacy = legacyAttempt(jobs)
      const lost = s => (s.completed_at == null || Date.parse(s.completed_at) >= start) && !kept.some(k => covers(k, s, legacy))
      if (cycleSteps(jobs).some(lost)) unknown.push(run.id)
    }
    if (kept.length) {
      from ??= run.id
      texts.push(...kept.map(k => k.text))
      if (!today) break
    }
  }
  if (from === undefined) return { unknown }
  return { from, text: union(texts.reverse()) ?? '', unknown }
}

/** The line that stops every step with a ceiling until the day ends (ceiling.ts): no dollar figure, as none is known. */
export const unloggedLine = (now, why) => `${JSON.stringify({ at: now.toISOString(), unlogged: why })}\n`

const gh = (args, opts = {}) => execFileSync('gh', args, { maxBuffer: 64 * 1024 * 1024, ...opts })
const json = args => JSON.parse(gh(['api', ...args], { encoding: 'utf8' }))

function loud(text) {
  console.log(`::warning::${text}`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### The day's spend can't be counted\n\n${text}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = process.argv[2]
  if (!log) {
    console.error('usage: cost-log-restore.mjs <log>')
    process.exit(2)
  }
  const now = new Date()
  const cached = existsSync(log) ? readFileSync(log, 'utf8') : undefined
  const count = t => (t ? t.split('\n').filter(Boolean).length : 0)
  try {
    const repo = process.env.GITHUB_REPOSITORY
    if (!repo) throw new Error('GITHUB_REPOSITORY is not set')
    const repoId = Number(process.env.GITHUB_REPOSITORY_ID) || json([`repos/${repo}`]).id
    const runs = allRuns(n => json([`repos/${repo}/actions/workflows/engine.yml/runs?branch=main&per_page=100&page=${n}`]).workflow_runs, now)
    const list = (path, key) => pagesOf(n => json([`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${n}`])[key])
    const dir = mkdtempSync(join(tmpdir(), 'aq-cost-log-'))
    const logsOf = run => keptLogs(list(`repos/${repo}/actions/runs/${run.id}/artifacts`, 'artifacts'), repoId).map(a => {
      const zip = join(dir, `${a.id}.zip`)
      writeFileSync(zip, gh(['api', `repos/${repo}/actions/artifacts/${a.id}/zip`]))
      return { text: execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), at: a.created_at, attempt: attemptOf(a.name) }
    })
    const jobsOf = run => list(`repos/${repo}/actions/runs/${run.id}/jobs?filter=all`, 'jobs')
    const r = restore(ownRuns(runs, repoId, now), logsOf, jobsOf, now)
    const text = union([cached, r.text])
    if (text !== undefined) writeFileSync(log, text)
    if (cached !== undefined) {
      console.log(`the cost log came from the cache (${count(cached)} lines); the runs' own copies added ${count(text) - count(cached)}`)
    } else if (r.text !== undefined) {
      console.log(`the cache had no cost log: restored the runs' own, the last from run ${r.from} (${count(text)} lines)`)
    } else {
      loud('Neither the cache nor any run of the last 8 days kept a cost log.')
    }
    if (r.unknown.length) {
      const why = `run${r.unknown.length > 1 ? 's' : ''} ${r.unknown.join(', ')} ran the cycle today and kept no cost log after it`
      appendFileSync(log, unloggedLine(now, why))
      loud(`${why}, so what ${r.unknown.length > 1 ? 'they' : 'it'} spent can't be counted: every step with a ceiling stops until the day ends in Vietnam. The gate and moderation go on.`)
    }
  } catch (e) {
    // The earlier runs can't be asked about, so neither can the day: the careful reading.
    appendFileSync(log, unloggedLine(now, `the earlier runs' cost logs couldn't be fetched: ${String(e.message).slice(0, 200)}`))
    loud(`The earlier runs' cost logs couldn't be fetched (${String(e.message).slice(0, 200)}): every step with a ceiling stops until the day ends in Vietnam. The gate and moderation go on.`)
  }
}
