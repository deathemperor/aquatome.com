import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  blocks, cardSlips, checkPages, gluedSyllables, claimsControl, countMismatch, cutFurniture, dropEmptyHeadings, dropPermissionNotes, dropRepeats, emptySections, englishSentences, fixStored, fixTranslation, furniture,
  imperialUnits, isPermissionNote, labelSlips, leftoverMarkup, longFurniture, namesSource, numberSlips, otherFish, plainEntities, ratcheted, renumberLabels, RULES, rulesReport, sfScoreFixed, sourcePagePhrases, stripCount,
  renameStored, renameSwapped, swappedNames, titleCount, unwellOff, vietnameseLeft, wrongFish, captionFlaw, type Ctx,
} from '../src/content-rules'
import { pagePath, pageUrl, type Page } from '../src/pages'
import { phraseSlips } from '../src/phrases'

const page = (o: Partial<Page>): Page => ({ lang: 'vi', kind: 'guides', id: 'g', title: 'T', path: '/vi/huong-dan/g/', fields: [], lines: [], captions: [], latinNames: [], card: [], ...o })
const found = (p: Page, rule: string) => checkPages([p], RULES.filter(r => r.id === rule)).findings.map(f => f.detail)

test('page links in each language: species and breeds under the fish section', () => {
  expect(pagePath('vi', 'species', 'ca-dia')).toBe('/vi/ca/ca-dia/') // the form links are written in; the reader's hash carries it
  expect(pageUrl({ path: '/vi/ca/ca-dia/' })).toBe('https://aquatome.com/ca/ca-dia/') // Vietnamese pages are at the root
  expect(pageUrl({ path: '/id/ikan/guppy-koi/' })).toBe('https://aquatome.com/id/ikan/guppy-koi/')
  expect(pagePath('id', 'breeds', 'guppy-koi')).toBe('/id/ikan/guppy-koi/')
  expect(pagePath('th', 'guides', 'x')).toBe('/th/guides/x/')
  expect(pagePath('id', 'plants', 'x')).toBe('/id/tanaman/x/')
})

test('a heading without a number inside a numbered run is found (the betta foods guide), and a number skipped or repeated', () => {
  const html = '<h3>#3 Cám viên</h3><p>b</p><h3>Xtreme Betta Pellets</h3><p>c</p><h3>#4 Sấy khô</h3><p>d</p>'
  expect(found(page({ fields: [{ field: 'body', html }] }), 'numbering')).toEqual(['"Xtreme Betta Pellets" sits inside a numbered run'])
  expect(numberSlips(['1. A', '2. B', '4. C', '4. D', 'Kết luận'])).toEqual(['2 → 4', '4 twice'])
  // Two runs (8 causes, then 7 signs) and a countdown are fine.
  expect(numberSlips(['1. a', '2. b', '1. x', '2. y'])).toEqual([])
  expect(numberSlips(['5. a', '4. b', '3. c'])).toEqual([])
})

