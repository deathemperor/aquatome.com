import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import { isSearch } from '../readers'
import { BEACON_SQL, GROUPS, isAnswered, mondayOf, scoreboardBlock, scoreboardPage, summariseScoreboard, visitsOf, WEEKS, weeksTo, windowStart, type BeaconRow, type CheckIssue, type ScoreboardInput } from '../admin/scoreboard'
import { SINCE_RESET, WHO_RANK } from '../admin/ae'
import { NAV, SCOREBOARD_PATH, unset } from '../admin/shell'
import { dashboardUrl } from '../paths'
import { SECTIONS } from '../dashboard'
import { testD1 } from './d1'

// Wednesday 18 November 2026, noon in Vietnam: this week began Monday the 16th, last week on the 9th.
const NOW = new Date('2026-11-18T05:00:00Z')
const row = (sid: string, t: string, p: string, first: string, v = 1, o: Partial<BeaconRow> = {}): BeaconRow => ({ sid, t, p, ref: '', cc: 'VN', first, v, n: 1, ...o })
const GOOGLE = { ref: 'www.google.com' }

const input = (o: Partial<ScoreboardInput> = {}): ScoreboardInput => ({
  now: NOW, owners: ['owner-1'], beacon: [], community: { tanks: [], comments: [], photos: [] }, clicks: { days: [], clicks: [] },
  app: { sessions: [], actions: [], crashes: [] }, content: unset('x'), snapshots: [], checks: [], ...o,
})
const metric = (s: ReturnType<typeof summariseScoreboard>, key: string) => s.metrics.find(m => m.key === key)!

test('weeks run Monday to Sunday in Vietnam: Sunday night in UTC is already Monday there', () => {
  expect(mondayOf('2026-11-18')).toBe('2026-11-16') // a Wednesday
  expect(mondayOf('2026-11-16')).toBe('2026-11-16')
  expect(mondayOf('2026-11-22')).toBe('2026-11-16') // the Sunday
  const weeks = weeksTo(NOW)
  expect(weeks).toHaveLength(WEEKS)
  expect(weeks.at(-1)).toBe('2026-11-16')
  expect(weeks[0]).toBe('2026-08-31')
  expect(windowStart(NOW)).toBe('2026-08-30T17:00:00.000Z')
  // Sunday 15 Nov 17:30 UTC is Monday 16 Nov 00:30 in Vietnam: this week, not last.
  const s = summariseScoreboard(input({ beacon: [row('monday', 'view', '/ca/x/', '2026-11-15 17:30:00'), row('sunday', 'view', '/ca/y/', '2026-11-15 16:30:00')] }))
  expect(metric(s, 'sessions').now).toBe(1)
  expect(metric(s, 'sessions').last).toBe(1)
})

test('the north star: from a search engine, and 30 s or half a scroll on the page it landed on, no other page', () => {
  const at = '2026-11-17 02:00:00'
  const rows = [
    row('stayed', 'view', '/ca/a/', at, 1, GOOGLE), row('stayed', 'time', '/ca/a/', '2026-11-17 02:00:30', 30),
    row('scrolled', 'view', '/ca/b/', at, 1, { ref: 'com.google.android.googlequicksearchbox' }), row('scrolled', 'scroll', '/ca/b/', '2026-11-17 02:00:05', 50),
    // From search, but read the second page, not the one it landed on: a reader, not an answer.
    row('moved', 'view', '/ca/c/', at, 1, GOOGLE), row('moved', 'view', '/ca/d/', '2026-11-17 02:00:03'), row('moved', 'time', '/ca/d/', '2026-11-17 02:00:33', 30),
    row('left', 'view', '/ca/e/', at, 1, GOOGLE), // a bounce
    row('direct', 'view', '/ca/f/', at), row('direct', 'time', '/ca/f/', '2026-11-17 02:00:30', 60), // stayed, no search
    row('facebook', 'view', '/ca/g/', at, 1, { ref: 'l.facebook.com' }), row('facebook', 'scroll', '/ca/g/', '2026-11-17 02:00:05', 90),
    // Below the marks: never sent as such by the beacon, but the rule's edge is held.
    row('short', 'view', '/ca/h/', at, 1, GOOGLE), row('short', 'time', '/ca/h/', '2026-11-17 02:00:29', 29),
  ]
  const answered = visitsOf(rows).filter(isAnswered).map(v => v.land).sort()
  expect(answered).toEqual(['/ca/a/', '/ca/b/'])
  const s = summariseScoreboard(input({ beacon: rows }))
  expect(metric(s, s.northStar)).toMatchObject({ key: 'answered', now: 2, group: 'star' })
  expect(metric(s, 'sessions').now).toBe(7)
  expect(metric(s, 'readers').now).toBe(5) // stayed, scrolled, moved, direct, facebook
  expect(metric(s, 'searchShare').now).toBe(60) // 3 of the 5
})

