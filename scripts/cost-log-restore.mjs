#!/usr/bin/env node
// The cloud cycle's cost log when GitHub's cache has none. The log is the day's spend, which each step's ceiling is
// counted from (packages/engine/src/ceiling.ts), and engine.yml carries it from run to run in GitHub's cache. GitHub
// evicts a cache it hasn't read for a week, or when the repository's caches pass their size, and on 12 Nov 2026 a cycle
// found none: it counted the day from $0. So, when the cache gives none, the log comes from the last run's own copy
// (each run keeps it as its artifact, engine-cost-log-rewrite, for weeks).
// If a run that ran the cycle today kept none, what it spent can't be counted, so the log gets a line saying so, and
// ceiling.ts stops every step with a ceiling for the rest of the day (the gate and moderation, which have none, go on).
// If no run ran the cycle today, there is nothing to count: the day starts from $0, as it should.
//
//   cost-log-restore.mjs <log>
//
// Needs gh, unzip, GH_TOKEN with actions: read, GITHUB_REPOSITORY and GITHUB_RUN_ID. Says what it did on stdout, and
// in $GITHUB_STEP_SUMMARY with a warning when a day's spend can't be counted.

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
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

/**
 * The engine's runs that may have logged, newest first: this repository's own, on main, started by the schedule or by
 * hand, not this run, from the last 8 days (engine.yml drops older lines). A run of another repository's branch, or of
 * a pull request, counts for nothing.
 */
export function ownRuns(runs, repoId, current, now) {
  return runs
    .filter(r => String(r.id) !== String(current) && r.head_branch === 'main' && ['schedule', 'workflow_dispatch'].includes(r.event)
      && r.repository?.id === repoId && r.head_repository?.id === repoId && now.getTime() - Date.parse(r.created_at) < 8 * DAY)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

/** Whether a run's cycle step started (its jobs as GitHub lists them): the hourly checks that found no cycle due didn't. */
export const ranCycle = jobs => jobs.some(j => j.name === CYCLE_JOB && j.steps?.some(s => s.name === CYCLE_STEP && ['success', 'failure', 'cancelled'].includes(s.conclusion)))

/**
 * Newest first, to the first run that kept a log: its text, and the runs before it that ran the cycle on `now`'s day
 * and kept none (`unknown`). `logOf(run)` is the log a run kept, undefined for none; `jobsOf(run)` its jobs. Each run's
 * log holds every earlier run's lines (engine.yml), so the newest one kept is the whole log.
 */
export function restore(runs, logOf, jobsOf, now) {
  const unknown = []
  for (const run of runs) {
    const text = logOf(run)
    if (text !== undefined) return { from: run.id, text, unknown }
    if (Date.parse(run.updated_at) >= dayStart(now) && ranCycle(jobsOf(run))) unknown.push(run.id)
  }
  return { unknown }
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
  if (existsSync(log)) {
    console.log('the cost log came from the cache')
    process.exit(0)
  }
  try {
    const repo = process.env.GITHUB_REPOSITORY
    if (!repo) throw new Error('GITHUB_REPOSITORY is not set')
    const repoId = Number(process.env.GITHUB_REPOSITORY_ID) || json([`repos/${repo}`]).id
    const runs = []
    for (let page = 1; page <= 5; page++) {
      const got = json([`repos/${repo}/actions/workflows/engine.yml/runs?branch=main&per_page=100&page=${page}`]).workflow_runs
      runs.push(...got)
      if (got.length < 100 || got.some(r => now.getTime() - Date.parse(r.created_at) >= 8 * DAY)) break
    }
    const dir = mkdtempSync(join(tmpdir(), 'aq-cost-log-'))
    const logOf = run => {
      const a = json([`repos/${repo}/actions/runs/${run.id}/artifacts?name=${ARTIFACT}`]).artifacts
        .find(x => x.name === ARTIFACT && !x.expired && x.workflow_run?.repository_id === repoId && x.workflow_run?.head_repository_id === repoId)
      if (!a) return undefined
      const zip = join(dir, `${a.id}.zip`)
      writeFileSync(zip, gh(['api', `repos/${repo}/actions/artifacts/${a.id}/zip`]))
      return execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    }
    const jobsOf = run => json([`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`]).jobs
    const r = restore(ownRuns(runs, repoId, process.env.GITHUB_RUN_ID, now), logOf, jobsOf, now)
    if (r.text !== undefined) {
      writeFileSync(log, r.text)
      console.log(`the cache had no cost log: restored run ${r.from}'s (${r.text.split('\n').filter(Boolean).length} lines)`)
    } else {
      loud('Neither the cache nor any run of the last 8 days kept a cost log.')
    }
    if (r.unknown.length) {
      const why = `run${r.unknown.length > 1 ? 's' : ''} ${r.unknown.join(', ')} ran the cycle today and kept no cost log`
      appendFileSync(log, unloggedLine(now, why))
      loud(`${why}, so what ${r.unknown.length > 1 ? 'they' : 'it'} spent can't be counted: every step with a ceiling stops until the day ends in Vietnam. The gate and moderation go on.`)
    }
  } catch (e) {
    // The earlier runs can't be asked about, so neither can the day: the careful reading.
    appendFileSync(log, unloggedLine(now, `the earlier runs' cost logs couldn't be fetched: ${String(e.message).slice(0, 200)}`))
    loud(`The cache had no cost log and the earlier runs' couldn't be fetched (${String(e.message).slice(0, 200)}): every step with a ceiling stops until the day ends in Vietnam. The gate and moderation go on.`)
  }
}
