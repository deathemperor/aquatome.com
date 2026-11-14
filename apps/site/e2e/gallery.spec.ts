import type { Page } from '@playwright/test'
import { expect, photosMissing, sideways, test } from './fixtures'
import { doubleTap, pinchOut, swipe } from './gestures'
import { sourcePages } from './pages'

// A photo gallery, from the fish's or plant's page: the strip's link opens the gallery page, a photo opens in the viewer
// with its author and licence, the arrow keys step through, Escape closes. The pages come from the build (or, live, the
// sitemap), so the journey holds on aquatome.com's real galleries too.
const galleryOf = (section: string) => sourcePages().find(p => new RegExp(`^/${section}/[^/]+/anh/$`).test(p))

for (const [what, section] of [['fish', 'ca'], ['plant', 'cay']] as const) {
  test(`${what} gallery: from the page's strip to the gallery, then through the photos in the viewer`, async ({ page, errors }) => {
    const gallery = galleryOf(section)
    test.skip(!gallery, `no ${what} gallery in this build`)
    await page.goto(gallery!.replace(/anh\/$/, ''))
    const all = page.locator('section.strip :is(.head a, a.all):visible') // a fish page's row on a phone has its own
    await expect(all).toHaveAttribute('href', gallery!)
    await all.click()
    await expect(page).toHaveURL(new RegExp(`${gallery}$`))
    await page.waitForLoadState() // the viewer's script, before a click on a photo (else the link opens the photo itself)
    const photos = page.locator('[data-gallery] a[data-i]')
    const n = await photos.count()
    expect(n).toBeGreaterThanOrEqual(6)
    await photos.first().click()
    const viewer = page.locator('dialog.lb')
    await expect(viewer).toBeVisible()
    const by = viewer.locator('.by')
    await expect(by).toContainText(`1/${n}`)
    await expect(by.locator('a').first()).toHaveAttribute('href', /^https:\/\//) // an Unsplash photo's line has more (unsplash-credits.spec.ts)
    await page.keyboard.press('ArrowRight')
    await expect(by).toContainText(`2/${n}`)
    await expect(page).toHaveURL(/#a2$/)
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    // Closed, the address is the gallery's again, focus is on the photo it closed on, and stepping through photos left
    // nothing in the history: Back goes to the fish's page.
    await expect(page).toHaveURL(new RegExp(`${gallery}$`))
    await expect(photos.nth(1)).toBeFocused()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`${gallery!.replace(/anh\/$/, '')}$`))
    expect(errors).toEqual([])
  })

  // Each thumbnail keeps its share of the strip when its photo doesn't load: its alt text, a caption or the page's name,
  // shows in its place, and on 13 November a long word in it (the Malay Bucephalandra page's, checked live with no photo
  // loaded) widened the strip's columns past a phone's edge. That page's word stands in for the build's own captions,
  // which are shorter: any caption or name can be.
  test(`${what} page: the photo strip fits the screen when its photos don't load`, async ({ page }) => {
    const gallery = galleryOf(section)
    test.skip(!gallery, `no ${what} gallery in this build`)
    await page.goto(gallery!.replace(/anh\/$/, ''))
    await expect(page.locator('section.strip img').first()).toBeAttached()
    await page.locator('section.strip img').evaluateAll(imgs => imgs.forEach(i => { (i as HTMLImageElement).alt = 'Bucephalandra' }))
    await photosMissing(page)
    expect(await sideways(page), 'sideways scroll').toBeNull()
  })
}

