import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * The Chihiros page with a stand-in light: the browser's Bluetooth replaced by a fake WRGB II Slim that records every
 * frame written and answers the status question like the real one (firmware 24, then its clock). `clock`: how its
 * clock reads — right, seven hours slow, or reset by a power cut.
 */
async function fakeLight(page: Page, clock: 'ok' | 'slow' | 'reset' = 'ok') {
  await page.addInitScript(mode => {
    const w = window as unknown as { frames_: string[]; picks: number; drop: () => void }
    w.frames_ = []
    w.picks = 0
    const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join(' ')
    class Char extends EventTarget {
      value?: DataView
      properties = { write: true }
      async startNotifications() { return this }
      emit(bytes: number[]) { this.value = new DataView(Uint8Array.from(bytes).buffer); this.dispatchEvent(new Event('characteristicvaluechanged')) }
      async writeValueWithoutResponse(b: Uint8Array) { return this.writeValueWithResponse(b) }
      async writeValueWithResponse(b: Uint8Array) {
        w.frames_.push(hex(b))
        if (b[0] === 0x5a && b[5] === 0x04) setTimeout(() => {
          rx.emit([0x5b, 0x18, 0x0a, 0x00, 0x01, 0x0a, 0x01, 0xff, 0xff, 0xff, 0xff, 0x00, 0x05, 0x1d])
          const t = new Date(Date.now() - (mode === 'slow' ? 7 * 3600_000 : 0))
          const c = mode === 'reset' ? [0, 0, 2] : [t.getDay() || 7, t.getHours(), t.getMinutes()]
          rx.emit([0x5b, 0x18, 0x30, 0x00, 0x01, 0xfe, ...c, ...Array(41).fill(0)])
        }, 10)
      }
    }
    const rx = new Char(), tx = new Char()
    const device = Object.assign(new EventTarget(), {
      name: 'DYSL30TEST',
      gatt: {
        connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async (u: string) => (u.endsWith('0003-b5a3-f393-e0a9-e50e24dcca9e') ? rx : tx) }) }),
        disconnect: () => device.dispatchEvent(new Event('gattserverdisconnected')),
      },
    })
    w.drop = () => device.dispatchEvent(new Event('gattserverdisconnected'))
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => { w.picks++; return device } } })
  }, clock)
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { frames_: string[] }).frames_)
const card = (page: Page) => page.locator('#ch-light')

test('a new light: guided setup, the clock put right, a schedule written in the right order, remembered after a reload', async ({ page, errors }) => {
  await fakeLight(page, 'slow')
  await page.goto('/vi/cong-cu/den-chihiros/')
  await page.locator('#ch-connect').click()
  await expect(card(page).locator('.steps li')).toHaveCount(4)
  await expect(card(page)).toContainText('Đồng hồ đèn chậm 7 tiếng')
  await card(page).getByRole('button', { name: 'Chỉnh giờ đèn theo máy này' }).click()
  await expect(card(page)).toContainText('Đồng hồ đèn đúng giờ')

  await page.locator('.preset').first().click()
  await expect(page.locator('#ch-hours')).toContainText('6 tiếng')
  page.once('dialog', d => void d.accept())
  await page.locator('#ch-write').click()
  await expect(page.locator('#ch-status')).toContainText('Đã ghi: bật 13:00, tắt 19:00')
  // Clock, clear the scenes, scene mode, then 13:00–19:00 with a 30-minute ramp at 40% red, green and blue.
  const sent = await frames(page)
  const tail = sent.slice(-4)
  expect(tail[0]).toMatch(/^5a 01 0b .. .. 09 /)
  expect(tail[1]).toMatch(/^5a 01 08 .. .. 05 28 ff ff/)
  expect(tail[2]).toMatch(/^5a 01 08 .. .. 05 12 ff ff/)
  expect(tail[3]).toMatch(/^a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 28 28 ff/)
  await expect(page.locator('#ch-write')).toHaveText('Đèn đang dùng lịch này')
  await expect(page.locator('#ch-write')).toBeDisabled()
  await expect(page.locator('#ch-saved-list li')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('#ch-known li')).toHaveCount(1)
  await expect(page.locator('#ch-known li')).toContainText('13:00–19:00 · 40%')
  await page.locator('#ch-known button.go').click()
  await expect(card(page).locator('.steps')).toHaveCount(0)
  await expect(card(page)).toContainText('13:00–19:00 · 40%')

  // A second schedule needs no confirmation (the first is known) and can be undone.
  await page.locator('.preset').nth(1).click()
  await page.locator('#ch-write').click()
  await expect(page.locator('#ch-status')).toContainText('bật 12:00, tắt 20:00')
  await page.locator('#ch-status').getByRole('button', { name: 'Hoàn tác' }).click()
  await expect(page.locator('#ch-status')).toContainText('bật 13:00, tắt 19:00')
  expect((await frames(page)).at(-1)).toMatch(/ 19 0d 00 13 00 1e 7f 28 28 28 /)
  await expect(page.locator('#ch-saved-list li')).toHaveCount(2)

  // Off by hand, then back: the schedule this page wrote is written again, so it surely runs.
  await card(page).getByRole('button', { name: 'Tắt đèn' }).click()
  await expect(card(page)).toContainText('Đèn đang tắt bằng tay')
  await card(page).getByRole('button', { name: 'Theo lịch' }).click()
  await expect(page.locator('#ch-status')).toContainText('Đèn chạy lại theo lịch')
  expect((await frames(page)).slice(-3)).toEqual([expect.stringMatching(/ 05 28 ff ff /), expect.stringMatching(/ 05 12 ff ff /), expect.stringMatching(/ 19 0d 00 13 00 1e 7f 28 28 28 /)])
  expect(errors).toEqual([])
})

