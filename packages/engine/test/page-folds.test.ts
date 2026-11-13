import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { foldPages, FOLDS, type Fold } from '../src/page-folds'

const SF = 'https://www.seriouslyfish.com/species/brochis-arcuata'
const PC = 'https://www.planetcatfish.com/common/species.php?species_id=1273'
const SP = 'https://www.thesprucepets.com/skunk-cory'
const MOLLIES = 'https://www.thesprucepets.com/the-mollie-1380726'
const section = (key: string, source: string, sourceUrl: string) => ({ key, source, sourceUrl, html: '<p>x</p>' })
const photo = (url: string, sourceUrl: string) => ({ url, width: 1200, height: 800, licence: 'CC BY 4.0', author: 'A', sourceUrl, caption: 'c' })
const quality = (bySource: Record<string, number>) => ({ score: Math.min(...Object.values(bySource)), indexable: true, bySource })

// Today's three, in small: the skunk cory filed as a tube worm, Spruce Pets' molly article filed as a moth's genus, and a
// torrent catfish filed as another species of its genus.
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'folds-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/ditrupa-arietina/entity.json', {
    id: 'ditrupa-arietina', scientificName: 'Ditrupa arietina', genus: 'Ditrupa', family: 'Serpulidae', order: 'Sabellida', group: 'catfish', lNumber: 'C020',
    sections: [section('quickFacts', 'seriouslyfish', SF), section('quickFacts', 'planetcatfish', PC)],
    photos: [photo('https://media.aquatome.com/seriouslyfish/a.webp', SF), photo('https://media.aquatome.com/commons/worm.webp', 'https://commons.wikimedia.org/wiki/File:Ditrupa.jpg')],
    dataCard: { sizeCm: [{ source: 'seriouslyfish', value: 6 }, { source: 'planetcatfish', value: 5.5 }], tempC: [{ source: 'seriouslyfish', value: { min: 22, max: 26 } }] },
    places: ['brazil', 'peru'], range: { records: { taxonKey: 5199783, countries: [['NO', 6581]] } }, videos: [], productSlots: [], updatedAt: '2026-11-11',
  })
  await put('content/species/ditrupa-arietina/vi.json', {
    slug: 'ca-ditrupa-arietina', name: 'Cá Ditrupa arietina', altNames: ['Cá chuột vòm', 'Skunk Cory'], held: { checks: ['taxon'], at: '2026-11-11' },
    sections: { 'quickFacts:seriouslyfish': '<p>Cá chuột skunk.</p>', 'quickFacts:planetcatfish': '<p>C020.</p>' }, quality: quality({ seriouslyfish: 0.93, planetcatfish: 0.93 }),
  })
  await put('content/species/corydoras-arcuatus/entity.json', {
    id: 'corydoras-arcuatus', scientificName: 'Corydoras arcuatus', genus: 'Corydoras', family: 'Callichthyidae', order: 'Siluriformes', group: 'catfish',
    sections: [section('quickFacts', 'sprucepets', SP)], photos: [photo('https://media.aquatome.com/commons/skunk.webp', 'https://commons.wikimedia.org/wiki/File:Corydoras_arcuatus.jpg')],
    dataCard: { sizeCm: [{ source: 'sprucepets', value: 5 }] }, places: ['brazil', 'amazon'], range: { native: { countries: ['BR'] } }, videos: [], productSlots: [], updatedAt: '2026-11-01',
  })
  await put('content/species/corydoras-arcuatus/vi.json', { slug: 'ca-chuot-skunk', name: 'Cá chuột skunk', altNames: ['Skunk Cory'], sections: { 'quickFacts:sprucepets': '<p>Spruce.</p>' }, quality: quality({ sprucepets: 0.82 }) })
  await put('content/species/corydoras-arcuatus/id.json', { slug: 'corydoras-arcuatus', name: 'Corydoras Skunk', altNames: [], sections: { 'quickFacts:sprucepets': '<p>Ikan.</p>' }, quality: quality({ sprucepets: 0.9 }) })
  await put('content/summaries/ditrupa-arietina.json', { id: 'ditrupa-arietina', summary: 's' })
  await put('content/traits/ditrupa-arietina.json', { id: 'ditrupa-arietina' })
  await put('engine-state/water/ditrupa-arietina.json', { id: 'ditrupa-arietina' })
  await put('engine-state/range/ditrupa-arietina.json', { id: 'ditrupa-arietina' })
  await put('engine-state/held-by-hand.json', { 'species/ditrupa-arietina': { checks: ['taxon'], why: 'a worm', at: '2026-11-11' } })
  await put('engine-state/seriouslyfish.json', { [SF]: { entityIds: ['species/ditrupa-arietina'], status: 'processed' }, 'https://www.seriouslyfish.com/species/other': { entityIds: ['species/other'] } })
  await put('engine-state/_gbif-names.json', { 'Brochis arcuata': { canonicalName: 'Ditrupa arietina', matchType: 'FUZZY' }, 'Corydoras arcuatus': { canonicalName: 'Corydoras arcuatus', matchType: 'EXACT' } })

  await put('content/species/mollienisia/entity.json', {
    id: 'mollienisia', scientificName: 'Mollienisia', group: 'livebearers', sections: [section('quickFacts', 'sprucepets', MOLLIES)], photos: [photo('https://media.aquatome.com/sprucepets/sailfin.webp', MOLLIES)],
    dataCard: { sizeCm: [{ source: 'sprucepets', value: 15 }] }, places: ['mexico'], videos: [], productSlots: [], updatedAt: '2026-10-30',
  })
  await put('content/species/mollienisia/vi.json', { slug: 'ca-molly-bryophila', name: 'Các loài cá molly', altNames: ['Molly vây buồm'], sections: { 'quickFacts:sprucepets': '<p>Molly vây buồm dài 15 cm.</p>' }, quality: quality({ sprucepets: 0.9 }) })
  await put('content/species/poecilia-sphenops/entity.json', {
    id: 'poecilia-sphenops', scientificName: 'Poecilia sphenops', group: 'livebearers', sections: [section('quickFacts', 'seriouslyfish', 'https://www.seriouslyfish.com/species/poecilia-sphenops')], photos: [],
    dataCard: { sizeCm: [{ source: 'seriouslyfish', value: 6 }] }, places: ['mexico'], videos: [], productSlots: [], updatedAt: '2026-11-01',
  })
  await put('content/species/poecilia-sphenops/vi.json', { slug: 'ca-molly', name: 'Cá molly', altNames: [], sections: { 'quickFacts:seriouslyfish': '<p>SF.</p>' }, quality: quality({ seriouslyfish: 0.9 }) })
  await put('engine-state/sprucepets.json', { [MOLLIES]: { entityIds: ['species/mollienisia'], status: 'processed' } })

  await put('content/species/liobagrus-chenghaiensis/entity.json', {
    id: 'liobagrus-chenghaiensis', scientificName: 'Liobagrus chenghaiensis', genus: 'Liobagrus', family: 'Amblycipitidae', group: 'catfish',
    sections: [section('quickFacts', 'scotcat', 'https://www.scotcat.com/amblycipitidae/liobagrus_chengduensis.htm')], photos: [], dataCard: {}, places: ['china'],
    range: { native: { countries: ['CN'] }, records: { taxonKey: 1 } }, videos: [], productSlots: [], updatedAt: '2026-11-01',
  })
  await put('content/species/liobagrus-chenghaiensis/vi.json', { slug: 'ca-tre-suoi-thanh-do', name: 'Cá trê suối Thành Đô', altNames: [], sections: { 'quickFacts:scotcat': '<p>Minjiang.</p>' }, quality: quality({ scotcat: 0.9 }) })
  await put('content/summaries/liobagrus-chenghaiensis.json', { id: 'liobagrus-chenghaiensis', summary: 's' })
  await put('engine-state/scotcat.json', { 'https://www.scotcat.com/amblycipitidae/liobagrus_chengduensis.htm': { entityIds: ['species/liobagrus-chenghaiensis'] } })
  return root
}
const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
const files = async (dir: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {}
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) Object.assign(out, await files(p))
    else out[p] = await readFile(p, 'utf8')
  }
  return out
}

