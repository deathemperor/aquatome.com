import { expect, test } from './fixtures'
import { fakeTurnstile, mockFishId, PNG } from './fish-id-api'

// The app's index (/app/vi.json) and fish ID's answers keep the old /vi/ addresses until the app reads both (APP_VI_ROOT);
// the page links a fish by its own address, at the root.
const href = (f: { path: string }) => f.path.replace(/^\/vi\//, '/')

// "Bể của tôi": tanks kept in this browser (localStorage aq.tanks, the shared model in packages/schema/src/tanks.ts).
const PAGE = '/cong-cu/be-cua-toi/'
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
  await expect(light.locator('a')).toHaveAttribute('href', '/cong-cu/den-chihiros/')
  const fish = page.locator('.tank .chips li').first()
  await expect(fish.locator('a')).toHaveAttribute('href', /^\/ca\//)
  await expect(fish).toContainText('× 20')
  await expect(fish.locator('a')).not.toHaveText(/paracheirodon/)
  expect(errors).toEqual([])
})

test('a plug the app put on a tank is kept but not shown as a light, nor counted as one when the tank is deleted', async ({ page, errors }) => {
  const store = {
    v: 1,
    tanks: [{ id: id(1), name: 'Bể ổ cắm', species: [], plants: [], createdAt: at, updatedAt: at }],
    devices: [{
      id: id(2), tankId: id(1), kind: 'plug', brand: 'tuya', remoteId: 'fake-strip', nickname: 'Ổ cắm bể',
      outlets: [{ code: 'switch_1', role: 'co2' }], createdAt: at, updatedAt: at,
    }],
  }
  await page.addInitScript(s => localStorage.setItem('aq.tanks', s), JSON.stringify(store))
  await page.goto(PAGE)
  await expect(page.locator('.tank h2')).toHaveText('Bể ổ cắm')
  await expect(page.locator('.tank .lights')).toHaveCount(0)
  const asked = new Promise<string>(r => page.once('dialog', d => { r(d.message()); void d.dismiss() }))
  await page.locator('.tank [data-del]').click()
  expect(await asked).toBe('Xóa bể “Bể ổ cắm”?')
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

test('drawn before the page script runs, so nothing jumps: a first visit has the empty state; a reader with tanks, the loading line', async ({ page }) => {
  // Only what the HTML and its inline script draw: the page's own scripts never arrive.
  await page.route(/\/_astro\/.+\.js$/, route => route.abort())
  await page.goto(PAGE)
  await expect(page.locator('#mt-empty')).toBeVisible()
  await expect(page.locator('#mt-loading')).toBeHidden()

  const tank = { id: id(1), name: 'Bể', species: [], plants: [], createdAt: at, updatedAt: at }
  await page.evaluate(s => localStorage.setItem('aq.tanks', s), JSON.stringify({ v: 1, tanks: [tank], devices: [] }))
  await page.reload()
  await expect(page.locator('#mt-loading')).toBeVisible()
  await expect(page.locator('#mt-empty')).toBeHidden()

  // A store this page can't read (another version): as good as none, like the page's own script decides.
  await page.evaluate(s => localStorage.setItem('aq.tanks', s), JSON.stringify({ v: 2, tanks: [tank], devices: [] }))
  await page.reload()
  await expect(page.locator('#mt-empty')).toBeVisible()
  await expect(page.locator('#mt-loading')).toBeHidden()

  // Only deleted tanks: as good as none.
  await page.evaluate(s => localStorage.setItem('aq.tanks', s), JSON.stringify({ v: 1, tanks: [{ id: id(1), updatedAt: at, deletedAt: at }], devices: [] }))
  await page.reload()
  await expect(page.locator('#mt-empty')).toBeVisible()
  await expect(page.locator('#mt-loading')).toBeHidden()
})

// Entries without a page: what the handbook has no page for yet, added by name. The count request is answered here, never
// sent: the same check runs on aquatome.com (watch.yml), where it would count a test as a reader.
async function countRequests(page: import('@playwright/test').Page) {
  const bodies: unknown[] = []
  await page.route('**/api/v1/wanted', async route => { bodies.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }) })
  return bodies
}
const seeded = (page: import('@playwright/test').Page, store: object) =>
  page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('aq.tanks', s); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(store))

