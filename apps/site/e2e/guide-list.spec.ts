import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The guide list (design critique 2026-10-31: 158 guides in one column of ~65 phone screens, no way in). Subjects and
// counts come from the chips on the page, so the checks hold on aquatome.com too.
const count = (text: string) => Number(/(\d+)\s*$/.exec(text.trim())![1])
const cards = (page: Page) => page.locator('#guide-list > [data-kind]')

/** The subject chips: label, number of guides, and the chip, "Tất cả" first. */
async function subjects(page: Page) {
  const chips = page.locator('#guide-kinds button')
  return (await chips.allTextContents()).map((text, i) => ({ text, n: count(text), chip: chips.nth(i) }))
}

for (const [path, lang] of [['/vi/huong-dan/', 'vi'], ['/id/panduan/', 'id'], ['/th/guides/', 'th']] as const) {
  test(`guide list: a subject chip shows its guides, in the address; "all" brings back the list and the beginner row (${path})`, async ({ page, errors }) => {
    await page.goto(path)
    // Read from the cards, not the chips: a list with two subjects must have chips.
    test.skip(new Set(await page.locator('main .gc .kind').allTextContents()).size < 2, 'fewer than two subjects published in this language')
    const all = await cards(page).count()
    const [everything, ...kinds] = await subjects(page)
    await expect(everything!.chip).toHaveAttribute('aria-pressed', 'true')
    expect(everything!.n).toBe(all)
    expect(kinds.reduce((s, k) => s + k.n, 0)).toBe(all)
    if (lang === 'vi') await expect(page.locator('#guide-start h2')).toHaveText('Bắt đầu từ đây')

    // The smallest subject: only its guides, each labelled with it; the beginner row steps aside.
    const pick = kinds.reduce((a, b) => (b.n < a.n ? b : a))
    await pick.chip.click()
    await expect(page).toHaveURL(/\?kind=\w+$/)
    await expect(pick.chip).toHaveAttribute('aria-pressed', 'true')
    await expect(everything!.chip).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#guide-list > [data-kind]:visible')).toHaveCount(pick.n)
    const label = pick.text.replace(/\s*\d+\s*$/, '').trim()
    for (const kind of await page.locator('#guide-list > [data-kind]:visible .kind').allTextContents()) expect(kind).toBe(label)
    await expect(page.locator('#guide-start')).toBeHidden()

    // The address carries it: a reload (or a shared link) opens the same subject.
    await page.reload()
    await expect(pick.chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#guide-list > [data-kind]:visible')).toHaveCount(pick.n)

    await everything!.chip.click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('#guide-list > [data-kind]:visible')).toHaveCount(all)
    if (await page.locator('#guide-start').count()) await expect(page.locator('#guide-start')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('on a phone, guides are compact rows: a small picture beside the title', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.goto('/vi/huong-dan/')
  const first = cards(page).first()
  const img = (await first.locator('.img').boundingBox())!
  const title = (await first.locator('h3').boundingBox())!
  expect(img.x + img.width).toBeLessThanOrEqual(title.x)
  expect(img.width).toBeLessThan(page.viewportSize()!.width / 2)
  // Four rows to a phone screen at least (a full-width card was about one).
  expect((await first.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height / 4)
})
