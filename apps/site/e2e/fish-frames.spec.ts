import { expect, shownWhole, test } from './fixtures'

// Where a fish's 4:3 tile would cut the fish (its box: image-geometry.ts subjectFrame), the tile shows the photo whole on
// the same photo blurred, and keeps the tile's shape, so the grid stays even (SpeciesCard.astro; the Design Lead's frames
// board, 12 Nov). The fixture has no boxes, so this holds on a build with the engine's record and on aquatome.com; the
// cards the list's script builds come out the same (list-cards.spec.ts).
test('a fish tile that would cut the fish shows it whole, on itself blurred, in the tile\'s shape', async ({ page, errors }) => {
  await page.goto('/ca/')
  const whole = page.locator('main .sc .whole')
  test.skip((await whole.count()) === 0, 'no tile here would cut its fish (the fixture has no boxes)')
  for (const w of await whole.all()) {
    const [ground, img] = await w.locator('img').all()
    await expect(ground!).toHaveAttribute('aria-hidden', 'true')
    expect(await ground!.getAttribute('src')).toBe(await img!.getAttribute('src'))
    expect(await ground!.evaluate(e => getComputedStyle(e).filter)).toContain('blur')
    expect(await shownWhole(img!), 'the fish is cut').toBe(true)
  }
  for (const t of await page.locator('main .sc .plate > img, main .sc .plate > .whole').all()) {
    const b = (await t.boundingBox())!
    expect(Math.abs(b.width / b.height - 4 / 3), 'a tile out of the grid\'s shape').toBeLessThan(0.02)
  }
  expect(errors).toEqual([])
})