test('a fish the handbook has no page for: added by name, marked, counted once saved (its names only); taken off again', async ({ page, errors }) => {
  const bodies = await countRequests(page)
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể suối', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  const q = page.locator('#mt-q')
  await q.fill('Cá bống suối thử')
  // Always the last suggestion: what was typed, without a page.
  const add = page.locator('#mt-opts [role=option].new')
  await expect(add).toHaveText('Thêm “Cá bống suối thử” (chưa có trong cẩm nang)')
  await expect(page.locator('#mt-opts [role=option]').last()).toHaveClass(/new/)
  await add.click()
  const sheet = page.locator('[data-life-new]')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('input[name=uname]')).toHaveValue('Cá bống suối thử')
  await expect(sheet.locator('input[name=ukind][value=fish]')).toBeChecked()
  await sheet.locator('input[name=usci]').fill('Rhinogobius aquatomensis')
  await sheet.locator('input[name=ucount]').fill('3')
  await sheet.locator('[data-life-add]').click()
  await expect(sheet).toBeHidden()
  const row = page.locator('.life-rows li', { hasText: 'Cá bống suối thử' })
  await expect(row.locator('.tag')).toHaveText('chưa có trang')
  await expect(row.locator('input[type=number]')).toHaveValue('3')
  // The form fits a phone with its new rows (no sideways scroll).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  expect(bodies).toEqual([]) // nothing is sent before the tank is saved

  await page.locator('#mt-form button[type=submit]').click()
  const chip = page.locator('.tank .chips li.unlisted')
  await expect(chip).toContainText('Cá bống suối thử')
  await expect(chip).toContainText('× 3')
  await expect(chip.locator('.tag')).toHaveText('chưa có trang')
  await expect.poll(() => bodies).toEqual([{ kind: 'fish', name: 'Cá bống suối thử', sci: 'Rhinogobius aquatomensis' }])
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(saved.unlisted).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: 'fish', name: 'Cá bống suối thử', sci: 'Rhinogobius aquatomensis', count: 3 }])
  await page.reload()
  await expect(page.locator('.tank .chips li.unlisted')).toContainText('Cá bống suối thử')

  // Taken off like any fish: in the tank's form, then saved. Nothing more is sent.
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('.life-rows li', { hasText: 'Cá bống suối thử' }).locator('[data-rm]').click()
  await expect(page.locator('.life-rows li')).toHaveCount(0)
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank .chips')).toHaveCount(0)
  const after = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(after).not.toHaveProperty('unlisted')
  expect(bodies).toHaveLength(1)
  expect(errors).toEqual([])
})

test('an entry a page has the scientific name of is shown as that page; a plant without a page goes with the plants; a page fish added by search', async ({ page, errors }) => {
  const bodies = await countRequests(page)
  // A fish the handbook has a page for, as this site's own index lists it (fixture build and live alike).
  const index = (await (await page.request.get('/app/vi.json')).json()) as { items: { kind: string; id?: string; name: string; sub?: string; path: string; schoolMin?: number }[] }
  const fish = index.items.find(i => i.kind === 'fish' && i.id && i.sub)!
  await seeded(page, {
    v: 1, devices: [],
    tanks: [{
      id: id(1), name: 'Bể hỗn hợp', species: [], plants: [], createdAt: at, updatedAt: at,
      unlisted: [
        { id: id(2), kind: 'fish', name: 'Cá ông chủ cho', sci: `  ${fish.sub!.toLowerCase()} `, count: 4 },
        { id: id(3), kind: 'plant', name: 'Rêu suối thử' },
      ],
    }],
  })
  await page.goto(PAGE)
  const tank = page.locator('.tank')
  const linked = tank.locator('.chips li', { has: page.locator(`a[href="${href(fish)}"]`) })
  await expect(linked.locator('a')).toHaveText(fish.name)
  await expect(linked).toContainText('× 4')
  const plants = tank.locator('.life', { has: page.locator('h3', { hasText: 'Cây' }) })
  await expect(plants.locator('li.unlisted')).toContainText('Rêu suối thử')
  await expect(plants.locator('.tag')).toHaveText('chưa có trang')

  // The same fish found by its name: a page entry, at its school size; the tank keeps what the reader wrote as well.
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('#mt-q').fill(fish.name)
  const hit = page.locator('#mt-opts [role=option]:not(.new)', { hasText: fish.name }).first()
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(page.locator(`.life-rows a[href="${href(fish)}"]`)).toHaveCount(2)
  await page.locator('#mt-form button[type=submit]').click()
  await expect(tank.locator('.chips a', { hasText: fish.name })).toHaveCount(2)
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(saved.species).toEqual([{ id: fish.id, count: fish.schoolMin ?? 1 }])
  expect(saved.unlisted).toHaveLength(2)
  expect(bodies).toEqual([]) // only entries added now, without a page, are counted
  expect(errors).toEqual([])
})

