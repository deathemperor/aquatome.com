import type { Page } from '@playwright/test'
import { lastDays } from '../worker/admin/chart'
import { accountsPage, photosPage } from '../worker/admin/pages'
import { scoreboardPage, summariseScoreboard, weeksTo } from '../worker/admin/scoreboard'
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

/** A scoreboard over the weeks after the readers' count began, drawn from sample rows as the Worker draws it. */
const SCORE_NOW = new Date('2026-11-18T05:00:00Z')
const scoreboard = () => summariseScoreboard({
  now: SCORE_NOW, owners: [], clicks: { days: [], clicks: [] }, app: { sessions: [], actions: [], crashes: [] }, content: { failed: 'x' }, snapshots: [], checks: [],
  community: { tanks: [], comments: [], photos: [] },
  beacon: weeksTo(SCORE_NOW).slice(-3).flatMap((monday, w) => Array.from({ length: 3 * (w + 1) }, (_, i) => [
    { sid: `s${w}-${i}`, t: 'view', p: '/ca/ca-betta/', ref: 'www.google.com', cc: 'VN', first: `${monday} 03:00:00`, v: 1, n: 1 },
    { sid: `s${w}-${i}`, t: 'time', p: '/ca/ca-betta/', ref: '', cc: 'VN', first: `${monday} 03:00:30`, v: 30, n: 1 },
  ]).flat()),
})

test('the scoreboard reads a week off its chart, and fits a 320 px screen', async ({ page, errors, isMobile }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  await serve(page, '/_ab/thanh-cong/', tz => scoreboardPage(scoreboard(), tz))
  await page.goto('/_ab/thanh-cong/')
  await expect(page.getByRole('heading', { level: 1, name: 'Thành công' })).toBeVisible()
  const chart = page.locator('figure[aria-labelledby="w-star-t"]')
  await expect(chart.locator('.readout .when')).toHaveText('12 tuần')
  await expect(chart.locator('.readout b')).toHaveText('18')
  const column = chart.locator('.cols li').nth(10)
  if (isMobile) await column.tap()
  else await column.hover()
  await expect(chart.locator('.readout .when')).toHaveText('Tuần 09/11')
  await expect(chart.locator('.readout b')).toHaveText('6')
  // A week before the count began says so instead of a zero.
  await expect(chart.locator('.cols li').first()).toHaveClass(/\bmiss\b/)
  for (const width of [320, 412, 800, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0)
  }
  expect(errors).toEqual([])
})

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
    // The page's first chart says how to read a day; picking one hides that line but keeps its room, so nothing under
    // it moves and the column stays under the pointer.
    const hint = chart.locator('.readout .hint')
    await expect(hint).toBeVisible()
    const top = () => chart.locator('[data-plot]').evaluate(p => p.getBoundingClientRect().top + scrollY)
    const before = await top()
    const yesterday = chart.locator('.cols li').nth(28)
    if (isMobile) await yesterday.tap()
    else await yesterday.hover()
    await expect(when).toHaveText('Hôm qua 03/11')
    await expect(value).toHaveText('3')
    await expect(yesterday).toHaveClass(/\bon\b/)
    await expect(hint).toBeHidden()
    expect(await top()).toBe(before)
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
    // A finger that lands on the chart to scroll the page: the browser cancels it, and the readout stays as it was.
    await chart.locator('.area').evaluate(a => {
      const r = a.getBoundingClientRect()
      const at = { pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + 10, bubbles: true }
      a.dispatchEvent(new PointerEvent('pointerdown', at))
      a.dispatchEvent(new PointerEvent('pointercancel', at))
    })
    await expect(when).toHaveText('30 ngày')
    expect(errors).toEqual([])
  })
})

test.describe('on a phone set to Berlin', () => {
  test.use({ timezoneId: 'Europe/Berlin' })

  test('times follow the device\'s zone: the page keeps it in a cookie and loads once more in it', async ({ page, context, errors }) => {
    test.skip(LIVE, 'the live dashboard opens only to the owner')
    await serve(page, '/_ab/anh-ban-doc/', tz => photosPage([PHOTO], [], NOW, tz))
    await page.goto('/_ab/anh-ban-doc/')
    // 08:34 UTC: 15:34 in Vietnam, where the first answer was drawn; 09:34 in Berlin.
    await expect(page.locator('td time')).toHaveText(/^04\/11(\/2026)? 09:34$/)
    await expect(page.locator('html')).toHaveAttribute('data-tz', 'Europe/Berlin')
    expect((await context.cookies()).find(c => c.name === 'aq_tz')?.value).toBe('Europe%2FBerlin')
    expect(errors).toEqual([])
  })
})
