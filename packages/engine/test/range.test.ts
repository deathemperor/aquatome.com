import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SpeciesSchema, type SpeciesEntity } from '@aq/schema'
import { LlmError, type Llm } from '../src/claude'
import { blocksOf, checkAnswer, sourceTier, speciesRanges, type Audit, type Block } from '../src/range'
import { SOURCES } from '../src/sources'
import { gbifClient, type Fetch } from '../src/range-records'
import { mvt } from './mvt'

// Betta splendens's two sources, as its page has them: Seriously Fish's range is central Thailand, the rest introduced
// or other species; The Spruce Pets' is Thailand, Indonesia, Malaysia, Vietnam and China.
const SF = '<p>Occurs naturally throughout central Thailand, from Chiang Rai province in the north to Surat Thani and Phang Nga provinces at the northern extremity of the Malay Peninsula, just below the Isthmus of Kra. Records from the remainder of southern (peninsular) Thailand, and the Mekong River basin in eastern Thailand, Laos, Vietnam, and Cambodia refer to other species or introduced populations.</p><p>It has been introduced to several countries, largely as a result of escape from ornamental fish farms, with known feral populations established in Singapore, Malaysia, Indonesia, Brazil, Colombia, and the Dominican Republic.</p><p>Type locality is \'Menam River, Thailand\', which refers to the Chao Phraya river basin.</p>'
const SPRUCE = '<p>Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China. They inhabit rice paddies, ponds, slow-moving streams, and swamps.</p>'
const blocks: Block[] = [{ source: 'seriouslyfish', key: 'distribution', text: SF.replace(/<[^>]+>/g, '\n').trim() }, { source: 'sprucepets', key: 'distribution', text: SPRUCE.replace(/<[^>]+>/g, '\n').trim() }]
const sf1 = 'Occurs naturally throughout central Thailand, from Chiang Rai province in the north to Surat Thani and Phang Nga provinces at the northern extremity of the Malay Peninsula, just below the Isthmus of Kra.'
const sf2 = 'Records from the remainder of southern (peninsular) Thailand, and the Mekong River basin in eastern Thailand, Laos, Vietnam, and Cambodia refer to other species or introduced populations.'
const sf3 = 'It has been introduced to several countries, largely as a result of escape from ornamental fish farms, with known feral populations established in Singapore, Malaysia, Indonesia, Brazil, Colombia, and the Dominican Republic.'
const sp1 = 'Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China.'
const BETTA = {
  countries: [
    { code: 'TH', status: 'native', source: 'seriouslyfish', quote: sf1, words: 'Thailand' },
    { code: 'VN', status: 'doubtful', source: 'seriouslyfish', quote: sf2, words: 'Vietnam' },
    { code: 'LA', status: 'doubtful', source: 'seriouslyfish', quote: sf2, words: 'Laos' },
    { code: 'MY', status: 'introduced', source: 'seriouslyfish', quote: sf3, words: 'Malaysia' },
    { code: 'ID', status: 'introduced', source: 'seriouslyfish', quote: sf3, words: 'Indonesia' },
    { code: 'TH', status: 'native', source: 'sprucepets', quote: sp1, words: 'Thailand' },
    { code: 'ID', status: 'native', source: 'sprucepets', quote: sp1, words: 'Indonesia' },
    { code: 'MY', status: 'native', source: 'sprucepets', quote: sp1, words: 'Malaysia' },
    { code: 'VN', status: 'native', source: 'sprucepets', quote: sp1, words: 'Vietnam' },
    { code: 'CN', status: 'native', source: 'sprucepets', quote: sp1, words: 'China' },
  ],
  regions: [{ name: 'Chao Phraya', source: 'seriouslyfish', quote: 'Type locality is \'Menam River, Thailand\', which refers to the Chao Phraya river basin.' }],
}

test('betta: Thailand only; China, on The Spruce Pets alone, dropped and logged; Indonesia, Malaysia, Vietnam disputed', () => {
  const r = checkAnswer(BETTA, blocks)
  expect(r.claims.every(c => c.ok)).toBe(true)
  // Seriously Fish, a specialist, says where it lives, so only its countries count.
  expect(r.native).toEqual({ countries: ['TH'], regions: ['Chao Phraya'], sources: ['seriouslyfish'] })
  expect(r.disputed).toEqual(['ID', 'MY', 'VN'])
  // China is the one a general site alone gives: kept for audit with its sentence.
  expect(r.outranked.map(c => [c.code, c.source, c.quote])).toEqual([['CN', 'sprucepets', sp1]])
})

