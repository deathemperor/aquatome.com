import { esc, fmt } from './chart'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ, timeTag } from './time'
import type { RunRecord, RunRow, Turn } from '../fishid/transcript'

/**
 * The fish-ID runs kept a year (fishid/transcript.ts), web only: a day's list, one run's turns, and the day as JSON for
 * the evals. Under the fish-ID section, outside the menu.
 */
export const RUNS_PATH = '/_ab/nhan-dien-ca/luot/'
export const runPath = (day: string, id: string) => `${RUNS_PATH}${day}/${id}/`
export const runsJsonPath = (day: string) => `${RUNS_PATH}${day}.json`
const SECTION = '/_ab/nhan-dien-ca/'

const OUTCOME: Record<string, string> = { ok: 'có kết quả', refused: 'Claude từ chối', unreadable: 'câu trả lời đọc không được', request: 'API từ chối yêu cầu', unavailable: 'API lỗi tạm thời', resting: 'mọi key đang nghỉ', error: 'lỗi máy chủ' }
const STOPPED: Record<string, string> = { answer: 'tự trả lời', calls: 'hết lượt gọi', tools: 'hết lượt công cụ', time: 'hết giờ', tokens: 'hết token', fallback: 'quay về một lần gọi', error: 'lỗi' }
const LEDE = 'Mỗi lượt nhận diện đã gọi Claude, giữ 365 ngày: Claude nghĩ gì (bản tóm tắt), tra gì trong cẩm nang, công cụ trả lời gì và người đọc nhận được gì. Không có ảnh của người đọc, địa chỉ IP hay tài khoản.'
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10)

/** A day's runs (UTC days, as they are kept), newest first. */
export function runsPage(day: string, rows: Soft<RunRow[]>, now = new Date(), tz = HOME_TZ): string {
  const today = now.toISOString().slice(0, 10)
  const days = `<p><a href="${SECTION}">← Nhận diện cá</a> · <a href="${RUNS_PATH}?ngay=${shift(day, -1)}">← ${shift(day, -1)}</a>${day < today ? ` · <a href="${RUNS_PATH}?ngay=${shift(day, 1)}">${shift(day, 1)} →</a>` : ''} · <a href="${runsJsonPath(day)}">JSON</a></p>`
  let body = `<h1>Lượt nhận diện ngày ${esc(day)}</h1><p class="lede">${LEDE}</p>${days}`
  if (isFailed(rows)) body += failedBox('lượt nhận diện', rows)
  else {
    const tr = rows.map(r => `<tr><th><a href="${runPath(r.day, r.id)}">${timeTag(r.at, tz, now)}</a></th><td class="l">${esc(OUTCOME[r.outcome] ?? r.outcome)}</td><td class="l">${r.top ? `<i class="sci">${esc(r.top)}</i>` : '—'}</td><td>${r.conf === null ? '—' : `${fmt(r.conf * 100)}%`}</td><td>${fmt(r.calls)}</td><td class="l">${esc(STOPPED[r.stopped] ?? (r.stopped || '—'))}${r.rechecked ? ' · xem lại một lần' : ''}</td><td>${esc(r.lang)}</td></tr>`).join('')
    body += `<div class="scroll"><table class="wide"><thead><tr><th>Lúc</th><th>Kết quả</th><th>Đoán nhiều nhất</th><th>Chắc</th><th>Lượt Claude</th><th>Dừng vì</th><th>Ngôn ngữ</th></tr></thead><tbody>${tr || '<tr><td colspan="7" class="none">Ngày này chưa có lượt nào được ghi.</td></tr>'}</tbody></table></div>`
  }
  return page(SECTION, `Lượt nhận diện ${day}`, body, now, tz)
}

const pre = (s: string) => `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s)}</pre>`
function turnHtml(t: Turn, n: number): string {
  const parts = [`<h3>Lượt gọi ${n}</h3>`]
  if (t.thinking) parts.push(`<details><summary>Claude nghĩ (tóm tắt)</summary>${pre(t.thinking)}</details>`)
  if (t.text) parts.push(`<p>Claude viết:</p>${pre(t.text)}`)
  for (const c of t.tools ?? []) {
    const photos = (c.photos ?? []).map(src => `<a href="${esc(src)}"><img class="thumb" src="${esc(src)}" alt="" width="96" loading="lazy"></a>`).join(' ')
    parts.push(`<p><code>${esc(c.name)}</code> ${esc(JSON.stringify(c.input))}${c.error ? ' <span class="failed">lỗi</span>' : ''}</p>${c.result === undefined ? '' : `<details><summary>Công cụ trả lời</summary>${pre(c.result)}</details>`}${photos ? `<p>${photos}</p>` : ''}`)
  }
  if (t.sent) parts.push(`<p>Gửi lại cho Claude:</p>${pre(t.sent)}`)
  return `<section>${parts.join('')}</section>`
}

/** One run: what it cost and how it ended, the reader's answer, then each call to Claude in order. */
export function runPage(day: string, r: RunRecord, now = new Date(), tz = HOME_TZ): string {
  const a = r.agent
  const facts = [
    `${timeTag(r.at, tz, now)}`, esc(OUTCOME[r.outcome] ?? r.outcome), esc(r.model), esc(r.lang), `${fmt(r.ms)} ms`, `$${r.cost.toFixed(4)}`, `${fmt(r.tokens.input)} token vào · ${fmt(r.tokens.output)} ra`,
    a ? `agent: ${fmt(a.calls)} lượt Claude · ${fmt(a.tools)} công cụ · ${fmt(a.photos)} ảnh mẫu · ${esc(STOPPED[a.stopped] ?? a.stopped)}${a.rechecked ? ' · xem lại một lần' : ''}` : 'một lần gọi',
  ].join(' · ')
  const results = (r.results ?? []).map(g => `<li><i class="sci">${esc(g.scientificName)}</i>${g.commonName ? ` (${esc(g.commonName)})` : ''} ${fmt(g.confidence * 100)}%${g.page ? ` · <code>${esc(g.page)}</code>` : ''}<br><span class="muted">${esc(g.reason)}</span></li>`).join('')
  const body = `<p><a href="${RUNS_PATH}?ngay=${esc(day)}">← Lượt ngày ${esc(day)}</a></p><h1>Lượt nhận diện</h1><p>${facts}</p>`
    + `<h2>Người đọc nhận được</h2>${r.verdict ? `<p>${esc(r.verdict)}</p>` : ''}${results ? `<ol>${results}</ol>` : '<p class="muted">Không có kết quả.</p>'}`
    + `<h2>Các lượt gọi Claude</h2>${r.turns.map((t, i) => turnHtml(t, i + 1)).join('') || '<p class="muted">Không có.</p>'}`
  return page(SECTION, 'Lượt nhận diện', body, now, tz)
}
