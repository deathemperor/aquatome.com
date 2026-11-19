import { expect, test } from 'vitest'
import { LANGS, type Lang } from '@aq/schema/langs'
import { OPENING_REST, lineShown, openingAsk, openingMore, withRest } from '../chat/agent'
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

test('a long post\'s first line is written from its end and its opening, in whole sentences; a short question, and Thai, whole', () => {
  const start = 'Bể em set 3 tháng, đèn 8 tiếng, phân nước tuần hai lần, nuôi neon với tép, lọc thùng, thay nước mỗi tuần. '.repeat(4)
  const ask = 'Lá ráy có đốm rêu xanh. Có nên chia đèn ra làm hai đợt không?'
  expect(openingAsk(`${start}${ask}`, 'vi').endsWith(ask)).toBe(true)
  // The end's 240 characters and the opening's 160, with a space.
  expect([...openingAsk(`${start}${ask}`, 'vi')].length).toBeLessThanOrEqual(240 + 1 + 160)
  expect(openingAsk(`${start}${ask}`, 'vi')).toMatch(/^[A-ZĐÁÀẢÃẠ\p{Lu}]/u)
  expect(openingAsk(ask, 'vi')).toBe(ask)
  // Never half a character, nor half a word.
  const emoji = openingAsk(`a${'😀'.repeat(600)}`, 'vi')
  expect(emoji).toBe('😀'.repeat(240))
  expect(openingAsk(`${'Cá '.repeat(100)}ăn gì`, 'vi')).toMatch(/^Cá /u)
  // A question further up comes with the end.
  const first = 'Cá em chết dần là do đâu ạ?'
  expect(openingAsk(`${first} ${start}${ask}`, 'vi')).toMatch(/^Cá em chết dần là do đâu ạ\? .*Có nên chia đèn ra làm hai đợt không\?$/u)
  const thai = 'ตู้ปลาของผมน้ำขุ่น '.repeat(40)
  expect(openingAsk(thai, 'th')).toBe(thai.trim())
})

test('a long post keeps its opening, where the fish, tank or symptom is said: the end alone asked a betta\'s disease of its leaves (the editors, 17 Nov)', () => {
  const fish = 'Ikan cupang aku sudah empat hari tidak mau makan dan diam saja di dasar.'
  const middle = ' Wadahnya toples kecil, airnya aku ganti dua hari sekali, airnya dari sumur dan aku endapkan dulu semalam.'.repeat(3)
  const ask = ' Kemarin aku kasih daun ketapang sedikit ke dalam toplesnya. Ini kena penyakit apa ya, perlu obat?'
  const line = openingAsk(`${fish}${middle}${ask}`, 'id')
  expect(line.startsWith(fish)).toBe(true)
  expect(line.endsWith(ask.trim())).toBe(true)
  // A first sentence longer than the opening holds stops at a comma or a word, marked as cut; one with no place to stop
  // is left out.
  const run = `Bể 60 phân của em mới set được hai tuần, nuôi mười con neon, ba con otto, ${'nước vẫn còn hơi đục, '.repeat(8)}em thay nước rồi.`
  const cut = openingAsk(`${run}${middle}${ask}`, 'vi')
  expect(cut).toMatch(/^Bể 60 phân của em mới set được hai tuần, .*…/u)
  expect([...cut.split('…')[0]!].length).toBeLessThanOrEqual(160)
  expect(openingAsk(`${'x'.repeat(500)}${ask}`, 'vi').startsWith('x')).toBe(false)
  // A post the end and the opening would hold between them goes whole.
  expect(openingAsk(`${fish}${middle.slice(0, 200)}${ask}`, 'id')).toBe(`${fish}${middle.slice(0, 200)}${ask}`)
})