// The clown loach's two sources, as its page has them.
const LOACH_SF = "Native to the Greater Sunda Islands of Borneo and Sumatra. In the former it's restricted to river systems of Kalimantan Barat (West Kalimantan), Kalimantan Tengah (Central Kalimantan) and Kalimantan Timur (East Kalimantan) provinces in the Indonesian portion including the Kapuas and Kayan."
const LOACH_SPRUCE = 'The clown loach hails from the rivers and tributaries of Malaysia, Borneo, Sumatra, and Kalimantan. It is eaten as a food fish in Indonesia and Borneo.'
const loach: Block[] = [{ source: 'sprucepets', key: 'distribution', text: LOACH_SPRUCE }, { source: 'seriouslyfish', key: 'distribution', text: LOACH_SF }]
const loachSf = "In the former it's restricted to river systems of Kalimantan Barat (West Kalimantan), Kalimantan Tengah (Central Kalimantan) and Kalimantan Timur (East Kalimantan) provinces in the Indonesian portion including the Kapuas and Kayan."
const loachSpruce = 'The clown loach hails from the rivers and tributaries of Malaysia, Borneo, Sumatra, and Kalimantan.'

test('clown loach: Indonesia only; Malaysia, on The Spruce Pets alone, dropped and logged, and a region the quote puts there with it', () => {
  const r = checkAnswer({
    countries: [{ code: 'MY', status: 'native', source: 'sprucepets', quote: loachSpruce, words: 'Malaysia' }, { code: 'ID', status: 'native', source: 'seriouslyfish', quote: loachSf, words: 'Indonesian' }],
    regions: [{ name: 'Borneo', source: 'seriouslyfish', quote: 'Native to the Greater Sunda Islands of Borneo and Sumatra.', country: '' }, { name: 'Kapuas', source: 'seriouslyfish', quote: loachSf, country: 'ID' }, { name: 'Sumatra', source: 'sprucepets', quote: loachSpruce, country: 'MY' }],
  }, loach)
  expect(r.native).toEqual({ countries: ['ID'], regions: ['Borneo', 'Kapuas'], sources: ['seriouslyfish'] })
  expect(r.outranked.map(c => [c.code, c.source, c.quote])).toEqual([['MY', 'sprucepets', loachSpruce]])
  expect(r.regions.find(x => x.name === 'Sumatra')?.why).toBe('in MY, which only a general site gives')
  expect(r.disputed).toEqual([])
})

test('a species only a general site covers keeps its countries; a specialist that says nothing on where it lives doesn\'t outrank it', () => {
  const only: Block[] = [{ source: 'sprucepets', key: 'distribution', text: LOACH_SPRUCE }]
  const answer = { countries: [{ code: 'MY', status: 'native', source: 'sprucepets', quote: loachSpruce, words: 'Malaysia' }], regions: [{ name: 'Borneo', source: 'sprucepets', quote: loachSpruce, country: '' }] }
  const r = checkAnswer(answer, only)
  expect(r.native).toEqual({ countries: ['MY'], regions: ['Borneo'], sources: ['sprucepets'] })
  expect(r.outranked).toEqual([])
  const quiet = checkAnswer(answer, [...only, { source: 'seriouslyfish', key: 'diet', text: 'Micropredator feeding on small invertebrates.' }])
  expect(quiet.native?.countries).toEqual(['MY'])
})

test('a specialist that names only a lake says where it lives: a general site\'s country is dropped, not added', () => {
  const b: Block[] = [{ source: 'seriouslyfish', key: 'distribution', text: 'Endemic to Lake Malawi.' }, { source: 'sprucepets', key: 'distribution', text: 'This fish is native to Malawi.' }]
  const r = checkAnswer({ countries: [{ code: 'MW', status: 'native', source: 'sprucepets', quote: 'This fish is native to Malawi.', words: 'Malawi' }], regions: [{ name: 'Lake Malawi', source: 'seriouslyfish', quote: 'Endemic to Lake Malawi.', country: '' }] }, b)
  expect(r.native).toEqual({ countries: [], regions: ['Lake Malawi'], sources: ['seriouslyfish'] })
  expect(r.outranked.map(c => c.code)).toEqual(['MW'])
})

