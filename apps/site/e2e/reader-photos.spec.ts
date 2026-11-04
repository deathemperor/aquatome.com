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
