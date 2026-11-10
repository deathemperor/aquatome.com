import { esc } from './chart'
import { HOME_TZ, stamp } from './time'

/** The admin pages' frame: one stylesheet in the site's world (light or dark as the phone is set), the nav, a section that failed to load. */

/**
 * Every page, in its group, in the spec's order (docs/design/dashboard.md): the web's rail, the overview's "Every page",
 * and, all but the overview, the section list the iOS app draws (dashboard.ts SECTIONS, protocols/owner-dashboard*.json).
 */
export const NAV = [
  ['/_ab/', 'Today', ''],
  ['/_ab/thanh-cong/', 'Scoreboard', 'Growth'],
  ['/_ab/doc-gia/', 'Readers', 'Growth'],
  ['/_ab/affiliate/', 'Affiliate', 'Growth'],
  ['/_ab/noi-dung/', 'Content and engine', 'Content'],
  ['/_ab/muon-co/', 'Wanted by readers', 'Content'],
  ['/_ab/an-trang/', 'Hidden pages', 'Content'],
  ['/_ab/binh-luan/', 'Comments', 'Community'],
  ['/_ab/anh-ban-doc/', 'Reader photos', 'Community'],
  ['/_ab/tai-khoan/', 'Accounts', 'Community'],
  ['/_ab/nhan-dien-ca/', 'Calls and keys', 'Fish ID'],
  ['/_ab/anh-nhan-dien/', 'Kept photos', 'Fish ID'],
  ['/_ab/ung-dung/', 'iPhone app', 'App'],
  ['/_ab/bao-cao/', 'Daily reports', 'Records'],
  ['/_ab/thay-doi/', 'Changelog', 'Records'],
] as const
export type AdminPath = (typeof NAV)[number][0]
export const SCOREBOARD_PATH = '/_ab/thanh-cong/'
/** The daily report's log and its delivery (worker/daily). */
export const REPORT_PATH = '/_ab/bao-cao/'
export const REPORT_NAME = 'Daily reports'
/** The product change log (daily/changelog.ts), which each merge adds to. */
export const CHANGELOG_PATH = '/_ab/thay-doi/'
export const CHANGELOG_NAME = 'Changelog'
export type WebPath = AdminPath
const PAGE_NAV: readonly (readonly [WebPath, string, string])[] = NAV
/** Every page of the web dashboard. */
export const WEB_PAGES: readonly WebPath[] = PAGE_NAV.map(([p]) => p)

/**
 * Their keys. A key's page, the pages under it (one report, one fish-ID run) and their JSON forms (thanh-cong.json, a
 * day of fish-ID runs) are the dashboard's.
 */
const KEYS = new Set(WEB_PAGES.map(p => p.slice('/_ab/'.length, -1)).filter(Boolean))
const UNDER_KEY = /^\/([a-z0-9-]+)((?:\/[a-z0-9-]+)*(?:\/|\.json))$/
/**
 * The /_ab/ path behind an address on the dashboard's own host (dashboard-host.ts): "/" → "/_ab/", "/bao-cao/1003/" →
 * "/_ab/bao-cao/1003/", "/thanh-cong.json" → "/_ab/thanh-cong.json"; undefined for an address that isn't the dashboard's.
 */
export function innerPath(path: string): string | undefined {
  if (path === '/') return '/_ab/'
  const m = UNDER_KEY.exec(path)
  return m && KEYS.has(m[1]!) ? `/_ab${path}` : undefined
}
/**
 * The other way, for the host's links and redirects: a dashboard address as the host has it, the query and hash kept
 * ("/_ab/doc-gia/?x=1#y" → "/doc-gia/?x=1#y"). The rest of /_ab/ (the forms, the images, the fonts) stays as it is.
 */
