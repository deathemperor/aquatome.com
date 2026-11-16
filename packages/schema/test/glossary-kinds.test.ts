import { expect, test } from 'vitest'
import { glossaryKinds, GlossarySchema, kindLine, kindsSection } from '../src/index'

// The owner, 15 Nov 2026: "what does each look like?". Each kind's photo is filed under the id its item's name gives.
test('a term\'s kinds are the items under its "Các loại" or "Các dạng" heading, each by the name before its colon', () => {
  const lua = '<h3>Trong bể của bạn</h3><ul><li><strong>Không phải loại</strong>: mục khác.</li></ul>'
    + '<h3>Các loại lũa</h3><ul><li><strong>Lũa đỗ quyên</strong> (spider wood): rễ cây đỗ quyên.</li>'
    + '<li><strong>Lũa hải sơn tùng, lũa ngọc linh sam</strong>: một tiệm ghi.</li>'
    + '<li><strong>Lũa vân thép – san đá</strong>: bị mưa nắng bào mòn.</li>'
    + '<li><strong>Lũa thép</strong> (vân thép): một tiệm ghi.</li>'
    + '<li><strong>Malaysian driftwood</strong>: gỗ cứng, chìm.</li><li><strong>Lũa đỗ quyên</strong>: lặp lại.</li></ul>'
    + '<h3>Nên làm gì</h3><ul><li><strong>Ngâm</strong>: 1–2 tuần.</li></ul>'
  expect(glossaryKinds(lua)).toEqual([
    { id: 'lua-do-quyen', name: 'Lũa đỗ quyên' },
    { id: 'lua-hai-son-tung', name: 'Lũa hải sơn tùng' },
    { id: 'lua-van-thep', name: 'Lũa vân thép' },
    { id: 'lua-thep', name: 'Lũa thép' },
    { id: 'malaysian-driftwood', name: 'Malaysian driftwood' },
  ])
  expect(glossaryKinds('<h3>Các dạng Artemia</h3><ul><li><strong>Trứng Artemia</strong>: trứng khô còn vỏ.</li></ul>')).toEqual([{ id: 'trung-artemia', name: 'Trứng Artemia' }])
  expect(glossaryKinds('<h3>Nên làm gì</h3><ul><li><strong>Ngâm</strong>: 1–2 tuần.</li></ul>')).toEqual([])
})

// The Sonnet reviewer, 15 Nov 2026: a list inside an item, a list of mistakes, a list past another heading level and an
// entity each read as kinds or misread one.
test('a list inside a kind\'s item, a list of mistakes and what comes after the next heading are no kinds; entities are read', () => {
  expect(glossaryKinds('<h3>Các loại lũa</h3><ul><li><strong>Lũa A</strong>: x<ul><li>Cỡ nhỏ: y</li><li>Cỡ lớn: z</li></ul></li><li>Lũa B: w</li></ul><h2>Khác</h2><ul><li>Rác: y</li></ul>'))
    .toEqual([{ id: 'lua-a', name: 'Lũa A' }, { id: 'lua-b', name: 'Lũa B' }])
  expect(glossaryKinds('<h3>Các loại lỗi hay gặp</h3><ul><li>Ngâm thiếu: x</li></ul>')).toEqual([])
  expect(glossaryKinds('<h3>Các loại lũa</h3><ul><li>Lũa đỏ &amp; đen: x</li><li>Lũa&nbsp;sừng: y</li></ul>'))
    .toEqual([{ id: 'lua-do-den', name: 'Lũa đỏ & đen' }, { id: 'lua-sung', name: 'Lũa\u00a0sừng' }])
})

test('a term keeps one photo a kind, filed by the kind\'s id', () => {
  const photo = { url: 'https://media.aquatome.com/x/a.webp', width: 1000, height: 667, licence: 'dùng với sự cho phép', author: 'A shop', sourceUrl: 'https://example.org/a' }
  const term = (kinds: unknown) => GlossarySchema.safeParse({ id: 'lua', en: 'Driftwood', kinds }).success
  expect(term([{ id: 'lua-do-quyen', photo }, { id: 'mopani', photo }])).toBe(true)
  expect(term([{ id: 'lua-do-quyen', photo }, { id: 'lua-do-quyen', photo }])).toBe(false)
  expect(term([{ id: 'Lũa đỗ quyên', photo }])).toBe(false)
  expect(term([{ id: 'mopani' }])).toBe(false)
})

// The Design Lead's board, 16 Nov 2026: each kind a card (its name, its bracketed name, its first sentence), first in the
// page's body, its whole text behind a tap. The body splits at the kinds; the rest keeps its order.
test('a body splits at its kinds: the heading, the words over the list, each kind\'s label, bracketed name and text, the rest in order', () => {
  const body = '<h3>Trong bể của bạn</h3><p>Lớp đáy.</p><h3>Các loại nền</h3><p>Tiệm bán nhiều loại.</p>'
    + '<ul><li><strong>Phân nền</strong> (aqua soil): hạt tròn 2–4 mm, màu đen. Nó nhả dinh dưỡng.</li>'
    + '<li>Nham thạch trắng: viên đá trắng cỡ 1–3 cm. Nó còn có tên là đá lông vũ.<ul><li>Cỡ nhỏ: x</li></ul></li>'
    + '<li><strong>Lũa hải sơn tùng, lũa ngọc linh sam</strong>: một tiệm ghi.</li></ul><h3>Nên làm gì</h3><p>Rửa sạch.</p>'
  const s = kindsSection(body)!
  expect(s.heading).toBe('Các loại nền')
  expect(s.intro).toBe('<p>Tiệm bán nhiều loại.</p>')
  expect(s.rest).toBe('<h3>Trong bể của bạn</h3><p>Lớp đáy.</p><h3>Nên làm gì</h3><p>Rửa sạch.</p>')
  expect(s.items).toEqual([
    { id: 'phan-nen', name: 'Phân nền', label: 'Phân nền', aka: 'aqua soil', html: 'hạt tròn 2–4 mm, màu đen. Nó nhả dinh dưỡng.' },
    { id: 'nham-thach-trang', name: 'Nham thạch trắng', label: 'Nham thạch trắng', html: 'viên đá trắng cỡ 1–3 cm. Nó còn có tên là đá lông vũ.<ul><li>Cỡ nhỏ: x</li></ul>' },
    { id: 'lua-hai-son-tung', name: 'Lũa hải sơn tùng', label: 'Lũa hải sơn tùng, lũa ngọc linh sam', html: 'một tiệm ghi.' },
  ])
  // The same kinds as glossaryKinds reads, by the same ids.
  expect(glossaryKinds(body)).toEqual(s.items.map(({ id, name }) => ({ id, name })))
  expect(kindsSection('<h3>Nên làm gì</h3><p>Rửa sạch.</p>')).toBeNull()
  // The card's line: the first sentence, from a capital, never a list inside the item; a decimal comma stays.
  expect(s.items.map(k => kindLine(k.html))).toEqual(['Hạt tròn 2–4 mm, màu đen.', 'Viên đá trắng cỡ 1–3 cm.', 'Một tiệm ghi.'])
  expect(kindLine('pH 6,5 hoặc thấp hơn. Khác.')).toBe('pH 6,5 hoặc thấp hơn.')
})