test('fish another tab put on the tank while its form was open stay when the form saves without touching its fish', async ({ page, errors }) => {
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  await expect(page.locator('#mt-life')).toBeVisible()
  await page.locator('#mt-form input[name=name]').fill('Bể đổi tên')
  // The tank-mates tool, in another tab, saves fish onto the same tank.
  await page.evaluate(([tid, when]) => localStorage.setItem('aq.tanks', JSON.stringify({ v: 1, tanks: [{ id: tid, name: 'Bể', species: [{ id: 'paracheirodon-axelrodi', count: 10 }], plants: [], createdAt: when, updatedAt: '2026-10-31T09:00:00.000Z' }], devices: [] })), [id(1), at])
  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank h2')).toHaveText('Bể đổi tên')
  const t = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(t.species).toEqual([{ id: 'paracheirodon-axelrodi', count: 10 }])
  expect(errors).toEqual([])
})

// "Chụp ảnh nhận diện": the fish-ID tool in the tank's form. Its endpoint, Turnstile and the count request are stand-ins in
// every check here: on aquatome.com (watch.yml) no photo or name is ever sent.
const ON = { status: 200, body: { on: true, sitekey: 'k', resting: false, perIp: 10 } }
type IndexFish = { kind: string; id?: string; name: string; sub?: string; path: string; schoolMin?: number }
const aFish = async (page: import('@playwright/test').Page) =>
  ((await (await page.request.get('/app/vi.json')).json()) as { items: IndexFish[] }).items.find(i => i.kind === 'fish' && i.id && i.sub)!
async function photoOf(page: import('@playwright/test').Page) {
  const panel = page.locator('[data-life-photo]')
  await expect(panel).toBeVisible()
  await panel.locator('input[name=file]').setInputFiles({ name: 'ca.png', mimeType: 'image/png', buffer: PNG })
  await expect(panel.locator('[data-preview] img')).toBeVisible()
  await panel.locator('[data-go]').click()
  return panel
}

test('a photo names a fish the handbook has: its page joins the tank as from the search; the photo code loads only when opened', async ({ page, errors }) => {
  const bodies = await countRequests(page)
  await fakeTurnstile(page)
  const fish = await aFish(page)
  const sent = await mockFishId(page, ON, [
    { status: 200, body: { verdict: 'fish', model: 'm', results: [
      { scientificName: fish.sub, commonName: 'x', variety: null, confidence: 0.9, reason: 'Sọc <b>xanh</b> dọc thân.', page: { id: fish.id, kind: 'species', name: fish.name, sci: fish.sub, url: fish.path } },
      { scientificName: 'Paracheirodon simulans', commonName: 'Green neon tetra', variety: null, confidence: 0.2, reason: 'Sọc dài hơn.' },
    ] } },
    { status: 200, body: { verdict: 'other', results: [], model: 'm' } },
  ])
  const asked: string[] = []
  page.on('request', r => { if (/\/api\/fish-id|challenges\.cloudflare\.com/.test(r.url())) asked.push(r.url()) })
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  const open = page.locator('[data-life-photo-open]')
  await expect(open).toHaveText('Chụp ảnh nhận diện')
  await expect(page.locator('[data-life-photo]')).toBeHidden()
  expect(asked).toEqual([]) // nothing of the tool until it is opened

  await open.click()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  const panel = await photoOf(page)
  const guesses = panel.locator('[data-out] ol > li')
  await expect(guesses).toHaveCount(2)
  const first = guesses.first()
  await expect(first.locator('.sure')).toHaveText('Gần như chắc chắn')
  await expect(first.locator('h3')).toHaveText(fish.name)
  await expect(first.locator('.why')).toHaveText('Sọc <b>xanh</b> dọc thân.')
  await expect(guesses.nth(1)).toContainText('Chưa có trong cẩm nang.')
  expect(sent[0]).toContain('Content-Type: image/jpeg')
  expect(sent[0]).toContain('token-1')
  expect(sent[0]).toMatch(/name="from"\r\n\r\ntank/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

  await first.getByRole('button', { name: `Thêm vào bể: ${fish.name}` }).click()
  const row = page.locator('.life-rows li', { has: page.locator(`a[href="${href(fish)}"]`) })
  await expect(row.locator('input[type=number]')).toHaveValue(String(fish.schoolMin ?? 1))
  // Ready for the next fish: no photo, no guesses.
  await expect(panel.locator('[data-out] li')).toHaveCount(0)
  await expect(panel.locator('[data-preview]')).toBeHidden()
  await expect(panel.locator('[data-go]')).toBeDisabled()

  // A photo of no fish says so, calmly; the next request has a new token.
  await photoOf(page)
  await expect(panel.locator('[data-out]')).toHaveText('Ảnh này có vẻ không có cá, tép, ốc hay cây thủy sinh nào. Thử một ảnh khác nhé.')
  expect(sent[1]).toContain('token-2')

  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator(`.tank .chips a[href="${href(fish)}"]`)).toHaveText(fish.name)
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(saved.species).toEqual([{ id: fish.id, count: fish.schoolMin ?? 1 }])
  expect(bodies).toEqual([])
  expect(errors).toEqual([])
})

