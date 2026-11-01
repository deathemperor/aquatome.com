import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The fish and plant lists put their first page of cards in the HTML. Every item, in the list's order, is in the list's
// data file (`#<prefix>-result` data-src, lib/list-data.ts), from which the page's script builds the cards past the first
// page and credits their photos (scripts/filter-list.ts, species-card.ts, plant-card.ts, photo-credits.ts). These hold
// on the fixture build and on aquatome.com (read from the page): the other languages have no species in the fixture.
const PAGE = 24
const LISTS = [
  { path: '/vi/ca/', prefix: 'species' }, { path: '/id/ikan/', prefix: 'species' }, { path: '/th/fish/', prefix: 'species' },
  { path: '/vi/cay/', prefix: 'plant' }, { path: '/id/tanaman/', prefix: 'plant' }, { path: '/th/plants/', prefix: 'plant' },
]
type Item = { slug: string; group?: string; photo?: { url: string } }
/** A card in the HTML, as the server renders it: the slug is its first match. */
const CARD = { species: /<div data-slug="([^"]+)"[^>]*><article[\s\S]*?<\/article><\/div>/g, plant: /<article class="pc" data-slug="([^"]+)"[\s\S]*?<\/article>/g }

/** The list's HTML and its data file's items. */
async function listOf(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text()
  const src = /data-src="([^"]+)"/.exec(html)?.[1]
  return { html, items: src ? (await (await request.get(src)).json() as Item[]) : [] }
}
/** Each card on show under `main`, by slug, as the browser holds it (pictures' eager or lazy loading aside). */
const cardsBySlug = (page: Page) => page.locator('main [data-slug]:visible').evaluateAll(els => els.map(e => {
  const c = e.cloneNode(true) as HTMLElement
  c.querySelectorAll('img').forEach(i => i.removeAttribute('loading'))
  return [c.dataset.slug!, c.outerHTML] as [string, string]
}))
/** Serve `path` as `html` from now on (the page is then built from a changed copy of its own HTML). */
const serve = (page: Page, path: string, html: string) => page.route(`**${path}`, route => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }))

