import type { FishIdStatus } from '../fishid/api'
import type { Hidden } from '../hidden'
import type { Readers } from '../readers'
import type { Wanted } from '../wanted'
import { dayChart, deltaHtml, esc, fmt, lastDays, rankTable, tiles, usd, type Tile } from './chart'
import type { AccountStats } from './data'
import type { Call, FishIdStats, Totals } from './fishid'
import { failedBox, isFailed, page, type Soft } from './shell'

/** Each admin page's HTML from what its loaders returned; a part that failed says so in its place. */

export type AffSummary = { byNetwork: { network: string; category: string; n: number }[]; top: { entity_ref: string; n: number }[]; status: { status: string; n: number }[]; lastCheck: string | null }
export type RecentPhoto = { id: string; entity_ref: string; name: string; thumb: string; created_at: string }
export type Clicks = { days: string[]; clicks: number[] }

const UTC = 'Ngày tính theo giờ UTC (7 giờ sáng ở Việt Nam). “7 ngày”, “14 ngày”, “30 ngày”: những ngày trọn, đến hết hôm qua, so với chừng ấy ngày trước đó.'
const when = (iso: string) => esc(iso.slice(0, 16).replace('T', ' '))
/** The sum of `vals` (one per day, the last is today) from `from` to `to` days ago. */
const ago = (vals: number[], from: number, to: number) => vals.slice(vals.length - 1 - from, vals.length - to).reduce((a, b) => a + b, 0)
const alignDaily = (days: string[], daily: Readers['daily']) => {
  const m = new Map(daily.map(d => [d.day, d]))
  return { sessions: days.map(d => m.get(d)?.sessions ?? 0), readers: days.map(d => m.get(d)?.readers ?? 0) }
}
const failedTile = (label: string, f: { failed: string }, href?: string): Tile => ({ label, value: '—', sub: `Không tải được: ${f.failed.slice(0, 90)}`, href })

// ——— Tổng quan ———

export type Overview = { now: Date; readers: Soft<Readers['daily']>; clicks: Soft<Clicks>; fish: Soft<FishIdStats>; photos: Soft<number>; wanted: Soft<{ names: Wanted[]; more: boolean }> }

export function overviewPage(o: Overview): string {
  const days = lastDays(o.now, 30)
  const r = isFailed(o.readers) ? undefined : alignDaily(days, o.readers)
  const t: Tile[] = []
  if (isFailed(o.readers)) t.push(failedTile('Người đọc · 7 ngày', o.readers, '/_ab/doc-gia/'))
  else {
    t.push({ label: 'Người đọc · 7 ngày', href: '/_ab/doc-gia/', value: fmt(ago(r!.readers, 7, 1)), delta: { now: ago(r!.readers, 7, 1), before: ago(r!.readers, 14, 8), vs: '7 ngày trước đó', good: 'up' } })
    t.push({ label: 'Phiên · 7 ngày', href: '/_ab/doc-gia/', value: fmt(ago(r!.sessions, 7, 1)), delta: { now: ago(r!.sessions, 7, 1), before: ago(r!.sessions, 14, 8), vs: '7 ngày trước đó', good: 'up' } })
  }
  if (isFailed(o.clicks)) t.push(failedTile('Lượt bấm affiliate · 14 ngày', o.clicks, '/_ab/affiliate/'))
  else t.push({ label: 'Lượt bấm affiliate · 14 ngày', href: '/_ab/affiliate/', value: fmt(ago(o.clicks.clicks, 14, 1)), delta: { now: ago(o.clicks.clicks, 14, 1), before: ago(o.clicks.clicks, 28, 15), vs: '14 ngày trước đó', good: 'up' } })
  t.push(isFailed(o.photos) ? failedTile('Ảnh bạn đọc đang hiện', o.photos, '/_ab/anh-ban-doc/') : { label: 'Ảnh bạn đọc đang hiện', href: '/_ab/anh-ban-doc/', value: fmt(o.photos) })
  if (isFailed(o.wanted)) t.push(failedTile('Tên bạn đọc muốn có', o.wanted, '/_ab/muon-co/'))
  else {
    const since = days[days.length - 7]!
    t.push({ label: 'Tên bạn đọc muốn có', href: '/_ab/muon-co/', value: `${fmt(o.wanted.names.length)}${o.wanted.more ? '+' : ''}`, sub: `${fmt(o.wanted.names.filter(w => w.first >= since).length)} tên mới trong 7 ngày gần nhất` })
  }

  const charts = [
    isFailed(o.readers) ? failedBox('người đọc', o.readers) : dayChart({ id: 'c-readers', title: 'Người đọc mỗi ngày', days, series: [{ label: 'Người đọc', values: r!.readers }], kind: 'columns', partialLast: true, empty: 'Chưa có người đọc nào trong 30 ngày.' }),
    isFailed(o.clicks) ? failedBox('lượt bấm affiliate', o.clicks) : dayChart({ id: 'c-clicks', title: 'Lượt bấm affiliate mỗi ngày', days: o.clicks.days, series: [{ label: 'Lượt bấm', values: o.clicks.clicks }], kind: 'columns', partialLast: true, empty: 'Chưa có lượt bấm nào trong 30 ngày.' }),
    ...fishCharts(o.fish),
  ]
  const fish = isFailed(o.fish) ? failedBox('nhật ký nhận diện cá', o.fish) : periodTable(o.fish, false)
  return page('/_ab/', 'Tổng quan', `<h1>Tổng quan</h1><p class="lede">${UTC}</p>${tiles(t)}
<h2><a href="/_ab/nhan-dien-ca/">Nhận diện cá</a></h2>${fish}
<h2>Theo ngày · 30 ngày</h2><p class="note">Cột nhạt: hôm nay, chưa hết ngày. Rê chuột lên cột để xem số; bảng số liệu dưới mỗi biểu đồ.</p><div class="charts">${charts.join('')}</div>`)
}

