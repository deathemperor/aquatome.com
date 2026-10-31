import { expect, test } from './fixtures'

test('tank volume: the default tank, then a new length, with the result shareable in the address', async ({ page }) => {
  await page.goto('/vi/cong-cu/the-tich-be/')
  await expect(page.locator('#vf-out .big')).toContainText('64,8 lít')
  await page.locator('#vf-fields input[name=l]').fill('100')
  await expect(page.locator('#vf-out .big')).toContainText('108 lít')
  await expect(page).toHaveURL(/l=100/)
})

test('tank-mates: two species give a comparison table', async ({ page }) => {
  await page.goto('/vi/cong-cu/')
  for (const name of ['Cá neon vua', 'Cá galaxy']) {
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
