import { expect, test } from 'vitest'
import { safeEqual } from '../dashboard'
import { affiliatePage, areas, hiddenPage, log, overviewPage, todos, type Overview } from '../admin/pages'
import { chip, lastDays } from '../admin/chart'
import type { ContentStats, Snapshot, Totals } from '../admin/content'
import { contentPage, perDay } from '../admin/content-page'
import { loginPage, unset } from '../admin/shell'

test('safeEqual compares whole strings', () => {
  expect(safeEqual('abc', 'abd')).toBe(false)
  expect(safeEqual('abc', 'abc')).toBe(true)
  expect(safeEqual('abc', 'abcd')).toBe(false)
})
const NOW = new Date('2026-11-02T10:00:00Z')
const nothing: Overview = { now: NOW, readers: unset('x'), clicks: unset('x'), fish: unset('x'), keys: unset('x'), photos: unset('x'), waiting: unset('x'), wanted: unset('x'), accounts: unset('x'), hidden: unset('x'), content: unset('x'), snapshots: unset('x') }
const totals = (fish: number, plant = 0, guide = 0, idFish = 0, thFish = 0): Totals => ({ kinds: { fish: [fish, idFish, thFish], plant: [plant, 0, 0], guide: [guide, 0, 0] } as Totals['kinds'], built: null, sources: {}, photos: { pages: 0, gallery: 0 } })
/** content.json as the home page reads it: the items, and the engine's queue. */
const stats = (needsHuman: { source: string; since: string }[] = []) => ({
  inventory: { fish: { total: 100, id: 0, th: 0 }, plant: { total: 20, id: 0, th: 0 }, guide: { total: 5, id: 0, th: 0 } },
  engine: { needsHuman, sources: [{ id: '2hraquarist', name: '2Hr Aquarist' }], videos: { waiting: 40, writtenAt: lastDays(NOW, 14).flatMap((day, i) => Array<string>(i === 13 ? 3 : 1).fill(`${day}T02:00:00.000Z`)) } },
}) as unknown as ContentStats
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
    waiting: { comments: 0, photos: 0, oldest: null }, wanted: { names: [], more: false }, content: stats(), snapshots: [],
    accounts: { days: lastDays(NOW, 30), users: 5, newUsers: zeros.slice(1), synced: 2, openSessions: 1, credentials: [], comments: [], newComments: zeros.slice(1) },
  }
}

test('overview: what needs the owner comes first, each with the one place to deal with it', () => {
  const o = { ...well(), fish: { failed: 'x' } }
  o.keys = { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'credit', until: '2026-11-03T08:00:00.000Z', calls: 3, answered: 0 }, { n: 2, hash: 'bbbb2222', workspace: true, state: 'ok', calls: 9, answered: 9 }], bad: 1, today: 12, model: 'm' }
  o.waiting = { comments: 2, photos: 1, oldest: '2026-11-01T02:00:00.000Z' } // 32 hours before NOW: a night was missed
  const t = todos(o)
  expect(t.map(x => x.title)).toEqual(['1 key Anthropic đang nghỉ', '1 dòng trong ANTHROPIC_KEYS không đọc được', 'Kiểm duyệt đêm chưa chạy', 'Không tải được nhật ký nhận diện cá'])
  expect(t[0]).toMatchObject({ text: '#1 hết credit đến 03/11 15:00', href: '/_ab/nhan-dien-ca/#key' }) // Vietnam's time, as the bar
  expect(t[2]!.text).toContain('2 bình luận, 1 ảnh chờ từ 01/11 09:00.')
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

