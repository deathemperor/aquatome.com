import { expect, test } from 'vitest'
import { countryCodes, countryName, countryOf, isCountryCode, namesCountry, placeCountry, recordsInside, recordsOutside, SpeciesSchema, type Cell, type SpeciesRange } from '../src/index'

test('the country codes are ISO 3166-1\'s 249 and Kosovo, no old or grouping codes', () => {
  expect(countryCodes()).toHaveLength(250)
  for (const c of ['TH', 'VN', 'BR', 'CD', 'CG', 'XK', 'SS', 'CW']) expect(isCountryCode(c), c).toBe(true)
  for (const c of ['EU', 'UN', 'ZZ', 'UK', 'BU', 'ZR', 'AN', 'XA', 'th', 'THA', '']) expect(isCountryCode(c), c).toBe(false)
})

test('a name a source writes stands for its country, a name of two countries or of none for none', () => {
  const cases: [string, string | undefined][] = [
    ['Thailand', 'TH'], ['central Thailand', 'TH'], ["Thailand's", 'TH'], ['Siam', 'TH'], ['northern India', 'IN'], ['the Philippines', 'PH'],
    ['Brazilian', 'BR'], ['Indonesian', 'ID'], ['Myanmar', 'MM'], ['Burma', 'MM'], ["Côte d'Ivoire", 'CI'], ['Ivory Coast', 'CI'],
    ['DR Congo', 'CD'], ['Democratic Republic of the Congo', 'CD'], ['Republic of the Congo', 'CG'], ['Trinidad and Tobago', 'TT'],
    ['Trinidad & Tobago', 'TT'], ['USA', 'US'], ['U.S.', 'US'], ['Columbia', 'CO'], ['Viet Nam', 'VN'], ['Laos', 'LA'],
    // A narrowing word counts only when the whole name is no country.
    ['South Africa', 'ZA'], ['South Sudan', 'SS'], ['North Korea', 'KP'], ['Equatorial Guinea', 'GQ'], ['Papua New Guinea', 'PG'], ['Guinea', 'GN'],
    ['Congo', undefined], ['Korea', undefined], ['Borneo', undefined], ['Sumatra', undefined], ['Lake Malawi', undefined], ['Amazon', undefined],
    ['Netherlands Antilles', undefined], ['Guiana', undefined], ['', undefined],
  ]
  for (const [name, code] of cases) expect(countryOf(name), name).toBe(code)
})

test('a name two countries share stands for either, as the sentence\'s reader says; never for a third', () => {
  expect(namesCountry('Congo', 'CG')).toBe(true)
  expect(namesCountry('Congo', 'CD')).toBe(true)
  expect(namesCountry('Congo', 'GA')).toBe(false)
  expect(namesCountry('Korea', 'KR')).toBe(true)
  expect(namesCountry('southern Korea', 'KR')).toBe(true)
  expect(namesCountry('Korea', 'JP')).toBe(false)
  expect(namesCountry('Thailand', 'TH')).toBe(true)
  expect(namesCountry('Borneo', 'ID')).toBe(false)
})

test('a country place page is its country; a region or a name of two countries is none', () => {
  expect(placeCountry('thailand')).toBe('TH')
  expect(placeCountry('democratic-republic-of-the-congo')).toBe('CD')
  expect(placeCountry('d-r-congo')).toBe('CD')
  expect(placeCountry('cote-d-ivoire')).toBe('CI')
  expect(placeCountry('trinidad-and-tobago')).toBe('TT')
  expect(placeCountry('united-states')).toBe('US')
  expect(placeCountry('congo')).toBeUndefined()
  expect(placeCountry('central-africa')).toBeUndefined()
  expect(placeCountry('rio-negro')).toBeUndefined()
})

test('a country\'s name in each language', () => {
  expect(countryName('TH', 'vi')).toBe('Thái Lan')
  expect(countryName('TH', 'th')).toBe('ไทย')
  expect(countryName('TH', 'id')).toBe('Thailand')
  expect(countryName('TH', 'en')).toBe('Thailand')
})

const base = { id: 'x', scientificName: 'X y', order: 'O', family: 'F', genus: 'X', group: 'other', places: [], dataCard: {}, sections: [], photos: [], videos: [], productSlots: [], updatedAt: '2026-11-04' }
const records = (r: Partial<NonNullable<SpeciesRange['records']>>) => ({ taxonKey: 1, total: 10, fetched: '2026-11-04', countries: [['TH', 6], ['AU', 4]] as [string, number][], cells: [[99.84375, 12.65625, 10, 6]] as Cell[], ...r })
const parses = (range: unknown) => SpeciesSchema.safeParse({ ...base, range }).success

