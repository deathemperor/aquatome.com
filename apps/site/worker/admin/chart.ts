/**
 * The admin pages' figures, drawn on the server: inline SVG charts over days, ranked bars, KPI tiles. No script and no
 * library. Each chart carries its own text: an SVG title and summary, a hover readout per day (<title>), and the
 * numbers as a table under it.
 *
 * Series colours (apps/site/worker/admin/shell.ts, --s1..--s3): green, blue, orange, checked with the dataviz skill's
 * validator on white in this order (each adjacent pair clears the colour-blind floor). A stack draws them bottom-up in
 * that order.
 */
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d })
/** USD: cents from a dollar up, four places below a cent (one identification costs about $0.01). */
export const usd = (n: number) => `$${fmt(n, n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`
/** 2026-11-02 → 02/11 */
export const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

/** The `n` UTC days ending with `now`'s, oldest first. */
export function lastDays(now: Date, n: number): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

/** A round top for an axis: 1, 2, 2.5 or 5 times a power of ten, at least `max`. */
export function niceTop(max: number): number {
  if (!(max > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= max - 1e-12)!
}
/** Axis numbers: in full under 10,000, then 12k. */
const tick = (n: number) => (n >= 10_000 ? `${fmt(n / 1000, n % 1000 ? 1 : 0)}k` : fmt(n, n > 0 && n < 1 ? 2 : n % 1 ? 1 : 0))

export type Series = { label: string; values: number[] }
export type DayChart = {
  /** Unique on the page: the SVG's title and summary hang off it. */
  id: string
  title: string
  days: string[]
  /** Up to three: one is plain columns or a line, more are stacked columns or lines, coloured --s1, --s2, --s3. */
  series: Series[]
  kind: 'columns' | 'lines'
  format?: (n: number) => string
  /** Before each axis number ('$' for money). */
  tickPrefix?: string
  /** The last day is today and not over yet: drawn lighter, said in its readout. */
  partialLast?: boolean
  /** What to say when every value is 0 or there are no days. */
  empty?: string
}

const W = 400
const PLOT_H = 136
const TOP = 10
const AXIS = 24
const H = TOP + PLOT_H + AXIS

/** A column from the baseline with a 4px round top, square at the base. */
function column(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return ''
  const r = round ? Math.min(4, w / 2, h) : 0
  const f = (n: number) => +n.toFixed(2)
  if (!r) return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`
  return `<path d="M${f(x)} ${f(y + h)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h)}Z"/>`
}

/** A chart over days as a <figure>: the SVG, its legend (two or more series), and the numbers as a table. */
export function dayChart(c: DayChart): string {
  const format = c.format ?? ((n: number) => fmt(n))
  const n = c.days.length
  const series = c.series.slice(0, 3)
  const head = `<figcaption><h3 id="${c.id}-t">${esc(c.title)}</h3></figcaption>`
  const totals = c.days.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0))
  if (!n || totals.every(t => !t)) return `<figure class="chart" aria-labelledby="${c.id}-t">${head}<p class="empty">${esc(c.empty ?? 'Chưa có số liệu trong khoảng này.')}</p></figure>`

  const stacked = c.kind === 'columns' && series.length > 1
  const max = c.kind === 'columns' && stacked ? Math.max(...totals) : Math.max(...series.flatMap(s => s.values))
  const top = niceTop(max)
  // Counts (no format given) never get a half-way tick of 2,5.
  const ticks = !c.format && (top / 2) % 1 ? [0, top] : [0, top / 2, top]
  const left = Math.max(22, Math.max(...ticks.map(t => `${c.tickPrefix ?? ''}${tick(t)}`.length)) * 7 + 8)
  // Lines end in a label each (the latest value) unless two would touch; the legend and table carry them then.
  const lastY = series.map(s => TOP + PLOT_H - ((s.values[n - 1] ?? 0) / top) * PLOT_H)
  const endLabels = c.kind === 'lines' && lastY.every((y, i) => lastY.every((z, j) => i === j || Math.abs(y - z) >= 13))
  const right = endLabels ? Math.max(...series.map(s => format(s.values[n - 1] ?? 0).length)) * 7 + 10 : 4
  const plotW = W - left - right
  const band = plotW / n
  const y = (v: number) => TOP + PLOT_H - (v / top) * PLOT_H
  const cx = (i: number) => left + band * (i + 0.5)
  const f = (v: number) => +v.toFixed(2)

  const grid = ticks.map(t => `<line class="grid" x1="${left}" x2="${W - right}" y1="${f(y(t))}" y2="${f(y(t))}"/><text class="tick" x="${left - 6}" y="${f(y(t) + 4)}" text-anchor="end">${esc(`${c.tickPrefix ?? ''}${tick(t)}`)}</text>`).join('')
  const labelAt = [...new Set(n >= 5 ? [0, Math.floor((n - 1) / 2), n - 1] : c.days.map((_, i) => i))]
  const xLabels = labelAt.map(i => {
    const [x, anchor] = n === 1 ? [cx(i), 'middle'] : i === 0 ? [left + band * i, 'start'] : i === n - 1 ? [left + band * (i + 1), 'end'] : [cx(i), 'middle']
    return `<text class="tick" x="${f(x)}" y="${H - 6}" text-anchor="${anchor}">${esc(dayLabel(c.days[i]!))}</text>`
  }).join('')

  let marks = ''
  if (c.kind === 'columns') {
    // Touching columns keep a 2px gap of the surface between them; no column is wider than 24.
    const w = Math.max(1, Math.min(24, band - 2))
    for (let i = 0; i < n; i++) {
      const x = left + band * i + (band - w) / 2
      let base = TOP + PLOT_H
      const parts = series.map(s => s.values[i] ?? 0)
      const topmost = parts.reduce((t, v, k) => (v > 0 ? k : t), -1)
      const cls = c.partialLast && i === n - 1 ? ' class="today"' : ''
      marks += `<g${cls}>`
      parts.forEach((v, k) => {
        if (v <= 0) return
        const h = (v / top) * PLOT_H
        // A stacked part above another starts 2px higher: the surface separates them.
        const gap = base < TOP + PLOT_H ? 2 : 0
        marks += `<g class="s${k + 1}">${column(x, base - h, w, Math.max(0, h - gap), k === topmost)}</g>`
        base -= h
      })
      marks += '</g>'
    }
  } else {
    series.forEach((s, k) => {
      const pts = c.days.map((_, i) => `${f(cx(i))},${f(y(s.values[i] ?? 0))}`)
      if (n > 1) marks += `<polyline class="line s${k + 1}" points="${pts.join(' ')}"/>`
      marks += `<circle class="dot s${k + 1}" cx="${f(cx(n - 1))}" cy="${f(y(s.values[n - 1] ?? 0))}" r="4"/>`
      if (endLabels) marks += `<text class="end" x="${f(cx(n - 1) + 8)}" y="${f(lastY[k]! + 4)}">${esc(format(s.values[n - 1] ?? 0))}</text>`
    })
  }

  const readout = (i: number) => `${dayLabel(c.days[i]!)}${c.partialLast && i === n - 1 ? ' (hôm nay, chưa hết ngày)' : ''}: ${series.map(s => `${s.label} ${format(s.values[i] ?? 0)}`).join(' · ')}`
  const hits = c.days.map((_, i) => `<rect class="hit" x="${f(left + band * i)}" y="${TOP}" width="${f(band)}" height="${PLOT_H}"><title>${esc(readout(i))}</title></rect>`).join('')

  const sums = series.map(s => s.values.reduce((a, b) => a + b, 0))
  const peak = totals.indexOf(Math.max(...totals))
  const desc = `${n} ngày, từ ${dayLabel(c.days[0]!)} đến ${dayLabel(c.days[n - 1]!)}. ${series.map((s, k) => `${s.label}: tổng ${format(sums[k]!)}`).join('; ')}. Cao nhất ngày ${dayLabel(c.days[peak]!)}.`
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${c.id}-t ${c.id}-d"><desc id="${c.id}-d">${esc(desc)}</desc>${grid}${marks}<line class="base" x1="${left}" x2="${W - right}" y1="${TOP + PLOT_H}" y2="${TOP + PLOT_H}"/>${xLabels}${hits}</svg>`
  const legend = series.length > 1 ? `<ul class="legend">${series.map((s, k) => `<li><span class="key ${c.kind === 'lines' ? 'kl' : 'kc'} s${k + 1}"></span>${esc(s.label)}</li>`).join('')}</ul>` : ''
  const rows = c.days.map((d, i) => [d, i] as const).reverse().map(([d, i]) => `<tr><th>${esc(dayLabel(d))}${c.partialLast && i === n - 1 ? ' (hôm nay)' : ''}</th>${series.map(s => `<td>${esc(format(s.values[i] ?? 0))}</td>`).join('')}</tr>`).join('')
  const table = `<details><summary>Bảng số liệu</summary><div class="scroll"><table><thead><tr><th>Ngày (UTC)</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`
  return `<figure class="chart" aria-labelledby="${c.id}-t">${head}${legend}${svg}${table}</figure>`
}

export type Ranked = { label: string; value: number; cells?: string[] }
/**
 * A ranked list as a table, its numbers drawn as bars from one baseline. `label` and `cells` are HTML, escaped by the
 * caller; `head`: the label's column, the value's, then one per cell.
 */
export function rankTable(rows: Ranked[], head: string[], format: (n: number) => string = n => fmt(n)): string {
  const max = Math.max(0, ...rows.map(r => r.value))
  const body = rows.map(r => `<tr><th>${r.label}</th><td class="bar"><span style="--w:${max ? +((100 * r.value) / max).toFixed(1) : 0}"></span>${esc(format(r.value))}</td>${(r.cells ?? []).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<div class="scroll"><table class="rank"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}" class="none">Chưa có.</td></tr>`}</tbody></table></div>`
}

export type Delta = { now: number; before: number; vs: string; /** 'up': more is better (readers, clicks): coloured. */ good?: 'up' }
/** "+12% so với 7 ngày trước", signed with a real minus; coloured only where more is plainly better. */
export function deltaHtml(d: Delta): string {
  if (!d.before) return `<span class="delta">${d.now ? `${esc(d.vs)}: 0` : `như ${esc(d.vs)}`}</span>`
  const p = Math.round(((d.now - d.before) / d.before) * 100)
  const tone = !p ? 'flat' : d.good === 'up' ? (p > 0 ? 'good' : 'bad') : 'flat'
  return `<span class="delta ${tone}">${p > 0 ? '+' : p < 0 ? '−' : '±'}${fmt(Math.abs(p))}% so với ${esc(d.vs)}</span>`
}

export type Tile = { label: string; value: string; sub?: string; delta?: Delta; href?: string }
/** KPI tiles: a label, the figure, then its change or a note. */
export function tiles(xs: Tile[]): string {
  return `<dl class="kpis">${xs.map(t => `<div class="kpi"><dt>${t.href ? `<a href="${esc(t.href)}">${esc(t.label)}</a>` : esc(t.label)}</dt><dd class="v">${esc(t.value)}</dd>${t.delta ? `<dd>${deltaHtml(t.delta)}</dd>` : ''}${t.sub ? `<dd class="sub">${esc(t.sub)}</dd>` : ''}</div>`).join('')}</dl>`
}
