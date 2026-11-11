#!/usr/bin/env node
// The spend of the workflows that call Claude outside the engine: the page review on pull requests (ci.yml), the
// nightly review (watch.yml) and the auto-fix (fix.yml). Each has a line in the engine's daily ceilings, on GitHub's
// side (packages/engine/src/ceilings.json), and writes a cost line a call: time, step, dollars, tokens. A runner starts
// empty, so a run keeps its lines as an artifact named cost-log-<step>-<the run's attempt>, and the day's spend is read
// back from those. Two runs that start together each count the same day, so together they can pass a line by a run.
//
//   claude-spend.mjs left <step>              what <step> has left of its day: `left=<dollars>` (or `left=none`, no
//                                             ceiling) and `go=<true|false>` on stdout and in $GITHUB_OUTPUT
//   claude-spend.mjs lines <step> [<step>…]   today's cost lines of those steps, from their runs' artifacts, on stdout
//                                             (engine.yml puts them beside the rewrite's log, for its day's total)
//
// Needs gh, unzip, GH_TOKEN with actions: read, and GITHUB_REPOSITORY.

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Vietnam's calendar day (UTC+7, no summer time): the day a ceiling counts (packages/engine/src/ceiling.ts). */
export const vnDay = d => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

/** The table in force: the one whose `from` is the latest that has passed, wherever it stands in the list (ceiling.ts). */
export function tableInForce(tables, now) {
  let chosen
  let latest = -Infinity
  for (const table of tables) {
    const from = Date.parse(table.from)
    if (Number.isNaN(from) || from > now.getTime() || from <= latest) continue
    chosen = table
    latest = from
  }
  return chosen
}

/**
 * A step's dollars a day on GitHub's side: its own line, else what every step not named gets. null is no ceiling.
 * With no table in force, nothing: 0.
 */
export function capFor(ceilings, step, now) {
  const place = tableInForce(ceilings.tables, now)?.github
  if (!place) return 0
  return Object.hasOwn(place.steps, step) ? place.steps[step] : place.default
}

/** The cost lines of `step` on `now`'s day, each as it was written. A broken line, or one with no cost, isn't one. */
export function linesOn(text, step, now) {
  const day = vnDay(now)
  return text.split('\n').filter(line => {
    if (!line.trim()) return false
    try {
      const row = JSON.parse(line)
      if (row?.step !== step || typeof row.at !== 'string' || typeof row.usd !== 'number' || !Number.isFinite(row.usd) || row.usd < 0) return false
      const at = new Date(row.at)
      return !Number.isNaN(at.getTime()) && vnDay(at) === day
    } catch {
      return false
    }
  })
}

/** What those lines add up to. */
export const spent = lines => lines.reduce((n, line) => n + JSON.parse(line).usd, 0)

/** Dollars left of a ceiling, never under 0; null (no ceiling) stays null. */
export const leftOf = (cap, spentToday) => (cap == null ? null : Math.max(0, Number((cap - spentToday).toFixed(4))))

const RECENT = 48 * 3600_000
const fresh = (a, now) => now.getTime() - Date.parse(a.created_at) < RECENT

/**
 * A step's artifacts that can hold lines of `now`'s day: named cost-log-<step>-<attempt> (a job run again keeps its
 * first attempt's lines under the first name), from this repository's own runs, not expired, made in the last two days
 * (a run's artifact is made when it ends; its lines are then taken by their own time). A fork's pull request can upload
 * an artifact under any name, so one from a run of another repository's branch counts for nothing.
 */
export function ownArtifacts(artifacts, repoId, now, step) {
  return artifacts.filter(a => a.name?.startsWith(`cost-log-${step}-`) && /^\d+$/.test(a.name.slice(`cost-log-${step}-`.length)) && !a.expired
    && a.workflow_run?.repository_id === repoId && a.workflow_run?.head_repository_id === repoId && fresh(a, now))
}

/**
 * Every artifact of the last two days, asked for a page at a time: `page(n)` gives GitHub's list, newest first, a
 * hundred a page. It stops at the first page that reaches an older one, or isn't full. Not by name: GitHub's filter
 * takes one exact name, and a fork's artifacts under that name could fill its first page. Past `most` pages the day
 * can't be counted (the repository made about 250 artifacts a day in November 2026).
 */
export function recentArtifacts(page, now, most = 40) {
  const all = []
  for (let n = 1; n <= most; n++) {
    const got = page(n)
    all.push(...got.filter(a => fresh(a, now)))
    if (got.length < 100 || got.some(a => !fresh(a, now))) return all
  }
  throw new Error(`more than ${most * 100} artifacts in two days: the day's spend can't be counted`)
}

const gh = (args, opts = {}) => execFileSync('gh', args, { maxBuffer: 64 * 1024 * 1024, ...opts })

/**
 * Today's cost lines of each of `steps`, from the artifacts their runs kept. Throws when GitHub can't be asked: the day
 * can't be counted then.
 */
function fetchLines(steps, now) {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set')
  const repoId = Number(process.env.GITHUB_REPOSITORY_ID) || JSON.parse(gh(['api', `repos/${repo}`], { encoding: 'utf8' })).id
  const artifacts = recentArtifacts(n => JSON.parse(gh(['api', `repos/${repo}/actions/artifacts?per_page=100&page=${n}`], { encoding: 'utf8' })).artifacts, now)
  const dir = mkdtempSync(join(tmpdir(), 'aq-cost-'))
  const lines = []
  for (const step of steps) for (const a of ownArtifacts(artifacts, repoId, now, step)) {
    const zip = join(dir, `${a.id}.zip`)
    writeFileSync(zip, gh(['api', `repos/${repo}/actions/artifacts/${a.id}/zip`]))
    lines.push(...linesOn(execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), step, now))
  }
  return lines
}

const out = pairs => {
  const text = Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join('')
  process.stdout.write(text)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...steps] = process.argv.slice(2)
  const now = new Date()
  if (cmd === 'left' && steps.length === 1) {
    const [step] = steps
    const cap = capFor(JSON.parse(readFileSync(new URL('../packages/engine/src/ceilings.json', import.meta.url), 'utf8')), step, now)
    if (cap == null) {
      console.log(`${step}: no ceiling`)
      out({ left: 'none', go: true })
    } else {
      const today = spent(fetchLines([step], now))
      const left = leftOf(cap, today)
      console.log(`${step}: $${today.toFixed(2)} spent of $${cap} on ${vnDay(now)} (Vietnam's day), $${left.toFixed(2)} left`)
      out({ left, go: left > 0 })
    }
  } else if (cmd === 'lines' && steps.length) {
    for (const line of fetchLines(steps, now)) console.log(line)
  } else {
    console.error('usage: claude-spend.mjs left <step> | lines <step> [<step>…]')
    process.exit(2)
  }
}