test('a range parses with native countries and regions, records and cells that add up', () => {
  expect(parses({})).toBe(true)
  expect(parses({ native: { countries: ['TH'], regions: ['Chao Phraya'], sources: ['seriouslyfish'] } })).toBe(true)
  expect(parses({ native: { countries: [], regions: ['Lake Malawi'], sources: ['seriouslyfish'] } })).toBe(true)
  expect(parses({ native: { countries: ['TH'], regions: [], sources: ['seriouslyfish'] }, records: records({}) })).toBe(true)
  // No native countries: cells don't count records inside.
  expect(parses({ records: records({ cells: [[99.84375, 12.65625, 10]] }) })).toBe(true)
  expect(parses({ records: records({ total: 0, countries: [], cells: [] }) })).toBe(true)
  // Two cells on a border: one all inside, one split.
  expect(parses({ native: { countries: ['TH'], regions: [], sources: ['seriouslyfish'] }, records: records({ cells: [[98.4375, 12.65625, 4, 4], [99.84375, 12.65625, 6, 2]] }) })).toBe(true)
})

test('a range that breaks its rules does not parse', () => {
  const native = { countries: ['TH'], regions: [], sources: ['seriouslyfish'] }
  expect(parses({ native: { ...native, countries: ['XX'] } }), 'not a country').toBe(false)
  expect(parses({ native: { ...native, countries: ['th'] } }), 'lower case').toBe(false)
  expect(parses({ native: { ...native, countries: ['TH', 'TH'] } }), 'twice').toBe(false)
  expect(parses({ native: { countries: [], regions: [], sources: ['seriouslyfish'] } }), 'nothing').toBe(false)
  expect(parses({ native: { ...native, sources: [] } }), 'no source').toBe(false)
  expect(parses({ native: { ...native, sources: ['fishbase'] } }), 'not a source of ours').toBe(false)
  expect(parses({ native, records: records({ total: 11 }) }), 'cells short of total').toBe(false)
  expect(parses({ native, records: records({ countries: [['AU', 4], ['TH', 6]] }) }), 'not most first').toBe(false)
  expect(parses({ native, records: records({ cells: [[99.84375, 12.65625, 10, 11]] }) }), 'more inside than in').toBe(false)
  expect(parses({ native, records: records({ cells: [[99.84375, 12.65625, 10, 5]] }) }), 'inside short of the native countries').toBe(false)
  expect(parses({ native, records: records({ cells: [[99.84375, 12.65625, 10]] }) }), 'no inside with native countries').toBe(false)
  expect(parses({ records: records({}) }), 'inside without native countries').toBe(false)
  expect(parses({ native, records: records({ cells: [[100, 12.65625, 10, 6]] }) }), 'not a cell edge').toBe(false)
  expect(parses({ native, records: records({ cells: [[180, 12.65625, 10, 6]] }) }), 'off the map').toBe(false)
  expect(parses({ native, records: records({ cells: [[99.84375, 12.65625, 5, 3], [99.84375, 12.65625, 5, 3]] }) }), 'a cell twice').toBe(false)
  expect(parses({ native, records: records({ taxonKey: 0 }) }), 'no taxon').toBe(false)
  expect(parses({ native, records: records({ fetched: '4 Nov 2026' }) }), 'a date').toBe(false)
})

test('a native range\'s quotes name each of its countries and regions once, from its own sources', () => {
  const native = { countries: ['TH', 'MY'], regions: ['Chao Phraya'], sources: ['seriouslyfish', 'sprucepets'] }
  const quote = (source: string, countries: string[], regions: string[] = []) => ({ source, quote: 'Occurs naturally throughout central Thailand.', countries, regions })
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH'], ['Chao Phraya']), quote('sprucepets', ['MY'])] } })).toBe(true)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH', 'MY'], ['Chao Phraya'])] } }), 'one sentence for all').toBe(true)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH'], ['Chao Phraya'])] } }), 'a country with none').toBe(false)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH', 'MY'])] } }), 'a region with none').toBe(false)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH', 'MY'], ['Chao Phraya']), quote('sprucepets', ['MY'])] } }), 'a country twice').toBe(false)
  expect(parses({ native: { ...native, quotes: [quote('glaser', ['TH', 'MY'], ['Chao Phraya'])] } }), 'another source').toBe(false)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH', 'MY', 'VN'], ['Chao Phraya'])] } }), 'a country not native').toBe(false)
  expect(parses({ native: { ...native, quotes: [quote('seriouslyfish', ['TH', 'MY'], ['Chao Phraya']), quote('sprucepets', [])] } }), 'a quote that names nothing').toBe(false)
  expect(parses({ native: { ...native, quotes: [{ ...quote('seriouslyfish', ['TH', 'MY'], ['Chao Phraya']), quote: '' }] } }), 'no sentence').toBe(false)
})

test('records inside and the countries outside with the most, from GBIF\'s country field', () => {
  const r = { native: { countries: ['TH', 'MY'] }, records: { countries: [['TH', 50], ['AU', 9], ['BR', 9], ['MY', 3], ['SG', 2], ['US', 2], ['CO', 1], ['IN', 1]] as [string, number][] } }
  expect(recordsInside(r)).toBe(53)
  expect(recordsOutside(r)).toEqual([['AU', 9], ['BR', 9], ['SG', 2], ['US', 2], ['CO', 1]])
  expect(recordsInside({ records: r.records })).toBeUndefined()
  expect(recordsOutside({ native: { countries: [] }, records: r.records })).toBeUndefined()
  expect(recordsInside({ native: r.native })).toBeUndefined()
  expect(recordsInside({ native: { countries: ['VN'] }, records: r.records })).toBe(0)
})
