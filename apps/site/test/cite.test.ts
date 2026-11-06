import { expect, test } from 'vitest'
import { citeMark, photoMark, withCite } from '../src/lib/cite'
import { htmlBlocks } from '../src/lib/page-blocks'

const m = '<a class="cite">1</a>'
test('the mark goes at the end of the block\'s last sentence: its last paragraph or list item', () => {
  expect(withCite('<p>Một.</p><p>Hai.</p>\n', m)).toBe(`<p>Một.</p><p>Hai.${m}</p>`)
  expect(withCite('<p>Một.</p><ul><li>a</li><li>b</li></ul>', m)).toBe(`<p>Một.</p><ul><li>a</li><li>b${m}</li></ul>`)
  expect(withCite('<table><tr><td>x</td></tr></table>', m)).toBe(`<table><tr><td>x</td></tr></table><p class="cite-line">${m}</p>`)
})
test('a text source\'s mark carries its number, name, site and that the text is translated from it; a photo\'s, its author and licence', () => {
  const c = citeMark('vi', 2, 'Loaches Online', 'https://www.loaches.com/species/x')
  expect(c).toContain('>2</a>')
  expect(c).toContain('data-term="Loaches Online"')
  expect(c).toContain('data-tip="loaches.com · dịch từ nguồn"')
  expect(c).toContain('aria-label="Nguồn 2: Loaches Online"')
  expect(citeMark('id', 2, 'Loaches Online', 'https://www.loaches.com/species/x')).toContain('data-tip="loaches.com · diterjemahkan dari sumber"')
  expect(citeMark('th', 2, 'Loaches Online', 'https://www.loaches.com/species/x')).toContain('data-tip="loaches.com · แปลจากแหล่งข้อมูล"')
  const cc = photoMark('vi', { author: 'Zell', licence: 'CC BY-SA 3.0', sourceUrl: 'https://s/y' })
  expect(cc).toContain('data-term="Ảnh: Zell"')
  expect(cc).toContain('data-tip="CC BY-SA 3.0"')
  expect(cc).toContain('aria-label="Ảnh: Zell, CC BY-SA 3.0"')
  expect(cc).toContain('>©</a>')
})
test('a photo a source let us use: its mark names its author and links its page, with no licence, tip or trailing comma', () => {
  for (const lang of ['vi', 'id', 'th'] as const) {
    const p = photoMark(lang, { author: 'Seriously Fish', licence: 'dùng với sự cho phép', sourceUrl: 'https://s/x' })
    expect(p).toContain('href="https://s/x"')
    expect(p).not.toContain('data-tip')
    expect(p).toMatch(/aria-label="[^",]*Seriously Fish">©<\/a>$/)
  }
  // The app's copy of the photo: its credit's licence is empty (protocols/page.schema.json: a string, required).
  const p = photoMark('vi', { author: 'Seriously Fish', licence: 'dùng với sự cho phép', sourceUrl: 'https://s/x' })
  const { blocks } = htmlBlocks(`<figure class="inl"><img src="https://m/x.webp" width="800" height="600" alt="Cá"><figcaption>Cá${p}</figcaption></figure>`)
  expect(blocks).toEqual([{ t: 'figure', img: { src: 'https://m/x.webp', w: 800, h: 600, alt: 'Cá', credit: { text: 'Ảnh: Seriously Fish', licence: '', url: 'https://s/x' } }, caption: ['Cá'] }])
})
