import type { Page } from '@playwright/test'
import { expect, openCard, test } from './fixtures'
import { LIVE, sourcePages } from './pages'

// Answer first on a phone (PRODUCT.md). The design critique of 2026-11-06 measured, at 390 × 844, a fish page's summary
// 2.7–2.9 screens down and its first care question at 5.3–6.1: before them the key facts, the photo, the whole data card
// repeating the same figures, tank mates, the climate box and the gallery. The page now reads: name and key facts, the
// card folded under them, the summary, the photo, then the care text ("Thông tin nhanh" folded too) with tank mates and
// the climate after the questions they answer, the gallery after that, and a screen reader meets them in that order.
// Fish both builds have, with a summary: Cá neon vua on the fixture; Cá neon xanh and Cá betta on aquatome.com (betta's
// first care question was 2.9 screens down on 2026-11-06).
const FISH = LIVE ? ['/ca/ca-neon-xanh/', '/ca/ca-betta/'] : ['/ca/ca-neon-vua/', '/ca/ca-neon-xanh/']
const CARE = ['aquariumSize', 'waterConditions', 'maintenance', 'equipment', 'diet', 'behaviour'].map(k => `#muc-${k}`).join(', ')

/** Where an element starts, in screens from the top of the page. */
const screens = (page: Page, sel: string) => page.locator(sel).first().evaluate(e => (e.getBoundingClientRect().top + scrollY) / innerHeight)

test('a fish page on a phone: the summary within 1.5 screens, the first care question within 3', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of FISH) {
    await page.goto(path)
    if (await page.locator('.qs').count()) expect(await screens(page, '.qs'), `${path}: the summary`).toBeLessThanOrEqual(1.5)
    if (await page.locator(CARE).count()) expect(await screens(page, CARE), `${path}: the first care question`).toBeLessThanOrEqual(3)
    // "Thông tin nhanh", which the key facts and summary mostly repeat, is a row to open.
    const quick = page.locator('#muc-quickFacts details.fold')
    if (await quick.count()) await expect(quick).not.toHaveAttribute('open')
    // The full card is one tap away, under the key facts; the facts themselves are on the first screen.
    await expect(page.locator('.facts details.full')).not.toHaveAttribute('open')
    await expect(page.locator('.facts details.full > summary')).toBeInViewport()
    expect((await page.locator('.facts details.full > summary').boundingBox())!.height, 'its row').toBeGreaterThanOrEqual(44)
  }
  expect(errors).toEqual([])
})