/** The overview's two fish-ID charts; when the log can't load, its section above says so once. */
function fishCharts(f: Soft<FishIdStats>): string[] {
  if (isFailed(f)) return []
  return [
    dayChart({ id: 'c-fish', title: 'Lượt nhận diện cá gọi Claude mỗi ngày', days: f.days, series: [{ label: 'Lượt gọi', values: f.perDay.ok.map((v, i) => v + f.perDay.none[i]!) }], kind: 'columns', partialLast: true, empty: 'Chưa có lượt nhận diện nào được ghi (nhật ký bắt đầu từ bản cập nhật này).' }),
    dayChart({ id: 'c-cost', title: 'Chi phí nhận diện cá mỗi ngày', days: f.days, series: [{ label: 'Chi phí', values: f.perDay.usd }], kind: 'columns', format: usd, tickPrefix: '$', partialLast: true, empty: 'Chưa có chi phí nào được ghi.' }),
  ]
}

// ——— Nhận diện cá ———

const PERIODS = (s: FishIdStats) => [
  { label: 'Hôm nay', note: 'chưa hết ngày', cur: s.periods.today, prev: s.periods.yesterday, vs: 'hôm qua', context: true },
  { label: '7 ngày', note: 'đến hết hôm qua', cur: s.periods.d7, prev: s.periods.d7prev, vs: '7 ngày trước đó' },
  { label: '30 ngày', note: 'đến hết hôm qua', cur: s.periods.d30, prev: s.periods.d30prev, vs: '30 ngày trước đó' },
  { label: 'Tháng này', note: 'đến giờ', cur: s.periods.mtd, prev: s.periods.mtdPrev, vs: 'cùng kỳ tháng trước' },
]
/** Calls and cost per period, with the change against the period before (today: yesterday's figure, as today isn't over). */
function periodTable(s: FishIdStats, full: boolean): string {
  // The full table is wide: its changes say only the figure, the note under it says against what.
  const cell = (p: ReturnType<typeof PERIODS>[number], pick: (t: Totals) => number, f: (n: number) => string) =>
    `<td>${esc(f(pick(p.cur)))}<br>${p.context ? `<span class="delta">${esc(p.vs)}: ${esc(f(pick(p.prev)))}</span>` : full ? shortDelta(pick(p.cur), pick(p.prev)) : deltaHtml({ now: pick(p.cur), before: pick(p.prev), vs: p.vs })}</td>`
  const head = full
    ? '<th>Kỳ</th><th>Lượt gọi Claude</th><th>Có kết quả</th><th>Không có kết quả</th><th>Chặn trước khi gọi</th><th>Token vào</th><th>Token ra</th><th>Chi phí</th>'
    : '<th>Kỳ</th><th>Lượt gọi Claude</th><th>Chi phí</th>'
  const rows = PERIODS(s).map(p => `<tr><th>${esc(p.label)}<br><span class="note">${esc(p.note)}</span></th>${cell(p, t => t.calls, n => fmt(n))}${full ? `<td>${fmt(p.cur.ok)}</td><td>${fmt(p.cur.none)}</td><td>${fmt(p.cur.blocked)}</td><td>${fmt(p.cur.tin)}</td><td>${fmt(p.cur.tout)}</td>` : ''}${cell(p, t => t.usd, usd)}</tr>`).join('')
  return `<div class="scroll"><table${full ? ' class="wide"' : ''}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}
const shortDelta = (now: number, before: number) => {
  if (!before) return `<span class="delta">${now ? 'kỳ trước: 0' : 'như kỳ trước'}</span>`
  const p = Math.round(((now - before) / before) * 100)
  return `<span class="delta">${p > 0 ? '+' : p < 0 ? '−' : '±'}${fmt(Math.abs(p))}%</span>`
}

const OUTCOME: Record<string, string> = {
  ok: 'có kết quả', refused: 'Claude từ chối', unreadable: 'câu trả lời đọc không được', request: 'API từ chối yêu cầu', unavailable: 'API lỗi tạm thời',
  resting: 'mọi key đang nghỉ', error: 'lỗi máy chủ', fish_id_off: 'công cụ đang tắt', 'cross-origin': 'gửi từ trang khác', 'too large': 'ảnh quá lớn',
  'bad form': 'form hỏng', 'no file': 'không có ảnh', 'not an image': 'không phải ảnh', turnstile: 'không qua kiểm tra chống spam', rate: 'bạn đọc hết lượt', busy: 'cả trang hết lượt',
}
const VERDICT: Record<string, string> = { fish: 'động vật', plant: 'cây', other: 'không có', unclear: 'chưa rõ' }
const FROM: Record<string, string> = { page: 'trang nhận diện', tank: 'Bể của tôi' }
const KEY_STATE: Record<FishIdStatus['rows'][number]['state'], string> = { ok: 'đang dùng', credit: 'hết credit', auth: 'key bị từ chối', rate: 'bị giới hạn tốc độ' }

export type FishPage = { now: Date; stats: Soft<FishIdStats>; keys: Soft<FishIdStatus | undefined>; pages: Map<string, string> }

export function fishIdPage(f: FishPage): string {
  let body = `<h1>Nhận diện cá</h1><p class="lede">Mỗi lượt gửi ảnh tới công cụ ghi một dòng vào Analytics Engine: kết quả, token, chi phí theo giá niêm yết, không có ảnh, IP hay key. Analytics Engine giữ khoảng 3 tháng. Ngày theo giờ UTC.</p>`
  if (isFailed(f.stats)) body += failedBox('nhật ký nhận diện cá', f.stats)
  else {
    const s = f.stats
    const share = s.periods.last30
    body += `<h2>Tổng</h2>${periodTable(s, true)}<p class="note">% là thay đổi so với kỳ trước: 7 hay 30 ngày trước đó, cùng kỳ tháng trước. Lượt gọi Claude: những lượt đã gọi tới API (có kết quả, hoặc không: Claude từ chối, câu trả lời hỏng, API lỗi). Chặn trước khi gọi: hết lượt, không qua Turnstile, ảnh hỏng… không tốn tiền.</p>
<div class="charts">
${dayChart({ id: 'f-calls', title: 'Lượt gửi ảnh mỗi ngày, theo kết quả', days: s.days, series: [{ label: 'Có kết quả', values: s.perDay.ok }, { label: 'Không có kết quả', values: s.perDay.none }, { label: 'Chặn trước khi gọi', values: s.perDay.blocked }], kind: 'columns', partialLast: true, empty: 'Chưa có lượt nào được ghi (nhật ký bắt đầu từ bản cập nhật này).' })}
${dayChart({ id: 'f-cost', title: 'Chi phí mỗi ngày', days: s.days, series: [{ label: 'Chi phí', values: s.perDay.usd }], kind: 'columns', format: usd, tickPrefix: '$', partialLast: true, empty: 'Chưa có chi phí nào được ghi.' })}
${dayChart({ id: 'f-tokens', title: 'Token mỗi ngày', days: s.days, series: [{ label: 'Token vào', values: s.perDay.tin }, { label: 'Token ra', values: s.perDay.tout }], kind: 'lines', partialLast: true, empty: 'Chưa có token nào được ghi.' })}
</div>
<div class="split"><section><h2>Có trang trong cẩm nang</h2>${tiles([{ label: 'Câu trả lời có trang · 30 ngày gần nhất', value: share.guessed ? `${fmt((100 * share.linked) / share.guessed)}%` : '—', sub: `${fmt(share.linked)} trên ${fmt(share.guessed)} câu trả lời có loài để đoán` }])}</section>
<section><h2>Đoán nhiều mà chưa có trang · 30 ngày</h2>${rankTable(s.unmatched.map(u => ({ label: `<i class="sci">${esc(u.sci)}</i>`, value: u.n, cells: [`${fmt(u.conf * 100)}%`] })), ['Tên khoa học', 'Lượt', 'Chắc trung bình'])}</section></div>`
  }
  body += `<h2 id="key">Key Anthropic</h2>${isFailed(f.keys) ? failedBox('trạng thái key', f.keys) : f.keys ? keysHtml(f.keys) : '<p class="muted">Chưa có key nào (ANTHROPIC_KEYS): công cụ đang tắt.</p>'}`
  if (!isFailed(f.stats)) body += `<h2>100 lượt gần nhất</h2>${recentHtml(f.stats.recent, f.pages)}`
  return page('/_ab/nhan-dien-ca/', 'Nhận diện cá', body)
}

/** The keys by number and hash, never the key. */
function keysHtml(k: FishIdStatus): string {
  const rows = k.rows.map(r => `<tr><th>#${r.n}</th><td class="l"><code>${esc(r.hash)}</code></td><td class="l">${r.workspace ? 'tổ chức + workspace' : 'workspace'}</td><td class="l">${esc(KEY_STATE[r.state])}${r.until ? ` đến ${when(r.until)}` : ''}</td><td>${fmt(r.calls)}</td><td>${fmt(r.answered)}</td></tr>`).join('')
  return `<p>Hôm nay (UTC): ${fmt(k.today)} lượt nhận diện gọi Claude · mô hình <code>${esc(k.model)}</code>. Mỗi lượt dùng một key ngẫu nhiên trong số key đang dùng; key lỗi thì sang key khác. Hết credit hoặc bị từ chối: nghỉ 24 giờ.${k.bad ? ` <strong>${fmt(k.bad)} dòng trong ANTHROPIC_KEYS không đọc được, bị bỏ qua.</strong>` : ''}</p>
<div class="scroll"><table class="wide"><thead><tr><th>Key</th><th>SHA-256 (8 ký tự đầu)</th><th>Loại</th><th>Trạng thái</th><th>Lần gọi API hôm nay</th><th>Claude trả lời</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="none">Chưa có key nào.</td></tr>'}</tbody></table></div>
<p class="note">Lần gọi API: mọi lần thử bằng key này, kể cả lần lỗi (một lượt nhận diện có thể thử vài key). Claude trả lời: những lần trong số đó Claude đã trả lời.</p>`
}

