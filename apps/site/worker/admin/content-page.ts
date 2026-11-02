import type { ContentReads, ContentStats, EntityKind, GapKey, KindClicks, PageKind, Snapshot, Talk, Totals } from './content'
import { dayChart, esc, fmt, lastDays, rankTable, tiles } from './chart'
import { failedBox, isFailed, page, type Soft } from './shell'

/** The dashboard's Nội dung page: what the site holds (the build's content.json), how it grows, what the engine is doing, what's missing, and how readers use it. */

export const KIND: Record<PageKind, string> = {
  fish: 'Cá', breed: 'Giống cá', plant: 'Cây thủy sinh', guide: 'Bài viết', videoGuide: 'Bài từ video', series: 'Loạt video', glossary: 'Thuật ngữ',
  equipment: 'Thiết bị', place: 'Địa điểm', product: 'Sản phẩm', gallery: 'Trang ảnh', taxon: 'Phân loại', group: 'Nhóm', tool: 'Công cụ', list: 'Danh sách', other: 'Trang khác',
}
const ENTITY: EntityKind[] = ['fish', 'plant', 'breed', 'guide', 'videoGuide', 'series', 'glossary', 'equipment', 'place', 'product']
/** What the home page counts as the handbook's items: the pages a reader comes for. */
export const MAIN: EntityKind[] = ['fish', 'plant', 'breed', 'guide', 'videoGuide']
const GAP: Record<GapKey, string> = {
  noPhoto: 'Chưa có ảnh', noViName: 'Tên tiếng Việt còn là tên khoa học', noSummary: 'Chưa có tóm tắt nhanh', noKeyFacts: 'Thiếu nhiệt độ, pH hoặc kích thước',
  thin: 'Trang mỏng, ẩn khỏi tìm kiếm', oldVi: 'Tiếng Việt chưa viết lại', noId: 'Chưa có tiếng Indonesia', noTh: 'Chưa có tiếng Thái',
}
const FACT: Record<string, string> = { tempC: 'nhiệt độ', ph: 'pH', sizeCm: 'kích thước' }

/** Items (Vietnamese) of the main kinds in a day's totals. */
export const items = (t: Totals) => MAIN.reduce((s, k) => s + (t.kinds[k]?.[0] ?? 0), 0)
/** A Vietnam time for a build or a run: 03/11 09:40. */
const vn = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const pct = (a: number, b: number) => (b ? `${fmt((100 * a) / b)}%` : '—')

/**
 * Each of `days`, the day's totals less the last kept before it: what the day added. A day without a snapshot adds 0, and
 * the next one kept carries the gap. `pick` reads the figure.
 */
export function perDay(snaps: Snapshot[], days: string[], pick: (t: Totals) => number): number[] {
  const at = new Map(snaps.map(s => [s.day, s.totals]))
  return days.map(d => {
    const t = at.get(d)
    const before = snaps.filter(s => s.day < d).at(-1)
    return t && before ? pick(t) - pick(before.totals) : 0
  })
}

export type ContentPage = { now: Date; stats: Soft<ContentStats>; reads: Soft<ContentReads>; talk: Soft<Talk>; clicks: Soft<KindClicks>; snapshots: Soft<Snapshot[]> }

const JUMP = [['tong', 'Tổng'], ['tang', 'Tăng thêm'], ['engine', 'Engine'], ['thieu', 'Còn thiếu'], ['anh', 'Ảnh'], ['doc', 'Người đọc'], ['binh-luan', 'Bình luận'], ['affiliate', 'Affiliate'], ['nguon', 'Nguồn']] as const
const link = (path: string, title: string) => `<a href="${esc(path)}">${esc(title)}</a>`

