import { expect, test } from './fixtures'

// The home tank form into the fish list. The bug this guards: 60 cm, 26 °C, pH 7 gave "327 loài phù hợp", 244 of them
// with no temperature, pH or tank figure, because missing data counted as a match (2026-10-31). Read from the page, not
// from the test content, so they hold on aquatome.com too (production watch): each list shows 24 cards at a time.
const PAGE = 24
test('home tank form: sure matches first, species without the figures in a closed group, chips to drop filters', async ({ page }) => {
  await page.goto('/')
  await page.locator('#tank button[type=submit]').click()
  await expect(page).toHaveURL(/\/ca\/\?tankCm=60&tempC=26&ph=7$/)

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
  await expect(page).toHaveURL(/\/ca\/$/)
  await expect(count).toHaveText('')
  await expect(page.locator('#species-active')).toBeHidden()
  await expect(group).toBeHidden()
  const all = Number(await page.locator('#species-result').getAttribute('data-total'))
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(all, PAGE))
})

test('a filter nothing surely matches opens the unsure group instead of showing an empty list', async ({ page }) => {
  // 10 cm: no species with a known smallest tank fits it; those with no tank figure are the possible ones.
  await page.goto('/ca/?tankCm=10')
  await expect(page.locator('#species-count')).toHaveText(/^0 loài phù hợp · [1-9]\d* loài chưa đủ dữ liệu để chắc$/)
  await expect(page.locator('#species-unsure')).toHaveAttribute('open', '')
  await expect(page.locator('#species-unsure [data-slug]').first()).toBeVisible()
})

// The hybrids come first on the fish list; the species after them read as a gap with no name when their heading was
// visually hidden (an AI page review, 2026-11-03). The list's heading shows, between the hybrids and the first card.
test('the fish list names its species where the hybrids end', async ({ page }) => {
  await page.goto('/ca/')
  const heading = page.getByRole('heading', { level: 2, name: 'Danh sách loài' })
  await expect(heading).toBeVisible()
  const box = (await heading.boundingBox())!
  expect(box.height).toBeGreaterThan(10)
  const card = (await page.locator('main .grid [data-slug]').first().boundingBox())!
  expect(box.y + box.height).toBeLessThan(card.y)
  const breeds = page.locator('section.breeds')
  if (await breeds.count()) expect((await breeds.boundingBox())!.y).toBeLessThan(box.y)
})

// The breed cards past the first ones wait in a template until asked for. Drawn, all 33 took the fish list past
// Lighthouse's 1,500 elements on a phone and every deploy failed (2026-11-06). The fixture has fewer breeds than that:
// the rest is checked where there are more, on aquatome.com (watch.yml). Read from the page, so it holds on both.
const BREEDS = 10
test('the fish list draws its first breed cards; "Xem tất cả" adds the rest, credited, focus on the first one added', async ({ page, errors }) => {
  await page.goto('/ca/')
  const section = page.locator('section.breeds')
  const cards = section.locator('ul > li')
  const drawn = await cards.count()
  const waiting = await section.evaluate(s => [...(s.querySelector('template')?.content.querySelectorAll('li') ?? [])]
    .map(li => ({ name: li.querySelector('.n')!.textContent!, href: li.querySelector('a')!.getAttribute('href')!, url: li.dataset.credit && (JSON.parse(li.dataset.credit) as { url: string }).url })))
  const total = drawn + waiting.length
  expect(drawn, 'breed cards drawn').toBe(Math.min(total, BREEDS))
  const more = section.getByRole('button', { name: `Xem tất cả ${total} cá lai và dòng cá cảnh` })
  if (!waiting.length) {
    await expect(more).toHaveCount(0)
    return
  }

  const hrefs = await cards.locator('.sc > a').evaluateAll(as => as.map(a => a.getAttribute('href')!))
  await more.click()
  await expect(section.locator('ul > li:visible')).toHaveCount(total)
  await expect(cards.nth(drawn).locator('.sc > a')).toBeFocused()
  await expect(more).toBeHidden()
  expect(await cards.locator('.sc > a').evaluateAll(as => as.map(a => a.getAttribute('href')!)), 'every breed, in order').toEqual([...hrefs, ...waiting.map(w => w.href)])
  const credited = await page.locator('#photo-credits a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  for (const w of waiting) if (w.url) expect(credited, `${w.name}'s photo credited`).toContain(w.url)

  // A filter reads every breed: a search finds one past the first cards. With no filter left, the list is as it was.
  const last = waiting.at(-1)!
  await page.goto(`/ca/?q=${encodeURIComponent(last.name)}`)
  await expect(page.locator('#species-count')).toHaveText(/loài phù hợp|Không có loài nào/)
  await expect(section.locator('ul > li:visible').filter({ hasText: last.name }).first()).toBeVisible()
  await expect(more).toBeHidden()
  await page.getByRole('button', { name: 'Xóa lọc' }).click()
  await expect(section.locator('ul > li:visible')).toHaveCount(drawn)
  await expect(more).toBeVisible()
  expect(errors).toEqual([])
})
