import { expect, test } from './fixtures'
import { doubleTap, pinchOut, swipe } from './gestures'
import { sourcePages } from './pages'

// A photo gallery, from the fish's or plant's page: the strip's link opens the gallery page, a photo opens in the viewer
// with its author and licence, the arrow keys step through, Escape closes. The pages come from the build (or, live, the
// sitemap), so the journey holds on aquatome.com's real galleries too.
const galleryOf = (section: string) => sourcePages().find(p => new RegExp(`^/${section}/[^/]+/anh/$`).test(p))

for (const [what, section] of [['fish', 'ca'], ['plant', 'cay']] as const) {
  test(`${what} gallery: from the page's strip to the gallery, then through the photos in the viewer`, async ({ page, errors }) => {
    const gallery = galleryOf(section)
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
    await expect(by.locator('a').first()).toHaveAttribute('href', /^https:\/\//) // an Unsplash photo's line has more (unsplash-credits.spec.ts)
    await page.keyboard.press('ArrowRight')
    await expect(by).toContainText(`2/${n}`)
    await expect(page).toHaveURL(/#a2$/)
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    // Closed, the address is the gallery's again, focus is on the photo it closed on, and stepping through photos left
    // nothing in the history: Back goes to the fish's page.
    await expect(page).toHaveURL(new RegExp(`${gallery}$`))
    await expect(photos.nth(1)).toBeFocused()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${gallery!.replace(/anh\/$/, '')}$`))
    expect(errors).toEqual([])
  })
}

// On a phone the Back button closes the photo, not the page; the photo follows a swipe to the next one; a photo's own
// address (#a3, as the fish page's strip links it) opens the gallery on it.
test('gallery viewer: #a3 opens photo 3, a swipe goes to the next, Back closes it and stays on the gallery', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  await page.goto(`${gallery}#a3`)
  const viewer = page.locator('dialog.lb')
  await expect(viewer).toBeVisible()
  const n = await page.locator('[data-gallery] a[data-i]').count()
  const by = viewer.locator('.by')
  await expect(by).toContainText(`3/${n}`)
  await expect(viewer.getByRole('status')).toHaveText(`3/${n}`)
  // The photos follow the finger until it lifts.
  const stage = viewer.locator('.pv-stage')
  const width = (await stage.boundingBox())!.width
  // Chrome hands a finger's moves to the page with the next frame, so the last one can land just after it is sent.
  await swipe(page, stage, -0.6, info.project.name === 'phone', async () => {
    const x = () => viewer.locator('.pv-track').evaluate(t => new DOMMatrix(getComputedStyle(t).transform).m41)
    await expect.poll(x).toBeCloseTo(-0.6 * width, -1)
  })
  await expect(by).toContainText(`4/${n}`)
  await expect(page).toHaveURL(new RegExp(`${gallery}#a4$`))
  await swipe(page, stage, 0.6, info.project.name === 'phone')
  await expect(by).toContainText(`3/${n}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${gallery}$`))
  await expect(page.locator('[data-gallery]')).toBeVisible()
  expect(errors).toEqual([])
})

// Zoomed in (a pinch or a double tap on a phone, the wheel or a double click on a computer), a drag pans the photo
// instead of going to the next one; a double tap or click zooms back out, and the swipe works again.
test('gallery viewer: a zoomed photo pans rather than swiping; a double tap zooms back out', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  const touch = info.project.name === 'phone'
  await page.goto(`${gallery}#a1`)
  const viewer = page.locator('dialog.lb')
  const photo = viewer.locator('.pv-slide:not([inert]) .pv-pic')
  const stage = viewer.locator('.pv-stage') // its middle is on the photo, panned or not
  const by = viewer.locator('.by')
  const n = await page.locator('[data-gallery] a[data-i]').count()
  await expect(by).toContainText(`1/${n}`)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  if (touch) await pinchOut(page, stage)
  else {
    const b = (await stage.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.wheel(0, -400)
  }
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await swipe(page, stage, -0.6, touch)
  await expect(by).toContainText(`1/${n}`)
  expect(await photo.evaluate(p => new DOMMatrix(getComputedStyle(p).transform).m41), 'panned to the left').toBeLessThan(0)
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await swipe(page, stage, -0.6, touch)
  await expect(by).toContainText(`2/${n}`)
  expect(errors).toEqual([])
})

// With a mouse, the magnifier cursor means what it says: one click on the photo zooms in there, the next zooms back
// out, and a double click out of habit still leaves it zoomed in.
test('gallery viewer: one click zooms in with a mouse, the next zooms out; a double click zooms in', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  test.skip(info.project.name === 'phone', 'a finger zooms with a double tap or a pinch')
  await page.goto(`${gallery}#a1`)
  const viewer = page.locator('dialog.lb')
  const stage = viewer.locator('.pv-stage')
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  const b = (await stage.boundingBox())!
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  await page.mouse.click(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await page.waitForTimeout(400) // a separate click, not the second of a double click
  await page.mouse.click(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await page.waitForTimeout(400)
  await page.mouse.dblclick(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await expect(viewer).toBeVisible()
  expect(errors).toEqual([])
})
