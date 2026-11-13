import type { Page } from '@playwright/test'
import { columnSpill, expect, test } from './fixtures'
import { LIVE } from './pages'

// The owner's fault of 13 November, the altum angelfish's page on a computer: a tall head photo and two rows of thumbnails
// under it needed more than the window, the photo column was held to the window's height, and its rows ran past its box.
// Pinned beside the facts, the box stopped at the end of the page's top and the rows lay over the jump chips and the first
// section's heading. The column is now never shorter than what it holds (pages/ca/[slug].astro). Here the fixture's page
// with two rows of thumbnails (the cardinal tetra's) gets a tall head, as the page draws one (a head shown whole, in its
// own shape: PhotoGallery.astro), from the narrowest computer window to a tall one, in Chromium (`desktop`) and WebKit
// (`safari`). The invariants hold every sampled fish page to the same on the live site.
const windows = [
  { width: 861, height: 800 },
  { width: 1280, height: 720 }, // under 50rem: the column scrolls with the facts, and only its strip is pinned
  { width: 1280, height: 800, tight: true },
  { width: 1440, height: 900, tight: true },
  { width: 1707, height: 833, tight: true },
  { width: 1707, height: 1300, roomy: true },
  { width: 1707, height: 1300, roomy: true, own: true }, // the page's own head, 4:3: more room left for the thumbnails
]

// The rule the column had: held to its room (the window under its pinned top, or the facts), whatever it holds.
const HELD = '@media (min-width: 861px) and (min-height: 50rem) { .side:has(> .strip) { height: min(100%, calc(100dvh - var(--sticky-top, 0px) - var(--space-4))) !important; min-height: 0 !important } }'

const column = (page: Page) => page.evaluate(() => {
  const top = document.querySelector<HTMLElement>('.top:has(> .side)')!, side = top.querySelector<HTMLElement>(':scope > .side')!
  const list = side.querySelector('ul')!, l = list.getBoundingClientRect(), pad = getComputedStyle(top)
  const items = [...list.querySelectorAll('li')], thumbs = items.map(li => li.getBoundingClientRect()).filter(r => r.height && r.top < l.bottom)
  const row = thumbs[0]!.height, gap = thumbs[4] ? thumbs[4].top - thumbs[0]!.bottom : 0
  return {
    row, gap,
    // Room the column leaves under its last row of thumbnails.
    under: side.getBoundingClientRect().bottom - Math.max(...thumbs.map(r => r.bottom)),
    left: items.length - thumbs.length, // the gallery's photos it could still show
    past: side.scrollHeight - side.clientHeight, // what it holds past its own box
    height: side.getBoundingClientRect().height,
    // Its room: the window under its pinned top, or its grid area (the page's top less its padding) when that ends first.
    room: Math.min(innerHeight - parseFloat(getComputedStyle(side).top), top.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom)),
    shown: thumbs.length,
    fit: Math.min(items.length, 4 * Math.floor((l.height + gap) / (row + gap))),
    cut: thumbs.filter(r => r.bottom > l.bottom + 0.5).length,
  }
})

for (const { width, height, tight, roomy, own } of windows) test(`${own ? "the page's own photo" : 'a tall photo'}: the column stays inside the page's top, ${width}×${height}`, async ({ page }, info) => {
  test.skip(info.project.name === 'phone', "a computer's photo column")
  test.skip(LIVE, 'reads a fixture page')
  await page.setViewportSize({ width, height })
  await page.goto('/ca/ca-neon-vua/')
  await expect(page.locator('.side .strip li:not(.more)'), 'two rows of thumbnails').toHaveCount(8)
  if (!own) await page.locator('.side .plate img').evaluate(img => {
    img.dataset.fit = 'contain'
    img.setAttribute('width', '720')
    img.setAttribute('height', '960')
    img.style.aspectRatio = '720 / 960'
  })
  expect(await columnSpill(page), 'the photo column outside the page top').toBeNull()
  if (tight) {
    // The photo and the two rows need more than the column's room: it is as tall as they are, all of them in its box.
    const c = await column(page)
    expect(c.height, 'the column needs more than its room').toBeGreaterThan(c.room + 1)
    expect(c.past, 'nothing past the column').toBeLessThanOrEqual(1)
    expect(c.shown, "the strip's own two rows").toBe(8)
    expect(c.cut, 'no thumbnail cut').toBe(0)
    // Held to its room, as it was, the column runs past the page's top: the check sees the owner's fault here.
    await page.addStyleTag({ content: HELD })
    expect(await columnSpill(page), 'the fault, with the column held to its room').not.toBeNull()
  }
  if (roomy) {
    // Room to spare: the column still fills it, in whole rows of the gallery's next photos, as many as fit, with less
    // than a row's room left under the last (species.spec.ts holds the same in Chromium on its own windows).
    const c = await column(page)
    expect(Math.abs(c.height - c.room), 'the column as tall as its room').toBeLessThanOrEqual(1)
    expect(c.left, "photos left that the column could show").toBeGreaterThan(0)
    expect(c.under, 'less than a row of room under the last row').toBeLessThan(c.row + c.gap)
    expect(c.shown, 'whole rows, as many as fit').toBe(c.fit)
    expect(c.cut, 'no thumbnail cut').toBe(0)
  }
})
