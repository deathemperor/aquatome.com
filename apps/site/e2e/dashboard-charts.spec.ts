import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { lastDays } from '../worker/admin/chart'
import { contentPage } from '../worker/admin/content-page'
import { accountsPage, fishIdPage, photosPage } from '../worker/admin/pages'
import { scoreboardPage, summariseScoreboard, weeksTo } from '../worker/admin/scoreboard'
import { viewerZone } from '../worker/admin/time'
import { todayJson, todayPage } from '../worker/admin/today'
import { FISH, LOW_CONTENT, PHOTO_APPROVED, PHOTO_WAITING, SPENDING, TODAY } from '../worker/test/owner-sample'
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

/** The waiting photos' thumbnails, as the Worker serves them from the private bucket (`/_ab/anh/<id>`). */
async function photos(page: Page) {
  const file = (name: string) => readFileSync(fileURLToPath(new URL(`./photos/${name}`, import.meta.url)))
  const by: Record<string, Buffer> = { [PHOTO_WAITING]: file('reader-photo-koi.webp'), [PHOTO_APPROVED]: file('reader-photo-halfmoon.webp') }
  await page.route(url => url.pathname.startsWith('/_ab/anh/'), route => {
    const body = by[new URL(route.request().url()).pathname.slice('/_ab/anh/'.length)]
    return body ? route.fulfill({ contentType: 'image/webp', body }) : route.fulfill({ status: 404 })
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
  await expect(page.getByRole('heading', { level: 1, name: 'Scoreboard' })).toBeVisible()
  const chart = page.locator('figure[aria-labelledby="w-star-t"]')
  await expect(chart.locator('.readout .when')).toHaveText('12 weeks')
  await expect(chart.locator('.readout b')).toHaveText('18')
  const column = chart.locator('.cols li').nth(10)
  if (isMobile) await column.tap()
  else await column.hover()
  await expect(chart.locator('.readout .when')).toHaveText('Week of 9 Nov')
  await expect(chart.locator('.readout b')).toHaveText('6')
  // A week before the count began says so instead of a zero.
  await expect(chart.locator('.cols li').first()).toHaveClass(/\bmiss\b/)
  for (const width of [320, 412, 800, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0)
  }
  expect(errors).toEqual([])
})

test('a tap on any small column, on the overview and the scoreboard, shows its day and value and stays on the page', async ({ page, errors, isMobile }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  // The owner (2026-11-07): a tap on a bar gave no number. The overview's columns sat inside their row's link, and
  // neither page's small columns said their values.
  await serve(page, '/_ab/', () => todayPage(TODAY))
  await serve(page, '/_ab/thanh-cong/', tz => scoreboardPage(scoreboard(), tz))
  for (const [path, least] of [['/_ab/', 1], ['/_ab/thanh-cong/', 4]] as const) {
    await page.goto(path)
    const sparks = await page.locator('[data-spark]').all()
    expect(sparks.length, path).toBeGreaterThanOrEqual(least)
    for (const s of sparks) {
      const days = (await s.getAttribute('data-d'))!.split('|')
      const values = (await s.getAttribute('data-v'))!.split('|')
      // The day (or week) before the last one counted: a week's days still to come have no value.
      const i = values.findLastIndex(v => v !== '—') - 1
      await s.scrollIntoViewIfNeeded()
      const box = (await s.locator('svg').boundingBox())!
      const [x, y] = [box.x + (box.width * (i + 0.5)) / days.length, box.y + box.height / 2]
      if (isMobile) await page.touchscreen.tap(x, y)
      else await page.mouse.move(x, y)
      await expect(s.locator('.so')).toBeVisible()
      await expect(s.locator('.so')).toHaveText(`${days[i]}: ${values[i]}`)
      expect(new URL(page.url()).pathname).toBe(path)
    }
  }
  // The answers tile, Monday to Sunday: Tuesday, its second column, as the overview's reply counts it.
  await page.goto('/_ab/')
  const answers = page.locator('.kpi').filter({ hasText: 'Found an answer' }).locator('[data-spark]')
  const box = (await answers.locator('svg').boundingBox())!
  if (isMobile) await page.touchscreen.tap(box.x + box.width * (1.5 / 7), box.y + box.height / 2)
  else await page.mouse.move(box.x + box.width * (1.5 / 7), box.y + box.height / 2)
  const tuesday = todayJson(TODAY).tiles.find(t => t.key === 'answers')!.bars!.values[1]
  await expect(answers.locator('.so')).toHaveText(`3 Nov: ${tuesday}`)
  // Today's column, the day not over, is drawn lighter than the days before it (the Design Lead, 2026-11-09).
  const fill = (sel: string) => answers.locator(sel).first().evaluate(e => getComputedStyle(e).fill)
  expect(await fill('rect.today')).not.toBe(await fill('rect.now:not(.today)'))
  expect(errors).toEqual([])
})

test('what needs you: each title on one line on a 390 px phone, its detail under it', async ({ page, errors }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  // The Design Lead (2026-11-08): a need's title is the thing, on one line at regular size; its detail goes under it.
  // The web's button beside the title wrapped "2Hr Aquarist needs a browser check" on a phone.
  const failed = { failed: 'down' }
  const all = [TODAY, SPENDING, { ...TODAY, beacon: failed, held: failed, waitingPhotos: failed, readers: failed, fish: failed, content: failed, accounts: failed }]
  expect(Math.max(...all.flatMap(t => todayJson(t).needs.map(x => x.text.length)))).toBeGreaterThanOrEqual(34)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [i, t] of all.entries()) {
    await serve(page, `/_ab/${i}/`, () => todayPage(t))
    await page.goto(`/_ab/${i}/`)
    const titles = page.locator('ul.todo b')
    expect(await titles.count()).toBe(todayJson(t).needs.length)
    for (const b of await titles.all()) {
      const [height, line] = await b.evaluate(e => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).lineHeight) || 1.5 * parseFloat(getComputedStyle(e).fontSize)])
      expect(height, await b.innerText()).toBeLessThan(1.5 * line)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  }
  expect(errors).toEqual([])
})

