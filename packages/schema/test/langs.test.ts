import { expect, test } from 'vitest'
import { homeOf, LANG, LANGS, langOfCountry, langOfTag, OTHER_LANGS, prefixedLang, WRITTEN_LANGS, WRITTEN_OTHER_LANGS } from '../src/langs'

test('Vietnamese first, at the root; every other language under a prefix of its own', () => {
  expect(LANGS[0]).toBe('vi')
  expect(OTHER_LANGS).toEqual(LANGS.slice(1))
  expect(homeOf('vi')).toBe('/')
  const prefixes = OTHER_LANGS.map(l => LANG[l].prefix)
  for (const p of prefixes) expect(p).toMatch(/^\/[a-z][a-z-]*$/)
  expect(new Set(prefixes).size).toBe(prefixes.length)
  for (const l of OTHER_LANGS) {
    expect(prefixedLang(`${LANG[l].prefix}/x/`)).toBe(l)
    expect(prefixedLang(homeOf(l))).toBe(l)
  }
  expect(prefixedLang('/ca/x/')).toBeUndefined()
  expect(prefixedLang('/identity/')).toBeUndefined()
})

test('a browser tag or a country names at most one language', () => {
  const tags = WRITTEN_LANGS.flatMap(l => LANG[l].accept)
  const countries = WRITTEN_LANGS.flatMap(l => LANG[l].countries)
  expect(new Set(tags).size).toBe(tags.length)
  expect(new Set(countries).size).toBe(countries.length)
  expect(langOfTag('in')).toBe('id')
  expect(langOfTag('en')).toBeUndefined()
  expect(langOfCountry('VN')).toBe('vi')
  expect(langOfCountry('TH')).toBe('th')
  expect(langOfCountry('US')).toBeUndefined()
})

// A language the engine writes ahead of the site: nothing a reader reaches answers to it. If one did, a browser asking for
// it or a country listing it would go to a home page that doesn't exist.
test("a language the site doesn't serve yet is the engine's alone", () => {
  expect(LANGS).toEqual(WRITTEN_LANGS.filter(l => LANG[l].served))
  expect(WRITTEN_OTHER_LANGS).toEqual(WRITTEN_LANGS.filter(l => l !== 'vi'))
  for (const l of WRITTEN_LANGS.filter(x => !LANG[x].served)) {
    expect(OTHER_LANGS as readonly string[], l).not.toContain(l)
    expect(prefixedLang(`${LANG[l].prefix}/x/`), l).toBeUndefined()
    for (const tag of LANG[l].accept) expect(langOfTag(tag), `${l} ${tag}`).toBeUndefined()
    for (const c of LANG[l].countries) expect(langOfCountry(c), `${l} ${c}`).toBeUndefined()
  }
})

test("Malay's row", () => {
  expect(LANG.ms).toMatchObject({ prefix: '/ms', html: 'ms', locale: 'ms-MY', og: 'ms_MY', name: 'Bahasa Melayu', accept: ['ms'], countries: ['MY', 'BN'] })
  // Browsers offer "ms" and "ms-MY"; Standard Malay's "zsm" is an alias CLDR and Intl rewrite as "ms", so it isn't listed.
  expect(Intl.getCanonicalLocales('zsm')).toEqual(['ms'])
})
