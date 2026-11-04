import { esc } from './chart'

/** The admin pages' frame: one stylesheet in the site's world (light or dark as the phone is set), the nav, a section that failed to load. */

export const NAV = [
  ['/_ab/', 'Tổng quan'],
  ['/_ab/noi-dung/', 'Nội dung'],
  ['/_ab/doc-gia/', 'Người đọc'],
  ['/_ab/nhan-dien-ca/', 'Nhận diện cá'],
  ['/_ab/affiliate/', 'Affiliate'],
  ['/_ab/muon-co/', 'Bạn đọc muốn có'],
  ['/_ab/anh-ban-doc/', 'Ảnh bạn đọc'],
  ['/_ab/an-trang/', 'Ẩn trang'],
  ['/_ab/tai-khoan/', 'Tài khoản · Bình luận'],
] as const
export type AdminPath = (typeof NAV)[number][0]

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const VIET = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'
/** The site's two faces, served from /_ab/fonts/ (scripts/admin-fonts.ts copies them there at build). */
const FONTS = ['latin', 'vietnamese'].flatMap(sub => [
  ...[400, 500, 600].map(w => `@font-face{font-family:'Be Vietnam Pro';font-weight:${w};font-display:swap;src:url(/_ab/fonts/be-vietnam-pro-${sub}-${w}-normal.woff2) format('woff2');unicode-range:${sub === 'latin' ? LATIN : VIET}}`),
  `@font-face{font-family:'Newsreader';font-weight:200 800;font-display:swap;src:url(/_ab/fonts/newsreader-${sub}-wght-normal.woff2) format('woff2-variations');unicode-range:${sub === 'latin' ? LATIN : VIET}}`,
]).join('')

/**
 * The site's world (src/styles/tokens.css): blackwater bar, paper ground, plate panels, moss for good and rust for
 * attention; Newsreader for figures and headings, Be Vietnam Pro for the rest. Light or dark as the phone is set.
 */
