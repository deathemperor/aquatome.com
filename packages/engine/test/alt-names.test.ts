import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { breedKin, cleanAltNames, cleanBreedAltNames, type BreedName, type Kin } from '../src/alt-names'
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

// The halfmoon betta's other names as the engine had stored them (2026-11-05): its research gave the betta's names too, so
// every guide naming the betta ("cá xiêm") was listed on the halfmoon's page, a pea puffer video among them.
const HALFMOON = ['Betta HM', 'Cá Betta Rồng Half Moon', 'Cá xiêm', 'Cá chọi', 'Half moon betta', 'HM betta', 'Halfmoon Siamese fighting fish', 'Cá xiêm / cá chọi (tên chung của loài)']
const PLAKAT = ['Plakat Thai', 'Short-finned betta', 'HMPK', 'Cá đá', 'Cá lia thia', 'Cá xiêm', 'Cá chọi', 'cá đá (plakat chọn làm cá đá)',
  'cá lia thia / cá xiêm / cá chọi (tên chung của betta, plakat là dạng đuôi ngắn)']
const BETTA_KIN: Kin[] = [{ id: 'betta-splendens', sci: 'Betta splendens', names: ['Cá betta (cá xiêm)', ...BETTA_OWN] }]
const halfmoon = (altNames: string[]) => ({ id: 'halfmoon-betta', name: 'Cá betta Halfmoon (Halfmoon betta)', altNames })
const plakat = (altNames: string[]) => ({ id: 'plakat-betta', name: 'Cá Betta Plakat (Plakat betta)', altNames })

test("a breed keeps its own names: its species' leave it, and those a note calls the species'", () => {
  const r = cleanBreedAltNames(halfmoon(HALFMOON), BETTA_KIN, BETTA_BREEDS)
  expect(r.altNames).toEqual(['Betta HM', 'Cá Betta Rồng Half Moon', 'Half moon betta', 'HM betta', 'Halfmoon Siamese fighting fish'])
  // "Cá chọi" is no other name of the betta's page: its note says it is the species'.
  expect(r.off).toEqual(['Cá xiêm', 'Cá chọi', 'Cá xiêm / cá chọi (tên chung của loài)'].map(name => ({ name, why: 'species', of: 'betta-splendens' })))
  // A note on the breed's own use of a name is not one ("cá đá": a plakat kept for fighting).
  expect(cleanBreedAltNames(plakat(PLAKAT), BETTA_KIN, BETTA_BREEDS).altNames).toEqual(['Plakat Thai', 'Short-finned betta', 'HMPK', 'Cá đá', 'cá đá (plakat chọn làm cá đá)'])
  // The species' name however written: case, accents, "Cá" before it, its scientific name, two of them in one.
  expect(cleanBreedAltNames(halfmoon(['ca xiem', 'Xiêm', 'Betta', 'Betta splendens', 'Cá xiêm (Siamese fighting fish)', 'Cá lia thia / Betta', 'HM betta']), BETTA_KIN).altNames).toEqual(['HM betta'])
  // A bred line's name is the breed's own, with the species' words in it ("Koi plakat betta" under the koi betta).
  expect(cleanBreedAltNames({ id: 'koi-betta', name: 'Betta Koi (Koi betta)', altNames: ['Koi plakat betta', 'Galaxy koi betta', 'Cá betta koi'] }, BETTA_KIN).altNames).toEqual(['Koi plakat betta', 'Galaxy koi betta', 'Cá betta koi'])
})

test("a hybrid's parents' names leave it", () => {
  const kin: Kin[] = [
    { id: 'amphilophus-citrinellus', sci: 'Amphilophus citrinellus', names: ['Cá Midas', 'Midas cichlid'] },
    { id: 'amphilophus-labiatus', sci: 'Amphilophus labiatus', names: ['Cá red devil (Red devil cichlid)'] },
  ]
  const r = cleanBreedAltNames({ id: 'blood-parrot-cichlid', name: 'Cá hồng két (Blood parrot cichlid)', altNames: ['Cá két đỏ', 'Midas cichlid', 'Cá hồng két King Kong', 'Red devil cichlid', 'Cá Midas / cá red devil'] }, kin)
  expect(r.altNames).toEqual(['Cá két đỏ', 'Cá hồng két King Kong'])
  expect(r.off).toEqual([
    { name: 'Midas cichlid', why: 'species', of: 'amphilophus-citrinellus' }, { name: 'Red devil cichlid', why: 'species', of: 'amphilophus-labiatus' },
    { name: 'Cá Midas / cá red devil', why: 'species', of: 'amphilophus-citrinellus' },
  ])
})

