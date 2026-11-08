import { afterEach, expect, test, vi } from 'vitest'
import { APP_SQL, automated, BURST, queryReaders, sourceOf, summariseAppReads, summariseReaders, type Session } from '../readers'
import { overviewPage, readersPage, readersSection } from '../admin/pages'
import type { ChartBlock } from '../admin/blocks'
import { unset } from '../admin/shell'
import { visitsOf } from '../admin/scoreboard'

test('readers: sessions that scrolled half a page or stayed 30 s; sources, top pages and countries from readers', () => {
  // Each tab's referrer and country are its first event's; '=' is one of our own pages, a tab a reader opened from ours.
  const sessions = [
    { sid: 'a', first: '2026-10-29 07:00:00', pages: '2', t: '60', scroll: '0', ref: 'www.google.com.vn', cc: 'VN', who: '0' },
    { sid: 'b', first: '2026-10-29 08:00:00', pages: '1', t: '0', scroll: '90', ref: '=', cc: 'US', who: '0' },
    { sid: 'c', first: '2026-10-28 09:00:00', pages: '1', t: '0', scroll: '0', ref: 'www.facebook.com', cc: 'SG', who: '0' }, // a bounce (or a bot running JS)
  ]
  const views = [
    { sid: 'a', p: '/vi/ca/ca-betta/', views: '1' }, // its old address: the same page
    { sid: 'a', p: '/thiet-bi/loc/', views: '1' },
    { sid: 'b', p: '/ca/ca-betta/', views: '1' },
    { sid: 'c', p: '/', views: '1' },
  ]
  const r = summariseReaders(sessions, views, 14)
  expect(r).toMatchObject({ sessions: 3, readers: 2 })
  expect(r.daily).toEqual([{ day: '2026-10-29', sessions: 2, readers: 2 }, { day: '2026-10-28', sessions: 1, readers: 0 }])
  expect(r.pages[0]).toEqual({ path: '/ca/ca-betta/', views: 2 })
  expect(r.sources).toEqual([{ source: '(trực tiếp)', sessions: 1, readers: 1 }, { source: 'facebook', sessions: 1, readers: 0 }, { source: 'google', sessions: 1, readers: 1 }])
  expect(r.countries).toEqual([{ cc: 'US', readers: 1 }, { cc: 'VN', readers: 1 }])
  expect(sourceOf('l.facebook.com')).toBe('facebook')
  expect(sourceOf('www.aquariumcoop.com')).toBe('aquariumcoop.com')
  const now = new Date('2026-10-29T12:00:00Z')
  const html = readersPage(now, r)
  expect(html).toContain('Người đọc thật')
  expect(html).toContain('/ca/ca-betta/')
  expect(html).toContain('Phiên và người đọc mỗi ngày')
  expect(html).toContain('<a href="/ca/ca-betta/">')
  // A path is whatever a script sent to the beacon: only the site's own pages become links.
  const forged = readersPage(now, { ...r, pages: [{ path: '//evil.example/login', views: 9 }, { path: '/\\evil.example', views: 8 }] })
  expect(forged).not.toContain('href="//evil')
  expect(forged).not.toContain('href="/\\')
  expect(forged).toContain('//evil.example/login')
  // The overview counts readers over 7 days and links to their page, which has the details.
  const dash = overviewPage({ now, readers: r.daily, clicks: unset('D1'), fish: unset('AE'), keys: undefined, photos: unset('ảnh'), waiting: unset('D1'), wanted: unset('KV'), accounts: unset('D1'), hidden: unset('KV'), content: unset('ASSETS'), snapshots: unset('KV') })
  expect(dash).toContain('href="/_ab/doc-gia/"')
  expect(dash).toContain('người đọc · 7 ngày')
  expect(dash).not.toContain('/ca/ca-betta/')
  // Not configured, or Analytics Engine failing: said in its place.
  expect(readersPage(now, undefined)).toContain('Chưa cấu hình AE_API_TOKEN')
  expect(readersPage(now, { failed: 'analytics engine sql 422: bad' })).toContain('analytics engine sql 422: bad')
})

afterEach(() => vi.restoreAllMocks())

