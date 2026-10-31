import { expect, test } from './fixtures'

// The home tank form into the fish list. The bug this guards: 60 cm, 26 °C, pH 7 gave "327 loài phù hợp", 244 of them
// with no temperature, pH or tank figure, because missing data counted as a match (2026-10-31). Read from the page, not
// from the test content, so they hold on aquatome.com too (production watch): each list shows 24 cards at a time.
const PAGE = 24
test('home tank form: sure matches first, species without the figures in a closed group, chips to drop filters', async ({ page }) => {
  // On aquatome.com the list holds every species' card (~16,000 elements): the trace that a failure keeps copies the whole
  // page at each of this journey's ~20 steps, about a second each on a phone, so it ran past 30 s (#236). The page itself
  // answers each step in milliseconds (2 s for the whole journey without the trace); the steps and assertions are unchanged.
  test.slow()
  await page.goto('/vi/')
  await page.locator('#tank button[type=submit]').click()
  await expect(page).toHaveURL(/\/vi\/ca\/\?tankCm=60&tempC=26&ph=7$/)

  // Both counts in the result line.
  const count = page.locator('#species-count')
  await expect(count).toHaveText(/^\d+ loài phù hợp · \d+ loài chưa đủ dữ liệu để chắc$/)
  const [sure, unsure] = (await count.textContent())!.match(/\d+/g)!.map(Number) as [number, number]
  expect(sure).toBeGreaterThan(0)
  expect(unsure).toBeGreaterThan(0)

  // The sure ones are the list; the unsure ones wait, closed, below it.
  const group = page.locator('#species-unsure')
  const first = group.locator('[data-slug]').first()
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(sure, PAGE))
  await expect(group.locator('summary')).toHaveText(`Chưa đủ dữ liệu để chắc (${unsure})`)
  await expect(first).toBeHidden()
  await group.locator('summary').click()
  await expect(first).toBeVisible()
  await expect(group.locator('[data-slug]:visible')).toHaveCount(Math.min(unsure, PAGE))

  // One chip per filter; × drops that one, keeps the rest, and stays in the address.
  const chips = page.locator('#species-chips button')
  await expect(chips).toHaveText(['Bể dài: 60 cm', 'Nhiệt độ: 26 °C', 'pH: 7'])
  await page.getByRole('button', { name: 'Bỏ Nhiệt độ: 26 °C' }).click()
  await expect(page).toHaveURL(/\?tankCm=60&ph=7$/)
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(1)).toBeFocused() // the chip that took its place
  await expect(page.locator('#species-filter input[name=tempC]')).toHaveValue('')

  // "Xóa lọc" clears everything: the address, the result line, the chips and the unsure group.
  await page.getByRole('button', { name: 'Xóa lọc' }).click()
  await expect(page).toHaveURL(/\/vi\/ca\/$/)
  await expect(count).toHaveText('')
  await expect(page.locator('#species-active')).toBeHidden()
  await expect(group).toBeHidden()
  const all = await page.locator('#species-index').evaluate(s => (JSON.parse(s.textContent!) as unknown[]).length)
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(all, PAGE))
})

test('a filter nothing surely matches opens the unsure group instead of showing an empty list', async ({ page }) => {
  // 10 cm: no species with a known smallest tank fits it; those with no tank figure are the possible ones.
  await page.goto('/vi/ca/?tankCm=10')
  await expect(page.locator('#species-count')).toHaveText(/^0 loài phù hợp · [1-9]\d* loài chưa đủ dữ liệu để chắc$/)
  await expect(page.locator('#species-unsure')).toHaveAttribute('open', '')
  await expect(page.locator('#species-unsure [data-slug]').first()).toBeVisible()
})
