import { expect, test } from 'vitest'
import { cmToIn, cToF, imperialLeft, metricPage, toMetric } from '../src/index'

test('converts to one decimal', () => {
  expect(cToF(24)).toBe(75.2)
  expect(cmToIn(5)).toBe(2)
  expect(cmToIn(60)).toBe(23.6)
})

// Each case is a line from a published page (content/, before the fix).
const vi = (s: string) => toMetric(s, 'vi')

test('a metric figure keeps no imperial copy beside it', () => {
  expect(vi('<li>Nhiệt độ: 20–30°C (68–86°F)</li>')).toBe('<li>Nhiệt độ: 20–30°C</li>')
  expect(vi('<li>Kích thước bể: 120 × 30 cm (48 × 12 in)</li>')).toBe('<li>Kích thước bể: 120 × 30 cm</li>')
  expect(vi('Kích thước tối đa: 140 mm SL (6 in SL)')).toBe('Kích thước tối đa: 140 mm SL')
  expect(vi('Thể tích: ~304 lít (~80 gal Mỹ). Có khả năng')).toBe('Thể tích: ~304 lít. Có khả năng')
  expect(vi('Thể tích: khoảng 243 lít (khoảng 64 US gal)')).toBe('Thể tích: khoảng 243 lít')
  expect(vi('Thể tích: ~24.000 lít (~6340 US gal).')).toBe('Thể tích: ~24.000 lít.')
  expect(vi('Kích thước: dài tối đa 5 cm (≈ 2″).')).toBe('Kích thước: dài tối đa 5 cm.')
  expect(vi('khoảng 2,5–2,6 cm (≈ 1,0″) chiều dài chuẩn')).toBe('khoảng 2,5–2,6 cm chiều dài chuẩn')
  expect(vi('♂ 120 mm SL (12 cm), ♀ 90 mm SL (9 cm) (♂ 5 in, ♀ 3,5 in). Đáy bể')).toBe('♂ 120 mm SL (12 cm), ♀ 90 mm SL (9 cm). Đáy bể')
  expect(vi('(SL tối đa ghi nhận của B. capapretum là 880 mm, 35 inch)')).toBe('(SL tối đa ghi nhận của B. capapretum là 880 mm)')
  expect(vi('Kích thước tối đa: đực 55 mm SL, cái 40 mm SL (2,2 / 1,6 inch)')).toBe('Kích thước tối đa: đực 55 mm SL, cái 40 mm SL')
})

test('an imperial figure gives way to the metric one after it', () => {
  expect(vi('Kích thước tối đa: 2,25 inch (khoảng 5,7 cm)')).toBe('Kích thước tối đa: 5,7 cm')
  expect(vi('Nhiệt độ: 75–83°F (khoảng 24–28°C); sống tốt')).toBe('Nhiệt độ: 24–28°C; sống tốt')
  expect(vi('ở độ cao 2000 ft (khoảng 610 m) tại quận Darjiling')).toBe('ở độ cao 610 m tại quận Darjiling')
  expect(vi('Cần một bể dài khoảng 6 ft (1,8 m), trang trí')).toBe('Cần một bể dài khoảng 1,8 m, trang trí')
  expect(vi('với độ sâu 1–2 inch (2,5–5 cm), thêm')).toBe('với độ sâu 2,5–5 cm, thêm')
  expect(vi('Kích thước trưởng thành: 6 inch/15 cm')).toBe('Kích thước trưởng thành: 15 cm')
  expect(vi('Nhiệt độ: 72 đến 79 °F/23 đến 26 °C')).toBe('Nhiệt độ: 23 đến 26 °C')
  expect(vi('khuyên bể tối thiểu 20–30 gallon Mỹ, tức khoảng 75–115 lít.')).toBe('khuyên bể tối thiểu 75–115 lít.')
  expect(vi('Nên nuôi 1 cặp trên mỗi 5 gallon nước (khoảng 19 lít).')).toBe('Nên nuôi 1 cặp trên mỗi 19 lít nước.')
  // The source's own litres for its (UK) gallons stay: "20 gallons (~90 litres)".
  expect(vi('Bể tối thiểu: 20 gallon (khoảng 90 lít)')).toBe('Bể tối thiểu: 90 lít')
  // A metric figure that doesn't match is not trusted.
  expect(vi('Bể tối thiểu: 10 gallon (khoảng 60 lít)')).toBe('Bể tối thiểu: 38 lít')
})

