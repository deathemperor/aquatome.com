import { expect, test } from 'vitest'
import { quoted, sentences, splice } from '../src/sentences'

// Parts as the site has them (content/, 13 Nov 2026), and the cuts a coarse reading has to get right.
const PARTS = [
  '<p>Loài này rất gần với B. brigittae. Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>',
  '<ul><li>Bể tối thiểu: 8 lít</li><li>Thức ăn: ăn tạp</li></ul>',
  '<p>Cây <strong>rất dễ trồng. Lá</strong> mọc nhanh. Dài 2,5-5 cm. Ảnh &amp; chữ: một nguồn. "Trích dẫn" thì sao? Vâng!</p>\n<p>Đèn nên để khá dịu. Có loài Rasbora sp. và cá v.v. ở đây. Theo Dr. Axelrod và H. R. Axelrod thì vậy.</p>',
  'Chữ không có thẻ. Câu thứ hai.',
]

test('a part cut into sentences joins back byte for byte, and cuts only where a sentence surely ends', () => {
  for (const html of PARTS) expect(sentences(html).map(p => p.html).join('')).toBe(html)
  const of = (html: string) => sentences(html).filter(p => p.sentence).map(p => p.html)
  // A genus's initial isn't a sentence's end.
  expect(of(PARTS[0]!)).toEqual([
    'Loài này rất gần với B. brigittae.',
    'Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah.',
    'Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.',
  ])
  expect(of(PARTS[1]!)).toEqual(['Bể tối thiểu: 8 lít', 'Thức ăn: ăn tạp'])
  // Never inside <strong>; an entity stays as written; an initial or an abbreviation before a capital ends nothing.
  expect(of(PARTS[2]!)).toEqual(['Cây <strong>rất dễ trồng. Lá</strong> mọc nhanh.', 'Dài 2,5-5 cm.', 'Ảnh &amp; chữ: một nguồn.', '"Trích dẫn" thì sao?', 'Vâng!', 'Đèn nên để khá dịu.', 'Có loài Rasbora sp. và cá v.v. ở đây.', 'Theo Dr. Axelrod và H. R. Axelrod thì vậy.'])
  expect(of(PARTS[3]!)).toEqual(['Chữ không có thẻ.', 'Câu thứ hai.'])
})

test('a quote names the sentences it lies in, entities read; one not in the part names none', () => {
  const p = sentences(PARTS[2]!)
  expect(quoted(p, 'Ảnh & chữ')).toEqual([2])
  expect(quoted(p, 'mọc nhanh. Dài 2,5-5')).toEqual([0, 1])
  expect(quoted(p, 'cá betta')).toEqual([])
})

test('spliced, only the changed sentences differ; one left out takes its space, and an emptied block goes', () => {
  const p = sentences(PARTS[0]!)
  expect(splice(p, new Map())).toBe(PARTS[0])
  expect(splice(p, new Map([[2, '']]))).toBe('<p>Loài này rất gần với B. brigittae. Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah.</p>')
  expect(splice(p, new Map([[0, '']]))).toBe('<p>Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>')
  expect(splice(sentences(PARTS[1]!), new Map([[1, '']]))).toBe('<ul><li>Bể tối thiểu: 8 lít</li></ul>')
  expect(splice(sentences('<p>Một câu.</p><p>Câu khác.</p>'), new Map([[0, '']]))).toBe('<p>Câu khác.</p>')
})
