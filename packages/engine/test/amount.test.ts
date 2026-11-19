import { expect, test } from 'vitest'
import { amounts, holdsAmount } from '../src/amount'
import { DOSE_WORDS, NUMBER_WORDS, SIZE_UNIT } from '../src/video-mend'

test('an amount is a figure, a number in words, a half or a few, a spoon or a cap, a unit, or a count of time, standing alone', () => {
  for (const s of [
    'Châm 5 ml.', 'Bể ½ lít.', 'Bể ⅜ nắp.', 'Thể tích 2 m³.', 'Thay 30% nước.', 'Nước 26°.',
    'Châm hai nắp.', 'Ba con cá.', 'Bể mười lít.', 'Hai mươi mốt ngày.', 'Bể trăm lít.', 'Two drops.',
    'Châm nửa nắp.', 'Một lít rưỡi.', 'Thả vài con.', 'Dăm hôm nữa.', 'Mấy con cá.', 'Bẻ đôi bông gòn.', 'Một cặp cá.', 'Lớn gấp đôi.', 'Half a cap.',
    'Một thìa muối.', 'Một muỗng.', 'Một nắp.', 'Một giọt.', 'Một viên.', 'Một gói.', 'Một nắm thức ăn.', 'Một nhúm muối.', 'Một liều.', 'Two capfuls.', 'A teaspoon.',
    'Đèn 20 W.', 'Bể dài mét rưỡi.', 'Nhiệt độ ổn.', 'Độ cứng dGH.', 'Đèn 6500 K.', 'Bể vài gallon.',
    'Chờ một tuần.', 'Một tháng sau.', 'Sau một đêm.', 'Hôm sau thay nước.', 'Một buổi.', 'Mỗi ngày.', 'Một lần.', 'Ba tiếng.',
    // A container, a weight in speech, a little (the measure words "một" could carry past the list).
    'Một xô nước.', 'Một bát.', 'Một ống tiêm.', 'Một bình nước.', 'Một vốc sỏi.', 'Một ký muối.', 'Một lạng.', 'Một tấc.',
    'Một chút muối.', 'Một xíu.', 'Fifty litres.', 'A cup.',
  ]) expect(holdsAmount(s), s).toBe(true)
})

// Codex's seventh read of #1690: a number a reader sees, however it's written. A full-width or circled digit, a Roman
// numeral, a word with a character in it that shows nothing, a number word in Indonesian or Thai, a letter from another
// alphabet that looks like a Latin one.
test('a number is one however it is written: in any script, behind a character that shows nothing, or in Indonesian', () => {
  for (const s of ['Thả １ con cá đực.', 'Thả ２ con.', 'Thả ① con.', 'Chương Ⅻ.', 'Thả h\u00ADai con cá đực.', 'Thả h\u200Bai con.', 'Thả ha\uFE0Fi con.',
    'Thả ｈａｉ con.', 'Số cá đực là dua ekor.', 'Thả tiga ekor.', 'Setengah sendok.', 'Thả สาม con.', 'Thả 三 con.', 'Thả hаi con.' /* a Cyrillic а */]) {
    expect(holdsAmount(s), JSON.stringify(s)).toBe(true)
  }
  // Vietnamese letters are Latin ones.
  for (const s of ['Đặt bể gần cửa sổ.', 'Ưu tiên cây dễ trồng.', 'Rêu Java bám lũa.']) expect(holdsAmount(s), s).toBe(false)
  for (const s of ['Cây mọc khỏe.', 'Đặt bể gần cửa sổ.', 'Dùng phân nền cho cây.', 'Lọc treo dễ vệ sinh.', 'Ít cá thì nước sạch hơn.', 'Nhiều cây thì đẹp.']) expect(holdsAmount(s), s).toBe(false)
})

// Codex's seventh read of #1690: "một" is a count of one ("chỉ thả đúng một con cá đực" became "mỗi nhóm…"), so it is
// on the list, though it is the article "a" too (the chief of staff, 19 Nov 2026: Friday ships on the wide list, and the
// carve-out waits for Monday's change).
test('"một" is an amount, alone or beside any word', () => {
  for (const s of ['Chỉ thả đúng một con cá đực.', 'Một cách là tỉa mỗi cụm.', 'Một thìa muối.', 'Một tuần sau.']) expect(holdsAmount(s), s).toBe(true)
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

test('a chemical name\'s digits are figures, however they are written', () => {
  for (const s of ['Bể cần CO2.', 'NO3 thấp.', 'CO₂ châm đều.', 'Kiểm tra NO２.', 'NH₄ cao.']) expect(holdsAmount(s), s).toBe(true)
  // In words, a chemical's name holds no amount: changing it is a fact the review reads, like any other word.
  expect(holdsAmount('Kiểm tra nitrat và amoniac.')).toBe(false)
})

/** A pattern's words, as the mend's own patterns write them ("litres?", "inch(?:es)?"). */
const expand = (alts: string) => alts.replace(/^\(\?:|\)$/g, '').split('|').flatMap(w => {
  const m = /^(.*)\(\?:(\w+)\)\?$/.exec(w)
  if (m) return [m[1]!, m[1]! + m[2]!]
  return w.endsWith('?') ? [w.slice(0, -2), w.slice(0, -1)] : [w]
})

test('every word the mend\'s own dose, size and number patterns know is on the list, but the bare "một"', () => {
  const known = [SIZE_UNIT, DOSE_WORDS, NUMBER_WORDS].flatMap(expand)
  expect(known).toContain('inches')
  expect(known).toContain('litres')
  for (const w of known.filter(w => w !== 'một')) expect(holdsAmount(w), w).toBe(true)
})
