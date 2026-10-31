import { expect, test } from './fixtures'

// Dotted glossary terms (a.gl): hover shows the term and its meaning, a click opens its page; on a touch screen the
// first tap shows the card and a second tap (or "Đọc thêm") opens the page.
const GUIDE = '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/'

test('hover shows the card; a click still opens the term page', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'phone', 'mouse only')
  await page.goto(GUIDE)
  const term = page.locator('main a.gl[data-tip]').first()
  const name = (await term.getAttribute('data-term'))!
  await term.hover()
  const tip = page.locator('.gl-tip')
  await expect(tip).toBeVisible()
  await expect(tip.locator('strong')).toHaveText(name)
  await expect(tip.locator('p')).toHaveText((await term.getAttribute('data-tip'))!)
  await page.mouse.move(0, 0)
  await expect(tip).toBeHidden()
  await term.click()
  await expect(page).toHaveURL(/\/vi\/thuat-ngu\//)
  expect(errors).toEqual([])
})

test('first tap shows the card with a link; tapping elsewhere closes it; a second tap opens the page', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only')
  await page.goto(GUIDE)
  const term = page.locator('main a.gl[data-tip]').first()
  await term.tap()
  const tip = page.locator('.gl-tip')
  await expect(tip).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${GUIDE}$`))
  expect(new URL((await tip.locator('a').getAttribute('href'))!, page.url()).pathname).toBe(await term.getAttribute('href'))
  // The card stays on the screen.
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.locator('h1').tap()
  await expect(tip).toBeHidden()
  await term.tap()
  await term.tap()
  await expect(page).toHaveURL(/\/vi\/thuat-ngu\//)
  expect(errors).toEqual([])
})
