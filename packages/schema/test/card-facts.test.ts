import { expect, test } from 'vitest'
import { cardRepeats, dropCardRepeats, dropItems, dropOffItems, figuresOffCard, litresOffCard, shownCard, states, tankIsVolume } from '../src/index'

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
  // The lifespan goes when the card has it from this source: the app's facts card shows the card's.
  expect(cardRepeats(spruceEn, 'sprucepets', { ...neon, lifeYears: [{ source: 'sprucepets', value: { min: 4, max: 4 } }] })).toEqual([0, 2, 3, 4, 5, 6, 7, 8])
  // A figure the card has from another source only is this source's own word: it stays.
  expect(cardRepeats(spruceEn, 'sprucepets', { tempC: neon.tempC.slice(0, 1) })).toEqual([0])
})

test('quick facts: a lifespan the card has from this source goes, as the sources write it; one that says more stays', () => {
  const life = { lifeYears: [{ source: 'seriouslyfish', value: { min: 3, max: 5 } }] }
  const en = '<ul><li>Life span: up to 5 years</li><li><strong>Lifespan:</strong> up to 3 years</li><li>Life expectancy: 3 to 5 years</li><li>Life span: up to 1 year</li><li>Average lifespan: 18 months</li><li>Lifespan: up to 3 years in captivity (2 – 3 years in the wild)</li></ul>'
  expect(cardRepeats(en, 'seriouslyfish', life)).toEqual([0, 1, 2, 3, 4])
  // From another source only, it is this source's own word.
  expect(cardRepeats(en, 'sprucepets', life)).toEqual([])
  // A lifespan's units are a lifespan's only: a size reached in a time says how fast the fish grows.
  expect(cardRepeats('<ul><li>Max size: 5 cm in 2 years</li><li>Adult size: 10 cm in 6 months</li></ul>', 'seriouslyfish', { sizeCm: [{ source: 'seriouslyfish', value: 10 }] })).toEqual([])
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

test('a tank length that the page gives only as a volume is that volume, not a length', () => {
  // The Spruce Pets' discus, aquarium breeder's platy and zebra danio, BW Aquatics' Betta livida, as the engine read them
  // (2026-10-31): the card held 284, 60, 75 and 20 "cm".
  const discus = '<p>Adult Discus need a tank 5 feet (about 150 cm) long, or about 75 gallons (about 284 litres).</p>'
  expect(tankIsVolume(discus, 284)).toBe(true)
  expect(tankIsVolume(discus, 150)).toBe(false)
  expect(tankIsVolume('<li><strong>Minimum tank size:</strong> 15 gallons (~60 litres)</li>', 60)).toBe(true)
  expect(tankIsVolume('<li>Minimum tank size: 20 gallons</li>', 75)).toBe(true)
  expect(tankIsVolume('<p>Recommended 1 pair per 5 gallons (about 19 litres).</p>', 20)).toBe(true)
  // A length the page states stays, whatever the volume beside it.
  expect(tankIsVolume('<p>A tank of 60 cm (54 litres).</p>', 60)).toBe(false)
  expect(tankIsVolume('<p>60 × 30 × 30 cm, about 54 l.</p>', 60)).toBe(false)
  expect(tankIsVolume('<p>At least 60 cm long, or 60 litres.</p>', 60)).toBe(false)
  // No volume: nothing to say.
  expect(tankIsVolume('<p>Keep them in a long tank.</p>', 80)).toBe(false)
  // A tank given only as a volume has no length: a length on the card was made up from it. The Spruce Pets' neon tetra,
  // Siamese fighting fish and molly, BW Aquatics' Macropodus spechti (2026-11-01): the card said 40, 30, 76 and 40 cm.
  expect(tankIsVolume('<li>Minimum tank size: 10 gallons (about 38 litres)</li><li>Diet: omnivore</li>', 40)).toBe(true)
  expect(tankIsVolume('<li>Minimum tank size: 2 gallons (about 8 litres)</li>', 30)).toBe(true)
  expect(tankIsVolume('<li>Minimum tank size: 20 gallons</li><li>Diet: omnivores</li>', 76)).toBe(true)
  expect(tankIsVolume('<p>A pair can be kept together in a 10 to 20-gallon tank (about 40–75 litres).</p>', 40)).toBe(true)
  expect(tankIsVolume('<p>A 100 litre tank.</p>', 80)).toBe(true)
  // A page that gives a length too keeps a figure that isn't one of its volumes.
  expect(tankIsVolume('<p>A 100 litre tank, 80 × 35 cm.</p>', 90)).toBe(false)
  expect(tankIsVolume('<p>Use a 4-foot tank or about 200 litres.</p>', 120)).toBe(false)
  expect(tankIsVolume('<p>An aquarium of at least 48 inches, about 200 litres.</p>', 120)).toBe(false)
})

test('a card figure the engine hid (out of bounds, a tank too short for the fish) is not shown, and stays in the card', () => {
  const card = { sizeCm: [{ source: 'seriouslyfish', value: 90 }], tankCm: [{ source: 'seriouslyfish', value: 150, hidden: 'shorter than twice the fish (90 cm)' }, { source: 'glaser', value: 200 }] }
  expect(shownCard(card, [], () => true)).toEqual({ sizeCm: [{ source: 'seriouslyfish', value: 90 }], tankCm: [{ source: 'glaser', value: 200 }] })
  expect(shownCard({ tankCm: [card.tankCm[0]!] }, [], () => true)).toEqual({})
  expect(card.tankCm).toHaveLength(2)
})

// The betta's and the neon's pages (design critique 2026-11-06): the card said 45 and 60 cm, The Spruce Pets' text 8 and
// 38 litres; Seriously Fish's own volume, beside its tank's base, is that tank's.
const betta = { tankCm: [{ source: 'sprucepets', value: 30, hidden: 'a volume' }, { source: 'seriouslyfish', value: 45 }].filter(v => !v.hidden) }
const neonTank = { tankCm: [{ source: 'seriouslyfish', value: 60 }] }

test('a tank volume that makes a shorter tank than the card is off the card; one beside its tank\'s sides or length is that tank\'s', () => {
  expect(litresOffCard(betta, '<p>Dung tích bể tối thiểu: 8 lít. Việc duy trì nhiệt độ nước phù hợp…</p>')).toEqual([{ field: 'tankL', own: 8, card: 45 }])
  expect(litresOffCard(neonTank, '<p><strong>Kích thước bể tối thiểu:</strong> 38 lít</p>')).toEqual([{ field: 'tankL', own: 38, card: 60 }])
  expect(litresOffCard(betta, '<p>Đáy bể: 45 × 30 cm. Thể tích: khoảng 41 lít.</p>')).toEqual([])
  expect(litresOffCard(neonTank, '<p>Bạn nên dùng bể có đáy từ 60 × 30 cm trở lên (khoảng 54 lít).</p>')).toEqual([])
  expect(litresOffCard({ tankCm: [{ source: 'seriouslyfish', value: 120 }] }, '<p>Đáy 120 × 30 cm (khoảng 108 lít).</p>')).toEqual([])
  expect(litresOffCard(neonTank, '<p>Bể dài 60 cm, khoảng 40 lít.</p>')).toEqual([])
  // Enough volume, a rate, a thousand litres, the other languages, a range by its low end; no minimum on the card.
  expect(litresOffCard(neonTank, '<p>Bể 54 lít trở lên; lọc 300 lít/giờ; hồ 1.000 lít.</p>')).toEqual([])
  expect(litresOffCard(neonTank, '<p>Akuarium minimal 38 liter.</p><p>ตู้ขนาด 20 ลิตรขึ้นไป</p><p>Bể 30–40 L.</p>')).toEqual([
    { field: 'tankL', own: 38, card: 60 }, { field: 'tankL', own: 20, card: 60 }, { field: 'tankL', own: { min: 30, max: 40 }, card: 60 }])
  expect(litresOffCard({}, '<p>8 lít</p>')).toEqual([])
})

test('a quick-facts line off the card goes; the rest of the block stays', () => {
  const facts = '<ul><li><strong>Tuổi thọ:</strong> 5 đến 10 năm</li><li><strong>Kích thước bể tối thiểu:</strong> 38 lít</li><li><strong>Nhiệt độ:</strong> 20 đến 26 °C</li></ul><p>Cá hiền.</p>'
  const card = { ...neonTank, tempC: [{ source: 'seriouslyfish', value: { min: 20, max: 26 } }, { source: 'sprucepets', value: { min: 20, max: 28 } }] }
  expect(dropOffItems(card, 'sprucepets', facts)).toBe('<ul><li><strong>Tuổi thọ:</strong> 5 đến 10 năm</li><li><strong>Nhiệt độ:</strong> 20 đến 26 °C</li></ul><p>Cá hiền.</p>')
  // A line stating this source's own figure where the card shows another: off too.
  expect(dropOffItems(card, 'sprucepets', '<ul><li>Nhiệt độ: 20 đến 28 °C</li></ul>')).toBe('')
  expect(dropOffItems(card, 'sprucepets', '<ul><li>Hiền.</li></ul>')).toBe('<ul><li>Hiền.</li></ul>')
})
