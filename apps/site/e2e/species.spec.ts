import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { sourcePages } from './pages'

// A species' numbers agree wherever the page shows them (resolveDataCard in @aq/schema): here the data card's temperature
// and the "Nuôi ở Việt Nam" note's maximum. Cá neon vua's sources disagree on its range, which is when they used to differ.
test('species page: the Vietnam note uses the data card\'s temperature', async ({ page }) => {
  await page.goto('/ca/ca-neon-vua/')
  const card = await page.locator('.card [data-field="tempC"] .v').getAttribute('data-c')
  const max = card!.split(',')[1]
  const summer = page.locator('.vn li').filter({ hasText: 'Mùa hè' }).locator('[data-c]').last()
  await expect(summer).toHaveAttribute('data-c', `${max},${max}`)
})

// Answer first: on a phone the name and the four facts a reader decides by (temperature, pH, smallest tank, difficulty)
// are on the first screen, above the photo. They used to start at 615 px and 759 px of 839, under the header and photo.
test('species page on a phone: the name and the four key facts are on the first screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.goto('/ca/ca-neon-vua/')
  const onFirstScreen = (sel: string) => page.locator(sel).evaluateAll((els, h) => els.some(e => {
    const r = e.getBoundingClientRect()
    return r.height > 0 && r.top >= 0 && r.bottom <= h
  }), page.viewportSize()!.height)
  expect(await onFirstScreen('h1'), 'name').toBe(true)
  for (const f of ['tempC', 'ph', 'tankCm', 'difficulty']) expect(await onFirstScreen(`main [data-field="${f}"]`), f).toBe(true)
})

// The strip's four facts never run into each other, also on a small phone in °F (73,4–80,6°F is the widest value).
test('species page on a small phone in °F: each key fact stays in its own column', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.setViewportSize({ width: 360, height: 780 })
  await page.addInitScript(() => localStorage.setItem('units', 'imperial'))
  for (const path of ['/ca/ca-neon-vua/', '/ca/ca-dia/']) {
    await page.goto(path)
    await expect(page.locator('.keyfacts [data-field="tempC"] dd')).toContainText('°F')
    const spill = await page.locator('.keyfacts > div').evaluateAll(cells => cells.flatMap(c => {
      const box = c.getBoundingClientRect(), dd = c.querySelector('dd')!
      return dd.scrollWidth > dd.clientWidth + 1 || [...dd.querySelectorAll('*')].some(e => e.getBoundingClientRect().right > box.right + 1) ? [c.getAttribute('data-field')] : []
    }))
    expect(spill, `${path}: facts wider than their column`).toEqual([])
  }
})

// A long species page: a sticky row of its main parts. A tap brings that part into view (not under the row) and marks its
// chip; on a phone the row scrolls sideways so the marked chip stays in sight. Read from the page, not from the content,
// so it holds on aquatome.com too (production watch).
test('species page: the jump row takes the reader to a part and marks where they are', async ({ page }, info) => {
  await page.goto('/ca/ca-neon-vua/')
  const row = page.locator('nav.jump')
  const chips = row.locator('a')
  expect(await chips.count(), 'parts to jump to').toBeGreaterThanOrEqual(2)
  for (const h of await chips.evaluateAll(as => as.map(a => a.getBoundingClientRect().height))) expect(h, 'chip height').toBeGreaterThanOrEqual(44)
  const below = async (target: string) => (await page.locator(target).boundingBox())!.y - ((await row.boundingBox())!.y + (await row.boundingBox())!.height)

  const chip = chips.nth(1)
  const href = (await chip.getAttribute('href'))!
  if (info.project.name === 'phone') await chip.tap(); else await chip.click()
  await expect(page.locator(href)).toBeInViewport()
  await expect(chip).toHaveAttribute('aria-current', 'true')
  await expect(row.locator('a[aria-current]')).toHaveCount(1)
  await expect(row).toBeInViewport()
  await expect.poll(() => below(href), { message: 'the part starts below the row' }).toBeGreaterThanOrEqual(0)

  if (info.project.name !== 'phone') return
  const last = chips.last()
  await page.locator((await last.getAttribute('href'))!).evaluate(el => el.scrollIntoView()) // as a reader scrolls: the part up to the top
  await expect(last).toHaveAttribute('aria-current', 'true')
  await expect.poll(async () => {
    const [r, c] = [(await row.boundingBox())!, (await last.boundingBox())!]
    return c.x >= r.x && c.x + c.width <= r.x + r.width
  }, { message: 'the marked chip is in sight in the row' }).toBe(true)
})

