import { prefixedLang } from '@aq/schema/langs'
import { querySessions, type Session } from '../readers'
import type { Wanted } from '../wanted'
import { COUNTED, EVENTS, eventsSql, num } from './ae'
import { cellOf, figures, heading, note, table, textOf, type Block } from './blocks'
import { esc, fmtEn, tiles, type Tile } from './chart'
import { pageIndex, pagePathOf, type PageInfo } from './content'
import type { ContentStats } from './content-shape'

/**
 * Content quality (the content page's first part, and /_ab/noi-dung/quality.json for the writers' rewrite queue): a score
 * from 0 to 100 per page, from how its readers read it (the beacon, our own visits and automated bursts left out) and how
 * Google's searchers click it (Search Console, scripts/search-console.mjs), with what the engine knows of it (page-signals,
 * scripts/page-signals.ts); and five lists out of it. The formula is SCORE's and the page says it (HELP).
 */

/**
 * dist/_ab/page-signals.json (scripts/page-signals.ts): per path, [engine key, its quality score, the reader-fit checks it
 * fails, the reader review's findings, its last review's score, fixed by hand, last rewritten by the writers].
 */
export type PageSignals = { v: 1; pages: Record<string, [key: string, quality: number | null, fit: string[] | null, reader: number | null, review: number | null, fixed: boolean, rewritten: string | null]> }
/** What the daily Search Console job leaves in KV (GSC_KEY): 28 days to `to`, and the 28 before them. */
export type Gsc = {
  v: 1; at: string; from: string; to: string; prevFrom: string; prevTo: string
  /** Per page, by the site's path: [impressions, clicks, position, impressions before, clicks before]. */
  pages: Record<string, [number, number, number, number, number]>
  /** The top queries: [query, page path, impressions, clicks, position]. Google's searches, not what our readers type. */
  queries: [string, string, number, number, number][]
}
export const GSC_KEY = 'gsc:latest'
export const SIGNALS_PATH = '/_ab/page-signals.json'

export const SCORE = {
  days: 28,
  /** A page is ranked (on the best, worst and rewrite lists) with this many tabs, or this many impressions, in `days`. */
  minTabs: 20, minImpressions: 100,
  /** Until then each part is pulled towards a middle value as if it had this many more tabs or impressions. */
  kReading: 20, kSearch: 100,
} as const
/** Click rate a result usually gets at positions 1 to 10; 1% to 20, half that beyond. */
export const EXPECTED_CTR = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018]
export const expectedCtr = (pos: number) => (pos <= 10 ? EXPECTED_CTR[Math.max(0, Math.round(pos) - 1)]! : pos <= 20 ? 0.01 : 0.005)

export const HELP = `Score, 0 to 100. Reading, from our readers (our own visits and automated bursts left out): the average of three shares of a page’s tabs, those that scrolled half the page, stayed 30 s, and went on to another page. Search, from Google Search Console: the page’s click rate against what its position usually gets (position 1 about 28%, 3 about 10%, 10 about 2%), at most 1. Until there is enough data, reading is pulled towards its section’s average as if it had ${SCORE.kReading} more tabs, and search towards one half as if it had ${SCORE.kSearch} more impressions. Score = 100 × (2 × reading + search) ÷ 3, or the one there is. A page is ranked once it has ${SCORE.minTabs} tabs or ${SCORE.minImpressions} impressions in ${SCORE.days} days.`

/** Per tab and page, over `days`: its first view, views, how far it scrolled, how long it stayed, shop clicks. */
export type TabPage = { sid: string; p: string; first: string; views: number | string; scroll: number | string; t: number | string; shop: number | string }
export const TAB_PAGES_SQL = (days: number, table = EVENTS) => `SELECT blob4 AS sid, blob3 AS p, min(timestamp) AS first, SUM(IF(blob2 = 'view', _sample_interval, 0)) AS views,
  MAX(IF(blob2 = 'scroll', double1, 0.0)) AS scroll, MAX(IF(blob2 = 'time', double1, 0.0)) AS t, SUM(IF(blob2 = 'aff', _sample_interval, 0)) AS shop
FROM ${table} WHERE blob2 IN ('view', 'scroll', 'time', 'aff') AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${COUNTED} GROUP BY sid, p LIMIT 100000 FORMAT JSON`

