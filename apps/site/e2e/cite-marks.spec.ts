import type { APIRequestContext, Page } from '@playwright/test'
import { expect, sideways, test } from './fixtures'

// The driftwood pages, 15 Nov 2026: every deploy from 05:53 failed on a phone, 418 px on a 412 px screen. A source mark a
// few words after another in the same paragraph took the rule for two marks side by side (`.cite + .cite`, which skips
// the words between them), so its 44 px tap area reached right from its left edge instead of round it, past the screen's
// edge at a line's end. Only a group's marks are side by side (lib/cite.ts citeGroup). The deploy checks a sample of each
// kind of page, so this puts the worst case into one page of every kind that carries marks (the chief of staff, 15 Nov).

/** A page of the kind, from its sitemap (a material page from its hub: they stay out of the sitemap). */
async function pageOf(request: APIRequestContext, kind: string): Promise<string | undefined> {
  if (kind === 'materials') return /href="(\/vat-lieu\/[^/"]+\/)"/.exec(await (await request.get('/vat-lieu/')).text())?.[1]
  const loc = /<loc>([^<]+)<\/loc>/.exec(await (await request.get(`/sitemap-${kind}.xml`)).text())?.[1]
  return loc && new URL(loc).pathname
}

/** A paragraph in the page's text column, beside its first mark (or its first paragraph): a word, a mark, a few words, and a mark that ends the line. */
const worstCase = (page: Page) => page.evaluate(() => {
  const near = document.querySelector('main a.cite')?.closest('p, li') ?? document.querySelector('main p')!
  const p = document.createElement('p')
  p.innerHTML = 'Lũa <a class="cite" href="#">1</a> ngâm kỹ<span class="pad" style="display:inline-block"></span><a class="cite" href="#">2</a>'
  near.after(p)
  const pad = p.querySelector<HTMLElement>('.pad')!, [first, last] = [...p.querySelectorAll('.cite')]
  pad.style.width = `${Math.floor(p.getBoundingClientRect().right - last!.getBoundingClientRect().right) - 1}px`
  const box = last!.getBoundingClientRect()
  return { gap: p.getBoundingClientRect().right - box.right, sameLine: Math.abs(first!.getBoundingClientRect().top - box.top) < 2 }
})

for (const kind of ['fish', 'plants', 'guides', 'videos', 'products', 'glossary', 'materials']) {
  test(`a source mark at a line's end, a few words after another, keeps its tap area inside a phone screen (${kind})`, async ({ page, request }, info) => {
    test.skip(info.project.name !== 'phone', 'the phone layout')
    const path = await pageOf(request, kind)
    test.skip(!path, `no ${kind} page`)
    await page.goto(path!)
    expect(await sideways(page), 'the page as it is').toBeNull()
    const at = await worstCase(page)
    expect(at.sameLine, 'both marks on one line').toBe(true)
    expect(at.gap, 'the second mark ends the line').toBeLessThan(3)
    expect(await sideways(page), 'with the worst case').toBeNull()
  })
}

// Marks in one group still reach away from each other: the first's area ends at its right edge, the last's starts at its left.
test('marks side by side in one group take each other\'s side for their tap areas', async ({ page }) => {
  await page.goto('/huong-dan/')
  const group = await page.evaluate(() => {
    const p = document.createElement('p')
    p.innerHTML = 'Lũa<span class="marks"><a class="cite" href="#">1</a> <a class="cite" href="#">2</a></span>'
    document.querySelector('main')!.append(p)
    const [a, b] = [...p.querySelectorAll('.cite')]
    return { first: getComputedStyle(a!, '::before').right, last: getComputedStyle(b!, '::before').left }
  })
  expect(group).toEqual({ first: '0px', last: '0px' })
})