test('every source in the registry has a tier: The Spruce Pets is a general pet-care site, the species databases and aquarium sites specialists', () => {
  expect(SOURCES.every(s => s.tier === 'specialist' || s.tier === 'general')).toBe(true)
  expect(SOURCES.filter(s => s.tier === 'general').map(s => s.id)).toEqual(['sprucepets'])
  for (const id of ['seriouslyfish', 'planetcatfish', 'loachesonline', 'scotcat', 'glaser', 'aquariumbreeder'] as const) expect(sourceTier(id), id).toBe('specialist')
  // A source the registry doesn't list (a shop's blog) counts as a general site.
  expect(sourceTier('aquazonefish')).toBe('general')
})

test('a country is refused without a sentence of its source that names it: no quote, a quote not in the text, another source, a place for a country', () => {
  const claim = (over: object) => checkAnswer({ countries: [{ code: 'TH', status: 'native', source: 'seriouslyfish', quote: sf1, words: 'Thailand', ...over }], regions: [] }, blocks).claims[0]!
  const refused = (over: object) => { const c = claim(over); expect(c.ok, JSON.stringify(over)).toBe(false); return c.why }
  expect(claim({}).ok).toBe(true)
  expect(refused({ quote: '' })).toBe('no quote')
  expect(refused({ quote: undefined })).toBe('no quote')
  expect(refused({ quote: 'Thailand' })).toBe('no sentence')
  // Words the source never wrote: the model's own knowledge.
  expect(refused({ quote: 'Native to the wetlands of central Thailand.' })).toBe('not in the source\'s text')
  expect(refused({ source: 'sprucepets' })).toBe('not in the source\'s text')
  expect(refused({ source: 'fishbase' })).toBe('not one of its sources')
  expect(refused({ words: 'Cambodia' })).toBe('its name is not in the quote')
  expect(refused({ code: 'VN' })).toMatch(/is not VN/)
  // A place in a country is not the country's name, even one wholly inside it.
  expect(refused({ code: 'TH', words: 'Chiang Rai' })).toMatch(/is not TH/)
  expect(refused({ status: 'feral' })).toBe('no status')
  // Quote marks, dashes, spaces and case as the text has them or not.
  expect(claim({ quote: sf1.toUpperCase().replace(/ /g, '  ') }).ok).toBe(true)
  // A country refused gives no native.
  expect(checkAnswer({ countries: [{ code: 'TH', status: 'native', source: 'seriouslyfish', quote: 'Lives in Thailand.', words: 'Thailand' }], regions: [] }, blocks).native).toBeUndefined()
})

test('regions: named in a sentence of the source, not a country, each once, at most 8', () => {
  const q = 'Type locality is \'Menam River, Thailand\', which refers to the Chao Phraya river basin.'
  const r = checkAnswer({ countries: [], regions: [
    { name: 'Chao Phraya', source: 'seriouslyfish', quote: q }, { name: 'chao phraya', source: 'seriouslyfish', quote: q },
    { name: 'Thailand', source: 'seriouslyfish', quote: q }, { name: 'Mekong', source: 'seriouslyfish', quote: q }, { name: 'Malay Peninsula', source: 'seriouslyfish', quote: sf1 },
  ] }, blocks)
  expect(r.regions.map(x => x.why)).toEqual([undefined, undefined, 'a country', 'its name is not in the quote', undefined])
  expect(r.native).toEqual({ countries: [], regions: ['Chao Phraya', 'Malay Peninsula'], sources: ['seriouslyfish'] })
  // Nine named, six kept, in the answer's order.
  const names = ['Chiang Rai', 'Surat Thani', 'Phang Nga', 'Malay Peninsula', 'Isthmus of Kra', 'Mekong', 'Mekong River', 'Chao Phraya', 'Menam River']
  const many = names.map((name, i) => ({ name, source: 'seriouslyfish', quote: i < 5 ? sf1 : i < 7 ? sf2 : q }))
  expect(checkAnswer({ countries: [], regions: many }, blocks).native?.regions).toEqual(names.slice(0, 6))
})

