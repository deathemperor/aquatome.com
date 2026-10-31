import { expect, test } from 'vitest'
import { isVietnamese, langOf, localizeLinks, localizePath, routeIn, translator } from '../src/lib/i18n'

test('a page file mounted in each language', () => {
  expect(routeIn('vi', 'index.astro')).toBe('/vi')
  expect(routeIn('id', 'index.astro')).toBe('/id')
  expect(routeIn('id', 'ca/[slug].astro')).toBe('/id/ikan/[slug]')
  expect(routeIn('th', 'ca/[slug]/anh.astro')).toBe('/th/fish/[slug]/photos')
  expect(routeIn('id', 'cong-cu/the-tich-be.astro')).toBe('/id/alat/volume-akuarium')
  expect(routeIn('th', 'cong-cu/den-chihiros.astro')).toBe('/th/tools/chihiros-light')
  expect(routeIn('id', 'cong-cu/nuoi-chung.astro')).toBe('/id/alat/kecocokan-ikan')
  expect(routeIn('th', 'cong-cu/nuoi-chung.astro')).toBe('/th/tools/tank-mates')
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

test('served: the pilot pages; a link to a page the language lacks keeps its text only', async () => {
  const { served, toVi } = await import('../src/lib/i18n')
  expect(served('vi', '/vi/thiet-bi/loc/')).toBe(true)
  expect(served('id', '/vi/ca/x/?q=1')).toBe(true)
  expect(served('id', '/vi/ca/x/anh/')).toBe(true)
  expect(served('id', '/vi/video/x/')).toBe(false)
  expect(served('th', '/vi/cong-cu/the-tich-be/')).toBe(true)
  expect(served('id', '/vi/cong-cu/nuoi-chung/?ca=x')).toBe(true)
  expect(served('th', '/vi/thiet-bi/loc/')).toBe(true)
  expect(served('th', '/vi/video/x/')).toBe(false)
  expect(localizeLinks('<a href="/vi/video/x/" class="x">Video</a> <a href="/vi/ca/">Fish</a> <a href="/vi/video/" hreflang="vi">vi</a>', 'id', ''))
    .toBe('Video <a href="/id/ikan/">Fish</a> <a href="/vi/video/" hreflang="vi">vi</a>')
  expect(toVi('/id/ikan/x/foto/')).toBe('/vi/ca/x/anh/')
  expect(toVi('/th/tools/tank-volume/')).toBe('/vi/cong-cu/the-tich-be/')
  expect(toVi('/id/alat/lampu-chihiros/')).toBe('/vi/cong-cu/den-chihiros/')
  expect(localizePath('id', '/vi/cong-cu/den-chihiros/#lich')).toBe('/id/alat/lampu-chihiros/#lich')
  expect(localizePath('th', '/vi/cong-cu/nuoi-chung/?ca=x:6')).toBe('/th/tools/tank-mates/?ca=x:6')
  expect(toVi('/id/alat/kecocokan-ikan/')).toBe('/vi/cong-cu/nuoi-chung/')
  expect(toVi('/vi/ca/')).toBe('/vi/ca/')
})

test('licence: the stored permission note is translated, licence names are not', async () => {
  const { licenceLabel, translator } = await import('../src/lib/i18n')
  expect(licenceLabel(translator('id'), 'dùng với sự cho phép')).toBe('digunakan dengan izin')
  expect(licenceLabel(translator('vi'), 'dùng với sự cho phép')).toBe('dùng với sự cho phép')
  expect(licenceLabel(translator('th'), 'CC BY 4.0')).toBe('CC BY 4.0')
})

test('every UI translation keeps its {placeholders} and Pagefind [PLACEHOLDERS]', async () => {
  const marks = (s: string) => [...s.matchAll(/\{\w+\}|\[[A-Z_]+\]/g)].map(m => m[0]).sort()
  for (const lang of ['id', 'th']) {
    const dict = (await import(`../src/i18n/${lang}.json`)).default as Record<string, string>
    const lost = Object.entries(dict).filter(([vi, tr]) => marks(vi).join() !== marks(tr).join()).map(([vi]) => vi)
    expect(lost, lang).toEqual([])
  }
})

test('a [...rest] page is served at its index too', async () => {
  const { served } = await import('../src/lib/i18n')
  expect(served('id', '/vi/nguon-goc/')).toBe(true)
  expect(served('id', '/vi/nguon-goc/asia/indonesia/')).toBe(true)
  expect(served('th', '/vi/phan-loai/')).toBe(true)
  expect(served('id', '/vi/video/')).toBe(false)
})

test('a Vietnamese source title is told apart from Spanish or Portuguese ones', () => {
  for (const s of ['Cá Ping Pong (Pearlscale Goldfish) – Sen A', 'Cá betta (cá xiêm) - Hoàng Hà Mobile', 'Vẻ đẹp của dòng cá Betta Halfmoon', 'Cá dĩa', 'Tép Blue Dream - Blue Velvet Shrimp']) expect(isVietnamese(s), s).toBe(true)
  for (const s of ['Tereso Hernández Morales', 'Río Orinoco', 'São Paulo', 'Seriously Fish', 'Balloon Molly - Aquariadise']) expect(isVietnamese(s), s).toBe(false)
})

test('language menu: this page in that language, else the nearest page the language has, else its home', async () => {
  const { switchTo } = await import('../src/lib/i18n')
  expect(switchTo('id', '/vi/ca/ca-neon-vua/', '/id/ikan/neon-kardinal/', true)).toBe('/id/ikan/neon-kardinal/')
  expect(switchTo('th', '/vi/ca/ca-neon-vua/', undefined, true)).toBe('/th/fish/') // no Thai page for this fish
  expect(switchTo('id', '/vi/ca/x/anh/', undefined, true)).toBe('/id/ikan/')
  expect(switchTo('id', '/vi/video/kenh/abc/', undefined, true)).toBe('/id/') // no video section in Indonesian
  expect(switchTo('th', '/vi/moi-cap-nhat/', undefined, false)).toBe('/th/')
  expect(switchTo('vi', '/vi/ca/ca-neon-vua/', undefined, true)).toBe('/vi/ca/')
  expect(switchTo('id', '/404', undefined, false)).toBe('/id/') // not a /vi/…/ path (the 404 page)
  expect(switchTo('th', '/vi/ca', undefined, false)).toBe('/th/')
})
