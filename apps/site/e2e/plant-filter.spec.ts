import type { Page } from '@playwright/test'
import { expect, test, VIETNAMESE } from './fixtures'

// The plant list's filters (design critique 2026-10-31: 165 plants and no filter, though the intro promises light, CO₂
// and position). Counts and names come from the page, so the checks hold on aquatome.com too: 24 cards at a time.
const PAGE = 24
const visible = (page: Page) => page.locator('main [data-slug]:visible')
const total = async (page: Page) => Number(await page.locator('#plant-result').getAttribute('data-total'))
/** On a phone the filter box starts closed. */
async function openBox(page: Page) {
  const box = page.locator('#plant-box')
  if (!(await box.evaluate(d => (d as HTMLDetailsElement).open))) await box.locator('summary').click()
}
const shown = (text: string) => Number(/^(\d+) /.exec(text)![1])

test("plant list: the tank's light and no CO₂ keep the plants that grow there; chips drop a filter, \"Xóa lọc\" all", async ({ page, errors }) => {
  await page.goto('/vi/cay/')
  const all = await total(page)
  await expect(visible(page)).toHaveCount(Math.min(all, PAGE))
  if (all > PAGE) {
    await page.locator('#plant-more').click()
    await expect(visible(page)).toHaveCount(Math.min(all, 2 * PAGE))
  }

  await openBox(page)
  await page.locator('#plant-filter select[name=light]').selectOption('low')
  await page.locator('#plant-filter select[name=co2]').selectOption('none')
  await page.locator('#plant-filter button[type=submit]').click()
  await expect(page).toHaveURL(/\/vi\/cay\/\?light=low&co2=none$/)
  const count = page.locator('#plant-count')
  await expect(count).toHaveText(/^\d+ loài phù hợp$/)
  const n = shown((await count.textContent())!)
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThan(all)
  await expect(visible(page)).toHaveCount(Math.min(n, PAGE))
  // Every plant shown needs low light and grows without CO₂ (what its own card says).
  for (const meta of await visible(page).locator('.meta').allTextContents()) {
    expect(meta).toMatch(/^Ánh sáng yếu, CO₂ (không cần|tùy chọn)$/)
  }
  // Every plant has a light and a CO₂ figure: nothing to be unsure about.
  await expect(page.locator('#plant-unsure')).toBeHidden()

  // One chip per filter, in the form's words; × drops that one and the rest stay, in the address too.
  const chips = page.locator('#plant-chips button')
  await expect(chips).toHaveText(['Ánh sáng bể: Yếu', 'CO₂: Không cần châm'])
  await page.getByRole('button', { name: 'Bỏ Ánh sáng bể: Yếu' }).click()
  await expect(page).toHaveURL(/\/vi\/cay\/\?co2=none$/)
  await expect(chips).toHaveText(['CO₂: Không cần châm'])
  await expect(chips.first()).toBeFocused()
  await expect(page.locator('#plant-filter select[name=light]')).toHaveValue('')
  expect(shown((await count.textContent())!)).toBeGreaterThanOrEqual(n)

  // "Xóa lọc": no filter, no result line, every plant again.
  await page.getByRole('button', { name: 'Xóa lọc' }).click()
  await expect(page).toHaveURL(/\/vi\/cay\/$/)
  await expect(count).toHaveText('')
  await expect(page.locator('#plant-active')).toBeHidden()
  await expect(visible(page)).toHaveCount(Math.min(all, PAGE))
  expect(errors).toEqual([])
})

test('a link with filters opens the plant list filtered, the box open', async ({ page }) => {
  await page.goto('/vi/cay/?placement=foreground&difficultyMax=1')
  await expect(page.locator('#plant-box')).toHaveAttribute('open', '')
  await expect(page.locator('#plant-chips button')).toHaveText(['Vị trí: Tiền cảnh', 'Độ khó tối đa: Dễ'])
  const n = shown((await page.locator('#plant-count').textContent())!)
  await expect(visible(page)).toHaveCount(Math.min(n, PAGE))
})

// Indonesian and Thai lists have their own plants (none in the test content): the same filter in their words.
for (const path of ['/id/tanaman/', '/th/plants/']) {
  test(`the plant filter works in the page's language (${path})`, async ({ page, errors }) => {
    await page.goto(path)
    test.skip(await page.locator('main .pc').count() === 0, 'no plants published in this language')
    await openBox(page)
    await page.locator('#plant-filter select[name=light]').selectOption('low')
    await page.locator('#plant-filter button[type=submit]').click()
    await expect(page).toHaveURL(/\?light=low$/)
    const line = page.locator('#plant-count')
    await expect(line).toHaveText(/^\d+ /)
    await expect(visible(page)).toHaveCount(Math.min(shown((await line.textContent())!), PAGE))
    for (const text of [await line.textContent(), ...(await page.locator('#plant-chips button').allTextContents())]) expect(text).not.toMatch(VIETNAMESE)
    expect(errors).toEqual([])
  })
}

// Every plant is a plain link away: "Xem thêm" is a link to the list's next numbered page (/vi/cay/trang/2/), which the
// script shows in place instead; it follows the link when the list's data file can't load.
test('plant list: "Xem thêm" adds the next page in place, and is a link to the numbered page it follows when the list can\'t load', async ({ page }) => {
  await page.goto('/vi/cay/')
  const all = await total(page)
  test.skip(all <= PAGE, 'every plant fits on the first page')
  const more = page.locator('#plant-more')
  await expect(more).toHaveAttribute('href', '/vi/cay/trang/2/')
  await expect(more).toHaveText(`Xem thêm ${Math.min(all - PAGE, PAGE)} loài (còn ${all - PAGE})`)
  await more.click()
  await expect(page).toHaveURL(/\/vi\/cay\/$/)
  await expect(visible(page)).toHaveCount(Math.min(all, 2 * PAGE))
  const second = await visible(page).evaluateAll(els => els.slice(24).map(e => e.getAttribute('data-slug')))
  // The numbered page: the same plants, linked back.
  await page.goto('/vi/cay/trang/2/')
  expect(await page.locator('main .pc').evaluateAll(els => els.map(e => e.getAttribute('data-slug')))).toEqual(second)
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', '/vi/cay/')
  await page.route('**/data/*/plants.json', route => route.abort())
  await page.goto('/vi/cay/')
  await page.locator('#plant-more').click()
  await expect(page).toHaveURL(/\/vi\/cay\/trang\/2\/$/)
})

test('a plant with no photo shows a leaf on the plate colour, the shape of a photo, not an empty strip', async ({ page }) => {
  await page.goto('/vi/cay/')
  // The first card without a photo, with more cards shown until it is (the engine may have photographed them all).
  const bare = page.locator('main .pc:visible:not(:has(.plate img))')
  const more = page.locator('#plant-more')
  while (await bare.count() === 0 && await more.isVisible()) await more.click()
  test.skip(await bare.count() === 0, 'every plant has a photo')
  const slot = bare.first().locator('.plate .ph')
  await slot.scrollIntoViewIfNeeded()
  await expect(slot).toBeVisible()
  expect(await slot.evaluate(el => getComputedStyle(el, '::before').maskImage)).toContain('svg') // the leaf
  await expect(slot).toHaveText('Chưa có ảnh')
  // As wide as a photo in the same list, and 4:3 like them.
  const box = (await slot.boundingBox())!
  const photo = (await page.locator('main .pc:visible .plate img').first().boundingBox())!
  expect(Math.abs(box.width - photo.width)).toBeLessThan(2)
  expect(box.width / box.height).toBeCloseTo(4 / 3, 1)
})
