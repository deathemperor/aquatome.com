import { lastDays, weekdayOf } from './chart'
import { aeSql, num } from './ae'
import { dayStart, localDay } from './time'

/**
 * The fish-ID log (worker/fishid/log.ts, dataset aquatome_fishid) for the dashboard: three bounded queries, run side by
 * side. Days are the viewer's (admin/time.ts): the query buckets them in that zone. Counts and sums go through
 * _sample_interval. Aliases stay clear of SQL words (day, key, from), and IF() branches are one type.
 */
type N = number | string
export type DayRow = { d: string; outcome: string; n: N; called: N; tin: N; tout: N; usd: N; guessed: N; linked: N }
export type UnmatchedRow = { sci: string; n: N; conf: N }
export type CallRow = { t: string; outcome: string; model: string; kh: string; verdict: string; sci: string; page: string; lang: string; src: string; cc: string; tin: N; tout: N; usd: N; ms: N; attempts: N; conf: N; guesses: N; turns?: N; tools?: N; refs?: N; stopped?: string; rechecked?: N }

const BY_DAY = (tz: string) => `SELECT formatDateTime(timestamp, '%Y-%m-%d', '${tz}') AS d, blob1 AS outcome, SUM(_sample_interval) AS n,
  SUM(IF(double5 > 0, _sample_interval, 0)) AS called, SUM(_sample_interval * double1) AS tin, SUM(_sample_interval * double2) AS tout,
  SUM(_sample_interval * double3) AS usd, SUM(IF(double7 > 0, _sample_interval, 0)) AS guessed, SUM(IF(blob6 != '', _sample_interval, 0)) AS linked
FROM aquatome_fishid`
/** Per day (in `tz`, a zone validZone passed) and outcome, 62 days back: enough for 30 days and the 30 before, and this month against the last. */
export const DAYS_SQL = (tz: string) => `${BY_DAY(tz)} WHERE timestamp > NOW() - INTERVAL '62' DAY GROUP BY d, outcome FORMAT JSON`
/** AE's time literal for an ISO moment (UTC). */
const at = (iso: string) => `toDateTime('${iso.slice(0, 19).replace('T', ' ')}')`
/** A window [from, to) as SQL, `to` open when absent. */
const within = (w: { from: string; to?: string }) => `timestamp >= ${at(w.from)}${w.to ? ` AND timestamp < ${at(w.to)}` : ''}`
/**
 * The cut days, as DAYS_SQL's rows: each from its midnight to the time of day it is now (yesterday, the same day last week
 * and last month), so a period so far is set against the same point of the one before.
 */
export const EARLY_SQL = (tz: string, windows: { from: string; to: string }[]) => `${BY_DAY(tz)} WHERE ${windows.map(w => `(${within(w)})`).join(' OR ')} GROUP BY d, outcome FORMAT JSON`
/** Answers whose top guess has no page, in a period: one row a name (a few hundred at most at 300 calls a day), sorted here. */
export const UNMATCHED_SQL = (w: { from: string; to?: string }) => `SELECT blob5 AS sci, SUM(_sample_interval) AS n, SUM(_sample_interval * double6) AS conf
FROM aquatome_fishid WHERE blob1 = 'ok' AND blob5 != '' AND blob6 = '' AND ${within(w)} GROUP BY sci FORMAT JSON`
/** A period's requests, newest first, at most RECENT_MAX: the section pages them 50 at a time. */
export const RECENT_MAX = 1000
export const RECENT_SQL = (w: { from: string; to?: string }) => `SELECT timestamp AS t, blob1 AS outcome, blob2 AS model, blob3 AS kh, blob4 AS verdict, blob5 AS sci, blob6 AS page, blob7 AS lang,
  blob8 AS src, blob9 AS cc, double1 AS tin, double2 AS tout, double3 AS usd, double4 AS ms, double5 AS attempts, double6 AS conf, double7 AS guesses,
  double8 AS turns, double9 AS tools, double10 AS refs, blob10 AS stopped, double11 AS rechecked
FROM aquatome_fishid WHERE ${within(w)} ORDER BY t DESC LIMIT ${RECENT_MAX} FORMAT JSON`

/**
 * requests: every POST. calls: those that reached Claude; ok: those with an answer, the rest of calls had none (Claude
 * declined, an answer that couldn't be read, the API failing). blocked: refused before any call (limits, Turnstile…).
 * guessed / linked: answers with a guess, and those whose top guess has a page.
 */
