import id from '../i18n/id.json'
import th from '../i18n/th.json'

/**
 * Site languages. Pages are written once, under src/pages/vi/, with Vietnamese UI text wrapped in t(); a language
 * other than Vietnamese mounts the same files at its own addresses (astro.config: i18nRoutes) and its pages get
 * their text from src/i18n/<lang>.json (key: the Vietnamese string). Internal links are written as /vi/… paths and
 * rewritten to the page's language once the page is rendered (src/middleware.ts), so a link never needs to know it.
 */
export const LANGS = ['vi', 'id', 'th'] as const
export type Lang = (typeof LANGS)[number]
export const LOCALE: Record<Lang, string> = { vi: 'vi-VN', id: 'id-ID', th: 'th-TH' }
export const OG_LOCALE: Record<Lang, string> = { vi: 'vi_VN', id: 'id_ID', th: 'th_TH' }
export const LANG_NAME: Record<Lang, string> = { vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ภาษาไทย' }

/** The language of a page, from its path or route pattern ("/id/ikan/[slug]"); anything not /id/ or /th/ is Vietnamese. */
export function langOf(path: string | URL): Lang {
  const seg = (typeof path === 'string' ? path : path.pathname).split('/')[1]
  return seg === 'id' || seg === 'th' ? seg : 'vi'
}

/** Each language's word for a Vietnamese path segment. Only fixed segments: never a page's own slug. */
const SECTIONS: Record<Exclude<Lang, 'vi'>, Record<string, string>> = {
  id: {
    ca: 'ikan', cay: 'tanaman', 'huong-dan': 'panduan', video: 'video', 'thiet-bi': 'peralatan', 'kham-pha': 'jelajah', 'cong-cu': 'alat',
    'thuat-ngu': 'istilah', 'tim-kiem': 'cari', 'gioi-thieu': 'tentang', 'lien-he': 'kontak', 'chinh-sach-bao-mat': 'kebijakan-privasi',
    'moi-cap-nhat': 'terbaru', 'phan-loai': 'taksonomi', 'nguon-goc': 'asal', nhom: 'kelompok', 'san-pham': 'produk',
  },
  th: {
    ca: 'fish', cay: 'plants', 'huong-dan': 'guides', video: 'video', 'thiet-bi': 'equipment', 'kham-pha': 'explore', 'cong-cu': 'tools',
    'thuat-ngu': 'glossary', 'tim-kiem': 'search', 'gioi-thieu': 'about', 'lien-he': 'contact', 'chinh-sach-bao-mat': 'privacy',
    'moi-cap-nhat': 'latest', 'phan-loai': 'taxonomy', 'nguon-goc': 'origin', nhom: 'groups', 'san-pham': 'products',
  },
}
/** Fixed segments below a section: /vi/cong-cu/the-tich-be/, /vi/cong-cu/den-chihiros/, /vi/cong-cu/be-cua-toi/, /vi/cong-cu/nuoi-chung/, /vi/video/kenh/<slug>/, /vi/ca/<slug>/anh/, /vi/cay/<slug>/anh/. */
const SUB: Record<Exclude<Lang, 'vi'>, { 'the-tich-be': string; 'den-chihiros': string; 'be-cua-toi': string; 'nuoi-chung': string; kenh: string; anh: string }> = {
  id: { 'the-tich-be': 'volume-akuarium', 'den-chihiros': 'lampu-chihiros', 'be-cua-toi': 'akuarium-saya', 'nuoi-chung': 'kecocokan-ikan', kenh: 'kanal', anh: 'foto' },
  th: { 'the-tich-be': 'tank-volume', 'den-chihiros': 'chihiros-light', 'be-cua-toi': 'my-tanks', 'nuoi-chung': 'tank-mates', kenh: 'channel', anh: 'photos' },
}
/** The tool pages under /vi/cong-cu/ with a word of their own in each language. */
const TOOLS = ['the-tich-be', 'den-chihiros', 'be-cua-toi', 'nuoi-chung'] as const

/** "/vi/ca/x/anh/" → "/id/ikan/x/foto/". Anything after the path (?query, #hash) is kept as it is. */
export function localizePath(lang: Lang, path: string): string {
  if (lang === 'vi' || !path.startsWith('/vi/')) return path
  const at = path.search(/[?#]/)
  const [p, tail] = at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at)]
  const seg = p.split('/') // ['', 'vi', section, ...]
  seg[1] = lang
  const section = seg[2]
  if (section && SECTIONS[lang][section]) seg[2] = SECTIONS[lang][section]!
  const tool = TOOLS.find(x => x === seg[3])
  if (section === 'cong-cu' && tool) seg[3] = SUB[lang][tool]
  if (section === 'video' && seg[3] === 'kenh' && seg.length > 5) seg[3] = SUB[lang].kenh
  if ((section === 'ca' || section === 'cay') && seg[4] === 'anh' && seg.length === 6) seg[4] = SUB[lang].anh
  return seg.join('/') + tail
}

/**
 * Every /vi/… address in a rendered page → this language's: root-relative ones and absolute ones on this site, in
 * attributes, JSON-LD and inline scripts. Tags with hreflang (the links between languages) are left as they are, and so
 * is a /vi/ inside some other address (i.ytimg.com/vi/…): it has to start the address.
 */
export function localizeLinks(html: string, lang: Lang, origin: string): string {
  // A link to a page this language doesn't have (yet) is dropped, its text kept.
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (m, attrs: string, inner: string) => {
    const href = /\bhref="(\/vi\/[^"]*)"/.exec(attrs)?.[1]
    return href && !/\bhreflang=/.test(attrs) && !served(lang, href.replace(/&amp;/g, '&')) ? inner : m
  })
  const site = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<[^>]*\\bhreflang=[^>]*>|(?<=["'(=,\\s])(${site})?(/vi/[^"'\\s()<>\\\\]*)`, 'g')
  return html.replace(re, (m, o: string | undefined, path: string | undefined) => (path === undefined ? m : (o ?? '') + localizePath(lang, path)))
}

/** "/id/ikan/x/foto/" → "/vi/ca/x/anh/": the Vietnamese form of any page's path (the form links are written in). */
export function toVi(path: string): string {
  const lang = langOf(path)
  if (lang === 'vi') return path
  const seg = path.split('/')
  const back = (m: Record<string, string>, v?: string) => Object.keys(m).find(k => m[k] === v)
  seg[1] = 'vi'
  seg[2] = back(SECTIONS[lang], seg[2]) ?? seg[2]!
  const tool = TOOLS.find(x => SUB[lang][x] === seg[3])
  if (seg[2] === 'cong-cu' && tool) seg[3] = tool
  if (seg[2] === 'video' && seg[3] === SUB[lang].kenh && seg.length > 5) seg[3] = 'kenh'
  if ((seg[2] === 'ca' || seg[2] === 'cay') && seg[4] === SUB[lang].anh && seg.length === 6) seg[4] = 'anh'
  return seg.join('/')
}

const DICTS: Record<Exclude<Lang, 'vi'>, Record<string, string>> = { id, th }
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
  return { lang, t: translator(lang), locale: LOCALE[lang] }
}