test('quick actions leave the schedule and come back to it; a dropped light reconnects without the picker', async ({ page }) => {
  await fakeLight(page)
  await page.goto('/vi/cong-cu/den-chihiros/')
  await page.locator('#ch-connect').click()
  await expect(card(page)).toContainText('Đồng hồ đèn đúng giờ')
  await card(page).getByRole('button', { name: 'Tắt đèn' }).click()
  await expect(card(page)).toContainText('Đèn đang tắt bằng tay')
  expect((await frames(page)).slice(-4)).toEqual([expect.stringMatching(/ 05 0b ff ff /), expect.stringMatching(/ 07 00 00 /), expect.stringMatching(/ 07 01 00 /), expect.stringMatching(/ 07 02 00 /)])
  await card(page).getByRole('button', { name: 'Theo lịch' }).click()
  await expect(page.locator('#ch-status')).toContainText('Đèn chạy lại theo lịch')
  expect((await frames(page)).at(-1)).toMatch(/ 05 12 ff ff /)
  await expect(card(page)).not.toContainText('bằng tay')

  await page.evaluate(() => (window as unknown as { drop: () => void }).drop())
  await expect(card(page)).toContainText('Mất kết nối')
  await card(page).getByRole('button', { name: 'Kết nối lại' }).click()
  await expect(card(page).locator('#ch-nick')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { picks: number }).picks)).toBe(1)
})

test('a light whose tank another tab deleted is saved again on a tank that exists, not back onto the deleted one', async ({ page }) => {
  await fakeLight(page)
  await page.goto('/vi/cong-cu/den-chihiros/')
  await page.locator('#ch-connect').click()
  await expect(card(page)).toContainText('Đồng hồ đèn đúng giờ')
  // "Bể của tôi" in another tab: the tank deleted, and the light on it (tombstones).
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('aq.tanks')!) as { tanks: { id: string }[]; devices: { id: string }[] }
    const at = new Date(Date.now() + 1000).toISOString()
    const gone = (r: { id: string }) => ({ id: r.id, updatedAt: at, deletedAt: at })
    localStorage.setItem('aq.tanks', JSON.stringify({ ...s, tanks: s.tanks.map(gone), devices: s.devices.map(gone) }))
  })
  await card(page).getByRole('button', { name: 'Tắt đèn' }).click()
  await expect(card(page)).toContainText('Đèn đang tắt bằng tay')
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!) as { tanks: { id: string; deletedAt?: string }[]; devices: { tankId?: string; bleName?: string; deletedAt?: string }[] })
  const lights = s.devices.filter(d => !d.deletedAt)
  expect(lights.map(d => d.bleName)).toEqual(['DYSL30TEST'])
  expect(s.tanks.filter(t => !t.deletedAt).map(t => t.id)).toContain(lights[0]!.tankId)
})

test('a clock reset by a power cut is reported', async ({ page }) => {
  await fakeLight(page, 'reset')
  await page.goto('/vi/cong-cu/den-chihiros/')
  await page.locator('#ch-connect').click()
  await expect(card(page)).toContainText('Đèn mất giờ, có thể do mất điện')
})

test('the timeline: handles move by keyboard and by dragging, the plan is kept for the next visit', async ({ page }) => {
  await page.goto('/vi/cong-cu/den-chihiros/')
  const on = page.locator('#tl-on')
  await on.focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('input[name=on]')).toHaveValue('13:00')
  await expect(on).toHaveAttribute('aria-valuetext', 'Bật lúc 13:00')

  const tl = (await page.locator('#ch-tl').boundingBox())!
  const off = (await page.locator('#tl-off').boundingBox())!
  await page.mouse.move(off.x + off.width / 2, off.y + off.height / 2)
  await page.mouse.down()
  await page.mouse.move(tl.x + (tl.width * 18) / 24, off.y + off.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('input[name=off]')).toHaveValue('18:00')
  await expect(page.locator('#ch-hours')).toContainText('5 tiếng')

  await page.locator('.look').nth(1).click()
  await expect(page.locator('.look').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('input[name=on]')).toHaveValue('13:00')
  await expect(page.locator('input[name=off]')).toHaveValue('18:00')
  await expect(page.locator('.look').nth(1)).toHaveAttribute('aria-pressed', 'true')
})