const CSS = `${FONTS}
:root{--paper:#f3eee3;--plate:#fbf8f1;--mat:#fff;--ink:#1d2a22;--ink-2:#3f4c44;--muted:#5a665e;--rule:#d9d0bd;--grid:#e7e0d0;--axis:#b3a88f;
--moss:#2f6b4f;--moss-wash:#e1eadf;--rust:#a0522d;--rust-wash:#f6e4d7;--water:#0a1a1d;--on-dark:#e4efed;--on-dark-soft:#9db7b3;--select:#e8d5b5;--focus:#c46a36;
--s1:#2f6b4f;--s2:#3b6d8c;--s3:#a0522d;--good:var(--moss);--bad:var(--rust);
--sans:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--serif:'Newsreader',Georgia,'Times New Roman',serif;--r:12px;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0b1a1e;--plate:#11262b;--mat:#16302f;--ink:#e6efec;--ink-2:#c3d4cf;--muted:#94ada7;--rule:#24423f;--grid:#1a3335;--axis:#3d5d5a;
--moss:#6fd6be;--moss-wash:#123631;--rust:#ff9b7f;--rust-wash:#3b2119;--water:#061013;--on-dark:#e6efec;--on-dark-soft:#9db7b3;--select:#2e5a52;--focus:#6fd6be;
--s1:#6fd6be;--s2:#8ab9e3;--s3:#ff9b7f;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--paper);scrollbar-color:var(--axis) transparent}
body{margin:0;font:15px/1.5 var(--sans);color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
::selection{background:var(--select);color:var(--ink)}
a{color:inherit;text-decoration-color:var(--axis);text-underline-offset:.2em;text-decoration-thickness:1px}
a:hover{text-decoration-color:currentColor;color:var(--moss)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
.num,td,.v,.fig{font-variant-numeric:tabular-nums}
.masthead{background:var(--water);color:var(--on-dark);display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:13px max(16px,env(safe-area-inset-left)) 12px}
.brand{font-weight:600;color:var(--on-dark);text-decoration:none;letter-spacing:.005em}
.brand span{color:var(--on-dark-soft);font-weight:500}
.brand span:before{content:'·';margin:0 .4em}
.masthead time{color:var(--on-dark-soft);font-size:13px;white-space:nowrap}
.masthead :focus-visible{outline-color:#6fd6be}
.frame{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr)}
.rail{border-bottom:1px solid var(--rule);background:var(--plate)}
.rail ul{display:flex;gap:6px;margin:0;padding:10px 12px;list-style:none;overflow-x:auto;scrollbar-width:none}
.rail ul::-webkit-scrollbar{display:none}
.rail a{display:flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;font-size:13.5px;color:var(--ink-2);border:1px solid var(--rule);border-radius:999px;padding:7px 12px;min-height:36px;background:var(--paper)}
.rail a:hover{color:var(--ink);border-color:var(--axis)}
.rail a[aria-current=page]{background:var(--ink);border-color:var(--ink);color:var(--paper);font-weight:600}
.home .rail{display:none}
main{min-width:0;padding:18px 16px 56px}
h1{font:600 1.75rem/1.15 var(--serif);letter-spacing:-.01em;margin:4px 0 6px}
h2{font:600 1.3rem/1.2 var(--serif);letter-spacing:-.005em;margin:36px 0 10px;display:flex;align-items:center;gap:10px}
h3{font:600 .95rem/1.35 var(--sans);margin:0}
p{margin:0 0 12px;max-width:72ch}
.lede,.note{color:var(--muted)}
.note{font-size:.85rem}
.muted{color:var(--muted)}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.badge{font:700 12px/1 var(--sans);background:var(--rust);color:var(--paper);border-radius:999px;padding:4px 8px}
section>h2:first-child{margin-top:28px}
.panel{background:var(--plate);border:1px solid var(--rule);border-radius:var(--r)}
/* Cần bạn */
.todo{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.todo li{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:center;background:var(--rust-wash);border:1px solid color-mix(in srgb,var(--rust) 35%,var(--rule));border-radius:var(--r);padding:12px 12px 12px 14px}
.todo svg{color:var(--rust)}
.todo b{display:block;font-size:14.5px}
.todo p{margin:2px 0 0;font-size:13.5px;color:var(--ink-2);line-height:1.4}
.todo .act{font-size:13.5px;font-weight:600;color:var(--paper);background:var(--ink);border-radius:9px;padding:9px 12px;min-height:44px;display:inline-flex;align-items:center;text-decoration:none;white-space:nowrap}
.todo .act:hover{background:var(--moss);color:var(--paper)}
.clear{display:flex;align-items:center;gap:10px;color:var(--ink-2);padding:12px 14px}
.clear svg{color:var(--moss);flex:none}
/* Các mục */
.areas{list-style:none;margin:0;padding:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden}
.areas li+li{border-top:1px solid var(--rule)}
.area{display:grid;grid-template-columns:minmax(0,1fr) auto 16px;align-items:center;gap:6px 12px;padding:13px 12px 13px 14px;text-decoration:none;color:inherit;min-height:64px}
.area:focus-visible{outline-offset:-3px;border-radius:calc(var(--r) - 2px)}
.area:hover{background:color-mix(in srgb,var(--moss) 6%,var(--plate));color:inherit}
.area .name{display:flex;align-items:center;gap:7px;font-weight:600;font-size:14px}
.area .fig{display:block;font:600 1.75rem/1.1 var(--serif);letter-spacing:-.01em;margin:2px 0 1px}
.area .sub{display:block;font-size:12.5px;color:var(--muted);line-height:1.35}
.area .trend{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.area .chev{color:var(--axis)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--rust);flex:none}
.spark{display:block;width:96px;height:30px;overflow:visible}
.spark .ln{fill:none;stroke:var(--moss);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.spark .ar{fill:var(--moss);opacity:.12}
.spark .end{fill:var(--moss)}
.spark.warn .ln{stroke:var(--rust)}.spark.warn .ar,.spark.warn .end{fill:var(--rust)}
.chip{display:inline-block;font-size:12px;font-weight:600;line-height:1.3;padding:3px 8px;border-radius:999px;white-space:nowrap;background:var(--grid);color:var(--ink-2)}
.chip.good{background:var(--moss-wash);color:var(--moss)}
.chip.bad{background:var(--rust-wash);color:var(--rust)}
/* Mấy ngày qua */
.log h3{font:600 1.05rem/1.2 var(--serif);display:flex;align-items:center;gap:10px;margin:18px 0 8px}
.log h3:after{content:'';flex:1;border-top:1px solid var(--rule)}
.log section:first-child h3{margin-top:4px}
.log ol{list-style:none;margin:0;padding:0 0 0 2px}
.log li{position:relative;padding:0 0 13px 20px;border-left:1px solid var(--rule);margin-left:4px}
.log li:last-child{padding-bottom:2px}
.log li:before{content:'';position:absolute;left:-5px;top:5px;width:9px;height:9px;border-radius:50%;background:var(--paper);box-shadow:inset 0 0 0 2px var(--axis)}
.log p{margin:1px 0 0;font-size:14px}
.log small{display:block;font-size:12.5px;color:var(--muted);margin-top:1px}
.home-grid{display:grid;gap:8px 32px}
/* Nội dung */
.jump ul{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}
.jump a{display:inline-flex;align-items:center;min-height:36px;padding:6px 12px;border:1px solid var(--rule);border-radius:999px;font-size:13.5px;color:var(--ink-2);text-decoration:none;background:var(--plate)}
.jump a:hover{border-color:var(--axis);color:var(--ink)}
h3.sub-h{font:600 1.05rem/1.3 var(--serif);margin:22px 0 8px}
.gaps{list-style:none;margin:0;padding:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r)}
.gaps>li{padding:10px 14px}
.gaps>li+li{border-top:1px solid var(--rule)}
.gaps p{margin:0}
.gaps b{font:600 1.1rem var(--serif);margin-right:4px}
.gaps details{margin-top:2px}
ol.pages{margin:4px 0 6px;padding-left:1.6em;columns:2 14rem;column-gap:24px;font-size:14px}
ol.pages li{break-inside:avoid;padding:2px 0}
.chart .kpis{border:0;border-radius:0;background:none}
/* Detail pages: tiles, charts, tables, forms */
table{border-collapse:collapse;width:100%}
th,td{padding:.6rem .8rem;border-bottom:1px solid var(--rule);text-align:right;vertical-align:top}
th{text-align:left;font-weight:500}
thead th{font-size:.78rem;font-weight:600;letter-spacing:.02em;color:var(--muted);vertical-align:bottom;background:color-mix(in srgb,var(--paper) 55%,var(--plate))}
tbody tr:last-child>*{border-bottom:0}
tbody tr:hover>*{background:color-mix(in srgb,var(--moss) 4%,transparent)}
td.l{text-align:left}
td.none{text-align:left;color:var(--muted)}
.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:var(--r);background:var(--plate)}
.scroll table{border:0}
table.wide{min-width:max-content}
table.wide td,table.wide th{white-space:nowrap}
table.wide td.wrap{white-space:normal;min-width:14rem}
code{font:.85em ui-monospace,SFMono-Regular,Menlo,monospace}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr));margin:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden}
.kpi{padding:14px 16px 16px;margin:0;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule)}
.kpi dt{font-size:.85rem;color:var(--muted)}
.kpi dt a{color:inherit}
.kpi dd{margin:0}
.kpi .v{font:600 1.9rem/1.15 var(--serif);letter-spacing:-.01em;margin:4px 0 4px}
.kpi .sub,.delta{font-size:.85rem;color:var(--muted)}
.delta.good{color:var(--good);font-weight:600}
.delta.bad{color:var(--bad);font-weight:600}
.charts{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));margin-top:12px}
.chart{margin:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);padding:14px 14px 6px;min-width:0}
.chart figcaption{margin-bottom:6px}
.chart svg{display:block;width:100%;max-width:560px;height:auto;overflow:visible}
.chart .empty{color:var(--muted);margin:24px 0 18px}
.chart details{margin:6px 0 4px}
.chart details .scroll{margin-top:6px;max-height:22rem;overflow:auto}
summary{cursor:pointer;color:var(--muted);font-size:.85rem;padding:8px 0;min-height:36px}
summary:hover{color:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0 0 6px;padding:0;list-style:none;font-size:.85rem;color:var(--ink-2)}
.key{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.key.kl{width:16px;height:2px;border-radius:1px;vertical-align:4px}
.s1{fill:var(--s1);background:var(--s1)}
.s2{fill:var(--s2);background:var(--s2)}
.s3{fill:var(--s3);background:var(--s3)}
.chart .line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .line.s1{stroke:var(--s1)}
.chart .line.s2{stroke:var(--s2)}
.chart .line.s3{stroke:var(--s3)}
.chart .dot{stroke:var(--plate);stroke-width:2;width:auto;height:auto;border-radius:0;background:none}
.chart .today{opacity:.45}
.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .base{stroke:var(--axis);stroke-width:1}
.chart .tick{font:12px var(--sans);fill:var(--muted);font-variant-numeric:tabular-nums}
.chart .end{font:600 12px var(--sans);fill:var(--ink)}
.chart .hit{fill:transparent}
.chart .hit:hover{fill:color-mix(in srgb,var(--ink) 7%,transparent)}
.rank th{min-width:9rem;max-width:28rem;overflow-wrap:anywhere}
.rank td{white-space:nowrap}
.chart>.scroll{border:0;border-radius:0;background:none}
.chart .rank th{min-width:6rem}
.rank td.bar{text-align:left}
.rank td.bar span{display:inline-block;width:calc(var(--w) * 0.07rem);max-width:7rem;height:8px;margin-right:8px;background:var(--s1);border-radius:0 4px 4px 0;vertical-align:1px}
.charts>.failed,.split>.failed{align-self:start}
.failed{background:var(--rust-wash);border:1px solid color-mix(in srgb,var(--rust) 35%,var(--rule));border-radius:var(--r);padding:12px 14px;color:var(--ink)}
.failed code{display:block;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--rust)}
.split{display:grid;gap:12px 24px;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))}
.split>*{min-width:0}
form.inline{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
input{font:inherit;padding:.55rem .7rem;border:1px solid var(--axis);border-radius:9px;background:var(--mat);color:var(--ink);min-height:44px;max-width:100%}
input::placeholder{color:var(--muted)}
input[name=url]{flex:1 1 22rem}
input[name=note]{flex:1 1 12rem}
button{font:inherit;font-weight:500;padding:.5rem 1rem;border:1px solid var(--axis);border-radius:9px;background:var(--plate);color:var(--ink);min-height:44px;cursor:pointer}
button:hover{border-color:var(--ink)}
button.go,a.go{background:var(--ink);border-color:var(--ink);color:var(--paper);font-weight:600}
button.go:hover,a.go:hover{background:var(--moss);border-color:var(--moss);color:var(--paper)}
a.go{display:inline-flex;align-items:center;min-height:44px;padding:.5rem 1rem;border-radius:9px;text-decoration:none}
.thumb{display:block;width:96px;height:auto;border-radius:8px}
i.sci{font-style:italic}
@media (min-width:1000px){
.frame{grid-template-columns:232px minmax(0,1fr);gap:0 8px}
.rail,.home .rail{display:block;border:0;background:none;padding:20px 0 0 16px}
.rail ul{flex-direction:column;gap:2px;padding:0;overflow:visible;position:sticky;top:16px}
.rail a{border:0;background:none;border-radius:9px;padding:8px 12px;font-size:14px;justify-content:space-between}
.rail a:hover{background:var(--plate)}
.rail a[aria-current=page]{background:var(--plate);color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}
main{padding:24px 24px 64px}
.home-grid{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}
.home-grid>.side h2:first-child{margin-top:28px}
}
@media (max-width:420px){.masthead time span{display:none}th,td{padding:.55rem .6rem}.chart{padding:12px 10px 4px}.rank th{min-width:7rem}.rank td.bar span{max-width:3rem}}`

