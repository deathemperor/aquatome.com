import { LANG, LANGS, type Lang } from '@aq/schema/langs'
import { isReader, isSearch } from '../readers'
import { aeSql, COUNTED, EVENTS, num, READERS_FROM } from './ae'
import { orNoTable } from './app'
import { chart, failedNote, figures, heading, note, rankBlock, table, textOf, type Block, type Cell, type Section } from './blocks'
import { chipHtml, chipOf, dayChart, dayLabel, esc, fmt, rankTable, spark, tiles, type DayChart, type Tile } from './chart'
import { langOfPath, pagePathOf, type ContentStats, type Snapshot } from './content'
import { dashboardUrl } from '../paths'
import { failedBox, isFailed, page, SCOREBOARD_PATH, type Failed, type Soft } from './shell'
import { dayStart, HOME_TZ, localDay, msOf } from './time'

/**
 * The scoreboard, /_ab/thanh-cong/ and /_ab/thanh-cong.json: what "the product is working" means, week by week, as
 * docs/metrics.md defines it. Weeks run Monday to Sunday in Vietnam's time (HOME_TZ), whoever is looking, so the page, the
 * JSON and the daily report say the same number. Everything here is read from data the site already keeps.
 */

export const WEEKS = 12
const DAY = 86_400_000
export const DOC = 'https://github.com/deathemperor/aquatome.com/blob/main/docs/metrics.md'

// ——— Weeks ———

