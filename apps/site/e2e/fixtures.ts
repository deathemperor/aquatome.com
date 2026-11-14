import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * Every check runs offline from third parties (ads, analytics, video, photo hosts): only the site itself loads, so a
 * slow outside server can't fail a check. `errors` holds the page's uncaught exceptions and console errors (failed
 * loads of the blocked requests aside); a test can assert it is empty.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page, baseURL }, use) => {
    const own = new URL(baseURL!).origin
    // The site's own visit beacon too: a check is not a reader.
    await page.route(url => url.origin !== own || url.pathname === '/_e', route => route.abort())
    const errors: string[] = []
    page.on('pageerror', e => errors.push(`exception: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) errors.push(`console: ${m.text()}`) })
    await use(errors)
  }, { auto: true }],
})
export { expect }

/** Text written in Vietnamese: letters only Vietnamese uses (lib/i18n isVietnamese, as a pattern). */
export const VIETNAMESE = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]/i
/** Vietnamese that belongs on other languages' pages: a decree's official number. */
export const VIETNAMESE_ALLOWED = [/\d+\/\d{4}\/NĐ-CP/g, /Tiếng Việt/g]

/** A fish page's full data card, open: a phone has it closed under the key facts ("Xem đủ bảng"); a computer, open. */
export async function openCard(page: Page) {
  const fold = page.locator('.facts details.full')
  if (await fold.count() && !(await fold.evaluate(d => (d as HTMLDetailsElement).open))) await fold.locator(':scope > summary').click()
}

/** The page wider than the screen, and the first thing past its edge; null when it fits. */
export const sideways = (page: Page) => page.evaluate(() => {
  const w = document.documentElement.clientWidth
  if (document.documentElement.scrollWidth <= w + 1) return null
  const wide = [...document.querySelectorAll<HTMLElement>('body *')].find(el => { const r = el.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(el).position !== 'fixed' })
  return `${document.documentElement.scrollWidth}px > ${w}px: ${wide ? `<${wide.tagName.toLowerCase()} class="${wide.className}">` : '?'}`
})

/**
 * A fish page's photo column on a computer (pages/ca/[slug].astro), scrolled through the range where it's pinned beside
 * the facts: the furthest any of it (its box, the photo, a thumbnail its list doesn't clip) is drawn outside the page's
 * top (`.top`), and where; null when it stays inside, or the page has no such column (a phone shows it in the page's flow).
 */
export const columnSpill = (page: Page) => page.evaluate(async () => {
  const top = document.querySelector<HTMLElement>('.top:has(> .side)'), side = top?.querySelector<HTMLElement>(':scope > .side')
  if (!top || !side || getComputedStyle(side).display === 'contents') return null
  const list = side.querySelector('ul'), frame = () => new Promise(done => requestAnimationFrame(done))
  const drawn = () => {
    const clip = list && getComputedStyle(list).overflowY !== 'visible' ? list.getBoundingClientRect() : undefined
    const thumbs = [...side.querySelectorAll('li')].map(li => li.getBoundingClientRect()).filter(r => r.height && (!clip || r.top < clip.bottom))
      .map(r => ({ top: r.top, bottom: clip ? Math.min(r.bottom, clip.bottom) : r.bottom }))
    return [side.getBoundingClientRect(), ...[...side.querySelectorAll('.gallery')].map(g => g.getBoundingClientRect()), ...thumbs]
  }
  let worst = 0, at = 0
  const end = top.getBoundingClientRect().bottom + scrollY
  for (let y = 0; y <= end; y += Math.round(innerHeight / 4)) {
    scrollTo({ top: y, behavior: 'instant' })
    await frame()
    const t = top.getBoundingClientRect(), parts = drawn()
    const out = Math.max(...parts.map(r => r.bottom - t.bottom), ...parts.map(r => t.top - r.top))
    if (out > worst) { worst = out; at = scrollY }
  }
  scrollTo({ top: 0, behavior: 'instant' })
  return worst > 1 ? `${Math.round(worst)} px outside the page's top, scrolled to ${Math.round(at)} px` : null
})

/** Every picture on the page as one that didn't load:its alt text in its place, as when the media host refuses it or is down. */
export async function photosMissing(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('picture source').forEach(s => s.remove())
    for (const img of document.querySelectorAll('img')) { img.removeAttribute('srcset'); img.loading = 'eager'; img.src = 'data:,' }
  })
  await page.waitForFunction(() => [...document.images].every(i => i.complete))
}

/** Whether the head's whole picture shows: drawn to fit inside its box, or a box of the picture's own shape. */
export const shownWhole = (img: Locator) => img.evaluate(i => {
  const r = i.getBoundingClientRect(), own = Number(i.getAttribute('width')) / Number(i.getAttribute('height'))
  const fit = getComputedStyle(i).objectFit
  return fit === 'contain' || fit === 'scale-down' || Math.abs(r.width / r.height - own) / own < 0.01
})