// The count is the page's title (the owner's call, 2026-11-07: a gallery shows how rich the page's photos are), and a phone
// keeps two 4:3 columns, which barely crop these mostly landscape photos.
test('gallery page: the count is its title, ahead of its line and photos; a phone has two 4:3 columns', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  await page.goto(gallery!)
  const tiles = page.locator('[data-gallery] a[data-i]')
  const n = await tiles.count()
  const title = page.locator('h1')
  await expect(title).toHaveText(`${n} ảnh`)
  const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y
  expect(await y('h1'), 'the title over its line').toBeLessThan(await y('.lead'))
  expect(await y('.lead'), 'the line over the photos').toBeLessThan(await y('[data-gallery]'))
  await expect(title, 'the title on the first screen').toBeInViewport({ ratio: 1 })
  if (info.project.name === 'phone') {
    const [a, b, c] = await Promise.all([0, 1, 2].map(async i => (await tiles.nth(i).boundingBox())!))
    expect(b!.y, 'the first two side by side').toBeCloseTo(a!.y, 0)
    expect(b!.x, 'the first two side by side').toBeGreaterThan(a!.x + a!.width - 1)
    expect(c!.y, 'the third on the next row').toBeGreaterThan(a!.y + a!.height - 1)
    expect(c!.x, 'the third under the first').toBeCloseTo(a!.x, 0)
    for (const box of [a!, b!, c!]) expect(box.width / box.height, '4:3').toBeCloseTo(4 / 3, 1)
    const edge = (await page.locator('[data-gallery]').boundingBox())!
    expect(b!.x + b!.width, 'the two columns fill the width').toBeCloseTo(edge.x + edge.width, 0)
  }
  expect(errors).toEqual([])
})

