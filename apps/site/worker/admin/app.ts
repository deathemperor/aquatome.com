import { aeSql, num } from './ae'
import { esc, fmt, rankTable } from './chart'
import { pageLink } from './pages'
import { failedBox, isFailed, page, type Soft } from './shell'

/**
 * The iOS app's telemetry (worker/telemetry, dataset aquatome_app) for /_ab/ung-dung/: six bounded queries over 30 days,
 * side by side. Our own copies (test builds) are left out unless asked for (?test=1, then only they). Counts go through
 * _sample_interval; launch time and memory percentiles are worked out here from the newest reports, weighted the same way.
 */
type N = number | string
export type ViewRow = { p: string; s: string; n: N }
export type ActionRow = { act: string; ver: string; n: N; ok: N }
export type ErrorRow = { act: string; why: string; n: N }
export type ShopRow = { shop: string; p: string; n: N }
export type HealthRow = { ver: string; reports: N; crashes: N; hangs: N; exits: N }
export type PerfRow = { ver: string; launch: N; mem: N; w: N }
export type AppRows = { views: ViewRow[]; actions: ActionRow[]; errors: ErrorRow[]; shops: ShopRow[]; health: HealthRow[]; perf: PerfRow[] }

const PERF_ROWS = 2000
export function appSql(test: boolean): Record<keyof AppRows, string> {
  const where = (type: string) => `WHERE ${type} AND blob14 = '${test ? '1' : ''}' AND timestamp > NOW() - INTERVAL '30' DAY`
  return {
    views: `SELECT blob2 AS p, blob3 AS s, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'view'")} GROUP BY p, s ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    actions: `SELECT blob6 AS act, blob8 AS ver, SUM(_sample_interval) AS n, SUM(_sample_interval * double1) AS ok FROM aquatome_app ${where("blob1 = 'action'")} GROUP BY act, ver ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    errors: `SELECT blob6 AS act, blob7 AS why, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'action' AND double1 = 0")} GROUP BY act, why ORDER BY n DESC LIMIT 30 FORMAT JSON`,
    shops: `SELECT blob4 AS shop, blob2 AS p, SUM(_sample_interval) AS n FROM aquatome_app ${where("blob1 = 'aff'")} GROUP BY shop, p ORDER BY n DESC LIMIT 200 FORMAT JSON`,
    health: `SELECT blob8 AS ver, SUM(IF(blob1 = 'metric', _sample_interval, 0)) AS reports, SUM(_sample_interval * double3) AS crashes, SUM(_sample_interval * double4) AS hangs, SUM(_sample_interval * double8) AS exits FROM aquatome_app ${where("(blob1 = 'metric' OR blob1 = 'diagnostic')")} GROUP BY ver FORMAT JSON`,
    perf: `SELECT blob8 AS ver, double5 AS launch, double7 AS mem, _sample_interval AS w FROM aquatome_app ${where("blob1 = 'metric'")} ORDER BY timestamp DESC LIMIT ${PERF_ROWS} FORMAT JSON`,
  }
}

type Pct = { p50: number; p90: number; n: number }
export type Version = { version: string; reports: number; crashes: number; hangs: number; exits: number; launch?: Pct; memory?: Pct }
export type AppStats = {
  test: boolean
  pages: { path: string; views: number }[]
  screens: { screen: string; views: number }[]
  actions: { name: string; version: string; n: number; ok: number }[]
  errors: { name: string; kind: string; n: number }[]
  shops: { shop: string; taps: number }[]
  shopPages: { path: string; taps: number }[]
  versions: Version[]
}

