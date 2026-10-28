import { isSkin, SKINS, type Skin } from './skins'
import type { SkinStats } from './allocate'

type Row = { skin: string; pages: number | string; t: number | string; scroll: number | string; clicks: number | string }
const num = (x: number | string) => Number(x) || 0

/** One row per (skin, session) → per-skin totals. A visit converts on an affiliate click, or ≥3 pages and ≥60 s. */
export function summarise(rows: Row[]): Record<Skin, SkinStats> {
  const out = Object.fromEntries(SKINS.map(s => [s, { visits: 0, pages: 0, converted: 0, clicks: 0, timeSum: 0, scrolled: 0 }])) as Record<Skin, SkinStats>
  for (const r of rows) {
    if (!isSkin(r.skin)) continue
    const o = out[r.skin]
    const pages = num(r.pages), t = num(r.t), clicks = num(r.clicks)
    o.visits++
    o.pages += pages
    o.clicks += clicks
    o.timeSum += t
    if (num(r.scroll) >= 90) o.scrolled++
    if (clicks > 0 || (pages >= 3 && t >= 60)) o.converted++
  }
  return out
}

export const STATS_SQL = (days: number) => `SELECT blob1 AS skin, blob4 AS sid,
  SUM(IF(blob2 = 'view', 1, 0)) AS pages, MAX(IF(blob2 = 'time', double1, 0)) AS t,
  MAX(IF(blob2 = 'scroll', double1, 0)) AS scroll, SUM(IF(blob2 = 'aff', 1, 0)) AS clicks
FROM thuysinh_events WHERE timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY
GROUP BY skin, sid FORMAT JSON`

export async function queryStats(accountId: string, token: string, days = 14): Promise<Record<Skin, SkinStats>> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: STATS_SQL(days),
  })
  if (!r.ok) throw new Error(`analytics engine sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return summarise(((await r.json()) as { data: Row[] }).data)
}
