import { expect, test } from './fixtures'

const PATH = '/cong-cu/du-toan-be/'

test('setup budget: a bigger tank and a higher tier raise the total; extras add their rows; the plan is in the address', async ({ page, errors }) => {
  await page.goto(PATH)
  const total = page.locator('#db-total')
  const start = await total.textContent()
  expect(start).toMatch(/triệu ₫$/)
  // A shop link for the tank, searching the tank's size.
  const tankShop = page.locator('tr[data-part=be] a[data-go]')
  await expect(tankShop).toHaveAttribute('href', /^\/go\/shopee\/\?k=b%E1%BB%83\+c%C3%A1\+60cm&/)

  await page.locator('label.chip', { hasText: '120 cm' }).click()
  await expect(total).not.toHaveText(start!)
  await expect(tankShop).toHaveAttribute('href', /k=b%E1%BB%83\+c%C3%A1\+120cm&/)
  const bigger = await total.textContent()
  await page.locator('label.seg', { hasText: 'Cao cấp' }).click()
  await expect(total).not.toHaveText(bigger!)
  // Both ends rise: the premium 120 cm setup starts above the mid-range one's top.
  const low = (s: string) => Number(s.replace(/[^\d,–]/g, '').split('–')[0]!.replace(',', '.'))
  expect(low((await total.textContent())!)).toBeGreaterThan(low(bigger!))
  await expect(page).toHaveURL(/co=120x50x55/)
  await expect(page).toHaveURL(/muc=cao-cap/)

  // CO₂: its kit and its refills appear, and the total moves.
  const co2Row = page.locator('tr[data-part=co2]')
  await expect(co2Row).toBeHidden()
  const before = await total.textContent()
  await page.getByLabel('Có CO₂').check()
  await expect(co2Row).toBeVisible()
  await expect(page.locator('tr[data-run=co2]')).toBeVisible()
  await expect(total).not.toHaveText(before!)

  // A shared address opens the same plan.
  await page.goto(page.url())
  await expect(page.locator('label.chip', { hasText: '120 cm' }).locator('input')).toBeChecked()
  await expect(page.getByLabel('Có CO₂')).toBeChecked()
  await expect(co2Row).toBeVisible()
  expect(errors).toEqual([])
})

test('setup budget: another size by its sides or its litres; the electricity in another country\'s tariff and currency', async ({ page }) => {
  await page.goto(PATH)
  await page.locator('label.chip', { hasText: 'Cỡ khác' }).click()
  // The boxes start from the last preset's sides.
  await expect(page.locator('input[name=l]')).toHaveValue('60')
  await page.locator('input[name=l]').fill('')
  await expect(page.locator('#db-hint')).toBeVisible()
  await page.locator('input[name=lit]').fill('600')
  await expect(page.locator('#db-hint')).toBeHidden()
  await expect(page.locator('#db-over')).toBeVisible()

  // Another country's electricity in its own currency, on a line of its own: never added to the đồng.
  const power = page.locator('#db-month-power')
  await expect(power).toBeHidden()
  await page.locator('select[name=nuoc]').selectOption('id')
  await expect(page.locator('select[name=bac] option')).toHaveCount(3)
  await expect(power).toContainText('IDR')
  await expect(page.locator('#db-month')).not.toContainText('IDR')
  await expect(page.locator('tr[data-run=dien] .price')).toContainText('IDR')
  await page.locator('select[name=nuoc]').selectOption('vn')
  await expect(page.locator('select[name=bac] option')).toHaveCount(5)
  await expect(power).toBeHidden()
})

test('setup budget: fits a 320 px phone in every language; shop links only where the shops are', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'only a phone is narrow enough')
  await page.setViewportSize({ width: 320, height: 720 })
  for (const path of [PATH, '/id/alat/anggaran-akuarium/', '/th/tools/tank-budget/']) {
    await page.goto(`${path}?co2=1&tm=1&muc=cao-cap`)
    await expect(page.locator('tr[data-part=thong-minh]')).toBeVisible()
    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(wide, `${path}: no sideways scroll at 320 px`).toBeLessThanOrEqual(320)
    // The three tiers stay one control, on one row, with the longest names (Indonesian's broke onto two rows once).
    const tops = await page.locator('.seg').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size, `${path}: the tiers on one row`).toBe(1)
    expect(await page.locator('a[data-go]').count(), path).toBe(path === PATH ? 7 : 0)
  }
})
