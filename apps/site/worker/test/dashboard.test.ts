import { expect, test } from 'vitest'
import { authorise, renderDashboard, safeEqual } from '../dashboard'

const req = (q = '', cookie?: string) => new Request(`https://x.test/_ab/${q}`, cookie ? { headers: { cookie } } : {})
test('dashboard needs the token', () => {
  expect(authorise(req(), 'sekrit-token').ok).toBe(false)
  expect(authorise(req('?token=wrong'), 'sekrit-token').ok).toBe(false)
  expect(authorise(req('?token=sekrit-token'), undefined).ok).toBe(false)
  const r = authorise(req('?token=sekrit-token'), 'sekrit-token')
  expect(r.ok).toBe(true)
  expect(r.setCookie).toMatch(/^ab_token=sekrit-token; Path=\/_ab; .*HttpOnly; Secure; SameSite=Strict$/)
  expect(authorise(req('', 'ab_token=sekrit-token'), 'sekrit-token')).toEqual({ ok: true })
  expect(safeEqual('abc', 'abd')).toBe(false)
  expect(safeEqual('abc', 'abc')).toBe(true)
})
test('dashboard lists all four skins, noindex', () => {
  const html = renderDashboard(null, 2000)
  for (const n of ['Mix', 'Đáy sâu', 'Sổ tay', 'Khám phá']) expect(html).toContain(n)
  expect(html).toContain('noindex')
})

test('dashboard affiliate section summarises clicks and catalog health', async () => {
  const { testD1 } = await import('./d1')
  const { affSummary } = await import('../dashboard')
  const db = testD1()
  await db.prepare("INSERT INTO clicks_daily VALUES ('2026-10-27','shopee','thuc-an','species:x','search',3)").run()
  const a = await affSummary(db, new Date('2026-10-28T00:00:00Z'))
  expect(a.byNetwork).toEqual([{ network: 'shopee', category: 'thuc-an', n: 3 }])
  const html = renderDashboard(null, 2000, a)
  expect(html).toContain('Affiliate · 14 ngày')
  expect(html).toContain('species:x')
})
