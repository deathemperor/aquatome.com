import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import { describe, expect, test } from 'vitest'
import { toMarkdown } from '../scripts/markdown'
import id from '../src/i18n/id.json'
import th from '../src/i18n/th.json'
import { APP_ON, APP_PT, APP_SCREENSHOTS, APP_STORE_ID, appDevice, storeLink } from '../src/lib/app'
import { localizePath, toVi } from '../src/lib/i18n'
import { qrPath } from '../src/lib/qr'
import { DIST } from './dist'

// The app's invitations (lib/app.ts) are off until the store launch. The off state is read from the real build; the on
// state from a second real build, dist-app-on (package.json's test: APP_INVITE_PREVIEW=1), rather than components
// rendered alone: that runs the middleware's link rewriting and the build's check for untranslated strings too.
const ON = fileURLToPath(new URL('../dist-app-on', import.meta.url))
const PAGES = ['/ung-dung/', '/id/aplikasi/', '/th/mobile-app/']
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(f => (f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)]))
const on = (path: string) => { const html = readFileSync(join(ON, path, 'index.html'), 'utf8'); return { html, dom: parse(html) } }

/** Everything of the invitations a build has, by kind: what must be nothing while the switch is off. */
function found(dir: string): string[] {
  const kinds = new Set<string>()
  if (PAGES.some(p => existsSync(join(dir, p)))) kinds.add('page')
  if (PAGES.some(p => existsSync(join(dir, p, 'index.md')))) kinds.add('index.md')
  for (const f of files(dir).filter(f => /\.(html|xml|txt|md|json|js|css|svg)$/.test(f) && !f.includes('/pagefind/'))) {
    if (/\/app-store-\w+\.svg$/.test(f)) kinds.add('badge file')
    const text = readFileSync(f, 'utf8')
    if (text.includes('apple-itunes-app')) kinds.add('smart banner')
    if (text.includes('apps.apple.com')) kinds.add('store link')
    if (/\bapp-invite\b|\bapp-store-badge\b/.test(text)) kinds.add('invitation')
    if (/<a\b[^>]*href="[^"]*\/(?:ung-dung|aplikasi|mobile-app)\/"/.test(text)) kinds.add('link to the page')
  }
  const named = (file: string) => PAGES.some(p => readFileSync(join(dir, file), 'utf8').includes(p))
  if (named('sitemap.xml')) kinds.add('sitemap')
  if (named('llms.txt')) kinds.add('llms.txt')
  return [...kinds].sort()
}

describe('the switch', () => {
  test.skipIf(APP_ON)('off: the built site has none of it', () => {
    expect(found(DIST)).toEqual([])
  })
  test('the check finds each kind where it is', () => {
    expect(found(ON)).toEqual(['badge file', 'invitation', 'link to the page', 'llms.txt', 'page', 'sitemap', 'smart banner', 'store link'])
  })
})

describe('App Store links', () => {
  test('carry the id, the placement and mt=8; pt only once there is one', () => {
    expect(APP_STORE_ID).toBe('6829188547')
    expect(storeLink('site-tanks', null)).toBe('https://apps.apple.com/app/id6829188547?ct=site-tanks&mt=8')
    expect(storeLink('site-tanks', '12345')).toBe('https://apps.apple.com/app/id6829188547?pt=12345&ct=site-tanks&mt=8')
    expect(storeLink('site-tanks')).toBe(storeLink('site-tanks', APP_PT))
  })
  test('no link to the store is sponsored, so the readers\' beacon doesn\'t count it', () => {
    const links = files(ON).filter(f => f.endsWith('index.html')).flatMap(f => parse(readFileSync(f, 'utf8')).querySelectorAll('a[href^="https://apps.apple.com/"]'))
    expect(links.length).toBeGreaterThan(5)
    for (const a of links) expect(a.getAttribute('rel') ?? '').not.toContain('sponsored')
  })
})

