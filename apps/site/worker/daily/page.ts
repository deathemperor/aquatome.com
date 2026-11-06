import { failedNote, heading, note, table, type Action, type Block, type Section, type TextTone } from '../admin/blocks'
import { esc, fmt } from '../admin/chart'
import { failedBox, ICON, isFailed, page, REPORT_NAME, REPORT_PATH, soft, type Soft } from '../admin/shell'
import { HOME_TZ, timeTag, timeText } from '../admin/time'
import { getReport, listReports, type ReportMeta } from './log'
import { apnsKeys, devices, type LiveSessions, type PushEnv } from './push'
import { getSettings, type ReportSettings } from './settings'

/**
 * /_ab/bao-cao/: how the owner gets the daily report (email, the phone's notification), and the reports kept, newest
 * first, each as it was sent. The app reads the same as the section bao-cao (owner-api.ts), its buttons POST
 * /api/owner/report-settings as the page's form posts /_ab/bao-cao/cai-dat. Vietnamese around them, as the rest of the
 * dashboard; the report itself is in English.
 */

export const SETTINGS_FORM = `${REPORT_PATH}cai-dat`
const SETTINGS_API = '/api/owner/report-settings'
const LEDE = 'Mỗi sáng 7 giờ (giờ Việt Nam): việc cần xử lý, điểm nổi bật, những gì đã build và số liệu. Lưu ở đây 90 ngày.'
const NO_REPORTS = 'Chưa có báo cáo nào. Báo cáo đầu tiên đến lúc 7 giờ sáng (giờ Việt Nam).'
const HOW = 'Nhận báo cáo'
const LIST = 'Các báo cáo'

/** `phones`: how many phones the app registered in a session still live; `keyed`: the APNs key is set. */
export type Delivery = { settings: ReportSettings; phones: number; keyed: boolean }
export type ReportsData = { now: Date; tz: string; delivery: Soft<Delivery>; xs: Soft<(ReportMeta & { id: string })[]> }

export async function loadReports(env: PushEnv & { AB: KVNamespace }, now: Date, tz: string, live: LiveSessions): Promise<ReportsData> {
  const phones = async () => {
    const d = Object.values(await devices(env.AB))
    const alive = await live([...new Set(d.map(x => x.session))])
    return d.filter(x => alive.has(x.session)).length
  }
  const [delivery, xs] = await Promise.all([
    soft('report settings', Promise.all([getSettings(env.AB), phones()]).then(([settings, n]) => ({ settings, phones: n, keyed: Boolean(apnsKeys(env)) }))),
    soft('daily reports', listReports(env.AB)),
  ])
  return { now, tz, delivery, xs }
}

/** The state of both, in a line: and, when push is on but can't go, why and what to do. */
export function deliveryNote({ settings: s, phones, keyed }: Delivery): { text: string; tone: TextTone } {
  const mail = `Email: ${s.email ? 'đang bật' : 'đang tắt'}.`
  if (!s.push) return { text: `${mail} Thông báo trên điện thoại: đang tắt.`, tone: 'plain' }
  if (phones && keyed) return { text: `${mail} Thông báo trên điện thoại: đang bật, gửi đến ${fmt(phones)} điện thoại.`, tone: 'plain' }
  const missing = [phones ? '' : 'chưa có điện thoại nào đăng ký', keyed ? '' : 'chưa có khóa APNs'].filter(Boolean).join(' và ')
  const todo = phones ? '' : ' Mở ứng dụng AquaTome trên điện thoại và bật “Nhận thông báo báo cáo trên máy này”.'
  return { text: `${mail} Thông báo trên điện thoại: đang bật, nhưng ${missing} nên chưa gửi được.${todo}`, tone: 'bad' }
}

/** Each switch flipped, as one button: the page's form and the app's buttons make the same change. */
export const deliveryActions = (s: ReportSettings): Action[] => [
  { label: s.email ? 'Tắt email' : 'Bật email', method: 'POST', path: SETTINGS_API, body: { email: !s.email } },
  { label: s.push ? 'Tắt thông báo' : 'Bật thông báo', method: 'POST', path: SETTINGS_API, body: { push: !s.push } },
]

const WHY: Record<string, string> = {
  no_recipient: 'chưa có người nhận', no_binding: 'chưa có binding EMAIL',
  no_apns_key: 'chưa có khóa APNs', no_device: 'chưa có điện thoại nào đăng ký', bad_apns_key: 'khóa APNs không đọc được',
  all_off: 'email và thông báo đều đang tắt', sessions_unread: 'không đọc được phiên đăng nhập',
  dropped: 'đã đăng xuất hoặc không còn nhận thông báo',
}
type Part = { text: string; tone: 'good' | 'bad' | 'plain'; why?: string }
/**
 * What went out: the mail and the phones' notification, each sent or why not, and the phones dropped (not a failure). A
 * channel the owner turned off is said only when nothing went out. A report from before push says the mail alone.
 */
