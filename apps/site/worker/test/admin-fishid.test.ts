import { expect, test } from 'vitest'
import { cutWindows, DAYS_SQL, EARLY_SQL, fishSpan, periodTotals, RECENT_SQL, UNMATCHED_SQL, summariseFishId, type CallRow, type DayRow } from '../admin/fishid'
import { fishIdPage, fishIdSection } from '../admin/pages'

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
  expect(html).toContain('No calls in this period yet.')
  expect(html).toContain('No requests in this period.')
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
  expect(html).toContain('<a href="/ca/ca-neon-xanh/">Paracheirodon innesi</a>')
  // The log's UTC moment, in the viewer's time (Vietnam's by default).
  expect(html).toContain('<th class="l">Mon 2 Nov, 16:58</th>')
  expect(html).toContain('My tanks')
  expect(html).toContain('failed the spam check')
  // The page's one script is its own clock; a name never becomes one.
  expect(html.match(/<script>/g)).toHaveLength(1)
  expect(html).not.toContain('Betta <script>')
  expect(html).not.toContain('<img src=x>')
  expect(html).toContain('Betta &lt;script&gt;')
  // A page id the catalog doesn't know: shown as text, never turned into an address.
  const unknown = fishIdPage({ now: NOW, stats: s, keys: undefined, pages: new Map() })
  expect(unknown).not.toContain('href="paracheirodon')
  expect(unknown).toContain('(paracheirodon-innesi)')
})

test('no query sorts or groups by a column it renamed: Analytics Engine refuses that ("unable to find type of column")', () => {
  const w = { from: '2026-11-01T17:00:00.000Z' }
  for (const sql of [DAYS_SQL('Asia/Ho_Chi_Minh'), EARLY_SQL('Asia/Ho_Chi_Minh', cutWindows(NOW, 'Asia/Ho_Chi_Minh')), UNMATCHED_SQL(w), RECENT_SQL(w)]) {
    const renamed = [...sql.matchAll(/\b(timestamp|blob\d+|double\d+)\s+AS\s+\w+/gi)].map(m => m[1]!.toLowerCase())
    const after = (sql.match(/\b(?:ORDER|GROUP)\s+BY\s+([\s\S]*?)(?:\bLIMIT\b|\bFORMAT\b|$)/gi) ?? []).join(' ').toLowerCase()
    for (const col of renamed) expect(after, sql).not.toMatch(new RegExp(`\\b${col}\\b`))
  }
})

test('days are the viewer\'s: the query buckets in its zone, and today, the weeks and the month follow it', () => {
  expect(DAYS_SQL('Asia/Ho_Chi_Minh')).toContain("formatDateTime(timestamp, '%Y-%m-%d', 'Asia/Ho_Chi_Minh')")
  // 2026-11-01T23:30Z is already 2 November in Vietnam: the query's day says so, and so do the periods.
  const late = new Date('2026-11-01T23:30:00Z')
  const s = summariseFishId([row('2026-11-02', 'ok', 4, 4), row('2026-11-01', 'ok', 1, 1)], [], [], late, 'Asia/Ho_Chi_Minh')
  expect(s.days.at(-1)).toBe('2026-11-02')
  expect(s.periods.today.calls).toBe(4)
  expect(s.periods.yesterday.calls).toBe(1)
  expect(s.periods.mtd.calls).toBe(5) // November so far, its 1st and 2nd
  expect(s.periods.mtdPrev.calls).toBe(0)
  // The same moment in UTC is still the 1st.
  expect(summariseFishId([row('2026-11-01', 'ok', 1, 1)], [], [], late).periods.today.calls).toBe(1)
})

