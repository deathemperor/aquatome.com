import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// The owner's report from a page (src/owner/, worker/feedback.ts). /api/feedback is a stand-in here, so the journey holds on
// the fixture build, which has no Worker, and on aquatome.com without sending anything. Refusals are the Worker's tests.
const flag = (context: import('@playwright/test').BrowserContext, baseURL: string) => context.addCookies([{ name: 'aq_owner', value: '1', url: baseURL }])
const pageOf = () => sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!

test('a reader gets no bar and loads none of it', async ({ page }) => {
  const owner: string[] = []
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/_owner/')) owner.push(r.url()) })
  await page.goto(pageOf())
  await page.waitForLoadState('load')
  await expect(page.locator('[data-owner-bar]')).toHaveCount(0)
  expect(owner).toEqual([])
  // What every page carries is the loader alone: no bar, no sheet, no screenshot library.
  const inline = await page.locator('script[data-owner]').textContent()
  expect(inline!.length).toBeLessThanOrEqual(110)
  expect(await page.content()).not.toContain('Báo lỗi')
})

test('the owner sends a report in a few taps: words, a screenshot of what\'s on screen, and where they were', async ({ page, context, baseURL, errors }) => {
  await flag(context, baseURL!)
  const posts: { report: string; image: boolean; type: string }[] = []
  await page.route(url => url.pathname === '/api/feedback', async route => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? ''
    const report = /name="report"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)?.[1] ?? ''
    posts.push({ report: Buffer.from(report, 'latin1').toString('utf8'), image: /name="image"; filename="screenshot\.jpg"\r\nContent-Type: image\/jpeg\r\n\r\n\xff\xd8\xff/.test(body), type: route.request().headers()['content-type'] ?? '' })
    await route.fulfill({ status: 201, json: { id: 'x', waiting: 1 } })
  })
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.abort())
  const path = pageOf()
  await page.goto(path)
  await page.evaluate(() => window.scrollTo(0, 200))
  await page.locator('[data-owner-report-open]').click()
  const sheet = page.locator('[data-owner-report]')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('textarea')).toBeFocused() // the keyboard, with its dictation key, comes up with the tap
  await sheet.locator('textarea').fill('Ảnh bị lệch')
  await expect(sheet.locator('[data-owner-report-shot]')).toHaveText('Đã chụp màn hình', { timeout: 30_000 })
  await expect(sheet.locator('img')).toBeVisible()
  await sheet.getByRole('button', { name: 'Gửi' }).click()
  await expect(sheet).toHaveCount(0)
  expect(posts).toHaveLength(1)
  expect(posts[0]!.type).toContain('multipart/form-data')
  expect(posts[0]!.image).toBe(true)
  const { words, where } = JSON.parse(posts[0]!.report) as { words: string; where: Record<string, string> }
  expect(words).toBe('Ảnh bị lệch')
  expect(where.source).toBe('web')
  expect(new URL(where.url!).pathname).toBe(path)
  expect(where.lang).toBe('vi')
  expect(where.version).toMatch(/^[0-9a-z]{7,}$/)
  expect(['light', 'dark']).toContain(where.theme)
  expect(where.textSize).toMatch(/^\d+%$/)
  expect(where.viewport).toMatch(/^\d+x\d+@/)
  expect(where.device!.length).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('a report that doesn\'t go keeps the words, and says what to do', async ({ page, context, baseURL }) => {
  await flag(context, baseURL!)
  let answer = 401
  await page.route(url => url.pathname === '/api/feedback', route => route.fulfill({ status: answer, json: answer === 201 ? { id: 'x', waiting: 3 } : { error: 'x' } }))
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.abort())
  await page.goto(pageOf())
  await page.locator('[data-owner-report-open]').click()
  const sheet = page.locator('[data-owner-report]')
  await sheet.locator('textarea').fill('Sai chữ')
  await sheet.getByRole('button', { name: 'Gửi' }).click()
  await expect(sheet.getByRole('status')).toContainText('mở /dang-nhap/')
  await expect(sheet.locator('textarea')).toHaveValue('Sai chữ')
  answer = 503
  await sheet.getByRole('button', { name: 'Gửi lại' }).click()
  await expect(sheet.getByRole('status')).toContainText('vẫn còn đây')
  answer = 201
  await sheet.getByRole('button', { name: 'Gửi lại' }).click()
  await expect(sheet.getByRole('status')).toContainText('3 báo lỗi đang chờ máy Mac nhận') // the Mac hasn't collected lately
  await expect(sheet).toHaveCount(0)
})

test('a picture they pick replaces the one taken, and neither the bar nor the sheet is in what\'s sent', async ({ page, context, baseURL }) => {
  await flag(context, baseURL!)
  await page.route(url => url.pathname.startsWith('/api/feedback/media/'), route => route.abort())
  await page.goto(pageOf())
  await page.locator('[data-owner-report-open]').click()
  const sheet = page.locator('[data-owner-report]')
  await expect(sheet.locator('[data-owner-report-shot]')).toHaveText('Đã chụp màn hình', { timeout: 30_000 })
  const taken = await sheet.locator('img').getAttribute('src')
  // A 1×1 PNG, as the photo picker hands one over.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  await sheet.locator('input[type=file]').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: png })
  await expect(sheet.locator('[data-owner-report-shot]')).toHaveText('Ảnh bạn chọn')
  expect(await sheet.locator('img').getAttribute('src')).not.toBe(taken)
  await sheet.getByRole('button', { name: 'Đóng' }).click()
  await expect(sheet).toHaveCount(0)
  // A second report opens fresh.
  await page.locator('[data-owner-report-open]').click()
  await expect(page.locator('[data-owner-report] textarea')).toHaveValue('')
})

test('the bar still hides a page, and has its links, from its own file', async ({ page, context, baseURL }) => {
  await flag(context, baseURL!)
  const hides: string[] = []
  await page.route(url => url.pathname === '/_ab/hidden', route => { hides.push(route.request().postData() ?? ''); return route.fulfill({ status: 200, body: 'ok' }) })
  page.on('dialog', d => d.accept('thử'))
  const path = pageOf()
  await page.goto(path)
  const bar = page.locator('[data-owner-bar]')
  await expect(bar.getByRole('link', { name: 'Quản trị' })).toHaveAttribute('href', '/_ab/')
  await expect(bar.getByRole('link', { name: 'Người đọc' })).toHaveAttribute('href', '/_ab/doc-gia/')
  await bar.getByRole('button', { name: 'Ẩn trang này' }).click()
  await expect(bar.getByRole('button', { name: /Đã ẩn/ })).toBeVisible()
  expect(hides).toEqual([new URLSearchParams({ url: path, action: 'hide', note: 'thử' }).toString()])
})

test('the home page has the report button and nothing to hide', async ({ page, context, baseURL }) => {
  await flag(context, baseURL!)
  await page.goto('/')
  const bar = page.locator('[data-owner-bar]')
  await expect(bar.locator('[data-owner-report-open]')).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Ẩn trang này' })).toHaveCount(0)
})
