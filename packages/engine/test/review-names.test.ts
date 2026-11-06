import { expect, test } from 'vitest'
import { fixNames, isName } from '../src/review-names'

const TITLE = 'Review đèn Chihiros WRGB 2 và so sánh với đèn Nala - Thủy Sinh 4U'
const CATALOG = 'Chihiros WRGB II Chihiros WRGB II Slim Chihiros Commander 4 Twinstar Hygger ADA Sunsun HBL-802'

test('a name the captions misheard takes the spelling in the video\'s title', () => {
  const r = fixNames('So với đèn Nana, một bài review thấy đèn này hơi ngả vàng. Đèn Nana cũng đẹp hơn.', [TITLE, CATALOG, ''])
  expect(r.text).toBe('So với đèn Nala, một bài review thấy đèn này hơi ngả vàng. Đèn Nala cũng đẹp hơn.')
  expect(r.renamed).toEqual(['Nana → Nala', 'Nana → Nala'])
  expect(r.unknown).toEqual([])
})

test('a name that matches nothing is reported, and the text keeps it', () => {
  const r = fixNames('Một bài review so với đèn Zorblax.', [TITLE, CATALOG, 'Thanks for watching'])
  expect(r.unknown).toEqual(['Zorblax'])
  expect(r.text).toBe('Một bài review so với đèn Zorblax.')
  expect(r.renamed).toEqual([])
})

test('a spelling our sources hold stands, in any case, from the title, the catalog or the description', () => {
  for (const name of ['Chihiros', 'CHIHIROS', 'WRGB II', 'WRGB 2', 'WRGB2', 'Commander 4', 'HBL-802', 'Hygger', 'Fluval']) {
    const r = fixNames(`Đèn ${name} sáng.`, [TITLE, CATALOG, 'Compared with a Fluval Plant 3.0'])
    expect(r, name).toEqual({ text: `Đèn ${name} sáng.`, unknown: [], renamed: [] })
  }
})

test('the same letters with other marks take our spelling', () => {
  expect(fixNames('Đèn Chihirós sáng.', [TITLE, CATALOG, '']).text).toBe('Đèn Chihiros sáng.')
  expect(fixNames('Lọc Súnsun êm.', ['', CATALOG, '']).text).toBe('Lọc Sunsun êm.')
})

test('near-misses by length: long names have more letters to spare than short ones', () => {
  expect(fixNames('Đèn Twynstor đẹp.', ['', CATALOG, '']).text).toBe('Đèn Twinstar đẹp.') // 2 letters off, in 8
  expect(fixNames('Đèn Twynstorr đẹp.', ['', CATALOG, '']).unknown).toEqual(['Twynstorr']) // 3
  expect(fixNames('Đèn Nala đẹp, Nalaa nữa.', ['', 'Nala', '']).text).toBe('Đèn Nala đẹp, Nala nữa.') // 1, in 5
  expect(fixNames('Đèn Naloo đẹp.', ['', 'Nala', '']).unknown).toEqual(['Naloo']) // 2, in 5
  expect(fixNames('Đất ADB tốt.', ['', CATALOG, '']).unknown).toEqual(['ADB']) // 3 letters: exact only
})

test('a rewrite never guesses: a wrong first letter, or two spellings just as close', () => {
  expect(fixNames('Đèn Bigger đẹp.', ['', CATALOG, '']).unknown).toEqual(['Bigger']) // 2 from Hygger
  expect(fixNames('Đèn Nana đẹp.', ['Nala Nara', CATALOG, '']).unknown).toEqual(['Nana'])
})

test('the closer source wins: a title over the catalog, the catalog over a description', () => {
  expect(fixNames('Đèn Nana đẹp.', ['Nala', 'Nara', 'Nava']).text).toBe('Đèn Nala đẹp.')
  expect(fixNames('Đèn Nana đẹp.', ['', 'Nara', 'Nava']).text).toBe('Đèn Nara đẹp.')
  expect(fixNames('Đèn Nana đẹp.', ['', '', 'Nava']).text).toBe('Đèn Nava đẹp.')
})

