import { expect, test } from 'vitest'
import { glossaryKinds, GlossarySchema } from '../src/index'

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

test('a term keeps one photo a kind, filed by the kind\'s id', () => {
  const photo = { url: 'https://media.aquatome.com/x/a.webp', width: 1000, height: 667, licence: 'dùng với sự cho phép', author: 'A shop', sourceUrl: 'https://example.org/a' }
  const term = (kinds: unknown) => GlossarySchema.safeParse({ id: 'lua', en: 'Driftwood', kinds }).success
  expect(term([{ id: 'lua-do-quyen', photo }, { id: 'mopani', photo }])).toBe(true)
  expect(term([{ id: 'lua-do-quyen', photo }, { id: 'lua-do-quyen', photo }])).toBe(false)
  expect(term([{ id: 'Lũa đỗ quyên', photo }])).toBe(false)
  expect(term([{ id: 'mopani' }])).toBe(false)
})
