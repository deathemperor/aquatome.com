import { expect, test } from 'vitest'
import { DAYS_SQL, RECENT_SQL, UNMATCHED_SQL, summariseFishId, type CallRow, type DayRow } from '../admin/fishid'
import { fishIdPage } from '../admin/pages'

const NOW = new Date('2026-11-02T10:00:00Z')
const row = (d: string, outcome: string, n: number, called: number, extra: Partial<DayRow> = {}): DayRow =>
  ({ d, outcome, n: String(n), called: String(called), tin: called * 1500, tout: called * 120, usd: called * 0.0084, guessed: 0, linked: 0, ...extra })

const ROWS: DayRow[] = [
  row('2026-11-02', 'ok', 3, 3, { guessed: '3', linked: '2' }), // today
  row('2026-11-02', 'rate', 2, 0, { tin: 0, tout: 0, usd: 0 }),
  row('2026-11-01', 'ok', 4, 4, { guessed: 4, linked: 1 }), // yesterday
  row('2026-11-01', 'unavailable', 1, 1, { tin: 0, tout: 0, usd: 0 }),
  row('2026-10-26', 'ok', 2, 2), // 7 days ago: in the 7 days
  row('2026-10-25', 'ok', 5, 5), // 8 days ago: the 7 before
  row('2026-10-03', 'ok', 1, 1), // 30 days ago: in the 30 days, not the chart
  row('2026-10-01', 'refused', 6, 6), // last month: in the 30 before, and the same days of last month
  row('2026-10-02', 'ok', 1, 1), // last month, day 2: the same days of last month
  row('2026-10-03', 'turnstile', 9, 0, { tin: 0, tout: 0, usd: 0 }),
]

test('the log by period: calls, answers, refusals before a call, tokens and cost; today against yesterday', () => {
  const s = summariseFishId(ROWS, [], [], NOW)
  expect(s.periods.today).toMatchObject({ requests: 5, calls: 3, ok: 3, none: 0, blocked: 2, tin: 4500, tout: 360, guessed: 3, linked: 2 })
  expect(s.periods.today.usd).toBeCloseTo(0.0252)
  expect(s.periods.yesterday).toMatchObject({ requests: 5, calls: 5, ok: 4, none: 1, blocked: 0 })
  // 7 whole days to yesterday (26/10–01/11) against the 7 before (19–25/10).
  expect(s.periods.d7.calls).toBe(7)
  expect(s.periods.d7prev.calls).toBe(5)
  // 30 whole days (03/10–01/11) against the 30 before.
  expect(s.periods.d30).toMatchObject({ calls: 13, blocked: 9 })
  expect(s.periods.d30prev).toMatchObject({ calls: 7, none: 6 })
  // This month so far (01–02/11) against 01–02/10.
  expect(s.periods.mtd.calls).toBe(8)
  expect(s.periods.mtdPrev.calls).toBe(7)
  // The chart's 30 days end today (04/10–02/11).
  expect(s.days[0]).toBe('2026-10-04')
  expect(s.days[29]).toBe('2026-11-02')
  expect(s.perDay.ok.slice(-2)).toEqual([4, 3])
  expect(s.perDay.none.slice(-2)).toEqual([1, 0])
  expect(s.perDay.blocked.slice(-2)).toEqual([0, 2])
  expect(s.periods.last30).toMatchObject({ guessed: 7, linked: 3 })
})

test('no rows: every period is zero and the page says nothing was logged yet', () => {
  const s = summariseFishId([], [], [], NOW)
  expect(s.periods.d30.calls).toBe(0)
  expect(s.perDay.usd.every(v => v === 0)).toBe(true)
  const html = fishIdPage({ now: NOW, stats: s, keys: undefined, pages: new Map() })
  expect(html).toContain('Chưa có lượt nào được ghi')
  expect(html).toContain('khoảng 3 tháng')
})

test('the month\'s first days compare with the same days of a shorter month', () => {
  const s = summariseFishId([row('2026-02-28', 'ok', 1, 1), row('2026-03-31', 'ok', 2, 2)], [], [], new Date('2026-03-31T05:00:00Z'))
  expect(s.periods.mtd.calls).toBe(2)
  expect(s.periods.mtdPrev.calls).toBe(1)
})

const CALL: CallRow = { t: '2026-11-02 09:58:01', outcome: 'ok', model: 'claude-opus-5-5', kh: 'a1b2c3d4', verdict: 'fish', sci: 'Paracheirodon innesi', page: 'paracheirodon-innesi', lang: 'vi', src: 'tank', cc: 'VN', tin: '1500', tout: '120', usd: '0.0084', ms: '2300', attempts: '1', conf: '0.92', guesses: '3' }

test('unmatched guesses most first with their mean confidence; the last calls with links from the catalog only, everything escaped', () => {
  const s = summariseFishId([], [{ sci: 'Betta <script>', n: '2', conf: '1.2' }, { sci: 'Trigonostigma heteromorpha', n: '5', conf: '4' }], [CALL, { ...CALL, sci: '<img src=x>', page: '', outcome: 'turnstile', verdict: '', kh: '', attempts: 0, guesses: 0, src: '' }], NOW)
  expect(s.unmatched).toEqual([{ sci: 'Trigonostigma heteromorpha', n: 5, conf: 0.8 }, { sci: 'Betta <script>', n: 2, conf: 0.6 }])
  expect(s.recent[0]).toMatchObject({ key: 'a1b2c3d4', from: 'tank', tin: 1500, usd: 0.0084, conf: 0.92 })
  const html = fishIdPage({ now: NOW, stats: s, keys: undefined, pages: new Map([['paracheirodon-innesi', '/vi/ca/ca-neon-xanh/']]) })
  expect(html).toContain('<a href="/ca/ca-neon-xanh/"><i class="sci">Paracheirodon innesi</i></a>')
  expect(html).toContain('<th>02/11 09:58</th>')
  expect(html).toContain('Bể của tôi')
  expect(html).toContain('không qua kiểm tra chống spam')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img src=x>')
  expect(html).toContain('Betta &lt;script&gt;')
  // A page id the catalog doesn't know: shown as text, never turned into an address.
  const unknown = fishIdPage({ now: NOW, stats: s, keys: undefined, pages: new Map() })
  expect(unknown).not.toContain('href="paracheirodon')
  expect(unknown).toContain('(paracheirodon-innesi)')
})

test('no query sorts or groups by a column it renamed: Analytics Engine refuses that ("unable to find type of column")', () => {
  for (const sql of [DAYS_SQL, UNMATCHED_SQL, RECENT_SQL]) {
    const renamed = [...sql.matchAll(/\b(timestamp|blob\d+|double\d+)\s+AS\s+\w+/gi)].map(m => m[1]!.toLowerCase())
    const after = (sql.match(/\b(?:ORDER|GROUP)\s+BY\s+([\s\S]*?)(?:\bLIMIT\b|\bFORMAT\b|$)/gi) ?? []).join(' ').toLowerCase()
    for (const col of renamed) expect(after, sql).not.toMatch(new RegExp(`\\b${col}\\b`))
  }
})
