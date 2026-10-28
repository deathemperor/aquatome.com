import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { robotsTxt } from '../src/lib/seo'
import { DIST, page } from './dist'

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [] })

test('every vi page has exactly one canonical and a vi hreflang', () => {
  for (const f of htmlFiles(join(DIST, 'vi'))) {
    const html = readFileSync(f, 'utf8')
    expect(html.match(/rel="canonical"/g)?.length, f).toBe(1)
    expect(html, f).toContain('hreflang="vi"')
  }
})
test('sitemap lists indexable pages and omits noindex ones', () => {
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  expect(xml).toContain('/vi/ca/ca-neon-vua/')
  expect(xml).not.toContain('/vi/ca/ca-boraras-do/')
})
test('robots: production points to the sitemap, staging blocks everything', () => {
  expect(robotsTxt(false, 'https://example.com')).toBe('User-agent: *\nAllow: /\nDisallow: /go/\n\nSitemap: https://example.com/sitemap.xml\n')
  expect(robotsTxt(true, 'https://x.huuloc.com')).toBe('User-agent: *\nDisallow: /\n')
  expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain('Sitemap:')
})
test('search index is built and pages carry an accent-free search alias', () => {
  expect(existsSync(join(DIST, 'pagefind', 'pagefind.js'))).toBe(true)
  const { dom } = page('/vi/ca/ca-dia/')
  expect(dom.querySelector('main[data-pagefind-body]')).not.toBeNull()
  expect(dom.querySelector('[data-pagefind-index-attrs="data-ascii"]')?.getAttribute('data-ascii')).toContain('ca dia')
  expect(() => page('/vi/tim-kiem/')).not.toThrow()
})
test('sitemap omits noindex glossary terms', () => {
  expect(readFileSync(join(DIST, 'sitemap.xml'), 'utf8')).not.toContain('/vi/thuat-ngu/gh/')
})
