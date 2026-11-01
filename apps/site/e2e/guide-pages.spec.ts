import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The discovery notes (/vi/kham-pha/) and each video channel's guides (/vi/video/kenh/<channel>/) show their first page;
// "Xem thêm" builds the next page in place from the list's data file (components/MoreList.astro, scripts/list-more.ts),
// and is a link to the list's numbered pages (…/trang/2/). The test content has 2 notes and 2 videos, so these run on
// the real build and on aquatome.com; lists and counts are read from the pages.
const PAGE = 24
/** Each card on show under `scope`, as the browser holds it (pictures' eager or lazy loading aside). */
const shown = (page: Page, scope = 'main') => page.locator(`${scope} .gc:visible`).evaluateAll(els => els.map(e => {
  const c = e.cloneNode(true) as HTMLElement
  c.querySelectorAll('img').forEach(i => i.removeAttribute('loading'))
  return c.outerHTML
}))

/** The discovery notes' page, and the channel with the most videos (the video index lists channels by size). */
async function lists(page: Page) {
  await page.goto('/vi/video/')
  const channel = await page.locator('main .chans a').first().getAttribute('href').catch(() => null)
  return ['/vi/kham-pha/', ...(channel ? [channel] : [])]
}

test('a list of guides: "Xem thêm" adds the next page in place, the same cards its numbered page renders', async ({ page, request, errors }) => {
  let ran = 0
  for (const path of await lists(page)) {
    await page.goto(path)
    if (!(await page.locator('[data-paged]').count())) continue
    ran++
    const all = (await (await request.get((await page.locator('[data-paged]').getAttribute('data-src'))!)).json() as unknown[]).length
    const more = page.locator('[data-more]')
    await expect(page.locator('[data-paged] .gc:visible')).toHaveCount(PAGE)
    await expect(more).toHaveAttribute('href', `${path}trang/2/`)
    await expect(more).toHaveText(`Xem thêm ${Math.min(all - PAGE, PAGE)} bài (còn ${all - PAGE})`)
    await more.click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('[data-paged] .gc:visible')).toHaveCount(Math.min(all, 2 * PAGE))
    const built = (await shown(page, '[data-paged]')).slice(PAGE)
    // The numbered page renders the same next page of guides, linked back.
    await page.goto(`${path}trang/2/`)
    expect(await shown(page)).toEqual(built)
    await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', path)
  }
  test.skip(ran === 0, 'no list of guides is longer than a page')
  expect(errors).toEqual([])
})

test('a list of guides follows "Xem thêm" to its next numbered page when the list can\'t load', async ({ page }) => {
  await page.goto('/vi/kham-pha/')
  test.skip(!(await page.locator('[data-paged]').count()), 'one page of discovery notes')
  await page.route('**/data/*/guides/**', route => route.abort())
  await page.locator('[data-more]').click()
  await expect(page).toHaveURL(/\/vi\/kham-pha\/trang\/2\/$/)
  await expect(page.locator('main .gc')).not.toHaveCount(0)
})
