import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The guide list (design critique 2026-10-31: 158 guides in one column of ~65 phone screens, no way in). Subjects and
// counts come from the chips on the page, so the checks hold on aquatome.com too. The list shows a page of guides at a
// time (its HTML has the first; the rest come from its data file, scripts/guide-list.ts).
const PAGE = 24
const count = (text: string) => Number(/(\d+)\s*$/.exec(text.trim())![1])
const cards = (page: Page) => page.locator('#guide-list > [data-kind]')
const visible = (page: Page) => page.locator('#guide-list > [data-kind]:visible')

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
    const [everything, ...kinds] = await subjects(page)
    const all = everything!.n
    await expect(everything!.chip).toHaveAttribute('aria-pressed', 'true')
    expect(await page.locator('#guide-list').getAttribute('data-total')).toBe(String(all))
    await expect(visible(page)).toHaveCount(Math.min(all, PAGE))
    expect(kinds.reduce((s, k) => s + k.n, 0)).toBe(all)
    if (lang === 'vi') await expect(page.locator('#guide-start h2')).toHaveText('Bắt đầu từ đây')

    // The smallest subject: only its guides, each labelled with it; the beginner row steps aside.
    const pick = kinds.reduce((a, b) => (b.n < a.n ? b : a))
    await pick.chip.click()
    await expect(page).toHaveURL(/\?kind=\w+$/)
    await expect(pick.chip).toHaveAttribute('aria-pressed', 'true')
    await expect(everything!.chip).toHaveAttribute('aria-pressed', 'false')
    await expect(visible(page)).toHaveCount(Math.min(pick.n, PAGE))
    const label = pick.text.replace(/\s*\d+\s*$/, '').trim()
    for (const kind of await page.locator('#guide-list > [data-kind]:visible .kind').allTextContents()) expect(kind).toBe(label)
    await expect(page.locator('#guide-start')).toBeHidden()

    // The address carries it: a reload (or a shared link) opens the same subject.
    await page.reload()
    await expect(pick.chip).toHaveAttribute('aria-pressed', 'true')
    await expect(visible(page)).toHaveCount(Math.min(pick.n, PAGE))
    await expect(page.locator('#guide-start')).toBeHidden()

    await everything!.chip.click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(visible(page)).toHaveCount(Math.min(all, PAGE))
    if (await page.locator('#guide-start').count()) await expect(page.locator('#guide-start')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('"Xem thêm" adds the next page in place; without the script it is a link to that page', async ({ page }) => {
  await page.goto('/vi/huong-dan/')
  const all = Number(await page.locator('#guide-list').getAttribute('data-total'))
  const more = page.locator('#guide-more')
  test.skip(all <= PAGE, 'one page of guides')
  await expect(more).toHaveAttribute('href', '/vi/huong-dan/trang/2/')
  await more.click()
  await expect(page).toHaveURL(/\/vi\/huong-dan\/$/)
  await expect(visible(page)).toHaveCount(Math.min(all, 2 * PAGE))
  // The numbered page: the next page of guides, linked back.
  await page.goto('/vi/huong-dan/trang/2/')
  await expect(page.locator('main .gc')).toHaveCount(Math.min(all - PAGE, PAGE))
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', '/vi/huong-dan/')
})

test('a guide card the browser builds is the card the server renders', async ({ page, request }) => {
  const html = await (await request.get('/vi/huong-dan/')).text()
  const chips = await page.goto('/vi/huong-dan/').then(() => subjects(page))
  test.skip(chips.length < 3, 'fewer than two subjects')
  const kind = await chips[1]!.chip.getAttribute('data-kind')
  const shown = () => visible(page).evaluateAll(els => els.map(e => e.outerHTML))
  await page.goto(`/vi/huong-dan/?kind=${kind}`)
  await expect(visible(page)).not.toHaveCount(0)
  const rendered = await shown()
  // The HTML without its cards: every card on show is built from the data file.
  const bare = html.replace(/(id="guide-list"[^>]*>)[\s\S]*?(<template id="guide-card")/, '$1$2')
  await page.route(url => url.pathname === '/vi/huong-dan/' && url.searchParams.has('kind'), route => route.fulfill({ body: bare, contentType: 'text/html; charset=utf-8' }))
  await page.reload()
  await expect(visible(page)).toHaveCount(rendered.length)
  expect(await shown()).toEqual(rendered)
})

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
