import type { Hidden } from './hidden'
import type { Readers } from './readers'

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** Token from ?token= or the ab_token cookie. Returns the cookie to set on first valid visit. */
export function authorise(req: Request, secret: string | undefined): { ok: boolean; setCookie?: string } {
  if (!secret) return { ok: false }
  const q = new URL(req.url).searchParams.get('token')
  const c = req.headers.get('cookie')?.match(/(?:^|;\s*)ab_token=([^;]+)/)?.[1]
  if (q && safeEqual(q, secret)) return { ok: true, setCookie: `ab_token=${q}; Path=/_ab; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` }
  return { ok: !!c && safeEqual(c, secret) }
}

/** /_ab/ without a valid token: ask for it (POST /_ab/login). */
export function renderLogin(failed = false): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quản trị · AquaTome</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#10241f;background:#eef1ec}input{font:inherit;padding:.4rem .6rem}button{font:inherit;padding:.4rem .9rem}.err{color:#b3261e}</style></head><body>
<h1>Quản trị AquaTome</h1>${failed ? '<p class="err">Mã quản trị không đúng.</p>' : ''}
<form method="post" action="/_ab/login"><label>Mã quản trị <input type="password" name="token" required autocomplete="current-password" autofocus></label> <button>Vào</button></form>
<p><a href="/vi/">← Về trang chủ</a></p></body></html>`
}

const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d })

export type AffSummary = { byNetwork: { network: string; category: string; n: number }[]; top: { entity_ref: string; n: number }[]; status: { status: string; n: number }[]; lastCheck: string | null }

/** Last 14 days of affiliate clicks + catalog health, straight from D1. */
export async function affSummary(db: D1Database, now: Date): Promise<AffSummary> {
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
  const [byNetwork, top, status, last] = await Promise.all([
    db.prepare('SELECT network, category, SUM(n) AS n FROM clicks_daily WHERE date >= ? GROUP BY network, category ORDER BY n DESC LIMIT 30').bind(since).all<AffSummary['byNetwork'][number]>(),
    db.prepare("SELECT entity_ref, SUM(n) AS n FROM clicks_daily WHERE date >= ? AND entity_ref != '' GROUP BY entity_ref ORDER BY n DESC LIMIT 10").bind(since).all<AffSummary['top'][number]>(),
    db.prepare('SELECT status, COUNT(*) AS n FROM products GROUP BY status').all<AffSummary['status'][number]>(),
    db.prepare('SELECT MAX(at) AS at FROM checks').first<{ at: string | null }>(),
  ])
  return { byNetwork: byNetwork.results, top: top.results, status: status.results, lastCheck: last?.at ?? null }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function renderDashboard(aff?: AffSummary, hidden: Hidden = {}): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quản trị · AquaTome</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#10241f;background:#eef1ec}table{border-collapse:collapse;background:#fff}th,td{padding:.5rem .8rem;border-bottom:1px solid #d3dad3;text-align:right}th{text-align:left}thead th{font-size:.8rem;color:#5d6d67}p{color:#5d6d67}</style></head><body>
<h1>Quản trị AquaTome</h1><p><a href="/_ab/doc-gia/">Người đọc thật →</a></p>${aff ? affHtml(aff) : '<h2>Affiliate</h2><p>Chưa cấu hình D1.</p>'}${hiddenHtml(hidden)}</body></html>`
}

