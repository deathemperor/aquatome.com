import { expect, shownWhole, test } from './fixtures'
import { LIVE } from './pages'

// A head that no crop can frame without cutting the fish carries `headFit: "contain"` and shows whole, in its own shape,
// on a phone and a computer (PhotoGallery.astro). Any other head keeps the frame's crop. On the fixture, the neon
// tetra's head carries the mark; on the live site, every sampled page's marked head is checked (invariants.spec.ts).

test('a head marked to show whole is uncut, in its own shape, with its credit', async ({ page, errors }) => {
  test.skip(LIVE, "the fixture's neon tetra carries the mark")
  // The fixture's fish pages are Vietnamese only; every language draws the head with the same component.
  await page.goto('/ca/ca-neon-xanh/')
  const head = page.locator('main .gallery .plate img')
  await expect(head).toHaveAttribute('data-fit', 'contain')
  expect(await shownWhole(head), 'the head is cut').toBe(true)
  // Its own shape, not the frame's: 960 × 636.
  const box = (await head.boundingBox())!
  expect(Math.abs(box.width / box.height - 960 / 636)).toBeLessThan(0.02)
  // Its credit as any head's: the © with the licence, linked to the photo's source.
  const credit = page.locator('main .gallery figcaption a.cite.pic')
  await expect(credit).toHaveAttribute('data-tip', 'CC BY 3.0')
  await expect(credit).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Neonsalmler_Paracheirodon_innesi.jpg')
  expect(errors).toEqual([])
})

test("a head with no mark keeps the frame's crop", async ({ page }, info) => {
  test.skip(LIVE, 'reads a fixture page')
  await page.goto('/ca/ca-neon-vua/')
  const head = page.locator('main .gallery .plate img')
  await expect(head).not.toHaveAttribute('data-fit')
  expect(await head.evaluate(i => getComputedStyle(i).objectFit)).toBe('cover')
  const box = (await head.boundingBox())!
  // A phone's fish page frames it 16:9, a computer's 4:3 (pages/ca/[slug].astro, PhotoGallery.astro).
  expect(box.width / box.height).toBeCloseTo(info.project.name === 'phone' ? 16 / 9 : 4 / 3, 1)
})