test('a long post whose questions don\'t all fit in its line is written from its opening and its first question, and the line says the rest in the reader\'s words (17 of 21 long Vietnamese tries got no line, 17 and 18 Nov)', () => {
  const opening = 'Bể mình 60x30x30, mới set được hai tuần, trồng ráy và rong đuôi chồn, đèn bật 8 tiếng mỗi ngày, chưa thả cá con nào.'
  const asks = ['Mình nên dùng phân nền gì cho bể này?', 'Chơi nền trơ có được không, hay phải có phân nền mới lên cây?', 'Lọc thác 6W chạy cho bể này có đủ không?']
  const post = `${opening} Bên shop tư vấn nhiều loại quá, mình đọc mãi vẫn chưa chọn được. ${asks.join(' ')}`
  expect([...post].length).toBeGreaterThan(240)
  expect(openingMore(post, 'vi')).toBe(true)
  // The opening holds its first sentence, and the sentence just before the question comes with it.
  expect(openingAsk(post, 'vi')).toBe(`${opening} Bên shop tư vấn nhiều loại quá, mình đọc mãi vẫn chưa chọn được. ${asks[0]}`)
  // What sits further from the question is left out.
  expect(openingAsk(post.replace('Bên shop', 'Mình đã thay nước hai lần trong tuần đầu, mỗi lần một phần ba bể, nước vẫn hơi đục. Bên shop'), 'vi')).not.toContain('thay nước hai lần')
  // Their questions fit, the post is short, or it is Thai: the line keeps every question, as before.
  expect(openingMore(`${opening.repeat(3)} ${asks[0]} ${asks[2]}`, 'vi')).toBe(false)
  expect(openingMore(asks.join(' '), 'vi')).toBe(false)
  expect(openingMore(`${'ตู้ปลาของผมน้ำขุ่น '.repeat(20)}${'ควรทำอย่างไรดีครับ? '.repeat(6)}`, 'th')).toBe(false)
  // The rest follows the line in one sentence, and passes the line's check in every served language.
  const lines: Partial<Record<Lang, string>> = {
    vi: 'Mình đang tra cẩm nang xem bể 60x30x30 của bạn nên dùng phân nền gì.',
    id: 'Aku lagi cek panduan, akuarium 60 cm kamu cocoknya pakai pupuk dasar apa',
    ms: 'Saya sedang semak buku panduan, akuarium 60 cm anda patut guna baja dasar apa.',
  }
  expect(withRest(lines.vi!, 'vi')).toBe('Mình đang tra cẩm nang xem bể 60x30x30 của bạn nên dùng phân nền gì, và xem thêm các câu hỏi khác của bạn.')
  for (const lang of LANGS.filter(l => l !== 'th')) {
    expect(OPENING_REST[lang], lang).toBeTruthy()
    expect(openingFault(withRest(lines[lang]!, lang), lang), lang).toBeUndefined()
  }
  expect(lineShown(lines.vi!, post, 'vi')).toBe(withRest(lines.vi!, 'vi'))
  expect(lineShown(lines.vi!, asks.join(' '), 'vi')).toBe(lines.vi)
  // Only a post over 240 characters: at 240, its questions go whole as before.
  const at = (n: number) => `${'Bể nhà mình nuôi cá. '.repeat(20)}`.slice(0, n - asks.join(' ').length - 1).replace(/.$/u, 'x') + ` ${asks.join(' ')}`
  expect([[...at(240)].length, openingMore(at(240), 'vi'), [...at(241)].length, openingMore(at(241), 'vi')]).toEqual([240, false, 241, true])
  // A post that marks no question with "?" (many Indonesian and Malay ones) is written from its end, as before.
  expect(openingMore(post.replaceAll('?', '.'), 'vi')).toBe(false)
  // A line the rest would take past the check's length is shown alone (3 of 57 long-post tries, 18 Nov).
  const long = `Mình đang tra cẩm nang xem bể xi măng nửa âm dài 5m, rộng 0,8m, nước 40cm của bạn nuôi 12 con chép, ${'con to con nhỏ, '.repeat(4)}có phải chép màu hay lai không.`
  expect([...withRest(long, 'vi')].length).toBeGreaterThan(200)
  expect(lineShown(long, post, 'vi')).toBe(long)
})

test('a link\'s "?" and a decimal\'s "." end no question: the first question is the reader\'s, whole (Codex\'s read, 18 Nov)', () => {
  const opening = 'Kolam koi aku ukuran 2x1,5 meter, dalamnya 80 cm, isinya 8 ekor koi ukuran 20 cm.'
  const since = 'Sudah jalan tiga bulan, airnya aku ganti seminggu sekali sepertiganya.'
  const link = 'Fotonya di https://example.invalid/kolam?id=1&size=2 ya.'
  const filter = 'Filternya aku bikin sendiri dari ember isi kapas, bioball dan batu zeolit.'
  const asks = ['Filter kayak gitu cukup belum buat pH 6.5 dan 8 ekor koi?', 'Pompanya perlu diganti yang 3.000 liter per jam nggak?', 'Kalau air hijau terus, harus diapain?']
  const post = `${opening} ${since} ${link} ${filter} ${asks.join(' ')}`
  expect([...post].length).toBeGreaterThan(240)
  expect(openingMore(post, 'id')).toBe(true)
  // Its first question whole, its number too; the filter it calls "that filter" just before it; the link left out.
  expect(openingAsk(post, 'id')).toBe(`${opening} ${since} ${filter} ${asks[0]}`)
  // A question with a link in it is one question, the link in it.
  const linked = `${opening} ${filter} Ikan di https://example.invalid/koi?id=7 ini sakit apa? ${asks.slice(1).join(' ')}`
  expect(openingAsk(linked, 'id')).toContain('Ikan di https://example.invalid/koi?id=7 ini sakit apa?')
})