test('the agent\'s identifications: its calls to Claude, tool calls and photos, why it stopped and whether it looked again; cost per identification beside each period\'s total', () => {
  const s = summariseFishId(ROWS, [], [{ ...CALL, turns: '3', tools: '3', refs: '2', stopped: 'answer' }, { ...CALL, outcome: 'retry', attempts: 0 }, { ...CALL, turns: '4', tools: '1', refs: '1', stopped: 'calls', rechecked: '1' }], NOW)
  expect(s.recent.map(c => [c.turns, c.tools, c.refs, c.stopped, c.rechecked])).toEqual([[3, 3, 2, 'answer', false], [0, 0, 0, '', false], [4, 1, 1, 'calls', true]])
  const html = fishIdPage({ now: NOW, stats: s, keys: undefined, pages: new Map() })
  expect(html).toContain('<td class="l">3 · 3 · 2<br><span class="muted">answered</span></td>')
  // An answer sent back to look again (an unsure first answer, agent.ts recheckOf).
  expect(html).toContain('<td class="l">4 · 1 · 1<br><span class="muted">out of calls · looked again once</span></td>')
  expect(html).toContain('sent again, answer reused')
  // This week is today, a Monday: 3 identifications reached Claude for 3 × $0.0084.
  expect(html).toContain('<th>Per call</th>')
  expect(html).toContain('<td>$0.0084</td></tr>')
})

// ——— Periods: this week first, each against the same point of the one before ———

const TZ = 'Asia/Ho_Chi_Minh'
/** Wednesday 4 November, 16:00 in Vietnam. */
const WED = new Date('2026-11-04T09:00:00Z')

test('this week is Monday to now in the viewer\'s zone, against last week to the same weekday and time; today against yesterday so far', () => {
  const w = fishSpan('week', WED, TZ)
  expect([w.label, w.heading, w.vs]).toEqual(['This week', 'This week so far', 'last week'])
  expect(w.days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  // The chart runs to Sunday, today third.
  expect([w.chart[0], w.chart.at(-1), w.today]).toEqual(['2026-11-02', '2026-11-08', 2])
  // Midnight on Monday in Vietnam is 17:00 UTC on Sunday.
  expect(w.from).toBe('2026-11-01T17:00:00.000Z')
  // Last Monday and Tuesday whole, then last Wednesday up to 16:00.
  expect(w.before).toEqual({ days: ['2026-10-26', '2026-10-27'], cut: '2026-10-28' })
  expect(fishSpan('today', WED, TZ).before).toEqual({ days: [], cut: '2026-11-03' })
  // A Monday: last week is last Monday so far alone.
  expect(fishSpan('week', new Date('2026-11-02T03:00:00Z'), TZ).before).toEqual({ days: [], cut: '2026-10-26' })
  // In New York it is still Wednesday morning, and the week started on its own Monday.
  expect(fishSpan('week', WED, 'America/New_York').from).toBe('2026-11-02T05:00:00.000Z')
})

test('7 and 30 days are whole days to yesterday; the month runs from its 1st, by name, against last month to the same day', () => {
  const d7 = fishSpan('d7', WED, TZ)
  expect([d7.days[0], d7.days.at(-1), d7.days.length, d7.to]).toEqual(['2026-10-28', '2026-11-03', 7, '2026-11-03T17:00:00.000Z'])
  expect([d7.before.days[0], d7.before.days.at(-1), d7.before.cut]).toEqual(['2026-10-21', '2026-10-27', undefined])
  expect(fishSpan('d30', WED, TZ).before.days).toHaveLength(30)
  const m = fishSpan('month', WED, TZ)
  expect([m.label, m.heading, m.days, m.chart.length, m.today]).toEqual(['November', 'November so far', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], 30, 3])
  expect(m.before).toEqual({ days: ['2026-10-01', '2026-10-02', '2026-10-03'], cut: '2026-10-04' })
  // The 31st against a month of 30 days: all of it.
  expect(fishSpan('month', new Date('2026-12-31T05:00:00Z'), TZ).before).toEqual({ days: expect.arrayContaining(['2026-11-01', '2026-11-30']), cut: undefined })
  expect(fishSpan('month', new Date('2026-12-31T05:00:00Z'), TZ).before.days).toHaveLength(30)
})