// The owner reset the count (2026-11-05): the rows before were the site's own checks, the owner and the owner's agents.
test('readers count from the reset: every beacon query reads from then on, and the days before it are uncounted, not 0', async () => {
  const sent: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
    sent.push(String(init?.body))
    return Response.json({ data: String(init?.body).includes('min(timestamp)') ? [{ sid: 'a', first: '2026-11-06 02:00:00', pages: 1, t: 40, scroll: 0 }] : [] })
  })
  const tz = 'Asia/Ho_Chi_Minh'
  const r = await queryReaders('acc', 'tok', 14, tz)
  // Sessions (ours among them, by their mark) and views from the beacon; the app's from its own dataset.
  expect(sent).toHaveLength(3)
  const beacon = sent.filter(q => q.includes('FROM aquatome_events'))
  expect(beacon).toHaveLength(2)
  expect(beacon.every(q => q.includes("timestamp >= toDateTime('2026-11-05 03:10:00')"))).toBe(true)
  expect(r.from).toBe('2026-11-05T03:10:00Z')
  const now = new Date('2026-11-06T09:00:00Z')
  const c = readersSection(now, r, tz).blocks.find((b): b is ChartBlock => b.kind === 'chart')!
  expect(c.days.slice(-3)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06'])
  expect(c.series[0]!.values.slice(-3)).toEqual([null, 0, 1])
  expect(c.whole!.values.slice(-3)).toEqual([null, 0, 1])
  expect(c.series[0]!.values.slice(0, -2).every(v => v === null)).toBe(true)
  expect(c.missing).toBe('chưa đếm: số đếm bắt đầu lại từ 05/11')
  expect(readersPage(now, r, tz)).toContain('đếm lại từ')
  // Without a reset in the data (the samples), every day counts as before.
  const { from: _, ...before } = r
  expect(readersSection(now, before, tz).blocks.find((b): b is ChartBlock => b.kind === 'chart')!.series[0]!.values.every(v => v !== null)).toBe(true)
})

test('Analytics Engine IF() needs one type: decimal columns default to 0.0 (an integer 0 is a 422)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['../readers.ts', '../admin/fishid.ts', '../admin/content.ts']) {
    const src = readFileSync(new URL(f, import.meta.url).pathname, 'utf8')
    expect(src, f).not.toMatch(/IF\([^()]*double\d+, 0\)/)
    expect(src, f).not.toMatch(/IF\([^()]*, double\d+\)/)
  }
})

test('our sessions are left out of the count and counted apart, by their mark', () => {
  const tab = (sid: string, who: number | string, t: number, scroll: number) => ({ sid, first: '2026-11-07 01:00:00', pages: 1, t, scroll, land: '/ca/ca-betta/', ref: '', cc: 'VN', who })
  const sessions = [
    { ...tab('r', 0, 60, 0), ref: 'www.google.com' },
    tab('o', 4, 0, 90), tab('t1', '3', 30, 0), tab('t2', 3, 0, 0), tab('n', 2, 180, 50), tab('a', 1, 0, 0),
  ]
  const r = summariseReaders(sessions, [], 14)
  expect([r.sessions, r.readers]).toEqual([1, 1])
  expect(r.daily).toEqual([{ day: '2026-11-07', sessions: 1, readers: 1 }])
  expect(r.excluded).toEqual([
    { who: 'owner', sessions: 1, readers: 1 }, { who: 'team', sessions: 2, readers: 1 }, { who: 'net', sessions: 1, readers: 1 }, { who: 'app', sessions: 1, readers: 0 },
  ])
  const html = readersPage(new Date('2026-11-07T12:00:00Z'), r)
  expect(html).toContain('Left out of the count')
  expect(html).toContain('Our network (the agents’ Mac, its simulators and preview browser)')
  expect(readersSection(new Date('2026-11-07T12:00:00Z'), r).blocks.some(b => b.kind === 'heading' && b.text === 'Left out of the count')).toBe(true)
})

// 7 Nov 2026: about 100 fresh Indonesian tabs in two hours, a new species page every 30 s or so, none from an outside site.
test('a burst of fresh tabs sweeping the pages is likely automated: shown apart, not as readers', () => {
  const t0 = Date.parse('2026-11-07T13:00:00Z')
  const tab = (i: number, o: Partial<Session> = {}): Session => ({ sid: `s${i}`, first: new Date(t0 + i * 30_000).toISOString().slice(0, 19).replace('T', ' '), pages: 1, t: i % 10 ? 0 : 30, scroll: 0, land: `/id/ikan/fish-${i}/`, ref: '', cc: 'ID', ...o })
  const sweep = Array.from({ length: 30 }, (_, i) => tab(i))
  const fromGoogle = tab(99, { sid: 'g', ref: 'www.google.com', t: 60 })
  const elsewhere = tab(98, { sid: 'v', cc: 'VN', t: 60 })
  expect([...automated([...sweep, fromGoogle, elsewhere])].sort()).toEqual(sweep.map(s => s.sid).sort())
  const r = summariseReaders([...sweep, fromGoogle, elsewhere], [], 14)
  expect([r.sessions, r.readers]).toEqual([2, 2])
  expect(r.automated).toEqual({ sessions: 30, readers: 3, bursts: [{ cc: 'ID', from: sweep[0]!.first, to: sweep[29]!.first, sessions: 30 }] })
  expect(r.daily).toEqual([{ day: '2026-11-07', sessions: 2, readers: 2, automated: 30 }])
  // A crowd sent to one page (a shared link) is readers, however many; so are fewer fresh tabs than BURST.n.
  expect(automated(Array.from({ length: 40 }, (_, i) => tab(i, { land: '/id/ikan/cupang/' }))).size).toBe(0)
  expect(automated(sweep.slice(0, BURST.n - 1)).size).toBe(0)
  // The same tabs spread over a day are readers too, and so are tabs a reader opened from one of our pages ('=').
  expect(automated(Array.from({ length: 30 }, (_, i) => tab(i * 120))).size).toBe(0)
  expect(automated(sweep.map(s => ({ ...s, ref: '=' }))).size).toBe(0)
  expect(readersPage(new Date('2026-11-07T16:00:00Z'), r)).toContain('Likely automated')
  // The scoreboard and the overview read the same rule: the sweep's visits aren't there.
  const rows = [...sweep, fromGoogle].map(s => ({ sid: s.sid, t: 'view', p: s.land!, ref: s.ref!, cc: s.cc!, first: s.first, v: 1, n: 1, who: 0 }))
  expect(visitsOf(rows).map(v => v.ref)).toEqual(['www.google.com'])
})

