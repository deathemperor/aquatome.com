/**
 * The languages, one row each: the engine, the site, the Worker and the language chooser read them here. A plain module
 * with no imports, so the Worker takes it cheaply. Vietnamese comes first: it is at the root, it is the fallback, and
 * lists show the languages in this order. A language joins with its row here, `served: false`: the engine starts writing
 * it (its TARGETS, its unit words: keyed by `WrittenLang`), and the site, the Worker and the app don't see it, as they
 * read `LANGS` and `Lang`. It goes live with `served: true`: then the compiler names what the site still needs
 * (src/i18n/<lang>.json, the section words in src/lib/i18n.ts: keyed by `Lang`). Copies that have to stay written out
 * (the protocols the iOS app reads, scripts with no imports) are held to the served languages by tests.
 *
 * - served: the site has its pages and offers it; the engine writes it either way
 * - prefix: where its pages are ('' for Vietnamese, at the root; "/id" → /id/ikan/…)
 * - html: its `lang` and `hreflang` value (BCP 47)
 * - locale: numbers and dates (Intl); og: Open Graph's form of it
 * - name: its own name, as its readers write it
 * - accept: the Accept-Language base tags that ask for it ("in" is Indonesian's old code; "ms-MY" and "ms-BN" count as
 *   "ms". Standard Malay's own code, "zsm", isn't listed: browsers offer "ms" (Firefox's list has no "zsm"), and CLDR
 *   and Intl rewrite "zsm" as "ms")
 * - countries: where a reader whose browser asks for none of our languages gets it (Cloudflare's country codes); a
 *   country listed here never sees the chooser
 */
export const LANG = {
  vi: { served: true, prefix: '', html: 'vi', locale: 'vi-VN', og: 'vi_VN', name: 'Tiếng Việt', accept: ['vi'], countries: ['VN'] },
  id: { served: true, prefix: '/id', html: 'id', locale: 'id-ID', og: 'id_ID', name: 'Bahasa Indonesia', accept: ['id', 'in'], countries: ['ID'] },
  th: { served: true, prefix: '/th', html: 'th', locale: 'th-TH', og: 'th_TH', name: 'ภาษาไทย', accept: ['th'], countries: ['TH'] },
  ms: { served: false, prefix: '/ms', html: 'ms', locale: 'ms-MY', og: 'ms_MY', name: 'Bahasa Melayu', accept: ['ms'], countries: ['MY', 'BN'] },
} as const satisfies Record<string, { served: boolean; prefix: string; html: string; locale: string; og: string; name: string; accept: readonly string[]; countries: readonly string[] }>

/** Every language the engine writes, served or not, Vietnamese first. */
export type WrittenLang = keyof typeof LANG
export const WRITTEN_LANGS: readonly WrittenLang[] = Object.keys(LANG) as WrittenLang[]
/** The languages the engine translates into: all it writes but Vietnamese. */
export type WrittenOtherLang = Exclude<WrittenLang, 'vi'>
export const WRITTEN_OTHER_LANGS: readonly WrittenOtherLang[] = WRITTEN_LANGS.filter((l): l is WrittenOtherLang => l !== 'vi')

/** The languages the site serves, Vietnamese first. */
export type Lang = { [L in WrittenLang]: (typeof LANG)[L]['served'] extends true ? L : never }[WrittenLang]
export const LANGS: readonly Lang[] = WRITTEN_LANGS.filter((l): l is Lang => LANG[l].served)
/** The served languages with an address prefix: all but Vietnamese. */
export type OtherLang = Exclude<Lang, 'vi'>
export const OTHER_LANGS: readonly OtherLang[] = LANGS.filter((l): l is OtherLang => l !== 'vi')

/** The other languages' first address segments, for a pattern: "id|th". */
export const SEGMENTS = OTHER_LANGS.map(l => LANG[l].prefix.slice(1)).join('|')

/** The language whose prefix a path starts with ("/id/ikan/x/" → id); undefined for a Vietnamese path, at the root. */
export const prefixedLang = (path: string): OtherLang | undefined => OTHER_LANGS.find(l => path.startsWith(`${LANG[l].prefix}/`))

/** A language's home page: "/" for Vietnamese, "/id/" for Indonesian. */
export const homeOf = (lang: Lang) => `${LANG[lang].prefix}/`

/** The language an Accept-Language base tag ("id", "in", "th") asks for, if the site serves it. */
export const langOfTag = (base: string): Lang | undefined => LANGS.find(l => (LANG[l].accept as readonly string[]).includes(base))

/** The language a country's readers get when their browser asks for none of ours, if the site serves one for it. */
export const langOfCountry = (country: string): Lang | undefined => LANGS.find(l => (LANG[l].countries as readonly string[]).includes(country))