function recentHtml(xs: Call[], pages: Map<string, string>): string {
  const guess = (c: Call) => {
    if (!c.sci) return '<span class="muted">—</span>'
    const url = c.page ? pages.get(c.page) : undefined
    const name = `<i class="sci">${esc(c.sci)}</i>`
    return url ? `<a href="${esc(url)}">${name}</a>` : c.page ? `${name} <span class="muted">(${esc(c.page)})</span>` : `${name} <span class="muted">· chưa có trang</span>`
  }
  const rows = xs.map(c => `<tr><th>${esc(c.t.slice(5, 16).replace(/^(\d\d)-(\d\d)/, '$2/$1'))}</th><td class="l">${esc(OUTCOME[c.outcome] ?? c.outcome)}</td><td class="l">${esc(VERDICT[c.verdict] ?? (c.verdict || '—'))}</td><td class="l wrap">${guess(c)}</td><td>${c.guesses ? `${fmt(c.conf * 100)}%` : '—'}</td><td>${fmt(c.tin)}</td><td>${fmt(c.tout)}</td><td>${c.usd ? usd(c.usd) : '—'}</td><td>${fmt(c.ms)}</td><td class="l">${c.key ? `<code>${esc(c.key)}</code>` : '—'}</td><td>${fmt(c.attempts)}</td><td class="l">${esc(FROM[c.from] ?? (c.from || '—'))}</td><td class="l">${esc(c.country || '—')}</td></tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr><th>Lúc (UTC)</th><th>Kết quả</th><th>Loại</th><th>Đoán nhiều nhất</th><th>Chắc</th><th>Token vào</th><th>Token ra</th><th>Chi phí</th><th>ms</th><th>Key</th><th>Lần gọi</th><th>Từ</th><th>Nước</th></tr></thead><tbody>${rows || '<tr><td colspan="13" class="none">Chưa có lượt nào được ghi.</td></tr>'}</tbody></table></div>`
}

// ——— Người đọc ———

export function readersPage(now: Date, r: Soft<Readers> | undefined): string {
  let body = '<h1>Người đọc thật</h1>'
  if (!r) body += '<p class="muted">Chưa cấu hình AE_API_TOKEN và CF_ACCOUNT_ID: chưa đọc được dữ liệu (Analytics Engine).</p>'
  else if (isFailed(r)) body += failedBox('người đọc (Analytics Engine)', r)
  else {
    const days = lastDays(now, r.days)
    const d = alignDaily(days, r.daily)
    body += `<p class="lede">${r.days} ngày gần nhất · đếm từ trình duyệt chạy JavaScript của trang (bỏ bot đã biết và lượt của chủ trang) · <b>người đọc</b> = phiên cuộn ≥ 50% trang hoặc ở lại ≥ 30 giây. Ngày theo giờ UTC.</p>
${tiles([{ label: 'Phiên', value: fmt(r.sessions) }, { label: 'Người đọc', value: fmt(r.readers) }, { label: 'Tỉ lệ người đọc', value: `${fmt(r.sessions ? (100 * r.readers) / r.sessions : 0, 1)}%` }])}
<h2>Theo ngày và nguồn</h2><div class="charts">${dayChart({ id: 'r-daily', title: 'Phiên và người đọc mỗi ngày', days, series: [{ label: 'Người đọc', values: d.readers }, { label: 'Phiên', values: d.sessions }], kind: 'lines', partialLast: true, empty: 'Chưa có phiên nào.' })}
<figure class="chart" aria-labelledby="r-src"><figcaption><h3 id="r-src">Nguồn truy cập</h3></figcaption>${rankTable(r.sources.map(x => ({ label: esc(x.source), value: x.sessions, cells: [fmt(x.readers)] })), ['Nguồn', 'Phiên', 'Người đọc'])}</figure></div>
<div class="split"><section><h2>Trang người đọc xem nhiều nhất</h2>${rankTable(r.pages.map(x => ({ label: `<a href="${esc(x.path)}">${esc(x.path)}</a>`, value: x.views })), ['Trang', 'Lượt xem'])}</section>
<section><h2>Quốc gia (người đọc)</h2>${rankTable(r.countries.map(x => ({ label: esc(x.cc), value: x.readers })), ['Nước', 'Người đọc'])}</section></div>`
  }
  return page('/_ab/doc-gia/', 'Người đọc', body)
}

// ——— Affiliate ———

export function affiliatePage(clicks: Soft<Clicks>, a: Soft<AffSummary>): string {
  const rows = (xs: string[][]) => xs.map(r => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('') || '<tr><td colspan="3" class="none">—</td></tr>'
  const chart = isFailed(clicks) ? failedBox('lượt bấm theo ngày', clicks) : dayChart({ id: 'a-daily', title: 'Lượt bấm mỗi ngày · 30 ngày', days: clicks.days, series: [{ label: 'Lượt bấm', values: clicks.clicks }], kind: 'columns', partialLast: true, empty: 'Chưa có lượt bấm nào trong 30 ngày.' })
  const tables = isFailed(a) ? failedBox('bảng affiliate', a) : `<div class="split"><section><h2>Theo sàn · 14 ngày</h2><div class="scroll"><table><thead><tr><th>Sàn</th><th>Nhóm</th><th>Lượt bấm</th></tr></thead><tbody>${rows(a.byNetwork.map(r => [r.network, r.category, fmt(r.n)]))}</tbody></table></div></section>
<section><h2>Trang dẫn nhiều nhất · 14 ngày</h2>${rankTable(a.top.map(r => ({ label: esc(r.entity_ref), value: r.n })), ['Trang', 'Lượt bấm'])}</section></div>
<p class="note">Sản phẩm: ${a.status.map(s => `${esc(s.status)} ${fmt(s.n)}`).join(' · ') || 'chưa có (đang dùng liên kết tìm kiếm)'} · kiểm tra gần nhất: ${a.lastCheck ? when(a.lastCheck) : 'chưa chạy'}</p>`
  return page('/_ab/affiliate/', 'Affiliate', `<h1>Affiliate</h1><p class="lede">Lượt bấm vào liên kết /go/ tới các sàn (bỏ bot). Ngày theo giờ UTC.</p><h2>Theo ngày</h2><div class="charts">${chart}</div>${tables}`)
}

// ——— Bạn đọc muốn có ———

const SOURCE: Record<string, string> = { tank: 'Bể của tôi', 'fish-id': 'nhận diện cá' }
const KIND: Record<string, string> = { fish: 'cá', plant: 'cây' }

export function wantedPage(now: Date, w: Soft<{ names: Wanted[]; more: boolean }>): string {
  let body = `<h1>Bạn đọc muốn có</h1><p class="lede">Cá và cây bạn đọc nhắc tới mà cẩm nang chưa có trang: từ “Bể của tôi”, và từ công cụ nhận diện cá khi Claude khá chắc. Mỗi bạn đọc tính một lần một ngày. Công cụ viết trang ưu tiên những tên nhiều người muốn nhất.</p>`
  if (isFailed(w)) return page('/_ab/muon-co/', 'Bạn đọc muốn có', body + failedBox('danh sách', w))
  const since = lastDays(now, 7)[0]!
  const top = w.names.slice(0, 300)
  body += tiles([{ label: 'Tên', value: `${fmt(w.names.length)}${w.more ? '+' : ''}` }, { label: 'Lượt bạn đọc', value: fmt(w.names.reduce((s, x) => s + x.readers, 0)) }, { label: 'Tên mới · 7 ngày gần nhất', value: fmt(w.names.filter(x => x.first >= since).length) }])
  body += `<h2>Nhiều người muốn nhất${w.names.length > top.length ? ` · ${fmt(top.length)} tên đầu` : ''}</h2>${rankTable(top.map(x => ({
    label: `${esc(x.name)}${x.sci && x.sci !== x.name ? ` <i class="sci muted">${esc(x.sci)}</i>` : ''}`,
    value: x.readers,
    cells: [esc(KIND[x.kind] ?? x.kind), esc(Object.entries(x.sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SOURCE[k] ?? k} ${fmt(n)}`).join(' · ')), esc(x.first), esc(x.last)],
  })), ['Tên', 'Bạn đọc', 'Loại', 'Từ đâu', 'Lần đầu', 'Gần nhất'])}${w.more ? '<p class="note">Còn nhiều tên hơn: trang này đọc 5.000 tên đầu.</p>' : ''}`
  return page('/_ab/muon-co/', 'Bạn đọc muốn có', body)
}

// ——— Ảnh bạn đọc, Ẩn trang ———

export function photosPage(xs: Soft<RecentPhoto[] | undefined>): string {
  let body = '<h1>Ảnh bạn đọc</h1><p class="lede">Ảnh đã qua kiểm duyệt tự động (khuôn mặt, đúng loài, an toàn) và đang hiện trên trang loài. Gỡ: ảnh bị xóa ngay khỏi trang và máy chủ.</p>'
  if (isFailed(xs)) body += failedBox('ảnh', xs)
  else if (!xs) body += '<p class="muted">Ảnh bạn đọc chưa bật (thiếu D1, R2 hoặc Turnstile).</p>'
  else {
    const rows = xs.map(p => `<tr><th><img class="thumb" src="${esc(p.thumb)}" alt="" width="96" loading="lazy"></th><td class="l">${esc(p.entity_ref)}</td><td class="l">${esc(p.name)}</td><td>${when(p.created_at)}</td><td><form method="post" action="/_ab/photos"><input type="hidden" name="id" value="${esc(p.id)}"><button>Gỡ</button></form></td></tr>`).join('')
    body += `<div class="scroll"><table><thead><tr><th></th><th>Trang</th><th>Tên</th><th>Lúc (UTC)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="none">Chưa có ảnh nào.</td></tr>'}</tbody></table></div>`
  }
  return page('/_ab/anh-ban-doc/', 'Ảnh bạn đọc', body)
}

