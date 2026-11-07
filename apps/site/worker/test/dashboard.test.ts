import { parse } from 'node-html-parser'
import { expect, test } from 'vitest'
import { safeEqual } from '../dashboard'
import { affiliatePage, areas, hiddenPage, log, overviewPage, todos, type Overview } from '../admin/pages'
import { chipHtml, chipOf, lastDays } from '../admin/chart'
import type { ContentStats, Snapshot, Totals } from '../admin/content'
import { contentPage, contentSection, openDay, perDay, SAVED } from '../admin/content-page'
import { loginPage, unset } from '../admin/shell'
import { CONTENT, LOW, LOW_CONTENT, STATS } from './owner-sample'

test('safeEqual compares whole strings', () => {
  expect(safeEqual('abc', 'abd')).toBe(false)
  expect(safeEqual('abc', 'abc')).toBe(true)
  expect(safeEqual('abc', 'abcd')).toBe(false)
})
const NOW = new Date('2026-11-02T10:00:00Z')
const nothing: Overview = { now: NOW, readers: unset('x'), clicks: unset('x'), fish: unset('x'), keys: unset('x'), photos: unset('x'), waiting: unset('x'), wanted: unset('x'), accounts: unset('x'), hidden: unset('x'), content: unset('x'), snapshots: unset('x') }
const totals = (fish: number, plant = 0, guide = 0, idFish = 0, thFish = 0): Totals => ({ kinds: { fish: { vi: fish, id: idFish, th: thFish }, plant: { vi: plant, id: 0, th: 0 }, guide: { vi: guide, id: 0, th: 0 } } as Partial<Totals['kinds']> as Totals['kinds'], built: null, sources: {}, photos: { pages: 0, gallery: 0 } })
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
    keys: { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'ok', calls: 0, answered: 0 }], bad: 0, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0, cap: 50, spend: [] },
    waiting: { comments: 0, photos: 0, oldest: null }, wanted: { names: [], more: false }, content: stats(), snapshots: [],
    accounts: { days: lastDays(NOW, 30), users: 5, newUsers: zeros.slice(1), synced: 2, openSessions: 1, credentials: [], comments: [], newComments: zeros.slice(1) },
  }
}

test('overview: what needs the owner comes first, each with the one place to deal with it', () => {
  const o = { ...well(), fish: { failed: 'x' } }
  o.keys = { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'credit', until: '2026-11-03T08:00:00.000Z', calls: 3, answered: 0 }, { n: 2, hash: 'bbbb2222', workspace: true, state: 'ok', calls: 9, answered: 9 }], bad: 1, today: 12, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0, cap: 50, spend: [] }
  o.waiting = { comments: 2, photos: 1, oldest: '2026-11-01T02:00:00.000Z' } // 32 hours before NOW: a night was missed
  const t = todos(o)
  expect(t.map(x => x.title)).toEqual(['1 dòng trong ANTHROPIC_KEYS không đọc được', 'Kiểm duyệt đêm chưa chạy', 'Không tải được nhật ký nhận diện cá'])
  expect(t[1]!.text).toContain('2 bình luận, 1 ảnh chờ từ 01/11 09:00.')
  expect(t[1]!.href).toContain('/actions/workflows/moderate.yml')
  // Every key resting: the tool is down, said as such.
  o.keys = { ...o.keys, rows: [o.keys.rows[0]!], bad: 0 }
  expect(todos(o)[0]!.title).toBe('Nhận diện cá và chat không chạy: mọi key đang nghỉ')
  // Waiting since this morning: tonight's run will take it, nothing to do.
  expect(todos({ ...well(), waiting: { comments: 1, photos: 0, oldest: '2026-11-02T01:00:00.000Z' } })).toEqual([])
  const html = overviewPage(well())
  expect(html).toContain('Không có việc gì cần bạn')
  expect(html).not.toContain('class="badge"')
  expect(overviewPage(o)).toContain('<span class="badge">3<span class="vh"> việc</span></span>')
})

test('the fish ID card is flagged when every key rests, not when the rotation can still skip one', () => {
  const row = (n: number, state: 'ok' | 'credit') => ({ n, hash: `h${n}`, workspace: false, state, calls: 0, answered: 0 })
  const flagged = (...states: ('ok' | 'credit')[]) => {
    const o = well()
    if (o.keys && !('failed' in o.keys)) o.keys.rows = states.map((s, i) => row(i + 1, s))
    return areas(o).find(a => a.name === 'Nhận diện cá')?.warn
  }
  expect(flagged('ok', 'ok')).toBe(false)
  expect(flagged('credit', 'ok')).toBe(false)
  expect(flagged('credit', 'credit')).toBe(true)
})

