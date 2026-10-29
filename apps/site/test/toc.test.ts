import { expect, test } from 'vitest'
import { readingMinutes, withToc } from '../src/lib/toc'

test('h3s get unique ids from their text and become the table of contents', () => {
  const { html, toc } = withToc('<p>a</p><h3>Thay nước <em>bao lâu</em>?</h3><p>b</p><h3>Thay nước bao lâu?</h3><h3> </h3>')
  expect(toc).toEqual([{ id: 'thay-nuoc-bao-lau', text: 'Thay nước bao lâu?' }, { id: 'thay-nuoc-bao-lau-2', text: 'Thay nước bao lâu?' }])
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau">')
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau-2">')
})

test('no headings: html untouched; reading time is at least a minute', () => {
  expect(withToc('<p>x</p>')).toEqual({ html: '<p>x</p>', toc: [] })
  expect(readingMinutes('<p>một hai</p>')).toBe(1)
  expect(readingMinutes(`<p>${'chữ '.repeat(690)}</p>`)).toBe(3)
})