describe('Safari\'s Smart App Banner', () => {
  test('every page names the app and its own https address', () => {
    // The pages, not the redirect stubs under /go/.
    const pages = files(ON).filter(f => f.endsWith('.html')).map(f => parse(readFileSync(f, 'utf8'))).filter(dom => dom.querySelector('main'))
    expect(pages.length).toBeGreaterThan(100)
    for (const dom of pages) {
      const canonical = dom.querySelector('link[rel="canonical"]')!.getAttribute('href')!
      expect(canonical).toMatch(/^https:\/\/aquatome\.com\//)
      expect(dom.querySelectorAll('meta[name="apple-itunes-app"]').map(m => m.getAttribute('content'))).toEqual([`app-id=${APP_STORE_ID}, app-argument=${canonical}`])
    }
  })
})

describe('invitations shown on an iPhone or iPad', () => {
  const PLACED: [string, Parameters<typeof storeLink>[0], string][] = [
    ['/cong-cu/den-chihiros/', 'site-light-tool', 'vi'],
    ['/id/alat/lampu-chihiros/', 'site-light-tool', 'id'],
    ['/th/tools/chihiros-light/', 'site-light-tool', 'th'],
    ['/cong-cu/be-cua-toi/', 'site-tanks', 'vi'],
    ['/id/alat/akuarium-saya/', 'site-tanks', 'id'],
    ['/th/tools/my-tanks/', 'site-tanks', 'th'],
    ['/san-pham/chihiros-wrgb-ii/', 'site-product', 'vi'],
    ['/san-pham/tuya-power-strip/', 'site-product', 'vi'],
  ]
  test.each(PLACED)('%s: hidden until the check beside it, its campaign code, the page\'s language\'s badge', (path, ct, lang) => {
    const { dom } = on(path)
    const [invite, ...more] = dom.querySelectorAll('.app-invite')
    expect(more).toEqual([])
    expect(invite!.hasAttribute('hidden')).toBe(true)
    expect(invite!.querySelector('a')!.getAttribute('href')).toBe(storeLink(ct))
    const img = invite!.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`/ung-dung/app-store-${lang}.svg`)
    expect(existsSync(join(ON, img.getAttribute('src')!))).toBe(true)
    expect(img.getAttribute('height')).toBe('44')
    expect(img.getAttribute('alt')).toMatch(/App Store/)
    const check = invite!.nextElementSibling!
    expect(check.tagName).toBe('SCRIPT')
    // iPhone and iPad (a Mac with touch), never the app's own web view; nothing kept.
    for (const part of ['iP(hone|ad|od)', 'Macintosh', 'maxTouchPoints', 'AquaTomeApp\\/']) expect(check.text).toContain(part)
    expect(check.text).not.toMatch(/localStorage|sessionStorage|cookie|sendBeacon|fetch/)
  })
  test.each(['/', '/dang-nhap/', '/san-pham/oase-biomaster-350/', '/san-pham/chihiros-co2-diffuser/', '/gioi-thieu/'])('%s has none', path => {
    expect(on(path).dom.querySelectorAll('.app-invite')).toEqual([])
  })
  test('the light tool offers the app first, in the state a browser without Bluetooth shows, with Bluefy after it', () => {
    const state = on('/cong-cu/den-chihiros/').dom.querySelector('#ch-unsupported')!
    const kids = state.childNodes.filter(n => 'tagName' in n && (n as { tagName?: string }).tagName).map(n => n as ReturnType<typeof parse>)
    const invite = kids.findIndex(k => k.classList?.contains('app-invite'))
    const bluefy = kids.findIndex(k => k.text.includes('Bluefy'))
    expect(invite).toBeGreaterThanOrEqual(0)
    expect(bluefy).toBeGreaterThan(invite)
    expect(state.querySelector('.app-invite p')!.text).toBe('Trên iPhone, iPad: điều khiển đèn bằng ứng dụng AquaTome')
  })
  test('with the switch on, the light tool\'s answer names the app before Bluefy; off, it says what it said', () => {
    const faq = on('/cong-cu/den-chihiros/').html
    expect(faq).toContain('ở đó dùng ứng dụng AquaTome, hoặc trình duyệt Bluefy')
    expect(faq).not.toContain('iPhone và iPad cần trình duyệt Bluefy')
    if (!APP_ON) expect(readFileSync(join(DIST, 'cong-cu/den-chihiros/index.html'), 'utf8')).toContain('iPhone và iPad cần trình duyệt Bluefy')
  })
})

describe('what the app controls, from the catalog\'s data', () => {
  const product = (brand: string, model: string, category: string, name = `${brand} ${model}`, specs: string[] = [], type?: string) => ({ brand, model, category, type, specs: specs.map(value => ({ key: 'x', value })), t: { name } }) as unknown as Parameters<typeof appDevice>[0]
  test.each([
    [product('Chihiros', 'WRGB II', 'den'), 'light'],
    [product('Chihiros', 'WRGB II Slim', 'den'), 'light'],
    [product('Chihiros', 'C', 'den'), 'light'],
    [product('Chihiros', 'CO2 Diffuser', 'co2'), undefined],
    [product('Chihiros', 'C', 'co2'), undefined], // the same model name on something that isn't a light
    [product('Chihiros', 'Z Light Tiny', 'den'), undefined], // a Chihiros the app doesn't drive
    [product('Chihiros', 'X300', 'den'), undefined],
    [product('Week Aqua', 'WRGB II', 'den'), undefined],
    [product('Tuya', 'Power Strip P4', 'khac'), 'strip'],
    [product('Gosund', 'P1', 'khac', 'Ổ cắm Gosund P1', ['Smart Life']), 'strip'],
    [product('Tuya', 'Heater 300', 'suoi'), undefined], // Tuya's, but no strip: the app switches a strip's outlets
    [product('Oase', 'BioMaster 350', 'loc'), undefined],
  ])('%o is %s', (p, want) => {
    expect(appDevice(p)).toBe(want)
  })
})

