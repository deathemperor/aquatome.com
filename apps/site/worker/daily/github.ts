/**
 * What daily-report.yml (scripts/daily-report.mjs) sends: the last 24 hours of the repository. Read strictly: a body of
 * any other shape, a list over its bound or a link that isn't this repository's is refused whole, so every link the
 * report takes from it is GitHub's. `total`: how many there were, `items` the first of them.
 */
export const REPO_URL = 'https://github.com/deathemperor/aquatome.com/'
const MAX_LIST = 50
const MAX_TITLE = 200

export type Item = { number: number; title: string; url: string }
export type Listed = { total: number; items: Item[] }
/** Runs on main that ran (none cancelled or skipped), and those that failed. */
export type Runs = { runs: number; failed: number }
/** A workflow whose last runs on main failed with no success after them: its newest failure's link, when the first was. */
export type Failing = { workflow: string; url: string; since: string; failures: number }
export type GitHubSide = {
  runId: string
  runUrl: string
  since: string
  /** What GitHub wouldn't give: the counts it feeds may be low. */
  missing: string[]
  merged: Listed
  /** `live`: the newest deploy.yml run that succeeded. */
  deploys: Runs & { live?: { sha: string; url: string; at: string } }
  /** The engine's cycles (engine.yml; the Mac's parts report only when they fail), and its `content:` commits on main by part. */
  engine: Runs
  commits: { total: number; parts: { name: string; n: number }[] }
  ios: Runs
  testflight: { uploads: { build: number; url: string; at: string }[]; failed: number }
  appStore: Runs
  watch: Runs
  failing: Failing[]
  /** Open problem issues the workflows opened; `notes`: the AI review's open notes (label page-review), which aren't failures. */
  issues: Listed
  notes: number
  prs: { ready: Listed; draft: Listed }
}

class Refused extends Error {}
const refuse = (): never => { throw new Refused() }
const record = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : refuse())
const count = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 10_000_000 ? (x as number) : refuse())
const text = (x: unknown, max = MAX_TITLE) => (typeof x === 'string' && x.length <= max ? x.replace(/\p{Cc}/gu, ' ') : refuse())
const link = (x: unknown) => (typeof x === 'string' && x.length <= 300 && x.startsWith(REPO_URL) && !/[\s"'<>]/.test(x) ? x : refuse())
const moment = (x: unknown) => (typeof x === 'string' && x.length <= 40 && Number.isFinite(Date.parse(x)) ? x : refuse())
const list = <T>(x: unknown, each: (y: unknown) => T): T[] => (Array.isArray(x) && x.length <= MAX_LIST ? x.map(each) : refuse())
const item = (x: unknown): Item => {
  const r = record(x)
  return { number: count(r.number), title: text(r.title), url: link(r.url) }
}
const listed = (x: unknown): Listed => {
  const r = record(x)
  return { total: count(r.total), items: list(r.items, item) }
}
const runs = (x: unknown): Runs => {
  const r = record(x)
  return { runs: count(r.runs), failed: count(r.failed) }
}

/** The body as sent, or null for one to refuse. `runId` is the run's id: it keys the report (daily/log.ts). */
export function parseGitHubSide(body: string): GitHubSide | null {
  try {
    const r = record(JSON.parse(body))
    const runId = typeof r.runId === 'string' && /^\d{1,20}$/.test(r.runId) ? r.runId : refuse()
    const deploys = record(r.deploys)
    const live = deploys.live === undefined ? undefined : record(deploys.live)
    const commits = record(r.commits)
    const testflight = record(r.testflight)
    const prs = record(r.prs)
    return {
      runId, runUrl: link(r.runUrl), since: moment(r.since),
      missing: list(r.missing, y => text(y)),
      merged: listed(r.merged),
      deploys: { ...runs(deploys), ...(live ? { live: { sha: text(live.sha, 40), url: link(live.url), at: moment(live.at) } } : {}) },
      engine: runs(r.engine),
      commits: {
        total: count(commits.total),
        parts: list(commits.parts, y => {
          const p = record(y)
          return { name: text(p.name, 60), n: count(p.n) }
        }),
      },
      ios: runs(r.ios),
      testflight: {
        uploads: list(testflight.uploads, y => {
          const u = record(y)
          return { build: count(u.build), url: link(u.url), at: moment(u.at) }
        }),
        failed: count(testflight.failed),
      },
      appStore: runs(r.appStore),
      watch: runs(r.watch),
      failing: list(r.failing, y => {
        const f = record(y)
        return { workflow: text(f.workflow), url: link(f.url), since: moment(f.since), failures: count(f.failures) }
      }),
      issues: listed(r.issues),
      notes: count(r.notes),
      prs: { ready: listed(prs.ready), draft: listed(prs.draft) },
    }
  } catch {
    return null
  }
}
