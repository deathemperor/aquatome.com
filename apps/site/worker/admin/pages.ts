import { LANGS, OTHER_LANGS, prefixedLang } from '@aq/schema/langs'
import { RUNS_PATH, runPath } from './runs'
import type { FishIdStatus } from '../fishid/api'
import type { KeptRow } from '../fishid/kept'
import type { Hidden } from '../hidden'
import { isViPage, withoutVi } from '../paths'
import type { Readers } from '../readers'
import type { LangAsks } from '../lang-ask'
import type { Wanted } from '../wanted'
import { chipHtml, chipOf, dayChart, dayLabel, esc, fmt, lastDays, rankTable, spark, tiles, usd, type Chip, type DayChart, type Ranked, type Tile } from './chart'
import { chart, failedNote, figures, heading, note, rankBlock, table, textOf, type Action, type Block, type Cell, type PhotoItem, type RankRow, type Section, type TextTone } from './blocks'
import type { AccountStats, Waiting } from './data'
import type { ContentStats, Snapshot } from './content'
import { inLang, items as itemCount, KIND as PAGE_KIND, LANG_VI, MAIN, perDay, writtenPerDay } from './content-page'
import type { Call, FishIdStats, Totals } from './fishid'
import { failedBox, ICON, isFailed, page, REPORT_NAME, REPORT_PATH, SCOREBOARD_PATH, type Soft } from './shell'
import { clock, HOME_TZ, hourMinute, localDay, sameClock, timeTag, timeText, zoneName } from './time'

/** Each admin page's HTML from what its loaders returned; a part that failed says so in its place. */

export type AffSummary = { byNetwork: { network: string; category: string; n: number }[]; top: { entity_ref: string; n: number }[]; status: { status: string; n: number }[]; lastCheck: string | null }
/**
 * `moved_from`: the page it was sent for, when moderation found another fish and moved it to `entity_ref`. `comment`: a
 * comment's photo's comment (`entity_ref` "comment:<id>"): its page's key and, when this build has the page, its address.
 */
export type RecentPhoto = { id: string; entity_ref: string; moved_from?: string | null; name: string; thumb: string; created_at: string; comment?: PhotoComment }
/** `ownerOk`: the owner approved it here; the next moderation pass publishes it. */
export type WaitingPhoto = { id: string; entity_ref: string; moved_from?: string | null; name: string; created_at: string; ownerOk: boolean; comment?: PhotoComment }
export type PhotoComment = { page: string; path?: string }
export type Clicks = { days: string[]; clicks: number[] }

/** A day kept as text (2026-11-04) as the dashboard writes days: 04/11, with the year when it isn't `now`'s. */
const dayText = (day: string, now: Date, tz: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}${day.slice(0, 4) !== localDay(now, tz).slice(0, 4) ? `/${day.slice(0, 4)}` : ''}`
/** The page's note on days and times: the viewer's zone, named by its offset. */
const zoneNote = (tz: string, now: Date) => `Ngày và giờ theo giờ của bạn (${zoneName(tz, now)}).`
/** The sum of `vals` (one per day, the last is today) from `from` to `to` days ago. */
export const ago = (vals: number[], from: number, to: number) => vals.slice(vals.length - 1 - from, vals.length - to).reduce((a, b) => a + b, 0)
export const alignDaily = (days: string[], daily: Readers['daily']) => {
  const m = new Map(daily.map(d => [d.day, d]))
  return { sessions: days.map(d => m.get(d)?.sessions ?? 0), readers: days.map(d => m.get(d)?.readers ?? 0) }
}

// ——— Tổng quan ———

export type Overview = {
  now: Date
  /** The viewer's time zone (admin/time.ts); Vietnam's when not given. */
  tz?: string
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
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
/** The last value of each list is today's: the value `back` days before it. */
export const at = (vals: number[], back: number) => vals[vals.length - 1 - back] ?? 0
const waitingText = (w: Waiting) => [w.comments ? `${fmt(w.comments)} bình luận` : '', w.photos ? `${fmt(w.photos)} ảnh` : ''].filter(Boolean).join(', ')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
/** What's waiting in English, for the daily report (daily/compose.ts). */
export const waitingEn = (w: Waiting) => [w.comments ? plural(w.comments, 'comment') : '', w.photos ? plural(w.photos, 'photo') : ''].filter(Boolean).join(', ')
/** Waiting this long, the moderation missed a night. */
export const MODERATION_MISSED_MS = 30 * 3_600_000

/** Each part of the overview, by what it is to the owner (in Vietnamese, and in English for the daily report) and where its page is. */
const parts = (o: Overview): [string, Soft<unknown>, string, string][] => [
  ['người đọc', o.readers, '/_ab/doc-gia/', 'readers'], ['lượt bấm affiliate', o.clicks, '/_ab/affiliate/', 'affiliate clicks'], ['nhật ký nhận diện cá', o.fish, '/_ab/nhan-dien-ca/', 'the fish ID log'],
  ['bình luận và tài khoản', o.accounts, '/_ab/tai-khoan/', 'comments and accounts'], ['hàng chờ kiểm duyệt', o.waiting, '/_ab/binh-luan/', 'the moderation queues'], ['ảnh bạn đọc', o.photos, '/_ab/anh-ban-doc/', 'reader photos'],
  ['danh sách bạn đọc muốn có', o.wanted, '/_ab/muon-co/', 'the wanted names'], ['danh sách trang ẩn', o.hidden, '/_ab/an-trang/', 'the hidden pages'],
  ['số liệu nội dung', o.content, '/_ab/noi-dung/', 'the content totals'], ['số liệu nội dung từng ngày', o.snapshots, '/_ab/noi-dung/', 'the daily content totals'],
]

/** `en`: the same to-do for the daily report, in English and with no error text. Beside the Vietnamese, so a new to-do can't reach the page without it; the app's JSON (overviewJson) never reads it. */
export type Todo = { kind: 'key' | 'engine' | 'moderation' | 'failed'; title: string; text: string; href: string; action: string; en: { title: string; text: string; action: string } }
/** What needs the owner, each with the one place to deal with it: the fish-ID keys, a moderation that stopped, a part that won't load. */
export function todos(o: Overview): Todo[] {
  const out: Todo[] = []
  const tz = o.tz ?? HOME_TZ
  // In the viewer's time, as the bar shows it: 2026-11-03T21:05Z → 04/11 04:05 in Vietnam.
  const short = (iso: string) => clock(iso, tz, o.now)
  const key = { kind: 'key' as const, href: '/_ab/nhan-dien-ca/#key', action: 'Xem key' }
  const seeKey = 'See key'
  if (isFailed(o.keys)) out.push({ title: 'Không đọc được trạng thái key Anthropic', text: o.keys.failed.slice(0, 160), ...key, en: { title: 'Could not read the Anthropic keys\' state', text: 'The fish ID page has the error.', action: seeKey } })
  else if (!o.keys) out.push({ title: 'Nhận diện cá đang tắt', text: 'Chưa có key Anthropic nào trong ANTHROPIC_KEYS.', ...key, en: { title: 'Fish ID is off', text: 'ANTHROPIC_KEYS holds no key.', action: seeKey } })
  else {
    const off = o.keys.rows.filter(r => r.state !== 'ok')
    if (off.length) {
      const all = off.length === o.keys.rows.length
      out.push({ title: all ? 'Nhận diện cá không chạy: mọi key đang nghỉ' : `${fmt(off.length)} key Anthropic đang nghỉ`, text: off.map(r => `#${r.n} ${KEY_STATE[r.state]}${r.until ? ` đến ${short(r.until)}` : ''}`).join(' · '), ...key,
        en: { title: all ? 'Fish ID is down: every Anthropic key is resting' : `${plural(off.length, 'Anthropic key')} resting`, text: off.map(r => `#${r.n} ${KEY_STATE_EN[r.state]}${r.until ? ` until ${short(r.until)}` : ''}`).join(' · '), action: seeKey } })
    }
    if (o.keys.bad) out.push({ title: `${fmt(o.keys.bad)} dòng trong ANTHROPIC_KEYS không đọc được`, text: 'Công cụ bỏ qua những dòng đó: sửa secret ANTHROPIC_KEYS.', ...key, en: { title: `${plural(o.keys.bad, 'line')} of ANTHROPIC_KEYS can't be read`, text: 'The tool skips them: fix the ANTHROPIC_KEYS secret.', action: seeKey } })
  }
  // The moderation runs at 21:00 UTC each night (moderate.yml): anything still waiting after 30 hours means a night was missed.
  if (!isFailed(o.waiting) && o.waiting.oldest && o.now.getTime() - Date.parse(o.waiting.oldest) > MODERATION_MISSED_MS) {
    out.push({ title: 'Kiểm duyệt đêm chưa chạy', text: `${waitingText(o.waiting)} chờ từ ${short(o.waiting.oldest)}. Kiểm duyệt chạy mỗi ngày lúc ${hourMinute('2026-01-01T21:00:00Z', tz)}.`, kind: 'moderation', href: MODERATION_RUNS, action: 'Xem lần chạy',
      en: { title: 'Moderation has not run', text: `${waitingEn(o.waiting)} waiting since ${short(o.waiting.oldest)}.`, action: 'See runs' } })
  }
  // A source behind a browser check stops until the owner passes it in the engine's Chrome profile.
  const engine = isFailed(o.content) ? null : o.content.engine
  const human = engine?.needsHuman ?? []
  if (human.length) {
    const name = (id: string) => engine!.sources.find(r => r.id === id)?.name ?? id
    const stopped = human.map(h => `${name(h.source)} (since ${short(h.since)})`).join(', ')
    out.push({ title: human.length > 1 ? `${fmt(human.length)} nguồn cần bạn qua kiểm tra trình duyệt` : `Nguồn ${name(human[0]!.source)} cần bạn qua kiểm tra trình duyệt`, text: `Engine dừng lấy trang từ ${human.map(h => `${name(h.source)} (từ ${short(h.since)})`).join(', ')} cho tới khi bạn mở nguồn đó trong hồ sơ Chrome của engine.`, kind: 'engine', href: '/_ab/noi-dung/#engine', action: 'Xem engine',
      en: { action: 'See engine', title: human.length > 1 ? `${fmt(human.length)} sources need you to pass a browser check` : `${name(human[0]!.source)} needs you to pass a browser check`, text: `The engine stopped fetching from ${stopped}. Open the source in the engine's Chrome profile.` } })
  }
  for (const [label, part, href, en] of parts(o)) {
    if (isFailed(part)) out.push({ kind: 'failed', title: `Không tải được ${label}`, text: part.failed.slice(0, 160), href, action: 'Mở', en: { title: `Could not load ${en}`, text: 'Its dashboard page has the error.', action: 'Open' } })
  }
  return out
}

