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

test('accounts and comments: counts and days from the existing tables; a synced tank is a live tank, not a device or a deleted one', async () => {
  const { testD1 } = await import('./d1')
  const { accountStats } = await import('../admin/data')
  const db = testD1()
  for (const [id, at] of [['u1', '2026-11-01T08:00:00Z'], ['u2', '2026-11-02T01:00:00Z'], ['u3', '2026-11-02T02:00:00Z'], ['u4', '2026-09-01T00:00:00Z']]) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, at).run()
  for (const [u, kind, id, deleted] of [['u1', 'tank', 't1', 0], ['u2', 'device', 'd1', 0], ['u3', 'tank', 't2', 1], ['u1', 'tank', 't3', 0]] as const) await db.prepare("INSERT INTO tank_records VALUES (?, ?, ?, '2026-11-02', ?, '{}')").bind(u, kind, id, deleted).run()
  await db.prepare("INSERT INTO credentials (id, user_id, kind, subject, created_at) VALUES ('c1', 'u1', 'passkey', 's1', '2026-11-01'), ('c2', 'u2', 'google', 's2', '2026-11-02'), ('c3', 'u3', 'google', 's3', '2026-11-02')").run()
  await db.prepare("INSERT INTO sessions VALUES ('s1', 'u1', 'web', '2026-11-01', '2026-12-01', '2026-11-02'), ('s2', 'u2', 'app', '2026-10-01', '2026-10-31', '2026-10-01')").run()
  await db.prepare("INSERT INTO comments (id, entity_ref, name, body, status, created_at) VALUES ('m1', 'species:x', 'A', 'b', 'approved', '2026-11-02T03:00:00Z'), ('m2', 'species:x', 'B', 'b', 'held', '2026-10-20T03:00:00Z')").run()
  const a = await accountStats(db, NOW)
  expect(a).toMatchObject({ users: 4, synced: 1, openSessions: 1 })
  expect(a.newUsers.slice(-2)).toEqual([1, 2])
  expect(a.newUsers.reduce((x, y) => x + y, 0)).toBe(3) // u4 is older than 30 days
  expect(a.credentials).toEqual([{ kind: 'google', n: 2 }, { kind: 'passkey', n: 1 }])
  expect(a.comments).toEqual([{ status: 'approved', n: 1 }, { status: 'held', n: 1 }])
  expect(a.newComments.at(-1)).toBe(1)
})
