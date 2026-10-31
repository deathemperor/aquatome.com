import { expect, test } from './fixtures'

// "Bể của tôi": tanks kept in this browser (localStorage aq.tanks, the shared model in packages/schema/src/tanks.ts).
const PAGE = '/vi/cong-cu/be-cua-toi/'
const at = '2026-10-30T08:00:00.000Z'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('make a tank with no network, reload: it is still there; edit it; delete it', async ({ page, errors }) => {
  await page.goto(PAGE)
  await expect(page.locator('#mt-empty')).toBeVisible()
  await page.context().setOffline(true)
  await page.locator('#mt-empty [data-add]').click()
  await page.locator('#mt-form input[name=name]').fill('Bể 60 phòng khách')
  await page.locator('#mt-form input[name=l]').fill('60')
  await page.locator('#mt-form input[name=w]').fill('30')
  await page.locator('#mt-form input[name=h]').fill('36')
  await expect(page.locator('#mt-form output[name=litres]')).toHaveText('= 64,8 lít')
  await page.locator('#mt-form select[name=substrate]').selectOption('soil')
  await page.locator('#mt-form textarea[name=notes]').fill('Thay 30% nước mỗi Chủ nhật.')
  await page.locator('#mt-form button[type=submit]').click()
  const tank = page.locator('.tank')
  await expect(tank).toHaveCount(1)
  await expect(tank.locator('h2')).toHaveText('Bể 60 phòng khách')
  await expect(tank.locator('.facts')).toHaveText('60 × 30 × 36 cm · 64,8 lít · Phân nền (aqua soil)')
  await page.context().setOffline(false)

  await page.reload()
  await expect(page.locator('.tank h2')).toHaveText('Bể 60 phòng khách')
  await expect(page.locator('.tank .notes')).toHaveText('Thay 30% nước mỗi Chủ nhật.')

  // Edit in place: the form opens inside the tank, filled in.
  await page.locator('.tank [data-edit]').first().click()
  await expect(page.locator('.tank #mt-form input[name=name]')).toHaveValue('Bể 60 phòng khách')
  // The form inside a tank fits a phone (it once pushed the page sideways).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await page.locator('#mt-form input[name=name]').fill('Bể 60')
  await page.locator('#mt-form input[name=h]').fill('')
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('#mt-err')).toContainText('dài, rộng, cao')
  await page.locator('#mt-form input[name=h]').fill('40')
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank h2')).toHaveText('Bể 60')
  await expect(page.locator('.tank .facts')).toContainText('72 lít')
  // Focus comes back to the tank's "Sửa" and stays there (a redraw after saving once dropped it to the page).
  await page.waitForTimeout(300)
  await expect(page.locator('.tank [data-edit]').first()).toBeFocused()

  page.once('dialog', d => d.accept())
  await page.locator('.tank [data-del]').click()
  await expect(page.locator('.tank')).toHaveCount(0)
  await expect(page.locator('#mt-empty')).toBeVisible()
  await expect(page.locator('#mt-add')).toBeFocused()
  // What is left is a tombstone, so a synced copy elsewhere can't bring the tank back.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))
  expect(stored.tanks).toEqual([expect.objectContaining({ deletedAt: expect.any(String) })])
  expect(Object.keys(stored.tanks[0])).toEqual(['id', 'updatedAt', 'deletedAt'])
  expect(errors).toEqual([])
})

