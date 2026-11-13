import { expect, test } from './fixtures'

// The home page's "Theo nhóm" row on a phone scrolls sideways and snaps each card to its start. Without a scroll padding
// the snap pulled the first card flush against the screen's edge, outside the page's margin the heading above it keeps
// (the AI page review, 2026-11-02).
test('home on a phone: the group row starts at the page margin, like its heading', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the row scrolls sideways on narrow screens only')
  await page.goto('/')
  const row = page.locator('ul.groups')
  await row.scrollIntoViewIfNeeded()
  const heading = await row.evaluate(ul => ul.closest('section')!.querySelector('h2')!.getBoundingClientRect().left)
  const first = await row.locator('li').first().evaluate(li => li.getBoundingClientRect().left)
  expect(Math.round(first), 'first card\'s left edge').toBe(Math.round(heading))
  // A slice of the next card shows, so the row reads as one that scrolls; and every card is the same height, with or
  // without a photo.
  const cards = await row.locator('li').evaluateAll(lis => lis.slice(0, 4).map(li => li.getBoundingClientRect()).map(r => ({ left: r.left, top: r.top, height: r.height })))
  const width = page.viewportSize()!.width
  if (cards.length === 4) expect(width - cards[3]!.left, 'the fourth card\'s visible slice').toBeGreaterThanOrEqual(8)
  expect(new Set(cards.map(c => Math.round(c.height))).size, 'card heights').toBe(1)
  expect(new Set(cards.map(c => Math.round(c.top))).size, 'card tops').toBe(1)
})

// The council's review of the home page (2026-11-07): an equipment kind split across two lines ("Lọc thùng (lọc
// ngoài)") and a line started with the dot between two kinds; a plant whose name ran to two lines dropped its care line
// below its neighbours'.
test('home: an equipment kind never wraps inside itself, and plant cards in a row end their care lines together', async ({ page }) => {
  await page.goto('/')
  const items = page.locator('.equip .it')
  expect(await items.count(), 'equipment kinds').toBeGreaterThan(0)
  const kinds = await items.evaluateAll(els => els.map(e => ({ text: e.textContent!, height: e.getBoundingClientRect().height, line: parseFloat(getComputedStyle(e).lineHeight) })))
  for (const k of kinds) expect(k.height, `"${k.text}" on one line`).toBeLessThan(k.line * 1.5)
  const cards = await page.locator('#plants-h').locator('xpath=ancestor::section').locator('.pc').evaluateAll(els => els.map(e => ({ top: Math.round(e.getBoundingClientRect().top), meta: Math.round(e.querySelector('.meta')!.getBoundingClientRect().bottom) })))
  expect(cards.length, 'plant cards').toBeGreaterThan(0)
  for (const top of new Set(cards.map(c => c.top))) expect(new Set(cards.filter(c => c.top === top).map(c => c.meta)).size, `care lines in the row at ${top}`).toBe(1)
})