/** The Monday of the week `day` (2026-11-04) falls in. */
export function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`)
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)
}
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** The `n` weeks ending with the one it is at `now`: their Mondays, oldest first. */
export const weeksTo = (now: Date, n = WEEKS) => {
  const monday = mondayOf(localDay(now, HOME_TZ))
  return Array.from({ length: n }, (_, i) => plusDays(monday, (i - n + 1) * 7))
}
/** The moment the scoreboard's first week begins. */
export const windowStart = (now: Date) => dayStart(weeksTo(now)[0]!, HOME_TZ)

type Weekly = Pick<Metric, 'weeks' | 'lastSoFar'>
const nothing = (): Weekly => ({ weeks: Array<null>(WEEKS).fill(null), lastSoFar: null })

/**
 * A count or rate by week, from the things it counts, each with its moment. `lastSoFar`: last week's value at this same
 * point of the week, so a Tuesday isn't compared with a whole week. `since`: a week ending by then wasn't measured (null).
 */
function flow<T>(now: Date, items: T[], at: (x: T) => number, value: (xs: T[]) => number | null, since = 0): Weekly {
  const mondays = weeksTo(now)
  const bins = mondays.map(() => [] as T[])
  for (const x of items) {
    const i = mondays.indexOf(mondayOf(localDay(at(x), HOME_TZ)))
    if (i >= 0) bins[i]!.push(x)
  }
  const ended = (i: number) => Date.parse(dayStart(plusDays(mondays[i]!, 7), HOME_TZ)) <= since
  const prev = bins.length - 2
  const sameMoment = now.getTime() - 7 * DAY
  return {
    weeks: bins.map((xs, i) => (ended(i) ? null : value(xs))),
    lastSoFar: ended(prev) ? null : value(bins[prev]!.filter(x => at(x) < sameMoment)),
  }
}

/** A level at the end of each week, from dated readings: a week's last one, today's `current` for this week, null where there's none. */
function level(now: Date, points: { day: string; value: number | null | undefined }[], current?: number | null): Weekly {
  const mondays = weeksTo(now)
  const weeks = mondays.map(m => {
    const read = points.filter(p => mondayOf(p.day) === m && typeof p.value === 'number').sort((a, b) => a.day.localeCompare(b.day)).at(-1)
    return read ? read.value! : null
  })
  if (typeof current === 'number') weeks[WEEKS - 1] = current
  return { weeks, lastSoFar: null }
}

// ——— The readers' beacon ———

/** A session's rows: one per kind of event, page, referrer and country, with the kind's highest value and how many. */
export type BeaconRow = { sid: string; t: string; p: string; ref: string; cc: string; first: string; v: number | string; n: number | string }
export const BEACON_SQL = (from: string) => `SELECT blob4 AS sid, blob2 AS t, blob3 AS p, blob5 AS ref, blob6 AS cc, min(timestamp) AS first, max(double1) AS v, SUM(_sample_interval) AS n
FROM ${EVENTS} WHERE blob2 IN ('view', 'time', 'scroll', 'aff') AND timestamp >= toDateTime('${from.slice(0, 19).replace('T', ' ')}') AND ${COUNTED} GROUP BY sid, t, p, ref, cc FORMAT JSON`
export const queryBeacon = (accountId: string, token: string, from: string) => aeSql<BeaconRow>(accountId, token, BEACON_SQL(from))

/** Each language's tool pages, under its word for /cong-cu/ (a test holds them to src/lib/i18n.ts). The list itself is not a tool. */
export const TOOLS: Record<Lang, string> = { vi: '/cong-cu/', id: '/id/alat/', th: '/th/tools/' }
const isTool = (path: string) => path.length > TOOLS[langOfPath(path)].length && path.startsWith(TOOLS[langOfPath(path)])

/** A session as the scoreboard reads it: where it landed, from where, and what it did. */
export type Visit = { at: number; land: string; ref: string; cc: string; pages: number; t: number; scroll: number; landT: number; landScroll: number; shop: number; tool: boolean }

/** The beacon's rows as sessions, by each one's first view; a session with no view of its own (it began before the count) is left out. */
export function visitsOf(rows: BeaconRow[]): Visit[] {
  const bySid = new Map<string, BeaconRow[]>()
  for (const r of rows) bySid.set(r.sid, [...(bySid.get(r.sid) ?? []), r])
  const out: Visit[] = []
  for (const xs of bySid.values()) {
    const views = xs.filter(r => r.t === 'view').sort((a, b) => msOf(a.first) - msOf(b.first))
    const first = views[0]
    if (!first) continue
    const land = pagePathOf(first.p)
    const highest = (t: string, only?: string) => Math.max(0, ...xs.filter(r => r.t === t && (!only || pagePathOf(r.p) === only)).map(r => num(r.v)))
    const paths = new Set(views.map(r => pagePathOf(r.p)))
    out.push({
      at: msOf(first.first), land, ref: first.ref, cc: first.cc, pages: paths.size,
      t: highest('time'), scroll: highest('scroll'), landT: highest('time', land), landScroll: highest('scroll', land),
      shop: xs.filter(r => r.t === 'aff').reduce((n, r) => n + num(r.n), 0), tool: [...paths].some(isTool),
    })
  }
  return out
}

const readers = (xs: Visit[]) => xs.filter(isReader)
/** The north star: came from a search engine and stayed, by the readers' own rule, on the page it landed on. */
export const isAnswered = (v: Visit) => isSearch(v.ref) && isReader({ t: v.landT, scroll: v.landScroll })
const tookStep = (v: Visit) => v.shop > 0 || v.tool || v.pages > 1
const share = (part: number, whole: number) => (whole ? (100 * part) / whole : null)
const shareOf = (xs: Visit[], test: (v: Visit) => boolean) => share(xs.filter(test).length, xs.length)
const shopClicks = (xs: Visit[]) => xs.reduce((n, v) => n + v.shop, 0)

const countries = (xs: Visit[], n = 10) => {
  const m = new Map<string, number>()
  for (const v of readers(xs)) m.set(v.cc || '??', (m.get(v.cc || '??') ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([cc, readers]) => ({ cc, readers }))
}

type Counts = { answered: number; readers: number; sessions: number; shop: number }
const counts = (xs: Visit[]): Counts => ({ answered: xs.filter(isAnswered).length, readers: readers(xs).length, sessions: xs.length, shop: shopClicks(xs) })
/** This week by day, Monday to Sunday in Vietnam, with `today` its place (the days after it null): the overview's chart. */
export type WeekByDay = { days: string[]; today: number; answered: (number | null)[]; readers: (number | null)[]; shop: (number | null)[]; now: Counts; lastSoFar: Counts | null }
/**
 * The scoreboard's this week and same point last week (flow), and this week's days, from the beacon's rows since last
 * week's Monday: the overview's "Found an answer" says what the scoreboard says. Days before the readers were counted are null.
 */
export function weekByDay(now: Date, rows: BeaconRow[]): WeekByDay {
  const visits = visitsOf(rows)
  const monday = mondayOf(localDay(now, HOME_TZ))
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i))
  const today = days.indexOf(localDay(now, HOME_TZ))
  const since = Date.parse(READERS_FROM)
  const per = days.map((d, i) => (i > today || Date.parse(dayStart(plusDays(d, 1), HOME_TZ)) <= since ? null : counts(visits.filter(v => localDay(v.at, HOME_TZ) === d))))
  const week = (m: string) => visits.filter(v => mondayOf(localDay(v.at, HOME_TZ)) === m)
  const sameMoment = now.getTime() - 7 * DAY
  return {
    days, today, answered: per.map(c => c?.answered ?? null), readers: per.map(c => c?.readers ?? null), shop: per.map(c => c?.shop ?? null),
    now: counts(week(monday)),
    lastSoFar: Date.parse(dayStart(monday, HOME_TZ)) <= since ? null : counts(week(plusDays(monday, -7)).filter(v => v.at < sameMoment)),
  }
}
/** Where the overview's beacon starts: last week's Monday, Vietnam's. */
export const lastMondayStart = (now: Date) => dayStart(plusDays(mondayOf(localDay(now, HOME_TZ)), -7), HOME_TZ)

// ——— D1, the app's telemetry, GitHub ———

/** Tank records (who changed one, when) and approved comments and reader photos, from the window's start. */
export type Community = { tanks: { who: string; at: string }[]; comments: { at: string }[]; photos: { at: string }[] }
export async function queryCommunity(db: D1Database, from: string): Promise<Community> {
  const [tanks, comments, photos] = await Promise.all([
    db.prepare('SELECT user_id AS who, updated_at AS at FROM tank_records WHERE updated_at >= ?').bind(from).all<{ who: string; at: string }>(),
    db.prepare("SELECT created_at AS at FROM comments WHERE status = 'approved' AND created_at >= ?").bind(from).all<{ at: string }>(),
    db.prepare("SELECT created_at AS at FROM photos WHERE status = 'approved' AND created_at >= ?").bind(from).all<{ at: string }>(),
  ])
  return { tanks: tanks.results, comments: comments.results, photos: photos.results }
}

/** The app's launches and, by the hour, its device actions and crash reports: our own test copies left out. */
export type AppWeeks = { sessions: { at: string }[]; actions: { at: string; act: string; n: number | string; ok: number | string }[]; crashes: { at: string; n: number | string }[] }
export async function queryAppWeeks(accountId: string, token: string, from: string): Promise<AppWeeks> {
  const when = `blob14 = '' AND timestamp >= toDateTime('${from.slice(0, 19).replace('T', ' ')}')`
  const run = <T>(q: string) => orNoTable(aeSql<T>(accountId, token, q))
  const [sessions, actions, crashes] = await Promise.all([
    run<{ at: string }>(`SELECT blob13 AS s, min(timestamp) AS at FROM aquatome_app WHERE blob13 != '' AND ${when} GROUP BY s FORMAT JSON`),
    run<AppWeeks['actions'][number]>(`SELECT toStartOfHour(timestamp) AS at, blob6 AS act, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS ok FROM aquatome_app WHERE blob1 = 'action' AND blob6 IN ('light.connect', 'light.write', 'plug.switch') AND ${when} GROUP BY at, act FORMAT JSON`),
    run<AppWeeks['crashes'][number]>(`SELECT toStartOfHour(timestamp) AS at, SUM(_sample_interval * double3) AS n FROM aquatome_app WHERE (blob1 = 'metric' OR blob1 = 'diagnostic') AND ${when} GROUP BY at FORMAT JSON`),
  ])
  return { sessions, actions, crashes }
}

/** A problem the live checks or a failed deploy recorded (scripts/site-watch.mjs): the repository's `site-check` issues, which are public. */
export type CheckIssue = { title: string; created_at: string; closed_at: string | null }
const ISSUES = 'https://api.github.com/repos/deathemperor/aquatome.com/issues?labels=site-check&state=all&sort=created&direction=desc&per_page=100'
const ISSUE_PAGES = 5
/** Newest first, until the window's start; kept 10 minutes at the edge, since GitHub limits a shared address to 60 requests an hour. */
export async function queryChecks(from: string): Promise<CheckIssue[]> {
  const out: CheckIssue[] = []
  for (let page = 1; page <= ISSUE_PAGES; page++) {
    const r = await fetch(`${ISSUES}&page=${page}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'aquatome-dashboard' }, cf: { cacheTtl: 600, cacheEverything: true } } as RequestInit)
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    const xs = (await r.json()) as CheckIssue[]
    out.push(...xs)
    if (xs.length < 100 || xs.at(-1)!.created_at < from) break
  }
  return out
}

