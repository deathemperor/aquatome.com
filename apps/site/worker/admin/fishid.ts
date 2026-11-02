import { lastDays } from './chart'
import { aeSql, num } from './ae'

/**
 * The fish-ID log (worker/fishid/log.ts, dataset aquatome_fishid) for the dashboard: three bounded queries, run side by
 * side. Days are UTC, as the key table's KV day and the affiliate clicks are. Counts and sums go through
 * _sample_interval. Aliases stay clear of SQL words (day, key, from), and IF() branches are one type.
 */
type N = number | string
export type DayRow = { d: string; outcome: string; n: N; called: N; tin: N; tout: N; usd: N; guessed: N; linked: N }
export type UnmatchedRow = { sci: string; n: N; conf: N }
export type CallRow = { t: string; outcome: string; model: string; kh: string; verdict: string; sci: string; page: string; lang: string; src: string; cc: string; tin: N; tout: N; usd: N; ms: N; attempts: N; conf: N; guesses: N }

/** Per day and outcome, 62 days back: enough for 30 days and the 30 before, and this month against the last. */
export const DAYS_SQL = `SELECT formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS d, blob1 AS outcome, SUM(_sample_interval) AS n,
  SUM(IF(double5 > 0, _sample_interval, 0)) AS called, SUM(_sample_interval * double1) AS tin, SUM(_sample_interval * double2) AS tout,
  SUM(_sample_interval * double3) AS usd, SUM(IF(double7 > 0, _sample_interval, 0)) AS guessed, SUM(IF(blob6 != '', _sample_interval, 0)) AS linked
FROM aquatome_fishid WHERE timestamp > NOW() - INTERVAL '62' DAY GROUP BY d, outcome FORMAT JSON`
/** Answers whose top guess has no page, 30 days: one row a name (a few hundred at most at 300 calls a day), sorted here. */
export const UNMATCHED_SQL = `SELECT blob5 AS sci, SUM(_sample_interval) AS n, SUM(_sample_interval * double6) AS conf
FROM aquatome_fishid WHERE blob1 = 'ok' AND blob5 != '' AND blob6 = '' AND timestamp > NOW() - INTERVAL '30' DAY GROUP BY sci FORMAT JSON`
export const RECENT_SQL = `SELECT timestamp AS t, blob1 AS outcome, blob2 AS model, blob3 AS kh, blob4 AS verdict, blob5 AS sci, blob6 AS page, blob7 AS lang,
  blob8 AS src, blob9 AS cc, double1 AS tin, double2 AS tout, double3 AS usd, double4 AS ms, double5 AS attempts, double6 AS conf, double7 AS guesses
FROM aquatome_fishid WHERE timestamp > NOW() - INTERVAL '31' DAY ORDER BY timestamp DESC LIMIT 100 FORMAT JSON`

/**
 * requests: every POST. calls: those that reached Claude; ok: those with an answer, the rest of calls had none (Claude
 * declined, an answer that couldn't be read, the API failing). blocked: refused before any call (limits, Turnstile…).
 * guessed / linked: answers with a guess, and those whose top guess has a page.
 */
export type Totals = { requests: number; calls: number; ok: number; none: number; blocked: number; tin: number; tout: number; usd: number; guessed: number; linked: number }
export type Call = { t: string; outcome: string; model: string; key: string; verdict: string; sci: string; page: string; lang: string; from: string; country: string; tin: number; tout: number; usd: number; ms: number; attempts: number; conf: number; guesses: number }
export type FishIdStats = {
  /** The chart days: 30, ending today (today not over yet). */
  days: string[]
  perDay: { ok: number[]; none: number[]; blocked: number[]; usd: number[]; tin: number[]; tout: number[] }
  /** last30: the chart's 30 days. Today against yesterday (as context: today isn't over); 7 and 30 whole days to yesterday against the ones before; this month to now against the same days of the last. */
  periods: { today: Totals; yesterday: Totals; last30: Totals; d7: Totals; d7prev: Totals; d30: Totals; d30prev: Totals; mtd: Totals; mtdPrev: Totals }
  unmatched: { sci: string; n: number; conf: number }[]
  recent: Call[]
}