test('search engines by the referrer\'s host, chat assistants and social sites not', () => {
  for (const h of ['www.google.com', 'www.google.com.vn', 'com.google.android.googlequicksearchbox', 'www.bing.com', 'coccoc.com', 'duckduckgo.com', 'search.yahoo.com']) expect(isSearch(h), h).toBe(true)
  for (const h of ['', 'l.facebook.com', 'chatgpt.com', 'www.perplexity.ai', 'zalo.me', 'github.com', 'notgoogle.com', 'aquatome.com']) expect(isSearch(h), h).toBe(false)
})

test('the next step: a shop click, a tool opened or a second page; shop clicks per 1,000 readers', () => {
  const at = '2026-11-17 02:00:00'
  const rows = [
    row('shop', 'view', '/thiet-bi/loc/', at), row('shop', 'aff', '/thiet-bi/loc/', '2026-11-17 02:00:09', 1, { n: 2 }), row('shop', 'time', '/thiet-bi/loc/', '2026-11-17 02:00:30', 30),
    row('tool', 'view', '/cong-cu/the-tich-be/', at),
    row('tool-id', 'view', '/id/alat/volume/', at), row('tool-th', 'view', '/th/tools/x/', at),
    row('list', 'view', '/cong-cu/', at), // the list of tools is not a tool
    row('two', 'view', '/ca/a/', at), row('two', 'view', '/ca/b/', '2026-11-17 02:00:02'),
    row('again', 'view', '/ca/a/', at), row('again', 'view', '/vi/ca/a/', '2026-11-17 02:00:02'), // one page: its old address
    row('none', 'view', '/ca/c/', at),
  ]
  const s = summariseScoreboard(input({ beacon: rows }))
  expect(metric(s, 'sessions').now).toBe(8)
  expect(metric(s, 'stepShare').now).toBe(62.5) // shop, the three tools, two
  expect(metric(s, 'shopShare').now).toBe(12.5)
  expect(metric(s, 'toolShare').now).toBe(37.5)
  expect(metric(s, 'pageShare').now).toBe(12.5)
  expect(metric(s, 'shopClicks').now).toBe(2)
  expect(metric(s, 'shopPer1000').now).toBe(2000) // 2 clicks, 1 reader
})

test('readers by language and country, this week and last', () => {
  const rows = [
    ...['/ca/a/', '/vi/ca/b/'].map((p, i) => [row(`vi${i}`, 'view', p, '2026-11-17 02:00:00'), row(`vi${i}`, 'time', p, '2026-11-17 02:00:30', 30)]).flat(),
    row('id', 'view', '/id/ikan/x/', '2026-11-17 02:00:00', 1, { cc: 'ID' }), row('id', 'scroll', '/id/ikan/x/', '2026-11-17 02:00:05', 50, { cc: 'ID' }),
    row('th', 'view', '/th/fish/x/', '2026-11-10 02:00:00', 1, { cc: 'TH' }), row('th', 'time', '/th/fish/x/', '2026-11-10 02:00:30', 30, { cc: 'TH' }),
    row('bounce', 'view', '/ca/c/', '2026-11-17 02:00:00', 1, { cc: 'US' }),
  ]
  const s = summariseScoreboard(input({ beacon: rows }))
  expect(metric(s, 'readers.vi').now).toBe(2)
  expect(metric(s, 'readers.id').now).toBe(1)
  expect(metric(s, 'readers.th')).toMatchObject({ now: 0, last: 1 })
  expect(s.countries.now).toEqual([{ cc: 'VN', readers: 2 }, { cc: 'ID', readers: 1 }])
  expect(s.countries.last).toEqual([{ cc: 'TH', readers: 1 }])
})