test('the app beside the web: before the App Store, every app session is ours', () => {
  const rows = [
    { sid: 'x', test: '', first: '2026-11-07 14:00:00', pages: 3, t: 30, scroll: 90 },
    { sid: 'y', test: '1', first: '2026-11-07 15:00:00', pages: 1, t: 0, scroll: 0 },
    { sid: 'z', test: '', first: '2026-12-02 15:00:00', pages: 1, t: 0, scroll: 50 },
  ]
  expect(summariseAppReads(rows, null)).toEqual({ onStore: false, sessions: 0, readers: 0, ours: { sessions: 3, readers: 2 } })
  expect(summariseAppReads(rows, '2026-12-01T00:00:00Z')).toEqual({ onStore: true, sessions: 1, readers: 1, ours: { sessions: 2, readers: 1 } })
  expect(APP_SQL(14)).toContain('FROM aquatome_app')
  const r = { ...summariseReaders([], [], 14), app: summariseAppReads(rows, null) }
  const html = readersPage(new Date('2026-11-07T16:00:00Z'), r)
  expect(html).toContain('Web and app')
  expect(html).toContain('not on the App Store yet')
})

test('return visits, by the visitor code: browsers back on another day, how soon, and the pages that brought them back', () => {
  const tab = (sid: string, u: string, first: string, land: string, o: Partial<Session> = {}): Session => ({ sid, first, pages: 1, t: 40, scroll: 0, land, ref: 'www.google.com', cc: 'VN', who: 0, u, ...o })
  const sessions = [
    tab('a1', 'aaaa1111', '2026-11-01 02:00:00', '/vi/ca/ca-betta/'), tab('a2', 'aaaa1111', '2026-11-04 02:00:00', '/ca/ca-neon-vua/'), // back after 3 days
    tab('b1', 'bbbb2222', '2026-11-02 01:00:00', '/ca/ca-betta/'), tab('b2', 'bbbb2222', '2026-11-03 01:00:00', '/'), tab('b3', 'bbbb2222', '2026-11-09 01:00:00', '/'), // after 1 day
    tab('c1', 'cccc3333', '2026-11-02 03:00:00', '/cay/x/'), tab('c2', 'cccc3333', '2026-11-02 09:00:00', '/cay/y/'), // twice on one day: not back
    tab('d1', '', '2026-11-02 03:00:00', '/cay/x/'), // no code (GPC, DNT, storage blocked)
    tab('o1', 'cccc3333', '2026-11-05 03:00:00', '/cay/x/', { who: 3 }), // ours: counts nowhere
  ]
  const r = summariseReaders(sessions, [], 14)
  expect(r.revisits).toEqual({ visitors: 3, returning: 2, gapDays: 1, noCode: 1, pages: [{ path: '/ca/ca-betta/', visitors: 2 }] })
  // A day is the viewer's: 23:30 and 00:30 in Vietnam are two days there, one in UTC.
  const late = [tab('x1', 'xxxx9999', '2026-11-01 16:30:00', '/'), tab('x2', 'xxxx9999', '2026-11-01 17:30:00', '/')]
  expect(summariseReaders(late, [], 14, 'UTC').revisits!.returning).toBe(0)
  expect(summariseReaders(late, [], 14, 'Asia/Ho_Chi_Minh').revisits!.returning).toBe(1)
  // Shown once there is a code; not before (the visitor switch off).
  expect(readersPage(new Date('2026-11-09T12:00:00Z'), r)).toContain('Return visits')
  expect(readersSection(new Date('2026-11-09T12:00:00Z'), r).blocks.some(b => b.kind === 'heading' && b.text === 'Return visits')).toBe(true)
  const none = summariseReaders(sessions.map(s => ({ ...s, u: '' })), [], 14)
  expect(none.revisits).toBeUndefined()
  expect(readersPage(new Date('2026-11-09T12:00:00Z'), none)).not.toContain('Return visits')
})
