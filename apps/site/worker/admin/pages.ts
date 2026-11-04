import type { FishIdStatus } from '../fishid/api'
import type { KeptRow } from '../fishid/kept'
import type { Hidden } from '../hidden'
import { isViPage, withoutVi } from '../paths'
import type { Readers } from '../readers'
import type { Wanted } from '../wanted'
import { chip, dayChart, deltaHtml, esc, fmt, lastDays, rankTable, spark, tiles, usd } from './chart'
import type { AccountStats, Waiting } from './data'
import type { ContentStats, Snapshot } from './content'
import { inLang, items as itemCount, KIND as PAGE_KIND, MAIN, perDay } from './content-page'
import type { Call, FishIdStats, Totals } from './fishid'
import { failedBox, ICON, isFailed, page, type Soft } from './shell'

/** Each admin page's HTML from what its loaders returned; a part that failed says so in its place. */

export type AffSummary = { byNetwork: { network: string; category: string; n: number }[]; top: { entity_ref: string; n: number }[]; status: { status: string; n: number }[]; lastCheck: string | null }
export type RecentPhoto = { id: string; entity_ref: string; name: string; thumb: string; created_at: string }
export type Clicks = { days: string[]; clicks: number[] }

const when = (iso: string) => esc(iso.slice(0, 16).replace('T', ' '))
/** The sum of `vals` (one per day, the last is today) from `from` to `to` days ago. */
const ago = (vals: number[], from: number, to: number) => vals.slice(vals.length - 1 - from, vals.length - to).reduce((a, b) => a + b, 0)
const alignDaily = (days: string[], daily: Readers['daily']) => {
  const m = new Map(daily.map(d => [d.day, d]))
  return { sessions: days.map(d => m.get(d)?.sessions ?? 0), readers: days.map(d => m.get(d)?.readers ?? 0) }
}

// ——— Tổng quan ———

export type Overview = {
  now: Date
  /** 31 days to today: 30 whole days, then today. */
  readers: Soft<Readers['daily']>
  /** 31 days to today, as readers. */
  clicks: Soft<Clicks>
  fish: Soft<FishIdStats>
  keys: Soft<FishIdStatus | undefined>
  photos: Soft<number>
  waiting: Soft<Waiting>
  wanted: Soft<{ names: Wanted[]; more: boolean }>
  accounts: Soft<AccountStats>
  hidden: Soft<Hidden>
  /** The build's content.json (admin/content.ts), and the totals kept each night. */
  content: Soft<ContentStats>
  snapshots: Soft<Snapshot[]>
}

const VS = '7 ngày trước đó'
const MODERATION_RUNS = 'https://github.com/deathemperor/aquatome.com/actions/workflows/moderate.yml'
/** A moment in Vietnam's time, as the bar shows the time: 2026-11-03T21:05Z → 04/11 04:05 */
const short = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
/** The last value of each list is today's: the value `back` days before it. */
const at = (vals: number[], back: number) => vals[vals.length - 1 - back] ?? 0
const waitingText = (w: Waiting) => [w.comments ? `${fmt(w.comments)} bình luận` : '', w.photos ? `${fmt(w.photos)} ảnh` : ''].filter(Boolean).join(', ')

/** Each part of the overview, by what it is to the owner and where its page is. */
const parts = (o: Overview): [string, Soft<unknown>, string][] => [
  ['người đọc', o.readers, '/_ab/doc-gia/'], ['lượt bấm affiliate', o.clicks, '/_ab/affiliate/'], ['nhật ký nhận diện cá', o.fish, '/_ab/nhan-dien-ca/'],
  ['bình luận và tài khoản', o.accounts, '/_ab/tai-khoan/'], ['hàng chờ kiểm duyệt', o.waiting, '/_ab/tai-khoan/'], ['ảnh bạn đọc', o.photos, '/_ab/anh-ban-doc/'],
  ['danh sách bạn đọc muốn có', o.wanted, '/_ab/muon-co/'], ['danh sách trang ẩn', o.hidden, '/_ab/an-trang/'],
  ['số liệu nội dung', o.content, '/_ab/noi-dung/'], ['số liệu nội dung từng ngày', o.snapshots, '/_ab/noi-dung/'],
]

