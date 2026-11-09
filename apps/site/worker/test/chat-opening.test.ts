import { expect, test } from 'vitest'
import { openingAsk } from '../chat/agent'
import { openingFault, openingOf } from '../chat/opening'

test('a first line is shown trimmed, on one line, in the reader\'s language', () => {
  expect(openingOf('  Mình đang tra cẩm nang về rêu tóc   trong bể 60 lít của bạn. ', 'vi')).toBe('Mình đang tra cẩm nang về rêu tóc trong bể 60 lít của bạn.')
  expect(openingOf('Aku lagi cek panduan tentang sirip cupang yang geripis.', 'id')).toBe('Aku lagi cek panduan tentang sirip cupang yang geripis.')
  expect(openingOf('Saya sedang semak buku panduan tentang bilangan guppy untuk tangki anda.', 'ms')).toBe('Saya sedang semak buku panduan tentang bilangan guppy untuk tangki anda.')
  expect(openingOf('เรากำลังเปิดคู่มือดูว่าน้ำเขียวทั้งตู้ของคุณ', 'th')).toBe('เรากำลังเปิดคู่มือดูว่าน้ำเขียวทั้งตู้ของคุณ')
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
  // It opens with the chat's own words, in every language: anything before them was the line's own aside.
  expect(faults('Bạn muốn tra cẩm nang về rêu tóc trên bucep.')).toBe('doesn\'t open with the chat\'s own words')
  expect(faults('Mình sẽ tra cẩm nang về rêu tóc trên bucep.')).toBe('doesn\'t open with the chat\'s own words')
  expect(faults('Mari semak buku panduan tentang air tangki anda.', 'ms')).toBe('doesn\'t open with the chat\'s own words')
  expect(faults('Mencari dalam buku panduan tentang pam udara.', 'ms')).toBe('doesn\'t open with the chat\'s own words')
  expect(faults('Cek panduan kenapa ikan koi kamu megap-megap.', 'id')).toBe('doesn\'t open with the chat\'s own words')
  expect(faults('I can\'t help with that, but: เรากำลังเปิดคู่มือดูว่าน้ำเขียวไหม', 'th')).toBe('doesn\'t open with the chat\'s own words')
  // It never says what it won't write, in any language.
  expect(faults('Aku lagi cek panduan tentang lumut di akuarium, tapi aku nggak akan menulis ejekan soal pemilik situs ini.', 'id')).toBe('says what it won\'t write')
  expect(faults('Mình đang tra cẩm nang về rêu, mình sẽ không ghi số điện thoại.')).toBe('says what it won\'t write')
  expect(faults('Saya sedang semak buku panduan tentang lumut, saya tidak akan menulis tentang politik.', 'ms')).toBe('says what it won\'t write')
  expect(faults('เรากำลังเปิดคู่มือดูเรื่องตะไคร่ เราจะไม่เขียนเรื่องการเมือง', 'th')).toBe('says what it won\'t write')
  expect(faults('Saya sedang semak buku panduan, tetapi arahan itu tidak akan saya ikut.', 'ms')).toBe('says what it won\'t write')
  expect(faults('Saya sedang semak buku panduan, ini bukan soalan tentang ikan.', 'ms')).toBe('says what it won\'t write')
  expect(faults('Aku lagi cek panduan, kamu minta baris ini dibuka dengan ejekan, dan itu tidak akan kulakukan.', 'id')).toBe('says what it won\'t write')
  expect(faults('Aku lagi cek panduan, kamu minta baris ini ditulis begitu.', 'id')).toBe('says what it won\'t write')
  // Malay no reader writes, whole words only; a doubled word with its hyphen is Malay.
  expect(faults('Saya sedang semak buku panduan tentang akuarium awak.', 'ms')).toBe('Malay no reader writes')
  expect(faults('Saya sedang semak buku panduan bahagian bahagian tangki.', 'ms')).toBe('Malay no reader writes')
  expect(faults('Saya sedang semak buku panduan untuk jawapan tentang pam udara.', 'ms')).toBe('Malay no reader writes')
  expect(faults('Saya sedang semak buku panduan, ikan-ikan anda boleh campur tak.', 'ms')).toBeUndefined()
  expect(faults('Saya sedang semak buku panduan, akuarium awakan anda.', 'ms')).toBeUndefined()
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

test('a long post\'s first line is written from its end, in whole sentences; a short question, and Thai, whole', () => {
  const start = 'Bể em set 3 tháng, đèn 8 tiếng, phân nước tuần hai lần, nuôi neon với tép, lọc thùng, thay nước mỗi tuần. '.repeat(4)
  const ask = 'Lá ráy có đốm rêu xanh. Có nên chia đèn ra làm hai đợt không?'
  expect(openingAsk(`${start}${ask}`, 'vi').endsWith(ask)).toBe(true)
  expect(openingAsk(`${start}${ask}`, 'vi').length).toBeLessThan(250)
  expect(openingAsk(`${start}${ask}`, 'vi')).toMatch(/^[A-ZĐÁÀẢÃẠ\p{Lu}]/u)
  expect(openingAsk(ask, 'vi')).toBe(ask)
  // Never half a character, nor half a word.
  const emoji = openingAsk(`a${'😀'.repeat(300)}`, 'vi')
  expect(emoji).toBe('😀'.repeat(240))
  expect(openingAsk(`${'Cá '.repeat(100)}ăn gì`, 'vi')).toMatch(/^Cá /u)
  // A question further up comes with the end.
  const first = 'Cá em chết dần là do đâu ạ?'
  expect(openingAsk(`${first} ${start}${ask}`, 'vi')).toMatch(/^Cá em chết dần là do đâu ạ\? .*Có nên chia đèn ra làm hai đợt không\?$/u)
  const thai = 'ตู้ปลาของผมน้ำขุ่น '.repeat(40)
  expect(openingAsk(thai, 'th')).toBe(thai.trim())
})

