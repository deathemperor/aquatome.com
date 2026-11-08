import { expect, test } from 'vitest'
import { hedgesLost } from '../src/hedges'

test('the hedge check holds the reviewer to both texts', () => {
  const facts = 'Fish can catch bacteria in shipping.\nUse 3 ml per 4 litres.'
  const page = 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn. Bình thường cá vẫn khỏe. Dùng 3 ml cho 4 lít.'
  expect(hedgesLost([{ from: 'Fish can catch bacteria in shipping.', to: 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn.' }], facts, page)).toHaveLength(1)
  // Not in what it was written from, not a sentence in the text, a sentence with no hedge, or "bình thường" taken for "thường": nothing.
  expect(hedgesLost([
    { from: 'Fish may catch bacteria at home.', to: 'Trên đường vận chuyển cá nào cũng nhiễm khuẩn.' },
    { from: 'Fish can catch bacteria in shipping.', to: 'Cá nào cũng bệnh.' },
    { from: 'Use 3 ml per 4 litres.', to: 'Dùng 3 ml cho 4 lít.' },
    { from: 'Fish can catch bacteria in shipping.', to: '' },
  ], facts, page)).toEqual([])
  expect(hedgesLost([{ from: 'Fish can catch bacteria in shipping.', to: 'Bình thường cá vẫn khỏe.' }], facts, page)).toHaveLength(1)
  expect(hedgesLost([{ from: 'Fish can catch bacteria in shipping.', to: 'Trên đường vận chuyển cá có thể nhiễm khuẩn.' }], facts, 'Trên đường vận chuyển cá có thể nhiễm khuẩn.')).toEqual([])
  // "Bất thường" is "abnormal", not "often"; "đôi lúc" is "sometimes".
  expect(hedgesLost([{ from: 'Infected fish may swim erratically.', to: 'Cá nhiễm bệnh bơi bất thường.' }], 'Infected fish may swim erratically.', 'Cá nhiễm bệnh bơi bất thường.')).toHaveLength(1)
  expect(hedgesLost([{ from: 'Fungus can come back.', to: 'Đôi lúc nấm quay lại.' }], 'Fungus can come back.', 'Đôi lúc nấm quay lại.')).toEqual([])
  // A fact said twice, hedged in the body and hardened in the summary: the summary's sentence is found.
  const twice = 'Cá bị nấm thì thường có vết thương hở. Nấm chỉ mọc trên vết thương hở.'
  const fact = 'A lot of times fungus means an open wound.'
  expect(hedgesLost([{ from: fact, to: 'Cá bị nấm thì thường có vết thương hở.' }, { from: fact, to: 'Nấm chỉ mọc trên vết thương hở.' }], fact, twice)).toEqual([{ from: fact, to: 'Nấm chỉ mọc trên vết thương hở.' }])
  // "Hay" before a verb is "often".
  expect(hedgesLost([{ from: 'People often get hung up on it.', to: 'Nhiều người hay vướng ở chỗ này.' }], 'People often get hung up on it.', 'Nhiều người hay vướng ở chỗ này.')).toEqual([])
})

test('a Vietnamese part rewritten: its own hedges are held, through its markup', () => {
  const before = '<p>Cá <strong>có thể</strong> nhảy khỏi bể.</p><p>Cá ăn rêu.</p>'
  const after = '<p><strong>Cá</strong> nhảy khỏi bể.</p><p>Cá ăn rêu.</p>'
  expect(hedgesLost([{ from: 'Cá có thể nhảy khỏi bể.', to: 'Cá nhảy khỏi bể.' }], before, after)).toHaveLength(1)
  expect(hedgesLost([{ from: 'Cá ăn rêu.', to: 'Cá ăn rêu.' }], before, after)).toEqual([])
})

test('what a reviewer quotes is found as it would read it, and a hedge is read in its own language', () => {
  // "<40 … >30" is a figure, not a tag: the hedged fact between them is still found.
  const facts = 'Keep nitrate <40 ppm.\nIch may come back after treatment.\nRaise the heat to >30°C.'
  expect(hedgesLost([{ from: 'Ich may come back after treatment.', to: 'Ich sẽ quay lại sau khi chữa.' }], facts, 'Ich sẽ quay lại sau khi chữa.')).toHaveLength(1)
  // An inline tag leaves nothing before its comma, and entities are read.
  expect(hedgesLost([{ from: 'It may be sold as C. punctatus, a similar fish.', to: 'Cá được bán dưới tên C. punctatus, một loài giống nó.' }], 'It <em>may</em> be sold as <em>C. punctatus</em>, a similar fish.', '<p>Cá được bán dưới tên <em>C. punctatus</em>, một loài giống nó.</p>')).toHaveLength(1)
  expect(hedgesLost([{ from: 'Fish may live <2 years.', to: 'Cá sống (<2 năm).' }], '<p>Fish may live &lt;2 years.</p>', '<p>Cá sống (&lt;2 năm).</p>')).toHaveLength(1)
  // The style rewrite's own words keep a hedge: "phần lớn" → "chủ yếu"; "hay" for "or" is no hedge to lose, "hay bị" is.
  const part = (from: string, to: string) => hedgesLost([{ from, to }], `<p>${from}</p>`, `<p>${to}</p>`)
  expect(part('Phần lớn thời gian cá ở tầng đáy.', 'Cá chủ yếu ở tầng đáy.')).toEqual([])
  expect(part('Cho ăn trùn huyết hay artemia.', 'Cho ăn trùn huyết hoặc artemia.')).toEqual([])
  expect(part('Cá hay bị nấm.', 'Cá bị nấm.')).toHaveLength(1)
  // "Can thiệp" and "may mắn" are Vietnamese words, not "can" and "may".
  expect(part('Đừng can thiệp vào bể, may mắn là cá khỏe.', 'Để yên bể, cá khỏe.')).toEqual([])
})
