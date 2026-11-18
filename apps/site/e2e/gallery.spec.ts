import { albumPage } from './album'
import { expect, photosMissing, sideways, test } from './fixtures'
import { doubleTap, pinchOut, swipe } from './gestures'
import { LIVE, sourcePages } from './pages'

// A fish's or plant's album opens over its page (the owner, 17 Nov 2026: "opening a new page for it is unnecessary"):
// a thumb opens its photo in the viewer with its author and licence, "Xem tất cả" and the jump row's chip the first;
// the arrow keys and a swipe step through the whole album; Escape or Back closes it, and the page, its place and its
// history are as they were. The pages come from the build (or, live, the sitemap), so the journeys hold on aquatome.com.
const at = (path: string, hash = '') => new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${hash}$`)

for (const [what, section] of [['fish', 'ca'], ['plant', 'cay']] as const) {
  test(`${what} album: a thumb opens its photo over the page, credited; Escape closes it, the page where it was`, async ({ page, request, errors }) => {
    const found = await albumPage(request, section)
    test.skip(!found, `no ${what} album in this build`)
    const { path, album } = found!
    const n = album.photos.length
    await page.goto('/')
    await page.goto(path)
    await page.waitForLoadState() // the album's script, before a click on a thumb (else the link opens the photo itself)
    const thumb = page.locator('section.strip li a[data-i]:visible').first()
    await thumb.scrollIntoViewIfNeeded()
    const i = Number(await thumb.getAttribute('data-i'))
    const y = await page.evaluate(() => scrollY)
    await thumb.click()
    const viewer = page.locator('dialog.lb')
    await expect(viewer).toBeVisible()
    await expect(page).toHaveURL(at(path, `#a${i + 1}`))
    await expect(viewer.getByRole('status')).toHaveText(`${i + 1}/${n}`)
    // Its credit: the author and source, the licence linking its own page.
    const p = album.photos[i]!
    const by = viewer.locator('.by')
    if (!p.ai) await expect(by.getByRole('link', { name: p.a, exact: true })).toHaveAttribute('href', p.un ? /^https:\/\/unsplash\.com\// : p.s)
    if (p.l && p.lu) await expect(by.getByRole('link', { name: p.l, exact: true })).toHaveAttribute('href', p.lu)
    await page.keyboard.press('ArrowRight')
    await expect(viewer.getByRole('status')).toHaveText(`${((i + 1) % n) + 1}/${n}`)
    await expect(page).toHaveURL(at(path, `#a${((i + 1) % n) + 1}`))
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    // Closed: the page's own address, where it was, focus on the photo it closed on when that has a thumb on screen (else
    // on the one tapped), and nothing left in the history: Back leaves the page.
    await expect(page).toHaveURL(at(path))
    expect(await page.evaluate(() => scrollY), 'the page where it was').toBe(y)
    const next = page.locator(`section.strip li a[data-i="${(i + 1) % n}"]:visible`)
    await expect((await next.count()) ? next : thumb).toBeFocused()
    await page.goBack()
    expect(new URL(page.url()).pathname).toBe('/')
    expect(errors).toEqual([])
  })

  // A button with no arrow, there only when the strip doesn't show every photo (the Design Lead, 18 Nov).
  test(`${what} album: "Xem tất cả" opens its first photo over the page, and Back closes it there`, async ({ page, request, errors }) => {
    // Found by the album, not by the button: past a wrapped strip's 8 (a plant's, a breed's), or 40 or more for a
    // fish's column, more than a tall screen's column shows: every screen has it.
    const found = await albumPage(request, section, (a, html) => (/class="strip wrap/.test(html) ? a.photos.length > 8 : a.photos.length >= 40))
    test.skip(!found, `no ${what} album past its strip in this build`)
    const { path, album } = found!
    await page.goto(path)
    await page.waitForLoadState()
    const all = page.locator('section.strip [data-all]:visible') // a fish page's row on a phone has its own
    await expect(all).toHaveRole('button')
    await expect(all).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(all).toHaveText(`Xem tất cả ${album.photos.length} ảnh`)
    await all.click()
    const viewer = page.locator('dialog.lb')
    await expect(viewer.getByRole('status')).toHaveText(`1/${album.photos.length}`)
    await expect(page).toHaveURL(at(path, '#a1'))
    await page.goBack()
    await expect(viewer).toBeHidden()
    await expect(page).toHaveURL(at(path))
    await expect(page.locator('section.strip')).toBeVisible()
    expect(errors).toEqual([])
  })

  // Each thumbnail keeps its share of the strip when its photo doesn't load: its alt text, a caption or the page's name,
  // shows in its place, and on 13 November a long word in it (the Malay Bucephalandra page's, checked live with no photo
  // loaded) widened the strip's columns past a phone's edge. That page's word stands in for the build's own captions,
  // which are shorter: any caption or name can be.
  test(`${what} page: the photo strip fits the screen when its photos don't load`, async ({ page, request }) => {
    const found = await albumPage(request, section)
    test.skip(!found, `no ${what} album in this build`)
    await page.goto(found!.path)
    await expect(page.locator('section.strip img').first()).toBeAttached()
    await page.locator('section.strip img').evaluateAll(imgs => imgs.forEach(i => { (i as HTMLImageElement).alt = 'Bucephalandra' }))
    await photosMissing(page)
    expect(await sideways(page), 'sideways scroll').toBeNull()
  })
}

// The photos' chip stays at the row's end, in sight while the others scroll beside it, and opens the album over the page.
test('a fish\'s jump row ends with the photos and their count, in sight, and opens the album', async ({ page, request, errors }, info) => {
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 6 && /<nav[^>]*class="[^"]*\bjump\b/.test(html))
  test.skip(!found, 'no fish with a jump row and an album in this build')
  const { path, album } = found!
  await page.goto(path)
  await page.waitForLoadState()
  const row = page.locator('nav.jump')
  expect(await row.locator('a').count(), 'chips').toBeLessThanOrEqual(5)
  const chip = row.locator('a').last()
  await expect(chip).toHaveAttribute('href', '#a1')
  await expect(chip).toHaveText(`Ảnh ${album.photos.length}`)
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
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`1/${album.photos.length}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(at(path))
  expect(errors).toEqual([])
})

test('a fish with no album has no photos chip: its photo is right above the row', async ({ page, errors }) => {
  let found = false
  for (const fish of sourcePages().filter(p => /^\/ca\/[^/]+\/$/.test(p)).slice(0, 30)) {
    await page.goto(fish)
    if (!(await page.locator('[data-album]').count()) && await page.locator('nav.jump').count() && await page.locator('header.top .photo').count()) { found = true; break }
  }
  test.skip(!found, 'no fish with a photo, a jump row and no album in this build')
  const row = page.locator('nav.jump')
  // No photo's address (#a1, #a2…), no old album section or page.
  const hrefs = await row.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href') ?? ''))
  expect(hrefs.filter(h => /^#a\d+$|^#anh$|\/anh\/$/.test(h))).toEqual([])
  await expect(page.locator('#anh img')).toBeVisible()
  // The row's lower rule is the text's first: no second line right under it.
  await expect(page.locator('nav.jump ~ .body > :first-child')).toHaveCSS('border-top-width', '0px')
  expect(errors).toEqual([])
})

// A slow phone: a thumb tapped before the album's script has run goes to the photo's address on the page, not to the bare
// photo, and the photo opens there once the script runs. Its entry is the viewer's: Back closes it, the next Back leaves.
test('album: a thumb tapped while the album\'s script loads opens its photo over the page once it runs', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const { path, album } = found!
  let release = () => {}
  const held = new Promise<void>(r => { release = r })
  await page.route(/\/_astro\/GalleryStrip\.astro_astro_type_script[^/]*\.js$/, async route => { await held; await route.continue() })
  await page.goto('/')
  await page.goto(path, { waitUntil: 'commit' })
  await page.locator('footer.foot').waitFor({ state: 'attached' }) // the page's HTML read; the album's script held back
  const thumb = page.locator('section.strip li a[data-i]:visible').first()
  const i = Number(await thumb.getAttribute('data-i'))
  await thumb.click()
  await expect(page).toHaveURL(at(path, `#a${i + 1}`))
  release()
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`${i + 1}/${album.photos.length}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(at(path))
  await page.goBack()
  expect(new URL(page.url()).pathname).toBe('/')
  expect(errors).toEqual([])
})

// Two thumbs tapped before the album's script has run: the second photo opens once it runs, on one entry: one Back
// closes it, the next leaves.
test('album: two thumbs tapped while the album\'s script loads open the second, and one Back closes it', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const { path, album } = found!
  let release = () => {}
  const held = new Promise<void>(r => { release = r })
  await page.route(/\/_astro\/GalleryStrip\.astro_astro_type_script[^/]*\.js$/, async route => { await held; await route.continue() })
  await page.goto('/')
  await page.goto(path, { waitUntil: 'commit' })
  await page.locator('footer.foot').waitFor({ state: 'attached' })
  const thumbs = page.locator('section.strip li a[data-i]:visible')
  const [a, b] = [thumbs.nth(0), thumbs.nth(1)]
  const j = Number(await b.getAttribute('data-i'))
  const entries = await page.evaluate(() => history.length)
  await a.click()
  await b.click()
  await expect(page).toHaveURL(at(path, `#a${j + 1}`))
  // One entry for both taps. Chrome skips a second such entry on Back, so the count is what shows it.
  expect(await page.evaluate(() => history.length)).toBe(entries + 1)
  release()
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`${j + 1}/${album.photos.length}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(at(path))
  await page.goBack()
  expect(new URL(page.url()).pathname).toBe('/')
  expect(errors).toEqual([])
})

// Back pressed while the viewer's code is still on its way: nothing opens once it arrives, and the page stays as it was.
test('album: Back pressed while the viewer loads opens nothing once it arrives', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const { path } = found!
  let release = () => {}, asked = () => {}
  const held = new Promise<void>(r => { release = r })
  const requested = new Promise<void>(r => { asked = r })
  await page.route(/\/_astro\/photo-viewer\.[^/]*\.js$/, async route => { asked(); await held; await route.continue() })
  await page.goto('/')
  await page.goto(path)
  await page.waitForLoadState()
  await page.evaluate(() => { location.hash = 'a3' })
  await requested // the viewer's code asked for, and held
  await page.goBack()
  await expect(page).toHaveURL(at(path))
  const arrived = page.waitForResponse(/\/_astro\/photo-viewer\.[^/]*\.js$/)
  release()
  await arrived
  await page.waitForTimeout(300) // the open it had queued, had it run
  await expect(page.locator('dialog.lb')).toHaveCount(0)
  await expect(page).toHaveURL(at(path))
  await page.goBack()
  expect(new URL(page.url()).pathname).toBe('/')
  expect(errors).toEqual([])
})

// A photo's address typed into the address bar on the page: the photo opens on that entry, Back closes it on the page,
// and the next Back leaves (no second copy of the page in the history).
test('album: a photo\'s address typed on the page opens it there; Back closes it, the next Back leaves', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const { path, album } = found!
  await page.goto('/')
  await page.goto(path)
  await page.waitForLoadState()
  await page.evaluate(() => { location.hash = 'a3' })
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`3/${album.photos.length}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(at(path))
  await page.goBack()
  expect(new URL(page.url()).pathname).toBe('/')
  expect(errors).toEqual([])
})

