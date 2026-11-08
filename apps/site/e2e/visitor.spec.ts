import { VISITOR_STATS } from '../worker/stats-switch'
import { expect, test } from './fixtures'

// The visitor code and «Không đếm tôi» (src/lib/beacon.ts, the privacy page), once the visitor switch is on. The beacon's
// requests are read as the browser sends them (the fixture stops them before the site: a check is not a reader).
test.skip(!VISITOR_STATS, 'the visitor switch is off (worker/stats-switch.ts)')

const beacons = (page: import('@playwright/test').Page) => {
  const sent: { t: string; u?: string }[] = []
  page.on('request', r => { if (new URL(r.url()).pathname === '/_e' && r.method() === 'POST') sent.push(JSON.parse(r.postData() ?? '{}')) })
  return sent
}

test('«Không đếm tôi» deletes the visitor code and stops every event; pressed again, the browser counts again', async ({ page }) => {
  const sent = beacons(page)
  await page.goto('/chinh-sach-bao-mat/')
  await expect.poll(() => sent.length).toBeGreaterThan(0)
  expect(sent[0]!.u).toMatch(/^[a-z0-9]{4,12}$/)
  const button = page.getByRole('button', { name: 'Không đếm tôi' })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => [localStorage.getItem('aq_vid'), localStorage.getItem('aq_nocount')])).toEqual([null, '1'])
  sent.length = 0
  await page.goto('/')
  await page.waitForTimeout(1000)
  expect(sent).toEqual([])
  // Counted again: a new code.
  await page.goto('/chinh-sach-bao-mat/')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await page.goto('/')
  await expect.poll(() => sent.length).toBeGreaterThan(0)
  expect(sent[0]!.u).toMatch(/^[a-z0-9]{4,12}$/)
})

test('Global Privacy Control or Do Not Track: no visitor code is made or sent; the tab still counts', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }))
  const sent = beacons(page)
  await page.goto('/')
  await expect.poll(() => sent.length).toBeGreaterThan(0)
  expect(sent[0]!.u).toBe('')
  expect(await page.evaluate(() => localStorage.getItem('aq_vid'))).toBeNull()
})
