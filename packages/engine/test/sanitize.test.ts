import { expect, test } from 'vitest'
import { plainParts, sanitizeHtml, tidyHeadings, unescapePlain } from '../src/sanitize'

test('keeps allowed tags and strips every attribute', () => {
  expect(sanitizeHtml('<p class="x" onclick="y">ok <strong style="c">b</strong></p>')).toBe('<p>ok <strong>b</strong></p>')
})
test('drops script and style with their content', () => {
  expect(sanitizeHtml('<script>alert(1)</script><style>p{}</style><p>ok</p>')).toBe('<p>ok</p>')
})
test('unwraps disallowed tags but keeps their text', () => {
  expect(sanitizeHtml('<p>a <a href="javascript:x">link</a> <img src=x onerror=alert(1)> <span>b</span></p>')).toBe('<p>a link  b</p>')
})
test('plain text is wrapped in a paragraph', () => {
  expect(sanitizeHtml('just text & more')).toBe('<p>just text &amp; more</p>')
})
test('tables and lists survive', () => {
  expect(sanitizeHtml('<ul><li>x</li></ul><table><tbody><tr><th>a</th><td>b</td></tr></tbody></table>')).toBe('<ul><li>x</li></ul><table><tbody><tr><th>a</th><td>b</td></tr></tbody></table>')
})
test('a byline paragraph is dropped; a sentence about the author or a paper citation is not', () => {
  expect(sanitizeHtml('<p><em>Tác giả: Emma Turner — chỉnh sửa lần cuối: 09/11/2006</em></p><p>Tác giả bài báo: Tan và Ng</p><p>Nuôi theo đàn.</p>')).toBe('<p>Tác giả bài báo: Tan và Ng</p><p>Nuôi theo đàn.</p>')
})

test("a heading with no number between two numbered ones that follow each other is the item's own lead, not an item", () => {
  const html = '<h3>Giới thiệu</h3><p>a</p><h3>#3 Cám viên</h3><p>b</p><h3>Xtreme Betta Pellets</h3><p>c</p><h3>#4 Sấy khô</h3><p>d</p><h3>Kết luận</h3><p>e</p>'
  expect(sanitizeHtml(html)).toBe('<h3>Giới thiệu</h3><p>a</p><h3>#3 Cám viên</h3><p>b</p><p><strong>Xtreme Betta Pellets</strong></p><p>c</p><h3>#4 Sấy khô</h3><p>d</p><h3>Kết luận</h3><p>e</p>')
  // A countdown, "1." and "Bước" numbering too; an intro or conclusion outside the run stays a heading.
  expect(tidyHeadings('<h3>3. A</h3><h3>Yêu cầu của A</h3><h3>2. B</h3>')).toBe('<h3>3. A</h3><p><strong>Yêu cầu của A</strong></p><h3>2. B</h3>')
  expect(tidyHeadings('<h3>Bước 1</h3><h3>Chú ý</h3><h3>Bước 2</h3>')).toBe('<h3>Bước 1</h3><p><strong>Chú ý</strong></p><h3>Bước 2</h3>')
  // Two lists in one text (1–8 then 1–7) and a heading that merely starts with a number ("10 loại cây") are left alone.
  const two = '<h3>1. A</h3><h3>2. B</h3><h3>7 dấu hiệu</h3><h3>1. C</h3><h3>10 loại cây</h3>'
  expect(tidyHeadings(two)).toBe(two)
})

test('an entity escaped twice is escaped once; empty headings, paragraphs, items and lists are dropped', () => {
  expect(sanitizeHtml('<p>Tom &amp;amp; Jerry &amp;lt;3</p>')).toBe('<p>Tom &amp; Jerry &lt;3</p>')
  expect(sanitizeHtml('<h3></h3><p>a</p><p> </p><ul><li></li></ul><p>b</p>')).toBe('<p>a</p><p>b</p>')
  // A single escape is right, and an empty table cell is a cell.
  expect(sanitizeHtml('<p>R&amp;D</p><table><tr><td></td><td>x</td></tr></table>')).toBe('<p>R&amp;D</p><table><tr><td></td><td>x</td></tr></table>')
})

test('plain text (a title, a summary point, an FAQ) holds no entities', () => {
  expect(unescapePlain('Cacing Jangkar &amp; Kutu Ikan')).toBe('Cacing Jangkar & Kutu Ikan')
  expect(unescapePlain('A &amp;amp; B &#8211; C &lt; D')).toBe('A & B – C < D')
  expect(unescapePlain('&#99999999; &#x0;')).toBe('&#99999999; &#x0;')
  expect(plainParts([' a &amp; b ', ''], [{ q: 'Q &amp;?', a: ' ' }, { q: 'Hỏi', a: 'Đáp &gt; 1' }])).toEqual({ summary: ['a & b'], faq: [{ q: 'Hỏi', a: 'Đáp > 1' }] })
})