// One "Nguồn và độ tin cậy" toggle per data card (it used to be one per value, 17 px tall); only the values the sources
// disagree on are marked, and the toggle shows each source's own figure for them. Cá neon vua's sources disagree (see the
// first check), on the fixture and on aquatome.com.
test('species data card: one sources toggle, the disagreeing values marked, each source\'s figure inside', async ({ page }, info) => {
  await page.goto('/ca/ca-neon-vua/')
  const card = page.locator('.facts .datacard')
  // The sources toggle; the difficulty cell's "Vì sao?" is its own (card-guide.spec.ts).
  const summary = card.locator('.trust > summary')
  await expect(summary).toHaveCount(1)
  expect((await summary.boundingBox())!.height, 'toggle height').toBeGreaterThanOrEqual(44)
  const marked = card.locator('.card [data-conflict]')
  const n = await marked.count()
  expect(n, 'values the sources disagree on').toBeGreaterThanOrEqual(1)
  await expect(card.locator('.card .mark')).toHaveCount(n)
  const field = (await marked.first().getAttribute('data-field'))!
  const by = card.locator(`.trust [data-src-field="${field}"]`)
  await expect(by).toBeHidden()
  const press = () => (info.project.name === 'phone' ? summary.tap() : summary.click())
  await press()
  await expect(by).toBeVisible()
  await expect(by.locator('p')).toHaveText(/^(Mức mọi nguồn cùng khuyên|Mỗi nguồn ghi một mức)$/)
  const items = by.locator('li')
  expect(await items.count(), 'one line per source').toBeGreaterThanOrEqual(2)
  for (const li of await items.all()) {
    await expect(li).toHaveText(/^\S.*: \S/) // "<source>: <its figure>"
    if (['tempC', 'sizeCm', 'tankCm'].includes(field)) await expect(li.locator('[data-c], [data-cm]')).toHaveCount(1) // °F / inch toggle
  }
  await press()
  await expect(by).toBeHidden()
})

// The data card is the page's one copy of each figure (design critique 2026-10-31: Cá neon vua's text said 5 cm,
// "Trung bình", pH 3,5–7,5 where its card said 3,5 cm, Dễ, pH 4,6–6,2). A block that states a figure the card resolved
// otherwise says, above itself, which source it follows and what the card shows; quick facts don't restate the card.
// Read from the page (the card, the source list), so it holds on aquatome.com too.
test('species page: a section\'s figure that differs from the card names its source and the card\'s figure', async ({ page }) => {
  await page.goto('/ca/ca-neon-vua/')
  const sources = await page.locator('#nguon li a').allTextContents()
  const notes = page.locator('.body p.off')
  expect(await notes.count(), 'blocks that follow another source than the card').toBeGreaterThanOrEqual(1)
  // A figure as the page holds it: its °C / cm pair (what the units toggle converts), else its text.
  const figure = (el: import('@playwright/test').Locator) => el.evaluate(e => {
    const x = e.matches('[data-c], [data-cm]') ? e : e.querySelector('[data-c], [data-cm]')
    return x ? (x.getAttribute('data-c') ?? x.getAttribute('data-cm'))! : e.textContent!.replace(/\s*dGH$/, '').trim()
  })
  for (const note of await notes.all()) {
    const text = (await note.textContent())!.trim()
    expect(sources.some(s => text.startsWith(`${s} ghi khác bảng dữ liệu:`)), text).toBe(true)
    const source = await note.getAttribute('data-source')
    await expect(note.locator('xpath=following-sibling::*[1]')).toHaveAttribute('data-source', source!) // the block it is about
    for (const off of await note.locator('[data-off]').all()) {
      const field = (await off.getAttribute('data-off'))!
      const card = await figure(page.locator(`.facts .card [data-field="${field}"] .v`))
      expect(await figure(off.locator('.ours')), `${field}: the card's own figure`).toBe(card)
      expect(await figure(off.locator('.theirs')), `${field}: the source's differs`).not.toBe(card)
    }
  }
  // Quick facts never name the family, which the header shows. (A card figure's item stays when it says more than the
  // figure, or when its source gave the card none, so those can't be ruled out from the page alone.)
  const facts = await page.locator('section[data-section="quickFacts"] li').allTextContents()
  expect(facts.filter(f => /^\s*Họ\s*:/.test(f))).toEqual([])
})

