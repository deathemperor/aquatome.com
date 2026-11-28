import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { gbifSynonyms } from '../src/gbif'
import { addPlantSynonyms, binomialsIn, formerNamesInText, HOBBY_NAMES, PLANT_SYNONYMS_OFF, plantSynonyms } from '../src/plant-synonyms'

// 2026-11-02, the built-page checker on aquatome.com: "rêu Java (Vesicularia dubyana)", "Amazon sword (Echinodorus
// amazonicus)", "Pygmy chain sword (Echinodorus tenellus)" linked plant pages that listed none of those old names.

test('a former name in a source\'s text, as its binomial; not a trade name ("sold as") or anything else', () => {
  // Phrases from the plant pages' own sources (Tropica and others).
  expect(formerNamesInText('<p>Previously named <em>Echinodorus tenellus</em> \'Green\'. Grows fast.</p>')).toEqual(['Echinodorus tenellus'])
  expect(formerNamesInText('<p>Pogostemon deccanensis (formerly known as Pogostemon erectus) forms compact groups</p>')).toEqual(['Pogostemon erectus'])
  expect(formerNamesInText('Shinnersia rivularis (previously Trichocoronis rivularis) Difficulty: easy')).toEqual(['Trichocoronis rivularis'])
  expect(formerNamesInText('<p>Used to be called Micranthemum micranthemoides.</p><p>Anubias barteri var. nana (syn. Anubias nana)</p>')).toEqual(['Micranthemum micranthemoides', 'Anubias nana'])
  for (const no of [
    'used to be sold as Anubias afzelii, but the latter is actually a much larger species',
    'known as plant devourers, such as Texas cichlids',
    "was called Hygrophila corymbosa 'Angustifolia' until recently",
    "Previously known as Echinodorus 'Quadricostatus'",
    'as previously mentioned, the plant grows slowly',
  ]) expect(formerNamesInText(no), no).toEqual([])
})

const plant = (id: string, scientificName: string, o: { sections?: string[]; names?: string[] } = {}) => ({ id, scientificName, sections: o.sections ?? [], names: o.names ?? [] })

test("each plant's other names: hobby names, its sources', GBIF's that pages here use; none another page has or two plants would take", () => {
  expect(HOBBY_NAMES['taxiphyllum-barbieri']).toEqual(['Vesicularia dubyana'])
  const plants = [
    plant('taxiphyllum-barbieri', 'Taxiphyllum barbieri', { names: ['Rêu java'] }),
    plant('helanthium-tenellum', 'Helanthium tenellum', { sections: ["<p>Previously named Echinodorus tenellus 'Green'.</p>"] }),
    plant('echinodorus-grisebachii', 'Echinodorus grisebachii', { names: ['Cây kiếm Amazon Bleherae', 'Echinodorus bleheri'] }),
    // A cultivar's page takes neither its text's nor GBIF's names: they are its species'.
    plant('echinodorus-grisebachii-tropica', "Echinodorus grisebachii 'Tropica'", { sections: ['<p>Formerly Echinodorus parviflorus.</p>'] }),
    // Its source's former name is another page's scientific name.
    plant('hygrophila-costata', 'Hygrophila costata', { sections: ['<p>Previously named Hygrophila corymbosa.</p>'] }),
    plant('hygrophila-corymbosa', 'Hygrophila corymbosa', { names: ['Hygrophila stricta'] }),
    // Two plants that would take one name: neither does.
    plant('aaa-one', 'Aaa one', { sections: ['<p>syn. Aaa shared</p>'] }),
    plant('aaa-two', 'Aaa two', { sections: ['<p>syn. Aaa shared</p>'] }),
  ]
  const gbif = {
    'Taxiphyllum barbieri': ['Ectropothecium barbieri', 'Isopterygium barbieri'],
    'Helanthium tenellum': ['Echinodorus tenellus', 'Alisma tenellum', 'Helanthium tenellum'],
    'Echinodorus grisebachii': ['Aquarius grisebachii', 'Echinodorus amazonicus', 'Echinodorus bleheri', 'Echinodorus gracilis'],
    'Hygrophila corymbosa': ['Hygrophila stricta', 'Nomaphila stricta', 'Fishus fakeus'],
  }
  const mentioned = new Set(['echinodorus amazonicus', 'echinodorus tenellus', 'echinodorus bleheri', 'hygrophila stricta', 'nomaphila stricta', 'fishus fakeus', 'ectropothecium barbieri'])
  const out = plantSynonyms(plants, gbif, mentioned, new Set(['fishus fakeus']))
  expect(Object.fromEntries(out)).toEqual({
    'taxiphyllum-barbieri': ['Vesicularia dubyana', 'Ectropothecium barbieri'],
    'helanthium-tenellum': ['Echinodorus tenellus'],
    'echinodorus-grisebachii': ['Echinodorus amazonicus', 'Echinodorus bleheri'],
    'echinodorus-grisebachii-tropica': [],
    'hygrophila-costata': [],
    'hygrophila-corymbosa': ['Hygrophila stricta', 'Nomaphila stricta'],
    'aaa-one': [],
    'aaa-two': [],
  })
  expect(binomialsIn('<p>Rêu java (Vesicularia dubyana), Amazon sword Echinodorus amazonicus</p>')).toEqual(new Set(['amazon sword', 'vesicularia dubyana', 'echinodorus amazonicus']))
})