export type Area = { name: string; href: string; fig: string; sub: string; spark?: (number | null)[]; chip?: Chip; warn?: boolean }
const failedArea = (name: string, href: string, f: { failed: string }): Area => ({ name, href, fig: '—', sub: `Không tải được: ${f.failed.slice(0, 80)}`, warn: true })
/** One row an area: its figure (most are the last 7 whole days), what it counts, the 30 whole days before today, and the change on the 7 days before. */
export function areas(o: Overview): Area[] {
  const out: Area[] = []
  const tz = o.tz ?? HOME_TZ
  const month = lastDays(o.now, 31, tz)
  const whole = (vals: number[]) => vals.slice(0, -1)
  if (isFailed(o.readers)) out.push(failedArea('Người đọc', '/_ab/doc-gia/', o.readers))
  else {
    const r = alignDaily(month, o.readers)
    out.push({ name: 'Người đọc', href: '/_ab/doc-gia/', fig: fmt(ago(r.readers, 7, 1)), sub: `người đọc · 7 ngày · ${fmt(ago(r.sessions, 7, 1))} phiên`, spark: whole(r.readers), chip: chipOf(ago(r.readers, 7, 1), ago(r.readers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.content)) out.push(failedArea('Nội dung', '/_ab/noi-dung/', o.content))
  else {
    const c = o.content
    const snaps = isFailed(o.snapshots) ? [] : o.snapshots
    const kept = perDay(snaps, month, itemCount)
    const daily = kept.map(v => v ?? 0)
    const total = MAIN.reduce((n, k) => n + (c.inventory[k]?.total ?? 0), 0)
    out.push(snaps.length > 1
      ? { name: 'Nội dung', href: '/_ab/noi-dung/', fig: fmt(ago(daily, 7, 1)), sub: `bài mới · 7 ngày · tổng ${fmt(total)} bài`, spark: kept.slice(0, -1), chip: chipOf(ago(daily, 7, 1), ago(daily, 14, 8), VS, 'up') }
      : { name: 'Nội dung', href: '/_ab/noi-dung/', fig: fmt(total), sub: 'bài · mỗi đêm lưu tổng số một lần, chưa đủ ngày để so' })
    if (c.engine) {
      // The build's list, counted by the viewer's days: the build is at most a few hours old.
      const written = writtenPerDay(c.engine.videos.writtenAt, month, tz)
      out.push({ name: 'Engine', href: '/_ab/noi-dung/#engine', fig: fmt(c.engine.videos.waiting), sub: `video chờ viết · ${fmt(ago(written, 7, 1))} bài từ video trong 7 ngày`, spark: whole(written), chip: chipOf(ago(written, 7, 1), ago(written, 14, 8), VS), warn: c.engine.needsHuman.length > 0 })
    }
  }
  if (isFailed(o.clicks)) out.push(failedArea('Affiliate', '/_ab/affiliate/', o.clicks))
  else out.push({ name: 'Affiliate', href: '/_ab/affiliate/', fig: fmt(ago(o.clicks.clicks, 7, 1)), sub: 'lượt bấm sang sàn · 7 ngày', spark: whole(o.clicks.clicks), chip: chipOf(ago(o.clicks.clicks, 7, 1), ago(o.clicks.clicks, 14, 8), VS, 'up') })
  const keysOff = isFailed(o.keys) || !o.keys || o.keys.rows.some(k => k.state !== 'ok')
  if (isFailed(o.fish)) out.push(failedArea('Nhận diện cá', '/_ab/nhan-dien-ca/', o.fish))
  else {
    const { periods: p, perDay } = o.fish
    out.push({ name: 'Nhận diện cá', href: '/_ab/nhan-dien-ca/', fig: fmt(p.d7.calls), sub: `lượt gọi Claude · 7 ngày · ${usd(p.d7.usd)}`, spark: whole(perDay.ok.map((v, i) => v + perDay.none[i]!)), chip: chipOf(p.d7.calls, p.d7prev.calls, VS), warn: keysOff })
  }
  const waiting = isFailed(o.waiting) ? undefined : o.waiting
  if (isFailed(o.accounts)) out.push(failedArea('Bình luận', '/_ab/binh-luan/', o.accounts), failedArea('Tài khoản mới', '/_ab/tai-khoan/', o.accounts))
  else {
    const a = o.accounts
    out.push({ name: 'Bình luận', href: '/_ab/binh-luan/', fig: fmt(ago(a.newComments, 7, 1)), sub: `bình luận mới · 7 ngày${waiting?.comments ? ` · ${fmt(waiting.comments)} chờ kiểm duyệt` : ''}`, spark: whole(a.newComments), chip: chipOf(ago(a.newComments, 7, 1), ago(a.newComments, 14, 8), VS, 'up') })
    out.push({ name: 'Tài khoản mới', href: '/_ab/tai-khoan/', fig: fmt(ago(a.newUsers, 7, 1)), sub: `7 ngày · tổng ${fmt(a.users)} · ${fmt(a.synced)} có bể đồng bộ`, spark: whole(a.newUsers), chip: chipOf(ago(a.newUsers, 7, 1), ago(a.newUsers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.photos)) out.push(failedArea('Ảnh bạn đọc', '/_ab/anh-ban-doc/', o.photos))
  else out.push({ name: 'Ảnh bạn đọc', href: '/_ab/anh-ban-doc/', fig: fmt(o.photos), sub: `ảnh đang hiện${waiting?.photos ? ` · ${fmt(waiting.photos)} chờ kiểm duyệt` : ''}` })
  if (isFailed(o.wanted)) out.push(failedArea('Bạn đọc muốn có', '/_ab/muon-co/', o.wanted))
  else {
    const { names, more } = o.wanted
    const perDay = month.map(d => names.filter(w => w.first === d).length)
    out.push({ name: 'Bạn đọc muốn có', href: '/_ab/muon-co/', fig: `${fmt(names.length)}${more ? '+' : ''}`, sub: `tên chưa có trang · ${fmt(ago(perDay, 7, 1))} tên mới trong 7 ngày`, spark: whole(perDay) })
  }
  if (isFailed(o.hidden)) out.push(failedArea('Ẩn trang', '/_ab/an-trang/', o.hidden))
  else out.push({ name: 'Ẩn trang', href: '/_ab/an-trang/', fig: fmt(Object.keys(o.hidden).length), sub: 'trang đang ẩn' })
  return out
}

/** `section`: the dashboard page the item counts for (the app opens it). */
export type LogItem = { text: string; small?: string; section: string }
export type LogDay = { day: string; label: string; partial: boolean; items: LogItem[] }
/** The last `n` of the viewer's days, today first, in words: what each area counted that day. A part that didn't load is left out (its to-do says so). */
export function log(o: Overview, n = 3): LogDay[] {
  const tz = o.tz ?? HOME_TZ
  const days = lastDays(o.now, n, tz).reverse()
  const r = isFailed(o.readers) ? undefined : alignDaily(lastDays(o.now, 31, tz), o.readers)
  const { clicks, fish, accounts, wanted, hidden, snapshots } = o
  const snaps = isFailed(snapshots) ? [] : snapshots
  return days.map((day, back) => {
    const items: LogItem[] = []
    const kept = snaps.find(x => x.day === day)
    const before = snaps.filter(x => x.day < day).at(-1)
    if (kept && before) {
      const added = MAIN.map(k => [k, (kept.totals.kinds[k]?.vi ?? 0) - (before.totals.kinds[k]?.vi ?? 0)] as const).filter(([, n]) => n > 0)
      const n = added.reduce((a, [, x]) => a + x, 0)
      if (n) items.push({ text: `${fmt(n)} bài mới`, small: added.map(([k, x]) => `${fmt(x)} ${PAGE_KIND[k].toLowerCase()}`).join(' · '), section: 'noi-dung' })
      const translated = OTHER_LANGS.map(l => [l, inLang(kept.totals, l) - inLang(before.totals, l)] as const)
      if (translated.some(([, n]) => n > 0)) items.push({ text: `${translated.map(([l, n]) => `${fmt(Math.max(n, 0))} bài tiếng ${LANG_VI[l]}`).join(', ')} mới`, section: 'noi-dung' })
    }
    if (r && (at(r.readers, back) || at(r.sessions, back))) items.push({ text: `${fmt(at(r.readers, back))} người đọc`, small: `${fmt(at(r.sessions, back))} phiên`, section: 'doc-gia' })
    if (!isFailed(clicks) && at(clicks.clicks, back)) items.push({ text: `${fmt(at(clicks.clicks, back))} lượt bấm sang sàn`, section: 'affiliate' })
    if (!isFailed(fish)) {
      const d = fish.perDay
      const calls = at(d.ok, back) + at(d.none, back)
      if (calls || at(d.blocked, back)) items.push({ text: `${fmt(calls)} lượt nhận diện cá gọi Claude · ${usd(at(d.usd, back))}`, small: `${fmt(at(d.ok, back))} có kết quả${at(d.blocked, back) ? ` · ${fmt(at(d.blocked, back))} chặn trước khi gọi` : ''}`, section: 'nhan-dien-ca' })
    }
    if (!isFailed(accounts)) {
      if (at(accounts.newComments, back)) items.push({ text: `${fmt(at(accounts.newComments, back))} bình luận mới`, section: 'binh-luan' })
      if (at(accounts.newUsers, back)) items.push({ text: `${fmt(at(accounts.newUsers, back))} tài khoản mới`, section: 'tai-khoan' })
    }
    if (!isFailed(wanted)) {
      const fresh = wanted.names.filter(w => w.first === day)
      if (fresh.length) items.push({ text: `${fmt(fresh.length)} tên mới bạn đọc muốn có`, small: `${fresh.slice(0, 3).map(w => w.name).join(', ')}${fresh.length > 3 ? '…' : ''}`, section: 'muon-co' })
    }
    if (!isFailed(hidden)) {
      const hid = Object.entries(hidden).filter(([, v]) => localDay(v.at, tz) === day).map(([path]) => path)
      if (hid.length) items.push({ text: `Ẩn ${fmt(hid.length)} trang`, small: `${hid.slice(0, 2).join(', ')}${hid.length > 2 ? '…' : ''}`, section: 'an-trang' })
    }
    const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`
    const label = back === 0 ? `Hôm nay · ${dm}` : back === 1 ? `Hôm qua · ${dm}` : `${WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]} · ${dm}`
    return { day, label, partial: back === 0, items }
  })
}

const QUIET = 'Không có gì mới.'
const PARTIAL = 'chưa hết ngày'
/** The note under the areas: how to read a row. */
const areasNote = (o: Overview) =>
  `Số lớn: 7 ngày trọn đến hết hôm qua, so với 7 ngày trước đó. Cột nhỏ: 30 ngày trọn, mỗi cột một ngày; 7 cột đậm là 7 ngày của số lớn, 7 cột nhạt trước chúng là 7 ngày đem so. ${zoneNote(o.tz ?? HOME_TZ, o.now)}${sameClock(o.tz ?? HOME_TZ, HOME_TZ, o.now) ? '' : ' Lượt bấm affiliate và tên bạn đọc muốn có được lưu theo ngày giờ Việt Nam.'}`

export function overviewPage(o: Overview): string {
  const t = todos(o)
  const todoHtml = t.length
    ? `<ul class="todo">${t.map(x => `<li>${ICON.alert}<div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><a class="act" href="${esc(x.href)}">${esc(x.action)}</a></li>`).join('')}</ul>`
    : `<p class="clear panel">${ICON.check}Không có việc gì cần bạn lúc này.</p>`
  // Every row's columns are its whole days, the last one yesterday.
  const wholeDays = lastDays(o.now, 31, o.tz ?? HOME_TZ).slice(0, -1).map(dayLabel)
  const rows = areas(o).map(a => `<li><a class="area" href="${esc(a.href)}"><span><span class="name">${a.warn ? '<span class="dot" role="img" aria-label="cần xem"></span>' : ''}${esc(a.name)}</span><span class="fig">${esc(a.fig)}</span><span class="sub">${esc(a.sub)}</span></span><span class="trend">${a.spark ? spark(a.spark, 7, { labels: wholeDays.slice(-a.spark.length) }) : ''}${chipHtml(a.chip)}</span>${ICON.chevron}</a></li>`).join('')
  const days = log(o).map(d => `<section><h3>${esc(d.label)}${d.partial ? ` <span class="muted">· ${PARTIAL}</span>` : ''}</h3>${d.items.length ? `<ol>${d.items.map(i => `<li><p>${esc(i.text)}</p>${i.small ? `<small>${esc(i.small)}</small>` : ''}</li>`).join('')}</ol>` : `<p class="muted">${QUIET}</p>`}</section>`).join('')
  return page('/_ab/', 'Tổng quan', `<h1 class="vh">Tổng quan</h1><div class="home-grid"><div>
<section aria-labelledby="h-todo"><h2 id="h-todo">Cần bạn${t.length ? ` <span class="badge">${fmt(t.length)}<span class="vh"> việc</span></span>` : ''}</h2>${todoHtml}</section>
<p class="note"><a href="${SCOREBOARD_PATH}">Thành công</a>: chỉ số sản phẩm theo tuần, tuần này so với tuần trước.</p>
<section aria-labelledby="h-areas"><h2 id="h-areas">Các mục</h2><ul class="areas">${rows}</ul><p class="note">${areasNote(o)}</p></section>
</div><div class="side"><section aria-labelledby="h-log"><h2 id="h-log">${LOG_TITLE}</h2><div class="log">${days}</div></section><p class="note"><a href="${REPORT_PATH}">${REPORT_NAME}</a>: bản đã gửi mỗi sáng.</p></div></div>`, o.now, o.tz ?? HOME_TZ)
}

const LOG_TITLE = 'Mấy ngày qua'
/** A place on the dashboard: its section by key and the spot on its page ("/_ab/noi-dung/#engine"), or an address elsewhere as it is. */
type Place = { section: string; anchor?: string } | { url: string }
const placeOf = (href: string): Place => {
  const m = /^\/_ab\/([a-z0-9-]+)\/(?:#([a-z0-9-]+))?$/.exec(href)
  return m ? { section: m[1]!, ...(m[2] ? { anchor: m[2] } : {}) } : { url: href }
}
type LogEntry = { at: string; text: string; sub?: string; tone?: TextTone; section?: string }
type DashboardJson = {
  todos: { title: string; text: string; action: { label: string } & Place }[]
  areas: ({ name: string; fig: string; sub: string; spark: (number | null)[]; chip?: Chip; warn: boolean } & Place)[]
  areasNote: string
  log: { title: string; entries: LogEntry[] }
}
/** The overview's to-dos, area rows, their note and the last days' log as data: the very ones its page draws. */
export function overviewJson(o: Overview): DashboardJson {
  return {
    todos: todos(o).map(t => ({ title: t.title, text: t.text, action: { label: t.action, ...placeOf(t.href) } })),
    areas: areas(o).map(a => ({ name: a.name, ...placeOf(a.href), fig: a.fig, sub: a.sub, spark: a.spark ?? [], ...(a.chip ? { chip: a.chip } : {}), warn: Boolean(a.warn) })),
    areasNote: areasNote(o),
    // Each day as the page heads it, then what it counted; a quiet day says so.
    log: {
      title: LOG_TITLE,
      entries: log(o).flatMap((d): LogEntry[] => {
        const at = `${d.label}${d.partial ? ` · ${PARTIAL}` : ''}`
        return d.items.length ? d.items.map(i => ({ at, text: i.text, ...(i.small ? { sub: i.small } : {}), section: i.section })) : [{ at, text: QUIET, tone: 'muted' as const }]
      }),
    },
  }
}

// ——— Nhận diện cá ———

const PERIODS = (s: FishIdStats) => [
  { label: 'Hôm nay', note: 'chưa hết ngày', cur: s.periods.today, prev: s.periods.yesterday, vs: 'hôm qua', context: true },
  { label: '7 ngày', note: 'đến hết hôm qua', cur: s.periods.d7, prev: s.periods.d7prev, vs: '7 ngày trước đó' },
  { label: '30 ngày', note: 'đến hết hôm qua', cur: s.periods.d30, prev: s.periods.d30prev, vs: '30 ngày trước đó' },
  { label: 'Tháng này', note: 'đến giờ', cur: s.periods.mtd, prev: s.periods.mtdPrev, vs: 'cùng kỳ tháng trước' },
]
const PERIOD_HEAD = ['Kỳ', 'Lượt gọi Claude', 'Chi phí', 'Mỗi lượt']
const PERIOD_FULL_HEAD = ['Kỳ', 'Lượt gọi Claude', 'Có kết quả', 'Không có kết quả', 'Chặn trước khi gọi', 'Token vào', 'Token ra', 'Chi phí', 'Mỗi lượt']
/** Cost per identification that reached Claude: the agent's several calls are one identification. */
const each = (t: Totals) => (t.calls ? t.usd / t.calls : 0)
const PERIOD_FOLDED = 'Bảng đầy đủ: kết quả, token'
type Period = ReturnType<typeof PERIODS>[number]
/** A period's figure and, under it, its change (today: yesterday's figure, as today isn't over). */
const periodCell = (p: Period, pick: (t: Totals) => number, f: (n: number) => string) => ({ text: f(pick(p.cur)), sub: p.context ? `${p.vs}: ${f(pick(p.prev))}` : shortDelta(pick(p.cur), pick(p.prev)) })
/** Calls and cost per period, with the change against the period before (today: yesterday's figure, as today isn't over). */
function periodTable(s: FishIdStats, full: boolean): string {
  // Its changes say only the figure, so the table fits a phone; the note under it says against what.
  const cell = (p: Period, pick: (t: Totals) => number, f: (n: number) => string) => {
    const c = periodCell(p, pick, f)
    return `<td>${esc(c.text)}<br><span class="delta">${esc(c.sub)}</span></td>`
  }
  const head = (full ? PERIOD_FULL_HEAD : PERIOD_HEAD).map(h => `<th>${h}</th>`).join('')
  const rows = PERIODS(s).map(p => `<tr><th>${esc(p.label)}<br><span class="note">${esc(p.note)}</span></th>${cell(p, t => t.calls, n => fmt(n))}${full ? `<td>${fmt(p.cur.ok)}</td><td>${fmt(p.cur.none)}</td><td>${fmt(p.cur.blocked)}</td><td>${fmt(p.cur.tin)}</td><td>${fmt(p.cur.tout)}</td>` : ''}${cell(p, t => t.usd, usd)}${cell(p, each, usd)}</tr>`).join('')
  return `<div class="scroll"><table${full ? ' class="wide"' : ''}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}
function periodBlock(s: FishIdStats, full: boolean): Block {
  const rows = PERIODS(s).map(p => [
    { text: p.label, sub: p.note },
    periodCell(p, t => t.calls, n => fmt(n)),
    ...(full ? [p.cur.ok, p.cur.none, p.cur.blocked, p.cur.tin, p.cur.tout].map(n => ({ text: fmt(n) })) : []),
    periodCell(p, t => t.usd, usd),
    periodCell(p, each, usd),
  ])
  return table(full ? PERIOD_FULL_HEAD : PERIOD_HEAD, rows, full ? { folded: PERIOD_FOLDED } : {})
}
const shortDelta = (now: number, before: number) => {
  if (!before) return now ? 'kỳ trước: 0' : 'như kỳ trước'
  const p = Math.round(((now - before) / before) * 100)
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${fmt(Math.abs(p))}%`
}

const OUTCOME: Record<string, string> = {
  ok: 'có kết quả', refused: 'Claude từ chối', unreadable: 'câu trả lời đọc không được', request: 'API từ chối yêu cầu', unavailable: 'API lỗi tạm thời',
  resting: 'mọi key đang nghỉ', error: 'lỗi máy chủ', fish_id_off: 'công cụ đang tắt', 'cross-origin': 'gửi từ trang khác', 'too large': 'ảnh quá lớn',
  'bad form': 'form hỏng', 'no file': 'không có ảnh', 'not an image': 'không phải ảnh', turnstile: 'không qua kiểm tra chống spam', rate: 'bạn đọc hết lượt', busy: 'cả trang hết lượt',
  retry: 'gửi lại, trả kết quả đã có',
}
/** Why the agent stopped (fishid/log.ts blob10). */
const STOPPED: Record<string, string> = { answer: 'tự trả lời', calls: 'hết lượt gọi', tools: 'hết lượt công cụ', time: 'hết giờ', tokens: 'hết token', fallback: 'quay về một lần gọi', error: 'lỗi, không kịp gọi lại' }
const VERDICT: Record<string, string> = { fish: 'động vật', plant: 'cây', other: 'không có', unclear: 'chưa rõ' }
const FROM: Record<string, string> = { page: 'trang nhận diện', tank: 'Bể của tôi' }
const KEY_STATE: Record<FishIdStatus['rows'][number]['state'], string> = { ok: 'đang dùng', credit: 'hết credit', auth: 'key bị từ chối', rate: 'bị giới hạn tốc độ' }
const KEY_STATE_EN: typeof KEY_STATE = { ok: 'in use', credit: 'out of credit', auth: 'key refused', rate: 'rate limited' }

export type FishPage = { now: Date; stats: Soft<FishIdStats>; keys: Soft<FishIdStatus | undefined>; pages: Map<string, string>; /** The viewer's time zone (admin/time.ts). */ tz?: string; /** The period's key (?period=); the first when none or another. */ period?: string | null }

/** The periods the section's top figures can be for, the first by default (the request's ?period=). */
export const FISH_PERIODS = [{ key: 'd7', label: '7 ngày', at: 1 }, { key: 'today', label: 'Hôm nay', at: 0 }, { key: 'd30', label: '30 ngày', at: 2 }, { key: 'month', label: 'Tháng này', at: 3 }] as const
const fishPeriod = (f: FishPage) => FISH_PERIODS.find(p => p.key === f.period) ?? FISH_PERIODS[0]
/** The period's calls, cost and cost per call, each against the period before (today: yesterday). */
function periodTiles(s: FishIdStats, key: (typeof FISH_PERIODS)[number]): Tile[] {
  const p = PERIODS(s)[key.at]!
  const t = (label: string, pick: (x: Totals) => number, f: (n: number) => string, good?: 'up'): Tile => ({ label: `${label} · ${p.label.toLowerCase()}`, value: f(pick(p.cur)), sub: p.note, delta: { now: pick(p.cur), before: pick(p.prev), vs: p.vs, ...(good ? { good } : {}) } })
  return [t('Lượt gọi Claude', x => x.calls, n => fmt(n), 'up'), t('Chi phí', x => x.usd, usd), t('Mỗi lượt', each, usd)]
}

const fishLede = (tz: string, now: Date) => `Mỗi lượt gửi ảnh tới công cụ ghi một dòng vào Analytics Engine: kết quả, token, chi phí theo giá niêm yết, không có ảnh, IP hay key. Analytics Engine giữ khoảng 3 tháng. ${zoneNote(tz, now)}`
const FISH_TOTALS_NOTE = '% là thay đổi so với kỳ trước: 7 hay 30 ngày trước đó, cùng kỳ tháng trước. Lượt gọi Claude: những lượt đã gọi tới API (có kết quả, hoặc không: Claude từ chối, câu trả lời hỏng, API lỗi). Chặn trước khi gọi: hết lượt, không qua Turnstile, ảnh hỏng… không tốn tiền.'
// Tokens in and out differ tenfold: each gets its own chart and axis rather than sharing one where "out" lies flat.
const fishCharts = (s: FishIdStats): DayChart[] => [
  { id: 'f-calls', title: 'Lượt gửi ảnh mỗi ngày, theo kết quả', days: s.days, series: [{ label: 'Có kết quả', values: s.perDay.ok }, { label: 'Không có kết quả', values: s.perDay.none }, { label: 'Chặn trước khi gọi', values: s.perDay.blocked, tone: 'mute' }], partialLast: true, empty: 'Chưa có lượt nào được ghi (nhật ký bắt đầu từ bản cập nhật này).' },
  { id: 'f-cost', title: 'Chi phí mỗi ngày', days: s.days, series: [{ label: 'Chi phí', values: s.perDay.usd }], unit: 'usd', partialLast: true, empty: 'Chưa có chi phí nào được ghi.' },
  { id: 'f-tin', title: 'Token vào mỗi ngày', days: s.days, series: [{ label: 'Token vào', values: s.perDay.tin }], partialLast: true, empty: 'Chưa có token nào được ghi.' },
  { id: 'f-tout', title: 'Token ra mỗi ngày', days: s.days, series: [{ label: 'Token ra', values: s.perDay.tout }], partialLast: true, empty: 'Chưa có token nào được ghi.' },
]
const fishShare = (s: FishIdStats): Tile[] => {
  const share = s.periods.last30
  return [{ label: 'Câu trả lời có trang · 30 ngày gần nhất', value: share.guessed ? `${fmt((100 * share.linked) / share.guessed)}%` : '—', meter: share.guessed ? share.linked / share.guessed : undefined, sub: `${fmt(share.linked)} trên ${fmt(share.guessed)} câu trả lời có loài để đoán` }]
}
const UNMATCHED_HEAD = ['Tên khoa học', 'Lượt', 'Chắc trung bình']
const unmatchedRows = (s: FishIdStats): Ranked[] => s.unmatched.map(u => ({ label: `<i class="sci">${esc(u.sci)}</i>`, value: u.n, cells: [`${fmt(u.conf * 100)}%`] }))
const NO_KEYS = 'Chưa có key nào (ANTHROPIC_KEYS): công cụ đang tắt.'

export function fishIdPage(f: FishPage): string {
  const tz = f.tz ?? HOME_TZ
  let body = `<h1>Nhận diện cá</h1><p class="lede">${fishLede(tz, f.now)}</p><p><a href="${RUNS_PATH}">Từng lượt, Claude nghĩ và tra gì (giữ 365 ngày) →</a></p>`
  if (isFailed(f.stats)) body += failedBox('nhật ký nhận diện cá', f.stats)
  else {
    const s = f.stats
    body += `${tiles(periodTiles(s, fishPeriod(f)))}<h2>Tổng</h2>${periodTable(s, false)}<details><summary>${PERIOD_FOLDED}</summary>${periodTable(s, true)}</details><p class="note">${FISH_TOTALS_NOTE}</p>
<div class="charts">
${fishCharts(s).map(dayChart).join('\n')}
</div>
<div class="split"><section><h2>Có trang trong cẩm nang</h2>${tiles(fishShare(s))}</section>
<section><h2>Đoán nhiều mà chưa có trang · 30 ngày</h2>${rankTable(unmatchedRows(s), UNMATCHED_HEAD)}</section></div>`
  }
  body += `<h2 id="key">Key Anthropic</h2>${isFailed(f.keys) ? failedBox('trạng thái key', f.keys) : f.keys ? keysHtml(f.keys, f.now, tz) : `<p class="muted">${NO_KEYS}</p>`}`
  if (!isFailed(f.stats)) body += `<h2>100 lượt gần nhất</h2>${recentHtml(f.stats.recent, f.pages, f.now, tz)}`
  return page('/_ab/nhan-dien-ca/', 'Nhận diện cá', body, f.now, tz)
}

export function fishIdSection(f: FishPage): Section {
  const tz = f.tz ?? HOME_TZ
  const blocks: Block[] = [note(textOf(fishLede(tz, f.now)))]
  if (isFailed(f.stats)) blocks.push(failedNote('nhật ký nhận diện cá', f.stats))
  else {
    const s = f.stats
    blocks.push(figures(periodTiles(s, fishPeriod(f))), heading('Tổng'), periodBlock(s, false), periodBlock(s, true), note(FISH_TOTALS_NOTE), ...fishCharts(s).map(c => chart(c)),
      heading('Có trang trong cẩm nang'), figures(fishShare(s)), heading('Đoán nhiều mà chưa có trang · 30 ngày'), rankBlock(unmatchedRows(s), UNMATCHED_HEAD))
  }
  blocks.push(heading('Key Anthropic', 2, 'key'))
  if (isFailed(f.keys)) blocks.push(failedNote('trạng thái key', f.keys))
  else if (!f.keys) blocks.push(note(NO_KEYS, 'muted'))
  else {
    const k = keysParts(f.keys, f.now, tz)
    blocks.push(note(textOf(k.lead)), table(k.head, k.rows, { empty: 'Chưa có key nào.' }), note(KEYS_NOTE), figures(runTiles(f.keys)), note(RUNS_NOTE))
  }
  if (!isFailed(f.stats)) blocks.push(heading('100 lượt gần nhất'), table(RECENT_HEAD, f.stats.recent.map(c => recentCells(c, f.pages, f.now, tz)), { empty: RECENT_NONE }))
  return { title: 'Nhận diện cá', blocks, periods: FISH_PERIODS.map(({ key, label }) => ({ key, label })), period: fishPeriod(f).key }
}

/** Today's runs that went another way than plain (the ledger's counts, fishid/ledger.ts), from the same UTC midnight as the keys. */
function runTiles(k: FishIdStatus): Tile[] {
  const c = k.counts
  return [
    { label: 'Agent quay về cách gọi một lần', value: fmt(c.fallback) },
    { label: 'Agent dừng vì hết lần gọi', value: fmt(c.callLimit) },
    { label: 'Lần gọi sau bị API từ chối (400)', value: fmt(c.later400) },
    { label: 'Không đọc được dữ kiện trang', value: fmt(c.facts) },
    { label: 'Lượt trả lại cho người đọc', value: fmt(c.refunds), ...(k.mostRefunds ? { sub: `nhiều nhất một người: ${fmt(k.mostRefunds)}` } : {}) },
  ]
}
const RUNS_NOTE = 'Cùng ngày với bảng key. Lượt trả lại: lỗi phía mình (503) nên người đọc không mất lượt; ảnh hay yêu cầu của người đọc lỗi (502) thì vẫn tính.'
const KEYS_NOTE = 'Lần gọi API: mọi lần thử bằng key này, kể cả lần lỗi (một lượt nhận diện có thể thử vài key). Claude trả lời: những lần trong số đó Claude đã trả lời.'
/** The keys by number and hash, never the key: the line over the table, its head and its rows. */
function keysParts(k: FishIdStatus, now: Date, tz: string) {
  // The tool counts each UTC day (the ledger, fishid/ledger.ts): its "today" began at UTC midnight, said in the viewer's time.
  const began = `${now.toISOString().slice(0, 10)}T00:00:00Z`
  const since = `${hourMinute(began, tz)} ${localDay(began, tz) === localDay(now, tz) ? 'hôm nay' : 'hôm qua'}`
  const lead = `Từ ${since} (đầu ngày công cụ đếm): ${fmt(k.today)} lượt nhận diện gọi Claude · mô hình <code>${esc(k.model)}</code>. Mỗi lượt dùng một key ngẫu nhiên trong số key đang dùng; key lỗi thì sang key khác. Hết credit hoặc bị từ chối: nghỉ 24 giờ.${k.bad ? ` <strong>${fmt(k.bad)} dòng trong ANTHROPIC_KEYS không đọc được, bị bỏ qua.</strong>` : ''}`
  const head = ['Key', 'SHA-256 (8 ký tự đầu)', 'Loại', 'Trạng thái', `Lần gọi API từ ${since}`, 'Claude trả lời']
  const rows: Cell[][] = k.rows.map(r => [{ text: `#${r.n}` }, { text: r.hash }, { text: r.workspace ? 'tổ chức + workspace' : 'workspace' }, { text: `${KEY_STATE[r.state]}${r.until ? ` đến ${timeText(r.until, tz, now)}` : ''}` }, { text: fmt(r.calls) }, { text: fmt(r.answered) }])
  return { since, lead, head, rows }
}
function keysHtml(k: FishIdStatus, now: Date, tz: string): string {
  const { since, lead } = keysParts(k, now, tz)
  const rows = k.rows.map(r => `<tr><th>#${r.n}</th><td class="l"><code>${esc(r.hash)}</code></td><td class="l">${r.workspace ? 'tổ chức + workspace' : 'workspace'}</td><td class="l">${esc(KEY_STATE[r.state])}${r.until ? ` đến ${timeTag(r.until, tz, now)}` : ''}</td><td>${fmt(r.calls)}</td><td>${fmt(r.answered)}</td></tr>`).join('')
  return `<p>${lead}</p>
<div class="scroll"><table class="wide"><thead><tr><th>Key</th><th>SHA-256 (8 ký tự đầu)</th><th>Loại</th><th>Trạng thái</th><th>Lần gọi API từ ${esc(since)}</th><th>Claude trả lời</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="none">Chưa có key nào.</td></tr>'}</tbody></table></div>
<p class="note">${KEYS_NOTE}</p>
${tiles(runTiles(k))}<p class="note">${RUNS_NOTE}</p>`
}

const RECENT_HEAD = ['Lúc', 'Kết quả', 'Loại', 'Đoán nhiều nhất', 'Chắc', 'Token vào', 'Token ra', 'Chi phí', 'ms', 'Key', 'Lần gọi', 'Agent: lượt Claude · công cụ · ảnh', 'Từ', 'Nước']
/** The agent's calls to Claude, tool calls and reference photos (fishid/log.ts). */
const agentText = (c: Call) => `${fmt(c.turns)} · ${fmt(c.tools)} · ${fmt(c.refs)}`
/** Why it stopped, and when its first answer, too unsure, was sent back to look again. */
const stoppedText = (c: Call) => `${STOPPED[c.stopped] ?? c.stopped}${c.rechecked ? ' · xem lại một lần' : ''}`
const RECENT_NONE = 'Chưa có lượt nào được ghi.'
/** A call's best guess: its page when the catalog has one, else the name and why there is no link. */
function guessOf(c: Call, pages: Map<string, string>): Cell {
  if (!c.sci) return { text: '—', tone: 'muted' }
  const url = c.page ? pages.get(c.page) : undefined
  return url ? { text: c.sci, href: withoutVi(url) } : { text: c.sci, sub: c.page ? `(${c.page})` : 'chưa có trang' }
}
const recentCells = (c: Call, pages: Map<string, string>, now: Date, tz: string): Cell[] => [
  { text: timeText(c.t, tz, now) }, { text: OUTCOME[c.outcome] ?? c.outcome }, { text: VERDICT[c.verdict] ?? (c.verdict || '—') }, guessOf(c, pages),
  { text: c.guesses ? `${fmt(c.conf * 100)}%` : '—' }, { text: fmt(c.tin) }, { text: fmt(c.tout) }, { text: c.usd ? usd(c.usd) : '—' }, { text: fmt(c.ms) },
  { text: c.key || '—' }, { text: fmt(c.attempts) }, c.stopped ? { text: agentText(c), sub: stoppedText(c) } : { text: '—' }, { text: FROM[c.from] ?? (c.from || '—') }, { text: c.country || '—' },
]
function recentHtml(xs: Call[], pages: Map<string, string>, now: Date, tz: string): string {
  const guess = (c: Call) => {
    if (!c.sci) return '<span class="muted">—</span>'
    const url = c.page ? pages.get(c.page) : undefined
    const name = `<i class="sci">${esc(c.sci)}</i>`
    return url ? `<a href="${esc(withoutVi(url))}">${name}</a>` : c.page ? `${name} <span class="muted">(${esc(c.page)})</span>` : `${name} <span class="muted">· chưa có trang</span>`
  }
  const rows = xs.map(c => `<tr><th>${timeTag(c.t, tz, now)}</th><td class="l">${esc(OUTCOME[c.outcome] ?? c.outcome)}</td><td class="l">${esc(VERDICT[c.verdict] ?? (c.verdict || '—'))}</td><td class="l wrap">${guess(c)}</td><td>${c.guesses ? `${fmt(c.conf * 100)}%` : '—'}</td><td>${fmt(c.tin)}</td><td>${fmt(c.tout)}</td><td>${c.usd ? usd(c.usd) : '—'}</td><td>${fmt(c.ms)}</td><td class="l">${c.key ? `<code>${esc(c.key)}</code>` : '—'}</td><td>${fmt(c.attempts)}</td><td class="l">${c.stopped ? `${esc(agentText(c))} <span class="muted">${esc(stoppedText(c))}</span>` : '—'}</td><td class="l">${esc(FROM[c.from] ?? (c.from || '—'))}</td><td class="l">${esc(c.country || '—')}</td></tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr>${RECENT_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${RECENT_HEAD.length}" class="none">${RECENT_NONE}</td></tr>`}</tbody></table></div>`
}

// ——— Người đọc ———

/** A path from the beacon is anything a script sent: a link only for one of the site's pages ("//other.site" stays text). */
export const pageLink = (path: string) => (isViPage(path) || prefixedLang(path) ? `<a href="${esc(path)}">${esc(path)}</a>` : esc(path))

const NO_AE = 'Chưa cấu hình AE_API_TOKEN và CF_ACCOUNT_ID: chưa đọc được dữ liệu (Analytics Engine).'
const SOURCE_HEAD = ['Nguồn', 'Phiên', 'Người đọc']
const PAGE_VIEWS_HEAD = ['Trang', 'Lượt xem']
const COUNTRY_HEAD = ['Nước', 'Người đọc']
/** What the readers page draws: its line, its tiles, its chart and its three rankings. */
function readersParts(now: Date, r: Readers, tz: string) {
  const days = lastDays(now, r.days, tz)
  const d = alignDaily(days, r.daily)
  // Days before the count's reset weren't counted: no value, not 0.
  const from = r.from ? localDay(r.from, tz) : ''
  const counted = (vals: number[]) => days.map((day, i) => (day < from ? null : vals[i]!))
  return {
    lede: `${r.days} ngày gần nhất${r.from ? ` (đếm lại từ ${timeTag(r.from, tz, now)})` : ''} · đếm từ trình duyệt chạy JavaScript của trang (bỏ bot đã biết, các lượt kiểm tra tự động của AquaTome và lượt của chủ trang) · <b>người đọc</b> = phiên cuộn ≥ 50% trang hoặc ở lại ≥ 30 giây. ${zoneNote(tz, now)}`,
    tiles: [{ label: 'Phiên', value: fmt(r.sessions) }, { label: 'Người đọc', value: fmt(r.readers), meter: r.sessions ? r.readers / r.sessions : undefined, sub: `${fmt(r.sessions ? (100 * r.readers) / r.sessions : 0, 1)}% số phiên (tỉ lệ người đọc)` }] as Tile[],
    chart: { id: 'r-daily', title: 'Phiên và người đọc mỗi ngày', days, series: [{ label: 'Người đọc', values: counted(d.readers) }], whole: { label: 'Phiên', values: counted(d.sessions) }, partialLast: true, empty: 'Chưa có phiên nào.', ...(from ? { missing: `chưa đếm: số đếm bắt đầu lại từ ${dayText(from, now, tz)}` } : {}) } as DayChart,
    sources: r.sources.map(x => ({ label: esc(x.source), value: x.sessions, part: x.readers, cells: [fmt(x.readers)] })) as Ranked[],
    pages: r.pages.map(x => ({ label: pageLink(x.path), value: x.views })) as Ranked[],
    countries: r.countries.map(x => ({ label: esc(x.cc), value: x.readers })) as Ranked[],
  }
}

const ASKS_TITLE = 'Trang chọn ngôn ngữ'
const ASKS_HEAD = ['Nước', 'Lần hiện', ...LANGS.map(l => `Chọn ${LANG_VI[l]}`)]
/** The language chooser (worker/lang-ask.ts): who saw it and what they picked, by country. */
const asksParts = (a: LangAsks) => ({
  lede: `Trình duyệt không hỏi tiếng Việt, Indonesia hay Thái, từ nước khác Việt Nam, Indonesia, Thái Lan, mở aquatome.com/ thì được hỏi chọn ngôn ngữ. Số lần trang hiện và lựa chọn, theo nước, ${a.days} ngày gần nhất (bỏ bot và lượt trình duyệt tải trước). Người đọc đi qua trang này hiện là “(trực tiếp)” ở bảng Nguồn truy cập.`,
  rows: a.rows.map(x => ({ label: esc(x.cc || '??'), value: x.shown, cells: LANGS.map(l => fmt(x.picked[l])) })) as Ranked[],
})

export function readersPage(now: Date, r: Soft<Readers> | undefined, tz = HOME_TZ, asks?: Soft<LangAsks>): string {
  let body = '<h1>Người đọc thật</h1>'
  if (!r) body += `<p class="muted">${NO_AE}</p>`
  else if (isFailed(r)) body += failedBox('người đọc (Analytics Engine)', r)
  else {
    const p = readersParts(now, r, tz)
    body += `<p class="lede">${p.lede}</p>
${tiles(p.tiles)}
<h2>Theo ngày và nguồn</h2><div class="charts">${dayChart(p.chart)}
<figure class="chart" aria-labelledby="r-src"><figcaption><h3 id="r-src">Nguồn truy cập</h3></figcaption>${rankTable(p.sources, SOURCE_HEAD, undefined, { part: 'Người đọc' })}</figure></div>
<div class="split"><section><h2>Trang người đọc xem nhiều nhất</h2>${rankTable(p.pages, PAGE_VIEWS_HEAD)}</section>
<section><h2>Quốc gia (người đọc)</h2>${rankTable(p.countries, COUNTRY_HEAD)}</section></div>`
  }
  if (asks && isFailed(asks)) body += `<h2>${ASKS_TITLE}</h2>${failedBox('trang chọn ngôn ngữ (Analytics Engine)', asks)}`
  else if (asks) {
    const a = asksParts(asks)
    body += `<h2>${ASKS_TITLE}</h2><p class="lede">${a.lede}</p>${rankTable(a.rows, ASKS_HEAD)}`
  }
  return page('/_ab/doc-gia/', 'Người đọc', body, now, tz)
}

export function readersSection(now: Date, r: Soft<Readers> | undefined, tz = HOME_TZ, asks?: Soft<LangAsks>): Section {
  const blocks: Block[] = []
  if (!r) blocks.push(note(NO_AE, 'muted'))
  else if (isFailed(r)) blocks.push(failedNote('người đọc (Analytics Engine)', r))
  else {
    const p = readersParts(now, r, tz)
    blocks.push(note(textOf(p.lede)), figures(p.tiles), heading('Theo ngày và nguồn'), chart(p.chart), heading('Nguồn truy cập', 3), rankBlock(p.sources, SOURCE_HEAD),
      heading('Trang người đọc xem nhiều nhất'), rankBlock(p.pages, PAGE_VIEWS_HEAD), heading('Quốc gia (người đọc)'), rankBlock(p.countries, COUNTRY_HEAD))
  }
  if (asks && isFailed(asks)) blocks.push(heading(ASKS_TITLE), failedNote('trang chọn ngôn ngữ (Analytics Engine)', asks))
  else if (asks) {
    const a = asksParts(asks)
    blocks.push(heading(ASKS_TITLE), note(a.lede), rankBlock(a.rows, ASKS_HEAD))
  }
  return { title: 'Người đọc thật', blocks }
}

// ——— Affiliate ———

const NETWORK_HEAD = ['Sàn · nhóm', 'Lượt bấm']
const TOP_HEAD = ['Trang', 'Lượt bấm']
/** What the affiliate page draws: its line, its chart, its two rankings and the line on the catalog. */
function affiliateParts(clicks: Soft<Clicks>, a: Soft<AffSummary>, now: Date, tz: string) {
  // clicks_daily keeps Vietnam's days (affiliate/go.ts), which can't be split again by another zone's.
  const days = sameClock(tz, HOME_TZ, now) ? zoneNote(tz, now) : `Lượt bấm được lưu theo ngày giờ Việt Nam (GMT+7); giờ theo giờ của bạn (${zoneName(tz, now)}).`
  return {
    lede: `Lượt bấm vào liên kết /go/ tới các sàn (bỏ bot). ${days}`,
    chart: isFailed(clicks) ? clicks : ({ id: 'a-daily', title: 'Lượt bấm mỗi ngày · 30 ngày', days: clicks.days, series: [{ label: 'Lượt bấm', values: clicks.clicks }], partialLast: true, empty: 'Chưa có lượt bấm nào trong 30 ngày.' } as DayChart),
    tables: isFailed(a) ? a : {
      networks: a.byNetwork.map(r => ({ label: `${esc(r.network)} <span class="muted">· ${esc(r.category)}</span>`, value: r.n })) as Ranked[],
      top: a.top.map(r => ({ label: esc(r.entity_ref), value: r.n })) as Ranked[],
      products: `Sản phẩm: ${a.status.map(s => `${esc(s.status)} ${fmt(s.n)}`).join(' · ') || 'chưa có (đang dùng liên kết tìm kiếm)'} · kiểm tra gần nhất: ${a.lastCheck ? timeTag(a.lastCheck, tz, now) : 'chưa chạy'}`,
    },
  }
}

export function affiliatePage(clicks: Soft<Clicks>, a: Soft<AffSummary>, now = new Date(), tz = HOME_TZ): string {
  const p = affiliateParts(clicks, a, now, tz)
  const chartHtml = isFailed(p.chart) ? failedBox('lượt bấm theo ngày', p.chart) : dayChart(p.chart)
  const tables = isFailed(p.tables) ? failedBox('bảng affiliate', p.tables) : `<div class="split"><section><h2>Theo sàn · 14 ngày</h2>${rankTable(p.tables.networks, NETWORK_HEAD)}</section>
<section><h2>Trang dẫn nhiều nhất · 14 ngày</h2>${rankTable(p.tables.top, TOP_HEAD)}</section></div>
<p class="note">${p.tables.products}</p>`
  return page('/_ab/affiliate/', 'Affiliate', `<h1>Affiliate</h1><p class="lede">${p.lede}</p><h2>Theo ngày</h2><div class="charts">${chartHtml}</div>${tables}`, now, tz)
}

export function affiliateSection(clicks: Soft<Clicks>, a: Soft<AffSummary>, now = new Date(), tz = HOME_TZ): Section {
  const p = affiliateParts(clicks, a, now, tz)
  const blocks: Block[] = [note(textOf(p.lede)), heading('Theo ngày'), isFailed(p.chart) ? failedNote('lượt bấm theo ngày', p.chart) : chart(p.chart)]
  if (isFailed(p.tables)) blocks.push(failedNote('bảng affiliate', p.tables))
  else blocks.push(heading('Theo sàn · 14 ngày'), rankBlock(p.tables.networks, NETWORK_HEAD), heading('Trang dẫn nhiều nhất · 14 ngày'), rankBlock(p.tables.top, TOP_HEAD), note(textOf(p.tables.products)))
  return { title: 'Affiliate', blocks }
}

// ——— Bạn đọc muốn có ———

const SOURCE: Record<string, string> = { tank: 'Bể của tôi', 'fish-id': 'nhận diện cá' }
const KIND: Record<string, string> = { fish: 'cá', plant: 'cây' }
const WANTED_HEAD = ['Tên', 'Bạn đọc', 'Loại', 'Từ đâu', 'Lần đầu', 'Gần nhất']
const WANTED_MORE = 'Còn nhiều tên hơn: trang này đọc 5.000 tên đầu.'
const wantedLede = (now: Date, tz: string) => `Cá và cây bạn đọc nhắc tới mà cẩm nang chưa có trang: từ “Bể của tôi”, và từ công cụ nhận diện cá khi Claude khá chắc. Mỗi bạn đọc tính một lần một ngày. Công cụ viết trang ưu tiên những tên nhiều người muốn nhất. Ngày theo giờ Việt Nam${sameClock(tz, HOME_TZ, now) ? '' : ' (GMT+7)'}.`
/** What the wanted page draws from the list: its tiles, its heading and its ranking (the first 300). */
function wantedParts(now: Date, w: { names: Wanted[]; more: boolean }) {
  const since = lastDays(now, 7, HOME_TZ)[0]!
  const top = w.names.slice(0, 300)
  return {
    tiles: [{ label: 'Tên', value: `${fmt(w.names.length)}${w.more ? '+' : ''}` }, { label: 'Lượt bạn đọc', value: fmt(w.names.reduce((s, x) => s + x.readers, 0)) }, { label: 'Tên mới · 7 ngày gần nhất', value: fmt(w.names.filter(x => x.first >= since).length) }] as Tile[],
    title: `Nhiều người muốn nhất${w.names.length > top.length ? ` · ${fmt(top.length)} tên đầu` : ''}`,
    rows: top.map((x): RankRow => {
      // The name, and its scientific name under it when it's another.
      const cell: Cell = { text: x.name, ...(x.sci && x.sci !== x.name ? { sub: x.sci } : {}) }
      return {
        cell, label: `${esc(cell.text)}${cell.sub ? ` <i class="sci muted">${esc(cell.sub)}</i>` : ''}`,
        value: x.readers,
        cells: [esc(KIND[x.kind] ?? x.kind), esc(Object.entries(x.sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SOURCE[k] ?? k} ${fmt(n)}`).join(' · ')), esc(dayText(x.first, now, HOME_TZ)), esc(dayText(x.last, now, HOME_TZ))],
      }
    }),
  }
}