for (const { path, prefix } of LISTS) {
  test(`the list's HTML holds its data file's first page of cards, and every item has its page (${path})`, async ({ request }) => {
    const { html, items } = await listOf(request, path)
    test.skip(items.length === 0, 'nothing published in this language')
    expect(html, 'no index of every item in the page').not.toMatch(new RegExp(`id="${prefix}-index"`))
    expect([...html.matchAll(CARD[prefix as keyof typeof CARD])].map(m => m[1])).toEqual(items.slice(0, PAGE).map(i => i.slug))
    expect(html).toContain(`data-total="${items.length}"`)
    // On aquatome.com (about 900 species) a sample: the first, the last and every 50th.
    for (const i of items.filter((_, n) => n % 50 === 0 || n === items.length - 1)) expect((await request.get(`${path}${i.slug}/`)).status(), i.slug).toBe(200)
  })

  test(`a card the browser builds is the card the server renders (${path})`, async ({ page, request }) => {
    const { html, items } = await listOf(request, path)
    test.skip(items.length === 0, 'nothing published in this language')
    // In both units: a reader on °F gets °F on the cards built later too.
    for (const units of ['metric', 'imperial']) {
      await page.goto(path)
      await page.evaluate(u => localStorage.setItem('units', u), units)
      await page.reload()
      const rendered = await cardsBySlug(page)
      expect(rendered.length).toBe(Math.min(items.length, PAGE))
      // The HTML without its cards: the script builds the whole first page from the data file.
      await serve(page, path, html.replace(CARD[prefix as keyof typeof CARD], ''))
      await page.reload()
      await expect(page.locator('main [data-slug]:visible')).toHaveCount(rendered.length)
      expect(await cardsBySlug(page), `${units}: built cards`).toEqual(rendered)
      await page.unroute(`**${path}`)
    }
  })

  test(`the photos on cards the browser builds are credited, one row per author and licence (${path})`, async ({ page, request }) => {
    const { html, items } = await listOf(request, path)
    test.skip(items.length === 0, 'nothing published in this language')
    const photo = new Map(items.map(i => [i.slug, i.photo?.url]))
    // The rows the server writes, without its scoping attribute.
    const rows = (p: Page) => p.locator('#photo-credits li').evaluateAll(lis => lis.map(li => li.outerHTML.replace(/ data-astro-cid-\w+(="")?/g, '')))
    await page.goto(path)
    const server = await rows(page)
    // The HTML with no cards and no credits: every card on show is built, and credits its photo.
    await serve(page, path, html.replace(CARD[prefix as keyof typeof CARD], '').replace(/(<div id="photo-credits"[\s\S]*?<ul[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2'))
    await page.reload()
    await expect(page.locator('main [data-slug]:visible')).toHaveCount(Math.min(items.length, PAGE))
    const shown = (await cardsBySlug(page)).flatMap(([slug]) => photo.get(slug) ?? [])
    test.skip(shown.length === 0, 'no photos on the first page')
    const links = await page.locator('#photo-credits li a').evaluateAll(as => as.map(a => a.getAttribute('href')!))
    expect([...links].sort()).toEqual([...new Set(shown)].sort())
    const built = await rows(page)
    const key = (row: string) => /data-author="[^"]*" data-licence="[^"]*"/.exec(row)![0]
    expect(new Set(built.map(key)).size, 'one row per author and licence').toBe(built.length)
    // A row of the server's made only of these photos comes out the same when the script writes it.
    const same = server.filter(r => [...r.matchAll(/href="([^"]+)"/g)].every(m => shown.includes(m[1]!.replace(/&amp;/g, '&'))))
    expect(same.length).toBeGreaterThan(0)
    for (const r of same) expect(built.find(b => key(b) === key(r))).toBe(r)
    // The footer's button counts them: "Nguồn ảnh (n)" in the page's language.
    await expect(page.locator('footer .credits-btn')).toBeVisible()
    await expect(page.locator('footer .credits-btn')).toHaveText(new RegExp(`\\(${links.length}\\)$`))
  })
}

// Past the first page: only the real build and aquatome.com have it (the test content has 9 species). Each card built
// from the data file is compared with the card its group's page renders.
test('the cards the fish list builds past its first page are the ones its groups\' pages render', async ({ page, request }) => {
  const { items } = await listOf(request, '/vi/ca/')
  test.skip(items.length <= PAGE, 'every species fits on the first page')
  await page.goto('/vi/ca/')
  const n = await page.locator('main [data-slug]:visible').count()
  await page.locator('#species-more').click()
  await expect(page.locator('main [data-slug]:visible')).not.toHaveCount(n)
  const later = new Set(items.slice(PAGE).map(i => i.slug))
  const built = (await cardsBySlug(page)).filter(([slug]) => later.has(slug))
  expect(built.length).toBeGreaterThan(0)
  // A group's page and its numbered pages list its species a page at a time, in the fish list's order: each species is on
  // the group's page its place in the group says.
  const where = (slug: string) => {
    const group = items.find(i => i.slug === slug)!.group!
    const n = Math.floor(items.filter(i => i.group === group).findIndex(i => i.slug === slug) / PAGE) + 1
    return n === 1 ? `/vi/nhom/${group}/` : `/vi/nhom/${group}/trang/${n}/`
  }
  for (const path of new Set(built.map(([slug]) => where(slug)))) {
    await page.goto(path)
    const server = Object.fromEntries(await cardsBySlug(page))
    for (const [slug, card] of built.filter(([s]) => where(s) === path)) expect(card, slug).toBe(server[slug])
  }
})

test('a link with filters shows no unfiltered cards while the list loads, and says so if it can\'t', async ({ page }) => {
  // The data file held back, then let through: until then the result line says it is filtering and no card shows.
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  await page.route('**/data/*/species.json', async route => { await held; await route.continue() })
  await page.goto('/vi/ca/?q=neon')
  await expect(page.locator('#species-count')).toHaveText('Đang lọc…')
  await expect(page.locator('main [data-slug]:visible')).toHaveCount(0)
  release()
  await expect(page.locator('#species-count')).toHaveText(/^\d+ loài phù hợp/)
  for (const name of await page.locator('main [data-slug]:visible h3').allTextContents()) expect(name.toLowerCase()).toContain('neon')
  await page.unroute('**/data/*/species.json')

  // The data file failing: the result line says so, the first page shows again, and the next try loads it.
  await page.route('**/data/*/species.json', route => route.abort())
  await page.goto('/vi/ca/?q=neon')
  await expect(page.locator('#species-count')).toHaveText('Chưa tải được danh sách. Kiểm tra mạng rồi thử lại.')
  await expect(page.locator('main [data-slug]:visible').first()).toBeVisible()
  await page.unroute('**/data/*/species.json')
  const box = page.locator('#filter-box')
  if (!(await box.evaluate(d => (d as HTMLDetailsElement).open))) await box.locator('summary').click()
  await page.locator('#species-filter button[type=submit]').click()
  await expect(page.locator('#species-count')).toHaveText(/^\d+ loài phù hợp/)
})
