import { expect, test } from 'vitest'
import { cardRepeats, dropCardRepeats, dropItems, figuresOffCard, states } from '../src/index'

// Cá neon vua and Cá chạch bùn as aquatome.com had them (design critique 2026-10-31): the card said 3,5 cm, pH 4,6–6,2,
// 23–27 °C; The Spruce Pets' quick facts and Seriously Fish's water text said 5 cm, pH 3,5–7,5, 23–29 °C.
const neon = {
  tempC: [{ source: 'seriouslyfish', value: { min: 23, max: 29 } }, { source: 'sprucepets', value: { min: 23, max: 27 } }],
  ph: [{ source: 'seriouslyfish', value: { min: 3.5, max: 7.5 } }, { source: 'sprucepets', value: { min: 4.6, max: 6.2 } }],
  gh: [{ source: 'seriouslyfish', value: { min: 1, max: 12 } }, { source: 'sprucepets', value: { min: 0, max: 4 } }],
  sizeCm: [{ source: 'seriouslyfish', value: 3.5 }, { source: 'sprucepets', value: 5 }],
  tankCm: [{ source: 'seriouslyfish', value: 60 }, { source: 'sprucepets', value: 75 }],
  difficulty: [{ source: 'seriouslyfish', value: 2 }, { source: 'sprucepets', value: 4 }],
}
const spruceEn = '<ul><li><strong>Family:</strong> Characidae</li><li><strong>Origin:</strong> Brazil, Colombia and Venezuela</li><li><strong>Minimum tank size:</strong> 20 gallons</li><li><strong>Care:</strong> Intermediate</li><li><strong>pH:</strong> 4.6 to 6.2</li><li><strong>Hardness:</strong> Up to 4 dGH</li><li><strong>Temperature:</strong> 23 to 27 °C (73 to 81 °F)</li><li><strong>Adult size:</strong> 2 inches</li><li><strong>Life expectancy:</strong> 4 years</li></ul>'
const spruceVi = '<ul><li><strong>Họ:</strong> Characidae</li><li><strong>Nguồn gốc:</strong> Brazil, Colombia và Venezuela</li><li><strong>Bể tối thiểu:</strong> khoảng 75 lít</li><li><strong>Độ khó:</strong> Trung bình</li><li><strong>pH:</strong> 4,6 đến 6,2</li><li><strong>Độ cứng:</strong> Tối đa 4 dGH</li><li><strong>Nhiệt độ:</strong> 23 đến 27 °C</li><li><strong>Kích thước trưởng thành:</strong> 5 cm</li><li><strong>Tuổi thọ:</strong> 4 năm</li></ul>'

test('quick facts: the items the card carries for that source, and the family, go; the rest stays', () => {
  expect(cardRepeats(spruceEn, 'sprucepets', neon)).toEqual([0, 2, 3, 4, 5, 6, 7])
  expect(dropCardRepeats(spruceEn, spruceVi, 'sprucepets', neon)).toBe(
    '<ul><li><strong>Nguồn gốc:</strong> Brazil, Colombia và Venezuela</li><li><strong>Tuổi thọ:</strong> 4 năm</li></ul>')
  // A figure the card has from another source only is this source's own word: it stays.
  expect(cardRepeats(spruceEn, 'sprucepets', { tempC: neon.tempC.slice(0, 1) })).toEqual([0])
})

test('quick facts: an item that says more than the figure stays', () => {
  const en = '<ul><li>Difficulty: 5 of 8 (moderate); needs a very large tank</li><li>Temperature: 24–29°C; much better coloration above 26°C</li><li>Max size: 150 mm SL (6 in SL)</li><li>Family: Cobitidae</li></ul>'
  expect(cardRepeats(en, 'seriouslyfish', { difficulty: [{ source: 'seriouslyfish', value: 5 }], tempC: [{ source: 'seriouslyfish', value: { min: 24, max: 29 } }], sizeCm: [{ source: 'seriouslyfish', value: 15 }] })).toEqual([2, 3])
  // A line of water figures without a label is the card's too.
  const water = '<ul><li>Origin: China</li><li>pH 6.0-8.0; hardness up to 12 dGH; temperature 4-25 °C (40-77 °F)</li></ul>'
  const card = { ph: [{ source: 'sprucepets', value: { min: 6, max: 8 } }], gh: [{ source: 'sprucepets', value: { min: 0, max: 12 } }], tempC: [{ source: 'sprucepets', value: { min: 4, max: 25 } }] }
  expect(cardRepeats(water, 'sprucepets', card)).toEqual([1])
})