// Readers' photos are under the gallery, outside its count, so its title has a link down to them once the Worker says
// there are any. The Worker's list (/_p) and the photos are stand-ins, so this holds on the fixture and on aquatome.com.
const reader = (i: number) => ({ id: `p${i}`, name: 'Minh', url: `/_e2e/${i}.svg`, thumb: `/_e2e/${i}.svg`, width: 1200, height: 900, createdAt: '2026-11-02T03:00:00Z' })
const standIn = async (page: Page, list: object) => {
  await page.route(url => url.pathname === '/_p' && url.searchParams.has('e'), route => route.fulfill({ json: { sitekey: 'x', verification: 'phone', ...list } }))
  await page.route(url => url.pathname.startsWith('/_e2e/'), route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#2f6b4f"/></svg>' }))
}
/** A fish's gallery page, which has its readers' photos (a breed's has none). */
async function fishGallery(page: Page) {
  for (const gallery of sourcePages().filter(p => /^\/ca\/[^/]+\/anh\/$/.test(p)).slice(0, 20)) {
    await page.goto(gallery)
    if (await page.locator('[data-reader-photos]').count()) return gallery
  }
  return undefined
}

test('gallery page with readers\' photos: a link under the title goes down to them, with how many', async ({ page, errors }, info) => {
  await standIn(page, { photos: [1, 2, 3].map(reader) })
  test.skip(!(await fishGallery(page)), 'no fish gallery in this build')
  const down = page.locator('[data-to-readers]')
  await expect(down).toHaveText('Xem 3 ảnh bạn đọc gửi ↓')
  await expect(down, 'on the first screen').toBeInViewport({ ratio: 1 })
  expect((await down.boundingBox())!.height, 'a finger\'s target').toBeGreaterThanOrEqual(44)
  if (info.project.name === 'phone') await down.tap(); else await down.click()
  await expect(page).toHaveURL(/#rp-h$/)
  await expect(page.locator('[data-reader-photos] h2')).toBeInViewport() // a gallery of a few photos may have it on screen already
  await expect(page.locator('[data-reader-photos] [data-list] button')).toHaveCount(3)
  expect(errors).toEqual([])
})

// The Worker lists 60 at a time and gives no total: with more to come, no number that would be wrong.
test('gallery page with more readers\' photos than one list: the link says no number', async ({ page, errors }) => {
  await standIn(page, { photos: [1, 2, 3].map(reader), next: '2026-11-01T00:00:00Z' })
  test.skip(!(await fishGallery(page)), 'no fish gallery in this build')
  await expect(page.locator('[data-to-readers]')).toHaveText('Xem ảnh bạn đọc gửi ↓')
  expect(errors).toEqual([])
})

test('gallery page with no readers\' photos: no link, their part still asks for one', async ({ page, errors }) => {
  await standIn(page, { photos: [] })
  test.skip(!(await fishGallery(page)), 'no fish gallery in this build')
  await expect(page.locator('[data-reader-photos] [data-empty]')).toBeVisible()
  await expect(page.locator('[data-to-readers]')).toBeHidden()
  expect(errors).toEqual([])
})

// The photos' chip was left out to keep the row at five, on most fish with a gallery page. It now stays at the row's end,
// in sight while the others scroll beside it, and opens the gallery. Read from the page, so it holds on aquatome.com.
test('a fish\'s jump row ends with the photos and their count, in sight, and opens the gallery', async ({ page, errors }, info) => {
  let fish: string | undefined
  for (const gallery of sourcePages().filter(p => /^\/ca\/[^/]+\/anh\/$/.test(p)).slice(0, 20)) {
    await page.goto(gallery.replace(/anh\/$/, ''))
    if (await page.locator('nav.jump').count()) { fish = gallery; break }
  }
  test.skip(!fish, 'no fish with a jump row and a gallery in this build')
  const row = page.locator('nav.jump')
  expect(await row.locator('a').count(), 'chips').toBeLessThanOrEqual(5)
  const chip = row.locator('a').last()
  await expect(chip).toHaveAttribute('href', fish!)
  const n = /^Ảnh (\d+)$/.exec((await chip.textContent())!)?.[1]
  expect(n, 'the chip\'s count').toBeTruthy()
  // A row over five left a part out, never the photos: its part is on the page, its chip isn't.
  if (await row.locator('a').count() === 5 && await page.locator('#muc-reproduction').count()) await expect(row.locator('a[href="#muc-reproduction"]')).toHaveCount(0)
  // In sight whichever way the others are scrolled.
  await row.scrollIntoViewIfNeeded()
  await expect(chip).toBeInViewport({ ratio: 1 })
  const others = row.locator('ul')
  await others.evaluate(u => { u.scrollLeft = u.scrollWidth })
  await expect(chip).toBeInViewport({ ratio: 1 })
  const [end, last] = [(await chip.boundingBox())!, (await others.locator('a').last().boundingBox())!]
  expect(end.x, 'to the right of the others').toBeGreaterThan(last.x + last.width - 1)
  if (info.project.name === 'phone') await chip.tap(); else await chip.click()
  await expect(page).toHaveURL(new RegExp(`${fish}$`))
  await expect(page.locator('h1')).toHaveText(`${n} ảnh`)
  await expect(page.locator('[data-gallery] a[data-i]')).toHaveCount(Number(n))
  expect(errors).toEqual([])
})

test('a fish with no gallery page has no photos chip: its photo is right above the row', async ({ page, errors }) => {
  const pages = sourcePages()
  let found = false
  for (const fish of pages.filter(p => /^\/ca\/[^/]+\/$/.test(p) && !pages.includes(`${p}anh/`)).slice(0, 30)) {
    await page.goto(fish)
    if (await page.locator('nav.jump').count() && await page.locator('header.top .photo').count()) { found = true; break }
  }
  test.skip(!found, 'no fish with a photo, a jump row and no gallery in this build')
  const row = page.locator('nav.jump')
  await expect(row.locator('a[href="#anh"]')).toHaveCount(0)
  await expect(row.locator('a[href$="/anh/"]')).toHaveCount(0)
  await expect(page.locator('#anh img')).toBeVisible()
  // The row's lower rule is the text's first: no second line right under it.
  await expect(page.locator('nav.jump ~ .body > :first-child')).toHaveCSS('border-top-width', '0px')
  expect(errors).toEqual([])
})

// On a phone the Back button closes the photo, not the page; the photo follows a swipe to the next one; a photo's own
// address (#a3, as the fish page's strip links it) opens the gallery on it.
test('gallery viewer: #a3 opens photo 3, a swipe goes to the next, Back closes it and stays on the gallery', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  await page.goto(`${gallery}#a3`)
  const viewer = page.locator('dialog.lb')
  await expect(viewer).toBeVisible()
  const n = await page.locator('[data-gallery] a[data-i]').count()
  const by = viewer.locator('.by')
  await expect(by).toContainText(`3/${n}`)
  await expect(viewer.getByRole('status')).toHaveText(`3/${n}`)
  // The photos follow the finger until it lifts.
  const stage = viewer.locator('.pv-stage')
  const width = (await stage.boundingBox())!.width
  // Chrome hands a finger's moves to the page with the next frame, so the last one can land just after it is sent.
  await swipe(page, stage, -0.6, info.project.name === 'phone', async () => {
    const x = () => viewer.locator('.pv-track').evaluate(t => new DOMMatrix(getComputedStyle(t).transform).m41)
    await expect.poll(x).toBeCloseTo(-0.6 * width, -1)
  })
  await expect(by).toContainText(`4/${n}`)
  await expect(page).toHaveURL(new RegExp(`${gallery}#a4$`))
  await swipe(page, stage, 0.6, info.project.name === 'phone')
  await expect(by).toContainText(`3/${n}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${gallery}$`))
  await expect(page.locator('[data-gallery]')).toBeVisible()
  expect(errors).toEqual([])
})