export type Figures = { tabs: number; half: number; end: number; s30: number; next: number; shop: number; impressions: number; clicks: number; position: number; impressionsBefore: number; clicksBefore: number }
export type QualityRow = {
  path: string; title: string; section: string; key?: string
  /** null for a page with figures from before the window only: on the decaying list, with nothing to score. */
  score: number | null; ranked: boolean; reading?: number; search?: number; demand: number
  figures: Figures; quality?: number; fit?: string[]; reader?: number; review?: number
  /** `rewritten`: when the writers last rewrote it. `hold`: fixed by hand (the engine won't rewrite it), or rewritten too
   * lately (within SCORE.days) for its figures to say how the new text reads: on no list to rewrite, nor in the writers' feed. */
  fixed?: boolean; rewritten?: string; hold?: true
  why: string
}
export type QualityGap = { source: 'search' | 'wanted'; name: string; demand: number; why: string; path?: string }
export type Quality = {
  days: number; search?: { at: string; from: string; to: string }
  scored: number; ranked: number
  best: QualityRow[]; worst: QualityRow[]; rewrite: QualityRow[]; decaying: QualityRow[]; gaps: QualityGap[]
  /** How many each list has before it's cut to its first LIST (the gaps' to 2 × LIST). */
  totals: { rewrite: number; decaying: number; gaps: number }
}
/** The quality part's place on the content page. */
export const QUALITY_PATH = '/_ab/noi-dung/#chat-luong'

