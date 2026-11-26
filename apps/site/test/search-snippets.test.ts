import { expect, test } from 'vitest'
import { LANGS } from '@aq/schema/langs'
import { descriptionForSearch, guideDescription, plantTitle, speciesTitle } from '../src/lib/meta'

test('long fish and plant titles keep both names before the care topics', () => {
  for (const lang of LANGS) {
    const fish = speciesTitle(lang, 'Botia kerdil bergaris', 'Ambastaia sidthimunki')
    const plant = plantTitle(lang, 'Bucephalandra Mini Melawi', 'Bucephalandra pygmaea')
    for (const [title, common, sci] of [[fish, 'Botia kerdil bergaris', 'Ambastaia sidthimunki'], [plant, 'Bucephalandra Mini Melawi', 'Bucephalandra pygmaea']] as const) {
      expect([...title].length, title).toBeLessThanOrEqual(70)
      expect(title.toLocaleLowerCase(lang)).toContain(common.toLocaleLowerCase(lang))
      expect(title).toContain(sci)
    }
  }
  expect(speciesTitle('vi', 'Cá neon vua', 'Paracheirodon axelrodi')).toBe('Cách nuôi cá neon vua (Paracheirodon axelrodi): bể, nước, nuôi chung')
})

test('descriptions keep complete sentences and cut Thai at a word boundary when necessary', () => {
  const sentence = 'Khi nuôi cá theo đàn, hãy chọn bể có nước sạch và đủ khoảng trống để cả đàn cá bơi cùng nhau.'
  expect(descriptionForSearch('vi', sentence + ' ' + 'Các loại thức ăn cá có thể tìm trong bể '.repeat(8))).toBe(sentence)
  const thai = 'ปลาชนิดนี้ชอบน้ำสะอาดและมีพื้นที่ว่ายน้ำ'
  const clipped = descriptionForSearch('th', thai.repeat(12), 32)
  const ends = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(thai)].map(s => s.index + s.segment.length)
  expect(clipped.length).toBeGreaterThan(0)
  expect([...clipped].length).toBeLessThanOrEqual(32)
  expect(ends).toContain(clipped.length)
})

test('guide descriptions keep the full opening paragraph for search and shorten the public snippet', () => {
  const first = 'Bể cần nước sạch và đủ chỗ để cá bơi, đặc biệt khi thả nhiều con và nuôi chúng theo đàn.'
  const paragraph = `${first} ${'Trong bể có thể trồng nhiều cây thủy sinh '.repeat(6).trimEnd()}`
  const html = `<figure><figcaption><p>${'Chú thích ảnh '.repeat(12)}</p></figcaption></figure><p>${paragraph}</p>`
  const description = guideDescription(html)
  expect(description).toBe(paragraph)
  expect(descriptionForSearch('vi', description, 100)).toBe(first)
})

test('a short guide introduction stays separate from a long list or table', () => {
  const intro = 'Chọn bể phù hợp với chỗ đặt.'
  const html = `<p>Ảnh © tác giả</p><p>${intro}</p><ul><li>${'Đo chiều dài và chiều cao bể. '.repeat(20)}</li></ul>`
  expect(guideDescription(html)).toBe(intro)
  expect(guideDescription('<p>Ảnh © tác giả</p><ul><li>Bể nhỏ</li></ul>')).toBe('')
})


test('a sentence under 80 characters leaves room for a word-boundary excerpt', () => {
  const sentence = 'Bể cần nước sạch và đủ chỗ để cá bơi.'
  const expected = sentence + ' Cá cũng cần chỗ ẩn để nghỉ, nhất là trong những ngày đầu mới thả'
  const text = expected + ' cá vào bể trước khi chúng quen với dòng nước.'
  expect([...expected].length).toBeGreaterThanOrEqual(80)
  expect(descriptionForSearch('vi', text, [...expected].length + 2)).toBe(expected)
  expect(descriptionForSearch('vi', sentence)).toBe(sentence)
})


test('a sentence ending exactly at the character limit still fits before a separating space', () => {
  const first = 'Khi nuôi cá theo đàn, hãy chọn bể có nước sạch và đủ khoảng trống để cả đàn cá bơi cùng nhau.'
  const two = first + ' Cá cũng cần chỗ ẩn để nghỉ.'
  const text = two + ' Thêm một ít cây vào bể.'
  expect(descriptionForSearch('vi', text, [...two].length)).toBe(two)
})

test('a long name containing its scientific name keeps the common name that fits', () => {
  const sci = 'Limnobium laevigatum'
  const common = 'Bèo tây Nam Mỹ'
  const detail = 'giống lá nhỏ dành cho hồ thủy sinh có nhiều cây nổi'
  expect(plantTitle('vi', `${common} (${sci}), ${detail}`, sci)).toContain(common)
  const scienceFirst = plantTitle('vi', `${sci} (${common} ${detail})`, sci)
  expect(scienceFirst).toContain(common)
  expect(scienceFirst).toContain(sci)
  expect([...scienceFirst].length).toBeLessThanOrEqual(70)
  const inTheMiddle = plantTitle('vi', `Cây ${sci} (bèo tây Nam Mỹ), ${detail}`, sci)
  expect(inTheMiddle).toContain('bèo tây Nam Mỹ')
  expect(inTheMiddle).toContain(sci)
  expect([...inTheMiddle].length).toBeLessThanOrEqual(70)
})

test('shortening a common name with a trade description leaves balanced parentheses', () => {
  const sci = 'Melanotaenia praecox'
  const title = speciesTitle('vi', 'Cá cầu vồng (dòng xanh được chọn qua nhiều thế hệ, nuôi trong hồ thủy sinh)', sci)
  expect(title).toContain('Cá cầu vồng')
  expect(title).toContain(`(${sci})`)
  expect(title.replace(`(${sci})`, '')).not.toMatch(/[()]/)
  expect([...title].length).toBeLessThanOrEqual(70)
})