export function hostPath(path: string): string {
  const at = path.search(/[?#]/)
  const [p, rest] = at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at)]
  const own = p.startsWith('/_ab/') ? p.slice('/_ab'.length) : undefined
  return own !== undefined && innerPath(own) === p ? `${own}${rest}` : path
}

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
--s1:#0c6944;--s2:#2d76a3;--s3:#a6552d;--whole:#d9e2d5;--mute:#a19c8e;--good:var(--moss);--bad:var(--rust);
--sans:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--serif:'Newsreader',Georgia,'Times New Roman',serif;--r:12px;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0b1a1e;--plate:#11262b;--mat:#16302f;--ink:#e6efec;--ink-2:#c3d4cf;--muted:#94ada7;--rule:#24423f;--grid:#1a3335;--axis:#3d5d5a;
--moss:#6fd6be;--moss-wash:#123631;--rust:#ff9b7f;--rust-wash:#3b2119;--water:#061013;--on-dark:#e6efec;--on-dark-soft:#9db7b3;--select:#2e5a52;--focus:#6fd6be;
--s1:#36a980;--s2:#359bd9;--s3:#cb7a5b;--whole:#244a45;--mute:#5d7a75;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--paper);scrollbar-color:var(--axis) transparent}
body{margin:0;font:15px/1.5 var(--sans);color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
::selection{background:var(--select);color:var(--ink)}
a{color:inherit;text-decoration-color:var(--axis);text-underline-offset:.2em;text-decoration-thickness:1px}
a:hover{text-decoration-color:currentColor;color:var(--moss)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:4px}
.num,td,.v,.fig{font-variant-numeric:tabular-nums}
.masthead{background:var(--water);color:var(--on-dark);display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:13px max(16px,env(safe-area-inset-left)) 12px}
.brand{font-weight:600;color:var(--on-dark);text-decoration:none;letter-spacing:.005em;margin-right:auto}
.brand span{color:var(--on-dark-soft);font-weight:500}
.brand span:before{content:'·';margin:0 .4em}
.masthead time{color:var(--on-dark-soft);font-size:13px;white-space:nowrap}
.masthead .out{color:var(--on-dark-soft);font-size:13px;white-space:nowrap;padding:14px 0;margin:-14px 0}
.masthead :focus-visible{outline-color:#6fd6be}
.frame{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr)}
.rail{border-bottom:1px solid var(--rule);background:var(--plate)}
.rail ul{display:flex;gap:6px;margin:0;padding:10px 12px;list-style:none;overflow-x:auto;scrollbar-width:none}
.rail ul::-webkit-scrollbar{display:none}
.rail a{display:flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;font-size:13.5px;color:var(--ink-2);border:1px solid var(--rule);border-radius:999px;padding:7px 12px;min-height:36px;background:var(--paper)}
.rail a:hover{color:var(--ink);border-color:var(--axis)}
.rail a[aria-current=page]{background:var(--ink);border-color:var(--ink);color:var(--paper);font-weight:600}
.rail .grp{display:none}
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
/* Needs you */
/* One list in one card: each row its kind's icon (the triangle only for a fault), the thing, the pages it's on, and the
   button that acts (filled for a review, outlined for a fault); on a phone, the whole row with a chevron */
.todo{list-style:none;margin:0;padding:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden}
.todo li+li{border-top:1px solid var(--rule)}
.todo a{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:2px 12px;padding:12px 14px;min-height:56px;color:inherit;text-decoration:none}
.todo a:hover{background:color-mix(in srgb,var(--moss) 5%,var(--plate));color:inherit}
.todo a:focus-visible{outline-offset:-3px}
.todo .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;align-self:start;background:color-mix(in srgb,var(--ink) 7%,var(--plate));color:var(--ink-2)}
.todo .bad .ic{background:var(--rust-wash);color:var(--rust)}
.todo .tx{min-width:0}
/* A title is one line on any font: a source's name too long for the screen is cut ("…"), whole in the line under it. */
.todo b{display:block;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.todo .sub{display:block;margin-top:2px;font-size:13.5px;color:var(--ink-2);line-height:1.4}
.todo .act{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border:1px solid var(--rule);border-radius:9px;background:var(--mat);color:var(--ink);font-size:13.5px;font-weight:600;white-space:nowrap}
.todo .wait .act{background:var(--moss);border-color:var(--moss);color:var(--paper)}
.todo a:hover .act{border-color:var(--ink-2)}
.todo .chev{display:none;color:var(--axis)}
@media (max-width:480px){.todo a{grid-template-columns:24px minmax(0,1fr) 16px}.todo .ic,.todo .bad .ic{width:24px;background:none}.todo b{font-weight:500}.todo .act{display:none}.todo .chev{display:block}}
.clear{display:flex;align-items:center;gap:10px;color:var(--ink-2);padding:12px 14px}
.clear svg{color:var(--moss);flex:none}
/* The overview before version 2's areas */
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
.spark{display:block;width:104px;height:30px}
.spark line{stroke:var(--rule);stroke-width:1}
.spark .now{fill:var(--s1)}
.spark .was{fill:color-mix(in srgb,var(--s1) 42%,var(--plate))}
.spark .old{fill:color-mix(in srgb,var(--muted) 30%,var(--plate))}
.spark .today{fill:color-mix(in srgb,var(--s1) 45%,var(--plate))}
.spk{position:relative;display:block;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.spark .on{fill:var(--ink)}
.spk .so{position:absolute;right:calc(100% + 6px);top:50%;transform:translateY(-50%);padding:3px 8px;border-radius:6px;background:var(--ink);color:var(--plate);font:600 12.5px/1.3 var(--sans);font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;visibility:hidden;z-index:1}
.spk.sel .so{visibility:visible}
.chip{display:inline-block;font-size:12px;font-weight:600;line-height:1.3;padding:3px 8px;border-radius:999px;white-space:nowrap;background:var(--grid);color:var(--ink-2)}
.chip.good{background:var(--moss-wash);color:var(--moss)}
.chip.bad{background:var(--rust-wash);color:var(--rust)}
/* The last three days */
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
/* Content and engine */
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
/* Out of search for a low score: each page, its score and its last review's notes, the first two lines until opened */
.low .kpis{margin-bottom:12px}
.low-t th,.low-t td{text-align:left}
.low-t tbody th{min-width:12rem}
.low-t td.s,.low-t td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.low-t td.s{font:600 1.05rem/1.3 var(--serif);color:var(--rust)}
.low-t td.why{min-width:22rem;max-width:44rem;font-size:13.5px;line-height:1.45;overflow-wrap:anywhere}
.why p{margin:0}
.why ul{list-style:none;margin:0;padding:0 0 0 1.1em}
.why li{margin-top:6px}
.why small{display:block;margin-top:6px;font-size:12.5px;color:var(--muted)}
.why summary{list-style:none;cursor:pointer;position:relative;padding-left:1.1em}
.why summary::-webkit-details-marker{display:none}
.why summary:before{content:'▸';position:absolute;left:0;color:var(--muted)}
.why details[open]>summary:before{content:'▾'}
.why details:not([open]) summary span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.why details:not([open]) summary:after{content:attr(data-more);display:block;margin-top:4px;font-weight:600;color:var(--moss)}
@media (max-width:720px){
.low-t thead{display:none}
.low-t,.low-t tbody{display:block}
.low-t tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:12px 14px;border-bottom:1px solid var(--rule)}
.low-t tr:last-child{border-bottom:0}
.low-t tbody th,.low-t td{display:block;padding:0;border:0;background:none;min-width:0;max-width:none}
.low-t td.k{grid-column:1;font-size:13px}
.low-t td.s{grid-column:2;grid-row:1}
.low-t td.r{grid-column:2;grid-row:2;font-size:13px;color:var(--muted)}
.low-t td.r:after{content:' readers'}
.low-t td.why{grid-column:1/-1;margin-top:8px;min-width:0}
}
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
.chart figcaption{margin-bottom:2px}
.chart .empty{color:var(--muted);margin:16px 0 14px;padding:22px 0;border-bottom:1px solid var(--axis)}
.chart details{margin:4px 0 4px}
.chart details .scroll{margin-top:6px;max-height:22rem;overflow:auto}
summary{cursor:pointer;color:var(--muted);font-size:.85rem;padding:8px 0;min-height:36px}
summary:hover{color:var(--ink)}
/* A chart's readout: the period's totals, or the day picked; each series keyed by its colour */
.readout{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 14px;margin:4px 0 0;max-width:none;font-size:.85rem;color:var(--ink-2);line-height:1.5}
.readout .when{color:var(--muted);flex:0 0 100%}
.readout.sel .when{color:var(--ink);font-weight:600}
.readout .v{white-space:nowrap}
.readout b{font:600 1.15rem/1.3 var(--serif);color:var(--ink);letter-spacing:-.005em}
.readout:not(.multi) b{font-size:1.5rem;line-height:1.2}
.readout .hint{display:none;flex:0 0 100%;font-size:.78rem;color:var(--muted)}
.js .readout.first .hint{display:block}
.js .readout.first.sel .hint{visibility:hidden}
.js .readout .hint:before{content:'Tap a column for its day.'}
.js .readout.wk .hint:before{content:'Tap a column for its week.'}
@media (hover:hover){.js .readout .hint:before{content:'Point at a column for its day.'}.js .readout.wk .hint:before{content:'Point at a column for its week.'}}
.key{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.cols .s1,.key.s1{background:var(--s1)}
.cols .s2,.key.s2{background:var(--s2)}
.cols .s3,.key.s3{background:var(--s3)}
.cols .mute,.key.mute{background:var(--mute)}
.cols .whole,.key.whole{background:var(--whole)}
/* The plot: the axis in a gutter as wide as its longest number, columns on a zero line, every seventh day named */
.plot{display:grid;grid-template-columns:calc(var(--gut) * 1ch + 8px) minmax(0,1fr);grid-template-rows:136px 24px;margin:10px 0 0;font:12px/1 var(--sans);font-variant-numeric:tabular-nums;color:var(--muted);touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;border-radius:6px}
.plot:focus-visible{outline-offset:4px}
.plot .yax{grid-area:1/1;position:relative}
.plot .yax span{position:absolute;right:8px;bottom:calc(var(--y) * 1%);transform:translateY(50%);white-space:nowrap}
.plot .area{grid-area:1/2;position:relative}
.plot .grid b{position:absolute;left:0;right:0;bottom:calc(var(--y) * 1%);border-top:1px solid var(--grid)}
.plot .grid b.zero{border-top-color:var(--axis)}
.plot .xax{grid-area:2/2;position:relative}
.plot .xax span{position:absolute;top:8px;left:calc(var(--x) * 1%);transform:translateX(-50%);white-space:nowrap}
.plot .xax span.s{transform:none}
.plot .xax span.e{transform:translateX(-100%)}
.cols{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));margin:0;padding:0;list-style:none}
.cols li{position:relative;border-radius:3px}
.cols li.on{background:color-mix(in srgb,var(--ink) 9%,transparent)}
.cols li.miss{background:repeating-linear-gradient(135deg,transparent 0 3px,color-mix(in srgb,var(--muted) 22%,transparent) 3px 4px)}
.cols li.miss.on{background-color:color-mix(in srgb,var(--ink) 9%,transparent)}
.cols i{position:absolute;left:50%;width:min(24px,calc(100% - 2px));transform:translateX(-50%);bottom:calc(var(--b) * 1%);height:calc(var(--h) * 1%)}
.cols i.up{bottom:calc(var(--b) * 1% + 2px);height:max(0px,calc(var(--h) * 1% - 2px))}
.cols i.dn{height:max(0px,calc(var(--h) * 1% - 2px))}
.cols i.cap,.cols i.whole{border-radius:4px 4px 0 0}
.cols i.neg.cap{border-radius:0 0 4px 4px}
.cols .today i{opacity:.45}
.cols .today.on i{opacity:.7}
/* A section's main chart (chart.ts bare): no axis, each day named under its bar, a tap or the pointer shows the day over
   the bars; the tip moves with its bar and stays inside the chart (it shifts by as much of its width as the bar is across) */
