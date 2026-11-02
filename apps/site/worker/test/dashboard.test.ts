import { expect, test } from 'vitest'
import { safeEqual } from '../dashboard'
import { affiliatePage, areas, hiddenPage, log, overviewPage, todos, type Overview } from '../admin/pages'
import { chip, lastDays } from '../admin/chart'
import { loginPage, unset } from '../admin/shell'

test('safeEqual compares whole strings', () => {
  expect(safeEqual('abc', 'abd')).toBe(false)
  expect(safeEqual('abc', 'abc')).toBe(true)
  expect(safeEqual('abc', 'abcd')).toBe(false)
})
const NOW = new Date('2026-11-02T10:00:00Z')
const nothing: Overview = { now: NOW, readers: unset('x'), clicks: unset('x'), fish: unset('x'), keys: unset('x'), photos: unset('x'), waiting: unset('x'), wanted: unset('x'), accounts: unset('x'), hidden: unset('x') }
/** Every part loaded: no keys resting, nothing waiting, no days counted. */
const well = (): Overview => {
  const days = lastDays(NOW, 31)
  const zeros = days.map(() => 0)
  const none = { requests: 0, calls: 0, ok: 0, none: 0, blocked: 0, tin: 0, tout: 0, usd: 0, guessed: 0, linked: 0 }
  const z = zeros.slice(1)
  const fish = { days: lastDays(NOW, 30), perDay: { ok: z, none: z, blocked: z, usd: z, tin: z, tout: z }, unmatched: [], recent: [],
    periods: { today: none, yesterday: none, last30: none, d7: none, d7prev: none, d30: none, d30prev: none, mtd: none, mtdPrev: none } }
  return {
    now: NOW, readers: [], clicks: { days, clicks: [...zeros] }, fish, photos: 3, hidden: {},
    keys: { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'ok', calls: 0, answered: 0 }], bad: 0, today: 0, model: 'm' },
    waiting: { comments: 0, photos: 0, oldest: null }, wanted: { names: [], more: false },
    accounts: { days: lastDays(NOW, 30), users: 5, newUsers: zeros.slice(1), synced: 2, openSessions: 1, credentials: [], comments: [], newComments: zeros.slice(1) },
  }
}

test('overview: what needs the owner comes first, each with the one place to deal with it', () => {
  const o = { ...well(), fish: { failed: 'x' } }
  o.keys = { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'credit', until: '2026-11-03T08:00:00.000Z', calls: 3, answered: 0 }, { n: 2, hash: 'bbbb2222', workspace: true, state: 'ok', calls: 9, answered: 9 }], bad: 1, today: 12, model: 'm' }
  o.waiting = { comments: 2, photos: 1, oldest: '2026-11-01T02:00:00.000Z' } // 32 hours before NOW: a night was missed
  const t = todos(o)
  expect(t.map(x => x.title)).toEqual(['1 key Anthropic đang nghỉ', '1 dòng trong ANTHROPIC_KEYS không đọc được', 'Kiểm duyệt đêm chưa chạy', 'Không tải được nhật ký nhận diện cá'])
  expect(t[0]).toMatchObject({ text: '#1 hết credit đến 03/11 08:00 UTC', href: '/_ab/nhan-dien-ca/#key' })
  expect(t[2]!.text).toContain('2 bình luận, 1 ảnh chờ từ 01/11 02:00 UTC')
  expect(t[2]!.href).toContain('/actions/workflows/moderate.yml')
  // Every key resting: the tool is down, said as such.
  o.keys = { ...o.keys, rows: [o.keys.rows[0]!], bad: 0 }
  expect(todos(o)[0]!.title).toBe('Nhận diện cá không chạy: mọi key đang nghỉ')
  // Waiting since this morning: tonight's run will take it, nothing to do.
  expect(todos({ ...well(), waiting: { comments: 1, photos: 0, oldest: '2026-11-02T01:00:00.000Z' } })).toEqual([])
  const html = overviewPage(well())
  expect(html).toContain('Không có việc gì cần bạn')
  expect(html).not.toContain('class="badge"')
  expect(overviewPage(o)).toContain('<span class="badge">3<span class="vh"> việc</span></span>')
})

test('overview areas: the last 7 whole days against the 7 before, the 30 whole days drawn; today left out', () => {
  const days = lastDays(NOW, 31)
  const readers = days.map((day, i) => ({ day, sessions: 10, readers: i === 30 ? 100 : i >= 23 ? 3 : i >= 16 ? 2 : 0 }))
  const a = areas({ ...well(), readers })
  expect(a[0]).toMatchObject({ name: 'Người đọc', fig: '21', sub: 'người đọc · 7 ngày · 70 phiên' })
  expect(a[0]!.spark).toHaveLength(30)
  expect(a[0]!.chip).toContain('+50%')
  expect(a[0]!.chip).toContain('chip good')
  // Small counts say the difference, not a percentage; nothing on either side says nothing.
  expect(chip(4, 1, 'x')).toContain('+3<')
  expect(chip(1, 4, 'x', 'up')).toContain('chip bad')
  expect(chip(0, 0, 'x')).toBe('')
  // A part that didn't load keeps its row, marked, saying why.
  expect(areas({ ...well(), clicks: { failed: 'D1 down' } })[1]).toMatchObject({ name: 'Affiliate', fig: '—', sub: 'Không tải được: D1 down', warn: true })
})

test('overview log: the last three days in words, today first; a quiet day says so', () => {
  const o = well()
  const days = lastDays(NOW, 31)
  ;(o.clicks as { clicks: number[] }).clicks.splice(28, 3, 2, 0, 4)
  o.wanted = { names: [{ kind: 'fish', name: 'Cá A', readers: 2, sources: {}, first: days[29]!, last: days[30]! }], more: false }
  o.hidden = { '/vi/ca/x/': { at: '2026-11-02T03:00:00.000Z' } }
  const l = log(o)
  expect(l.map(d => d.label)).toEqual(['Hôm nay · 02/11', 'Hôm qua · 01/11', 'Thứ Bảy · 31/10'])
  expect(l[0]!.items).toEqual([{ k: 'Affiliate', text: '4 lượt bấm sang sàn' }, { k: 'Ẩn trang', text: 'Ẩn 1 trang', small: '/vi/ca/x/' }])
  expect(l[1]!.items).toEqual([{ k: 'Bạn đọc muốn có', text: '1 tên mới', small: 'Cá A' }])
  expect(l[2]!.items).toEqual([{ k: 'Affiliate', text: '2 lượt bấm sang sàn' }])
  const html = overviewPage({ ...well() })
  expect(html).toContain('Không có gì mới.')
  expect(html).toContain('chưa hết ngày')
})
test('dashboard: no A/B table any more, noindex; the sign-in page too', () => {
  const html = overviewPage(nothing)
  expect(html).not.toContain('Đáy sâu')
  expect(html).toContain('noindex')
  expect(loginPage()).toContain('noindex')
  expect(loginPage()).toContain('href="/vi/cong-cu/be-cua-toi/#tai-khoan"')
  expect(loginPage(true)).toContain('không phải tài khoản chủ trang')
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
