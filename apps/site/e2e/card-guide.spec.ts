import { expect, test } from './fixtures'

// A species' data card explains itself: each label leads to its section of the explainer page (a computer's click; on a
// touch screen the first tap shows what the figure is, with a link), and the difficulty cell opens "Vì sao?", the needs
// that make the fish easy or hard. Read from the page (the label's own link, the panel's rows), so it holds on
// aquatome.com too: Cá neon vua is on the fixture and the live site, with a difficulty, water figures and traits.
const FISH = '/vi/ca/ca-neon-vua/'

test('a data card label opens its section of the explainer page', async ({ page, errors }, info) => {
  await page.goto(FISH)
  const label = page.locator('.facts .card [data-field="difficulty"] dt a')
  const name = (await label.textContent())!.trim()
  const href = (await label.getAttribute('href'))!
  const hash = new URL(href, page.url()).hash
  expect(hash, 'the label leads to a section').not.toBe('')
  const tip = page.locator('.gl-tip')
  if (info.project.name === 'phone') {
    await label.tap()
    await expect(tip).toBeVisible()
    await expect(tip.locator('strong')).toHaveText(name)
    await expect(tip.locator('p')).toHaveText((await label.getAttribute('data-tip'))!)
    await expect(page).toHaveURL(new RegExp(`${FISH}$`))
    await tip.locator('a').tap()
  } else {
    await label.hover()
    await expect(tip).toBeVisible()
    await expect(tip.locator('strong')).toHaveText(name)
    await label.click()
  }
  await expect(page).toHaveURL(new RegExp(`${new URL(href, page.url()).pathname}${hash}$`))
  const section = page.locator(hash)
  await expect(section).toHaveText(name)
  await expect(section).toBeInViewport()
  expect(errors).toEqual([])
})

test('the difficulty cell opens "Vì sao?": each need with its level and the figure it comes from', async ({ page, errors }, info) => {
  await page.goto(FISH)
  const cell = page.locator('.facts .card [data-field="difficulty"]')
  const summary = cell.locator('details.why > summary')
  const panel = cell.locator('.needs')
  await expect(panel).toBeHidden()
  expect((await summary.boundingBox())!.height, 'toggle height').toBeGreaterThanOrEqual(44)
  if (info.project.name === 'phone') await summary.tap(); else await summary.click()
  await expect(panel).toBeVisible()
  const needs = panel.locator('li')
  expect(await needs.count(), 'needs read from the card').toBeGreaterThanOrEqual(1)
  for (const need of await needs.all()) {
    await expect(need.locator('.nm')).toHaveText(/\S/)
    await expect(need.locator('.lv')).toHaveText(/^(Dễ|Vừa|Khó)$/)
    await expect(need.locator('.fx')).toHaveText(/\S/)
  }
  // Open, the cell takes the card's whole width, and nothing in it runs off the screen.
  const [card, open] = [(await page.locator('.facts .card').boundingBox())!, (await cell.boundingBox())!]
  expect(open.width, 'the open cell spans the card').toBeGreaterThan(card.width - 4)
  const vw = page.viewportSize()!.width
  const spill = await panel.locator('*').evaluateAll((els, w) => els.filter(e => e.getBoundingClientRect().right > w + 1).length, vw)
  expect(spill, 'elements past the screen edge').toBe(0)
  // Its link explains how the levels are set.
  const how = panel.locator('.note a')
  const hash = new URL((await how.getAttribute('href'))!, page.url()).hash
  if (info.project.name === 'phone') await how.tap(); else await how.click()
  await expect(page.locator(hash)).toBeInViewport()
  expect(errors).toEqual([])
})
