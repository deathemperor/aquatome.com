import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { albumPage } from './album'

// An Unsplash photo is credited as Unsplash's API guidelines ask wherever it shows: "Ảnh: <name> trên Unsplash", the
// name linking the photographer's Unsplash page (else, until the engine has it, the photo's) and "Unsplash" its home,
// both with our UTM (lib/unsplash.ts). Here: the album's viewer over its page, and the credits list a list's script
// writes for the cards it builds. Both find their photos on the page, so they hold on aquatome.com's real albums and
// lists too.
const UTM = /[?&]utm_source=aquatome&utm_medium=referral$/
const HOME = 'https://unsplash.com/?utm_source=aquatome&utm_medium=referral'

/** The line's links: the name (to `who`), then Unsplash's home; every link to Unsplash with the UTM. */
async function line(el: Locator, name: string, who: string) {
  await expect(el).toContainText(`Ảnh: ${name} trên Unsplash`)
  await expect(el.getByRole('link', { name, exact: true })).toHaveAttribute('href', who)
  await expect(el.getByRole('link', { name: 'Unsplash', exact: true })).toHaveAttribute('href', HOME)
  for (const href of await el.locator('a[href*="unsplash.com"]').evaluateAll(as => as.map(a => a.getAttribute('href')!))) expect(href).toMatch(UTM)
}

test('album viewer: an Unsplash photo\'s credit links its photographer and Unsplash, with the UTM, and the photo\'s own page', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca', a => a.photos.some(p => p.un)) ?? await albumPage(request, 'cay', a => a.photos.some(p => p.un))
  test.skip(!found, 'no album with an Unsplash photo in this build')
  const { path, album } = found!
  // One whose photographer's page is known, and one not yet (the fixture's flowerhorn has both).
  for (const has of [true, false]) {
    const i = album.photos.findIndex(p => p.un && !!p.b === has)
    if (i < 0) continue
    const p = album.photos[i]!
    await page.goto(`${path}#a${i + 1}`)
    const credit = page.locator('dialog.lb .by')
    await expect(credit).toBeVisible()
    await line(credit, p.a, p.b ?? p.s)
    if (p.b) await expect(credit.getByRole('link', { name: 'Xem ảnh gốc ↗' })).toHaveAttribute('href', p.s)
    await page.keyboard.press('Escape')
    await expect(credit).toBeHidden()
    // Closed by going back past its entry: the page's own address again, before the next photo's.
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  }
  expect(errors).toEqual([])
})

// A card the fish list's script builds (past its first page, or after a filter) credits its photo in the footer as the
// server does: an Unsplash photo's row is its line, its photo a number. The list's data file is changed so its first
// species shows an Unsplash photo: the server's own Unsplash row when the page has one (a breed's card), else one made up.
test('the fish list: a card built in the browser credits its Unsplash photo as the server\'s list does', async ({ page, request, errors }) => {
  const html = await (await request.get('/ca/')).text()
  const src = /id="species-result"[^>]*data-src="([^"]+)"|data-src="([^"]+)"[^>]*id="species-result"/.exec(html)
  const data = src?.[1] ?? src?.[2]
  test.skip(!data, 'no fish list data file')
  const items = (await (await request.get(data!)).json()) as { slug: string; photo?: Record<string, unknown> }[]
  test.skip(!items.length, 'no species')
  await page.goto('/ca/')
  // The server's row of one Unsplash photo whose photographer's page it has, if any.
  const server = page.locator('#photo-credits li[data-licence="Unsplash License"][data-author-url]').filter({ has: page.locator('.nums a:only-child') }).first()
  const row = (await server.count()) ? await server.evaluate(li => li.outerHTML.replace(/ data-astro-cid-\w+(="")?/g, '')) : undefined
  const photo = row
    ? await server.evaluate(li => ({ author: li.dataset.author!, authorUrl: li.dataset.authorUrl!, url: li.querySelector('.nums a')!.getAttribute('href')! }))
    : { author: 'Ann Example', authorUrl: 'https://unsplash.com/@annexample?utm_source=aquatome&utm_medium=referral', url: 'https://unsplash.com/photos/a-fish-AbCdEfGhIjK?utm_source=aquatome&utm_medium=referral' }
  const first = { ...items[0]!, photo: { src: 'https://images.unsplash.com/photo-1?ixid=x&w=480', w: 1280, h: 960, licence: 'Unsplash License', ...photo } }
  await page.route(`**${data}`, route => route.fulfill({ json: [first, ...items.slice(1)] }))
  // The HTML with no cards and no credits: the script builds the first page from the data file, and credits it.
  await page.route('**/ca/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: html.replace(/<div data-slug="([^"]+)"[^>]*><article[\s\S]*?<\/article><\/div>/g, '').replace(/(<div id="photo-credits"[\s\S]*?<ul[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2'),
  }))
  await page.reload()
  await expect(page.locator(`main [data-slug="${first.slug}"]`)).toBeVisible()
  const built = page.locator('#photo-credits li').filter({ has: page.locator(`.nums a[href="${photo.url}"]`) })
  await expect(built).toHaveCount(1)
  if (row) expect(await built.evaluate(li => li.outerHTML)).toBe(row)
  // As a reader: the footer's "Nguồn ảnh" opens the list.
  await page.locator('footer .credits-btn').click()
  await line(built, photo.author, photo.authorUrl)
  await expect(built.locator('.nums a')).toHaveAttribute('href', photo.url)
  // The button counts photos: the photographer's and Unsplash's links aren't photos.
  const n = await page.locator('#photo-credits li a:not(.author, .site, .licence)').count()
  await expect(page.locator('footer .credits-btn')).toHaveText(new RegExp(`\\(${n}\\)$`))
  expect(errors).toEqual([])
})
