import { LANG, OTHER_LANGS, type Lang, type OtherLang } from '@aq/schema/langs'
import id from '../i18n/id.json' with { type: 'json' }
import th from '../i18n/th.json' with { type: 'json' }
import ms from '../i18n/ms.json' with { type: 'json' }
import { withoutVi } from '../../worker/paths.ts'

/**
 * Site languages. Pages are written once, in Vietnamese, with the UI text wrapped in t(): Vietnamese pages are at the
 * root (src/pages/ca/… → /ca/…), and a language other than Vietnamese mounts the same files at its own addresses
 * (astro.config: i18nRoutes, /id/ikan/…) and gets its text from src/i18n/<lang>.json (key: the Vietnamese string).
 * Internal links are written as /vi/… paths, a marker no page is served at, and rewritten to the page's language once
 * the page is rendered (src/middleware.ts): /vi/ca/x/ is /ca/x/ on a Vietnamese page, /id/ikan/x/ on an Indonesian one.
 * So a link never needs to know the page's language. Old /vi/… addresses 301 to the root (worker/paths.ts).
 */
export { LANG, LANGS, OTHER_LANGS, type Lang, type OtherLang } from '@aq/schema/langs'

/** The language of a page, from its path or route pattern ("/id/ikan/[slug]"); anything not under another language's prefix is Vietnamese. */
export function langOf(path: string | URL): Lang {
  const seg = (typeof path === 'string' ? path : path.pathname).split('/')[1]
  return OTHER_LANGS.find(l => LANG[l].prefix === `/${seg}`) ?? 'vi'
}

/** Each language's word for a Vietnamese path segment. Only fixed segments: never a page's own slug. */
const SECTIONS: Record<OtherLang, Record<string, string>> = {
  id: {
    ca: 'ikan', cay: 'tanaman', 'huong-dan': 'panduan', video: 'video', 'thiet-bi': 'peralatan', 'kham-pha': 'jelajah', 'cong-cu': 'alat',
    'thuat-ngu': 'istilah', 'tim-kiem': 'cari', 'gioi-thieu': 'tentang', 'lien-he': 'kontak', 'chinh-sach-bao-mat': 'kebijakan-privasi',
    'moi-cap-nhat': 'terbaru', 'phan-loai': 'taksonomi', 'nguon-goc': 'asal', nhom: 'kelompok', 'san-pham': 'produk', 'ung-dung': 'aplikasi',
  },
  th: {
    ca: 'fish', cay: 'plants', 'huong-dan': 'guides', video: 'video', 'thiet-bi': 'equipment', 'kham-pha': 'explore', 'cong-cu': 'tools',
    'thuat-ngu': 'glossary', 'tim-kiem': 'search', 'gioi-thieu': 'about', 'lien-he': 'contact', 'chinh-sach-bao-mat': 'privacy',
    'moi-cap-nhat': 'latest', 'phan-loai': 'taxonomy', 'nguon-goc': 'origin', nhom: 'groups', 'san-pham': 'products', 'ung-dung': 'mobile-app',
  },
  // Malaysia's words, not Indonesia's (tumbuhan, hubungi, dasar privasi, terkini, kumpulan): the ones its UI text uses.
  ms: {
    ca: 'ikan', cay: 'tumbuhan', 'huong-dan': 'panduan', video: 'video', 'thiet-bi': 'peralatan', 'kham-pha': 'teroka', 'cong-cu': 'alat',
    'thuat-ngu': 'istilah', 'tim-kiem': 'cari', 'gioi-thieu': 'tentang', 'lien-he': 'hubungi', 'chinh-sach-bao-mat': 'dasar-privasi',
    'moi-cap-nhat': 'terkini', 'phan-loai': 'taksonomi', 'nguon-goc': 'asal', nhom: 'kumpulan', 'san-pham': 'produk', 'ung-dung': 'aplikasi',
  },
}
/** Fixed segments below a section: /vi/cong-cu/the-tich-be/, /vi/cong-cu/den-chihiros/, /vi/cong-cu/be-cua-toi/, /vi/cong-cu/nuoi-chung/, /vi/cong-cu/nhan-dien-ca/, /vi/cong-cu/du-toan-be/, /vi/gioi-thieu/bang-du-lieu/, /vi/video/kenh/<slug>/, /vi/ca/<slug>/anh/, /vi/cay/<slug>/anh/, /vi/huong-dan/trang/<n>/ (and any list's numbered page, /vi/cay/trang/<n>/, /vi/nhom/<group>/trang/<n>/). */
const SUB: Record<OtherLang, { 'the-tich-be': string; 'den-chihiros': string; 'be-cua-toi': string; 'nuoi-chung': string; 'nhan-dien-ca': string; 'du-toan-be': string; 'bang-du-lieu': string; kenh: string; anh: string; trang: string }> = {
  id: { 'the-tich-be': 'volume-akuarium', 'den-chihiros': 'lampu-chihiros', 'be-cua-toi': 'akuarium-saya', 'nuoi-chung': 'kecocokan-ikan', 'nhan-dien-ca': 'kenali-ikan', 'du-toan-be': 'anggaran-akuarium', 'bang-du-lieu': 'tabel-data', kenh: 'kanal', anh: 'foto', trang: 'halaman' },
  th: { 'the-tich-be': 'tank-volume', 'den-chihiros': 'chihiros-light', 'be-cua-toi': 'my-tanks', 'nuoi-chung': 'tank-mates', 'nhan-dien-ca': 'fish-id', 'du-toan-be': 'tank-budget', 'bang-du-lieu': 'data-table', kenh: 'channel', anh: 'photos', trang: 'page' },
  ms: { 'the-tich-be': 'isi-padu-tangki', 'den-chihiros': 'lampu-chihiros', 'be-cua-toi': 'tangki-saya', 'nuoi-chung': 'rakan-setangki', 'nhan-dien-ca': 'kenal-pasti-ikan', 'du-toan-be': 'bajet-tangki', 'bang-du-lieu': 'jadual-data', kenh: 'saluran', anh: 'foto', trang: 'halaman' },
}
/** A list's numbered page, ["", "vi", "huong-dan", "trang", "2", ""]: the page word, then its number (or the route's [n]), last. */
const numbered = (seg: string[], word: string) => seg.length >= 6 && seg.at(-3) === word && /^(\d+|\[n\])$/.test(seg.at(-2)!) && seg.at(-1) === ''
/** The tool pages under /vi/cong-cu/ with a word of their own in each language. */
const TOOLS = ['the-tich-be', 'den-chihiros', 'be-cua-toi', 'nuoi-chung', 'nhan-dien-ca', 'du-toan-be'] as const

