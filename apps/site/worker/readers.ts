import { aeSql, COUNTED, EVENTS, eventsSql, READERS_FROM, SINCE_RESET, WHO, WHO_RANK } from './admin/ae'
import { localDay } from './admin/time'
import { withoutVi } from './paths'

/**
 * "Real readers" from our own beacon (only browsers that run the page's JavaScript, minus known bots, and minus us: the
 * owner, our browsers, our network and the app's web pages, which the beacon marks, us.ts, and minus likely automated
 * tabs): a session is a reader when it scrolled half a page or stayed 30 s. A session is a browser tab, and one marked
 * event makes the whole tab ours (ae.ts WHO_RANK). Queried live from Analytics Engine for /_ab/.
 */
/**
 * `land`, `ref`, `cc`: its first event's page, referrer ('=' one of our own pages, events.ts) and country. `who`: its
 * mark (ae.ts WHO's index), 0 or missing for a reader's. `u`: its browser's visitor code (src/lib/beacon.ts), '' without.
 */
export type Session = { sid: string; first: string; pages: number | string; t: number | string; scroll: number | string; land?: string; ref?: string; cc?: string; who?: number | string; u?: string }
export { WHO }
export type Excluded = { who: Exclude<(typeof WHO)[number], ''>; sessions: number; readers: number }
export type Burst = { cc: string; from: string; to: string; sessions: number }
export type View = { sid: string; p: string; views: number | string }
export type Readers = {
  days: number; sessions: number; readers: number
  /** `automated`: that day's likely automated tabs (BURST), outside its sessions. */
  daily: { day: string; sessions: number; readers: number; automated?: number }[]
  pages: { path: string; views: number }[]
  sources: { source: string; sessions: number; readers: number }[]
  countries: { cc: string; readers: number }[]
  /** Left out: our sessions by mark, and the App Store app's web pages (counted with the app's reads). */
  excluded?: Excluded[]
  /** Fresh tabs that look automated (BURST): neither sessions nor readers above, shown apart. */
  automated?: { sessions: number; readers: number; bursts: Burst[] }
  /** Reads in the iOS app (its own telemetry, worker/telemetry), beside the web's; missing when that can't be read. */
  app?: AppReads
  /** Return visits, from the visitor code: missing while no counted tab has one (the visitor switch off). */
  revisits?: Revisits
  /** When the count starts (ae.ts READERS_FROM): days before it weren't counted. */
  from?: string
}

const num = (x: number | string) => Number(x) || 0
export const isReader = (s: Pick<Session, 't' | 'scroll'>) => num(s.scroll) >= 50 || num(s.t) >= 30
const top = <T>(m: Map<string, T>, by: (x: T) => number, n: number) => [...m].sort((a, b) => by(b[1]) - by(a[1]) || a[0].localeCompare(b[0])).slice(0, n)

/** Where a visit came from: a search engine or site by name, "(direct)" without a referrer or from one of our pages ('='). */
export function sourceOf(host: string): string {
  const h = host.replace(/^www\./, '')
  if (!h || h === '=') return '(direct)'
  const m = h.match(/(?:^|\.)(google|bing|duckduckgo|yahoo|coccoc|facebook|zalo|youtube|tiktok|reddit|chatgpt|perplexity)\.[a-z.]+$/)
  return m ? m[1]! : h
}

/** A search engine's address (www.google.com.vn, the Google app's com.google.android.googlequicksearchbox). Chat assistants are not search. */
export const isSearch = (host: string) => /(?:^|\.)(?:google|bing|duckduckgo|yahoo|coccoc|yandex|baidu|ecosia|brave|naver)\.[a-z.]+$/.test(host)

const at = (first: string) => Date.parse(`${first.replace(' ', 'T')}Z`)
/**
 * Fresh tabs that look automated: at least `n` from one country within `ms`, none from an outside site, and most
 * (`distinct`) landing on a page no other tab there landed on. A sweep through the pages, one new tab each, not a crowd
 * sent to one page. Seen on 7 Nov 2026: about 100 Indonesian tabs in two hours, a new species page every 30 s or so.
 * A tab a reader opened from one of our pages has a referrer ('='), so it is never one.
 */
export const BURST = { n: 20, ms: 30 * 60_000, distinct: 0.8 }
type Tab = Pick<Session, 'sid' | 'first' | 'land' | 'ref' | 'cc'>
export function automated(sessions: Tab[]): Set<string> {
  const out = new Set<string>()
  const byCc = new Map<string, Tab[]>()
  for (const s of sessions) {
    if (s.ref) continue
    const list = byCc.get(s.cc ?? '')
    if (list) list.push(s)
    else byCc.set(s.cc ?? '', [s])
  }
  for (const list of byCc.values()) {
    list.sort((a, b) => at(a.first) - at(b.first))
    for (let i = 0, j = 0; i < list.length; i++) {
      while (j < list.length && at(list[j]!.first) - at(list[i]!.first) <= BURST.ms) j++
      const w = list.slice(i, j)
      if (w.length < BURST.n) continue
      const lands = new Map<string, number>()
      for (const s of w) lands.set(s.land ?? '', (lands.get(s.land ?? '') ?? 0) + 1)
      if (w.filter(s => lands.get(s.land ?? '') === 1).length >= BURST.distinct * w.length) for (const s of w) out.add(s.sid)
    }
  }
  return out
}

