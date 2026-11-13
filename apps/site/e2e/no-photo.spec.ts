import { expect, test } from './fixtures'

// A fish with no photo of its own: 695 species pages on 12 Nov, and a page the photo check leaves with none, as a river it
// calls "none" (the chief of staff, 2026-11-12). Its tile says "no photo yet", as a breed's does; its page has no head and
// shares the site's logo. test/no-photo-page.test.ts holds the app's page file and feed.
const LIST = '/ca/'
const CARDS = /<div data-slug="([^"]+)"[^>]*><article[\s\S]*?<\/article><\/div>/g
type Item = { slug: string; name: string; photo?: unknown }
async function list(request: import('@playwright/test').APIRequestContext) {
  const html = await (await request.get(LIST)).text()
  const src = /data-src="([^"]+)"/.exec(html)![1]!
  return { html, src, items: (await (await request.get(src)).json()) as Item[] }
}

test('the fish list\'s script draws "no photo yet" on a fish with no photo, and no picture', async ({ page, request, errors }) => {
  const { html, src, items } = await list(request)
  // The list served with no cards, and its data file with one fish whose photo is gone: the script builds that tile.
  const fish = { ...items[0]!, photo: undefined }
  await page.route(`**${LIST}`, r => r.fulfill({ body: html.replace(CARDS, ''), contentType: 'text/html; charset=utf-8' }))
  await page.route(`**${src}`, r => r.fulfill({ json: [fish] }))
  await page.goto(LIST)
  const tile = page.locator(`main [data-slug="${fish.slug}"]`)
  await expect(tile.locator('.plate .ph')).toHaveText(/Chưa có ảnh/)
  await expect(tile.locator('img')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a fish page with no photo has no head and shares the site\'s logo', async ({ page, request, errors }) => {
  const bare = (await list(request)).items.find(i => !i.photo)
  test.skip(!bare, 'every fish on this build has a photo (the fixture); the live site has hundreds without')
  await page.goto(`${LIST}${bare!.slug}/`)
  await expect(page.locator('main header.top')).toHaveClass(/\bbare\b/)
  await expect(page.locator('#anh')).toHaveCount(0)
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/\/logo\.png$/)
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary')
  expect(errors).toEqual([])
})
