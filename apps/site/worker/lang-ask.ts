import { homeOf, LANG, LANGS, langOfCountry, type Lang } from '@aq/schema/langs'
import { COUNTED, dt, EVENTS, eventsSql, num } from './admin/ae'
import { DISCOVERY_LINK } from './agents'
import { NOCOUNT } from '../src/lib/beacon'

/**
 * The language chooser at aquatome.com/: for a reader whose browser asks for none of our languages, from a country that
 * has none of them (worker/index.ts). Its own words in English; each language's name (the language table) and line in
 * that language (its home page's subtitle, src/i18n).
 */
export const LINE: Record<Lang, string> = { vi: 'Cẩm nang cá cảnh & thủy sinh', id: 'Panduan ikan hias & aquascape', th: 'คู่มือปลาสวยงามและตู้ไม้น้ำ', ms: 'Buku panduan ikan hiasan & aquascape' }

/** A country Cloudflare could place: not unknown (XX) or Tor (T1). */
const placed = (country: string) => /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1'
/** Countries whose language the site has (the language table's) get it (rootLang), never the chooser. */
export const asksLang = (country: string) => placed(country) && !langOfCountry(country)

/** `?lang=` on the root, from the chooser's links: one of ours, or nothing. */
export const pickedLang = (url: URL): Lang | undefined => LANGS.find(l => l === url.searchParams.get('lang'))

/** One chooser event (Analytics Engine, the readers' dataset, type `lang`): shown (path /) or picked (the link's, /?lang=id). No session. */
export const langPoint = (path: string, country: string, who = '') => ({ blobs: [who, 'lang', path, '', '', country], doubles: [1], indexes: [country] })

/** The chooser's own count, what its script sent to /_e: `/`, or `/?lang=` and one of ours. Anything else is no chooser event. */
export function chooserEvent(body: string): string | undefined {
  let e: { chooser?: unknown } | null
  try { e = JSON.parse(body) } catch { return undefined }
  const p = e && typeof e === 'object' ? e.chooser : undefined
  return p === '/' || LANGS.some(l => p === `/?lang=${l}`) ? (p as string) : undefined
}

/**
 * Counts the chooser, in the browser, as every other statistic is: a program that runs no script isn't a view. From when
 * the page is shown, not while it's only preloaded; nothing at all after «Không đếm tôi». No code and nothing kept.
 */
const COUNT = `(()=>{var go=()=>{try{if(localStorage.getItem('${NOCOUNT}'))return}catch(e){}var s=p=>navigator.sendBeacon&&navigator.sendBeacon('/_e',JSON.stringify({chooser:p}));s('/');document.addEventListener('click',e=>{var a=e.target.closest&&e.target.closest('a');a&&s('/?lang='+new URL(a.href).searchParams.get('lang'))},true)};document.prerendering?document.addEventListener('prerenderingchange',go,{once:true}):go()})()`

/** When the chooser first counted a view: until it has been up for the table's days, the table says "since". */
export const CHOOSER_FROM = '2026-11-05T19:07:00Z'
/** From this day a view is counted by the script above; before it, on the server, for every request that wasn't a known bot. */
export const CHOOSER_SCRIPT_FROM = '2026-11-10T12:00:00Z'
/**
 * Our own check counted as chooser views, left out as OUR_RUNS are and listed beside them on the readers page: Lighthouse
 * on GitHub's US machines, before it said it was ours (2026-11-05, 20:19 UTC). Sets of six loads, retried, on each live check.
 */
export const CHOOSER_OUR_RUNS = [{ cc: 'US', from: '2026-11-05T19:07:00Z', to: '2026-11-05T20:26:00Z', views: 87 }] as const