export function wantedPage(now: Date, w: Soft<{ names: Wanted[]; more: boolean }>, tz = HOME_TZ): string {
  let body = `<h1>Bạn đọc muốn có</h1><p class="lede">${wantedLede(now, tz)}</p>`
  if (isFailed(w)) return page('/_ab/muon-co/', 'Bạn đọc muốn có', body + failedBox('danh sách', w), now, tz)
  const p = wantedParts(now, w)
  body += tiles(p.tiles)
  body += `<h2>${p.title}</h2>${rankTable(p.rows, WANTED_HEAD)}${w.more ? `<p class="note">${WANTED_MORE}</p>` : ''}`
  return page('/_ab/muon-co/', 'Bạn đọc muốn có', body, now, tz)
}

export function wantedSection(now: Date, w: Soft<{ names: Wanted[]; more: boolean }>, tz = HOME_TZ): Section {
  const blocks: Block[] = [note(wantedLede(now, tz))]
  if (isFailed(w)) blocks.push(failedNote('danh sách', w))
  else {
    const p = wantedParts(now, w)
    blocks.push(figures(p.tiles), heading(p.title), rankBlock(p.rows, WANTED_HEAD), ...(w.more ? [note(WANTED_MORE)] : []))
  }
  return { title: 'Bạn đọc muốn có', blocks }
}

