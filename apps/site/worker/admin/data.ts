import { PREFIX, type Wanted } from '../wanted'
import { lastDays } from './chart'

/** The dashboard's reads from D1 and KV: small, read-only, on the tables and keys that exist. Days are UTC. */

const align = (days: string[], rows: { d: string; n: number }[]) => {
  const m = new Map(rows.map(r => [r.d, Number(r.n) || 0]))
  return days.map(d => m.get(d) ?? 0)
}

/** Affiliate clicks per day, `n` days ending today. */
export async function clicksByDay(db: D1Database, now: Date, n = 30): Promise<{ days: string[]; clicks: number[] }> {
  const days = lastDays(now, n)
  const { results } = await db.prepare('SELECT date AS d, SUM(n) AS n FROM clicks_daily WHERE date >= ? GROUP BY date').bind(days[0]).all<{ d: string; n: number }>()
  return { days, clicks: align(days, results) }
}

export async function livePhotos(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM photos WHERE status = 'approved'").first<{ n: number }>())?.n ?? 0
}

export type AccountStats = {
  days: string[]
  users: number
  newUsers: number[]
  synced: number
  openSessions: number
  credentials: { kind: string; n: number }[]
  comments: { status: string; n: number }[]
  newComments: number[]
}
/** Accounts (migration 0004) and comments (0002): counts, and per day for 30 days. */
export async function accountStats(db: D1Database, now: Date): Promise<AccountStats> {
  const days = lastDays(now, 30)
  const [users, perDay, synced, open, credentials, comments, commentsPerDay] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d').bind(days[0]).all<{ d: string; n: number }>(),
    db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM tank_records').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?').bind(now.toISOString()).first<{ n: number }>(),
    db.prepare('SELECT kind, COUNT(*) AS n FROM credentials GROUP BY kind ORDER BY n DESC').all<{ kind: string; n: number }>(),
    db.prepare('SELECT status, COUNT(*) AS n FROM comments GROUP BY status ORDER BY n DESC').all<{ status: string; n: number }>(),
    db.prepare('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM comments WHERE created_at >= ? GROUP BY d').bind(days[0]).all<{ d: string; n: number }>(),
  ])
  return {
    days, users: users?.n ?? 0, newUsers: align(days, perDay.results), synced: synced?.n ?? 0, openSessions: open?.n ?? 0,
    credentials: credentials.results, comments: comments.results, newComments: align(days, commentsPerDay.results),
  }
}

/** Every name readers want (worker/wanted.ts), from the keys' metadata: one list call per 1000, at most 5, most readers first. */
export async function listWanted(kv: KVNamespace): Promise<{ names: Wanted[]; more: boolean }> {
  const names: Wanted[] = []
  let cursor: string | undefined
  for (let page = 0; page < 5; page++) {
    const r = await kv.list<Wanted>({ prefix: PREFIX, ...(cursor ? { cursor } : {}) })
    for (const k of r.keys) if (k.metadata && typeof k.metadata.readers === 'number') names.push(k.metadata)
    if (r.list_complete) return { names: sortWanted(names), more: false }
    cursor = r.cursor
  }
  return { names: sortWanted(names), more: true }
}
const sortWanted = (xs: Wanted[]) => xs.sort((a, b) => b.readers - a.readers || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