test("the skunk cory filed as a tube worm joins its fish's page: its sources' text, photos, figures and L number, the worm's name nowhere, its address forwarding with no note", async () => {
  const root = await store()
  expect(await foldPages(root, FOLDS, '2026-11-13')).toEqual(['ditrupa-arietina → corydoras-arcuatus', 'mollienisia → poecilia-sphenops', 'liobagrus-chenghaiensis → liobagrus-chengduensis'])
  const e = await read(root, 'content/species/corydoras-arcuatus/entity.json')
  expect(e.sections.map((s: { sourceUrl: string }) => s.sourceUrl)).toEqual([SP, SF, PC])
  // The source's own photos; not one a search found under the worm's name.
  expect(e.photos.map((p: { url: string }) => p.url)).toEqual(['https://media.aquatome.com/commons/skunk.webp', 'https://media.aquatome.com/seriouslyfish/a.webp'])
  expect(e.dataCard).toEqual({ sizeCm: [{ source: 'sprucepets', value: 5 }, { source: 'seriouslyfish', value: 6 }, { source: 'planetcatfish', value: 5.5 }], tempC: [{ source: 'seriouslyfish', value: { min: 22, max: 26 } }] })
  expect([e.lNumber, e.updatedAt, e.range, e.places]).toEqual(['C020', '2026-11-13', { native: { countries: ['BR'] } }, ['brazil', 'amazon', 'peru']])
  const vi = await read(root, 'content/species/corydoras-arcuatus/vi.json')
  expect(Object.keys(vi.sections)).toEqual(['quickFacts:sprucepets', 'quickFacts:seriouslyfish', 'quickFacts:planetcatfish'])
  expect([vi.name, vi.slug, vi.altNames, vi.redirectFrom]).toEqual(['Cá chuột skunk', 'ca-chuot-skunk', ['Skunk Cory', 'Cá chuột vòm'], [{ slug: 'ca-ditrupa-arietina', name: '' }]])
  expect(vi.quality).toEqual({ score: 0.82, indexable: true, bySource: { seriouslyfish: 0.93, planetcatfish: 0.93, sprucepets: 0.82 } })
  expect(vi.held).toBeUndefined()
  expect(JSON.stringify(vi)).not.toMatch(/ditrupa arietina|Cá Ditrupa/i)
  // A language the gone page didn't have is left for the engine to write.
  expect((await read(root, 'content/species/corydoras-arcuatus/id.json')).sections).toEqual({ 'quickFacts:sprucepets': '<p>Ikan.</p>' })
  // The gone page and what the engine kept about it.
  for (const p of ['content/species/ditrupa-arietina', 'content/summaries/ditrupa-arietina.json', 'content/traits/ditrupa-arietina.json', 'engine-state/water/ditrupa-arietina.json', 'engine-state/range/ditrupa-arietina.json']) expect(existsSync(join(root, p)), p).toBe(false)
  expect(await read(root, 'engine-state/seriouslyfish.json')).toEqual({ [SF]: { entityIds: ['species/corydoras-arcuatus'], status: 'processed' }, 'https://www.seriouslyfish.com/species/other': { entityIds: ['species/other'] } })
  expect(await read(root, 'engine-state/held-by-hand.json')).toEqual({})
  expect(await read(root, 'engine-state/_gbif-names.json')).toEqual({ 'Corydoras arcuatus': { canonicalName: 'Corydoras arcuatus', matchType: 'EXACT' } })
  // Done once: the second run changes nothing.
  const before = await files(root)
  expect(await foldPages(root, FOLDS, '2026-11-14')).toEqual([])
  expect(await files(root)).toEqual(before)
})

