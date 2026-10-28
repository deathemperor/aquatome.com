import { expect, test } from 'vitest'
import { slugify } from '../src/index'

test('strips Vietnamese diacritics and đ', () => {
  expect(slugify('Cá neon vua')).toBe('ca-neon-vua')
  expect(slugify('Cá đĩa')).toBe('ca-dia')
  expect(slugify('ĐỎ')).toBe('do')
})
test('collapses punctuation and whitespace', () => {
  expect(slugify('  Tép  Red-Cherry! ')).toBe('tep-red-cherry')
  expect(slugify('Ancistrus sp. (L144)')).toBe('ancistrus-sp-l144')
})
