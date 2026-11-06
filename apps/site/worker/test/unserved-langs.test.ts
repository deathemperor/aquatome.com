import { expect, test } from 'vitest'
import { LANG, WRITTEN_LANGS } from '@aq/schema/langs'
import { ENTITY_RE } from '../comments/rules'
import { askedLang, chosenLang, rootLang } from '../index'
import { asksLang } from '../lang-ask'

// Until it is served, a language's readers go where they did: it has no home page to send them to.
for (const l of WRITTEN_LANGS.filter(x => !LANG[x].served)) {
  test(`${l}: no browser, cookie or country reaches it; its countries still see the chooser`, () => {
    for (const tag of LANG[l].accept) {
      expect(askedLang(`${tag}-MY,${tag};q=0.9`), tag).toBeUndefined()
      expect(askedLang(`${tag},id;q=0.5`), tag).toBe('id')
      expect(rootLang(tag), tag).toBe('vi')
    }
    expect(chosenLang(`aq_lang=${l}`)).toBeUndefined()
    for (const c of LANG[l].countries) {
      expect(rootLang(null, c), c).toBe('vi')
      expect(asksLang(c), c).toBe(true)
    }
    expect(ENTITY_RE.test(`${l}:species:x`)).toBe(false)
  })
}
