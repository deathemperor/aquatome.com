import { aeSql, num } from './ae'
import { esc, fmt, rankTable, type Ranked } from './chart'
import { cellOf, failedNote, heading, note, rankBlock, table, textOf, type Block, type Cell, type RankRow, type Section } from './blocks'
import { pageLink } from './pages'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ } from './time'

/**
 * The iOS app's telemetry (worker/telemetry, dataset aquatome_app) for /_ab/ung-dung/: six bounded queries over 30 days
 * (the daily report's: one day), side by side. Our own copies (test builds) are left out unless asked for (?test=1, then only they). Counts go through
 * _sample_interval; launch time and memory percentiles are worked out here from the newest reports, weighted the same way.
 */
type N = number | string
export type ViewRow = { p: string; s: string; n: N }
export type ActionRow = { act: string; ver: string; n: N; ok: N }
export type ErrorRow = { act: string; why: string; n: N }
export type ShopRow = { shop: string; p: string; n: N }
export type HealthRow = { ver: string; reports: N; crashes: N; hangs: N; exits: N }
export type PerfRow = { ver: string; launch: N; mem: N; w: N }
export type AppRows = { views: ViewRow[]; actions: ActionRow[]; errors: ErrorRow[]; shops: ShopRow[]; health: HealthRow[]; perf: PerfRow[] }