test('a different number is a different product, never a slip', () => {
  expect(fixNames('Đèn WRGB 3 sáng hơn.', [TITLE, CATALOG, '']).unknown).toEqual(['WRGB 3'])
  expect(fixNames('Đèn WRGB III sáng hơn.', [TITLE, CATALOG, '']).unknown).toEqual(['WRGB III'])
  expect(fixNames('Đèn Commander 5 sáng hơn.', [TITLE, CATALOG, '']).unknown).toEqual(['Commander 5'])
  expect(fixNames('Lọc HBL-803 êm.', [TITLE, CATALOG, '']).unknown).toEqual(['HBL-803'])
  // A figure after a name isn't a model.
  expect(fixNames('Đèn Chihiros 60 cm sáng.', [TITLE, CATALOG, '']).unknown).toEqual([])
})

test('Vietnamese words, places and everyday kit words aren\'t product names', () => {
  const text = 'Cả ba bài review đều thích đèn. Khi bật, Theo đó Một bài ở Việt Nam, Trung Quốc và Anh chạy LED RGB qua Bluetooth, ứng dụng trên iPhone, Wi-Fi. Đo CO2, pH, GH, UV, 6500K, 50W, IP67. Review này giá 100 USD, ở Sài Gòn, Hà Nội.'
  expect(fixNames(text, ['', '', ''])).toEqual({ text, unknown: [], renamed: [] })
})

test('a plant or fish isn\'t a product: "Anubias Nana" beside a Nala light stays what it is', () => {
  const genera = new Set(['anubias', 'rotala'])
  for (const text of ['Đèn nuôi tốt Anubias Nana.', 'Đèn nuôi tốt cây Anubias Nana.', 'Đèn nuôi tốt cây Nana và Rotala.', 'Hợp với cá Oscar, tép Amano, rêu Java.', 'Hợp với cây Monte Carlo.']) {
    expect(fixNames(text, [TITLE, CATALOG, ''], genera), text).toEqual({ text, unknown: [], renamed: [] })
  }
  // Still a light when it isn't one of those.
  expect(fixNames('Đèn Nana sáng hơn, và Nana đắt hơn.', [TITLE, CATALOG, ''], genera).text).toBe('Đèn Nala sáng hơn, và Nala đắt hơn.')
  expect(fixNames('Cây sống tốt, đèn Zorblax thì không.', [TITLE, CATALOG, ''], genera).unknown).toEqual(['Zorblax'])
})

test('what counts as a name', () => {
  for (const w of ['Nana', 'Chihiros', 'WRGB', 'ADA', 'JBL', 'L600', 'Weld-On', 'AquaClear']) expect(isName(w), w).toBe(true)
  for (const w of ['nana', 'Một', 'Cả', 'Nguyễn', 'Khuyên', 'LED', 'A', '4U', '50W', 'II']) expect(isName(w), w).toBe(false)
})

test('the real run\'s page text: only the misheard name changes', () => {
  const lines = [
    'Cả ba bài review đều thích phần thân đèn bằng kim loại. Đèn chắc chắn, không có cảm giác rẻ tiền hay ọp ẹp.',
    'Hai bài review cùng thấy mỗi bóng LED gộp ba màu đỏ, xanh lá và xanh dương vào một chip. Một bài còn nhận xét là tên có chữ WRGB nhưng đèn chỉ dùng RGB.',
    'Một bài review khác thấy đèn đắt hơn nhiều so với đèn giá rẻ, chỉ đáng tiền cho bể trưng bày, còn người mới thì nên bắt đầu với đèn rẻ rồi nâng cấp sau.',
    'AquaTome thử trên Chihiros WRGB II Slim, firmware 24 thấy mất điện là đồng hồ của đèn về 0, mà lịch đã lưu lại chạy theo đồng hồ này.',
  ]
  for (const l of lines) expect(fixNames(l, [TITLE, CATALOG, ''])).toEqual({ text: l, unknown: [], renamed: [] })
  expect(fixNames('Hai bài review khác có chỗ chưa ưng, một bài thấy bao bì và thiết kế kém chỉn chu hơn đèn Nana.', [TITLE, CATALOG, '']).renamed).toEqual(['Nana → Nala'])
})
