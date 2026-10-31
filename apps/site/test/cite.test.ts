import { expect, test } from 'vitest'
import { citeMark, photoMark, withCite } from '../src/lib/cite'

const m = '<a class="cite">1</a>'
test('the mark goes at the end of the block\'s last sentence: its last paragraph or list item', () => {
  expect(withCite('<p>Một.</p><p>Hai.</p>\n', m)).toBe(`<p>Một.</p><p>Hai.${m}</p>`)
  expect(withCite('<p>Một.</p><ul><li>a</li><li>b</li></ul>', m)).toBe(`<p>Một.</p><ul><li>a</li><li>b${m}</li></ul>`)
  expect(withCite('<table><tr><td>x</td></tr></table>', m)).toBe(`<table><tr><td>x</td></tr></table><p class="cite-line">${m}</p>`)
})
test('a text source\'s mark carries its number, name, site and the permission; a photo\'s, its author and licence', () => {
  const c = citeMark('vi', 2, 'Loaches Online', 'https://www.loaches.com/species/x')
  expect(c).toContain('>2</a>')
  expect(c).toContain('data-term="Loaches Online"')
  expect(c).toContain('data-tip="loaches.com · dịch với sự cho phép của nguồn"')
  expect(c).toContain('aria-label="Nguồn 2: Loaches Online"')
  const p = photoMark('vi', { author: 'Seriously Fish', licence: 'dùng với sự cho phép', sourceUrl: 'https://s/x' })
  expect(p).toContain('data-term="Ảnh: Seriously Fish"')
  expect(p).toContain('data-tip="dùng với sự cho phép"')
  expect(p).toContain('>©</a>')
})