// ——— Ảnh bạn đọc, Ẩn trang ———

/** A moved photo's line under its page: the page it was sent for. */
const movedText = (from: string) => `Kiểm duyệt chuyển từ ${from}`
/** A comment's photo is marked so, with its comment's page (worker/comments/photo.ts) in place of its own key. */
const FROM_COMMENT = 'Ảnh kèm bình luận'
const isCommentPhoto = (p: { entity_ref: string }) => p.entity_ref.startsWith('comment:')
const commentPage = (p: { entity_ref: string; comment?: PhotoComment }) => p.comment?.path ?? p.comment?.page ?? p.entity_ref
/**
 * One reader photo: its picture, who sent it, to which page (and the page it was sent for, when moderation moved it) and
 * when, then its buttons, Gỡ last. Two columns, so the buttons stay on a phone's screen.
 */
const photoRow = (p: { id: string; entity_ref: string; moved_from?: string | null; name: string; created_at: string; comment?: PhotoComment }, picture: string, state: string, buttons: string, now: Date, tz: string) =>
  `<tr><th style="width:1%">${picture}</th><td class="l" style="overflow-wrap:anywhere"><strong>${esc(p.name)}</strong><br>${isCommentPhoto(p) ? `<span class="chip">${FROM_COMMENT}</span> ${p.comment?.path ? pageLink(p.comment.path) : esc(commentPage(p))}` : esc(p.entity_ref)}${p.moved_from ? `<br><span class="muted">${esc(movedText(p.moved_from))}</span>` : ''}<br><span class="muted">${timeTag(p.created_at, tz, now)}</span>${state}`
  + `<form method="post" action="/_ab/photos" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px"><input type="hidden" name="id" value="${esc(p.id)}">${buttons}<button name="action" value="remove">Gỡ</button></form></td></tr>`