// ——— The metrics ———

export const GROUPS = {
  star: 'Chỉ số chính', reach: 'Tiếp cận', act: 'Hành động', back: 'Quay lại', community: 'Cộng đồng', app: 'Ứng dụng', supply: 'Nội dung', guard: 'Giữ chất lượng',
} as const
export type Group = keyof typeof GROUPS
export type Unit = 'count' | 'percent' | 'per1000'
export type Metric = {
  /** Stable: scripts and the report read it. */
  key: string
  name: string
  group: Group
  unit: Unit
  /** 'up': more is plainly better, coloured. */
  good?: 'up'
  /** This week so far; last week, whole; last week at this same point of the week (null for a level, or where it wasn't measured). */
  now: number | null
  last: number | null
  lastSoFar: number | null
  /** The 12 weeks, oldest first, the last one this week so far; null: not measured that week. */
  weeks: (number | null)[]
  note?: string
}
export type Part = 'beacon' | 'community' | 'clicks' | 'app' | 'content' | 'checks'
export type Scoreboard = {
  v: 1
  at: string
  tz: string
  page: string
  docs: string
  /** The weeks' Mondays, oldest first; the last is this week. */
  weeks: string[]
  /** When the readers' count starts (ae.ts READERS_FROM): earlier weeks read null. */
  countingFrom: string
  northStar: string
  metrics: Metric[]
  countries: { now: { cc: string; readers: number }[]; last: { cc: string; readers: number }[] }
  /** Parts that didn't load, and why: their metrics read null. */
  failed: Partial<Record<Part, string>>
  notYet: { name: string; needs: string }[]
}