test('what needs you: one card, the whole row a link; on a phone a chevron in place of the button, and the photos load', async ({ page, errors }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  // The Design Lead (2026-11-09): one list in one card, a filled "Review" and outlined "See …" buttons; on a phone no
  // button, the row is the link with a chevron. The photos' thumbnails were broken images in every shot.
  await photos(page)
  await serve(page, '/_ab/', () => todayPage(TODAY))
  const needs = todayJson(TODAY).needs
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/_ab/')
    await expect(page.locator('ul.todo')).toHaveCount(1)
    const rows = page.locator('ul.todo > li')
    await expect(rows).toHaveCount(needs.length)
    for (const [i, row] of (await rows.all()).entries()) {
      await expect(row.locator('a'), `${width} px, ${needs[i]!.text}`).toHaveCount(1)
      if (width === 390) {
        await expect(row.locator('.act')).toBeHidden()
        await expect(row.locator('.chev')).toBeVisible()
      } else {
        await expect(row.locator('.act')).toBeVisible()
        await expect(row.locator('.act')).toHaveText(needs[i]!.label)
        await expect(row.locator('.chev')).toBeHidden()
      }
    }
    const imgs = page.locator('ul.todo img')
    expect(await imgs.count()).toBe(needs.find(x => x.kind === 'photos')!.photos!.length)
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth), `${width} px`).toBeGreaterThan(0)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0)
  }
  // "Review" filled (its border the colour of its fill), "See …" outlined.
  const [filled, outlined] = await Promise.all(['li.wait', 'li:not(.wait)'].map(li => page.locator(`ul.todo ${li} .act`).first().evaluate(e => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopColor])))
  expect(filled![0]).toBe(filled![1])
  expect(outlined![0]).not.toBe(outlined![1])
  expect(errors).toEqual([])
})

test('the day charts: a hover or a tap shows the day beside its bar, inside the card, and nothing else is drawn', async ({ page, errors, isMobile }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  // The Design Lead (2026-11-09): a day's name under each bar, no axis, no readout line over it; the overview's draws
  // found an answer only, so it has no legend (Fish ID's three kinds of call keep theirs).
  await serve(page, '/_ab/', () => todayPage(TODAY))
  await serve(page, '/_ab/nhan-dien-ca/', tz => fishIdPage({ ...FISH, tz }))
  for (const [path, at] of [['/_ab/', '.acard'], ['/_ab/nhan-dien-ca/', '.charts']] as const) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      const card = page.locator(at).first()
      const chart = card.locator('figure.bare')
      await expect(chart).toHaveCount(1)
      await expect(chart.locator('.yax span, .readout')).toHaveCount(0)
      await expect(chart.locator('.legend span')).toHaveCount(path === '/_ab/' ? 0 : 3)
      const tip = chart.locator('.tip')
      await expect(tip).toBeHidden()
      const bars = chart.locator('.cols li')
      const n = await bars.count()
      const labels = await chart.locator('.xax span').allInnerTexts()
      expect(labels.length, `${path} ${width} px`).toBe(n)
      await chart.scrollIntoViewIfNeeded()
      const area = (await chart.locator('.area').boundingBox())!
      const cardBox = (await card.boundingBox())!
      for (const i of [0, Math.floor(n / 2), n - 1]) {
        const [x, y] = [area.x + (area.width * (i + 0.5)) / n, area.y + area.height / 2]
        if (isMobile) await page.touchscreen.tap(x, y)
        else await page.mouse.move(x, y)
        const bar = bars.nth(i)
        await expect(tip).toBeVisible()
        await expect(tip.locator('b')).toHaveText((await bar.getAttribute('data-t'))!)
        await expect(tip.locator('span')).toHaveText((await bar.getAttribute('data-x'))!)
        const box = (await tip.boundingBox())!
        expect(box.x, `${path} ${width} px, bar ${i}`).toBeGreaterThanOrEqual(cardBox.x - 0.5)
        expect(box.x + box.width, `${path} ${width} px, bar ${i}`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5)
        if (isMobile) await page.touchscreen.tap(x, y)
      }
    }
  }
  expect(errors).toEqual([])
})