// GBIF's answers for these names (2026-11-02), cut to the fields read.
const GBIF: Record<string, unknown> = {
  'match?name=Helanthium%20tenellum': { usageKey: 2864529, canonicalName: 'Helanthium tenellum', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', species: 'Helanthium tenellum' },
  '2864529/synonyms?limit=100&offset=0': { endOfRecords: true, results: [
    { canonicalName: '? tenellum', rank: 'UNRANKED' }, { canonicalName: 'Alisma tenellum', rank: 'SPECIES' }, { canonicalName: 'Echinodorus tenellus', rank: 'SPECIES' },
    { canonicalName: 'Echinodorus tenellus parvulus', rank: 'VARIETY' }, { canonicalName: 'Helanthium tenellum', rank: 'SPECIES' }, { canonicalName: 'Alisma tenellum', rank: 'SPECIES' },
  ] },
  'match?name=Taxiphyllum%20barbieri': { usageKey: 2682670, acceptedUsageKey: 12264430, canonicalName: 'Taxiphyllum barbieri', rank: 'SPECIES', status: 'SYNONYM', matchType: 'EXACT', species: 'Ectropothecium barbieri' },
  '12264430/synonyms?limit=100&offset=0': { endOfRecords: true, results: [{ canonicalName: 'Isopterygium barbieri', rank: 'SPECIES' }, { canonicalName: 'Taxiphyllum barbieri', rank: 'SPECIES' }] },
  'match?name=Bucephelandra%20sp.': { usageKey: 1, canonicalName: 'Bucephalandra', rank: 'GENUS', matchType: 'HIGHERRANK' },
  'match?name=Echinodorus%20grisebachy': { usageKey: 5328812, canonicalName: 'Echinodorus grisebachii', rank: 'SPECIES', matchType: 'FUZZY' },
}
const gbifHttp = (urls: string[] = []) => async (url: string) => {
  urls.push(url)
  const k = Object.keys(GBIF).find(k => url.endsWith(k))
  if (!k) throw new Error(`HTTP 404 for ${url}`)
  return GBIF[k]
}

// The step as it was before it went off (20 Nov).
const on = { off: false as const }

test("GBIF's other names: its accepted name for a synonym, then that name's synonyms at species rank; nothing for a fuzzy or genus match", async () => {
  expect(await gbifSynonyms('Helanthium tenellum', gbifHttp())).toEqual(['Alisma tenellum', 'Echinodorus tenellus'])
  expect(await gbifSynonyms('Taxiphyllum barbieri', gbifHttp())).toEqual(['Ectropothecium barbieri', 'Isopterygium barbieri'])
  expect(await gbifSynonyms('Bucephelandra sp.', gbifHttp())).toEqual([])
  expect(await gbifSynonyms('Echinodorus grisebachy', gbifHttp())).toEqual([])
})

test('the backfill writes only pages whose names change, after the scientific name, in the file\'s own indentation; GBIF once a name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-syn-'))
  const write = async (kind: string, id: string, files: Record<string, unknown>, indent = 2) => {
    await mkdir(join(root, 'content', kind, id), { recursive: true })
    for (const [f, v] of Object.entries(files)) await writeFile(join(root, 'content', kind, id, f), `${JSON.stringify(v, null, indent)}\n`)
  }
  const entity = (id: string, scientificName: string, html = '<p>x</p>') => ({ id, scientificName, difficulty: 1, sections: [{ key: 'notes', source: 'tropica', sourceUrl: 'u', html }], updatedAt: '2026-10-01' })
  await write('plants', 'helanthium-tenellum', { 'entity.json': entity('helanthium-tenellum', 'Helanthium tenellum'), 'vi.json': { name: 'Cỏ nhật bản xanh', altNames: [] } }, 4)
  await write('plants', 'taxiphyllum-barbieri', { 'entity.json': entity('taxiphyllum-barbieri', 'Taxiphyllum barbieri'), 'vi.json': { name: 'Rêu java', altNames: [] } })
  await write('plants', 'bucephelandra-sp', { 'entity.json': entity('bucephelandra-sp', 'Bucephelandra sp.'), 'vi.json': { name: 'Bucep', altNames: [] } })
  // Where pages write the old names: a guide (Echinodorus tenellus), a fish page (Isopterygium barbieri).
  await write('guides', 'g', { 'vi.json': { body: '<p>Cỏ nhật bản (Echinodorus tenellus) phủ nền.</p>' } })
  await write('species', 'betta-splendens', { 'entity.json': { scientificName: 'Betta splendens', sections: [{ html: 'Isopterygium barbieri on wood' }] } })
  const before = await readFile(join(root, 'content/plants/bucephelandra-sp/entity.json'), 'utf8')
  const urls: string[] = []
  const r = await addPlantSynonyms(root, gbifHttp(urls), on)
  expect(r).toEqual({ changed: ['helanthium-tenellum: Echinodorus tenellus', 'taxiphyllum-barbieri: Vesicularia dubyana, Isopterygium barbieri'], failed: [] })
  const raw = await readFile(join(root, 'content/plants/helanthium-tenellum/entity.json'), 'utf8')
  expect(raw).toBe(`${JSON.stringify({ id: 'helanthium-tenellum', scientificName: 'Helanthium tenellum', synonyms: ['Echinodorus tenellus'], difficulty: 1, sections: [{ key: 'notes', source: 'tropica', sourceUrl: 'u', html: '<p>x</p>' }], updatedAt: '2026-10-01' }, null, 4)}\n`)
  expect(await readFile(join(root, 'content/plants/bucephelandra-sp/entity.json'), 'utf8')).toBe(before) // not a binomial: GBIF not asked
  expect(urls.some(u => u.includes('Bucephelandra'))).toBe(false)
  // The next run: nothing changes, GBIF isn't asked again, and a page's own synonyms don't count as pages writing them.
  const n = urls.length
  expect(await addPlantSynonyms(root, gbifHttp(urls), on)).toEqual({ changed: [], failed: [] })
  expect(urls).toHaveLength(n)
  await write('guides', 'g', { 'vi.json': { body: '<p>Cỏ nhật bản phủ nền.</p>' } })
  expect((await addPlantSynonyms(root, gbifHttp(urls), on)).changed).toEqual(['helanthium-tenellum: (none)'])
  expect(JSON.parse(await readFile(join(root, 'content/plants/helanthium-tenellum/entity.json'), 'utf8'))).not.toHaveProperty('synonyms')
})

