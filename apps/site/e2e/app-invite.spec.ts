import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { devices, type Page } from '@playwright/test'
import { expect, test, VIETNAMESE } from './fixtures'
import { LIVE } from './pages'

// The app's invitations with the switch on (lib/app.ts). The site is off until the store launch, so each page here comes
// from dist-app-on, the on state's build `pnpm test` leaves: the browser's requests for this site are answered from it.
test.skip(LIVE, 'the switch is off on the live site')

const ON_BUILD = resolve('dist-app-on')
async function fromOnBuild(page: Page, baseURL: string) {
  const own = new URL(baseURL).origin
  await page.route(url => url.origin === own && url.pathname !== '/_e', route => {
    const at = join(ON_BUILD, decodeURIComponent(new URL(route.request().url()).pathname))
    const file = existsSync(at) && statSync(at).isDirectory() ? join(at, 'index.html') : at
    return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, path: join(ON_BUILD, '404.html') })
  })
}

const IPHONE = devices['iPhone 15'].userAgent
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
const READERS = [
  { who: 'an iPhone', userAgent: IPHONE, touch: 5, sees: true },
  { who: 'an iPad, which says it is a Mac with touch', userAgent: MAC, touch: 5, sees: true },
  { who: 'a Mac', userAgent: MAC, touch: 0, sees: false },
  { who: 'an Android phone', userAgent: devices['Pixel 7'].userAgent, touch: 5, sees: false },
  { who: 'a computer', userAgent: devices['Desktop Chrome'].userAgent, touch: 0, sees: false },
  { who: 'the app\'s own web view', userAgent: `${IPHONE} AquaTomeApp/1.4`, touch: 5, sees: false },
]

for (const { who, userAgent, touch, sees } of READERS) {
  test.describe(who, () => {
    test.use({ userAgent })
    test.beforeEach(async ({ page, baseURL }, info) => {
      test.skip(info.project.name !== 'desktop', 'the reader here is the user agent: one browser is enough')
      await fromOnBuild(page, baseURL!)
      // Safari has no Web Bluetooth, and the touch points are what tell an iPad from a Mac.
      await page.addInitScript(n => {
        delete (Navigator.prototype as { bluetooth?: unknown }).bluetooth
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n })
      }, touch)
    })

    test(`the light tool ${sees ? 'offers the app first, then Bluefy' : 'says nothing of the app'}`, async ({ page, errors }) => {
      const badges: string[] = []
      page.on('request', r => { if (r.url().includes('/ung-dung/app-store-')) badges.push(r.url()) })
      await page.goto('/cong-cu/den-chihiros/')
      const state = page.locator('#ch-unsupported')
      await expect(state).toBeVisible()
      await expect(state.locator('p', { hasText: 'Bluefy' })).toBeVisible()
      const invite = state.locator('.app-invite')
      if (sees) {
        await expect(invite).toBeVisible()
        await expect(invite).toContainText('Trên iPhone, iPad: điều khiển đèn bằng ứng dụng AquaTome')
        await expect(invite.getByRole('link', { name: 'Tải về trên App Store' })).toHaveAttribute('href', 'https://apps.apple.com/app/id6829188547?ct=site-light-tool&mt=8')
        await expect.poll(() => invite.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
        expect(await invite.evaluate(el => el.compareDocumentPosition(el.parentElement!.querySelectorAll('p:not(.app-invite p)')[1]!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()
      } else {
        await expect(invite).toBeHidden()
        await page.waitForLoadState('load')
        expect(badges, 'a hidden badge isn\'t fetched').toEqual([])
      }
      expect(errors).toEqual([])
    })

    test(`a light and a strip the app controls ${sees ? 'offer it' : 'don\'t show it'}, other products never`, async ({ page }) => {
      for (const slug of ['chihiros-wrgb-ii', 'tuya-power-strip']) {
        await page.goto(`/san-pham/${slug}/`)
        const invite = page.locator('.app-invite')
        await expect(invite).toHaveCount(1)
        if (sees) await expect(invite).toBeVisible()
        else await expect(invite).toBeHidden()
      }
      for (const slug of ['oase-biomaster-350', 'chihiros-co2-diffuser']) {
        await page.goto(`/san-pham/${slug}/`)
        await expect(page.locator('.app-invite')).toHaveCount(0)
      }
    })

    test(`"Bể của tôi" ${sees ? 'unhides' : 'keeps hidden'} the store link in its account section`, async ({ page }) => {
      await page.goto('/cong-cu/be-cua-toi/')
      // Inside a section that waits for an accounts server: what the check did is the attribute.
      const invite = page.locator('#tai-khoan .app-invite')
      await expect(invite).toHaveCount(1)
      expect(await invite.evaluate((el: HTMLElement) => el.hidden)).toBe(!sees)
    })
  })
}

test.describe('the app page', () => {
  test.beforeEach(({ page, baseURL }) => fromOnBuild(page, baseURL!))

  for (const [path, lang] of [['/ung-dung/', 'vi'], ['/id/aplikasi/', 'id'], ['/th/mobile-app/', 'th']] as const) {
    test(`${path}: the badge in its language, the QR code on a computer only, no sideways scroll at 320 px`, async ({ page, errors }, info) => {
      await page.goto(path)
      await expect(page.locator('h1')).toHaveCount(1)
      const badge = page.locator('.get .app-store-badge')
      await expect(badge).toBeVisible()
      await expect(badge).toHaveAttribute('href', 'https://apps.apple.com/app/id6829188547?ct=site-app-page&mt=8')
      await expect(badge.locator('img')).toHaveAttribute('src', `/ung-dung/app-store-${lang}.svg`)
      await expect.poll(() => badge.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
      const box = (await badge.boundingBox())!
      expect(box.height, 'Apple\'s minimum is 40 px, and a tap target 44').toBeGreaterThanOrEqual(44)
      const qr = page.locator('.qr')
      if (info.project.name === 'desktop') await expect(qr).toBeVisible()
      else await expect(qr).toBeHidden()
      if (lang !== 'vi') expect(await page.locator('main').innerText()).not.toMatch(VIETNAMESE)
      await page.setViewportSize({ width: 320, height: 640 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      expect(errors).toEqual([])
    })
  }

  test('the footer takes a reader there, on any device', async ({ page }) => {
    await page.goto('/cong-cu/the-tich-be/')
    await page.locator('.foot').getByRole('link', { name: 'Ứng dụng iPhone, iPad' }).click()
    await expect(page).toHaveURL(/\/ung-dung\/$/)
    await expect(page.locator('h1')).toHaveText('Ứng dụng AquaTome')
  })
})
