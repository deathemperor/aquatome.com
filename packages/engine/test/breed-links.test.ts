import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { BreedEntity } from '@aq/schema'
import { linkBreed, speciesResolver, type BreedFacts } from '../src/breeds'
import { sweep } from '../src/sweep'

// The species pages a store has, and what GBIF answered for names the engine looked up (engine-state/_gbif-names.json).
const PAGES: Record<string, string> = {
  'pterophyllum-scalare': 'Pterophyllum scalare',
  'heros-severus': 'Heros severus',
  'poecilia-sphenops': 'Poecilia sphenops',
  'poecilia-latipinna': 'Poecilia latipinna',
  'caridina-logemanni': 'Caridina logemanni',
  'cichlasoma-trimaculatum': 'Cichlasoma trimaculatum',
  'vieja-melanura': 'Vieja melanura',
  // A page under a synonym of the name research gives.
  'papiliochromis-ramirezi': 'Papiliochromis ramirezi',
  // Two pages GBIF calls one species: a third name for it links to neither.
  'symphysodon-aequifasciatus': 'Symphysodon aequifasciatus',
  'symphysodon-haraldi': 'Symphysodon haraldi',
}
const GBIF = {
  'Vieja synspila': { canonicalName: 'Vieja melanura', matchType: 'EXACT' },
  'Papiliochromis ramirezi': { canonicalName: 'Mikrogeophagus ramirezi', matchType: 'EXACT' },
  'Symphysodon haraldi': { canonicalName: 'Symphysodon aequifasciatus', matchType: 'EXACT' },
  'Symphysodon tarzoo': { canonicalName: 'Symphysodon aequifasciatus', matchType: 'EXACT' },
  // A fuzzy match can be another fish.
  'Amphilophus trimaculatus': { canonicalName: 'Cichlasoma trimaculatum', matchType: 'FUZZY' },
  'Caridina cantonensis': { canonicalName: 'Caridina cantonensis', matchType: 'EXACT' },
}

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'aq-breed-links-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  for (const [id, sci] of Object.entries(PAGES)) await put(`content/species/${id}/entity.json`, { id, scientificName: sci })
  await put('engine-state/_gbif-names.json', GBIF)
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(root, 'content/sources.json'))
  return { root, put }
}

const research = (o: Partial<BreedFacts>): BreedFacts => ({
  found: true, kind: 'variety', enNames: [], viNames: [], parents: [], origin: [], looks: [], lines: [], care: [], keeping: [], breeding: [], health: [], buying: [], controversy: [],
  sources: [{ url: 'https://a.example', title: 'A', kind: 'article' }, { url: 'notes', title: 'B', kind: 'other' }], ...o,
})
const breed = (o: Partial<BreedEntity>): BreedEntity => ({ id: 'b', kind: 'variety', parents: [], care: {}, photos: [], sources: [{ url: 'https://a.example', title: 'A', kind: 'article', at: '2026-10-30' }], updatedAt: '2026-10-30', ...o })

test('a variety links the species page its research names, by the name the page has', async () => {
  const species = await speciesResolver((await store()).root)
  const { entity, links } = linkBreed(breed({ id: 'koi-angelfish' }), research({ basedOn: 'Pterophyllum scalare' }), species)
  expect(entity).toEqual(breed({ id: 'koi-angelfish', basedOn: 'pterophyllum-scalare' }))
  expect(Object.keys(entity).slice(0, 3)).toEqual(['id', 'kind', 'basedOn']) // where makeBreed writes it
  expect(links).toEqual(['basedOn → pterophyllum-scalare ("Pterophyllum scalare")'])
  // A note after the name is left out.
  expect(species('Pterophyllum scalare (syn. Platax scalaris)')).toBe('pterophyllum-scalare')
})

test('a synonym GBIF gives links the page of its species, either way round; a fuzzy match does not', async () => {
  const species = await speciesResolver((await store()).root)
  // The research's name is a synonym of the page's.
  expect(species('Vieja synspila (syn. Cichlasoma synspilum)')).toBe('vieja-melanura')
  // The page's name is a synonym of the research's.
  expect(species('Mikrogeophagus ramirezi')).toBe('papiliochromis-ramirezi')
  const { entity } = linkBreed(breed({}), research({ basedOn: 'Vieja synspila' }), species)
  expect(entity.basedOn).toBe('vieja-melanura')
  expect(species('Amphilophus trimaculatus')).toBeUndefined()
})

test('a name that could be two pages, or is not one species, is left unlinked', async () => {
  const species = await speciesResolver((await store()).root)
  for (const name of [
    'Poecilia sphenops / Poecilia latipinna (sources disagree; fancy mollies are often of mixed molly ancestry)',
    'Caridina', 'Caridina sp.', 'Cyprinus carpio var. flavipinnis', 'Amphilophus citrinellus × Amphilophus labiatus',
    // A species the handbook has no page for, though its genus has one.
    'Caridina cantonensis',
    // A synonym of a species two pages stand for.
    'Symphysodon tarzoo',
    '', undefined,
  ]) expect(species(name), String(name)).toBeUndefined()
  const { entity, links } = linkBreed(breed({}), research({ basedOn: 'Poecilia sphenops / Poecilia latipinna' }), species)
  expect(entity.basedOn).toBeUndefined()
  expect(links).toEqual([])
})