// The phone's gallery links used to be read before the data card shown two screens above them.
test('a fish page on a phone: a screen reader meets its parts in the order they show', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  for (const path of FISH) {
    await page.goto(path)
    await openCard(page)
    // Every heading and link on show, in the page's order, from the top of the screen down (one column: no two side by side).
    const tops = await page.locator('main').evaluate(main => [...main.querySelectorAll('h1, h2, h3, h4, a, button, summary')].flatMap(e => {
      const r = e.getBoundingClientRect()
      const shut = e.closest('details:not([open])')
      if (shut && !(e.tagName === 'SUMMARY' && e.parentElement === shut)) return []
      if (!r.height || e.closest('[hidden], nav.jump, [data-totop]') || getComputedStyle(e).visibility === 'hidden') return []
      return [{ what: `${e.tagName} ${(e.textContent ?? '').trim().slice(0, 30)}`, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY) }]
    }))
    for (let i = 1; i < tops.length; i++) {
      const [a, b] = [tops[i - 1]!, tops[i]!]
      // On the same line (a row of chips, a link inside a sentence) or below the one before.
      expect(b.top >= a.top - 2 || b.bottom > a.top, `${path}: "${b.what}" is above "${a.what}"`).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

// The row marked the wrong part: "Ảnh" while reading the summary, "Sinh sản" in the sources, "Mua đồ" in the comments.
// It now marks the part on screen under it, and none between parts; at most five chips, each in sight or the row fading
// out at the side that has more.
test('the jump row marks the part being read, none between parts', async ({ page }, info) => {
  await page.goto(FISH[0]!)
  const row = page.locator('nav.jump')
  const chips = row.locator('a')
  expect(await chips.count(), 'chips').toBeLessThanOrEqual(5)
  if (info.project.name === 'phone') {
    const box = (await row.locator('ul').boundingBox())!
    const cut = await chips.evaluateAll((as, b) => as.filter(a => { const r = a.getBoundingClientRect(); return r.right > b.x + b.width + 1 }).length, box)
    if (cut) await expect(row.locator('ul'), 'a row wider than the screen fades at the end').toHaveAttribute('data-more', /end|both/)
  }
  const marked = row.locator('a[aria-current]')
  // At the top (the summary, the photo): no part of the row yet.
  await expect(marked).toHaveCount(0)
  // Inside a part (its start just under the row): its chip.
  const href = (await chips.first().getAttribute('href'))!
  await page.locator(href).evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }))
  await expect(marked).toHaveAttribute('href', href)
  // Further down, at each screen: the chip marked is the part under the row, and none where no part is (the guides that
  // name the fish, its videos, the comments).
  const under = () => page.evaluate(() => {
    const nav = document.querySelector('nav.jump')!, line = nav.getBoundingClientRect().bottom + 24
    if (nav.getBoundingClientRect().top > 1) return null // the row not reached yet
    const hit = [...nav.querySelectorAll('a')].find(a => { const el = document.getElementById(a.hash.slice(1)); const r = (el?.closest('section') ?? el)?.getBoundingClientRect(); return r && r.top <= line && r.bottom > line })
    return hit?.getAttribute('href') ?? null
  })
  let none = 0
  for (let y = 0; ; y += 0.5) {
    const at = await page.evaluate(k => { scrollTo({ top: innerHeight * k, behavior: 'instant' }); return scrollY }, y)
    const want = await under()
    if (want) await expect(marked, `${at} px: under the row`).toHaveAttribute('href', want)
    else { await expect(marked, `${at} px: no part under the row`).toHaveCount(0); if (at > 0) none++ }
    if (await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 1)) break
  }
  expect(none, 'places with no part under the row').toBeGreaterThan(0)
})

