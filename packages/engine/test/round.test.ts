import { expect, test } from 'vitest'
import { roundConverted, roundPage } from '../src/round'

const vi = (s: string) => roundConverted(s, 'vi')

test('a tank in litres only a gallon conversion gives is the size a keeper here names', () => {
  expect(vi('Kích thước bể tối thiểu: 38 lít')).toBe('Kích thước bể tối thiểu: 40 lít')
  expect(vi('Bể 208 lít là một trong những cỡ bể đáng chơi nhất.')).toBe('Bể 200 lít là một trong những cỡ bể đáng chơi nhất.')
  expect(vi('Thể tích: khoảng 681 lít.')).toBe('Thể tích: khoảng 700 lít.')
  expect(vi('<li><strong>Bể tối thiểu:</strong> 76 lít</li>')).toBe('<li><strong>Bể tối thiểu:</strong> 80 lít</li>')
  expect(roundConverted('ตู้ 57 ลิตร', 'th')).toBe('ตู้ 60 ลิตร')
  expect(roundConverted('Minimal 114 L.', 'id')).toBe('Minimal 120 L.')
})

test('never past the source: a figure that would move more than 7%, a dose and other litres stay', () => {
  expect(vi('bể khoảng 110 lít')).toBe('bể khoảng 110 lít') // as far from 100 as from 120
  expect(vi('1 gói cho mỗi 38 lít nước')).toBe('1 gói cho mỗi 38 lít nước') // the label's dose
  expect(roundConverted('1 sachet per 38 liter', 'id')).toBe('1 sachet per 38 liter')
  expect(vi('Bể 54 lít, thay 25% nước')).toBe('Bể 54 lít, thay 25% nước')
})

test('a range keeps both ends, and is one figure only when both ends are one tank', () => {
  expect(vi('bể 57–76 lít')).toBe('bể 60–80 lít')
  expect(vi('bể khoảng 210 hoặc 285 lít')).toBe('bể khoảng 200 hoặc 300 lít')
  expect(vi('Bể 100–114 lít')).toBe('Bể 100–120 lít')
  expect(vi('Bể 208–210 lít')).toBe('Bể 200 lít') // a 55-gallon tank, converted two ways
  expect(vi('Bể 189–208 lít')).toBe('Bể 190–210 lít') // 50 and 55 gallons: a real difference, kept
})

test("a tank's sides and length in inches or feet are rounded; a fish's length stays", () => {
  expect(vi('Đáy bể: 183 × 61 cm.')).toBe('Đáy bể: 180 × 60 cm.')
  expect(vi('Bể 91 × 46 × 41 cm, tức khoảng 150 lít')).toBe('Bể 90 × 45 × 40 cm, tức khoảng 150 lít')
  expect(vi('bể 120 × 30 × 30 cm')).toBe('bể 120 × 30 × 30 cm')
  expect(vi('Khi cá còn non, bể cần dài ít nhất 91 cm.')).toBe('Khi cá còn non, bể cần dài ít nhất 90 cm.')
  expect(vi('Cá trưởng thành dài 61 cm.')).toBe('Cá trưởng thành dài 61 cm.')
})

test('°C that a whole °F gives is whole degrees; a measured figure and a half degree stay', () => {
  expect(vi('Nhiệt độ: 22,8 đến 27,8 °C')).toBe('Nhiệt độ: 23 đến 28 °C') // 73 to 82 °F
  expect(roundConverted('อุณหภูมิ 22.8–27.8 °C', 'th')).toBe('อุณหภูมิ 23–28 °C')
  expect(vi('nhiệt độ 29,3 °C')).toBe('nhiệt độ 29,3 °C') // 84.7 °F: measured, not converted
  expect(vi('24,5–26 °C')).toBe('24,5–26 °C')
  expect(vi('22,8–23,3 °C')).toBe('22,8–23,3 °C') // would meet at 23: left as written
  expect(vi('pH 6,5–7,5, 24–28 °C')).toBe('pH 6,5–7,5, 24–28 °C')
})

test("a page's text is rounded, its reference lists aren't, and a second pass changes nothing", () => {
  const page = { sections: { 'quickFacts:seriouslyfish': '<li>Bể: 38 lít</li>', 'references:seriouslyfish': '<p>Tank 38 l.</p>' }, body: '<p>Bể 76 lít.</p>', summary: ['22,8 °C'], faq: [{ q: 'Bể 19 lít?', a: '57 lít.' }] }
  const once = roundPage(page, 'vi')
  expect(once).toEqual({ sections: { 'quickFacts:seriouslyfish': '<li>Bể: 40 lít</li>', 'references:seriouslyfish': '<p>Tank 38 l.</p>' }, body: '<p>Bể 80 lít.</p>', summary: ['23 °C'], faq: [{ q: 'Bể 20 lít?', a: '60 lít.' }] })
  expect(roundPage(once, 'vi')).toEqual(once)
})
