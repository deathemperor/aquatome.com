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
  expect(toMetric('lebih baik 55 galon atau lebih', 'id')).toBe('lebih baik 210 liter atau lebih')
  expect(toMetric('ขนาดสูงสุด: ประมาณ 12.5 ซม. (5 นิ้ว)', 'th')).toBe('ขนาดสูงสุด: ประมาณ 12.5 ซม.')
  expect(toMetric('โตได้ยาวถึง 5 นิ้ว (ประมาณ 12.5 ซม.) เป็นปลากัด', 'th')).toBe('โตได้ยาวถึง 12.5 ซม. เป็นปลากัด')
  expect(toMetric('ขนาดตู้ปลาขั้นต่ำ: 80 ลิตร (20 แกลลอน)', 'th')).toBe('ขนาดตู้ปลาขั้นต่ำ: 80 ลิตร')
  expect(toMetric('จู่โจมนิ้วมือที่เผลอยื่น 2 นิ้วมือ', 'th')).toBe('จู่โจมนิ้วมือที่เผลอยื่น 2 นิ้วมือ')
  expect(toMetric('ยาว 1.5 นิ้ว', 'th')).toBe('ยาว 4 ซม.')
  expect(toMetric('อย่างน้อยราว 38 ลิตร (10 แกลลอนสหรัฐ)', 'th')).toBe('อย่างน้อยราว 38 ลิตร')
  expect(toMetric('ให้ขั้นต่ำไว้ที่ 5 แกลลอนขึ้นไป (ราว 19 ลิตร) แล้วแต่ชนิดปลา', 'th')).toBe('ให้ขั้นต่ำไว้ที่ 19 ลิตรขึ้นไป แล้วแต่ชนิดปลา')
  expect(toMetric('อย่างน้อย 30 แกลลอน (ราว 115 ลิตร) ถ้าได้ 55 แกลลอนขึ้นไป', 'th')).toBe('อย่างน้อย 115 ลิตร ถ้าได้ 210 ลิตรขึ้นไป')
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

// Guides (content/guides, before the fix): US tank models, pipes, doses, rules of thumb, changes of temperature.
const id = (s: string) => toMetric(s, 'id')
const th = (s: string) => toMetric(s, 'th')

test('guides: a US tank model is its volume and size; a plain tank its volume', () => {
  expect(vi('bể 20 gallon long')).toBe('bể khoảng 75 lít (76 × 30 × 30 cm)')
  // The sentence compares shapes: every standard tank in it gets its size.
  expect(vi('Lý do là bể nhân giống (breeder) 40 gallon có diện tích mặt nước lớn hơn bể 55 gallon.'))
    .toBe('Lý do là bể nhân giống (breeder) khoảng 150 lít (91 × 46 × 41 cm) có diện tích mặt nước lớn hơn bể khoảng 210 lít (122 × 33 × 53 cm).')
  expect(vi('Bể cao khoảng 75 lít (loại 20 gallon high) là vừa')).toBe('Bể cao khoảng 75 lít (61 × 30 × 41 cm) là vừa')
  expect(vi('Hồ 38 lít (10 gallon) hay hồ 76 lít dáng dài (loại 20 gallon long) thì không dùng được.'))
    .toBe('Hồ 38 lít (51 × 25 × 30 cm) hay hồ 76 lít dáng dài (76 × 30 × 30 cm) thì không dùng được.')
  expect(vi('Bể 20 gallon long: 5 ml cho mỗi 10 gallon nước.')).toBe('Bể khoảng 75 lít (76 × 30 × 30 cm): 5 ml cho mỗi 38 lít nước.') // a dose is no tank
  expect(vi('Endler rất hợp với bể 10 gallon vì nhỏ con')).toBe('Endler rất hợp với bể 38 lít vì nhỏ con')
  expect(vi('ở bể 40 gallon so với bể 55 gallon')).toBe('ở bể 150 lít so với bể 210 lít')
  expect(id('akuarium 20 galon long')).toBe('akuarium sekitar 75 liter (76 × 30 × 30 cm)')
  expect(th('ตู้ 20 แกลลอน long')).toBe('ตู้ ราว 75 ลิตร (76 × 30 × 30 ซม.)')
})