export const NOT_YET: Scoreboard['notYet'] = [
  { name: 'Google Search Console: lượt hiển thị, lượt bấm, vị trí', needs: 'Chủ trang xác minh aquatome.com trong Search Console và cấp quyền đọc qua API.' },
  { name: 'Doanh thu AdSense', needs: 'Chủ trang cấp quyền đọc báo cáo (AdSense Management API), hoặc gửi báo cáo xuất hằng tuần.' },
  { name: 'Hoa hồng affiliate', needs: 'Chủ trang có tài khoản mạng affiliate và báo cáo đơn hàng của mạng đó.' },
  { name: 'Lượt cài và người dùng ứng dụng mỗi tuần', needs: 'Sau khi ra mắt: quyền đọc App Store Connect. Telemetry của ứng dụng mỗi lần mở dùng một mã mới, nên không đếm được người.' },
  { name: 'Người đọc quay lại', needs: 'Không đo, theo thiết kế: beacon không có mã khách, mỗi tab là một phiên.' },
]

export type ScoreboardInput = {
  now: Date
  /** The owner's accounts, left out of the tank keepers. */
  owners: string[]
  beacon: Soft<BeaconRow[]>
  community: Soft<Community>
  /** clicks_daily by Vietnam's day (data.ts clicksByDay). */
  clicks: Soft<{ days: string[]; clicks: number[] }>
  app: Soft<AppWeeks>
  content: Soft<ContentStats>
  snapshots: Soft<Snapshot[]>
  checks: Soft<CheckIssue[]>
}

const on = <T>(x: Soft<T>): T | undefined => (isFailed(x) ? undefined : x)
const sum = <T>(xs: T[], n: (x: T) => number | string) => xs.reduce((t, x) => t + num(n(x)), 0)

