import { expect, test } from 'vitest'
import { readingMinutes, withToc } from '../src/lib/toc'

test('h3s get unique ids from their text and become the table of contents', () => {
  const { html, toc } = withToc('<p>a</p><h3>Thay nước <em>bao lâu</em>?</h3><p>b</p><h3>Thay nước bao lâu?</h3><h3> </h3>')
  expect(toc).toEqual([{ id: 'thay-nuoc-bao-lau', text: 'Thay nước bao lâu?' }, { id: 'thay-nuoc-bao-lau-2', text: 'Thay nước bao lâu?' }])
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau">')
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau-2">')
})

test('a heading\'s own number is dropped from the (already numbered) list; its id keeps it', () => {
  const { toc } = withToc('<h3>1. Rasbora</h3><h3>2) Cá neon</h3><h3>10 loài cá</h3>')
  expect(toc).toEqual([{ id: '1-rasbora', text: 'Rasbora' }, { id: '2-ca-neon', text: 'Cá neon' }, { id: '10-loai-ca', text: '10 loài cá' }])
})

test('no headings: html untouched; reading time is at least a minute', () => {
  expect(withToc('<p>x</p>')).toEqual({ html: '<p>x</p>', toc: [] })
  expect(readingMinutes('<p>một hai</p>')).toBe(1)
  expect(readingMinutes(`<p>${'chữ '.repeat(690)}</p>`)).toBe(3)
})

test('reading time: Thai counted by letters, not by spaces', () => {
  const thai = `<p>${'ปลากัดเป็นปลาที่เลี้ยงง่าย'.repeat(200)}</p>` // 5,000 Thai letters, no spaces
  expect(readingMinutes(thai)).toBe(5)
  expect(readingMinutes(`<p>${'một '.repeat(690)}</p>`)).toBe(3)
})
