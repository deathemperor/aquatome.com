import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { cleanAltNames, type BreedName } from '../src/alt-names'
import { sweep } from '../src/sweep'

// The betta's other names as the engine had stored them (2026-11-04): shop listings of one variety each (BW Aquatics'
// Alien hybrids, a Red Spade Tail betta) gave theirs, and every merge kept them.
const BETTA = ['Cá betta Green Alien', 'Cá betta Alien xanh lục', 'Cá betta Alien Green', 'Alien Betta Green Hybrid', 'Green Alien Betta', 'Teal Alien Betta',
  'Cá lia thia Alien Green', 'Betta Alien xanh lá', 'Cá betta Alien xanh', 'Cá betta Royal Blue Alien', 'Alien Betta Blue Hybrid', 'Blue Alien Betta',
  'Royal Blue Alien Betta', 'Cá betta Alien', 'Betta Alien xám', 'Cá betta lai Alien', 'Alien Betta Gray Hybrid', 'Grey Alien Betta', 'Steel Blue Alien Betta',
  'Cá lia thia', 'Cá xiêm', 'Red Spade Tail Betta', 'Betta Splendens (Red Spade Tail)', 'Cá betta Copper Alien lai', 'Cá betta alien đồng',
  'Alien Betta Copper Hybrid', 'Copper Alien Betta', 'Cá chọi Xiêm', 'Betta', 'Siamese fighting fish', 'Cá chọi Thái Lan', 'Siamese Fighting Fish']
const BETTA_OWN = ['Cá lia thia', 'Cá xiêm', 'Cá chọi Xiêm', 'Betta', 'Siamese fighting fish', 'Cá chọi Thái Lan']
const BETTA_BREEDS = [{ id: 'halfmoon-betta', name: 'Cá betta Halfmoon (Halfmoon betta)' }, { id: 'plakat-betta', name: 'Cá Betta Plakat (Plakat betta)' }]
const betta = (altNames: string[]) => ({ name: 'Cá betta (cá xiêm)', sci: 'Betta splendens', altNames })

test("the betta keeps its own names: its varieties' go, one name written twice is kept once", () => {
  const r = cleanAltNames(betta(BETTA), BETTA_BREEDS)
  expect(r.altNames).toEqual(BETTA_OWN)
  expect(r.off.filter(o => o.why === 'variety').map(o => o.name)).toEqual(BETTA.filter(n => /alien|spade/i.test(n)))
  expect(r.off.filter(o => o.why === 'duplicate')).toEqual([{ name: 'Siamese Fighting Fish', why: 'duplicate', of: 'Siamese fighting fish' }])
})

test("a breed page's name leaves the species: that page is found by it", () => {
  const r = cleanAltNames(betta(['Cá xiêm', 'Halfmoon betta', 'Cá betta Halfmoon', 'Plakat Betta', 'Betta']), BETTA_BREEDS)
  expect(r.altNames).toEqual(['Cá xiêm', 'Betta'])
  expect(r.off).toEqual([
    { name: 'Halfmoon betta', why: 'breed', of: 'halfmoon-betta' }, { name: 'Cá betta Halfmoon', why: 'breed', of: 'halfmoon-betta' },
    { name: 'Plakat Betta', why: 'breed', of: 'plakat-betta' },
  ])
  // A goldfish line under the goldfish, GloFish under the zebra danio: whatever the breed is based on.
  expect(cleanAltNames({ name: 'Cá vàng', sci: 'Carassius auratus', altNames: ['Goldfish', 'Bubble Eye Goldfish'] }, [{ id: 'bubble-eye-goldfish', name: 'Cá vàng mắt bong bóng (Bubble eye goldfish)' }]).altNames).toEqual(['Goldfish'])
  expect(cleanAltNames({ name: 'Cá ngựa vằn', sci: 'Danio rerio', altNames: ['Zebra danio', 'Cá GloFish'] }, [{ id: 'glofish', name: 'Cá GloFish' }]).altNames).toEqual(['Zebra danio'])
  // The koi is its species' namesake ("Cá koi", "ปลาคาร์ป"): the species keeps its names, Koi among them.
  const koi = [{ id: 'koi', name: 'Cá Koi (Nishikigoi)' }]
  expect(cleanAltNames({ name: 'Cá koi', sci: 'Cyprinus rubrofuscus', altNames: ['Cá chép Nhật', 'Nishikigoi', 'Japanese koi', 'Koi carp'] }, koi).altNames).toEqual(['Cá chép Nhật', 'Nishikigoi', 'Japanese koi', 'Koi carp'])
  expect(cleanAltNames({ name: 'ปลาคาร์ป', sci: 'Cyprinus rubrofuscus', altNames: ['ปลาโค่ย', 'Koi', 'Nishikigoi'] }, [{ id: 'koi', name: 'ปลาคาร์ป (Koi)' }]).altNames).toEqual(['ปลาโค่ย', 'Koi', 'Nishikigoi'])
})

