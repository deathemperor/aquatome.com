import { expect, test } from './fixtures'

// "Mới cập nhật" lists the newest 100 changes; older ones are on numbered pages (/vi/moi-cap-nhat/trang/2/…), each
// linked to the one before and after. The test content has 3 entries, so this runs on the real build and aquatome.com.
const PER = 100
const entries = '[data-changelog] li'

test('the changelog shows the newest changes, then a page of older ones linked both ways', async ({ page }) => {
  await page.goto('/vi/moi-cap-nhat/')
  const next = page.locator('nav.pages a[rel=next]')
  test.skip((await next.count()) === 0, 'one page of changes')
  await expect(page.locator(entries)).toHaveCount(PER)
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveCount(0)
  const last = await page.locator(`${entries} time`).last().getAttribute('datetime')
  await next.click()
  await expect(page).toHaveURL(/\/vi\/moi-cap-nhat\/trang\/2\/$/)
  await expect(page.locator(entries).first()).toBeVisible()
  // Older or as old: the list goes on where the first page stopped.
  expect((await page.locator(`${entries} time`).first().getAttribute('datetime'))! <= last!).toBe(true)
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', '/vi/moi-cap-nhat/')
})
