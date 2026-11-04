import { EVENTS, eventsSql } from './admin/ae'
import { localDay } from './admin/time'
import { withoutVi } from './paths'

/**
 * "Real readers" from our own beacon (only browsers that run the page's JavaScript, minus known bots and the owner):
 * a session is a reader when it scrolled half a page or stayed 30 s. Queried live from Analytics Engine for /_ab/.
 */
export type Session = { sid: string; first: string; pages: number | string; t: number | string; scroll: number | string }
export type View = { sid: string; p: string; ref: string; cc: string; views: number | string }
export type Readers = {
  days: number; sessions: number; readers: number
  daily: { day: string; sessions: number; readers: number }[]
  pages: { path: string; views: number }[]
  sources: { source: string; sessions: number; readers: number }[]
  countries: { cc: string; readers: number }[]
}

const num = (x: number | string) => Number(x) || 0
export const isReader = (s: Session) => num(s.scroll) >= 50 || num(s.t) >= 30
const top = <T>(m: Map<string, T>, by: (x: T) => number, n: number) => [...m].sort((a, b) => by(b[1]) - by(a[1]) || a[0].localeCompare(b[0])).slice(0, n)

/** Where a visit came from: a search engine or site by name, "(trực tiếp)" without a referrer. */
export function sourceOf(host: string): string {
  const h = host.replace(/^www\./, '')
  if (!h) return '(trực tiếp)'
  const m = h.match(/(?:^|\.)(google|bing|duckduckgo|yahoo|coccoc|facebook|zalo|youtube|tiktok|reddit|chatgpt|perplexity)\.[a-z.]+$/)
  return m ? m[1]! : h
}

/** `tz`: the zone whose days the daily counts follow (the viewer's, admin/time.ts). */
export function summariseReaders(sessions: Session[], views: View[], days: number, tz = 'UTC'): Readers {
  const readerSids = new Set(sessions.filter(isReader).map(s => s.sid))
  const daily = new Map<string, { day: string; sessions: number; readers: number }>()
  for (const s of sessions) {
    const day = localDay(s.first, tz)
    const d = daily.get(day) ?? { day, sessions: 0, readers: 0 }
    d.sessions++
    if (readerSids.has(s.sid)) d.readers++
    daily.set(day, d)
  }
  const pages = new Map<string, number>()
  const firstRef = new Map<string, string>()
  const cc = new Map<string, string>()
  for (const v of views) {
    // A view of an old /vi/… address counts for the page's address now.
    if (readerSids.has(v.sid)) { const p = withoutVi(v.p); pages.set(p, (pages.get(p) ?? 0) + num(v.views)) }
    if (v.ref && !firstRef.has(v.sid)) firstRef.set(v.sid, v.ref)
    if (v.cc && !cc.has(v.sid)) cc.set(v.sid, v.cc)
  }
  const sources = new Map<string, { sessions: number; readers: number }>()
  const countries = new Map<string, number>()
  for (const s of sessions) {
    const src = sourceOf(firstRef.get(s.sid) ?? '')
    const x = sources.get(src) ?? { sessions: 0, readers: 0 }
    x.sessions++
    if (readerSids.has(s.sid)) {
      x.readers++
      const c = cc.get(s.sid) ?? '??'
      countries.set(c, (countries.get(c) ?? 0) + 1)
    }
    sources.set(src, x)
  }
  return {
    days, sessions: sessions.length, readers: readerSids.size,
    daily: [...daily.values()].sort((a, b) => b.day.localeCompare(a.day)),
    pages: top(pages, x => x, 15).map(([path, views]) => ({ path, views })),
    sources: top(sources, x => x.sessions, 12).map(([source, x]) => ({ source, ...x })),
    countries: top(countries, x => x, 10).map(([cc, readers]) => ({ cc, readers })),
  }
}

export const SESSIONS_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, min(timestamp) AS first,
  SUM(IF(blob2 = 'view', _sample_interval, 0)) AS pages, MAX(IF(blob2 = 'time', double1, 0.0)) AS t, MAX(IF(blob2 = 'scroll', double1, 0.0)) AS scroll
FROM ${table} WHERE timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY GROUP BY sid FORMAT JSON`
const VIEWS_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, blob3 AS p, blob5 AS ref, blob6 AS cc, SUM(_sample_interval) AS views
FROM ${table} WHERE blob2 = 'view' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY GROUP BY sid, p, ref, cc FORMAT JSON`

/** One row per session: a session the beacon wrote to both datasets (across the move) is one. */
export function bySession(rows: Session[]): Session[] {
  const m = new Map<string, Session>()
  for (const r of rows) {
    const s = m.get(r.sid)
    m.set(r.sid, s ? { sid: r.sid, first: r.first < s.first ? r.first : s.first, pages: num(s.pages) + num(r.pages), t: Math.max(num(s.t), num(r.t)), scroll: Math.max(num(s.scroll), num(r.scroll)) } : r)
  }
  return [...m.values()]
}
export const querySessions = (accountId: string, token: string, days: number, now?: number) => eventsSql<Session>(accountId, token, t => SESSIONS_SQL(days, t), now).then(bySession)

export async function queryReaders(accountId: string, token: string, days = 14, tz = 'UTC'): Promise<Readers> {
  const [sessions, views] = await Promise.all([querySessions(accountId, token, days), eventsSql<View>(accountId, token, t => VIEWS_SQL(days, t))])
  return summariseReaders(sessions, views, days, tz)
}

/** Sessions and readers per day (in `tz`, by a session's first event), from the sessions query alone: the overview's. */
export async function queryReaderDays(accountId: string, token: string, days: number, tz = 'UTC'): Promise<Readers['daily']> {
  return summariseReaders(await querySessions(accountId, token, days), [], days, tz).daily
}
