import type { SkinStats } from './allocate'
import { SKINS, type Skin, type Weights } from './skins'

export type Snapshot = { updatedAt: string; weights: Weights; stats: Record<Skin, SkinStats> }
const NAMES: Record<Skin, string> = { mix: 'Mix (mặc định)', a: 'A · Đáy sâu', b: 'B · Sổ tay', c: 'C · Khám phá' }

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

const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d })

export function renderDashboard(snap: Snapshot | null, clickValueVnd: number): string {
  const rows = SKINS.map(s => {
    const st = snap?.stats[s] ?? { visits: 0, pages: 0, converted: 0, clicks: 0, timeSum: 0, scrolled: 0 }
    const v = st.visits || 1
    const rpm = (st.clicks * clickValueVnd * 1000) / v
    return `<tr><th>${NAMES[s]}</th><td>${fmt(st.visits)}</td><td>${fmt(st.pages / v, 2)}</td><td>${fmt(st.timeSum / v)} s</td><td>${fmt((100 * st.scrolled) / v, 1)}%</td><td>${fmt(st.clicks)}</td><td>${fmt((100 * st.converted) / v, 1)}%</td><td>${fmt(rpm)} ₫</td><td>${fmt(100 * (snap?.weights[s] ?? 0.25), 1)}%</td></tr>`
  }).join('')
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A/B · thủy·sinh</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#10241f;background:#eef1ec}table{border-collapse:collapse;background:#fff}th,td{padding:.5rem .8rem;border-bottom:1px solid #d3dad3;text-align:right}th{text-align:left}thead th{font-size:.8rem;color:#5d6d67}p{color:#5d6d67}</style></head><body>
<h1>A/B giao diện</h1><p>14 ngày gần nhất · cập nhật ${snap?.updatedAt ?? 'chưa có dữ liệu'} · doanh thu ước tính = lượt bấm affiliate × ${fmt(clickValueVnd)} ₫ (chưa có quảng cáo)</p>
<table><thead><tr><th>Giao diện</th><th>Lượt</th><th>Trang/lượt</th><th>Thời gian TB</th><th>Cuộn 90%</th><th>Bấm affiliate</th><th>Chuyển đổi</th><th>Doanh thu/1.000 lượt</th><th>Tỉ lệ phân bổ</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
}