const LIST = 10
const pct = (x: number) => `${fmtEn(100 * x)}%`
/** A position as Google gives it, to a tenth: 2, 2.5. */
const posText = (x: number) => (Math.round(10 * x) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
const sectionOf = (p: PageInfo) => `${p.kind}·${prefixedLang(p.path) ?? 'vi'}`

/** Each page's figures from the beacon's tabs the count keeps (`counted`: none of ours, none automated) and Search Console's rows. */
function figuresByPage(index: Map<string, PageInfo>, tabs: TabPage[], counted: Set<string>, gsc: Gsc | undefined): Map<string, Figures> {
  const out = new Map<string, Figures>()
  const fig = (path: string) => out.get(path) ?? out.set(path, { tabs: 0, half: 0, end: 0, s30: 0, next: 0, shop: 0, impressions: 0, clicks: 0, position: 0, impressionsBefore: 0, clicksBefore: 0 }).get(path)!
  const bySid = new Map<string, TabPage[]>()
  for (const r of tabs) {
    if (!counted.has(r.sid) || num(r.views) <= 0) continue
    const rows = bySid.get(r.sid)
    if (rows) rows.push(r)
    else bySid.set(r.sid, [r])
  }
  for (const rows of bySid.values()) {
    const last = rows.reduce((a, b) => (b.first > a.first ? b : a)).first
    for (const r of rows) {
      const path = pagePathOf(r.p)
      if (!index.has(path)) continue
      const f = fig(path)
      f.tabs++
      if (num(r.scroll) >= 50) f.half++
      if (num(r.scroll) >= 90) f.end++
      if (num(r.t) >= 30) f.s30++
      if (r.first < last) f.next++
      f.shop += num(r.shop)
    }
  }
  for (const [p, [impressions, clicks, position, impressionsBefore, clicksBefore]] of Object.entries(gsc?.pages ?? {})) {
    const path = pagePathOf(p)
    if (!index.has(path)) continue
    Object.assign(fig(path), { impressions, clicks, position, impressionsBefore, clicksBefore })
  }
  return out
}

const rawReading = (f: Pick<Figures, 'tabs' | 'half' | 's30' | 'next'>) => (f.half + f.s30 + f.next) / (3 * f.tabs)

/** The score and lists. Pure: the queries are queryQuality's. `sessions`: the tabs the count keeps (readers.ts querySessions). */
export function summariseQuality(stats: ContentStats, tabs: TabPage[], sessions: Session[], gsc: Gsc | undefined, signals: PageSignals | undefined, wanted: Wanted[] = [], now = new Date()): Quality {
  const index = pageIndex(stats)
  const figs = figuresByPage(index, tabs, new Set(sessions.map(s => s.sid)), gsc)
  // Each section's reading, pooled over its pages' tabs: where a page with few tabs is pulled to.
  const pooled = new Map<string, { tabs: number; half: number; s30: number; next: number }>()
  for (const [path, f] of figs) {
    const s = sectionOf(index.get(path)!)
    const x = pooled.get(s) ?? { tabs: 0, half: 0, s30: 0, next: 0 }
    pooled.set(s, { tabs: x.tabs + f.tabs, half: x.half + f.half, s30: x.s30 + f.s30, next: x.next + f.next })
  }
  const all = [...pooled.values()].reduce((a, x) => ({ tabs: a.tabs + x.tabs, half: a.half + x.half, s30: a.s30 + x.s30, next: a.next + x.next }), { tabs: 0, half: 0, s30: 0, next: 0 })
  const sectionMean = (s: string) => { const x = pooled.get(s); return x?.tabs ? rawReading(x) : all.tabs ? rawReading(all) : 0.5 }

  const rows: QualityRow[] = []
  for (const [path, f] of figs) {
    // A page Google stopped showing still has its figures from before: the decaying list's worst case.
    if (!f.tabs && !f.impressions && !f.impressionsBefore && !f.clicksBefore) continue
    const p = index.get(path)!
    const section = sectionOf(p)
    const reading = f.tabs ? (f.tabs * rawReading(f) + SCORE.kReading * sectionMean(section)) / (f.tabs + SCORE.kReading) : undefined
    const ratio = f.impressions ? Math.min(1, f.clicks / f.impressions / expectedCtr(f.position)) : undefined
    const search = ratio === undefined ? undefined : (f.impressions * ratio + SCORE.kSearch * 0.5) / (f.impressions + SCORE.kSearch)
    const part = reading !== undefined && search !== undefined ? (2 * reading + search) / 3 : (reading ?? search)
    const score = part === undefined ? null : Math.round(100 * part)
    const s = signals?.pages[path]
    rows.push({
      path, title: p.title, section, ...(s ? { key: s[0] } : {}),
      score, ranked: f.tabs >= SCORE.minTabs || f.impressions >= SCORE.minImpressions, ...(reading !== undefined ? { reading } : {}), ...(search !== undefined ? { search } : {}),
      demand: f.impressions + 10 * f.tabs, figures: f,
      ...(s?.[1] != null ? { quality: s[1] } : {}), ...(s?.[2] != null ? { fit: s[2] } : {}), ...(s?.[3] != null ? { reader: s[3] } : {}), ...(s?.[4] != null ? { review: s[4] } : {}),
      ...(s?.[5] ? { fixed: true } : {}), ...(s?.[6] ? { rewritten: s[6] } : {}),
      ...(s?.[5] || (s?.[6] && now.getTime() - Date.parse(s[6]) < SCORE.days * 86_400_000) ? { hold: true as const } : {}),
      why: '',
    })
  }

  const read = (r: QualityRow) => r.figures.tabs ? `${fmtEn(r.figures.tabs)} tabs: ${pct(r.figures.half / r.figures.tabs)} read half, ${pct(r.figures.s30 / r.figures.tabs)} stayed 30 s, ${pct(r.figures.next / r.figures.tabs)} went on` : ''
  const seen = (r: QualityRow) => r.figures.impressions ? `Google: ${fmtEn(r.figures.impressions)} impressions at position ${posText(r.figures.position)}, ${pct(r.figures.clicks / r.figures.impressions)} clicked (usual ${pct(expectedCtr(r.figures.position))})` : ''
  const both = (r: QualityRow) => [read(r), seen(r)].filter(Boolean).join('; ')
  const titleFix = (r: QualityRow) => r.figures.impressions >= SCORE.minImpressions && r.figures.position <= 10 && r.figures.clicks / r.figures.impressions < expectedCtr(r.figures.position) / 2
  // A ranked page has tabs or impressions, so a score.
  const sc = (r: QualityRow) => r.score ?? 0
  const ranked = rows.filter(r => r.ranked).sort((a, b) => sc(b) - sc(a) || b.demand - a.demand || a.path.localeCompare(b.path))
  const half = Math.ceil(ranked.length / 2)
  const best = ranked.slice(0, Math.min(LIST, half)).map(r => ({ ...r, why: both(r) }))
  const worst = ranked.slice(half).reverse().slice(0, LIST).map(r => ({ ...r, why: both(r) }))
  const toRewrite = rows.filter(r => !r.hold && ((r.ranked && sc(r) < 50) || titleFix(r)))
  const rewrite = toRewrite
    .sort((a, b) => b.demand - a.demand || sc(a) - sc(b))
    .slice(0, LIST)
    .map(r => ({ ...r, why: titleFix(r) ? `${seen(r)}: the title and description need work` : `Read by few of the people who come. ${both(r)}` }))
  const drop = (r: QualityRow) => Math.max(
    r.figures.impressionsBefore >= 50 ? 1 - r.figures.impressions / r.figures.impressionsBefore : 0,
    r.figures.clicksBefore >= 5 ? 1 - r.figures.clicks / r.figures.clicksBefore : 0)
  const decayed = rows.filter(r => !r.hold && drop(r) >= 0.3)
  const decaying = decayed.sort((a, b) => drop(b) - drop(a)).slice(0, LIST)
    .map(r => ({ ...r, why: `Google, the last ${SCORE.days} days against the ${SCORE.days} before: impressions ${fmtEn(r.figures.impressionsBefore)} → ${fmtEn(r.figures.impressions)}, clicks ${fmtEn(r.figures.clicksBefore)} → ${fmtEn(r.figures.clicks)}` }))

  // Gaps: what Google shows us for without a page that answers it (best position past 15), and names readers looked for.
  const queries = new Map<string, { impressions: number; position: number; path: string }>()
  for (const [q, path, impressions, , position] of gsc?.queries ?? []) {
    const x = queries.get(q)
    if (!x) queries.set(q, { impressions, position, path })
    else { x.impressions += impressions; if (position < x.position) Object.assign(x, { position, path }) }
  }
  const allGaps: QualityGap[] = [
    ...[...queries].filter(([, x]) => x.impressions >= 10 && x.position > 15)
      .map(([name, x]) => ({ source: 'search' as const, name, demand: x.impressions, path: pagePathOf(x.path), why: `Google showed us ${fmtEn(x.impressions)} times for it, at best at position ${posText(x.position)}: no page answers it` })),
    ...wanted.map(w => ({ source: 'wanted' as const, name: w.name, demand: 10 * w.readers, why: `${fmtEn(w.readers)} ${w.readers === 1 ? 'reader' : 'readers'} looked for it (${Object.keys(w.sources).join(', ')}); no page yet` })),
  ].sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name))
  const gaps = allGaps.slice(0, 2 * LIST)

  return {
    days: SCORE.days, ...(gsc ? { search: { at: gsc.at, from: gsc.from, to: gsc.to } } : {}),
    scored: rows.filter(r => r.score !== null).length, ranked: ranked.length, best, worst, rewrite, decaying, gaps,
    totals: { rewrite: toRewrite.length, decaying: decayed.length, gaps: allGaps.length },
  }
}