describe('the footer and About page link to the app page', () => {
  test.each([['/', '/ung-dung/'], ['/id/', '/id/aplikasi/'], ['/th/', '/th/mobile-app/']])('%s', (home, page) => {
    expect(on(home).dom.querySelector(`.foot a[href="${page}"]`)).not.toBeNull()
  })
  test.each([['/gioi-thieu/', '/ung-dung/'], ['/id/tentang/', '/id/aplikasi/'], ['/th/about/', '/th/mobile-app/']])('%s', (about, page) => {
    expect(on(about).dom.querySelector(`main a[href="${page}"]`)).not.toBeNull()
  })
})

test('About\'s line sits below the first screen: at the top, a line that wrapped differently once the web font came moved the whole page (layout shift 0.11 on a phone)', () => {
  expect(on('/gioi-thieu/').dom.querySelectorAll('main h2').map(h => h.text).indexOf('Ứng dụng')).toBeGreaterThan(2)
})

describe('the app page', () => {
  test('its addresses, each way', () => {
    expect(PAGES).toEqual(['vi', 'id', 'th'].map(l => localizePath(l as 'vi', '/vi/ung-dung/')))
    for (const p of PAGES) expect(toVi(p)).toBe('/vi/ung-dung/')
  })
  test.each([
    ['/ung-dung/', 'vi', 'Miễn phí', 'iOS 17 trở lên', 'iPhone và iPad'],
    ['/id/aplikasi/', 'id', 'Gratis', 'iOS 17 atau lebih baru', 'iPhone dan iPad'],
    ['/th/mobile-app/', 'th', 'ฟรี', 'iOS 17 ขึ้นไป', 'iPhone และ iPad'],
  ])('%s: what it needs, the badge, a QR code in the page and no script for it', (path, lang, ...needs) => {
    const { dom } = on(path)
    expect(dom.querySelector('html')!.getAttribute('lang')).toBe(lang)
    expect(dom.querySelectorAll('.needs dd').map(d => d.text)).toEqual(needs)
    expect(dom.querySelector('main .get a')!.getAttribute('href')).toBe(storeLink('site-app-page'))
    expect(dom.querySelector('main .get img')!.getAttribute('src')).toBe(`/ung-dung/app-store-${lang}.svg`)
    const qr = dom.querySelector('main .qr svg')!
    expect(qr.getAttribute('role')).toBe('img')
    expect(qr.querySelector('path')!.getAttribute('d')).toBe(qrPath(storeLink('site-app-qr')).d)
    expect(dom.querySelectorAll('main script')).toEqual([])
    expect(new Set(dom.querySelectorAll('link[rel="alternate"]').map(l => new URL(l.getAttribute('href')!).pathname))).toEqual(new Set(PAGES))
    expect(new URL(dom.querySelector('link[rel="canonical"]')!.getAttribute('href')!).pathname).toBe(path)
    expect(dom.querySelector('main')!.hasAttribute('data-pagefind-body')).toBe(true)
    // Promise only what the store listing does: no fish ID, nothing on TestFlight, no opened links, no ratings.
    expect(dom.querySelector('main')!.text).not.toMatch(/TestFlight|Nhận diện|Kenali ikan|Fish ID|★/i)
  })
  test('no screenshot, no list: nothing stands in for them', () => {
    expect(APP_SCREENSHOTS).toEqual([])
    expect(on('/ung-dung/').dom.querySelector('.shots')).toBeNull()
    expect(on('/ung-dung/').dom.querySelectorAll('main img')).toHaveLength(1) // the badge
  })
  test('agents find it: the sitemap and llms.txt name it, and its markdown has the words and the link', () => {
    const sitemap = readFileSync(join(ON, 'sitemap.xml'), 'utf8')
    for (const p of PAGES) expect(sitemap).toContain(`https://aquatome.com${p}</loc>`)
    expect(readFileSync(join(ON, 'llms.txt'), 'utf8')).toContain('https://aquatome.com/ung-dung/')
    const md = toMarkdown(on('/ung-dung/').html)!
    expect(md).toContain('Ổ cắm thông minh')
    expect(md).toContain(storeLink('site-app-page'))
  })
  test('the QR code is one path, starting with its first finder pattern', () => {
    const { size, d } = qrPath(storeLink('site-app-qr'))
    expect(size).toBeGreaterThanOrEqual(21)
    expect(d.startsWith('M0 0h7v1h-7z')).toBe(true)
    expect(d).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/)
  })
})

test('every string of the invitations has Indonesian and Thai, also those no page of that language renders yet', () => {
  const sources = ['components/AppInvite.astro', 'components/AppProductInvite.astro', 'components/AppStoreBadge.astro', 'pages/ung-dung/[...path].astro']
  const strings = sources.flatMap(f => [...readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').matchAll(/\bt\('((?:\\.|[^'])*)'/g)].map(m => m[1]!))
  expect(strings.length).toBeGreaterThan(20)
  for (const s of strings) for (const [lang, dict] of [['id', id], ['th', th]] as const) expect((dict as Record<string, string>)[s], `${lang}: ${s}`).toBeTruthy()
})