test('guides: a pipe or fitting is the pipe shops sell (outside diameter); a hose or a hole saw its own size', () => {
  expect(vi('Ống dẫn là ống thoát tràn dân dụng cỡ 3/4 inch (khoảng 19 mm), nối bằng keo')).toBe('Ống dẫn là ống thoát tràn dân dụng cỡ phi 27, nối bằng keo')
  expect(vi('ống thoát tràn dân dụng đường kính khoảng 19 mm (3/4 inch), dán')).toBe('ống thoát tràn dân dụng phi 27, dán')
  expect(vi('ống hút vừa khít ống PVC ¾ inch tiêu chuẩn')).toBe('ống hút vừa khít ống PVC phi 27 tiêu chuẩn')
  expect(vi('Ống 3/4 inch có giới hạn')).toBe('Ống phi 27 có giới hạn')
  expect(vi('một đầu nối xuyên vách PVC cỡ nửa inch (khoảng 1,3 cm), rồi')).toBe('một đầu nối xuyên vách PVC cỡ phi 21, rồi')
  expect(vi('một đầu nối có ren đực chuẩn ống vườn 3/4 inch (khoảng 19 mm).')).toBe('một đầu nối có ren đực chuẩn ống vườn phi 27.')
  expect(vi('Một đoạn ngắn ống nhựa mềm đường kính trong 1 inch (khoảng 25 mm) được dùng')).toBe('Một đoạn ngắn ống nhựa mềm đường kính trong 25 mm được dùng')
  expect(vi('Mũi khoét lỗ 1½ inch (khoảng 38 mm) có cỡ vừa khéo')).toBe('Mũi khoét lỗ 38 mm có cỡ vừa khéo')
  expect(id('pipa PVC 3/4 inci')).toBe('pipa PVC 27 mm')
})

test('guides: a change of temperature, and the middle of a decade of °F', () => {
  expect(id('Suhu yang turun sekitar 15 °F dalam satu jam, atau air di bawah sekitar 73 °F, bisa memicu wabah.'))
    .toBe('Suhu yang turun sekitar 8 °C dalam satu jam, atau air di bawah sekitar 23 °C, bisa memicu wabah.')
  expect(id('perubahan tidak lebih dari ±2 °F per hari')).toBe('perubahan tidak lebih dari ±1 °C per hari')
  expect(th('ตั้งฮีตเตอร์ได้สูงกว่าตู้หลักไม่เกิน 9°F แต่')).toBe('ตั้งฮีตเตอร์ได้สูงกว่าตู้หลักไม่เกิน 5°C แต่')
  expect(vi('không để nhiệt độ thay đổi quá 1°F (khoảng 1°C) mỗi giờ.')).toBe('không để nhiệt độ thay đổi quá 1°C mỗi giờ.')
  expect(vi('Một nguồn nói không hạ quá 5°C/9°F trong 24 giờ.')).toBe('Một nguồn nói không hạ quá 5°C trong 24 giờ.')
  expect(vi('chịu được nhiệt độ xuống tới giữa 60 độ F (18°C) và rất dễ nuôi')).toBe('chịu được nhiệt độ xuống tới khoảng 18°C và rất dễ nuôi')
  expect(vi('chịu được nhiệt độ thấp tới giữa 60 độ F.')).toBe('chịu được nhiệt độ thấp tới khoảng 18 độ C.')
  expect(vi('hầu hết chịu được nhiệt độ từ giữa đến cuối 60 độ F (15–20°C).')).toBe('hầu hết chịu được nhiệt độ khoảng 15–20°C.')
  expect(th('ให้เริ่มทำให้น้ำอุ่นขึ้นเมื่ออุณหภูมิลงไปถึงราวกลาง 50 °F')).toBe('ให้เริ่มทำให้น้ำอุ่นขึ้นเมื่ออุณหภูมิลงไปถึงราว 13 °C')
  expect(th('ปลาเขตร้อนส่วนใหญ่ทนน้ำราว 50 ปลาย ๆ ถึง 60 ต้น ๆ °F ได้หลายชั่วโมง')).toBe('ปลาเขตร้อนส่วนใหญ่ทนน้ำราว 14–17 °C ได้หลายชั่วโมง')
  expect(id('tahan suhu di kisaran 60-an °F bawah atau 50-an °F atas selama beberapa jam')).toBe('tahan suhu di kisaran 14–17 °C selama beberapa jam')
  expect(id('Betta liar tahan suhu pertengahan 80-an °F untuk sementara waktu')).toBe('Betta liar tahan suhu sekitar 29 °C untuk sementara waktu')
  // Two sources' figures, not one figure twice: the second is converted, not dropped.
  expect(th('บางแหล่งแนะนำ 32–33 °C หรือ 86–88 °F')).toBe('บางแหล่งแนะนำ 32–33 °C หรือ 30–31 °C')
  expect(vi('Chúng thích nước mát hơn (khoảng 21°C, tức 70°F), nhưng')).toBe('Chúng thích nước mát hơn (khoảng 21°C), nhưng')
})

