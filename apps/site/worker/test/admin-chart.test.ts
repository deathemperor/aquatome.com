import { expect, test } from 'vitest'
import { dayChart, deltaHtml, lastDays, meter, niceTop, rankTable, spark, tiles, usd } from '../admin/chart'

const days = (n: number) => lastDays(new Date('2026-11-02T10:00:00Z'), n)
/** Each column's data: its readout's day, and the values it reads out. */
const cols = (html: string) => [...html.matchAll(/<li(?: class="([^"]*)")? data-d="([^"]*)" data-v="([^"]*)">/g)].map(m => ({ cls: m[1] ?? '', d: m[2]!, v: m[3]!.split('|') }))
/** The marks of each column: tone and classes, bottom and height in % of the plot. */
const marks = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(m => [...m[1]!.matchAll(/<i class="([^"]+)" style="--b:([-\d.]+);--h:([\d.]+)"><\/i>/g)].map(x => ({ cls: x[1]!, b: Number(x[2]), h: Number(x[3]) })))
const ticks = (html: string) => [...html.matchAll(/<div class="yax"[^>]*>(.*?)<\/div>/g)].flatMap(m => [...m[1]!.matchAll(/<span style="--y:([\d.]+)">([^<]+)<\/span>/g)].map(x => [Number(x[1]), x[2]]))

test('days: the n days ending today, oldest first; today is the viewer\'s', () => {
  expect(days(3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  expect(lastDays(new Date('2026-03-01T23:59:00Z'), 2)).toEqual(['2026-02-28', '2026-03-01'])
  // 23:30 UTC on the 3rd is the 4th in Vietnam, and still the 3rd in New York.
  expect(lastDays(new Date('2026-11-03T23:30:00Z'), 2, 'Asia/Ho_Chi_Minh')).toEqual(['2026-11-03', '2026-11-04'])
  expect(lastDays(new Date('2026-11-04T02:30:00Z'), 1, 'America/New_York')).toEqual(['2026-11-03'])
})

test('axis tops are round: 1, 2, 2.5, 5 times a power of ten', () => {
  expect([0, 0.37, 3, 7, 12, 260, 1001].map(niceTop)).toEqual([1, 0.5, 5, 10, 20, 500, 2000])
})

test('a chart with no days, only zeros or only missing days says so, with no plot', () => {
  for (const [d, v] of [[[], []], [days(30), days(30).map(() => 0)], [days(5), days(5).map(() => null)]] as [string[], (number | null)[]][]) {
    const html = dayChart({ id: 'c', title: 'Lượt bấm', days: d, series: [{ label: 'Lượt', values: v }], empty: 'Chưa có lượt nào.' })
    expect(html).toContain('Chưa có lượt nào.')
    expect(html).not.toContain('data-plot')
    expect(html).toContain('<h3 id="c-t">Lượt bấm</h3>')
  }
})

test('one day: one column centred, its readout and table row; the period total reads first', () => {
  const html = dayChart({ id: 'one', title: 'Một ngày', days: days(1), series: [{ label: 'Lượt', values: [7] }] })
  expect(cols(html)).toEqual([{ cls: '', d: 'Thứ Hai 02/11', v: ['7'] }])
  expect(marks(html)).toEqual([[{ cls: 's1 cap', b: 0, h: 70 }]])
  expect(html).toContain('<span class="when">1 ngày</span><span class="v"><b>7</b></span>')
  expect(html).toContain('<tr><th>02/11</th><td>7</td></tr>')
  expect(html).toMatch(/<span style="--x:50">02\/11<\/span>/)
  expect(html).toContain('data-plot tabindex="0"')
  expect(html).toContain('aria-labelledby="one-t" aria-describedby="one-d"')
})

test('thirty days: today lighter and said so, every seventh day back from today labelled, a table newest first, the peak in the summary', () => {
  const vals = days(30).map((_, i) => i)
  const html = dayChart({ id: 'm', title: 'Ba mươi ngày', days: days(30), series: [{ label: 'Người đọc', values: vals }], partialLast: true })
  const c = cols(html)
  expect(c).toHaveLength(30)
  // Day 0 is 0: no mark drawn for it.
  expect(marks(html).filter(m => m.length)).toHaveLength(29)
  expect(c[29]).toEqual({ cls: 'today', d: 'Hôm nay 02/11 · chưa hết ngày', v: ['29'] })
  expect(c[28]!.d).toBe('Hôm qua 01/11')
  expect(c[0]!.d).toBe('Chủ nhật 04/10')
  expect([...html.matchAll(/<span(?: class="(s|e)")? style="--x:[\d.]+">(\d\d\/\d\d)<\/span>/g)].map(m => [m[1] ?? 'mid', m[2]])).toEqual([['s', '05/10'], ['mid', '12/10'], ['mid', '19/10'], ['mid', '26/10'], ['e', '02/11']])
  expect(html.indexOf('<th>02/11 (hôm nay)</th>')).toBeLessThan(html.indexOf('<th>04/10</th>'))
  expect(html).toContain('Cao nhất ngày 02/11')
  expect(html).toContain('<b>435</b>') // 0 + 1 + … + 29
  // One series: no key, the title names it.
  expect(html).not.toContain('class="key')
})

test('stacked parts: keyed in the readout, a 2px gap above each lower part, one round top; a series can wear the status tone', () => {
  const html = dayChart({ id: 's', title: 'Theo kết quả', days: days(3), series: [{ label: 'Có', values: [2, 0, 1] }, { label: 'Không', values: [1, 0, 0], tone: 'bad' }, { label: 'Chặn', values: [0, 4, 1], tone: 'mute' }] })
  expect(html).toContain('<span class="v"><i class="key s1"></i><b>3</b> Có</span><span class="v"><i class="key bad"></i><b>1</b> Không</span><span class="v"><i class="key mute"></i><b>5</b> Chặn</span>')
  expect(cols(html)[0]).toMatchObject({ d: 'Thứ Bảy 31/10', v: ['2', '1', '0'] })
  // Top 5: day one is 2 of moss from 0, then 1 of rust on it with the gap and the round top.
  expect(marks(html)[0]).toEqual([{ cls: 's1', b: 0, h: 40 }, { cls: 'bad up cap', b: 40, h: 20 }])
  expect(marks(html)[1]).toEqual([{ cls: 'mute cap', b: 0, h: 80 }])
  expect(ticks(html).map(t => t[1])).toEqual(['0', '5'])
})

test('a whole behind its part: sessions pale, readers on them, both read out', () => {
  const html = dayChart({ id: 'w', title: 'Phiên và người đọc', days: days(2), series: [{ label: 'Người đọc', values: [3, 4] }], whole: { label: 'Phiên', values: [8, 10] } })
  expect(marks(html)[1]).toEqual([{ cls: 'whole', b: 0, h: 100 }, { cls: 's1 cap', b: 0, h: 40 }])
  expect(cols(html)[1]!.v).toEqual(['4', '10'])
  expect(html).toContain('<i class="key whole"></i><b>18</b> Phiên')
  expect(html).toContain('<th>Người đọc</th><th>Phiên</th>')
})

test('a negative day hangs below a zero line, its own tick under it; a missing day is marked, not drawn as zero', () => {
  const html = dayChart({ id: 'n', title: 'Bài thêm', days: days(4), series: [{ label: 'Cá', values: [6, -2, null, 3] }, { label: 'Cây', values: [0, -1, null, 1] }], missing: 'chưa lưu số liệu ngày này' })
  // Top 10, bottom 5: zero sits a third of the way up.
  expect(ticks(html)).toEqual([[0, '−5'], [33.33, '0'], [100, '10']])
  expect(html).toContain('<b class="zero" style="--y:33.33">')
  expect(marks(html)[1]).toEqual([{ cls: 's1 neg', b: 20, h: 13.33 }, { cls: 's2 neg dn cap', b: 13.33, h: 6.67 }])
  expect(cols(html)[2]).toEqual({ cls: 'miss', d: 'Chủ nhật 01/11 · chưa lưu số liệu ngày này', v: ['—', '—'] })
  expect(marks(html)[2]).toEqual([])
  expect(html).toContain('<tr><th>01/11</th><td>—</td><td>—</td></tr>')
  expect(html).toContain('1 ngày không có số liệu.')
  // Totals leave the missing day out rather than count it as 0.
  expect(html).toContain('<b>7</b> Cá')
})

test('a count axis never shows a half: 0 and 5, not 2,5; money keeps its middle and its $', () => {
  const counts = dayChart({ id: 'k', title: 'Đếm', days: days(3), series: [{ label: 'Tài khoản', values: [1, 3, 5] }] })
  expect(ticks(counts).map(t => t[1])).toEqual(['0', '5'])
  const money = dayChart({ id: 'u', title: 'Chi phí', days: days(3), series: [{ label: 'Chi phí', values: [0.1, 0.3, 0.45] }], format: usd, tickPrefix: '$' })
  expect(ticks(money).map(t => t[1])).toEqual(['$0', '$0,25', '$0,5'])
  expect(money).toContain('<b>$0,85</b>')
  // Under a cent, each line says its own amount.
  const cents = dayChart({ id: 'v', title: 'Chi phí', days: days(2), series: [{ label: 'Chi phí', values: [0.004, 0.01] }], format: usd, tickPrefix: '$' })
  expect(ticks(cents).map(t => t[1])).toEqual(['$0', '$0,005', '$0,01'])
  // The axis gutter is as wide as its longest number.
  expect(cents).toContain('--gut:6')
})

test('labels are escaped wherever they appear; a long one stays whole', () => {
  const long = 'Bài viết, bài từ video, bài dịch và những trang được engine viết lại trong tuần'
  const html = dayChart({ id: 'x', title: '<b>t</b>', days: days(2), series: [{ label: '<i>a</i>', values: [1, 2] }, { label: long, values: [1, 1] }] })
  expect(html).not.toContain('<b>t</b>')
  expect(html).not.toContain('<i>a</i>')
  expect(html).toContain('&lt;i&gt;a&lt;/i&gt;')
  expect(html).toContain(`<b>2</b> ${long}</span>`)
})

test('ranked bars: each under its label from one baseline, numbers in their own column; a part inside; negatives left of a zero mark', () => {
  const t = rankTable([{ label: 'google', value: 50, cells: ['10'] }, { label: 'facebook', value: 25 }], ['Nguồn', 'Phiên', 'Người đọc'])
  expect(t).toContain('<th><span class="lb">google</span><span class="track" aria-hidden="true"><span class="bar" style="--x:0;--w:100"></span></span></th><td>50</td><td>10</td>')
  expect(t).toContain('style="--x:0;--w:50"')
  expect(rankTable([], ['A', 'B'])).toContain('Chưa có.')
  // All zero: rows, no bars.
  expect(rankTable([{ label: 'a', value: 0 }], ['A', 'B'])).not.toContain('class="bar')
  const parts = rankTable([{ label: 'google', value: 40, part: 10, cells: ['10'] }], ['Nguồn', 'Phiên', 'Người đọc'], undefined, { part: 'Người đọc' })
  expect(parts).toContain('<span class="bar parts" style="--x:0;--w:100"><i style="--p:25"></i></span>')
  expect(parts).toContain('<caption><span><i class="key s1"></i>Người đọc</span><span><i class="key whole"></i>Phiên</span></caption>')
  const signed = rankTable([{ label: 'a', value: 30 }, { label: 'b', value: -10 }], ['Nguồn', 'Bài thêm'], n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`)
  expect(signed).toContain('<span class="track signed" style="--z:25" aria-hidden="true"><span class="bar" style="--x:25;--w:75"></span></span>')
  expect(signed).toContain('<span class="bar neg" style="--x:0;--w:25"></span>')
  expect(signed).toContain('<td>−10</td>')
})

test('tiles, meters and changes', () => {
  expect(deltaHtml({ now: 112, before: 100, vs: '7 ngày trước đó', good: 'up' })).toBe('<span class="delta good">+12% so với 7 ngày trước đó</span>')
  expect(deltaHtml({ now: 92, before: 100, vs: 'x', good: 'up' })).toContain('class="delta bad">−8%')
  expect(deltaHtml({ now: 150, before: 100, vs: 'x' })).toContain('class="delta flat">+50%')
  expect(deltaHtml({ now: 5, before: 0, vs: 'kỳ trước' })).toContain('kỳ trước: 0')
  expect(deltaHtml({ now: 0, before: 0, vs: 'kỳ trước' })).toContain('như kỳ trước')
  expect(tiles([{ label: 'Người đọc', value: '1.234', href: '/_ab/doc-gia/' }])).toContain('<a href="/_ab/doc-gia/">Người đọc</a>')
  expect([usd(0), usd(0.0084), usd(1.5)]).toEqual(['$0,00', '$0,0084', '$1,50'])
  // A share is held to 0–100%; one that can't be worked out draws nothing.
  expect(meter(0.69)).toBe('<span class="meter" aria-hidden="true"><span style="--w:69"></span></span>')
  expect(meter(1.4, 'warn')).toContain('class="meter warn"')
  expect(meter(1.4)).toContain('--w:100')
  expect(meter(-1)).toContain('--w:0')
  expect(meter(NaN)).toBe('')
  expect(tiles([{ label: 'Có ảnh', value: '89%', meter: 0.89 }])).toContain('<dd><span class="meter"')
  expect(tiles([{ label: 'Có ảnh', value: '—', meter: NaN }])).not.toContain('meter')
})

test('a row\'s small columns: the last seven dark, the seven before pale, the rest faint; nothing for one day or all zeros', () => {
  const html = spark(Array.from({ length: 30 }, () => 2))
  expect(html.match(/class="now"/g)).toHaveLength(7)
  expect(html.match(/class="was"/g)).toHaveLength(7)
  expect(html.match(/class="old"/g)).toHaveLength(16)
  // A small value still shows; a missing or zero day draws nothing.
  const small = spark([100, 1, 0, null])
  expect(small.match(/<rect/g)).toHaveLength(2)
  expect(small).toMatch(/height="1.5"/)
  expect(spark([5])).toBe('')
  expect(spark([0, 0, 0])).toBe('')
  expect(spark([null, null])).toBe('')
})
