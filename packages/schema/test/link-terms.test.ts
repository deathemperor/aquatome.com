import { expect, test } from 'vitest'
import { linkTerms } from '../src/link-terms'

const T = [
  { key: 'species:a', href: '/vi/ca/neon-xanh/', names: ['Paracheirodon simulans', 'Cá neon xanh'] },
  { key: 'species:b', href: '/vi/ca/neon/', names: ['Cá neon'] },
  { key: 'genus:p', href: '/vi/phan-loai/p/', names: ['Paracheirodon'], exact: true },
  { key: 'equipment:loc', href: '/vi/thiet-bi/loc/', names: ['bộ lọc', 'máy lọc'] },
]

test('first occurrence per target, longest name wins, case-insensitive Vietnamese, exact Latin', () => {
  const html = '<p>Cá neon xanh và cá neon. Lại cá neon xanh (Paracheirodon simulans). Chi Paracheirodon, không phải paracheirodon. Cần Bộ lọc tốt.</p>'
  const r = linkTerms(html, T, 'ml')
  expect(r.keys).toEqual(['species:a', 'species:b', 'genus:p', 'equipment:loc'])
  expect(r.html).toContain('<a href="/vi/ca/neon-xanh/" class="ml">Cá neon xanh</a> và <a href="/vi/ca/neon/" class="ml">cá neon</a>')
  expect(r.html).toContain('Chi <a href="/vi/phan-loai/p/" class="ml">Paracheirodon</a>, không phải paracheirodon')
  expect(r.html).toContain('<a href="/vi/thiet-bi/loc/" class="ml">Bộ lọc</a>')
  expect(r.html.match(/neon-xanh/g)).toHaveLength(1)
})

test('never inside existing links or headings; seen carries across calls; no-hit html is unchanged', () => {
  const r = linkTerms('<h2>Cá neon</h2><p><a href="/x">cá neon</a> rồi cá neon</p>', T, 'ml')
  expect(r.html).toBe('<h2>Cá neon</h2><p><a href="/x">cá neon</a> rồi <a href="/vi/ca/neon/" class="ml">cá neon</a></p>')
  const seen = new Set(['species:b'])
  expect(linkTerms('<p>cá neon</p>', T, 'ml', seen)).toEqual({ html: '<p>cá neon</p>', keys: [] })
  expect(linkTerms('<p>Cá neonxanh</p>', T, 'ml').keys).toEqual([]) // word boundaries
})

test('a page never links its own names, even when another page shares them; per-target class', () => {
  const targets = [{ key: 'species:other', href: '/vi/ca/other/', names: ['Cá chạch mặt ngựa lùn'] }, { key: 'glossary:ph', href: '/vi/thuat-ngu/ph/', names: ['pH'], cls: 'gl' }]
  const r = linkTerms('<p>Cá chạch mặt ngựa lùn ưa pH thấp.</p>', targets, 'ml', new Set(), new Set(['cá chạch mặt ngựa lùn']))
  expect(r.html).toBe('<p>Cá chạch mặt ngựa lùn ưa <a href="/vi/thuat-ngu/ph/" class="gl">pH</a> thấp.</p>')
})

test('a target with a tip carries it on the link, escaped', () => {
  const targets = [{ key: 'glossary:nh3', href: '/vi/thuat-ngu/amoniac/', names: ['Amoniac', 'NH3'], cls: 'gl', tip: { term: 'Amoniac', text: 'Chất "độc" <với> cá & tép' } }]
  expect(linkTerms('<p>Đo NH3 mỗi tuần.</p>', targets, 'ml').html).toBe('<p>Đo <a href="/vi/thuat-ngu/amoniac/" class="gl" data-term="Amoniac" data-tip="Chất &quot;độc&quot; &lt;với> cá &amp; tép">NH3</a> mỗi tuần.</p>')
})
