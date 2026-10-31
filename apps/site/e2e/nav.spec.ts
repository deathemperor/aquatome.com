import { expect, test } from './fixtures'

// The header (design critique 2026-10-31, #1 and #17). The bug this guards: on a phone it took 199 px of an 839 px
// screen (logo, a two-line tagline, Tìm, units, theme, language on a row of its own, 7 links on two more), and the units
// and language buttons were 26 px tall. Now one row; the sections and settings it leaves out are in a menu sheet.

for (const path of ['/vi/', '/id/', '/th/', '/vi/ca/ca-neon-vua/']) {
  test(`header ${path}: one short row, every control at least 44 px`, async ({ page }, info) => {
    await page.goto(path)
    const header = page.locator('header.nav')
    expect((await header.boundingBox())!.height, 'header height').toBeLessThanOrEqual(info.project.name === 'phone' ? 64 : 72)
    const small = await header.evaluate(h => [...h.querySelectorAll<HTMLElement>('a, button, summary')]
      .filter(e => e.checkVisibility())
      .map(e => ({ name: (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ name, r }) => `${name} ${Math.round(r.width)}×${Math.round(r.height)}`))
    expect(small, 'controls under 44 px').toEqual([])
  })
}

test('computer: the five sections, search and the settings in the row; no menu button', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the phone header has the menu instead')
  await page.goto('/vi/')
  const nav = page.locator('header.nav .sections')
  await expect(nav.getByRole('link')).toHaveText(['Loài cá', 'Cây', 'Hướng dẫn', 'Công cụ', 'Thuật ngữ'])
  for (const sel of ['.find', '[data-units-toggle]', '[data-theme-toggle]', '[data-lang-menu] summary']) await expect(page.locator(`header.nav ${sel}`)).toBeVisible()
  await expect(page.locator('header [data-menu-open]')).toBeHidden()
})

test('menu sheet: a link in it leaves; Enter opens it, Tab stays in it, Esc closes it and focus goes back', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'the full header row has no menu')
  await page.goto('/vi/')
  const button = page.locator('header [data-menu-open]')
  const sheet = page.locator('#site-menu')
  await expect(sheet).toBeHidden()
  await button.tap()
  await expect(sheet).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  // The sections, the two pages the header row leaves out, and the settings.
  for (const name of ['Loài cá', 'Cây', 'Hướng dẫn', 'Công cụ', 'Thuật ngữ', 'Thiết bị', 'Mới cập nhật']) await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible()
  for (const sel of ['[data-units-toggle]', '[data-theme-toggle]', '[data-lang-menu] a[data-lang="th"]']) await expect(sheet.locator(sel)).toBeVisible()
  await sheet.getByRole('link', { name: 'Thuật ngữ', exact: true }).tap()
  await expect(page).toHaveURL(/\/vi\/thuat-ngu\/$/)

  await button.focus()
  await page.keyboard.press('Enter')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Thuật ngữ', exact: true })).toHaveAttribute('aria-current', 'page')
  // The page behind is out of reach: focus never lands on it.
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || !!a.closest('#site-menu') }), `Tab ${i + 1} left the sheet`).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-expanded', 'false')

  // A tap outside the sheet closes it too.
  await button.tap()
  await expect(sheet).toBeVisible()
  await page.touchscreen.tap(page.viewportSize()!.width / 2, 10)
  await expect(sheet).toBeHidden()
  expect(errors).toEqual([])
})
