import { LANGS, prefixedLang } from '@aq/schema/langs'
import { withoutVi } from '../paths'
import { isReader, querySessions, type Session } from '../readers'
import { COUNTED, EVENTS, eventsSql, num } from './ae'
import { keepTotals, readKept, type ByLang, type ContentStats, type EntityKind, type KeptTotals, type Lang, type PageKind, type PageRow, type Totals } from './content-shape'

export type * from './content-shape'

/**
 * The dashboard's content part: what the build wrote (dist/_ab/content.json, scripts/content-stats.ts), joined with what
 * readers did (Analytics Engine) and wrote (D1), and the daily totals kept in KV. Each loader fails on its own, for the
 * dashboard's soft(…); a build without content.json gives undefined.
 */

export const CONTENT_PATH = '/_ab/content.json'

/**
 * content.json, read through the Worker's ASSETS binding (any origin: the binding serves this deploy's files). Nobody
 * reaches the file by address: /_ab/* runs the Worker first, and adminRoute answers it 404 (worker/test/handler.test.ts).
 */
export async function loadContentStats(assets: Fetcher, origin: string): Promise<ContentStats | undefined> {
  const r = await assets.fetch(new Request(new URL(CONTENT_PATH, origin)))
  if (!r.ok) return undefined // the build's 404 page
  const s = (await r.json()) as ContentStats
  if (s?.v !== 1) throw new Error(`content.json v${String(s?.v)}: this Worker reads v1`)
  return s
}

export type PageInfo = { path: string; title: string; kind: PageKind; id?: string }
export const langOfPath = (path: string): Lang => prefixedLang(path) ?? 'vi'
const info = (kind: PageKind, [path, title, id]: PageRow): PageInfo => (id ? { path, title, kind, id } : { path, title, kind })

/** Every built page by its path. */
export function pageIndex(s: ContentStats): Map<string, PageInfo> {
  const m = new Map<string, PageInfo>()
  for (const [kind, rows] of Object.entries(s.pages ?? {}) as [PageKind, PageRow[]][]) for (const r of rows) m.set(r[0], info(kind, r))
  return m
}

/**
 * A path as the beacon sends it → the index's form: the site's pages all end in "/" (force-trailing-slash), and a view
 * of an old /vi/… address (before the Vietnamese pages moved to the root) counts for the page's address now.
 */