export function hiddenPage(h: Soft<Hidden>): string {
  let body = `<h1>Ẩn trang</h1><p class="lede">Trang bị ẩn trả về 410 (đã gỡ), kể cả bản Markdown: thường sau 1–2 phút, chậm nhất là lần build sau (≤3 giờ), khi nó cũng biến khỏi danh sách, sitemap và tìm kiếm. Hiện lại: nếu đã qua một lần build, trang quay lại ở lần build tiếp theo.</p>
<form class="inline" method="post" action="/_ab/hidden"><input name="url" required placeholder="https://aquatome.com/vi/ca/..." aria-label="Địa chỉ trang"><input name="note" placeholder="Lý do (tuỳ chọn)" aria-label="Lý do"><button class="go" name="action" value="hide">Ẩn</button></form>`
  if (isFailed(h)) body += failedBox('danh sách trang ẩn', h)
  else {
    const rows = Object.entries(h).sort(([, a], [, b]) => b.at.localeCompare(a.at)).map(([path, v]) =>
      `<tr><th><a href="${esc(path)}">${esc(path)}</a></th><td class="l">${esc(v.note ?? '')}</td><td>${when(v.at)}</td><td><form method="post" action="/_ab/hidden"><input type="hidden" name="url" value="${esc(path)}"><button name="action" value="unhide">Hiện lại</button></form></td></tr>`).join('')
    body += `<div class="scroll"><table><thead><tr><th>Trang</th><th>Lý do</th><th>Lúc (UTC)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="none">Chưa ẩn trang nào.</td></tr>'}</tbody></table></div>`
  }
  return page('/_ab/an-trang/', 'Ẩn trang', body)
}

