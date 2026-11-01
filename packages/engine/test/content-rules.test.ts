import { expect, test } from 'vitest'
import {
  blocks, cardSlips, checkPages, countMismatch, cutFurniture, dropEmptyHeadings, dropRepeats, emptySections, englishSentences, fixTranslation, furniture,
  imperialUnits, labelSlips, leftoverMarkup, numberSlips, otherFish, plainEntities, renumberLabels, RULES, rulesReport, sourcePagePhrases, stripCount,
  titleCount, vietnameseLeft, wrongFish, type Ctx,
} from '../src/content-rules'
import { pagePath, type Page } from '../src/pages'

const page = (o: Partial<Page>): Page => ({ lang: 'vi', kind: 'guides', id: 'g', title: 'T', path: '/vi/huong-dan/g/', fields: [], lines: [], captions: [], latinNames: [], card: [], ...o })
const found = (p: Page, rule: string) => checkPages([p], RULES.filter(r => r.id === rule)).findings.map(f => f.detail)

test('page links in each language: species and breeds under the fish section', () => {
  expect(pagePath('vi', 'species', 'ca-dia')).toBe('/vi/ca/ca-dia/')
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

test('a heading with nothing under it, unless numbered items follow; the source site\'s comments', () => {
  expect(emptySections('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p><h3>Kết luận</h3><p>b</p><h3>Để lại bình luận</h3>')).toEqual(['Để lại bình luận'])
  expect(emptySections('<h3>Các loài</h3><h3>Tép ong</h3><p>a</p>')).toEqual(['Các loài'])
  expect(furniture('<h3>Kết luận</h3><p>a</p><h3>4 bình luận về “Đá dung nham”</h3><ul><li>Marcia: …</li></ul><h3>Để lại bình luận</h3><h3>Bài viết liên quan:</h3><h3>Bình luận của độc giả (5 bình luận)</h3>'))
    .toEqual(['4 bình luận về “Đá dung nham”', 'Để lại bình luận', 'Bài viết liên quan:', 'Bình luận của độc giả (5 bình luận)'])
  expect(furniture('<h3>Bình luận về chất lượng nước</h3>')).toEqual([])
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
  expect(md).toContain('Pages checked: 1 (Vietnamese 1, Indonesian 0, Thai 0)')
  expect(md).toContain('- boom on /vi/huong-dan/g/: bad')
  expect(md).toContain('## Sentences left in English (1)')
  expect(md).toContain('- [vi · Cá \\[đẹp\\]](https://aquatome.com/vi/huong-dan/g/) — "The fish should be kept in a large tank with plenty of cover."')
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
  for (const ok of ['<p>Bước 1: a</p><p>Bước 2: b</p>', '<p>Mẹo 3. a</p><p>Mẹo 2. b</p><p>Mẹo 1. c</p>', '<p>Cách 1: a</p><p>Cách 2: b</p><p>Cách 1: c</p><p>Cách 2: d</p>', '<p>Có 3 cách: một, hai, ba.</p>']) {
    expect(labelSlips(ok)).toEqual([])
    expect(renumberLabels(ok)).toBe(ok)
  }
  expect(found(page({ fields: [{ field: 'body', html }] }), 'labels')).toEqual(['"sai lầm" 1, 9, 2, 10'])
})

test('the source site\'s comments, comment form and related posts: found as headings or lines of their own, and cut', () => {
  expect(furniture('<h3>7 ý kiến về “Infusoria”</h3><ul><li>a</li></ul><h3>12 thoughts on “Lava rock”</h3><p>Bài viết liên quan:</p><ul><li>x</li></ul><p>Leave a Reply</p>'))
    .toEqual(['7 ý kiến về “Infusoria”', '12 thoughts on “Lava rock”', 'Bài viết liên quan:', 'Leave a Reply'])
  // In a sentence, a phrase is the text's own.
  expect(furniture('<p>Bài viết liên quan đến chủ đề này cho thấy cá cần bể lớn.</p><p>Hãy để lại bình luận nếu bạn có câu hỏi về bể.</p>')).toEqual([])
  const long = 'Đá dung nham tự nhiên là vật liệu trơ, không làm đổi thông số nước trong bể của bạn.'
  // Related posts in the middle of the text: the line and its list, not what follows.
  expect(cutFurniture(`<h3>A</h3><p>${long}</p><p>Bài viết liên quan:</p><ul><li>15+ thức ăn sống</li></ul><p>${long}</p><h3>B</h3><p>${long}</p>`)).toBe(`<h3>A</h3><p>${long}</p><p>${long}</p><h3>B</h3><p>${long}</p>`)
  // Comments with their readers' names, up to the next heading; the comment form after them.
  expect(cutFurniture(`<h3>Kết luận</h3><p>${long}</p><p>${long}</p><h3>4 bình luận về “Đá dung nham”</h3><ul><li><p><strong>Marcia:</strong> Hỏi.</p></li></ul><h3>Để lại bình luận</h3>`)).toBe(`<h3>Kết luận</h3><p>${long}</p><p>${long}</p>`)
  // Never more than half a text: a page that is mostly comments is left as it is (and listed).
  const most = `<p>Ngắn.</p><h3>Bình luận của độc giả</h3><p>${long}</p><p>${long}</p>`
  expect(cutFurniture(most)).toBe(most)
  expect(found(page({ fields: [{ field: 'body', html: most }] }), 'furniture')).toEqual(['"Bình luận của độc giả"'])
})

test('empty headings dropped, also one left empty when the numbered item under it goes', () => {
  expect(dropEmptyHeadings('<h3>Các loài</h3><h3>Tép ong</h3><p>a</p><h3>Sản phẩm</h3>')).toBe('<h3>Tép ong</h3><p>a</p>')
  expect(dropEmptyHeadings('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p>')).toBe('<h3>Ưu điểm</h3><h3>1. Nhẹ</h3><p>a</p>')
  expect(dropEmptyHeadings('<p>a</p><h3>Ưu điểm</h3><h3>1. Nhẹ</h3>')).toBe('<p>a</p>')
  expect(emptySections(dropEmptyHeadings('<h3>A</h3><h3>B</h3><h3>C</h3><p>x</p><h3>D</h3>'))).toEqual([])
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
