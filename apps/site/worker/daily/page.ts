import { esc, fmt } from '../admin/chart'
import { failedBox, ICON, isFailed, page, REPORT_NAME, REPORT_PATH, soft } from '../admin/shell'
import { HOME_TZ, timeTag } from '../admin/time'
import { getReport, listReports, type ReportMeta } from './log'

/** /_ab/bao-cao/: the daily reports kept, newest first, and each as it was sent. Vietnamese around them, as the rest of the dashboard; the report itself is in English. */

const WHY: Record<string, string> = { no_recipient: 'chưa có người nhận', no_binding: 'chưa có binding EMAIL' }
const status = (r: Pick<ReportMeta, 'sent' | 'why'>) => (r.sent
  ? '<span class="chip good">Đã gửi</span>'
  : `<span class="chip bad">Chưa gửi</span>${r.why ? ` ${r.why in WHY ? esc(WHY[r.why]!) : `<code>${esc(r.why)}</code>`}` : ''}`)

/** Rows the whole width of a phone, each one tap, as the overview's. */
export async function reportsPage(kv: KVNamespace, now: Date, tz = HOME_TZ): Promise<string> {
  const xs = await soft('daily reports', listReports(kv))
  const list = isFailed(xs) ? failedBox('danh sách báo cáo', xs) : xs.length
    ? `<ul class="areas">${xs.map(r => `<li><a class="area" href="${REPORT_PATH}${esc(r.id)}/"><span><span class="name">${esc(r.subject)}</span><span class="sub">${timeTag(r.when, tz, now)} · ${status(r)} · ${fmt(r.care)} cần xử lý</span></span><span></span>${ICON.chevron}</a></li>`).join('')}</ul>`
    : '<p class="muted">Chưa có báo cáo nào. Báo cáo đầu tiên đến lúc 7 giờ sáng (giờ Việt Nam).</p>'
  return page(REPORT_PATH, REPORT_NAME, `<h1>${REPORT_NAME}</h1><p class="lede">Mỗi sáng 7 giờ (giờ Việt Nam): việc cần xử lý, điểm nổi bật, những gì đã build và số liệu. Lưu ở đây 90 ngày.</p>${list}`, now, tz)
}

/** One report as it was sent, its HTML (composed and escaped by daily/compose.ts) inside the dashboard's frame; undefined for one not kept. */
export async function reportPage(kv: KVNamespace, id: string, now: Date, tz = HOME_TZ): Promise<string | undefined> {
  const r = await getReport(kv, id)
  if (!r) return undefined
  return page(REPORT_PATH, REPORT_NAME, `<p><a href="${REPORT_PATH}">← ${REPORT_NAME}</a></p><h1>${esc(r.subject)}</h1><p>${timeTag(r.when, tz, now)} · ${status(r)}</p><div class="mail">${r.html}</div><details><summary>Bản văn bản</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.text)}</pre></details>`, now, tz)
}