export function contentPage(c: ContentPage): string {
  let body = `<h1>Nội dung</h1>`
  if (isFailed(c.stats)) return page('/_ab/noi-dung/', 'Nội dung', `${body}${failedBox('số liệu nội dung (content.json)', c.stats)}`, c.now)
  const s = c.stats
  body += `<p class="lede">Từ bản build lúc ${esc(vn(s.builtAt))} (giờ Việt Nam)${s.publicBuild ? '' : ', không phải bản công khai'}. Engine cập nhật nội dung 3 giờ một lần; mỗi lần đăng, số liệu này đổi theo.</p>
<nav class="jump" aria-label="Các phần của trang"><ul>${JUMP.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ul></nav>`
  body += totalsHtml(s) + growthHtml(c.now, s, c.snapshots) + engineHtml(c.now, s) + gapsHtml(s) + photosHtml(s) + readsHtml(c.reads) + talkHtml(c.talk) + clicksHtml(c.clicks) + sourcesHtml(s)
  return page('/_ab/noi-dung/', 'Nội dung', body, c.now)
}

function totalsHtml(s: ContentStats): string {
  const main = MAIN.reduce((n, k) => n + (s.inventory[k]?.total ?? 0), 0)
  const built = s.built ? s.built.total.reduce((a, b) => a + b, 0) : null
  const rows = ENTITY.filter(k => s.inventory[k]?.total).map(k => {
    const inv = s.inventory[k]!
    return `<tr><th>${esc(KIND[k])}</th><td>${fmt(inv.total)}</td><td>${fmt(inv.id)}</td><td>${fmt(inv.th)}</td></tr>`
  }).join('')
  return `<section aria-labelledby="tong"><h2 id="tong">Tổng</h2>${tiles([
    { label: 'Bài (cá, cây, giống, bài viết)', value: fmt(main) },
    { label: 'Trang đã build', value: built === null ? '—' : fmt(built), sub: s.built ? `tiếng Việt ${fmt(s.built.total[0])} · Indonesia ${fmt(s.built.total[1])} · Thái ${fmt(s.built.total[2])}` : undefined },
    { label: 'Ảnh trên trang', value: fmt(s.photos.pages), sub: `${fmt(s.photos.gallery.photos)} ảnh ở ${fmt(s.photos.gallery.pages)} trang ảnh` },
  ])}
<div class="scroll"><table><thead><tr><th>Loại</th><th>Bài</th><th>Có tiếng Indonesia</th><th>Có tiếng Thái</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
}

function growthHtml(now: Date, s: ContentStats, snaps: Soft<Snapshot[]>): string {
  let out = '<section aria-labelledby="tang"><h2 id="tang">Tăng thêm</h2>'
  if (isFailed(snaps)) return `${out}${failedBox('số liệu từng ngày', snaps)}</section>`
  if (snaps.length < 2) return `${out}<p class="muted">Mỗi đêm lưu tổng số một lần; cần ít nhất hai ngày để thấy tăng thêm bao nhiêu.</p></section>`
  const days = lastDays(now, 30)
  const v = (k: EntityKind) => (t: Totals) => t.kinds[k]?.[0] ?? 0
  out += `<div class="charts">${dayChart({
    id: 'n-added', title: 'Bài mới mỗi ngày (tiếng Việt)', days, kind: 'columns', partialLast: true,
    series: [{ label: 'Cá', values: perDay(snaps, days, v('fish')) }, { label: 'Cây', values: perDay(snaps, days, v('plant')) }, { label: 'Bài viết, bài từ video', values: perDay(snaps, days, t => v('guide')(t) + v('videoGuide')(t)) }],
    empty: 'Chưa có bài mới nào trong những ngày đã lưu.',
  })}`
  // What each source added over the last 7 days kept (or since the first day kept).
  const last = snaps.at(-1)!
  const weekAgo = new Date(Date.parse(`${last.day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
  const from = snaps.filter(x => x.day <= weekAgo).at(-1) ?? snaps[0]!
  const bySource = Object.entries(last.totals.sources).map(([id, n]) => ({ id, n: n - (from.totals.sources[id] ?? 0) })).filter(x => x.n).sort((a, b) => b.n - a.n)
  out += `<figure class="chart" aria-labelledby="n-src"><figcaption><h3 id="n-src">Theo nguồn, từ ${esc(from.day.slice(8, 10))}/${esc(from.day.slice(5, 7))}</h3></figcaption>${rankTable(bySource.map(x => ({ label: esc(s.sources[x.id]?.name ?? x.id), value: x.n })), ['Nguồn', 'Bài thêm'], n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`)}</figure></div>