// On a tall computer screen the photo column clips the strip's rows past its last whole one: closed on a photo whose
// thumb is clipped, focus goes back to the thumb tapped, not to the hidden one.
test('album, a tall computer screen: closed on a photo the column clips, focus goes back to the thumb tapped', async ({ page, request, errors, isMobile }) => {
  test.skip(isMobile, 'the column clips its rows on a tall computer screen')
  await page.setViewportSize({ width: 1280, height: 1000 })
  const found = await albumPage(request, 'ca', a => a.photos.length >= 20) // rows past the column's
  test.skip(!found, 'no fish album in this build')
  const { path, album } = found!
  await page.goto(path)
  await page.waitForLoadState()
  const clipped = await page.evaluate(() => {
    const ul = document.querySelector('section.strip ul')!.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>('section.strip li a[data-i]')]
      .filter(a => { const r = a.getBoundingClientRect(); return a.checkVisibility() && r.height > 0 && (r.bottom > ul.bottom + 1 || r.top < ul.top - 1) })
      .map(a => Number(a.dataset.i))
  })
  test.skip(!clipped.length, 'no thumb the column clips in this build')
  const thumb = page.locator('section.strip li a[data-i]:visible').first()
  const i = Number(await thumb.getAttribute('data-i'))
  const k = clipped.find(c => c > i)!
  await thumb.click()
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`${i + 1}/${album.photos.length}`)
  for (let s = i; s < k; s++) await page.keyboard.press('ArrowRight')
  await expect(viewer.getByRole('status')).toHaveText(`${k + 1}/${album.photos.length}`)
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(thumb).toBeFocused()
  expect(errors).toEqual([])
})

