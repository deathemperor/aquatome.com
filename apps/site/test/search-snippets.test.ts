import { expect, test } from 'vitest'
import { LANGS } from '@aq/schema/langs'
import { descriptionForSearch, excerpt, plantTitle, speciesTitle } from '../src/lib/meta'

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
  const sentence = 'Bể cần nước sạch và đủ chỗ để cá bơi.'
  expect(descriptionForSearch('vi', sentence + ' ' + 'Các loại thức ăn cá có thể tìm trong bể '.repeat(8))).toBe(sentence)
  const thai = 'ปลาชนิดนี้ชอบน้ำสะอาดและมีพื้นที่ว่ายน้ำ'
  const clipped = descriptionForSearch('th', thai.repeat(12), 32)
  const ends = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(thai)].map(s => s.index + s.segment.length)
  expect(clipped.length).toBeGreaterThan(0)
  expect([...clipped].length).toBeLessThanOrEqual(32)
  expect(ends).toContain(clipped.length)
})

test('guide descriptions use their own sentences without a truncation ellipsis', () => {
  const first = 'Bể cần nước sạch và đủ chỗ để cá bơi, đặc biệt khi nuôi theo đàn.'
  const html = `<figure><figcaption><p>${'Chú thích ảnh '.repeat(12)}</p></figcaption></figure><p>${first} ${'Trong bể có thể trồng nhiều cây thủy sinh '.repeat(6)}</p>`
  expect(excerpt(html, 80)).toBe(first)
})