<p class="note">Lưu lúc 3 giờ 17 sáng giờ Việt Nam mỗi ngày. Một ngày không lưu được thì ngày lưu sau nó gộp cả phần đó.</p></section>`
  return out
}

function engineHtml(now: Date, s: ContentStats): string {
  let out = '<section aria-labelledby="engine"><h2 id="engine">Engine</h2>'
  const e = s.engine
  if (!e) return `${out}<p class="muted">Bản build này không có engine-state.</p></section>`
  if (e.needsHuman.length) out += `<div class="failed" role="status">Cần bạn qua kiểm tra trình duyệt (Cloudflare, Turnstile) trong hồ sơ Chrome của engine: ${e.needsHuman.map(n => `<b>${esc(n.source)}</b> từ ${esc(vn(n.since))}`).join(', ')}.</div>`
  const v = e.videos
  const written7 = v.perDay.slice(-7).reduce((a, x) => a + x.n, 0)
  out += `<h3 class="sub-h">Bài từ video YouTube</h3>${tiles([
    { label: 'Video chờ viết', value: fmt(v.waiting), sub: `trong ${fmt(v.listed)} video đã xếp hàng` },
    { label: 'Đã viết', value: fmt(v.written), sub: `${fmt(written7)} bài trong 7 ngày gần nhất` },
    { label: 'Bỏ qua', value: fmt(v.skipped), sub: 'không phải bài hướng dẫn, quá ngắn, chỉ cho hội viên…' },
    { label: 'Lỗi 3 lần', value: fmt(v.failed) },
  ])}
<div class="charts">${dayChart({ id: 'n-videos', title: 'Bài từ video viết mỗi ngày · 14 ngày', days: v.perDay.map(x => x.day), series: [{ label: 'Bài', values: v.perDay.map(x => x.n) }], kind: 'columns', partialLast: v.perDay.at(-1)?.day === lastDays(now, 1)[0], empty: 'Chưa viết bài nào trong 14 ngày.' })}
<figure class="chart" aria-labelledby="n-rw"><figcaption><h3 id="n-rw">Viết lại tiếng Việt cũ</h3></figcaption>${tiles([{ label: 'Đã viết lại', value: fmt(e.rewrite.done), sub: `${pct(e.rewrite.done, e.rewrite.done + e.rewrite.waiting + e.rewrite.failed)} số trang cần viết lại` }, { label: 'Còn chờ', value: fmt(e.rewrite.waiting), sub: `${fmt(e.rewrite.failed)} lỗi` }])}</figure></div>`
  const rows = e.sources.slice().sort((a, b) => b.waiting - a.waiting || b.found - a.found).map(r => `<tr><th>${esc(r.name)}</th><td>${fmt(r.found)}${r.discovered ? ` <span class="muted">/ ${fmt(r.discovered)}</span>` : ''}</td><td>${fmt(r.done)}</td><td>${fmt(r.skipped)}</td><td>${fmt(r.waiting)}</td><td>${fmt(r.failed)}</td><td>${fmt(r.blocked)}</td><td>${r.lastAt ? esc(vn(r.lastAt)) : '—'}</td></tr>`).join('')
  out += `<h3 class="sub-h">Nguồn trang</h3><div class="scroll"><table class="wide"><thead><tr><th>Nguồn</th><th>Địa chỉ đã gặp</th><th>Thành trang</th><th>Bỏ qua</th><th>Còn chờ</th><th>Lỗi 3 lần</th><th>Bị chặn</th><th>Đổi gần nhất</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="none">Chưa có.</td></tr>'}</tbody></table></div>