// ——— Tài khoản · Bình luận ———

const CRED: Record<string, string> = { apple: 'Apple', google: 'Google', passkey: 'Passkey', email: 'Email' }
const STATUS: Record<string, string> = { approved: 'đang hiện', held: 'chờ duyệt', removed: 'đã gỡ' }

export function accountsPage(a: Soft<AccountStats>): string {
  let body = '<h1>Tài khoản · Bình luận</h1><p class="lede">Tài khoản đăng nhập để đồng bộ “Bể của tôi”, và bình luận trên trang. Không lưu tên, email hay số điện thoại. Ngày theo giờ UTC.</p>'
  if (isFailed(a)) return page('/_ab/tai-khoan/', 'Tài khoản · Bình luận', body + failedBox('số liệu', a))
  body += tiles([
    { label: 'Tài khoản', value: fmt(a.users) },
    { label: 'Tài khoản mới · 7 ngày', value: fmt(ago(a.newUsers, 7, 1)), delta: { now: ago(a.newUsers, 7, 1), before: ago(a.newUsers, 14, 8), vs: '7 ngày trước đó', good: 'up' } },
    { label: 'Có bể đã đồng bộ', value: fmt(a.synced) },
    { label: 'Phiên đăng nhập còn hạn', value: fmt(a.openSessions) },
    { label: 'Bình luận · 7 ngày', value: fmt(ago(a.newComments, 7, 1)), delta: { now: ago(a.newComments, 7, 1), before: ago(a.newComments, 14, 8), vs: '7 ngày trước đó', good: 'up' } },
  ])
  body += `<h2>Theo ngày</h2><div class="charts">${dayChart({ id: 'u-daily', title: 'Tài khoản mới mỗi ngày · 30 ngày', days: a.days, series: [{ label: 'Tài khoản mới', values: a.newUsers }], kind: 'columns', partialLast: true, empty: 'Chưa có tài khoản mới nào trong 30 ngày.' })}
${dayChart({ id: 'm-daily', title: 'Bình luận mỗi ngày · 30 ngày', days: a.days, series: [{ label: 'Bình luận', values: a.newComments }], kind: 'columns', partialLast: true, empty: 'Chưa có bình luận nào trong 30 ngày.' })}</div>
<div class="split"><section><h2>Cách đăng nhập</h2>${rankTable(a.credentials.map(c => ({ label: esc(CRED[c.kind] ?? c.kind), value: c.n })), ['Cách', 'Số'])}</section>
<section><h2>Bình luận theo trạng thái</h2>${rankTable(a.comments.map(c => ({ label: esc(STATUS[c.status] ?? c.status), value: c.n })), ['Trạng thái', 'Số'])}</section></div>`
  return page('/_ab/tai-khoan/', 'Tài khoản · Bình luận', body)
}