.bare .plot{grid-template-columns:0 minmax(0,1fr);grid-template-rows:140px 26px;position:relative;margin-top:8px}
.bare .cols i{width:min(56px,calc(100% - 8px))}
.bare .cols li.on{background:none}
.bare .plot:has(li.on) .cols li:not(.on) i{opacity:.35}
.bare .xax span{top:9px;font-size:12.5px;color:var(--ink-2)}
.bare .xax span.now{color:var(--muted)}
.bare .tip{position:absolute;z-index:2;top:0;left:calc((var(--i,0) + .5) / var(--n) * 100%);transform:translateX(calc((var(--i,0) + .5) / var(--n) * -100%));margin:0;padding:6px 10px;border-radius:8px;background:var(--ink);color:var(--plate);font:12px/1.35 var(--sans);white-space:nowrap;pointer-events:none;visibility:hidden}
.bare .tip.sel{visibility:visible}
.bare .tip b{display:block;font-size:13px;font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0;max-width:none;font-size:.85rem;color:var(--ink-2)}
/* Ranked bars: each label over its bar, the numbers in their own column */
.rank th{min-width:9rem;max-width:28rem;overflow-wrap:anywhere}
.rank thead th+th{text-align:right}
.rank .lb{display:block}
.rank .track{display:block;position:relative;height:6px;margin:7px 0 1px}
.rank .bar{position:absolute;top:0;bottom:0;left:calc(var(--x) * 1%);width:calc(var(--w) * 1%);min-width:2px;background:var(--s1);border-radius:0 3px 3px 0}
.rank .bar.neg{background:var(--s3);border-radius:3px 0 0 3px}
.rank .bar.parts{background:var(--whole)}
.rank .bar i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--p) * 1%);background:var(--s1);border-radius:0 3px 3px 0}
.rank .track.signed:before{content:'';position:absolute;left:calc(var(--z) * 1%);top:-4px;bottom:-4px;border-left:1px solid var(--axis)}
.rank caption{caption-side:top;text-align:left;padding:10px .8rem 4px;font-size:.8rem;color:var(--ink-2)}
.rank caption span{display:inline-block;margin-right:16px;white-space:nowrap}
.chart>.scroll{border:0;border-radius:0;background:none}
.chart .rank th{min-width:6rem}
/* The scoreboard's rows: the metric and what it counts, this week first, the shape of its 12 weeks last */
.score{table-layout:fixed}
.score thead th+th{text-align:right;width:8rem}
.score thead th:last-child{width:136px}
.score small{display:block;font-size:.78rem;font-weight:400;color:var(--muted);line-height:1.35;margin-top:2px}
.score td{position:relative}
.score .now b{font:600 1.15rem/1.3 var(--serif)}
.score .chip{margin-left:2px}
.score .spark{margin-left:auto}
section>.split{margin-top:12px}
@media (max-width:720px){
.score thead{display:none}
.score,.score tbody{display:block}
.score tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) 104px;gap:6px 8px;padding:10px 12px;border-bottom:1px solid var(--rule)}
.score tr:last-child{border-bottom:0}
.score tbody th,.score td{display:block;padding:0;border:0;text-align:left;background:none}
.score tbody th{grid-column:1/-1}
.score td:before{content:attr(data-l);display:block;min-height:2.5em;font-size:.72rem;line-height:1.25;color:var(--muted);margin-bottom:2px}
.score .spark{margin-left:0}
}
@media (max-width:359px){
.score tr{grid-template-columns:repeat(3,minmax(0,1fr))}
.score .trend{grid-column:1/-1}
.score .spk .so{right:auto;left:calc(100% + 6px)}
}
/* A share of a whole: a thin bar on a pale track of its own hue */
.meter{display:block;height:6px;max-width:14rem;margin:6px 0 4px;border-radius:3px;overflow:hidden;background:color-mix(in srgb,var(--s1) 16%,var(--plate))}
.meter>span{display:block;height:100%;width:calc(var(--w) * 1%);background:var(--s1);border-radius:3px}
.meter.warn{background:color-mix(in srgb,var(--s3) 16%,var(--plate))}
.meter.warn>span{background:var(--s3)}
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
/* Comments: the filter by state, then each comment with why it is there and its buttons beside it */
.filters{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;margin:6px 0 12px;background:var(--grid);border-radius:12px}
.filters a{display:inline-flex;align-items:center;min-height:36px;padding:6px 14px;border-radius:9px;font-size:13.5px;font-weight:600;color:var(--ink-2);text-decoration:none}
.filters a[aria-current=page]{background:var(--plate);color:var(--ink);box-shadow:0 0 0 1px var(--rule)}
/* A section's periods: segmented from a tablet's width up; on a phone a menu button ("This week ▾") that opens them */
.periods .seg{display:contents}
.periods .pmenu{display:none}
@media (max-width:599px){
.filters.periods{display:block;padding:0;background:none}
.periods .seg{display:none}
.periods .pmenu{display:inline-block;position:relative}
.periods .pmenu summary{list-style:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 14px;border:1px solid var(--rule);border-radius:10px;background:var(--plate);color:var(--ink);font-size:14px;font-weight:600}
.periods .pmenu summary::-webkit-details-marker{display:none}
.periods .pmenu summary:after{content:'▾';color:var(--muted)}
.periods .pmenu div{position:absolute;z-index:5;top:calc(100% + 6px);left:0;min-width:12rem;display:grid;gap:2px;padding:4px;background:var(--plate);border:1px solid var(--rule);border-radius:12px;box-shadow:0 8px 24px color-mix(in srgb,var(--water) 18%,transparent)}
.periods .pmenu a{min-height:44px}
}
.cm{list-style:none;margin:0 0 10px;padding:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden}
.cm li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;padding:14px 16px}
.cm li+li{border-top:1px solid var(--rule)}
.cm p{margin:0}
.cm .by{font-size:13px;color:var(--muted)}
.cm .by b{color:var(--ink);font-size:14.5px}
.cm .text{margin:4px 0;white-space:pre-line;overflow-wrap:anywhere}
.cm .why,.cm .reports{font-size:13px;color:var(--muted)}
.cm .why b{color:var(--rust)}
.cm form{display:flex;gap:8px;align-items:start}
.cm.none{padding:14px 16px;color:var(--muted)}
button.bad{color:var(--rust)}
@media (max-width:600px){.cm li{grid-template-columns:minmax(0,1fr)}}
/* A report as it was mailed: its own colours, inline, on the white a mail reads on */
.mail{background:#fff;color:#1d2a22;border:1px solid var(--rule);border-radius:var(--r);overflow-x:auto;margin:16px 0}
i.sci{font-style:italic}
/* Today: four tiles (two a row on a phone), the needs, then every page by its group */
.tiles4{grid-template-columns:repeat(2,minmax(0,1fr))}
.tiles4 .kpi dt a{text-decoration:none}
.tiles4 .spk{margin:2px 0 4px}
.kpi.wait .v{color:var(--rust)}
.kpi.bad .v{color:var(--rust)}
.todo .ph{display:flex;gap:4px;margin-top:6px}
.todo .ph img{width:36px;height:36px;object-fit:cover;border-radius:6px}
/* Readers who found an answer: one card, the week's figure and its change, the chart, then its three figures */
.acard{padding:16px 16px 0}
.acard .top{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;margin:0;max-width:none;color:var(--muted)}
.acard .top b{font:600 2.4rem/1.05 var(--serif);letter-spacing:-.01em;color:var(--ink)}
.acard .top .delta{margin-left:auto}
.acard .chart{border:0;background:none;padding:0;margin-top:4px}
.acard figcaption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.acard .kpis{border:0;border-top:1px solid var(--rule);border-radius:0;background:none;margin:6px -16px 0;grid-template-columns:repeat(3,minmax(0,1fr))}
/* Its figures as drawn: the number, then "readers +2%" under it. */
.acard .kpi{box-shadow:none;padding:12px 16px 14px;display:flex;flex-direction:column-reverse;justify-content:flex-end}
.acard .kpi .v{font-size:1.5rem;margin:0 0 2px}
.acard .kpi .delta{margin:0}
@media (max-width:480px){.acard .top .delta{margin-left:0;flex-basis:100%}.acard .kpi{padding:10px 8px 12px 16px}}
.last{margin:8px 2px 0}
.ship,.lines{list-style:none;margin:0;padding:0;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);overflow:hidden}
.ship li,.lines li{display:flex;gap:10px;align-items:baseline;padding:11px 14px}
.ship li+li,.lines li+li{border-top:1px solid var(--rule)}
.lines li{justify-content:space-between}
.lines small{display:block;color:var(--muted);font-size:12.5px}
.lines .fig{font-weight:600;white-space:nowrap}
.lines .bad{color:var(--rust)}
.groups{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))}
.groups h3{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:12px 14px 2px}
.groups section{background:var(--plate);border:1px solid var(--rule);border-radius:var(--r)}
.groups ul{list-style:none;margin:0;padding:0 0 6px}
.groups a{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;min-height:40px;align-items:center;text-decoration:none}
.groups .fig{color:var(--muted);font-size:13.5px;text-align:right}
.groups .fig.wait,.groups .fig.bad{color:var(--rust);font-weight:600}
details.fold{margin-top:8px;background:var(--plate);border:1px solid var(--rule);border-radius:var(--r);padding:0 14px}
details.fold>summary{display:flex;justify-content:space-between;gap:12px;align-items:center;color:var(--ink);font-size:.95rem;min-height:44px}
details.fold .fig{color:var(--muted);font-variant-numeric:tabular-nums}
details.fold .scroll{margin:0 -14px;border-width:1px 0 0;border-radius:0 0 var(--r) var(--r)}
td.bad,th.bad{color:var(--rust)}
@media (min-width:1000px){
.frame{grid-template-columns:232px minmax(0,1fr);gap:0 8px}
.rail,.home .rail{display:block;border:0;background:none;padding:20px 0 0 16px}
.rail ul{flex-direction:column;gap:2px;padding:0;overflow:visible;position:sticky;top:16px}
.rail a{border:0;background:none;border-radius:9px;padding:8px 12px;font-size:14px;justify-content:space-between}
.rail a:hover{background:var(--plate)}
.rail a[aria-current=page]{background:var(--plate);color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}
.rail .grp{display:block;padding:14px 12px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
main{padding:24px 24px 64px}
.tiles4{grid-template-columns:repeat(4,minmax(0,1fr))}
.groups{grid-template-columns:repeat(3,minmax(0,1fr))}
.home-grid{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}
.home-grid>.side h2:first-child{margin-top:28px}
}
@media (max-width:420px){.masthead time span{display:none}th,td{padding:.55rem .6rem}.chart{padding:12px 12px 4px}.rank th{min-width:7rem}}`

const HEAD = (title: string, tz?: string) => `<!doctype html><html lang="en"${tz ? ` data-tz="${esc(tz)}"` : ''}><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0a1a1d"><title>${esc(title)} · AquaTome dashboard</title><link rel="preload" href="/_ab/fonts/newsreader-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin><style>${CSS}</style></head>`

/** Drawn icons, one stroke: the arrow on an area row, a to-do's mark, the all-clear. */
export const ICON = {
  comment: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4.3c0-.9.7-1.6 1.6-1.6h8.8c.9 0 1.6.7 1.6 1.6v6.2c0 .9-.7 1.6-1.6 1.6H8.2L5 14.8v-2.7h-.4c-.9 0-1.6-.7-1.6-1.6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  photo: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="2.4" y="3.4" width="13.2" height="11.2" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6.6" cy="7.4" r="1.3" fill="currentColor"/><path d="m3 13.2 3.9-3.5 2.9 2.5 2.3-1.9 2.9 2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  key: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="6" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.2 9H16m-2.4 0v2.6M15.8 9v1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  coin: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 5.4v7.2m2-5.4c-.3-.7-1-1.1-2-1.1-1.2 0-2 .6-2 1.4 0 1.9 4.2 1 4.2 3 0 .9-.9 1.5-2.2 1.5-1.1 0-1.9-.4-2.2-1.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  chevron: '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.2 16.3 15H1.7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 7v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="12.7" r=".95" fill="currentColor"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.4 10.2 2.4 2.4 4.8-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

/**
 * The page's clock (admin/time.ts): the device's time zone kept in the aq_tz cookie for the next page (at /, where the
 * dashboard's own host has its pages; the one kept at /_ab before cleared); times rewritten in
 * it when this page was put together in another; then one reload, so the days follow it as well.
 */
const TIME_JS = `(()=>{const d=document.documentElement,z=Intl.DateTimeFormat().resolvedOptions().timeZone
if(!z)return
const c='aq_tz='+encodeURIComponent(z);document.cookie='aq_tz=; Path=/_ab; Max-Age=0; SameSite=Lax; Secure';document.cookie=c+'; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
if(z===d.dataset.tz)return
const f=new Intl.DateTimeFormat('en-GB',{timeZone:z,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}),p=t=>Object.fromEntries(f.formatToParts(t).map(x=>[x.type,x.value])),y=p(new Date()).year,M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
for(const t of document.querySelectorAll('time[datetime]')){const q=p(new Date(t.dateTime)),hm=+q.hour+':'+q.minute,dm=+q.day+' '+M[q.month-1]
if(t.dataset.f==='stamp'){t.firstElementChild.textContent=q.weekday+' ';t.lastChild.textContent=dm+' · '+hm}else t.textContent=q.weekday+' '+dm+(q.year!==y?' '+q.year:'')+', '+hm}
try{if(document.cookie.includes(c)&&sessionStorage.getItem('aq_tz')!==z){sessionStorage.setItem('aq_tz',z);location.reload()}}catch{}})()`

/**
 * Reading a chart's days (chart.ts dayChart), the page's only script: a tap on a column, a finger sliding across, the
 * pointer over it or the arrow keys put that day's values in the chart's readout; tapping the same column again, Escape
 * or the pointer leaving put the period's totals back, and a touch that turns into a scroll leaves the readout as it was. Without it the readout keeps the totals and the table has every day.
 * A row's small columns (chart.ts spark, `data-spark`) the same way, their day and value shown beside them, one at a
 * time on the page; a tap on them stays on the page instead of following the row's link.
 */
const CHART_JS = `(()=>{document.documentElement.classList.add('js');let first=true
for(const p of document.querySelectorAll('[data-plot]')){const tip=p.querySelector('.tip'),out=tip||p.closest('figure').querySelector('.readout'),area=p.querySelector('.area'),when=out.querySelector('.when'),bs=[...out.querySelectorAll('b')],cols=[...p.querySelectorAll('.cols li')],init=tip?[]:[when.textContent,...bs.map(b=>b.textContent)]
if(first&&!tip){out.classList.add('first');first=false}
let on=-1,down=-1,was=-1
const pick=i=>{cols[on]?.classList.remove('on');on=i;const li=cols[i];out.classList.toggle('sel',!!li)
if(tip){if(li){li.classList.add('on');bs[0].textContent=li.dataset.t;tip.lastChild.textContent=li.dataset.x;tip.style.setProperty('--i',i)}return}
if(!li){when.textContent=init[0];bs.forEach((b,k)=>{b.textContent=init[k+1]});return}
li.classList.add('on');when.textContent=li.dataset.d;const v=li.dataset.v.split('|');bs.forEach((b,k)=>{b.textContent=v[k]??'—'})}
const at=e=>{const r=area.getBoundingClientRect();return Math.max(0,Math.min(cols.length-1,Math.floor((e.clientX-r.left)/r.width*cols.length)))}
area.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;const i=at(e);was=on;down=i;pick(i===on?-1:i)})
area.addEventListener('pointercancel',()=>pick(was))
area.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')return pick(at(e));if(e.buttons&&at(e)!==down){down=-2;pick(at(e))}})
area.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')pick(-1)})
p.addEventListener('keydown',e=>{const l=cols.length-1,k=e.key,i=k==='ArrowRight'?(on<0?0:Math.min(l,on+1)):k==='ArrowLeft'?(on<0?l:Math.max(0,on-1)):k==='Home'?0:k==='End'?l:k==='Escape'?-1:null
if(i===null)return;e.preventDefault();pick(i)})}
let cur=null
for(const s of document.querySelectorAll('[data-spark]')){const svg=s.querySelector('svg'),out=s.querySelector('.so'),d=s.dataset.d.split('|'),v=s.dataset.v.split('|')
let on=-1,down=-1,touch=false
const pick=i=>{svg.querySelector('.on')?.classList.remove('on');on=i;s.classList.toggle('sel',i>=0);if(i<0)return
if(cur&&cur!==s)cur.dispatchEvent(new Event('unpick'));cur=s;out.textContent=d[i]+': '+v[i];svg.querySelector('[data-i="'+i+'"]')?.classList.add('on')}
s.addEventListener('unpick',()=>pick(-1))
const at=e=>{const r=svg.getBoundingClientRect();return Math.max(0,Math.min(d.length-1,Math.floor((e.clientX-r.left)/r.width*d.length)))}
s.addEventListener('pointerdown',e=>{touch=e.pointerType!=='mouse';if(!touch)return;const i=at(e);down=i;pick(i===on?-1:i)})
s.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')return pick(at(e));if(e.buttons&&at(e)!==down){down=-2;pick(at(e))}})
s.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')pick(-1)})
s.addEventListener('click',e=>{if(touch)e.preventDefault()})}})()`

/** An admin page: the bar, the areas (a rail on a computer, chips on a phone), then the page's own content. */
export function page(current: WebPath, title: string, body: string, now = new Date(), tz = HOME_TZ): string {
  // Each group's name over its pages: on a computer's rail only (a phone's row of chips has no room for them).
  const nav = PAGE_NAV.map(([href, label, group], i) => `${group && group !== PAGE_NAV[i - 1]![2] ? `<li class="grp" aria-hidden="true">${esc(group)}</li>` : ''}<li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('')
  const script = /data-(?:plot|spark)\b/.test(body) ? `<script>${CHART_JS}</script>` : ''
  return `${HEAD(title, tz)}<body${current === '/_ab/' ? ' class="home"' : ''}><header class="masthead"><a class="brand" href="/_ab/">AquaTome<span>Dashboard</span></a>${stamp(now, tz)}</header><div class="frame"><nav class="rail" aria-label="Dashboard pages"><ul>${nav}</ul></nav><main>${body}</main></div><script>${TIME_JS}</script>${script}</body></html>`
}

