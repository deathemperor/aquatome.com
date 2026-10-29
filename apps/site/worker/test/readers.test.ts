import { expect, test } from 'vitest'
import { sourceOf, summariseReaders } from '../readers'
import { renderDashboard } from '../dashboard'

test('readers: sessions that scrolled half a page or stayed 30 s; sources, top pages and countries from readers', () => {
  const sessions = [
    { sid: 'a', first: '2026-10-29 07:00:00', pages: '2', t: '60', scroll: '0' },
    { sid: 'b', first: '2026-10-29 08:00:00', pages: '1', t: '0', scroll: '90' },
    { sid: 'c', first: '2026-10-28 09:00:00', pages: '1', t: '0', scroll: '0' }, // a bounce (or a bot running JS)
  ]
  const views = [
    { sid: 'a', p: '/vi/ca/ca-betta/', ref: 'www.google.com.vn', cc: 'VN', views: '1' },
    { sid: 'a', p: '/vi/thiet-bi/loc/', ref: '', cc: 'VN', views: '1' },
    { sid: 'b', p: '/vi/ca/ca-betta/', ref: '', cc: 'US', views: '1' },
    { sid: 'c', p: '/vi/', ref: 'www.facebook.com', cc: 'SG', views: '1' },
  ]
  const r = summariseReaders(sessions, views, 14)
  expect(r).toMatchObject({ sessions: 3, readers: 2 })
  expect(r.daily).toEqual([{ day: '2026-10-29', sessions: 2, readers: 2 }, { day: '2026-10-28', sessions: 1, readers: 0 }])
  expect(r.pages[0]).toEqual({ path: '/vi/ca/ca-betta/', views: 2 })
  expect(r.sources).toEqual([{ source: '(trực tiếp)', sessions: 1, readers: 1 }, { source: 'facebook', sessions: 1, readers: 0 }, { source: 'google', sessions: 1, readers: 1 }])
  expect(r.countries).toEqual([{ cc: 'US', readers: 1 }, { cc: 'VN', readers: 1 }])
  expect(sourceOf('l.facebook.com')).toBe('facebook')
  expect(sourceOf('www.aquariumcoop.com')).toBe('aquariumcoop.com')
  const html = renderDashboard(null, 2000, undefined, {}, r)
  expect(html).toContain('Người đọc thật')
  expect(html).toContain('/vi/ca/ca-betta/')
})