function parts(r: Pick<ReportMeta, 'sent' | 'why' | 'push'>): Part[] {
  const out: Part[] = []
  if (r.sent) out.push({ text: 'Đã gửi email', tone: 'good' })
  else if (r.why !== 'email_off') out.push({ text: 'Chưa gửi email', tone: 'bad', ...(r.why ? { why: r.why } : {}) })
  const p = r.push
  if (p?.sent) out.push({ text: `Đã gửi ${fmt(p.sent)} thông báo`, tone: 'good', ...(p.why ? { why: p.why } : {}) })
  else if (p && p.why !== 'push_off') out.push({ text: 'Chưa gửi thông báo', tone: 'bad', ...(p.why ? { why: p.why } : {}) })
  if (p?.dropped) out.push({ text: `Bỏ ${fmt(p.dropped)} điện thoại`, tone: 'plain', why: 'dropped' })
  return out.length ? out : [{ text: 'Không gửi', tone: 'plain', why: 'all_off' }]
}
const statusHtml = (r: Pick<ReportMeta, 'sent' | 'why' | 'push'>) => parts(r)
  .map(x => `<span class="chip${x.tone === 'plain' ? '' : ` ${x.tone}`}">${x.text}</span>${x.why ? `: ${x.why in WHY ? esc(WHY[x.why]!) : `<code>${esc(x.why)}</code>`}` : ''}`).join(' · ')
const statusText = (r: Pick<ReportMeta, 'sent' | 'why' | 'push'>) => parts(r).map(x => `${x.text}${x.why ? `: ${WHY[x.why] ?? x.why}` : ''}`).join(' · ')

/** Rows the whole width of a phone, each one tap, as the overview's. */
export function reportsPage({ now, tz, delivery, xs }: ReportsData): string {
  let how: string
  if (isFailed(delivery)) how = failedBox('cách nhận báo cáo', delivery)
  else {
    const n = deliveryNote(delivery)
    const buttons = deliveryActions(delivery.settings).map(a => Object.entries(a.body!).map(([k, v]) => `<button name="${k}" value="${v ? 1 : 0}">${a.label}</button>`).join('')).join('')
    how = `<p${n.tone === 'bad' ? ' class="failed" role="status"' : ''}>${esc(n.text)}</p><form class="inline" method="post" action="${SETTINGS_FORM}">${buttons}</form>`
  }
  const list = isFailed(xs) ? failedBox('danh sách báo cáo', xs) : xs.length
    ? `<ul class="areas">${xs.map(r => `<li><a class="area" href="${REPORT_PATH}${esc(r.id)}/"><span><span class="name">${esc(r.subject)}</span> <span class="sub">${timeTag(r.when, tz, now)} · ${statusHtml(r)} · ${fmt(r.care)} cần xử lý</span></span><span></span>${ICON.chevron}</a></li>`).join('')}</ul>`
    : `<p class="muted">${NO_REPORTS}</p>`
  return page(REPORT_PATH, REPORT_NAME, `<h1>${REPORT_NAME}</h1><p class="lede">${LEDE}</p><h2>${HOW}</h2>${how}<h2>${LIST}</h2>${list}`, now, tz)
}

/** The page as blocks, for the app: the state and its two buttons, then the reports, each opening its page. */
export function reportsSection({ now, tz, delivery, xs }: ReportsData): Section {
  const blocks: Block[] = [note(LEDE), heading(HOW)]
  if (isFailed(delivery)) blocks.push(failedNote('cách nhận báo cáo', delivery))
  else {
    const n = deliveryNote(delivery)
    blocks.push(note(n.text, n.tone), { kind: 'actions', actions: deliveryActions(delivery.settings) })
  }
  blocks.push(heading(LIST))
  if (isFailed(xs)) blocks.push(failedNote('danh sách báo cáo', xs))
  else if (!xs.length) blocks.push(note(NO_REPORTS, 'muted'))
  else blocks.push(table(['Báo cáo'], xs.map(r => [{ text: r.subject, sub: `${timeText(r.when, tz, now)} · ${statusText(r)} · ${fmt(r.care)} cần xử lý`, href: `${REPORT_PATH}${r.id}/` }])))
  return { title: REPORT_NAME, blocks }
}

/** One report as it was sent, its HTML (composed and escaped by daily/compose.ts) inside the dashboard's frame; undefined for one not kept. */
export async function reportPage(kv: KVNamespace, id: string, now: Date, tz = HOME_TZ): Promise<string | undefined> {
  const r = await getReport(kv, id)
  if (!r) return undefined
  return page(REPORT_PATH, REPORT_NAME, `<p><a href="${REPORT_PATH}">← ${REPORT_NAME}</a></p><h1>${esc(r.subject)}</h1><p>${timeTag(r.when, tz, now)} · ${statusHtml(r)}</p><div class="mail">${r.html}</div><details><summary>Bản văn bản</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.text)}</pre></details>`, now, tz)
}
