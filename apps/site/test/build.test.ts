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
  test('product slots are sponsored search links', () => {
    const a = dom.querySelector('a[href^="https://shopee.vn/search?keyword="]')
    expect(a?.getAttribute('rel')).toContain('sponsored')
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
