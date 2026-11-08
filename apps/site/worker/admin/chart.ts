/**
 * The admin pages' figures, drawn on the server as HTML and CSS, so text stays at its real size on a phone: columns over
 * days, ranked bars, KPI tiles, meters and the overview's small columns. No library. Each chart carries its own text: a
 * readout line that gives the period's totals and, once a day is tapped (shell.ts's script), that day's; a summary for
 * screen readers; and the numbers as a table under it.
 *
 * Series colours (shell.ts, --s1..--s3): moss, water, rust, in that order, stepped for each mode and checked with the
 * dataviz skill's validator against the panel they sit on (each adjacent pair clears the colour-blind target and the
 * normal-vision floor). A stack draws them bottom-up in that order; one that is only context takes the muted one
 * (`mute`). A series is never the status colours: those mean what waits on the owner, and faults.
 */
import { localDay } from './time'

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d })
/** USD: cents from a dollar up, four places below a cent (one identification costs about $0.01). */
export const usd = (n: number) => `$${fmt(n, n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`
/** 2026-11-02 → 02/11 */
export const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

/** The `n` days ending with the day it is at `now` in `tz` (the viewer's, admin/time.ts), oldest first. */
export function lastDays(now: Date, n: number, tz = 'UTC'): string[] {
  const end = Date.parse(`${localDay(now, tz)}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

/** A round top for an axis: 1, 2, 2.5 or 5 times a power of ten, at least `max`. */
export function niceTop(max: number): number {
  if (!(max > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(max))
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= max - 1e-12)!
}
/** The decimals that write `n` exactly, up to 4: an axis at $0,025 says so, not $0,03. */
const places = (n: number) => [0, 1, 2, 3, 4].find(d => Math.abs(Math.round(n * 10 ** d) - n * 10 ** d) < 1e-6) ?? 4
/** Axis numbers: in full under 10,000, then 12k. */
const tick = (n: number) => (n >= 10_000 ? `${fmt(n / 1000, places(n / 1000))}k` : fmt(n, places(n)))
const f2 = (v: number) => +v.toFixed(2)
/** A value that can be drawn: null, undefined and NaN are days not recorded. */
const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** A series is never orange or red (those mean waits on the owner, and a fault): s1–s3 by position, mute for context. */
export type Tone = 's1' | 's2' | 's3' | 'mute'
/** A value per day; null where the day wasn't recorded (drawn as such, and said in its readout). */
export type Series = { label: string; values: (number | null)[]; tone?: Tone }
export type DayChart = {
  /** Unique on the page: the readout, the summary and the table hang off it. */
  id: string
  title: string
  days: string[]
  /** Up to three, stacked from the baseline in this order (a negative value hangs below it). One series needs no key: the title names it. */
  series: Series[]
  /** A total the series are parts of (sessions, of which readers): a pale column behind them, read out after them. */
  whole?: Series
  format?: (n: number) => string
  /** Before each axis number ('$' for money). */
  tickPrefix?: string
  /** 'usd': money, written as `usd` writes it with '$' before each axis number (format and tickPrefix in one, as data). */
  unit?: 'usd'
  /** The last day is today and not over yet: drawn lighter, said in its readout. */
  partialLast?: boolean
  /** With partialLast, when the last day closes at a set time and isn't today by the viewer's clock: said of it in place of "today" and "not over yet". */
  lastSays?: string
  /** Today's bar when the chart runs past it (a week, Monday to Sunday): the days after it are still to come (null). */
  today?: number
  /** 'week': each of `days` is a week's Monday, and the chart says so. */
  period?: 'week'
  /** What to say when every value is 0 or missing, or there are no days. */
  empty?: string
  /** Why a day has no value, said in its readout ("chưa lưu số liệu ngày này"). */
  missing?: string
}

/**
 * A chart over days as a <figure>: the title, a readout line (the period's totals, each series keyed by its colour; a
 * day's values once one is tapped or picked with the arrow keys), the columns on a zero baseline, every seventh day
 * labelled back from the last, and the numbers as a table.
 */
export function dayChart(c: DayChart): string {
  const money = c.unit === 'usd'
  const weekly = c.period === 'week'
  const per = weekly ? 'tuần' : 'ngày'
  const format = c.format ?? (money ? usd : (n: number) => fmt(n))
  const prefix = c.tickPrefix ?? (money ? '$' : '')
  const n = c.days.length
  const series = c.series.slice(0, 3)
  const all = c.whole ? [...series, c.whole] : series
  const at = (s: Series, i: number) => (known(s.values[i]) ? s.values[i]! : null)
  const head = `<h3 id="${c.id}-t">${esc(c.title)}</h3>`
  if (!n || !all.some(s => c.days.some((_, i) => at(s, i)))) return `<figure class="chart" aria-labelledby="${c.id}-t"><figcaption>${head}</figcaption><p class="empty">${esc(c.empty ?? 'Chưa có số liệu trong khoảng này.')}</p></figure>`

  // The scale: zero, the round top above the tallest stack (or whole), and as far below as a negative day reaches.
  const sum = (i: number, sign: 1 | -1) => series.reduce((t, s) => t + Math.max(0, sign * (at(s, i) ?? 0)), 0)
  const whole = c.days.map((_, i) => (c.whole ? at(c.whole, i) ?? 0 : 0))
  const up = c.days.map((_, i) => sum(i, 1))
  const down = c.days.map((_, i) => sum(i, -1))
  const nice = (m: number) => (m > 0 ? niceTop(m) : 0)
  const top = nice(Math.max(...up, ...whole))
  const bottom = nice(Math.max(...down, ...whole.map(w => -w)))
  const pct = (v: number) => (100 * v) / (top + bottom)
  const zero = pct(bottom)
  // Counts (no format given) never get a half-way tick of 2,5; a chart with a negative side keeps to its ends.
  const half = top && !bottom && (c.format || money || (top / 2) % 1 === 0) ? [top / 2] : []
  const ticks = [...(bottom ? [-bottom] : []), 0, ...half, ...(top ? [top] : [])]
  const tickText = (t: number) => `${t < 0 ? '−' : ''}${prefix}${tick(Math.abs(t))}`
  const gutter = Math.max(...ticks.map(t => tickText(t).length))
  const yAxis = ticks.map(t => `<span style="--y:${f2(pct(t + bottom))}">${esc(tickText(t))}</span>`).join('')
  const grid = ticks.map(t => `<b${t === 0 ? ' class="zero"' : ''} style="--y:${f2(pct(t + bottom))}"></b>`).join('')

  const last = n - 1
  const dm = (i: number) => dayLabel(c.days[i]!)
  const lastIsToday = c.partialLast && !c.lastSays
  const dayName = (i: number) =>
    weekly ? `Tuần ${dm(i)}`
      : lastIsToday && i === last ? `Hôm nay ${dm(i)}` : lastIsToday && i === last - 1 ? `Hôm qua ${dm(i)}` : `${WEEKDAY[new Date(`${c.days[i]}T00:00:00Z`).getUTCDay()]} ${dm(i)}`
  const unrecorded = (i: number) => all.every(s => at(s, i) === null)
  const when = (i: number) => `${dayName(i)}${c.partialLast && i === last ? ` · ${c.lastSays ?? `chưa hết ${per}`}` : ''}${unrecorded(i) ? ` · ${c.missing ?? 'không có số liệu'}` : ''}`
  const shown = (v: number | null) => (v === null ? '—' : format(v))

  const seg = (cls: string[], b: number, h: number) => `<i class="${cls.join(' ')}" style="--b:${f2(b)};--h:${f2(h)}"></i>`
  const cols = c.days.map((_, i) => {
    const vals = series.map(s => at(s, i))
    const lastUp = vals.reduce<number>((t, v, k) => (v !== null && v > 0 ? k : t), -1)
    const lastDown = vals.reduce<number>((t, v, k) => (v !== null && v < 0 ? k : t), -1)
    let marks = whole[i]! > 0 ? seg(['whole'], zero, pct(whole[i]!)) : ''
    let above = 0
    let below = 0
    vals.forEach((v, k) => {
      if (!v) return
      const cls: string[] = [series[k]!.tone ?? `s${k + 1}`]
      // A part above (or below) another keeps 2px of the panel between them; the outermost part has the round end.
      if (v > 0) {
        if (above) cls.push('up')
        if (k === lastUp) cls.push('cap')
        marks += seg(cls, zero + pct(above), pct(v))
        above += v
      } else {
        cls.push('neg')
        if (below) cls.push('dn')
        if (k === lastDown) cls.push('cap')
        marks += seg(cls, zero - pct(below - v), pct(-v))
        below -= v
      }
    })
    const cls = [c.partialLast && i === last ? 'today' : '', unrecorded(i) ? 'miss' : ''].filter(Boolean).join(' ')
    return `<li${cls ? ` class="${cls}"` : ''} data-d="${esc(when(i))}" data-v="${esc(all.map(s => shown(at(s, i))).join('|'))}">${marks}</li>`
  }).join('')

  // Every seventh day back from the last (the overview's weeks), or every fourth week, and the first when it stands clear of them.
  const labelled = new Set<number>()
  for (let i = last; i >= 0; i -= weekly ? 4 : 7) labelled.add(i)
  if (Math.min(...labelled) >= 3) labelled.add(0)
  const xAxis = [...labelled].sort((a, b) => a - b).map(i => {
    const mid = (100 * (i + 0.5)) / n
    const [x, cls] = n > 1 && mid < 7 ? [(100 * i) / n, ' class="s"'] : n > 1 && mid > 93 ? [(100 * (i + 1)) / n, ' class="e"'] : [mid, '']
    return `<span${cls} style="--x:${f2(x)}">${esc(dm(i))}</span>`
  }).join('')

  const totals = all.map(s => c.days.reduce((t, _, i) => t + (at(s, i) ?? 0), 0))
  const key = (s: Series, k: number) => (all.length > 1 ? `<i class="key ${s === c.whole ? 'whole' : s.tone ?? `s${k + 1}`}"></i>` : '')
  const readout = `<p class="readout${all.length > 1 ? ' multi' : ''}${weekly ? ' wk' : ''}" aria-live="polite"><span class="when">${n} ${per}</span>${all.map((s, k) => `<span class="v">${key(s, k)}<b>${esc(format(totals[k]!))}</b>${all.length > 1 ? ` ${esc(s.label)}` : ''}</span>`).join('')}<span class="hint" aria-hidden="true"></span></p>`

  const heights = c.whole ? whole : up
  const peak = heights.indexOf(Math.max(...heights))
  const gaps = c.days.filter((_, i) => unrecorded(i)).length
  const desc = `${n} ${per}, từ ${dm(0)} đến ${dm(last)}. ${all.map((s, k) => `${s.label}: tổng ${format(totals[k]!)}`).join('; ')}. Cao nhất ${per} ${dm(peak)}.${gaps ? ` ${fmt(gaps)} ${per} không có số liệu.` : ''} Phím mũi tên đọc từng ${per}.`
  const plot = `<div class="plot" data-plot role="group" tabindex="0" style="--n:${n};--gut:${gutter}" aria-labelledby="${c.id}-t" aria-describedby="${c.id}-d"><div class="yax" aria-hidden="true">${yAxis}</div><div class="area" aria-hidden="true"><div class="grid">${grid}</div><ol class="cols">${cols}</ol></div><div class="xax" aria-hidden="true">${xAxis}</div></div><p class="vh" id="${c.id}-d">${esc(desc)}</p>`

  const rows = c.days.map((d, i) => [d, i] as const).reverse().map(([d, i]) => `<tr><th>${esc(dayLabel(d))}${c.partialLast && i === last ? (c.lastSays ? ` (${esc(c.lastSays)})` : weekly ? ' (tuần này)' : ' (hôm nay)') : ''}</th>${all.map(s => `<td>${esc(shown(at(s, i)))}</td>`).join('')}</tr>`).join('')
  const table = `<details><summary>Bảng số liệu</summary><div class="scroll"><table><thead><tr><th>${weekly ? 'Tuần' : 'Ngày'}</th>${all.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`
  return `<figure class="chart" aria-labelledby="${c.id}-t"><figcaption>${head}${readout}</figcaption>${plot}${table}</figure>`
}

/** The dashboard's languages: the sections not yet moved to English stay Vietnamese. */
export type DashLang = 'vi' | 'en'
export type Readout = { title: string; detail: string }
const SHORT_DAY: Record<DashLang, string[]> = { vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 2026-11-05 → 5 Nov */
export const dayMonthEn = (day: string) => `${+day.slice(8, 10)} ${MONTH_EN[+day.slice(5, 7) - 1]}`
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
export const fmtEn = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
export const usdEn = (n: number) => `$${fmtEn(n, n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`
const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1)
/** Today's bar: `today`, or the last one when it isn't over (-1: today isn't on the chart). */
export const todayOf = (c: Pick<DayChart, 'days' | 'today' | 'partialLast'>) => c.today ?? (c.partialLast ? c.days.length - 1 : -1)

/**
 * Each bar's words, as the app shows them: its axis label ("T5", "Hôm nay"; a week, its Monday), and what a tap on it
 * shows: the first series' figure ("21 có kết quả"), then its day and the other series ("Thứ Năm 05/11 · 3 không có
 * kết quả"). Days after today are still to come. `also`: figures said with each bar but not drawn.
 */
export function barWords(c: DayChart, lang: DashLang = 'vi', also: Series[] = []): { labels: string[]; readouts: Readout[] } {
  const en = lang === 'en'
  const format = c.format ?? (c.unit === 'usd' ? (en ? usdEn : usd) : (n: number) => (en ? fmtEn(n) : fmt(n)))
  const weekly = c.period === 'week'
  const today = todayOf(c)
  const all = [...c.series.slice(0, 3), ...(c.whole ? [c.whole] : []), ...also]
  const date = (d: string) => (en ? dayMonthEn(d) : dayLabel(d))
  const label = (d: string, i: number) => (i === today && !weekly && !c.lastSays ? (en ? 'Today' : 'Hôm nay') : weekly || c.days.length > 7 ? date(d) : SHORT_DAY[lang][weekdayOf(d)]!)
  const so = (i: number) => (i === today ? (c.lastSays ? ` · ${c.lastSays}` : en ? ', so far' : weekly ? ' · chưa hết tuần' : ' · chưa hết ngày') : '')
  const day = (d: string, i: number) => (weekly ? `${en ? 'Week of' : 'Tuần'} ${date(d)}` : en ? `${SHORT_DAY.en[weekdayOf(d)]} ${date(d)}` : `${WEEKDAY[weekdayOf(d)]} ${date(d)}`) + so(i)
  const missing = c.missing ?? (en ? 'not recorded' : 'không có số liệu')
  // English counts one of a thing as one: "1 shop click".
  const noun = (s: Series, v: number) => lowerFirst(en && v === 1 && /[^s]s$/.test(s.label) ? s.label.slice(0, -1) : s.label)
  const said = (s: Series, i: number) => (known(s.values[i]) ? `${format(s.values[i]!)} ${noun(s, s.values[i]!)}` : `${lowerFirst(s.label)}: ${missing}`)
  return {
    labels: c.days.map(label),
    readouts: c.days.map((d, i) => (today >= 0 && i > today
      ? { title: en ? 'Still to come' : 'Chưa tới', detail: day(d, i) }
      : { title: said(all[0]!, i), detail: [day(d, i), ...all.slice(1).map(s => said(s, i))].join(' · ') })),
  }
}

/** A share of a whole (0–1) as a thin bar on a track, for the eye only: the text beside it says the figure. */
export function meter(share: number, tone?: 'warn'): string {
  if (!Number.isFinite(share)) return ''
  return `<span class="meter${tone ? ` ${tone}` : ''}" aria-hidden="true"><span style="--w:${f2(100 * Math.min(1, Math.max(0, share)))}"></span></span>`
}

export type Ranked = { label: string; value: number; cells?: string[]; /** The part of `value` drawn darker inside its bar (the readers among a source's sessions). */ part?: number }
/**
 * A ranked list as a table, each label over its bar: the bars share the label column's width and one baseline, and the
 * numbers line up in their own column. A negative value draws to the left of a zero mark. `label` and `cells` are HTML,
 * escaped by the caller; `head`: the label's column, the value's, then one per cell; `part` names what `part` counts.
 */
export function rankTable(rows: Ranked[], head: string[], format: (n: number) => string = n => fmt(n), opts: { part?: string } = {}): string {
  const vals = rows.map(r => r.value).filter(Number.isFinite)
  const hi = Math.max(0, ...vals)
  const lo = Math.min(0, ...vals)
  const span = hi - lo
  const zero = span ? (100 * -lo) / span : 0
  const bar = (r: Ranked) => {
    if (!span || !r.value || !Number.isFinite(r.value)) return ''
    const w = (100 * Math.abs(r.value)) / span
    const part = known(r.part) && r.value > 0 ? `<i style="--p:${f2(100 * Math.min(1, Math.max(0, r.part / r.value)))}"></i>` : ''
    return `<span class="bar${r.value < 0 ? ' neg' : ''}${part ? ' parts' : ''}" style="--x:${f2(r.value < 0 ? zero - w : zero)};--w:${f2(w)}">${part}</span>`
  }
  const track = (r: Ranked) => `<span class="track${lo < 0 ? ' signed' : ''}"${lo < 0 ? ` style="--z:${f2(zero)}"` : ''} aria-hidden="true">${bar(r)}</span>`
  const body = rows.map(r => `<tr><th><span class="lb">${r.label}</span>${track(r)}</th><td>${esc(format(r.value))}</td>${(r.cells ?? []).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  const key = opts.part && rows.some(r => known(r.part)) ? `<caption><span><i class="key s1"></i>${esc(opts.part)}</span><span><i class="key whole"></i>${esc(head[1] ?? '')}</span></caption>` : ''
  return `<div class="scroll"><table class="rank">${key}<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}" class="none">Chưa có.</td></tr>`}</tbody></table></div>`
}

export type Delta = { now: number; before: number; vs: string; /** 'up': more is better (readers, clicks): coloured. */ good?: 'up' }
/** A change in words: "+12% so với 7 ngày trước", signed with a real minus; its tone (none when there was nothing before). */
export function deltaOf(d: Delta, lang: DashLang = 'vi'): { text: string; tone?: 'good' | 'bad' | 'flat' } {
  const en = lang === 'en'
  if (!d.before) return { text: d.now ? `${d.vs}: 0` : `${en ? 'same as' : 'như'} ${d.vs}` }
  const p = Math.round(((d.now - d.before) / d.before) * 100)
  // Coloured only past 5%, and only where more is plainly better.
  const tone = Math.abs(p) <= 5 ? 'flat' : d.good === 'up' ? (p > 0 ? 'good' : 'bad') : 'flat'
  return { text: `${p > 0 ? '+' : p < 0 ? '−' : '±'}${(en ? fmtEn : fmt)(Math.abs(p))}% ${en ? 'vs' : 'so với'} ${d.vs}`, tone }
}
/** "+12% so với 7 ngày trước", coloured only where more is plainly better. */
export function deltaHtml(d: Delta): string {
  const { text, tone } = deltaOf(d)
  return `<span class="delta${tone ? ` ${tone}` : ''}">${esc(text)}</span>`
}

export type Tile = { label: string; value: string; sub?: string; delta?: Delta; href?: string; /** A share of a whole, 0–1, drawn as a meter under the figure. */ meter?: number }
/** KPI tiles: a label, the figure, its meter, then its change or a note. */
export function tiles(xs: Tile[]): string {
  return `<dl class="kpis">${xs.map(t => `<div class="kpi"><dt>${t.href ? `<a href="${esc(t.href)}">${esc(t.label)}</a>` : esc(t.label)}</dt><dd class="v">${esc(t.value)}</dd>${t.meter !== undefined && Number.isFinite(t.meter) ? `<dd>${meter(t.meter)}</dd>` : ''}${t.delta ? `<dd>${deltaHtml(t.delta)}</dd>` : ''}${t.sub ? `<dd class="sub">${esc(t.sub)}</dd>` : ''}</div>`).join('')}</dl>`
}

/**
 * A row's whole days as small columns: the last `recent` days, which the figure counts, in moss; the `recent` before
 * them, which the chip compares with, paler; the rest faint. A missing day (null) draws nothing. With `labels` (one a
 * column), a tap on a column, a finger sliding across or the pointer over it shows that column's day and value beside
 * the chart (`format`, the page's script), and a tap there doesn't follow the row's link: the owner (2026-11-07)
 * couldn't read a column's number by touch.
 */
export function spark(values: (number | null)[], recent = 7, o: { labels?: string[]; format?: (v: number) => string } = {}): string {
  const n = values.length
  const max = Math.max(0, ...values.map(v => (known(v) ? v : 0)))
  if (n < 2 || !(max > 0)) return ''
  const w = 104
  const h = 30
  const band = w / n
  const bars = values.map((v, i) => {
    if (!known(v) || v <= 0) return ''
    const bh = Math.max(1.5, (v / max) * (h - 2))
    const cls = i >= n - recent ? 'now' : i >= n - 2 * recent ? 'was' : 'old'
    return `<rect class="${cls}" data-i="${i}" x="${f2(i * band + 0.5)}" y="${f2(h - 1 - bh)}" width="${f2(Math.max(1, band - 1))}" height="${f2(bh)}" rx=".8"/>`
  }).join('')
  const svg = `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h - 0.5}" y2="${h - 0.5}"/>${bars}</svg>`
  if (o.labels?.length !== n) return svg
  const shown = values.map(v => (known(v) ? (o.format ?? fmt)(v) : '—'))
  return `<span class="spk" data-spark data-d="${esc(o.labels.join('|'))}" data-v="${esc(shown.join('|'))}">${svg}<span class="so" aria-hidden="true"></span></span>`
}

/**
 * A change as a chip: "+18%", or the difference itself while the counts are small ("+4"). Coloured only where more is
 * plainly better (`good: 'up'`); `vs` is read out after it. As data: its text, its tone (`plain` unless more is plainly
 * better and it changed), and what it compares with; chipHtml draws it.
 */
export type Chip = { text: string; tone: 'good' | 'bad' | 'plain'; vs: string }
export function chipOf(now: number, before: number, vs: string, good?: 'up'): Chip | undefined {
  if (!now && !before) return undefined
  const d = now - before
  const small = before < 10 || now < 10
  const v = small ? Math.abs(d) : Math.round((Math.abs(d) / before) * 100)
  // Coloured only past 5% (anything from nothing is past it).
  const tone = !d || !v || (before && Math.abs(d) / before <= 0.05) ? 'plain' : good === 'up' ? (d > 0 ? 'good' : 'bad') : 'plain'
  return { text: `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(v)}${small ? '' : '%'}`, tone, vs }
}
export const chipHtml = (c: Chip | undefined) =>
  c ? `<span class="chip${c.tone === 'plain' ? '' : ` ${c.tone}`}">${esc(c.text)}<span class="vh"> so với ${esc(c.vs)}</span></span>` : ''