test('the cut days are read from their midnight to the time of day it is now, each once', () => {
  // Yesterday, last Wednesday and the 4th of October, each to 16:00 in Vietnam.
  expect(cutWindows(WED, TZ)).toEqual([
    { from: '2026-10-27T17:00:00.000Z', to: '2026-10-28T09:00:00.000Z' },
    { from: '2026-11-02T17:00:00.000Z', to: '2026-11-03T09:00:00.000Z' },
    { from: '2026-10-03T17:00:00.000Z', to: '2026-10-04T09:00:00.000Z' },
  ])
  expect(EARLY_SQL(TZ, cutWindows(WED, TZ))).toContain("(timestamp >= toDateTime('2026-10-27 17:00:00') AND timestamp < toDateTime('2026-10-28 09:00:00')) OR")
  // A period's own calls are read between its moments, this week from Monday's midnight to now.
  expect(RECENT_SQL(fishSpan('week', WED, TZ))).toContain("WHERE timestamp >= toDateTime('2026-11-01 17:00:00') ORDER BY")
  expect(UNMATCHED_SQL(fishSpan('d7', WED, TZ))).toContain("timestamp >= toDateTime('2026-10-27 17:00:00') AND timestamp < toDateTime('2026-11-03 17:00:00')")
})

const weekRows: DayRow[] = [
  row('2026-11-02', 'ok', 10, 10, { guessed: 10, linked: 8 }), row('2026-11-03', 'ok', 10, 10, { guessed: 10, linked: 8 }), row('2026-11-04', 'ok', 4, 4, { guessed: 4, linked: 2 }),
  row('2026-10-26', 'ok', 9, 9, { guessed: 9, linked: 6 }), row('2026-10-27', 'ok', 9, 9, { guessed: 9, linked: 6 }),
  // All of last Wednesday: only its morning counts against this week so far.
  row('2026-10-28', 'ok', 30, 30, { guessed: 30, linked: 30 }),
]
const earlyRows: DayRow[] = [row('2026-10-28', 'ok', 2, 2, { guessed: 2, linked: 1 })]

test('a period so far against the one before to the same point: its whole days, then the cut day\'s morning, never the cut day whole', () => {
  const s = summariseFishId(weekRows, [], [], WED, TZ, earlyRows)
  const t = periodTotals(s, fishSpan('week', WED, TZ))
  expect([t.now.calls, t.before.calls]).toEqual([24, 20])
  expect([t.now.linked, t.now.guessed, t.before.linked, t.before.guessed]).toEqual([18, 24, 13, 20])
})

test('the section: this week by default, its three figures each with its change, coloured only past 5%; led to a page in points', () => {
  const s = summariseFishId(weekRows, [], [], WED, TZ, earlyRows)
  const sec = fishIdSection({ now: WED, tz: TZ, stats: s, keys: undefined, pages: new Map() })
  expect([sec.period, sec.periods!.map(p => p.label)]).toEqual(['week', ['This week', 'Today', '7 days', '30 days', 'November']])
  expect(sec.blocks[0]).toEqual({ kind: 'heading', text: 'This week so far', level: 3 })
  const fig = sec.blocks[1] as Extract<typeof sec.blocks[number], { kind: 'figures' }>
  expect(fig.items.map(x => [x.label, x.value, x.delta])).toEqual([
    ['Claude calls', '24', { text: '+20% vs last week', tone: 'good' }],
    ['Claude cost', '$0.20', { text: '+20% vs last week', tone: 'muted' }],
    // 75% against 65%.
    ['Led to a page', '75%', { text: '+10 pts vs last week', tone: 'good' }],
  ])
  // No intro line: the heading, then the figures.
  expect(sec.blocks.slice(0, 2).map(b => b.kind)).toEqual(['heading', 'figures'])
  // Within 5%: no colour, even where more is better.
  // 49 calls against 50.
  const flat = summariseFishId(['2026-11-02', '2026-11-03', '2026-10-26', '2026-10-27'].map(d => row(d, 'ok', 20, 20)).concat(row('2026-11-04', 'ok', 9, 9)), [], [], WED, TZ, [row('2026-10-28', 'ok', 10, 10)])
  const f2 = (fishIdSection({ now: WED, tz: TZ, stats: flat, keys: undefined, pages: new Map() }).blocks[1] as typeof fig).items[0]!
  expect(f2.delta).toEqual({ text: '−2% vs last week', tone: 'muted' })
  // Another period by its key; one the section doesn't offer is this week.
  expect(fishIdSection({ now: WED, tz: TZ, stats: s, keys: undefined, pages: new Map(), period: 'd30' }).period).toBe('d30')
  expect(fishIdSection({ now: WED, tz: TZ, stats: s, keys: undefined, pages: new Map(), period: 'year' }).period).toBe('week')
})
