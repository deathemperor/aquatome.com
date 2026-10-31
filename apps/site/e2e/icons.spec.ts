import { expect, test } from './fixtures'

// The site's icon wherever it is looked for: the icons the pages link (Google Search uses the home page's), and
// /favicon.ico, which browsers, feed readers and chat apps request without looking at the page.
test('site icons: every linked icon and /favicon.ico is an image', async ({ page, request }) => {
  await page.goto('/vi/')
  const hrefs = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll(ls => ls.map(l => (l as HTMLLinkElement).getAttribute('href')!))
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of [...new Set([...hrefs, '/favicon.ico'])]) {
    const res = await request.get(href)
    expect(res.status(), href).toBe(200)
    expect(res.headers()['content-type'], href).toMatch(/^image\//)
  }
})