test('Fish ID\'s periods: a menu button on a 390 px phone, a segmented control from a tablet\'s width up', async ({ page, errors, isMobile }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  await serve(page, '/_ab/nhan-dien-ca/', tz => fishIdPage({ ...FISH, tz }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/_ab/nhan-dien-ca/')
  const nav = page.locator('nav.periods')
  const segment = nav.locator('.seg a')
  const n = await segment.count()
  expect(n).toBeGreaterThanOrEqual(2)
  const button = nav.locator('.pmenu summary')
  await expect(button).toBeVisible()
  await expect(button).toHaveText(await nav.locator('.seg a[aria-current="page"]').textContent() ?? '')
  await expect(segment.first()).toBeHidden()
  const items = nav.locator('.pmenu div a')
  await expect(items.first()).toBeHidden()
  if (isMobile) await button.tap()
  else await button.click()
  await expect(items).toHaveCount(n)
  for (const a of await items.all()) await expect(a).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  for (const width of [600, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(button, `${width} px`).toBeHidden()
    for (const a of await segment.all()) await expect(a, `${width} px`).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('the content page\'s pages out of search: a page\'s notes open on a tap or a click, and the list fits a 320 px screen', async ({ page, errors, isMobile }) => {
  test.skip(LIVE, 'the live dashboard opens only to the owner')
  await serve(page, '/_ab/noi-dung/', tz => contentPage({ ...LOW_CONTENT, tz }))
  await page.goto('/_ab/noi-dung/')
  const low = page.locator('section.low')
  await expect(low.getByRole('heading', { level: 3, name: 'Out of search for a low score' })).toBeVisible()
  // The video guide's three notes: the first, cut to two lines, and how many there are; the rest once opened.
  const why = low.locator('tbody tr').nth(2).locator('td.why')
  const summary = why.locator('summary')
  const first = summary.locator('span')
  const line = await first.evaluate(e => parseFloat(getComputedStyle(e).lineHeight))
  expect((await first.boundingBox())!.height).toBeLessThanOrEqual(2 * line + 1)
  await expect(why.locator('ul li').first()).toBeHidden()
  if (isMobile) await summary.tap()
  else await summary.click()
  await expect(why.locator('ul li')).toHaveCount(2)
  await expect(why.locator('ul li').first()).toBeVisible()
  expect((await first.boundingBox())!.height).toBeGreaterThan(2 * line + 1)
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
    await expect(when).toHaveText('30 days')
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
    await expect(when).toHaveText('Yesterday 3 Nov')
    await expect(value).toHaveText('3')
    await expect(yesterday).toHaveClass(/\bon\b/)
    await expect(hint).toBeHidden()
    expect(await top()).toBe(before)
    // Tapped again (or the pointer gone): the period's totals.
    if (isMobile) await yesterday.tap()
    else await page.mouse.move(0, 0)
    await expect(when).toHaveText('30 days')
    // The keys, from the latest day back.
    await chart.locator('[data-plot]').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(when).toHaveText('Today 4 Nov · so far')
    await page.keyboard.press('ArrowLeft')
    await expect(when).toHaveText('Yesterday 3 Nov')
    await page.keyboard.press('Escape')
    await expect(when).toHaveText('30 days')
    // A finger that lands on the chart to scroll the page: the browser cancels it, and the readout stays as it was.
    await chart.locator('.area').evaluate(a => {
      const r = a.getBoundingClientRect()
      const at = { pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + 10, bubbles: true }
      a.dispatchEvent(new PointerEvent('pointerdown', at))
      a.dispatchEvent(new PointerEvent('pointercancel', at))
    })
    await expect(when).toHaveText('30 days')
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
    await expect(page.locator('td time')).toHaveText(/^Wed 4 Nov(?: 2026)?, 9:34$/)
    await expect(page.locator('html')).toHaveAttribute('data-tz', 'Europe/Berlin')
    expect((await context.cookies()).find(c => c.name === 'aq_tz')?.value).toBe('Europe%2FBerlin')
    expect(errors).toEqual([])
  })
})