<p class="note">Thành trang: viết thành trang, hoặc gộp vào một trang có sẵn. Bỏ qua: trang danh mục, trùng, không phải cá. Lỗi 3 lần: thôi thử cho tới khi trang nguồn đổi. Giờ Việt Nam.${e.lastRun ? ` Lần chạy gần nhất trên máy build: ${esc(vn(e.lastRun.startedAt))}–${esc(vn(e.lastRun.finishedAt).slice(6))}, đổi ${fmt(e.lastRun.changed)} mục, ${fmt(e.lastRun.errors)} lỗi.` : ''}</p></section>`
  return out
}

function gapsHtml(s: ContentStats): string {
  const kinds = (Object.keys(s.gaps) as EntityKind[]).filter(k => Object.keys(s.gaps[k] ?? {}).length)
  const block = (k: EntityKind) => {
    const total = s.inventory[k]?.total ?? 0
    const rows = (Object.entries(s.gaps[k]!) as [GapKey, NonNullable<ContentStats['gaps'][EntityKind]>[GapKey]][]).filter(([, g]) => g && g.n).map(([key, g]) => {
      const by = g!.by ? ` <span class="muted">(${Object.entries(g!.by).map(([f, n]) => `${FACT[f] ?? f} ${fmt(n)}`).join(' · ')})</span>` : ''
      const list = g!.top.length ? `<details><summary>${g!.n > g!.top.length ? `${fmt(g!.top.length)} trang đầu` : 'Xem các trang'}</summary><ol class="pages">${g!.top.map(([path, name]) => `<li>${link(path, name)}</li>`).join('')}</ol></details>` : ''
      return `<li><p><b>${fmt(g!.n)}</b> ${esc(GAP[key] ?? key)}${by} <span class="muted">· ${pct(g!.n, total)}</span></p>${list}</li>`
    }).join('')
    return rows ? `<section class="gap"><h3 class="sub-h">${esc(KIND[k])} <span class="muted">· ${fmt(total)} bài</span></h3><ul class="gaps">${rows}</ul></section>` : ''
  }
  return `<section aria-labelledby="thieu"><h2 id="thieu">Còn thiếu</h2><p class="note">Đếm trên những trang đang có. Danh sách xếp loài phổ biến và loài cơ bản lên trước.</p><div class="split">${kinds.map(block).join('')}</div></section>`
}

function photosHtml(s: ContentStats): string {
  const p = s.photos
  const cov = (['fish', 'plant', 'breed'] as const).filter(k => p.covered[k]).map(k => ({ label: `${KIND[k]} có ảnh`, value: pct(p.covered[k]!.with, p.covered[k]!.of), sub: `${fmt(p.covered[k]!.with)} trên ${fmt(p.covered[k]!.of)}` }))
  const rank = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: esc(label), value }))
  return `<section aria-labelledby="anh"><h2 id="anh">Ảnh</h2>${tiles([...cov, { label: 'Chờ sao chép về máy chủ ảnh', value: fmt(p.waitingMirror), sub: 'chưa hiện ở bản công khai' }])}
<div class="split"><section><h3 class="sub-h">Theo giấy phép</h3>${rankTable(rank(p.byLicence), ['Giấy phép', 'Ảnh'])}</section><section><h3 class="sub-h">Theo nơi lấy</h3>${rankTable(rank(p.byOrigin), ['Nơi lấy', 'Ảnh'])}</section></div></section>`
}

function readsHtml(r: Soft<ContentReads>): string {
  const out = '<section aria-labelledby="doc"><h2 id="doc">Người đọc theo loại trang</h2>'
  if (isFailed(r)) return `${out}${failedBox('người đọc theo trang', r)}</section>`
  const rows = r.byKind.map(k => `<tr><th>${esc(KIND[k.kind])}</th><td>${fmt(k.pages)}</td><td>${fmt(k.read)} <span class="muted">${pct(k.read, k.pages)}</span></td><td>${fmt(k.readers)}</td><td>${fmt(k.views)}</td></tr>`).join('')
  const unread = Object.entries(r.unread.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${KIND[k as PageKind]} ${fmt(n)}`).join(' · ')
  return `${out}<p class="lede">${r.days} ngày gần nhất · người đọc: phiên cuộn ≥ 50% hoặc ở lại ≥ 30 giây, như trang Người đọc.</p>
<div class="scroll"><table><thead><tr><th>Loại</th><th>Trang</th><th>Có người đọc</th><th>Người đọc</th><th>Lượt xem</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="none">Chưa có.</td></tr>'}</tbody></table></div>
<div class="split"><section><h3 class="sub-h">Trang nhiều người đọc nhất</h3>${rankTable(r.top.map(x => ({ label: link(x.path, x.title), value: x.readers, cells: [fmt(x.views)] })), ['Trang', 'Người đọc', 'Lượt xem'])}</section>
<section><h3 class="sub-h">${fmt(r.unread.n)} trang chưa ai đọc trong ${r.days} ngày</h3><p class="note">${esc(unread)}</p>${r.unread.pages.length ? `<details><summary>${fmt(r.unread.pages.length)} trang đầu</summary><ol class="pages">${r.unread.pages.map(p => `<li>${link(p.path, p.title)}</li>`).join('')}</ol></details>` : ''}
${r.elsewhere.views ? `<p class="note">${fmt(r.elsewhere.views)} lượt xem ở ${fmt(r.elsewhere.paths)} địa chỉ bản build này không có (địa chỉ cũ, trang đã gỡ, gõ sai).</p>` : ''}</section></div></section>`
}