// A strip that shows every photo has no "Xem tất cả"; a phone's wrapped strip shows 6 of its thumbs, so one of 7 or 8
// keeps it there alone (the Design Lead, 18 Nov).
test('album: "Xem tất cả" only where the strip doesn\'t show every photo', async ({ page, request, errors }, info) => {
  // Found by its thumbs, not by the button: a wrapped strip (a breed's, or a fish's with no photo) of 7 or 8, whole.
  const found = await albumPage(request, 'ca', (a, html) => {
    const strip = /<section class="strip wrap"[\s\S]*?<\/ul>/.exec(html)?.[0] ?? ''
    const n = strip.match(/<li\b/g)?.length ?? 0
    return n >= 7 && n === a.photos.length
  })
  test.skip(!found, 'no wrapped strip of 7 or 8 photos, all of its album, in this build')
  await page.goto(found!.path)
  const seen = page.locator('section.strip li a[data-i]:visible')
  const all = page.locator('section.strip [data-all]:visible')
  if (info.project.name === 'phone') {
    await expect(seen).toHaveCount(6)
    await expect(all).toHaveText(`Xem tất cả ${found!.album.photos.length} ảnh`)
  } else {
    await expect(seen).toHaveCount(await page.locator('section.strip li a[data-i]').count())
    await expect(all).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

// Closed on a photo whose thumb the phone's row has scrolled out of sight: the row brings it back, focused, and the page
// stays where it was (the Design Lead, 18 Nov).
test('album, a phone: closed on a photo whose thumb is past the row\'s edge, the row scrolls it into view, focused', async ({ page, request, errors, isMobile }) => {
  test.skip(!isMobile, 'the photo column is a sideways row on a phone')
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 6 && /class="strip column/.test(html))
  test.skip(!found, 'no fish page with a photo row in this build')
  const { path } = found!
  await page.goto(path)
  await page.waitForLoadState()
  const row = page.locator('section.strip.column ul')
  await row.scrollIntoViewIfNeeded()
  const past = await row.evaluate(ul => {
    const v = ul.getBoundingClientRect()
    const a = [...ul.querySelectorAll<HTMLElement>('li a[data-i]')].find(a => a.getBoundingClientRect().left > v.right + 1)
    return a ? Number(a.dataset.i) : null
  })
  test.skip(past === null, 'every thumb fits the row')
  const first = row.locator('li a[data-i]').first()
  const from = Number(await first.getAttribute('data-i'))
  const y = await page.evaluate(() => scrollY)
  await first.tap()
  const viewer = page.locator('dialog.lb')
  await expect(viewer).toBeVisible()
  for (let k = from; k < past!; k++) await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(at(path, `#a${past! + 1}`))
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  const back = row.locator(`li a[data-i="${past}"]`)
  await expect(back).toBeFocused()
  const [r, v] = await back.evaluate(a => [a.getBoundingClientRect().toJSON(), a.closest('ul')!.getBoundingClientRect().toJSON()] as DOMRect[])
  expect(r!.left, 'the thumb within the row').toBeGreaterThanOrEqual(v!.left - 1)
  expect(r!.right, 'the thumb within the row').toBeLessThanOrEqual(v!.right + 1)
  expect(await page.evaluate(() => scrollY), 'the page where it was').toBe(y)
  expect(errors).toEqual([])
})

// Opened from the jump row's chip with the strip scrolled off the screen above, and closed on a photo whose thumb is
// past the row's edge: the page stays where it was, and focus goes back to the chip, not to a thumb off the screen.
test('album, a phone: closed with the strip off the screen, the page stays, focus on the chip that opened it', async ({ page, request, errors, isMobile }) => {
  test.skip(!isMobile, 'the photo column is a sideways row on a phone')
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 6 && /class="strip column/.test(html) && /<nav[^>]*class="[^"]*\bjump\b/.test(html))
  test.skip(!found, 'no fish page with a photo row and a jump row in this build')
  const { path } = found!
  await page.goto(path)
  await page.waitForLoadState()
  const row = page.locator('section.strip.column ul')
  const past = await row.evaluate(ul => {
    const v = ul.getBoundingClientRect()
    const a = [...ul.querySelectorAll<HTMLElement>('li a[data-i]')].find(a => a.getBoundingClientRect().left > v.right + 1)
    return a ? Number(a.dataset.i) : null
  })
  test.skip(past === null, 'every thumb fits the row')
  await page.evaluate(() => scrollTo({ top: scrollY + document.querySelector('section.strip ul')!.getBoundingClientRect().bottom + 300, behavior: 'instant' }))
  const chip = page.locator('nav.jump a[href="#a1"]')
  test.skip(!(await chip.isVisible()) || (await row.boundingBox())!.y + (await row.boundingBox())!.height > 0, 'the jump row out of sight, or the strip still on the screen')
  await expect(chip).toBeInViewport()
  const y = await page.evaluate(() => scrollY)
  // A finger on the chip where it is: a locator's tap scrolls a sticky chip "into view" first, back up to its place in
  // the page.
  const box = (await chip.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(/^1\//)
  for (let k = 0; k < past!; k++) await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(at(path, `#a${past! + 1}`))
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(chip).toBeFocused()
  expect(await page.evaluate(() => scrollY), 'the page where it was').toBe(y)
  expect(errors).toEqual([])
})

// The row partly on the screen, at its foot: closed on the thumb beside the one tapped, that thumb takes focus where it
// is, and the page stays where it was (Codex's read, 18 Nov).
test('album, a phone: the row partly on the screen, closed on the thumb beside the one tapped, focus there, the page still', async ({ page, request, errors, isMobile }) => {
  test.skip(!isMobile, 'the photo column is a sideways row on a phone')
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 6 && /class="strip column/.test(html))
  test.skip(!found, 'no fish page with a photo row in this build')
  await page.goto(found!.path)
  await page.waitForLoadState()
  const row = page.locator('section.strip.column ul')
  // Two thumbs side by side, both in the row's view, the second the next photo.
  const k = await row.evaluate(ul => {
    const v = ul.getBoundingClientRect(), on = (a: Element) => a.getBoundingClientRect().right <= v.right + 1
    const as = [...ul.querySelectorAll<HTMLElement>('li a[data-i]')]
    return as.find((a, j) => on(a) && as[j + 1] && on(as[j + 1]!) && Number(as[j + 1]!.dataset.i) === Number(a.dataset.i) + 1)?.dataset.i
  })
  test.skip(k === undefined, 'no two thumbs of photos side by side in the row')
  // The row's top 30 px above the screen's foot.
  await page.evaluate(() => scrollTo({ top: scrollY + document.querySelector('section.strip.column ul')!.getBoundingClientRect().top - innerHeight + 30, behavior: 'instant' }))
  const [tapped, next] = [row.locator(`a[data-i="${k}"]`), row.locator(`a[data-i="${Number(k) + 1}"]`)]
  const [box, high] = [(await tapped.boundingBox())!, await page.evaluate(() => innerHeight)]
  test.skip(box.y < high - 31 || box.y > high - 29, 'the page too short to put the row there')
  const y = await page.evaluate(() => scrollY)
  await page.touchscreen.tap(box.x + box.width / 2, high - 15)
  const viewer = page.locator('dialog.lb')
  await expect(page).toHaveURL(at(found!.path, `#a${Number(k) + 1}`))
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(at(found!.path, `#a${Number(k) + 2}`))
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(next).toBeFocused()
  expect(await page.evaluate(() => scrollY), 'the page where it was').toBe(y)
  expect(errors).toEqual([])
})

// "Xem tất cả" tapped while the album's script loads, then Back, then the jump row's chip: the chip opened the viewer,
// so focus doesn't go back to the button (Codex's read, 18 Nov).
test('album: an early tap, Back, then the chip: closing gives focus to no stale button', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 40 && /<nav[^>]*class="[^"]*\bjump\b/.test(html))
  test.skip(!found, 'no fish album of 40 photos or more with a jump row in this build')
  const { path, album } = found!
  let release = () => {}
  const held = new Promise<void>(r => { release = r })
  await page.route(/\/_astro\/GalleryStrip\.astro_astro_type_script[^/]*\.js$/, async route => { await held; await route.continue() })
  await page.goto(path, { waitUntil: 'commit' })
  await page.locator('footer.foot').waitFor({ state: 'attached' }) // the page's HTML read; the album's script held back
  const all = page.locator('section.strip [data-all]:visible')
  await all.click()
  await expect(page).toHaveURL(at(path, '#a1'))
  await page.evaluate(() => history.back())
  await expect(page).toHaveURL(at(path))
  await page.locator('nav.jump a[href="#a1"]').click()
  await expect(page).toHaveURL(at(path, '#a1'))
  release()
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`1/${album.photos.length}`)
  await page.keyboard.press('ArrowLeft') // round to the last photo, past every thumb
  await expect(viewer.getByRole('status')).toHaveText(`${album.photos.length}/${album.photos.length}`)
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(all).not.toBeFocused()
  expect(errors).toEqual([])
})

// "Xem tất cả" tapped before the album's script has run, closed on a photo with no thumb: focus goes back to it, as
// after a tap once the script runs.
test('album: "Xem tất cả" tapped while the album\'s script loads, closed on a photo with no thumb, focus goes back to it', async ({ page, request, errors }) => {
  const found = await albumPage(request, 'ca', a => a.photos.length >= 40)
  test.skip(!found, 'no fish album of 40 photos or more in this build')
  const { path, album } = found!
  let release = () => {}
  const held = new Promise<void>(r => { release = r })
  await page.route(/\/_astro\/GalleryStrip\.astro_astro_type_script[^/]*\.js$/, async route => { await held; await route.continue() })
  await page.goto(path, { waitUntil: 'commit' })
  await page.locator('footer.foot').waitFor({ state: 'attached' }) // the page's HTML read; the album's script held back
  const all = page.locator('section.strip [data-all]:visible')
  await all.click()
  // Safari on an iPhone gives a tapped button no focus, so the viewer's dialog has none to give back: as there.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(page).toHaveURL(at(path, '#a1'))
  release()
  const viewer = page.locator('dialog.lb')
  await expect(viewer.getByRole('status')).toHaveText(`1/${album.photos.length}`)
  await page.keyboard.press('ArrowLeft') // round to the last photo, past every thumb
  await expect(viewer.getByRole('status')).toHaveText(`${album.photos.length}/${album.photos.length}`)
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(all).toBeFocused()
  expect(errors).toEqual([])
})

// On a tall computer screen the photo column shows as many whole rows of thumbs as fit: when they are the whole album,
// "Xem tất cả" goes there too; one photo more and it's back. The page's album cut to size in the browser.
test('album, a tall computer screen: "Xem tất cả" goes when the column shows every photo', async ({ page, request, errors, isMobile }) => {
  test.skip(isMobile, 'the column shows more than the strip\'s own on a tall computer screen')
  const found = await albumPage(request, 'ca', (a, html) => a.photos.length >= 12 && /<li class="more"/.test(html))
  test.skip(!found, 'no fish page with more thumbs for the column in this build')
  const { path, html } = found!
  const cut = (n: number) => html.replace(/(<section[^>]*data-album[\s\S]*?<script type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, a, j, b) => {
    const album = JSON.parse(j) as { photos: unknown[] }
    return a + JSON.stringify({ ...album, photos: album.photos.slice(0, n) }).replace(/</g, '\\u003c') + b
  })
  // The facts beside the column run on past the screen, as on most live pages (the build's are short), so the column
  // has the screen's height to fill.
  const long = '<style>header.top > .facts { min-height: 150vh }</style>'
  let n = Infinity
  await page.route(u => u.pathname === path, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: cut(n).replace('</head>', `${long}</head>`) }))
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(path)
  await page.waitForLoadState()
  // The last photo the column shows whole; the ones before it are thumbs or on the page already.
  const last = await page.locator('section.strip ul').evaluate(ul => {
    const v = ul.getBoundingClientRect()
    return Math.max(...[...ul.querySelectorAll<HTMLElement>('a[data-i]')].filter(a => { const r = a.getBoundingClientRect(); return a.checkVisibility() && r.height > 0 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1 }).map(a => Number(a.dataset.i)))
  })
  test.skip(last < 8, 'the column shows no more than the strip\'s own here')
  const all = page.locator('section.strip .head [data-all]')
  await expect(all, 'the whole album').toBeVisible()
  for (const [size, there] of [[last + 1, false], [last + 2, true]] as const) {
    n = size
    await page.reload()
    await page.waitForLoadState()
    if (there) await expect(all, `an album of ${size}`).toBeVisible()
    else await expect(all, `an album of ${size}`).toBeHidden()
  }
  expect(errors).toEqual([])
})

