import { expect, test } from 'vitest'
import {
  blocks, checkPages, countMismatch, emptySections, englishSentences, fixTranslation, furniture, imperialUnits, leftoverMarkup,
  numberSlips, otherFish, plainEntities, RULES, rulesReport, titleCount, vietnameseLeft, type Ctx,
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