export type Totals = { requests: number; calls: number; ok: number; none: number; blocked: number; tin: number; tout: number; usd: number; guessed: number; linked: number }
/** turns, tools, refs, stopped, rechecked: the agent's calls to Claude, tool calls, reference photos, why it stopped and whether its first answer was sent back (fishid/log.ts); 0, '' and false before it. */
export type Call = { t: string; outcome: string; model: string; key: string; verdict: string; sci: string; page: string; lang: string; from: string; country: string; tin: number; tout: number; usd: number; ms: number; attempts: number; conf: number; guesses: number; turns: number; tools: number; refs: number; stopped: string; rechecked: boolean }
export type FishIdStats = {
  /** The chart days: 30, ending today (today not over yet). */
  days: string[]
  perDay: { ok: number[]; none: number[]; blocked: number[]; usd: number[]; tin: number[]; tout: number[] }
  /** last30: the chart's 30 days. Today against yesterday (as context: today isn't over); 7 and 30 whole days to yesterday against the ones before; this month to now against the same days of the last. */
  periods: { today: Totals; yesterday: Totals; last30: Totals; d7: Totals; d7prev: Totals; d30: Totals; d30prev: Totals; mtd: Totals; mtdPrev: Totals }
  unmatched: { sci: string; n: number; conf: number }[]
  recent: Call[]
  /** Every day the query read (62), by day: what a period sums. */
  byDay: Map<string, Totals>
  /** The cut days (EARLY_SQL), by day: from midnight to the time of day it is now. Empty where they weren't read. */
  early: Map<string, Totals>
}

/**
 * The section's periods, this week first (docs/design/dashboard.md): this week and today so far, the 7 and 30 whole days to
 * yesterday, and this month so far, each against the same point of the one before.
 */
export const FISH_PERIOD_KEYS = ['week', 'today', 'd7', 'd30', 'month'] as const
export type FishPeriodKey = (typeof FISH_PERIOD_KEYS)[number]
/**
 * A period in `tz`: its days (whole, but today's so far); its chart's days, a week or a month running past today
 * (`today`: today's place); the moments its calls are read between; and the one before: its whole days, then the day
 * counted up to the time of day it is now (`cut`).
 */
export type FishSpan = { key: FishPeriodKey; label: string; heading: string; vs: string; days: string[]; chart: string[]; today?: number; from: string; to?: string; before: { days: string[]; cut?: string } }

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const plus = (day: string, n: number) => iso(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
/** The days from `a` to `b`, both in. */
const run = (a: string, b: string) => {
  const out: string[] = []
  for (let d = a; d <= b; d = plus(d, 1)) out.push(d)
  return out
}
const monthDays = (first: string) => new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).getUTCDate()
export const monthName = (now: Date, tz: string) => MONTH[+localDay(now, tz).slice(5, 7) - 1]!