export const pagePathOf = (p: string) => {
  const path = withoutVi(p.split(/[?#]/)[0]!.replace(/index\.html$/, ''))
  return path.endsWith('/') ? path : `${path}/`
}

// ——— Reads (Analytics Engine) ———

export type PageView = { sid: string; p: string; views: number | string }
/** Views per session and page; the sessions come from readers.ts's query, so "reader" means what it means there. */
export const PAGE_VIEWS_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, blob3 AS p, SUM(_sample_interval) AS views
FROM ${table} WHERE blob2 = 'view' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${COUNTED} GROUP BY sid, p FORMAT JSON`

export type PageReads = { path: string; title: string; kind: PageKind; readers: number; views: number }
export type ContentReads = {
  days: number
  /** Reader sessions (readers.ts isReader) that opened at least one built page. */
  readers: number
  /** Per page kind: built pages, how many had a reader, distinct readers, views (every session's). */
  byKind: { kind: PageKind; pages: number; read: number; readers: number; views: number }[]
  /** Most-read pages: by readers, then views. */
  top: PageReads[]
  /** Built pages no reader opened in `days`: how many per kind, and the first `unreadList` (fish first, as the index lists them). */
  unread: { n: number; byKind: Partial<Record<PageKind, number>>; pages: PageInfo[] }
  /** Views of addresses this build doesn't have (an old address, a removed page, a typo). */
  elsewhere: { views: number; paths: number }
}

/** The page index joined with Analytics Engine's sessions and page views. Pure: the query is queryContentReads. */
export function joinReads(stats: ContentStats, sessions: Session[], views: PageView[], days: number, o: { top?: number; unreadList?: number } = {}): ContentReads {
  const index = pageIndex(stats)
  const readerSids = new Set(sessions.filter(isReader).map(s => s.sid))
  const per = new Map<string, { readers: Set<string>; views: number }>()
  const elsewhere = new Map<string, number>()
  for (const v of views) {
    const path = pagePathOf(v.p)
    if (!index.has(path)) { elsewhere.set(path, (elsewhere.get(path) ?? 0) + num(v.views)); continue }
    const x = per.get(path) ?? { readers: new Set<string>(), views: 0 }
    x.views += num(v.views)
    if (readerSids.has(v.sid)) x.readers.add(v.sid)
    per.set(path, x)
  }
  const kinds = new Map<PageKind, { pages: number; read: number; readers: Set<string>; views: number }>()
  const unread: PageInfo[] = []
  const unreadByKind: Partial<Record<PageKind, number>> = {}
  const anyReader = new Set<string>()
  for (const p of index.values()) {
    const k = kinds.get(p.kind) ?? { pages: 0, read: 0, readers: new Set<string>(), views: 0 }
    kinds.set(p.kind, k)
    k.pages++
    const x = per.get(p.path)
    if (x?.readers.size) {
      k.read++
      for (const sid of x.readers) { k.readers.add(sid); anyReader.add(sid) }
    } else {
      unread.push(p)
      unreadByKind[p.kind] = (unreadByKind[p.kind] ?? 0) + 1
    }
    k.views += x?.views ?? 0
  }
  const top = [...per].map(([path, x]) => ({ ...index.get(path)!, readers: x.readers.size, views: x.views }))
    .filter(x => x.readers > 0 || x.views > 0)
    .sort((a, b) => b.readers - a.readers || b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, o.top ?? 30)
    .map(({ path, title, kind, readers, views }) => ({ path, title, kind, readers, views }))
  return {
    days, readers: anyReader.size,
    byKind: [...kinds].map(([kind, k]) => ({ kind, pages: k.pages, read: k.read, readers: k.readers.size, views: k.views })).sort((a, b) => b.readers - a.readers || b.pages - a.pages),
    top,
    unread: { n: unread.length, byKind: unreadByKind, pages: unread.slice(0, o.unreadList ?? 100) },
    elsewhere: { views: [...elsewhere.values()].reduce((a, b) => a + b, 0), paths: elsewhere.size },
  }
}

export async function queryContentReads(accountId: string, token: string, stats: ContentStats, days = 30): Promise<ContentReads> {
  const [sessions, views] = await Promise.all([querySessions(accountId, token, days), eventsSql<PageView>(accountId, token, t => PAGE_VIEWS_SQL(days, t))])
  return joinReads(stats, sessions, views, days)
}

// ——— Comments, reader photos and affiliate clicks (D1) ———

/** The prefix pages give D1's entity_ref ("species:<id>"), by page kind. */
const REF: Partial<Record<PageKind, string>> = { fish: 'species', breed: 'breed', plant: 'plant', guide: 'guide', videoGuide: 'guide', equipment: 'equipment', product: 'product' }

/** The build's pages by the key D1 gives them: "species:<id>" on /vi/, "id:species:<id>" on /id/ (src/lib/talk.ts). */
export function pagesByRef(stats: ContentStats): Map<string, PageInfo> {
  const byRef = new Map<string, PageInfo>()
  for (const x of pageIndex(stats).values()) {
    const pre = REF[x.kind]
    if (!pre || !x.id) continue
    const lang = langOfPath(x.path)
    byRef.set(lang === 'vi' ? `${pre}:${x.id}` : `${lang}:${pre}:${x.id}`, x)
  }
  return byRef
}

export type PageTalk = { path: string; title: string; kind: PageKind; comments: number; photos: number }
export type Talk = {
  /** Approved comments and reader photos, on pages this build has. */
  comments: number
  photos: number
  byKind: { kind: PageKind; comments: number; photos: number }[]
  /** Pages with the most, comments first. */
  top: PageTalk[]
  /** On items this build no longer has a page for. */
  elsewhere: { comments: number; photos: number }
}

/**
 * Comments and reader photos per page. Each language has its own comments ("species:x" on /vi/, "id:species:x" on /id/,
 * src/lib/talk.ts); reader photos are shared, so they count on the Vietnamese page.
 */
export async function talkByPage(db: D1Database, stats: ContentStats, top = 20): Promise<Talk> {
  const [c, p] = await Promise.all([
    db.prepare("SELECT entity_ref AS ref, COUNT(*) AS n FROM comments WHERE status = 'approved' GROUP BY entity_ref").all<{ ref: string; n: number }>(),
    // A comment's photo counts on its comment's page.
    db.prepare("SELECT COALESCE(c.entity_ref, p.entity_ref) AS ref, COUNT(*) AS n FROM photos p LEFT JOIN comments c ON p.entity_ref = 'comment:' || c.id WHERE p.status = 'approved' GROUP BY 1").all<{ ref: string; n: number }>(),
  ])
  const byRef = pagesByRef(stats)
  const pages = new Map<string, PageTalk>()
  const out: Talk = { comments: 0, photos: 0, byKind: [], top: [], elsewhere: { comments: 0, photos: 0 } }
  const add = (rows: { ref: string; n: number }[], field: 'comments' | 'photos') => {
    for (const r of rows) {
      const page = byRef.get(r.ref)
      const n = num(r.n)
      if (!page) { out.elsewhere[field] += n; continue }
      const t = pages.get(page.path) ?? { path: page.path, title: page.title, kind: page.kind, comments: 0, photos: 0 }
      t[field] += n
      out[field] += n
      pages.set(page.path, t)
    }
  }
  add(c.results, 'comments')
  add(p.results, 'photos')
  const kinds = new Map<PageKind, { comments: number; photos: number }>()
  for (const t of pages.values()) {
    const k = kinds.get(t.kind) ?? { comments: 0, photos: 0 }
    k.comments += t.comments
    k.photos += t.photos
    kinds.set(t.kind, k)
  }
  out.byKind = [...kinds].map(([kind, k]) => ({ kind, ...k })).sort((a, b) => b.comments - a.comments || b.photos - a.photos)
  out.top = [...pages.values()].sort((a, b) => b.comments - a.comments || b.photos - a.photos || a.path.localeCompare(b.path)).slice(0, top)
  return out
}

export type KindClicks = {
  days: number
  /** From `since` (a Vietnam date, as clicks_daily keeps them) to today. */
  since: string
  clicks: number
  byKind: { kind: PageKind; clicks: number }[]
  top: { path: string; title: string; kind: PageKind; clicks: number }[]
  /** Clicks with no page: no entity (a link without one) or an item this build no longer has. */
  elsewhere: number
}

/**
 * Affiliate clicks per page kind, `days` days. Links name their page's item (src/lib/format.ts goLink); a video guide's
 * gear list names the guide by its slug, not its id ("guide:<slug>"), so both are matched.
 */
export async function clicksByKind(db: D1Database, stats: ContentStats, now: Date, days = 30, top = 20): Promise<KindClicks> {
  // clicks_daily's dates are Vietnam's (affiliate/go.ts vnDate).
  const since = new Date(now.getTime() + 7 * 3_600_000 - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const { results } = await db.prepare('SELECT entity_ref AS ref, SUM(n) AS n FROM clicks_daily WHERE date >= ? GROUP BY entity_ref').bind(since).all<{ ref: string; n: number }>()
  const byRef = new Map<string, PageInfo>()
  for (const x of pageIndex(stats).values()) {
    const pre = REF[x.kind]
    if (!pre || !x.id || langOfPath(x.path) !== 'vi') continue
    byRef.set(`${pre}:${x.id}`, x)
    if (pre === 'guide') byRef.set(`guide:${x.path.split('/').at(-2)}`, x)
  }
  const pages = new Map<string, { path: string; title: string; kind: PageKind; clicks: number }>()
  let clicks = 0, elsewhere = 0
  for (const r of results) {
    const page = byRef.get(r.ref)
    const n = num(r.n)
    clicks += n
    if (!page) { elsewhere += n; continue }
    const t = pages.get(page.path) ?? { path: page.path, title: page.title, kind: page.kind, clicks: 0 }
    t.clicks += n
    pages.set(page.path, t)
  }
  const kinds = new Map<PageKind, number>()
  for (const t of pages.values()) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + t.clicks)
  return {
    days, since, clicks, elsewhere,
    byKind: [...kinds].map(([kind, clicks]) => ({ kind, clicks })).sort((a, b) => b.clicks - a.clicks),
    top: [...pages.values()].sort((a, b) => b.clicks - a.clicks || a.path.localeCompare(b.path)).slice(0, top),
  }
}

// ——— Growth: a snapshot of the totals each day (KV) ———

export const SNAPSHOT_PREFIX = 'stats:'
/** KV's limit for a key's metadata: a snapshot this small rides in it, so one list() returns every day. */
export const METADATA_MAX = 1024

/** Today's totals (UTC day) from this deploy's content.json, under stats:YYYY-MM-DD; the daily cron's. Undefined without the file. */
export async function recordSnapshot(kv: KVNamespace, assets: Fetcher, origin: string, now: Date): Promise<Totals | undefined> {
  const s = await loadContentStats(assets, origin)
  if (!s) return undefined
  const kept = keepTotals(s.totals)
  const body = JSON.stringify(kept)
  await kv.put(`${SNAPSHOT_PREFIX}${now.toISOString().slice(0, 10)}`, body, new TextEncoder().encode(body).length <= METADATA_MAX ? { metadata: kept } : {})
  return s.totals
}

export type Snapshot = { day: string; totals: Totals }
/** Every day's totals, oldest first: from the keys' metadata (one list call per 1000 days), a key without it read on its own. */
export async function listSnapshots(kv: KVNamespace): Promise<Snapshot[]> {
  const out: Snapshot[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const r = await kv.list<KeptTotals>({ prefix: SNAPSHOT_PREFIX, ...(cursor ? { cursor } : {}) })
    for (const k of r.keys) {
      const kept = k.metadata ?? (await kv.get<KeptTotals>(k.name, 'json'))
      if (kept) out.push({ day: k.name.slice(SNAPSHOT_PREFIX.length), totals: readKept(kept) })
    }
    if (r.list_complete) break
    cursor = r.cursor
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

export type Added = { kinds: Record<EntityKind, ByLang>; sources: Record<string, number>; photos: Totals['photos'] }
/** What changed from one snapshot to a later one: items per kind and language, items per source, photos (negative: fewer). */
export function added(from: Totals, to: Totals): Added {
  const kinds = {} as Record<EntityKind, ByLang>
  for (const k of Object.keys(to.kinds) as EntityKind[]) {
    const a = from.kinds[k], b = to.kinds[k]
    kinds[k] = Object.fromEntries(LANGS.map(l => [l, (b[l] ?? 0) - (a?.[l] ?? 0)])) as ByLang
  }
  const sources: Record<string, number> = {}
  for (const s of new Set([...Object.keys(from.sources), ...Object.keys(to.sources)])) sources[s] = (to.sources[s] ?? 0) - (from.sources[s] ?? 0)
  return { kinds, sources, photos: { pages: to.photos.pages - from.photos.pages, gallery: to.photos.gallery - from.photos.gallery } }
}
