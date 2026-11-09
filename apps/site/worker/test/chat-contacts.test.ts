import { expect, test } from 'vitest'
import { reaches, withoutContacts } from '../chat/contacts'
import type { Handbook } from '../chat/handbook'
import { handedTanks, type Tank } from '../chat/tools'

test('a way to reach someone or an address is taken out of a tank\'s notes; the rest stays', () => {
  expect(withoutContacts('Lọc thùng 600L/h, mua ở shop Cá Đẹp, gọi 0912 345 678 hoặc zalo: 0912345678, xem fb.com/cadep nhé. Đèn 30W bật 8 tiếng.'))
    .toBe('Lọc thùng 600L/h, mua ở shop Cá Đẹp, gọi … hoặc …, xem … nhé. Đèn 30W bật 8 tiếng.')
  expect(withoutContacts('Nhà mình ở số 12 đường Lê Lợi, quận 1, nước máy hơi cứng.')).toBe('Nhà mình ở …, …, nước máy hơi cứng.')
  expect(withoutContacts('Email saya budi@contoh.co.id, tinggal di Jl. Merdeka 5. CO2 2 bps.')).toBe('Email saya …, tinggal di …. CO2 2 bps.')
  expect(withoutContacts('บ้านอยู่ซอยลาดพร้าว 101 ตู้ 60 ซม.')).toBe('บ้านอยู่… ตู้ 60 ซม.')
  // The figures a tank's notes hold aren't a phone number.
  const plain = 'Bể 60x40x40, pH 6.8, GH 6, thay 30% nước mỗi tuần, phân nền 2 năm, 1 ml phân nước mỗi ngày.'
  expect([withoutContacts(plain), reaches(plain)]).toEqual([plain, false])
  expect(reaches('gọi 0912 345 678')).toBe(true)
  // Digits in Thai script, and slashes between them; domains past the usual endings.
  expect(withoutContacts('โทร ๐๘๑๒๓๔๕๖๗๘ ตู้ 60 ซม.')).toBe('โทร … ตู้ 60 ซม.')
  expect(withoutContacts('gọi 0912/345/678, xem linktr.ee/cadep hoặc cadep.vip')).toBe('gọi …, xem … hoặc …')
  // A date, a tank's number, a city and an app's name inside a word are none of them.
  const ordinary = 'Set ngày 2024-11-08 hoặc 08/11/2024, bể số 2 ở TP.HCM, v.v. Baseline: 7.0 pH.'
  expect([withoutContacts(ordinary), reaches(ordinary)]).toEqual([ordinary, false])
})

test('a tank goes with every question as read_tanks gives it, but for its name and the ways to reach anyone in its notes', () => {
  const hb = { byId: () => undefined } as unknown as Handbook
  const tank: Tank = { id: 't1', name: 'Bể nhà Lan', litres: 60, species: [{ id: 'paracheirodon-innesi', count: 10 }], unlisted: [], substrate: 'phân nền', days: 30, notes: 'Đèn 30W bật 8 tiếng, gọi Lan 0912 345 678.' }
  expect(JSON.parse(handedTanks([tank], hb))).toEqual([{
    id: 't1', litres: 60, fish: [{ name: 'paracheirodon-innesi', count: 10 }], substrate: 'phân nền', savedDaysAgo: 30, readerNotes: 'Đèn 30W bật 8 tiếng, gọi Lan ….',
  }])
})
