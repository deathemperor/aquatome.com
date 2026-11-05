import { afterEach, expect, test, vi } from 'vitest'
import { queryReaders, sourceOf, summariseReaders } from '../readers'
import { overviewPage, readersPage, readersSection } from '../admin/pages'
import type { ChartBlock } from '../admin/blocks'
import { unset } from '../admin/shell'

test('readers: sessions that scrolled half a page or stayed 30 s; sources, top pages and countries from readers', () => {
  const sessions = [
    { sid: 'a', first: '2026-10-29 07:00:00', pages: '2', t: '60', scroll: '0' },
    { sid: 'b', first: '2026-10-29 08:00:00', pages: '1', t: '0', scroll: '90' },
    { sid: 'c', first: '2026-10-28 09:00:00', pages: '1', t: '0', scroll: '0' }, // a bounce (or a bot running JS)
  ]
  const views = [
    { sid: 'a', p: '/vi/ca/ca-betta/', ref: 'www.google.com.vn', cc: 'VN', views: '1' }, // its old address: the same page
    { sid: 'a', p: '/thiet-bi/loc/', ref: '', cc: 'VN', views: '1' },
    { sid: 'b', p: '/ca/ca-betta/', ref: '', cc: 'US', views: '1' },
    { sid: 'c', p: '/', ref: 'www.facebook.com', cc: 'SG', views: '1' },
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
  expect(sent).toHaveLength(2)
  expect(sent.every(q => q.includes('FROM aquatome_events') && q.includes("timestamp >= toDateTime('2026-11-05 03:10:00')"))).toBe(true)
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
