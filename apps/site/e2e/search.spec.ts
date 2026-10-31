import { expect, test } from './fixtures'

// The fish list's search (/vi/ca/?q=…). The bug this guards: a search opened on 33 unfiltered breed cards, its
// results five phone screens below (2026-10-31).
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
/** Every card on the page a reader can see, in reading order: breed cards, then the species list. */
const visibleCards = (page: import('@playwright/test').Page) =>
  page.$$eval('main .breeds li, main [data-slug]', els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => ({ text: e.textContent ?? '', top: e.getBoundingClientRect().top + scrollY })))

test('a name search shows only matching cards, and the first one near the top', async ({ page }) => {
  await page.goto('/vi/ca/?q=neon')
  await expect(page.locator('#species-count')).toHaveText(/\d+ loài phù hợp/)
  const cards = await visibleCards(page)
  expect(cards.length).toBeGreaterThan(0)
  for (const c of cards) expect(fold(c.text), 'a card that does not match "neon"').toContain('neon')
  // Within one and a half screens of the top: reachable with one swipe on a phone.
  expect(cards[0]!.top).toBeLessThan(page.viewportSize()!.height * 1.5)
})

test('a search with no match says so and shows no cards', async ({ page }) => {
  await page.goto('/vi/ca/?q=khongcoloainao')
  await expect(page.locator('#species-count')).toHaveText(/Không có loài nào khớp/)
  expect(await visibleCards(page)).toEqual([])
})

test('typing a name and pressing Lọc filters the list and keeps the search in the address', async ({ page }) => {
  await page.goto('/vi/ca/')
  // On a phone the filters start folded.
  const box = page.locator('#filter-box')
  if (!(await box.evaluate(d => (d as HTMLDetailsElement).open))) await box.locator('summary').click()
  await page.locator('input[name=q]').fill('neon vua')
  await page.locator('#species-filter button[type=submit]').click()
  await expect(page).toHaveURL(/\?q=neon\+vua/)
  const cards = await visibleCards(page)
  expect(cards.length).toBeGreaterThan(0)
  expect(cards.map(c => fold(c.text).includes('neon vua'))).toEqual(cards.map(() => true))
})
