import { expect, test } from 'vitest'
import { dayChart, deltaHtml, lastDays, niceTop, rankTable, tiles, usd } from '../admin/chart'

const days = (n: number) => lastDays(new Date('2026-11-02T10:00:00Z'), n)

test('days: the n UTC days ending today, oldest first', () => {
  expect(days(3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  expect(lastDays(new Date('2026-03-01T23:59:00Z'), 2)).toEqual(['2026-02-28', '2026-03-01'])
})

test('axis tops are round: 1, 2, 2.5, 5 times a power of ten', () => {
  expect([0, 0.37, 3, 7, 12, 260, 1001].map(niceTop)).toEqual([1, 0.5, 5, 10, 20, 500, 2000])
})

test('a chart with no days or only zeros says so, with no SVG', () => {
  for (const d of [[], days(30)]) {
    const html = dayChart({ id: 'c', title: 'Lượt bấm', days: d, series: [{ label: 'Lượt', values: d.map(() => 0) }], kind: 'columns', empty: 'Chưa có lượt nào.' })
    expect(html).toContain('Chưa có lượt nào.')
    expect(html).not.toContain('<svg')
    expect(html).toContain('<h3 id="c-t">Lượt bấm</h3>')
  }
})

test('one day: one column, its readout and table row; one line point is a dot', () => {
  const html = dayChart({ id: 'one', title: 'Một ngày', days: days(1), series: [{ label: 'Lượt', values: [7] }], kind: 'columns' })
  expect(html.match(/<rect class="hit"/g)).toHaveLength(1)
  expect(html).toContain('<title>02/11: Lượt 7</title>')
  expect(html).toMatch(/<g class="s1"><path d="M[^"]+"\/><\/g>/)
  expect(html).toContain('<tr><th>02/11</th><td>7</td></tr>')
  expect(html).toContain('role="img" aria-labelledby="one-t one-d"')
  const line = dayChart({ id: 'l', title: 'Một điểm', days: days(1), series: [{ label: 'A', values: [3] }, { label: 'B', values: [9] }], kind: 'lines' })
  expect(line).not.toContain('<polyline')
  expect(line.match(/<circle class="dot/g)).toHaveLength(2)
})

test('thirty days: columns no wider than 24 with a 2px gap, today lighter, labels on the first, middle and last day, a table newest first', () => {
  const vals = days(30).map((_, i) => i)
  const html = dayChart({ id: 'm', title: 'Ba mươi ngày', days: days(30), series: [{ label: 'Người đọc', values: vals }], kind: 'columns', partialLast: true })
  expect(html.match(/<rect class="hit"/g)).toHaveLength(30)
  // Day 0 is 0: no column drawn for it.
  expect(html.match(/<g class="s1">/g)).toHaveLength(29)
  expect(html).toContain('<g class="today">')
  expect(html).toContain('(hôm nay, chưa hết ngày): Người đọc 29')
  expect([...html.matchAll(/<text class="tick" x="[\d.]+" y="\d+" text-anchor="(start|middle|end)">(\d\d\/\d\d)<\/text>/g)].map(m => [m[1], m[2]])).toEqual([['start', '04/10'], ['middle', '18/10'], ['end', '02/11']])
  const widths = [...html.matchAll(/<rect class="hit" x="[\d.]+" y="\d+" width="([\d.]+)"/g)].map(m => Number(m[1]))
  expect(Math.min(...widths)).toBeGreaterThan(2)
  expect(html.indexOf('<th>02/11 (hôm nay)</th>')).toBeLessThan(html.indexOf('<th>04/10</th>'))
  expect(html).toContain('Cao nhất ngày 02/11')
  // One series: no legend box, the title names it.
  expect(html).not.toContain('class="legend"')
})

test('stacked columns: a legend, one rounded top per day, every series in the readout; lines end in their values unless they would touch', () => {
  const d = days(3)
  const html = dayChart({ id: 's', title: 'Theo kết quả', days: d, series: [{ label: 'Có', values: [2, 0, 1] }, { label: 'Không', values: [1, 0, 0] }, { label: 'Chặn', values: [0, 4, 1] }], kind: 'columns' })
  expect(html).toContain('<ul class="legend"><li><span class="key kc s1"></span>Có</li><li><span class="key kc s2"></span>Không</li><li><span class="key kc s3"></span>Chặn</li></ul>')
  expect(html).toContain('<title>31/10: Có 2 · Không 1 · Chặn 0</title>')
  // Day one: green below blue, blue on top rounded (a path), green square (a rect).
  expect(html).toMatch(/<g class="s1"><rect [^>]+\/><\/g><g class="s2"><path /)
  const apart = dayChart({ id: 'a', title: 'Hai đường', days: d, series: [{ label: 'Vào', values: [100, 200, 300] }, { label: 'Ra', values: [10, 20, 30] }], kind: 'lines' })
  expect(apart.match(/<text class="end"/g)).toHaveLength(2)
  expect(apart).toContain('<span class="key kl s2"></span>Ra')
  const close = dayChart({ id: 'b', title: 'Sát nhau', days: d, series: [{ label: 'Vào', values: [100, 200, 300] }, { label: 'Ra', values: [100, 200, 299] }], kind: 'lines' })
  expect(close).not.toContain('<text class="end"')
})

test('a count axis never shows a half: 0 and 5, not 2,5; money keeps its middle and its $', () => {
  const counts = dayChart({ id: 'k', title: 'Đếm', days: days(3), series: [{ label: 'Tài khoản', values: [1, 3, 5] }], kind: 'columns' })
  expect(counts).not.toContain('>2,5<')
  expect(counts).toContain('text-anchor="end">5</text>')
  const money = dayChart({ id: 'u', title: 'Chi phí', days: days(3), series: [{ label: 'Chi phí', values: [0.1, 0.3, 0.45] }], kind: 'columns', format: usd, tickPrefix: '$' })
  expect(money).toContain('>$0,25<')
  expect(money).toContain('>$0,50<')
})

test('labels are escaped wherever they appear', () => {
  const html = dayChart({ id: 'x', title: '<b>t</b>', days: days(2), series: [{ label: '<i>a</i>', values: [1, 2] }, { label: 'b"', values: [1, 1] }], kind: 'lines' })
  expect(html).not.toContain('<b>t</b>')
  expect(html).not.toContain('<i>a</i>')
  expect(html).toContain('&lt;i&gt;a&lt;/i&gt;')
})

test('ranked bars, tiles and changes', () => {
  const t = rankTable([{ label: 'google', value: 50, cells: ['10'] }, { label: 'facebook', value: 25 }], ['Nguồn', 'Phiên', 'Người đọc'])
  expect(t).toContain('style="--w:100"')
  expect(t).toContain('style="--w:50"')
  expect(rankTable([], ['A', 'B'])).toContain('Chưa có.')
  expect(deltaHtml({ now: 112, before: 100, vs: '7 ngày trước đó', good: 'up' })).toBe('<span class="delta good">+12% so với 7 ngày trước đó</span>')
  expect(deltaHtml({ now: 92, before: 100, vs: 'x', good: 'up' })).toContain('class="delta bad">−8%')
  expect(deltaHtml({ now: 150, before: 100, vs: 'x' })).toContain('class="delta flat">+50%')
  expect(deltaHtml({ now: 5, before: 0, vs: 'kỳ trước' })).toContain('kỳ trước: 0')
  expect(deltaHtml({ now: 0, before: 0, vs: 'kỳ trước' })).toContain('như kỳ trước')
  expect(tiles([{ label: 'Người đọc', value: '1.234', href: '/_ab/doc-gia/' }])).toContain('<a href="/_ab/doc-gia/">Người đọc</a>')
  expect([usd(0), usd(0.0084), usd(1.5)]).toEqual(['$0,00', '$0,0084', '$1,50'])
})