function talkHtml(t: Soft<Talk>): string {
  const out = '<section aria-labelledby="binh-luan"><h2 id="binh-luan">Bình luận và ảnh bạn đọc theo trang</h2>'
  if (isFailed(t)) return `${out}${failedBox('bình luận theo trang', t)}</section>`
  return `${out}<p class="lede">Đang hiện: ${fmt(t.comments)} bình luận, ${fmt(t.photos)} ảnh bạn đọc${t.elsewhere.comments || t.elsewhere.photos ? ` · ${fmt(t.elsewhere.comments)} bình luận và ${fmt(t.elsewhere.photos)} ảnh ở mục không còn trang` : ''}.</p>
<div class="split"><section><h3 class="sub-h">Theo loại</h3>${rankTable(t.byKind.map(k => ({ label: esc(KIND[k.kind]), value: k.comments, cells: [fmt(k.photos)] })), ['Loại', 'Bình luận', 'Ảnh'])}</section>
<section><h3 class="sub-h">Trang nhiều nhất</h3>${rankTable(t.top.map(x => ({ label: link(x.path, x.title), value: x.comments, cells: [fmt(x.photos)] })), ['Trang', 'Bình luận', 'Ảnh'])}</section></div></section>`
}

function clicksHtml(k: Soft<KindClicks>): string {
  const out = '<section aria-labelledby="affiliate"><h2 id="affiliate">Affiliate theo loại trang</h2>'
  if (isFailed(k)) return `${out}${failedBox('lượt bấm theo trang', k)}</section>`
  return `${out}<p class="lede">${fmt(k.clicks)} lượt bấm sang sàn trong ${k.days} ngày (từ ${esc(k.since.slice(8, 10))}/${esc(k.since.slice(5, 7))}, giờ Việt Nam)${k.elsewhere ? ` · ${fmt(k.elsewhere)} từ liên kết không gắn trang` : ''}.</p>
<div class="split"><section><h3 class="sub-h">Theo loại</h3>${rankTable(k.byKind.map(x => ({ label: esc(KIND[x.kind]), value: x.clicks })), ['Loại', 'Lượt bấm'])}</section>
<section><h3 class="sub-h">Trang dẫn nhiều nhất</h3>${rankTable(k.top.map(x => ({ label: link(x.path, x.title), value: x.clicks })), ['Trang', 'Lượt bấm'])}</section></div></section>`
}

function sourcesHtml(s: ContentStats): string {
  const rows = Object.values(s.sources).filter(x => x.fish + x.plant + x.guide).sort((a, b) => b.fish + b.plant + b.guide - (a.fish + a.plant + a.guide))
    .map(x => `<tr><th>${esc(x.name)}</th><td>${fmt(x.fish)}</td><td>${fmt(x.plant)}</td><td>${fmt(x.guide)}</td></tr>`).join('')
  return `<section aria-labelledby="nguon"><h2 id="nguon">Nguồn nội dung</h2><p class="note">Bài có chữ từ mỗi nguồn, như bản build cho thấy; một bài hai nguồn tính cho cả hai.</p>
<div class="scroll"><table><thead><tr><th>Nguồn</th><th>Cá</th><th>Cây</th><th>Bài viết</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="none">Chưa có.</td></tr>'}</tbody></table></div></section>`
}
