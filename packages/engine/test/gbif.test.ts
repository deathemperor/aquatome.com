import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { gbifMatch, type Taxon } from '../src/gbif'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/gbif/${n}.json`, import.meta.url), 'utf8'))

test('exact match gives taxonomy and is cached', async () => {
  let calls = 0
  const http = async (url: string) => { calls++; expect(url).toContain('name=Paracheirodon%20axelrodi'); return fx('paracheirodon-axelrodi') }
  const cache: Record<string, Taxon | null> = {}
  const t = await gbifMatch('Paracheirodon axelrodi', http, cache)
  expect(t).toEqual({ canonicalName: 'Paracheirodon axelrodi', phylum: 'Chordata', order: 'Characiformes', family: 'Characidae', genus: 'Paracheirodon', matchType: 'EXACT' })
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

// GBIF's checklists for a species too new for the backbone (2026-11-06: Nanosphronemus gemma, ZooBank's and WoRMS's).
const ZOOBANK = { key: 342200259, canonicalName: 'Nanosphronemus gemma', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', genus: 'Nanosphronemus', parentKey: 342200258 }
const WORMS = { key: 337702446, canonicalName: 'Nanosphronemus gemma', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Nanosphronemus', parentKey: 337702445 }
const searching = (results: object[], genus: object = {}) => {
  const urls: string[] = []
  return { urls, http: async (u: string) => { urls.push(u); return u.includes('/species/search') ? { results } : u.includes('/species/match') ? { matchType: 'NONE' } : genus } }
}

test('a species the backbone lacks: one ACCEPTED SPECIES of exactly that name in the checklists, placed by a record that gives its family', async () => {
  const { gbifSearchTaxon } = await import('../src/gbif')
  const s = searching([ZOOBANK, WORMS, { ...WORMS, canonicalName: 'Nanosphronemus gemmae' }])
  expect(await gbifSearchTaxon('Nanosphronemus gemma', s.http)).toEqual({ canonicalName: 'Nanosphronemus gemma', order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Nanosphronemus', matchType: 'SEARCH' })
  expect(s.urls[0]).toBe('https://api.gbif.org/v1/species/search?q=Nanosphronemus%20gemma&rank=SPECIES&status=ACCEPTED&limit=50')
  // No record gives the family: its genus's does.
  const g = searching([ZOOBANK], { canonicalName: 'Nanosphronemus', rank: 'GENUS', order: 'Anabantiformes', family: 'Osphronemidae' })
  expect((await gbifSearchTaxon('Nanosphronemus gemma', g.http))?.family).toBe('Osphronemidae')
  expect(g.urls[1]).toBe('https://api.gbif.org/v1/species/342200258')
})

test('the checklists\' fallback stays narrow: a near name, a synonym, another rank, no family anywhere, or two families give nothing', async () => {
  const { gbifSearchTaxon } = await import('../src/gbif')
  const none = async (results: object[], genus: object = {}) => gbifSearchTaxon('Nanosphronemus gemma', searching(results, genus).http)
  expect(await none([{ ...WORMS, canonicalName: 'Nanosphronemus gemmae' }])).toBeNull()
  expect(await none([{ ...WORMS, canonicalName: 'nanosphronemus gemma' }])).toBeNull()
  expect(await none([{ ...WORMS, taxonomicStatus: 'SYNONYM' }])).toBeNull()
  expect(await none([{ ...WORMS, rank: 'SUBSPECIES' }])).toBeNull()
  expect(await none([ZOOBANK], { canonicalName: 'Nanosphronemus', rank: 'GENUS' })).toBeNull()
  expect(await none([WORMS, { ...WORMS, key: 1, family: 'Anabantidae' }])).toBeNull()
  expect(await none([])).toBeNull()
})

test('a species page\'s taxon: the backbone\'s exact name first; a fuzzy match is never taken, the checklists are asked instead', async () => {
  const { speciesTaxon } = await import('../src/species-research')
  const exact = { matchType: 'EXACT', rank: 'SPECIES', status: 'ACCEPTED', canonicalName: 'Sawbwa resplendens', order: 'Cypriniformes', family: 'Cyprinidae', genus: 'Sawbwa' }
  expect(await speciesTaxon('Sawbwa resplendens', async () => exact)).toMatchObject({ canonicalName: 'Sawbwa resplendens', matchType: 'EXACT' })
  const urls: string[] = []
  const fuzzy = async (u: string) => { urls.push(u); return u.includes('/match') ? { ...exact, matchType: 'FUZZY', canonicalName: 'Nanochromis gemma' } : { results: [WORMS] } }
  expect(await speciesTaxon('Nanosphronemus gemma', fuzzy)).toMatchObject({ canonicalName: 'Nanosphronemus gemma', family: 'Osphronemidae', matchType: 'SEARCH' })
  expect(urls.some(u => u.includes('/species/search'))).toBe(true)
})

// Each answer as GBIF's backbone gave it on 2026-11-12: a ray-finned fish comes with no class, only its phylum and order.
test('a page\'s species: an exact match on its name or a synonym first, a fuzzy one only of an animal its group can be; none of a class its group can\'t be', async () => {
  const { pageTaxon } = await import('../src/gbif')
  const fish = (name: string, matchType: string, order: string) => ({ canonicalName: name, rank: 'SPECIES', status: 'ACCEPTED', matchType, phylum: 'Chordata', class: null, order })
  const answers: Record<string, unknown> = {
    // "Brochis arcuata" matched a tube worm's synonym, and the engine made a catfish page Ditrupa arietina. Asked the right
    // way now (MISMATCHED), so another spelling stands in: one no person has listed still meets the group check.
    'Brochis arcuatum': { canonicalName: 'Ditrupa arcuata', species: 'Ditrupa arietina', rank: 'SPECIES', status: 'SYNONYM', matchType: 'FUZZY', phylum: 'Annelida', class: 'Polychaeta', order: 'Sabellida', family: 'Serpulidae', genus: 'Ditrupa' },
    'Tetra ornate': { canonicalName: 'Teira ornata', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'FUZZY', phylum: 'Chordata', class: 'Squamata' },
    // A molly page named for the genus Mollienisia: GBIF's exact Mollienisia is a moth's.
    'Mollienisia': { canonicalName: 'Mollienisia', rank: 'GENUS', status: 'ACCEPTED', matchType: 'EXACT', phylum: 'Arthropoda', class: 'Insecta', order: 'Lepidoptera', family: 'Noctuidae' },
    'Corydoras arcuatus': fish('Corydoras arcuatus', 'EXACT', 'Siluriformes'),
    'Corydoras sterbai': fish('Corydoras sterbai', 'EXACT', 'Siluriformes'),
    'Hyphessobrycon herbertaxelrodii': fish('Hyphessobrycon herbertaxelrodi', 'FUZZY', 'Characiformes'),
    'Polypterus senegalis': fish('Polypterus senegalus', 'FUZZY', 'Polypteriformes'),
    'Neocaridina davidii': { canonicalName: 'Neocaridina davidi', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'FUZZY', phylum: 'Arthropoda', class: 'Malacostraca', order: 'Decapoda' },
    'Mespilia globulus': { canonicalName: 'Mespilia globulus', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', phylum: 'Echinodermata', class: 'Echinoidea', order: 'Camarodonta' },
    'Barbronia weberi': { canonicalName: 'Barbronia weberi', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', phylum: 'Annelida', class: 'Clitellata', order: 'Euhirudinea' },
  }
  const cache: Record<string, Taxon | null> = {}
  const match = (n: string) => gbifMatch(n, async (u: string) => answers[decodeURIComponent(u.split('name=')[1]!)] ?? fx('none'), cache)
  const name = async (names: string[], group: string | undefined) => (await pageTaxon(names, group, match))?.canonicalName ?? null
  // The worm, the lizard and the moth are refused; a page's other name that matches exactly is taken.
  expect(await name(['Brochis arcuatum'], 'catfish')).toBeNull()
  expect(await name(['Brochis arcuatum'], 'other')).toBeNull()
  expect(await name(['Brochis arcuatum'], undefined)).toBeNull()
  expect(await name(['Brochis arcuatum', 'Corydoras arcuatus'], 'catfish')).toBe('Corydoras arcuatus')
  expect(await name(['Tetra ornate'], 'tetras')).toBeNull()
  expect(await name(['Mollienisia'], 'livebearers')).toBeNull()
  // A misspelt fish, with no class from GBIF, is still its fish; an exact one too.
  expect(await name(['Hyphessobrycon herbertaxelrodii'], 'tetras')).toBe('Hyphessobrycon herbertaxelrodi')
  expect(await name(['Polypterus senegalis'], 'other')).toBe('Polypterus senegalus')
  expect(await name(['Corydoras sterbai'], 'catfish')).toBe('Corydoras sterbai')
  expect(await name(['Hyphessobrycon herbertaxelrodii'], 'shrimp')).toBeNull()
  // A shrimp for a shrimp, not for a tetra; the urchin and the leech on their own pages.
  expect(await name(['Neocaridina davidii'], 'shrimp')).toBe('Neocaridina davidi')
  expect(await name(['Neocaridina davidii'], 'tetras')).toBeNull()
  expect(await name(['Mespilia globulus'], 'other')).toBe('Mespilia globulus')
  expect(await name(['Barbronia weberi'], 'other')).toBe('Barbronia weberi')
})

// 2026-11-13: of the 234 names GBIF's backbone matched fuzzily, three gave another animal (the chief of staff's count).
// Each is asked the right way, whatever the engine's record of GBIF's answers says; the backbone's answers as it gave them.
test('a name a person found GBIF files under another animal is asked the right way, and its page is its own fish', async () => {
  const { pageTaxon } = await import('../src/gbif')
  const fish = (name: string, order: string, family: string) => ({ canonicalName: name, species: name, rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', phylum: 'Chordata', class: null, order, family })
  const backbone: Record<string, unknown> = {
    'Corydoras arcuatus': fish('Corydoras arcuatus', 'Siluriformes', 'Callichthyidae'),
    'Hyphessobrycon rosaceus': fish('Hyphessobrycon rosaceus', 'Characiformes', 'Characidae'),
    'Liobagrus chengduensis': { ...fish('Liobagrus chenghaiensis', 'Siluriformes', 'Amblycipitidae'), matchType: 'FUZZY' },
  }
  const checklists = [1, 2].map(key => ({ key, canonicalName: 'Liobagrus chengduensis', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', order: 'Siluriformes', family: 'Amblycipitidae', genus: 'Liobagrus' }))
  const asked: string[] = []
  const http = async (u: string) => {
    asked.push(u)
    return u.includes('/species/search') ? { results: checklists } : backbone[decodeURIComponent(u.split('name=')[1]!)] ?? { matchType: 'NONE' }
  }
  // The engine's record still holds the wrong answers it got before.
  const cache: Record<string, Taxon | null> = {
    'Brochis arcuata': { canonicalName: 'Ditrupa arietina', order: 'Sabellida', family: 'Serpulidae', matchType: 'FUZZY' },
    'Liobagrus chengduensis': { canonicalName: 'Liobagrus chenghaiensis', order: 'Siluriformes', family: 'Amblycipitidae', matchType: 'FUZZY' },
    'Megalamphodus rosaceus': { canonicalName: 'Hyphessobrycon roseus', order: 'Characiformes', family: 'Characidae', matchType: 'FUZZY' },
  }
  const match = (n: string) => gbifMatch(n, http, cache)
  const page = async (names: string[], group: string) => (await pageTaxon(names, group, match))?.canonicalName ?? null
  expect(await page(['Brochis arcuata'], 'catfish')).toBe('Corydoras arcuatus')
  expect(await page(['Brochis arcuatus'], 'catfish')).toBe('Corydoras arcuatus')
  expect(await page(['Megalamphodus rosaceus'], 'tetras')).toBe('Hyphessobrycon rosaceus')
  // Not in the backbone: the checklists GBIF indexes, exactly this name.
  expect(await match('Liobagrus chengduensis')).toMatchObject({ canonicalName: 'Liobagrus chengduensis', family: 'Amblycipitidae', matchType: 'SEARCH' })
  expect(await page(['Liobagrus chengduensis'], 'catfish')).toBe('Liobagrus chengduensis')
  expect(asked.some(u => u.includes('/species/search'))).toBe(true)
  // The wrong answers are never read, and none is written under the wrong name.
  expect(cache['Brochis arcuata']?.canonicalName).toBe('Ditrupa arietina')
  expect(cache['Corydoras arcuatus']?.canonicalName).toBe('Corydoras arcuatus')
})
