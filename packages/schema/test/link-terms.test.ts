import { expect, test } from 'vitest'
import { headingSubject, linkTerms } from '../src/link-terms'

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

// 2026-11-01, the 5-gallon nano guide: "3. Cá neon xanh (Paracheirodon simulans)", then "cá neon xanh" in its text linked
// P. innesi, the site's "Cá neon xanh". The 11-fish guide: "8. Cá cherry barb (Puntius titteya)".
const fish = [
  { key: 'species:paracheirodon-innesi', href: '/vi/ca/ca-neon-xanh/', names: ['Paracheirodon innesi', 'Cá neon xanh', 'Cá neon thường'] },
  { key: 'species:paracheirodon-simulans', href: '/vi/ca/ca-neon-xanh-luc/', names: ['Paracheirodon simulans', 'Cá neon xanh lục'] },
  { key: 'species:puntius-titteya', href: '/vi/ca/ca-anh-dao/', names: ['Puntius titteya', 'Cá anh đào'] },
  { key: 'species:puntigrus-tetrazona', href: '/vi/ca/ca-tu-van/', names: ['Puntigrus tetrazona', 'Tiger barb'] },
  { key: 'genus:Paracheirodon', href: '/vi/phan-loai/p/', names: ['Paracheirodon'], exact: true },
  { key: 'group:tetras', href: '/vi/nhom/tetras/', names: ['cá tetra'] },
]
test('a name before a scientific name in brackets links to that species, on the whole page, the heading too', () => {
  const r = linkTerms('<h3>3. Cá neon xanh (Paracheirodon simulans)</h3><p>Nhìn qua thì cá neon xanh giống cá neon thường.</p>', fish, 'ml')
  expect(r.html).toContain('<a href="/vi/ca/ca-neon-xanh-luc/" class="ml">cá neon xanh</a> giống <a href="/vi/ca/ca-neon-xanh/" class="ml">cá neon thường</a>')
  expect(r.keys).toEqual(['species:paracheirodon-simulans', 'species:paracheirodon-innesi'])
  // A name the site doesn't have yet becomes the species' name on this page.
  const t = linkTerms('<h3>8. Cá cherry barb (Puntius titteya)</h3><p>Không như cá hổ (Tiger barb), cá cherry barb hiền.</p>', fish, 'ml')
  expect(t.html).toContain('<a href="/vi/ca/ca-anh-dao/" class="ml">cá cherry barb</a> hiền')
  expect(linkTerms('<p>Cá cherry barb (Puntius titteya) hiền.</p>', fish, 'ml').keys).toEqual(['species:puntius-titteya'])
})

test('a scientific name the site has no page for, in a genus it has, leaves the name unlinked; a group keeps its name', () => {
  expect(linkTerms('<p>Cá neon xanh (Paracheirodon axelrodi) đẹp.</p>', fish, 'ml').keys).toEqual(['genus:Paracheirodon'])
  expect(linkTerms('<p>Một loài cá tetra (Paracheirodon innesi) và cá tetra khác.</p>', fish, 'ml').html).toContain('<a href="/vi/nhom/tetras/" class="ml">cá tetra</a> (<a href="/vi/ca/ca-neon-xanh/"')
  expect(linkTerms('<p>Cá neon xanh (Paracheirodon innesi).</p>', fish, 'ml').html).toContain('<a href="/vi/ca/ca-neon-xanh/" class="ml">Cá neon xanh</a>')
})

test('what a heading is about: its scientific name in brackets decides, else the only fish it names', () => {
  expect(headingSubject('3. Cá neon xanh (Paracheirodon simulans)', fish)?.key).toBe('species:paracheirodon-simulans')
  expect(headingSubject('8. Cá cherry barb (Puntius titteya)', fish)?.key).toBe('species:puntius-titteya')
  expect(headingSubject('Cá anh đào', fish)?.key).toBe('species:puntius-titteya')
  expect(headingSubject('Cá anh đào và cá neon thường', fish)).toBeUndefined()
  expect(headingSubject('Lời kết', fish)).toBeUndefined()
  expect(headingSubject('11. Cá neon thường (Paracheirodon axelrodi)', fish)).toBeUndefined() // a species without a page here, whatever its name
})