const PHOTOS_LEDE = 'Ảnh đã qua kiểm duyệt tự động (khuôn mặt, đúng loài, an toàn) hoặc do bạn duyệt, và đang hiện trên trang loài. Gỡ: ảnh bị xóa ngay khỏi trang và máy chủ.'
const WAITING_NOTE = 'Lượt duyệt tự động chạy mỗi giờ: ảnh qua duyệt lên trang loài và danh sách dưới, ảnh bị loại thì bị xóa. Chạm vào ảnh để xem lớn. Duyệt: ảnh lên trang ở lượt duyệt tới, không qua kiểm tra tự động. Gỡ: xóa ngay.'
const PHOTOS_OFF = 'Ảnh bạn đọc chưa bật (thiếu D1, R2 hoặc Turnstile).'
const NO_PHOTOS = 'Chưa có ảnh nào.'
/** A waiting photo's upload, served to the owner alone (dashboard.ts). */
const waitingSrc = (id: string) => `/_ab/anh/${id}`
const OWNER_OK = ['Đã duyệt', 'đăng trong lượt duyệt tới']
/** Duyệt (the next pass publishes it) and Gỡ (removed now): the page's two buttons, as the app's requests. */
const photoActions = (id: string, approve: boolean): Action[] => [
  ...(approve ? [{ label: 'Duyệt', method: 'POST', path: `/api/owner/photos/${encodeURIComponent(id)}`, body: { action: 'approve' }, tone: 'good' } as Action] : []),
  { label: 'Gỡ', method: 'POST', path: `/api/owner/photos/${encodeURIComponent(id)}`, body: { action: 'remove' }, tone: 'bad' },
]

