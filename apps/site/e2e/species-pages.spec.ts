import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The pages that list some of the species: a fish group's (/vi/nhom/<group>/), a taxon's (/vi/phan-loai/…), an
// origin's (/vi/nguon-goc/…) and the fish an equipment page names (/vi/thiet-bi/<kind>/). Each shows the first page of its species; "Xem thêm" builds the next page in place from the
// list's data file (components/PagedSpecies.astro, scripts/list-more.ts). A group's "Xem thêm" is also a link to its
// numbered pages (/vi/nhom/<group>/trang/2/). The test content has 9 species, so these run on the real build and on
// aquatome.com; lists and counts are read from the pages.
const PAGE = 24
const visible = (page: Page) => page.locator('main [data-slug]:visible')
/** Each card on show, by slug, as the browser holds it (pictures' eager or lazy loading aside). */
const cardsBySlug = (page: Page) => visible(page).evaluateAll(els => els.map(e => {
  const c = e.cloneNode(true) as HTMLElement
  c.querySelectorAll('img').forEach(i => i.removeAttribute('loading'))
  return [c.dataset.slug!, c.outerHTML] as [string, string]
}))
/** The intro's count: "48 loài trong nhóm cá da trơn." */
const total = async (page: Page) => Number(/\d+/.exec((await page.locator('main .intro').textContent())!)![0])

/** A fish group's page with more than a page of species, from the fish list's group filter; undefined when none has. */
async function bigGroup(page: Page, lang: 'vi' | 'id' = 'vi') {
  const [list, groups] = lang === 'vi' ? ['/vi/ca/', '/vi/nhom/'] : ['/id/ikan/', '/id/kelompok/']
  await page.goto(list)
  for (const g of await page.locator('select[name=group] option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean))) {
    await page.goto(`${groups}${g}/`)
    if (await page.locator('[data-paged]').count()) return `${groups}${g}/`
  }
}

test('a fish group\'s "Xem thêm" adds the next page in place; without the script it is a link to its numbered pages', async ({ page, errors }) => {
  const path = await bigGroup(page)
  test.skip(!path, 'no group has more than a page of species')
  const all = await total(page)
  const more = page.locator('[data-more]')
  await expect(visible(page)).toHaveCount(PAGE)
  await expect(more).toHaveAttribute('href', `${path}trang/2/`)
  await expect(more).toHaveText(`Xem thêm ${Math.min(all - PAGE, PAGE)} loài (còn ${all - PAGE})`)
  await more.click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(visible(page)).toHaveCount(Math.min(all, 2 * PAGE))
  const built = await cardsBySlug(page)
  expect(new Set(built.map(([slug]) => slug)).size).toBe(built.length)
  if (all > 2 * PAGE) await expect(more).toHaveAttribute('href', `${path}trang/3/`)
  else await expect(more).toBeHidden()

  // The numbered page: the same next page of species, as the server renders the cards the browser just built, linked back.
  await page.goto(`${path}trang/2/`)
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', path!)
  expect(await cardsBySlug(page)).toEqual(built.slice(PAGE))
  expect(errors).toEqual([])
})

test('a taxon\'s, an origin\'s and an equipment page\'s "Xem thêm" adds the next page in place, and says so when the list can\'t load', async ({ page, errors }) => {
  // The first order, continent and kind of equipment (one level down from each index) with more than a page of species.
  const paths: string[] = []
  for (const [index, links] of [['/vi/phan-loai/', 'main .kids a'], ['/vi/nguon-goc/', 'main .kids a'], ['/vi/thiet-bi/', 'main a.cat']]) {
    await page.goto(index!)
    for (const k of await page.locator(links!).evaluateAll(as => as.map(a => a.getAttribute('href')!))) {
      await page.goto(k)
      if (await page.locator('[data-paged]').count()) { paths.push(k); break }
    }
  }
  test.skip(paths.length === 0, 'no taxon, origin or equipment has more than a page of species')
  for (const path of paths) {
    await page.goto(path)
    // How many the list has: its data file's items (an equipment page has no count line).
    const all = (await (await page.request.get((await page.locator('[data-paged]').getAttribute('data-src'))!)).json() as unknown[]).length
    await expect(visible(page)).toHaveCount(PAGE)
    // The data file failing: the list says so, and the next "Xem thêm" loads it.
    await page.route('**/data/*/species/**', route => route.abort())
    await page.locator('[data-more]').click()
    await expect(page.locator('[data-status]')).toHaveText('Chưa tải được danh sách. Kiểm tra mạng rồi thử lại.')
    await expect(visible(page)).toHaveCount(PAGE)
    await page.unroute('**/data/*/species/**')
    await page.locator('[data-more]').click()
    await expect(page.locator('[data-status]')).toBeHidden()
    await expect(visible(page)).toHaveCount(Math.min(all, 2 * PAGE))
  }
  expect(errors).toEqual([])
})

test('a fish group\'s "Xem thêm" follows the link to the next numbered page when the list can\'t load', async ({ page }) => {
  const path = await bigGroup(page)
  test.skip(!path, 'no group has more than a page of species')
  await page.route('**/data/*/species/**', route => route.abort())
  await page.locator('[data-more]').click()
  await expect(page).toHaveURL(new RegExp(`${path}trang/2/$`))
  await expect(visible(page)).not.toHaveCount(0)
})

test('an Indonesian fish group links its numbered pages in Indonesian', async ({ page }) => {
  const path = await bigGroup(page, 'id')
  test.skip(!path, 'no Indonesian group has more than a page of species')
  await expect(page.locator('[data-more]')).toHaveAttribute('href', `${path}halaman/2/`)
  await expect(page.locator('[data-more]')).toHaveText(/^Lihat \d+ spesies lagi \(sisa \d+\)$/)
  await page.goto(`${path}halaman/2/`)
  await expect(visible(page)).not.toHaveCount(0)
  await expect(page.locator('nav.pages a[rel=prev]')).toHaveAttribute('href', path!)
})
