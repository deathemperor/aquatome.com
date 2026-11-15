import { expect, sideways, test } from './fixtures'

// The driftwood pages, 15 Nov 2026: every deploy from 05:53 failed on a phone, 418 px on a 412 px screen. A source mark a
// few words after another in the same paragraph took the rule for two marks side by side (`.cite + .cite`, which skips
// the words between them), so its 44 px tap area reached right from its left edge instead of round it, past the screen's
// edge at a line's end. Only a group's marks are side by side (lib/cite.ts citeGroup); this one keeps its area round it.
test('a source mark at a line\'s end, a few words after another, keeps its tap area inside a phone screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  await page.goto('/huong-dan/')
  const href = await page.locator('main a.gc').first().getAttribute('href')
  await page.goto(href!)
  expect(await sideways(page)).toBeNull()
  const at = await page.evaluate(() => {
    const prose = document.querySelector('.prose')!
    const p = document.createElement('p')
    p.innerHTML = 'Lũa <a class="cite" href="#">1</a> ngâm kỹ<span class="pad" style="display:inline-block"></span><a class="cite" href="#">2</a>'
    prose.append(p)
    // The second mark at the very end of the line: the pad takes the rest of the line.
    const pad = p.querySelector<HTMLElement>('.pad')!, [first, last] = [...p.querySelectorAll('.cite')]
    pad.style.width = `${Math.floor(p.getBoundingClientRect().right - last!.getBoundingClientRect().right) - 1}px`
    const box = last!.getBoundingClientRect()
    return { gap: p.getBoundingClientRect().right - box.right, sameLine: Math.abs(first!.getBoundingClientRect().top - box.top) < 2 }
  })
  expect(at.sameLine).toBe(true)
  expect(at.gap).toBeLessThan(3)
  expect(await sideways(page)).toBeNull()
  // Marks in one group still reach away from each other: the last one's area starts at its own left edge.
  const group = await page.evaluate(() => {
    const p = document.createElement('p')
    p.innerHTML = 'Lũa<span class="marks"><a class="cite" href="#">1</a> <a class="cite" href="#">2</a></span>'
    document.querySelector('.prose')!.append(p)
    const [a, b] = [...p.querySelectorAll('.cite')]
    const left = (x: Element) => x.getBoundingClientRect().left + parseFloat(getComputedStyle(x, '::before').left)
    return { first: getComputedStyle(a!, '::before').right, last: left(b!) - b!.getBoundingClientRect().left }
  })
  expect(group.first).toBe('0px')
  expect(group.last).toBe(0)
})
