import { expect, test } from 'vitest'
import { linkGlossary } from '../src/index'

const terms = [
  { name: 'pH', href: '/vi/thuat-ngu/ph/' },
  { name: 'chu trình nitơ', href: '/vi/thuat-ngu/chu-trinh-nito/' },
  { name: 'chu trình', href: '/x/' },
]

test('links only the first occurrence', () => {
  expect(linkGlossary('<p>pH thấp. pH cao.</p>', terms)).toBe('<p><a href="/vi/thuat-ngu/ph/" class="gl">pH</a> thấp. pH cao.</p>')
})
test('longest term wins on overlap', () => {
  const out = linkGlossary('<p>Hiểu chu trình nitơ</p>', terms)
  expect(out).toContain('href="/vi/thuat-ngu/chu-trinh-nito/"')
  expect(out).not.toContain('href="/x/"')
})
test('never links inside an existing link or heading', () => {
  expect(linkGlossary('<a href="#">pH</a>', terms)).toBe('<a href="#">pH</a>')
  expect(linkGlossary('<h2>pH</h2>', terms)).toBe('<h2>pH</h2>')
})
test('matches whole words only, case-insensitively', () => {
  expect(linkGlossary('<p>phosphate</p>', terms)).toBe('<p>phosphate</p>')
  expect(linkGlossary('<p>PH ổn định</p>', terms)).toContain('class="gl">PH</a>')
})
test('never touches attribute values', () => {
  expect(linkGlossary('<p title="pH">nước</p>', terms)).toBe('<p title="pH">nước</p>')
})
test('a shared seen-set links once across several fragments of one page', () => {
  const seen = new Set<string>()
  expect(linkGlossary('<p>pH</p>', terms, seen)).toContain('class="gl"')
  expect(linkGlossary('<p>pH</p>', terms, seen)).toBe('<p>pH</p>')
})
