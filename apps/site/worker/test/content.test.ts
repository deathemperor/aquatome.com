import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { LANGS } from '@aq/schema/langs'
import { added, clicksByKind, joinReads, listSnapshots, loadContentStats, loadLowScores, pageIndex, queryContentReads, recordSnapshot, talkByPage, type ContentStats, type Totals } from '../admin/content'
import { keepTotals, readKept } from '../admin/content-shape'
import { testD1 } from './d1'

// The fixture build's own content.json (pnpm test builds the site first): the loaders read what the script wrote.
const BODY = readFileSync(fileURLToPath(new URL('../../dist/_ab/content.json', import.meta.url).href), 'utf8')
const STATS = JSON.parse(BODY) as ContentStats
const NOW = new Date('2026-11-02T10:00:00Z')

/** ASSETS as the binding answers: the file, or the build's 404 page. */
const assets = (body: string | null = BODY) => {
  const seen: string[] = []
  return {
    seen,
    fetch: async (r: Request) => {
      seen.push(r.url)
      return body !== null && new URL(r.url).pathname === '/_ab/content.json'
        ? new Response(body, { headers: { 'content-type': 'application/json' } })
        : new Response('<!doctype html><h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } })
    },
  } as unknown as Fetcher & { seen: string[] }
}

/** KV with metadata and list by prefix, two keys a page (so the cursor is followed). */
function kv() {
  const m = new Map<string, { value: string; metadata?: unknown }>()
  return {
    m,
    get: async (k: string, type?: string) => { const v = m.get(k)?.value; return v === undefined ? null : type === 'json' ? JSON.parse(v) : v },
    put: async (k: string, value: string, o: { metadata?: unknown } = {}) => { m.set(k, { value, ...(o.metadata ? { metadata: o.metadata } : {}) }) },
    list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
      const names = [...m.keys()].filter(k => k.startsWith(prefix)).sort()
      const at = Number(cursor ?? 0)
      const keys = names.slice(at, at + 2).map(name => ({ name, ...(m.get(name)!.metadata ? { metadata: m.get(name)!.metadata } : {}) }))
      return at + 2 >= names.length ? { keys, list_complete: true } : { keys, list_complete: false, cursor: String(at + 2) }
    },
  } as unknown as KVNamespace & { m: typeof m }
}

afterEach(() => vi.restoreAllMocks())