// On a phone the Back button closes the photo, not the page; the photo follows a swipe to the next one; a photo's own
// address (#a3, a shared photo's) opens it over the page.
test('album viewer: #a3 opens photo 3, a swipe goes to the next, Back closes it and stays on the page', async ({ page, request, errors }, info) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const { path, album } = found!
  const n = album.photos.length
  await page.goto(`${path}#a3`)
  const viewer = page.locator('dialog.lb')
  await expect(viewer).toBeVisible()
  const by = viewer.locator('.by')
  await expect(by).toHaveText(new RegExp(`· 3/${n}$`)) // the credit line ends with the number
  await expect(viewer.getByRole('status')).toHaveText(`3/${n}`)
  // The photos follow the finger until it lifts.
  const stage = viewer.locator('.pv-stage')
  const width = (await stage.boundingBox())!.width
  // Chrome hands a finger's moves to the page with the next frame, so the last one can land just after it is sent.
  await swipe(page, stage, -0.6, info.project.name === 'phone', async () => {
    const x = () => viewer.locator('.pv-track').evaluate(t => new DOMMatrix(getComputedStyle(t).transform).m41)
    await expect.poll(x).toBeCloseTo(-0.6 * width, -1)
  })
  await expect(viewer.getByRole('status')).toHaveText(`4/${n}`)
  await expect(page).toHaveURL(at(path, '#a4'))
  await swipe(page, stage, 0.6, info.project.name === 'phone')
  await expect(viewer.getByRole('status')).toHaveText(`3/${n}`)
  await page.goBack()
  await expect(viewer).toBeHidden()
  await expect(page).toHaveURL(at(path))
  await expect(page.locator('section.strip')).toBeVisible()
  expect(errors).toEqual([])
})