test('this week so far is compared with last week at the same point, a week ending before the count started reads as unmeasured', () => {
  const rows = [
    row('a', 'view', '/ca/a/', '2026-11-17 02:00:00'),
    row('b', 'view', '/ca/a/', '2026-11-10 02:00:00'), // last Tuesday: before this point last week
    row('c', 'view', '/ca/a/', '2026-11-13 02:00:00'), // last Friday: after it
  ]
  const s = summariseScoreboard(input({ beacon: rows }))
  expect(metric(s, 'sessions')).toMatchObject({ now: 1, last: 2, lastSoFar: 1 })
  const w = metric(s, 'sessions').weeks
  expect(w).toHaveLength(WEEKS)
  // The count starts on Thursday 5 Nov (ae.ts READERS_FROM): that week reads a number, the ones before it null.
  expect(w.slice(0, WEEKS - 3).every(v => v === null)).toBe(true)
  expect(w.slice(WEEKS - 3)).toEqual([0, 2, 1])
  // A reset's first week: nothing before it to compare with.
  const first = summariseScoreboard(input({ now: new Date('2026-11-06T05:00:00Z'), beacon: [row('a', 'view', '/ca/a/', '2026-11-05 04:00:00')] }))
  expect(metric(first, 'sessions')).toMatchObject({ now: 1, last: null, lastSoFar: null })
})

test('a session with no view of its own, begun before the count, is not a session', () => {
  expect(visitsOf([row('old', 'time', '/ca/a/', '2026-11-17 02:00:00', 30)])).toEqual([])
})

test('tank keepers: accounts that changed a tank in the week, each once, the owner left out; comments and photos by the week they were sent', () => {
  const community = {
    tanks: [
      { who: 'a', at: '2026-11-17T01:00:00.000Z' }, { who: 'a', at: '2026-11-17T02:00:00.000Z' }, { who: 'b', at: '2026-11-18T01:00:00.000Z' },
      { who: 'owner-1', at: '2026-11-17T01:00:00.000Z' }, { who: 'c', at: '2026-11-10T01:00:00.000Z' },
    ],
    comments: [{ at: '2026-11-17T01:00:00.000Z' }, { at: '2026-11-11T01:00:00.000Z' }, { at: '2026-11-12T01:00:00.000Z' }],
    photos: [{ at: '2026-11-16T01:00:00.000Z' }],
  }
  const s = summariseScoreboard(input({ community }))
  expect(metric(s, 'keepers')).toMatchObject({ now: 2, last: 1 })
  expect(metric(s, 'comments')).toMatchObject({ now: 1, last: 2 })
  expect(metric(s, 'photos').now).toBe(1)
})

test('the server\'s redirect count sits beside the beacon\'s clicks, by the days it keeps', () => {
  const s = summariseScoreboard(input({ clicks: { days: ['2026-11-09', '2026-11-13', '2026-11-16', '2026-11-18'], clicks: [3, 4, 5, 6] } }))
  expect(metric(s, 'redirects')).toMatchObject({ now: 11, last: 7, lastSoFar: 3 })
  expect(metric(s, 'shopClicks').now).toBe(0)
})

test('the app: launches (not people), light and plug success, crash-free launches, none of it before there is data', () => {
  const none = summariseScoreboard(input())
  expect(metric(none, 'appSessions').now).toBe(0)
  expect(metric(none, 'lightOk').now).toBeNull()
  expect(metric(none, 'crashFree').now).toBeNull()
  const s = summariseScoreboard(input({ app: {
    sessions: Array.from({ length: 10 }, () => ({ at: '2026-11-17 02:00:00' })),
    actions: [{ at: '2026-11-17 02:00:00', act: 'light.write', n: '4', ok: '3' }, { at: '2026-11-17 03:00:00', act: 'light.connect', n: 4, ok: 4 }, { at: '2026-11-17 02:00:00', act: 'plug.switch', n: 2, ok: 1 }],
    crashes: [{ at: '2026-11-17 02:00:00', n: 1 }],
  } }))
  expect(metric(s, 'appSessions').now).toBe(10)
  expect(metric(s, 'lightOk').now).toBe(87.5)
  expect(metric(s, 'plugOk').now).toBe(50)
  expect(metric(s, 'crashFree').now).toBe(90)
})

test('what the site has: each week\'s last reading, this week\'s from the build, null with none', () => {
  const totals = (vi: number, fullCards?: number) => ({ kinds: {}, sources: {}, photos: { pages: 0, gallery: 0 }, built: { vi, id: 1, th: 2 }, ...(fullCards === undefined ? {} : { fullCards }) })
  const snapshots = [
    { day: '2026-11-09', totals: totals(100) }, { day: '2026-11-15', totals: totals(120, 50) },
    { day: '2026-11-16', totals: totals(130, 60) },
  ] as unknown as ScoreboardInput['snapshots']
  const content = { totals: { built: { vi: 140, id: 3, th: 4 }, fullCards: 70 } } as unknown as ScoreboardInput['content']
  const s = summariseScoreboard(input({ snapshots, content }))
  expect(metric(s, 'pages.vi')).toMatchObject({ now: 140, last: 120, lastSoFar: null })
  expect(metric(s, 'pages.vi').weeks[WEEKS - 3]).toBeNull()
  expect(metric(s, 'fullCards')).toMatchObject({ now: 70, last: 50 })
})

