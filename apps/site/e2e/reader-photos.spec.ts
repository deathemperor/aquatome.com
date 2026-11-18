import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// Readers' photos on a fish's page open in the photo viewer on the page, as the gallery's do: never the photo file on
// the media host in a new tab. The Worker's list (/_p) and the photos are stand-ins (drawn here), so the journey holds
// on the fixture build, which has no Worker, and on aquatome.com.
const photo = (i: number) => `/_e2e/reader-${i}.svg`
const PHOTOS = [
  { id: 'p1', name: 'Minh', url: photo(1), thumb: photo(1), width: 1200, height: 900, createdAt: '2026-10-30T03:00:00Z' },
  { id: 'p2', name: '<b>Lan</b>', url: photo(2), thumb: photo(2), width: 900, height: 1200, createdAt: '2026-11-02T03:00:00Z' },
  { id: 'p3', name: 'Tú', url: photo(3), thumb: photo(3), width: 1200, height: 900, createdAt: '2026-11-03T03:00:00Z' },
]
const svg = (i: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#2f6b4f"/><text x="600" y="500" font-size="200" text-anchor="middle" fill="#e6efec">${i}</text></svg>`

test('a reader photo opens in the viewer on the page, not in a new tab; Back closes it', async ({ page, errors }) => {
  const fish = sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!
  await page.route(url => url.pathname === '/_p' && url.searchParams.has('e'), route => route.fulfill({ json: { photos: PHOTOS, sitekey: 'x', verification: 'phone' } }))
  await page.route(url => url.pathname.startsWith('/_e2e/'), route => route.fulfill({ contentType: 'image/svg+xml', body: svg(Number(/(\d+)\.svg$/.exec(route.request().url())![1])) }))
  await page.goto(fish)
  const tiles = page.locator('[data-reader-photos] [data-list] button')
  await expect(tiles).toHaveCount(3)
  await expect(page.locator('[data-reader-photos] [data-list] a')).toHaveCount(0)
  // The reader's name as they wrote it, as text.
  await expect(page.locator('[data-reader-photos] [data-list] li').nth(1)).toContainText('<b>Lan</b>')

  const tabs = page.context().pages().length
  await tiles.nth(1).click()
  const viewer = page.locator('dialog.pv')
  await expect(viewer).toBeVisible()
  expect(page.context().pages()).toHaveLength(tabs)
  await expect(page).toHaveURL(new RegExp(`${fish}$`))
  const by = viewer.locator('.by')
  await expect(by).toHaveText(/^Ảnh của <b>Lan<\/b> · \d{1,2}\/\d{1,2}\/2026 · 2\/3$/)
  await expect(by.locator('a, b')).toHaveCount(0)
  // The tile's picture under the full photo until that one is ready; the photos either side loading beside it.
  const current = viewer.locator('.pv-slide:not([inert])')
  await expect(current.locator('.pv-thumb')).toHaveAttribute('src', photo(2))
  await expect(current.locator('.pv-pic')).toHaveClass(/\bready\b/)
  expect(await viewer.locator('.pv-slide[inert] .pv-full').evaluateAll(imgs => imgs.map(i => new URL((i as HTMLImageElement).src).pathname).sort())).toEqual([photo(1), photo(3)])

  await viewer.getByRole('button', { name: 'Ảnh sau' }).click()
  await expect(by).toContainText('3/3')
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${fish}$`))
  await expect(tiles.nth(2)).toBeFocused()
  expect(errors).toEqual([])
})

// After sending, the photo just sent stays in view, and its take-back link is text to keep, never a link: tapped, it
// opened the page that removes the photo, which the owner took for "see my photo". The Worker and Turnstile are
// stand-ins, so the journey holds on the fixture build and on aquatome.com without sending anything.
test('a photo just sent stays in view; its take-back link is text to keep with a copy button, not a link', async ({ page, context, errors }, info) => {
  const fish = sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!
  const LINK = '/_p/xoa/?id=00000000-0000-0000-0000-000000000000&t=e2e'
  await page.route(url => url.pathname === '/_p', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 201, json: { status: 'pending', id: 'e2e', deleteUrl: LINK } })
    : route.fulfill({ json: { photos: [], sitekey: 'x', verification: 'none' } }))
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile = { render(el, o) { setTimeout(() => o.callback("tok"), 10); return "w" }, reset() {} }' }))
  if (info.project.name !== 'phone') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(fish)
  const section = page.locator('[data-reader-photos]')
  await section.locator('summary').click()
  // A small PNG the browser drew itself: something it decodes and shrinks.
  const png = Buffer.from(await page.evaluate(() => new Promise<number[]>(done => {
    const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 })
    c.getContext('2d')!.fillRect(0, 0, 40, 30)
    c.toBlob(b => void b!.arrayBuffer().then(a => done([...new Uint8Array(a)])), 'image/png')
  })))
  await section.locator('input[type=file]').setInputFiles({ name: 'ca.png', mimeType: 'image/png', buffer: png })
  await section.locator('input[name=name]').fill('Lộc')
  await section.locator('input[name=consent]').check()
  await section.locator('button[type=submit]').click()
  await expect(section.locator('[data-msg]')).toContainText('Đã nhận ảnh')
  const sent = section.locator('[data-sent]')
  await expect(sent).toBeVisible()
  await expect(sent.locator('img')).toHaveAttribute('alt', 'Ảnh của Lộc')
  expect(await sent.locator('img').evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(section.locator('a[href*="/_p/xoa/"]')).toHaveCount(0)
  const field = sent.locator('input')
  await expect(field).toHaveValue(new URL(LINK, page.url()).href)
  await expect(field).toHaveAttribute('readonly', '')
  if (info.project.name !== 'phone') {
    await sent.locator('button').click()
    await expect(sent.locator('button')).toHaveText('Đã chép')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(LINK, page.url()).href)
  }
  expect(errors).toEqual([])
})

// Only the latest photo's take-back shows: the box hides as the next photo is sent, while it sends, and stays hidden
// when that send is refused. Its own display (grid) used to outlive its `hidden`, so the first photo's link stayed on
// screen under the second send, and under its error.
test('two photos sent: only the latest one\'s take-back shows', async ({ page, errors }) => {
  const fish = sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!
  const link = (n: number) => `/_p/xoa/?id=00000000-0000-0000-0000-00000000000${n}&t=e2e`
  let release: (() => void) | undefined
  let posts = 0
  await page.route(url => url.pathname === '/_p', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { photos: [], sitekey: 'x', verification: 'none' } })
    const n = ++posts
    if (n === 2) await new Promise<void>(r => (release = r))
    return n === 3 ? route.fulfill({ status: 429, json: { error: 'rate' } }) : route.fulfill({ status: 201, json: { status: 'pending', id: `e2e${n}`, deleteUrl: link(n) } })
  })
  // Each send spends the token; the stand-in gives a new one after its reset, as Turnstile does, to the widget reset: on
  // aquatome.com the page's comments render a widget of their own, so the last one rendered is often not this form's.
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: 'text/javascript', body: 'const cbs = {}; let n = 0; window.turnstile = { render(el, o) { const id = "w" + ++n; cbs[id] = o.callback; setTimeout(() => o.callback("tok"), 10); return id }, reset(id) { setTimeout(() => cbs[id]("tok"), 10) } }' }))
  await page.goto(fish)
  const section = page.locator('[data-reader-photos]')
  await section.locator('summary').click()
  const png = Buffer.from(await page.evaluate(() => new Promise<number[]>(done => {
    const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 })
    c.getContext('2d')!.fillRect(0, 0, 40, 30)
    c.toBlob(b => void b!.arrayBuffer().then(a => done([...new Uint8Array(a)])), 'image/png')
  })))
  const msg = section.locator('[data-msg]')
  const sent = section.locator('[data-sent]')
  const send = async () => {
    await section.locator('input[type=file]').setInputFiles({ name: 'ca.png', mimeType: 'image/png', buffer: png })
    await section.locator('input[name=name]').fill('Lộc')
    await section.locator('input[name=consent]').check()
    await section.locator('button[type=submit]').click()
  }
  await send()
  await expect(msg).toContainText('Đã nhận ảnh')
  await expect(sent.locator('input')).toHaveValue(new URL(link(1), page.url()).href)

  await send()
  await expect(msg).toHaveText('Đang gửi…')
  await expect(sent).toBeHidden()
  release!()
  await expect(msg).toContainText('Đã nhận ảnh')
  await expect(sent).toBeVisible()
  await expect(section.locator('input[readonly]')).toHaveCount(1)
  await expect(sent.locator('input')).toHaveValue(new URL(link(2), page.url()).href)

  await send()
  await expect(msg).toContainText('Bạn đã gửi đủ 5 ảnh hôm nay')
  await expect(sent).toBeHidden()
  expect(errors).toEqual([])
})

// A fish's page with an album has its readers' photos under it: they open in the viewer among themselves, credited by
// the reader's name, and "Xem thêm" brings the older ones past the API's 60. The album (GalleryStrip.astro) stays its
// own photos. The Worker's list is a stand-in, as above.
test('a fish page shows its readers\' photos after its album, in their own viewer; "Xem thêm" brings older ones; the album stays its own', async ({ page, errors }) => {
  const many = Array.from({ length: 63 }, (_, i) => ({ id: `g${i + 1}`, name: `Bạn ${i + 1}`, url: photo(i + 1), thumb: photo(i + 1), width: 1200, height: 900, createdAt: new Date(Date.UTC(2026, 10, 3) - i * 3_600_000).toISOString() }))
  const NEXT = `${many[59]!.createdAt}~00000000-0000-4000-8000-000000000060`
  const asked: URLSearchParams[] = []
  await page.route(url => url.pathname === '/_p' && url.searchParams.has('e'), route => {
    const q = new URL(route.request().url()).searchParams
    asked.push(q)
    return route.fulfill({ json: q.get('before') === NEXT ? { photos: many.slice(60), sitekey: 'x', verification: 'phone' } : { photos: many.slice(0, 60), next: NEXT, sitekey: 'x', verification: 'phone' } })
  })
  await page.route(url => url.pathname.startsWith('/_e2e/'), route => route.fulfill({ contentType: 'image/svg+xml', body: svg(Number(/(\d+)\.svg$/.exec(route.request().url())![1])) }))
  // A fish with an album: a breed's page has its readers' photos in Vietnamese alone.
  const section = page.locator('[data-reader-photos]')
  let gallery: string | undefined
  for (const g of sourcePages().filter(p => /^\/ca\/[^/]+\/$/.test(p)).slice(0, 40)) {
    await page.goto(g)
    if (await section.count() && await page.locator('[data-album]').count()) { gallery = g; break }
  }
  test.skip(!gallery, 'no fish page with an album in this build')
  const tiles = section.locator('[data-list] button')
  await expect(tiles).toHaveCount(60)
  expect(asked[0]!.get('e')).toMatch(/^species:[a-z0-9-]+$/)
  // Under the album, which keeps its own photos.
  const album = page.locator('[data-album]')
  const own = await album.locator('script[type="application/json"]').evaluate(s => (JSON.parse(s.textContent!) as { photos: unknown[] }).photos.length)
  expect(await album.evaluate((g, s) => !!(g.compareDocumentPosition(document.querySelector(s)!) & Node.DOCUMENT_POSITION_FOLLOWING), '[data-reader-photos]')).toBe(true)
  // The same form as the fish page's, hidden while the phone check is on (`verification: 'phone'`) even with its
  // summary open.
  await section.locator('summary').click()
  await expect(section.locator('[data-form]')).toBeHidden()

  await tiles.nth(1).click()
  const viewer = page.locator('dialog.pv')
  await expect(viewer).toHaveCount(1) // the readers' viewer alone: the album's is made only when one of its photos opens
  await expect(viewer).toBeVisible()
  const by = viewer.locator('.by')
  await expect(by).toHaveText(/^Ảnh của Bạn 2 · \d{1,2}\/\d{1,2}\/2026 · 2\/60$/)
  await expect(page).toHaveURL(new RegExp(`${gallery}$`)) // not an album photo's #aN
  await viewer.getByRole('button', { name: 'Ảnh trước' }).click()
  await expect(by).toContainText('Bạn 1 ')
  await expect(by).toContainText('1/60')
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()

  const more = section.getByRole('button', { name: 'Xem thêm' })
  await more.click()
  await expect(tiles).toHaveCount(63)
  expect(asked.at(-1)!.get('before')).toBe(NEXT)
  await expect(more).toBeHidden()
  await expect(tiles.nth(60)).toBeFocused()
  await tiles.nth(62).click()
  await expect(by).toContainText('Bạn 63 ')
  await expect(by).toContainText('63/63')
  await viewer.getByRole('button', { name: 'Ảnh sau' }).click()
  await expect(by).toContainText('1/63')
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${gallery}$`))
  // The album holds what it held: no reader's photo joined it.
  expect(await album.locator('script[type="application/json"]').evaluate(s => (JSON.parse(s.textContent!) as { photos: unknown[] }).photos.length)).toBe(own)
  expect(errors).toEqual([])
})

