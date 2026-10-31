import { expect, test } from './fixtures'

// A species' numbers agree wherever the page shows them (resolveDataCard in @aq/schema): here the data card's temperature
// and the "Nuôi ở Việt Nam" note's maximum. Cá neon vua's sources disagree on its range, which is when they used to differ.
test('species page: the Vietnam note uses the data card\'s temperature', async ({ page }) => {
  await page.goto('/vi/ca/ca-neon-vua/')
  const card = await page.locator('.card [data-field="tempC"] .v').getAttribute('data-c')
  const max = card!.split(',')[1]
  const summer = page.locator('.vn li').filter({ hasText: 'Mùa hè' }).locator('[data-c]').last()
  await expect(summer).toHaveAttribute('data-c', `${max},${max}`)
})
