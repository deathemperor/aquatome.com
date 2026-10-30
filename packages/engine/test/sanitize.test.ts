import { expect, test } from 'vitest'
import { sanitizeHtml } from '../src/sanitize'

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