test('guides: doses per gallon, rules of thumb, flow, rounding', () => {
  expect(vi('2,5 cm cá cho 4,55 lít (1 inch cho mỗi gallon)')).toBe('2,5 cm cá cho 4,55 lít')
  expect(id('25 cm ikan per 455 L (10 inci per 100 galon)')).toBe('25 cm ikan per 455 L')
  expect(th('ปลายาว 1 นิ้วต่อน้ำ 1 แกลลอน (2.5 ซม. ต่อ 4.55 ลิตร) ตู้ปลาเขตร้อน')).toBe('ปลายาว 2.5 ซม. ต่อ 4.55 ลิตร ตู้ปลาเขตร้อน')
  expect(id('(sekitar 5 inci ikan per galon) bisa bertahan')).toBe('(sekitar 13 cm ikan per 3,8 liter) bisa bertahan')
  expect(th('fenbendazole ชนิดน้ำ ครึ่งหยดต่อแกลลอนก็พอ')).toBe('fenbendazole ชนิดน้ำ ครึ่งหยดต่อ 3.8 ลิตรก็พอ')
  expect(vi('Một số người khuyên 1 con cá nhỏ cho mỗi 10 gallon nước, tức khoảng 38 lít.')).toBe('Một số người khuyên 1 con cá nhỏ cho mỗi 38 lít nước.')
  expect(vi('Liều dùng khoảng 450 g cho mỗi 38 L nước (1 lb cho 10 gallon).')).toBe('Liều dùng khoảng 450 g cho mỗi 38 L nước.')
  expect(vi('máy sưởi nên có công suất 5 watt cho mỗi gallon nước (khoảng 1,3 watt mỗi lít).')).toBe('máy sưởi nên có công suất 1,3 watt mỗi lít.')
  expect(vi('tối đa khoảng 13 mg mỗi lít (50 mg mỗi gallon), thì')).toBe('tối đa khoảng 13 mg mỗi lít, thì')
  expect(vi('phân khoáng 80 L, tức khoảng 20 gallon Mỹ.')).toBe('phân khoáng 80 L.')
  expect(id('per 80 L, sekitar 20 galon AS.')).toBe('per 80 L.')
  expect(th('ใช้เกลือไม่เกิน 1 oz ต่อ 1 แกลลอนสหรัฐฯ อาจช่วย')).toBe('ใช้เกลือไม่เกิน 1 oz ต่อ 3.8 ลิตร อาจช่วย')
  expect(vi('cho chai 16,9 oz (~500 mL)')).toBe('cho chai 500 mL')
  expect(vi('Lúc này bơm 5 gallon mất 78 giây, tức 230 GPH (khoảng 870 lít/giờ).')).toBe('Lúc này bơm 19 lít mất 78 giây, tức 870 lít/giờ.')
  expect(vi('mẫu lớn nhất được công bố đạt tới 3000 gallon Mỹ mỗi giờ (khoảng 11.400 lít/giờ).')).toBe('mẫu lớn nhất được công bố đạt tới 11.400 lít/giờ.')
  expect(vi('MJ1200 được định mức 295 gph và 20W.')).toBe('MJ1200 được định mức 1.100 lít/giờ và 20W.')
  expect(th('ตู้ 150 แกลลอนควรใช้ปั๊มอย่างน้อย 600 GPH')).toBe('ตู้ 570 ลิตรควรใช้ปั๊มอย่างน้อย 2,300 ลิตร/ชั่วโมง')
  // A range in the steps of its smallest end; "or" joins two sizes.
  expect(vi('còn đàn đông hơn thì tính 100 đến 500 gallon mỗi con.')).toBe('còn đàn đông hơn thì tính 380 đến 1.890 lít mỗi con.')
  expect(vi('quy tắc cơ bản là 1 inch cá cho 1 đến 2 gallon nước.')).toBe('quy tắc cơ bản là 2,5 cm cá cho 3,8 đến 7,6 lít nước.')
  expect(vi('cần bể tối thiểu 10 hoặc 20 gallon.')).toBe('cần bể tối thiểu 38 hoặc 76 lít.')
})