test("the koi is its species' namesake: the names they share are what it is called first, and it keeps them", () => {
  const vi: Kin[] = [{ id: 'cyprinus-rubrofuscus', sci: 'Cyprinus rubrofuscus', names: ['Cá koi', 'Cá chép Nhật', 'Nishikigoi', 'Koi Nhật', 'Japanese koi', 'Koi carp'] }]
  const names = ['Koi Nhật', 'Koi Nhật Bản', 'cá chép Nhật', 'Koi mini', 'Japanese koi']
  expect(cleanBreedAltNames({ id: 'koi', name: 'Cá Koi (Nishikigoi)', altNames: names }, vi)).toEqual({ altNames: names, off: [] })
  const th: Kin[] = [{ id: 'cyprinus-rubrofuscus', sci: 'Cyprinus rubrofuscus', names: ['ปลาคาร์ป', 'ปลาแฟนซีคาร์ป', 'ปลาคาร์ปญี่ปุ่น', 'Nishikigoi'] }]
  expect(cleanBreedAltNames({ id: 'koi', name: 'ปลาคาร์ป (Koi)', altNames: ['ปลาคาร์ปญี่ปุ่น', 'ปลาแฟนซีคาร์ป', 'Nishikigoi'] }, th).off).toEqual([])
})

test('a breed with no species page linked: still each name once; another breed page\'s name leaves it, that page being found by it', () => {
  const bubble = ['Cá thủy bao nhãn', 'Thủy bao nhãn', 'Cá vàng thủy bao nhãn', 'Cá mắt ngọc', 'Water bubble eye goldfish', 'Suihogan', 'cá thủy bao nhãn', 'thủy bao nhãn', 'cá vàng thủy bao nhãn', 'cá mắt ngọc']
  expect(cleanBreedAltNames({ id: 'bubble-eye-goldfish', name: 'Cá vàng mắt bong bóng (Bubble eye goldfish)', altNames: bubble }, []).altNames)
    .toEqual(['Cá thủy bao nhãn', 'Cá vàng thủy bao nhãn', 'Cá mắt ngọc', 'Water bubble eye goldfish', 'Suihogan'])
  const goldfish: BreedName[] = [{ id: 'lionhead-goldfish', name: 'Cá vàng đầu sư tử (Lionhead)' }, { id: 'ranchu-goldfish', name: 'Cá vàng Lan thọ (Ranchu)' }]
  const r = cleanBreedAltNames({ id: 'lionhead-goldfish', name: 'Cá vàng đầu sư tử (Lionhead)', altNames: ['Cá vàng Lan Thọ', 'Lionhead goldfish', 'lionhead goldfish', 'Cá vàng thủ sư'] }, [], goldfish)
  expect(r.altNames).toEqual(['Lionhead goldfish', 'Cá vàng thủ sư'])
  expect(r.off).toEqual([{ name: 'Cá vàng Lan Thọ', why: 'breed', of: 'ranchu-goldfish' }, { name: 'lionhead goldfish', why: 'duplicate', of: 'Lionhead goldfish' }])
})

test('cleaning a breed\'s cleaned names changes nothing', () => {
  const pages: [{ id: string; name: string; altNames: string[] }, Kin[]][] = [
    [halfmoon(HALFMOON), BETTA_KIN], [plakat(PLAKAT), BETTA_KIN], [{ id: 'koi', name: 'Cá Koi (Nishikigoi)', altNames: ['Koi Nhật', 'Koi bướm', 'Butterfly koi', 'koi nhật'] }, []],
  ]
  for (const [page, kin] of pages) {
    const breeds = [...BETTA_BREEDS, { id: 'butterfly-koi', name: 'Koi bướm (Butterfly koi)' }]
    const once = cleanBreedAltNames(page, kin, breeds)
    expect(once.off.length).toBeGreaterThan(0)
    expect(cleanBreedAltNames({ ...page, altNames: once.altNames }, kin, breeds)).toEqual({ altNames: once.altNames, off: [] })
  }
})

