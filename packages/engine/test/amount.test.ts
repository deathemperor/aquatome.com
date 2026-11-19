import { expect, test } from 'vitest'
import { amounts, chemicals, holdsAmount } from '../src/amount'

test('an amount is a figure, a number in words, a half or a few, a spoon or a cap, a unit, or a count of time, standing alone', () => {
  for (const s of [
    'Châm 5 ml.', 'Bể ½ lít.', 'Bể ⅜ nắp.', 'Thể tích 2 m³.', 'Thay 30% nước.', 'Nước 26°.',
    'Châm hai nắp.', 'Ba con cá.', 'Bể mười lít.', 'Hai mươi mốt ngày.', 'Bể trăm lít.', 'Two drops.',
    'Châm nửa nắp.', 'Một lít rưỡi.', 'Thả vài con.', 'Dăm hôm nữa.', 'Mấy con cá.', 'Bẻ đôi bông gòn.', 'Một cặp cá.', 'Lớn gấp đôi.', 'Half a cap.',
    'Một thìa muối.', 'Một muỗng.', 'Một nắp.', 'Một giọt.', 'Một viên.', 'Một gói.', 'Một nắm thức ăn.', 'Một nhúm muối.', 'Một liều.', 'Two capfuls.', 'A teaspoon.',
    'Đèn 20 W.', 'Bể dài mét rưỡi.', 'Nhiệt độ ổn.', 'Độ cứng dGH.', 'Đèn 6500 K.', 'Bể vài gallon.',
    'Chờ một tuần.', 'Một tháng sau.', 'Sau một đêm.', 'Hôm sau thay nước.', 'Một buổi.', 'Mỗi ngày.', 'Một lần.', 'Ba tiếng.',
  ]) expect(holdsAmount(s), s).toBe(true)
  for (const s of ['Cây mọc khỏe.', 'Đặt bể gần cửa sổ.', 'Dùng phân nền cho cây.', 'Lọc treo dễ vệ sinh.', 'Ít cá thì nước sạch hơn.', 'Nhiều cây thì đẹp.']) expect(holdsAmount(s), s).toBe(false)
})

// The chief of staff, 19 Nov 2026: the bare "một" is the article "a" too ("một cách là…", the hedge the reviews ask
// for); only it is carved out. Beside any word on the list it's still an amount.
test('the bare "một" alone is no amount; beside any word on the list it is', () => {
  for (const s of ['Một cách là tỉa mỗi cụm.', 'Trải một lớp phân nền.', 'Một bể thủy sinh mới set.', 'Một loại Rotala.']) expect(amounts(s), s).toEqual([])
  for (const s of ['Một thìa muối.', 'Một nắm thức ăn.', 'Một tuần sau.', 'Một nửa.', 'Một phần tư nắp.']) expect(holdsAmount(s), s).toBe(true)
})

test('every real amount the reviews of the ten named, and every dose case the six reads found, is held, and none by "một" alone', () => {
  const held = [
    // The eleven real amounts in the sentences the ten guides' notes name.
    'Muốn bể guppy mới có thêm vài điểm đỏ cho có chi tiết ở tiền cảnh thì không cần mua cây mới.',
    'Sau vài ngày, Lilaeopsis brasiliensis và Sagittaria lùn đã bắt đầu bò ngó.',
    'Một bể 120 cm dùng khoảng 25 kg.',
    'Với bể 120 cm, đàn đầu tiên có thể là khoảng 10 con cá tetra silvertip, loài bơi đàn đẹp.',
    'Treo đèn cách mặt bể khoảng 30 cm là một cách giữ đèn vừa phải, ít bị rêu hại.',
    'Trong 5 con này, con thanh ngọc lùn trước đó từng được để riêng.',
    'Ví dụ, đợt đầu có thể thả 5 con: 1 con cá endler cái, 1 con endler đực, 2 con cá medaka.',
    'Sau 6 tháng, đám cây trên bể lớn gấp đôi, gần chạm trần nhà.',
    'Bể và các bể ươm cây bên dưới đều dùng đèn pha LED 6500 K, ánh sáng trắng như ban ngày.',
    'Một cách cho ăn gọn là thả một nắm thức ăn xuống nước ngay chỗ đầu thổi luồng.',
    'Lấy cây ra khỏi chậu, bẻ đôi bông gòn trồng cây rồi dùng nhíp cạo sạch phần còn lại.',
    // The dose and amount cases of the six reads: the quarter cap, the two capfuls, the teaspoon, the half ounce, 5 ml,
    // the 60 and the 38 litres.
    'Theo video, châm một phần tư nắp vi sinh.', 'Châm 2 capfuls API Quick Start sau khi thay nước.',
    'Trong video, hòa một thìa cà phê muối vào nước.', 'Bể này dùng 4 thìa muối (½ oz).',
    'Bể này đã châm 4 nắp vi sinh; khi thay nước, cứ châm 5 ml vi sinh.', 'Trong video, dùng bể 10 gallon hoặc bể 60 lít có vách ngăn.',
    'Châm 1 ml khi thay đúng 38 lít nước', 'Châm ⅜ nắp Seachem Prime cho mỗi 50 lít.', 'Châm hai nắp Seachem Prime cho mỗi 50 lít.',
  ]
  for (const s of held) {
    expect(holdsAmount(s), s).toBe(true)
    // Held without "một": what holds it is on the list beside it, or a figure.
    expect(amounts(s).some(w => w.toLowerCase() !== 'một'), s).toBe(true)
  }
})

test('a chemical name\'s digits are no amount; the name is counted apart, exactly, and another chemical\'s digits are an amount', () => {
  expect(amounts('Bể cần CO2 và NO3 thấp.')).toEqual([])
  expect(amounts('CO₂ châm đều.')).toEqual([])
  expect(chemicals('NO3 cao, NO3 thấp, NH₄ và co2.')).toEqual(['no3', 'no3', 'nh4', 'co2'])
  // Not on the list: its digits are figures.
  expect(holdsAmount('Đường C6H12O6.')).toBe(true)
  // A figure beside a chemical is still an amount.
  expect(holdsAmount('NO3 dưới 20 ppm.')).toBe(true)
})
