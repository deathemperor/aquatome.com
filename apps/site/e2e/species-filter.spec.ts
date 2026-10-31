import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Clicks a list's "Xem thêm" until all `n` of its cards are out: it shows only while some are left (24 a page). */
async function showAll(more: Locator, n: number) {
  for (let left = n - 24; left > 0; left -= 24) {
    await expect(more).toHaveText(`Xem thêm ${Math.min(left, 24)} loài (còn ${left})`)
    await more.click()
  }
  await expect(more).toBeHidden()
}

type Item = { slug: string } & Record<string, unknown>
/** The species list's own data (#species-index), as the page's script reads it. */
const speciesIndex = (page: Page) => page.locator('#species-index').evaluate(s => JSON.parse(s.textContent!) as Item[])
/** Whether the species with this card's slug lacks at least one of these figures. */
const missing = (index: Item[], slug: string | null, keys: string[]) => {
  const item = index.find(i => i.slug === slug)
  return !!item && keys.some(k => item[k] === undefined)
}

// The home tank form into the fish list. The bug this guards: 60 cm, 26 °C, pH 7 gave "327 loài phù hợp", 244 of them
// with no temperature, pH or tank figure, because missing data counted as a match (2026-10-31). Fixture: Cá ông tiên
// has only its size, so it can't be a sure match for any tank. Lists show 24 cards a page; aquatome.com has more matches.
test('home tank form: sure matches first, species without the figures in a closed group, chips to drop filters', async ({ page }) => {
  await page.goto('/vi/')
  await page.locator('#tank button[type=submit]').click()
  await expect(page).toHaveURL(/\/vi\/ca\/\?tankCm=60&tempC=26&ph=7$/)
  const index = await speciesIndex(page)

  // Both counts in the result line.
  const count = page.locator('#species-count')
  await expect(count).toHaveText(/^\d+ loài phù hợp · \d+ loài chưa đủ dữ liệu để chắc$/)
  const [sure, unsure] = (await count.textContent())!.match(/\d+/g)!.map(Number) as [number, number]
  expect(sure).toBeGreaterThan(0)
  expect(unsure).toBeGreaterThan(0)

  // The sure ones are the list, a page of 24 at a time; the unsure ones wait, closed, below it.
  const group = page.locator('#species-unsure')
  // Its first card (Cá ông tiên in the fixture, which has only its size): missing one of the three figures asked for.
  const firstUnsure = group.locator('[data-slug]').first()
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(sure, 24))
  await showAll(page.locator('#species-more'), sure)
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(sure)
  await expect(group.locator('summary')).toHaveText(`Chưa đủ dữ liệu để chắc (${unsure})`)
  await expect(group.locator('[data-slug]:visible')).toHaveCount(0)
  await group.locator('summary').click()
  await expect(group.locator('[data-slug]:visible')).toHaveCount(Math.min(unsure, 24))
  await showAll(page.locator('#unsure-more'), unsure)
  await expect(group.locator('[data-slug]:visible')).toHaveCount(unsure)
  await expect(firstUnsure).toBeVisible()
  expect(missing(index, await firstUnsure.getAttribute('data-slug'), ['tankCm', 'tempC', 'ph'])).toBe(true)

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
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(index.length, 24))
})

test('a filter nothing surely matches opens the unsure group instead of showing an empty list', async ({ page }) => {
  // 10 cm: no species with a known tank fits it; those with no tank figure (Cá ông tiên in the fixture) may.
  await page.goto('/vi/ca/?tankCm=10')
  await expect(page.locator('#species-count')).toHaveText(/^0 loài phù hợp · [1-9]\d* loài chưa đủ dữ liệu để chắc$/)
  await expect(page.locator('#species-unsure')).toHaveAttribute('open', '')
  const first = page.locator('#species-unsure [data-slug]').first()
  await expect(first).toBeVisible()
  expect(missing(await speciesIndex(page), await first.getAttribute('data-slug'), ['tankCm'])).toBe(true)
})