/** Page files (under src/pages/vi/) each other language has: a section joins once its pages are translated. */
const PILOT = ['index.astro', 'ca/index.astro', 'ca/[slug].astro', 'ca/[breed].astro', 'ca/[slug]/anh.astro', 'thiet-bi/index.astro', 'thiet-bi/[category].astro', 'cong-cu/index.astro', 'cong-cu/the-tich-be.astro', 'cong-cu/den-chihiros.astro', 'cong-cu/be-cua-toi.astro', 'cong-cu/nuoi-chung.astro', 'gioi-thieu/index.astro', 'lien-he/index.astro', 'chinh-sach-bao-mat/index.astro', 'huong-dan/index.astro', 'huong-dan/[slug].astro', 'cay/index.astro', 'cay/[slug].astro', 'cay/[slug]/anh.astro', 'tim-kiem/index.astro', 'thuat-ngu/index.astro', 'thuat-ngu/[slug].astro', 'nhom/[group].astro', 'phan-loai/[...path].astro', 'nguon-goc/[...path].astro']
export const PAGES: Record<Exclude<Lang, 'vi'>, string[]> = { id: PILOT, th: PILOT }
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

/** A photo's licence as shown: the permission note stored in Vietnamese is translated; licence names (CC BY…) stay. */
export const licenceLabel = (t: T, licence: string) => (licence === 'dùng với sự cho phép' ? t('dùng với sự cho phép') : licence)