/** The automated tabs as runs per country (a gap of more than BURST.ms starts another), for the dashboard and the report. */
function bursts(auto: Tab[]): Burst[] {
  const out: Burst[] = []
  for (const s of [...auto].sort((a, b) => (a.cc ?? '').localeCompare(b.cc ?? '') || at(a.first) - at(b.first))) {
    const last = out.at(-1)
    if (last && last.cc === (s.cc ?? '') && at(s.first) - at(last.to) <= BURST.ms) Object.assign(last, { to: s.first, sessions: last.sessions + 1 })
    else out.push({ cc: s.cc ?? '', from: s.first, to: s.first, sessions: 1 })
  }
  return out.sort((a, b) => b.from.localeCompare(a.from))
}

/**
 * When the app went on the App Store (null: not yet). Before it every copy is ours, a TestFlight or debug one, whatever
 * it says of itself: until the fix to its own-copy check, the owner's TestFlight copy sent its events unmarked.
 */
export const APP_STORE_FROM: string | null = null
/** An app session (blob13), with `test` its own-copy mark (blob14) and the site beacon's reading marks. */
export type AppSession = { sid: string; test: string; first: string; pages: number | string; t: number | string; scroll: number | string }
export type AppReads = { onStore: boolean; sessions: number; readers: number; ours: { sessions: number; readers: number } }
export const APP_SQL = (days: number) => `SELECT blob13 AS sid, blob14 AS test, min(timestamp) AS first,
  SUM(IF(blob1 = 'view' AND blob2 != '', _sample_interval, 0)) AS pages, MAX(IF(blob1 = 'time', double1, 0.0)) AS t, MAX(IF(blob1 = 'scroll', double1, 0.0)) AS scroll
FROM aquatome_app WHERE blob1 IN ('view', 'scroll', 'time') AND blob13 != '' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY GROUP BY sid, test FORMAT JSON`
/** The app's sessions and readers, by the web's rule, with our copies' apart. */
export function summariseAppReads(rows: AppSession[], storeFrom = APP_STORE_FROM): AppReads {
  const ours = (s: AppSession) => s.test === '1' || !storeFrom || at(s.first) < Date.parse(storeFrom)
  const theirs = rows.filter(s => !ours(s))
  const mine = rows.filter(ours)
  return { onStore: Boolean(storeFrom), sessions: theirs.length, readers: theirs.filter(isReader).length, ours: { sessions: mine.length, readers: mine.filter(isReader).length } }
}

/**
 * Return visits among the counted tabs, by their browser's visitor code (src/lib/beacon.ts): within the window, in `tz`'s
 * days. A visitor is a browser, not a person: a reader on a phone and a computer is two, and one who cleared their
 * browser's storage starts again.
 */
export type Revisits = {
  /** Browsers with a code. */
  visitors: number
  /** Of them, those with a tab on two days or more. */
  returning: number
  /** Days from a returning visitor's first day to its next: the middle one. */
  gapDays: number | null
  /** Counted tabs without a code: Global Privacy Control or Do Not Track on, storage blocked, a page from before the code. */
  noCode: number
  /** The pages returning visitors first landed on: what brings people back. */
  pages: { path: string; visitors: number }[]
}
export function revisitsOf(sessions: Session[], tz = 'UTC'): Revisits | undefined {
  const by = new Map<string, Session[]>()
  for (const s of sessions) {
    if (!s.u) continue
    const list = by.get(s.u)
    if (list) list.push(s)
    else by.set(s.u, [s])
  }
  if (!by.size) return undefined
  let returning = 0
  const gaps: number[] = []
  const pages = new Map<string, number>()
  for (const list of by.values()) {
    const days = [...new Set(list.map(s => localDay(s.first, tz)))].sort()
    if (days.length < 2) continue
    returning++
    gaps.push(Math.round((Date.parse(days[1]!) - Date.parse(days[0]!)) / 86_400_000))
    const first = list.reduce((a, b) => (at(b.first) < at(a.first) ? b : a))
    if (first.land) { const p = withoutVi(first.land); pages.set(p, (pages.get(p) ?? 0) + 1) }
  }
  gaps.sort((a, b) => a - b)
  return {
    visitors: by.size, returning, gapDays: gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)]! : null,
    noCode: sessions.filter(s => !s.u).length, pages: top(pages, x => x, 10).map(([path, visitors]) => ({ path, visitors })),
  }
}

/** A tab with a mark (us.ts): ours. */
export const isOurs = (s: Pick<Session, 'who'>) => num(s.who ?? 0) > 0
/** The tabs a reader count reads: none of ours, none likely automated. */
export function countedSessions(all: Session[]): Session[] {
  const theirs = all.filter(s => !isOurs(s))
  const auto = automated(theirs)
  return theirs.filter(s => !auto.has(s.sid))
}

