import { parse } from 'node-html-parser'
import { expect, test } from 'vitest'
import { headingRoles } from '../src/headings'

const roles = (html: string) => headingRoles(parse(html)).map(h => `${h.role}${h.sub ? ' sub' : ''}: ${h.text}`)

// The owner's examples (2026-11-02): "Lựa chọn loài" over one heading a species, "Ưu điểm" over "1. …".
test('a heading straight over one with text is a group; a numbered run under it is its own', () => {
  expect(roles('<p>a</p><h3>Ưu điểm</h3><h3>1. Lọc</h3><p>b</p><h3>2. Đẹp</h3><p>c</p><h3>Nhược điểm</h3><h3>1. Sắc</h3><p>d</p><h3>Kết luận</h3><p>e</p>')).toEqual([
    'group: Ưu điểm', 'section sub: 1. Lọc', 'section sub: 2. Đẹp', 'group: Nhược điểm', 'section sub: 1. Sắc', 'section: Kết luận',
  ])
  // Unnumbered: where the group ends the text doesn't say, so no heading after it is marked as its own.
  expect(roles('<h3>Giới thiệu</h3><p>a</p><h3>Lựa chọn loài</h3><h3>Botia dario</h3><p>b</p><h3>Botia kubotai</h3><p>c</p>')).toEqual([
    'section: Giới thiệu', 'group: Lựa chọn loài', 'section: Botia dario', 'section: Botia kubotai',
  ])
})

test('a heading at the end, or over one not its sub-section (an empty one, a group, its peer), is empty', () => {
  expect(roles('<p>a</p><h3>Để lại bình luận</h3>')).toEqual(['empty: Để lại bình luận'])
  expect(roles('<h3>A</h3><h3>B</h3>')).toEqual(['empty: A', 'empty: B'])
  expect(roles('<h3>Phần một</h3><h3>Các loài</h3><h3>Tép ong</h3><p>a</p>')).toEqual(['empty: Phần một', 'group: Các loài', 'section: Tép ong'])
  expect(roles('<h3>Ngày 16 tháng 11 năm 2006</h3><h3>Ngày 26 tháng 11 năm 2006</h3><p>a</p>')).toEqual(['empty: Ngày 16 tháng 11 năm 2006', 'section: Ngày 26 tháng 11 năm 2006'])
  expect(roles('<h3>1. A</h3><p>a</p><h3>2. B</h3><h3>3. C</h3><p>c</p>')).toEqual(['section: 1. A', 'empty: 2. B', 'section: 3. C'])
  expect(roles('<h3>Bước 2: Đổ nền</h3><h3>Bước 3: Trồng cây</h3><p>a</p>')).toEqual(['empty: Bước 2: Đổ nền', 'section: Bước 3: Trồng cây'])
  // Numbered another way: a group over its run.
  expect(roles('<h3>Top 5 lý do</h3><h3>5. A</h3><p>a</p><h3>4. B</h3><p>b</p>')).toEqual(['group: Top 5 lý do', 'section sub: 5. A', 'section sub: 4. B'])
  expect(roles('<h3></h3><p>a</p>')).toEqual([]) // an empty block, not a heading (tidyHtml drops it)
})
