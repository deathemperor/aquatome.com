import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

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
  await page.goto('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:12,ca-neon-vua:8&l=80&w=35&h=40')
  const save = page.locator('.save-tank')
  await expect(save).toBeVisible()
  await expect(save.locator('input[name=name]')).toHaveAttribute('placeholder', 'Bể 80 × 35 × 40')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể 80 × 35 × 40”')
  let tanks = await live(page)
  expect(tanks).toHaveLength(1)
  expect(tanks[0]).toMatchObject({ dims: { l: 80, w: 35, h: 40 }, species: [{ id: 'paracheirodon-innesi', count: 12 }, { id: 'paracheirodon-axelrodi', count: 8 }] })

  // The link opens the tank on "Bể của tôi", fish by name.
  await save.locator('[role=status] a').click()
  await expect(page).toHaveURL(new RegExp(`/vi/cong-cu/be-cua-toi/#be-${tanks[0]!.id}$`))
  await expect(page.locator('.tank')).toContainText('Bể 80 × 35 × 40')

  await page.goto('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:20&l=60&w=30&h=36')
  await expect(save.locator('select')).toHaveValue('')
  await save.locator('select').selectOption({ label: 'Bể 80 × 35 × 40' })
  await expect(save.locator('input[name=name]')).toBeHidden()
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status]')).toContainText('Đã lưu vào “Bể 80 × 35 × 40”')
  tanks = await live(page)
  expect(tanks).toHaveLength(1)
  // An existing tank keeps its size: the size on this page is only for a new one.
  expect(tanks[0]).toMatchObject({ dims: { l: 80, w: 35, h: 40 }, species: [{ id: 'paracheirodon-innesi', count: 20 }, { id: 'paracheirodon-axelrodi', count: 8 }] })

  // No fish chosen: nothing to save.
  await page.goto('/vi/cong-cu/nuoi-chung/')
  await expect(save).toBeHidden()
  expect(errors).toEqual([])
})

test('Indonesian volume page: saved the same way, and the link goes to the Indonesian "my tanks" page', async ({ page, errors }) => {
  await page.goto('/id/alat/volume-akuarium/')
  const save = page.locator('.save-tank')
  await save.locator('button[type=submit]').click()
  await expect(save.locator('[role=status] a')).toHaveAttribute('href', /^\/id\/alat\/akuarium-saya\/#be-/)
  expect(await live(page)).toHaveLength(1)
  expect(errors).toEqual([])
})
