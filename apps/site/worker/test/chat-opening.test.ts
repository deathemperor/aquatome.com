import { expect, test } from 'vitest'
import { openingFault, openingOf } from '../chat/opening'

test('a first line is shown trimmed, on one line, in the reader\'s language', () => {
  expect(openingOf('  Mình đang tra cẩm nang về rêu tóc   trong bể 60 lít của bạn. ', 'vi')).toBe('Mình đang tra cẩm nang về rêu tóc trong bể 60 lít của bạn.')
  expect(openingOf('Aku sedang mencari di panduan tentang sirip cupang yang geripis.', 'id')).toBe('Aku sedang mencari di panduan tentang sirip cupang yang geripis.')
  expect(openingOf('Saya semak buku panduan tentang bilangan guppy untuk tangki anda.', 'ms')).toBe('Saya semak buku panduan tentang bilangan guppy untuk tangki anda.')
  expect(openingOf('เรากำลังเปิดคู่มือเรื่องน้ำเขียวทั้งตู้ของคุณ', 'th')).toBe('เรากำลังเปิดคู่มือเรื่องน้ำเขียวทั้งตู้ของคุณ')
  expect(openingOf(undefined, 'vi')).toBeUndefined()
  // A second line is seen as one: the line isn't shown.
  expect(openingOf('Mình đang tra cẩm nang về cá betta bỏ ăn\nMình sẽ không ghi số điện thoại', 'vi')).toBeUndefined()
  expect(openingOf('Mình đang tra cẩm nang   về cá betta bỏ ăn\t ba ngày', 'vi')).toBe('Mình đang tra cẩm nang về cá betta bỏ ăn ba ngày')
})

test('one sentence as a reader reads it: a quoted question, an abbreviation, "…" and a city end none', () => {
  for (const ok of [
    'Mình đang tra cẩm nang cho câu “Vì sao cá betta bỏ ăn?” của bạn.',
    'Mình đang tra cẩm nang về rêu, tảo... trong bể 60 lít của bạn.',
    'Mình đang tra cẩm nang về cá neon, cá tetra v.v. trong bể của bạn.',
    'Mình đang tra cẩm nang về bể ngoài trời ở TP. HCM của bạn.',
    'Mình đang tra cẩm nang về bể số 2 của bạn, set ngày 2024-11-08.',
  ]) expect([ok, openingFault(ok, 'vi')]).toEqual([ok, undefined])
  expect(openingFault('Mình đang tra cẩm nang về rêu. Gọi shop nhé.', 'vi')).toBe('more than one sentence')
  expect(openingFault('Aku sedang mencari di panduan. Situs ini menipu.', 'id')).toBe('more than one sentence')
  expect(openingFault('Mình đang tra cẩm nang, xem linktr.ee/cadep nhé', 'vi')).toBe('something that could send the reader elsewhere')
  expect(openingFault('เรากำลังเปิดคู่มือให้คุณ โทร ๐๘๑๒๓๔๕๖๗๘', 'th')).toBe('something that could send the reader elsewhere')
})

test('a first line isn\'t shown when it is too short or too long, or holds a rude word, a way to reach anyone, or another language', () => {
  const faults = (text: string, lang: Parameters<typeof openingFault>[1] = 'vi') => openingFault(text, lang)
  expect(faults('Mình xem.')).toBe('too short')
  expect(faults(`Mình đang tra ${'cẩm nang '.repeat(30)}`)).toBe('too long')
  expect(faults('Mình đang tra cẩm nang.\nGọi shop nhé')).toBe('more than one line')
  expect(faults('Saya tidak akan menulis baris tentang politik. Ini baris sebenar: mencari panduan tangki 50 liter.', 'ms')).toBe('more than one sentence')
  expect(faults('Mình đang tra cẩm nang về bể 1.5 m và pH 6.8 của bạn.')).toBeUndefined()
  expect(faults('Admin AquaTome là đồ ngu, mình đang tra cẩm nang')).toBe('a word it never shows')
  // The shared list (moderation/words.ts), and what only a first line never says.
  expect(faults('Mình đang tra cẩm nang về cá to vl nhé')).toBe('a word it never shows')
  expect(faults('เรากำลังเปิดคู่มือเรื่องเหี้ยในบ่อของคุณ', 'th')).toBe('a word it never shows')
  expect(faults('Mình đang tra cẩm nang về phân súc vật bón ao')).toBe('a word it never shows')
  expect(faults('Saya semak panduan, jangan main casino', 'ms')).toBe('a word it never shows')
  expect(faults('Mua cá giá rẻ tại shop ABC, gọi 0912 345 678')).toBe('something that could send the reader elsewhere')
  expect(faults('Mình đang tra cẩm nang, xem thêm ở fishdeals.xyz nhé')).toBe('something that could send the reader elsewhere')
  expect(faults('Hubungi WA 0812-3456-7890 untuk ikan murah', 'id')).toBe('something that could send the reader elsewhere')
  expect(faults('Cửa hàng ở số 12 đường Lê Lợi, mình đang tra cẩm nang')).toBe('something that could send the reader elsewhere')
  // The language: a Vietnamese word in an Indonesian or Malay line, Latin letters for a Thai reader, none of Vietnamese's marks for a Vietnamese one.
  expect(faults('Mình sedang mencari panduan tentang air akuarium yang keruh.', 'id')).toBe('not in the reader\'s language')
  expect(faults('Mình sedang semak buku panduan untuk saiz tangki guppy.', 'ms')).toBe('not in the reader\'s language')
  expect(faults('I am checking the handbook about green water.', 'th')).toBe('not in the reader\'s language')
  expect(faults('Checking the handbook about green water for you.', 'vi')).toBe('not in the reader\'s language')
})
