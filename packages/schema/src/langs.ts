/**
 * The site's languages, one row each: the engine, the site, the Worker and the language chooser read them here. A plain
 * module with no imports, so the Worker takes it cheaply. Vietnamese comes first: it is at the root, it is the fallback,
 * and lists show the languages in this order. A language joins with its row here, then its translations (the engine's
 * TARGETS, src/i18n/<lang>.json, the section words in src/lib/i18n.ts): each of those is keyed by `Lang`, so the
 * compiler names what a new row still needs. Copies that have to stay written out (the protocols the iOS app reads,
 * scripts with no imports) are held to this table by tests.
 *
 * - prefix: where its pages are ('' for Vietnamese, at the root; "/id" → /id/ikan/…)
 * - html: its `lang` and `hreflang` value (BCP 47)
 * - locale: numbers and dates (Intl); og: Open Graph's form of it
 * - name: its own name, as its readers write it
 * - accept: the Accept-Language base tags that ask for it ("in" is Indonesian's old code)
 * - countries: where a reader whose browser asks for none of our languages gets it (Cloudflare's country codes); a
 *   country listed here never sees the chooser
 */
export const LANG = {
  vi: { prefix: '', html: 'vi', locale: 'vi-VN', og: 'vi_VN', name: 'Tiếng Việt', accept: ['vi'], countries: ['VN'] },
  id: { prefix: '/id', html: 'id', locale: 'id-ID', og: 'id_ID', name: 'Bahasa Indonesia', accept: ['id', 'in'], countries: ['ID'] },
  th: { prefix: '/th', html: 'th', locale: 'th-TH', og: 'th_TH', name: 'ภาษาไทย', accept: ['th'], countries: ['TH'] },
} as const satisfies Record<string, { prefix: string; html: string; locale: string; og: string; name: string; accept: readonly string[]; countries: readonly string[] }>

export type Lang = keyof typeof LANG
/** Every language code, Vietnamese first. */
export const LANGS: readonly Lang[] = Object.keys(LANG) as Lang[]
/** The languages with an address prefix: all but Vietnamese. */
export type OtherLang = Exclude<Lang, 'vi'>
export const OTHER_LANGS: readonly OtherLang[] = LANGS.filter((l): l is OtherLang => l !== 'vi')

/** The other languages' first address segments, for a pattern: "id|th". */
export const SEGMENTS = OTHER_LANGS.map(l => LANG[l].prefix.slice(1)).join('|')

/** The language whose prefix a path starts with ("/id/ikan/x/" → id); undefined for a Vietnamese path, at the root. */
export const prefixedLang = (path: string): OtherLang | undefined => OTHER_LANGS.find(l => path.startsWith(`${LANG[l].prefix}/`))

/** A language's home page: "/" for Vietnamese, "/id/" for Indonesian. */
export const homeOf = (lang: Lang) => `${LANG[lang].prefix}/`

/** The language an Accept-Language base tag ("id", "in", "th") asks for, if it is one of ours. */
export const langOfTag = (base: string): Lang | undefined => LANGS.find(l => (LANG[l].accept as readonly string[]).includes(base))

/** The language a country's readers get when their browser asks for none of ours, if the site has one for it. */
export const langOfCountry = (country: string): Lang | undefined => LANGS.find(l => (LANG[l].countries as readonly string[]).includes(country))