test('a title promising a count: a numbered run, a list or enough headings hold it', () => {
  expect(titleCount('10 loại cây thủy sinh kỳ lạ')).toBe(10)
  expect(titleCount('7 loài cá phổ biến nên thử nuôi trong bể 20 gallon (75 lít)')).toBe(7)
  expect(titleCount('Top 5 loài cá tầng đáy')).toBe(5)
  expect(titleCount('Tanaman 10 ชนิด')).toBe(10)
  expect(titleCount('Bể 60 cm cho người mới')).toBeUndefined()
  // The crayfish guide: 8 causes, then the 7 signs its title promises.
  const crayfish = ['<h3>Căng thẳng là gì?</h3>', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<h3>${n}. Nguyên nhân</h3><p>x</p>`), '<h3>Triệu chứng</h3>', ...[1, 2, 3, 4, 5, 6, 7].map(n => `<h3>${n}. Dấu hiệu</h3><p>x</p>`)].join('')
  expect(countMismatch('7 dấu hiệu tôm càng bị căng thẳng', crayfish)).toBeUndefined()
  // Seven unnumbered headings for seven fish.
  expect(countMismatch('7 loài cá cho bể 20 gallon', Array.from({ length: 7 }, (_, i) => `<h3>Cá ${i}</h3><p>x</p>`).join(''))).toBeUndefined()
  expect(countMismatch('5 bước', '<h3>A</h3><ol><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li></ol>')).toBeUndefined()
  // A video's "10 mistakes" written as 7 sections.
  expect(countMismatch('10 sai lầm hay gặp khiến bể bị rêu', `${'<h3>X</h3><p>y</p>'.repeat(7)}<ul><li>a</li><li>b</li></ul>`)).toBe('title promises 10; 7 headings, none numbered, lists of 2')
})

/** Furniture the rule finds, whether or not the sweep may cut it (more than half a text). */
const detected = (html: string) => [...furniture(html), ...longFurniture(html)]

test('a heading with nothing under it, at the end of its text or over one not its own; a heading over its sub-section is a group; the source site\'s comments', () => {
  expect(emptySections('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p><h3>Kết luận</h3><p>b</p><h3>Để lại bình luận</h3>')).toEqual(['Để lại bình luận'])
  // The first sweep dropped 7 such parents ("Lựa chọn loài" over a heading a species, "Sản phẩm" over two products).
  expect(emptySections('<h3>Các loài</h3><h3>Tép ong</h3><p>a</p>')).toEqual([])
  expect(emptySections('<h3>Sản phẩm</h3><h3>Fish Vet Methylene Blue</h3><p>a</p><h3>Kordon</h3><p>b</p>')).toEqual([])
  // Over one that isn't its sub-section: its peer (a diary date whose text the source lost, an item of a numbered run),
  // or a group, as the site's built-page check reads them (a heading of its own level or higher next).
  expect(emptySections('<h3>Ngày 12 tháng 11 năm 2006</h3><p>a</p><h3>Ngày 16 tháng 11 năm 2006</h3><h3>Ngày 26 tháng 11 năm 2006</h3><p>b</p>')).toEqual(['Ngày 16 tháng 11 năm 2006'])
  expect(emptySections('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p><h3>2. Rẻ</h3><h3>3. Bền</h3><p>c</p>')).toEqual(['2. Rẻ'])
  expect(emptySections('<h3>Phần một</h3><h3>Các loài</h3><h3>Tép ong</h3><p>a</p>')).toEqual(['Phần một'])
  expect(detected('<h3>Kết luận</h3><p>a</p><h3>4 bình luận về “Đá dung nham”</h3><ul><li>Marcia: …</li></ul><h3>Để lại bình luận</h3><h3>Bài viết liên quan:</h3><h3>Bình luận của độc giả (5 bình luận)</h3>'))
    .toEqual(['4 bình luận về “Đá dung nham”', 'Để lại bình luận', 'Bài viết liên quan:', 'Bình luận của độc giả (5 bình luận)'])
  expect(detected('<h3>Bình luận về chất lượng nước</h3>')).toEqual([])
  // A heading or a line of the text's own that starts like one (the first sweep cut "Bình luận của Ken Childs", 27% of
  // a text of letters).
  for (const own of ['<h3>Một suy nghĩ cuối cùng</h3>', '<h3>5 suy nghĩ sai lầm về cá betta</h3>', '<h3>Một ý kiến khác</h3>', '<h3>One thought on lighting</h3>',
    '<h3>Bình luận của Ken Childs</h3>', '<h3>Gửi phản hồi cho nhà sản xuất</h3>', '<h3>Bài viết liên quan đến cá betta</h3>', '<p>Một ý kiến về lượng nước thay: nhiều người thay 50%.</p>']) expect(detected(own)).toEqual([])
  // Thai writes no space before เกี่ยวกับ; a count alone; a form label with more of the plugin's words; the related
  // lists Aquarium Breeder and Loaches Online write ("Bài liên quan:", "Nội dung liên quan").
  for (const f of ['<h3>3 ความคิดเห็นเกี่ยวกับ “ปลากัด”</h3>', '<h3>2 phản hồi</h3>', '<h3>7 Responses</h3>', '<h3>7 tanggapan</h3>', '<h3>Để lại bình luận của bạn</h3>',
    '<h3>Leave a Reply to Ken Cancel reply</h3>', '<p>Bài liên quan:</p>', '<h3>Nội dung liên quan</h3>', '<p>Nội dung liên quan: Cá hề chuột (Chromobotia macracanthus)</p>']) expect(detected(f)).toHaveLength(1)
})

test('markdown left in the text, not a footnote\'s asterisks; entities in plain text', () => {
  expect(leftoverMarkup('vào nhau (anastomose**) khi cá phát triển.\n(**Nghĩa là nối lại)')).toEqual([])
  expect(leftoverMarkup('Nên **thay nước** mỗi tuần.\n## Kết luận\nXem [bài này](https://x.com/a).')).toEqual(['**thay nước**', '## Kết luận', '[bài này](https://x.com/a)'])
  expect(leftoverMarkup('pH 6,5 – 7,5; GH 4–8')).toEqual([])
  expect(plainEntities('Cacing Jangkar &amp; Kutu Ikan')).toEqual(['&amp;'])
  expect(found(page({ lang: 'id', title: 'Cacing Jangkar &amp; Kutu Ikan' }), 'markup')).toEqual(['"&amp;" in plain text'])
})

test('English sentences on a page, outside reference lists, citations and quotes', () => {
  const html = '<p>Cá cần bể lớn. The fish should be kept in a large tank with plenty of cover.</p><p>“It is the best fish in the world,” ông nói.</p>'
    + '<h3>Tài liệu tham khảo</h3><p>Multiple Fitness Peaks on the Adaptive Landscape Drive Adaptive Radiation in the Wild.</p>'
    + '<p>Bulletin of the National Museum of Singapore 32: 135-142.</p>'
  expect(englishSentences(html, 'vi')).toEqual(['The fish should be kept in a large tank with plenty of cover.'])
  expect(englishSentences('<ul><li>Smith, J. (2001). The loaches of the world and their care.</li><li>Ng, H. (2010). On the fishes of the region.</li></ul>', 'vi')).toEqual([])
  expect(englishSentences('<p>Ikan ini cocok untuk akuarium komunitas dengan tanaman yang rapat.</p>', 'id')).toEqual([])
  expect(englishSentences('<p>The fish is best kept in groups of six or more in the tank.</p>', 'id')).toHaveLength(1)
  expect(blocks('<h3>References</h3><p>a</p><h3>Next</h3><p>b</p>').map(b => b.refs)).toEqual([true, true, false, false])
})

test('Vietnamese on an Indonesian or Thai page, outside the names the site marks', () => {
  expect(vietnameseLeft('<p>Asalnya dari sungai <span lang="vi">Đồng Nai</span> di Vietnam.</p>')).toBeUndefined()
  expect(vietnameseLeft('<p>Cara merawat: thay nước mỗi tuần.</p>')).toContain('thay nước')
})

test('imperial units: alone, or beside a metric figure', () => {
  expect(imperialUnits('Nhiệt độ: 16–24°C (61–75°F)').alone).toEqual([])
  expect(imperialUnits('Nhiệt độ: 16–24°C (61–75°F)').beside).toEqual(['°F'])
  expect(imperialUnits('tahan suhu di kisaran 60-an °F bawah').alone).toHaveLength(1)
  expect(imperialUnits('bể 20 gallon cho bộ ba').alone).toHaveLength(1)
  expect(imperialUnits('hồ Chad, sông Niger, sông Sénégal')).toEqual({ alone: [], beside: [] })
  expect(imperialUnits('bể 60 cm (24 inch)').beside).toEqual(['inch'])
})

test('a caption naming another fish, and not the page\'s own under another spelling or name', () => {
  const ctx: Ctx = { genera: new Set(['Ageneiosus', 'Aphanius', 'Symphysodon', 'Riccardia', 'Echinodorus', 'Osteochilus', 'Synbranchus', 'Corydoras']), species: new Set(['ageneiosus inermis']) }
  expect(otherFish('Manduba (Ageneiosus inermis) in Brazil', 'Ageneiosus marmoratus', [], ctx)).toBe('Ageneiosus inermis')
  // A plate naming the page's species among others; a synonym; the other ending of an epithet; a cultivar; "syn. O. vittatus".
  expect(otherFish('1. Aphanius fasciatus, 2. Aphanius dispar', 'Aphanius dispar', [], ctx)).toBeUndefined()
  expect(otherFish('Synbranchus vittatus = Synbranchus marmoratus', 'Synbranchus marmoratus', [], ctx)).toBeUndefined()
  expect(otherFish('Symphysodon aequifasciata', 'Symphysodon aequifasciatus', [], ctx)).toBeUndefined()
  expect(otherFish('Echinodorus vesuvius by A. Photographer', 'Echinodorus angustifolia', ["Echinodorus 'Vesuvius'"], ctx)).toBeUndefined()
  expect(otherFish('Hard-lipped Barb (Osteochilus hasseltii, syn. O. vittatus)', 'Osteochilus vittatus', [], ctx)).toBeUndefined()
  // English and Vietnamese words after a genus.
  expect(otherFish('Pygmy Corydoras resting on coarse sand', 'Corydoras pygmaeus', [], ctx)).toBeUndefined()
  expect(otherFish('Các nhánh Rêu tản Riccardia chia thùy rõ nét', 'Riccardia multifida', [], ctx)).toBeUndefined()
})

test('a map shown as a photo of the fish, in a caption', () => {
  const p = page({ kind: 'species', sci: 'Pterophyllum scalare', captions: [{ url: 'a', caption: 'Pterophyllum scalare map' }, { url: 'b', caption: 'Bản đồ phân bố' }, { url: 'c', caption: 'A pair mapping out a territory' }] })
  expect(found(p, 'caption')).toEqual(['a map, not the fish: "Pterophyllum scalare map"', 'a map, not the fish: "Bản đồ phân bố"'])
})

// The owner's report, 2026-11-11: the only photo of Hemichromis elongatus was a parasite paper's plate from Wikimedia
// Commons. A Commons photo's own words (its file's name, and the start of its description as its caption) say so.
test("a paper's plate, a drawing or a dish from Wikimedia Commons shown as a photo of the fish, by the file's own words", () => {
  const p = page({ kind: 'species', sci: 'Hemichromis elongatus', captions: [
    { url: 'a', file: 'File:Parasite180080-Figure4 Compound micrographs of Cychlidogyrus spp. (Monogenea, Dactylogyridae).png', caption: 'Figure 4 of paper Compound micrographs of (a–c) Cichlidogyrus bixlerzavalai n. sp.' },
    { url: 'b', file: 'File:Aquatic Biodiversity in the Amazon (1020205-f7).png', caption: 'Examples of species collected only in the Alto Purús.(A) Cichlasoma boliviense, 79 mm.(B) Dianema longibarbis, 73 mm.(C) Pimelodus sp. 2, 112 mm.' },
    { url: 'c', file: 'File:EB9 - Angling - Fig 27.png', caption: 'Fig. 27.—The Tench.' },
    // One plain photo named as a figure stays, and so does a photo from anywhere else, whatever its caption says.
    { url: 'd', file: 'File:Clarias leiacanthus (10.3897-BDJ.11.e100337) Figure 20.jpg', caption: 'Figure 20 Clarias leiacanthus.' },
    { url: 'e', caption: 'Figure 2; (a) male (b) female' },
    // One photo of a pair, and a photo once filed under another name: only a look tells, so neither is taken off for good.
    { url: 'f', file: 'File:Hemichromis elongatus pair.jpg', caption: 'Male (A) and female (B) Hemichromis elongatus, same tank.' },
    { url: 'g', file: 'File:Hemichromis elongatus.jpg', caption: 'Hemichromis elongatus, first misidentified as another jewel cichlid.' },
  ] })
  expect(found(p, 'caption')).toEqual([
    'not a photo: micrographs, not the fish: "Figure 4 of paper Compound micrographs of (a–c) Cichlidogyrus bixlerzavalai n.…"',
    'not a photo: a paper\'s plate, (a), (b), (c), not the fish: "Examples of species collected only in the Alto Purús.(A) Cichlasoma boliviense,…"',
    'drawing: EB9, not the fish: "Fig. 27.—The Tench."',
  ])
})

// Live on two Seriously Fish species pages (2026-11-03): an ad player's poster taken from inside the source's article.
// The owner's report, 2026-11-11: a sick betta on its page, then three fish their source called unwell. These are the 21
// captions a first, wider word list hit over 14,615: 14 the source's own words, 7 hit wrongly.
test("a caption in which the source calls the fish unwell, or names a split fin in passing; not a shipwreck, dead corals, breeding tubercules or a caption of ours", () => {
  const kind = (c: string) => captionFlaw(c)?.kind
  for (const c of [
    'Recently-deceased specimen.', 'Two dead specimens of different ages, younger below.', 'Newly-imported, hence a little skinny, male of Barboides gracilis.', 'Skinny juvenile of Callochromis macrops',
    '...and can be violent affairs as this wounded specimen exemplifies.', 'Individual missing an eye due to conspecific aggression in the confines of an aquarium.',
    // Damage with a fight behind it is no blemish.
    'Male specimen with fin damage caused by another male.', 'Male with fins torn in a fight.',
    'Specimen with a fungal infection on the tail.', 'Adult with fungus on its fins.', 'Adult with fin rot.',
    // A place after the damage is where the fish is. And the worse of two sentences counts.
    'Male with badly torn fins in a river.', 'Split fin; badly damaged tail.', 'Fin damage due to conspecific aggression.', 'A serious injury to the tail.',
    // Kept on purpose: a dead fish is in the picture, which no page shows.
    'Healthy adult feeding on dead fish.',
  ]) expect(kind(c), c).toBe('unwell')
  for (const c of [
    // "Damaged" with no "slightly", and "minor injuries" of a split fin: still said in passing of an ordinary fish.
    'Individuals on sale in the Korean aquarium trade. The fish in the centre of the image has a damaged upper caudal-fin lobe.',
    'Note the split caudal-fin of the fish to the left; minor injuries such as this are not uncommon.',
    'Another specimen of R. dorsinotata with a slightly damaged caudal fin.', 'Subadult with slightly damaged caudal-fin.', 'Specimen from the Singapore aquarium trade with slight damage to lower caudal-fin lobe.',
    'Adult specimen with slight caudal-fin damage.', 'Adult male individual with slightly-damaged caudal-fin.',
    // Torn with no fight named. And damage is weighed in its own sentence: what the fish bites is another matter.
    'Fins torn in transit.', 'Slightly damaged fin; this species bites at plants.',
    // Only another fish makes damage a fight's. And the fight in a sentence of its own is missed, on the keeping side.
    'Slight fin damage caused by transport.', 'Fins torn; caused by fighting.',
    // A fight or a degree counts where it is said of the damage, not in the fish's name or of the tank.
    'Siamese fighting fish with a slightly damaged caudal fin.', 'Fighter with a torn fin.', 'A torn fin in a Siamese fighting fish.', 'Male in a heavily planted tank with a torn fin.', 'An aggressive male with a split fin.',
  ]) expect(kind(c), c).toBe('blemish')
  for (const c of [
    'Vài con cá piranha bụng đỏ bơi trong bể có xác tàu', 'Cá hổ báo biến dạng màu cam đen nhìn từ dưới trong bể',
    // A caption of ours with the English words in it is still ours, not the source's.
    'Cá piranha bụng đỏ rỉa một con cá chết (dead fish) trong bể', '...though physical damage is rare.', 'School of Monodactylus argenteus swimms above dead corals at Madagascar',
    "I named him Rambo. He came with the aquarium I bought when 10 years old or so. When I was about 17 he died, shortly after which I sold my aquarium.",
    'The tubercules on the snout and raised rows of soft, raised, tuberculated tissue on the anterior pectoral rays are clearly visible here.', 'Detail of tubercules on snout; specimen from northern Peninsular Malaysia.',
    'Adult male.', undefined,
    // Injuries said to be rare are none, a place's damage is not the fish's, and a fungus it eats is no infection.
    'Males often fight but injuries are rare.', 'Habitat heavily damaged by logging.', 'It grazes on algae and fungus.',
    // What a sentence denies, a fungus that is not on the fish, and an illness said of the species, not of this fish.
    'No signs of fungal infection.', 'This fish is not sick.', 'No damage to the fins.', 'Fungus on the submerged log provides food.', 'This species is prone to infection in hard water.',
  ]) expect(kind(c as string), c).toBeUndefined()
  // On a breed's page a deformity or a growth can be the breed's own shape, and is not asked; the rest is.
  for (const c of ['A balloon molly with its deformed spine.', 'The cap, a tumour-like growth over the head.']) {
    expect(kind(c), c).toBe('unwell')
    expect(captionFlaw(c, true), c).toBeUndefined()
  }
  expect(captionFlaw('Recently-deceased specimen.', true)?.kind).toBe('unwell')
})

test("a photo of an unwell fish fails its page where the page has another photo of its own, its gallery's too; a page's only photo, a plant's and a guide's do not", () => {
  const dead = { url: 'a', caption: 'Recently-deceased specimen.' }, well = { url: 'b', caption: 'Adult male.' }, album = { url: 'g', caption: 'Two dead specimens of different ages.' }, split = { url: 's', caption: 'Adult specimen with slight caudal-fin damage.' }
  expect(found(page({ kind: 'species', own: ['a', 'b', 's'], captions: [dead, well, split, album] }), 'unwell')).toEqual(['deceased: "Recently-deceased specimen."', 'dead specimens: "Two dead specimens of different ages."'])
  expect(found(page({ kind: 'breeds', own: ['a', 'b'], captions: [dead, well] }), 'unwell')).toEqual(['deceased: "Recently-deceased specimen."'])
  // A breed's gallery is read too, and its own shape is not called unwell.
  expect(found(page({ kind: 'breeds', own: ['b'], captions: [well], album: [album] }), 'unwell')).toEqual(['dead specimens: "Two dead specimens of different ages."'])
  expect(found(page({ kind: 'breeds', own: ['a', 'b'], captions: [{ url: 'a', caption: 'A balloon molly with its deformed spine.' }, well] }), 'unwell')).toEqual([])
  // The page's only photo stays: nothing to fix, so nothing found. With two and nothing else, the first stays.
  expect(found(page({ kind: 'species', own: ['a'], captions: [dead] }), 'unwell')).toEqual([])
  expect(unwellOff(page({ kind: 'species', own: ['a'], captions: [dead] }))).toEqual({ off: [], kept: { url: 'a', word: 'deceased' } })
  expect(unwellOff(page({ kind: 'species', own: ['a', 'g'], captions: [dead, album] }))).toEqual({ off: [{ url: 'g', word: 'dead specimens' }], kept: { url: 'a', word: 'deceased' } })
  // A photo that is the page's own and in its gallery too is one photo: kept as the only one, not also taken off.
  expect(unwellOff(page({ kind: 'breeds', own: ['a'], captions: [dead], album: [dead] }))).toEqual({ off: [], kept: { url: 'a', word: 'deceased' } })
  expect(unwellOff(page({ kind: 'species', own: ['a'], captions: [dead, dead] }))).toEqual({ off: [], kept: { url: 'a', word: 'deceased' } })
  expect(unwellOff(page({ kind: 'species', own: ['a', 'b'], captions: [dead, well, dead], picked: 'a' }))).toEqual({ off: [], picked: { url: 'a', word: 'deceased' } })
  // A head a person picked is not taken off by a caption's words, whatever else the page has; the rule finds nothing.
  expect(unwellOff(page({ kind: 'species', own: ['a', 'b'], captions: [dead, well], picked: 'a' }))).toEqual({ off: [], picked: { url: 'a', word: 'deceased' } })
  expect(unwellOff(page({ kind: 'species', own: ['a', 'g'], captions: [dead, album], picked: 'a' }))).toEqual({ off: [{ url: 'g', word: 'dead specimens' }], picked: { url: 'a', word: 'deceased' } })
  expect(found(page({ kind: 'species', own: ['a', 'b'], captions: [dead, well], picked: 'a' }), 'unwell')).toEqual([])
  // A picked head another rule takes off in the same run shields nothing: the page's other unwell photo is kept as its
  // only one, so the page is not left empty.
  expect(unwellOff(page({ kind: 'species', own: ['a', 'g'], captions: [dead, album], picked: 'a' }), new Set(['a']))).toEqual({ off: [{ url: 'a', word: 'deceased' }], kept: { url: 'g', word: 'dead specimens' } })
  // Another rule taking the page's other photo off in the same run leaves this one the only photo.
  expect(unwellOff(page({ kind: 'species', own: ['a', 'b'], captions: [dead, well] }), new Set(['b'])).kept?.url).toBe('a')
  expect(found(page({ kind: 'plants', own: ['a', 'b'], captions: [dead, well] }), 'unwell')).toEqual([])
  expect(found(page({ kind: 'guides', captions: [dead, well] }), 'unwell')).toEqual([])
})

test("an ad video's poster shown as a photo of the fish, in a caption", () => {
  const p = page({ kind: 'species', sci: 'Nannocharax brevis', captions: [{ url: 'a', caption: 'video of: African Chop' }, { url: 'b', caption: 'A video of the species spawning was filmed in 2019.' }] })
  expect(found(p, 'caption')).toEqual(['an ad video\'s poster, not the fish: "video of: African Chop"'])
})

test('data card: outside bounds, upside down, a tank shorter than twice the fish; checked once, on the Vietnamese page', () => {
  const card: Page['card'] = [
    { field: 'tankCm', source: 'a', value: 15 }, { field: 'sizeCm', source: 'a', value: 7.6 },
    { field: 'ph', source: 'b', value: { min: 7.5, max: 6 } }, { field: 'tempC', source: 'b', value: { min: 75, max: 82 } },
  ]
  expect(found(page({ kind: 'species', card }), 'card')).toEqual(['ph 7.5–6 (b): upside down', 'tempC 75–82 (b): outside 4–40', 'minimum tank 15 cm for a fish of 7.6 cm (less than twice its length)'])
  expect(found(page({ lang: 'id', kind: 'species', card }), 'card')).toEqual([])
})

test('a rule that throws on a page is listed and the others still run; the report lists each page once per rule', () => {
  const p = page({ title: 'Cá [đẹp]', fields: [{ field: 'body', html: '<p>The fish should be kept in a large tank with plenty of cover.</p>' }] })
  const boom = { id: 'boom', title: 'Boom', about: 'x', check: () => { throw new Error('bad') } }
  const r = checkPages([p], [boom, ...RULES.filter(x => x.id === 'english')])
  expect(r.errors).toEqual(['boom on /vi/huong-dan/g/: bad'])
  expect(r.findings).toHaveLength(1)
  const md = rulesReport([p], r, [boom, ...RULES.filter(x => x.id === 'english')])
  expect(md).toContain('Pages checked: 1 (Vietnamese 1, Indonesian 0, Thai 0, Malay 0)')
  expect(md).toContain('- boom on /vi/huong-dan/g/: bad')
  expect(md).toContain('## Sentences left in English (1)')
  expect(md).toContain('- [vi · Cá \\[đẹp\\]](https://aquatome.com/huong-dan/g/) — "The fish should be kept in a large tank with plenty of cover."')
})

test('the fixes made on write, on a stored translation: HTML tidied, plain text unescaped, nothing else touched', () => {
  const t = {
    slug: 's', name: 'Cacing Jangkar &amp; Kutu', altNames: ['A &amp;amp; B'], sections: { 'diet:x': '<p>Ăn &amp;amp; lớn</p><p></p>' },
    body: '<h3>#1 A</h3><p>a</p><h3>Brand</h3><p>b</p><h3>#2 B</h3><p>c</p>', summary: ['Giữ &lt; 26 °C'], faq: [{ q: 'Q &amp; A?', a: 'Có.' }], quality: { score: 1 },
  }
  const out = fixTranslation(t) as typeof t
  expect(out.name).toBe('Cacing Jangkar & Kutu')
  expect(out.altNames).toEqual(['A & B'])
  expect(out.sections['diet:x']).toBe('<p>Ăn &amp; lớn</p>')
  expect(out.body).toBe('<h3>#1 A</h3><p>a</p><p><strong>Brand</strong></p><p>b</p><h3>#2 B</h3><p>c</p>')
  expect(out.summary).toEqual(['Giữ < 26 °C'])
  expect(out.faq).toEqual([{ q: 'Q & A?', a: 'Có.' }])
  expect(Object.keys(out)).toEqual(Object.keys(t))
  expect(fixTranslation(out)).toEqual(out)
})

// The owner, 2026-11-11: "Cá thài lài doesn't exist in Vietnamese".
test('"thài lài" said of a fish is found on any Vietnamese page but a plant\'s, in its name, text, lines and captions; the sweep writes the fish it named by their names; the plant keeps it', () => {
  const p = page({ kind: 'species', title: 'Cá thài lài mật', fields: [{ field: 'sections.diet:sf', html: '<p>Loài nhỏ nhất trong họ thài lài.</p>' }], lines: [{ field: 'faq.0.a', text: 'Khi nuôi thài lài, chọn bạn hiền.' }], captions: [{ url: 'u', caption: 'Cá thài lài kêu trong bể' }] })
  expect(found(p, 'fish-words')).toEqual(['"Cá thài lài"', '"nhỏ nhất trong họ thài lài"', '"Khi nuôi thài lài"'])
  expect(found(p, 'wording')).toEqual(['"Cá thài lài mật" → "cá sặc mật ong"'])
  expect(fixTranslation({ name: 'Cá thài lài kêu', altNames: ['Cá thài lài kêu Mekong'], sections: { 'diet:sf': '<p>Cá thài lài quý tộc ăn mồi sống, như cá thài lài khác.</p>' } } as never))
    .toMatchObject({ name: 'Cá bã trầu', altNames: ['Cá gourami kêu Mekong'], sections: { 'diet:sf': '<p>Cá Ctenops nobilis ăn mồi sống, như cá sặc khác.</p>' } })
  const plant = 'Cây thuộc họ Thài lài, gần cỏ thài lài và thài lài tía.'
  expect(found(page({ kind: 'plants', title: 'Cỏ thài lài', fields: [{ field: 'body', html: '<p>Thài lài mọc ven suối.</p>' }] }), 'fish-words')).toEqual([])
  expect(found(page({ title: plant }), 'fish-words')).toEqual([])
  expect(found(page({ lang: 'id', title: 'Ikan thài lài' }), 'fish-words')).toEqual([])
})

test('the writers\' list counts "thài lài" said of a fish, and leaves the plant', () => {
  const thai = (s: string) => phraseSlips(s, 'vi').filter(x => x.startsWith('"thài lài"'))
  expect(thai('Cây thuộc họ Thài lài, gần cỏ thài lài và thài lài tía.')).toEqual([])
  expect(thai('Cá thài lài mật hợp bể nhỏ. Khi nuôi thài lài, chọn bạn hiền.')).toEqual([expect.stringMatching(/^"thài lài" ×2 → /)])
})

test("a pleco with an L number on record whose name gives none is listed, in any language; a fish with none, or another family's number, isn't (the owner, 2026-11-11)", () => {
  const fish = (title: string, o: Partial<Page> = {}) => page({ kind: 'species', title, family: 'Loricariidae', lNumber: 'L46', ...o })
  expect(found(fish('Cá zebra pleco'), 'l-number')).toEqual(['"Cá zebra pleco" → "Cá zebra pleco L46"'])
  expect(found(fish('Zebra Pleco', { lang: 'id' }), 'l-number')).toEqual(['"Zebra Pleco" → "Zebra Pleco L46"'])
  expect(found(fish('Cá zebra pleco L46'), 'l-number')).toEqual([])
  expect(found(fish('Cá lau kiếng vàng', { lNumber: undefined }), 'l-number')).toEqual([])
  expect(found(fish('Cá chuột panda', { family: 'Callichthyidae', lNumber: 'C20' }), 'l-number')).toEqual([])
})

test('"Phi châu" in a name, text, summary or FAQ is found, and fixTranslation writes it "châu Phi"; a product\'s review lines aren\'t the rule\'s', () => {
  const p = page({ kind: 'species', title: 'Cá Oscar (cá tai tượng Phi châu)', fields: [{ field: 'sections.distribution:sf', html: '<p>Phi châu. Cá rô phi châu Phi.</p>' }], lines: [{ field: 'faq.0.a', text: 'Ở phi châu.' }] })
  expect(found(p, 'wording')).toEqual(['"Phi châu" → "châu Phi"', '"phi châu" → "châu Phi"'])
  expect(found(page({ kind: 'products', lines: [{ field: 'reviews.agree.0', text: 'Phi châu' }] }), 'wording')).toEqual([])
  const t = { name: 'Cá Oscar (cá tai tượng Phi châu)', altNames: ['Cá dao Phi châu'], sections: { 'distribution:sf': '<p>Phi châu. Cá rô phi châu Phi.</p>' }, summary: ['Gốc phi châu.'], faq: [{ q: 'Phi châu?', a: 'Có.' }] }
  const out = fixTranslation(t) as typeof t
  expect(out).toEqual({
    name: 'Cá Oscar (cá tai tượng châu Phi)', altNames: ['Cá dao châu Phi'], sections: { 'distribution:sf': '<p>Châu Phi. Cá rô phi châu Phi.</p>' }, summary: ['Gốc châu Phi.'], faq: [{ q: 'Châu Phi?', a: 'Có.' }],
  })
  expect(fixTranslation(out)).toEqual(out)
  expect(found(page({ kind: 'species', title: out.name, fields: [{ field: 'sections.distribution:sf', html: out.sections['distribution:sf'] }] }), 'wording')).toEqual([])
})

test('the betta guide\'s "Cách setup bể cá betta đẹp" is found, and fixTranslation writes it "Cách set bể cá betta đẹp"', () => {
  const t = { name: 'Cách setup bể cá betta đẹp', body: '<h3>Cách setup bể betta</h3><p>Khi đã có đủ đồ.</p>' }
  expect(found(page({ title: t.name, fields: [{ field: 'body', html: t.body }] }), 'wording')).toEqual(['"setup bể" → "set bể"'])
  const out = fixTranslation(t) as typeof t
  expect(out).toEqual({ name: 'Cách set bể cá betta đẹp', body: '<h3>Cách set bể betta</h3><p>Khi đã có đủ đồ.</p>' })
  expect(found(page({ title: out.name, fields: [{ field: 'body', html: out.body }] }), 'wording')).toEqual([])
})

test('"và/hoặc" (English\'s "and/or", which neither hobbyists\' forum nor their videos write) is found, and fixTranslation writes "hoặc"', () => {
  const t = { name: 'Cây ven bờ', sections: { 'habitat:sf': '<p>Nước mềm và/hoặc nước có tính axit. Cây ven bờ và / hoặc cây thủy sinh.</p>' } }
  expect(found(page({ kind: 'species', title: t.name, fields: [{ field: 'sections.habitat:sf', html: t.sections['habitat:sf'] }] }), 'wording')).toEqual(['"và/hoặc" → "hoặc"', '"và / hoặc" → "hoặc"'])
  const out = fixTranslation(t) as typeof t
  expect(out.sections['habitat:sf']).toBe('<p>Nước mềm hoặc nước có tính axit. Cây ven bờ hoặc cây thủy sinh.</p>')
  expect(fixTranslation(out)).toEqual(out)
})

test('a title\'s count held by numbered labels or as many bold leads; else the number dropped from the title', () => {
  // "13 mẹo…": Mẹo 1 to Mẹo 13 as bold leads under 8 headings; "10 sai lầm…" numbered out of order; "7 nguyên nhân" as 7 bold leads.
  const tips = `<h3>A</h3>${Array.from({ length: 13 }, (_, i) => `<p><strong>Mẹo ${i + 1}: x.</strong> y</p>`).join('')}`
  expect(countMismatch('13 mẹo giữ bể mới', tips)).toBeUndefined()
  expect(countMismatch('10 sai lầm hay gặp', [1, 9, 2, 3, 4, 5, 6, 7, 8, 10].map(n => `<p><strong>Sai lầm ${n}:</strong> x</p>`).join(''))).toBeUndefined()
  expect(countMismatch('Rêu râu đen BBA: 7 nguyên nhân', `<h3>Ba nguyên nhân</h3>${'<p><strong>X.</strong> y</p>'.repeat(7)}`)).toBeUndefined()
  expect(countMismatch('Rêu râu đen BBA: 7 nguyên nhân', `<h3>Ba nguyên nhân</h3>${'<p><strong>X.</strong> y</p>'.repeat(5)}`)).toBe('title promises 7; 1 headings, none numbered')
  expect(stripCount('10 cách xử lý rêu hại nhanh cho bể thủy sinh')).toBe('Cách xử lý rêu hại nhanh cho bể thủy sinh')
  expect(stripCount('Rêu râu đen BBA: 7 nguyên nhân và cách phòng')).toBe('Rêu râu đen BBA: nguyên nhân và cách phòng')
  expect(stripCount('Top 5 loài cá tầng đáy')).toBe('Loài cá tầng đáy')
  expect(stripCount('7 Jenis Ikan Hias untuk Pemula')).toBe('Jenis Ikan Hias untuk Pemula')
  expect(stripCount('ไม้น้ำ 10 ชนิด สำหรับมือใหม่')).toBe('ไม้น้ำ สำหรับมือใหม่')
  expect(stripCount('Bể 60 cm cho người mới')).toBe('Bể 60 cm cho người mới')
})

test('numbered labels out of order are numbered again as they appear; counting up, down, or two runs are fine', () => {
  const html = '<h3>CO2</h3><p><strong>Sai lầm 1: không dùng drop checker.</strong> a</p><p><strong>Sai lầm 9: không hiệu chuẩn.</strong> b</p><h3>Set bể</h3><p><strong>Sai lầm 2: set giữa hè.</strong> c</p><p><strong>Sai lầm 10: bỏ thay nước.</strong> d</p>'
  expect(labelSlips(html)).toEqual(['"sai lầm" 1, 9, 2, 10'])
  expect(renumberLabels(html)).toBe('<h3>CO2</h3><p><strong>Sai lầm 1: không dùng drop checker.</strong> a</p><p><strong>Sai lầm 2: không hiệu chuẩn.</strong> b</p><h3>Set bể</h3><p><strong>Sai lầm 3: set giữa hè.</strong> c</p><p><strong>Sai lầm 4: bỏ thay nước.</strong> d</p>')
  // A range is no label: a care schedule keeps its intervals.
  const schedule = '<ul><li>Cách 1–2 ngày: cho ăn</li><li>Cách 7–10 ngày: thay nước</li><li>Cách 2–3 tuần: vệ sinh lọc</li></ul>'
  for (const ok of ['<p>Bước 1: a</p><p>Bước 2: b</p>', '<p>Mẹo 3. a</p><p>Mẹo 2. b</p><p>Mẹo 1. c</p>', '<p>Cách 1: a</p><p>Cách 2: b</p><p>Cách 1: c</p><p>Cách 2: d</p>', '<p>Có 3 cách: một, hai, ba.</p>', schedule]) {
    expect(labelSlips(ok)).toEqual([])
    expect(renumberLabels(ok)).toBe(ok)
  }
  expect(found(page({ fields: [{ field: 'body', html }] }), 'labels')).toEqual(['"sai lầm" 1, 9, 2, 10'])
  // What the check reads, the fix mends: a tag or a no-break space between word and number.
  const split = '<p><strong>Sai lầm</strong> 1: a</p><p><strong>Sai lầm</strong> 9: b</p><p>Sai lầm&nbsp;2: c</p>'
  expect(labelSlips(split)).toEqual(['"sai lầm" 1, 9, 2'])
  expect(labelSlips(renumberLabels(split))).toEqual([])
  expect(renumberLabels(split)).toBe('<p><strong>Sai lầm</strong> 1: a</p><p><strong>Sai lầm</strong> 2: b</p><p>Sai lầm&nbsp;3: c</p>')
})

test('a sentence that only says the text is translated, adapted or used with permission: dropped, in each language', () => {
  // Loaches Online's Botia guide (2026-11-05): the source's note under the article it reprints, translated.
  const credit = 'Bài gốc của Emma Turner được đăng lần đầu trên Tropical World Magazine, số 9. www.tropicalworldmagazine.com.'
  expect(dropPermissionNotes(`<p>Chúng chỉ đang ngủ thôi…</p><p>${credit} Được Loaches Online chuyển thể với sự cho phép.</p>`))
    .toBe(`<p>Chúng chỉ đang ngủ thôi…</p><p>${credit}</p>`)
  // A paragraph that is only the note goes; one in the middle leaves the sentences around it.
  expect(dropPermissionNotes('<p>Cá cần nước mềm.</p><p>Dịch với sự cho phép của Seriously Fish.</p>')).toBe('<p>Cá cần nước mềm.</p>')
  expect(dropPermissionNotes('<p>Nước mềm. Bài viết được dịch với sự cho phép của tác giả. Thay nước đều.</p>')).toBe('<p>Nước mềm. Thay nước đều.</p>')
  expect(dropPermissionNotes('<p>Air lunak.</p><p>Diterjemahkan dengan izin dari Seriously Fish.</p>')).toBe('<p>Air lunak.</p>')
  expect(dropPermissionNotes('<p>Diadaptasi oleh Loaches Online dengan izin.</p><p>Air lunak.</p>')).toBe('<p>Air lunak.</p>')
  expect(dropPermissionNotes('<p>น้ำอ่อน</p><p>แปลโดยได้รับอนุญาตจาก Seriously Fish</p>')).toBe('<p>น้ำอ่อน</p>')
  expect(dropPermissionNotes('<p>ดัดแปลงโดย Loaches Online โดยได้รับอนุญาต</p>')).toBe('')
  // A sentence that only has the words stays: what is done with permission is not the text's translation or use.
  for (const near of [
    'Chỉ bắt cá ngoài tự nhiên với sự cho phép của cơ quan quản lý.',
    'Hãy dùng thuốc với sự cho phép của bác sĩ thú y.',
    'Cá được thả vào hồ với sự cho phép của ban quản lý, vì thế đàn cá phát triển nhanh.',
    'Ikan liar hanya boleh ditangkap dengan izin dari dinas perikanan.',
    'จับปลาจากธรรมชาติได้เฉพาะโดยได้รับอนุญาตจากหน่วยงาน',
  ]) {
    expect(isPermissionNote(near), near).toBe(false)
    expect(dropPermissionNotes(`<p>${near}</p>`)).toBe(`<p>${near}</p>`)
  }
  // Nothing to drop: the text as it was, byte for byte.
  expect(dropPermissionNotes('<p>Nước <b>mềm</b>.</p>\n<p>Thay nước.</p>')).toBe('<p>Nước <b>mềm</b>.</p>\n<p>Thay nước.</p>')
})

test('the source site\'s comments, comment form and related posts: found as headings or lines of their own, and cut', () => {
  expect(detected('<h3>7 ý kiến về “Infusoria”</h3><ul><li>a</li></ul><h3>12 thoughts on “Lava rock”</h3><p>Bài viết liên quan:</p><ul><li>x</li></ul><p>Leave a Reply</p>'))
    .toEqual(['7 ý kiến về “Infusoria”', '12 thoughts on “Lava rock”', 'Bài viết liên quan:', 'Leave a Reply'])
  // In a sentence, a phrase is the text's own.
  expect(detected('<p>Bài viết liên quan đến chủ đề này cho thấy cá cần bể lớn.</p><p>Hãy để lại bình luận nếu bạn có câu hỏi về bể.</p>')).toEqual([])
  const long = 'Đá dung nham tự nhiên là vật liệu trơ, không làm đổi thông số nước trong bể của bạn.'
  // Related posts in the middle of the text: the line and its list, not what follows.
  expect(cutFurniture(`<h3>A</h3><p>${long}</p><p>Bài viết liên quan:</p><ul><li>15+ thức ăn sống</li></ul><p>${long}</p><h3>B</h3><p>${long}</p>`)).toBe(`<h3>A</h3><p>${long}</p><p>${long}</p><h3>B</h3><p>${long}</p>`)
  // As a heading too, related posts take their lists only (Aquarium Breeder: "Bài liên quan" over one link, mid-text).
  expect(cutFurniture(`<h3>A</h3><p>${long}</p><h3>Bài liên quan</h3><ul><li>Thủy tức trong bể tép</li></ul><p>${long}</p><h3>B</h3><p>${long}</p>`)).toBe(`<h3>A</h3><p>${long}</p><p>${long}</p><h3>B</h3><p>${long}</p>`)
  // Comments with their readers' names, up to the next heading; the comment form after them.
  expect(cutFurniture(`<h3>Kết luận</h3><p>${long}</p><p>${long}</p><h3>4 bình luận về “Đá dung nham”</h3><ul><li><p><strong>Marcia:</strong> Hỏi.</p></li></ul><h3>Để lại bình luận</h3>`)).toBe(`<h3>Kết luận</h3><p>${long}</p><p>${long}</p>`)
  // Never more than half a text: a page that is mostly comments is left as it is, and listed for a person, not as a
  // defect the sweep fixes (one such page would stop every cycle).
  const most = `<p>Ngắn.</p><h3>Bình luận của độc giả</h3><p>${long}</p><p>${long}</p>`
  expect(cutFurniture(most)).toBe(most)
  expect([furniture(most), longFurniture(most)]).toEqual([[], ['Bình luận của độc giả']])
  expect(found(page({ fields: [{ field: 'body', html: most }] }), 'furniture')).toEqual([])
  expect(found(page({ fields: [{ field: 'body', html: most }] }), 'furniture-long')).toEqual(['"Bình luận của độc giả"'])
})

test('empty headings dropped, all of them; a group heading kept', () => {
  expect(dropEmptyHeadings('<h3>Các loài</h3><h3>Tép ong</h3><p>a</p><h3>Sản phẩm</h3>')).toBe('<h3>Các loài</h3><h3>Tép ong</h3><p>a</p>')
  expect(dropEmptyHeadings('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p>')).toBe('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p>')
  expect(dropEmptyHeadings('<p>a</p><h3>Ưu điểm</h3><h3>1. Nhẹ</h3>')).toBe('<p>a</p>')
  expect(dropEmptyHeadings('<h3>A</h3><h3>B</h3><h3>C</h3><p>x</p><h3>D</h3>')).toBe('<h3>B</h3><h3>C</h3><p>x</p>')
  expect(dropEmptyHeadings('<p>a</p><h3>Ngày 16 tháng 11 năm 2006</h3><h3>Ngày 26 tháng 11 năm 2006</h3><p>b</p>')).toBe('<p>a</p><h3>Ngày 26 tháng 11 năm 2006</h3><p>b</p>')
})

test('a repeated paragraph: the later copy goes, in reading order across a page\'s texts; reference lists stay', () => {
  const p = 'Nơi thu mẫu chuẩn là sông Mangar, cách cảng Balikpapan khoảng 25 km, thuộc Đông Kalimantan.'
  expect(dropRepeats([
    { field: 'sections.distribution:sf', html: `<p>${p}</p>` }, { field: 'sections.habitat:sf', html: `<p>${p}</p><p>Suối rừng.</p>` },
    { field: 'sections.references:sf', html: `<p>${p}</p>` }, { field: 'body', html: `<ul><li><p>${p}</p></li></ul><p>Ngắn. Ngắn.</p><p>Ngắn. Ngắn.</p>` },
  ])).toEqual([
    { field: 'sections.distribution:sf', html: `<p>${p}</p>` }, { field: 'sections.habitat:sf', html: '<p>Suối rừng.</p>' },
    { field: 'sections.references:sf', html: `<p>${p}</p>` }, { field: 'body', html: '<p>Ngắn. Ngắn.</p><p>Ngắn. Ngắn.</p>' },
  ])
  // Within one text: a short line a list repeats under each item is the text's own (the nitrate guide's plants); a block
  // pasted twice is not (Ốc ao nhỏ's quick facts).
  const easy = 'Cây dễ chăm và nhân giống bằng cách cắt ngọn hoặc tách chồi bên.'
  const plants = `<h3>Rong đuôi chó</h3><p>pH 6–8.</p><p>${easy}</p><h3>Elodea</h3><p>pH 6,5–9.</p><p>${easy}</p>`
  expect(dropRepeats([{ field: 'body', html: plants }])[0]!.html).toBe(plants)
  expect(found(page({ fields: [{ field: 'body', html: plants }] }), 'repeated')).toEqual([])
  const facts = ['Ốc trưởng thành cũng chỉ dài được khoảng 2 cm và rộng 1,2 cm, rất nhỏ so với ốc khác.', 'Vỏ. Vỏ hình nón, xoắn phải, chóp thường nhọn, đôi khi có vân tăng trưởng.'].map(t => `<p>${t}</p>`).join('')
  expect(dropRepeats([{ field: 'sections.quickFacts:ab', html: facts + facts }])[0]!.html).toBe(facts)
  expect(found(page({ fields: [{ field: 'sections.quickFacts:ab', html: facts + facts }] }), 'repeated')).toHaveLength(2)
})

test('a photo the sweep takes off: another species the site has, with nothing saying the fish is still the page\'s', () => {
  const ctx: Ctx = { genera: new Set(['Garra', 'Corydoras', 'Gymnocorymbus', 'Anostomus', 'Aphyosemion', 'Rasboroides']), species: new Set(['garra flavatra', 'corydoras sterbai', 'gymnocorymbus ternetzi', 'aphyosemion elberti', 'aphyosemion bivittatum', 'rasboroides vaterifloris']) }
  expect(wrongFish('A Black Widow Tetra (Gymnocorymbus ternetzi).', 'Corydoras adolfoi', [], ctx)).toBe('Gymnocorymbus ternetzi')
  expect(wrongFish('♂ Aphyosemion bivittatum (syn. Chromaphyosemion bivittatum)', 'Aphyosemion bitaeniatum', [], ctx)).toBe('Aphyosemion bivittatum')
  // Found on the site: each of these shows the page's own fish.
  expect(wrongFish('Specimen from the Thai aquarium trade, imported as a contaminant in a batch of wild Garra flavatra.', 'Garra rakhinica', [], ctx)).toBeUndefined()
  expect(wrongFish('...and are peaceful with other species. Here with Garra flavatra.', 'Lepidocephalichthys guntea', [], ctx)).toBeUndefined()
  expect(wrongFish('Putative wild-collected adult male imported to Singapore among a shipment of Rasboroides vaterifloris.', 'Puntius titteya', [], ctx)).toBeUndefined()
  expect(wrongFish('Male Aphyosemion elberti "Red T". It was known at the time as Aphyosemion bual', 'Aphyosemion bualanum', [], ctx)).toBeUndefined()
  // A species no page has is listed for a person, not taken off.
  expect(wrongFish('Anostomus brevior in French Guiana', 'Anostomus anostomus', [], ctx)).toBeUndefined()
  expect(otherFish('Anostomus brevior in French Guiana', 'Anostomus anostomus', [], ctx)).toBe('Anostomus brevior')
  const p = page({ kind: 'species', sci: 'Garra rakhinica', captions: [{ url: 'a', caption: 'imported as a contaminant in a batch of wild Garra flavatra' }, { url: 'b', caption: 'Garra flavatra' }] })
  // The site's species are its pages': here Garra flavatra has one.
  const withPage = (rule: string) => checkPages([p, page({ kind: 'species', id: 'gf', sci: 'Garra flavatra' })], RULES.filter(r => r.id === rule)).findings.map(f => f.detail)
  expect(withPage('caption')).toEqual(['Garra flavatra: "Garra flavatra"'])
  expect(withPage('caption-unsure')).toEqual(['Garra flavatra: "imported as a contaminant in a batch of wild Garra flavatra"'])
})

test('card figures to keep off the page: the tank shorter than twice the fish, not the fish; a size out of bounds sets no bar', () => {
  const card = [{ field: 'sizeCm' as const, value: 90 }, { field: 'tankCm' as const, value: 150 }, { field: 'tankCm' as const, value: 200 }, { field: 'sizeCm' as const, value: 400 }]
  expect(cardSlips(card).map(s => [s.v.field, s.v.value, s.why])).toEqual([['sizeCm', 400, 'outside 0.3–300'], ['tankCm', 150, 'shorter than twice the fish (90 cm)']])
})

test('text reporting what "the page" says: found with its sentence, in three languages', () => {
  const p = page({ kind: 'species', fields: [{ field: 'sections.notes:sprucepets', html: '<p>Cá hiền. Trang lưu ý rằng chúng không thực sự làm sạch bể. Nuôi theo đàn.</p>' }, { field: 'sections.references:x', html: '<p>Trang nêu ở trên.</p>' }] })
  expect(sourcePagePhrases(p)).toEqual([{ field: 'sections.notes:sprucepets', quote: 'Trang lưu ý rằng chúng không thực sự làm sạch bể.' }])
  expect(sourcePagePhrases(page({ lang: 'id', fields: [{ field: 'body', html: '<p>Halaman ini juga menyebutkan suhu 26 °C.</p>' }] }))).toHaveLength(1)
  expect(sourcePagePhrases(page({ lang: 'th', fields: [{ field: 'body', html: '<p>ในหน้านี้ระบุว่าปลาชอบน้ำเย็น</p>' }] }))).toHaveLength(1)
  expect(sourcePagePhrases(page({ fields: [{ field: 'body', html: '<p>Trang trí bể bằng đá. Trang web của hãng ghi rõ liều. Với bể 100 lít, trang ghi đủ các mục sau:</p>' }] }))).toEqual([])
})

test('imperial figures, as the metric test finds them: a unit named with no figure is none', () => {
  const p = (t: string) => page({ fields: [{ field: 'body', html: `<p>${t}</p>` }] })
  expect(found(p('Aquaclear phân loại máy bơm theo dung tích bể khuyến nghị, tính bằng gallon Mỹ.'), 'imperial')).toEqual([])
  expect(found(p('Berapa liter atau galon air untuk satu koi?'), 'imperial')).toEqual([])
  expect(found(p('Sumber lain menaikkan suhu ke 86–88 (kemungkinan °F).'), 'imperial')).toEqual(['"86–88 (kemungkinan °F)"'])
  expect(found(p('bể 20 gallon cho bộ ba'), 'imperial')).toEqual(['"20 gallon"'])
})

test('the real-content test holds a defect at zero only on the kinds of page its fix mends', () => {
  const body = [{ field: 'body', html: '<p>Một bể 10 gallon.</p><h3>Kết</h3>' }]
  const intro = [{ field: 'intro', html: '<p>Một bể 10 gallon.</p><h3>Kết</h3>' }]
  const pages = [page({ fields: body }), page({ kind: 'glossary', fields: [{ field: 'definition', html: body[0]!.html }] }), page({ kind: 'equipment', fields: intro })]
  const { findings } = checkPages(pages, RULES.filter(r => ['headings', 'imperial'].includes(r.id)))
  expect(findings.map(f => `${f.page.kind} ${f.rule}`)).toEqual(['guides headings', 'guides imperial', 'glossary headings', 'glossary imperial', 'equipment headings', 'equipment imperial'])
  // The sweep writes glossary text, not an equipment page; `pnpm engine metric` converts neither.
  expect(ratcheted(findings).map(f => `${f.page.kind} ${f.rule}`)).toEqual(['guides headings', 'guides imperial', 'glossary headings'])
})

// Malay is swept and fixed as the others are, so these read its words where they read Indonesian's.
test("Malay's words: comments, related posts, counts, labels, references, the page saying, gallons and pounds", () => {
  expect(detected('<h3>7 komen mengenai “Akuarium”</h3><ul><li>a</li></ul><p>Tinggalkan komen</p><p>Artikel berkaitan:</p><ul><li>x</li></ul><h3>Komen pembaca</h3>'))
    .toEqual(['7 komen mengenai “Akuarium”', 'Tinggalkan komen', 'Artikel berkaitan:', 'Komen pembaca'])
  expect(detected('<p>Tinggalkan komen jika anda ada soalan tentang akuarium ini.</p>')).toEqual([]) // in a sentence, the text's own
  expect(titleCount('7 Petua menjaga akuarium')).toBe(7)
  expect(titleCount('5 kesilapan pemula')).toBe(5)
  expect(titleCount('10 tumbuhan akuatik mudah')).toBe(10)
  expect(titleCount('Akuarium 60 liter')).toBeUndefined()
  expect(labelSlips('<p>Kesilapan 1: x</p><p>Kesilapan 9: y</p><p>Kesilapan 2: z</p>')).toEqual(['"kesilapan" 1, 9, 2'])
  expect(renumberLabels('<p>Petua 1: x</p><p>Petua 9: y</p><p>Petua 2: z</p>')).toBe('<p>Petua 1: x</p><p>Petua 2: y</p><p>Petua 3: z</p>')
  expect(blocks('<h3>Rujukan</h3><p>Smith.</p>')[1]!.refs).toBe(true)
  expect(sourcePagePhrases(page({ fields: [{ field: 'body', html: '<p>Laman ini menyebut ikan ini tenang.</p>' }] })).map(x => x.quote)).toEqual(['Laman ini menyebut ikan ini tenang.'])
  expect(imperialUnits('akuarium 10 gelen').alone).toHaveLength(1)
  expect(imperialUnits('seberat 2 paun').alone).toHaveLength(1)
})

test('the fixes made on write reach the stored files of a language the site doesn\'t serve yet', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rules-ms-'))
  await mkdir(join(root, 'guides/g'), { recursive: true })
  await writeFile(join(root, 'guides/g/ms.json'), JSON.stringify({ name: 'Cacing &amp; Kutu', altNames: [] }))
  expect(await fixStored(root)).toEqual(['guides/g/ms.json'])
  expect(JSON.parse(await readFile(join(root, 'guides/g/ms.json'), 'utf8')).name).toBe('Cacing & Kutu')
})

test('text written from videos never names a channel, a reviewer or the video', () => {
  const channels = ['George Farmer', 'Cá Cảnh']
  expect(namesSource('Theo George Farmer, đèn này đủ sáng.', channels)).toEqual(['George Farmer'])
  expect(namesSource('Trong video, đèn được treo cách mặt nước 20 cm.', channels)).toEqual(['trong video'])
  expect(namesSource('Người review thấy quạt khá ồn.', channels)).toEqual(['người review'])
  expect(namesSource('Anh ấy thích đèn này.', channels)).toEqual(['anh ấy'])
  // The summary's own word for its sources, a light's colour channels, the hobby: none of them a source named.
  expect(namesSource('Hai bài review cùng thấy đèn đủ sáng.', channels)).toEqual([])
  expect(namesSource('Chỉnh từng kênh màu trên đèn.', channels)).toEqual([])
  expect(namesSource('Đèn hợp với bể cá cảnh gia đình.', channels)).toEqual([])
})

test('the rule reads a product\'s review lines and only pages written from videos', () => {
  const lines = [{ field: 'reviews.agree.0', text: 'Theo Example Scapes, trong video quạt khá êm.' }]
  expect(found(page({ kind: 'products', credited: ['Example Scapes'], lines }), 'names-source')).toEqual(['"trong video"', '"Example Scapes"'])
  expect(found(page({ kind: 'products', lines }), 'names-source')).toEqual([])
})

test('a page saying AquaTome controls a product it doesn\'t: Week Aqua in progress', () => {
  expect(claimsControl('Bạn có thể điều khiển đèn này bằng AquaTome.')).toBe(true)
  expect(claimsControl('AquaTome hỗ trợ đèn này trên iPhone.')).toBe(true)
  expect(claimsControl('AquaTome thử trên một chiếc WRGB II Slim.')).toBe(false)
  expect(claimsControl('Đèn điều khiển bằng app của hãng qua Bluetooth.')).toBe(false)
  const lines = [{ field: 'summary.0', text: 'Bạn có thể điều khiển đèn này bằng AquaTome.' }]
  expect(found(page({ kind: 'products', control: false, lines }), 'control-claim')).toHaveLength(1)
  expect(found(page({ kind: 'products', control: true, lines }), 'control-claim')).toEqual([])
})

// 2026-11-07, the owner's names: "cá bút chì" is the Siamese algae eater, so beside Nannostomus it's the old name.
test('a fish given its old name beside its genus or English name is found; each name for the fish it means is not', () => {
  expect(swappedNames('Cá bút chì (Nannostomus eques) bơi nghiêng.')).toHaveLength(1)
  expect(swappedNames('Có thể nuôi cùng cá bút chì (pencilfish).')).toHaveLength(1)
  expect(swappedNames('Cá bám đá (Sewellia lineolata) ăn tảo.')).toHaveLength(1)
  expect(swappedNames('Cá cờ Florida là tên cũ của Jordanella floridae.')).toHaveLength(1)
  expect(swappedNames('Cá cờ (Mesonauta festivus) là một loài cichlid.')).toHaveLength(1)
  expect(swappedNames('Cá cờ lùn (dwarf flag cichlid) rất hiền.')).toHaveLength(1)
  expect(swappedNames('Cá thiên đường (Macropodus opercularis) khỏe.')).toHaveLength(1)
  // Each name for its own fish, and an old name in another sentence than the fish.
  expect(swappedNames('Cá bút chì (Crossocheilus) ăn rêu. Cá chì (Nannostomus) bơi tầng mặt. Cá bám đá (Homaloptera) sống ở suối. Cá cờ (Macropodus) đẹp. Cá thiên đường đen (Macropodus spechti) hiền. Cá Mesonauta là một loài cichlid.')).toEqual([])
  // Other fish whose names hold the words, and "cá bám đá" for the whole family.
  expect(swappedNames('Cá trê bút chì Pareiodon và Nannostomus khác nhau.')).toEqual([])
  expect(swappedNames('Nhiều loài cá bám đá thuộc họ Balitoridae, ví dụ các chi Gastromyzon, Pseudogastromyzon.')).toEqual([])
})

// 2026-11-08: a run with one old name in it failed its whole publish. The sweep now writes the name, from the fish the
// sentence names; a sentence that doesn't say which fish stays for the rule to list, never renamed on a guess.
test.each([
  ['Cá bút chì nâu (Nannostomus eques) bơi nghiêng.', 'Cá chì nâu (Nannostomus eques) bơi nghiêng.'],
  ['Có thể nuôi cùng cá bút chì (pencilfish).', 'Có thể nuôi cùng cá chì (pencilfish).'],
  ['Nannostomus eques còn có tên là cá bút chì gậy hockey hay cá bút chì đuôi cúp.', 'Nannostomus eques còn có tên là cá chì gậy hockey hay cá chì đuôi cúp.'],
  ['Cá bám đá lưới (Sewellia lineolata) ăn tảo.', 'Cá tỳ bà bướm lưới (Sewellia lineolata) ăn tảo.'],
  ['Cá cờ Mỹ (American flagfish) có rỉa rêu.', 'Cá flagfish Mỹ (American flagfish) có rỉa rêu.'],
  // The new name's last word once: the old name went with it.
  ['Cá bám đá bướm (Beaufortia kweichowensis) sống ở suối.', 'Cá tỳ bà bướm (Beaufortia kweichowensis) sống ở suối.'],
  ['Cá cờ Mesonauta insignis', 'Cá Mesonauta insignis'],
  ['Cá cờ (Mesonauta festivus) hiền.', 'Cá Mesonauta (Mesonauta festivus) hiền.'],
  ['Nuôi cùng cá cờ (Laetacara curviceps).', 'Nuôi cùng cá Laetacara (Laetacara curviceps).'],
  ['Cá thiên đường (Macropodus opercularis) khỏe.', 'Cá cờ (Macropodus opercularis) khỏe.'],
  // Tags between the name and the fish, and a sentence's end in the HTML.
  ['<p>Cá bút chì (<em>Nannostomus</em>) đẹp.</p><p>Cá bút chì (Crossocheilus) ăn rêu.</p>', '<p>Cá chì (<em>Nannostomus</em>) đẹp.</p><p>Cá bút chì (Crossocheilus) ăn rêu.</p>'],
  ['<li>Cá bám đá (<a href="https://x.y/a">Sewellia</a>)</li>', '<li>Cá tỳ bà bướm (<a href="https://x.y/a">Sewellia</a>)</li>'],
  // Only the name with the flat genus in its brackets: the same words for the family stay.
  ['Cá bám đá (Sewellia) khác các loài cá bám đá khác.', 'Cá tỳ bà bướm (Sewellia) khác các loài cá bám đá khác.'],
  // Two old names, each with its own fish.
  ['Cá bút chì (Nannostomus) và cá cờ (Mesonauta) đều hiền.', 'Cá chì (Nannostomus) và cá Mesonauta (Mesonauta) đều hiền.'],
])('the sweep writes the fish\'s name: %s', (before, after) => {
  expect(swappedNames(before.replace(/<[^>]+>/g, ' '))).not.toEqual([])
  expect(renameSwapped(before)).toBe(after)
  expect(swappedNames(after.replace(/<[^>]+>/g, ' '))).toEqual([])
  expect(renameSwapped(after)).toBe(after)
})
test.each([
  // The sentence doesn't say which genus.
  'Cá cờ lùn (dwarf flag cichlid) rất hiền.',
  'Cá cờ (Mesonauta) khác cá cờ (Laetacara).',
  'Cá cờ (Jordanella) khác cá cờ (Mesonauta).',
])('the sweep leaves it for the rule to list: %s', text => {
  expect(swappedNames(text)).not.toEqual([])
  expect(renameSwapped(text)).toBe(text)
})
// The Writing Lead, 2026-11-08: a sentence that's right under the new names shouldn't stop a publish.
test.each([
  // The new name is there too, so the old one is another fish's.
  'Cá chì (Nannostomus) sống hòa thuận với cá bút chì.',
  'Cá flagfish (Jordanella floridae) nuôi được với cá cờ.',
])('a sentence that also has the new name is neither listed nor renamed: %s', text => {
  expect(swappedNames(text)).toEqual([])
  expect(renameSwapped(text)).toBe(text)
})
test.each([
  'Cá bút chì (Crossocheilus) ăn rêu, còn Nannostomus thì không.',
  'Nuôi cá bút chì (Siamese algae eater) chung với pencilfish được.',
  'Cá cờ (Macropodus opercularis) khác flagfish (Jordanella floridae).',
  'Cá cờ (paradise fish) không hợp với Mesonauta.',
])('a sentence that names the fish the old name is now is neither listed nor renamed: %s', text => {
  expect(swappedNames(text)).toEqual([])
  expect(renameSwapped(text)).toBe(text)
})
test('an old name with neither the new name nor its own fish in the sentence is still listed', () => {
  expect(swappedNames('Cá bút chì (Nannostomus) sống hòa thuận với cá neon.')).toEqual(['should be "cá chì": Cá bút chì (Nannostomus) sống hòa thuận với cá neon.'])
  expect(swappedNames('Cá cờ (Jordanella floridae) ăn rêu.')).toEqual(['should be "cá flagfish": Cá cờ (Jordanella floridae) ăn rêu.'])
})
test('the sweep leaves what the rule never lists, and text it has no name to change as it was written', () => {
  const clean = 'Cá bút chì (Crossocheilus) ăn rêu. Cá chì (Nannostomus) bơi tầng mặt. Cá cờ (Macropodus) đẹp. Cá chình (Nannostomus) không phải cá chì.'
  expect(renameSwapped(clean)).toBe(clean)
  // "cá chì" isn't said in "cá chình".
  expect(renameSwapped('Cá bút chì (Nannostomus) khác cá chình.')).toBe('Cá chì (Nannostomus) khác cá chình.')
  // Decomposed marks stay as they are when there's no name to change.
  const decomposed = 'Cá vàng đẹp.'.normalize('NFD')
  expect(renameSwapped(decomposed)).toBe(decomposed)
})
test('a stored page: its name, text, summary, FAQ and reviews are renamed; its other names, references and a name a person fixed stay', () => {
  const page = {
    slug: 'ca-but-chi-nannostomus-eques', name: 'Cá bút chì Nannostomus eques', altNames: ['Cá bút chì Nannostomus eques'],
    sections: { 'quickFacts:glaser': '<p>Cá bút chì (Nannostomus eques).</p>', 'references:glaser': '<p>Cá bút chì (Nannostomus eques).</p>' },
    summary: ['Cá bút chì (pencilfish) hiền.'], faq: [{ q: 'Cá bút chì (pencilfish) ăn gì?', a: 'Cá cờ (Laetacara) ăn gì cũng được.' }],
    reviews: { agree: [{ text: 'Hợp cá bút chì (pencilfish).' }] }, tested: [{ text: 'Thử với cá cờ (Mesonauta).' }],
  }
  expect(renameStored(page)).toEqual({
    slug: 'ca-but-chi-nannostomus-eques', name: 'Cá chì Nannostomus eques', altNames: ['Cá bút chì Nannostomus eques'],
    sections: { 'quickFacts:glaser': '<p>Cá chì (Nannostomus eques).</p>', 'references:glaser': '<p>Cá bút chì (Nannostomus eques).</p>' },
    summary: ['Cá chì (pencilfish) hiền.'], faq: [{ q: 'Cá chì (pencilfish) ăn gì?', a: 'Cá Laetacara (Laetacara) ăn gì cũng được.' }],
    reviews: { agree: [{ text: 'Hợp cá chì (pencilfish).' }] }, tested: [{ text: 'Thử với cá Mesonauta (Mesonauta).' }],
  })
  expect(renameStored({ ...page, nameFixed: true }).name).toBe(page.name)
  const unchanged = { name: 'Cá vàng', sections: { 'quickFacts:glaser': '<p>Đẹp.</p>' } }
  expect(renameStored(unchanged)).toBe(unchanged)
})

// The chief of staff, 2026-11-13: a fish is called by its kind's word, never another fish's. "Cầu vồng" is the rainbowfish's
// (Melanotaenia); Pseudomugil are "mắt xanh". The page's old name is the fish's alone, so it is renamed wherever it is.
test.each([
  // Its page's old name, with the fish or without it, and the name once, not "Cá mắt xanh neon đỏ mắt xanh".
  ['Cá cầu vồng neon đỏ mắt xanh (Pseudomugil luminatus) hiền.', 'Cá mắt xanh neon đỏ (Pseudomugil luminatus) hiền.'],
  ['Nuôi chung với cá cầu vồng neon đỏ mắt xanh và cá chuột lùn.', 'Nuôi chung với cá mắt xanh neon đỏ và cá chuột lùn.'],
  ['<li><strong>Cá cầu vồng neon đỏ mắt xanh</strong></li>', '<li><strong>Cá mắt xanh neon đỏ</strong></li>'],
  // The kind's word in a sentence that names the fish: its own words after the old one go with it (today's page).
  ['Pseudomugil luminatus, tên thường gọi là cá cầu vồng mắt xanh đỏ neon, là một loài cá nhỏ.', 'Pseudomugil luminatus, tên thường gọi là cá mắt xanh đỏ neon, là một loài cá nhỏ.'],
  // "P." ends a sentence for the rule, so the epithet names the fish (a guide's list).
  ['Bạn thử xem có P. luminatus (cầu vồng neon đỏ), P. furcata hay P. gertrudae không.', 'Bạn thử xem có P. luminatus (mắt xanh neon đỏ), P. furcata hay P. gertrudae không.'],
])('a fish the chief of staff named takes its name in the text: %s', (before, after) => {
  expect(swappedNames(before.replace(/<[^>]+>/g, ' '))).not.toEqual([])
  expect(renameSwapped(before)).toBe(after)
  expect(swappedNames(after.replace(/<[^>]+>/g, ' '))).toEqual([])
  expect(renameSwapped(after)).toBe(after)
})
test.each([
  // A rainbowfish named beside it: "cầu vồng" may be that fish's.
  'Pseudomugil luminatus nuôi chung được với cá cầu vồng (Melanotaenia praecox).',
  // Its name is there too, so the rainbowfish are other fish.
  'Cá mắt xanh neon đỏ (Pseudomugil luminatus) nuôi chung được với cá cầu vồng.',
  // A sentence that doesn't name it: the page's tankmates.
  'Những loài nuôi chung rất hợp gồm rasbora nhỏ, cá chuột lùn và các loài cá cầu vồng hiền khác.',
])('a rainbowfish beside the blue-eye is neither listed nor renamed: %s', text => {
  expect(swappedNames(text)).toEqual([])
  expect(renameSwapped(text)).toBe(text)
})

// 2026-11-07, a design lab: "que thử đa chỉtiêu" in the tank-cycling guide, a translation's typo. A Vietnamese word is one
// syllable, so a word that reads as two is two words run together; a loanword written as one ("nitơ") is not.
test('two Vietnamese syllables written as one word are found; one syllable, loanwords and other languages are not', () => {
  expect(gluedSyllables('Đo bằng que thử amoniac và que thử đa chỉtiêu.')).toEqual(['chỉtiêu'])
  // Items of a list run together (the least killifish's page): every one of them.
  expect(gluedSyllables('Sống bầy đàn: cóMức độ hoạt động: vừa phảiVị trí: tầng giữaHiền: có')).toEqual(['cóMức', 'phảiVị', 'giữaHiền'])
  const fine = 'nghiêng khuỷu người quyết giường thuở ngoằn ngoèo Nguyễn Việt khuya xoăn huơ gì quá chỉ tiêu nitơ Nitơ nơron ôxy kilômét hiđrô'
    + ' contain Solimões São Amazônia Ramírez Pokémon Châu Phi đ'
  expect(gluedSyllables(fine)).toEqual([])
  const p = (lang: 'vi' | 'id', html: string) => page({ lang, fields: [{ field: 'body', html }] })
  expect(found(p('vi', '<p>Que thử đa chỉtiêu.</p><ul><li>có</li><li>Mức độ</li></ul>'), 'glued')).toEqual(['"chỉtiêu"'])
  expect(found(p('vi', 'Sống bầy đàn: cóMức độ hoạt động'), 'glued')).toEqual(['"cóMức"']) // text with no tags at all
  expect(found(p('id', '<p>chỉtiêu</p>'), 'glued')).toEqual([])
})

// 2026-11-10: "Độ khó: 7/8 (khó)" stood beside a card and a summary of 6/8. Seriously Fish's "Difficulty 7 of 8 measures"
// counts what it could rate, and the card reads the rating from the word under it.
test('a Seriously Fish count of measures written as a difficulty takes the card\'s figure, in each language and form; the word and the reason stay', () => {
  expect(sfScoreFixed('<ul><li><strong>Difficulty:</strong> 7 of 8 (difficult), because it needs a long tank.</li></ul>', 'en', 6)).toBe('<ul><li><strong>Difficulty:</strong> 6 of 8 (difficult), because it needs a long tank.</li></ul>')
  expect(sfScoreFixed('<li>Difficulty: Difficult (5 of 8 measures); rated difficult</li>', 'en', 6)).toBe('<li>Difficulty: Difficult (6 of 8); rated difficult</li>')
  expect(sfScoreFixed('<li><strong>Độ khó:</strong> trung bình (6/8), vì cá cần bể đã chạy lâu</li>', 'vi', 4)).toBe('<li><strong>Độ khó:</strong> trung bình (4/8), vì cá cần bể đã chạy lâu</li>')
  expect(sfScoreFixed('<li>Độ khó: Khó (5/8 tiêu chí), vì cần bể dài</li>', 'vi', 6)).toBe('<li>Độ khó: Khó (6/8), vì cần bể dài</li>')
  expect(sfScoreFixed('<p>Nhiệt độ: 22–30°C. Độ khó: 5/8 (khó). Cá lớn nhanh.</p>', 'vi', 6)).toBe('<p>Nhiệt độ: 22–30°C. Độ khó: 6/8 (khó). Cá lớn nhanh.</p>')
  expect(sfScoreFixed('<li>Tingkat kesulitan: 5 dari 8 (sulit)</li>', 'id', 6)).toBe('<li>Tingkat kesulitan: 6 dari 8 (sulit)</li>')
  expect(sfScoreFixed('<li><strong>ความยากในการเลี้ยง:</strong> 7 จาก 8 (ยาก)</li>', 'th', 6)).toBe('<li><strong>ความยากในการเลี้ยง:</strong> 6 จาก 8 (ยาก)</li>')
  expect(sfScoreFixed('<li>Tahap kesukaran: 5 daripada 8</li>', 'ms', 4)).toBe('<li>Tahap kesukaran: 4 daripada 8</li>')
  // No count, another figure, or the figure already right.
  for (const html of ['<li>Difficulty: moderate</li>', '<li>Max size: 1 / 8 in</li>', '<li>Difficulty: 4 of 8 (moderate)</li>', '<li>Difficulty: moderate.</li><li>Tank: 3 of 8 shelves</li>']) expect(sfScoreFixed(html, 'en', 4)).toBe(html)
})

test('the count of measures is found only on a Seriously Fish line whose card has its figure, and the sweep is held to it', () => {
  const rule = RULES.find(r => r.id === 'sf-count')!
  const ctx: Ctx = { genera: new Set(), species: new Set() }
  const fields = [{ field: 'sections.quickFacts:seriouslyfish', html: '<li>Độ khó: 7/8 (khó)</li>' }]
  expect(rule.check(page({ kind: 'species', fields, card: [{ field: 'difficulty', source: 'seriouslyfish', value: 6 }] }), ctx)).toHaveLength(1)
  expect(rule.check(page({ kind: 'species', fields, card: [{ field: 'difficulty', source: 'glaser', value: 6 }] }), ctx)).toEqual([])
  expect(rule.check(page({ kind: 'species', fields: [{ field: 'sections.quickFacts:glaser', html: '<li>Độ khó: 7/8 (khó)</li>' }], card: [{ field: 'difficulty', source: 'seriouslyfish', value: 6 }] }), ctx)).toEqual([])
  expect(ratcheted([{ rule: 'sf-count', page: page({ kind: 'species' }), detail: 'x' }])).toHaveLength(1)
})
