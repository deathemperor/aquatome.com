import { expect, test } from './fixtures'

// A product page's reviews and control block (fixture product): the numbered marks, the top review's player, the tool.
// The live site's product pages get their reviews one a cycle, so this reads the fixture build only.
const PAGE = '/san-pham/chihiros-wrgb-ii-slim/'
test.skip(!!process.env.E2E_BASE_URL, 'fixture product')

test('a claim\'s mark shows its review and goes to the moment it was said', async ({ page, errors }, info) => {
  await page.goto(PAGE)
  const mark = page.locator('.reviews li a.cite').first()
  const href = (await mark.getAttribute('href'))!
  expect(href).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}&t=\d+$/)
  if (info.project.name === 'phone') await mark.tap(); else await mark.hover()
  const tip = page.locator('.gl-tip')
  await expect(tip).toBeVisible()
  await expect(tip.locator('strong')).toHaveText((await mark.getAttribute('data-term'))!)
  await expect(tip.locator('p')).toContainText('YouTube ·')
  if (info.project.name === 'phone') await expect(tip.locator('a')).toHaveAttribute('href', href)
  expect(errors).toEqual([])
})

test('the top review plays in its place; nothing loads from YouTube until it\'s asked for', async ({ page, errors }) => {
  await page.goto(PAGE)
  await expect(page.locator('.reviews iframe')).toHaveCount(0)
  await page.locator('.reviews button.facade').click()
  await expect(page.locator('.reviews iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/[\w-]{11}/)
  expect(errors).toEqual([])
})

test('the measured table stays inside a phone\'s width, and the control block opens the tool', async ({ page, errors }) => {
  await page.goto(PAGE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.locator('.measured tbody tr')).toHaveCount(2)
  await page.locator('.control a.tool').click()
  await expect(page).toHaveURL(/\/cong-cu\/den-chihiros\/$/)
  expect(errors).toEqual([])
})
