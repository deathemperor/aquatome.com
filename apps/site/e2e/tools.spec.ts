import { expect, test } from './fixtures'
import { sourcePages } from './pages'

test('tank volume: the default tank, then a new length, with the result shareable in the address', async ({ page }) => {
  await page.goto('/vi/cong-cu/the-tich-be/')
  await expect(page.locator('#vf-out .big')).toContainText('64,8 lít')
  await page.locator('#vf-fields input[name=l]').fill('100')
  await expect(page.locator('#vf-out .big')).toContainText('108 lít')
  await expect(page).toHaveURL(/l=100/)
})

// The tank-mates checker's page (E2E_TM_PATH: another address, e.g. the old tools page, to see these fail there).
const TM = process.env.E2E_TM_PATH ?? '/vi/cong-cu/nuoi-chung/'

test('tank-mates: "neon" suggests the neon tetras and adds nothing until one is picked', async ({ page, errors }) => {
  await page.goto(TM)
  const input = page.locator('#tm-input')
  await input.fill('neon')
  const options = page.locator('#tm-list [role=option]')
  await expect(options.first()).toBeVisible()
  await expect(options).toContainText(['Cá neon xanh', 'Cá neon vua'])
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  // A partial name is never picked for the reader.
  await page.locator('#tm-form button[type=submit]').click()
  await expect(page.locator('#tm-chosen li')).toHaveCount(0)
  await expect(page.locator('#tm-msg')).toContainText('chọn một loài')
  // The keyboard: down to the first suggestion, Enter adds it.
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'tm-opt-0')
  await input.press('Enter')
  await expect(page.locator('#tm-chosen li')).toHaveCount(1)
  await expect(page.locator('#tm-chosen li').first()).toContainText('Cá neon xanh')
  await expect(input).toHaveValue('')
  // A tap on a suggestion adds that one (a real tap on a phone: touch events, not a mouse click).
  await input.fill('neon')
  const vua = options.filter({ hasText: 'Cá neon vua' })
  if (test.info().project.name === 'phone') await vua.tap(); else await vua.click()
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  await expect(page).toHaveURL(/ca=ca-neon-xanh:\d+,ca-neon-vua:\d+/)
  // Escape closes the list.
  await input.fill('ca')
  await input.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  // Once picked or cleared, the box has no suggestions: ↓ doesn't bring back the last query's list.
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.press('Enter')
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('tank-mates: a name with no match says so and keeps what was typed', async ({ page }) => {
  await page.goto(TM)
  const input = page.locator('#tm-input')
  await input.fill('xyzq')
  await page.locator('#tm-form button[type=submit]').click()
  await expect(page.locator('#tm-msg')).toHaveText('Không thấy “xyzq”. Thử tên khoa học.')
  await expect(page.locator('#tm-chosen li')).toHaveCount(0)
  await expect(input).toHaveValue('xyzq')
})

test('tank-mates: an incompatible pair answers in one sentence first, then the warnings, then a table that fits', async ({ page }) => {
  await page.goto(TM)
  // A whole name typed out, common or scientific, is added without a pick. Two species both the fixture and aquatome.com
  // have (aquatome.com has two species called "Cá đĩa": the scientific name is the one only this one has).
  for (const name of ['Symphysodon aequifasciatus', 'Cá neon xanh']) {
    await page.locator('#tm-input').fill(name)
    await page.locator('#tm-input').press('Enter')
  }
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  const verdict = page.locator('#tm-verdict')
  // The first reason; the others depend on each site's figures (the fixture's temperatures don't overlap).
  await expect(verdict).toHaveText(/^Không nên nuôi chung: Cá đĩa có thể ăn Cá neon xanh[;.]/)
  const top = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y
  expect(await top('#tm-verdict')).toBeLessThan(await top('#tm-detail .warn'))
  expect(await top('#tm-detail .warn')).toBeLessThan(await top('#tm-detail table'))
  // Every value shows without a sideways scroll: 2 species and the shared row, 5 values each.
  const box = page.locator('#tm-detail .scroll')
  expect(await box.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(page.locator('#tm-detail td:visible')).toHaveCount(15)
  await expect(page).toHaveURL(/ca=ca-dia(-nau)?:\d+,ca-neon-xanh:\d+/)
})

test('tank-mates: links to the old place on the tools page open the checker with the same species', async ({ page }) => {
  await page.goto('/vi/cong-cu/?ca=ca-neon-vua:10,ca-dia#nuoi-chung')
  await expect(page).toHaveURL(/\/vi\/cong-cu\/nuoi-chung\/\?ca=ca-neon-vua:10,ca-dia:\d+$/)
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  await expect(page.locator('#tm-chosen input').first()).toHaveValue('10')
})

test('tools page: a card for every tool; the calculators below by anchor', async ({ page }) => {
  await page.goto('/vi/cong-cu/')
  await expect(page.locator('.tools a')).toHaveCount(7)
  await page.locator('.tools a[href="#suoi"]').click()
  await expect(page.locator('#suoi')).toBeInViewport()
  await page.locator('.tools a[href="/vi/cong-cu/nuoi-chung/"]').click()
  await expect(page).toHaveURL(/\/vi\/cong-cu\/nuoi-chung\/$/)
})

test('Chihiros page without Bluetooth: says which browsers work; the schedule form still works', async ({ page }) => {
  await page.addInitScript(() => { delete (Navigator.prototype as { bluetooth?: unknown }).bluetooth })
  await page.goto('/vi/cong-cu/den-chihiros/')
  await expect(page.locator('#ch-unsupported')).toBeVisible()
  await expect(page.locator('#ch-connect')).toBeDisabled()
  await expect(page.locator('#ch-write')).toBeDisabled()
  await page.locator('.preset').nth(1).click()
  await expect(page.locator('#ch-hours')).toHaveText(/8 tiếng/)
  await page.locator('input[name=off]').fill('10:00')
  await expect(page.locator('#ch-hours')).toHaveText(/Giờ tắt phải sau giờ bật/)
})

test('tank volume: the ready-made tank table fits a small phone in every language, glass column included', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'only a phone is narrow enough')
  await page.setViewportSize({ width: 360, height: 800 })
  for (const path of ['/vi/cong-cu/the-tich-be/', '/id/alat/volume-akuarium/', '/th/tools/tank-volume/']) {
    await page.goto(path)
    const table = await page.locator('.scroll').first().evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth, hint: getComputedStyle(el).backgroundImage }))
    expect(table.fits, `${path}: the table is wider than a 360 px phone`).toBe(true)
    expect(table.hint, `${path}: should it ever grow wider, a shadow at the edge says there is more to see`).toContain('gradient')
  }
})

