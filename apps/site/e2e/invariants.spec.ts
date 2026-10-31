import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DIST, allPages, samplePages } from './pages'
import { VIETNAMESE, VIETNAMESE_ALLOWED, expect, test } from './fixtures'

// What every page must do, on a phone and a computer, checked on a sample of each kind of page (pages.ts).
const pages = samplePages(allPages())

for (const path of pages) {
  test(`page ${path}`, { tag: '@invariants' }, async ({ page, errors }, info) => {
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
    const broken = hrefs.map(h => h.replace(/[?#].*$/, '')).filter(h => /^\/(vi|id|th)\//.test(h) && !existsSync(join(DIST, h, h.endsWith('/') ? 'index.html' : '')))
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
