import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { fromOurPage } from '../worker/affiliate/go'

// The Worker counts a shop click only when the browser's own headers say one of our pages opened the link
// (worker/affiliate/go.ts): a real browser has to say so, or no click would ever be counted. These are the headers a
// real click sends, read off a server of the check's own, so nothing here reaches the site or counts a click.
test('a click on a shop link says it came from our page; opening the address does not', async ({ page, context }) => {
  const seen: IncomingHttpHeaders[] = []
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/go/')) {
      seen.push(req.headers)
      res.end('shop')
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><a rel="sponsored nofollow noopener" target="_blank" href="/go/shopee/?k=neon">Shopee</a>')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const said = (h: IncomingHttpHeaders) => fromOurPage(new Request(`${origin}/go/shopee/`, { headers: h as Record<string, string> }))
  try {
    await page.goto(origin)
    const shop = context.waitForEvent('page')
    await page.getByRole('link', { name: 'Shopee' }).click()
    await (await shop).waitForLoadState()
    expect(seen).toHaveLength(1)
    expect(said(seen[0]!)).toBe(true)

    // A crawler driving a browser opens the address itself.
    await page.goto(`${origin}/go/shopee/?k=neon`)
    expect(seen).toHaveLength(2)
    expect(said(seen[1]!)).toBe(false)
  } finally {
    server.close()
  }
})