/** "/vi/ca/x/anh/" → "/ca/x/anh/" (Vietnamese), "/id/ikan/x/foto/". Anything after the path (?query, #hash) is kept as it is. */
export function localizePath(lang: Lang, path: string): string {
  if (!path.startsWith('/vi/')) return path
  if (lang === 'vi') return withoutVi(path)
  const at = path.search(/[?#]/)
  const [p, tail] = at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at)]
  const seg = p.split('/') // ['', 'vi', section, ...]
  seg[1] = LANG[lang].prefix.slice(1)
  const section = seg[2]
  if (section && SECTIONS[lang][section]) seg[2] = SECTIONS[lang][section]!
  const tool = TOOLS.find(x => x === seg[3])
  if (section === 'cong-cu' && tool) seg[3] = SUB[lang][tool]
  if (section === 'gioi-thieu' && seg[3] === 'bang-du-lieu') seg[3] = SUB[lang]['bang-du-lieu']
  if (section === 'video' && seg[3] === 'kenh' && seg.length > 5) seg[3] = SUB[lang].kenh
  if ((section === 'ca' || section === 'cay') && seg[4] === 'anh' && seg.length === 6) seg[4] = SUB[lang].anh
  if (numbered(seg, 'trang')) seg[seg.length - 3] = SUB[lang].trang
  return seg.join('/') + tail
}

/**
 * The apps' addresses: what the app index, its page copies and fish ID's answers give for a page. The installed iOS app
 * matches Vietnamese pages by their /vi/… form (its tool tabs and group shelves by the words), so they keep it until the
 * app reads both forms. Then APP_VI_ROOT turns on, and the index, the copies and fish ID move to the root in one deploy.
 */
export const APP_VI_ROOT = false
export const appPath = (lang: Lang, path: string) => (lang === 'vi' && !APP_VI_ROOT ? path : localizePath(lang, path))
/** localizeLinks for the apps' copies of a page's text (APP_VI_ROOT). */
export const appLinks = (html: string, lang: Lang, origin: string) => (lang === 'vi' && !APP_VI_ROOT ? html : localizeLinks(html, lang, origin))

