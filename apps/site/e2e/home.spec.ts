import { expect, test } from './fixtures'

// The home page's "Theo nhóm" row on a phone scrolls sideways and snaps each card to its start. Without a scroll padding
// the snap pulled the first card flush against the screen's edge, outside the page's margin the heading above it keeps
// (the AI page review, 2026-11-02).
test('home on a phone: the group row starts at the page margin, like its heading', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the row scrolls sideways on narrow screens only')
  await page.goto('/vi/')
  const row = page.locator('ul.groups')
  await row.scrollIntoViewIfNeeded()
  const heading = await row.evaluate(ul => ul.closest('section')!.querySelector('h2')!.getBoundingClientRect().left)
  const first = await row.locator('li').first().evaluate(li => li.getBoundingClientRect().left)
  expect(Math.round(first), 'first card\'s left edge').toBe(Math.round(heading))
})
