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
test('AdSense: ads.txt, account meta and loader on every page', () => {
  expect(readFileSync(join(DIST, 'ads.txt'), 'utf8')).toBe('google.com, pub-3032018142512489, DIRECT, f08c47fec0942fa0\n')
  const { dom } = page('/vi/ca/')
  expect(dom.querySelector('meta[name="google-adsense-account"]')?.getAttribute('content')).toBe('ca-pub-3032018142512489')
  expect(dom.querySelector('script[src*="adsbygoogle.js?client=ca-pub-3032018142512489"]')).not.toBeNull()
})
test('about, privacy and contact pages exist, are linked from the footer and listed in the sitemap', () => {
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  for (const p of ['/vi/gioi-thieu/', '/vi/chinh-sach-bao-mat/', '/vi/lien-he/']) {
    expect(() => page(p)).not.toThrow()
    expect(page('/vi/').dom.querySelector(`footer a[href="${p}"]`), p).not.toBeNull()
    expect(xml).toContain(p)
  }
  const privacy = page('/vi/chinh-sach-bao-mat/')
  expect(privacy.dom.querySelector('#english[lang="en"]')).not.toBeNull()
  expect(privacy.html).toContain('adssettings.google.com')
  expect(privacy.html).toContain('contact@aquatome.com')
})