test('an article on several mollies gives the common molly\'s page none of its text or names, only its address, forwarding with its old name', async () => {
  const root = await store()
  await foldPages(root, FOLDS, '2026-11-13')
  expect(await read(root, 'content/species/poecilia-sphenops/entity.json')).toMatchObject({ sections: [{ source: 'seriouslyfish' }], photos: [], dataCard: { sizeCm: [{ source: 'seriouslyfish', value: 6 }] }, updatedAt: '2026-11-01' })
  const vi = await read(root, 'content/species/poecilia-sphenops/vi.json')
  expect([Object.keys(vi.sections), vi.altNames, vi.redirectFrom]).toEqual([['quickFacts:seriouslyfish'], [], [{ slug: 'ca-molly-bryophila', name: 'Các loài cá molly' }]])
  expect(existsSync(join(root, 'content/species/mollienisia'))).toBe(false)
  // Its source's read names no page now.
  expect((await read(root, 'engine-state/sprucepets.json'))[MOLLIES].entityIds).toEqual([])
})

test('a page filed under another species of its genus moves to its own, whole, its address as it was', async () => {
  const root = await store()
  await foldPages(root, FOLDS, '2026-11-13')
  expect(existsSync(join(root, 'content/species/liobagrus-chenghaiensis'))).toBe(false)
  const e = await read(root, 'content/species/liobagrus-chengduensis/entity.json')
  // The other species' range records go; its own range stays.
  expect([e.id, e.scientificName, e.genus, e.range]).toEqual(['liobagrus-chengduensis', 'Liobagrus chengduensis', 'Liobagrus', { native: { countries: ['CN'] } }])
  expect(await read(root, 'content/species/liobagrus-chengduensis/vi.json')).toMatchObject({ slug: 'ca-tre-suoi-thanh-do', name: 'Cá trê suối Thành Đô', sections: { 'quickFacts:scotcat': '<p>Minjiang.</p>' } })
  expect(await read(root, 'content/summaries/liobagrus-chengduensis.json')).toEqual({ id: 'liobagrus-chengduensis', summary: 's' })
  expect(existsSync(join(root, 'content/summaries/liobagrus-chenghaiensis.json'))).toBe(false)
  expect(Object.values(await read(root, 'engine-state/scotcat.json'))).toEqual([{ entityIds: ['species/liobagrus-chengduensis'] }])
})

