import { expect, test } from './fixtures'

// The video index (/video/) on a 390 px phone. With four cards a series it was 25,064 px long, about 30 screens, and
// each playlist the engine added made it ~1,700 px longer (2026-11-01). Now each series, each channel's single videos and
// each channel is one short row, and the rest of the page (the newest videos, headings, footer) is a fixed part. Both are
// read from the page, so the check holds on the test build and on aquatome.com as playlists are added.
const ROW = 130 // px, the tallest a row may be (2026-11-01: 120)
// px, the page apart from its rows (2026-11-01: 1,222 with the real content, 1,302 on the test build, which also has a
// channel's single videos)
const REST = 1400
// The longest series name the engine asks for (≤ 60 characters, packages/engine/src/youtube.ts), so the test build's short
// names don't hide a row that a long one makes too tall (2026-11-06: a 61-character name took three lines, a 140 px row).
const LONG_NAME = 'Thí nghiệm thực tế về chu trình nitơ, nắp bể và lưu lượng lọc'.slice(0, 60)

test('the video index grows by one short row a series, and the rest of it stays the same length', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'measured on a phone')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/video/')
  const series = page.locator('main .rows > li')
  await series.first().locator('h3').evaluate((h, name) => { h.textContent = name }, LONG_NAME)
  const rows = await page.locator('main .rows > li, main .chans > li').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
  for (const h of rows) expect(h, 'a row, px').toBeLessThanOrEqual(ROW)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(height - rows.reduce((a, b) => a + b, 0), 'the page apart from its rows, px').toBeLessThanOrEqual(REST)
  // A picture for each newest video and each row, no more.
  expect(await page.locator('main img').count()).toBeLessThanOrEqual(6 + (await series.count()))
  expect(errors).toEqual([])
})