export function photosPage(xs: Soft<RecentPhoto[] | undefined>, waiting?: Soft<WaitingPhoto[] | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Ảnh bạn đọc</h1><p class="lede">${PHOTOS_LEDE}</p>`
  // Sent but not yet through the moderation pass (hourly): each with its picture (the upload, served to the owner alone,
  // tapped to see it whole), Duyệt (the next pass publishes it without its checks) and Gỡ.
  if (waiting && !isFailed(waiting) && waiting.length) {
    const rows = waiting.map(p => {
      const src = esc(waitingSrc(p.id))
      const picture = `<a href="${src}"><img class="thumb" src="${src}" alt="Xem cỡ lớn ảnh ${esc(p.name)} gửi" width="96" height="96" loading="lazy" style="height:96px;object-fit:cover"></a>`
      return p.ownerOk
        ? photoRow(p, picture, `<br><span class="chip good">${OWNER_OK[0]}</span> <span class="muted">${OWNER_OK[1]}</span>`, '', now, tz)
        : photoRow(p, picture, '', '<button class="go" name="action" value="approve">Duyệt</button>', now, tz)
    }).join('')
    body += `<h2>Chờ duyệt (${waiting.length})</h2><p class="muted">${WAITING_NOTE}</p><div class="scroll"><table><tbody>${rows}</tbody></table></div><h2>Đang hiện</h2>`
  }
  if (isFailed(xs)) body += failedBox('ảnh', xs)
  else if (!xs) body += `<p class="muted">${PHOTOS_OFF}</p>`
  else {
    const rows = xs.map(p => photoRow(p, `<img class="thumb" src="${esc(p.thumb)}" alt="" width="96" loading="lazy">`, '', '', now, tz)).join('')
    body += `<div class="scroll"><table><tbody>${rows || `<tr><td colspan="2" class="none">${NO_PHOTOS}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/anh-ban-doc/', 'Ảnh bạn đọc', body, now, tz)
}

export function photosSection(xs: Soft<RecentPhoto[] | undefined>, waiting?: Soft<WaitingPhoto[] | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(PHOTOS_LEDE)]
  const meta = (p: { entity_ref: string; moved_from?: string | null; created_at: string; comment?: PhotoComment }) => [...(isCommentPhoto(p) ? [FROM_COMMENT, commentPage(p)] : [p.entity_ref]), ...(p.moved_from ? [movedText(p.moved_from)] : []), timeText(p.created_at, tz, now)]
  if (waiting && !isFailed(waiting) && waiting.length) {
    const items: PhotoItem[] = waiting.map(p => ({ id: p.id, src: waitingSrc(p.id), caption: p.name, meta: [...meta(p), ...(p.ownerOk ? [OWNER_OK.join(' · ')] : [])], actions: photoActions(p.id, !p.ownerOk) }))
    blocks.push(heading(`Chờ duyệt (${waiting.length})`), note(WAITING_NOTE, 'muted'), { kind: 'photos', items }, heading('Đang hiện'))
  }
  if (isFailed(xs)) blocks.push(failedNote('ảnh', xs))
  else if (!xs) blocks.push(note(PHOTOS_OFF, 'muted'))
  else blocks.push({ kind: 'photos', items: xs.map(p => ({ id: p.id, src: p.thumb, caption: p.name, meta: meta(p), actions: photoActions(p.id, false) })), empty: NO_PHOTOS })
  return { title: 'Ảnh bạn đọc', blocks }
}

const KEPT_LEDE = 'Ảnh bạn đọc cho phép giữ khi nhận diện, cùng kết quả: để kiểm tra và cải thiện việc nhận diện. Chỉ hiện ở đây, không bao giờ công khai; tự xóa sau 6 tháng. Bạn đọc đã đăng nhập tự xóa được ảnh của mình; ảnh gửi khi chưa đăng nhập chỉ xóa được ở đây, khi họ liên hệ.'
const KEPT_OFF = 'Chưa bật (thiếu R2 UPLOADS).'
/** A kept photo's image, served to the owner alone (dashboard.ts); `who`: its account, or anon. */
const keptSrc = (who: string, id: string) => `/_ab/anh-nhan-dien/anh/${who}/${id}`
const keptWho = (p: KeptRow) => p.account ?? 'anon'

/** Fish-ID photos readers let us keep (fishid/kept.ts): only here are they seen. Newest first; each goes 6 months on. */
export function keptPage(xs: Soft<KeptRow[] | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Ảnh nhận diện</h1><p class="lede">${KEPT_LEDE}</p>`
  if (isFailed(xs)) body += failedBox('ảnh nhận diện', xs)
  else if (!xs) body += `<p class="muted">${KEPT_OFF}</p>`
  else {
    const rows = xs.map(p => {
      const who = keptWho(p)
      const top = p.guesses[0]
      const src = keptSrc(esc(who), esc(p.id))
      return `<tr><th><a href="${src}"><img class="thumb" src="${src}" alt="" width="96" loading="lazy"></a></th><td class="l">${esc(p.verdict)}${top ? ` · <i>${esc(top.scientificName)}</i> ${Math.round(top.confidence * 100)}%` : ''}</td><td>${p.account ? 'đăng nhập' : 'chưa đăng nhập'}</td><td>${esc(p.lang)}</td><td>${p.run ? `<a href="${runPath(p.run.day, p.run.id)}">${timeTag(p.created, tz, now)}</a>` : timeTag(p.created, tz, now)}</td><td><form method="post" action="/_ab/anh-nhan-dien/xoa"><input type="hidden" name="who" value="${esc(who)}"><input type="hidden" name="id" value="${esc(p.id)}"><button>Xóa</button></form></td></tr>`
    }).join('')
    body += `<div class="scroll"><table><thead><tr><th></th><th>Kết quả</th><th>Gửi khi</th><th>Ngôn ngữ</th><th>Lúc</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="none">${NO_PHOTOS}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/anh-nhan-dien/', 'Ảnh nhận diện', body, now, tz)
}

export function keptSection(xs: Soft<KeptRow[] | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(KEPT_LEDE)]
  if (isFailed(xs)) blocks.push(failedNote('ảnh nhận diện', xs))
  else if (!xs) blocks.push(note(KEPT_OFF, 'muted'))
  else {
    const items: PhotoItem[] = xs.map(p => {
      const who = keptWho(p)
      const top = p.guesses[0]
      return {
        id: p.id, src: keptSrc(who, p.id), caption: `${p.verdict}${top ? ` · ${top.scientificName} ${Math.round(top.confidence * 100)}%` : ''}`,
        meta: [p.account ? 'đăng nhập' : 'chưa đăng nhập', p.lang, timeText(p.created, tz, now)],
        actions: [{ label: 'Xóa', method: 'DELETE', path: `/api/owner/fishid-shots/${encodeURIComponent(who)}/${encodeURIComponent(p.id)}`, tone: 'bad' }],
      }
    })
    blocks.push({ kind: 'photos', items, empty: NO_PHOTOS })
  }
  return { title: 'Ảnh nhận diện', blocks }
}

const HIDDEN_LEDE = 'Trang bị ẩn trả về 410 (đã gỡ), kể cả bản Markdown: thường sau 1–2 phút, chậm nhất là lần build sau (≤3 giờ), khi nó cũng biến khỏi danh sách, sitemap và tìm kiếm. Hiện lại: nếu đã qua một lần build, trang quay lại ở lần build tiếp theo.'
const NO_HIDDEN = 'Chưa ẩn trang nào.'
const newestHidden = (h: Hidden) => Object.entries(h).sort(([, a], [, b]) => b.at.localeCompare(a.at))

export function hiddenPage(h: Soft<Hidden>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Ẩn trang</h1><p class="lede">${HIDDEN_LEDE}</p>
<form class="inline" method="post" action="/_ab/hidden"><input name="url" required placeholder="https://aquatome.com/ca/..." aria-label="Địa chỉ trang"><input name="note" placeholder="Lý do (tuỳ chọn)" aria-label="Lý do"><button class="go" name="action" value="hide">Ẩn</button></form>`
  if (isFailed(h)) body += failedBox('danh sách trang ẩn', h)
  else {
    const rows = newestHidden(h).map(([path, v]) =>
      `<tr><th><a href="${esc(path)}">${esc(path)}</a></th><td class="l">${esc(v.note ?? '')}</td><td>${timeTag(v.at, tz, now)}</td><td><form method="post" action="/_ab/hidden"><input type="hidden" name="url" value="${esc(path)}"><button name="action" value="unhide">Hiện lại</button></form></td></tr>`).join('')
    body += `<div class="scroll"><table><thead><tr><th>Trang</th><th>Lý do</th><th>Lúc</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="none">${NO_HIDDEN}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/an-trang/', 'Ẩn trang', body, now, tz)
}

export function hiddenSection(h: Soft<Hidden>, now = new Date(), tz = HOME_TZ): Section {
  // The page's form: a page's address and why, hidden at once.
  const form: Block = {
    kind: 'form', method: 'POST', path: '/api/owner/hidden', body: { hide: true }, submit: 'Ẩn',
    fields: [{ name: 'path', label: 'Địa chỉ trang', kind: 'text', required: true, placeholder: 'https://aquatome.com/ca/...' }, { name: 'note', label: 'Lý do', kind: 'text', placeholder: 'Lý do (tuỳ chọn)' }],
  }
  const blocks: Block[] = [note(HIDDEN_LEDE), form]
  if (isFailed(h)) blocks.push(failedNote('danh sách trang ẩn', h))
  else blocks.push({
    kind: 'hidden',
    items: newestHidden(h).map(([path, v]) => ({ path, ...(v.note ? { note: v.note } : {}), since: timeText(v.at, tz, now), actions: [{ label: 'Hiện lại', method: 'POST', path: '/api/owner/hidden', body: { path, hide: false } }] })),
    empty: NO_HIDDEN,
  })
  return { title: 'Ẩn trang', blocks }
}

// ——— Tài khoản (comments have their own page, admin/comments.ts) ———

const CRED: Record<string, string> = { apple: 'Apple', google: 'Google', passkey: 'Passkey', email: 'Email' }
const CRED_HEAD = ['Cách', 'Số']
const accountsLede = (now: Date, tz: string) => `Tài khoản đăng nhập để đồng bộ “Bể của tôi”. Không lưu tên, email hay số điện thoại. ${zoneNote(tz, now)}`
/** What the accounts page draws: its tiles, its chart and its ranking. */
function accountsParts(a: AccountStats) {
  return {
    tiles: [
      { label: 'Tài khoản', value: fmt(a.users) },
      { label: 'Tài khoản mới · 7 ngày', value: fmt(ago(a.newUsers, 7, 1)), delta: { now: ago(a.newUsers, 7, 1), before: ago(a.newUsers, 14, 8), vs: '7 ngày trước đó', good: 'up' } },
      { label: 'Có bể đã đồng bộ', value: fmt(a.synced) },
      { label: 'Phiên đăng nhập còn hạn', value: fmt(a.openSessions) },
    ] as Tile[],
    charts: [
      { id: 'u-daily', title: 'Tài khoản mới mỗi ngày · 30 ngày', days: a.days, series: [{ label: 'Tài khoản mới', values: a.newUsers }], partialLast: true, empty: 'Chưa có tài khoản mới nào trong 30 ngày.' },
    ] as DayChart[],
    credentials: a.credentials.map(c => ({ label: esc(CRED[c.kind] ?? c.kind), value: c.n })) as Ranked[],
  }
}

export function accountsPage(a: Soft<AccountStats>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Tài khoản</h1><p class="lede">${accountsLede(now, tz)}</p>`
  if (isFailed(a)) return page('/_ab/tai-khoan/', 'Tài khoản', body + failedBox('số liệu', a), now, tz)
  const p = accountsParts(a)
  body += tiles(p.tiles)
  body += `<h2>Theo ngày</h2><div class="charts">${dayChart(p.charts[0]!)}</div>
<h2>Cách đăng nhập</h2>${rankTable(p.credentials, CRED_HEAD)}`
  return page('/_ab/tai-khoan/', 'Tài khoản', body, now, tz)
}

export function accountsSection(a: Soft<AccountStats>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(accountsLede(now, tz))]
  if (isFailed(a)) blocks.push(failedNote('số liệu', a))
  else {
    const p = accountsParts(a)
    blocks.push(figures(p.tiles), heading('Theo ngày'), ...p.charts.map(c => chart(c)), heading('Cách đăng nhập'), rankBlock(p.credentials, CRED_HEAD))
  }
  return { title: 'Tài khoản', blocks }
}