test('guardrails: problems open at each week\'s end, Lighthouse and deploys apart', () => {
  const issue = (title: string, created_at: string, closed_at: string | null = null): CheckIssue => ({ title, created_at, closed_at })
  const checks = [
    issue('Site check failed: a journey', '2026-11-10T01:00:00Z', '2026-11-17T01:00:00Z'), // open last Sunday, closed since
    issue('Site check failed: another', '2026-11-17T01:00:00Z'),
    issue('Site check failed: lighthouse /', '2026-11-03T01:00:00Z'),
    issue('Deploy failed', '2026-11-11T01:00:00Z', '2026-11-11T05:00:00Z'), issue('Deploy failed', '2026-11-18T01:00:00Z'),
  ]
  const s = summariseScoreboard(input({ checks }))
  expect(metric(s, 'checksOpen')).toMatchObject({ now: 1, last: 1 })
  expect(metric(s, 'lighthouseOpen')).toMatchObject({ now: 1, last: 1 })
  expect(metric(s, 'deployFails')).toMatchObject({ now: 1, last: 1 })
})

test('a part that can\'t load says so in its place; its metrics read null, the others stand', () => {
  const s = summariseScoreboard(input({ beacon: { failed: 'AE down' }, checks: { failed: 'GitHub 403' }, community: { tanks: [], comments: [{ at: '2026-11-17T01:00:00.000Z' }], photos: [] } }))
  expect(s.failed).toEqual(expect.objectContaining({ beacon: 'AE down', checks: 'GitHub 403', content: 'Chưa cấu hình x.' }))
  expect(metric(s, 'answered').now).toBeNull()
  expect(metric(s, 'checksOpen').now).toBeNull()
  expect(metric(s, 'comments').now).toBe(1)
  const html = scoreboardPage(s)
  expect(html).toContain('AE down')
  expect(html).toContain('GitHub 403')
  expect(html).toContain('Bình luận được duyệt')
})

test('the page: Vietnamese, each metric this week against last with its 12 weeks, what can\'t be measured yet, only its own links', () => {
  const rows = [row('a', 'view', '/ca/a/', '2026-11-17 02:00:00', 1, GOOGLE), row('a', 'time', '/ca/a/', '2026-11-17 02:00:30', 30), row('b', 'view', '/ca/b/', '2026-11-10 02:00:00', 1, GOOGLE), row('b', 'scroll', '/ca/b/', '2026-11-10 02:00:04', 50)]
  const html = scoreboardPage(summariseScoreboard(input({ beacon: rows })))
  expect(html).toContain('<h1>Thành công</h1>')
  expect(html).toContain('16/11 đến 22/11')
  for (const name of Object.values(GROUPS).slice(1)) expect(html, name).toContain(`>${name}</h2>`)
  expect(html).toContain('Cùng lúc tuần trước')
  expect(html).toContain('class="spark"')
  expect(html).toContain('Chưa đo được')
  expect(html).toContain('Search Console')
  expect(html).toContain('aria-current="page">Thành công<')
  // A chart over weeks says weeks.
  expect(html).toContain('12 tuần')
  expect(html).toContain('Tuần 16/11')
  expect(html).not.toContain('Hôm nay')
  // Nothing about who a reader is: no session ids in the page or the JSON.
  expect(html).not.toContain('"sid"')
  expect(JSON.stringify(summariseScoreboard(input({ beacon: rows, community: { tanks: [{ who: 'reader-9', at: '2026-11-17T01:00:00.000Z' }], comments: [], photos: [] } })))).not.toContain('reader-9')
})

test('the report\'s block: the north star and the key metrics, week against last, with the page\'s address', () => {
  const rows = [row('a', 'view', '/ca/a/', '2026-11-17 02:00:00', 1, GOOGLE), row('a', 'time', '/ca/a/', '2026-11-17 02:00:30', 30), row('b', 'view', '/ca/b/', '2026-11-10 02:00:00', 1, GOOGLE), row('b', 'scroll', '/ca/b/', '2026-11-10 02:00:04', 50), row('c', 'view', '/ca/c/', '2026-11-12 02:00:00', 1, GOOGLE), row('c', 'scroll', '/ca/c/', '2026-11-12 02:00:04', 90)]
  const b = scoreboardBlock(summariseScoreboard(input({ beacon: rows })))
  expect(b.lines[0]).toBe('Người đọc tìm được câu trả lời: 1 (cùng lúc tuần trước 1, cả tuần trước 2)')
  expect(b.lines).toHaveLength(5)
  expect(b.href).toBe(dashboardUrl(SCOREBOARD_PATH))
})

