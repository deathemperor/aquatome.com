import { COUNTED, EVENTS, eventsSql, num } from './admin/ae'
import { DISCOVERY_LINK } from './agents'

/**
 * The language chooser at aquatome.com/: for a reader whose browser asks for none of our languages, from a country that
 * has none of them (worker/index.ts). Its own words in English; each language's line in that language (its home page's
 * subtitle, src/i18n).
 */
export const LANGS = [
  { lang: 'vi', name: 'Tiếng Việt', line: 'Cẩm nang cá cảnh & thủy sinh', home: '/' },
  { lang: 'id', name: 'Bahasa Indonesia', line: 'Panduan ikan hias & aquascape', home: '/id/' },
  { lang: 'th', name: 'ภาษาไทย', line: 'คู่มือปลาสวยงามและตู้ไม้น้ำ', home: '/th/' },
] as const
export type Lang = (typeof LANGS)[number]['lang']

/** Countries whose language the site has: their readers get it (rootLang), never the chooser. */
const OURS = new Set(['VN', 'ID', 'TH'])
/** A country Cloudflare could place: not unknown (XX) or Tor (T1). */
const placed = (country: string) => /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1'
export const asksLang = (country: string) => placed(country) && !OURS.has(country)

/** `?lang=` on the root, from the chooser's links: one of ours, or nothing. */
export const pickedLang = (url: URL): Lang | undefined => LANGS.find(l => l.lang === url.searchParams.get('lang'))?.lang

/** One chooser event (Analytics Engine, the readers' dataset, type `lang`): shown (path /) or picked (the link's, /?lang=id). No session. */
export const langPoint = (path: string, country: string) => ({ blobs: ['', 'lang', path, '', '', country], doubles: [1], indexes: [country] })

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>AquaTome: choose a language</title><style>
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
</style></head><body><main><p class="k">AquaTome</p><h1>An aquarium handbook, not in your language yet</h1><p>Fish, aquatic plants and tank care, written in three languages so far. Pick the one you read best, and aquatome.com will open in it next time.</p><ul>${LANGS.map(l => `<li><a href="/?lang=${l.lang}" lang="${l.lang}" hreflang="${l.lang}"><b>${l.name}</b><span>${l.line}</span></a></li>`).join('')}</ul></main></body></html>`

export const chooserPage = () => new Response(PAGE, { headers: {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', vary: 'Accept-Language, Cookie', link: DISCOVERY_LINK, 'x-robots-tag': 'noindex',
} })

/** The pick: remembered as the language menu remembers one (cookie aq_lang, LangMenu.astro), then that language's home. */
export const pickResponse = (lang: Lang, search: URLSearchParams) => {
  const rest = new URLSearchParams(search)
  rest.delete('lang')
  const q = rest.size ? `?${rest}` : ''
  return new Response(null, { status: 302, headers: {
    location: `${LANGS.find(l => l.lang === lang)!.home}${q}`, 'set-cookie': `aq_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    'cache-control': 'private, no-store', link: DISCOVERY_LINK,
  } })
}

export type LangAsks = { days: number; rows: { cc: string; shown: number; picked: Record<Lang, number> }[] }
type Row = { cc: string; p: string; n: number | string }
const LANG_SQL = (days: number, table = EVENTS) => `SELECT blob6 AS cc, blob3 AS p, SUM(_sample_interval) AS n
FROM ${table} WHERE blob2 = 'lang' AND timestamp > NOW() - INTERVAL '${Math.floor(days)}' DAY AND ${COUNTED} GROUP BY cc, p FORMAT JSON`

/** Per country, most shown first: times the chooser was shown, and each language picked. */
export function summariseAsks(rows: Row[], days: number): LangAsks {
  const by = new Map<string, LangAsks['rows'][number]>()
  for (const r of rows) {
    const x = by.get(r.cc) ?? { cc: r.cc, shown: 0, picked: { vi: 0, id: 0, th: 0 } }
    const l = LANGS.find(l => r.p === `/?lang=${l.lang}`)?.lang
    if (l) x.picked[l] += num(r.n)
    else if (r.p === '/') x.shown += num(r.n)
    by.set(r.cc, x)
  }
  return { days, rows: [...by.values()].sort((a, b) => b.shown - a.shown || a.cc.localeCompare(b.cc)).slice(0, 15) }
}

export const queryAsks = async (accountId: string, token: string, days = 14) => summariseAsks(await eventsSql<Row>(accountId, token, t => LANG_SQL(days, t)), days)
