import type { Page } from '@playwright/test'
import { expect, test, VIETNAMESE } from './fixtures'

// "Lưu vào Bể của tôi" on the tools: what a tool worked out goes onto a tank in this browser (localStorage aq.tanks).
type Stored = { tanks: { id: string; name: string; dims?: Record<string, number>; litres?: number; species: { id: string; count?: number }[]; deletedAt?: string }[] }
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks') ?? '{"tanks":[]}') as Stored)
const live = async (page: Page) => (await stored(page)).tanks.filter(t => !t.deletedAt)

test('volume: a box is saved as a new tank with its size; a round tank then updates the same tank with its litres', async ({ page, errors }) => {
  await page.goto('/vi/cong-cu/the-tich-be/')
  const save = page.locator('.save-tank')
  await expect(save).toBeVisible()
  await expect(save.locator('select')).toHaveValue('')
  await save.locator('input[name=name]').fill('Bể phòng khách')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể phòng khách”')
  let tanks = await live(page)
  expect(tanks).toHaveLength(1)
  expect(tanks[0]).toMatchObject({ name: 'Bể phòng khách', dims: { l: 60, w: 30, h: 36 }, species: [] })
  expect(tanks[0]!.litres).toBeUndefined()
  // The saved tank is now the one picked: saving again changes it, it doesn't make another.
  await expect(save.locator('select')).toHaveValue(tanks[0]!.id)

  await page.locator('label.shape', { hasText: 'Trụ tròn' }).click()
  await page.locator('#vf-fields input').first().fill('40')
  await page.locator('#vf-fields input').nth(1).fill('50')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể phòng khách”')
  tanks = await live(page)
  expect(tanks).toHaveLength(1)
  expect(tanks[0]!.dims).toBeUndefined()
  expect(tanks[0]!.litres).toBeCloseTo(62.8, 1)

  // An impossible size: nothing to save.
  await page.locator('#vf-fields input').first().fill('')
  await expect(save).toBeHidden()

  await page.goto('/vi/cong-cu/be-cua-toi/')
  await expect(page.locator('.tank h2')).toHaveText(['Bể phòng khách'])
  await expect(page.locator('.tank')).toContainText('62,8')
  expect(errors).toEqual([])
})

test('tank-mates: the chosen fish and their numbers go onto a tank; saving again updates the numbers, no duplicates', async ({ page, errors }) => {
  // Species both the fixture and aquatome.com have (the watch runs these checks on aquatome.com too).
  await page.goto('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:12&l=80&w=35&h=40')
  const save = page.locator('.save-tank')
  await expect(save).toBeVisible()
  await expect(save.locator('input[name=name]')).toHaveAttribute('placeholder', 'Bể 80 × 35 × 40')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể 80 × 35 × 40”')
  let tanks = await live(page)
  expect(tanks).toHaveLength(1)
  expect(tanks[0]).toMatchObject({ dims: { l: 80, w: 35, h: 40 }, species: [{ id: 'paracheirodon-innesi', count: 12 }] })

  // The link opens the tank on "Bể của tôi".
  await save.locator('[role=status] a').click()
  await expect(page).toHaveURL(new RegExp(`/vi/cong-cu/be-cua-toi/#be-${tanks[0]!.id}$`))
  await expect(page.locator('.tank')).toContainText('Bể 80 × 35 × 40')

  // More neons and a discus (by its scientific name: aquatome.com has two "Cá đĩa"), onto the same tank.
  await page.goto('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:20&l=60&w=30&h=36')
  await page.locator('#tm-input').fill('Symphysodon aequifasciatus')
  await page.locator('#tm-input').press('Enter')
  await expect(page.locator('#tm-chosen li')).toHaveCount(2)
  await expect(save.locator('select')).toHaveValue('')
  await save.locator('select').selectOption({ label: 'Bể 80 × 35 × 40' })
  await expect(save.locator('input[name=name]')).toBeHidden()
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể 80 × 35 × 40”')
  tanks = await live(page)
  expect(tanks).toHaveLength(1)
  // An existing tank keeps its size: the size on this page is only for a new one.
  expect(tanks[0]!.dims).toEqual({ l: 80, w: 35, h: 40 })
  expect(tanks[0]!.species.map(x => x.id)).toEqual(['paracheirodon-innesi', 'symphysodon-aequifasciatus'])
  expect(tanks[0]!.species[0]!.count).toBe(20)

  // The fish taken off again: nothing left to save.
  await page.locator('#tm-chosen [data-rm]').first().click()
  await page.locator('#tm-chosen [data-rm]').first().click()
  await expect(page.locator('#tm-chosen li')).toHaveCount(0)
  await expect(save).toBeHidden()
  expect(errors).toEqual([])
})

test('Indonesian volume page: saved the same way, and the link goes to the Indonesian "my tanks" page', async ({ page, errors }) => {
  await page.goto('/id/alat/volume-akuarium/')
  const save = page.locator('.save-tank')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status] a')).toHaveAttribute('href', /^\/id\/alat\/akuarium-saya\/#be-/)
  expect(await live(page)).toHaveLength(1)
  // A round tank's suggested name is in Indonesian too: it becomes the tank's name.
  await page.goto('/id/alat/volume-akuarium/?hinh=tru&d=40&h=50')
  await expect(save.locator('input[name=name]')).toHaveAttribute('placeholder', /62,8/)
  expect(await save.locator('input[name=name]').getAttribute('placeholder')).not.toMatch(VIETNAMESE)
  expect(errors).toEqual([])
})

test('nothing the account would refuse is saved: sizes past its limits, a 51st tank, a count of 0', async ({ page, errors }) => {
  const save = page.locator('.save-tank')
  // A side over 10 m (mm typed as cm), more than 100,000 litres, or under 0.1 litre: worked out, but not saved.
  for (const q of ['hinh=chu-nhat&l=1200&w=30&h=36', 'hinh=tru&d=600&h=400', 'hinh=tru&d=3&h=3']) {
    await page.goto(`/vi/cong-cu/the-tich-be/?${q}`)
    await expect(page.locator('#vf-out .big')).toBeVisible()
    await expect(save).toBeHidden()
  }
  // Tank-mates: a size past the limit makes a tank without a size; 0.4 fish is no number at all.
  await page.goto('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:0.4&l=1500&w=30&h=36')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào')
  const [tank] = await live(page)
  expect(tank!.dims).toBeUndefined()
  expect(tank!.species[0]!.count).toBeGreaterThanOrEqual(1)

  // 50 tanks, as on "Bể của tôi": no new one, but a saved one still takes the save.
  const at = '2026-10-30T08:00:00.000Z'
  const tanks = Array.from({ length: 50 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Bể ${n + 1}`, species: [], plants: [], createdAt: at, updatedAt: at }))
  await page.evaluate(s => localStorage.setItem('aq.tanks', s), JSON.stringify({ v: 1, tanks, devices: [] }))
  await page.goto('/vi/cong-cu/the-tich-be/')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã đủ 50 bể')
  expect(await live(page)).toHaveLength(50)
  await save.locator('select').selectOption({ label: 'Bể 1' })
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể 1”')
  expect((await live(page))[0]!.dims).toEqual({ l: 60, w: 30, h: 36 })
  expect(errors).toEqual([])
})
