import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mockFishId as mockApi, fakeTurnstile, photoOfSize, PNG, sentSize } from './fish-id-api'

// The fish-ID tool. The Worker's endpoint is always mocked here, so these hold on the fixture build (no Worker) and on
// aquatome.com (watch.yml) alike, and no photo is ever sent to the real endpoint. Turnstile is a stand-in too.
const PATH = '/cong-cu/nhan-dien-ca/'

test('fish ID: the page says calmly that the tool is off when its endpoint is (no keys yet)', async ({ page, errors }) => {
  await mockApi(page, { status: 200, body: { on: false } })
  await page.goto(PATH)
  await expect(page.locator('[data-note]')).toContainText('tạm thời chưa dùng được')
  for (const input of await page.locator('[data-fish-id] input[type=file]').all()) await expect(input).toBeDisabled()
  await expect(page.locator('[data-go]')).toBeDisabled()
  // The tips and what happens to a photo are there all the same.
  await expect(page.locator('.tips li')).not.toHaveCount(0)
  await expect(page.locator('.privacy')).toContainText('Anthropic')
  expect(errors).toEqual([])
})

test('fish ID: an endpoint that fails (503, or none: a build without the Worker) reads as off too', async ({ page }) => {
  await mockApi(page, { status: 503, body: { error: 'fish_id_off' } })
  await page.goto(PATH)
  await expect(page.locator('[data-note]')).toContainText('tạm thời chưa dùng được')
  await expect(page.locator('[data-go]')).toBeDisabled()
})