test('a region in a country a source calls introduced or doubtful is left out with it; one the quote puts in no country stays', () => {
  // The dwarf gourami: Seriously Fish calls its records from Nepal misidentified, Aquarium Breeder lists Nepal's rivers.
  const sf = 'Widely distributed through Pakistan, northern India and Bangladesh. Apparent occurences in Nepal and Myanmar are now thought to be as a result of misidentification.'
  const ab = 'It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh.'
  const b: Block[] = [{ source: 'seriouslyfish', key: 'distribution', text: sf }, { source: 'aquariumbreeder', key: 'distribution', text: ab }]
  const r = checkAnswer({
    countries: [
      { code: 'IN', status: 'native', source: 'seriouslyfish', quote: 'Widely distributed through Pakistan, northern India and Bangladesh.', words: 'India' },
      { code: 'NP', status: 'doubtful', source: 'seriouslyfish', quote: 'Apparent occurences in Nepal and Myanmar are now thought to be as a result of misidentification.', words: 'Nepal' },
      { code: 'NP', status: 'native', source: 'aquariumbreeder', quote: ab, words: 'Nepal' },
    ],
    regions: [{ name: 'Koshi', source: 'aquariumbreeder', quote: ab, country: 'NP' }, { name: 'West Bengal', source: 'aquariumbreeder', quote: ab, country: 'IN' }, { name: 'Karnali', source: 'aquariumbreeder', quote: ab, country: '' }],
  }, b)
  expect(r.native?.countries).toEqual(['IN'])
  expect(r.regions.map(x => x.why)).toEqual(['in NP, which a source calls introduced or doubtful', undefined, undefined])
  expect(r.native?.regions).toEqual(['West Bengal', 'Karnali'])
})

const entity = (over: Partial<SpeciesEntity> = {}): SpeciesEntity => ({
  id: 'betta-splendens', scientificName: 'Betta splendens', order: 'Perciformes', family: 'Osphronemidae', genus: 'Betta', group: 'labyrinth',
  places: ['asia', 'thailand', 'cambodia', 'indonesia', 'malaysia', 'vietnam', 'china', 'chao-phraya'],
  dataCard: {}, sections: [{ key: 'distribution', source: 'seriouslyfish', sourceUrl: 'https://sf/b', html: SF }, { key: 'distribution', source: 'sprucepets', sourceUrl: 'https://sp/b', html: SPRUCE }, { key: 'diet', source: 'seriouslyfish', sourceUrl: 'https://sf/b', html: '<p>Micropredator.</p>' }],
  photos: [], videos: [], productSlots: [], updatedAt: '2026-11-01', ...over,
})
const quiet = entity({ id: 'betta-quiet', scientificName: 'Betta quiet', places: [], sections: [{ key: 'diet', source: 'seriouslyfish', sourceUrl: 'https://sf/q', html: '<p>Worms.</p>' }] })

async function site(entities: SpeciesEntity[]) {
  const root = await mkdtemp(join(tmpdir(), 'aq-range-'))
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { publish: true }, sprucepets: { publish: true } }))
  for (const e of entities) {
    await mkdir(join(root, 'content/species', e.id), { recursive: true })
    await writeFile(join(root, 'content/species', e.id, 'entity.json'), `${JSON.stringify(e, null, 2)}\n`)
  }
  const read = (id: string) => readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')
  const audit = async (id: string) => JSON.parse(await readFile(join(root, 'engine-state/range', `${id}.json`), 'utf8')) as Audit
  return { root, read, audit }
}

