import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'
import { DIST, page } from './dist'
import type { AlbumPhoto } from '../src/lib/album'

// The owner (2026-11-05): no page, in any language, nor the copy the app reads, says "with permission". A photo a source
// let us use is stored with the licence "dùng với sự cho phép" (packages/engine source-photos.ts): its credit is its
// author and the link to its page on the source; an open licence still shows by name. A translated text's source mark
// and the source list say it is translated from its sources, and a gallery with such photos says where they come from,
// not that anyone allowed it; nor do the footer and the about page say the sources gave leave. The words, in each
// language (the licence's "digunakan dengan izin" and "ใช้โดยได้รับอนุญาต" among them):
// (A reader's own leave, as fish ID's "keep this photo" on the privacy page, is not one of them.)
const WORDS = ['với sự cho phép', 'dengan izin', 'โดยได้รับอนุญาต', 'nguồn được cấp phép', 'đã cho phép AquaTome sử dụng',
  'sumber berlisensi,', 'mengizinkan AquaTome menggunakannya', 'แหล่งที่ได้รับอนุญาต', 'อนุญาตให้ AquaTome นำมาใช้']

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : /\.(html|json|md|txt|xml)$/.test(e.name) ? [join(dir, e.name)] : [])

test('no page, data file or app page copy says "with permission", in any language', () => {
  const all = files(DIST)
  // The fixture build has such photos on guides, an equipment page and a breed's page (in its album too), in their HTML and their JSON
  // (the guide list's data file, the app's copies), and translated pages with their sources; the Indonesian and Thai
  // pages carry the words their scripts show.
  for (const f of ['ca/ca-la-han/index.html', 'thiet-bi/loc/index.html', 'data/vi/guides.json', 'ca/ca-neon-vua/index.html', 'id/index.html', 'th/index.html', 'gioi-thieu/index.html', 'id/tentang/index.html', 'th/about/index.html']) expect(all, f).toContain(join(DIST, f))
  expect(all.some(f => relative(DIST, f).startsWith('app/pages/vi/guide-'))).toBe(true)
  const found = all.flatMap(f => {
    const text = readFileSync(f, 'utf8')
    return WORDS.filter(w => text.includes(w)).map(w => `${relative(DIST, f)}: ${w}`)
  })
  expect(found).toEqual([])
})

test('a photo used with permission is credited to its author, linking its page; an open licence is still named', () => {
  const { dom } = page('/ca/ca-la-han/')
  // Its album, as the viewer credits it: the author and the page it links, no licence; an open licence named.
  const photos = JSON.parse(dom.querySelector('[data-album] script[type="application/json"]')!.textContent).photos as AlbumPhoto[]
  const given = photos.find(p => p.a === 'vnreddevil / Diễn Đàn Cá Cảnh')!
  expect(given.s).toBe('https://www.diendancacanh.com/threads/ca-la-han.8/')
  expect([given.l, given.lu]).toEqual([undefined, undefined])
  expect(photos.find(p => p.a === 'Người chụp 2')!.l).toBe('CC BY 2.0')
  // The footer's list: the author, linked, and nothing after it; the open licence after its author.
  const rows = dom.querySelectorAll('#photo-credits li')
  const row = rows.find(li => li.textContent.includes('vnreddevil'))!
  expect(row.querySelector('a')!.getAttribute('href')).toBe('https://www.diendancacanh.com/threads/ca-la-han.8/')
  expect(row.querySelector('.lic')).toBeNull()
  expect(row.textContent.trim()).toBe('vnreddevil / Diễn Đàn Cá Cảnh')
  expect(rows.find(li => li.textContent.includes('Người chụp 2'))!.querySelector('.lic')!.textContent).toBe(' · CC BY 2.0')
})