/** This deploy's page-signals.json, read as content.json is; undefined for a build before it. */
export async function loadSignals(assets: Fetcher, origin: string): Promise<PageSignals | undefined> {
  const r = await assets.fetch(new Request(new URL(SIGNALS_PATH, origin)))
  if (!r.ok) return undefined
  const s = (await r.json()) as PageSignals
  if (s?.v !== 1 || typeof s.pages !== 'object') throw new Error(`page-signals.json v${String(s?.v)}: this Worker reads v1`)
  return s
}

export async function queryQuality(accountId: string, token: string, stats: ContentStats, gsc: Gsc | undefined, signals: PageSignals | undefined, wanted: Wanted[]): Promise<Quality> {
  const [tabs, sessions] = await Promise.all([eventsSql<TabPage>(accountId, token, t => TAB_PAGES_SQL(SCORE.days, t)), querySessions(accountId, token, SCORE.days)])
  return summariseQuality(stats, tabs, sessions, gsc, signals, wanted)
}

// ——— Search Console's figures, from the daily job ———

const MAX_GSC = 2_000_000
const isRow = (x: unknown, n: number) => Array.isArray(x) && x.length === n
/** POST /_ab/search-console (the dashboard token as a bearer): the daily job's figures, kept as they are, replacing the last. */
export async function searchConsoleRoute(req: Request, kv: KVNamespace | undefined, bearer: boolean): Promise<Response> {
  if (req.method !== 'POST' || !bearer) return new Response('Not found', { status: 404 })
  if (!kv) return Response.json({ error: 'not_configured' }, { status: 503 })
  const text = await req.text()
  if (text.length > MAX_GSC) return Response.json({ error: 'too_large' }, { status: 413 })
  let g: Gsc
  try { g = JSON.parse(text) } catch { return Response.json({ error: 'bad_request' }, { status: 400 }) }
  const ok = g?.v === 1 && [g.at, g.from, g.to, g.prevFrom, g.prevTo].every(x => typeof x === 'string')
    && g.pages && typeof g.pages === 'object' && Object.values(g.pages).every(r => isRow(r, 5) && r.every(Number.isFinite))
    && Array.isArray(g.queries) && g.queries.every(r => isRow(r, 5) && typeof r[0] === 'string' && typeof r[1] === 'string' && r.slice(2).every(Number.isFinite))
  if (!ok) return Response.json({ error: 'bad_request' }, { status: 400 })
  await kv.put(GSC_KEY, text)
  return Response.json({ stored: true, pages: Object.keys(g.pages).length, queries: g.queries.length }, { headers: { 'cache-control': 'no-store' } })
}
export const loadGsc = (kv: KVNamespace | undefined) => (kv ? kv.get<Gsc>(GSC_KEY, { type: 'json' }) : Promise.resolve(null))