test('"not this one?": a photo\'s guess lists its genus\'s other pages, and picking one adds that page as a guess\'s would', async ({ page, errors }) => {
  await fakeTurnstile(page)
  // Three of the handbook's fish, read from the page so it holds live too: the guess, the pick, one on the tank already.
  const fish = ((await (await page.request.get('/app/vi.json')).json()) as { items: IndexFish[] }).items.filter(i => i.kind === 'fish' && i.id && i.sub)
  const [guessed, picked, there] = fish as [IndexFish, IndexFish, IndexFish]
  const linked = (f: IndexFish) => ({ id: f.id, kind: 'species', name: f.name, sci: f.sub, url: f.path })
  await mockFishId(page, ON, [{ status: 200, body: { verdict: 'fish', model: 'm', results: [
    { scientificName: guessed.sub, commonName: 'x', variety: null, confidence: 0.6, reason: 'Vây dài.', page: linked(guessed), sameGenus: [linked(picked), linked(there)] },
  ] } }])
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể', species: [{ id: there.id, count: 1 }], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('[data-life-photo-open]').click()
  const panel = await photoOf(page)
  const genus = panel.locator('[data-out] ol > li').first().locator('.genus')
  await expect(genus.locator('summary')).toHaveText(`Không phải? 2 loài ${guessed.sub!.split(' ')[0]} khác trong cẩm nang`)
  await genus.locator('summary').click()
  await expect(genus.getByRole('button', { name: `Đã có: ${there.name}`, exact: true })).toBeDisabled()
  await genus.getByRole('button', { name: `Thêm vào bể: ${picked.name}`, exact: true }).click()
  const row = page.locator('.life-rows li', { has: page.locator(`a[href="${href(picked)}"]`) })
  await expect(row.locator('input[type=number]')).toHaveValue(String(picked.schoolMin ?? 1))
  // Ready for the next fish: no photo, no guesses.
  await expect(panel.locator('[data-out] li')).toHaveCount(0)
  await expect(panel.locator('[data-preview]')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await page.locator('#mt-form button[type=submit]').click()
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(saved.species).toEqual([{ id: there.id, count: 1 }, { id: picked.id, count: picked.schoolMin ?? 1 }])
  expect(errors).toEqual([])
})

test('a photo names a fish with no page: the "Thêm …" form comes filled in, the reader adds the count; counted like a typed one (the Worker counts a reader once a day per name)', async ({ page, errors }) => {
  const bodies = await countRequests(page)
  await fakeTurnstile(page)
  await mockFishId(page, ON, [{ status: 200, body: { verdict: 'fish', model: 'm', results: [
    { scientificName: 'Rhinogobius aquatomensis', commonName: 'Aquatome goby', variety: null, confidence: 0.85, reason: 'Thân có đốm.' },
  ] } }])
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể suối', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('[data-life-photo-open]').click()
  const panel = await photoOf(page)
  await panel.locator('[data-out] li').getByRole('button', { name: 'Thêm vào bể: Aquatome goby' }).click()
  const sheet = page.locator('[data-life-new]')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('input[name=uname]')).toHaveValue('Aquatome goby')
  await expect(sheet.locator('input[name=usci]')).toHaveValue('Rhinogobius aquatomensis')
  await expect(sheet.locator('input[name=ukind][value=fish]')).toBeChecked()
  await sheet.locator('input[name=ucount]').fill('2')
  await sheet.locator('[data-life-add]').click()
  await expect(page.locator('.life-rows li', { hasText: 'Aquatome goby' }).locator('.tag')).toHaveText('chưa có trang')
  // And one typed by name, which is counted once saved.
  await page.locator('#mt-q').fill('Cá bống suối thử')
  await page.locator('#mt-opts [role=option].new').click()
  await sheet.locator('[data-life-add]').click()

  await page.locator('#mt-form button[type=submit]').click()
  await expect(page.locator('.tank .chips li.unlisted', { hasText: 'Aquatome goby' })).toContainText('× 2')
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('aq.tanks')!))).tanks[0]
  expect(saved.unlisted).toEqual([
    { id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: 'fish', name: 'Aquatome goby', sci: 'Rhinogobius aquatomensis', count: 2 },
    { id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: 'fish', name: 'Cá bống suối thử' },
  ])
  // Both are sent: a second or unsure guess reaches the wanted list too, and the Worker doesn't count the fish-ID tool's own record of the same reader again.
  await expect.poll(() => bodies).toEqual([{ kind: 'fish', name: 'Aquatome goby', sci: 'Rhinogobius aquatomensis' }, { kind: 'fish', name: 'Cá bống suối thử' }])
  expect(errors).toEqual([])
})