/** `tz`: the zone whose days the daily counts follow (the viewer's, admin/time.ts). `all`: every tab, ours too (SESSIONS_SQL). */
export function summariseReaders(all: Session[], views: View[], days: number, tz = 'UTC'): Readers {
  const theirs = all.filter(s => !isOurs(s))
  const auto = automated(theirs)
  const sessions = theirs.filter(s => !auto.has(s.sid))
  const readerSids = new Set(sessions.filter(isReader).map(s => s.sid))
  const daily = new Map<string, Readers['daily'][number]>()
  for (const s of theirs) {
    const day = localDay(s.first, tz)
    const d = daily.get(day) ?? { day, sessions: 0, readers: 0 }
    if (auto.has(s.sid)) d.automated = (d.automated ?? 0) + 1
    else d.sessions++
    if (readerSids.has(s.sid)) d.readers++
    daily.set(day, d)
  }
  const pages = new Map<string, number>()
  for (const v of views) {
    // A view of an old /vi/… address counts for the page's address now.
    if (readerSids.has(v.sid)) { const p = withoutVi(v.p); pages.set(p, (pages.get(p) ?? 0) + num(v.views)) }
  }
  const sources = new Map<string, { sessions: number; readers: number }>()
  const countries = new Map<string, number>()
  for (const s of sessions) {
    const src = sourceOf(s.ref ?? '')
    const x = sources.get(src) ?? { sessions: 0, readers: 0 }
    x.sessions++
    if (readerSids.has(s.sid)) {
      x.readers++
      const c = s.cc || '??'
      countries.set(c, (countries.get(c) ?? 0) + 1)
    }
    sources.set(src, x)
  }
  const ours = all.filter(isOurs)
  const autoTabs = theirs.filter(s => auto.has(s.sid))
  const revisits = revisitsOf(sessions, tz)
  return {
    days, sessions: sessions.length, readers: readerSids.size,
    daily: [...daily.values()].sort((a, b) => b.day.localeCompare(a.day)),
    pages: top(pages, x => x, 15).map(([path, views]) => ({ path, views })),
    sources: top(sources, x => x.sessions, 12).map(([source, x]) => ({ source, ...x })),
    countries: top(countries, x => x, 10).map(([cc, readers]) => ({ cc, readers })),
    excluded: WHO.slice(1).map(who => {
      const mine = ours.filter(s => WHO[num(s.who!)] === who)
      return { who, sessions: mine.length, readers: mine.filter(isReader).length } as Excluded
    }).reverse(),
    automated: { sessions: auto.size, readers: autoTabs.filter(isReader).length, bursts: bursts(autoTabs) },
    ...(revisits ? { revisits } : {}),
  }
}

/** Every tab, ours too, with its mark (`who`): summariseReaders and countedSessions sort them. */
export const SESSIONS_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, min(timestamp) AS first,
  SUM(IF(blob2 = 'view', _sample_interval, 0)) AS pages, MAX(IF(blob2 = 'time', double1, 0.0)) AS t, MAX(IF(blob2 = 'scroll', double1, 0.0)) AS scroll,
  argMin(blob3, timestamp) AS land, argMin(blob5, timestamp) AS ref, argMin(blob6, timestamp) AS cc, argMin(blob7, timestamp) AS u, ${WHO_RANK}
FROM ${table} WHERE blob2 != 'lang' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${SINCE_RESET} GROUP BY sid FORMAT JSON`
export const VIEWS_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, blob3 AS p, SUM(_sample_interval) AS views
FROM ${table} WHERE blob2 = 'view' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${COUNTED} GROUP BY sid, p FORMAT JSON`

const sessionRows = (accountId: string, token: string, days: number) => eventsSql<Session>(accountId, token, t => SESSIONS_SQL(days, t))
/** The tabs a reader count reads (countedSessions), for the content pages' counts. */
export const querySessions = async (accountId: string, token: string, days: number) => countedSessions(await sessionRows(accountId, token, days))

export async function queryReaders(accountId: string, token: string, days = 14, tz = 'UTC'): Promise<Readers> {
  const [sessions, views, app] = await Promise.all([sessionRows(accountId, token, days), eventsSql<View>(accountId, token, t => VIEWS_SQL(days, t)),
    aeSql<AppSession>(accountId, token, APP_SQL(days)).then(rows => summariseAppReads(rows), () => undefined)])
  return { ...summariseReaders(sessions, views, days, tz), ...(app ? { app } : {}), from: READERS_FROM }
}

/** Sessions and readers per day (in `tz`, by a session's first event), from the sessions query alone: the overview's. */
export async function queryReaderDays(accountId: string, token: string, days: number, tz = 'UTC'): Promise<Readers['daily']> {
  return summariseReaders(await sessionRows(accountId, token, days), [], days, tz).daily
}
