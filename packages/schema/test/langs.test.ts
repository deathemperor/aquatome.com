import { expect, test } from 'vitest'
import { homeOf, LANG, LANGS, langOfCountry, langOfTag, OTHER_LANGS, prefixedLang } from '../src/langs'

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
  const tags = LANGS.flatMap(l => LANG[l].accept)
  const countries = LANGS.flatMap(l => LANG[l].countries)
  expect(new Set(tags).size).toBe(tags.length)
  expect(new Set(countries).size).toBe(countries.length)
  expect(langOfTag('in')).toBe('id')
  expect(langOfTag('en')).toBeUndefined()
  expect(langOfCountry('VN')).toBe('vi')
  expect(langOfCountry('TH')).toBe('th')
  expect(langOfCountry('US')).toBeUndefined()
})