const page = (links: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>AquaTome: choose a language</title><style>
:root{color-scheme:light dark;--paper:#f3eee3;--ink:#1d2a22;--soft:#4d5a52;--rule:#d9d0bd;--moss:#2f6b4f;--kicker:#a0522d}
@media (prefers-color-scheme:dark){:root{--paper:#0b1a1e;--ink:#e6efec;--soft:#b2c6c1;--rule:#2a4a4a;--moss:#6fd6be;--kicker:#ff9b7f}}
body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:34rem;margin:0 auto;padding:clamp(2.5rem,10vh,5rem) 1.25rem 3rem}
.k{margin:0;font-size:.8125rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--kicker)}
h1{margin:.5rem 0 .75rem;font:600 clamp(1.875rem,1.4rem + 2.2vw,2.625rem)/1.15 Georgia,'Times New Roman',serif}
p{margin:0 0 2rem;color:var(--soft)}
ul{margin:0;padding:0;list-style:none;border-top:1px solid var(--rule)}
a{display:block;padding:1.125rem 0;border-bottom:1px solid var(--rule);color:inherit;text-decoration:none}
b{display:block;font:600 1.5rem/1.3 Georgia,'Noto Serif Thai',Thonburi,serif;color:var(--moss)}
span{color:var(--soft)}
a:hover b,a:focus-visible b{text-decoration:underline;text-underline-offset:.2em}
a:focus-visible{outline:2px solid var(--kicker);outline-offset:4px}
</style></head><body><main><p class="k">AquaTome</p><h1>An aquarium handbook, not in your language yet</h1><p>Fish, aquatic plants and tank care, written in four languages so far. Pick the one you read best, and aquatome.com will open in it next time.</p><ul>${links}</ul></main><script>${COUNT}</script></body></html>`

/** The chooser; its links keep the address's own query (utm_*, …) for the page they lead to. */
export const chooserPage = (search: URLSearchParams) => {
  const rest = new URLSearchParams(search)
  rest.delete('lang')
  const q = rest.size ? `&amp;${rest.toString().replace(/&/g, '&amp;')}` : ''
  const links = LANGS.map(l => `<li><a href="/?lang=${l}${q}" lang="${LANG[l].html}" hreflang="${LANG[l].html}"><b>${LANG[l].name}</b><span>${LINE[l]}</span></a></li>`).join('')
  return new Response(page(links), { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', vary: 'Accept-Language, Cookie', link: DISCOVERY_LINK, 'x-robots-tag': 'noindex',
  } })
}

/** The pick, remembered as the language menu remembers one (LangMenu.astro). */
export const langCookie = (lang: Lang) => `aq_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`

/** An Indonesian or Thai pick: remembered, then that language's home, with the rest of the query. */
export const pickResponse = (lang: Lang, search: URLSearchParams) => {
  const rest = new URLSearchParams(search)
  rest.delete('lang')
  const q = rest.size ? `?${rest}` : ''
  return new Response(null, { status: 302, headers: {
    location: `${homeOf(lang)}${q}`, 'set-cookie': langCookie(lang),
    'cache-control': 'private, no-store', link: DISCOVERY_LINK,
  } })
}

export type LangAsks = { days: number; rows: { cc: string; shown: number; picked: Record<Lang, number> }[] }
type Row = { cc: string; p: string; n: number | string }
export const LANG_SQL = (days: number, table = EVENTS) => `SELECT blob6 AS cc, blob3 AS p, SUM(_sample_interval) AS n
FROM ${table} WHERE blob2 = 'lang' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${COUNTED}${CHOOSER_OUR_RUNS.map(r => ` AND NOT (blob6 = '${r.cc}' AND timestamp >= ${dt(r.from)} AND timestamp < ${dt(r.to)})`).join('')} GROUP BY cc, p FORMAT JSON`

/** Per country, most shown first: times the chooser was shown, and each language picked. */
export function summariseAsks(rows: Row[], days: number): LangAsks {
  const by = new Map<string, LangAsks['rows'][number]>()
  for (const r of rows) {
    const x = by.get(r.cc) ?? { cc: r.cc, shown: 0, picked: Object.fromEntries(LANGS.map(l => [l, 0])) as Record<Lang, number> }
    const l = LANGS.find(l => r.p === `/?lang=${l}`)
    if (l) x.picked[l] += num(r.n)
    else if (r.p === '/') x.shown += num(r.n)
    by.set(r.cc, x)
  }
  return { days, rows: [...by.values()].sort((a, b) => b.shown - a.shown || a.cc.localeCompare(b.cc)).slice(0, 15) }
}

export const queryAsks = async (accountId: string, token: string, days = 14) => summariseAsks(await eventsSql<Row>(accountId, token, t => LANG_SQL(days, t)), days)