test('a list of nothing but the card goes; a translation whose items don\'t match the English one for one is left alone', () => {
  const en = '<ul><li>Family: Characidae</li><li>Temperature: 20–26°C</li></ul>'
  const card = { tempC: [{ source: 'seriouslyfish', value: { min: 20, max: 26 } }] }
  expect(dropCardRepeats(en, '<ul><li>Họ: Characidae</li><li>Nhiệt độ: 20–26°C</li></ul>', 'seriouslyfish', card)).toBe('')
  expect(dropItems(en, '<ul><li>Họ: Characidae, nhiệt độ 20–26°C</li></ul>', [0, 1])).toBe('<ul><li>Họ: Characidae, nhiệt độ 20–26°C</li></ul>')
  expect(dropItems('<p>Wild caught.</p>', '<p>Cá bắt tự nhiên.</p>', [])).toBe('<p>Cá bắt tự nhiên.</p>')
})

test('states: the figure as each language writes it, with its unit', () => {
  expect(states('<ul><li>Nhiệt độ: 23–29 °C</li></ul>', 'tempC', { min: 23, max: 29 })).toBe(true)
  expect(states('<p>khoảng 23 đến 27 °C</p>', 'tempC', { min: 23, max: 27 })).toBe(true)
  expect(states('<p>Nhiệt độ 23–29 °C, cho đẻ 26,5–29 °C</p>', 'tempC', { min: 26.5, max: 29 })).toBe(true)
  expect(states('<p>23 con, 29 ngày</p>', 'tempC', { min: 23, max: 29 })).toBe(false)
  expect(states('<li>pH: 3,5–7,5, nhưng cá hoang dã…</li>', 'ph', { min: 3.5, max: 7.5 })).toBe(true)
  expect(states('<p>ค่า pH 6.0–8.0</p>', 'ph', { min: 6, max: 8 })).toBe(true)
  expect(states('<p>pH lý tưởng là dưới 6</p>', 'ph', { min: 4.6, max: 6.2 })).toBe(false)
  expect(states('<p>Độ cứng: 1–12 dGH</p>', 'gh', { min: 1, max: 12 })).toBe(true)
  expect(states('<p>Độ cứng tối đa 12 dGH</p>', 'gh', { min: 0, max: 12 })).toBe(true)
  expect(states('<p>Cá trưởng thành có thể dài tới 25 cm</p>', 'sizeCm', 25)).toBe(true)
  expect(states('<p>Bể từ 60 × 30 cm, khoảng 54 lít</p>', 'sizeCm', 30)).toBe(false) // a tank's side, not a fish
  expect(states('<p>Bể từ 60 × 30 cm, khoảng 54 lít</p>', 'tankCm', 60)).toBe(true)
  expect(states('<p>Bể tối thiểu khoảng 75 lít</p>', 'tankCm', 75)).toBe(false) // litres are no length
  expect(states('<p>Max 25 cm</p>', 'sizeCm', 25)).toBe(true)
  expect(states('<p>Độ khó: Trung bình</p>', 'difficulty', 4)).toBe(false)
})

test('figuresOffCard: what a block states that the card shows otherwise, never what it agrees on', () => {
  const water = '<ul><li>Nhiệt độ: 23–29 °C</li><li>pH: 3,5–7,5, nhưng cá hoang dã sống khỏe nhất ở nước có tính axit hơn.</li><li>Độ cứng: 1–12 dGH.</li></ul>'
  expect(figuresOffCard(neon, 'seriouslyfish', water)).toEqual([
    { field: 'tempC', own: { min: 23, max: 29 }, card: { min: 23, max: 27 } },
    { field: 'ph', own: { min: 3.5, max: 7.5 }, card: { min: 4.6, max: 6.2 } },
    { field: 'gh', own: { min: 1, max: 12 }, card: { min: 1, max: 4 } },
  ])
  // The Spruce Pets' range is the card's: nothing to say.
  expect(figuresOffCard(neon, 'sprucepets', '<p>Nhiệt độ có thể dao động trong khoảng 23 đến 27 °C.</p>')).toEqual([])
  // Cá chạch bùn: Loaches Online says 25 cm, the card 30 cm (The Spruce Pets').
  const loach = { sizeCm: [{ source: 'loachesonline', value: 25 }, { source: 'sprucepets', value: 30 }] }
  expect(figuresOffCard(loach, 'loachesonline', '<p>Cá trưởng thành có thể dài tới 25 cm.</p>')).toEqual([{ field: 'sizeCm', own: 25, card: 30 }])
  expect(figuresOffCard(loach, 'glaser', '<p>Dài tới 25 cm.</p>')).toEqual([]) // no figure of its own on the card
})