/** /_ab/ without a valid token: ask for it (POST /_ab/login). */
/** Signed out, or `other`: signed in to an account that isn't the owner's. The site's own sign-in is on the My tanks page. */
export function loginPage(other = false): string {
  return `${HEAD('Sign in')}<body><main style="max-width:28rem"><h1>AquaTome dashboard</h1>${other ? '<p class="failed">The account signed in isn’t the owner’s. Sign out, then sign in with the owner’s account.</p>' : '<p class="lede">Sign in with the owner’s AquaTome account to see the figures.</p>'}
<p><a class="go" href="/cong-cu/be-cua-toi/#tai-khoan">${other ? 'Change account' : 'Sign in'}</a></p>
<p class="muted">Once signed in, open <a href="/_ab/">/_ab/</a> again.</p>
<p><a href="/">To the home page</a></p></main></body></html>`
}

/** A part that loads on its own: its data, or why it couldn't load (shown in its place, the rest of the page still renders). */
export type Failed = { failed: string }
export type Soft<T> = T | Failed
export const isFailed = (x: unknown): x is Failed => typeof x === 'object' && x !== null && !Array.isArray(x) && 'failed' in x
export const soft = <T>(what: string, p: Promise<T>): Promise<Soft<T>> => p.catch((e: unknown) => {
  console.error(`admin ${what}:`, e)
  return { failed: String((e as Error)?.message ?? e).slice(0, 300) }
})
export const unset = (what: string): Failed => ({ failed: `Not set up: ${what}.` })
export const failedBox = (what: string, f: Failed) => `<div class="failed" role="status">Couldn’t load ${esc(what)}.<code>${esc(f.failed)}</code></div>`