test('guides: inch and foot marks, numbers in words, sides', () => {
  expect(vi('ở bể cá chạch hề 84” x 27” x 28” (1000 lít/265 gallon) tại nhà.')).toBe('ở bể cá chạch hề 213 x 69 x 71 cm (1000 lít) tại nhà.')
  expect(vi('bể tối thiểu 6’ x 2’ x 2’ (khoảng 180 x 60 x 60 cm) khi trưởng thành')).toBe('bể tối thiểu 180 x 60 x 60 cm khi trưởng thành')
  expect(vi('Bể 5ft x 2ft x 2ft (khoảng 150 x 60 x 60 cm) thực sự')).toBe('Bể 150 x 60 x 60 cm thực sự')
  expect(vi('lý tưởng là khoảng 4 ft × 2 ft.')).toBe('lý tưởng là khoảng 122 × 61 cm.')
  expect(th('ขนาดที่เหมาะคือราว 4 ฟุต × 2 ฟุต')).toBe('ขนาดที่เหมาะคือราว 122 × 61 ซม.')
  expect(vi('trải đá tự nhiên cỡ 1/2" đến 1" (khoảng 1,3 đến 2,5 cm), và')).toBe('trải đá tự nhiên cỡ 1,3 đến 2,5 cm, và')
  expect(vi('một bể nhỏ 30 x 20 cm (12" x 8") mà tôi')).toBe('một bể nhỏ 30 x 20 cm mà tôi')
  expect(vi('đạt tới 30 cm (12”) TL')).toBe('đạt tới 30 cm TL')
  expect(vi('bể dài ít nhất bốn feet (khoảng 1,2 m)')).toBe('bể dài ít nhất 1,2 m')
  expect(vi('con lớn nhất dài mười hai inch (khoảng 30 cm)')).toBe('con lớn nhất dài 30 cm')
  expect(vi('cuối cùng sẽ dài tới bốn foot rưỡi (khoảng 1,4 m).')).toBe('cuối cùng sẽ dài tới 1,4 m.')
  expect(vi('Chúng dài chừng nửa inch (khoảng 1,3 cm), thân')).toBe('Chúng dài chừng 1,3 cm, thân')
  // "Nearly two metres" for six feet: the exact figure, not a rounder one.
  expect(vi('có thể phóng lên cao hơn sáu feet (gần hai mét) khỏi mặt nước')).toBe('có thể phóng lên cao hơn 1,8 m khỏi mặt nước')
  expect(vi('nếu ao sâu ít nhất ba feet để băng')).toBe('nếu ao sâu ít nhất 91 cm để băng')
  expect(vi('Cá koi cái từng lớn hơn 39 inch (1 mét) chiều dài.')).toBe('Cá koi cái từng lớn hơn 1 mét chiều dài.')
  expect(vi('Loài cá này có thể lớn khá to (tới 8 inch TL, khoảng 20 cm)')).toBe('Loài cá này có thể lớn khá to (tới 20 cm TL)')
  expect(vi('Đạt kích thước tối đa 7–8 inch TL (khoảng 18–20 cm), bể lớn')).toBe('Đạt kích thước tối đa 18–20 cm TL, bể lớn')
  expect(vi('một lớp dày vài inch (khoảng 5–8 cm) mà')).toBe('một lớp dày khoảng 5–8 cm mà')
  expect(th('1 ต้นต่อพื้นที่ผิวน้ำ 10 ตารางฟุต')).toBe('1 ต้นต่อพื้นที่ผิวน้ำ 0.9 ตารางเมตร')
  for (const s of ['84” x 27” x 28”', 'kisaran 60-an °F bawah', '600 GPH', '10 ตารางฟุต', 'bốn feet', '50 ปลาย ๆ ถึง 60 ต้น ๆ °F']) expect(imperialLeft(s), s).not.toEqual([])
})

test('guides: quoted labels with their metric, names, weights and figureless units stay as published', () => {
  const left = [
    'Quy tắc “một gallon nước cho một inch cá” (khoảng 3,8 lít nước cho 2,5 cm cá) chỉ là',
    'chờ đợt giảm giá bể "một đô mỗi gallon" (một gallon khoảng 3,8 lít) sắp tới',
    'một nguồn ghi ampicillin "một viên cho 10 gallon" (khoảng 38 lít) trong bể cách ly',
    'bộ Aqueon 10 Gallon LED',
    'số inch cá trên mỗi foot vuông diện tích mặt nước hoặc số inch trên mỗi gallon dung tích bể',
    'Giá: cho chai 8 oz.',
    'Máy xay 0,9 lb thịt nghêu',
    'có thể được bán khi chỉ dài vài inch',
  ]
  for (const s of left) expect(vi(s)).toBe(s)
  expect(imperialLeft(left.join(' '))).toEqual([])
  // A quoted rule with no metric after it is converted whole.
  expect(th('กฎ "1 แกลลอนต่อปลา 1 นิ้ว" เป็นแค่แนวทาง')).toBe('กฎ "3.8 ลิตรต่อปลา 2.5 ซม." เป็นแค่แนวทาง')
})