test('the dashboard\'s absolute address is built in one place, worker/paths.ts dashboardUrl', () => {
  expect(dashboardUrl(SCOREBOARD_PATH)).toBe('https://aquatome.com/_ab/thanh-cong/')
  const here = new URL('..', import.meta.url).pathname
  for (const file of ['admin/scoreboard.ts', 'admin/pages.ts', 'admin/shell.ts', 'dashboard.ts', 'dashboard-host.ts', 'daily/compose.ts']) expect(readFileSync(`${here}${file}`, 'utf8'), file).not.toMatch(/https:\/\/[a-z.]*aquatome\.com\/_ab/)
})

test('the beacon\'s query keeps to the count and the kinds of event readers send', () => {
  const sql = BEACON_SQL(windowStart(NOW))
  // From the reset, with each tab's mark, so visitsOf leaves ours out (us.test.ts).
  expect(sql).toContain(SINCE_RESET)
  expect(sql).toContain(WHO_RANK)
  expect(sql).toContain("toDateTime('2026-08-30 17:00:00')")
  expect(sql).toContain("blob2 IN ('view', 'time', 'scroll', 'aff')") // not the language chooser's `lang`
})

// ——— The routes ———

afterEach(() => vi.unstubAllGlobals())
const PAGE = '<!doctype html><html lang="vi"><body><section id="tai-khoan" hidden></section><p id="acc-not-owner" hidden></p></body></html>'
const env = (over: Partial<Env> = {}) => ({
  ASSETS: { fetch: async () => new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) },
  AB: { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) },
  AB_DASH_TOKEN: 'tok', OWNER_ACCOUNTS: 'owner-1', DB: testD1(), ...over,
} as unknown as Env)
const browser = { 'user-agent': 'Mozilla/5.0 Chrome/141.0', 'accept-language': 'vi' }
const get = (path: string, h: Record<string, string> = browser) => new Request(`https://x.test${path}`, { headers: h })

test('/_ab/thanh-cong.json: the dashboard token reads the scoreboard, nobody else does, nothing is stored', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  const e = env()
  for (const h of [browser, { ...browser, authorization: 'Bearer wrong' }, { ...browser, cookie: 'ab_token=tok' }]) expect((await handle(get('/_ab/thanh-cong.json', h), e)).status).toBe(404)
  expect((await handle(new Request('https://x.test/_ab/thanh-cong.json', { method: 'POST', headers: { authorization: 'Bearer tok' } }), e)).status).toBe(404)
  const r = await handle(get('/_ab/thanh-cong.json', { authorization: 'Bearer tok' }), e)
  expect(r.status).toBe(200)
  expect(r.headers.get('cache-control')).toBe('no-store')
  const s = (await r.json()) as ReturnType<typeof summariseScoreboard>
  expect(s).toMatchObject({ v: 1, tz: 'Asia/Ho_Chi_Minh', northStar: 'answered', page: 'https://aquatome.com/_ab/thanh-cong/' })
  expect(s.weeks).toHaveLength(WEEKS)
  expect(s.metrics.find(m => m.key === 'answered')).toHaveProperty('weeks')
  expect(s.failed.beacon).toContain('AE_API_TOKEN') // no Analytics Engine here: said, not zero
})

test('/_ab/thanh-cong/: the owner\'s, like every dashboard page: the token opens no page, anyone else gets the sign-in', async () => {
  const e = env()
  for (const h of [browser, { ...browser, authorization: 'Bearer tok' }]) {
    for (const path of ['/_ab/thanh-cong/', '/_ab/thanh-cong']) {
      const body = await (await handle(get(path, h), e)).text()
      expect(body, path).toContain('data-next="/_ab/thanh-cong/"')
      expect(body, path).not.toContain('<h1>Thành công</h1>')
    }
  }
})

test('the scoreboard is one of the app\'s sections, first after the overview (docs/design/dashboard.md)', () => {
  expect(NAV.map(([p]) => p).slice(0, 2)).toEqual(['/_ab/', '/_ab/thanh-cong/'])
  expect(SECTIONS[0]?.key).toBe('thanh-cong')
})
