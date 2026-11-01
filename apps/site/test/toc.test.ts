import { parse } from 'node-html-parser'
import { expect, test } from 'vitest'
import { readingMinutes, withToc } from '../src/lib/toc'

test('h3s get unique ids from their text and become the table of contents', () => {
  const { html, toc } = withToc('<p>a</p><h3>Thay nước <em>bao lâu</em>?</h3><p>b</p><h3>Thay nước bao lâu?</h3><h3> </h3>')
  expect(toc).toEqual([{ id: 'thay-nuoc-bao-lau', text: 'Thay nước bao lâu?' }, { id: 'thay-nuoc-bao-lau-2', text: 'Thay nước bao lâu?' }])
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau">')
  expect(html).toContain('<h3 id="thay-nuoc-bao-lau-2">')
})

test('a heading\'s own number leaves its words and becomes its entry\'s number; its id keeps it', () => {
  const { toc } = withToc('<h3>1. Rasbora</h3><h3>2) Cá neon</h3><h3>10 loài cá</h3>')
  expect(toc).toEqual([{ id: '1-rasbora', text: 'Rasbora', n: 1 }, { id: '2-ca-neon', text: 'Cá neon', n: 2 }, { id: '10-loai-ca', text: '10 loài cá' }])
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

test('a heading\'s own "#3" goes too, so the contents never read "3. #3"', () => {
  const { toc } = withToc('<h3>#1 Trùn chỉ đỏ</h3><h3>#2. Giun đen</h3><h3>#10 loại</h3><h3>10 loài cá</h3>')
  expect(toc.map(t => t.text)).toEqual(['Trùn chỉ đỏ', 'Giun đen', 'loại', '10 loài cá'])
})

const tags = (html: string) => parse(html).childNodes.map(n => (n as { rawTagName?: string }).rawTagName).join(' ')

// 2026-11-02: "Lựa chọn loài" over one heading a species, "Ưu điểm" over "1. …": every heading an h3, so the group read
// as a heading with nothing under it (the built-page check's empty-section, on 12 guides).
test('a heading over sub-sections is an h2; its numbered run nests under it in the contents, an unnumbered group\'s headings don\'t', () => {
  const body = '<p>a</p><h3>Ưu điểm</h3><h3>1. Lọc</h3><p>b</p><h3>2. Đẹp</h3><p>c</p><h3>Lựa chọn loài</h3><h3>Botia dario</h3><p>d</p><h3>Kết luận</h3><p>e</p>'
  const { html, toc } = withToc(body)
  expect(tags(html)).toBe('p h2 h3 p h3 p h2 h3 p h3 p')
  expect(toc.map(e => [e.text, e.group ?? false, e.sub?.map(s => `${s.n}. ${s.text}`) ?? []])).toEqual([
    ['Ưu điểm', true, ['1. Lọc', '2. Đẹp']],
    ['Lựa chọn loài', true, []],
    ['Botia dario', false, []],
    ['Kết luận', false, []],
  ])
})

test('a group is read from the stored text, so a figure put in under it leaves it a group', () => {
  const body = '<h3>Lựa chọn loài</h3><h3>Botia dario</h3><p>d</p>'
  const prose = '<h3>Lựa chọn loài</h3><figure><img src="x"></figure><h3>Botia dario</h3><p>d</p>'
  expect(tags(withToc(prose, body).html)).toBe('h2 figure h3 p')
  expect(tags(withToc('<h3>Ngày 16</h3><h3>Ngày 26</h3><p>a</p>').html)).toBe('h3 h3 p') // peers: the first is empty, not a group
})
