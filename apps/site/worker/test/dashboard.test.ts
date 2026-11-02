import { expect, test } from 'vitest'
import { authorise, safeEqual } from '../dashboard'
import { affiliatePage, hiddenPage, overviewPage } from '../admin/pages'
import { loginPage, unset } from '../admin/shell'

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
const NOW = new Date('2026-11-02T10:00:00Z')
const nothing = { now: NOW, readers: unset('x'), clicks: unset('x'), fish: unset('x'), photos: unset('x'), wanted: unset('x') }
test('dashboard: no A/B table any more, noindex; the sign-in page too', () => {
  const html = overviewPage(nothing)
  expect(html).not.toContain('Đáy sâu')
  expect(html).toContain('noindex')
  expect(loginPage()).toContain('noindex')
  expect(loginPage()).toContain('action="/_ab/login"')
})

test('dashboard affiliate section summarises clicks and catalog health', async () => {
  const { testD1 } = await import('./d1')
  const { affSummary } = await import('../dashboard')
  const db = testD1()
  await db.prepare("INSERT INTO clicks_daily VALUES ('2026-10-27','shopee','thuc-an','species:x','search',3)").run()
  const a = await affSummary(db, new Date('2026-10-28T00:00:00Z'))
  expect(a.byNetwork).toEqual([{ network: 'shopee', category: 'thuc-an', n: 3 }])
  const html = affiliatePage({ days: ['2026-10-27', '2026-10-28'], clicks: [3, 0] }, a)
  expect(html).toContain('Theo sàn · 14 ngày')
  expect(html).toContain('species:x')
  expect(html).toContain('Lượt bấm mỗi ngày')
})

test('dashboard: hide form and the hidden list with an unhide button per page', () => {
  const html = hiddenPage({ '/vi/ca/x/': { at: '2026-10-29T10:00:00.000Z', note: '<b>sai</b>' } })
  expect(html).toContain('action="/_ab/hidden"')
  expect(html).toContain('value="hide"')
  expect(html).toContain('<a href="/vi/ca/x/">/vi/ca/x/</a>')
  expect(html).toContain('&lt;b&gt;sai&lt;/b&gt;')
  expect(html).toContain('value="unhide"')
})