export type Todo = { title: string; text: string; href: string; action: string }
/** What needs the owner, each with the one place to deal with it: the fish-ID keys, a moderation that stopped, a part that won't load. */
export function todos(o: Overview): Todo[] {
  const out: Todo[] = []
  const key = { href: '/_ab/nhan-dien-ca/#key', action: 'Xem key' }
  if (isFailed(o.keys)) out.push({ title: 'Không đọc được trạng thái key Anthropic', text: o.keys.failed.slice(0, 160), ...key })
  else if (!o.keys) out.push({ title: 'Nhận diện cá đang tắt', text: 'Chưa có key Anthropic nào trong ANTHROPIC_KEYS.', ...key })
  else {
    const off = o.keys.rows.filter(r => r.state !== 'ok')
    if (off.length) {
      const all = off.length === o.keys.rows.length
      out.push({ title: all ? 'Nhận diện cá không chạy: mọi key đang nghỉ' : `${fmt(off.length)} key Anthropic đang nghỉ`, text: off.map(r => `#${r.n} ${KEY_STATE[r.state]}${r.until ? ` đến ${short(r.until)}` : ''}`).join(' · '), ...key })
    }
    if (o.keys.bad) out.push({ title: `${fmt(o.keys.bad)} dòng trong ANTHROPIC_KEYS không đọc được`, text: 'Công cụ bỏ qua những dòng đó: sửa secret ANTHROPIC_KEYS.', ...key })
  }
  // The moderation runs at 21:00 UTC each night: anything still waiting after 30 hours means a night was missed.
  if (!isFailed(o.waiting) && o.waiting.oldest && o.now.getTime() - Date.parse(o.waiting.oldest) > 30 * 3_600_000) {
    out.push({ title: 'Kiểm duyệt đêm chưa chạy', text: `${waitingText(o.waiting)} chờ từ ${short(o.waiting.oldest)}. Kiểm duyệt chạy mỗi đêm lúc 4 giờ sáng giờ Việt Nam.`, href: MODERATION_RUNS, action: 'Xem lần chạy' })
  }
  // A source behind a browser check stops until the owner passes it in the engine's Chrome profile.
  const engine = isFailed(o.content) ? null : o.content.engine
  const human = engine?.needsHuman ?? []
  if (human.length) {
    const name = (id: string) => engine!.sources.find(r => r.id === id)?.name ?? id
    out.push({ title: human.length > 1 ? `${fmt(human.length)} nguồn cần bạn qua kiểm tra trình duyệt` : `Nguồn ${name(human[0]!.source)} cần bạn qua kiểm tra trình duyệt`, text: `Engine dừng lấy trang từ ${human.map(h => `${name(h.source)} (từ ${short(h.since)})`).join(', ')} cho tới khi bạn mở nguồn đó trong hồ sơ Chrome của engine.`, href: '/_ab/noi-dung/#engine', action: 'Xem engine' })
  }
  for (const [label, part, href] of parts(o)) {
    if (isFailed(part)) out.push({ title: `Không tải được ${label}`, text: part.failed.slice(0, 160), href, action: 'Mở' })
  }
  return out
}

