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

/**
 * Paragraphs in the page's text column, beside its first mark (or its first paragraph), each set to the right so its last
 * mark ends the line: a word, a mark, a few words and a mark, so only words stand between the marks, as on the driftwood
 * pages (an element between them would keep `.cite + .cite` from matching at all); and a line ending in a group of two
 * and of three, a researched block's "2 3", whose last mark reached 30 px past it, 418 px on a 412 px phone (Fable's read,
 * 15 Nov 2026). For each: its marks on one line, the last one's gap to the line's end, and the marks a tap at each one's
 * centre lands on.
 */
const worstCase = (page: Page) => page.evaluate(() => {
  const near = document.querySelector('main a.cite')?.closest('p, li') ?? document.querySelector('main p')!
  const mark = (n: number) => `<a class="cite" href="#">${n}</a>`
  const lines = [`Lũa ${mark(1)} ngâm kỹ ${mark(2)}`, `Lũa ngâm kỹ<span class="marks">${mark(2)} ${mark(3)}</span>`, `Lũa ngâm kỹ<span class="marks">${mark(1)} ${mark(2)} ${mark(3)}</span>`]
  const ps = lines.map(html => {
    const p = document.createElement('p')
    p.innerHTML = html
    p.style.textAlign = 'right'
    return p
  })
  near.after(...ps)
  return ps.map(p => {
    p.scrollIntoView({ block: 'center' })
    const marks = [...p.querySelectorAll<HTMLElement>('.cite')]
    const boxes = marks.map(m => m.getBoundingClientRect())
    const hit = boxes.map(b => marks.indexOf(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest<HTMLElement>('.cite') as HTMLElement))
    return { gap: p.getBoundingClientRect().right - boxes.at(-1)!.right, sameLine: boxes.every(b => Math.abs(b.top - boxes[0]!.top) < 2), hit }
  })
})

for (const kind of ['fish', 'plants', 'guides', 'videos', 'products', 'glossary', 'materials']) {
  test(`a source mark at a line's end, a few words after another or last in a group, keeps its tap area inside a phone screen (${kind})`, async ({ page, request }, info) => {
    test.skip(info.project.name !== 'phone', 'the phone layout')
    const path = await pageOf(request, kind)
    test.skip(!path, `no ${kind} page`)
    await page.goto(path!)
    expect(await sideways(page), 'the page as it is').toBeNull()
    for (const [i, at] of (await worstCase(page)).entries()) {
      expect(at.sameLine, `line ${i + 1}: its marks on one line`).toBe(true)
      expect(at.gap, `line ${i + 1}: its last mark ends the line`).toBeLessThan(3)
      expect(at.hit, `line ${i + 1}: a tap on each mark opens that mark`).toEqual(at.hit.map((_, j) => j))
    }
    expect(await sideways(page), 'with the worst case').toBeNull()
  })
}

// Marks in one group reach away from each other: a tap a little left of the first opens the first, a little right of the
// last opens the last, and a tap on each mark opens that mark, in a group of two and of three.
test('marks side by side in one group take each other\'s side for their tap areas', async ({ page }) => {
  await page.goto('/huong-dan/')
  const groups = await page.evaluate(() => [2, 3].map(n => {
    const p = document.createElement('p')
    p.innerHTML = `Lũa<span class="marks">${Array.from({ length: n }, (_, i) => `<a class="cite" href="#">${i + 1}</a>`).join(' ')}</span> ngâm kỹ.`
    document.querySelector('main')!.append(p)
    p.scrollIntoView({ block: 'center' })
    const marks = [...p.querySelectorAll<HTMLElement>('.cite')]
    const at = (x: number, y: number) => marks.indexOf(document.elementFromPoint(x, y)?.closest<HTMLElement>('.cite') as HTMLElement)
    const boxes = marks.map(m => m.getBoundingClientRect())
    const mid = (b: DOMRect) => b.y + b.height / 2
    return { centres: boxes.map(b => at(b.x + b.width / 2, mid(b))), left: at(boxes[0]!.left - 8, mid(boxes[0]!)), right: at(boxes.at(-1)!.right + 8, mid(boxes.at(-1)!)) }
  }))
  expect(groups).toEqual([{ centres: [0, 1], left: 0, right: 1 }, { centres: [0, 1, 2], left: 0, right: 2 }])
})