test('overview: a day whose AI spend passed 80% of its cap is the owner\'s to raise; below, nothing', () => {
  const o = well()
  const keys = o.keys as Exclude<Overview['keys'], { failed: string } | undefined>
  // Today (UTC, from 07:00 in Vietnam) at 82%, yesterday at 78%: today's only. At exactly 80%, flagged.
  o.keys = { ...keys, cap: 50, spend: [{ day: '2026-11-02', usd: 41 }, { day: '2026-11-01', usd: 39 }] }
  const t = todos(o)
  expect(t).toEqual([{
    kind: 'spend', title: 'Chi phí AI hôm nay: $41,00 (82% mức $50)', href: '/_ab/nhan-dien-ca/', action: 'Xem chi phí',
    text: 'Nhận diện cá và chat dùng chung mức này; hết mức thì cả hai nghỉ tới 07:00.',
    en: { title: 'AI spend today: $41.00 (82% of the $50 cap)', text: 'Fish ID and chat share this cap; once it\'s reached, both rest until 07:00.', action: 'See costs' },
  }])
  // A past day says its date, as the daily report does.
  o.keys = { ...keys, cap: 50, spend: [{ day: '2026-11-02', usd: 3 }, { day: '2026-11-01', usd: 40 }] }
  expect(todos(o).map(x => x.title)).toEqual(['Chi phí AI ngày 01/11: $40,00 (80% mức $50)'])
  o.keys = { ...keys, cap: 50, spend: [{ day: '2026-11-02', usd: 39.99 }, { day: '2026-11-01', usd: 12 }] }
  expect(todos(o)).toEqual([])
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
  expect(a[1]!.chip).toEqual({ text: '+20', tone: 'good', vs: '7 ngày trước đó' })
  expect(a[2]).toMatchObject({ name: 'Engine', fig: '40', sub: 'video chờ viết · 7 bài từ video trong 7 ngày', warn: true })
  expect(a[2]!.spark).toHaveLength(30)
  // One night kept: the total, nothing to compare yet.
  expect(areas({ ...well(), snapshots: [snaps[3]!] })[1]).toMatchObject({ fig: '125', sub: 'bài · mỗi đêm lưu tổng số một lần, chưa đủ ngày để so' })
  // The log says what each day added.
  expect(log({ ...o, snapshots: snaps })[0]!.items[0]).toEqual({ text: '2 bài mới', small: '2 cá', section: 'noi-dung' })
  // Indonesian and Thai pages that night, apart: the Vietnamese count says nothing of them.
  const translated: Snapshot[] = [{ day: days[7]!, totals: totals(100, 20, 5, 10, 12) }, { day: days[8]!, totals: totals(100, 20, 5, 30, 32) }]
  expect(log({ ...o, snapshots: translated })[0]!.items[0]).toEqual({ text: '20 bài tiếng Indonesia, 20 bài tiếng Thái mới', section: 'noi-dung' })
  // A day not kept, or with nothing kept before it, is unknown rather than 0.
  expect(perDay(snaps, days, t => t.kinds.fish.vi)).toEqual([null, 10, null, null, null, null, null, 8, 2])
})

