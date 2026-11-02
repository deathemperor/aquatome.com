import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The fish-ID tool. The Worker's endpoint is always mocked here, so these hold on the fixture build (no Worker) and on
// aquatome.com (watch.yml) alike, and no photo is ever sent to the real endpoint. Turnstile is a stand-in too.
const PATH = '/vi/cong-cu/nhan-dien-ca/'
// A 1×1 PNG: enough for the browser to decode, shrink and send as JPEG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

type Reply = { status: number; body: unknown }
/** /api/fish-id: GET answers `status`; each POST the next of `posts`, its body kept in `sent`. */
async function mockApi(page: Page, status: Reply, posts: Reply[] = []) {
  const sent: string[] = []
  await page.route('**/api/fish-id', async route => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ status: status.status, json: status.body })
    sent.push(req.postDataBuffer()?.toString('latin1') ?? '')
    const r = posts.shift() ?? { status: 500, body: { error: 'x' } }
    return route.fulfill({ status: r.status, json: r.body })
  })
  return sent
}
/** Turnstile's script: a widget that passes at once, and again after each reset. */
async function fakeTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let cb; let n = 0; window.turnstile = { render(el, o) { cb = o.callback; setTimeout(() => cb('token-' + ++n), 10); return 'w' }, reset() { setTimeout(() => cb('token-' + ++n), 10) } }`,
  }))
}

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
  await expect(out.locator('li')).toHaveCount(3)
  const first = out.locator('li').first()
  await expect(first.locator('.sure')).toHaveText('Gần như chắc chắn')
  await expect(first.locator('h3 a')).toHaveAttribute('href', '/vi/ca/ca-neon-xanh/')
  await expect(first.locator('.open')).toHaveAttribute('href', '/vi/ca/ca-neon-xanh/')
  // Claude's words are text, never markup.
  await expect(first.locator('.why')).toHaveText('Sọc <b>xanh</b> ánh kim.')
  const second = out.locator('li').nth(1)
  await expect(second).toContainText('Chưa có trong cẩm nang.')
  await expect(second.locator('.also a')).toHaveAttribute('href', '/vi/ca/ca-neon-vua/')
  // A link that isn't one of this site's pages is dropped, its name kept.
  await expect(out.locator('li').nth(2).locator('a')).toHaveCount(0)
  // What went out: a JPEG (the browser's re-encode, not the PNG), the token, the page's language.
  expect(sent[0]).toContain('Content-Type: image/jpeg')
  expect(sent[0]).toContain('token-1')
  expect(sent[0]).toMatch(/name="lang"\r\n\r\nvi/)
  // A new token for the next photo; over the reader's limit, the page says so.
  await page.locator('[data-fish-id] input[name=file]').setInputFiles({ name: 'neon.png', mimeType: 'image/png', buffer: PNG })
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page.locator('[data-msg]')).toHaveText('Bạn đã dùng hết 10 lượt nhận diện hôm nay. Quay lại ngày mai nhé.')
  expect(sent[1]).toContain('token-2')
  expect(errors).toEqual([])
})