// Closed on a photo whose tile is off the screen (stepped round from the last to the first): focus goes to that tile,
// brought into view, not left off the screen (Codex's read of the album's change to the shared viewer, 18 Nov).
test('readers\' photos: closed on a photo whose tile is off the screen, its tile is focused in view', async ({ page, errors }) => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `t${i + 1}`, name: `Bạn ${i + 1}`, url: photo(i + 1), thumb: photo(i + 1), width: 1200, height: 900, createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() }))
  await page.route(url => url.pathname === '/_p' && url.searchParams.has('e'), route => route.fulfill({ json: { photos: many, sitekey: 'x', verification: 'phone' } }))
  await page.route(url => url.pathname.startsWith('/_e2e/'), route => route.fulfill({ contentType: 'image/svg+xml', body: svg(Number(/(\d+)\.svg$/.exec(route.request().url())![1])) }))
  const fish = sourcePages().find(p => /^\/ca\/[^/]+\/$/.test(p))!
  await page.goto(fish)
  const tiles = page.locator('[data-reader-photos] [data-list] button')
  await expect(tiles).toHaveCount(40)
  await tiles.last().click()
  const viewer = page.locator('dialog.pv')
  await expect(viewer.locator('.by')).toContainText('40/40')
  await viewer.getByRole('button', { name: 'Ảnh sau' }).click()
  await expect(viewer.locator('.by')).toContainText('1/40')
  test.skip(await tiles.first().evaluate(t => t.getBoundingClientRect().bottom > 0 && t.getBoundingClientRect().top < innerHeight), 'the first tile on the screen here')
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(tiles.first()).toBeFocused()
  await expect(tiles.first()).toBeInViewport()
  expect(errors).toEqual([])
})