/** What the page, the JSON and the report read. Pure: the loads are dashboard.ts loadScoreboard's. */
export function summariseScoreboard(i: ScoreboardInput): Scoreboard {
  const { now } = i
  const since = Date.parse(READERS_FROM)
  const beacon = on(i.beacon)
  const visits = beacon ? visitsOf(beacon) : []
  const out: Metric[] = []
  const add = (key: string, name: string, group: Group, unit: Unit, w: Weekly, o: { good?: 'up'; note?: string } = {}) =>
    out.push({ key, name, group, unit, ...o, now: w.weeks[WEEKS - 1]!, last: w.weeks[WEEKS - 2]!, lastSoFar: w.lastSoFar, weeks: w.weeks })
  const read = (value: (xs: Visit[]) => number | null) => (beacon ? flow(now, visits, v => v.at, value, since) : nothing())

  add('answered', 'Người đọc tìm được câu trả lời', 'star', 'count', read(xs => xs.filter(isAnswered).length), { good: 'up', note: 'Đến từ công cụ tìm kiếm, rồi ở lại trang đầu tiên từ 30 giây hoặc kéo qua nửa trang.' })

  add('readers', 'Người đọc', 'reach', 'count', read(xs => readers(xs).length), { good: 'up', note: 'Phiên ở lại từ 30 giây hoặc kéo qua nửa trang, ở bất kỳ trang nào.' })
  add('sessions', 'Phiên', 'reach', 'count', read(xs => xs.length), { note: 'Mỗi tab một phiên. Không tính bot đã biết, các bài kiểm tra của trang và chủ trang.' })
  add('searchShare', 'Người đọc đến từ tìm kiếm', 'reach', 'percent', read(xs => shareOf(readers(xs), v => isSearch(v.ref))))
  for (const l of LANGS) add(`readers.${l}`, `Người đọc · ${LANG[l].name}`, 'reach', 'count', read(xs => readers(xs).filter(v => langOfPath(v.land) === l).length))

  add('stepShare', 'Phiên có bước tiếp theo', 'act', 'percent', read(xs => shareOf(xs, tookStep)), { note: 'Bấm sang sàn, mở một công cụ hoặc đọc trang thứ hai.' })
  add('shopShare', 'Phiên bấm sang sàn', 'act', 'percent', read(xs => shareOf(xs, v => v.shop > 0)))
  add('toolShare', 'Phiên mở công cụ', 'act', 'percent', read(xs => shareOf(xs, v => v.tool)))
  add('pageShare', 'Phiên đọc trang thứ hai', 'act', 'percent', read(xs => shareOf(xs, v => v.pages > 1)))
  add('shopClicks', 'Lượt bấm sang sàn', 'act', 'count', read(shopClicks), { good: 'up', note: 'Beacon đếm khi người đọc bấm, cùng quy tắc với số người đọc.' })
  add('shopPer1000', 'Lượt bấm sang sàn trên 1.000 người đọc', 'act', 'per1000', read(xs => { const r = readers(xs).length; return r ? (1000 * shopClicks(xs)) / r : null }))
  const clicks = on(i.clicks)
  add('redirects', 'Lượt chuyển sang sàn qua /go/', 'act', 'count',
    clicks ? flow(now, clicks.days.map((d, k) => ({ at: Date.parse(dayStart(d, HOME_TZ)), n: clicks.clicks[k]! })), x => x.at, xs => sum(xs, x => x.n)) : nothing(),
    { note: 'Máy chủ đếm, để đối chiếu với beacon. Trước bản sửa ngày 06/11 số này gồm cả crawler và chủ trang.' })

  const community = on(i.community)
  const owners = new Set(i.owners)
  add('keepers', 'Tài khoản có đổi bể trong tuần', 'back', 'count',
    community ? flow(now, community.tanks.filter(x => !owners.has(x.who)), x => msOf(x.at), xs => new Set(xs.map(x => x.who)).size) : nothing(),
    { good: 'up', note: 'Trừ chủ trang. Tuần đã qua có thể thấp hơn thật: mỗi bản ghi chỉ giữ lần đổi mới nhất.' })

  add('comments', 'Bình luận được duyệt', 'community', 'count', community ? flow(now, community.comments, x => msOf(x.at), xs => xs.length) : nothing(), { good: 'up', note: 'Theo ngày gửi.' })
  add('photos', 'Ảnh bạn đọc được duyệt', 'community', 'count', community ? flow(now, community.photos, x => msOf(x.at), xs => xs.length) : nothing(), { good: 'up', note: 'Theo ngày gửi.' })

  const app = on(i.app)
  const rate = (prefix: string) => (app
    ? flow(now, app.actions.filter(a => a.act.startsWith(prefix)), a => msOf(a.at), xs => share(sum(xs, x => x.ok), sum(xs, x => x.n)))
    : nothing())
  const launches = app ? flow(now, app.sessions, x => msOf(x.at), xs => xs.length) : nothing()
  add('appSessions', 'Lượt mở ứng dụng', 'app', 'count', launches, { good: 'up', note: 'Bản App Store, người dùng không tắt telemetry. Không phải số người.' })
  add('lightOk', 'Kết nối và ghi đèn thành công', 'app', 'percent', rate('light.'))
  add('plugOk', 'Bật, tắt ổ cắm thành công', 'app', 'percent', rate('plug.'))
  const crashes = app ? flow(now, app.crashes, x => msOf(x.at), xs => sum(xs, x => x.n)) : nothing()
  const free = (c: number | null, n: number | null) => (c === null || !n ? null : Math.max(0, 100 * (1 - c / n)))
  add('crashFree', 'Lượt mở không crash', 'app', 'percent', { weeks: crashes.weeks.map((c, k) => free(c, launches.weeks[k]!)), lastSoFar: free(crashes.lastSoFar, launches.lastSoFar) }, { note: 'Ước lượng: số báo cáo crash iOS gửi trên số lượt mở; iOS gửi chậm khoảng một ngày.' })

  const content = on(i.content)
  const snaps = on(i.snapshots) ?? []
  for (const l of LANGS) add(`pages.${l}`, `Trang · ${LANG[l].name}`, 'supply', 'count', level(now, snaps.map(s => ({ day: s.day, value: s.totals.built?.[l] })), content?.totals.built?.[l]))
  add('fullCards', 'Cá có thẻ số liệu đủ', 'supply', 'count', level(now, snaps.map(s => ({ day: s.day, value: s.totals.fullCards })), content?.totals.fullCards), { good: 'up', note: 'Có nhiệt độ, pH và cỡ cá.' })

  const checks = on(i.checks)
  const openAt = (test: (x: CheckIssue) => boolean): Weekly => {
    if (!checks) return nothing()
    const xs = checks.filter(test)
    return {
      weeks: weeksTo(now).map(m => {
        const end = Math.min(Date.parse(dayStart(plusDays(m, 7), HOME_TZ)), now.getTime())
        return xs.filter(x => msOf(x.created_at) <= end && (!x.closed_at || msOf(x.closed_at) > end)).length
      }),
      lastSoFar: null,
    }
  }
  const deploy = (x: CheckIssue) => x.title.startsWith('Deploy failed')
  const lighthouse = (x: CheckIssue) => x.title.startsWith('Site check failed: lighthouse ')
  add('checksOpen', 'Lỗi kiểm tra trực tiếp đang mở', 'guard', 'count', openAt(x => !deploy(x) && !lighthouse(x)), { note: 'Cuối mỗi tuần: issue site-check chưa đóng.' })
  add('lighthouseOpen', 'Trang chưa đạt Lighthouse', 'guard', 'count', openAt(lighthouse))
  add('deployFails', 'Lần deploy lỗi', 'guard', 'count', checks ? flow(now, checks.filter(deploy), x => msOf(x.created_at), xs => xs.length) : nothing())

  const mondays = weeksTo(now)
  const inWeek = (m: string) => visits.filter(v => mondayOf(localDay(v.at, HOME_TZ)) === m)
  const failed: Scoreboard['failed'] = {}
  const parts: [Part, Soft<unknown>][] = [['beacon', i.beacon], ['community', i.community], ['clicks', i.clicks], ['app', i.app], ['content', i.content], ['checks', i.checks]]
  for (const [part, x] of parts) if (isFailed(x)) failed[part] = x.failed
  return {
    v: 1, at: now.toISOString(), tz: HOME_TZ, page: dashboardUrl(SCOREBOARD_PATH), docs: DOC, weeks: mondays, countingFrom: READERS_FROM, northStar: 'answered', metrics: out,
    countries: { now: countries(inWeek(mondays.at(-1)!)), last: countries(inWeek(mondays.at(-2)!)) },
    failed, notYet: NOT_YET,
  }
}