test('a colour form or bred line is the species\' name with its marker; a name that only has a marker\'s word stays', () => {
  const off = (page: { name: string; sci: string }, names: string[]) => cleanAltNames({ ...page, altNames: names }).off.map(o => o.name)
  const tiger = { name: 'Cá tứ vân', sci: 'Puntigrus tetrazona' }
  expect(off(tiger, ['Tiger barb', 'Cá tứ vân albino', 'Albino tiger barb', 'Cá tứ vân xanh'])).toEqual(['Cá tứ vân albino', 'Albino tiger barb'])
  expect(off({ name: 'Cá anh đào', sci: 'Puntius titteya' }, ['Cherry barb', 'Super Red Cherry barb', 'Cá Cherry barb Super Red', 'Super Red'])).toEqual(['Super Red Cherry barb', 'Cá Cherry barb Super Red', 'Super Red'])
  // What the species are called, not a form of them: no other name of theirs is left once the word goes.
  expect(off({ name: 'Cá galaxy', sci: 'Danio margaritatus' }, ['Galaxy rasbora', 'Celestial pearl danio'])).toEqual([])
  expect(off({ name: 'Cá rìu bạc', sci: 'Thoracocharax stellatus' }, ['Platinum hatchetfish', 'Spotfin hatchetfish'])).toEqual([])
  expect(off({ name: 'Cá mập bala', sci: 'Balantiocheilos melanopterus' }, ['Bala shark', 'Tricolor shark minnow', 'Cá mập ba màu'])).toEqual([])
  expect(off({ name: 'Cá neon', sci: 'Paracheirodon innesi' }, ['Neon tetra', 'Cá neon xanh'])).toEqual([]) // a colour alone
  // A genus or group page lists its kinds as its other names.
  expect(off({ name: 'Các loài cá molly', sci: 'Mollienisia' }, ['Cá molly', 'Molly đen', 'Albino molly'])).toEqual([])
})

test('one name written twice is kept once, in its best-written form, where the first stood', () => {
  const clean = (page: { name: string; sci: string }, names: string[]) => cleanAltNames({ ...page, altNames: names }).altNames
  expect(clean({ name: 'Cá nóc lùn', sci: 'Carinotetraodon travancoricus' }, ['Pea Puffer', 'Cá nóc đậu', 'Pea puffer', 'Malabar Puffer', 'Malabar puffer', 'Ca noc dau']))
    .toEqual(['Pea puffer', 'Cá nóc đậu', 'Malabar puffer'])
  // "Cá …" before an English name of two words or more goes; before one word, or a Vietnamese name, it stays (other
  // pages' text links names of two words or more).
  expect(clean({ name: 'Cá Oscar (cá tai tượng Phi châu)', sci: 'Astronotus ocellatus' }, ['Cá Oscar', 'Tiger oscar', 'Oscar', 'Cá Tiger Oscar', 'Pacu cừu', 'Cá pacu cừu']))
    .toEqual(['Cá Oscar', 'Tiger oscar', 'Cá pacu cừu'])
  // The page's own name, its scientific name, and "X (Y)" whose X and Y the page has. Not its name's parts: other pages
  // link "cá xiêm" to the betta by them.
  expect(clean({ name: 'Cá platy', sci: 'Xiphophorus maculatus' }, ['Platy', 'Cá Xiphophorus maculatus', 'Xiphophorus maculatus', 'Southern platyfish', 'Cá platy đốm (Southern platyfish)', 'Cá platy đốm']))
    .toEqual(['Southern platyfish', 'Cá platy đốm'])
  expect(clean(betta([]), ['Cá xiêm', 'Cá betta'])).toEqual(['Cá xiêm', 'Cá betta'])
  // Punctuation is not a word; joined words are another word ("horse face" doesn't find "horseface"). Thai, with or without ปลา.
  expect(clean({ name: 'Cá chạch ngựa', sci: 'Acantopsis dialuzona' }, ['Horse face loach', 'Horseface loach', 'Horse-face Loach'])).toEqual(['Horse face loach', 'Horseface loach'])
  expect(clean({ name: 'ปลากัดมหาชัย', sci: 'Betta mahachaiensis' }, ['กัดมหาชัย', 'Mahachai betta', 'ปลากัด มหาชัย'])).toEqual(['Mahachai betta'])
  expect(clean({ name: 'ปลารากกล้วย', sci: 'Acanthopsoides molobrion' }, ['รากกล้วยแคระ', 'ปลารากกล้วยแคระ'])).toEqual(['ปลารากกล้วยแคระ'])
})

