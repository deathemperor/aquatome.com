import type { Page } from '@playwright/test'
import { lastDays } from '../worker/admin/chart'
import { accountsPage, photosPage } from '../worker/admin/pages'
import { viewerZone } from '../worker/admin/time'
import { expect, test } from './fixtures'
import { LIVE } from './pages'

// The owner's dashboard pages, drawn by the Worker's own functions from sample counts (no sign-in: the page is served
// in place of /_ab/ here). On the live site the dashboard opens only to the owner, so these run locally.
const NOW = new Date('2026-11-04T09:00:00Z')
const days = lastDays(NOW, 30, 'Asia/Ho_Chi_Minh')
const ACCOUNTS = { days, users: 40, newUsers: days.map((_, i) => (i === 28 ? 3 : i % 4 === 0 ? 1 : 0)), synced: 9, openSessions: 12, credentials: [{ kind: 'google', n: 30 }], comments: [{ status: 'approved', n: 20 }], newComments: days.map((_, i) => i % 3) }
const PHOTO = { id: 'p', entity_ref: 'species:x', name: 'A', thumb: '/favicon.png', created_at: '2026-11-04T08:34:00.000Z' }

/** Serves `path` as the Worker draws it, in the zone the request's cookie names (as the dashboard does). */
async function serve(page: Page, path: string, html: (tz: string) => string) {
  await page.route(url => url.pathname === path, async route => {
    const tz = viewerZone(new Request(route.request().url(), { headers: await route.request().allHeaders() }))
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: html(tz) })
  })
}

test.describe('in Vietnam', () => {
  test.use({ timezoneId: 'Asia/Ho_Chi_Minh' })

  test('a chart\'s columns read out their day on a tap, a hover or the arrow keys; the totals come back after', async ({ page, errors, isMobile }) => {
    test.skip(LIVE, 'the live dashboard opens only to the owner')
    await serve(page, '/_ab/tai-khoan/', tz => accountsPage(ACCOUNTS, NOW, tz))
    await page.goto('/_ab/tai-khoan/')
    const chart = page.locator('figure[aria-labelledby="u-daily-t"]')
    const when = chart.locator('.readout .when')
    const value = chart.locator('.readout b')
    await expect(when).toHaveText('30 ngày')
    await expect(value).toHaveText('10')
    const yesterday = chart.locator('.cols li').nth(28)
    if (isMobile) await yesterday.tap()
    else await yesterday.hover()
    await expect(when).toHaveText('Hôm qua 03/11')
    await expect(value).toHaveText('3')
    await expect(yesterday).toHaveClass(/\bon\b/)
    // Tapped again (or the pointer gone): the period's totals.
    if (isMobile) await yesterday.tap()
    else await page.mouse.move(0, 0)
    await expect(when).toHaveText('30 ngày')
    // The keys, from the latest day back.
    await chart.locator('[data-plot]').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(when).toHaveText('Hôm nay 04/11 · chưa hết ngày')
    await page.keyboard.press('ArrowLeft')
    await expect(when).toHaveText('Hôm qua 03/11')
    await page.keyboard.press('Escape')
    await expect(when).toHaveText('30 ngày')
    expect(errors).toEqual([])
  })
})

test.describe('on a phone set to Berlin', () => {
  test.use({ timezoneId: 'Europe/Berlin' })

  test('times follow the device\'s zone: the page keeps it in a cookie and loads once more in it', async ({ page, context, errors }) => {
    test.skip(LIVE, 'the live dashboard opens only to the owner')
    await serve(page, '/_ab/anh-ban-doc/', tz => photosPage([PHOTO], NOW, tz))
    await page.goto('/_ab/anh-ban-doc/')
    // 08:34 UTC: 15:34 in Vietnam, where the first answer was drawn; 09:34 in Berlin.
    await expect(page.locator('td time')).toHaveText(/^04\/11(\/2026)? 09:34$/)
    await expect(page.locator('html')).toHaveAttribute('data-tz', 'Europe/Berlin')
    expect((await context.cookies()).find(c => c.name === 'aq_tz')?.value).toBe('Europe%2FBerlin')
    expect(errors).toEqual([])
  })
})
