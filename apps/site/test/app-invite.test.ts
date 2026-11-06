import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, type HTMLElement } from 'node-html-parser'
import { describe, expect, test } from 'vitest'
import { toMarkdown } from '../scripts/markdown'
import id from '../src/i18n/id.json'
import th from '../src/i18n/th.json'
import { APP_PAGES, APP_PT, APP_SCREENSHOTS, APP_STATE, APP_STORE_ID, appDevice, inviteCheck, openInApp, ownerReveal, storeLink, type AppState } from '../src/lib/app'
import { localizePath, toVi } from '../src/lib/i18n'
import { qrPath } from '../src/lib/qr'
import { APP_SWITCH } from '../worker/app-switch'
import { DIST } from './dist'

// The app's invitations (lib/app.ts; the switch, worker/app-switch.ts). Each state is read from a real fixture build:
// DIST is the switch's own (the build that deploys), and package.json's test builds the off and on states beside it
// (APP_INVITE_STATE), rather than components rendered alone: that runs the middleware's link rewriting and the build's
// check for untranslated strings too.
const BUILT = { off: 'dist-app-off', on: 'dist-app-on' } as const
const dirOf = (state: AppState) => (state === APP_STATE ? DIST : fileURLToPath(new URL(`../${BUILT[state as 'off' | 'on']}`, import.meta.url)))
const OFF = dirOf('off'), OWNER = DIST, ON = dirOf('on')
const ownerBuild = APP_SWITCH === 'owner'
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(f => (f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)]))
const read = (dir: string, path: string) => { const html = readFileSync(join(dir, path, 'index.html'), 'utf8'); return { html, dom: parse(html) } }
const on = (path: string) => read(ON, path)
const owner = (path: string) => read(OWNER, path)

/** Everything of the invitations a build has, by kind: what must be nothing while the switch is off. */
function found(dir: string): string[] {
  const kinds = new Set<string>()
  if (APP_PAGES.some(p => existsSync(join(dir, p)))) kinds.add('page')
  if (APP_PAGES.some(p => existsSync(join(dir, p, 'index.md')))) kinds.add('index.md')
  for (const f of files(dir).filter(f => /\.(html|xml|txt|md|json|js|css|svg)$/.test(f) && !f.includes('/pagefind/'))) {
    if (/\/app-store-\w+\.svg$/.test(f)) kinds.add('badge file')
    const text = readFileSync(f, 'utf8')
    if (text.includes('apple-itunes-app')) kinds.add('smart banner')
    if (text.includes('apps.apple.com')) kinds.add('store link')
    if (text.includes('aquatome://')) kinds.add('open in the app')
    if (text.includes('data-owner-only')) kinds.add('owner-only lines')
    if (/\bapp-invite\b|\bapp-store-badge\b/.test(text)) kinds.add('invitation')
    if (/<a\b[^>]*href="[^"]*\/(?:ung-dung|aplikasi|mobile-app)\/"/.test(text)) kinds.add('link to the page')
  }
  const named = (file: string) => APP_PAGES.some(p => readFileSync(join(dir, file), 'utf8').includes(p))
  if (named('sitemap.xml')) kinds.add('sitemap')
  if (named('llms.txt')) kinds.add('llms.txt')
  return [...kinds].sort()
}