test('a fold whose page is gone, or whose page a person already moved, is left', async () => {
  const root = await store()
  const none: Fold[] = [{ from: 'not-here', into: 'corydoras-arcuatus' }]
  const before = await files(root)
  expect(await foldPages(root, none, '2026-11-13')).toEqual([])
  // Only GBIF's answers a person found wrong leave its record.
  const after = await files(root)
  expect(Object.keys(after).filter(k => after[k] !== before[k]).map(k => k.slice(root.length + 1))).toEqual(['engine-state/_gbif-names.json'])
})

// Astra, 2026-11-13: with the fish's page gone, the worm's page and the molly article stayed whole and moved under the
// fish's id, the worm's taxonomy and the article's moth genus with them.
test('a fold into a page the site doesn\'t have, and isn\'t a move, is left: the page as it was, nothing written under the fish', async () => {
  const root = await store()
  const { rm } = await import('node:fs/promises')
  for (const id of ['corydoras-arcuatus', 'poecilia-sphenops']) await rm(join(root, 'content/species', id), { recursive: true })
  const before = await files(root)
  expect(await foldPages(root, FOLDS, '2026-11-13')).toEqual(['liobagrus-chenghaiensis → liobagrus-chengduensis'])
  const after = await files(root)
  const changed = Object.keys({ ...before, ...after }).filter(k => after[k] !== before[k]).map(k => k.slice(root.length + 1))
  expect(changed.filter(k => /ditrupa|corydoras|mollienisia|poecilia|sprucepets|seriouslyfish|held-by-hand/.test(k))).toEqual([])
  expect(existsSync(join(root, 'content/species/corydoras-arcuatus'))).toBe(false)
  expect(existsSync(join(root, 'content/species/poecilia-sphenops'))).toBe(false)
})

// GBIF's wrong answers on record under another spelling leave it too.
test('GBIF\'s wrong answers leave the record however they are spelled; the rest stay', async () => {
  const root = await store()
  await writeFile(join(root, 'engine-state/_gbif-names.json'), `${JSON.stringify({ 'brochis  arcuata': { canonicalName: 'Ditrupa arietina' }, 'Megalamphodus rosaceus ': { canonicalName: 'Hyphessobrycon roseus' }, 'Corydoras arcuatus': { canonicalName: 'Corydoras arcuatus' } }, null, 2)}\n`)
  await foldPages(root, [], '2026-11-13')
  expect(Object.keys(await read(root, 'engine-state/_gbif-names.json'))).toEqual(['Corydoras arcuatus'])
})
