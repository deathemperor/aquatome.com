import { describe, expect, test } from 'vitest'
import { page } from './dist'

describe('species page', () => {
  const { html, dom } = page('/vi/ca/ca-neon-vua/')
  test('shows scientific name and Seriously Fish credit link', () => {
    expect(html).toContain('Paracheirodon axelrodi')
    expect(dom.querySelector('a[href="https://www.seriouslyfish.com/species/paracheirodon-axelrodi"]')).not.toBeNull()
  })
  test('marks conflicting temperature', () => {
    expect(dom.querySelector('[data-field="tempC"][data-conflict="true"]')).not.toBeNull()
  })
  test('videos are click-to-load facades', () => {
    expect(html).not.toContain('<iframe')
    expect(dom.querySelector('[data-youtube-id]')).not.toBeNull()
  })
  test('renders sections in Seriously Fish order with credited sub-blocks', () => {
    const heads = dom.querySelectorAll('section[data-section] > h2').map(h => h.text.trim())
    expect(heads.indexOf('Môi trường sống')).toBeLessThan(heads.indexOf('Sinh sản'))
    expect(dom.querySelectorAll('section[data-section="reproduction"] [data-source]').length).toBe(2)
  })
  test('product slots are sponsored /go/ links carrying the placement', () => {
    const a = dom.querySelector('a[href^="/go/shopee/?k="]')
    expect(a?.getAttribute('rel')).toContain('sponsored')
    expect(a?.getAttribute('href')).toContain('e=species%3Aparacheirodon-axelrodi')
    expect(html).not.toMatch(/href="https:\/\/(shopee\.vn|www\.lazada\.vn)/)
  })
  test('has no broken values', () => {
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})

test('missing sections produce no empty headings', () => {
  const { dom } = page('/vi/ca/ca-boraras-do/')
  expect(dom.querySelector('section[data-section="dimorphism"]')).toBeNull()
  expect(dom.querySelector('[data-field="gh"]')).toBeNull()
})

test('low-quality page is noindex', () => {
  expect(page('/vi/ca/ca-boraras-do/').html).toMatch(/<meta name="robots" content="noindex/)
  expect(page('/vi/ca/ca-neon-vua/').html).not.toMatch(/noindex/)
})

test('home links every species card', () => {
  const { dom } = page('/vi/')
  const links = new Set(dom.querySelectorAll('a[href^="/vi/ca/"]').map(a => a.getAttribute('href')))
  for (const slug of ['ca-neon-vua', 'ca-neon-xanh', 'ca-phuong-hoang', 'ca-dia', 'ca-galaxy', 'tep-red-cherry', 'ca-boraras-do', 'ca-apisto-cacatuoides'])
    expect(links.has(`/vi/ca/${slug}/`), slug).toBe(true)
})

test('species page has JSON-LD', () => {
  expect(page('/vi/ca/ca-neon-vua/').html).toContain('application/ld+json')
})

describe('browse pages', () => {
  const species = (path: string) => new Set(page(path).dom.querySelectorAll('a[href^="/vi/ca/"]').map(a => a.getAttribute('href')))
  test('genus page lists both Paracheirodon', () => {
    const s = species('/vi/phan-loai/characiformes/characidae/paracheirodon/')
    expect(s.has('/vi/ca/ca-neon-vua/') && s.has('/vi/ca/ca-neon-xanh/')).toBe(true)
  })
  test('order and family pages exist', () => {
    expect(species('/vi/phan-loai/cichliformes/').has('/vi/ca/ca-dia/')).toBe(true)
    expect(page('/vi/phan-loai/').html).toContain('Characiformes')
  })
  test('country page lists its species', () => {
    expect(species('/vi/nguon-goc/south-america/brazil/').has('/vi/ca/ca-neon-vua/')).toBe(true)
    expect(species('/vi/nguon-goc/asia/').has('/vi/ca/ca-galaxy/')).toBe(true)
  })
  test('every group has a page', () => {
    for (const g of ['tetras', 'cichlids', 'danios', 'shrimp', 'rasboras']) expect(species(`/vi/nhom/${g}/`).size, g).toBeGreaterThan(0)
  })
  test('species list embeds a filter index and unit-tagged values', () => {
    const { dom, html } = page('/vi/ca/')
    expect(JSON.parse(dom.querySelector('#species-index')!.text)).toHaveLength(8)
    expect(page('/vi/ca/ca-neon-vua/').html).toMatch(/data-c="24,30"/)
    expect(html).toContain('data-units-toggle')
  })
})

describe('plants, guides, glossary, equipment, discovery', () => {
  test('plant page shows growing needs and shop links', () => {
    const { html, dom } = page('/vi/cay/ray-nana/')
    for (const t of ['Ánh sáng', 'CO₂', 'Tốc độ mọc']) expect(html).toContain(t)
    const shop = dom.querySelector('a[href^="/go/shopee/?k="]')?.getAttribute('href') ?? ''
    expect(new URLSearchParams(shop.split('?')[1]).get('c')).toBe('cay-thuy-sinh') // plants are always an affiliate item
    // a plant whose slots lack the plant category still gets one, first
    const mc = page('/vi/cay/monte-carlo/').dom.querySelectorAll('a[href^="/go/shopee/?k="]').map(a => new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('c'))
    expect(mc[0]).toBe('cay-thuy-sinh')
    expect(mc).toContain('den')
    expect(page('/vi/cay/').dom.querySelectorAll('a[href^="/vi/cay/"]').length).toBeGreaterThanOrEqual(3)
  })
  test('guide page credits its source and links glossary terms', () => {
    const { html, dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
    expect(html).toContain('2Hr Aquarist')
    expect(dom.querySelector('main .gl')).not.toBeNull()
  })
  test('glossary index lists every term and term pages exist', () => {
    const { dom } = page('/vi/thuat-ngu/')
    expect(dom.querySelectorAll('a[href^="/vi/thuat-ngu/"]').length).toBeGreaterThanOrEqual(4)
    expect(page('/vi/thuat-ngu/chu-trinh-nito/').html).toContain('Nitrogen cycle')
  })
  test('species body links a glossary term', () => {
    expect(page('/vi/ca/ca-neon-vua/').dom.querySelector('section[data-section] .gl')).not.toBeNull()
  })
  test('equipment index and a page per product category', () => {
    for (const cat of ['be-ca', 'loc', 'thuc-an', 'suoi', 'cay-thuy-sinh']) expect(page(`/vi/thiet-bi/${cat}/`).html, cat).toContain(`/go/shopee/?k=`)
    expect(page('/vi/thiet-bi/').dom.querySelectorAll('a[href^="/vi/thiet-bi/"]').length).toBeGreaterThanOrEqual(5)
  })
  test('discovery lists discovery guides', () => {
    expect(page('/vi/kham-pha/').dom.querySelector('a[href="/vi/huong-dan/hang-moi-ve-nhung-loai-hiem-thang-nay/"]')).not.toBeNull()
  })
  test('Vietnam hub exists', () => {
    expect(page('/vi/nguon-goc/asia/vietnam/').html).toContain('Cá Việt Nam')
  })
  test('every nav link resolves', () => {
    for (const p of ['/vi/ca/', '/vi/cay/', '/vi/huong-dan/', '/vi/thiet-bi/', '/vi/kham-pha/']) expect(() => page(p), p).not.toThrow()
  })
})

describe('review fixes', () => {
  test('pages with photo cards credit every photo', () => {
    for (const p of ['/vi/', '/vi/ca/', '/vi/nhom/tetras/']) {
      const { html } = page(p)
      expect(html, p).toContain('CHUCAO')
      expect(html, p).toContain('Holger Krisp')
    }
    expect(page('/vi/cay/').html).toContain('Abhik.Mazumdar.73')
  })
  test('glossary pages honour quality.indexable', () => {
    expect(page('/vi/thuat-ngu/gh/').html).toMatch(/noindex/)
  })
})

test('a styled 404 page exists for the static host', () => {
  expect(page('/404').html).toContain('Không tìm thấy trang')
})

test("what's new lists changelog entries that exist, with links", () => {
  const { dom } = page('/vi/moi-cap-nhat/')
  const hrefs = dom.querySelectorAll('[data-changelog] a').map(a => a.getAttribute('href'))
  expect(hrefs).toEqual(['/vi/ca/ca-neon-vua/', '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/'])
})

test('static /go/ fallback pages exist for hosting without the Worker, and are noindex', () => {
  for (const n of ['shopee', 'lazada', 'tiki']) {
    const { html } = page(`/go/${n}/`)
    expect(html).toContain('noindex')
    expect(html).toMatch(/location\.replace/)
  }
})