const zero = (): Totals => ({ requests: 0, calls: 0, ok: 0, none: 0, blocked: 0, tin: 0, tout: 0, usd: 0, guessed: 0, linked: 0 })
function add(t: Totals, r: DayRow): void {
  const n = num(r.n)
  const called = num(r.called)
  t.requests += n
  t.calls += called
  t.blocked += n - called
  if (r.outcome === 'ok') {
    t.ok += called
    t.guessed += num(r.guessed)
    t.linked += num(r.linked)
  } else t.none += called
  t.tin += num(r.tin)
  t.tout += num(r.tout)
  t.usd += num(r.usd)
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function summariseFishId(rows: DayRow[], unmatched: UnmatchedRow[], recent: CallRow[], now: Date): FishIdStats {
  const byDay = new Map<string, Totals>()
  for (const r of rows) {
    const t = byDay.get(r.d) ?? zero()
    add(t, r)
    byDay.set(r.d, t)
  }
  const sum = (days: string[]) => days.reduce((acc, d) => {
    const t = byDay.get(d)
    if (t) for (const k of Object.keys(acc) as (keyof Totals)[]) acc[k] += t[k]
    return acc
  }, zero())
  const back = lastDays(now, 61) // back[60] is today
  const span = (from: number, to: number) => back.slice(60 - from, 61 - to) // days ago, `from` ≥ `to`
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const dom = now.getUTCDate()
  const prevMonthDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mtdPrev = Array.from({ length: Math.min(dom, prevMonthDays) }, (_, i) => iso(Date.UTC(y, m - 1, i + 1)))

  const days = lastDays(now, 30)
  const per = days.map(d => byDay.get(d) ?? zero())
  return {
    days,
    perDay: { ok: per.map(t => t.ok), none: per.map(t => t.none), blocked: per.map(t => t.blocked), usd: per.map(t => t.usd), tin: per.map(t => t.tin), tout: per.map(t => t.tout) },
    periods: {
      today: sum(span(0, 0)), yesterday: sum(span(1, 1)), last30: sum(span(29, 0)),
      d7: sum(span(7, 1)), d7prev: sum(span(14, 8)),
      d30: sum(span(30, 1)), d30prev: sum(span(60, 31)),
      mtd: sum(span(dom - 1, 0)), mtdPrev: sum(mtdPrev),
    },
    unmatched: unmatched.map(u => ({ sci: u.sci, n: num(u.n), conf: num(u.n) ? num(u.conf) / num(u.n) : 0 }))
      .sort((a, b) => b.n - a.n || a.sci.localeCompare(b.sci)).slice(0, 20),
    recent: recent.map(r => ({
      t: r.t, outcome: r.outcome, model: r.model, key: r.kh, verdict: r.verdict, sci: r.sci, page: r.page, lang: r.lang, from: r.src, country: r.cc,
      tin: num(r.tin), tout: num(r.tout), usd: num(r.usd), ms: num(r.ms), attempts: num(r.attempts), conf: num(r.conf), guesses: num(r.guesses),
    })),
  }
}

export async function queryFishId(accountId: string, token: string, now: Date): Promise<FishIdStats> {
  const [rows, unmatched, recent] = await Promise.all([
    aeSql<DayRow>(accountId, token, DAYS_SQL),
    aeSql<UnmatchedRow>(accountId, token, UNMATCHED_SQL),
    aeSql<CallRow>(accountId, token, RECENT_SQL),
  ])
  return summariseFishId(rows, unmatched, recent, now)
}
/** The overview's share: the per-day query only. */
export async function queryFishIdDays(accountId: string, token: string, now: Date): Promise<FishIdStats> {
  return summariseFishId(await aeSql<DayRow>(accountId, token, DAYS_SQL), [], [], now)
}