test('overview areas: the last 7 whole days against the 7 before, the 30 whole days drawn; today left out', () => {
  const days = lastDays(NOW, 31)
  const readers = days.map((day, i) => ({ day, sessions: 10, readers: i === 30 ? 100 : i >= 23 ? 3 : i >= 16 ? 2 : 0 }))
  const a = areas({ ...well(), readers })
  expect(a[0]).toMatchObject({ name: 'Người đọc', fig: '21', sub: 'người đọc · 7 ngày · 70 phiên' })
  expect(a[0]!.spark).toHaveLength(30)
  expect(a[0]!.chip).toEqual({ text: '+50%', tone: 'good', vs: '7 ngày trước đó' })
  expect(overviewPage({ ...well(), readers })).toContain('<span class="chip good">+50%<span class="vh"> so với 7 ngày trước đó</span></span>')
  // Small counts say the difference, not a percentage; nothing on either side says nothing.
  expect(chipOf(4, 1, 'x')).toEqual({ text: '+3', tone: 'plain', vs: 'x' })
  expect(chipHtml(chipOf(1, 4, 'x', 'up'))).toBe('<span class="chip bad">−3<span class="vh"> so với x</span></span>')
  expect(chipOf(0, 0, 'x')).toBeUndefined()
  expect(chipHtml(undefined)).toBe('')
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
  expect(l[0]!.items).toEqual([{ text: '4 lượt bấm sang sàn', section: 'affiliate' }, { text: 'Ẩn 1 trang', small: '/ca/x/', section: 'an-trang' }])
  expect(l[1]!.items).toEqual([{ text: '1 tên mới bạn đọc muốn có', small: 'Cá A', section: 'muon-co' }])
  expect(l[2]!.items).toEqual([{ text: '2 lượt bấm sang sàn', section: 'affiliate' }])
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

// ——— The nightly totals' charts, as the owner read them at 01:28 on 8 Nov in Vietnam: ten saves, 28 Oct to 6 Nov ———

const VN = 'Asia/Ho_Chi_Minh'
const TEN_SAVES = lastDays(new Date('2026-11-06T12:00:00Z'), 10).map((day, i): Snapshot => ({ day, totals: totals(100 + i * 10, 20, 5, 40 + i * 5, 30 + i * 5) }))
/** The running build holds 15 more fish, 1 more plant, 2 more guides, 20 more Indonesian and 25 more Thai fish than the last save (fish 190, Indonesian 85, Thai 75). */
const RUNNING = totals(205, 21, 7, 105, 100)
const growth = (now: Date, snapshots: Snapshot[], tz = VN) => {
  const page = { ...CONTENT, now, tz, snapshots, stats: { ...STATS, totals: RUNNING } }
  const blocks = contentSection(page).blocks as Extract<ReturnType<typeof contentSection>['blocks'][number], { kind: 'chart' }>[]
  const of = (id: string) => blocks.find(b => b.id === id)!
  return { added: of('n-added'), langs: of('n-langs'), html: parse(contentPage(page)) }
}

test('growth charts: a day that has closed shows what it added before its save, not a dash', () => {
  const { added, langs, html } = growth(new Date('2026-11-07T18:28:00Z'), TEN_SAVES)
  // The 7th is counted so far: this build's totals less the save before it.
  expect(added.series.map(s => s.values.at(-1))).toEqual([15, 1, 2])
  expect(langs.series.map(s => s.values.at(-1))).toEqual([20, 25, 0])
  expect(langs.title).toBe('Bài dịch mới mỗi ngày (Indonesia, Thái, Mã Lai)')
  // Its words don't call it today, and the one before it isn't yesterday: at 01:28 the 7th is yesterday and still open.
  expect(added.labels.at(-1)).toBe('07/11')
  expect(added.readouts.at(-1)).toEqual({ title: '15 cá', detail: 'Thứ Bảy 07/11 · chốt lúc 03:17 · 1 cây · 2 bài viết, bài từ video' })
  expect(added.readouts.at(-2)!.detail).toContain('Thứ Sáu 06/11')
  expect(added.today).toBe(added.days.length - 1)
  // The page says the same, and its words stay out of the reply: the app reads them from labels and readouts.
  const cols = html.querySelectorAll('#n-added-t')[0]!.closest('figure')!.querySelectorAll('.cols li')
  expect(cols.at(-1)!.getAttribute('data-d')).toBe('Thứ Bảy 07/11 · chốt lúc 03:17')
  expect(added).not.toHaveProperty('lastSays')
})

test('growth charts: the axis ends on the day the next save closes, so the last column always has its number', () => {
  const { added } = growth(new Date('2026-11-07T18:28:00Z'), TEN_SAVES)
  expect(added.days.at(-1)).toBe('2026-11-07')
  // Past the save (04:00 on the 8th): the 7th is what was kept, and the 8th, today, starts.
  const kept: Snapshot = { day: '2026-11-07', totals: totals(203, 21, 7, 100, 95) }
  const morning = growth(new Date('2026-11-07T21:00:00Z'), [...TEN_SAVES, kept])
  expect(morning.added.days.slice(-2)).toEqual(['2026-11-07', '2026-11-08'])
  expect(morning.added.series.map(s => s.values.slice(-2))).toEqual([[13, 2], [1, 0], [2, 0]])
  expect(morning.added.labels.at(-1)).toBe('Hôm nay')
  expect(morning.added.readouts.at(-1)!.detail).toBe('Chủ nhật 08/11 · chưa hết ngày · 0 cây · 0 bài viết, bài từ video')
  // West of the save, it can close tomorrow's day: that's no "today" either.
  const west = growth(new Date('2026-11-07T21:00:00Z'), [...TEN_SAVES, kept], 'America/New_York')
  expect(west.added.days.at(-1)).toBe('2026-11-08')
  expect(west.added.labels.at(-1)).toBe('08/11')
  expect(west.added.readouts.at(-1)!.detail).toContain('chốt lúc 15:17')
})

test('growth charts: days before the first save aren\'t days, and a save really missed still says so', () => {
  const { added, langs, html } = growth(new Date('2026-11-07T18:28:00Z'), TEN_SAVES)
  // The first save has nothing before it to compare, so the first column is the day after it: nothing from 10/10.
  expect(added.days[0]).toBe('2026-10-29')
  expect(langs.days).toEqual(added.days)
  expect(added.series.flatMap(s => s.values)).not.toContain(null)
  expect(html.querySelectorAll('#n-added-t')[0]!.closest('figure')!.querySelectorAll('.cols li.miss')).toHaveLength(0)
  // A night that didn't save, after the first: still unknown, and the next carries it.
  const missed = growth(new Date('2026-11-07T18:28:00Z'), TEN_SAVES.filter(s => s.day !== '2026-11-03')).added
  const at = (d: string) => missed.series[0]!.values[missed.days.indexOf(d)]
  expect([at('2026-11-02'), at('2026-11-03'), at('2026-11-04')]).toEqual([10, null, 20])
  expect(missed.readouts[missed.days.indexOf('2026-11-03')]!.title).toBe('cá: chưa lưu số liệu ngày này')
  // A project older than the window: 30 days, ending on the open one.
  const old = lastDays(new Date('2026-11-06T12:00:00Z'), 45).map((day): Snapshot => ({ day, totals: totals(100) }))
  const long = growth(new Date('2026-11-07T18:28:00Z'), old).added
  expect(long.days).toHaveLength(30)
  expect(long.days.at(-1)).toBe('2026-11-07')
})

test('the day a save is kept under: the UTC day of wrangler\'s cron, and the open day changes on it', async () => {
  const { readFileSync } = await import('node:fs')
  const cron = /"crons":\s*\["(\d+) (\d+) \* \* \*"\]/.exec(readFileSync(new URL('../../wrangler.jsonc', import.meta.url).pathname, 'utf8'))!
  expect(`${cron[2]!.padStart(2, '0')}:${cron[1]!.padStart(2, '0')}`).toBe(SAVED)
  expect(openDay(new Date(`2026-11-07T${SAVED}:00Z`))).toBe('2026-11-08')
  expect(openDay(new Date(Date.parse(`2026-11-07T${SAVED}:00Z`) - 1000))).toBe('2026-11-07')
  expect(openDay(new Date(`2026-12-31T${SAVED}:00Z`))).toBe('2027-01-01')
})

test('content page: the pages out of search for their score, counted by kind, the most read first, each with its last review\'s notes folded', () => {
  const html = contentPage(LOW_CONTENT)
  const low = parse(html).querySelector('section[aria-labelledby="thieu"] section.low')!
  expect(low.querySelector('h3')!.text).toBe('Ẩn khỏi tìm kiếm vì điểm thấp')
  expect(low.querySelectorAll('.kpi').map(k => [k.querySelector('dt')!.text, k.querySelector('.v')!.text, k.querySelector('.sub')!.text])).toEqual([
    ['Cá', '33', 'tiếng Việt 31 · Indonesia 1 · Thái 1'], ['Bài từ video', '1', 'tiếng Việt 1'], ['Thuật ngữ', '1', 'tiếng Việt 1'],
  ])
  expect(low.querySelectorAll('thead th').map(t => t.text)).toEqual(['Trang', 'Loại', 'Điểm', 'Người đọc', 'Nhận xét gần nhất'])
  // The 30 first: the two with readers, then the lowest score; the rest counted.
  const rows = low.querySelectorAll('tbody tr')
  expect(rows).toHaveLength(30)
  expect(rows.slice(0, 6).map(r => [r.querySelector('th a')!.getAttribute('href'), r.querySelector('th')!.text, r.querySelector('.k')!.text, r.querySelector('.s')!.text, r.querySelector('.r')!.text])).toEqual([
    ['/ca/ca-boraras-do/', 'Cá boraras đỏ', 'Cá tiếng Việt', '0,61', '12'],
    ['/thuat-ngu/gh/', 'GH', 'Thuật ngữ tiếng Việt', '0,70', '3'],
    ['/huong-dan/bon-phan-ray/', 'Bón phân cho ráy', 'Bài từ video tiếng Việt', '0,50', '0'],
    ['/id/ikan/ikan-boraras/', 'Ikan boraras merah', 'Cá tiếng Indonesia', '0,62', '0'],
    // No title in the build's page index: its address.
    ['/th/fish/pla-boraras/', '/th/fish/pla-boraras/', 'Cá tiếng Thái', '0,70', '0'],
    ['/ca/ca-00/', '/ca/ca-00/', 'Cá tiếng Việt', '0,74', '0'],
  ])
  expect(low.querySelectorAll('p.note').at(-1)!.text).toBe('Và 5 trang khác.')
  // Several notes: the first is the fold's summary (two lines of it until opened), the rest under it; then which review, when.
  const notes = LOW.pages[0]!.review!.notes
  const why = rows[2]!.querySelector('td.why')!
  expect(why.querySelector('details')!.getAttribute('open')).toBeUndefined()
  expect(why.querySelector('summary')!.text).toBe(notes[0])
  expect(why.querySelector('summary')!.getAttribute('data-more')).toBe('Xem cả 3 nhận xét')
  expect(why.querySelectorAll('ul li').map(li => li.text)).toEqual(notes.slice(1))
  expect(why.querySelector('small')!.text).toBe('Đánh giá bài viết từ video, 03/11 · 3 nhận xét')
  expect(html).toContain('hedged &amp; &lt;don&#39;t&gt; give')
  // One note, shown whole; the review's own score where it isn't the page's.
  const one = rows[0]!.querySelector('td.why')!
  expect(one.querySelector('details')).toBeNull()
  expect(one.querySelector('p')!.text).toBe(LOW.pages[1]!.review!.notes[0])
  expect(one.querySelector('small')!.text).toBe('Đánh giá bản dịch từ nguồn, 02/11, 0,55 điểm')
  // A version the page doesn't have says so; no review kept; a review with no notes.
  expect(rows[3]!.querySelector('td.why small')!.text).toBe('Đánh giá bản dịch, 04/11 · 2 nhận xét · bản này không được giữ')
  expect(rows[1]!.querySelector('td.why')!.text).toBe('Chưa lưu lần đánh giá nào.')
  expect(rows[4]!.querySelector('td.why p')!.text).toBe('Không có nhận xét.')
  // Without readers: no readers' column, the lowest score first.
  const plain = parse(contentPage({ ...LOW_CONTENT, reads: unset('AE') })).querySelector('section.low')!
  expect(plain.querySelectorAll('thead th').map(t => t.text)).toEqual(['Trang', 'Loại', 'Điểm', 'Nhận xét gần nhất'])
  expect(plain.querySelectorAll('tbody th a').slice(0, 3).map(a => a.getAttribute('href'))).toEqual(['/huong-dan/bon-phan-ray/', '/ca/ca-boraras-do/', '/id/ikan/ikan-boraras/'])
  expect(plain.querySelector('p.note')!.text).toContain('Chưa có số người đọc: điểm thấp nhất lên trước.')
  // A build without the file (from before it): nothing; a file that can't be read: says so in its place; none out: says so.
  expect(contentPage({ ...LOW_CONTENT, low: undefined })).not.toContain('class="low"')
  expect(contentPage({ ...LOW_CONTENT, low: { failed: 'bad json' } })).toContain('Không tải được danh sách trang điểm thấp (reviews.json).<code>bad json</code>')
  expect(contentPage({ ...LOW_CONTENT, low: { v: 1, bar: 0.75, pages: [] } })).toContain('Ẩn khỏi tìm kiếm vì điểm thấp</h3><p class="muted">Không có trang nào.</p>')
})