const PERF_ROWS = 2000
export function appSql(test: boolean, days = 30): Record<keyof AppRows, string> {
  const where = (type: string) => `WHERE ${type} AND blob14 = '${test ? '1' : ''}' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY`
  return {
    views: `SELECT blob2 AS p, blob3 AS s, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'view'")} GROUP BY p, s ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    actions: `SELECT blob6 AS act, blob8 AS ver, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS ok FROM aquatome_app ${where("blob1 = 'action'")} GROUP BY act, ver ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    errors: `SELECT blob6 AS act, blob7 AS why, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'action' AND double1 = 0")} GROUP BY act, why ORDER BY n DESC LIMIT 30 FORMAT JSON`,
    shops: `SELECT blob4 AS shop, blob2 AS p, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'aff'")} GROUP BY shop, p ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    health: `SELECT blob8 AS ver, SUM(IF(blob1 = 'metric', _sample_interval, 0)) AS reports, SUM(_sample_interval * double3) AS crashes, SUM(_sample_interval * double4) AS hangs, SUM(_sample_interval * double8) AS exits FROM aquatome_app ${where("(blob1 = 'metric' OR blob1 = 'diagnostic')")} GROUP BY ver FORMAT JSON`,
    perf: `SELECT blob8 AS ver, double5 AS launch, double7 AS mem, _sample_interval AS w, timestamp AS t FROM aquatome_app ${where("blob1 = 'metric'")} ORDER BY t DESC LIMIT ${PERF_ROWS} FORMAT JSON`,
  }
}

type Pct = { p50: number; p90: number; n: number }
export type Version = { version: string; reports: number; crashes: number; hangs: number; exits: number; launch?: Pct; memory?: Pct }
export type AppStats = {
  test: boolean
  pages: { path: string; views: number }[]
  screens: { screen: string; views: number }[]
  actions: { name: string; version: string; n: number; ok: number }[]
  errors: { name: string; kind: string; n: number }[]
  shops: { shop: string; taps: number }[]
  shopPages: { path: string; taps: number }[]
  versions: Version[]
}

/** The weighted value at `q` of the values. */
function quantile(xs: { v: number; w: number }[], q: number): number {
  const sorted = [...xs].sort((a, b) => a.v - b.v)
  const total = sorted.reduce((s, x) => s + x.w, 0)
  let seen = 0
  for (const x of sorted) if ((seen += x.w) >= q * total) return x.v
  return sorted.at(-1)?.v ?? 0
}
const pct = (xs: { v: number; w: number }[]): Pct | undefined => (xs.length ? { p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), n: xs.length } : undefined)
const tally = <K extends string>(rows: { k: K; n: number }[]) => {
  const m = new Map<K, number>()
  for (const r of rows) m.set(r.k, (m.get(r.k) ?? 0) + r.n)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
/** Newest build first: "1.0 (115)" before "1.0 (114)". */
const build = (v: string) => Number(/\((\d+)\)$/.exec(v)?.[1] ?? -1)

export function summariseApp(r: AppRows, test: boolean): AppStats {
  const views = r.views.map(x => ({ p: x.p, s: x.s, n: num(x.n) }))
  const vers = new Map<string, Version>()
  const ver = (v: string) => vers.get(v) ?? vers.set(v, { version: v, reports: 0, crashes: 0, hangs: 0, exits: 0 }).get(v)!
  for (const h of r.health) Object.assign(ver(h.ver), { reports: num(h.reports), crashes: num(h.crashes), hangs: num(h.hangs), exits: num(h.exits) })
  const perf = new Map<string, PerfRow[]>()
  for (const p of r.perf) perf.set(p.ver, [...(perf.get(p.ver) ?? []), p])
  for (const [v, rows] of perf) {
    const of = (k: 'launch' | 'mem') => rows.filter(x => num(x[k]) > 0).map(x => ({ v: num(x[k]), w: num(x.w) || 1 }))
    Object.assign(ver(v), { launch: pct(of('launch')), memory: pct(of('mem')) })
  }
  return {
    test,
    pages: tally(views.filter(x => x.p).map(x => ({ k: x.p, n: x.n }))).slice(0, 20).map(([path, n]) => ({ path, views: n })),
    screens: tally(views.filter(x => x.s).map(x => ({ k: x.s, n: x.n }))).slice(0, 20).map(([screen, n]) => ({ screen, views: n })),
    actions: r.actions.map(a => ({ name: a.act, version: a.ver, n: num(a.n), ok: num(a.ok) }))
      .sort((a, b) => a.name.localeCompare(b.name) || build(b.version) - build(a.version)),
    errors: r.errors.map(e => ({ name: e.act, kind: e.why, n: num(e.n) })),
    shops: tally(r.shops.map(x => ({ k: x.shop, n: num(x.n) }))).map(([shop, n]) => ({ shop, taps: n })),
    shopPages: tally(r.shops.map(x => ({ k: x.p, n: num(x.n) }))).slice(0, 15).map(([path, n]) => ({ path, taps: n })),
    versions: [...vers.values()].sort((a, b) => build(b.version) - build(a.version) || b.version.localeCompare(a.version)),
  }
}

/** A dataset nothing has written to yet may not exist: that is no data, not a failure. */
const NO_TABLE = /unknown table|unknown dataset|does not exist|UNKNOWN_TABLE/i
export const orNoTable = <T>(rows: Promise<T[]>) => rows.catch((e: unknown) => { if (NO_TABLE.test(String(e))) return [] as T[]; throw e })
export async function queryApp(accountId: string, token: string, test: boolean, days = 30): Promise<AppStats> {
  const sql = appSql(test, days)
  const run = <T>(q: string) => orNoTable(aeSql<T>(accountId, token, q))
  const [views, actions, errors, shops, health, perf] = await Promise.all([
    run<ViewRow>(sql.views), run<ActionRow>(sql.actions), run<ErrorRow>(sql.errors), run<ShopRow>(sql.shops), run<HealthRow>(sql.health), run<PerfRow>(sql.perf),
  ])
  return summariseApp({ views, actions, errors, shops, health, perf }, test)
}

/** The app's sessions, readers' copies only, by the id each batch of events carries; reports (crashes, performance) have none. */
const SESSIONS_MAX = 10_000
export const APP_SESSIONS_SQL = (days: number) => `SELECT blob13 AS sid FROM aquatome_app WHERE blob13 != '' AND blob14 = '' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY GROUP BY sid LIMIT ${SESSIONS_MAX} FORMAT JSON`
export type AppDay = AppStats & { sessions: number }
/** The daily report's share: the last 24 hours. */
export async function queryAppDay(accountId: string, token: string): Promise<AppDay> {
  const [stats, sessions] = await Promise.all([queryApp(accountId, token, false, 1), orNoTable(aeSql<{ sid: string }>(accountId, token, APP_SESSIONS_SQL(1)))])
  return { ...stats, sessions: sessions.length }
}

// ——— The page ———

export const ACTION_NAME: Record<string, string> = {
  'light.connect': 'Connect a light', 'light.write': 'Write a light schedule', 'plug.switch': 'Switch a plug', fishid: 'Fish ID',
  'tank.add': 'Add a tank', 'post.comment': 'Post a comment', 'post.photo': 'Send a photo',
}
/** An action by its name in words, with its code under it; the page shows the code after it. */
const actionCell = (name: string): Cell => ({ text: ACTION_NAME[name] ?? name, sub: name })
const action = (name: string) => `${esc(ACTION_NAME[name] ?? name)} <code>${esc(name)}</code>`
const percent = (part: number, whole: number) => (whole ? `${fmt((100 * part) / whole, 1)}%` : '—')
const ms = (p?: Pct) => (p ? [`${fmt(p.p50)} ms`, `${fmt(p.p90)} ms`] : ['—', '—'])
const mb = (p?: Pct) => (p ? [`${fmt(p.p50)} MB`, `${fmt(p.p90)} MB`] : ['—', '—'])

const ACTIONS_HEAD = ['Action', 'Version', 'Times', 'Worked', 'Failed']
const VERSIONS_HEAD = ['Version', 'Daily reports', 'Crashes', 'Hangs', 'Abnormal exits', 'Launch p50', 'Launch p90', 'Peak memory p50', 'Peak memory p90']
const NO_REPORTS = 'No reports yet.'
/** Each row's cells as HTML, the page's and the app's alike. */
const actionCells = (a: AppStats['actions'][number]) => [action(a.name), esc(a.version), fmt(a.n), percent(a.ok, a.n), percent(a.n - a.ok, a.n)]
const versionCells = (v: Version) => [esc(v.version), fmt(v.reports), fmt(v.crashes), fmt(v.hangs), fmt(v.exits), ...ms(v.launch), ...mb(v.memory)]

function actionsTable(xs: AppStats['actions']): string {
  const rows = xs.map(actionCells).map(c => `<tr><th>${c[0]}</th><td class="l">${c[1]}</td>${c.slice(2).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr>${ACTIONS_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="5" class="none">None yet.</td></tr>'}</tbody></table></div>`
}

function versionsTable(xs: Version[]): string {
  const rows = xs.map(versionCells).map(c => `<tr><th>${c[0]}</th>${c.slice(1).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr>${VERSIONS_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="none">${NO_REPORTS}</td></tr>`}</tbody></table></div>`
}

const APP_LEDE = 'The last 30 days · anonymous events, and the crash and performance reports iOS collects (MetricKit), sent only while the <code>telemetry</code> flag in /app/&lt;lang&gt;.json is on and the user hasn’t turned it off. Tied to no account. Analytics Engine keeps about 3 months; the raw reports sit in the private bucket aquatome-uploads (diagnostics/), deleted after 30 days.'
/** Which builds the page counts, and the link to the others. */
const which = (test: boolean) => test
  ? { text: '<b>Showing the test builds</b> (debug, TestFlight).', href: '/_ab/ung-dung/', link: 'See the App Store build' }
  : { text: 'Test builds (debug, TestFlight) left out.', href: '/_ab/ung-dung/?test=1', link: 'See the test builds' }
const appEmpty = (test: boolean) => `Nothing yet: ${test ? 'no test build has sent events or reports.' : 'the app hasn’t sent events or reports (the telemetry flag is off, or nobody has opened a build with it).'}`
const APP_NOTE = `Crashes, hangs: the diagnostic reports iOS sends, one each time, counted for the version that had it. Abnormal exits: how often the open app was ended abnormally, as iOS counts in its daily report. Launch: time to the first frame (the median in each daily report); peak memory in MB. p50 and p90 over the newest ${fmt(PERF_ROWS)} daily reports.`
const PAGES_HEAD = ['Page', 'Views']
const SCREENS_HEAD = ['Screen', 'Views']
const ERRORS_HEAD = ['Action · why', 'Times']
const SHOPS_HEAD = ['Shop', 'Taps']
const SHOP_PAGES_HEAD = ['Page', 'Taps']
/** The page's rankings, built once for its HTML and its blocks. */
const appRanks = (s: AppStats) => ({
  pages: s.pages.map(x => ({ label: pageLink(x.path), value: x.views })) as Ranked[],
  screens: s.screens.map(x => ({ label: `<code>${esc(x.screen)}</code>`, value: x.views })) as Ranked[],
  errors: s.errors.map((e): RankRow => {
    const kind = e.kind || '(none given)'
    return { cell: { ...actionCell(e.name), sub: `${e.name} · ${kind}` }, label: `${action(e.name)} · <code>${esc(kind)}</code>`, value: e.n }
  }),
  shops: s.shops.map(x => ({ label: esc(x.shop), value: x.taps })) as Ranked[],
  shopPages: s.shopPages.map(x => ({ label: pageLink(x.path), value: x.taps })) as Ranked[],
})
export const isEmpty = (s: AppStats) => !s.pages.length && !s.screens.length && !s.actions.length && !s.shops.length && !s.versions.length

export function appPage(now: Date, test: boolean, s: Soft<AppStats>, tz = HOME_TZ): string {
  const w = which(test)
  let body = `<h1>iPhone app</h1><p class="lede">${APP_LEDE}</p><p>${w.text} <a href="${w.href}">${w.link}</a></p>`
  if (isFailed(s)) body += failedBox('the app’s figures (Analytics Engine)', s)
  else {
    if (isEmpty(s)) body += `<p class="muted">${appEmpty(test)}</p>`
    const r = appRanks(s)
    body += `<h2>Views</h2><div class="split"><section><h3 class="sub-h">Handbook pages</h3>${rankTable(r.pages, PAGES_HEAD)}</section>
<section><h3 class="sub-h">The app’s screens</h3>${rankTable(r.screens, SCREENS_HEAD)}</section></div>
<h2>Actions</h2>${actionsTable(s.actions)}
<h3 class="sub-h">Common failures</h3>${rankTable(r.errors, ERRORS_HEAD)}
<h2>Taps to shops</h2><div class="split"><section><h3 class="sub-h">By shop</h3>${rankTable(r.shops, SHOPS_HEAD)}</section>
<section><h3 class="sub-h">By page</h3>${rankTable(r.shopPages, SHOP_PAGES_HEAD)}</section></div>
<h2>Stability and speed by version</h2>${versionsTable(s.versions)}
<p class="note">${APP_NOTE}</p>`
  }
  return page('/_ab/ung-dung/', 'iPhone app', body, now, tz)
}

export function appSection(test: boolean, s: Soft<AppStats>): Section {
  // The page's link to the other builds, as a switch: on, only our test builds.
  const builds: Block = { kind: 'switch', label: 'Test builds only (debug, TestFlight)', on: test, href: `/api/owner/sections/ung-dung${test ? '' : '?test=1'}` }
  const blocks: Block[] = [note(textOf(APP_LEDE)), builds]
  if (isFailed(s)) blocks.push(failedNote('the app’s figures (Analytics Engine)', s))
  else {
    if (isEmpty(s)) blocks.push(note(appEmpty(test), 'muted'))
    const r = appRanks(s)
    blocks.push(
      heading('Views'), heading('Handbook pages', 3), rankBlock(r.pages, PAGES_HEAD), heading('The app’s screens', 3), rankBlock(r.screens, SCREENS_HEAD),
      heading('Actions'), table(ACTIONS_HEAD, s.actions.map(a => [actionCell(a.name), ...actionCells(a).slice(1).map(c => cellOf(c))]), { empty: 'None yet.' }),
      heading('Common failures', 3), rankBlock(r.errors, ERRORS_HEAD),
      heading('Taps to shops'), heading('By shop', 3), rankBlock(r.shops, SHOPS_HEAD), heading('By page', 3), rankBlock(r.shopPages, SHOP_PAGES_HEAD),
      heading('Stability and speed by version'), table(VERSIONS_HEAD, s.versions.map(v => versionCells(v).map(c => cellOf(c))), { empty: NO_REPORTS }), note(APP_NOTE),
    )
  }
  return { title: 'iPhone app', blocks }
}
