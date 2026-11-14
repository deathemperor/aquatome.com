import { expect, openCard, test } from './fixtures'

// Dotted glossary terms (a.gl): hover shows the term and its meaning, a click opens its page; on a touch screen a tap
// shows the card, a second tap closes it, and only the card's "Đọc thêm" opens the page (a finger that misses a term
// never leaves the page).
// A guide with glossary terms: in the fixture content, and on aquatome.com (production checks).
const GUIDE = process.env.E2E_BASE_URL ? '/huong-dan/10-cach-tri-reu-hai-nhanh-va-de-trong-be-thuy-sinh/' : '/huong-dan/setup-be-thuy-sinh-dau-tien/'

test('hover shows the card; a click still opens the term page', async ({ page, errors }, info) => {
  test.skip(info.project.name === 'phone', 'mouse only')
  await page.goto(GUIDE)
  const term = page.locator('main a.gl[data-tip]').first()
  const name = (await term.getAttribute('data-term'))!
  await term.hover()
  const tip = page.locator('.gl-tip')
  await expect(tip).toBeVisible()
  await expect(tip.locator('strong')).toHaveText(name)
  await expect(tip.locator('p')).toHaveText((await term.getAttribute('data-tip'))!)
  await page.mouse.move(0, 0)
  await expect(tip).toBeHidden()
  await term.click()
  await expect(page).toHaveURL(/\/thuat-ngu\//)
  expect(errors).toEqual([])
})

test('a tap shows the card with a link; tapping elsewhere or the term again closes it; the card\'s link opens the page', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only')
  await page.goto(GUIDE)
  const term = page.locator('main a.gl[data-tip]').first()
  await term.tap()
  const tip = page.locator('.gl-tip')
  await expect(tip).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${GUIDE}$`))
  expect(new URL((await tip.locator('a').getAttribute('href'))!, page.url()).pathname).toBe(await term.getAttribute('href'))
  // The card stays on the screen.
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.locator('h1').tap()
  await expect(tip).toBeHidden()
  await term.tap()
  await expect(tip).toBeVisible()
  await term.tap()
  await expect(tip).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${GUIDE}$`))
  await term.tap()
  await tip.locator('a').tap()
  await expect(page).toHaveURL(/\/thuat-ngu\//)
  expect(errors).toEqual([])
})

// A tip's two events (src/scripts/glossary-tip.ts), read as the browser sends them (the fixture stops them before the site).
const tipEvents = (page: import('@playwright/test').Page) => {
  const sent: { t: string; p: string; x?: string }[] = []
  page.on('request', r => {
    if (new URL(r.url()).pathname !== '/_e' || r.method() !== 'POST') return
    const e = JSON.parse(r.postData() ?? '{}') as { t: string; p: string; x?: string }
    if (e.t === 'tip' || e.t === 'tipmore') sent.push(e)
  })
  return sent
}

test('a tap that opens a term\'s card counts, with the term and the page; closing it doesn\'t; following its link does', async ({ page, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only')
  const sent = tipEvents(page)
  await page.goto(GUIDE)
  const term = page.locator('main a.gl[data-tip]').first()
  const x = await term.getAttribute('href')
  const tip = page.locator('.gl-tip')
  await term.tap()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ t: 'tip', v: 1, p: GUIDE, x })
  expect(Object.keys(sent[0]!).sort()).toEqual(['p', 'sid', 't', 'v', 'x'])
  await term.tap()
  await expect(tip).toBeHidden()
  expect(sent).toHaveLength(1)
  await term.tap()
  await expect.poll(() => sent.length).toBe(2)
  await tip.locator('a').tap()
  await expect.poll(() => sent.at(-1)?.t).toBe('tipmore')
  expect(sent.at(-1)).toMatchObject({ p: GUIDE, x })
  expect(errors).toEqual([])
})

test('nothing is counted for a hover on a computer, a data card\'s label, or after «Không đếm tôi»', async ({ page }, info) => {
  const sent = tipEvents(page)
  const tip = page.locator('.gl-tip')
  if (info.project.name !== 'phone') {
    await page.goto(GUIDE)
    await page.locator('main a.gl[data-tip]').first().hover()
    await expect(tip).toBeVisible()
    await page.waitForTimeout(300)
    expect(sent).toEqual([])
    return
  }
  await page.goto('/ca/ca-neon-vua/') // a label's card leads to the explainer page, not to a term
  await openCard(page)
  await page.locator('.facts .card [data-field="difficulty"] dt a').tap()
  await expect(tip).toBeVisible()
  await page.waitForTimeout(300)
  expect(sent).toEqual([])
  await page.addInitScript(() => localStorage.setItem('aq_nocount', '1'))
  await page.goto(GUIDE)
  await page.locator('main a.gl[data-tip]').first().tap()
  await expect(tip).toBeVisible()
  await page.waitForTimeout(300)
  expect(sent).toEqual([])
})

test('a source\'s mark uses the same card and isn\'t counted', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone' || !!process.env.E2E_BASE_URL, 'touch only, on the fixture product')
  const sent = tipEvents(page)
  await page.goto('/san-pham/chihiros-wrgb-ii-slim/')
  await page.locator('.reviews li a.cite').first().tap()
  await expect(page.locator('.gl-tip')).toBeVisible()
  await page.waitForTimeout(300)
  expect(sent).toEqual([])
})

// The list (the Design Lead's board, 14 Nov 2026): a search over the terms, an A to Z of its letters with their counts,
// each letter's heading. Names and counts are read from the page, so it holds on the fixture and the live site alike.
test('the list\'s search keeps only the terms that match, and says when none do; a letter takes the reader to its terms', async ({ page, errors }) => {
  await page.goto('/thuat-ngu/')
  const rows = page.locator('[data-find]')
  const all = await rows.count()
  expect(all).toBeGreaterThan(1)
  // Each letter's count is its terms'.
  for (const a of await page.locator('nav.az a').all()) {
    const id = (await a.getAttribute('href'))!.slice(1)
    await expect(page.locator(`section.letter:has(h2[id="${id}"]) [data-find]`)).toHaveCount(Number(await a.locator('small').textContent()))
  }
  const name = (await rows.first().locator('dt a').textContent())!.trim()
  const find = page.locator('#tm-find')
  // The board's magnifier sits inside the field, before its words.
  const field = (await find.boundingBox())!
  const glass = (await page.locator('.find:has(#tm-find) > svg').boundingBox())!
  const pad = parseFloat(await find.evaluate(e => getComputedStyle(e).paddingLeft))
  expect(glass.x).toBeGreaterThan(field.x)
  expect(glass.x + glass.width).toBeLessThanOrEqual(field.x + pad)
  expect(glass.y).toBeGreaterThan(field.y)
  expect(glass.y + glass.height).toBeLessThan(field.y + field.height)
  await find.fill(name)
  await expect(rows.first()).toBeVisible()
  expect(await page.locator('[data-find]:visible').count()).toBeLessThan(all)
  await expect(page.locator('.none')).toBeHidden()
  await find.fill('zzqqxx')
  await expect(page.locator('[data-find]:visible')).toHaveCount(0)
  await expect(page.locator('section.letter:visible')).toHaveCount(0)
  await expect(page.locator('.none')).toBeVisible()
  await find.fill('')
  await expect(page.locator('[data-find]:visible')).toHaveCount(all)
  const letter = page.locator('nav.az a').last()
  const target = (await letter.getAttribute('href'))!
  await letter.click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
  await expect(page.locator(`h2[id="${target.slice(1)}"]`)).toBeInViewport()
  expect(errors).toEqual([])
})