/**
 * Every /vi/… address in a rendered page → this language's: root-relative ones and absolute ones on this site (`origin`,
 * one or more), in attributes, JSON-LD and inline scripts. Tags with hreflang (the links between languages) are left as
 * they are, and so is a /vi/ inside some other address (i.ytimg.com/vi/…): it has to start the address.
 */
export function localizeLinks(html: string, lang: Lang, origin: string | string[]): string {
  // This site's addresses: each origin, and its protocol-relative form (//aquatome.com/…).
  const site = [origin].flat().filter(Boolean).flatMap(o => [o, o.replace(/^[a-z]+:/i, '')]).map(o => o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // A link to a page this language doesn't have (yet) is dropped, its text kept: root-relative or absolute on this site,
  // as both are rewritten below (an absolute /vi/vat-lieu/ link on an Indonesian page would become a /id/ one with no page).
  // Either quote, any case: every form the rewriting below takes.
  const own = new RegExp(`\\bhref\\s*=\\s*(["'])(?:${site})?(/vi/(?:(?!\\1).)*)\\1`, 'i')
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, attrs: string, inner: string) => {
    const href = own.exec(attrs)?.[2]
    return href && !/\bhreflang\s*=/i.test(attrs) && !served(lang, href.replace(/&amp;/g, '&')) ? inner : m
  })
  // Structured data names a page by its address alone: one this language doesn't have points at the Vietnamese page,
  // which is there, never at a /id/ address with no page.
  if (lang !== 'vi') {
    const inData = new RegExp(`(?<=["'])(${site})?(/vi/[^"'\\s()<>\\\\]*)`, 'g')
    html = html.replace(/(<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open: string, body: string, close: string) =>
      open + body.replace(inData, (u, o: string | undefined, path: string) => (served(lang, path) ? u : (o ?? '') + localizePath('vi', path))) + close)
  }
  const re = new RegExp(`<[^>]*\\bhreflang=[^>]*>|(?<=["'(=,\\s])(${site})?(/vi/[^"'\\s()<>\\\\]*)`, 'g')
  return html.replace(re, (m, o: string | undefined, path: string | undefined) => (path === undefined ? m : (o ?? '') + localizePath(lang, path)))
}

/** "/id/ikan/x/foto/" → "/vi/ca/x/anh/", "/ca/x/" → "/vi/ca/x/": the form links are written in, of any page's path. */
export function toVi(path: string): string {
  const lang = langOf(path)
  if (lang === 'vi') return /^\/vi(\/|$)/.test(path) ? path : `/vi${path}`
  const seg = path.split('/')
  const back = (m: Record<string, string>, v?: string) => Object.keys(m).find(k => m[k] === v)
  seg[1] = 'vi'
  seg[2] = back(SECTIONS[lang], seg[2]) ?? seg[2]!
  const tool = TOOLS.find(x => SUB[lang][x] === seg[3])
  if (seg[2] === 'cong-cu' && tool) seg[3] = tool
  if (seg[2] === 'gioi-thieu' && seg[3] === SUB[lang]['bang-du-lieu']) seg[3] = 'bang-du-lieu'
  if (seg[2] === 'video' && seg[3] === SUB[lang].kenh && seg.length > 5) seg[3] = 'kenh'
  if ((seg[2] === 'ca' || seg[2] === 'cay') && seg[4] === SUB[lang].anh && seg.length === 6) seg[4] = 'anh'
  if (numbered(seg, SUB[lang].trang)) seg[seg.length - 3] = 'trang'
  return seg.join('/')
}

const DICTS: Record<OtherLang, Record<string, string>> = { id, th, ms }
type Missing = Map<Lang, Set<string>>
/** UI strings a page asked for that its language has no translation for (the build fails on any: see i18nRoutes). */
export const missing: Missing = ((globalThis as { __aqI18nMissing?: Missing }).__aqI18nMissing ??= new Map())

export type T = (s: string, vars?: Record<string, string | number>) => string
/** t('Các dòng và cá lai từ {name}', { name }): the Vietnamese string, or its translation; {name} filled in either way. */
export function translator(lang: Lang): T {
  return (s, vars) => {
    let out = s
    if (lang !== 'vi') {
      const d = DICTS[lang][s]
      if (d === undefined) (missing.get(lang) ?? missing.set(lang, new Set()).get(lang)!).add(s)
      else out = d
    }
    return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out
  }
}