test('fish ID: on, the camera and the photo picker are ready, with the tips and the privacy line', async ({ page }) => {
  await mockApi(page, { status: 200, body: { on: true, sitekey: 'k', resting: false, perIp: 10 } })
  await page.goto(PATH)
  const inputs = page.locator('[data-fish-id] input[type=file]')
  await expect(inputs).toHaveCount(2)
  await expect(inputs.first()).toHaveAttribute('capture', 'environment')
  await expect(inputs.nth(1)).not.toHaveAttribute('capture')
  for (const input of await inputs.all()) await expect(input).toBeEnabled()
  // Turnstile is blocked in these checks: the page says so instead of leaving a dead button.
  await expect(page.locator('[data-note]')).toContainText('chống spam')
  await expect(page.locator('[data-go]')).toBeDisabled()
  await expect(page.locator('.tips li').first()).toBeVisible()
  await expect(page.locator('.privacy a')).toHaveAttribute('href', /chinh-sach-bao-mat\/#nhan-dien-ca$/)
})

test('fish ID: a photo goes out shrunk as JPEG with the Turnstile token; guesses come back with their pages, the reader\'s limit after', async ({ page, errors }) => {
  await fakeTurnstile(page)
  // The answers name pages by their old /vi/ addresses, as the app reads them (APP_VI_ROOT); the page links the root ones.
  const sent = await mockApi(page, { status: 200, body: { on: true, sitekey: 'k', resting: false, perIp: 10 } }, [
    { status: 200, body: { verdict: 'fish', model: 'm', results: [
      { scientificName: 'Paracheirodon innesi', commonName: 'Neon tetra', variety: null, confidence: 0.9, reason: 'Sọc <b>xanh</b> ánh kim.', page: { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh', sci: 'Paracheirodon innesi', url: '/vi/ca/ca-neon-xanh/' } },
      { scientificName: 'Paracheirodon simulans', commonName: 'Green neon tetra', variety: null, confidence: 0.2, reason: 'Sọc xanh dài hơn.', sameGenus: [{ id: 'paracheirodon-axelrodi', kind: 'species', name: 'Cá neon vua', url: '/vi/ca/ca-neon-vua/' }] },
      { scientificName: 'Evil fish', commonName: 'x', variety: null, confidence: 0.1, reason: '', page: { id: 'x', kind: 'species', name: 'Lạ', url: 'javascript:alert(1)' } },
    ] } },
    { status: 429, body: { error: 'rate', limit: 10 } },
  ])
  await page.goto(PATH)
  const go = page.locator('[data-go]')
  await page.locator('[data-fish-id] input[name=file]').setInputFiles({ name: 'neon.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('[data-preview] img')).toBeVisible()
  await expect(go).toBeEnabled()
  await go.click()
  const out = page.locator('[data-out]')
  await expect(out.locator('ol > li')).toHaveCount(3)
  const first = out.locator('ol > li').first()
  await expect(first.locator('.sure')).toHaveText('Gần như chắc chắn')
  await expect(first.locator('h3 a')).toHaveAttribute('href', '/ca/ca-neon-xanh/')
  await expect(first.locator('.open')).toHaveAttribute('href', '/ca/ca-neon-xanh/')
  // Claude's words are text, never markup.
  await expect(first.locator('.why')).toHaveText('Sọc <b>xanh</b> ánh kim.')
  const second = out.locator('ol > li').nth(1)
  await expect(second).toContainText('Chưa có trong cẩm nang.')
  // Its genus's pages, closed until opened.
  await expect(second.locator('.genus summary')).toHaveText('1 loài Paracheirodon có trong cẩm nang')
  await expect(second.locator('.genus a')).toBeHidden()
  await second.locator('.genus summary').click()
  await expect(second.locator('.genus a')).toHaveAttribute('href', '/ca/ca-neon-vua/')
  // A link that isn't one of this site's pages is dropped, its name kept.
  await expect(out.locator('ol > li').nth(2).locator('a')).toHaveCount(0)
  // What went out: a JPEG (the browser's re-encode, not the PNG), the token, the page's language.
  expect(sent[0]).toContain('Content-Type: image/jpeg')
  expect(sent[0]).toContain('token-1')
  expect(sent[0]).toMatch(/name="lang"\r\n\r\nvi/)
  expect(sent[0]).toMatch(/name="from"\r\n\r\npage/) // the Worker's log tells the tool's page from the tank's editor
  // A new token for the next photo; over the reader's limit, the page says so.
  await page.locator('[data-fish-id] input[name=file]').setInputFiles({ name: 'neon.png', mimeType: 'image/png', buffer: PNG })
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page.locator('[data-msg]')).toHaveText('Bạn đã dùng hết 10 lượt nhận diện hôm nay. Quay lại ngày mai nhé.')
  expect(sent[1]).toContain('token-2')
  expect(errors).toEqual([])
})

test('fish ID: "not this one?" under a matched guess lists the genus\'s other pages, each a link with its scientific name unless its name says it', async ({ page, errors }) => {
  await fakeTurnstile(page)
  await mockApi(page, { status: 200, body: { on: true, sitekey: 'k', resting: false, perIp: 10 } }, [
    { status: 200, body: { verdict: 'fish', model: 'm', results: [
      { scientificName: 'Betta splendens', commonName: 'Siamese fighting fish', variety: null, confidence: 0.6, reason: 'Vây dài.', page: { id: 'betta-splendens', kind: 'species', name: 'Cá betta', sci: 'Betta splendens', url: '/vi/ca/ca-betta/' }, sameGenus: [
        { id: 'betta-macrostoma', kind: 'species', name: 'Cá betta Brunei', sci: 'Betta macrostoma', url: '/vi/ca/ca-betta-macrostoma/' },
        { id: 'betta-imbellis', kind: 'species', name: 'Cá betta imbellis', sci: 'Betta imbellis' },
      ] },
    ] } },
  ])
  await page.goto(PATH)
  await page.locator('[data-fish-id] input[name=file]').setInputFiles({ name: 'betta.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('[data-go]')).toBeEnabled()
  await page.locator('[data-go]').click()
  const guess = page.locator('[data-out] ol > li').first()
  await expect(guess.locator('h3 a')).toHaveAttribute('href', '/ca/ca-betta/')
  const genus = guess.locator('.genus')
  await expect(genus.locator('summary')).toHaveText('Không phải? 2 loài Betta khác trong cẩm nang')
  await expect(genus.locator('li').first()).toBeHidden()
  await genus.locator('summary').click()
  await expect(genus.getByRole('link', { name: 'Cá betta Brunei' })).toHaveAttribute('href', '/ca/ca-betta-macrostoma/')
  await expect(genus.locator('li').first()).toContainText('Betta macrostoma')
  // A page this language doesn't have: its name, no link; its name says its scientific name, so that once (lib/sci.ts).
  await expect(genus.locator('li').nth(1)).toHaveText('Cá betta imbellis')
  await expect(genus.locator('li').nth(1).locator('a')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

/** A drag: by finger on the phone (a real touch, which scrolls the page unless the photo takes it), else the mouse. */
async function drag(page: Page, [x0, y0]: number[], [x1, y1]: number[]) {
  if (!test.info().project.use.hasTouch) {
    await page.mouse.move(x0!, y0!)
    await page.mouse.down()
    await page.mouse.move(x1!, y1!, { steps: 5 })
    return page.mouse.up()
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0!, y: y0! }] })
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0! + (x1! - x0!) * i / 5, y: y0! + (y1! - y0!) * i / 5 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('fish ID: a box around one fish sends only that part, cut from the full-size photo; "Dùng cả ảnh" sends the whole again', async ({ page, errors }) => {
  await fakeTurnstile(page)
  const answer = { status: 200, body: { verdict: 'fish', model: 'm', results: [{ scientificName: 'Trigonostigma heteromorpha', commonName: 'Harlequin rasbora', variety: null, confidence: 0.7, reason: 'Mảng đen hình nêm.' }] } }
  const sent = await mockApi(page, { status: 200, body: { on: true, sitekey: 'k', resting: false, perIp: 10 } }, [answer, answer, answer])
  await page.goto(PATH)
  const go = page.locator('[data-go]')
  const crop = page.getByRole('button', { name: 'Khoanh một con cá' })
  const whole = page.getByRole('button', { name: 'Dùng cả ảnh' })
  await page.locator('[data-fish-id] input[name=file]').setInputFiles({ name: 'tank.png', mimeType: 'image/png', buffer: await photoOfSize(page, 3000, 2000) })
  await expect(page.locator('[data-preview] img')).toBeVisible()
  // Not boxed: the whole photo, shrunk to the tool's 1024 px, as before.
  await expect(crop).toBeVisible()
  await expect(whole).toBeHidden()
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page.locator('[data-out] ol > li')).toHaveCount(1)
  expect(sentSize(sent[0]!)).toEqual({ width: 1024, height: 683 })

  // A box over a quarter of each side: 750 × 500 of the 3000 × 2000 photo (from the 1024 px copy it would be 256 × 171).
  await crop.click()
  await expect(whole).toBeFocused()
  await expect(page.locator('[data-crop-say]')).toHaveText('Kéo một khung quanh con cá trên ảnh.')
  const frame = (await page.locator('[data-frame]').boundingBox())!
  await drag(page, [frame.x + frame.width * 0.25, frame.y + frame.height * 0.25], [frame.x + frame.width * 0.5, frame.y + frame.height * 0.5])
  await expect(page.locator('[data-frame] .box')).toBeVisible()
  await expect(page.locator('[data-crop-say]')).toHaveText('Sẽ gửi phần trong khung. Kéo lại để khoanh chỗ khác.')
  await expect(go).toBeEnabled()
  await go.click()
  await expect.poll(() => sent.length).toBe(2)
  const part = sentSize(sent[1]!)!
  expect(part.width).toBeGreaterThan(700)
  expect(part.width).toBeLessThan(800)
  expect(part.height).toBeGreaterThan(460)
  expect(part.height).toBeLessThan(540)

  // Back to the whole photo.
  await whole.click()
  await expect(crop).toBeFocused()
  await expect(page.locator('[data-frame] .box')).toBeHidden()
  await expect(go).toBeEnabled()
  await go.click()
  await expect.poll(() => sent.length).toBe(3)
  expect(sentSize(sent[2]!)).toEqual({ width: 1024, height: 683 })
  expect(errors).toEqual([])
})
