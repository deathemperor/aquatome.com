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
