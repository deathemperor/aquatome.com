import { expect, test } from './fixtures'
import { sourcePages } from './pages'

test('tank volume: the default tank, then a new length, with the result shareable in the address', async ({ page }) => {
  await page.goto('/vi/cong-cu/the-tich-be/')
  await expect(page.locator('#vf-out .big')).toContainText('64,8 lít')
  await page.locator('#vf-fields input[name=l]').fill('100')
  await expect(page.locator('#vf-out .big')).toContainText('108 lít')
  await expect(page).toHaveURL(/l=100/)
})

test('tank-mates: two species give a comparison table', async ({ page }) => {
  await page.goto('/vi/cong-cu/')
  // Names in both the fixture content and aquatome.com.
  for (const name of ['Cá neon vua', 'Cá neon xanh']) {
    await page.locator('#tm-input').fill(name)
    await page.locator('#tm-form button[type=submit]').click()
  }
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  await expect(page.locator('#tm-out table')).toBeVisible()
  await expect(page).toHaveURL(/ca=/)
})

test('Chihiros page without Bluetooth: says which browsers work; the schedule form still works', async ({ page }) => {
  await page.addInitScript(() => { delete (Navigator.prototype as { bluetooth?: unknown }).bluetooth })
  await page.goto('/vi/cong-cu/den-chihiros/')
  await expect(page.locator('#ch-unsupported')).toBeVisible()
  await expect(page.locator('#ch-connect')).toBeDisabled()
  await expect(page.locator('#ch-write')).toBeDisabled()
  await page.locator('.preset').nth(1).click()
  await expect(page.locator('#ch-hours')).toHaveText(/8 tiếng/)
  await page.locator('input[name=off]').fill('10:00')
  await expect(page.locator('#ch-hours')).toHaveText(/Giờ tắt phải sau giờ bật/)
})

test('wide tables on a phone show that they scroll sideways', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'only a phone is narrow enough')
  // A tool's table.
  await page.goto('/vi/cong-cu/the-tich-be/')
  const tool = await page.locator('.scroll').first().evaluate(el => ({ wide: el.scrollWidth > el.clientWidth, hint: getComputedStyle(el).backgroundImage }))
  expect(tool.wide, 'the tank-volume table is wider than a phone').toBe(true)
  expect(tool.hint, 'the tank-volume table: a shadow at the edge that has more to see').toContain('gradient')
  // A comparison table in a guide's text. The guide comes from the site's own pages: the fixture's guides and
  // aquatome.com's are different ones (a fixed fixture path timed out on aquatome.com, #193). The first guide whose
  // table is wider than a phone (the fixture has one); aquatome.com's tables may all fit, then the first guide's table.
  // Either way it must scroll inside itself, with the shadow hint, and stay within the screen.
  type Table = { path: string, wide: boolean, overflow: string, hint: string, right: number }
  let found: Table | undefined
  let tried = 0
  for (const path of sourcePages().filter(p => /^\/vi\/huong-dan\/[^/]+\/$/.test(p))) {
    if (tried >= 15) break
    if (!/<table/.test(await (await page.request.get(path)).text())) continue
    tried++
    await page.goto(path)
    const tables = await page.locator('.prose table').evaluateAll(els => els.map(el => ({
      wide: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).overflowX,
      hint: getComputedStyle(el).backgroundImage,
      right: el.getBoundingClientRect().right,
    })))
    const table = tables.find(t => t.wide) ?? (found ? undefined : tables[0])
    if (table) found = { path, ...table }
    if (found?.wide) break
  }
  expect(found, 'a guide with a table in its text').toBeTruthy()
  const { path, overflow, hint, right } = found!
  expect(overflow, `${path}: the table scrolls inside itself`).toBe('auto')
  expect(hint, `${path}: a shadow at the edge that has more to see`).toContain('gradient')
  expect(right, `${path}: the table stays within the screen`).toBeLessThanOrEqual(page.viewportSize()!.width)
})
