import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { gbifMatch, type Taxon } from '../src/gbif'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/gbif/${n}.json`, import.meta.url), 'utf8'))

test('exact match gives taxonomy and is cached', async () => {
  let calls = 0
  const http = async (url: string) => { calls++; expect(url).toContain('name=Paracheirodon%20axelrodi'); return fx('paracheirodon-axelrodi') }
  const cache: Record<string, Taxon | null> = {}
  const t = await gbifMatch('Paracheirodon axelrodi', http, cache)
  expect(t).toEqual({ canonicalName: 'Paracheirodon axelrodi', order: 'Characiformes', family: 'Characidae', genus: 'Paracheirodon', matchType: 'EXACT' })
  await gbifMatch('Paracheirodon axelrodi', http, cache)
  expect(calls).toBe(1)
})

test('NONE and genus-only matches are null', async () => {
  expect(await gbifMatch('Notafishus imaginarius', async () => fx('none'), {})).toBeNull()
  expect(await gbifMatch('Paracheirodon sp.', async () => ({ ...fx('paracheirodon-axelrodi'), matchType: 'HIGHERRANK', rank: 'GENUS', canonicalName: 'Paracheirodon' }), {})).toBeNull()
})

test('synonym resolves to the accepted species name', async () => {
  const syn = { ...fx('paracheirodon-axelrodi'), canonicalName: 'Cheirodon axelrodi', status: 'SYNONYM', species: 'Paracheirodon axelrodi' }
  expect((await gbifMatch('Cheirodon axelrodi', async () => syn, {}))?.canonicalName).toBe('Paracheirodon axelrodi')
})

test('GBIF photo licences come from the photo itself: open URLs and codes only, never the record\'s', async () => {
  const { gbifLicence } = await import('../src/gbif')
  expect(gbifLicence('http://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0')
  expect(gbifLicence('https://creativecommons.org/licenses/by-sa/3.0/legalcode')).toBe('CC BY-SA 3.0')
  expect(gbifLicence('http://creativecommons.org/publicdomain/zero/1.0/legalcode')).toBe('CC0 1.0')
  expect(gbifLicence('CC_BY_4_0')).toBe('CC BY 4.0')
  expect(gbifLicence('CC0_1_0')).toBe('CC0 1.0')
  expect(gbifLicence('http://creativecommons.org/publicdomain/mark/1.0/')).toBe('Public Domain Mark 1.0')
  for (const l of ['http://creativecommons.org/licenses/by-nc/4.0/', 'http://creativecommons.org/licenses/by-nc-nd/4.0/', 'CC_BY_NC_4_0', 'Usage Conditions Apply', 'All rights reserved', '', undefined]) expect(gbifLicence(l)).toBeUndefined()
})

test('GBIF photos: observations and living collections, not iNaturalist\'s copy; the photo\'s own open licence; measured ≥ 800 px; GBIF\'s cached copy', async () => {
  const { gbifImage, gbifMediaPage, INAT_DATASET } = await import('../src/gbif')
  const urls: string[] = []
  const occ = (key: number, datasetKey: string, license: string, creator = 'Ann') => ({ key, datasetKey, recordedBy: 'Rec', media: [{ type: 'StillImage', identifier: `https://obs.example/${key}.jpg`, license, creator }] })
  const http = async (u: string) => { urls.push(u); return { endOfRecords: false, results: [occ(1, 'x', 'http://creativecommons.org/licenses/by/4.0/'), occ(2, INAT_DATASET, 'CC0_1_0'), occ(3, 'x', 'Usage Conditions Apply'), occ(4, 'x', 'CC0_1_0'), { key: 5, datasetKey: 'x', media: [{ type: 'Sound', identifier: 'a', license: 'CC0_1_0' }] }] } }
  const size = async (u: string) => (u.includes(gbifImage(4, 'https://obs.example/4.jpg', '1200x')) ? { width: 600, height: 400 } : { width: 1200, height: 900 })
  const p = await gbifMediaPage(2353909, 0, http, size)
  expect(urls[0]).toContain('taxonKey=2353909&mediaType=StillImage')
  expect(urls[0]).not.toContain('PRESERVED_SPECIMEN')
  expect(urls[0]).toContain('basisOfRecord=LIVING_SPECIMEN')
  expect(p.cands).toEqual([{
    key: expect.stringMatching(/^gbif:1:[0-9a-f]{16}$/), url: gbifImage(1, 'https://obs.example/1.jpg', '1200x'), thumb: gbifImage(1, 'https://obs.example/1.jpg', '500x'),
    width: 1200, height: 900, licence: 'CC BY 4.0', author: 'Ann', sourceUrl: 'https://www.gbif.org/occurrence/1',
  }])
  expect(p.cands[0]!.url).toMatch(/^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/1200x\/occurrence\/1\/media\/[0-9a-f]{32}$/)
  expect(p.next).toBe(100)
})