// ——— Words ———

const shown = (v: number | null, unit: Unit, f = fmt) => (v === null ? '—' : unit === 'percent' ? `${f(v, 1)}%` : unit === 'per1000' ? f(v, 1) : f(v))
const metric = (s: Scoreboard, key: string) => s.metrics.find(m => m.key === key)!
const LAST_SO_FAR = 'cùng lúc tuần trước'
const LAST_WEEK = 'tuần trước'
/** What this week is compared with: last week at this same point when that's known, else last week. */
const before = (m: Metric) => (m.lastSoFar !== null ? { v: m.lastSoFar, vs: LAST_SO_FAR } : m.last !== null ? { v: m.last, vs: LAST_WEEK } : undefined)

/** The metrics the daily report leads with. */
export const KEY_METRICS = ['answered', 'readers', 'searchShare', 'stepShare', 'shopPer1000'] as const
/** Their names in English, which the daily report is in; docs/metrics.md defines each. */
export const KEY_NAMES_EN: Record<(typeof KEY_METRICS)[number], string> = {
  answered: 'Readers who found their answer',
  readers: 'Readers',
  searchShare: 'Readers from search',
  stepShare: 'Sessions with a next step',
  shopPer1000: 'Shop clicks per 1,000 readers',
}
/** The block's words and how it writes numbers: the dashboard's Vietnamese, or what the daily report gives (daily/compose.ts). */
export type BlockWords = { title: string; names?: Record<(typeof KEY_METRICS)[number], string>; sameMoment: string; lastWeek: string; fmt: (n: number, d?: number) => string }
const VI_WORDS: BlockWords = { title: 'Thành công', sameMoment: LAST_SO_FAR, lastWeek: 'cả tuần trước', fmt }
/** A short block for the daily report: the north star and the key metrics, this week against last, and the page's address. */
export function scoreboardBlock(s: Scoreboard, w = VI_WORDS): { title: string; lines: string[]; href: string } {
  const lines = KEY_METRICS.map(key => {
    const m = metric(s, key)
    const was = m.lastSoFar !== null ? `${w.sameMoment} ${shown(m.lastSoFar, m.unit, w.fmt)}, ` : ''
    return `${w.names?.[key] ?? m.name}: ${shown(m.now, m.unit, w.fmt)} (${was}${w.lastWeek} ${shown(m.last, m.unit, w.fmt)})`
  })
  return { title: w.title, lines, href: s.page }
}

