import { esc } from './chart'

/** The admin pages' frame: one stylesheet, the nav, a section that failed to load. Light only, as /_ab/ has always been. */

export const NAV = [
  ['/_ab/', 'Tổng quan'],
  ['/_ab/doc-gia/', 'Người đọc'],
  ['/_ab/nhan-dien-ca/', 'Nhận diện cá'],
  ['/_ab/affiliate/', 'Affiliate'],
  ['/_ab/muon-co/', 'Bạn đọc muốn có'],
  ['/_ab/anh-ban-doc/', 'Ảnh bạn đọc'],
  ['/_ab/an-trang/', 'Ẩn trang'],
  ['/_ab/tai-khoan/', 'Tài khoản · Bình luận'],
] as const
export type AdminPath = (typeof NAV)[number][0]

const CSS = `:root{--ink:#10241f;--ink-2:#34463f;--muted:#5d6d67;--bg:#eef1ec;--panel:#fff;--rule:#d3dad3;--grid:#e3e8e3;--axis:#aab5ae;--s1:#2a8a5e;--s2:#3f6fb5;--s3:#c8642c;--good:#1b6b4a;--bad:#b3261e;color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg)}
::selection{background:#cfe6da}
a{color:var(--ink);text-underline-offset:.18em}
a:hover{color:var(--s1)}
:focus-visible{outline:2px solid var(--s1);outline-offset:2px;border-radius:2px}
.top{background:var(--ink);color:#fff}
.top-in{max-width:1240px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:24px}
.brand{font-weight:650;white-space:nowrap;padding:14px 0;color:#fff;text-decoration:none}
.brand span{color:#9fbdb3;font-weight:500}
.top nav{overflow-x:auto;scrollbar-width:none;flex:1}
.top nav::-webkit-scrollbar{display:none}
.top ul{display:flex;gap:4px;margin:0;padding:0;list-style:none}
.top nav a{display:block;padding:14px 10px 12px;color:#c6d8d1;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent}
.top nav a:hover{color:#fff}
.top nav a[aria-current=page]{color:#fff;border-bottom-color:#6fd6be;font-weight:600}
.top :focus-visible{outline-color:#6fd6be}
main{max-width:1240px;margin:0 auto;padding:24px 20px 64px}
h1{font-size:1.75rem;line-height:1.2;margin:0 0 6px}
h2{font-size:1.25rem;line-height:1.3;margin:40px 0 12px}
h3{font-size:.95rem;margin:0}
p{margin:0 0 12px;max-width:72ch}
.lede,.note{color:var(--muted)}
.note{font-size:.875rem}
section>h2:first-child{margin-top:32px}
table{border-collapse:collapse;background:var(--panel);width:100%}
th,td{padding:.55rem .8rem;border-bottom:1px solid var(--rule);text-align:right;vertical-align:top}
th{text-align:left;font-weight:500}
td{font-variant-numeric:tabular-nums}
thead th{font-size:.8rem;font-weight:500;color:var(--muted);vertical-align:bottom}
tbody tr:last-child>*{border-bottom:0}
td.l{text-align:left}
td.none{text-align:left;color:var(--muted)}
.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:6px;background:var(--panel)}
.scroll table{border:0}
table.wide{min-width:max-content}
table.wide td,table.wide th{white-space:nowrap}
table.wide td.wrap{white-space:normal;min-width:14rem}
code{font:.85em ui-monospace,SFMono-Regular,Menlo,monospace}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));margin:0;background:var(--panel);border:1px solid var(--rule);border-radius:6px;overflow:hidden}
.kpi{padding:14px 16px 16px;margin:0;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule)}
.kpi dt{font-size:.85rem;color:var(--muted)}
.kpi dt a{color:inherit}
.kpi dd{margin:0}
.kpi .v{font-size:1.75rem;font-weight:600;line-height:1.2;margin:4px 0 2px}
.kpi .sub,.delta{font-size:.85rem;color:var(--muted)}
.delta.good{color:var(--good)}
.delta.bad{color:var(--bad)}
.charts{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));margin-top:16px}
.chart{margin:0;background:var(--panel);border:1px solid var(--rule);border-radius:6px;padding:14px 14px 6px;min-width:0}
.chart figcaption{margin-bottom:6px}
.chart svg{display:block;width:100%;max-width:520px;height:auto;overflow:visible}
.chart .empty{color:var(--muted);margin:24px 0 18px}
.chart details{margin:6px 0 4px}
.chart details .scroll{margin-top:6px;max-height:22rem;overflow:auto}
summary{cursor:pointer;color:var(--muted);font-size:.85rem;padding:6px 0;min-height:32px}
summary:hover{color:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0 0 6px;padding:0;list-style:none;font-size:.85rem;color:var(--ink-2)}
.key{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.key.kl{width:16px;height:2px;border-radius:1px;vertical-align:4px}
.s1{fill:var(--s1);background:var(--s1)}
.s2{fill:var(--s2);background:var(--s2)}
.s3{fill:var(--s3);background:var(--s3)}
.chart .line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .line.s1{stroke:var(--s1)}
.chart .line.s2{stroke:var(--s2)}
.chart .line.s3{stroke:var(--s3)}
.chart .dot{stroke:var(--panel);stroke-width:2}
.chart .today{opacity:.45}
.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .base{stroke:var(--axis);stroke-width:1}
.chart .tick{font-size:12px;fill:var(--muted);font-variant-numeric:tabular-nums}
.chart .end{font-size:12px;fill:var(--ink);font-weight:600}
.chart .hit{fill:transparent}
.chart .hit:hover{fill:rgba(16,36,31,.06)}
.rank th{min-width:9rem;max-width:28rem;overflow-wrap:anywhere}
.rank td{white-space:nowrap}
.rank td.bar{text-align:left}
.rank td.bar span{display:inline-block;width:calc(var(--w) * 0.07rem);max-width:7rem;height:8px;margin-right:8px;background:var(--s1);border-radius:0 4px 4px 0;vertical-align:1px}
.charts>.failed,.split>.failed{align-self:start}
.failed{background:#fbefed;border:1px solid #efc9c3;border-radius:6px;padding:12px 14px;color:#5b1d16}
.failed code{display:block;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;color:#7a2a20}
.split{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))}
.split>*{min-width:0}
form.inline{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
input{font:inherit;padding:.5rem .65rem;border:1px solid var(--axis);border-radius:4px;background:#fff;color:var(--ink);min-height:44px;max-width:100%}
input[name=url]{flex:1 1 22rem}
input[name=note]{flex:1 1 12rem}
button{font:inherit;padding:.5rem 1rem;border:1px solid var(--axis);border-radius:4px;background:#fff;color:var(--ink);min-height:44px;cursor:pointer}
button:hover{background:#f2f5f2;border-color:var(--muted)}
button.go{background:var(--ink);border-color:var(--ink);color:#fff}
button.go:hover{background:#1d3a32}
.thumb{display:block;width:96px;height:auto;border-radius:4px}
.muted{color:var(--muted)}
i.sci{font-style:italic}
@media (max-width:640px){.top-in{padding:0 12px;gap:12px}.brand span{display:none}main{padding:18px 12px 48px}h1{font-size:1.5625rem}.chart{padding:12px 10px 4px}th,td{padding:.5rem .6rem}}`