test('a plant whose GBIF lookup fails keeps the names it has until the next run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-syn-'))
  await mkdir(join(root, 'content/plants/helanthium-tenellum'), { recursive: true })
  const file = join(root, 'content/plants/helanthium-tenellum/entity.json')
  await writeFile(file, `${JSON.stringify({ id: 'helanthium-tenellum', scientificName: 'Helanthium tenellum', synonyms: ['Echinodorus tenellus'], sections: [] }, null, 2)}\n`)
  const r = await addPlantSynonyms(root, async () => { throw new Error('HTTP 503 for api.gbif.org') }, on)
  expect(r).toEqual({ changed: [], failed: ['Helanthium tenellum'] })
  expect(JSON.parse(await readFile(file, 'utf8')).synonyms).toEqual(['Echinodorus tenellus'])
})

test('off until its fix: a cycle or a hand run asks GBIF for nothing, writes no file, and the names on plant pages stay as they are (the chief of staff, 20 Nov)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-syn-'))
  const kept = '{"Helanthium tenellum":[]}\n'
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_gbif-synonyms.json'), kept)
  // One page with its names, one whose own text gives a former name it doesn't have yet.
  const page = (id: string, scientificName: string, html: string, extra: Record<string, unknown> = {}) => ({ id, scientificName, ...extra, sections: [{ key: 'notes', source: 'tropica', sourceUrl: 'u', html }] })
  const files: Record<string, string> = {
    'helanthium-tenellum': `${JSON.stringify(page('helanthium-tenellum', 'Helanthium tenellum', '<p>x</p>', { synonyms: ['Alisma tenellum'] }), null, 2)}\n`,
    'taxiphyllum-barbieri': `${JSON.stringify(page('taxiphyllum-barbieri', 'Taxiphyllum barbieri', '<p>Formerly Isopterygium barbieri.</p>'), null, 2)}\n`,
  }
  for (const [id, raw] of Object.entries(files)) {
    await mkdir(join(root, 'content/plants', id), { recursive: true })
    await writeFile(join(root, 'content/plants', id, 'entity.json'), raw)
  }
  const asked: string[] = []
  expect(await addPlantSynonyms(root, async u => { asked.push(u); return {} })).toEqual({ changed: [], failed: [], off: PLANT_SYNONYMS_OFF })
  expect(PLANT_SYNONYMS_OFF).toBeTruthy()
  expect(asked).toEqual([])
  expect(await readFile(join(root, 'engine-state/_gbif-synonyms.json'), 'utf8')).toBe(kept)
  for (const [id, raw] of Object.entries(files)) expect(await readFile(join(root, 'content/plants', id, 'entity.json'), 'utf8')).toBe(raw)
})
