import { expect, test } from './fixtures'
import { LIVE } from './pages'

// A fish with no photo of its own: a page the photo check leaves with none, as a river it calls "none" (the chief of
// staff, 2026-11-12). Its page has no head and shares the site's logo; its tile in the fish list says "no photo yet",
// as a breed's does. test/no-photo-page.test.ts holds the app's page file and feed.
test('a fish with no photo: no head on its page, the site\'s logo when shared, and "no photo yet" on its tile', async ({ page, errors }) => {
  test.skip(LIVE, 'the fixture\'s fish with no photo')
  await page.goto('/ca/ca-tam-giac/')
  await expect(page.locator('main header.top')).toHaveClass(/\bbare\b/)
  await expect(page.locator('#anh, main .plate img')).toHaveCount(0)
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/\/logo\.png$/)
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary')
  await page.goto('/ca/')
  const tile = page.locator('main .sc', { has: page.locator('a[href$="/ca/ca-tam-giac/"]') })
  await expect(tile.locator('.plate .ph')).toHaveText(/Chưa có ảnh/)
  await expect(tile.locator('img')).toHaveCount(0)
  expect(errors).toEqual([])
})
