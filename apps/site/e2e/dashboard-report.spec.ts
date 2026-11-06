import { reportsPage, type Delivery } from '../worker/daily/page'
import { expect, test } from './fixtures'
import { LIVE } from './pages'

// The daily report's page on the owner's dashboard, drawn by the Worker's own function; its form posted to a stand-in for
// the Worker's route (dashboard.ts), which keeps the switches as the Worker does and answers with the page (the Worker
// answers 303 to it: Playwright doesn't route a fulfilled redirect's next request). On the live site the dashboard opens
// only to the owner, so this runs locally.
const NOW = new Date('2026-11-06T02:00:00Z')

test('the daily report\'s delivery: each switch is one button, the page says the state after; buttons fit a phone', async ({ page, errors }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  const d: Delivery = { settings: { email: true, push: false }, phones: 0, keyed: true }
  const posted: string[] = []
  await page.route(url => url.pathname.startsWith('/_ab/bao-cao/'), async route => {
    const r = route.request()
    if (new URL(r.url()).pathname === '/_ab/bao-cao/cai-dat' && r.method() === 'POST') {
      const form = new URLSearchParams(r.postData() ?? '')
      posted.push(form.toString())
      for (const k of ['email', 'push'] as const) if (form.has(k)) d.settings[k] = form.get(k) === '1'
    }
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: reportsPage({ now: NOW, tz: 'Asia/Ho_Chi_Minh', delivery: d, xs: [] }) })
  })
  await page.goto('/_ab/bao-cao/')
  const state = page.getByText(/^Email: /)
  await expect(state).toHaveText('Email: đang bật. Thông báo trên điện thoại: đang tắt.')
  for (const b of await page.locator('form button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await page.getByRole('button', { name: 'Bật thông báo' }).click()
  await expect(state).toContainText('đang bật, nhưng chưa có điện thoại nào đăng ký nên chưa gửi được.')
  await expect(page.getByRole('status')).toBeVisible()
  await page.getByRole('button', { name: 'Tắt email' }).click()
  await expect(state).toContainText('Email: đang tắt.')
  await expect(page.getByRole('button', { name: 'Bật email' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tắt thông báo' })).toBeVisible()
  expect(posted).toEqual(['push=1', 'email=0'])
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0)
  }
  expect(errors).toEqual([])
})