// "Tránh" used to list giants matched by size alone (an arowana "eats" a neon tetra no one keeps it with). Each chip now
// says why, and a size reason gives the other fish's size, which is of this one's size class (at most 5× apart).
test('species page: each "Tránh" chip says why; a size reason gives a size of this fish\'s class', async ({ page }) => {
  for (const path of ['/ca/ca-neon-vua/', '/ca/tep-red-cherry/']) {
    await page.goto(path)
    const chips = page.locator('.mates .avoid li')
    if (await chips.count() === 0) continue
    const name = (await page.locator('h1').textContent())!.trim()
    const own = await page.locator('.facts .card [data-field="sizeCm"] .v').evaluateAll(v => Number(v[0]?.getAttribute('data-cm')?.split(',')[1] ?? 0))
    for (const chip of await chips.all()) {
      const why = chip.locator('.why')
      const reason = await why.getAttribute('data-reason')
      expect(reason, `${path}: a reason`).toMatch(/^(eatsIt|eatenByIt|predator|aggressive|semiAggressive|finNipper)$/)
      if (['eatsIt', 'eatenByIt', 'semiAggressive'].includes(reason!)) await expect(why).toContainText(name)
      if (reason === 'eatsIt' || reason === 'eatenByIt') {
        const size = Number((await why.locator('[data-cm]').getAttribute('data-cm'))!.split(',')[0])
        if (own) expect(Math.max(size, own) / Math.min(size, own), `${path}: ${size} cm beside ${own} cm`).toBeLessThanOrEqual(5)
      }
    }
  }
})

/** A species page with its photo and its gallery's thumbnails (a breed's top has no `.facts`), from the build or the sitemap. */
async function speciesWithGallery(page: Page) {
  for (const gallery of sourcePages().filter(p => /^\/ca\/[^/]+\/anh\/$/.test(p))) {
    await page.goto(gallery.replace(/anh\/$/, ''))
    if (await page.locator('header.top > .facts').count() && await page.locator('header.top .photo').count() && await page.locator('main section.strip').count()) return true
  }
  return false
}

