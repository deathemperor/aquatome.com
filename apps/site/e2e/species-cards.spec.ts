import { expect, test } from './fixtures'

// The fish list puts its first page of species in the HTML as cards and every other species as a hidden link, which
// its script turns into a card when the reader gets to it (components/SpeciesGrid.astro `full`). These hold on the
// fixture build and on aquatome.com (read from the page): the other languages' lists have no species in the fixture.
const LISTS = ['/vi/ca/', '/id/ikan/', '/th/fish/']

for (const path of LISTS) {
  test(`every species the list can show is a link in its HTML, for crawlers (${path})`, async ({ request }) => {
    const html = await (await request.get(path)).text()
    const index = JSON.parse(/<script type="application\/json" id="species-index">([\s\S]*?)<\/script>/.exec(html)![1]!) as { slug: string }[]
    test.skip(index.length === 0, 'no species in this language')
    expect(index.filter(i => !html.includes(`href="${path}${i.slug}/"`)).map(i => i.slug), 'species without a link').toEqual([])
  })

  test(`a card the browser builds is the card the server renders (${path})`, async ({ page, request }) => {
    const html = await (await request.get(path)).text()
    // Every card in the HTML turned into the link SpeciesGrid writes for a species it leaves to the script.
    let n = 0
    const links = html.replace(/<div data-slug="([^"]+)"[^>]*><article[\s\S]*?<\/article><\/div>/g, (card, slug: string) => {
      n++
      const href = /<a href="([^"]+)"/.exec(card)![1]
      const img = /<img src="([^"]+)" width="(\d+)" height="(\d+)"/.exec(card)
      const name = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(card)![1]
      return `<a data-slug="${slug}" href="${href}"${img ? ` data-img="${img[1]}" data-w="${img[2]}" data-h="${img[3]}"` : ''} hidden>${name}</a>`
    })
    test.skip(n === 0, 'no species in this language')
    // The cards on show, as the browser holds them; the first row loads its pictures at once, the rest lazily.
    const shown = () => page.locator('main [data-slug]:visible').evaluateAll(els => els.map(e => {
      const c = e.cloneNode(true) as Element
      c.querySelectorAll('img').forEach(i => i.removeAttribute('loading'))
      return c.outerHTML
    }))
    // In both units: a reader on °F gets °F on the cards built later too.
    for (const units of ['metric', 'imperial']) {
      await page.goto(path)
      await page.evaluate(u => localStorage.setItem('units', u), units)
      await page.reload()
      const rendered = await shown()
      expect(rendered.length).toBeGreaterThan(0)
      await page.route(`**${path}`, route => route.fulfill({ body: links, contentType: 'text/html; charset=utf-8' }))
      await page.reload()
      await expect(page.locator('main [data-slug]:visible')).toHaveCount(rendered.length)
      expect(await shown(), `${units}: built cards`).toEqual(rendered)
      await page.unroute(`**${path}`)
    }
  })
}

// The list's own links, past its first page: only the real build and aquatome.com have them (the test content has 9
// species). Each card built from one is compared with the card its group's page renders.
/** Each card on show under `main`, by slug, as the browser holds it (pictures' eager or lazy loading aside). */
const cardsBySlug = (page: import('@playwright/test').Page) => page.locator('main [data-slug]:visible').evaluateAll(els => els.map(e => {
  const c = e.cloneNode(true) as HTMLElement
  c.querySelectorAll('img').forEach(i => i.removeAttribute('loading'))
  return [c.dataset.slug!, c.outerHTML] as [string, string]
}))

test('the cards the list builds from its own links are the ones its groups\' pages render', async ({ page, request }) => {
  const html = await (await request.get('/vi/ca/')).text()
  const links = new Set([...html.matchAll(/<a data-slug="([^"]+)"[^>]*\bhidden\b/g)].map(m => m[1]!))
  test.skip(links.size === 0, 'every species fits on the first page')
  await page.goto('/vi/ca/')
  // The second page, when there is one: past the first, every card is built from a link.
  const more = page.locator('#species-more')
  if (await more.isVisible()) { const n = await page.locator('main [data-slug]:visible').count(); await more.click(); await expect(page.locator('main [data-slug]:visible')).not.toHaveCount(n) }
  const built = (await cardsBySlug(page)).filter(([slug]) => links.has(slug))
  expect(built.length).toBeGreaterThan(0)
  const groupOf = await page.locator('#species-index').evaluate(s => Object.fromEntries((JSON.parse(s.textContent!) as { slug: string; group: string }[]).map(i => [i.slug, i.group])))
  for (const group of new Set(built.map(([slug]) => groupOf[slug]!))) {
    await page.goto(`/vi/nhom/${group}/`)
    const server = Object.fromEntries(await cardsBySlug(page))
    for (const [slug, card] of built.filter(([s]) => groupOf[s] === group)) expect(card, slug).toBe(server[slug])
  }
})