// ——— The page ———

const PARTS: Record<Part, string> = {
  beacon: 'số liệu người đọc (Analytics Engine)', community: 'tài khoản, bình luận và ảnh (D1)', clicks: 'lượt chuyển qua /go/ (D1)',
  app: 'telemetry ứng dụng (Analytics Engine)', content: 'content.json của bản build', checks: 'issue kiểm tra trực tiếp (GitHub)',
}
const GROUP_PARTS: Partial<Record<Group, Part[]>> = { reach: ['beacon'], act: ['clicks'], back: ['community'], community: ['community'], app: ['app'], supply: ['content'], guard: ['checks'] }

const row = (mondays: string[]) => (m: Metric) => {
  const was = before(m)
  const chip = m.unit === 'count' && m.now !== null && was ? chipHtml(chipOf(m.now, was.v, was.vs, m.good)) : ''
  return `<tr><th scope="row">${esc(m.name)}${m.note ? `<small>${esc(m.note)}</small>` : ''}</th><td class="now" data-l="${COLUMNS[0]}"><b>${esc(shown(m.now, m.unit))}</b> ${chip}</td><td data-l="${COLUMNS[1]}">${esc(shown(m.lastSoFar, m.unit))}</td><td data-l="${COLUMNS[2]}">${esc(shown(m.last, m.unit))}</td><td class="trend" data-l="${COLUMNS[3]}" aria-hidden="true">${spark(m.weeks, 1, { labels: mondays.map(d => `Tuần ${dayLabel(d)}`), format: v => shown(v, m.unit) })}</td></tr>`
}
const COLUMNS = ['Tuần này', 'Cùng lúc tuần trước', 'Cả tuần trước', '12 tuần'] as const
// The 12 weeks are drawn only (the spark is for the eye; the charts and the JSON's own weeks carry the numbers).
const HEAD = `<thead><tr><th>Chỉ số</th>${COLUMNS.map((c, i) => `<th${i === 3 ? ' aria-hidden="true"' : ''}>${c}</th>`).join('')}</tr></thead>`
const countryRows = (xs: { cc: string; readers: number }[]) => xs.map(x => ({ label: esc(x.cc), value: x.readers }))

const keyTile = (s: Scoreboard, m: Metric): Tile => {
  const was = before(m)
  return { label: m.name, value: shown(m.now, m.unit), ...(m.unit === 'count' && m.now !== null && was ? { delta: { now: m.now, before: was.v, vs: was.vs, good: m.good } } : {}), ...(m.note && m.key === s.northStar ? { sub: m.note } : {}) }
}
/** The star and the readers, 12 weeks each. */
const weekCharts = (s: Scoreboard): DayChart[] => {
  const c = (id: string, m: Metric, whole?: Metric): DayChart => ({
    id, title: m.name, days: s.weeks, period: 'week', partialLast: true, missing: 'chưa đếm', empty: 'Chưa có số liệu trong 12 tuần này.',
    series: [{ label: m.name, values: m.weeks }], ...(whole ? { whole: { label: whole.name, values: whole.weeks } } : {}),
  })
  return [c('w-star', metric(s, s.northStar)), c('w-readers', metric(s, 'readers'), metric(s, 'sessions'))]
}
const lede = (s: Scoreboard) => {
  const thisWeek = s.weeks.at(-1)!
  return `Tuần tính từ Thứ Hai đến Chủ nhật theo giờ Việt Nam, tuần này ${dayLabel(thisWeek)} đến ${dayLabel(plusDays(thisWeek, 6))}. Người đọc đếm từ ${dayLabel(localDay(s.countingFrom, HOME_TZ))}, những tuần trước đó để trống. <a href="${esc(s.docs)}">Định nghĩa từng chỉ số</a>.`
}
const groupsOf = () => (Object.keys(GROUPS) as Group[]).filter(g => g !== 'star')
const failedParts = (s: Scoreboard, g: Group) => (GROUP_PARTS[g] ?? []).flatMap(p => (s.failed[p] ? [[PARTS[p], { failed: s.failed[p]! }] as const] : []))