/** In a page or component: const { t, lang } = i18n(Astro.url). */
export const i18n = (url: URL) => {
  const lang = langOf(url)
  return { lang, t: translator(lang), locale: LANG[lang].locale }
}

/** Page files (under src/pages/) each other language has: a section joins once its pages are translated. */
const PILOT = ['index.astro', 'ca/index.astro', 'ca/[slug].astro', 'ca/[breed].astro', 'ca/[slug]/anh.astro', 'thiet-bi/index.astro', 'thiet-bi/[category].astro', 'cong-cu/index.astro', 'cong-cu/the-tich-be.astro', 'cong-cu/den-chihiros.astro', 'cong-cu/be-cua-toi.astro', 'cong-cu/nuoi-chung.astro', 'cong-cu/nhan-dien-ca.astro', 'cong-cu/du-toan-be.astro', 'gioi-thieu/index.astro', 'gioi-thieu/bang-du-lieu.astro', 'lien-he/index.astro', 'chinh-sach-bao-mat/index.astro', 'huong-dan/index.astro', 'huong-dan/[slug].astro', 'huong-dan/trang/[n].astro', 'cay/index.astro', 'cay/[slug].astro', 'cay/[slug]/anh.astro', 'cay/trang/[n].astro', 'tim-kiem/index.astro', 'thuat-ngu/index.astro', 'thuat-ngu/[slug].astro', 'nhom/[group].astro', 'nhom/[group]/trang/[n].astro', 'phan-loai/[...path].astro', 'nguon-goc/[...path].astro', 'ung-dung/[...path].astro']
// Malay has no setup budget (cong-cu/du-toan-be) until Malaysia's electricity tariff is researched (scripts/budget.ts TARIFFS).
export const PAGES: Record<OtherLang, string[]> = { id: PILOT, th: PILOT, ms: PILOT.filter(f => f !== 'cong-cu/du-toan-be.astro') }
const segments = (file: string) => file.replace(/\.astro$/, '').replace(/(^|\/)index$/, '').split('/').filter(Boolean)
/** A page file's address in a language: "ca/[slug]/anh.astro" → "/id/ikan/[slug]/foto". */
export const routeIn = (lang: Lang, file: string) => localizePath(lang, `/vi/${segments(file).map(s => `${s}/`).join('')}`).replace(/(.)\/$/, '$1')

const patterns = new Map<Lang, RegExp[]>()
/** Does this language have the page at this Vietnamese path ("/vi/ca/x/?q" → the ca/[slug] file)? Vietnamese has every page. */
export function served(lang: Lang, viPath: string): boolean {
  if (lang === 'vi') return true
  let ps = patterns.get(lang)
  if (!ps) {
    // A [...rest] segment also matches nothing: the section's own index (/vi/nguon-goc/).
    ps = PAGES[lang].map(f => new RegExp(`^/vi/${segments(f).map(s => (s.startsWith('[...') ? '(?:.+/)?' : `${s.startsWith('[') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`)).join('')}$`))
    patterns.set(lang, ps)
  }
  const path = viPath.replace(/[?#].*$/, '')
  return ps.some(p => p.test(path))
}

/**
 * Where the language menu takes a reader: this page in that language when it has one (`here`), else the nearest page
 * above it that the language has (a fish without a Thai page: the Thai fish list), else that language's home.
 */
export function switchTo(lang: Lang, viPath: string, here: string | undefined, hasParams: boolean): string {
  if (here) return here
  // A page with a slug has no counterpart under the same path: start from its section.
  let p = !/^\/vi\/(.+\/)?$/.test(viPath) ? '/vi/' : hasParams ? viPath.replace(/^(\/vi\/[^/]+\/).*$/, '$1') : viPath
  while (p !== '/vi/' && !served(lang, p)) p = p.replace(/[^/]+\/$/, '')
  return localizePath(lang, p)
}

/** Text written in Vietnamese (letters only Vietnamese uses): a cited page's title, marked as such on the other languages' pages. */
export { isVietnamese } from '@aq/schema/text'

/** A photo's licence as shown: its name (CC BY…), none for a photo a source let us use (stored as its permission note). */
export const licenceLabel = (licence: string) => (licence === 'dùng với sự cho phép' ? '' : licence)