/** The weighted value at `q` of the values. */
function quantile(xs: { v: number; w: number }[], q: number): number {
  const sorted = [...xs].sort((a, b) => a.v - b.v)
  const total = sorted.reduce((s, x) => s + x.w, 0)
  let seen = 0
  for (const x of sorted) if ((seen += x.w) >= q * total) return x.v
  return sorted.at(-1)?.v ?? 0
}
const pct = (xs: { v: number; w: number }[]): Pct | undefined => (xs.length ? { p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), n: xs.length } : undefined)
const tally = <K extends string>(rows: { k: K; n: number }[]) => {
  const m = new Map<K, number>()
  for (const r of rows) m.set(r.k, (m.get(r.k) ?? 0) + r.n)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
/** Newest build first: "1.0 (115)" before "1.0 (114)". */
const build = (v: string) => Number(/\((\d+)\)$/.exec(v)?.[1] ?? -1)

export function summariseApp(r: AppRows, test: boolean): AppStats {
  const views = r.views.map(x => ({ p: x.p, s: x.s, n: num(x.n) }))
  const vers = new Map<string, Version>()
  const ver = (v: string) => vers.get(v) ?? vers.set(v, { version: v, reports: 0, crashes: 0, hangs: 0, exits: 0 }).get(v)!
  for (const h of r.health) Object.assign(ver(h.ver), { reports: num(h.reports), crashes: num(h.crashes), hangs: num(h.hangs), exits: num(h.exits) })
  const perf = new Map<string, PerfRow[]>()
  for (const p of r.perf) perf.set(p.ver, [...(perf.get(p.ver) ?? []), p])
  for (const [v, rows] of perf) {
    const of = (k: 'launch' | 'mem') => rows.filter(x => num(x[k]) > 0).map(x => ({ v: num(x[k]), w: num(x.w) || 1 }))
    Object.assign(ver(v), { launch: pct(of('launch')), memory: pct(of('mem')) })
  }
  return {
    test,
    pages: tally(views.filter(x => x.p).map(x => ({ k: x.p, n: x.n }))).slice(0, 20).map(([path, n]) => ({ path, views: n })),
    screens: tally(views.filter(x => x.s).map(x => ({ k: x.s, n: x.n }))).slice(0, 20).map(([screen, n]) => ({ screen, views: n })),
    actions: r.actions.map(a => ({ name: a.act, version: a.ver, n: num(a.n), ok: num(a.ok) }))
      .sort((a, b) => a.name.localeCompare(b.name) || build(b.version) - build(a.version)),
    errors: r.errors.map(e => ({ name: e.act, kind: e.why, n: num(e.n) })),
    shops: tally(r.shops.map(x => ({ k: x.shop, n: num(x.n) }))).map(([shop, n]) => ({ shop, taps: n })),
    shopPages: tally(r.shops.map(x => ({ k: x.p, n: num(x.n) }))).slice(0, 15).map(([path, n]) => ({ path, taps: n })),
    versions: [...vers.values()].sort((a, b) => build(b.version) - build(a.version) || b.version.localeCompare(a.version)),
  }
}

/** A dataset nothing has written to yet may not exist: that is no data, not a failure. */
const NO_TABLE = /unknown table|unknown dataset|does not exist|UNKNOWN_TABLE/i
export async function queryApp(accountId: string, token: string, test: boolean): Promise<AppStats> {
  const sql = appSql(test)
  const run = <T>(q: string) => aeSql<T>(accountId, token, q).catch((e: unknown) => { if (NO_TABLE.test(String(e))) return [] as T[]; throw e })
  const [views, actions, errors, shops, health, perf] = await Promise.all([
    run<ViewRow>(sql.views), run<ActionRow>(sql.actions), run<ErrorRow>(sql.errors), run<ShopRow>(sql.shops), run<HealthRow>(sql.health), run<PerfRow>(sql.perf),
  ])
  return summariseApp({ views, actions, errors, shops, health, perf }, test)
}

// ——— The page ———

export const ACTION_NAME: Record<string, string> = {
  'light.connect': 'Kết nối đèn', 'light.write': 'Ghi lịch đèn', 'plug.switch': 'Bật, tắt ổ cắm', fishid: 'Nhận diện cá',
  'tank.add': 'Thêm bể', 'post.comment': 'Gửi bình luận', 'post.photo': 'Gửi ảnh',
}
const action = (name: string) => `${esc(ACTION_NAME[name] ?? name)} <code>${esc(name)}</code>`
const percent = (part: number, whole: number) => (whole ? `${fmt((100 * part) / whole, 1)}%` : '—')
const ms = (p?: Pct) => (p ? [`${fmt(p.p50)} ms`, `${fmt(p.p90)} ms`] : ['—', '—'])
const mb = (p?: Pct) => (p ? [`${fmt(p.p50)} MB`, `${fmt(p.p90)} MB`] : ['—', '—'])

function actionsTable(xs: AppStats['actions']): string {
  const rows = xs.map(a => `<tr><th>${action(a.name)}</th><td class="l">${esc(a.version)}</td><td>${fmt(a.n)}</td><td>${percent(a.ok, a.n)}</td><td>${percent(a.n - a.ok, a.n)}</td></tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr><th>Thao tác</th><th>Phiên bản</th><th>Lượt</th><th>Thành công</th><th>Lỗi</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="none">Chưa có.</td></tr>'}</tbody></table></div>`
}

function versionsTable(xs: Version[]): string {
  const rows = xs.map(v => `<tr><th>${esc(v.version)}</th><td>${fmt(v.reports)}</td><td>${fmt(v.crashes)}</td><td>${fmt(v.hangs)}</td><td>${fmt(v.exits)}</td>${[...ms(v.launch), ...mb(v.memory)].map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<div class="scroll"><table class="wide"><thead><tr><th>Phiên bản</th><th>Báo cáo hằng ngày</th><th>Crash</th><th>Treo</th><th>Thoát bất thường</th><th>Mở app p50</th><th>Mở app p90</th><th>Bộ nhớ đỉnh p50</th><th>Bộ nhớ đỉnh p90</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="none">Chưa có báo cáo nào.</td></tr>'}</tbody></table></div>`
}

export function appPage(now: Date, test: boolean, s: Soft<AppStats>): string {
  const which = test
    ? '<p><b>Đang xem các bản thử</b> (bản debug, TestFlight). <a href="/_ab/ung-dung/">Xem bản App Store</a></p>'
    : '<p>Không tính các bản thử (bản debug, TestFlight). <a href="/_ab/ung-dung/?test=1">Xem các bản thử</a></p>'
  let body = `<h1>Ứng dụng iPhone</h1><p class="lede">30 ngày gần nhất · sự kiện ẩn danh và báo cáo lỗi, hiệu năng iOS thu thập (MetricKit), ứng dụng chỉ gửi khi cờ <code>telemetry</code> trong /app/&lt;lang&gt;.json bật và người dùng không tắt. Không gắn với tài khoản. Analytics Engine giữ khoảng 3 tháng; báo cáo gốc nằm trong bucket riêng tư aquatome-uploads (diagnostics/), xóa sau 30 ngày.</p>${which}`
  if (isFailed(s)) body += failedBox('số liệu ứng dụng (Analytics Engine)', s)
  else {
    const empty = !s.pages.length && !s.screens.length && !s.actions.length && !s.shops.length && !s.versions.length
    if (empty) body += `<p class="muted">Chưa có gì: ${test ? 'chưa bản thử nào gửi sự kiện hay báo cáo.' : 'ứng dụng chưa gửi sự kiện hay báo cáo nào (cờ telemetry chưa bật, hoặc chưa ai mở bản có cờ).'}</p>`
    body += `<h2>Lượt xem</h2><div class="split"><section><h3 class="sub-h">Trang trong cẩm nang</h3>${rankTable(s.pages.map(x => ({ label: pageLink(x.path), value: x.views })), ['Trang', 'Lượt xem'])}</section>
<section><h3 class="sub-h">Màn hình của ứng dụng</h3>${rankTable(s.screens.map(x => ({ label: `<code>${esc(x.screen)}</code>`, value: x.views })), ['Màn hình', 'Lượt xem'])}</section></div>
<h2>Thao tác</h2>${actionsTable(s.actions)}
<h3 class="sub-h">Lỗi hay gặp</h3>${rankTable(s.errors.map(e => ({ label: `${action(e.name)} · <code>${esc(e.kind || '(không ghi)')}</code>`, value: e.n })), ['Thao tác · lý do', 'Lượt'])}
<h2>Bấm sang sàn</h2><div class="split"><section><h3 class="sub-h">Theo sàn</h3>${rankTable(s.shops.map(x => ({ label: esc(x.shop), value: x.taps })), ['Sàn', 'Lượt bấm'])}</section>
<section><h3 class="sub-h">Theo trang</h3>${rankTable(s.shopPages.map(x => ({ label: pageLink(x.path), value: x.taps })), ['Trang', 'Lượt bấm'])}</section></div>
<h2>Ổn định và hiệu năng theo phiên bản</h2>${versionsTable(s.versions)}
<p class="note">Crash, treo: số báo cáo chẩn đoán iOS gửi, mỗi lần một báo cáo, tính cho phiên bản đã gặp lỗi. Thoát bất thường: số lần ứng dụng đang mở bị thoát không bình thường, iOS đếm trong báo cáo hằng ngày. Mở app: thời gian tới khung hình đầu tiên (trung vị trong mỗi báo cáo hằng ngày); bộ nhớ đỉnh: MB. p50, p90 tính trên ${fmt(PERF_ROWS)} báo cáo hằng ngày mới nhất.</p>`
  }
  return page('/_ab/ung-dung/', 'Ứng dụng', body, now)
}
