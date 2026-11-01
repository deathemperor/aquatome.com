import { expect, test } from './fixtures'

// The fish list's search (/vi/ca/?q=…). The bug this guards: a search opened on 33 unfiltered breed cards, its
// results five phone screens below (2026-10-31).
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
/** Every card on the page a reader can see, in reading order: breed cards, then the species list. */
const visibleCards = (page: import('@playwright/test').Page) =>
  page.$$eval('main .breeds li, main [data-slug]', els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => ({ text: e.textContent ?? '', top: e.getBoundingClientRect().top + scrollY })))

test('a name search shows only matching cards, and the first one near the top', async ({ page }) => {
  await page.goto('/vi/ca/?q=neon')
  await expect(page.locator('#species-count')).toHaveText(/\d+ loài phù hợp/)
  const cards = await visibleCards(page)
  expect(cards.length).toBeGreaterThan(0)
  for (const c of cards) expect(fold(c.text), 'a card that does not match "neon"').toContain('neon')
  // Within one and a half screens of the top: reachable with one swipe on a phone.
  expect(cards[0]!.top).toBeLessThan(page.viewportSize()!.height * 1.5)
})

test('a search with no match says so and shows no cards', async ({ page }) => {
  await page.goto('/vi/ca/?q=khongcoloainao')
  await expect(page.locator('#species-count')).toHaveText(/Không có loài nào khớp/)
  expect(await visibleCards(page)).toEqual([])
})

test('typing a name and pressing Lọc filters the list and keeps the search in the address', async ({ page }) => {
  await page.goto('/vi/ca/')
  // On a phone the filters start folded.
  const box = page.locator('#filter-box')
  if (!(await box.evaluate(d => (d as HTMLDetailsElement).open))) await box.locator('summary').click()
  await page.locator('input[name=q]').fill('neon vua')
  await page.locator('#species-filter button[type=submit]').click()
  await expect(page).toHaveURL(/\?q=neon\+vua/)
  // The list filters once the whole fish list has loaded ("Đang lọc…" until then; about a second on the live site).
  await expect(page.locator('#species-count')).toHaveText(/\d+ loài phù hợp/)
  const cards = await visibleCards(page)
  expect(cards.length).toBeGreaterThan(0)
  expect(cards.map(c => fold(c.text).includes('neon vua'))).toEqual(cards.map(() => true))
})

// The site search (/vi/tim-kiem/, Pagefind). The bugs these guard (design critique 2026-10-31, #6, #7, #18): excerpts
// made of the accent-free alias list, redirect notes and the gallery's lightbox buttons; photo galleries outranking the
// species they show; and a nonsense word reported as "4 kết quả" from fragments of authors' initials ("X.-Y.").
/** Every result of a search, after "Xem thêm kết quả" has loaded them all. */
async function siteSearch(page: import('@playwright/test').Page, path: string) {
  await page.goto(path)
  await expect(page.locator('[data-status]')).not.toHaveText(/^$|…/)
  const more = page.locator('[data-more]')
  while (await more.isVisible()) { const n = await page.locator('[data-hits] li').count(); await more.click(); await expect(page.locator('[data-hits] li')).not.toHaveCount(n) }
  return page.$$eval('[data-hits] li', lis => lis.map(li => ({ href: li.querySelector('a')!.getAttribute('href')!, title: li.querySelector('a')!.textContent!, text: li.querySelector('p')!.textContent! })))
}

test('a site search for a name lists that species first, without photo galleries', async ({ page, errors }) => {
  const hits = await siteSearch(page, '/vi/tim-kiem/?q=neon')
  expect(hits.length).toBeGreaterThan(1)
  expect(hits[0]!.href, 'the first result').toMatch(/^\/vi\/ca\/ca-neon-[a-z-]+\/$/)
  for (const h of hits) expect(h.href, 'a gallery page among the results').not.toMatch(/\/(anh|foto|photos)\/$/)
  expect(errors).toEqual([])
})

test('site search excerpts carry no alias lists, redirect notes or lightbox buttons', async ({ page }) => {
  for (const q of ['neon', 'tetra', 'cardinal']) {
    for (const h of await siteSearch(page, `/vi/tim-kiem/?q=${q}`)) {
      // The alias list is the title without accents ("ca neon vua cardinal tetra"): the page's real text has them.
      if (fold(h.title) !== h.title.toLowerCase()) expect(h.text, `excerpt of ${h.href}`).not.toContain(fold(h.title))
      expect(h.text, `excerpt of ${h.href}`).not.toMatch(/Chuyển hướng từ|[‹›×]/)
    }
  }
})

test('a site search by scientific name finds the species first', async ({ page }) => {
  const hits = await siteSearch(page, '/vi/tim-kiem/?q=Paracheirodon+axelrodi')
  expect(hits[0]?.href).toBe('/vi/ca/ca-neon-vua/')
})

for (const [path, all] of [['/vi/tim-kiem/', '/vi/ca/'], ['/id/cari/', '/id/ikan/'], ['/th/search/', '/th/fish/']] as const) {
  test(`a nonsense word says there is nothing, with a way on (${path})`, async ({ page, errors }) => {
    await page.goto(`${path}?q=xyzzyq`)
    await expect(page.locator('[data-none]')).toBeVisible()
    await expect(page.locator('[data-status]')).toContainText('xyzzyq')
    await expect(page.locator('[data-hits] li')).toHaveCount(0)
    const link = page.locator('[data-none] a[href]').last()
    await expect(link).toHaveAttribute('href', all)
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    // The Latin-name example is a search that finds something (the test content has species in Vietnamese only).
    if (path === '/vi/tim-kiem/') {
      await page.locator('[data-none] a.sci').click()
      await expect(page.locator('[data-hits] li').first()).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}

test('a search of several words far apart on a page still lists it (only one place shows in its excerpt)', async ({ page }) => {
  for (const q of ['betta bể nhỏ', 'cá neon bể nhỏ', 'cá neon nước mềm']) {
    await page.goto(`/vi/tim-kiem/?q=${encodeURIComponent(q)}`)
    await expect(page.locator('[data-hits] li').first(), q).toBeVisible()
    await expect(page.locator('[data-none]'), q).toBeHidden()
  }
})

test('tapping "Xem thêm kết quả" twice quickly loads the next page once', async ({ page }) => {
  await page.goto('/vi/tim-kiem/?q=c')
  const more = page.locator('[data-more]')
  await expect(more).toBeVisible()
  await more.evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click() })
  await expect(page.locator('[data-hits] li')).not.toHaveCount(10)
  const hrefs = await page.$$eval('[data-hits] li a', as => as.map(a => a.getAttribute('href')))
  expect(new Set(hrefs).size, 'each result once').toBe(hrefs.length)
})

test('an empty site search shows the field and a hint, not a count or a no-results message', async ({ page }) => {
  await page.goto('/vi/tim-kiem/')
  await expect(page.locator('input[type=search]')).toBeFocused()
  await expect(page.locator('[data-hint]')).toBeVisible()
  await expect(page.locator('[data-none]')).toBeHidden()
  await expect(page.locator('[data-status]')).toHaveText('')
  // Typing searches, and clearing goes back to the empty state.
  await page.locator('input[type=search]').fill('neon')
  await expect(page.locator('[data-hits] li').first()).toBeVisible()
  await expect(page).toHaveURL(/\?q=neon/)
  await page.getByRole('button', { name: 'Xóa' }).click()
  await expect(page.locator('[data-hits] li')).toHaveCount(0)
  await expect(page.locator('[data-hint]')).toBeVisible()
})
