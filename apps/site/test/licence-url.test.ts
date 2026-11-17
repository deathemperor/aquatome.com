import { expect, test } from 'vitest'
import { ccRequiresChangeNote, licenceUrl } from '../src/lib/gallery'

// A licence's own page, which the photo credits link each licence's name to (the licences ask for that link) and
// structured data names: every CC licence by its elements and version, a country's version by its code, and none for a
// photo a source let us use (its label is empty).
test('each licence the photos carry links its own page', () => {
  expect(licenceUrl('CC BY')).toBe('https://creativecommons.org/licenses/by/4.0/')
  expect(licenceUrl('CC BY 2.0')).toBe('https://creativecommons.org/licenses/by/2.0/')
  expect(licenceUrl('CC BY-SA 4.0')).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
  expect(licenceUrl('CC BY-SA 3.0 de')).toBe('https://creativecommons.org/licenses/by-sa/3.0/de/')
  expect(licenceUrl('CC BY 3.0 us')).toBe('https://creativecommons.org/licenses/by/3.0/us/')
  // Before 17 Nov a non-commercial or no-derivatives licence linked plain BY's page.
  expect(licenceUrl('CC BY-NC 4.0')).toBe('https://creativecommons.org/licenses/by-nc/4.0/')
  expect(licenceUrl('CC BY-NC-SA 2.0')).toBe('https://creativecommons.org/licenses/by-nc-sa/2.0/')
  expect(licenceUrl('CC BY-NC-ND 4.0')).toBe('https://creativecommons.org/licenses/by-nc-nd/4.0/')
  expect(licenceUrl('CC0')).toBe('https://creativecommons.org/publicdomain/zero/1.0/')
  expect(licenceUrl('Public domain')).toBe('https://creativecommons.org/publicdomain/mark/1.0/')
  expect(licenceUrl('Unsplash License')).toBe('https://unsplash.com/license')
  expect(licenceUrl('')).toBeUndefined()
  expect(ccRequiresChangeNote('CC BY-NC 4.0')).toBe(true)
  expect(ccRequiresChangeNote('CC0')).toBe(false)
})