const HEAD = (title: string) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0a1a1d"><title>${esc(title)} · Quản trị AquaTome</title><link rel="preload" href="/_ab/fonts/newsreader-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin><style>${CSS}</style></head>`

/** Drawn icons, one stroke: the arrow on an area row, a to-do's mark, the all-clear. */
export const ICON = {
  chevron: '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.2 16.3 15H1.7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 7v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="12.7" r=".95" fill="currentColor"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.4 10.2 2.4 2.4 4.8-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

/** The day and time in Vietnam, for the bar: when this page was put together. */
const stamp = (now: Date) => {
  const vn = new Date(now.getTime() + 7 * 3_600_000)
  const day = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][vn.getUTCDay()]
  const p = (n: number) => String(n).padStart(2, '0')
  return `<time datetime="${now.toISOString()}"><span>${day}, </span>${p(vn.getUTCDate())}/${p(vn.getUTCMonth() + 1)} · ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}</time>`
}

/** An admin page: the bar, the areas (a rail on a computer, chips on a phone), then the page's own content. */
export function page(current: AdminPath, title: string, body: string, now = new Date()): string {
  const nav = NAV.map(([href, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('')
  return `${HEAD(title)}<body${current === '/_ab/' ? ' class="home"' : ''}><header class="masthead"><a class="brand" href="/_ab/">AquaTome<span>Quản trị</span></a>${stamp(now)}</header><div class="frame"><nav class="rail" aria-label="Các mục quản trị"><ul>${nav}</ul></nav><main>${body}</main></div></body></html>`
}

/** /_ab/ without a valid token: ask for it (POST /_ab/login). */
/** Signed out, or `other`: signed in to an account that isn't the owner's. The site's own sign-in is on the My tanks page. */
export function loginPage(other = false): string {
  return `${HEAD('Đăng nhập')}<body><main style="max-width:28rem"><h1>Quản trị AquaTome</h1>${other ? '<p class="failed">Tài khoản đang đăng nhập không phải tài khoản chủ trang. Đăng xuất rồi đăng nhập bằng tài khoản chủ trang.</p>' : '<p class="lede">Đăng nhập bằng tài khoản AquaTome của chủ trang để xem số liệu.</p>'}
<p><a class="go" href="/cong-cu/be-cua-toi/#tai-khoan">${other ? 'Đổi tài khoản' : 'Đăng nhập'}</a></p>
<p class="muted">Đăng nhập xong, mở lại <a href="/_ab/">/_ab/</a>.</p>
<p><a href="/">Về trang chủ</a></p></main></body></html>`
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