test('the photo tool off, then resting: a calm line, nothing to pick, and the typed search still works', async ({ page, errors }) => {
  const status = { status: 200, body: { on: false } as object }
  const sent = await mockFishId(page, status)
  await page.goto(PAGE)
  await page.locator('#mt-add').click()
  await page.locator('[data-life-photo-open]').click()
  const panel = page.locator('[data-life-photo]')
  await expect(panel.locator('[data-note]')).toHaveText('Nhận diện qua ảnh tạm thời chưa dùng được. Bạn gõ tên cá hoặc cây vào ô tìm nhé.')
  for (const input of await panel.locator('input[type=file]').all()) await expect(input).toBeDisabled()
  await expect(panel.locator('[data-go]')).toBeDisabled()
  const fish = await aFish(page)
  await page.locator('#mt-q').fill(fish.name)
  await expect(page.locator('#mt-opts [role=option]:not(.new)', { hasText: fish.name }).first()).toBeVisible()

  status.body = { on: true, sitekey: 'k', resting: true, perIp: 10 }
  await page.reload()
  await page.locator('#mt-add').click()
  await page.locator('[data-life-photo-open]').click()
  await expect(panel.locator('[data-note]')).toHaveText('Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.')
  await expect(panel.locator('input[type=file]').first()).toBeDisabled()
  expect(sent).toEqual([])
  expect(errors).toEqual([])
})

test('over the reader\'s daily limit, the photo panel says so; the typed search still works', async ({ page, errors }) => {
  await fakeTurnstile(page)
  await mockFishId(page, ON, [{ status: 429, body: { error: 'rate', limit: 10 } }])
  await page.goto(PAGE)
  await page.locator('#mt-add').click()
  await page.locator('[data-life-photo-open]').click()
  const panel = await photoOf(page)
  await expect(panel.locator('[data-msg]')).toHaveText('Bạn đã dùng hết 10 lượt nhận diện hôm nay. Quay lại ngày mai nhé.')
  await expect(panel.locator('[data-out] li')).toHaveCount(0)
  await page.locator('#mt-q').fill('Cá bống suối thử')
  await expect(page.locator('#mt-opts [role=option].new')).toBeVisible()
  expect(errors).toEqual([])
})

// The picker's options are drawn in the browser, where the page check (scripts/page-check.ts) doesn't look. Each says
// the scientific name once: beside a name only when the name doesn't say it (the fixture's Cryptocoryne wendtii is
// named by it).
test("the fish and plant picker gives a scientific name beside a name only when the name doesn't say it", async ({ page, errors }) => {
  await seeded(page, { v: 1, tanks: [{ id: id(1), name: 'Bể', species: [], plants: [], createdAt: at, updatedAt: at }], devices: [] })
  await page.goto(PAGE)
  await page.locator('.tank [data-edit]').first().click()
  await page.locator('#mt-q').fill('Cryptocoryne')
  const opts = page.locator('#mt-opts [role=option]:not(.new)')
  await expect(opts.first()).toBeVisible()
  const pairs = await opts.evaluateAll(els => els.map(e => [e.querySelector('.nm > span')?.textContent ?? '', e.querySelector('.sci')?.textContent ?? '']))
  expect(pairs.filter(([name, sci]) => sci && name.toLowerCase().includes(sci.toLowerCase()))).toEqual([])
  expect(errors).toEqual([])
})