function affHtml(a: AffSummary): string {
  const rows = (xs: string[][]) => xs.map(r => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('') || '<tr><td colspan="3">—</td></tr>'
  return `<h2>Affiliate · 14 ngày</h2>
<table><thead><tr><th>Sàn</th><th>Nhóm</th><th>Lượt bấm</th></tr></thead><tbody>${rows(a.byNetwork.map(r => [r.network, r.category, fmt(r.n)]))}</tbody></table>
<h3>Trang dẫn nhiều nhất</h3><table><tbody>${rows(a.top.map(r => [r.entity_ref, fmt(r.n)]))}</tbody></table>
<p>Sản phẩm: ${a.status.map(s => `${esc(s.status)} ${fmt(s.n)}`).join(' · ') || 'chưa có (đang dùng liên kết tìm kiếm)'} · kiểm tra gần nhất: ${a.lastCheck ?? 'chưa chạy'}</p>`
}

function hiddenHtml(h: Hidden): string {
  const rows = Object.entries(h).sort(([, a], [, b]) => b.at.localeCompare(a.at)).map(([path, v]) =>
    `<tr><th><a href="${esc(path)}">${esc(path)}</a></th><td>${esc(v.note ?? '')}</td><td>${esc(v.at.slice(0, 16).replace('T', ' '))}</td><td><form method="post" action="/_ab/hidden"><input type="hidden" name="url" value="${esc(path)}"><button name="action" value="unhide">Hiện lại</button></form></td></tr>`).join('')
  return `<h2 id="an-trang">Ẩn trang</h2>
<p>Trang bị ẩn trả về 410 (đã gỡ) trong khoảng 1 phút, kể cả bản Markdown; lần build sau (≤6 giờ) nó biến khỏi danh sách, sitemap và tìm kiếm. Hiện lại: nếu đã qua một lần build, trang quay lại ở lần build tiếp theo.</p>
<form method="post" action="/_ab/hidden"><input name="url" required size="60" placeholder="https://aquatome.com/vi/ca/..."> <input name="note" size="30" placeholder="Lý do (tuỳ chọn)"> <button name="action" value="hide">Ẩn</button></form>
<table><thead><tr><th>Trang</th><th>Lý do</th><th>Lúc (UTC)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa ẩn trang nào.</td></tr>'}</tbody></table>`
}

/** /_ab/doc-gia/: the real-readers page (our own beacon, see readers.ts). */
export function renderReaders(r: Readers | undefined): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Người đọc · AquaTome</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#10241f;background:#eef1ec}table{border-collapse:collapse;background:#fff}th,td{padding:.5rem .8rem;border-bottom:1px solid #d3dad3;text-align:right}th{text-align:left}thead th{font-size:.8rem;color:#5d6d67}p{color:#5d6d67}</style></head><body>
<p><a href="/_ab/">← Quản trị</a></p>${r ? readersHtml(r) : '<h1>Người đọc thật</h1><p>Chưa đọc được dữ liệu (Analytics Engine).</p>'}</body></html>`
}

function readersHtml(r: Readers): string {
  const rows = (xs: string[][]) => xs.map(x => `<tr>${x.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('') || '<tr><td colspan="3">—</td></tr>'
  return `<h1>Người đọc thật</h1>
<p>${r.days} ngày gần nhất · đếm từ trình duyệt chạy JavaScript của trang (bỏ bot đã biết và lượt của chủ trang) · <b>người đọc</b> = phiên cuộn ≥ 50% trang hoặc ở lại ≥ 30 giây.</p>
<table><thead><tr><th>Phiên</th><th>Người đọc</th><th>Tỉ lệ</th></tr></thead><tbody><tr><td>${fmt(r.sessions)}</td><td>${fmt(r.readers)}</td><td>${fmt(r.sessions ? (100 * r.readers) / r.sessions : 0, 1)}%</td></tr></tbody></table>
<h3>Theo ngày</h3><table><thead><tr><th>Ngày</th><th>Phiên</th><th>Người đọc</th></tr></thead><tbody>${rows(r.daily.map(d => [d.day, fmt(d.sessions), fmt(d.readers)]))}</tbody></table>
<h3>Nguồn truy cập</h3><table><thead><tr><th>Nguồn</th><th>Phiên</th><th>Người đọc</th></tr></thead><tbody>${rows(r.sources.map(x => [x.source, fmt(x.sessions), fmt(x.readers)]))}</tbody></table>
<h3>Trang người đọc xem nhiều nhất</h3><table><tbody>${rows(r.pages.map(x => [x.path, fmt(x.views)]))}</tbody></table>
<h3>Quốc gia (người đọc)</h3><table><tbody>${rows(r.countries.map(x => [x.cc, fmt(x.readers)]))}</tbody></table>`
}