// Zoomed in (a pinch or a double tap on a phone, the wheel or a double click on a computer), a drag pans the photo
// instead of going to the next one; a double tap or click zooms back out, and the swipe works again.
test('album viewer: a zoomed photo pans rather than swiping; a double tap zooms back out', async ({ page, request, errors }, info) => {
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  const touch = info.project.name === 'phone'
  // The album's widest photo: zoomed on a computer's wide screen, a tall one can stay narrower than the screen, with
  // nothing to pan sideways (the first fish gallery's first photo was one on 14 Nov).
  const { path, album } = found!
  const shapes = album.photos.map(p => p.w / p.h)
  const n = shapes.length
  const k = shapes.indexOf(Math.max(...shapes)) + 1
  await page.goto(`${path}#a${k}`)
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
test('album viewer: one click zooms in with a mouse, the next zooms out; a double click zooms in', async ({ page, request, errors }, info) => {
  test.skip(info.project.name === 'phone', 'a finger zooms with a double tap or a pinch')
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album in this build')
  await page.goto(`${found!.path}#a1`)
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

// Live only (the Worker forwards; the local server is files alone): an album's old address, as Google and old links keep
// it, lands on its page, and the browser keeps the photo's #aN across the forward, which opens it there.
test('an album\'s old address forwards to its page, and its #a2 opens photo 2 there', async ({ page, request, errors }) => {
  test.skip(!LIVE, 'the Worker forwards it: live only')
  const found = await albumPage(request, 'ca')
  test.skip(!found, 'no fish album on the site')
  const { path, album } = found!
  await page.goto(`${path}anh/#a2`)
  await expect(page).toHaveURL(at(path, '#a2'))
  await expect(page.locator('dialog.lb').getByRole('status')).toHaveText(`2/${album.photos.length}`)
  expect(errors).toEqual([])
})