describe('the switch', () => {
  test('is one of three states, and this branch ships it as the owner\'s', () => {
    expect(APP_SWITCH).toBe('owner')
  })
  test('off: the built site has none of it', () => {
    expect(found(OFF)).toEqual([])
  })
  test.runIf(ownerBuild)('owner: the invitations and the page are built, and nothing that would offer them to readers', () => {
    expect(found(OWNER)).toEqual(['badge file', 'invitation', 'link to the page', 'open in the app', 'owner-only lines', 'page', 'store link'])
  })
  test('on: the check finds each kind where it is', () => {
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
  // The pages, not the redirect stubs under /go/.
  const pages = (dir: string) => files(dir).filter(f => f.endsWith('.html')).map(f => parse(readFileSync(f, 'utf8'))).filter(dom => dom.querySelector('main'))
  test('on: every page names the app and its own https address', () => {
    const all = pages(ON)
    expect(all.length).toBeGreaterThan(100)
    for (const dom of all) {
      const canonical = dom.querySelector('link[rel="canonical"]')!.getAttribute('href')!
      expect(canonical).toMatch(/^https:\/\/aquatome\.com\//)
      expect(dom.querySelectorAll('meta[name="apple-itunes-app"]').map(m => m.getAttribute('content'))).toEqual([`app-id=${APP_STORE_ID}, app-argument=${canonical}`])
    }
  })
  test.runIf(ownerBuild)('owner: none, as Safari shows none before the store has the app', () => {
    for (const dom of pages(OWNER)) expect(dom.querySelector('meta[name="apple-itunes-app"]')).toBeNull()
  })
})

describe('the check that unhides an invitation', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
  type Link = { href: string; tapped?: () => void }
  /** Runs a check as a browser would, beside an invitation with or without the button; nothing else is in reach to store into. */
  const run = (script: string, ua: string, touch: number, cookie: string, place = { pathname: '/cong-cu/den-chihiros/', search: '', hash: '' }, button = true) => {
    const link: Link = { href: '' }
    const el = { hidden: true, querySelector: (s: string) => (s === '.open-app' && button ? { ...link, set href(v: string) { link.href = v }, addEventListener: (_: string, f: () => void) => { link.tapped = f } } : null) }
    const location = { origin: 'http://localhost:4321', ...place }
    new Function('navigator', 'document', 'location', script)({ userAgent: ua, maxTouchPoints: touch }, { cookie, currentScript: { previousElementSibling: el } }, location)
    return { shown: !el.hidden, link, location }
  }
  const shows = (script: string, ua: string, touch: number, cookie: string) => run(script, ua, touch, cookie, undefined, false).shown
  const OWNER_COOKIE = 'aq_lang=vi; aq_owner=1'
  test.each([
    ['an iPhone', IPHONE, 5, true],
    ['an iPad, a Mac with touch', MAC, 5, true],
    ['a Mac', MAC, 0, false],
    ['an Android phone', ANDROID, 5, false],
    ['the app\'s own web view', `${IPHONE} AquaTomeApp/1.4`, 5, false],
  ] as const)('%s: on, to anyone; owner, to the owner only', (_, ua, touch, device) => {
    expect(shows(inviteCheck('on'), ua, touch, '')).toBe(device)
    expect(shows(inviteCheck('owner'), ua, touch, OWNER_COOKIE)).toBe(device)
    expect(shows(inviteCheck('owner'), ua, touch, '')).toBe(false)
    expect(shows(inviteCheck('owner'), ua, touch, 'aq_owner=0; x_aq_owner=1')).toBe(false)
  })
  test('"Mở trong ứng dụng" hands the app the whole address on aquatome.com, whatever serves the copy, as of each tap', () => {
    const { link, location } = run(inviteCheck('owner'), IPHONE, 5, 'aq_owner=1', { pathname: '/cong-cu/nuoi-chung/', search: '?ca=x', hash: '#y' })
    expect(link.href).toBe('aquatome://open?url=https%3A%2F%2Faquatome.com%2Fcong-cu%2Fnuoi-chung%2F%3Fca%3Dx%23y')
    expect(link.href).toBe(openInApp('/cong-cu/nuoi-chung/?ca=x#y'))
    // A tool writes what the reader set into its address; the tap takes it as it is then.
    Object.assign(location, { search: '?ca=ca-neon-vua:6,ca-betta:1&l=60', hash: '' })
    link.tapped!()
    expect(link.href).toBe(`aquatome://open?url=${encodeURIComponent('https://aquatome.com/cong-cu/nuoi-chung/?ca=ca-neon-vua:6,ca-betta:1&l=60')}`)
    expect(decodeURIComponent(link.href.slice('aquatome://open?url='.length))).toBe('https://aquatome.com/cong-cu/nuoi-chung/?ca=ca-neon-vua:6,ca-betta:1&l=60')
  })
  test('the owner\'s lines come out of their template only with the flag', () => {
    const reveal = (cookie: string) => {
      const t = { content: 'lines', replaceWith: (x: unknown) => { t.out = x }, out: undefined as unknown }
      new Function('document', ownerReveal)({ cookie, currentScript: { previousElementSibling: t } })
      return t.out
    }
    expect(reveal('aq_owner=1')).toBe('lines')
    expect(reveal('')).toBeUndefined()
  })
})

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
/** A page's one invitation, as built: hidden, the check after it, the store link and badge in the page's language. */
function invitation(dom: HTMLElement, ct: Parameters<typeof storeLink>[0], lang: string, dir: string) {
  const [invite, ...more] = dom.querySelectorAll('.app-invite')
  expect(more).toEqual([])
  expect(invite!.hasAttribute('hidden')).toBe(true)
  expect(invite!.getAttribute('data-pagefind-ignore')).toBe('all')
  expect(invite!.querySelector('.app-store-badge')!.getAttribute('href')).toBe(storeLink(ct))
  const img = invite!.querySelector('img')!
  expect(img.getAttribute('src')).toBe(`/ung-dung/app-store-${lang}.svg`)
  expect(existsSync(join(dir, img.getAttribute('src')!))).toBe(true)
  expect(img.getAttribute('height')).toBe('44')
  expect(img.getAttribute('alt')).toMatch(/App Store/)
  expect(img.getAttribute('loading')).toBe('lazy') // hidden, it isn't fetched
  return { invite: invite!, check: invite!.nextElementSibling! }
}

describe('invitations, on: shown on an iPhone or iPad', () => {
  test.each(PLACED)('%s: its campaign code, the page\'s language\'s badge, no button to open the app', (path, ct, lang) => {
    const { invite, check } = invitation(on(path).dom, ct, lang, ON)
    expect(check.tagName).toBe('SCRIPT')
    expect(check.text).toBe(inviteCheck('on'))
    expect(invite.querySelector('.open-app')).toBeNull()
    expect(check.text).not.toContain('aquatome://')
  })
  test.each(['/', '/dang-nhap/', '/san-pham/oase-biomaster-350/', '/san-pham/chihiros-co2-diffuser/', '/gioi-thieu/'])('%s has none', path => {
    expect(on(path).dom.querySelectorAll('.app-invite')).toEqual([])
  })
  test('the light tool offers the app first, in the state a browser without Bluetooth shows, with Bluefy after it', () => {
    const state = on('/cong-cu/den-chihiros/').dom.querySelector('#ch-unsupported')!
    const kids = state.childNodes.filter(n => 'tagName' in n && (n as { tagName?: string }).tagName).map(n => n as HTMLElement)
    const invite = kids.findIndex(k => k.classList?.contains('app-invite'))
    expect(invite).toBeGreaterThanOrEqual(0)
    expect(kids.findIndex(k => k.text.includes('Bluefy'))).toBeGreaterThan(invite)
    expect(state.querySelector('.app-invite p')!.text).toBe('Trên iPhone, iPad: điều khiển đèn bằng ứng dụng AquaTome')
  })
  test('the light tool\'s intro and answer stop saying a browser is all it takes, and name the app before Bluefy', () => {
    const { dom, html } = on('/cong-cu/den-chihiros/')
    expect(dom.querySelector('p.intro')!.text).toContain('ngay trên Chrome hoặc Edge ở điện thoại Android và máy tính')
    expect(html).toContain('ở đó dùng ứng dụng AquaTome, hoặc trình duyệt Bluefy')
    expect(html).not.toContain('iPhone và iPad cần trình duyệt Bluefy')
  })
})

describe.runIf(ownerBuild)('invitations, owner: the same markup, the owner\'s only, with a button to open the page in the app', () => {
  test.each(PLACED)('%s', (path, ct, lang) => {
    const { invite, check } = invitation(owner(path).dom, ct, lang, OWNER)
    expect(check.text).toBe(inviteCheck('owner'))
    const open = invite.querySelector('.open-app')!
    expect(open.text).toBe({ vi: 'Mở trong ứng dụng', id: 'Buka di aplikasi', th: 'เปิดในแอป' }[lang])
    expect(open.getAttribute('href')).toBe(`aquatome://open?url=${encodeURIComponent(`https://aquatome.com${path}`)}`)
    expect(open.getAttribute('href')).toBe(openInApp(path))
    // Beside the badge.
    expect(open.parentNode).toBe(invite.querySelector('.app-store-badge')!.parentNode)
  })
  test('readers\' words stay as they are until the launch: the light tool still points iPhones to Bluefy', () => {
    const { dom, html } = owner('/cong-cu/den-chihiros/')
    expect(dom.querySelector('p.intro')!.text).toContain('ngay trên trình duyệt, không cần cài ứng dụng')
    expect(html).toContain('iPhone và iPad cần trình duyệt Bluefy')
  })
  test('the site\'s search has none of it', () => {
    const fragments = files(join(OWNER, 'pagefind/fragment')).map(f => gunzipSync(readFileSync(f)).toString('utf8'))
    expect(fragments.length).toBeGreaterThan(50)
    // Its words, and its badge as a result's picture (the first picture of a page is, unless it's left out).
    for (const words of ['App Store', 'aquatome://', 'Mở trong ứng dụng', 'Ứng dụng iPhone, iPad', 'Cẩm nang cũng có trên iPhone và iPad', 'điều khiển đèn bằng ứng dụng AquaTome', '/ung-dung/']) expect(fragments.filter(f => f.includes(words)), words).toEqual([])
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
  const FOOT = [['/', '/ung-dung/'], ['/id/', '/id/aplikasi/'], ['/th/', '/th/mobile-app/']]
  const ABOUT = [['/gioi-thieu/', '/ung-dung/'], ['/id/tentang/', '/id/aplikasi/'], ['/th/about/', '/th/mobile-app/']]
  test.each([...FOOT, ...ABOUT])('on: %s, for everyone', (path, page) => {
    const { dom } = on(path)
    expect(dom.querySelector(`${path.length > 4 ? 'main' : '.foot'} a[href="${page}"]`)).not.toBeNull()
    expect(dom.querySelector('template[data-owner-only]')).toBeNull()
  })
  // In a <template>: no reader, crawler, link check, search or markdown copy meets it; the owner's script puts it in.
  test.runIf(ownerBuild).each([...FOOT, ...ABOUT])('owner: %s, kept for the owner', (path, page) => {
    const { dom, html } = owner(path)
    const kept = dom.querySelectorAll('template[data-owner-only]')
    expect(kept).toHaveLength(path.length > 4 ? 2 : 1) // About's line, and the footer's
    expect(kept.some(t => t.querySelector(`a[href="${page}"]`))).toBe(true)
    expect(kept.every(t => t.nextElementSibling?.tagName === 'SCRIPT' && t.nextElementSibling.text === ownerReveal && t.getAttribute('data-pagefind-ignore') === 'all')).toBe(true)
    const outside = parse(html.replace(/<template\b[\s\S]*?<\/template>/g, ''))
    expect(outside.querySelector(`a[href="${page}"]`)).toBeNull()
  })
  test('About\'s line sits below the first screen: at the top, a line that wrapped differently once the web font came moved the whole page (layout shift 0.11 on a phone)', () => {
    expect(on('/gioi-thieu/').dom.querySelectorAll('main h2').map(h => h.text).indexOf('Ứng dụng')).toBeGreaterThan(2)
  })
})

describe('the app page', () => {
  test('its addresses, each way', () => {
    expect(APP_PAGES).toEqual(['vi', 'id', 'th'].map(l => localizePath(l as 'vi', '/vi/ung-dung/')))
    for (const p of APP_PAGES) expect(toVi(p)).toBe('/vi/ung-dung/')
  })
  test.each([
    ['/ung-dung/', 'vi', 'Miễn phí', 'iOS 17 trở lên', 'iPhone và iPad'],
    ['/id/aplikasi/', 'id', 'Gratis', 'iOS 17 atau lebih baru', 'iPhone dan iPad'],
    ['/th/mobile-app/', 'th', 'ฟรี', 'iOS 17 ขึ้นไป', 'iPhone และ iPad'],
  ])('on: %s: what it needs, the badge, a QR code in the page and no script for it', (path, lang, ...needs) => {
    const { dom } = on(path)
    expect(dom.querySelector('html')!.getAttribute('lang')).toBe(lang)
    expect(dom.querySelectorAll('.needs dd').map(d => d.text)).toEqual(needs)
    expect(dom.querySelector('main .get a')!.getAttribute('href')).toBe(storeLink('site-app-page'))
    expect(dom.querySelector('main .get img')!.getAttribute('src')).toBe(`/ung-dung/app-store-${lang}.svg`)
    const qr = dom.querySelector('main .qr svg')!
    expect(qr.getAttribute('role')).toBe('img')
    expect(qr.querySelector('path')!.getAttribute('d')).toBe(qrPath(storeLink('site-app-qr')).d)
    expect(dom.querySelectorAll('main script')).toEqual([])
    expect(new Set(dom.querySelectorAll('link[rel="alternate"]').map(l => new URL(l.getAttribute('href')!).pathname))).toEqual(new Set(APP_PAGES))
    expect(new URL(dom.querySelector('link[rel="canonical"]')!.getAttribute('href')!).pathname).toBe(path)
    expect(dom.querySelector('main')!.hasAttribute('data-pagefind-body')).toBe(true)
    expect(dom.querySelector('meta[name="robots"]')).toBeNull()
    // Promise only what the store listing does: no fish ID, nothing on TestFlight, no opened links, no ratings, no videos.
    expect(dom.querySelector('main')!.text).not.toMatch(/TestFlight|Nhận diện|Kenali ikan|Fish ID|★|video/i)
  })
  test.runIf(ownerBuild).each(APP_PAGES)('owner: %s is built, out of search engines and the site\'s search, with no markdown copy', path => {
    const { dom } = owner(path)
    expect(dom.querySelector('meta[name="robots"]')!.getAttribute('content')).toContain('noindex')
    expect(dom.querySelector('main')!.hasAttribute('data-pagefind-body')).toBe(false)
    expect(existsSync(join(OWNER, path, 'index.md'))).toBe(false)
  })
  test('no screenshot, no list: nothing stands in for them', () => {
    expect(APP_SCREENSHOTS).toEqual([])
    expect(on('/ung-dung/').dom.querySelector('.shots')).toBeNull()
    expect(on('/ung-dung/').dom.querySelectorAll('main img')).toHaveLength(1) // the badge
  })
  test('on: agents find it: the sitemap and llms.txt name it, and its markdown has the words and the link', () => {
    const sitemap = readFileSync(join(ON, 'sitemap.xml'), 'utf8')
    for (const p of APP_PAGES) expect(sitemap).toContain(`https://aquatome.com${p}</loc>`)
    expect(readFileSync(join(ON, 'llms.txt'), 'utf8')).toContain('https://aquatome.com/ung-dung/')
    const md = toMarkdown(on('/ung-dung/').html)!
    expect(md).toContain('Ổ cắm thông minh')
    expect(md).toContain(storeLink('site-app-page'))
  })
  test('the markdown copy of a page leaves its invitation out: it is for one kind of device', () => {
    expect(toMarkdown(on('/cong-cu/den-chihiros/').html)).not.toMatch(/App Store|apps\.apple\.com/)
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