// ——— On the content page ———

export const QUALITY_TITLE = 'Quality'
const LISTS = [
  ['rewrite', 'Rewrite first', 'Demand but weak reading, or a good Google position few click'],
  ['decaying', 'Decaying', `Google impressions or clicks down 30% or more against the ${SCORE.days} days before`],
  ['gaps', 'Gaps: asked for, not written', 'What Google shows us for without an answer, and names readers looked for'],
  ['best', 'Best pages', 'The highest scores among ranked pages'],
  ['worst', 'Worst pages', 'The lowest scores among ranked pages'],
] as const
const HEAD = ['Page', 'Score', 'Why']
const GAP_HEAD = ['Asked for', 'From', 'Why']
const link = (path: string, title: string) => `<a href="${esc(path)}">${esc(title || path)}</a>`

function parts(q: Quality) {
  const tilesOf: Tile[] = [
    { label: 'Pages with data', value: fmtEn(q.scored) },
    { label: 'Ranked', value: fmtEn(q.ranked), sub: `${SCORE.minTabs}+ tabs or ${SCORE.minImpressions}+ impressions in ${q.days} days` },
    { label: 'Search Console', value: q.search ? `${q.search.from} to ${q.search.to}` : 'not yet', ...(q.search ? {} : { sub: 'the daily job hasn’t run' }) },
  ]
  return { tilesOf }
}
const rowsOf = (xs: QualityRow[]) => xs.map(r => [link(r.path, r.title), r.score === null ? '—' : fmtEn(r.score), esc(r.why)])
const gapRows = (xs: QualityGap[]) => xs.map(g => [esc(g.name), g.source === 'search' ? 'Google' : 'readers', esc(g.why)])
const empty = (id: string) => (id === 'gaps' ? 'No gap with enough demand yet.' : 'No page has enough data yet.')