export function scoreboardPage(s: Scoreboard, tz = HOME_TZ): string {
  const groups = groupsOf().map(g => {
    const rows = s.metrics.filter(m => m.group === g).map(row(s.weeks)).join('')
    return `<section aria-labelledby="g-${g}"><h2 id="g-${g}">${GROUPS[g]}</h2>${failedParts(s, g).map(([what, f]) => failedBox(what, f)).join('')}<div class="scroll"><table class="score">${HEAD}<tbody>${rows}</tbody></table></div>${g === 'reach' ? countriesBlock(s) : ''}</section>`
  }).join('')
  const later = `<section aria-labelledby="g-later"><h2 id="g-later">Chưa đo được</h2><ul class="gaps">${s.notYet.map(x => `<li><p><b>${esc(x.name)}.</b> ${esc(x.needs)}</p></li>`).join('')}</ul></section>`
  const [star, readers] = weekCharts(s).map(dayChart)
  const body = `<h1>Thành công</h1><p class="lede">${lede(s)}</p>
${s.failed.beacon ? failedBox(PARTS.beacon, { failed: s.failed.beacon }) : ''}
${tiles(KEY_METRICS.map(k => keyTile(s, metric(s, k))))}
<div class="charts">${star}${readers}</div>
${groups}${later}`
  return page(SCOREBOARD_PATH, 'Thành công', body, new Date(s.at), tz)
}

/** The same as blocks, for the app: a metric's row is its name, this week (and its change), the same point last week and all of last week. */
export function scoreboardSection(s: Scoreboard): Section {
  const blocks: Block[] = [note(textOf(lede(s)))]
  if (s.failed.beacon) blocks.push(failedNote(PARTS.beacon, { failed: s.failed.beacon }))
  blocks.push(figures(KEY_METRICS.map(k => keyTile(s, metric(s, k)))), ...weekCharts(s).map(c => chart(c)))
  for (const g of groupsOf()) {
    blocks.push(heading(GROUPS[g], 2, `g-${g}`), ...failedParts(s, g).map(([what, f]) => failedNote(what, f)))
    blocks.push(table(['Chỉ số', ...COLUMNS.slice(0, 3)], s.metrics.filter(m => m.group === g).map((m): Cell[] => {
      const was = before(m)
      const chip = m.unit === 'count' && m.now !== null && was ? chipOf(m.now, was.v, was.vs, m.good) : undefined
      return [
        { text: m.name, ...(m.note ? { sub: m.note } : {}) },
        { text: shown(m.now, m.unit), ...(chip ? { sub: chip.text, ...(chip.tone === 'plain' ? {} : { tone: chip.tone }) } : {}) },
        { text: shown(m.lastSoFar, m.unit) }, { text: shown(m.last, m.unit) },
      ]
    })))
    if (g === 'reach') {
      const head = ['Quốc gia', 'Người đọc']
      blocks.push(heading('Quốc gia, tuần này', 3), rankBlock(countryRows(s.countries.now), head), heading('Quốc gia, tuần trước', 3), rankBlock(countryRows(s.countries.last), head))
    }
  }
  blocks.push(heading('Chưa đo được', 2, 'g-later'), ...s.notYet.map(x => note(`${x.name}. ${x.needs}`)))
  return { title: 'Thành công', blocks }
}

function countriesBlock(s: Scoreboard): string {
  const head = ['Quốc gia', 'Người đọc']
  return `<div class="split"><section><h3 class="sub-h">Quốc gia, tuần này</h3>${rankTable(countryRows(s.countries.now), head)}</section><section><h3 class="sub-h">Quốc gia, tuần trước</h3>${rankTable(countryRows(s.countries.last), head)}</section></div>`
}