test("a hybrid's parents link the pages the handbook has, in the order the page lists them", async () => {
  const species = await speciesResolver((await store()).root)
  const facts = research({
    kind: 'hybrid',
    parents: [
      { name: 'Midas cichlid', scientificName: 'Amphilophus citrinellus', certain: false, source: 0 },
      // Cites a source that isn't a web page: never on the page, so the page's second parent is the research's third.
      { name: 'Uncited', scientificName: 'Pterophyllum scalare', certain: false, source: 1 },
      { name: 'Redhead cichlid', scientificName: 'Vieja melanurus (syn. Vieja synspila)', certain: false, source: 0 },
      { name: 'Severum', scientificName: 'Heros severus', certain: false, source: 0 },
    ],
  })
  const page = breed({ id: 'blood-parrot-cichlid', kind: 'hybrid', parents: [{ name: 'Midas cichlid (Amphilophus citrinellus)', species: 'amphilophus-citrinellus', certain: false }, { name: 'Redhead cichlid (Vieja melanurus)', certain: false }, { name: 'Severum (Heros severus)', certain: false }] })
  const { entity, links } = linkBreed(page, facts, species)
  expect(entity.parents).toEqual([page.parents[0], page.parents[1], { name: 'Severum (Heros severus)', species: 'heros-severus', certain: false }])
  expect(entity.basedOn).toBeUndefined()
  expect(links).toEqual(['parent "Severum (Heros severus)" → heros-severus ("Heros severus")'])
  // The page's parents no longer its research's: none is guessed.
  const other = linkBreed({ ...page, parents: page.parents.slice(1) }, facts, species)
  expect(other.links).toEqual([])
  expect(other.unmatched).toBe('parents left: 2 on the page, 3 in its research')
})

test('a link a breed has is never changed', async () => {
  const species = await speciesResolver((await store()).root)
  // A line of another breed, and a parent the owner linked by hand.
  const page = breed({ basedOn: 'flowerhorn-cichlid', kind: 'hybrid', parents: [{ name: 'Severum', species: 'heros-hand', certain: true }] })
  const { entity, links } = linkBreed(page, research({ basedOn: 'Pterophyllum scalare', parents: [{ name: 'Severum', scientificName: 'Heros severus', certain: true, source: 0 }] }), species)
  expect(entity).toEqual(page)
  expect(links).toEqual([])
})

test('the sweep links breeds written before their species had a page, logs each link, and does nothing the second time', async () => {
  const { root, put } = await store()
  await put('content/breeds/koi-angelfish/entity.json', breed({ id: 'koi-angelfish' }))
  await put('engine-state/breeds/koi-angelfish.json', research({ basedOn: 'Pterophyllum scalare' }))
  await put('content/breeds/balloon-molly/entity.json', breed({ id: 'balloon-molly', parents: [{ name: 'Common molly (Poecilia sphenops)', certain: false }, { name: 'Sailfin molly (Poecilia latipinna)', certain: false }] }))
  await put('engine-state/breeds/balloon-molly.json', research({ basedOn: 'Poecilia sphenops / Poecilia latipinna', parents: [{ name: 'Common molly', scientificName: 'Poecilia sphenops', certain: false, source: 0 }, { name: 'Sailfin molly', scientificName: 'Poecilia latipinna', certain: false, source: 0 }] }))
  // No species page for its research's name: stays as it is.
  await put('content/breeds/crystal-red-shrimp/entity.json', breed({ id: 'crystal-red-shrimp' }))
  await put('engine-state/breeds/crystal-red-shrimp.json', research({ basedOn: 'Caridina cantonensis' }))
  // No research kept: nothing to link it by.
  await put('content/breeds/huyet-long/entity.json', breed({ id: 'huyet-long' }))
  const before = await readFile(join(root, 'content/breeds/crystal-red-shrimp/entity.json'), 'utf8')

  const r = await sweep(root)
  expect(r.links).toEqual([
    'breeds/balloon-molly: parent "Common molly (Poecilia sphenops)" → poecilia-sphenops ("Poecilia sphenops")',
    'breeds/balloon-molly: parent "Sailfin molly (Poecilia latipinna)" → poecilia-latipinna ("Poecilia latipinna")',
    'breeds/koi-angelfish: basedOn → pterophyllum-scalare ("Pterophyllum scalare")',
  ])
  expect(r.files.filter(f => f.startsWith('breeds/'))).toEqual(['breeds/balloon-molly/entity.json', 'breeds/koi-angelfish/entity.json'])
  const read = async (f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))
  expect(await read('content/breeds/koi-angelfish/entity.json')).toEqual(breed({ id: 'koi-angelfish', basedOn: 'pterophyllum-scalare' })) // its date too
  expect((await read('content/breeds/balloon-molly/entity.json')).basedOn).toBeUndefined()
  expect(await readFile(join(root, 'content/breeds/crystal-red-shrimp/entity.json'), 'utf8')).toBe(before)
  const today = new Date().toISOString().slice(0, 10)
  const log = await read('engine-state/_breed-links.json')
  expect(log).toEqual({
    'balloon-molly': [`parent "Common molly (Poecilia sphenops)" → poecilia-sphenops ("Poecilia sphenops"), ${today}`, `parent "Sailfin molly (Poecilia latipinna)" → poecilia-latipinna ("Poecilia latipinna"), ${today}`],
    'koi-angelfish': [`basedOn → pterophyllum-scalare ("Pterophyllum scalare"), ${today}`],
  })

  const again = await sweep(root)
  expect(again.links).toEqual([])
  expect(again.files).toEqual([])
  expect(await read('engine-state/_breed-links.json')).toEqual(log)
})