test('cleaning cleaned names changes nothing', () => {
  const pages: [{ name: string; sci: string; altNames: string[] }, BreedName[]][] = [
    [betta(BETTA), BETTA_BREEDS], [{ name: 'Cá Oscar', sci: 'Astronotus ocellatus', altNames: ['Oscar', 'Tiger Oscar', 'Cá Tiger Oscar', 'Tiger oscar', 'Red oscar'] }, []],
  ]
  for (const [page, breeds] of pages) {
    const once = cleanAltNames(page, breeds)
    expect(cleanAltNames({ ...page, altNames: once.altNames }, breeds)).toEqual({ altNames: once.altNames, off: [] })
  }
})

test('the sweep keeps each species page to its own names in every language, says what it took off and why, and does nothing the second time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'names-'))
  const c = join(root, 'content')
  const put = async (path: string, data: unknown, indent = 2) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, indent)}\n`) }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  await put('species/betta-splendens/entity.json', {
    id: 'betta-splendens', scientificName: 'Betta splendens', order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Betta', group: 'labyrinth', places: [], dataCard: {},
    sections: [{ key: 'habitat', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html: '<p>Rice paddies.</p>' }], photos: [], videos: [], productSlots: [], updatedAt: '2026-10-01',
  })
  const t = (name: string, altNames: string[]) => ({ slug: 'ca-betta', name, altNames, sections: { 'habitat:seriouslyfish': '<p>Ruộng lúa.</p>' }, quality: { score: 0.9, indexable: true } })
  await put('species/betta-splendens/vi.json', { ...t('Cá betta (cá xiêm)', [...BETTA, 'Cá betta Halfmoon']), nameFixed: true }, 1)
  await put('species/betta-splendens/id.json', t('Ikan cupang', ['Cupang', 'Betta', 'Ikan laga', 'Plakat betta']))
  // The plakat page lists the betta's names among its own ("Cá xiêm", "Cá lia thia"): they stay the betta's.
  const breed = async (id: string, vi: string, viAlt: string[], id_: string) => {
    await put(`breeds/${id}/entity.json`, { id, kind: 'variety', basedOn: 'betta-splendens', parents: [], care: {}, photos: [], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
    await put(`breeds/${id}/vi.json`, { slug: id, name: vi, altNames: viAlt, sections: {}, body: '<p>Một dòng cá betta.</p>', quality: { score: 0.9, indexable: true } })
    await put(`breeds/${id}/id.json`, { slug: id, name: id_, altNames: [], sections: {}, body: '<p>Satu jenis cupang.</p>', quality: { score: 0.9, indexable: true } })
  }
  await breed('plakat-betta', 'Cá Betta Plakat (Plakat betta)', ['HMPK', 'Cá lia thia', 'Cá xiêm', 'Cá chọi'], 'Cupang plakat (Plakat betta)')
  await breed('halfmoon-betta', 'Cá betta Halfmoon (Halfmoon betta)', ['Cá xiêm'], 'Cupang halfmoon')

  const r = await sweep(root)
  const read = async (path: string) => readFile(join(c, path), 'utf8')
  expect(JSON.parse(await read('species/betta-splendens/vi.json'))).toMatchObject({ name: 'Cá betta (cá xiêm)', altNames: BETTA_OWN, nameFixed: true })
  expect((await read('species/betta-splendens/vi.json')).startsWith('{\n "slug"')).toBe(true) // its own indentation
  expect(JSON.parse(await read('species/betta-splendens/id.json')).altNames).toEqual(['Betta', 'Ikan laga'])
  expect(JSON.parse(await read('breeds/plakat-betta/vi.json')).altNames).toEqual(['HMPK', 'Cá lia thia', 'Cá xiêm', 'Cá chọi']) // breed pages as they were
  expect(r.files.sort()).toEqual(['species/betta-splendens/id.json', 'species/betta-splendens/vi.json'])
  expect(r.names).toContain('vi/betta-splendens: "Cá betta Green Alien" (a variety\'s name)')
  expect(r.names).toContain('vi/betta-splendens: "Siamese Fighting Fish" (written twice: "Siamese fighting fish")')
  expect(r.names).toContain('vi/betta-splendens: "Cá betta Halfmoon" (a breed\'s name: breeds/halfmoon-betta)')
  expect(r.names).toContain('id/betta-splendens: "Cupang" (its name)')
  expect(r.names).toContain('id/betta-splendens: "Plakat betta" (a breed\'s name: breeds/plakat-betta)')
  expect(r.names).toHaveLength(BETTA.length - BETTA_OWN.length + 3)
  const log = JSON.parse(await readFile(join(root, 'engine-state/_names-off.json'), 'utf8'))
  expect(Object.keys(log)).toEqual(['id/betta-splendens', 'vi/betta-splendens'])
  expect(log['vi/betta-splendens']['Red Spade Tail Betta']).toMatch(/^a variety's name, \d{4}-\d\d-\d\d$/)

  const again = await sweep(root)
  expect(again.files).toEqual([])
  expect(again.names).toEqual([])
})
