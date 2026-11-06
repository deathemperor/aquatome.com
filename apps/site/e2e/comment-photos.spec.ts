import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// A comment can carry one photo (worker/comments/photo.ts). A published one shows under its comment's text and opens in
// the photo viewer; one just sent waits for moderation, so nothing shows under the new comment, and its take-back link
// is text to keep. The Worker's comments (/_c), the photos and Turnstile are stand-ins, so the journey holds on the
// fixture build, which has no Worker, and on aquatome.com without sending anything.
const PHOTO = '/_e2e/comment-1.svg'
const COMMENTS = [
  { id: 'c1', name: 'Minh', body: 'Vây cá bị rách như thế này có sao không?', helpful: false, createdAt: '2026-11-02T03:00:00Z', author: 'a'.repeat(16), photo: { id: 'p1', url: PHOTO, thumb: PHOTO, width: 1200, height: 900 } },
  { id: 'c2', name: 'Lan', body: 'Thay nước 30% mỗi tuần là ổn.', helpful: false, createdAt: '2026-11-03T03:00:00Z', author: 'b'.repeat(16) },
]
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#2f6b4f"/></svg>'

test('a comment with a photo: a published one opens in the viewer; one just sent waits for moderation, with its take-back link to keep', async ({ page, errors }) => {
  const fish = sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!
  const LINK = '/_p/xoa/?id=00000000-0000-0000-0000-000000000000&t=e2e'
  const posts: { type: string; body: string }[] = []
  await page.route(url => url.pathname === '/_c', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { comments: COMMENTS, sitekey: 'x', verification: 'none' } })
    posts.push({ type: route.request().headers()['content-type'] ?? '', body: route.request().postDataBuffer()?.toString('latin1') ?? '' })
    return route.fulfill({ status: 201, json: { status: 'approved', comment: { id: 'c3', name: 'Lộc', body: 'Bể mình bị đục, ảnh đây.', helpful: false, createdAt: new Date().toISOString(), author: 'c'.repeat(16) }, photo: { status: 'pending', id: 'p3', deleteUrl: LINK } } })
  })
  await page.route(url => url.pathname.startsWith('/_e2e/'), route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile = { render(el, o) { setTimeout(() => o.callback("tok"), 10); return "w" }, reset() {} }' }))
  await page.goto(fish)
  const section = page.locator('[data-comments]')

  // The published photo, under its comment's text, opens in the viewer on the page, credited to the comment's name.
  const thumbs = section.locator('[data-list] button[data-photo]')
  await expect(thumbs).toHaveCount(1)
  await expect(section.locator('[data-comment-id="c1"] img')).toHaveAttribute('alt', 'Ảnh của Minh')
  await expect(section.locator('[data-comment-id="c2"] img')).toHaveCount(0)
  await thumbs.click()
  const viewer = page.locator('dialog.pv')
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('.by')).toHaveText(/^Ảnh của Minh · \d{1,2}\/\d{1,2}\/2026 · 1\/1$/)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${fish}$`))

  // Its consent shows only once a photo is picked.
  const form = section.locator('[data-form]')
  await expect(form).toBeVisible()
  const consent = form.locator('input[name=consent]')
  await expect(consent).toBeHidden()
  const png = Buffer.from(await page.evaluate(() => new Promise<number[]>(done => {
    const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 })
    c.getContext('2d')!.fillRect(0, 0, 40, 30)
    c.toBlob(b => void b!.arrayBuffer().then(a => done([...new Uint8Array(a)])), 'image/png')
  })))
  await form.locator('input[name=file]').setInputFiles({ name: 'be.png', mimeType: 'image/png', buffer: png })
  await expect(consent).toBeVisible()
  await form.locator('input[name=name]').fill('Lộc')
  await form.locator('textarea[name=body]').fill('Bể mình bị đục, ảnh đây.')
  await consent.check()
  await form.locator('button[type=submit]').click()

  // Sent as one multipart post: the comment's fields, the consent and the photo, shrunk to a JPEG on the device.
  await expect(form.locator('[data-msg]')).toHaveText('Đã đăng bình luận. Ảnh sẽ hiện dưới bình luận sau khi được duyệt, thường trong vòng một ngày.')
  expect(posts).toHaveLength(1)
  expect(posts[0]!.type).toMatch(/^multipart\/form-data; boundary=/)
  const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(posts[0]!.body)?.[1]
  expect([field('e'), field('consent'), field('token')]).toEqual([await section.getAttribute('data-entity'), '1', 'tok'])
  expect(posts[0]!.body).toMatch(/name="file"; filename="photo\.jpg"\r\nContent-Type: image\/jpeg/)

  // Pending: the new comment shows, with nothing under its text; the photo just sent stays in view with its link to keep.
  const mine = section.locator('[data-comment-id="c3"]')
  await expect(mine).toContainText('Bể mình bị đục, ảnh đây.')
  await expect(mine.locator('img, button')).toHaveCount(0)
  await expect(thumbs).toHaveCount(1)
  const sent = form.locator('[data-sent]')
  await expect(sent).toBeVisible()
  await expect(sent.locator('img')).toHaveAttribute('alt', 'Ảnh của Lộc')
  await expect(sent.locator('input')).toHaveValue(new URL(LINK, page.url()).href)
  await expect(section.locator('a[href*="/_p/xoa/"]')).toHaveCount(0)
  await expect(consent).toBeHidden()
  expect(errors).toEqual([])
})
