import { expect, test } from 'vitest'
import { markVietnameseNames } from '../src/text'

// /id/ikan/datz-siam/ failed the live check for Vietnamese on Indonesian pages (2026-11-01): its distribution text names
// the Đồng Nai river, a Vietnamese name that belongs there.
test('a Vietnamese name in Indonesian or Thai text is marked as Vietnamese', () => {
  expect(markVietnameseNames('<p>di daerah aliran sungai Đồng Nai di Vietnam.</p>'))
    .toBe('<p>di daerah aliran sungai <span lang="vi">Đồng Nai</span> di Vietnam.</p>')
  expect(markVietnameseNames('<p>พบในแม่น้ำ Đồng Nai ประเทศเวียดนาม</p>')).toBe('<p>พบในแม่น้ำ <span lang="vi">Đồng Nai</span> ประเทศเวียดนาม</p>')
})
test('Vietnamese left untranslated stays unmarked, so the check still finds it', () => {
  expect(markVietnameseNames('<p>Cara merawat bể thủy sinh</p>')).toBe('<p>Cara merawat bể thủy sinh</p>')
  // Only the capitalised first word is a "name"; the rest of the sentence still shows.
  expect(markVietnameseNames('<h3>Hướng dẫn cách ấp</h3>')).toBe('<h3><span lang="vi">Hướng</span> dẫn cách ấp</h3>')
})
test('names in other languages, tags and text already marked are left as they are', () => {
  expect(markVietnameseNames('<p>Rio São Francisco, Brasil</p>')).toBe('<p>Rio São Francisco, Brasil</p>')
  expect(markVietnameseNames('<a href="/vi/ca/ca-dia/" title="Cá Đĩa">x</a>')).toBe('<a href="/vi/ca/ca-dia/" title="Cá Đĩa">x</a>')
  expect(markVietnameseNames('<span lang="vi">Sông <span>Đồng Nai</span></span> lagi Đà Lạt'))
    .toBe('<span lang="vi">Sông <span>Đồng Nai</span></span> lagi <span lang="vi">Đà Lạt</span>')
})
