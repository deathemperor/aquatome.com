import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { allPages } from '../e2e/pages'
import { DIST, page, sitemapText } from './dist'

const slugs = ['lua', 'lua-mopani', 'lua-sa-tung']
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
    'Là gì', 'Ảnh hưởng tới nước', 'Xử lý trước khi dùng', 'Hợp với cá và cây nào', 'Lỗi hay gặp', 'Mua ở đâu, chọn thế nào', 'Hỏi đáp', 'Nguồn',
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

test('general material lists its kinds, omits absent sections and links the hub', () => {
  const { dom } = page('/vat-lieu/lua/')
  expect(dom.querySelectorAll('.kinds a').map(a => a.getAttribute('href')).sort()).toEqual(['/vat-lieu/lua-mopani/', '/vat-lieu/lua-sa-tung/'])
  expect(dom.querySelectorAll('[data-section]').map(s => s.getAttribute('data-section'))).toEqual(['about'])
  expect(dom.querySelector('.faq')).toBeNull()
  expect(dom.querySelector('figure.gallery')).toBeNull()
  expect(dom.querySelector('nav.crumb a[href="/vat-lieu/"]')!.text).toBe('Vật liệu')
  expect(existsSync(join(DIST, 'vat-lieu/index.html'))).toBe(true)
})

test('pilot pages and hub are Vietnamese-only, noindex, outside Google and in the internal search index', () => {
  for (const path of ['/vat-lieu/', ...slugs.map(s => `/vat-lieu/${s}/`)]) {
    const { dom } = page(path)
    expect(dom.querySelector('html')!.getAttribute('lang')).toBe('vi')
    expect(dom.querySelector('meta[name="robots"]')!.getAttribute('content')).toContain('noindex')
    expect(dom.querySelector('main[data-pagefind-body]')).not.toBeNull()
    expect(dom.querySelectorAll('link[hreflang]').map(l => l.getAttribute('hreflang'))).toEqual(['vi', 'x-default'])
  }
  expect(sitemapText()).not.toContain('/vat-lieu/')
  expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).not.toContain('/vat-lieu/')
  const fragments = files(join(DIST, 'pagefind/fragment')).map(f => gunzipSync(readFileSync(f)).toString('utf8'))
  expect(fragments.length).toBeGreaterThan(0)
  for (const path of ['/vat-lieu/', ...slugs.map(s => `/vat-lieu/${s}/`)]) expect(fragments.some(f => f.includes(path)), path).toBe(true)
  const appFiles = files(join(DIST, 'app')).filter(f => f.endsWith('.json'))
  expect(appFiles.length).toBeGreaterThan(0)
  const vi = JSON.parse(readFileSync(join(DIST, 'app/vi.json'), 'utf8'))
  expect(vi.items.filter((i: { kind: string }) => i.kind === 'material')).toHaveLength(3)
  for (const file of appFiles.filter(f => /\/(id|th|ms)\.json$/.test(f))) expect(readFileSync(file, 'utf8')).not.toContain('vat-lieu')
  const pages = allPages(DIST)
  expect(pages.filter(p => p.includes('/vat-lieu/')).sort()).toEqual(['/vat-lieu/', ...slugs.map(s => `/vat-lieu/${s}/`)].sort())
  for (const path of pages.filter(p => !p.startsWith('/vat-lieu/') && p !== '/thuat-ngu/lua/')) {
    expect(page(path).dom.querySelector('a[href^="/vat-lieu/"]'), path).toBeNull()
  }
})

test('the hub shows the title and intro, then each group, its wide card and fixed-width kind cards, with a word-only plate', () => {
  const { dom } = page('/vat-lieu/')
  expect(dom.querySelector('main h1')!.text).toBe('Vật liệu')
  expect(dom.querySelector('main .intro')!.text).toBe('Lũa, đá, nền và lá khô cho bể thủy sinh: cách chọn và xử lý.')
  expect(dom.querySelector('nav.crumb a')!.getAttribute('href')).toBe('/')
  const groups = dom.querySelectorAll('.materials > section')
  expect(groups.map(g => g.getAttribute('id'))).toEqual(['lua'])
  const group = groups[0]!
  expect(group.querySelector('h2')!.text).toBe('Lũa · 2')
  expect(group.querySelector('a.wide')!.getAttribute('href')).toBe('/vat-lieu/lua/')
  const cards = group.querySelectorAll('.grid > a')
  expect(cards.map(a => a.getAttribute('href'))).toEqual(['/vat-lieu/lua-mopani/', '/vat-lieu/lua-sa-tung/'])
  const plate = cards[0]!
  expect(plate.classList.contains('no-photo')).toBe(true)
  expect(plate.querySelector('img, svg')).toBeNull()
  expect(plate.querySelector('h3')!.text).toBe('Lũa mopani')
  expect(plate.querySelector('.summary')!.text).toBe('Lũa mopani dùng để tạo bố cục trong bể.')
  expect(cards[1]!.querySelector('.aka')!.text).toBe('Gỗ sa tùng · Sa tùng')
  expect(cards[1]!.querySelector('img')).not.toBeNull()
  expect(dom.querySelector('footer')!.text).toContain('CC0')
})

test('material crumbs end with the current page, and their own element carries every search alias', () => {
  for (const slug of slugs) {
    const { dom } = page(`/vat-lieu/${slug}/`)
    const crumb = dom.querySelector('nav.crumb')!
    expect(crumb.querySelectorAll('a').map(a => [a.getAttribute('href'), a.text])).toEqual([
      ['/', 'Trang chủ'], ['/vat-lieu/', 'Vật liệu'], ...(slug === 'lua' ? [] : [['/vat-lieu/lua/', 'Lũa']]),
    ])
    expect(crumb.querySelector('[aria-current="page"]')!.text).toBe(dom.querySelector('h1')!.text)
    expect(dom.querySelector('.material')!.getAttribute('data-pagefind-meta')).toBe('aka[data-aka]')
  }
  const aka = page('/vat-lieu/lua-sa-tung/').dom.querySelector('[data-aka]')!.getAttribute('data-aka')!.split(', ')
  for (const name of ['Sa tùng', 'Kim sa tùng', 'Lũa kim sa tùng', 'Gỗ sa tùng', 'Sa tung wood']) expect(aka).toContain(name)
  expect(page('/vat-lieu/lua-mopani/').dom.querySelector('figure.gallery')).toBeNull()
})

test('the Vietnamese glossary links the matching material; other languages never link a material page', () => {
  const { dom } = page('/thuat-ngu/lua/')
  const a = dom.querySelector('.material-link a')!
  expect(a.getAttribute('href')).toBe('/vat-lieu/lua/')
  expect(a.text).toBe('Xem trang Lũa: cách chọn, xử lý và các loại lũa →')
  expect(page('/thuat-ngu/ph/').dom.querySelector('.material-link')).toBeNull()
  for (const path of allPages(DIST).filter(p => /^\/(id|th|ms)\//.test(p))) {
    expect(page(path).dom.querySelector('a[href*="vat-lieu"]'), path).toBeNull()
  }
})
