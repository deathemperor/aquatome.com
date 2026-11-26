import { expect, test } from 'vitest'
import { markVietnameseNames, toneKey } from '../src/text'

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

// The chief of staff, 19 Nov 2026: "Oxy hoà tan" came back as Oxy hòa tan's other name. Codex, 19 Nov 2026: a key that moved
// every accent merged other languages' words ("público", "publicó").
test('a name in the old tone placing and the new has one key; every other mark, and other languages\' accents, keep theirs', () => {
  for (const [old, now] of [['hòa', 'hoà'], ['hóa', 'hoá'], ['hỏa', 'hoả'], ['hõa', 'hoã'], ['họa', 'hoạ'], ['khỏe', 'khoẻ'], ['thủy', 'thuỷ'], ['húy', 'huý']]) {
    expect(toneKey(old!)).toBe(toneKey(now!))
    expect(toneKey(old!.normalize('NFD'))).toBe(toneKey(now!))
    expect(toneKey(old!.toUpperCase())).toBe(toneKey(now!))
  }
  expect(toneKey('Oxy hòa tan')).toBe(toneKey('OXY HOÀ TAN'))
  expect(toneKey('Oxy hòa tan')).toBe('oxy hoà tan')
  // Different words stay apart: a tone or none, another mark, đ and d.
  for (const [a, b] of [['hóa', 'hoa'], ['hòa', 'hóa'], ['ô', 'o'], ['ư', 'u'], ['ơ', 'o'], ['ă', 'a'], ['đá', 'da'], ['thủy', 'thùy']]) expect(toneKey(a!)).not.toBe(toneKey(b!))
  // Other languages' accents keep their places; names with none are only case folded.
  for (const [a, b] of [['público', 'publicó'], ['sábia', 'sabía'], ['São', 'Sáo']]) expect(toneKey(a!)).not.toBe(toneKey(b!))
  expect(toneKey('CO₂')).toBe('co₂')
  expect(toneKey('Aphyosemion australe')).toBe('aphyosemion australe')
  expect(toneKey('ปลาหางนกยูง')).toBe('ปลาหางนกยูง')
})