test('a light saved from the Chihiros page shows on its tank with its schedule; fish and plants by name', async ({ page, errors }) => {
  const store = {
    v: 1,
    tanks: [{ id: id(1), name: 'Bể thủy sinh', dims: { l: 90, w: 45, h: 45 }, species: [{ id: 'paracheirodon-axelrodi', count: 20 }], plants: [], createdAt: at, updatedAt: at }],
    devices: [{
      id: id(2), tankId: id(1), kind: 'light', brand: 'chihiros', model: 'WRGB II Pro', bleName: 'DYWPRO60TEST', nickname: 'Đèn chính',
      schedules: [{ id: id(3), on: '13:00', off: '20:00', ramp: 30, levels: [60, 50, 70, 40], savedAt: at }], activeScheduleId: id(3),
      manual: { levels: [40, 55, 60, 30], at }, createdAt: at, updatedAt: at,
    }],
  }
  await page.addInitScript(s => localStorage.setItem('aq.tanks', s), JSON.stringify(store))
  await page.goto(PAGE)
  const light = page.locator('.tank .light')
  await expect(light.locator('.light-name')).toContainText('Đèn chính')
  await expect(light.locator('.sched')).toContainText('13:00 → 20:00')
  await expect(light.locator('.sched')).toContainText('7 tiếng')
  await expect(light.locator('svg path')).toHaveAttribute('d', /^M0 48 L780 48 L810/)
  await expect(light.locator('.meta')).toContainText('40% · 55% · 60% · 30%')
  await expect(light.locator('a')).toHaveAttribute('href', '/vi/cong-cu/den-chihiros/')
  const fish = page.locator('.tank .chips li').first()
  await expect(fish.locator('a')).toHaveAttribute('href', /^\/vi\/ca\//)
  await expect(fish).toContainText('× 20')
  await expect(fish.locator('a')).not.toHaveText(/paracheirodon/)
  expect(errors).toEqual([])
})

test('Indonesian page: its own address and words; a tank is saved the same way', async ({ page, errors }) => {
  await page.goto('/id/alat/akuarium-saya/')
  await page.locator('#mt-add').click()
  await page.locator('#mt-form input[name=name]').fill('Akuarium 60')
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank h2')).toHaveText('Akuarium 60')
  await expect(page.locator('.tank .stamp')).not.toHaveText(/Sửa/)
  expect(errors).toEqual([])
})

test('editing keeps what the page does not know (a substrate from the app, extra keys); a new size drops old litres', async ({ page, errors }) => {
  const store = {
    v: 1,
    tanks: [{ id: id(1), name: 'Bể app', dims: { l: 60, w: 30, h: 36, glass: 0.8 }, litres: 45, substrate: 'akadama', species: [], plants: [], createdAt: at, updatedAt: at, fromApp: 1 }],
    devices: [],
  }
  await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('aq.tanks', s); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(store))
  await page.goto(PAGE)
  await expect(page.locator('.tank .facts')).toHaveText('60 × 30 × 36 cm · 45 lít · akadama')
  await page.locator('.tank [data-edit]').first().click()
  await expect(page.locator('#mt-form select[name=substrate]')).toHaveValue('akadama')
  await page.locator('#mt-form input[name=h]').fill('40')
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank .facts')).toHaveText('60 × 30 × 40 cm · 72 lít · akadama')
  const t = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(t).toMatchObject({ substrate: 'akadama', dims: { l: 60, w: 30, h: 40, glass: 0.8 }, fromApp: 1 })
  expect(t).not.toHaveProperty('litres')
  expect(errors).toEqual([])
})

test('a tank deleted in another tab while its form is open is not brought back by saving', async ({ page, errors }) => {
  const store = { v: 1, tanks: [{ id: id(1), name: 'Bể', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] }
  await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('aq.tanks', s); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(store))
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('#mt-form input[name=name]').fill('Bể đổi tên')
  // The other tab's delete: a tombstone in the store.
  await page.evaluate(([tid, when]) => localStorage.setItem('aq.tanks', JSON.stringify({ v: 1, tanks: [{ id: tid, updatedAt: when, deletedAt: when }], devices: [] })), [id(1), '2026-10-31T09:00:00.000Z'])
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('#mt-gone')).toBeVisible()
  await expect(page.locator('.tank')).toHaveCount(0)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))
  expect(stored.tanks[0]).toHaveProperty('deletedAt')
  expect(errors).toEqual([])
})