/** GBIF with 10 Betta records, 6 of them in Thailand, in one cell. */
const gbifFetch = (fail = false): Fetch => async url => {
  const u = new URL(url)
  if (fail) return new Response('down', { status: 404 })
  if (u.pathname === '/v1/species/match') return Response.json({ usageKey: 2393998, canonicalName: 'Betta splendens', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT' })
  if (u.pathname === '/v1/occurrence/search') return Response.json({ count: 10, facets: [{ field: 'COUNTRY', counts: [{ name: 'TH', count: 6 }, { name: 'AU', count: 4 }] }] })
  if (!u.pathname.endsWith('/1/3/0.mvt')) return new Response(null, { status: 204 })
  // One square at 99.84–101.25 E, 12.66–14.06 N.
  return new Response(mvt([{ x: 448, y: 3456, size: 64, total: u.searchParams.getAll('country').includes('TH') ? 6 : 10 }]))
}
const deps = (llm: Llm, fetch: Fetch = gbifFetch(), now = '2026-11-04T10:00:00Z') => ({ llm, gbif: gbifClient({ fetch, sleep: async () => {}, ua: 'test' }), now: () => new Date(now), order: [] })

test('the step writes each species\' range after its places, keeps the sentences in engine-state, and checks them against its origin pages', async () => {
  const s = await site([entity(), quiet])
  let calls = 0
  const llm: Llm = async <T>() => { calls++; return BETTA as T }
  const r = await speciesRanges(s.root, deps(llm), { limit: 5, records: 5 })
  expect(calls).toBe(1)
  expect(r.native).toMatchObject({ read: ['betta-splendens'], quiet: ['betta-quiet'], failed: [], calls: 1 })
  expect(r.records.failed).toEqual([])
  expect(r.records.fetched).toEqual(['betta-quiet', 'betta-splendens'])
  const e = SpeciesSchema.parse(JSON.parse(await s.read('betta-splendens')))
  expect(Object.keys(e).slice(6, 8)).toEqual(['places', 'range'])
  expect(e.range).toEqual({
    native: { countries: ['TH'], regions: ['Chao Phraya'], sources: ['seriouslyfish'] },
    records: { taxonKey: 2393998, total: 10, fetched: '2026-11-04', countries: [['TH', 6], ['AU', 4]], cells: [[99.84375, 12.65625, 10, 6]] },
  })
  const a = await s.audit('betta-splendens')
  expect(a.native?.claims.find(c => c.code === 'TH')?.quote).toBe(sf1)
  expect(a.native?.disputed).toEqual(['ID', 'MY', 'VN'])
  // Its origin pages list Cambodia, Indonesia, Malaysia, Vietnam and China, which no specialist source says it is native to.
  expect(a.native?.origin).toEqual({ pagesOnly: ['KH', 'ID', 'MY', 'VN', 'CN'], sourcesOnly: [] })
  expect(a.native?.outranked).toEqual([{ code: 'CN', source: 'sprucepets', quote: sp1 }])
  expect(a.records).toMatchObject({ taxonKey: 2393998, native: ['TH'], at: '2026-11-04T10:00:00.000Z' })
  // A species whose sources say nothing about where it lives: no native, no model call; records without inside counts.
  const q = SpeciesSchema.parse(JSON.parse(await s.read('betta-quiet')))
  expect(q.range?.native).toBeUndefined()
  expect(q.range?.records?.cells).toEqual([[99.84375, 12.65625, 10]])

  // Nothing is due the next cycle: no call, no request, no write.
  const before = await s.read('betta-splendens')
  const again = await speciesRanges(s.root, deps(async () => { throw new Error('called') }, async () => { throw new Error('requested') }, '2026-11-04T13:00:00Z'), { limit: 5, records: 5 })
  expect(again.native.calls + again.records.requests).toBe(0)
  expect(await s.read('betta-splendens')).toBe(before)
  // A month on, the records are fetched again; the native part only when its sources' text changes.
  const month = await speciesRanges(s.root, deps(async () => { throw new Error('called') }, gbifFetch(), '2026-12-05T10:00:00Z'), { limit: 5, records: 5 })
  expect(month.native.calls).toBe(0)
  expect(month.records.fetched).toHaveLength(2)
  expect(JSON.parse(await s.read('betta-splendens')).range.records.fetched).toBe('2026-12-05')
})

test('a failed model call or GBIF request leaves the species as it was, tried again a day later', async () => {
  const s = await site([entity()])
  const before = await s.read('betta-splendens')
  const r = await speciesRanges(s.root, deps(async () => { throw new LlmError('usage limit reached') }), { limit: 5, records: 5 })
  expect(r.native.failed).toEqual(['betta-splendens'])
  expect(r.records.requests).toBe(0)
  expect(await s.read('betta-splendens')).toBe(before)
  expect((await s.audit('betta-splendens')).nativeFailed?.error).toMatch(/usage limit/)
  // An answer not of the schema's shape is a failed call too.
  await speciesRanges(s.root, deps(async <T>() => ({ countries: 'TH' }) as T, gbifFetch(), '2026-11-05T11:00:00Z'), { limit: 5, records: 5 })
  expect(await s.read('betta-splendens')).toBe(before)
  // Not again within the day.
  let calls = 0
  await speciesRanges(s.root, deps(async <T>() => { calls++; return BETTA as T }, gbifFetch(), '2026-11-05T12:00:00Z'), { limit: 5, records: 5 })
  expect(calls).toBe(0)

  const t = await site([entity()])
  await speciesRanges(t.root, deps(async <T>() => BETTA as T, gbifFetch(true)), { limit: 5, records: 5 })
  const native = await t.read('betta-splendens')
  expect(JSON.parse(native).range.records).toBeUndefined()
  expect((await t.audit('betta-splendens')).recordsFailed?.error).toMatch(/404/)
  // The records keep what they had when GBIF fails later on.
  await speciesRanges(t.root, deps(async () => { throw new Error('no call due') }, gbifFetch(), '2026-11-06T10:00:00Z'), { limit: 5, records: 5 })
  const fetched = await t.read('betta-splendens')
  expect(JSON.parse(fetched).range.records.total).toBe(10)
  await speciesRanges(t.root, deps(async () => { throw new Error('no call due') }, gbifFetch(true), '2026-12-07T10:00:00Z'), { limit: 5, records: 5 })
  expect(await t.read('betta-splendens')).toBe(fetched)
})

test('model calls stop at the limit, most popular first; new native countries drop records counted for the old ones', async () => {
  const ids = ['a-one', 'b-two', 'c-three']
  const s = await site(ids.map(id => entity({ id, scientificName: id })))
  const seen: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => { seen.push(/Species: (.*)/.exec(prompt)![1]!); return BETTA as T }
  const r = await speciesRanges(s.root, { ...deps(llm), order: ['c-three', 'a-one'] }, { limit: 2, records: 1 })
  expect(seen).toEqual(['c-three', 'a-one'])
  expect(r.records.fetched).toEqual(['c-three'])
  // c-three loses Seriously Fish: The Spruce Pets alone covers it now, so its countries count, and the records' inside
  // counts (Thailand alone) are dropped until fetched again.
  const file = join(s.root, 'content/species/c-three/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8')) as SpeciesEntity
  e.sections = e.sections.filter(x => x.source === 'sprucepets')
  await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
  const only = { countries: BETTA.countries.filter(c => c.source === 'sprucepets'), regions: [] }
  await speciesRanges(s.root, { ...deps(async <T>() => only as T, async () => new Response('down', { status: 500 })), order: ['c-three'] }, { limit: 1, records: 0 })
  const after = SpeciesSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  expect(after.range).toEqual({ native: { countries: ['TH', 'ID', 'MY', 'VN', 'CN'], regions: [], sources: ['sprucepets'] } })
})

test('only sections that say where it lives, from sources the site may publish', () => {
  const e = entity({ sections: [...entity().sections, { key: 'habitat', source: 'glaser', sourceUrl: 'https://g/b', html: '<p>Ponds in Thailand.</p>' }] })
  expect(blocksOf(e, s => s !== 'glaser').map(b => `${b.source}:${b.key}`)).toEqual(['seriouslyfish:distribution', 'sprucepets:distribution'])
})

test('the answer\'s source is one of the species\' own sources, by name', async () => {
  const s = await site([entity()])
  let schema: { properties: { countries: { items: { properties: { source: { enum: string[] } } } } } } | undefined
  let prompt = ''
  await speciesRanges(s.root, deps(async <T>(a: { prompt: string; schema: object }) => { schema = a.schema as typeof schema; prompt = a.prompt; return BETTA as T }), { limit: 1, records: 0 })
  expect(schema!.properties.countries.items.properties.source.enum).toEqual(['seriouslyfish', 'sprucepets'])
  expect(prompt).toContain('=== source: seriouslyfish; section: distribution ===')
})