export function qualityHtml(q: Quality | { failed: string } | undefined): string {
  let out = `<h2 id="chat-luong">${QUALITY_TITLE}</h2><p class="lede">${esc(HELP)}</p>`
  if (!q) return `${out}<p class="muted">Not loaded: no Analytics Engine or content.json.</p>`
  if ('failed' in q) return `${out}<p class="muted">Couldn’t load: ${esc(q.failed)}</p>`
  out += tiles(parts(q).tilesOf)
  for (const [id, title, sub] of LISTS) {
    const xs = id === 'gaps' ? gapRows(q.gaps) : rowsOf(q[id])
    out += `<h3 id="q-${id}">${title}</h3><p class="muted">${esc(sub)}</p>`
    out += xs.length ? `<div class="scroll"><table class="wide"><thead><tr>${(id === 'gaps' ? GAP_HEAD : HEAD).map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${xs.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="muted">${empty(id)}</p>`
  }
  return out
}

export function qualityBlocks(q: Quality | { failed: string } | undefined): Block[] {
  const out: Block[] = [heading(QUALITY_TITLE, 2, 'chat-luong'), note(HELP)]
  if (!q) return [...out, note('Not loaded: no Analytics Engine or content.json.', 'muted')]
  if ('failed' in q) return [...out, note(`Couldn’t load: ${q.failed}`, 'bad')]
  out.push(figures(parts(q).tilesOf, 'en'))
  for (const [id, title, sub] of LISTS) {
    const xs = id === 'gaps' ? gapRows(q.gaps) : rowsOf(q[id])
    out.push(heading(title, 3), note(sub, 'muted'), table(id === 'gaps' ? GAP_HEAD : HEAD, xs.map(r => r.map(c => cellOf(c))), { empty: empty(id) }))
  }
  return out
}

/**
 * The lists for the writers' rewrite queue (agreed with them): each page once per list, by its engine key and path, with
 * its figures, the reader-fit checks it fails, the reader review's findings and its last review's score. Pages on hold
 * (fixed by hand, or lately rewritten) are left out, and so are pages with no engine key (the home page, a section's
 * list), which the writers can't rewrite: the owner's lists keep them.
 */
export const qualityJson = (q: Quality) => ({
  v: 1, days: q.days, ...(q.search ? { search: q.search } : {}),
  pages: (['rewrite', 'decaying', 'worst', 'best'] as const).flatMap(list => q[list].filter(r => !r.hold && r.key).map((r, i) => ({
    list, priority: i + 1, path: r.path, key: r.key!, title: r.title, score: r.score, why: r.why, figures: r.figures,
    ...(r.quality !== undefined ? { quality: r.quality } : {}), ...(r.fit !== undefined ? { fit: r.fit } : {}), ...(r.reader !== undefined ? { reader: r.reader } : {}), ...(r.review !== undefined ? { review: r.review } : {}),
    ...(r.rewritten ? { rewritten: r.rewritten } : {}),
  }))),
  gaps: q.gaps.map((g, i) => ({ priority: i + 1, ...g })),
})