test('an imperial figure alone is converted, rounded as hobbyists say it', () => {
  expect(vi('thoải mái nhất ở nhiệt độ phòng khoảng 72 °F.')).toBe('thoải mái nhất ở nhiệt độ phòng khoảng 22 °C.')
  expect(vi('23-27 °C (73-81 °F); một con số khác được nêu là 73-80 °F.')).toBe('23-27 °C; một con số khác được nêu là 23-27 °C.')
  expect(vi('bể để bàn chỉ 2 gallon, nhưng bể 8-12 gallon sẽ')).toBe('bể để bàn chỉ 8 lít, nhưng bể 30-45 lít sẽ')
  expect(vi('không lớn hơn khoảng ¾ inch (như cá rasbora ớt)')).toBe('không lớn hơn khoảng 2 cm (như cá rasbora ớt)')
  expect(vi('cách đáy bể 1/2 inch, dài 3 1/2 inch, 12 inch, 2-inch')).toBe('cách đáy bể 1,5 cm, dài 9 cm, 30 cm, 5 cm')
  expect(vi('khoảng 1.000 gallon cho mỗi con')).toBe('khoảng 3.800 lít cho mỗi con')
  expect(vi('Kích thước tối đa (5 inch)')).toBe('Kích thước tối đa (13 cm)')
  expect(vi('73–74 °F')).toBe('23 °C')
  expect(vi('2 x 5 gallon')).toBe('2 x 19 lít') // two tanks, not a tank's sides
  // A bracket after a metric figure of another clause is no copy of it.
  expect(vi('Bể 60 × 30 cm, cá dài (4 in).')).toBe('Bể 60 × 30 cm, cá dài (10 cm).')
})

test('English and quotes are left as they are', () => {
  const left = [
    'Ecology of Aulonocara REGAN, 1922 in Lake Malawi.',
    'Pp. 461-498 In: Malabarba',
    "'San-ho Hsien, Kweichow, China, elevation 650 feet' (độ cao khoảng 200 m)",
    'loại 3 in 1',
    'pH 6,5–7,5, 5–12 dGH, 2 màu',
  ]
  for (const s of left) expect(vi(s)).toBe(s)
  expect(imperialLeft(left.join(' '))).toEqual([])
})

test('Indonesian and Thai pages', () => {
  expect(toMetric('Ukuran akuarium minimum: 10 galon (sekitar 38 liter)', 'id')).toBe('Ukuran akuarium minimum: 38 liter')
  expect(toMetric('minimal 5 galon lebih (sekitar 19 L)', 'id')).toBe('minimal 19 L lebih')
  expect(toMetric('lebih baik 55 galon atau lebih', 'id')).toBe('lebih baik 208 liter atau lebih')
  expect(toMetric('ขนาดสูงสุด: ประมาณ 12.5 ซม. (5 นิ้ว)', 'th')).toBe('ขนาดสูงสุด: ประมาณ 12.5 ซม.')
  expect(toMetric('โตได้ยาวถึง 5 นิ้ว (ประมาณ 12.5 ซม.) เป็นปลากัด', 'th')).toBe('โตได้ยาวถึง 12.5 ซม. เป็นปลากัด')
  expect(toMetric('ขนาดตู้ปลาขั้นต่ำ: 80 ลิตร (20 แกลลอน)', 'th')).toBe('ขนาดตู้ปลาขั้นต่ำ: 80 ลิตร')
  expect(toMetric('จู่โจมนิ้วมือที่เผลอยื่น 2 นิ้วมือ', 'th')).toBe('จู่โจมนิ้วมือที่เผลอยื่น 2 นิ้วมือ')
  expect(toMetric('ยาว 1.5 นิ้ว', 'th')).toBe('ยาว 4 ซม.')
  expect(toMetric('อย่างน้อยราว 38 ลิตร (10 แกลลอนสหรัฐ)', 'th')).toBe('อย่างน้อยราว 38 ลิตร')
  expect(toMetric('ให้ขั้นต่ำไว้ที่ 5 แกลลอนขึ้นไป (ราว 19 ลิตร) แล้วแต่ชนิดปลา', 'th')).toBe('ให้ขั้นต่ำไว้ที่ 19 ลิตรขึ้นไป แล้วแต่ชนิดปลา')
  expect(toMetric('อย่างน้อย 30 แกลลอน (ราว 115 ลิตร) ถ้าได้ 55 แกลลอนขึ้นไป', 'th')).toBe('อย่างน้อย 115 ลิตร ถ้าได้ 208 ลิตรขึ้นไป')
})

test('a page: every text but the reference list', () => {
  const page = {
    slug: 's', name: 'Cá 10 gallon', altNames: [], quality: { score: 1, indexable: true },
    sections: { 'quickFacts:sprucepets': '<li>Bể tối thiểu: 10 gallon (khoảng 38 lít)</li>', 'references:seriouslyfish': '<p>Smith, 1990. 12 in.</p>' },
    body: 'Nhiệt độ 75 °F.', summary: ['Bể 20 gallon.'], faq: [{ q: 'Bể 10 gallon?', a: 'Cá dài 2 inch.' }],
  }
  expect(metricPage(page, 'vi')).toEqual({
    ...page,
    sections: { 'quickFacts:sprucepets': '<li>Bể tối thiểu: 38 lít</li>', 'references:seriouslyfish': '<p>Smith, 1990. 12 in.</p>' },
    body: 'Nhiệt độ 24 °C.', summary: ['Bể 76 lít.'], faq: [{ q: 'Bể 38 lít?', a: 'Cá dài 5 cm.' }],
  })
})
