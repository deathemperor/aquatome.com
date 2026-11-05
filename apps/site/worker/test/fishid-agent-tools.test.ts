import { expect, test } from 'vitest'
import { fishIdTools, pageOf, searchCatalog } from '../fishid/agent-tools'
import type { Catalog } from '../fishid/catalog'
import { buildFacts, cut, shardFacts, TEXT_MAX, type Facts } from '../fishid/facts'

const CATALOG: Catalog = {
  version: 1,
  entries: [
    { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta', th: 'ปลากัด' }, url: { vi: '/vi/ca/ca-betta/' }, img: 'https://media.aquatome.com/betta-480.webp' },
    { id: 'betta-coccina', kind: 'species', sci: 'Betta coccina', name: { vi: 'Cá betta coccina' }, url: { vi: '/vi/ca/ca-betta-coccina/' } },
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

test('search: at most 12 pages, and how many more there were', () => {
  const many: Catalog = { version: 1, entries: Array.from({ length: 15 }, (_, i) => ({ id: `corydoras-${i}`, kind: 'species' as const, sci: `Corydoras sp${String(i).padStart(2, '0')}`, name: { vi: `Cá chuột ${i}` }, url: { vi: `/vi/ca/c${i}/` } })) }
  const r = searchCatalog(many, { query: null, genus: 'Corydoras' })
  expect([r.hits.length, r.more]).toEqual([12, 3])
})

const FACTS: Facts[] = [
  { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', family: 'Osphronemidae', sizeCm: '6–7', from: ['thailand'], text: 'Males have long fins.', photos: ['https://media.aquatome.com/b1-480.webp', 'https://media.aquatome.com/b2-480.webp'] },
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
  expect(species[0]!.text).toBe('betta-splendens (species): Cá betta, Betta splendens\nFamily: Osphronemidae\nAdult size: 6–7 cm\nFrom: thailand\nSources: Males have long fins.\nReference photos: 2, below.')
  expect(species.slice(1)).toEqual([{ type: 'image', source: { type: 'url', url: 'https://media.aquatome.com/b1-480.webp' } }, { type: 'image', source: { type: 'url', url: 'https://media.aquatome.com/b2-480.webp' } }])
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