test('the loader reads content.json through ASSETS; a build without it gives undefined; another version is an error', async () => {
  const a = assets()
  const s = await loadContentStats(a, 'https://aquatome.com')
  expect(s?.v).toBe(1)
  expect(s?.inventory.fish.total).toBe(9)
  expect(a.seen).toEqual(['https://aquatome.com/_ab/content.json'])
  expect(await loadContentStats(assets(null), 'https://aquatome.com')).toBeUndefined()
  await expect(loadContentStats(assets(JSON.stringify({ v: 2 })), 'https://x.test')).rejects.toThrow('content.json v2')
  // Every built page by path, each with its kind and, for an item's page, its item.
  const index = pageIndex(STATS)
  expect(index.size).toBe(181)
  expect(index.get('/ca/ca-neon-vua/')).toEqual({ path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', id: 'paracheirodon-axelrodi' })
})

const sessions = [
  { sid: 's1', first: '2026-11-01 07:00:00', pages: '3', t: '60', scroll: '0' },
  { sid: 's2', first: '2026-11-01 08:00:00', pages: '1', t: '0', scroll: '90' },
  { sid: 's3', first: '2026-11-01 09:00:00', pages: '2', t: '0', scroll: '0' }, // a bounce: not a reader
]
const views = [
  { sid: 's1', p: '/vi/ca/ca-neon-vua/', views: '2' }, // its old address (before the Vietnamese pages moved to the root): the same page
  { sid: 's1', p: '/huong-dan/thay-nuoc-dung-cach', views: '1' }, // no trailing slash: the same page
  { sid: 's2', p: '/ca/ca-neon-vua/', views: '1' },
  { sid: 's3', p: '/cay/monte-carlo/', views: '1' },
  { sid: 's3', p: '/ca/ca-cu/', views: '4' }, // an address this build doesn't have
]

test('reads: readers per page kind, the most-read pages with their titles, the pages no reader opened', () => {
  const r = joinReads(STATS, sessions, views, 30)
  expect(r.readers).toBe(2)
  expect(r.byKind.find(k => k.kind === 'fish')).toEqual({ kind: 'fish', pages: 10, read: 1, readers: 2, views: 3 })
  expect(r.byKind.find(k => k.kind === 'guide')).toEqual({ kind: 'guide', pages: 8, read: 1, readers: 1, views: 1 })
  // Viewed, but by no reader: counts as views, not as read.
  expect(r.byKind.find(k => k.kind === 'plant')).toEqual({ kind: 'plant', pages: 5, read: 0, readers: 0, views: 1 })
  expect(r.top.map(p => [p.path, p.title, p.kind, p.readers, p.views])).toEqual([
    ['/ca/ca-neon-vua/', 'Cá neon vua', 'fish', 2, 3],
    ['/huong-dan/thay-nuoc-dung-cach/', 'Thay nước đúng cách', 'guide', 1, 1],
    ['/cay/monte-carlo/', 'Monte Carlo', 'plant', 0, 1],
  ])
  expect(r.unread.n).toBe(179)
  expect(r.unread.byKind).toMatchObject({ fish: 9, guide: 7, plant: 5 })
  expect(r.unread.pages.map(p => p.path)).not.toContain('/ca/ca-neon-vua/')
  expect(r.unread.pages).toHaveLength(100)
  expect(r.elsewhere).toEqual({ views: 4, paths: 1 })
  // Readers per page that had one: what orders the pages out of search.
  expect(r.readersOf).toEqual({ '/ca/ca-neon-vua/': 2, '/huong-dan/thay-nuoc-dung-cach/': 1 })
  // A view in a tab the count leaves out (ours, or likely automated: not in the sessions) counts nowhere, views included.
  expect(joinReads(STATS, sessions, [...views, { sid: 'ours', p: '/ca/ca-neon-vua/', views: '5' }, { sid: 'ours', p: '/ca/ca-cu/', views: '1' }], 30)).toEqual(r)
})

test('the pages out of search for their score: reviews.json through ASSETS; a build without it gives undefined; another shape is an error', async () => {
  const LOW = readFileSync(fileURLToPath(new URL('../../dist/_ab/reviews.json', import.meta.url).href), 'utf8')
  const at = (body: string | null) => ({
    fetch: async (r: Request) => (body !== null && new URL(r.url).pathname === '/_ab/reviews.json'
      ? new Response(body, { headers: { 'content-type': 'application/json' } })
      : new Response('<!doctype html><h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } })),
  }) as unknown as Fetcher
  const low = await loadLowScores(at(LOW), 'https://aquatome.com')
  expect(low!.pages.map(p => [p.path, p.kind, p.score])).toEqual([['/ca/ca-la-han/', 'breed', 0.6], ['/huong-dan/thay-nuoc-dung-cach/', 'guide', 0.6], ['/thuat-ngu/gh/', 'glossary', 0.6], ['/ca/ca-boraras-do/', 'fish', 0.61]])
  expect(await loadLowScores(at(null), 'https://aquatome.com')).toBeUndefined()
  await expect(loadLowScores(at('{"v":2,"pages":[]}'), 'https://aquatome.com')).rejects.toThrow('reviews.json v2: this Worker reads v1')
  // content.json's shape isn't this file's.
  await expect(loadLowScores(at(BODY), 'https://aquatome.com')).rejects.toThrow('reviews.json v1')
})

test('reads: the two Analytics Engine queries, over the days asked for, on the beacon\'s dataset, from the count\'s reset on', async () => {
  const sent: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
    const q = String(init?.body)
    sent.push(q)
    return Response.json({ data: q.includes('min(timestamp)') ? sessions : views })
  })
  const r = await queryContentReads('acc', 'tok', STATS, 7)
  expect(r.days).toBe(7)
  expect(r.readers).toBe(2)
  expect(sent).toHaveLength(2)
  expect(sent.every(q => q.includes("INTERVAL '7' DAY") && q.includes("timestamp >= toDateTime('2026-11-05 03:10:00')"))).toBe(true)
  expect(sent.map(q => q.match(/FROM (\w+)/)![1])).toEqual(['aquatome_events', 'aquatome_events'])
  expect(sent.some(q => /GROUP BY sid, p FORMAT JSON/.test(q))).toBe(true)
})

test('comments and reader photos per page: each language\'s comments on its own page, photos on the Vietnamese one', async () => {
  const db = testD1()
  const guide = STATS.pages!.guide!.find(r => r[0] === '/huong-dan/thay-nuoc-dung-cach/')![2]!
  const c = (id: string, ref: string, status: string) => db.prepare("INSERT INTO comments (id, entity_ref, name, body, status, created_at) VALUES (?, ?, 'A', 'b', ?, '2026-11-01T00:00:00Z')").bind(id, ref, status).run()
  await c('c1', 'species:paracheirodon-axelrodi', 'approved')
  await c('c2', 'species:paracheirodon-axelrodi', 'approved')
  await c('c3', 'species:paracheirodon-axelrodi', 'held')
  await c('c4', 'id:species:paracheirodon-axelrodi', 'approved') // the fixture has no Indonesian fish page
  await c('c5', `guide:${guide}`, 'approved')
  const p = (id: string, ref: string, status: string) => db.prepare("INSERT INTO photos (id, entity_ref, name, status, delete_hash, created_at) VALUES (?, ?, 'A', ?, 'h', '2026-11-01T00:00:00Z')").bind(id, ref, status).run()
  await p('p1', 'species:paracheirodon-axelrodi', 'approved')
  await p('p2', 'species:paracheirodon-axelrodi', 'pending')
  await p('p3', 'species:gone', 'approved')
  const t = await talkByPage(db, STATS)
  expect([t.comments, t.photos]).toEqual([3, 1])
  expect(t.elsewhere).toEqual({ comments: 1, photos: 1 })
  expect(t.top).toEqual([
    { path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', comments: 2, photos: 1 },
    { path: '/huong-dan/thay-nuoc-dung-cach/', title: 'Thay nước đúng cách', kind: 'guide', comments: 1, photos: 0 },
  ])
  expect(t.byKind).toEqual([{ kind: 'fish', comments: 2, photos: 1 }, { kind: 'guide', comments: 1, photos: 0 }])
})

test('affiliate clicks per page kind; a video guide\'s gear list names the guide by its slug', async () => {
  const db = testD1()
  const click = (date: string, ref: string, n: number) => db.prepare("INSERT INTO clicks_daily VALUES (?, 'shopee', 'thuc-an', ?, 'search', ?)").bind(date, ref, n).run()
  await click('2026-11-02', 'species:paracheirodon-axelrodi', 3)
  await click('2026-10-20', 'guide:bon-phan-cho-cay-thuy-sinh', 2)
  await click('2026-11-01', 'equipment:loc', 1)
  await click('2026-11-01', '', 4)
  await click('2026-09-01', 'species:paracheirodon-axelrodi', 9) // older than 30 days
  const k = await clicksByKind(db, STATS, NOW)
  expect([k.since, k.clicks, k.elsewhere]).toEqual(['2026-10-04', 10, 4])
  expect(k.byKind).toEqual([{ kind: 'fish', clicks: 3 }, { kind: 'videoGuide', clicks: 2 }, { kind: 'equipment', clicks: 1 }])
  expect(k.top[1]).toEqual({ path: '/huong-dan/bon-phan-cho-cay-thuy-sinh/', title: 'Bón phân cho cây thủy sinh', kind: 'videoGuide', clicks: 2 })
})

test('growth: the day\'s totals kept under stats:YYYY-MM-DD with them as metadata, and every day read back in order', async () => {
  const store = kv()
  expect(await recordSnapshot(store, assets(), 'https://aquatome.com', NOW)).toEqual(STATS.totals)
  // Kept as rows in the language table's order, with the order beside them: by name, seven languages would pass KV's 1 KB.
  const today = keepTotals(STATS.totals)
  expect(today.kinds.fish).toEqual(LANGS.map(l => STATS.totals.kinds.fish[l]))
  expect(today.langs).toEqual(LANGS)
  expect(store.m.get('stats:2026-11-02')).toEqual({ value: JSON.stringify(today), metadata: today })
  // Days loaded without metadata are read one by one; a build without content.json records nothing. Days kept before
  // 2026-11-06 hold each count as [vi, id, th]: they read back by language, whether from the metadata or the value.
  // Malay joined later: those days count none of it.
  const noMs = Object.fromEntries(Object.entries(STATS.totals.kinds).map(([k, n]) => [k, { ...n, ms: 0 }])) as Totals['kinds']
  const older: Totals = { ...STATS.totals, kinds: { ...noMs, fish: { vi: 5, id: 0, th: 0, ms: 0 } }, sources: { seriouslyfish: 4 }, built: { vi: 7, id: 2, th: 1, ms: 0 } }
  const kept = { ...older, kinds: Object.fromEntries(Object.entries(older.kinds).map(([k, n]) => [k, [n.vi, n.id, n.th]])), built: [7, 2, 1] }
  await store.put('stats:2026-10-30', JSON.stringify(kept))
  await store.put('stats:2026-10-31', JSON.stringify(kept), { metadata: kept })
  expect(await recordSnapshot(store, assets(null), 'https://aquatome.com', new Date('2026-11-03T20:17:00Z'))).toBeUndefined()
  const days = await listSnapshots(store)
  expect(days.map(d => d.day)).toEqual(['2026-10-30', '2026-10-31', '2026-11-02'])
  expect(days[0]!.totals).toEqual(older)
  expect(days[1]!.totals).toEqual(older)
  // Rows read by the order kept with them, 0 for a language the day had none for.
  expect(readKept({ ...today, kinds: { ...today.kinds, fish: [1, 5] }, langs: ['th', 'vi'] }).kinds.fish).toEqual({ vi: 5, id: 0, th: 1, ms: 0 })
  const a = added(days[0]!.totals, days[2]!.totals)
  expect(a.kinds.fish).toEqual({ vi: 4, id: 0, th: 0, ms: 1 })
  expect(a.sources).toMatchObject({ seriouslyfish: 3, youtube: 2 })
  expect(a.photos).toEqual({ pages: 0, gallery: 0 })
})

test('the daily cron records the snapshot beside its other jobs; one failing doesn\'t stop the rest', async () => {
  const worker = (await import('../index')).default
  const store = kv()
  await worker.scheduled({} as ScheduledController, { AB: store, ASSETS: assets(), CANONICAL_HOST: 'aquatome.com' } as never)
  expect([...store.m.keys()]).toEqual([`stats:${new Date().toISOString().slice(0, 10)}`])
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const broken = { fetch: async () => { throw new Error('assets down') } } as unknown as Fetcher
  await expect(worker.scheduled({} as ScheduledController, { AB: kv(), ASSETS: broken } as never)).resolves.toBeUndefined()
  expect(String(err.mock.calls[0]?.[1])).toContain('assets down')
})