// 31–35 source marks per fish page were 14 × 14 px, and the data card's labels 27 px tall links that left the page on a
// mis-tap. Each is now a 44 px target (the mark's look unchanged), and a tap on a label shows what the figure is, the
// explainer one more tap away, inside the card.
test('source marks and the card\'s labels are 44 px targets; a tap on a label stays on the page', async ({ page, errors }, info) => {
  await page.goto(FISH[0]!)
  await openCard(page)
  // (Those on show: "Thông tin nhanh" is folded on a phone.)
  const reach = (sel: string) => page.locator(sel).evaluateAll(els => els.filter(el => !el.closest('details:not([open])')).slice(0, 8).flatMap(el => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
    const ok = [[x, y - 21], [x, y + 21], [x - 21, y], [x + 21, y]].every(([px, py]) => { const h = document.elementFromPoint(px!, py!); return !!h && (h === el || el.contains(h)) })
    return ok ? [] : [`${el.textContent} (${Math.round(r.width)} × ${Math.round(r.height)})`]
  }))
  // A block's first mark (the next block's may sit within 22 px of it, and take the overlap).
  expect(await reach('.body .prose > p:last-child a.cite:last-child, .body .prose li:last-child a.cite:last-child'), 'source marks').toEqual([])
  expect(await reach('.facts .card dt a.gl'), 'card labels').toEqual([])
  if (info.project.name !== 'phone') return
  const label = page.locator('.facts .card dt a.gl').first()
  await label.tap()
  await expect(page.locator('.gl-tip')).toBeVisible()
  await label.tap()
  await expect(page.locator('.gl-tip')).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${FISH[0]}$`))
  expect(errors).toEqual([])
})

// A fish page runs to 30 screens and more: a way back up, low on the right where a thumb reaches, once the reader is down.
test('a long page has a back-to-top button within a thumb\'s reach', async ({ page, errors }, info) => {
  await page.goto(FISH[0]!)
  const up = page.locator('[data-totop]')
  await expect(up).toBeHidden()
  await page.evaluate(() => scrollTo({ top: innerHeight * 3, behavior: 'instant' }))
  await expect(up).toBeVisible()
  const box = (await up.boundingBox())!, view = page.viewportSize()!
  expect(Math.min(box.width, box.height), 'size').toBeGreaterThanOrEqual(44)
  expect(box.y, 'in the lower part of the screen').toBeGreaterThan(view.height * 0.75)
  expect(box.x, 'on the right').toBeGreaterThan(view.width / 2)
  if (info.project.name === 'phone') await up.tap(); else await up.click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5)
  await expect(page.locator('main h1')).toBeFocused()
  await expect(up).toBeHidden()
  expect(errors).toEqual([])
})

// A video guide showed its 18 chapters before its first paragraph, the first of them "0:00 Mục lục video" (the creator's
// own list of chapters). The list is closed now, its chapters the video's own; the contents list follows it.
test('a video guide: its chapters one tap away, without the video\'s own list of chapters', async ({ page, errors }, info) => {
  let checked = 0
  // Few guides have chapters (39 of aquatome.com's 601, 2026-11-07), and the sitemap lists them late: the first two are
  // found by their HTML, 20 pages at a time, then opened.
  const guides = sourcePages().filter(p => /^\/huong-dan\/[^/]+\/$/.test(p))
  const withChapters: string[] = []
  for (let i = 0; i < guides.length && withChapters.length < 2; i += 20) {
    const batch = guides.slice(i, i + 20)
    const html = await Promise.all(batch.map(p => page.request.get(p).then(r => r.text(), () => '')))
    withChapters.push(...batch.filter((_, k) => html[k]!.includes('class="chapters"')))
  }
  for (const path of withChapters.slice(0, 2)) {
    await page.goto(path)
    const list = page.locator('details.chapters')
    checked++
    await expect(list).not.toHaveAttribute('open')
    await expect(list.locator('button[data-t]').first()).toBeHidden()
    const titles = await list.locator('button[data-t]').allTextContents()
    expect(titles.filter(t => /mục lục|chapters/i.test(t)), path).toEqual([])
    if (info.project.name === 'phone') await list.locator('summary').tap(); else await list.locator('summary').click()
    await expect(list.locator('button[data-t]').first()).toBeVisible()
  }
  expect(checked, 'video guides with chapters').toBeGreaterThan(0)
  expect(errors).toEqual([])
})

// A plant page showed six full-width video cards (2.5 screens) on a phone: two now, the rest one tap away.
test('a page\'s video guides: two cards on a phone, the rest behind "Xem cả"', async ({ page, errors }, info) => {
  let path: string | undefined
  for (const p of sourcePages().filter(p => /^\/(ca|cay)\/[^/]+\/$/.test(p)).slice(0, 60)) {
    await page.goto(p)
    if ((await page.locator('[data-vg] .gc').count()) > 2) { path = p; break }
  }
  test.skip(!path, 'no page with more than two video guides')
  const cards = page.locator('[data-vg] .gc')
  const n = await cards.count()
  const more = page.locator('[data-vg-all]')
  if (info.project.name !== 'phone') {
    await expect(cards.nth(n - 1)).toBeVisible()
    await expect(more).toBeHidden()
    return
  }
  await expect(page.locator('[data-vg] .gc:visible')).toHaveCount(2)
  await expect(more).toHaveText(`Xem cả ${n} video`)
  await more.tap()
  await expect(page.locator('[data-vg] .gc:visible')).toHaveCount(n)
  await expect(more).toBeHidden()
  expect(errors).toEqual([])
})