export type Area = { name: string; href: string; fig: string; sub: string; spark?: number[]; chip?: string; warn?: boolean }
const failedArea = (name: string, href: string, f: { failed: string }): Area => ({ name, href, fig: '—', sub: `Không tải được: ${f.failed.slice(0, 80)}`, warn: true })
/** One row an area: its figure (most are the last 7 whole days), what it counts, the 30 whole days before today, and the change on the 7 days before. */
export function areas(o: Overview): Area[] {
  const out: Area[] = []
  const whole = (vals: number[]) => vals.slice(0, -1)
  if (isFailed(o.readers)) out.push(failedArea('Người đọc', '/_ab/doc-gia/', o.readers))
  else {
    const r = alignDaily(lastDays(o.now, 31), o.readers)
    out.push({ name: 'Người đọc', href: '/_ab/doc-gia/', fig: fmt(ago(r.readers, 7, 1)), sub: `người đọc · 7 ngày · ${fmt(ago(r.sessions, 7, 1))} phiên`, spark: whole(r.readers), chip: chip(ago(r.readers, 7, 1), ago(r.readers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.content)) out.push(failedArea('Nội dung', '/_ab/noi-dung/', o.content))
  else {
    const c = o.content
    const snaps = isFailed(o.snapshots) ? [] : o.snapshots
    const daily = perDay(snaps, lastDays(o.now, 31), itemCount)
    const total = MAIN.reduce((n, k) => n + (c.inventory[k]?.total ?? 0), 0)
    out.push(snaps.length > 1
      ? { name: 'Nội dung', href: '/_ab/noi-dung/', fig: fmt(ago(daily, 7, 1)), sub: `bài mới · 7 ngày · tổng ${fmt(total)} bài`, spark: whole(daily), chip: chip(ago(daily, 7, 1), ago(daily, 14, 8), VS, 'up') }
      : { name: 'Nội dung', href: '/_ab/noi-dung/', fig: fmt(total), sub: 'bài · mỗi đêm lưu tổng số một lần, chưa đủ ngày để so' })
    if (c.engine) {
      // The build's days, put on the dashboard's: the build is at most a few hours old.
      const per = new Map(c.engine.videos.perDay.map(x => [x.day, x.n]))
      const written = lastDays(o.now, 31).map(d => per.get(d) ?? 0)
      out.push({ name: 'Engine', href: '/_ab/noi-dung/#engine', fig: fmt(c.engine.videos.waiting), sub: `video chờ viết · ${fmt(ago(written, 7, 1))} bài từ video trong 7 ngày`, spark: whole(written), chip: chip(ago(written, 7, 1), ago(written, 14, 8), VS), warn: c.engine.needsHuman.length > 0 })
    }
  }
  if (isFailed(o.clicks)) out.push(failedArea('Affiliate', '/_ab/affiliate/', o.clicks))
  else out.push({ name: 'Affiliate', href: '/_ab/affiliate/', fig: fmt(ago(o.clicks.clicks, 7, 1)), sub: 'lượt bấm sang sàn · 7 ngày', spark: whole(o.clicks.clicks), chip: chip(ago(o.clicks.clicks, 7, 1), ago(o.clicks.clicks, 14, 8), VS, 'up') })
  const keysOff = isFailed(o.keys) || !o.keys || o.keys.rows.some(k => k.state !== 'ok')
  if (isFailed(o.fish)) out.push(failedArea('Nhận diện cá', '/_ab/nhan-dien-ca/', o.fish))
  else {
    const { periods: p, perDay } = o.fish
    out.push({ name: 'Nhận diện cá', href: '/_ab/nhan-dien-ca/', fig: fmt(p.d7.calls), sub: `lượt gọi Claude · 7 ngày · ${usd(p.d7.usd)}`, spark: whole(perDay.ok.map((v, i) => v + perDay.none[i]!)), chip: chip(p.d7.calls, p.d7prev.calls, VS), warn: keysOff })
  }
  const waiting = isFailed(o.waiting) ? undefined : o.waiting
  if (isFailed(o.accounts)) out.push(failedArea('Bình luận', '/_ab/tai-khoan/', o.accounts), failedArea('Tài khoản mới', '/_ab/tai-khoan/', o.accounts))
  else {
    const a = o.accounts
    out.push({ name: 'Bình luận', href: '/_ab/tai-khoan/', fig: fmt(ago(a.newComments, 7, 1)), sub: `bình luận mới · 7 ngày${waiting?.comments ? ` · ${fmt(waiting.comments)} chờ kiểm duyệt` : ''}`, spark: whole(a.newComments), chip: chip(ago(a.newComments, 7, 1), ago(a.newComments, 14, 8), VS, 'up') })
    out.push({ name: 'Tài khoản mới', href: '/_ab/tai-khoan/', fig: fmt(ago(a.newUsers, 7, 1)), sub: `7 ngày · tổng ${fmt(a.users)} · ${fmt(a.synced)} có bể đồng bộ`, spark: whole(a.newUsers), chip: chip(ago(a.newUsers, 7, 1), ago(a.newUsers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.photos)) out.push(failedArea('Ảnh bạn đọc', '/_ab/anh-ban-doc/', o.photos))
  else out.push({ name: 'Ảnh bạn đọc', href: '/_ab/anh-ban-doc/', fig: fmt(o.photos), sub: `ảnh đang hiện${waiting?.photos ? ` · ${fmt(waiting.photos)} chờ kiểm duyệt` : ''}` })
  if (isFailed(o.wanted)) out.push(failedArea('Bạn đọc muốn có', '/_ab/muon-co/', o.wanted))
  else {
    const { names, more } = o.wanted
    const perDay = lastDays(o.now, 31).map(d => names.filter(w => w.first === d).length)
    out.push({ name: 'Bạn đọc muốn có', href: '/_ab/muon-co/', fig: `${fmt(names.length)}${more ? '+' : ''}`, sub: `tên chưa có trang · ${fmt(ago(perDay, 7, 1))} tên mới trong 7 ngày`, spark: whole(perDay) })
  }
  if (isFailed(o.hidden)) out.push(failedArea('Ẩn trang', '/_ab/an-trang/', o.hidden))
  else out.push({ name: 'Ẩn trang', href: '/_ab/an-trang/', fig: fmt(Object.keys(o.hidden).length), sub: 'trang đang ẩn' })
  return out
}

export type LogItem = { text: string; small?: string }
export type LogDay = { day: string; label: string; partial: boolean; items: LogItem[] }
/** The last `n` UTC days, today first, in words: what each area counted that day. A part that didn't load is left out (its to-do says so). */
export function log(o: Overview, n = 3): LogDay[] {
  const days = lastDays(o.now, n).reverse()
  const r = isFailed(o.readers) ? undefined : alignDaily(lastDays(o.now, 31), o.readers)
  const { clicks, fish, accounts, wanted, hidden, snapshots } = o
  const snaps = isFailed(snapshots) ? [] : snapshots
  return days.map((day, back) => {
    const items: LogItem[] = []
    const kept = snaps.find(x => x.day === day)
    const before = snaps.filter(x => x.day < day).at(-1)
    if (kept && before) {
      const added = MAIN.map(k => [k, (kept.totals.kinds[k]?.[0] ?? 0) - (before.totals.kinds[k]?.[0] ?? 0)] as const).filter(([, n]) => n > 0)
      const n = added.reduce((a, [, x]) => a + x, 0)
      if (n) items.push({ text: `${fmt(n)} bài mới`, small: added.map(([k, x]) => `${fmt(x)} ${PAGE_KIND[k].toLowerCase()}`).join(' · ') })
      const id = inLang(kept.totals, 1) - inLang(before.totals, 1)
      const th = inLang(kept.totals, 2) - inLang(before.totals, 2)
      if (id > 0 || th > 0) items.push({ text: `${fmt(Math.max(id, 0))} bài tiếng Indonesia, ${fmt(Math.max(th, 0))} bài tiếng Thái mới` })
    }
    if (r && (at(r.readers, back) || at(r.sessions, back))) items.push({ text: `${fmt(at(r.readers, back))} người đọc`, small: `${fmt(at(r.sessions, back))} phiên` })
    if (!isFailed(clicks) && at(clicks.clicks, back)) items.push({ text: `${fmt(at(clicks.clicks, back))} lượt bấm sang sàn` })
    if (!isFailed(fish)) {
      const d = fish.perDay
      const calls = at(d.ok, back) + at(d.none, back)
      if (calls || at(d.blocked, back)) items.push({ text: `${fmt(calls)} lượt nhận diện cá gọi Claude · ${usd(at(d.usd, back))}`, small: `${fmt(at(d.ok, back))} có kết quả${at(d.blocked, back) ? ` · ${fmt(at(d.blocked, back))} chặn trước khi gọi` : ''}` })
    }
    if (!isFailed(accounts)) {
      if (at(accounts.newComments, back)) items.push({ text: `${fmt(at(accounts.newComments, back))} bình luận mới` })
      if (at(accounts.newUsers, back)) items.push({ text: `${fmt(at(accounts.newUsers, back))} tài khoản mới` })
    }
    if (!isFailed(wanted)) {
      const fresh = wanted.names.filter(w => w.first === day)
      if (fresh.length) items.push({ text: `${fmt(fresh.length)} tên mới bạn đọc muốn có`, small: `${fresh.slice(0, 3).map(w => w.name).join(', ')}${fresh.length > 3 ? '…' : ''}` })
    }
    if (!isFailed(hidden)) {
      const hid = Object.entries(hidden).filter(([, v]) => v.at.slice(0, 10) === day).map(([path]) => path)
      if (hid.length) items.push({ text: `Ẩn ${fmt(hid.length)} trang`, small: `${hid.slice(0, 2).join(', ')}${hid.length > 2 ? '…' : ''}` })
    }
    const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`
    const label = back === 0 ? `Hôm nay · ${dm}` : back === 1 ? `Hôm qua · ${dm}` : `${WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]} · ${dm}`
    return { day, label, partial: back === 0, items }
  })
}

export function overviewPage(o: Overview): string {
  const t = todos(o)
  const todoHtml = t.length
    ? `<ul class="todo">${t.map(x => `<li>${ICON.alert}<div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><a class="act" href="${esc(x.href)}">${esc(x.action)}</a></li>`).join('')}</ul>`
    : `<p class="clear panel">${ICON.check}Không có việc gì cần bạn lúc này.</p>`
  const rows = areas(o).map(a => `<li><a class="area" href="${esc(a.href)}"><span><span class="name">${a.warn ? '<span class="dot" role="img" aria-label="cần xem"></span>' : ''}${esc(a.name)}</span><span class="fig">${esc(a.fig)}</span><span class="sub">${esc(a.sub)}</span></span><span class="trend">${a.spark ? spark(a.spark, a.warn) : ''}${a.chip ?? ''}</span>${ICON.chevron}</a></li>`).join('')
  const days = log(o).map(d => `<section><h3>${esc(d.label)}${d.partial ? ' <span class="muted">· chưa hết ngày</span>' : ''}</h3>${d.items.length ? `<ol>${d.items.map(i => `<li><p>${esc(i.text)}</p>${i.small ? `<small>${esc(i.small)}</small>` : ''}</li>`).join('')}</ol>` : '<p class="muted">Không có gì mới.</p>'}</section>`).join('')
  return page('/_ab/', 'Tổng quan', `<h1 class="vh">Tổng quan</h1><div class="home-grid"><div>
<section aria-labelledby="h-todo"><h2 id="h-todo">Cần bạn${t.length ? ` <span class="badge">${fmt(t.length)}<span class="vh"> việc</span></span>` : ''}</h2>${todoHtml}</section>
<section aria-labelledby="h-areas"><h2 id="h-areas">Các mục</h2><ul class="areas">${rows}</ul><p class="note">Số lớn: 7 ngày trọn đến hết hôm qua, so với 7 ngày trước đó. Đường nhỏ: 30 ngày trọn. Ngày theo giờ UTC (7 giờ sáng ở Việt Nam); giờ trong Cần bạn là giờ Việt Nam.</p></section>
</div><div class="side"><section aria-labelledby="h-log"><h2 id="h-log">Mấy ngày qua</h2><div class="log">${days}</div></section></div></div>`, o.now)
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
    return url ? `<a href="${esc(withoutVi(url))}">${name}</a>` : c.page ? `${name} <span class="muted">(${esc(c.page)})</span>` : `${name} <span class="muted">· chưa có trang</span>`
  }
  const rows = xs.map(c => `<tr><th>${esc(c.t.slice(5, 16).replace(/^(\d\d)-(\d\d)/, '$2/$1'))}</th><td class="l">${esc(OUTCOME[c.outcome] ?? c.outcome)}</td><td class="l">${esc(VERDICT[c.verdict] ?? (c.verdict || '—'))}</td><td class="l wrap">${guess(c)}</td><td>${c.guesses ? `${fmt(c.conf * 100)}%` : '—'}</td><td>${fmt(c.tin)}</td><td>${fmt(c.tout)}</td><td>${c.usd ? usd(c.usd) : '—'}</td><td>${fmt(c.ms)}</td><td class="l">${c.key ? `<code>${esc(c.key)}</code>` : '—'}</td><td>${fmt(c.attempts)}</td><td class="l">${esc(FROM[c.from] ?? (c.from || '—'))}</td><td class="l">${esc(c.country || '—')}</td></tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr><th>Lúc (UTC)</th><th>Kết quả</th><th>Loại</th><th>Đoán nhiều nhất</th><th>Chắc</th><th>Token vào</th><th>Token ra</th><th>Chi phí</th><th>ms</th><th>Key</th><th>Lần gọi</th><th>Từ</th><th>Nước</th></tr></thead><tbody>${rows || '<tr><td colspan="13" class="none">Chưa có lượt nào được ghi.</td></tr>'}</tbody></table></div>`
}

// ——— Người đọc ———

/** A path from the beacon is anything a script sent: a link only for one of the site's pages ("//other.site" stays text). */
export const pageLink = (path: string) => (isViPage(path) || /^\/(?:id|th)\//.test(path) ? `<a href="${esc(path)}">${esc(path)}</a>` : esc(path))

export function readersPage(now: Date, r: Soft<Readers> | undefined): string {
  let body = '<h1>Người đọc thật</h1>'
  if (!r) body += '<p class="muted">Chưa cấu hình AE_API_TOKEN và CF_ACCOUNT_ID: chưa đọc được dữ liệu (Analytics Engine).</p>'
  else if (isFailed(r)) body += failedBox('người đọc (Analytics Engine)', r)
  else {
    const days = lastDays(now, r.days)
    const d = alignDaily(days, r.daily)
    body += `<p class="lede">${r.days} ngày gần nhất · đếm từ trình duyệt chạy JavaScript của trang (bỏ bot đã biết, các lượt kiểm tra tự động của AquaTome và lượt của chủ trang) · <b>người đọc</b> = phiên cuộn ≥ 50% trang hoặc ở lại ≥ 30 giây. Ngày theo giờ UTC.</p>
${tiles([{ label: 'Phiên', value: fmt(r.sessions) }, { label: 'Người đọc', value: fmt(r.readers) }, { label: 'Tỉ lệ người đọc', value: `${fmt(r.sessions ? (100 * r.readers) / r.sessions : 0, 1)}%` }])}
<h2>Theo ngày và nguồn</h2><div class="charts">${dayChart({ id: 'r-daily', title: 'Phiên và người đọc mỗi ngày', days, series: [{ label: 'Người đọc', values: d.readers }, { label: 'Phiên', values: d.sessions }], kind: 'lines', partialLast: true, empty: 'Chưa có phiên nào.' })}
<figure class="chart" aria-labelledby="r-src"><figcaption><h3 id="r-src">Nguồn truy cập</h3></figcaption>${rankTable(r.sources.map(x => ({ label: esc(x.source), value: x.sessions, cells: [fmt(x.readers)] })), ['Nguồn', 'Phiên', 'Người đọc'])}</figure></div>
<div class="split"><section><h2>Trang người đọc xem nhiều nhất</h2>${rankTable(r.pages.map(x => ({ label: pageLink(x.path), value: x.views })), ['Trang', 'Lượt xem'])}</section>
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

/** Fish-ID photos readers let us keep (fishid/kept.ts): only here are they seen. Newest first; each goes 6 months on. */
export function keptPage(xs: Soft<KeptRow[] | undefined>): string {
  let body = '<h1>Ảnh nhận diện</h1><p class="lede">Ảnh bạn đọc cho phép giữ khi nhận diện, cùng kết quả: để kiểm tra và cải thiện việc nhận diện. Chỉ hiện ở đây, không bao giờ công khai; tự xóa sau 6 tháng. Bạn đọc đã đăng nhập tự xóa được ảnh của mình; ảnh gửi khi chưa đăng nhập chỉ xóa được ở đây, khi họ liên hệ.</p>'
  if (isFailed(xs)) body += failedBox('ảnh nhận diện', xs)
  else if (!xs) body += '<p class="muted">Chưa bật (thiếu R2 UPLOADS).</p>'
  else {
    const rows = xs.map(p => {
      const who = p.account ?? 'anon'
      const top = p.guesses[0]
      return `<tr><th><a href="/_ab/anh-nhan-dien/anh/${esc(who)}/${esc(p.id)}"><img class="thumb" src="/_ab/anh-nhan-dien/anh/${esc(who)}/${esc(p.id)}" alt="" width="96" loading="lazy"></a></th><td class="l">${esc(p.verdict)}${top ? ` · <i>${esc(top.scientificName)}</i> ${Math.round(top.confidence * 100)}%` : ''}</td><td>${p.account ? 'đăng nhập' : 'chưa đăng nhập'}</td><td>${esc(p.lang)}</td><td>${when(p.created)}</td><td><form method="post" action="/_ab/anh-nhan-dien/xoa"><input type="hidden" name="who" value="${esc(who)}"><input type="hidden" name="id" value="${esc(p.id)}"><button>Xóa</button></form></td></tr>`
    }).join('')
    body += `<div class="scroll"><table><thead><tr><th></th><th>Kết quả</th><th>Gửi khi</th><th>Ngôn ngữ</th><th>Lúc (UTC)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="none">Chưa có ảnh nào.</td></tr>'}</tbody></table></div>`
  }
  return page('/_ab/anh-nhan-dien/', 'Ảnh nhận diện', body)
}

export function hiddenPage(h: Soft<Hidden>): string {
  let body = `<h1>Ẩn trang</h1><p class="lede">Trang bị ẩn trả về 410 (đã gỡ), kể cả bản Markdown: thường sau 1–2 phút, chậm nhất là lần build sau (≤3 giờ), khi nó cũng biến khỏi danh sách, sitemap và tìm kiếm. Hiện lại: nếu đã qua một lần build, trang quay lại ở lần build tiếp theo.</p>
<form class="inline" method="post" action="/_ab/hidden"><input name="url" required placeholder="https://aquatome.com/ca/..." aria-label="Địa chỉ trang"><input name="note" placeholder="Lý do (tuỳ chọn)" aria-label="Lý do"><button class="go" name="action" value="hide">Ẩn</button></form>`
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
