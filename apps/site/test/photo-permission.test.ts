import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'
import { DIST, page } from './dist'

// The owner (2026-11-05): no page, in any language, nor the copy the app reads, says "with permission". A photo a source
// let us use is stored with the licence "dùng với sự cho phép" (packages/engine source-photos.ts): its credit is its
// author and the link to its page on the source; an open licence still shows by name. A translated text's source mark
// and the source list say it is translated from its sources, and a gallery with such photos says where they come from,
// not that anyone allowed it. The words, in each language (the licence's "digunakan dengan izin" and
// "ใช้โดยได้รับอนุญาต" among them):
const WORDS = ['với sự cho phép', 'dengan izin', 'โดยได้รับอนุญาต']

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : /\.(html|json|md|txt|xml)$/.test(e.name) ? [join(dir, e.name)] : [])

test('no page, data file or app page copy says "with permission", in any language', () => {
  const all = files(DIST)
  // The fixture build has such photos on guides, an equipment page and a gallery page, in their HTML and their JSON
  // (the guide list's data file, the app's copies), and translated pages with their sources; the Indonesian and Thai
  // pages carry the words their scripts show.
  for (const f of ['ca/ca-la-han/anh/index.html', 'thiet-bi/loc/index.html', 'data/vi/guides.json', 'ca/ca-neon-vua/index.html', 'id/index.html', 'th/index.html']) expect(all, f).toContain(join(DIST, f))
  expect(all.some(f => relative(DIST, f).startsWith('app/pages/vi/guide-'))).toBe(true)
  const found = all.flatMap(f => {
    const text = readFileSync(f, 'utf8')
    return WORDS.filter(w => text.includes(w)).map(w => `${relative(DIST, f)}: ${w}`)
  })
  expect(found).toEqual([])
})

test('a photo used with permission is credited to its author, linking its page; an open licence is still named', () => {
  const { dom } = page('/ca/ca-la-han/anh/')
  // The gallery's line names where its photos come from, and no more.
  expect(dom.querySelector('.lead')!.textContent).toContain('7 ảnh từ Wikimedia Commons, Diễn Đàn Cá Cảnh và Unsplash. ')
  const tiles = dom.querySelectorAll('[data-gallery] a[data-i]')
  const given = tiles.find(a => a.getAttribute('data-author') === 'vnreddevil / Diễn Đàn Cá Cảnh')!
  expect(given.getAttribute('data-src')).toBe('https://www.diendancacanh.com/threads/ca-la-han.8/')
  expect(given.getAttribute('data-lic')).toBe('')
  expect(tiles.find(a => a.getAttribute('data-author') === 'Người chụp 2')!.getAttribute('data-lic')).toBe('CC BY 2.0')
  // The footer's list: the author, linked, and nothing after it; the open licence after its author.
  const rows = dom.querySelectorAll('#photo-credits li')
  const row = rows.find(li => li.textContent.includes('vnreddevil'))!
  expect(row.querySelector('a')!.getAttribute('href')).toBe('https://www.diendancacanh.com/threads/ca-la-han.8/')
  expect(row.querySelector('.lic')).toBeNull()
  expect(row.textContent.trim()).toBe('vnreddevil / Diễn Đàn Cá Cảnh')
  expect(rows.find(li => li.textContent.includes('Người chụp 2'))!.querySelector('.lic')!.textContent).toBe(' · CC BY 2.0')
  // Its structured data: the author's notice, no licence.
  const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)).flat()
  const image = ld.find((x: { '@type': string }) => x['@type'] === 'ImageGallery').image as { creditText: string; copyrightNotice: string; license?: string }[]
  expect(image.find(x => x.creditText === 'vnreddevil / Diễn Đàn Cá Cảnh')).toMatchObject({ copyrightNotice: 'vnreddevil / Diễn Đàn Cá Cảnh', acquireLicensePage: 'https://www.diendancacanh.com/threads/ca-la-han.8/' })
  expect(image.find(x => x.creditText === 'vnreddevil / Diễn Đàn Cá Cảnh')!.license).toBeUndefined()
  expect(image.find(x => x.creditText === 'Người chụp 2')!.copyrightNotice).toBe('Người chụp 2, CC BY 2.0')
})
