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
/** Fixed segments below a section: /vi/cong-cu/the-tich-be/, /vi/video/kenh/<slug>/, /vi/ca/<slug>/anh/. */
const SUB: Record<Exclude<Lang, 'vi'>, { 'the-tich-be': string; kenh: string; anh: string }> = {
  id: { 'the-tich-be': 'volume-akuarium', kenh: 'kanal', anh: 'foto' },
  th: { 'the-tich-be': 'tank-volume', kenh: 'channel', anh: 'photos' },
}

/** "/vi/ca/x/anh/" → "/id/ikan/x/foto/". Anything after the path (?query, #hash) is kept as it is. */
export function localizePath(lang: Lang, path: string): string {
  if (lang === 'vi' || !path.startsWith('/vi/')) return path
  const at = path.search(/[?#]/)
  const [p, tail] = at < 0 ? [path, ''] : [path.slice(0, at), path.slice(at)]
  const seg = p.split('/') // ['', 'vi', section, ...]
  seg[1] = lang
  const section = seg[2]
  if (section && SECTIONS[lang][section]) seg[2] = SECTIONS[lang][section]!
  if (section === 'cong-cu' && seg[3] === 'the-tich-be') seg[3] = SUB[lang]['the-tich-be']
  if (section === 'video' && seg[3] === 'kenh' && seg.length > 5) seg[3] = SUB[lang].kenh
  if (section === 'ca' && seg[4] === 'anh' && seg.length === 6) seg[4] = SUB[lang].anh
  return seg.join('/') + tail
}

/**
 * Every /vi/… address in a rendered page → this language's: root-relative ones and absolute ones on this site, in
 * attributes, JSON-LD and inline scripts. Tags with hreflang (the links between languages) are left as they are, and so
 * is a /vi/ inside some other address (i.ytimg.com/vi/…): it has to start the address.
 */
export function localizeLinks(html: string, lang: Lang, origin: string): string {
  const site = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<[^>]*\\bhreflang=[^>]*>|(?<=["'(=,\\s])(${site})?(/vi/[^"'\\s()<>\\\\]*)`, 'g')
  return html.replace(re, (m, o: string | undefined, path: string | undefined) => (path === undefined ? m : (o ?? '') + localizePath(lang, path)))
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
export const PAGES: Record<Exclude<Lang, 'vi'>, string[]> = { id: [], th: [] }
/** A page file's address in a language: "ca/[slug]/anh.astro" → "/id/ikan/[slug]/foto". */
export const routeIn = (lang: Lang, file: string) =>
  localizePath(lang, `/vi/${file.replace(/\.astro$/, '').replace(/(^|\/)index$/, '')}/`.replace(/\/\/$/, '/')).replace(/(.)\/$/, '$1')
