import { expect, test } from 'vitest'
import { langOf, localizeLinks, localizePath, routeIn, translator } from '../src/lib/i18n'

test('a page file mounted in each language', () => {
  expect(routeIn('vi', 'index.astro')).toBe('/vi')
  expect(routeIn('id', 'index.astro')).toBe('/id')
  expect(routeIn('id', 'ca/[slug].astro')).toBe('/id/ikan/[slug]')
  expect(routeIn('th', 'ca/[slug]/anh.astro')).toBe('/th/fish/[slug]/photos')
  expect(routeIn('id', 'cong-cu/the-tich-be.astro')).toBe('/id/alat/volume-akuarium')
  expect(routeIn('th', 'video/kenh/[slug].astro')).toBe('/th/video/channel/[slug]')
  expect(routeIn('id', 'nguon-goc/[...path].astro')).toBe('/id/asal/[...path]')
  expect(routeIn('id', 'ca/index.astro')).toBe('/id/ikan')
})

test('paths: sections and fixed segments, never a slug; query and hash kept', () => {
  expect(localizePath('id', '/vi/ca/anh/')).toBe('/id/ikan/anh/') // a fish whose slug is "anh" stays
  expect(localizePath('id', '/vi/ca/x/anh/?a=1#b')).toBe('/id/ikan/x/foto/?a=1#b')
  expect(localizePath('th', '/vi/')).toBe('/th/')
  expect(localizePath('vi', '/vi/ca/')).toBe('/vi/ca/')
  expect(localizePath('id', '/go/shopee/')).toBe('/go/shopee/')
})

test('links in a rendered page: own site only, language links untouched', () => {
  const html = '<a href="/vi/ca/x/">x</a><link rel="alternate" hreflang="vi" href="https://aquatome.com/vi/ca/y/"><img src="https://i.ytimg.com/vi/abc/hq.jpg">{"item":"https://aquatome.com/vi/cay/"} ["/vi/*"] <a href="https://example.com/vi/a/">e</a>'
  expect(localizeLinks(html, 'id', 'https://aquatome.com')).toBe(
    '<a href="/id/ikan/x/">x</a><link rel="alternate" hreflang="vi" href="https://aquatome.com/vi/ca/y/"><img src="https://i.ytimg.com/vi/abc/hq.jpg">{"item":"https://aquatome.com/id/tanaman/"} ["/id/*"] <a href="https://example.com/vi/a/">e</a>')
})

test('langOf: path or route pattern', () => {
  expect(langOf('/id/ikan/[slug]')).toBe('id')
  expect(langOf(new URL('https://aquatome.com/th/fish/'))).toBe('th')
  expect(langOf('/vi/ca/')).toBe('vi')
  expect(langOf('/go/x/')).toBe('vi')
})

test('t: Vietnamese as is, placeholders filled; a missing translation is recorded', async () => {
  const { missing } = await import('../src/lib/i18n')
  expect(translator('vi')('Các dòng từ {name}', { name: 'Cá A' })).toBe('Các dòng từ Cá A')
  expect(translator('id')('Chuỗi chưa dịch')).toBe('Chuỗi chưa dịch')
  expect(missing.get('id')?.has('Chuỗi chưa dịch')).toBe(true)
  missing.clear()
})

test('src/i18n/client.json lists every ct()/msg() string', async () => {
  const { execFileSync } = await import('node:child_process')
  expect(() => execFileSync('node', ['scripts/i18n-client.mjs', '--check'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' })).not.toThrow()
})