test('wide tables on a phone show that they scroll sideways', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'only a phone is narrow enough')
  // A comparison table in a guide's text. The guide comes from the site's own pages: the fixture's guides and
  // aquatome.com's are different ones (a fixed fixture path timed out on aquatome.com, #193). The first guide whose
  // table is wider than a phone (the fixture has one); aquatome.com's tables may all fit, then the first guide's table.
  // Either way it must scroll inside itself, with the shadow hint, and stay within the screen.
  type Table = { path: string, wide: boolean, overflow: string, hint: string, right: number }
  let found: Table | undefined
  let tried = 0
  for (const path of sourcePages().filter(p => /^\/vi\/huong-dan\/[^/]+\/$/.test(p))) {
    if (tried >= 15) break
    if (!/<table/.test(await (await page.request.get(path)).text())) continue
    tried++
    await page.goto(path)
    const tables = await page.locator('.prose table').evaluateAll(els => els.map(el => ({
      wide: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).overflowX,
      hint: getComputedStyle(el).backgroundImage,
      right: el.getBoundingClientRect().right,
    })))
    const table = tables.find(t => t.wide) ?? (found ? undefined : tables[0])
    if (table) found = { path, ...table }
    if (found?.wide) break
  }
  expect(found, 'a guide with a table in its text').toBeTruthy()
  const { path, overflow, hint, right } = found!
  expect(overflow, `${path}: the table scrolls inside itself`).toBe('auto')
  expect(hint, `${path}: a shadow at the edge that has more to see`).toContain('gradient')
  expect(right, `${path}: the table stays within the screen`).toBeLessThanOrEqual(page.viewportSize()!.width)
})
