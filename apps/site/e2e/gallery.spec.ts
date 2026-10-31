import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// A photo gallery, from the fish's or plant's page: the strip's link opens the gallery page, a photo opens in the viewer
// with its author and licence, the arrow keys step through, Escape closes. The pages come from the build (or, live, the
// sitemap), so the journey holds on aquatome.com's real galleries too.
for (const [what, section] of [['fish', 'ca'], ['plant', 'cay']] as const) {
  test(`${what} gallery: from the page's strip to the gallery, then through the photos in the viewer`, async ({ page, errors }) => {
    const gallery = sourcePages().find(p => new RegExp(`^/vi/${section}/[^/]+/anh/$`).test(p))
    test.skip(!gallery, `no ${what} gallery in this build`)
    await page.goto(gallery!.replace(/anh\/$/, ''))
    const all = page.locator('section.strip .head a')
    await expect(all).toHaveAttribute('href', gallery!)
    await all.click()
    await expect(page).toHaveURL(new RegExp(`${gallery}$`))
    await page.waitForLoadState() // the viewer's script, before a click on a photo (else the link opens the photo itself)
    const photos = page.locator('[data-gallery] a[data-i]')
    const n = await photos.count()
    expect(n).toBeGreaterThanOrEqual(6)
    await photos.first().click()
    const viewer = page.locator('dialog.lb')
    await expect(viewer).toBeVisible()
    const by = viewer.locator('.by')
    await expect(by).toContainText(`1/${n}`)
    await expect(by.locator('a')).toHaveAttribute('href', /^https:\/\//)
    await page.keyboard.press('ArrowRight')
    await expect(by).toContainText(`2/${n}`)
    await expect(page).toHaveURL(/#a2$/)
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    expect(errors).toEqual([])
  })
}
