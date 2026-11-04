import { afterEach, expect, test, vi } from 'vitest'
import { appPage, appSql, queryApp, summariseApp, type AppRows } from '../admin/app'
import { unset } from '../admin/shell'

const NOW = new Date('2026-11-04T10:00:00Z')
const NONE: AppRows = { views: [], actions: [], errors: [], shops: [], health: [], perf: [] }
/** Rows as Analytics Engine's JSON gives them: 64-bit sums as strings. */
const ROWS: AppRows = {
  views: [
    { p: '/ca/ca-neon-vua/', s: '', n: '40' }, { p: '', s: 'lights', n: '25' }, { p: '/huong-dan/thay-nuoc/', s: '', n: 12 },
    { p: '', s: 'tanks', n: '9' }, { p: '/ca/ca-neon-vua/', s: '', n: '2' },
  ],
  actions: [
    { act: 'light.connect', ver: '1.0 (114)', n: '20', ok: '15' }, { act: 'light.connect', ver: '1.0 (115)', n: '10', ok: '9' },
    { act: 'fishid', ver: '1.0 (115)', n: '4', ok: '4' },
  ],
  errors: [{ act: 'light.connect', why: 'timeout', n: '5' }, { act: 'light.connect', why: '', n: '1' }],
  shops: [{ shop: 'shopee', p: '/ca/ca-neon-vua/', n: '3' }, { shop: 'tiki', p: '/ca/ca-neon-vua/', n: '1' }, { shop: 'shopee', p: '/huong-dan/thay-nuoc/', n: '2' }],
  health: [{ ver: '1.0 (114)', reports: '30', crashes: '3', hangs: '1', exits: '4' }, { ver: '1.0 (115)', reports: '5', crashes: '0', hangs: '0', exits: '0' }],
  perf: [
    ...[900, 1000, 1100, 1200, 3000].map(launch => ({ ver: '1.0 (114)', launch: String(launch), mem: '150', w: '1' })),
    { ver: '1.0 (115)', launch: '0', mem: '120.5', w: '1' }, // a report without launches: its memory counts, not its launch
  ],
}

test('the queries: 30 days, bounded, readers\' copies only unless the test builds are asked for', () => {
  for (const [name, q] of Object.entries(appSql(false))) {
    expect(q, name).toContain("blob14 = ''")
    expect(q, name).toContain("INTERVAL '30' DAY")
    expect(q, name).toMatch(/FROM aquatome_app WHERE/)
    expect(q, name).toMatch(/FORMAT JSON$/)
    if (name !== 'health') expect(q, name).toMatch(/LIMIT \d+/)
  }
  for (const q of Object.values(appSql(true))) expect(q).toContain("blob14 = '1'")
})

test('rows → views per page and screen, actions per version, shop taps, and each version\'s crashes and percentiles', () => {
  const s = summariseApp(ROWS, false)
  expect(s.pages).toEqual([{ path: '/ca/ca-neon-vua/', views: 42 }, { path: '/huong-dan/thay-nuoc/', views: 12 }])
  expect(s.screens).toEqual([{ screen: 'lights', views: 25 }, { screen: 'tanks', views: 9 }])
  expect(s.actions.map(a => [a.name, a.version, a.n, a.ok])).toEqual([['fishid', '1.0 (115)', 4, 4], ['light.connect', '1.0 (115)', 10, 9], ['light.connect', '1.0 (114)', 20, 15]])
  expect(s.shops).toEqual([{ shop: 'shopee', taps: 5 }, { shop: 'tiki', taps: 1 }])
  expect(s.shopPages).toEqual([{ path: '/ca/ca-neon-vua/', taps: 4 }, { path: '/huong-dan/thay-nuoc/', taps: 2 }])
  expect(s.versions).toEqual([
    { version: '1.0 (115)', reports: 5, crashes: 0, hangs: 0, exits: 0, launch: undefined, memory: { p50: 120.5, p90: 120.5, n: 1 } },
    { version: '1.0 (114)', reports: 30, crashes: 3, hangs: 1, exits: 4, launch: { p50: 1100, p90: 3000, n: 5 }, memory: { p50: 150, p90: 150, n: 5 } },
  ])
})

test('the page with data: every part, in Vietnamese, the paths as links, what the app sent escaped', () => {
  const rows = { ...ROWS, errors: [...ROWS.errors, { act: 'fishid', why: '<b>x</b>', n: '1' }] }
  const html = appPage(NOW, false, summariseApp(rows, false))
  expect(html).toContain('aria-current="page">Ứng dụng<')
  for (const part of ['Lượt xem', 'Thao tác', 'Lỗi hay gặp', 'Bấm sang sàn', 'Ổn định và hiệu năng theo phiên bản']) expect(html).toContain(part)
  expect(html).toContain('<a href="/ca/ca-neon-vua/">/ca/ca-neon-vua/</a>')
  expect(html).toContain('Kết nối đèn <code>light.connect</code></th><td class="l">1.0 (114)</td><td>20</td><td>75,0%</td><td>25,0%</td>')
  expect(html).toContain('<th>1.0 (114)</th><td>30</td><td>3</td><td>1</td><td>4</td><td>1.100 ms</td><td>3.000 ms</td><td>150 MB</td><td>150 MB</td>')
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  expect(html).not.toContain('<b>x</b>')
  expect(html).toContain('href="/_ab/ung-dung/?test=1"')
  expect(html).not.toContain('Chưa có gì')
})

test('nothing yet: the page says so, and every part says it has nothing, without failing', () => {
  const html = appPage(NOW, false, summariseApp(NONE, false))
  expect(html).toContain('Chưa có gì: ứng dụng chưa gửi sự kiện hay báo cáo nào')
  expect(html).toContain('Chưa có báo cáo nào.')
  expect(html).not.toContain('class="failed"')
  const tests = appPage(NOW, true, summariseApp(NONE, true))
  expect(tests).toContain('Đang xem các bản thử')
  expect(tests).toContain('chưa bản thử nào gửi')
  expect(tests).toContain('href="/_ab/ung-dung/">Xem bản App Store')
  // Not set up: says what is missing, in its place.
  expect(appPage(NOW, false, unset('AE_API_TOKEN và CF_ACCOUNT_ID'))).toContain('Chưa cấu hình AE_API_TOKEN và CF_ACCOUNT_ID.')
})

afterEach(() => { vi.restoreAllMocks() })

test('a dataset nothing has written to yet reads as empty; any other failure is the part\'s, said in its place', async () => {
  const seen: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
    seen.push(String(init?.body))
    return new Response('{"errors":[{"message":"unknown table aquatome_app"}]}', { status: 422 })
  })
  const s = await queryApp('acc', 'tok', true)
  expect(s.versions).toEqual([])
  expect(seen).toHaveLength(6)
  expect(seen.every(q => q.includes("blob14 = '1'"))).toBe(true)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('Unknown function', { status: 422 }))
  await expect(queryApp('acc', 'tok', false)).rejects.toThrow('analytics engine sql 422: Unknown function')
})