export function fishSpan(key: FishPeriodKey, now: Date, tz: string): FishSpan {
  const today = localDay(now, tz)
  const monday = plus(today, -((weekdayOf(today) + 6) % 7))
  const week = run(monday, plus(monday, 6))
  const so = (days: string[], chart: string[]) => ({ days, chart, today: chart.indexOf(today), from: dayStart(days[0]!, tz) })
  const whole = (n: number) => ({ days: run(plus(today, -n), plus(today, -1)), chart: run(plus(today, -n), plus(today, -1)), from: dayStart(plus(today, -n), tz), to: dayStart(today, tz) })
  switch (key) {
    case 'week': return { key, label: 'This week', heading: 'This week so far', vs: 'last week', ...so(run(monday, today), week), before: { days: run(plus(monday, -7), plus(today, -8)), cut: plus(today, -7) } }
    case 'today': return { key, label: 'Today', heading: 'Today so far', vs: 'yesterday', ...so([today], week), before: { days: [], cut: plus(today, -1) } }
    case 'd7': return { key, label: '7 days', heading: '7 days to yesterday', vs: 'the 7 days before', ...whole(7), before: { days: run(plus(today, -14), plus(today, -8)) } }
    case 'd30': return { key, label: '30 days', heading: '30 days to yesterday', vs: 'the 30 days before', ...whole(30), before: { days: run(plus(today, -60), plus(today, -31)) } }
    case 'month': {
      const first = `${today.slice(0, 8)}01`
      const last = plus(first, -1)
      const lastFirst = `${last.slice(0, 8)}01`
      const dom = +today.slice(8, 10)
      // Last month to the same day and time; the whole of it when it had no such day (the 31st against a 30-day month).
      const before = dom <= monthDays(lastFirst) ? { days: run(lastFirst, plus(lastFirst, dom - 2)), cut: plus(lastFirst, dom - 1) } : { days: run(lastFirst, last) }
      const name = monthName(now, tz)
      return { key, label: name, heading: `${name} so far`, vs: 'last month', ...so(run(first, today), run(first, plus(first, monthDays(first) - 1))), before }
    }
  }
}
/** The windows EARLY_SQL reads for the section's periods: each cut day from its midnight to the time of day it is now. */
export function cutWindows(now: Date, tz: string): { from: string; to: string }[] {
  const into = now.getTime() - Date.parse(dayStart(localDay(now, tz), tz))
  const days = [...new Set(FISH_PERIOD_KEYS.map(k => fishSpan(k, now, tz).before.cut).filter((d): d is string => Boolean(d)))]
  return days.map(d => ({ from: dayStart(d, tz), to: new Date(Date.parse(dayStart(d, tz)) + into).toISOString() }))
}
/** A period's totals and the one before's, to the same point. */
export function periodTotals(s: Pick<FishIdStats, 'byDay' | 'early'>, span: FishSpan): { now: Totals; before: Totals } {
  const sum = (days: string[], extra?: Totals) => {
    const t = zero()
    for (const x of [...days.map(d => s.byDay.get(d)), extra]) if (x) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += x[k]
    return t
  }
  return { now: sum(span.days), before: sum(span.before.days, span.before.cut ? s.early.get(span.before.cut) : undefined) }
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

const totalsByDay = (rows: DayRow[]) => {
  const byDay = new Map<string, Totals>()
  for (const r of rows) {
    const t = byDay.get(r.d) ?? zero()
    add(t, r)
    byDay.set(r.d, t)
  }
  return byDay
}

/** `rows`' days are `tz`'s, and so are today, the weeks and the month. `early`: the cut days (EARLY_SQL). */
export function summariseFishId(rows: DayRow[], unmatched: UnmatchedRow[], recent: CallRow[], now: Date, tz = 'UTC', early: DayRow[] = []): FishIdStats {
  const byDay = totalsByDay(rows)
  const sum = (days: string[]) => days.reduce((acc, d) => {
    const t = byDay.get(d)
    if (t) for (const k of Object.keys(acc) as (keyof Totals)[]) acc[k] += t[k]
    return acc
  }, zero())
  const back = lastDays(now, 61, tz) // back[60] is today
  const span = (from: number, to: number) => back.slice(60 - from, 61 - to) // days ago, `from` ≥ `to`
  const [y, m, dom] = back[60]!.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)) as [number, number, number]
  const prevMonthDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mtdPrev = Array.from({ length: Math.min(dom, prevMonthDays) }, (_, i) => iso(Date.UTC(y, m - 1, i + 1)))

  const days = lastDays(now, 30, tz)
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
      turns: num(r.turns ?? 0), tools: num(r.tools ?? 0), refs: num(r.refs ?? 0), stopped: r.stopped ?? '', rechecked: num(r.rechecked ?? 0) > 0,
    })),
    byDay,
    early: totalsByDay(early),
  }
}

/** The section's figures for `period`: the days, the cut days, and the period's guesses without a page and its requests. */
export async function queryFishId(accountId: string, token: string, now: Date, tz: string, period: FishPeriodKey): Promise<FishIdStats> {
  const span = fishSpan(period, now, tz)
  const [rows, early, unmatched, recent] = await Promise.all([
    aeSql<DayRow>(accountId, token, DAYS_SQL(tz)),
    aeSql<DayRow>(accountId, token, EARLY_SQL(tz, cutWindows(now, tz))),
    aeSql<UnmatchedRow>(accountId, token, UNMATCHED_SQL(span)),
    aeSql<CallRow>(accountId, token, RECENT_SQL(span)),
  ])
  return summariseFishId(rows, unmatched, recent, now, tz, early)
}
/** The overview's share: the per-day query only. */
export async function queryFishIdDays(accountId: string, token: string, now: Date, tz = 'UTC'): Promise<FishIdStats> {
  return summariseFishId(await aeSql<DayRow>(accountId, token, DAYS_SQL(tz)), [], [], now, tz)
}
