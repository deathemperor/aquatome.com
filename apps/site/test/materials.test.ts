import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { allPages } from '../e2e/pages'
import { DIST, page, sitemapText } from './dist'

const slugs = ['lua', 'lua-sa-tung']
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])

test('the material page answers first, then shows its photo, six sections, FAQ, sources and parent', () => {
  const { dom } = page('/vat-lieu/lua-sa-tung/')
  const main = dom.querySelector('main')!
  expect(main.querySelector('h1')!.text).toBe('Lũa sa tùng')
  const material = main.querySelector('.material')!
  expect(material.children.map(e => e.tagName)).toEqual(['P', 'DIV', 'FIGURE', ...Array(8).fill('SECTION'), 'P'])
  expect(material.querySelector('.alt')!.text).toContain('Gỗ sa tùng')
  expect(material.querySelector('.alt [lang="en"]')!.text).toBe('Sa tung wood')
  expect(material.querySelectorAll('.intro p')).toHaveLength(2)
  expect(material.querySelectorAll('h2').map(h => h.text)).toEqual([
    'Là gì', 'Ảnh hưởng tới nước', 'Xử lý trước khi dùng', 'Hợp với cá và cây nào', 'Lỗi hay gặp', 'Mua ở đâu, giá bao nhiêu', 'Hỏi đáp', 'Nguồn',
  ])
  expect(material.querySelectorAll('.faq details')).toHaveLength(1)
  expect(material.querySelector('figure img')!.getAttribute('alt')).toBe('Lũa sa tùng')
  expect(material.querySelector('figure .cite.pic')!.getAttribute('href')).toBe('https://example.org/photos/lua-sa-tung')
  expect(dom.querySelector('footer')!.text).toContain('CC0')
  expect(material.querySelector('.parent a')!.getAttribute('href')).toBe('/vat-lieu/lua/')
  expect(main.querySelector('nav.crumb a')!.getAttribute('href')).toBe('/')
})

test('each numbered mark opens the source with that number in the source list', () => {
  const { dom } = page('/vat-lieu/lua-sa-tung/')
  const sources = dom.querySelectorAll('.sources ol li a')
  expect(sources).toHaveLength(3)
  const marks = dom.querySelectorAll('.prose .cite')
  expect(marks.map(m => m.text)).toEqual(['1', '1', '2', '1', '2', '3'])
  for (const mark of marks) expect(mark.getAttribute('href')).toBe(sources[Number(mark.text) - 1]!.getAttribute('href'))
  expect(dom.querySelector('.material')!.text).not.toMatch(/\[\d+\]/)
})

test('general material lists its kinds, omits absent sections and has no fabricated section-index link', () => {
  const { dom } = page('/vat-lieu/lua/')
  expect(dom.querySelector('.kinds a')!.getAttribute('href')).toBe('/vat-lieu/lua-sa-tung/')
  expect(dom.querySelectorAll('[data-section]').map(s => s.getAttribute('data-section'))).toEqual(['about'])
  expect(dom.querySelector('.faq')).toBeNull()
  expect(dom.querySelector('figure.gallery')).toBeNull()
  expect(dom.querySelector('a[href="/vat-lieu/"]')).toBeNull()
  expect(existsSync(join(DIST, 'vat-lieu/index.html'))).toBe(false)
})

test('pilot pages are Vietnamese-only, noindex and outside every discovery surface', () => {
  for (const slug of slugs) {
    const { dom } = page(`/vat-lieu/${slug}/`)
    expect(dom.querySelector('html')!.getAttribute('lang')).toBe('vi')
    expect(dom.querySelector('meta[name="robots"]')!.getAttribute('content')).toContain('noindex')
    expect(dom.querySelector('[data-pagefind-body]')).toBeNull()
    expect(dom.querySelectorAll('link[hreflang]').map(l => l.getAttribute('hreflang'))).toEqual(['vi', 'x-default'])
  }
  expect(sitemapText()).not.toContain('/vat-lieu/')
  expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).not.toContain('/vat-lieu/')
  const fragments = files(join(DIST, 'pagefind/fragment')).map(f => gunzipSync(readFileSync(f)).toString('utf8'))
  expect(fragments.length).toBeGreaterThan(0)
  expect(fragments.filter(f => f.includes('/vat-lieu/'))).toEqual([])
  const appFiles = files(join(DIST, 'app')).filter(f => f.endsWith('.json'))
  expect(appFiles.length).toBeGreaterThan(0)
  expect(appFiles.filter(f => /vat-lieu|lua-sa-tung/.test(readFileSync(f, 'utf8')))).toEqual([])
  const pages = allPages(DIST)
  expect(pages.filter(p => p.includes('/vat-lieu/')).sort()).toEqual(slugs.map(s => `/vat-lieu/${s}/`).sort())
  for (const path of pages.filter(p => !p.startsWith('/vat-lieu/'))) {
    expect(page(path).dom.querySelector('a[href^="/vat-lieu/"]'), path).toBeNull()
  }
})
