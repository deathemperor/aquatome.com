import { expect, test } from './fixtures'
import { LIVE } from './pages'

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

// A fish with no photo at all: the list's data file gives it none, and its page's Article names no image (the fish's
// first photo, pages/ca/[slug].astro). The list alone isn't enough: a tile takes only a photo that fits a card, and on
// 13 November the first 44 fish without one had a photo on their page (the first, ca-betta-unimaculata, a dealer's photo
// cropped to 1000 × 691). Of the first 150, ten pages at a time; a page that doesn't answer, or has no Article, isn't one.
const SEARCHED = 150
const LD = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
async function photoless(request: import('@playwright/test').APIRequestContext) {
  const items = (await list(request)).items.filter(i => !i.photo).slice(0, SEARCHED)
  for (let at = 0; at < items.length; at += 10) {
    const bare = await Promise.all(items.slice(at, at + 10).map(async item => {
      const res = await request.get(`${LIST}${item.slug}/`)
      if (!res.ok()) return false
      const article = [...(await res.text()).matchAll(LD)].map(m => JSON.parse(m[1]!) as { '@type'?: string; image?: unknown }).find(d => d['@type'] === 'Article')
      return !!article && article.image === undefined
    }))
    if (bare.includes(true)) return items[at + bare.indexOf(true)]
  }
}

test('a fish page with no photo has no head and shares the site\'s logo', async ({ page, request, errors }) => {
  test.setTimeout(90_000) // up to 150 pages read first (photoless)
  const bare = await photoless(request)
  // The fixture's fish all have a photo; the live site has hundreds without, so not finding one there is a failure.
  test.skip(!bare && !LIVE, 'every fish on this build has a photo (the fixture)')
  expect(bare, `a fish with no photo at all, among the first ${SEARCHED} the fish list gives none`).toBeTruthy()
  await page.goto(`${LIST}${bare!.slug}/`)
  await expect(page.locator('main header.top')).toHaveClass(/\bbare\b/)
  await expect(page.locator('#anh')).toHaveCount(0)
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/\/logo\.png$/)
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary')
  expect(errors).toEqual([])
})
