import type { ChromeFetcher } from '../fetch'
import type { FbBrowser } from './collect'
import { jsonIn, jsonLines } from './parse'

/**
 * The collector's browser on the engine's real Chrome (logged into the spare account by hand). Page data is the page's
 * embedded JSON plus the /api/graphql/ responses it fetches; scrolling is a mouse wheel, as a person would.
 * Only responses requested by the current page count, so a late answer to the previous page never lands in this one.
 */
export function chromeFb(f: ChromeFetcher): FbBrowser {
  const page = f.current
  let at = ''
  let got: unknown[] = []
  let pending: Promise<void>[] = []
  page.on('response', r => {
    if (!r.url().includes('/api/graphql')) return
    const from = r.request().headers().referer ?? ''
    if (!at || !from.startsWith(at.split('#')[0]!)) return
    pending.push(r.text().then(t => { got.push(...jsonLines(t)) }, () => {}))
  })
  const drain = async () => {
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {}) // Facebook keeps a channel open: never fully idle
    await Promise.all(pending)
    const out = got
    got = []
    pending = []
    return out
  }
  return {
    async goto(url) {
      got = []
      pending = []
      at = url
      const r = await f.get(url)
      at = r.finalUrl
      return { url: r.finalUrl, html: r.html, data: [...jsonIn(r.html), ...await drain()] }
    },
    async scroll() {
      await page.mouse.wheel(0, 2500 + Math.round(Math.random() * 1500))
      return drain()
    },
    bytes: (url, referer) => f.bytes(url, referer),
  }
}