// Zoomed in (a pinch or a double tap on a phone, the wheel or a double click on a computer), a drag pans the photo
// instead of going to the next one; a double tap or click zooms back out, and the swipe works again.
test('gallery viewer: a zoomed photo pans rather than swiping; a double tap zooms back out', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  const touch = info.project.name === 'phone'
  // The gallery's widest photo: zoomed on a computer's wide screen, a tall one can stay narrower than the screen, with
  // nothing to pan sideways (the first fish gallery's first photo was one on 14 Nov).
  await page.goto(gallery!)
  const shapes = await page.locator('[data-gallery] a[data-i]').evaluateAll(as => as.map(a => Number((a as HTMLElement).dataset.w) / Number((a as HTMLElement).dataset.h)))
  const n = shapes.length
  const k = shapes.indexOf(Math.max(...shapes)) + 1
  await page.goto(`${gallery}#a${k}`)
  await page.reload() // the gallery reads the address's photo as it loads
  const viewer = page.locator('dialog.lb')
  const photo = viewer.locator('.pv-slide:not([inert]) .pv-pic')
  const stage = viewer.locator('.pv-stage') // its middle is on the photo, panned or not
  const count = viewer.getByRole('status') // the photo's number alone: "1/11" is inside "11/11"
  await expect(count).toHaveText(`${k}/${n}`)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  if (touch) await pinchOut(page, stage)
  else {
    const b = (await stage.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.wheel(0, -400)
  }
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await swipe(page, stage, -0.6, touch)
  await expect(count).toHaveText(`${k}/${n}`)
  expect(await photo.evaluate(p => new DOMMatrix(getComputedStyle(p).transform).m41), 'panned to the left').toBeLessThan(0)
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await doubleTap(page, stage, touch)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await swipe(page, stage, -0.6, touch)
  await expect(count).toHaveText(`${(k % n) + 1}/${n}`) // after the last comes the first
  expect(errors).toEqual([])
})

// With a mouse, the magnifier cursor means what it says: one click on the photo zooms in there, the next zooms back
// out, and a double click out of habit still leaves it zoomed in.
test('gallery viewer: one click zooms in with a mouse, the next zooms out; a double click zooms in', async ({ page, errors }, info) => {
  const gallery = galleryOf('ca')
  test.skip(!gallery, 'no fish gallery in this build')
  test.skip(info.project.name === 'phone', 'a finger zooms with a double tap or a pinch')
  await page.goto(`${gallery}#a1`)
  const viewer = page.locator('dialog.lb')
  const stage = viewer.locator('.pv-stage')
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  const b = (await stage.boundingBox())!
  const x = b.x + b.width / 2, y = b.y + b.height / 2
  await page.mouse.click(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await page.waitForTimeout(400) // a separate click, not the second of a double click
  await page.mouse.click(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'out')
  await page.waitForTimeout(400)
  await page.mouse.dblclick(x, y)
  await expect(viewer).toHaveAttribute('data-zoom', 'in')
  await expect(viewer).toBeVisible()
  expect(errors).toEqual([])
})
