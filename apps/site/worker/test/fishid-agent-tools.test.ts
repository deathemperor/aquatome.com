import { expect, test } from 'vitest'
import { fishIdTools, pageOf, searchCatalog } from '../fishid/agent-tools'
import { buildCatalog, type Catalog as BuiltCatalog } from '../fishid/catalog'
import { buildFacts, cut, shardFacts, TEXT_MAX, type Facts } from '../fishid/facts'
import { LOOK_MAX, lookOf } from '../fishid/look'
import { RECHECK_BELOW, recheckOf } from '../fishid/agent'
import type Anthropic from '@anthropic-ai/sdk'

type Catalog = BuiltCatalog
const CATALOG: Catalog = {
  version: 1,
  entries: [
    { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta', th: 'ปลากัด' }, url: { vi: '/vi/ca/ca-betta/' }, img: 'https://media.aquatome.com/betta-480.webp' },
    { id: 'betta-coccina', kind: 'species', sci: 'Betta coccina', name: { vi: 'Cá betta coccina' }, url: { vi: '/vi/ca/ca-betta-coccina/' }, look: 'Iridescent green lateral blotch present in male; body dark red.' },
    { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', name: { vi: 'Cá betta Halfmoon (Halfmoon betta)' }, alt: ['Betta HM', 'Half moon betta'], url: { vi: '/vi/ca/ca-betta-halfmoon/' } },
    { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', name: { vi: 'Cá neon xanh', id: 'Ikan neon' }, url: { vi: '/vi/ca/ca-neon-xanh/', id: '/id/ikan/ikan-neon/' } },
    { id: 'rotala-rotundifolia', kind: 'plant', sci: 'Rotala rotundifolia', syn: ['Ammannia rotundifolia'], name: { vi: 'Cây vảy ốc' }, url: { vi: '/vi/cay/cay-vay-oc/' } },
  ],
}
const ids = (q: Parameters<typeof searchCatalog>[1]) => searchCatalog(CATALOG, q).hits.map(e => e.id)

test('search: a scientific name, a synonym, a name in any language (no marks needed), a genus with its breeds, a breed\'s other name', () => {
  expect(ids({ query: 'Paracheirodon innesi', genus: null })[0]).toBe('paracheirodon-innesi')
  expect(ids({ query: 'Ammannia rotundifolia', genus: null })).toEqual(['rotala-rotundifolia'])
  expect(ids({ query: 'ca neon xanh', genus: null })).toEqual(['paracheirodon-innesi'])
  expect(ids({ query: 'Ikan neon', genus: null })).toEqual(['paracheirodon-innesi'])
  expect(ids({ query: null, genus: 'Betta' })).toEqual(['betta-coccina', 'betta-splendens', 'halfmoon-betta'])
  expect(ids({ query: 'Half moon betta', genus: null })[0]).toBe('halfmoon-betta')
  expect(ids({ query: 'Betta HM', genus: null })[0]).toBe('halfmoon-betta')
  expect(ids({ query: 'Hyphessobrycon amandae', genus: null })).toEqual([])
  expect(ids({ query: null, genus: null })).toEqual([])
})

test('search: a query gives at most 12 pages, a genus all of its own up to 80, and how many more there were', () => {
  const corydoras = (n: number): Catalog => ({ version: 1, entries: Array.from({ length: n }, (_, i) => ({ id: `corydoras-${i}`, kind: 'species' as const, sci: `Corydoras sp${String(i).padStart(2, '0')}`, name: { vi: `Cá chuột ${i}` }, url: { vi: `/vi/ca/c${i}/` } })) })
  const named = searchCatalog(corydoras(15), { query: 'Corydoras', genus: null })
  expect([named.hits.length, named.more]).toEqual([12, 3])
  const genus = searchCatalog(corydoras(15), { query: null, genus: 'Corydoras' })
  expect([genus.hits.length, genus.more]).toEqual([15, 0])
  const big = searchCatalog(corydoras(85), { query: null, genus: 'Corydoras' })
  expect([big.hits.length, big.more]).toEqual([80, 5])
})

const FACTS: Facts[] = [
  { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', family: 'Osphronemidae', sizeCm: '6–7', from: ['thailand'], look: 'Wild males dull red to green.', text: 'Males have long fins.', photos: ['https://media.aquatome.com/b1-480.webp', 'https://media.aquatome.com/b2-480.webp'] },
  { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', names: ['Betta HM'], text: 'Đuôi xòe 180 độ.', photos: ['https://media.aquatome.com/hm-480.webp'] },
  { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', photos: [] },
]
const tools = (extra: Partial<Parameters<typeof fishIdTools>[0]> = {}) => {
  const [search, entry] = fishIdTools({ catalog: CATALOG, lang: 'vi', facts: async id => FACTS.find(f => f.id === id), ...extra })
  return { search: search!, entry: entry! }
}
type Block = { type: string; text?: string; source?: { url: string } }

test('get_entry: a species\' facts and two photos; a breed with what it is a form of; a page without photos says so; an unknown id is an error', async () => {
  const { entry } = tools()
  const species = await entry.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[]
  expect(species[0]!.text).toBe('betta-splendens (species): Cá betta, Betta splendens\nFamily: Osphronemidae\nAdult size: 6–7 cm\nFrom: thailand\nMarks: Wild males dull red to green.\nSources: Males have long fins.\nReference photos: 2, below.')
  expect(species.slice(1, 3)).toEqual([{ type: 'image', source: { type: 'url', url: 'https://media.aquatome.com/b1-480.webp' } }, { type: 'image', source: { type: 'url', url: 'https://media.aquatome.com/b2-480.webp' } }])
  // Then the rest of its genus, species only, each with its marks.
  expect(species[3]!.text).toBe(`The other 1 species of Betta in the handbook, each with what its sources say tells it apart:\n${JSON.stringify([{ id: 'betta-coccina', kind: 'species', sci: 'Betta coccina', name: 'Cá betta coccina', look: 'Iridescent green lateral blotch present in male; body dark red.' }])}`)
  expect(species).toHaveLength(4)
  const breed = await entry.run({ id: 'halfmoon-betta' }, { photosLeft: 6 }) as Block[]
  expect(breed[0]!.text).toMatch(/^halfmoon-betta \(breed\): Cá betta Halfmoon \(Halfmoon betta\)\nA form of: betta-splendens\nAlso called: Betta HM\nSources: Đuôi xòe 180 độ\.\nReference photos: 1, below\.$/)
  const none = await entry.run({ id: 'paracheirodon-innesi' }, { photosLeft: 6 }) as Block[]
  expect(none).toEqual([{ type: 'text', text: expect.stringMatching(/Reference photos: none on this page\.$/) }])
  await expect(entry.run({ id: 'neon' }, { photosLeft: 6 })).rejects.toThrow(/No page for "neon"/)
  expect(entry.step!({ id: 'neon' })).toBeUndefined()
  expect(entry.step!({ id: 'paracheirodon-innesi' })).toEqual({ kind: 'look', page: { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh', sci: 'Paracheirodon innesi', url: '/vi/ca/ca-neon-xanh/' } })
})

test('get_entry opens a page by its id, or by a species\' or plant\'s scientific name or synonym, so Claude needn\'t search first; never a breed by name, never a genus alone', async () => {
  expect(pageOf(CATALOG, 'betta-splendens')?.id).toBe('betta-splendens')
  expect(pageOf(CATALOG, 'Betta splendens')?.id).toBe('betta-splendens')
  expect(pageOf(CATALOG, 'betta splendens (Regan, 1910)')?.id).toBe('betta-splendens')
  expect(pageOf(CATALOG, 'Ammannia rotundifolia')?.id).toBe('rotala-rotundifolia')
  expect(pageOf(CATALOG, 'Betta')).toBeUndefined()
  expect(pageOf(CATALOG, 'Betta brownorum')).toBeUndefined()
  expect(pageOf(CATALOG, 'halfmoon-betta')?.id).toBe('halfmoon-betta')
  const { entry } = tools()
  expect((await entry.run({ id: 'Betta splendens' }, { photosLeft: 6 }) as Block[])[0]!.text).toMatch(/^betta-splendens \(species\)/)
  expect(entry.step!({ id: 'Paracheirodon innesi' })).toMatchObject({ kind: 'look', page: { id: 'paracheirodon-innesi' } })
})

test('get_entry: only the photos left in the identification, then facts only; a photo it must never show is left out', async () => {
  const { entry } = tools()
  expect((await entry.run({ id: 'betta-splendens' }, { photosLeft: 1 }) as Block[]).filter(b => b.type === 'image')).toHaveLength(1)
  const spent = await entry.run({ id: 'betta-splendens' }, { photosLeft: 0 }) as Block[]
  expect(spent).toEqual([{ type: 'text', text: expect.stringMatching(/Reference photos: none, the limit for this identification is reached\.$/) }])
  const { entry: test } = tools({ exclude: src => src.endsWith('b1-480.webp') })
  expect((await test.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[]).flatMap(b => b.source ? [b.source.url] : [])).toEqual(['https://media.aquatome.com/b2-480.webp'])
})

test('get_entry: facts that can\'t be read are said so, with the page\'s name, and counted; the run goes on', async () => {
  let missing = 0
  const { entry } = tools({ facts: async () => { throw new Error('facts unreadable') }, onFactsMissing: () => { missing++ } })
  expect(await entry.run({ id: 'betta-splendens' }, { photosLeft: 6 })).toEqual([{ type: 'text', text: 'betta-splendens (species): Cá betta, Betta splendens\nThis page\'s facts and reference photos can\'t be read just now: judge by its name.' }])
  expect(missing).toBe(1)
})

test('search_handbook: its step is what it searched for; its result is JSON, text only', async () => {
  const { search } = tools()
  expect(search.step!({ query: null, genus: 'Betta' })).toEqual({ kind: 'search', query: 'Betta' })
  expect(search.step!({ query: null, genus: null })).toBeUndefined()
  expect(JSON.parse(await search.run({ query: 'Half moon betta', genus: null }, { photosLeft: 6 }) as string)[0]).toEqual({ id: 'halfmoon-betta', kind: 'breed', name: 'Cá betta Halfmoon (Halfmoon betta)', basedOn: 'betta-splendens' })
  expect(await search.run({ query: 'Danio rerio', genus: null }, { photosLeft: 6 })).toMatch(/^No page matches/)
})

test('the facts: a species\' family, size, places, dimorphism then notes as plain text cut to length, photos then gallery; a breed\'s summary; every page in one shard', () => {
  const photo = (n: number) => ({ url: `https://x/${n}.webp`, thumb: `https://x/${n}-480.webp` })
  const long = 'word '.repeat(300)
  const facts = buildFacts(CATALOG, {
    species: [{ id: 'betta-splendens', family: 'Osphronemidae', places: ['thailand'], dataCard: { sizeCm: [{ value: 99, hidden: 'out of bounds' }, { value: { min: 6, max: 7 } }] }, sections: [{ key: 'notes', html: '<p>Notes &amp; more.</p>' }, { key: 'diet', html: '<p>Eats.</p>' }, { key: 'dimorphism', html: `<p>Males <em>long</em> fins.</p><p>${long}</p>` }], photos: [photo(1)], t: { name: 'Cá betta', altNames: [] } }],
    breeds: [{ id: 'halfmoon-betta', basedOn: 'betta-splendens', care: { sizeCm: [{ value: 6 }] }, photos: [], t: { name: 'Cá betta Halfmoon', altNames: ['Betta HM'], summary: ['Đuôi xòe.', 'Cần bể riêng.'] } }],
    plants: [],
  }, p => p.thumb, { gallery: id => (id === 'betta-splendens' ? [photo(2), photo(3)] : []) })
  const betta = facts.find(f => f.id === 'betta-splendens')!
  expect(betta).toMatchObject({ family: 'Osphronemidae', sizeCm: '6–7', from: ['thailand'], photos: ['https://x/1-480.webp', 'https://x/2-480.webp'] })
  expect(betta.text!.startsWith('Males long fins. word word')).toBe(true)
  expect(betta.text!.length).toBeLessThanOrEqual(TEXT_MAX)
  expect(betta.text!.endsWith('…')).toBe(true)
  expect(facts.find(f => f.id === 'halfmoon-betta')).toEqual({ id: 'halfmoon-betta', kind: 'breed', sizeCm: '6', basedOn: 'betta-splendens', names: ['Betta HM'], text: 'Đuôi xòe. Cần bể riêng.', photos: [] })
  // A page the content lacks still has its entry; every catalog page is in exactly one shard.
  expect(facts.find(f => f.id === 'rotala-rotundifolia')).toEqual({ id: 'rotala-rotundifolia', kind: 'plant', sci: 'Rotala rotundifolia', photos: [] })
  const shards = shardFacts(facts, 4)
  expect(shards.flatMap(s => s.entries.map(f => f.id)).sort()).toEqual(CATALOG.entries.map(e => e.id).sort())
  expect(cut('short', 10)).toBe('short')
})

test('the rest of a genus with its marks comes once a run, whether an opened page or a search listed it; a genus with no other species adds nothing', async () => {
  const genusBlocks = (bs: Block[]) => bs.filter(b => b.type === 'text' && b.text?.startsWith('The other '))
  const { entry } = tools()
  expect(genusBlocks(await entry.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[])).toHaveLength(1)
  expect(genusBlocks(await entry.run({ id: 'betta-coccina' }, { photosLeft: 6 }) as Block[])).toHaveLength(0)
  // Listed by search_handbook first: an opened page of that genus doesn't list it again.
  const { search, entry: after } = tools()
  const listed = JSON.parse(await search.run({ query: null, genus: 'Betta' }, { photosLeft: 6 }) as string) as { id: string; look?: string }[]
  expect(listed.find(e => e.id === 'betta-coccina')?.look).toBe('Iridescent green lateral blotch present in male; body dark red.')
  expect(genusBlocks(await after.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[])).toHaveLength(0)
  // A query's listing has no marks: they cost tokens where no genus is being read.
  expect(JSON.parse(await search.run({ query: 'Betta coccina', genus: null }, { photosLeft: 6 }) as string)[0]).not.toHaveProperty('look')
  // Neon's genus has no other species in this handbook.
  expect(genusBlocks(await tools().entry.run({ id: 'paracheirodon-innesi' }, { photosLeft: 6 }) as Block[])).toHaveLength(0)
})

test('marks: the sources\' sentence that tells it from others first, its counts and measures left out; colour and pattern, not keeping; none when they say nothing of its look', () => {
  const macrostoma = [
    { key: 'habitat', html: '<p>The water is slightly brown in colour.</p>' },
    { key: 'quickFacts', html: '<p>It grows to 100 mm SL, and males are red with a red patch on the opercle and an ocellus in the dorsal fin.</p>' },
    { key: 'notes', html: '<p>B. macrostoma is in the B. unimaculata complex. The unique combination of characters distinguishing it from others in the group is as follows: body of male red in colour; male with red patch on opercle and dorsal-fin ocellus; opercle lacking iridescent scales; 9-11 dorsal-fin rays; 25-28 anal-fin rays.</p>' },
    { key: 'maintenance', html: '<p>Use dark substrate, red plants and dim light in the tank.</p>' },
  ]
  const look = lookOf(macrostoma)!
  expect(look.startsWith('The unique combination of characters distinguishing it from others in the group is as follows: body of male red in colour; male with red patch on opercle and dorsal-fin ocellus; opercle lacking iridescent scales')).toBe(true)
  expect(look).not.toMatch(/rays|brown in colour|substrate/)
  expect(look).toContain('males are red with a red patch on the opercle')
  expect(look.length).toBeLessThanOrEqual(LOOK_MAX)
  expect(lookOf([{ key: 'notes', html: '<p>A peaceful fish for a community tank.</p>' }])).toBeUndefined()
  expect(lookOf(undefined)).toBeUndefined()
  // Cut at a word, with an ellipsis, past the length asked for.
  const long = lookOf([{ key: 'notes', html: `<p>It differs from its congeners by ${'a red spot and a black band '.repeat(20)}on the flank.</p>` }], 120)!
  expect(long.length).toBeLessThanOrEqual(120)
  expect(long.endsWith('…')).toBe(true)
  // A conservation status is never a mark, whatever colour its name has.
  expect(lookOf([{ key: 'notes', html: '<p>IUCN Red List: Endangered (EN), criterion A4c.</p><p>The Red List assesses it as vulnerable.</p>' }])).toBeUndefined()
  // "Light green" is a colour, not the tank's light; a plant's leaves are its look, a fish's sentence on leaves and light is keeping.
  const leaves = [{ key: 'notes', html: '<p>Its leaves show patterns of white, light green and dark green under strong light.</p>' }]
  expect(lookOf(leaves, LOOK_MAX, true)).toBe('Its leaves show patterns of white, light green and dark green under strong light.')
  expect(lookOf(leaves)).toBeUndefined()
  expect(lookOf([{ key: 'notes', html: '<p>The body is light green with a dark band.</p>' }])).toBe('The body is light green with a dark band.')
})

test('the catalog and the facts carry a species\' and a plant\'s marks, short in the catalog; a breed has none', () => {
  const first = 'Males are red with a black band on the tail and a white edge to every fin, which tells it from its look-alikes in the genus at a glance, even from a distance.'
  const second = 'Females are paler, brown with two dark stripes along the flank.'
  const sections = [{ key: 'notes', html: `<p>${first} ${second}</p>` }]
  const plantSections = [{ key: 'notes', html: '<p>Its leaves are dark green with white veins, and new leaves come in red under strong light.</p>' }]
  const page = (id: string, extra: object) => ({ id, photos: [] as { url: string }[], t: { name: id, altNames: [] as string[], slug: id }, ...extra })
  const vi = { species: [page('betta-coccina', { scientificName: 'Betta coccina', sections })], breeds: [page('halfmoon-betta', { basedOn: 'betta-coccina', sections })], plants: [page('bucephalandra-pygmaea', { scientificName: 'Bucephalandra pygmaea', sections: plantSections })] }
  const catalog = buildCatalog([{ lang: 'vi', pages: vi, at: p => p }], p => p.url)
  // The two sentences are past the catalog's 200 characters: it keeps the first, the page both.
  expect(`${first} ${second}`.length).toBeGreaterThan(200)
  expect(catalog.entries.find(e => e.id === 'betta-coccina')?.look).toBe(first)
  expect(catalog.entries.find(e => e.id === 'halfmoon-betta')).not.toHaveProperty('look')
  const facts = buildFacts(catalog, vi, p => p.url)
  expect(facts.find(f => f.id === 'betta-coccina')?.look).toBe(`${first} ${second}`)
  expect(facts.find(f => f.id === 'halfmoon-betta')).not.toHaveProperty('look')
  // A plant's leaves are its marks, in both.
  expect(catalog.entries.find(e => e.id === 'bucephalandra-pygmaea')?.look).toMatch(/^Its leaves are dark green/)
  expect(facts.find(f => f.id === 'bucephalandra-pygmaea')?.look).toMatch(/^Its leaves are dark green/)
})

const said = (answer: unknown, stop = 'end_turn') => ({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message
const guess = (scientificName: string, confidence: number) => ({ scientificName, commonName: '', variety: null, confidence, reason: '', id: null })

test('recheck: a fish or plant answer under 0.6 sure is sent back with its guesses\' genera, each species with its marks, the top guess\'s genus first', () => {
  const more = recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Betta splendens', 0.45), guess('Paracheirodon innesi', 0.2), guess('Rotala rotundifolia', 0.1)] }))
  expect(more).toHaveLength(1)
  const text = (more![0] as Anthropic.TextBlockParam).text
  expect(text).toContain('only 0.45 sure')
  // Two genera at most, in the guesses' order; species only, never a breed; each with its look.
  expect(text).toMatch(/Betta: \[.*"betta-coccina".*"Iridescent green lateral blotch present in male; body dark red\.".*"betta-splendens"/)
  expect(text).toContain('Paracheirodon: [')
  expect(text).not.toContain('halfmoon-betta')
  expect(text).not.toContain('Rotala')
  expect(text).toContain('get_entry')
})

test('recheck: a genus the run has already listed is named, not sent again; one it lists now is marked as listed', () => {
  const listed = new Set(['betta'])
  const more = recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Betta splendens', 0.45), guess('Paracheirodon innesi', 0.2)] }), listed)
  const text = (more![0] as Anthropic.TextBlockParam).text
  expect(text).toContain('Betta: listed above, in this identification.')
  expect(text).not.toContain('betta-coccina')
  expect(text).toContain('Paracheirodon: [')
  expect([...listed]).toEqual(['betta', 'paracheirodon'])
  // Every genus listed already: still sent back, to read them again.
  expect((recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Betta splendens', 0.45)] }), listed)![0] as Anthropic.TextBlockParam).text).not.toContain('[')
})

test('recheck and the tools share the run\'s genera: get_entry after a second look doesn\'t list the genus again', async () => {
  const listed = new Set<string>()
  recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Betta splendens', 0.45)] }), listed)
  const [, entry] = fishIdTools({ catalog: CATALOG, lang: 'vi', facts: async id => FACTS.find(f => f.id === id), listed })
  const blocks = await entry!.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[]
  expect(blocks.filter(b => b.type === 'text' && b.text?.startsWith('The other '))).toHaveLength(0)
  // Without the shared set, the same page lists its genus.
  const [, alone] = fishIdTools({ catalog: CATALOG, lang: 'vi', facts: async id => FACTS.find(f => f.id === id) })
  expect((await alone!.run({ id: 'betta-splendens' }, { photosLeft: 6 }) as Block[]).filter(b => b.type === 'text' && b.text?.startsWith('The other '))).toHaveLength(1)
})

test('recheck: an answer that stands is not sent back (sure enough, not a fish or plant, refused, not the schema, no genus the handbook has)', () => {
  expect(RECHECK_BELOW).toBe(0.6)
  expect(recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Betta splendens', 0.6)] }))).toBeUndefined()
  expect(recheckOf(CATALOG, said({ verdict: 'other', guesses: [guess('Betta splendens', 0.2)] }))).toBeUndefined()
  expect(recheckOf(CATALOG, said({ verdict: 'unclear', guesses: [] }))).toBeUndefined()
  expect(recheckOf(CATALOG, said({ verdict: 'fish', guesses: [] }))).toBeUndefined()
  expect(recheckOf(CATALOG, said('', 'refusal'))).toBeUndefined()
  expect(recheckOf(CATALOG, said('{"verdict":', 'max_tokens'))).toBeUndefined()
  expect(recheckOf(CATALOG, said({ verdict: 'fish', guesses: [guess('Trichopodus leerii', 0.3)] }))).toBeUndefined()
  // A plant unsure: its genus is listed as a fish's would be.
  expect(recheckOf(CATALOG, said({ verdict: 'plant', guesses: [guess('Rotala rotundifolia', 0.4)] }))).toHaveLength(1)
})

test('individually approved crops never supply Fish ID catalog or facts pictures',()=>{
 const crop={url:'https://media.aquatome.com/owner-crop.webp',ownerCrop:{id:'fixture',pixelHash:'a'.repeat(64)}}
 const real={url:'https://media.aquatome.com/real.webp'}
 const page={id:'fixture',scientificName:'Fixture species',photos:[crop,real],sections:[],t:{name:'Fixture',altNames:[],slug:'fixture'}}
 const pages={species:[page],breeds:[],plants:[]},catalog=buildCatalog([{lang:'vi',pages,at:p=>p}],p=>p.url)
 expect(catalog.entries[0]?.img).toBe(real.url)
 const facts=buildFacts(catalog,pages,p=>p.url,{gallery:()=>[crop]})
 expect(JSON.stringify(facts)).not.toContain(crop.url);expect(JSON.stringify(facts)).toContain(real.url)
})
