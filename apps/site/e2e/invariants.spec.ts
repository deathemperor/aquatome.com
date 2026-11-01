import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { DIST, LIVE, recheckPages, samplePages, sourcePages } from './pages'
import { VIETNAMESE, VIETNAMESE_ALLOWED, expect, test } from './fixtures'
import { checkPage, loadFacts } from '../scripts/page-check'

// The page checks read the content the build was made from: the fixture's for a local build, the checkout's (the live
// version's commit, in watch.yml) for a live site; CONTENT_ROOT for another build (E2E_DIST).
const facts = loadFacts(resolve(process.env.CONTENT_ROOT ?? (LIVE ? '../../content' : 'test/fixture-content')))

// What every page must do, on a phone and a computer, checked on a sample of each kind of page (pages.ts).
const known = new Set(sourcePages())
const pages = [...new Set([...samplePages([...known]), ...recheckPages()])]

// Does this site path lead to a page? A build: its file. A live site: in the sitemap, else asked once per worker
// (pages left out of the sitemap, like photo galleries, still answer 200). Only a clear "not here" (404, 410) counts as
// missing: a timeout or a "slow down" (429) says nothing about the page.
const answered = new Map<string, Promise<boolean>>()
const exists = (path: string, request: APIRequestContext) => {
  if (!LIVE) return Promise.resolve(existsSync(join(DIST, path, path.endsWith('/') ? 'index.html' : '')))
  if (known.has(path)) return Promise.resolve(true)
  if (!answered.has(path)) answered.set(path, request.get(path, { maxRedirects: 3 }).then(r => ![404, 410].includes(r.status()), () => true))
  return answered.get(path)!
}

for (const path of pages) {
  test(`page ${path}`, { tag: '@invariants' }, async ({ page, request, errors }, info) => {
    const res = await page.goto(path, { waitUntil: 'load' })
    expect(res?.status(), 'status').toBe(200)

    // A title and exactly one heading, visible on the first screen (not hidden under the header).
    expect((await page.title()).trim(), 'title').not.toMatch(/^(|undefined|null)( — AquaTome)?$/)
    const h1 = page.locator('h1')
    await expect(h1, 'one h1').toHaveCount(1)
    await expect(h1).toBeVisible()
    const box = (await h1.boundingBox())!
    expect(box.y + box.height, 'h1 on the first screen').toBeLessThanOrEqual(page.viewportSize()!.height)

    // Nothing wider than the screen: a sideways scroll on a phone means something broke out of the layout.
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth
      if (document.documentElement.scrollWidth <= w + 1) return null
      const wide = [...document.querySelectorAll<HTMLElement>('body *')].find(el => { const r = el.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(el).position !== 'fixed' })
      return `${document.documentElement.scrollWidth}px > ${w}px: ${wide ? `<${wide.tagName.toLowerCase()} class="${wide.className}">` : '?'}`
    })
    expect(overflow, 'sideways scroll').toBeNull()

    // Pictures keep their space while loading (width and height), and carry alt text (empty when decorative). An empty
    // <img> a script fills later (the gallery's viewer) is not a picture yet.
    const badImgs = await page.$$eval('img[src]', imgs => imgs.filter(i => !i.getAttribute('width') || !i.getAttribute('height') || !i.hasAttribute('alt')).map(i => i.outerHTML.slice(0, 120)))
    expect(badImgs, 'img without width/height/alt').toEqual([])

    // Links to this site's pages lead to pages that exist.
    const hrefs = await page.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href')!))])
    const paths = [...new Set(hrefs.map(h => h.replace(/[?#].*$/, '')).filter(h => /^\/(vi|id|th)\//.test(h)))]
    const broken = (await Promise.all(paths.map(async h => ((await exists(h, request)) ? null : h)))).filter(Boolean)
    expect(broken, 'links to missing pages').toEqual([])

    // Indonesian and Thai pages show no Vietnamese. Left out: a quoted Vietnamese title (lang="vi") and the photo credits
    // (people's names, which can be Vietnamese on any page).
    if (/^\/(id|th)\//.test(path)) {
      const text = await page.evaluate(() => {
        const body = document.body.cloneNode(true) as HTMLElement
        body.querySelectorAll('[lang="vi"], #photo-credits, script, style, template').forEach(el => el.remove())
        return body.textContent ?? ''
      })
      const plain = VIETNAMESE_ALLOWED.reduce((t, re) => t.replace(re, ''), text)
      const hit = plain.match(new RegExp(`.{0,30}${VIETNAMESE.source}.{0,30}`, 'i'))?.[0]
      expect(hit?.replace(/\s+/g, ' '), 'Vietnamese on a non-Vietnamese page').toBeUndefined()
    }

    expect(errors, 'script errors').toEqual([])
    info.annotations.push({ type: 'checked', description: path })
  })
}

// What only the page as built shows (scripts/page-check.ts): a picture twice, a wrong fish or link, a fish's section without
// its photo, contents that disagree with the headings, an empty section. The HTML alone, once (not per screen size); on
// the fixture build in CI and on the live site in watch.yml, where a problem becomes an issue like any other.
for (const path of pages) {
  test(`page checks ${path}`, { tag: '@page-checks' }, async ({ request }, info) => {
    test.skip(info.project.name !== 'phone', 'the HTML is the same on every screen')
    const res = await request.get(path, { headers: { accept: 'text/html' } })
    expect(res.status(), 'status').toBe(200)
    expect(checkPage(path, await res.text(), await facts)).toEqual([])
  })
}
