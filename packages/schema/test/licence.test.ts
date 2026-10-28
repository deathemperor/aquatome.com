import { expect, test } from 'vitest'
import { filterPhotos, isAllowedLicence, type Photo } from '../src/index'

test('allows CC0, CC BY, CC BY-SA in any form', () => {
  for (const ok of ['CC0', 'CC0 1.0', 'CC BY 4.0', 'CC BY-SA 3.0', 'cc-by-sa-4.0', 'CC-BY-2.0', 'Public domain (CC0)'])
    expect(isAllowedLicence(ok), ok).toBe(true)
})
test('rejects NC, ND, unknown and empty', () => {
  for (const no of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'cc-by-nc-nd-4.0', 'All rights reserved', '', 'unknown'])
    expect(isAllowedLicence(no), no).toBe(false)
})
test('filterPhotos drops disallowed photos', () => {
  const p = (licence: string): Photo => ({ url: 'u', width: 1, height: 1, licence, author: 'a', sourceUrl: 's' })
  expect(filterPhotos([p('CC BY 4.0'), p('CC BY-NC 4.0')]).map(x => x.licence)).toEqual(['CC BY 4.0'])
})