test('overview: a source behind a browser check is the owner\'s to pass; the content and engine rows count the items and the video queue', () => {
  const o = { ...well(), content: stats([{ source: '2hraquarist', since: '2026-11-02T04:00:00.000Z' }]) }
  expect(todos(o)).toEqual([expect.objectContaining({ title: 'Nguồn 2Hr Aquarist cần bạn qua kiểm tra trình duyệt', href: '/_ab/noi-dung/#engine' })])
  expect(todos(o)[0]!.text).toContain('2Hr Aquarist (từ 02/11 11:00)')
  const days = lastDays(NOW, 9)
  const snaps: Snapshot[] = [{ day: days[0]!, totals: totals(80, 18, 5) }, { day: days[1]!, totals: totals(90, 18, 5) }, { day: days[7]!, totals: totals(98, 20, 5) }, { day: days[8]!, totals: totals(100, 20, 5) }]
  const a = areas({ ...o, snapshots: snaps })
  // The 7 whole days to yesterday: +10 seven days back and +10 yesterday (it carries the days not kept); today's +2 waits.
  expect(a[1]).toMatchObject({ name: 'Nội dung', fig: '20', sub: 'bài mới · 7 ngày · tổng 125 bài' })
  expect(a[1]!.spark).toHaveLength(30)
  expect(a[1]!.chip).toContain('+20<')
  expect(a[2]).toMatchObject({ name: 'Engine', fig: '40', sub: 'video chờ viết · 7 bài từ video trong 7 ngày', warn: true })
  expect(a[2]!.spark).toHaveLength(30)
  // One night kept: the total, nothing to compare yet.
  expect(areas({ ...well(), snapshots: [snaps[3]!] })[1]).toMatchObject({ fig: '125', sub: 'bài · mỗi đêm lưu tổng số một lần, chưa đủ ngày để so' })
  // The log says what each day added.
  expect(log({ ...o, snapshots: snaps })[0]!.items[0]).toEqual({ text: '2 bài mới', small: '2 cá' })
  // Indonesian and Thai pages that night, apart: the Vietnamese count says nothing of them.
  const translated: Snapshot[] = [{ day: days[7]!, totals: totals(100, 20, 5, 10, 12) }, { day: days[8]!, totals: totals(100, 20, 5, 30, 32) }]
  expect(log({ ...o, snapshots: translated })[0]!.items[0]).toEqual({ text: '20 bài tiếng Indonesia, 20 bài tiếng Thái mới' })
  // A day not kept, or with nothing kept before it, is unknown rather than 0.
  expect(perDay(snaps, days, t => t.kinds.fish[0])).toEqual([null, 10, null, null, null, null, null, 8, 2])
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
  expect(areas({ ...well(), clicks: { failed: 'D1 down' } })[3]).toMatchObject({ name: 'Affiliate', fig: '—', sub: 'Không tải được: D1 down', warn: true })
})

test('overview log: the last three days in words, today first; a quiet day says so', () => {
  const o = well()
  const days = lastDays(NOW, 31)
  ;(o.clicks as { clicks: number[] }).clicks.splice(28, 3, 2, 0, 4)
  o.wanted = { names: [{ kind: 'fish', name: 'Cá A', readers: 2, sources: {}, first: days[29]!, last: days[30]! }], more: false }
  o.hidden = { '/ca/x/': { at: '2026-11-02T03:00:00.000Z' } }
  const l = log(o)
  expect(l.map(d => d.label)).toEqual(['Hôm nay · 02/11', 'Hôm qua · 01/11', 'Thứ Bảy · 31/10'])
  expect(l[0]!.items).toEqual([{ text: '4 lượt bấm sang sàn' }, { text: 'Ẩn 1 trang', small: '/ca/x/' }])
  expect(l[1]!.items).toEqual([{ text: '1 tên mới bạn đọc muốn có', small: 'Cá A' }])
  expect(l[2]!.items).toEqual([{ text: '2 lượt bấm sang sàn' }])
  const html = overviewPage({ ...well() })
  expect(html).toContain('Không có gì mới.')
  expect(html).toContain('chưa hết ngày')
})
test('dashboard: no A/B table any more, noindex; the sign-in page too', () => {
  const html = overviewPage(nothing)
  expect(html).not.toContain('Đáy sâu')
  expect(html).toContain('noindex')
  expect(loginPage()).toContain('noindex')
  expect(loginPage()).toContain('href="/cong-cu/be-cua-toi/#tai-khoan"')
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
  const html = hiddenPage({ '/ca/x/': { at: '2026-10-29T10:00:00.000Z', note: '<b>sai</b>' } })
  expect(html).toContain('action="/_ab/hidden"')
  expect(html).toContain('value="hide"')
  expect(html).toContain('<a href="/ca/x/">/ca/x/</a>')
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

test('content page: what the build holds, the engine, what is missing; a part that can\'t load says so in its place', async () => {
  const { readFileSync } = await import('node:fs')
  const s = JSON.parse(readFileSync(new URL('../../dist/_ab/content.json', import.meta.url).pathname, 'utf8')) as ContentStats
  const html = contentPage({ now: NOW, stats: s, reads: unset('AE'), talk: { failed: 'D1 down' }, clicks: unset('D1'), snapshots: [] })
  expect(html).toContain('aria-current="page">Nội dung<')
  for (const id of ['tong', 'tang', 'engine', 'thieu', 'anh', 'doc', 'binh-luan', 'affiliate', 'nguon']) expect(html).toContain(`id="${id}"`)
  expect(html).toContain('cần ít nhất hai ngày')
  expect(html).toContain('Không tải được bình luận theo trang')
  expect(html).toContain('Chưa cấu hình AE.')
  // Gaps link to the pages to fix.
  const gap = Object.values(s.gaps.fish ?? {}).find(g => g?.top.length)
  if (gap) expect(html).toContain(`href="${gap.top[0]![0]}"`)
  // No content.json in this build: the page says so and nothing else.
  expect(contentPage({ now: NOW, stats: { failed: 'Bản build này chưa có content.json.' }, reads: unset('x'), talk: unset('x'), clicks: unset('x'), snapshots: [] })).toContain('Bản build này chưa có content.json.')
})
