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

// Answer first: on a phone the name and the four facts a reader decides by (temperature, pH, smallest tank, difficulty)
// are on the first screen, above the photo. They used to start at 615 px and 759 px of 839, under the header and photo.
test('species page on a phone: the name and the four key facts are on the first screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.goto('/vi/ca/ca-neon-vua/')
  const onFirstScreen = (sel: string) => page.locator(sel).evaluateAll((els, h) => els.some(e => {
    const r = e.getBoundingClientRect()
    return r.height > 0 && r.top >= 0 && r.bottom <= h
  }), page.viewportSize()!.height)
  expect(await onFirstScreen('h1'), 'name').toBe(true)
  for (const f of ['tempC', 'ph', 'tankCm', 'difficulty']) expect(await onFirstScreen(`main [data-field="${f}"]`), f).toBe(true)
})

// A long species page: a sticky row of its main parts. A tap brings that part's heading into view (not under the row) and
// marks its chip; on a phone the row scrolls sideways so the marked chip stays in sight.
test('species page: the jump row takes the reader to a part and marks where they are', async ({ page }, info) => {
  await page.goto('/vi/ca/ca-neon-vua/')
  const row = page.locator('nav.jump')
  const chip = row.locator('a', { hasText: 'Thức ăn' })
  if (info.project.name === 'phone') await chip.tap(); else await chip.click()
  const heading = page.locator('#muc-diet h2')
  await expect(heading).toBeInViewport()
  await expect(chip).toHaveAttribute('aria-current', 'true')
  await expect(row.locator('a[aria-current]')).toHaveCount(1)
  await expect(row).toBeInViewport()
  await expect.poll(async () => (await heading.boundingBox())!.y - ((await row.boundingBox())!.y + (await row.boundingBox())!.height), { message: 'heading below the row' }).toBeGreaterThanOrEqual(0)
  for (const h of await row.locator('a').evaluateAll(as => as.map(a => a.getBoundingClientRect().height))) expect(h, 'chip height').toBeGreaterThanOrEqual(44)

  if (info.project.name !== 'phone') return
  await page.locator('#muc-reproduction').evaluate(el => el.scrollIntoView()) // as a reader scrolls: the heading up to the top
  const last = row.locator('a', { hasText: 'Sinh sản' })
  await expect(last).toHaveAttribute('aria-current', 'true')
  await expect.poll(async () => {
    const [r, c] = [(await row.boundingBox())!, (await last.boundingBox())!]
    return c.x >= r.x && c.x + c.width <= r.x + r.width
  }, { message: 'the marked chip is in sight in the row' }).toBe(true)
})

// One "Nguồn và độ tin cậy" toggle per data card (it used to be one per value, 17 px tall); only the values the sources
// disagree on are marked.
test('species data card: one sources toggle, the disagreeing value marked, each source\'s figure inside', async ({ page }, info) => {
  await page.goto('/vi/ca/ca-neon-vua/')
  const card = page.locator('.facts .datacard')
  const summary = card.locator('summary')
  await expect(summary).toHaveCount(1)
  await expect(card.locator('.card [data-conflict]')).toHaveCount(1)
  await expect(card.locator('.card [data-field="tempC"] .mark')).toBeVisible()
  expect((await summary.boundingBox())!.height, 'toggle height').toBeGreaterThanOrEqual(44)
  const temp = card.locator('.trust [data-src-field="tempC"]')
  await expect(temp).toBeHidden()
  const press = () => (info.project.name === 'phone' ? summary.tap() : summary.click())
  await press()
  await expect(temp).toBeVisible()
  await expect(temp.locator('[data-c="24,30"]')).toHaveText('24–30°C')
  await expect(temp).toContainText('Seriously Fish')
  await press()
  await expect(temp).toBeHidden()
})
