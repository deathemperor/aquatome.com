import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The page first draws its text in a stand-in sized like the web font (styles/tokens.css), so the web fonts arriving
// move nothing. A machine with none of the stand-in's fonts draws the text in a differently sized face, and every line
// moves when the fonts arrive. Found on Linux (GitHub's runners: Liberation fonts, no Arial or Georgia), where Lighthouse
// measured a layout shift of 0.215 on a plant page without a photo, its text all on the first screen (2026-11-01).

/** Loads `path` with its web fonts held back until it has drawn, then lets them in: the layout shift that follows. */
async function shiftWhenFontsArrive(page: Page, path: string) {
  let release!: () => void
  const held = new Promise<void>(r => (release = r))
  await page.route(/\.woff2$/, async route => { await held; await route.continue() })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // Drawn with the stand-ins (past the font's short block period).
  await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 500)))
  await page.evaluate(() => {
    const w = window as unknown as { shift: number }
    w.shift = 0
    new PerformanceObserver(list => { for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.shift += e.value }).observe({ type: 'layout-shift' })
  })
  release()
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 300)) })
  await page.unroute(/\.woff2$/)
  return page.evaluate(() => (window as unknown as { shift: number }).shift)
}

test('the web fonts arriving move nothing on the first screen', async ({ page }) => {
  // A plant page without a photo has text all down its first screen (the page Lighthouse caught), so the list's first
  // card without one; plus the home page, a list and a guide.
  await page.goto('/vi/cay/')
  const bare = page.locator('main .pc:not(:has(.plate img)) a').first()
  const plant = (await bare.count()) ? await bare.getAttribute('href') : null
  const guide = await page.goto('/vi/huong-dan/').then(() => page.locator('#guide-list a').first().getAttribute('href'))
  for (const path of ['/vi/', '/vi/cay/', guide!, ...(plant ? [plant] : [])]) {
    expect.soft(await shiftWhenFontsArrive(page, path), `layout shift on ${path} when the web fonts arrive`).toBeLessThanOrEqual(0.1)
  }
})
