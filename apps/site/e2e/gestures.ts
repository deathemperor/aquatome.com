import type { Locator, Page } from '@playwright/test'

/**
 * A finger on the phone project (Chrome's touch events, which the page sees as touch pointers), the mouse on the
 * computer: a swipe across the middle of `on`, `part` of its width (to the left negative), a pinch spreading two fingers
 * apart, a double tap or click. A swipe of over a quarter of the width goes on to the next photo however slow it is.
 * `held` runs before the finger lifts.
 */
export async function swipe(page: Page, on: Locator, part: number, touch: boolean, held?: () => Promise<void>) {
  const b = (await on.boundingBox())!
  const dx = b.width * part
  const x = b.x + b.width / 2 - dx / 2, y = b.y + b.height / 2
  if (!touch) {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y, { steps: 8 })
    await held?.()
    await page.mouse.up()
    return
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 8, y }] })
  await held?.()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

export async function pinchOut(page: Page, on: Locator) {
  const b = (await on.boundingBox())!
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  const at = (d: number) => [{ x: x - d, y, id: 0 }, { x: x + d, y, id: 1 }]
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(20) })
  for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(20 + k * 10) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

export async function doubleTap(page: Page, on: Locator, touch: boolean) {
  const b = (await on.boundingBox())!
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  if (!touch) return page.mouse.dblclick(x, y)
  await page.touchscreen.tap(x, y)
  await page.touchscreen.tap(x, y)
}