test("a breed's species: what it is a form of, through a breed it is a line of, and a hybrid's parents', named as the species sweep leaves them", async () => {
  const c = await mkdtemp(join(tmpdir(), 'kin-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), JSON.stringify(data)) }
  await put('species/betta-splendens/entity.json', { scientificName: 'Betta splendens' })
  await put('species/betta-splendens/vi.json', { name: 'Cá betta (cá xiêm)', altNames: ['Cá xiêm', 'Cá betta Halfmoon', 'Siamese fighting fish', 'Siamese Fighting Fish'] })
  await put('species/betta-imbellis/entity.json', { scientificName: 'Betta imbellis' })
  await put('breeds/halfmoon-betta/entity.json', { basedOn: 'betta-splendens', parents: [] })
  // "Cá betta Halfmoon" is the halfmoon page's name: never the species'.
  const betta = { id: 'betta-splendens', sci: 'Betta splendens', names: ['Cá betta (cá xiêm)', 'Cá xiêm', 'Siamese fighting fish'] }
  expect(await breedKin(c, { basedOn: 'halfmoon-betta', parents: [] }, 'vi', BETTA_BREEDS)).toEqual([betta])
  expect(await breedKin(c, { parents: [{ species: 'betta-splendens' }, { species: 'betta-imbellis' }, {}] }, 'vi', BETTA_BREEDS)).toEqual([betta, { id: 'betta-imbellis', sci: 'Betta imbellis', names: [] }])
  expect(await breedKin(c, { basedOn: 'no-such-page', parents: [] }, 'vi', [])).toEqual([])
})

test('the sweep keeps each species and breed page to its own names in every language, says what it took off and why, and does nothing the second time', async () => {
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
  // The breeds list the betta's names among their own ("Cá xiêm", "Cá lia thia"): they stay the betta's, and leave the breeds.
  const breed = async (id: string, vi: string, viAlt: string[], id_: string, basedOn: string | null = 'betta-splendens') => {
    await put(`breeds/${id}/entity.json`, { id, kind: 'variety', ...(basedOn ? { basedOn } : {}), parents: [], care: {}, photos: [], sources: [{ url: 'https://x/a', title: 'A', kind: 'article', at: '2026-10-01' }], updatedAt: '2026-10-01' })
    await put(`breeds/${id}/vi.json`, { slug: id, name: vi, altNames: viAlt, sections: {}, body: '<p>Một dòng cá betta.</p>', quality: { score: 0.9, indexable: true } })
    await put(`breeds/${id}/id.json`, { slug: id, name: id_, altNames: [], sections: {}, body: '<p>Satu jenis cupang.</p>', quality: { score: 0.9, indexable: true } })
  }
  await breed('plakat-betta', 'Cá Betta Plakat (Plakat betta)', PLAKAT, 'Cupang plakat (Plakat betta)')
  await breed('halfmoon-betta', 'Cá betta Halfmoon (Halfmoon betta)', HALFMOON, 'Cupang halfmoon')
  // Written before the betta had a page: linked by its research this sweep, and its names cleaned this sweep too.
  await breed('crowntail-betta', 'Betta đuôi tưa (Crowntail betta)', ['Cá xiêm', 'CT betta'], 'Cupang serit', null)
  await mkdir(join(root, 'engine-state/breeds'), { recursive: true })
  await writeFile(join(root, 'engine-state/breeds/crowntail-betta.json'), JSON.stringify({
    found: true, kind: 'variety', enNames: [], viNames: [], basedOn: 'Betta splendens', parents: [], origin: [], looks: [], lines: [], care: [], keeping: [], breeding: [], health: [], buying: [], controversy: [],
    sources: [{ url: 'https://x/a', title: 'A', kind: 'article' }],
  }))
  // A guide the engine wrote lists the breeds it named, by their names then: "cá xiêm" named the halfmoon. One naming the
  // halfmoon by its own keeps it.
  const guide = async (id: string, mentions: string[], body: string) => {
    await put(`guides/${id}/entity.json`, { id, kind: 'care', source: 'aquatome', sourceUrl: `https://aquatome.com/${id}`, html: '', photos: [], mentions, updatedAt: '2026-10-01' })
    await put(`guides/${id}/vi.json`, { slug: id, name: id, altNames: [], sections: {}, body, quality: { score: 0.9, indexable: true } })
  }
  await guide('ca-danh-nhau', ['betta-splendens', 'halfmoon-betta', 'plakat-betta'], '<p>Cá xiêm trống hay đánh nhau, kể cả với cá lia thia khác.</p>')
  await guide('duoi-betta', ['betta-splendens', 'halfmoon-betta'], '<p>Đuôi của half moon betta xòe 180 độ.</p>')

  const r = await sweep(root)
  const read = async (path: string) => readFile(join(c, path), 'utf8')
  expect(JSON.parse(await read('species/betta-splendens/vi.json'))).toMatchObject({ name: 'Cá betta (cá xiêm)', altNames: BETTA_OWN, nameFixed: true })
  expect((await read('species/betta-splendens/vi.json')).startsWith('{\n "slug"')).toBe(true) // its own indentation
  expect(JSON.parse(await read('species/betta-splendens/id.json')).altNames).toEqual(['Betta', 'Ikan laga'])
  expect(JSON.parse(await read('breeds/halfmoon-betta/vi.json')).altNames).toEqual(['Betta HM', 'Cá Betta Rồng Half Moon', 'Half moon betta', 'HM betta', 'Halfmoon Siamese fighting fish'])
  expect(JSON.parse(await read('breeds/plakat-betta/vi.json')).altNames).toEqual(['Plakat Thai', 'Short-finned betta', 'HMPK', 'Cá đá', 'cá đá (plakat chọn làm cá đá)'])
  expect(JSON.parse(await read('breeds/crowntail-betta/vi.json')).altNames).toEqual(['CT betta'])
  expect(JSON.parse(await read('guides/ca-danh-nhau/entity.json')).mentions).toEqual(['betta-splendens'])
  expect(JSON.parse(await read('guides/duoi-betta/entity.json')).mentions).toEqual(['betta-splendens', 'halfmoon-betta'])
  expect(r.files.filter(f => !f.startsWith('guides/') || f.endsWith('entity.json')).sort()).toEqual([
    'breeds/crowntail-betta/entity.json', 'breeds/crowntail-betta/vi.json', 'breeds/halfmoon-betta/vi.json', 'breeds/plakat-betta/vi.json',
    'guides/ca-danh-nhau/entity.json', 'species/betta-splendens/id.json', 'species/betta-splendens/vi.json',
  ])
  expect(r.names).toContain('vi/betta-splendens: "Cá betta Green Alien" (a variety\'s name)')
  expect(r.names).toContain('vi/betta-splendens: "Siamese Fighting Fish" (written twice: "Siamese fighting fish")')
  expect(r.names).toContain('vi/betta-splendens: "Cá betta Halfmoon" (a breed\'s name: breeds/halfmoon-betta)')
  expect(r.names).toContain('id/betta-splendens: "Cupang" (its name)')
  expect(r.names).toContain('id/betta-splendens: "Plakat betta" (a breed\'s name: breeds/plakat-betta)')
  expect(r.names).toContain('vi/breeds/halfmoon-betta: "Cá xiêm / cá chọi (tên chung của loài)" (a species\' name: species/betta-splendens)')
  expect(r.names).toContain('vi/breeds/crowntail-betta: "Cá xiêm" (a species\' name: species/betta-splendens)')
  expect(r.names).toHaveLength(BETTA.length - BETTA_OWN.length + 3 + 3 + 4 + 1)
  expect(r.mentions).toEqual(['guides/ca-danh-nhau: halfmoon-betta', 'guides/ca-danh-nhau: plakat-betta'])
  const log = JSON.parse(await readFile(join(root, 'engine-state/_names-off.json'), 'utf8'))
  expect(Object.keys(log)).toEqual(['id/betta-splendens', 'vi/betta-splendens', 'vi/breeds/crowntail-betta', 'vi/breeds/halfmoon-betta', 'vi/breeds/plakat-betta'])
  expect(log['vi/betta-splendens']['Red Spade Tail Betta']).toMatch(/^a variety's name, \d{4}-\d\d-\d\d$/)
  expect(log['vi/breeds/halfmoon-betta']['Cá chọi']).toMatch(/^a species' name: species\/betta-splendens, \d{4}-\d\d-\d\d$/)

  const again = await sweep(root)
  expect(again.files).toEqual([])
  expect(again.names).toEqual([])
  expect(again.mentions).toEqual([])
})