// On a computer the photo column used to end under the photo while the facts beside it ran on, a screen and more (the
// owner's screenshot of Cá neon vua), with the thumbnails below both. They now fill the column under the photo; on a phone
// they come after the facts. One strip either way, each thumbnail once. Read from the page, so it holds on aquatome.com.
test('species page: the gallery\'s thumbnails sit under the photo beside the facts on a computer, after the facts on a phone, once', async ({ page, errors }, info) => {
  test.skip(!(await speciesWithGallery(page)), 'no species page with a gallery strip')
  const strip = page.locator('main section.strip')
  await expect(strip).toHaveCount(1)
  await expect(strip.locator('h2')).toHaveText(`Ảnh ${(await page.locator('h1').textContent())!.trim()}`)
  const srcs = await strip.locator('li img').evaluateAll(is => is.map(i => i.getAttribute('src')!))
  expect(srcs.length, 'thumbnails').toBeGreaterThan(0)
  expect(srcs.length, 'thumbnails').toBeLessThanOrEqual(8)
  const more = await strip.locator('.head a').count() ? Number(/\d+/.exec((await strip.locator('.head a').textContent())!)![0]) : srcs.length
  expect(more, '"Xem tất cả N ảnh"').toBeGreaterThanOrEqual(srcs.length)
  const onPage = await page.locator('main img').evaluateAll(is => is.map(i => i.getAttribute('src')))
  for (const src of srcs) expect(onPage.filter(s => s === src), `${src} on the page`).toHaveLength(1)

  const [photo, facts, box] = [(await page.locator('header.top .photo').boundingBox())!, (await page.locator('header.top > .facts').boundingBox())!, (await strip.boundingBox())!]
  if (info.project.name === 'phone') {
    expect(box.y, 'below the facts').toBeGreaterThanOrEqual(facts.y + facts.height)
  } else {
    expect(Math.abs(box.x - photo.x), 'in the photo column').toBeLessThanOrEqual(1)
    expect(box.x + box.width, 'left of the facts').toBeLessThanOrEqual(facts.x)
    expect(box.y, 'under the photo').toBeGreaterThanOrEqual(photo.y + photo.height)
  }
  expect(errors).toEqual([])
})

// On a phone the page is one column, and the thumbnails' heading and "see all" link sit in it. Indonesian's pair ("Foto
// Labidochromis caeruleus", "Lihat semua 15 foto →") couldn't get narrower than the column, so the column grew past the
// screen and took the photo's credit with it (aquatome.com/id/ikan/yellow-lab/, 418 px on a 412 px phone). The link now
// wraps under the heading, and nothing in the column can widen it.
test('species page on a phone: a long thumbnails heading and link wrap instead of widening the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  test.skip(!(await speciesWithGallery(page)), 'no species page with a gallery strip')
  await page.setViewportSize({ width: 360, height: 800 })
  const head = page.locator('main section.strip .head')
  await head.locator('h2').evaluate(h => { h.textContent = 'Foto Labidochromis caeruleus' })
  if (await head.locator('a').count()) await head.locator('a').evaluate(a => { a.textContent = 'Lihat semua 15 foto →' })
  else await head.evaluate(h => h.insertAdjacentHTML('beforeend', '<a href="#">Lihat semua 15 foto →</a>'))
  const [column, room] = await page.locator('header.top').evaluate(t => {
    const s = getComputedStyle(t)
    return [parseFloat(s.gridTemplateColumns), t.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)]
  })
  expect(column, 'the column within the screen').toBeLessThanOrEqual(room + 0.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sideways scroll').toBeLessThanOrEqual(0)
})

// Beside facts longer than the photo column, the column follows them down (sticky): scrolled until the thumbnails would
// have left the screen, they are still on it. On a screen too short for the whole column (700 px), the thumbnails alone
// follow. The jump row's "Ảnh", tapped from further down, brings them back into view.
test('species page on a computer: the photo column stays in view while the facts scroll by', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the computer layout')
  test.skip(!(await speciesWithGallery(page)), 'no species page with a gallery strip')
  const strip = page.locator('main section.strip')
  const [box, facts] = [(await strip.boundingBox())!, (await page.locator('header.top > .facts').boundingBox())!]
  test.skip(facts.y + facts.height - (box.y + box.height) < box.height + 16, 'the facts end with the photo column')
  for (const height of [800, 700]) {
    await page.setViewportSize({ width: 1280, height })
    await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), box.y + box.height)
    await expect(strip, `${height} px high`).toBeInViewport({ ratio: 1 })
  }

  const chip = page.locator('nav.jump a[href="#gal-h"]')
  test.skip(!(await chip.count()), 'no jump row')
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await chip.click()
  await expect(page.locator('#gal-h')).toBeInViewport()
})