const HEAD = (title: string) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Quản trị AquaTome</title><style>${CSS}</style></head>`

/** An admin page: the bar with the nav (the current page marked), then the page's own content. */
export function page(current: AdminPath, title: string, body: string): string {
  const nav = NAV.map(([href, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('')
  return `${HEAD(title)}<body><header class="top"><div class="top-in"><a class="brand" href="/_ab/">AquaTome <span>quản trị</span></a><nav aria-label="Trang quản trị"><ul>${nav}</ul></nav></div></header><main>${body}</main></body></html>`
}

/** /_ab/ without a valid token: ask for it (POST /_ab/login). */
export function loginPage(failed = false): string {
  return `${HEAD('Đăng nhập')}<body><main style="max-width:28rem"><h1>Quản trị AquaTome</h1>${failed ? '<p class="failed">Mã quản trị không đúng.</p>' : '<p class="lede">Nhập mã quản trị để xem số liệu.</p>'}
<form class="inline" method="post" action="/_ab/login"><label for="token" class="muted" style="flex-basis:100%">Mã quản trị</label><input id="token" type="password" name="token" required autocomplete="current-password" autofocus style="flex:1"> <button class="go">Vào</button></form>
<p><a href="/vi/">Về trang chủ</a></p></main></body></html>`
}

/** A part that loads on its own: its data, or why it couldn't load (shown in its place, the rest of the page still renders). */
export type Failed = { failed: string }
export type Soft<T> = T | Failed
export const isFailed = (x: unknown): x is Failed => typeof x === 'object' && x !== null && !Array.isArray(x) && 'failed' in x
export const soft = <T>(what: string, p: Promise<T>): Promise<Soft<T>> => p.catch((e: unknown) => {
  console.error(`admin ${what}:`, e)
  return { failed: String((e as Error)?.message ?? e).slice(0, 300) }
})
export const unset = (what: string): Failed => ({ failed: `Chưa cấu hình ${what}.` })
export const failedBox = (what: string, f: Failed) => `<div class="failed" role="status">Không tải được ${esc(what)}.<code>${esc(f.failed)}</code></div>`
