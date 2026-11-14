import { expect, sideways, test } from './fixtures'

// A material page is never wider than a phone, whatever its text holds (pages/vat-lieu/[slug].astro). On 15 Nov both
// driftwood pages were 418 px on a 412 px screen and no deploy went out: a source mark at a line's end had an earlier mark
// in its paragraph, which global.css takes for two marks side by side (`.cite + .cite` skips the words between), so its
// 44 px target reached right from the mark instead of round it, past the screen. Here a material page gets the worst case,
// whatever its own text: such a mark flush with the right edge, and a word too long for any line.
test('a material page stays inside a phone screen, whatever its text holds', async ({ page, request, errors }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout')
  const path = /href="(\/vat-lieu\/[^/"]+\/)"/.exec(await (await request.get('/vat-lieu/')).text())?.[1]
  test.skip(!path, 'no material page')
  await page.goto(path!)
  expect(await sideways(page), 'the page as written').toBeNull()

  await page.evaluate(() => {
    const mark = (n: number) => Object.assign(document.createElement('a'), { className: 'cite', href: '#', textContent: String(n) })
    const edge = document.createElement('p')
    edge.style.textAlign = 'right'
    edge.append('Một', mark(1), ' hai', mark(2))
    document.querySelector('.material .prose')!.append(edge)
  })
  expect(await sideways(page), 'a mark at the edge after another mark').toBeNull()

  const long = await page.evaluate(() => {
    const word = Object.assign(document.createElement('p'), { textContent: 'a'.repeat(120) })
    document.querySelector('.material .prose')!.append(word)
    return { scroll: word.scrollWidth, width: word.clientWidth }
  })
  expect(await sideways(page), 'a word too long for a line').toBeNull()
  expect(long.scroll, 'a long word breaks instead of being cut off').toBeLessThanOrEqual(long.width)
  expect(errors).toEqual([])
})
